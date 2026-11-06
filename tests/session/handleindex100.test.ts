/**
 * 100차: 핸들 색인(HandleIndex)이 넣은 열쇠 가운데 (길이, 글자 차례)로 가장 큰 것을 기억해, 새 핸들이 그보다 크면 이미 쓰인 핸들인지 찾지 않는다.
 * - above(h)가 참이면 has(h)는 늘 거짓인지(무작위 넣기·지우기·비우기, 정규형이 아닌 열쇠 섞음)
 * - 세션 밖에서 색인에 넣어도(곧 낼 씨앗과 같은 핸들 등) 새 핸들이 98차 방법(일반 Map, 매번 has)과 같은 핸들·$HANDSEED를 내는지
 * - 받은 문서(DocAssembler·ownIndexes)의 색인이 같은 열쇠·값·차례의 HandleIndex인지, 새 핸들이 실제로 has를 부르지 않는지
 */
import { describe, expect, it } from 'vitest';
import { type CadDocument, createDocument, entityDefaults, normalizeHandle } from '../../src/core/model';
import { finalizeDocument } from '../../src/core/finalize';
import { HandleIndex } from '../../src/core/handleindex';
import { EditSession } from '../../src/edit/session';
import { DocAssembler, type DocPart, ownIndexes, sendDocument } from '../../src/worker/doctransfer';
import { readCadFile } from '../../src/io/index';
import { syntheticDxf } from '../perf/synthetic';

/** 98차 EditSession.newHandle 그대로(비교용 — 일반 Map에 매번 has) */
function oldAllocator(doc: CadDocument): () => string {
  let seedMemo: { seed: string; next: bigint } | null = null;
  return () => {
    const seed = doc.header.get('$HANDSEED');
    let next = 0n;
    if (seedMemo && seedMemo.seed === seed) next = seedMemo.next;
    else
      try {
        next = BigInt('0x' + (typeof seed === 'string' && seed ? seed : '0'));
      } catch {
        next = 0n;
      }
    const h0 = normalizeHandle(next);
    if (next === 0n || doc.entityIndex.has(h0) || doc.objects.has(h0)) {
      let max = 0n;
      const see = (h: string) => {
        if (!h) return;
        try {
          const v = BigInt('0x' + h);
          if (v > max) max = v;
        } catch {
          /* 무시 */
        }
      };
      for (const h of doc.entityIndex.keys()) see(h);
      for (const h of doc.objects.keys()) see(h);
      for (const b of doc.blocks.values()) for (const h of [b.handle, b.recordHandle, b.endHandle ?? '']) see(h);
      if (next <= max) next = max + 1n;
    }
    const h = normalizeHandle(next);
    const seed2 = normalizeHandle(next + 1n);
    doc.header.set('$HANDSEED', seed2);
    seedMemo = { seed: seed2, next: next + 1n };
    return h;
  };
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

const point = (h: string) => ({ ...entityDefaults(), type: 'POINT', handle: h }) as never;
const dict = (h: string) => ({ type: 'DICTIONARY', handle: h, owner: '0', entries: new Map() }) as never;

/** 정규형·정규형 아님(소문자·앞 0·16진 아님·빈 글자)이 섞인 열쇠 */
function anyKey(r: () => number, around: number): string {
  const v = Math.max(0, Math.floor(around + (r() - 0.5) * 64));
  const hex = v.toString(16).toUpperCase();
  switch (Math.floor(r() * 8)) {
    case 0:
      return hex.toLowerCase();
    case 1:
      return '0' + hex;
    case 2:
      return r() < 0.5 ? '' : 'XYZ' + hex;
    default:
      return hex;
  }
}

describe('HandleIndex(100차)', () => {
  it('above(h)가 참이면 h는 색인에 없다(넣기·지우기·비우기·of, 정규형이 아닌 열쇠 섞음)', () => {
    let aboveSeen = 0;
    for (let s = 1; s <= 40; s++) {
      const r = rng(s);
      let ix = new HandleIndex<number>();
      let base = Math.floor(r() * 0x10000);
      for (let step = 0; step < 300; step++) {
        const x = r();
        if (x < 0.55) ix.set(anyKey(r, base), step);
        else if (x < 0.8 && ix.size) ix.delete([...ix.keys()][Math.floor(r() * ix.size)]!);
        else if (x < 0.82) ix.clear();
        else if (x < 0.84) ix = HandleIndex.of(new Map(ix));
        else if (x < 0.9) base += Math.floor(r() * 4096);
        // 견줄 핸들: 들어 있는 열쇠·그 이웃·큰 수
        const probes = [...ix.keys()].filter(() => r() < 0.2);
        for (let i = 0; i < 8; i++) probes.push(normalizeHandle(BigInt(Math.max(0, base + Math.floor((r() - 0.3) * 128)))));
        for (const k of probes) {
          // 정규형이 아닌 글자 그대로도(어떤 글자든 위면 없다)
          if (ix.above(k)) expect(ix.has(k), `${s}:${step} ${k}`).toBe(false);
          const h = normalizeHandle(k || '0');
          if (!/^[0-9A-F]+$/.test(h)) continue;
          if (ix.above(h)) {
            aboveSeen++;
            expect(ix.has(h), `${s}:${step} ${h}`).toBe(false);
            // 위라면 정규형 열쇠가 모두 그보다 작다(수로 견줌)
            for (const key of ix.keys()) if (/^(0|[1-9A-F][0-9A-F]*)$/.test(key)) expect(BigInt('0x' + key) < BigInt('0x' + h)).toBe(true);
          }
        }
      }
    }
    expect(aboveSeen).toBeGreaterThan(100);
  });

  it('Map과 같게 동작하고, 구조화 복제·new Map은 일반 Map이 된다', () => {
    const ix = HandleIndex.of<number>([
      ['1A', 1],
      ['ff', 2],
      ['0B', 3],
    ]);
    expect(ix).toBeInstanceOf(Map);
    expect(ix.set('2', 4)).toBe(ix);
    expect([...ix]).toEqual([
      ['1A', 1],
      ['ff', 2],
      ['0B', 3],
      ['2', 4],
    ]);
    // (길이, 글자 차례)로 가장 큰 열쇠는 소문자 ff — 정규형이 아닌 열쇠는 위가 되는 일을 줄일 뿐 틀리게 하지 않는다
    expect(ix.above('1A')).toBe(false);
    expect(ix.above('1B')).toBe(false);
    expect(ix.above('FF')).toBe(false);
    expect(ix.above('100')).toBe(true);
    const up = HandleIndex.of<number>([
      ['1A', 1],
      ['0B', 3],
    ]);
    // 앞 0 열쇠는 같은 길이의 정규형 핸들보다 차례가 앞이다
    expect(up.above('1B')).toBe(true);
    up.delete('1A');
    // 지워도 기억은 줄지 않는다(그래도 맞다 — 덜 건너뛸 뿐)
    expect(up.above('1A')).toBe(false);
    up.clear();
    expect(up.above('1')).toBe(true);
    const c = structuredClone(HandleIndex.of([['A', 1]]));
    expect(c).not.toBeInstanceOf(HandleIndex);
    expect([...c]).toEqual([['A', 1]]);
    expect(new Map(ix)).not.toBeInstanceOf(HandleIndex);
  });
});

/** 같은 문서 둘(98차 방법 + 일반 Map, 지금 세션 + HandleIndex)에 같은 일을 하며 핸들과 씨앗을 모은다 */
function pair(seed: string | undefined) {
  const make = (own: boolean) => {
    const doc = finalizeDocument(createDocument());
    if (seed === undefined) doc.header.delete('$HANDSEED');
    else doc.header.set('$HANDSEED', seed);
    if (own) ownIndexes(doc);
    return doc;
  };
  const a = make(false);
  const b = make(true);
  const oldNew = oldAllocator(a);
  const s = new EditSession(b, () => {});
  const log: [string, unknown][][] = [[], []];
  return {
    docs: [a, b] as const,
    take(n: number) {
      for (let i = 0; i < n; i++) {
        log[0]!.push([oldNew(), a.header.get('$HANDSEED')]);
        const h = s.newHandle();
        // 낸 핸들은 그 순간 두 색인에 없다
        expect(b.entityIndex.has(h) || b.objects.has(h), h).toBe(false);
        log[1]!.push([h, b.header.get('$HANDSEED')]);
      }
    },
    both(f: (doc: CadDocument) => void) {
      f(a);
      f(b);
    },
    log,
  };
}

describe('newHandle과 HandleIndex(100차 — 겹침 확인 건너뛰기)', () => {
  it('세션 밖에서 곧 낼 씨앗·그 뒤 핸들을 색인·사전에 넣어도 98차와 같은 핸들을 낸다', () => {
    const p = pair('FE');
    p.take(5);
    // 곧 낼 씨앗과 같은 핸들을 밖에서 넣는다(세션 밖 색인 변경)
    p.both((d) => d.entityIndex.set(String(d.header.get('$HANDSEED')), point(String(d.header.get('$HANDSEED')))));
    p.take(3);
    p.both((d) => d.objects.set('110', dict('110')));
    p.take(10);
    // 씨앗보다 훨씬 큰 핸들 — 씨앗이 그 아래인 동안은 has로 확인한다
    p.both((d) => d.entityIndex.set('1000', point('1000')));
    p.take(4);
    p.both((d) => d.header.set('$HANDSEED', 'FFE'));
    p.take(4);
    // 지워도 기억은 줄지 않는다(그래도 같은 결과)
    p.both((d) => d.entityIndex.delete('1000'));
    p.both((d) => d.header.set('$HANDSEED', 'FFE'));
    p.take(4);
    // 색인을 일반 Map으로 바꿔 넣으면 전처럼 has로 확인한다
    p.both((d) => {
      d.entityIndex = new Map(d.entityIndex);
      d.entityIndex.set(String(d.header.get('$HANDSEED')), point(String(d.header.get('$HANDSEED'))));
    });
    p.take(3);
    expect(p.log[1]).toEqual(p.log[0]);
    expect(p.log[1]!.map((x) => x[0])).toEqual(['FE', 'FF', '100', '101', '102', '104', '105', '106', '107', '108', '109', '10A', '10B', '10C', '10D', '10E', '10F', '111', '112', '113', '114', '115', 'FFE', 'FFF', '1001', '1002', 'FFE', 'FFF', '1000', '1001', '1003', '1004', '1005']);
  });

  it('무작위로 밖에서 넣기·지우기·씨앗 바꾸기·비우고 다시 넣기를 섞어도 98차와 같다', () => {
    for (let s = 1; s <= 60; s++) {
      const r = rng(1000 + s);
      const seeds = [undefined, '', '0', 'XYZ', '1', 'FE', '00ff', 'EFFE', 'FFFF', '1FFFFFFFFFFFFE'];
      const p = pair(seeds[s % seeds.length]);
      for (let step = 0; step < 40; step++) {
        const x = r();
        const cur = (d: CadDocument) => {
          try {
            return BigInt('0x' + String(d.header.get('$HANDSEED') || '0'));
          } catch {
            return 0n;
          }
        };
        if (x < 0.4) p.take(1 + Math.floor(r() * 20));
        else if (x < 0.55) {
          const k = Math.floor(r() * 6);
          const rand = r();
          p.both((d) => {
            const h = normalizeHandle(cur(d) + BigInt(k));
            if (rand < 0.7) d.entityIndex.set(h, point(h));
            else d.objects.set(h, dict(h));
          });
        } else if (x < 0.65) {
          const rand = r();
          p.both((d) => {
            const keys = [...d.entityIndex.keys()];
            if (keys.length) d.entityIndex.delete(keys[Math.floor(rand * keys.length)]!);
          });
        } else if (x < 0.75) {
          const v = Math.floor(r() * 0x3000);
          const style = Math.floor(r() * 3);
          p.both((d) => d.header.set('$HANDSEED', style === 0 ? v.toString(16) : style === 1 ? '0' + v.toString(16).toUpperCase() : v.toString(16).toUpperCase()));
        } else if (x < 0.8) {
          p.both((d) => {
            const all = [...d.entityIndex];
            d.entityIndex.clear();
            for (const [k, e] of all) d.entityIndex.set(k, e);
          });
        } else if (x < 0.85) {
          // 정규형이 아닌 열쇠(소문자·앞 0) — 정규형 핸들과 같은 글자가 아니라 겹치지 않는다
          const v = Math.floor(r() * 0x3000);
          p.both((d) => {
            d.entityIndex.set(v.toString(16), point(v.toString(16)));
            d.entityIndex.set('00' + v.toString(16).toUpperCase(), point('00' + v.toString(16).toUpperCase()));
          });
        } else p.take(1);
      }
      expect(p.log[1], String(s)).toEqual(p.log[0]);
    }
  });

  it('받은 문서(DocAssembler)의 두 색인은 같은 차례의 HandleIndex이고, 새 핸들은 has를 부르지 않는다', () => {
    const doc = readCadFile(syntheticDxf(3000), 'syn.dxf');
    let asm: DocAssembler | null = null;
    sendDocument(
      doc,
      (d, streamed) => (asm = new DocAssembler(structuredClone(d), structuredClone(streamed))),
      (part: DocPart, t) => asm!.add(structuredClone(part, { transfer: t })),
      undefined,
      { minEntities: 1000, batch: 700 },
    );
    const got = (asm as DocAssembler | null)!.doc;
    expect(got.entityIndex).toBeInstanceOf(HandleIndex);
    expect(got.objects).toBeInstanceOf(HandleIndex);
    expect([...got.entityIndex.keys()]).toEqual([...doc.entityIndex.keys()]);
    expect([...got.objects.keys()]).toEqual([...doc.objects.keys()]);
    let calls = 0;
    for (const m of [got.entityIndex, got.objects] as Map<string, unknown>[]) {
      const has = m.has.bind(m);
      m.has = (k: string) => {
        calls++;
        return has(k);
      };
    }
    const ref = structuredClone(doc);
    const oldNew = oldAllocator(ref);
    const s = new EditSession(got, () => {});
    const a: string[] = [];
    const b: string[] = [];
    for (let i = 0; i < 2000; i++) {
      a.push(oldNew());
      b.push(s.newHandle());
    }
    expect(b).toEqual(a);
    expect(got.header.get('$HANDSEED')).toBe(ref.header.get('$HANDSEED'));
    // 읽은 도면의 씨앗은 쓰인 핸들보다 크다 — 2,000번 모두 확인 없이 냈다
    expect(calls).toBe(0);
    // 곧 낼 씨앗을 밖에서 넣으면 그때는 확인한다
    const next = String(got.header.get('$HANDSEED'));
    got.entityIndex.set(next, point(next));
    ref.entityIndex.set(next, point(next));
    expect(s.newHandle()).toBe(oldNew());
    expect(calls).toBeGreaterThan(0);
  });

  it('통째로 받은 문서(ownIndexes)도 같은 차례의 HandleIndex가 된다', () => {
    const doc = readCadFile(syntheticDxf(300), 'small.dxf');
    const got = structuredClone(doc);
    ownIndexes(got);
    expect(got.entityIndex).toBeInstanceOf(HandleIndex);
    expect(got.objects).toBeInstanceOf(HandleIndex);
    expect([...got.entityIndex]).toEqual([...structuredClone(doc).entityIndex]);
    expect([...got.objects.keys()]).toEqual([...doc.objects.keys()]);
    const idx = got.entityIndex;
    ownIndexes(got);
    expect(got.entityIndex).toBe(idx);
  });
});
