/**
 * 103차: 소유 블록 찾기(EditSession.ownerOf·ownerIndex)의 빠른 길.
 * 확정이 넣은 객체마다 소유 블록을 기억에 적지 않고 블록만 미뤄 두며, 빗나간 자리는 그 블록의 자리 표로 찾는다(전체 표를 다시 만들지 않는다).
 * - 핸들이 하나뿐인 객체의 답은 문서만으로 정해진다: 102차 방법(아래 OldOwners — 그대로 옮김)과 무작위 내력(넣기·빼기·바꾸기·블록 정의 바꾸기·
 *   큰 지우기+넣기·명령 취소·다시·단계 취소·세션 밖 변경)에서 답이 모두 같은지
 * - 표를 만들 때 핸들이 겹친 문서는 옛 길로 가서, 겹친 핸들을 찾아도 102차와 답(과 내부 기억)이 모두 같은지
 * - 세션 중에 핸들이 겹치게 된 문서: 겹치지 않은 핸들은 답이 같고, 겹친 핸들도 지금 그 핸들이 든 자리를 답하는지
 * - 큰 지우기+넣기 확정 뒤 모든 객체를 찾아도 전체 표를 다시 만들지 않고 블록을 거의 훑지 않는지, 확정이 기억에 넣은 객체마다 적지 않는지
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BlockDef, CadDocument, Entity, LineEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import type { EditOp } from '../../src/edit/session';
import { EditSession, applyOps, ownerBlockKey } from '../../src/edit/session';

const line = (handle: string, x = 0): LineEntity => ({ ...entityDefaults(), type: 'LINE', handle, start: { x, y: 0, z: 0 }, end: { x: x + 1, y: 0, z: 0 } });

/** 102차 EditSession의 소유 블록 기억 그대로(비교용) */
class OldOwners {
  ownerCache: Map<string, string> | null = null;
  ownerAt = new Map<string, number>();
  ownerMisses = 0;
  builds = 0;
  constructor(private readonly doc: CadDocument) {}

  ownerOf(handle: string): string | null {
    if (!this.ownerCache) this.buildOwners();
    const cached = this.ownerCache!.get(handle);
    const list = cached ? this.doc.blocks.get(cached)?.entities : undefined;
    if (cached && list) {
      if (list[this.ownerAt.get(handle) ?? -1]?.handle === handle) return cached;
      if (++this.ownerMisses > 16) {
        this.buildOwners();
        return this.ownerOf(handle);
      }
      const at = list.findIndex((e) => e.handle === handle);
      if (at >= 0) {
        this.ownerAt.set(handle, at);
        return cached;
      }
    }
    const k = ownerBlockKey(this.doc, handle);
    if (k) {
      this.ownerCache!.set(handle, k);
      this.ownerAt.set(handle, this.doc.blocks.get(k)!.entities.findIndex((e) => e.handle === handle));
    }
    return k;
  }

  ownerIndex(handle: string): number {
    return this.ownerOf(handle) ? (this.ownerAt.get(handle) ?? -1) : -1;
  }

  private buildOwners(): void {
    this.builds++;
    const owners = new Map<string, string>();
    this.ownerAt.clear();
    this.ownerMisses = 0;
    for (const [k, b] of this.doc.blocks) {
      b.entities.forEach((e, i) => {
        if (!e.handle) return;
        owners.set(e.handle, k);
        this.ownerAt.set(e.handle, i);
      });
    }
    this.ownerCache = owners;
  }

  /** EditSession.commit의 기억 고치기(applyOpsAtomic 뒤) */
  committed(ops: readonly EditOp[]): void {
    if (this.ownerCache)
      for (const op of ops) {
        if (op.kind === 'add') this.ownerCache.set(op.entity.handle, op.block);
        else if (op.kind === 'modify' && op.after.handle !== op.before.handle) this.ownerCache.set(op.after.handle, op.block);
      }
  }

  /** 명령 취소·다시·단계 취소 */
  reset(): void {
    this.ownerCache = null;
  }
}

/** 정해진 씨앗의 의사 난수(0 이상 1 미만) */
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

type Dup = 'none' | 'start' | 'later';
const blockDef = (name: string, entities: Entity[]): BlockDef => ({ name, handle: '', recordHandle: '', basePoint: { x: 0, y: 0, z: 0 }, flags: 0, entities });

/** 무작위 문서와 내력. dup: 처음부터 겹친 핸들이 있는지('start'), 내력이 겹치게 만드는지('later') */
function world(seed: number, dup: Dup) {
  const r = rng(seed);
  const doc = createNewDocument('metric');
  for (let b = 1; b <= 3; b++) doc.blocks.set(`B${b}`, blockDef(`B${b}`, []));
  const keys = [...doc.blocks.keys()];
  let seq = 0x1000;
  const fresh = () => (seq++).toString(16).toUpperCase();
  const all = (): Entity[] => [...doc.blocks.values()].flatMap((b) => b.entities);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  const used: string[] = [];
  const handleFor = (allowDup: boolean): string => {
    const xs = all();
    if (allowDup && xs.length && r() < 0.25) return pick(xs).handle;
    const h = fresh();
    used.push(h);
    return h;
  };
  // 처음 객체(공간 블록에 많이). 'start'는 겹친 핸들이 적어도 하나(같은 블록 안이나 블록 사이)
  for (let i = 0; i < 40 + Math.floor(r() * 80); i++) {
    const k = r() < 0.7 ? MODEL_SPACE : pick(keys);
    const e = line(i === 5 && dup === 'start' ? all()[0]!.handle : handleFor(dup === 'start' && i > 4), i);
    doc.blocks.get(k)!.entities.push(e);
    doc.entityIndex.set(e.handle, e);
  }
  const allowDup = dup !== 'none';
  /** 변경 하나 또는 큰 지우기+넣기 */
  const randomOps = (): EditOp[] => {
    const ops: EditOp[] = [];
    if (r() < 0.15) {
      const k = r() < 0.8 ? MODEL_SPACE : pick(keys);
      const list = doc.blocks.get(k)!.entities;
      const at: number[] = [];
      for (let i = list.length - 1; i >= 0; i--) if (r() < 0.3) at.push(i);
      for (const i of at) ops.push({ kind: 'remove', block: k, entity: list[i]!, index: i });
      const n = Math.floor(r() * 3 * (at.length + 1));
      for (let j = 0; j < n; j++) ops.push({ kind: 'add', block: k, entity: line(handleFor(allowDup && r() < 0.1), j) });
      return ops;
    }
    const gone = new Set<Entity>();
    for (let m = 1 + Math.floor(r() * 4); m > 0; m--) {
      const x = r();
      const k = pick(keys);
      const list = doc.blocks.get(k)!.entities.filter((e) => !gone.has(e));
      if (x < 0.35 || !list.length) {
        const index = r() < 0.5 ? undefined : Math.floor(r() * (doc.blocks.get(k)!.entities.length + 1));
        ops.push({ kind: 'add', block: k, entity: line(handleFor(allowDup), m), index });
      } else if (x < 0.6) {
        const e = pick(list);
        gone.add(e);
        const i = doc.blocks.get(k)!.entities.indexOf(e);
        ops.push({ kind: 'remove', block: k, entity: e, index: r() < 0.8 ? i : r() < 0.5 ? -1 : i + 1 });
      } else if (x < 0.85) {
        const e = pick(list);
        gone.add(e);
        const h = r() < 0.6 ? e.handle : handleFor(allowDup);
        ops.push({ kind: 'modify', block: k, before: e, after: line(h, 99) });
      } else if (k.startsWith('B')) {
        const before = doc.blocks.get(k)!;
        const ents = before.entities.filter(() => r() < 0.6).map((e) => (r() < 0.5 ? e : line(e.handle, 7)));
        for (let j = Math.floor(r() * 4); j > 0; j--) ents.splice(Math.floor(r() * (ents.length + 1)), 0, line(handleFor(allowDup), j));
        ops.push({ kind: 'blockDef', key: k, before, after: blockDef(before.name, ents) });
        return ops;
      }
    }
    return ops;
  };
  /** 찾을 핸들: 든 것·지운 것·안 쓴 것·겹친 것 */
  const probe = (): string => {
    const x = r();
    const xs = all();
    if (x < 0.6 && xs.length) return pick(xs).handle;
    if (x < 0.85 && used.length) return pick(used);
    if (x < 0.9) return 'FFFFF';
    const count = new Map<string, number>();
    for (const e of xs) count.set(e.handle, (count.get(e.handle) ?? 0) + 1);
    const d = [...count].filter(([, n]) => n > 1).map(([h]) => h);
    return d.length ? pick(d) : xs.length ? pick(xs).handle : 'FFFFF';
  };
  return { r, doc, randomOps, probe, all };
}

interface Tally {
  queries: number;
  dupQueries: number;
  dupDiffer: number;
  oldOverflow: number;
}

/** 내력을 돌리며 두 방법의 답을 견준다. same(h) — 이 핸들의 답이 같아야 하는지 */
function drive(seed: number, dup: Dup, steps: number, tally: Tally, s0?: (s: EditSession) => void): EditSession {
  const w = world(seed, dup);
  const { r, doc } = w;
  const s = new EditSession(doc, () => {});
  s0?.(s);
  const old = new OldOwners(doc);
  const count = (h: string) => w.all().filter((e) => e.handle === h).length;
  const located = (h: string, k: string | null, i: number) => (k === null ? i === -1 && count(h) === 0 : doc.blocks.get(k)?.entities[i]?.handle === h);
  const legacy = () => (s as unknown as { ownerLegacy: boolean }).ownerLegacy;
  for (let step = 0; step < steps; step++) {
    // 처음에는 찾기부터(표를 처음 문서로 만든다)
    const x = step === 0 ? 0 : r();
    if (x < 0.45) {
      // 가끔은 한 블록의 객체를 모두 찾는다(빗나감이 쌓여 자리 표를 만드는 길)
      const burst = r() < 0.08 ? [...doc.blocks.values()][Math.floor(r() * doc.blocks.size)]!.entities.map((e) => e.handle) : [w.probe()];
      for (const h of burst) {
        const n = count(h);
        const asIndex = r() < 0.5;
        // 같은 순서로 부른다(찾기가 기억을 고치므로)
        const a = asIndex ? [s.ownerIndex(h), s.ownerOf(h)] : [s.ownerOf(h), s.ownerIndex(h)];
        const b = asIndex ? [old.ownerIndex(h), old.ownerOf(h)] : [old.ownerOf(h), old.ownerIndex(h)];
        tally.queries++;
        const [ka, ia] = (asIndex ? [a[1], a[0]] : a) as [string | null, number];
        const [kb, ib] = (asIndex ? [b[1], b[0]] : b) as [string | null, number];
        if (n > 1) tally.dupQueries++;
        if (n > 1 && dup === 'later' && !legacy()) {
          // 세션 중에 겹친 핸들(빠른 길): 둘 다 지금 그 핸들이 든 자리를 답한다
          expect(located(h, ka, ia), `${seed}:${step} ${h}`).toBe(true);
          expect(located(h, kb, ib), `${seed}:${step} ${h}`).toBe(true);
          if (ka !== kb || ia !== ib) tally.dupDiffer++;
        } else {
          expect(a, `${seed}:${step} ${h} (${n})`).toEqual(b);
          expect(located(h, ka, ia), `${seed}:${step} ${h}`).toBe(true);
        }
      }
    } else if (x < 0.8) {
      const ops = w.randomOps();
      if (!ops.length) continue;
      const group = r() < 0.5 ? 5 : 6;
      s.commit({ label: 'T', ops, group });
      old.committed(ops);
    } else if (x < 0.87) {
      if (s.undo()) old.reset();
    } else if (x < 0.92) {
      if (s.redo()) old.reset();
    } else if (x < 0.96) {
      if (s.undoLastStep(r() < 0.5 ? 5 : 6, 1 + Math.floor(r() * 3))) old.reset();
    } else if (r() < 0.5) {
      // 세션 밖 변경(명령 취소 기록에 남지 않는다): 두 방법 모두 모른다
      applyOps(doc, w.randomOps().filter((op) => op.kind !== 'blockDef'));
    } else {
      // 세션 밖에서 블록 길이는 그대로 자리만 바꾼다(앞 객체를 빼서 뒤에 넣기)
      const k = r() < 0.7 ? MODEL_SPACE : [...doc.blocks.keys()][Math.floor(r() * doc.blocks.size)]!;
      const list = doc.blocks.get(k)!.entities;
      if (list.length > 1) {
        const i = Math.floor(r() * list.length);
        const e = list[i]!;
        applyOps(doc, [
          { kind: 'remove', block: k, entity: e, index: i },
          { kind: 'add', block: k, entity: e },
        ]);
      }
    }
    tally.oldOverflow = Math.max(tally.oldOverflow, old.builds);
  }
  return s;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('소유 블록 빠른 길(103차)', () => {
  it('핸들이 하나씩인 문서: 무작위 내력에서 102차 방법과 답이 모두 같다(옛 방법이 16번 빗나가 표를 다시 만드는 경우 포함)', () => {
    const t: Tally = { queries: 0, dupQueries: 0, dupDiffer: 0, oldOverflow: 0 };
    let rebuilt = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const tt: Tally = { queries: 0, dupQueries: 0, dupDiffer: 0, oldOverflow: 0 };
      drive(seed, 'none', 250, tt);
      t.queries += tt.queries;
      if (tt.oldOverflow > 1) rebuilt++;
    }
    expect(t.queries).toBeGreaterThan(5000);
    // 옛 방법이 처음 표 말고 다시 만든 내력이 여럿이어야 그 길까지 견준 것이다
    expect(rebuilt).toBeGreaterThan(10);
  });

  it('처음부터 핸들이 겹친 문서는 옛 길로 가서 겹친 핸들의 답까지 102차와 모두 같다', () => {
    const t: Tally = { queries: 0, dupQueries: 0, dupDiffer: 0, oldOverflow: 0 };
    let legacy = 0;
    for (let seed = 101; seed <= 160; seed++) {
      const s = drive(seed, 'start', 250, t);
      if ((s as unknown as { ownerLegacy: boolean }).ownerLegacy) legacy++;
    }
    expect(legacy).toBe(60);
    expect(t.dupQueries).toBeGreaterThan(1000);
  });

  it('세션 중에 핸들이 겹치게 된 문서: 겹치지 않은 핸들은 답이 같고, 겹친 핸들도 지금 그 핸들이 든 자리를 답한다', () => {
    const t: Tally = { queries: 0, dupQueries: 0, dupDiffer: 0, oldOverflow: 0 };
    for (let seed = 201; seed <= 260; seed++) drive(seed, 'later', 250, t);
    expect(t.dupQueries).toBeGreaterThan(300);
  });

  it('큰 지우기+넣기 확정 뒤 모든 객체를 찾아도 전체 표를 다시 만들지 않고, 확정은 넣은 객체마다 기억에 적지 않는다', () => {
    const doc = createNewDocument('metric');
    const list = doc.blocks.get(MODEL_SPACE)!.entities;
    for (let i = 0; i < 20000; i++) {
      const e = line(`A${i.toString(16).toUpperCase()}`, i);
      list.push(e);
      doc.entityIndex.set(e.handle, e);
    }
    const s = new EditSession(doc, () => {});
    expect(s.ownerIndex(list[5]!.handle)).toBe(5);
    const memo = s as unknown as { ownerCache: Map<string, string>; buildOwners(): void };
    const size0 = memo.ownerCache.size;
    // EXPLODE처럼: 셋에 하나를 뒤에서부터 지우고, 새 객체 4만 개를 끝에 넣는다
    const ops: EditOp[] = [];
    for (let i = list.length - 1; i >= 0; i -= 3) ops.push({ kind: 'remove', block: MODEL_SPACE, entity: list[i]!, index: i });
    for (let j = 0; j < 40000; j++) ops.push({ kind: 'add', block: MODEL_SPACE, entity: line(`B${j.toString(16).toUpperCase()}`, j) });
    s.commit({ label: 'EXPLODE', ops });
    expect(memo.ownerCache.size).toBe(size0);
    const rebuild = vi.spyOn(memo, 'buildOwners');
    const some = vi.spyOn(Array.prototype, 'some');
    const find = vi.spyOn(Array.prototype, 'findIndex');
    const after = doc.blocks.get(MODEL_SPACE)!.entities;
    // 찾는 동안에는 견주지 않는다(expect가 배열 함수를 부를 수 있다)
    const owners: (string | null)[] = [];
    const at: number[] = [];
    for (const e of after) {
      owners.push(s.ownerOf(e.handle));
      at.push(s.ownerIndex(e.handle));
    }
    const finds = find.mock.calls.length;
    // 지운 객체는 블록이 없다(하나만 — 없는 핸들은 모든 블록을 훑는다)
    const gone = s.ownerOf((ops[0] as { entity: Entity }).entity.handle);
    const somes = some.mock.calls.length;
    const rebuilt = rebuild.mock.calls.length;
    vi.restoreAllMocks();
    expect(after.length).toBe(20000 - 6667 + 40000);
    expect(new Set(owners)).toEqual(new Set([MODEL_SPACE]));
    expect(at).toEqual(after.map((_, i) => i));
    expect(gone).toBeNull();
    expect(rebuilt).toBe(0);
    expect(finds).toBe(0);
    expect(somes).toBeLessThanOrEqual(doc.blocks.size);
    // 밀린 옛 객체는 지운 자리로 옮겨, 끝에 넣은 객체는 핸들 차례로 찾아 블록 자리 표도 만들지 않았다
    const slots = (s as unknown as { ownerSlots: Map<string, { at: Map<string, number> | null }> }).ownerSlots;
    expect(slots.get(MODEL_SPACE)?.at ?? null).toBeNull();
  });

  it('자리 옮김이 쌓여도(지우기 → 지우기+넣기 → 지우기) 기억한 자리를 옮겨 찾는다', () => {
    const doc = createNewDocument('metric');
    const list = doc.blocks.get(MODEL_SPACE)!.entities;
    for (let i = 0; i < 3000; i++) {
      const e = line(`A${i.toString(16).toUpperCase()}`, i);
      list.push(e);
      doc.entityIndex.set(e.handle, e);
    }
    const s = new EditSession(doc, () => {});
    s.ownerOf(list[0]!.handle);
    const drop = (step: number, from: number) => {
      const cur = doc.blocks.get(MODEL_SPACE)!.entities;
      const ops: EditOp[] = [];
      for (let i = cur.length - 1 - from; i >= 0; i -= step) ops.push({ kind: 'remove', block: MODEL_SPACE, entity: cur[i]!, index: i });
      return ops;
    };
    s.commit({ label: 'E1', ops: drop(7, 0) });
    s.commit({ label: 'E2', ops: [...drop(5, 2), ...Array.from({ length: 500 }, (_, j): EditOp => ({ kind: 'add', block: MODEL_SPACE, entity: line(`C${j.toString(16).toUpperCase()}`, j) }))] });
    s.commit({ label: 'E3', ops: drop(11, 1) });
    const find = vi.spyOn(Array.prototype, 'findIndex');
    const after = doc.blocks.get(MODEL_SPACE)!.entities;
    const at = after.map((e) => s.ownerIndex(e.handle));
    const finds = find.mock.calls.length;
    vi.restoreAllMocks();
    expect(at).toEqual(after.map((_, i) => i));
    // 넣은 객체(C…)는 마지막 확정이 넣은 것이 아니라 자리 표로 찾는다(그 전에 몇 번 훑는다)
    expect(finds).toBeLessThanOrEqual(17);
  });

  it('몇 개만 찾는 작은 명령에는 자리 표를 만들지 않고 훑는다', () => {
    const doc = createNewDocument('metric');
    const list = doc.blocks.get(MODEL_SPACE)!.entities;
    for (let i = 0; i < 1000; i++) {
      const e = line(`A${i}`, i);
      list.push(e);
      doc.entityIndex.set(e.handle, e);
    }
    const s = new EditSession(doc, () => {});
    s.ownerOf(list[0]!.handle);
    s.commit({ label: 'E', ops: [{ kind: 'remove', block: MODEL_SPACE, entity: list[0]!, index: 0 }] });
    const set = vi.spyOn(Map.prototype, 'set');
    const at: number[] = [];
    for (let i = 0; i < 5; i++) at.push(s.ownerIndex(list[100 + i]!.handle));
    const sets = set.mock.calls.length;
    vi.restoreAllMocks();
    expect(at).toEqual([100, 101, 102, 103, 104]);
    // 찾은 핸들의 블록·자리(5 × 2)와 블록의 빗나감 기록 하나만 적는다(자리 표 1000개를 만들지 않는다)
    expect(sets).toBeLessThanOrEqual(11);
  });
});
