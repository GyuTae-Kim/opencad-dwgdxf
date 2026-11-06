/**
 * 98차: 변환이 복사하자마자 새 값으로 바꾸는 속성은 복사하지 않는다(core/clone.ts cloneDataExcept — 해치 경계·무늬 선·씨앗점, 치수 정의점).
 * 결과가 전과 같으려면 건너뛴 속성을 변환이 모두 바꿔야 한다: 결과가 원본과 객체를 함께 쓰지 않는지, 속성 차례가 원본 그대로인지 여러 갈래로 본다.
 */
import { describe, expect, it } from 'vitest';
import { cloneData, cloneDataExcept } from '../../src/core/clone';
import { finalizeDocument } from '../../src/core/finalize';
import { type DimensionEntity, type Entity, type HatchEntity, createDocument, entityDefaults } from '../../src/core/model';
import { packEdges } from '../../src/core/hatchedges';
import { transformEntity } from '../../src/edit/geom';
import { type Affine, affMirror, affMul, affRotate, affScale, affTranslate } from '../../src/edit/geom/math';

/** v 안의 모든 객체(형식 배열 포함) */
function objectsOf(v: unknown, out = new Set<unknown>()): Set<unknown> {
  if (typeof v !== 'object' || v === null || out.has(v)) return out;
  out.add(v);
  if (!ArrayBuffer.isView(v)) for (const k of Object.keys(v)) objectsOf((v as Record<string, unknown>)[k], out);
  return out;
}
const shared = (a: unknown, b: unknown): number => {
  const sa = objectsOf(a);
  return [...objectsOf(b)].filter((x) => sa.has(x)).length;
};

describe('cloneDataExcept', () => {
  const src = () => ({
    a: 1,
    p: { x: 1, y: [2, 3] },
    q: [{ z: 1 }],
    t: new Float64Array([1, 2, 3]),
    u: undefined,
    w: { deep: { er: [1] } },
  });

  it('건너뛴 속성은 원본 값 그대로, 나머지는 cloneData처럼 깊이 복사하고 속성 차례는 같다', () => {
    const v = src();
    const c = cloneDataExcept(v, new Set(['p', 't']));
    expect(Object.keys(c)).toEqual(Object.keys(v));
    expect(c.p).toBe(v.p);
    expect(c.t).toBe(v.t);
    expect(c.q).toEqual(v.q);
    expect(c.q).not.toBe(v.q);
    expect(c.q[0]).not.toBe(v.q[0]);
    expect(c.w.deep).not.toBe(v.w.deep);
    expect('u' in c).toBe(true);
    // 건너뛴 것 말고는 함께 쓰는 객체가 없다
    const { p: _p, t: _t, ...rest } = c;
    expect(shared(rest, v)).toBe(0);
    expect(cloneDataExcept(v, new Set())).toEqual(cloneData(v));
  });

  it('나머지에 다루지 않는 값이 있으면 값 전체를 structuredClone, 맨 위가 일반 객체가 아니면 cloneData', () => {
    const v = { m: new Map([['k', { x: 1 }]]), p: { x: 1 } };
    const c = cloneDataExcept(v, new Set(['p']));
    expect(c.m).toBeInstanceOf(Map);
    expect(c.m).not.toBe(v.m);
    expect(c.m.get('k')).toEqual({ x: 1 });
    expect(c.p).not.toBe(v.p);
    const arr = [{ x: 1 }];
    const ca = cloneDataExcept(arr, new Set(['0']));
    expect(ca[0]).not.toBe(arr[0]);
    expect(() => cloneDataExcept({ f: () => 1, p: {} }, new Set(['p']))).toThrow();
  });
});

const P3 = (x: number, y: number, z = 0) => ({ x, y, z });

function dim(over: Partial<DimensionEntity>): DimensionEntity {
  return {
    ...entityDefaults(),
    type: 'DIMENSION',
    handle: '30',
    block: '',
    dimStyle: 'Standard',
    dimType: 0,
    defPoint: P3(0, 10),
    textMid: P3(5, 12),
    defPoint2: P3(0, 0),
    defPoint3: P3(10, 0),
    defPoint4: P3(0, 0),
    defPoint5: P3(0, 0),
    text: '',
    measurement: 10,
    rotation: 0,
    obliqueAngle: 0,
    textRotation: 0,
    horizontalDirection: 0,
    attachment: 5,
    leaderLength: 0,
    lineSpacingStyle: 1,
    lineSpacingFactor: 1,
    overrides: { 140: 2.5 },
    reactors: ['31'],
    ...over,
  } as DimensionEntity;
}

function hatch(over: Partial<HatchEntity> = {}): HatchEntity {
  return {
    ...entityDefaults(),
    type: 'HATCH',
    handle: '40',
    patternName: 'ANSI31',
    solid: false,
    associative: true,
    hatchStyle: 0,
    patternType: 1,
    patternAngle: 0,
    patternScale: 1,
    patternDouble: false,
    elevation: 0,
    paths: [
      { flags: 3, sources: ['1F'], polyline: { closed: true, verts: new Float64Array([0, 0, 0, 10, 0, 0.5, 10, 10, 0]) } },
      { flags: 1, edgeData: packEdges([{ type: 'line', start: { x: 0, y: 0 }, end: { x: 5, y: 0 } }, { type: 'arc', center: { x: 5, y: 2 }, radius: 2, startAngle: -Math.PI / 2, endAngle: Math.PI / 2, ccw: true }]) },
    ],
    patternLines: [{ angle: 0.785, base: { x: 0, y: 0 }, offset: { x: -2.2, y: 2.2 }, dashes: [1, -0.5] }],
    pixelSize: 0,
    seedPoints: [{ x: 1, y: 2 }],
    xdata: [{ app: 'ACAD', items: [{ code: 1000, value: 'x' }] }],
    ...over,
  } as HatchEntity;
}

const transforms: [string, Affine][] = [
  ['이동', affTranslate(3, -4)],
  ['회전', affMul(affTranslate(1, 2), affRotate(0.7))],
  ['대칭', affMirror({ x: 0, y: 0 }, { x: 1, y: 2 })],
  ['축척', affScale(2.5, 2.5, { x: 1, y: 1 })],
];

/** 결과가 원본과 객체를 함께 쓰지 않고(빼는 속성 말고), 원본의 속성 차례를 앞에 그대로 지니는지 */
function check(e: Entity, r: Entity, allowShared: readonly string[] = []): void {
  const ke = Object.keys(e);
  expect(Object.keys(r).slice(0, ke.length)).toEqual(ke);
  const strip = (x: Entity) => Object.fromEntries(Object.entries(x).filter(([k]) => !allowShared.includes(k)));
  expect(shared(strip(r), e)).toBe(0);
}

describe('변환 결과가 원본과 객체를 함께 쓰지 않는다(98차 — 바꿀 속성을 복사하지 않아도)', () => {
  const doc = finalizeDocument(createDocument());
  const dims: [string, DimensionEntity][] = [
    ['선형(평면)', dim({})],
    ['선형(돌출 방향 -Z, 삽입점)', dim({ extrusion: P3(0, 0, -1), insertPoint: P3(1, 1) })],
    ['선형(기운 돌출 방향, 삽입점)', dim({ extrusion: P3(0.6, 0, 0.8), insertPoint: P3(1, 1) })],
    ['호 길이', dim({ subtype: 'ARC_DIMENSION', dimType: 5, arc: { center: P3(0, 0), start: P3(5, 0), end: P3(0, 5), startAngle: 0, endAngle: Math.PI / 2, partial: false, leader1: P3(6, 0) } })],
  ];
  for (const [name, d] of dims)
    for (const [tn, m] of transforms)
      it(`치수 ${name} ${tn}`, () => {
        const res = transformEntity(d, m, doc, { deferDimBlocks: true });
        const r = (res.replace ?? res.add)![0]!;
        check(d, r);
        expect(r.handle).toBe(d.handle);
      });

  const hatches: [string, HatchEntity][] = [
    ['폴리선·모서리 경계', hatch()],
    ['돌출 방향 -Z·고도', hatch({ extrusion: P3(0, 0, -1), elevation: 2 })],
    ['그라데이션', hatch({ gradient: { enabled: true, name: 'LINEAR', color1: { aci: 1 }, color2: { aci: 5 }, singleColor: false, tint: 0, angle: 0.3, shift: 0 } })],
  ];
  for (const [name, h] of hatches)
    for (const [tn, m] of transforms)
      for (const mirrorHatch of [false, true])
        it(`해치 ${name} ${tn}${mirrorHatch ? ' MIRRHATCH 1' : ''}`, () => {
          const res = transformEntity(h, m, doc, { mirrorHatch });
          const r = (res.replace ?? res.add)![0]!;
          // 그라데이션은 전에도 펼치기로 바꿔 색 객체를 원본과 함께 썼다(98차 이전과 같다)
          check(h, r, ['gradient']);
        });
});
