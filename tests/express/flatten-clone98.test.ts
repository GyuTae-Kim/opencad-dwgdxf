/**
 * 98차: FLATTEN의 객체 복사와 분해 조각의 확장 자료 복사를 구조화 복제 대신 cloneData로. 원본을 고치지 않고, 결과가 원본과 객체를 함께 쓰지 않으며,
 * 한 객체 안에서 같은 점을 두 칸이 함께 쓰던 원본(리더가 치수 정의점 4·5에 같은 점을 넣는 것 등)도 두 칸 모두 평면화되는지 본다.
 */
import { describe, expect, it } from 'vitest';
import type { AttribEntity, DimensionEntity, Entity, InsertEntity, LineEntity, MLineEntity } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { entityDefaults } from '../../src/core/model';
import { flattenEntity } from '../../src/edit/express/flatten';
import { inherit } from '../../src/edit/geom/path';

const doc = createNewDocument('metric');
const P = (x: number, y: number, z: number) => ({ x, y, z });

function objectsOf(v: unknown, out = new Set<unknown>()): Set<unknown> {
  if (typeof v !== 'object' || v === null || out.has(v)) return out;
  out.add(v);
  if (!ArrayBuffer.isView(v)) for (const k of Object.keys(v)) objectsOf((v as Record<string, unknown>)[k], out);
  return out;
}
const sharedWith = (a: unknown, b: unknown) => {
  const sb = objectsOf(b);
  return [...objectsOf(a)].filter((x) => sb.has(x) && !Object.isFrozen(x)).length;
};
const flat = (e: Entity) => (flattenEntity(e, doc) as { entity: Entity }).entity;

describe('FLATTEN 복사(98차)', () => {
  it('정의점 4·5가 같은 점인 치수도 두 칸 모두 0, 원본은 그대로이고 결과와 객체를 함께 쓰지 않는다', () => {
    const p45 = P(3, 4, 7);
    const d = {
      ...entityDefaults(),
      handle: 'A1',
      type: 'DIMENSION',
      block: '*D1',
      dimStyle: 'Standard',
      dimType: 0,
      defPoint: P(0, 10, 7),
      textMid: P(5, 12, 7),
      defPoint2: P(0, 0, 7),
      defPoint3: P(10, 0, 7),
      defPoint4: p45,
      defPoint5: p45,
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
      xdata: [{ app: 'ACAD', items: [{ code: 1000, value: 'DSTYLE' }, { code: 1070, value: 140 }, { code: 1040, value: 2.5 }] }],
    } as DimensionEntity;
    const before = JSON.stringify(d);
    const r = flat(d) as DimensionEntity;
    expect(JSON.stringify(d)).toBe(before);
    expect(r.defPoint4).toEqual(P(3, 4, 0));
    expect(r.defPoint5).toEqual(P(3, 4, 0));
    expect([r.defPoint, r.textMid, r.defPoint2, r.defPoint3].every((q) => q.z === 0)).toBe(true);
    expect(r.xdata).toEqual(d.xdata);
    expect(sharedWith(r, d)).toBe(0);
  });

  it('같은 속성 객체를 두 번 든 블록 참조·여러 줄 꼭짓점도 모두 평면화하고 원본은 그대로', () => {
    const a = { ...entityDefaults(), handle: 'B2', type: 'ATTRIB', tag: 'T', text: 'x', insert: P(1, 1, 5), height: 1, rotation: 0, widthFactor: 1, thickness: 2 } as unknown as AttribEntity;
    const ins = { ...entityDefaults(), handle: 'B1', type: 'INSERT', block: 'B', insert: P(0, 0, 9), scale: P(1, 1, 1), rotation: 0, columnCount: 1, rowCount: 1, columnSpacing: 0, rowSpacing: 0, attribs: [a, a] } as InsertEntity;
    const before = JSON.stringify(ins);
    const r = flat(ins) as InsertEntity;
    expect(JSON.stringify(ins)).toBe(before);
    expect(r.insert.z).toBe(0);
    expect(r.attribs.map((x) => [x.insert.z, x.thickness])).toEqual([
      [0, undefined],
      [0, undefined],
    ]);
    expect(sharedWith(r, ins)).toBe(0);
    const v = { position: P(2, 2, 3), segments: [] };
    const ml = { ...entityDefaults(), handle: 'C1', type: 'MLINE', style: 'STANDARD', scale: 1, justification: 0, flags: 0, startPoint: P(0, 0, 3), vertices: [v, v] } as unknown as MLineEntity;
    const rm = flat(ml) as MLineEntity;
    expect(rm.vertices.map((x) => x.position.z)).toEqual([0, 0]);
    expect(ml.vertices[0]!.position.z).toBe(3);
  });

  it('바뀌지 않는 객체는 null(복사한 값을 원본과 견주는 길 그대로)', () => {
    const l = { ...entityDefaults(), handle: 'D1', type: 'LINE', start: P(0, 0, 0), end: P(1, 1, 0), xdata: [{ app: 'X', items: [{ code: 1000, value: 'a' }] }] } as LineEntity;
    expect(flattenEntity(l, doc)).toBeNull();
  });
});

describe('분해 조각의 공통 특성(98차)', () => {
  it('확장 자료는 깊이 복사한다(값 같음, 객체는 따로)', () => {
    const bin = new Uint8Array([1, 2, 3]);
    const l = { ...entityDefaults(), handle: 'E1', type: 'LINE', start: P(0, 0, 0), end: P(1, 0, 0), xdata: [{ app: 'APP', items: [{ code: 1000, value: 's' }, { code: 1004, value: bin as unknown as string }, { code: 1040, value: -0 }] }] } as LineEntity;
    const o = inherit(l);
    expect(o.xdata).toEqual(l.xdata);
    expect(Object.is(o.xdata![0]!.items[2]!.value, -0)).toBe(true);
    expect(sharedWith(o, l)).toBe(0);
    expect(o.xdata![0]!.items[1]!.value).not.toBe(bin);
  });
});
