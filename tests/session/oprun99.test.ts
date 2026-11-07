/**
 * 99차: 같은 블록을 지우거나 넣는 변경이 이어지면 applyOps가 묶어서 한 번에 한다(edit/session.ts removeRun·addRun).
 * 전에는 지우기·넣기마다 splice해 객체 42만 개 도면의 EXPLODE(지우기 14만 개) 확정이 약 26초였다.
 * 묶은 결과가 변경을 하나씩 적용한 것(applyOps에 변경 하나씩 — 묶을 것이 없다)과 블록 차례·객체·핸들 색인·변경 요약까지 같은지
 * 여러 무작위 변경 묶음(맞는 자리·틀린 자리·-1·자리 없음·차례가 어긋난 자리·다른 블록·바꾸기 섞임)과 실패하는 변경으로 견준다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AttribEntity, CadDocument, Entity, InsertEntity, LineEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { type ChangeSummary, type EditOp, EditSession, applyOps, applyOpsAtomic, emptySummary, inverseTransaction } from '../../src/edit/session';

const BLK = 'B1';

/** 같은 씨앗이면 같은 수열 */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 핸들 → 객체(문서마다 따로 만든다). INSERT는 속성이 둘이다 */
function make(h: string): Entity {
  if (h.startsWith('I')) {
    const attrib = (k: number): AttribEntity => ({ ...entityDefaults(), type: 'ATTRIB', handle: `${h}A${k}` }) as unknown as AttribEntity;
    return { ...entityDefaults(), type: 'INSERT', handle: h, block: BLK, insert: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, rotation: 0, columnCount: 1, rowCount: 1, columnSpacing: 0, rowSpacing: 0, attribs: [attrib(0), attrib(1)] } as InsertEntity;
  }
  return { ...entityDefaults(), type: 'LINE', handle: h, start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 0, z: 0 } } as LineEntity;
}

interface World {
  doc: CadDocument;
  objs: Map<string, Entity>;
  /** 객체 → 만든 차례(두 문서의 객체를 견줄 때) */
  id: Map<object, number>;
}

function world(handles: string[], inBlock: string[], later: string[]): World {
  const doc = createNewDocument('metric');
  doc.blocks.set(BLK, { name: BLK, handle: 'BH', recordHandle: 'BR', basePoint: { x: 0, y: 0, z: 0 }, flags: 0, entities: [] });
  const objs = new Map<string, Entity>();
  const id = new Map<object, number>();
  for (const h of [...handles, ...inBlock, ...later]) {
    const e = make(h);
    objs.set(h, e);
    id.set(e, id.size);
    if (e.type === 'INSERT') for (const a of e.attribs) id.set(a, id.size);
    // 같은 핸들의 다른 객체(지우는 변경이 블록 안 객체와 다른 객체를 들고 올 때 — 워커는 핸들만 든 객체로 지운다)
    const twin = make(h);
    objs.set(`~${h}`, twin);
    id.set(twin, id.size);
  }
  const put = (key: string, hs: string[]) => {
    for (const h of hs) {
      const e = objs.get(h)!;
      doc.blocks.get(key)!.entities.push(e);
      doc.entityIndex.set(h, e);
      if (e.type === 'INSERT') for (const a of e.attribs) doc.entityIndex.set(a.handle, a);
    }
  };
  put(MODEL_SPACE, handles);
  put(BLK, inBlock);
  return { doc, objs, id };
}

type OpSpec = { kind: 'add' | 'remove'; block: string; h: string; index?: number } | { kind: 'modify'; block: string; h: string; to: string };

/** 무작위 변경 묶음: 대부분은 확정·명령 취소처럼 자리가 맞고 차례대로, 가끔 틀린 자리·-1·자리 없음·어긋난 차례·다른 블록·바꾸기 */
function specs(seed: number, start: string[], startB: string[], fresh: string[]): OpSpec[] {
  const r = rng(seed);
  const cur = new Map<string, string[]>([
    [MODEL_SPACE, [...start]],
    [BLK, [...startB]],
  ]);
  const out: OpSpec[] = [];
  let f = 0;
  for (let round = 0; round < 12; round++) {
    const block = r() < 0.75 ? MODEL_SPACE : BLK;
    const list = cur.get(block)!;
    const kind = r();
    if (kind < 0.45 && list.length) {
      // 지우기 묶음: 자리가 줄어드는 차례
      const n = 1 + Math.floor(r() * Math.min(40, list.length));
      const pick = new Set<number>();
      while (pick.size < n) pick.add(Math.floor(r() * list.length));
      for (const i of [...pick].sort((a, b) => b - a)) {
        const x = r();
        const index = x < 0.85 ? i : x < 0.9 ? -1 : x < 0.95 ? Math.floor(r() * (list.length + 2)) : i + 0.5;
        out.push({ kind: 'remove', block: r() < 0.03 ? (block === BLK ? MODEL_SPACE : BLK) : block, h: (r() < 0.1 ? '~' : '') + list[i]!, index });
        // 같은 지우기가 두 번(두 번째는 자리가 맞지 않는다)·바로 앞 자리를 한 번 더(밀린 다음 객체)
        const y = r();
        if (y < 0.03) out.push({ ...out[out.length - 1]! });
        else if (y < 0.06 && i + 1 < list.length && !pick.has(i + 1)) out.push({ kind: 'remove', block, h: list[i + 1]!, index: i });
      }
      for (const i of [...pick].sort((a, b) => b - a)) list.splice(i, 1);
    } else if (kind < 0.9 && f < fresh.length) {
      // 넣기 묶음: 자리가 늘어나는 차례(가끔 끝·틀린 자리)
      const n = 1 + Math.floor(r() * Math.min(40, fresh.length - f));
      let at = Math.floor(r() * (list.length + 1));
      for (let k = 0; k < n; k++) {
        const h = fresh[f++]!;
        const x = r();
        const index = x < 0.7 ? at : x < 0.8 ? undefined : x < 0.85 ? -1 : x < 0.9 ? list.length + 5 : x < 0.95 ? Math.max(0, at - 3) : NaN;
        out.push({ kind: 'add', block, h, index });
        const i = index === undefined || !(index >= 0) || index > list.length ? list.length : Math.floor(index);
        list.splice(i, 0, h);
        at = i + 1 + Math.floor(r() * 3);
      }
    } else if (list.length) {
      const i = Math.floor(r() * list.length);
      if (f < fresh.length) out.push({ kind: 'modify', block, h: list[i]!, to: fresh[f++]! });
    }
  }
  return out;
}

function ops(w: World, sp: OpSpec[]): EditOp[] {
  return sp.map((s): EditOp => {
    if (s.kind === 'modify') return { kind: 'modify', block: s.block, before: w.objs.get(s.h)!, after: w.objs.get(s.to)! };
    const entity = w.objs.get(s.h)!;
    return s.kind === 'add' ? { kind: 'add', block: s.block, entity, index: s.index } : { kind: 'remove', block: s.block, entity, index: s.index ?? -1 };
  });
}

/** 블록 차례(객체 정체)·핸들 색인(차례 포함)·변경 요약 */
function state(w: World, summary?: ChangeSummary): unknown {
  const ids = (xs: Iterable<object>) => [...xs].map((x) => w.id.get(x) ?? -1);
  return {
    blocks: [...w.doc.blocks].map(([k, b]) => [k, ids(b.entities)]),
    index: [...w.doc.entityIndex].map(([k, e]) => [k, w.id.get(e) ?? -1]),
    summary: summary && {
      spaces: [...summary.spaces].map(([k, s]) => [k, [...s.removed], ids(s.changed)]),
      blocksChanged: summary.blocksChanged,
      tablesChanged: summary.tablesChanged,
    },
  };
}

/** 98차까지의 applyOpsAtomic: 변경을 하나씩 적용하고, 실패하면 그 앞까지 하나씩 되돌린다 */
function atomicOneByOne(doc: CadDocument, list: EditOp[], summary: ChangeSummary): unknown {
  let i = 0;
  try {
    for (; i < list.length; i++) applyOps(doc, [list[i]!], summary);
  } catch (err) {
    for (const op of inverseTransaction({ label: '', ops: list.slice(0, i) }).ops) applyOps(doc, [op]);
    return String(err);
  }
  return null;
}

function scene(seed: number): { start: string[]; startB: string[]; fresh: string[] } {
  const r = rng(seed * 7 + 1);
  const n = 30 + Math.floor(r() * 300);
  const start = Array.from({ length: n }, (_, i) => (r() < 0.1 ? `I${i}` : `L${i}`));
  const startB = Array.from({ length: 20 }, (_, i) => `B${i}`);
  const fresh = Array.from({ length: 200 }, (_, i) => (r() < 0.1 ? `IN${i}` : `N${i}`));
  return { start, startB, fresh };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('지우기·넣기 묶음(99차)', () => {
  it('무작위 변경 묶음 200가지: 묶어 적용한 결과가 하나씩 적용한 것과 같다(블록 차례·객체·핸들 색인·변경 요약)', () => {
    let runs = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const { start, startB, fresh } = scene(seed);
      const sp = specs(seed, start, startB, fresh);
      const a = world(start, startB, fresh);
      const b = world(start, startB, fresh);
      const sa = emptySummary();
      const sb = emptySummary();
      const opsA = ops(a, sp);
      const ea = (() => {
        try {
          applyOpsAtomic(a.doc, opsA, sa);
          return null;
        } catch (err) {
          return String(err);
        }
      })();
      const eb = atomicOneByOne(b.doc, ops(b, sp), sb);
      expect(ea, `seed ${seed}`).toBe(eb);
      expect(state(a, sa), `seed ${seed}`).toEqual(state(b, sb));
      // 되돌리기(넣기 묶음)·다시 하기(지우기 묶음)도 같다
      if (!ea) {
        const inv = inverseTransaction({ label: '', ops: opsA }).ops;
        const invB = inverseTransaction({ label: '', ops: ops(b, sp) }).ops;
        const ua = emptySummary();
        const ub = emptySummary();
        applyOpsAtomic(a.doc, inv, ua);
        atomicOneByOne(b.doc, invB, ub);
        expect(state(a, ua), `undo seed ${seed}`).toEqual(state(b, ub));
      }
      for (let i = 1; i < sp.length; i++) if (sp[i]!.kind === sp[i - 1]!.kind && sp[i]!.kind !== 'modify') runs++;
    }
    // 묶을 만한 이어진 변경이 실제로 많았다
    expect(runs).toBeGreaterThan(2000);
  });

  it('워커처럼 변경 전체를 applyOps 한 번에 넘겨도 같다', () => {
    for (let seed = 201; seed <= 260; seed++) {
      const { start, startB, fresh } = scene(seed);
      const sp = specs(seed, start, startB, fresh);
      const a = world(start, startB, fresh);
      const b = world(start, startB, fresh);
      let ea: string | null = null;
      try {
        applyOps(a.doc, ops(a, sp));
      } catch (err) {
        ea = String(err);
      }
      let eb: string | null = null;
      try {
        for (const op of ops(b, sp)) applyOps(b.doc, [op]);
      } catch (err) {
        eb = String(err);
      }
      expect(ea, `seed ${seed}`).toBe(eb);
      expect(state(a), `seed ${seed}`).toEqual(state(b));
    }
  });

  it('지우기 묶음 가운데 하나가 색인 빼기에서 실패하면 하나씩 적용하다 실패한 것과 같은 문서로 남는다', () => {
    for (const bad of [0, 1, 5, 9]) {
      const start = Array.from({ length: 30 }, (_, i) => `L${i}`);
      start[20 - bad] = `I${20 - bad}`;
      const a = world(start, [], []);
      const b = world(start, [], []);
      const mk = (w: World): EditOp[] =>
        Array.from({ length: 10 }, (_, k) => {
          const i = 20 - k;
          const h = start[i]!;
          // 속성 없는 블록 참조(78차 워커 결함과 같은 꼴): 색인 빼기가 던진다
          const entity = k === bad ? ({ type: 'INSERT', handle: h } as unknown as Entity) : w.objs.get(h)!;
          if (k === bad) w.id.set(entity, -2);
          return { kind: 'remove', block: MODEL_SPACE, entity, index: i };
        });
      const sa = emptySummary();
      const sb = emptySummary();
      expect(() => applyOpsAtomic(a.doc, mk(a), sa)).toThrow();
      const eb = atomicOneByOne(b.doc, mk(b), sb);
      expect(eb).not.toBeNull();
      expect(state(a, sa)).toEqual(state(b, sb));
    }
  });

  it('넣기 묶음 가운데 하나가 색인 넣기에서 실패해도 하나씩 적용하다 실패한 것과 같다', () => {
    for (const bad of [0, 2, 7]) {
      const start = Array.from({ length: 30 }, (_, i) => `L${i}`);
      const fresh = Array.from({ length: 8 }, (_, i) => `N${i}`);
      const a = world(start, [], fresh);
      const b = world(start, [], fresh);
      const mk = (w: World): EditOp[] =>
        fresh.map((h, k) => {
          const entity = k === bad ? ({ type: 'INSERT', handle: h } as unknown as Entity) : w.objs.get(h)!;
          if (k === bad) w.id.set(entity, -2);
          return { kind: 'add', block: MODEL_SPACE, entity, index: 3 + k * 3 };
        });
      const sa = emptySummary();
      const sb = emptySummary();
      expect(() => applyOpsAtomic(a.doc, mk(a), sa)).toThrow();
      atomicOneByOne(b.doc, mk(b), sb);
      expect(state(a, sa)).toEqual(state(b, sb));
    }
  });

  it('객체 많은 블록에서 뒤에서부터 지우는 확정·그 명령 취소는 객체마다 splice하지 않는다', () => {
    const doc = createNewDocument('metric');
    const s = new EditSession(doc, () => {});
    const list = doc.blocks.get(MODEL_SPACE)!.entities;
    for (let i = 0; i < 20000; i++) {
      const e = make(`L${i}`);
      list.push(e);
      doc.entityIndex.set(e.handle, e);
    }
    const before = [...list];
    const gone: EditOp[] = [];
    for (let i = list.length - 1; i >= 0; i -= 2) gone.push({ kind: 'remove', block: MODEL_SPACE, entity: list[i]!, index: i });
    const sp = vi.spyOn(Array.prototype, 'splice');
    s.commit({ label: 'EXPLODE', ops: gone });
    expect(sp.mock.calls.length).toBe(0);
    expect(list.length).toBe(10000);
    expect(list.every((e, i) => e === before[2 * i])).toBe(true);
    expect(doc.entityIndex.has('L1')).toBe(false);
    expect(doc.entityIndex.has('L0')).toBe(true);
    s.undo();
    expect(sp.mock.calls.length).toBe(0);
    expect(list.length).toBe(20000);
    expect(list.every((e, i) => e === before[i])).toBe(true);
    expect(doc.entityIndex.get('L1')).toBe(before[1]);
    s.redo();
    expect(sp.mock.calls.length).toBe(0);
    expect(list.length).toBe(10000);
  });
});
