/**
 * 99차: OVERKILL 중복 찾기가 "첫 수" 창 대신 후보 표(값이 가장 여러 가지인 수 자리로 줄 세움)로 짝을 찾는다(edit/geom/overkill.ts nearIndex).
 * 첫 수가 모두 같은 묶음(점의 각도 0, 폴리선의 첫 볼록도 0 등)에서 결과가 전과 같은지, 두 객체씩 견준 결과(overkill([a, b]) — 묶음이 작아
 * 전처럼 훑는다)로 다시 짠 "먼저 고른 것이 남는다" 규칙과 견준다. 공차 사슬(a~b, b~c지만 a와 c는 공차 밖)·같은 값·연관 객체 유지·NaN·무한·
 * 다른 도면층(다른 묶음)을 섞는다.
 */
import { describe, expect, it } from 'vitest';
import type { Entity, PointEntity } from '../../src/core/model';
import { entityDefaults } from '../../src/core/model';
import { overkill } from '../../src/edit/geom/overkill';
import { beforeHang } from '../robust/timed';

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

let serial = 0;
const point = (x: number, y: number, z: number, opt: { layer?: string; angle?: number; reactors?: string[] } = {}): PointEntity => ({
  ...entityDefaults(),
  type: 'POINT',
  handle: `P${(serial++).toString(16).toUpperCase()}`,
  layer: opt.layer ?? '0',
  position: { x, y, z },
  angle: opt.angle ?? 0,
  ...(opt.reactors ? { reactors: opt.reactors } : {}),
});

/** 점 무리: 첫 수(각도)는 모두 0. 공차 1e-6 기준으로 같은 값·공차 안·공차 사슬·공차 밖이 섞인다 */
function cloud(seed: number, n: number): Entity[] {
  const r = rng(seed);
  const out: Entity[] = [];
  const base: [number, number, number][] = [];
  while (out.length < n) {
    const x = r();
    let p: [number, number, number];
    if (base.length && x < 0.5) {
      const q = base[Math.floor(r() * base.length)]!;
      const k = Math.floor(r() * 5);
      const off = [0, 0.4e-6, 0.8e-6, 1.6e-6, 1e-3][k]!;
      const axis = Math.floor(r() * 3);
      p = [...q];
      p[axis] += off * (r() < 0.5 ? -1 : 1);
    } else {
      p = [Math.round(r() * 100) / 4, Math.round(r() * 100) / 4, r() < 0.8 ? 0 : 1];
      base.push(p);
    }
    const y = r();
    if (y < 0.01) p[0] = NaN;
    else if (y < 0.02) p[1] = Infinity;
    out.push(point(p[0], p[1], p[2], { layer: r() < 0.2 ? 'L2' : '0', reactors: r() < 0.15 ? ['R'] : undefined }));
  }
  return out;
}

/** 두 객체씩 견준 결과로 "먼저 고른 것이 남는다"(연관 객체 유지면 연관 객체가 남는다)를 다시 짠다. 첫 수가 모두 같아 묶음 차례 = 고른 차례 */
function reference(list: Entity[], tol: number, keepAssoc: boolean, memo = new Map<number, boolean>()): { removed: string[]; duplicates: number } {
  const same = (i: number, j: number) => {
    const k = i * list.length + j;
    let v = memo.get(k);
    if (v === undefined) memo.set(k, (v = overkill([list[i]!, list[j]!], { tolerance: tol }).duplicates === 1));
    return v;
  };
  const keep = (e: Entity) => keepAssoc && !!e.reactors?.length;
  const gone = new Set<number>();
  let duplicates = 0;
  for (let i = 0; i < list.length; i++) {
    if (gone.has(i)) continue;
    for (let j = i + 1; j < list.length; j++) {
      if (gone.has(j) || !same(i, j)) continue;
      const ki = keep(list[i]!);
      const kj = keep(list[j]!);
      if (ki && kj) continue;
      const drop = ki ? j : kj ? i : j;
      gone.add(drop);
      duplicates++;
      if (drop === i) break;
    }
  }
  return { removed: [...gone].map((i) => list[i]!.handle).sort(), duplicates };
}

describe('OVERKILL 중복 후보 표(99차)', () => {
  it('첫 수가 모두 같은 큰 묶음: 결과가 두 객체씩 견준 규칙과 같다(공차 사슬·같은 값·연관 객체 유지·NaN·무한·다른 도면층)', () => {
    let dup = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const list = cloud(seed, 60 + seed * 12);
      const memo = new Map<number, boolean>();
      for (const keepAssociative of [false, true]) {
        const r = overkill(list, { tolerance: 1e-6, keepAssociative });
        const ref = reference(list, 1e-6, keepAssociative, memo);
        expect([...(r.result.remove ?? [])].sort(), `seed ${seed} keep ${keepAssociative}`).toEqual(ref.removed);
        expect(r.duplicates).toBe(ref.duplicates);
        dup += r.duplicates;
      }
    }
    // 실제로 많이 지웠다(같은 값·공차 안이 섞였다)
    expect(dup).toBeGreaterThan(500);
  });

  it('공차를 크게 해도 같다(후보 창이 넓다)', () => {
    const list = cloud(77, 200);
    const r = overkill(list, { tolerance: 0.3 });
    const ref = reference(list, 0.3, false);
    expect([...(r.result.remove ?? [])].sort()).toEqual(ref.removed);
  });

  it('첫 수가 NaN인 묶음은 전처럼 훑는다(결과가 그대로)', () => {
    const list: Entity[] = [];
    for (let i = 0; i < 40; i++) list.push(point(i % 10, 0, 0, { angle: i === 7 ? NaN : 0 }));
    const r = overkill(list);
    // 각도가 NaN인 점은 아무와도 같지 않고, 나머지는 x가 같은 점끼리 먼저 고른 것이 남는다
    expect(r.duplicates).toBeGreaterThan(0);
    expect(r.result.remove).not.toContain(list[7]!.handle);
  });

  it('첫 수가 같고 서로 다른 객체 6만 개도 짝을 모두 견주지 않는다', () => {
    const N = 60000;
    const list: Entity[] = [];
    for (let i = 0; i < N; i++) list.push(point(i * 0.5, (i * 7919) % 1000, 0));
    list.push(point(0, 0, 0), point(10000 * 0.5, (10000 * 7919) % 1000, 1e-7));
    // 전에는 쌍 18억 개를 견주어 20초 안에 끝나지 않았다(시간은 끝나지 않는 꼴만 가른다 — tests/robust/timed.ts)
    const r = beforeHang(() => overkill(list));
    expect(r.duplicates).toBe(2);
    expect(r.result.remove).toEqual([list[N]!.handle, list[N + 1]!.handle]);
  });
});
