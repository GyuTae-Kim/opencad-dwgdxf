import { describe, expect, it } from 'vitest';
import { MODEL_SPACE, entityDefaults, type LeaderEntity, type SplineEntity, type Vec3 } from '../../src/core/model';
import { at3, count3, ctrlAt, ctrlCount, fitAt, fitCount, leaderCount, leaderVertices, pack3, splineCtrl, splineFit, unboxSpline, unpack3 } from '../../src/core/flat3';
import { cloneEntity } from '../../src/edit/session';
import { gripMove } from '../../src/edit/geom/grips';
import { reverseSpline } from '../../src/edit/geom/query';
import { createNewDocument } from '../../src/core/newdoc';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { readDwg, writeDwg } from '../../src/io/dwg/index';

describe('3D 점 평탄 좌표(지시선 정점)', () => {
  it('점들이 그대로 돌아온다(-0 포함)', () => {
    const pts = [
      { x: 0, y: -0, z: 1 },
      { x: 2.5, y: 3, z: -4 },
    ];
    const a = pack3(pts);
    expect(a).toEqual([0, -0, 1, 2.5, 3, -4]);
    expect(unpack3(a)).toEqual(pts);
    expect(Object.is(unpack3(a)[0]!.y, -0)).toBe(true);
    expect(count3(a)).toBe(2);
    expect(at3(a, 1)).toEqual(pts[1]);
    expect(unpack3([])).toEqual([]);
  });

  it('지시선 DXF·DWG(R2018·R2000) 왕복에서 정점이 그대로', () => {
    const doc = createNewDocument('metric');
    const blk = doc.blocks.get(MODEL_SPACE)!;
    const pts = [
      { x: 0, y: 0, z: 0 },
      { x: 5, y: 5, z: 0 },
      { x: 10, y: 5, z: 0 },
    ];
    const e: LeaderEntity = {
      ...entityDefaults(),
      type: 'LEADER',
      handle: '1C0',
      layer: '0',
      owner: blk.recordHandle,
      dimStyle: 'Standard',
      verts: pack3(pts),
      arrowHead: true,
      pathType: 0,
      creation: 3,
      hooklineDirection: 0,
      hookline: false,
      textHeight: 0,
      textWidth: 0,
    };
    blk.entities.push(e);
    doc.entityIndex.set(e.handle, e);
    for (const back of [readDxf(writeDxf(doc, { version: 'AC1032' }).data), readDwg(writeDwg(doc, { version: 'AC1032' }).data), readDwg(writeDwg(doc, { version: 'AC1015' }).data)]) {
      const l = [...back.entityIndex.values()].find((x): x is LeaderEntity => x.type === 'LEADER')!;
      expect(leaderCount(l)).toBe(3);
      expect(leaderVertices(l)).toEqual(pts);
    }
  });
});

const P = (x: number, y: number, z = 0): Vec3 => ({ x, y, z });
const isFlat = (a: unknown): boolean => Array.isArray(a) && a.length % 3 === 0 && a.every((v) => typeof v === 'number');

function spline(handle: string, owner: string, ctrl: Vec3[], fit: Vec3[], weights?: number[]): SplineEntity {
  const n = ctrl.length;
  const knots = n ? [0, 0, 0, 0, ...Array.from({ length: n - 4 }, (_, i) => i + 1), n - 3, n - 3, n - 3, n - 3] : [];
  const e: SplineEntity = {
    ...entityDefaults(),
    type: 'SPLINE',
    handle,
    layer: '0',
    owner,
    flags: 8 | (weights ? 4 : 0),
    degree: 3,
    knots,
    controlVerts: pack3(ctrl),
    fitVerts: pack3(fit),
    knotTolerance: 1e-10,
    controlTolerance: 1e-10,
    fitTolerance: 1e-10,
  };
  if (weights) e.weights = weights;
  return e;
}

describe('스플라인 조정점·맞춤점 평탄 좌표', () => {
  const ctrl = [P(0, 0), P(10, 20, 1), P(20, -20, 2), P(30, 0, 3), P(40, 10, 4)];
  const fit = [P(0, 0), P(5, 5), P(10, 0), P(15, -2)];

  it('도우미: 수·i번째 점·풀어 쓰기가 맞고, 풀어 쓴 점을 고쳐도 문서는 그대로', () => {
    const e = spline('1', '', ctrl, fit);
    expect(e.controlVerts).toEqual([0, 0, 0, 10, 20, 1, 20, -20, 2, 30, 0, 3, 40, 10, 4]);
    expect(ctrlCount(e)).toBe(5);
    expect(fitCount(e)).toBe(4);
    expect(ctrlAt(e, 2)).toEqual(P(20, -20, 2));
    expect(ctrlAt(e, 5)).toBeUndefined();
    expect(fitAt(e, -1)).toBeUndefined();
    expect(fitAt(e, 3)).toEqual(P(15, -2));
    const pts = splineCtrl(e);
    pts[0]!.x = 99;
    expect(e.controlVerts[0]).toBe(0);
    expect(splineFit(e)).toEqual(fit);
  });

  it('구조화 복제 사본을 다시 담고(cloneEntity), 사본을 고쳐도 원본은 그대로', () => {
    const e = spline('1', '', ctrl, fit);
    const c = structuredClone(e);
    unboxSpline(c, e);
    expect(c.controlVerts).toEqual(e.controlVerts);
    expect(c.controlVerts).not.toBe(e.controlVerts);
    expect(c.fitVerts).toEqual(e.fitVerts);
    // 키 순서는 그대로(DWG 원본 본문 지문이 JSON 순서를 본다)
    expect(Object.keys(c)).toEqual(Object.keys(e));
    const k = cloneEntity(e);
    k.controlVerts[0] = 7;
    expect(e.controlVerts[0]).toBe(0);
    expect(Object.keys(k)).toEqual(Object.keys(e));
  });

  it('편집(그립·반전) 결과도 평탄 좌표', () => {
    const doc = createNewDocument('metric');
    const e = spline('1C1', doc.blocks.get(MODEL_SPACE)!.recordHandle, ctrl, []);
    const moved = gripMove(e, 'c1', { x: 3, y: 8 }, doc).replace![0] as SplineEntity;
    expect(isFlat(moved.controlVerts)).toBe(true);
    expect(ctrlAt(moved, 1)).toEqual(P(3, 8, 1));
    expect(e.controlVerts.slice(3, 6)).toEqual([10, 20, 1]);
    const r = reverseSpline(e);
    expect(isFlat(r.controlVerts)).toBe(true);
    expect(splineCtrl(r)).toEqual([...ctrl].reverse());
  });

  it('DXF·DWG(R2018·R2000) 왕복에서 조정점(가중치 포함)·맞춤점이 그대로 수 배열로', () => {
    const doc = createNewDocument('metric');
    const blk = doc.blocks.get(MODEL_SPACE)!;
    const a = spline('1C0', blk.recordHandle, ctrl, [], [1, 2, 0.5, 1, 1]);
    const b = spline('1C1', blk.recordHandle, [], fit);
    for (const e of [a, b]) {
      blk.entities.push(e);
      doc.entityIndex.set(e.handle, e);
    }
    const backs = [readDxf(writeDxf(doc, { version: 'AC1032' }).data), readDwg(writeDwg(doc, { version: 'AC1032' }).data), readDwg(writeDwg(doc, { version: 'AC1015' }).data)];
    for (const back of backs) {
      const sp = [...back.entityIndex.values()].filter((x): x is SplineEntity => x.type === 'SPLINE');
      const ca = sp.find((x) => x.handle === '1C0')!;
      const fb = sp.find((x) => x.handle === '1C1')!;
      expect(isFlat(ca.controlVerts) && isFlat(ca.fitVerts) && isFlat(fb.controlVerts) && isFlat(fb.fitVerts)).toBe(true);
      expect(splineCtrl(ca)).toEqual(ctrl);
      expect(ca.weights).toEqual([1, 2, 0.5, 1, 1]);
      expect(fitCount(ca)).toBe(0);
      expect(splineFit(fb)).toEqual(fit);
    }
  });
});
