/**
 * 131차: 이 앱이 치수 그림 블록을 다시 만들 때 화살표 반전(DXF 74·75 — AutoCAD "To Flip the Direction of an Arrowhead", AIDIMFLIPARROW)을 그린다.
 * 규칙은 AutoCAD가 그린 반전 블록이 든 실제 도면 3개의 치수 3개(모두 회전 선형 치수·닫고 채운 화살촉)에서 읽었다. 세 치수 모두 같은 꼴이다:
 * 반전하지 않은 그림(화살촉 안쪽·바깥 배치, 꼬리, DIMTOFL 치수선, 안쪽 치수선)은 그대로 두고, 반전한 화살촉마다
 *  ① 끝은 치수보조선 발 그대로 몸통만 반대쪽으로, ② 반전한 몸통 밑동에서 같은 쪽으로 화살촉 길이(asz)만큼 선,
 *  ③ 발에서 원래 몸통 쪽으로 원래 화살촉이 치수선을 자르던 길이(asz)만큼 선.
 * 문자 쪽 화살촉을 반전하고 문자가 바깥이면 문자까지 늘이는 선은 발에서 따로 긋는다(안쪽 치수선은 원래 자른 자리에서 끝난다).
 * 아래 시험은 실물과 같은 세 배치(바깥 화살촉 하나를 안으로, 바깥 둘을 안으로, 바깥 문자가 있는 안쪽 둘을 밖으로)를 새 도면에 만들어
 * 치수선 위 선 조각을 화살촉 길이 단위(첫 발 = 0, 둘째 발 = L)로 견준다. 실물 블록과의 대조 수치는 131차 보고에 있다.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, DimensionEntity, Entity, FaceEntity, Vec3 } from '../../src/core/model';
import { createAlignedDimension, createAngularDimension, createLinearDimension, generateDimensionGeometry } from '../../src/edit/dim';
import { dimVars } from '../../src/edit/dim/vars';
import { createNewDocument } from '../../src/core/newdoc';

const V = (x: number, y: number, z = 0): Vec3 => ({ x, y, z });
type P = { x: number; y: number };
const sub = (a: P, b: P): P => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: P, b: P) => a.x * b.x + a.y * b.y;
const r6 = (x: number) => Math.round(x * 1e6) / 1e6 + 0;

/** 회전 선형 치수의 치수선 좌표틀: 첫 발 d1, 둘째 발 쪽 단위 ux, 길이 L(asz 단위), asz */
function frame(doc: CadDocument, d: DimensionEntity) {
  const u = { x: Math.cos(d.rotation), y: Math.sin(d.rotation) };
  const along = (q: P) => dot(sub(q, d.defPoint), u);
  const t1 = along(d.defPoint2);
  const t2 = along(d.defPoint3);
  const s = t2 > t1 ? 1 : -1;
  const asz = dimVars(doc, d).asz;
  const d1 = { x: d.defPoint.x + u.x * t1, y: d.defPoint.y + u.y * t1 };
  const ux = { x: u.x * s, y: u.y * s };
  return { d1, ux, asz, L: Math.abs(t2 - t1) / asz, n: { x: -u.y, y: u.x } };
}

/** 치수선 위 LINE 조각(asz 단위, 작은 쪽부터) */
function segs(doc: CadDocument, d: DimensionEntity, ents: Entity[]): [number, number][] {
  const f = frame(doc, d);
  const at = (q: P) => r6(dot(sub(q, f.d1), f.ux) / f.asz);
  const on = (q: P) => Math.abs(dot(sub(q, f.d1), f.n)) < 1e-9;
  return ents
    .filter((e): e is Extract<Entity, { type: 'LINE' }> => e.type === 'LINE' && on(e.start) && on(e.end))
    .map((e): [number, number] => {
      const a = at(e.start);
      const b = at(e.end);
      return a < b ? [a, b] : [b, a];
    })
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/** 화살촉(SOLID)의 끝 자리(0 첫 발, L 둘째 발)와 몸통 쪽(+1 = 둘째 발 쪽) */
function arrows(doc: CadDocument, d: DimensionEntity, ents: Entity[]): [number, number][] {
  const f = frame(doc, d);
  return ents
    .filter((e): e is FaceEntity => e.type === 'SOLID')
    .map((e): [number, number] => {
      const tip = e.points[2];
      const base = { x: (e.points[0].x + e.points[1].x) / 2, y: (e.points[0].y + e.points[1].y) / 2 };
      return [r6(dot(sub(tip, f.d1), f.ux) / f.asz), Math.sign(dot(sub(base, tip), f.ux))];
    })
    .sort((a, b) => a[0] - b[0]);
}

const gen = (doc: CadDocument, d: DimensionEntity, f1: boolean, f2: boolean) => {
  const x = { ...d };
  delete x.flipArrow1;
  delete x.flipArrow2;
  if (f1) x.flipArrow1 = true;
  if (f2) x.flipArrow2 = true;
  return generateDimensionGeometry(doc, x).entities;
};
const sorted = (xs: [number, number][]) => xs.map(([a, b]): [number, number] => [r6(a), r6(b)]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
const not = (e: Entity) => e.type !== 'LINE' && e.type !== 'SOLID';

describe('치수 화살표 반전 그림(131차)', () => {
  it('바깥 화살촉 하나를 안으로: 몸통이 안쪽, 안쪽으로 asz 선, 원래 자리 asz 선(꼬리·DIMTOFL 치수선은 그대로)', () => {
    const doc = createNewDocument('metric');
    // 세로 치수(첫 발이 위), 보조선 사이 4 — 화살촉(2.5) 둘이 들어가지 않아 바깥, DIMTOFL 1(ISO-25)
    const d = createLinearDimension(doc, V(20, 14), V(20, 10), V(5, 12), { rotation: Math.PI / 2 });
    const f = frame(doc, d);
    expect(f.asz).toBe(2.5);
    const L = r6(f.L);
    const off = gen(doc, d, false, false);
    expect(arrows(doc, d, off)).toEqual([
      [0, -1],
      [L, 1],
    ]);
    expect(segs(doc, d, off)).toEqual([
      [-2, -1],
      [0, L],
      [L + 1, L + 2],
    ]);
    const on = gen(doc, d, true, false);
    expect(arrows(doc, d, on)).toEqual([
      [0, 1],
      [L, 1],
    ]);
    expect(segs(doc, d, on)).toEqual(
      sorted([
        [-2, -1],
        [-1, 0],
        [0, L],
        [1, 2],
        [L + 1, L + 2],
      ]),
    );
    // 선·화살촉 밖의 것(치수보조선 제외 문자·점)은 같다
    expect(on.filter(not)).toEqual(off.filter(not));
    expect(on.filter((e) => e.type === 'LINE')).toHaveLength(off.filter((e) => e.type === 'LINE').length + 2);
  });

  it('바깥 화살촉 둘을 안으로', () => {
    const doc = createNewDocument('metric');
    const d = createLinearDimension(doc, V(0, 0), V(0, 4), V(10, 2), { rotation: Math.PI / 2 });
    const L = r6(frame(doc, d).L);
    const on = gen(doc, d, true, true);
    expect(arrows(doc, d, on)).toEqual([
      [0, 1],
      [L, -1],
    ]);
    expect(segs(doc, d, on)).toEqual(
      sorted([
        [-2, -1],
        [-1, 0],
        [0, L],
        [1, 2],
        [L - 2, L - 1],
        [L, L + 1],
        [L + 1, L + 2],
      ]),
    );
  });

  it('안쪽 화살촉 둘을 밖으로(문자는 첫 보조선 밖): 밑동 너머 asz 꼬리, 원래 자리 asz 선, 문자까지 늘이는 선은 발에서', () => {
    const doc = createNewDocument('metric');
    const d = createLinearDimension(doc, V(50, 0), V(0, 0), V(25, 10), { rotation: Math.PI });
    // 문자를 첫 보조선 밖(치수선 위)으로 옮긴 치수(사용자 위치 128, DIMTMOVE 0)
    const f = frame(doc, d);
    d.dimType |= 128;
    d.textMid = { x: f.d1.x - f.ux.x * 12, y: f.d1.y - f.ux.y * 12, z: 0 };
    const L = r6(f.L);
    expect(L).toBe(20);
    const off = gen(doc, d, false, false);
    expect(arrows(doc, d, off)).toEqual([
      [0, 1],
      [L, -1],
    ]);
    const so = segs(doc, d, off);
    expect(so).toHaveLength(1);
    const reach = so[0]![0];
    expect(reach).toBeLessThan(-1);
    expect(so[0]![1]).toBe(L - 1);
    const on = gen(doc, d, true, true);
    expect(arrows(doc, d, on)).toEqual([
      [0, -1],
      [L, 1],
    ]);
    expect(segs(doc, d, on)).toEqual(
      sorted([
        [-2, -1],
        [reach, 0],
        [0, 1],
        [1, L - 1],
        [L - 1, L],
        [L + 1, L + 2],
      ]),
    );
    expect(on.filter(not)).toEqual(off.filter(not));
  });

  it('둘째 화살촉만 반전(안쪽 → 바깥)', () => {
    const doc = createNewDocument('metric');
    const d = createLinearDimension(doc, V(0, 0), V(40, 0), V(20, 10));
    const L = r6(frame(doc, d).L);
    const off = gen(doc, d, false, false);
    const on = gen(doc, d, false, true);
    expect(arrows(doc, d, on)).toEqual([
      [0, 1],
      [L, 1],
    ]);
    expect(segs(doc, d, on)).toEqual(sorted([...segs(doc, d, off), [L - 1, L], [L + 1, L + 2]]));
  });

  it('실물이 없는 종류·화살촉은 반전 없이 그린다(정렬·각도 치수, 블록·눈금 화살촉, 화살촉을 숨긴 반쪽)', () => {
    const doc = createNewDocument('metric');
    const same = (d: DimensionEntity) => expect(gen(doc, d, true, true)).toEqual(gen(doc, d, false, false));
    same(createAlignedDimension(doc, V(0, 0), V(30, 20), V(-5, 25)));
    same(createAngularDimension(doc, V(0, 0), V(30, 0), V(0, 30), V(20, 20)));
    const open = createLinearDimension(doc, V(0, 0), V(40, 0), V(20, 10));
    open.overrides = { 5: '_Open' };
    expect(gen(doc, open, false, false).some((e) => e.type === 'INSERT')).toBe(true);
    same(open);
    const tick = createLinearDimension(doc, V(0, 0), V(40, 0), V(20, 10));
    tick.overrides = { 142: 1 };
    same(tick);
    const half = createLinearDimension(doc, V(0, 0), V(40, 0), V(20, 10));
    half.overrides = { 281: 1, 282: 1 };
    same(half);
  });
});
