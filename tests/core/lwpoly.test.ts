/**
 * 경량 폴리선·해치 폴리선 경계의 평탄 좌표는 Float64Array다(내용이 JS 힙 한계 밖에 놓인다).
 */
import { describe, expect, it } from 'vitest';
import type { Entity, HatchEntity, LwPolylineEntity, PolylineEntity, SplineEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { packPoly } from '../../src/core/polyverts';
import { pack3, splineCtrl } from '../../src/core/flat3';
import { packMesh } from '../../src/core/meshdata';
import { readCadFile } from '../../src/io/index';
import { writeDxf } from '../../src/io/dxf/writer';
import { cloneLwArrays, lwVertices, packBulge, packLw, packLwPoints, setLwVertex, tidyWidths } from '../../src/core/lwpoly';
import { f64Of, newF64, ownEntityArrays, ownF64, withF64Pool } from '../../src/core/f64pool';
import { cloneEntity } from '../../src/edit/session';
import { auditDocument } from '../../src/edit/util/audit';
import { lw } from '../edit/make';
import { hatch } from '../compare/make';
import { setup } from '../util2/helpers';

const V = (x: number, y: number, bulge = 0, startWidth = 0, endWidth = 0) => ({ x, y, bulge, startWidth, endWidth });

describe('경량 폴리선 평탄 좌표(Float64Array)', () => {
  it('되담기는 형식 배열을 돌려주고, 폭이 모두 +0이면 폭 배열이 없다', () => {
    const p = packLw([V(0, 0, 0.5), V(10, 0), V(10, 5)]);
    expect(p.verts).toBeInstanceOf(Float64Array);
    expect([...p.verts]).toEqual([0, 0, 0.5, 10, 0, 0, 10, 5, 0]);
    expect(p.widths).toBeUndefined();
    // -0 폭은 남긴다(예전 수 배열과 같게)
    const w = packLw([V(0, 0, 0, -0, 0), V(1, 0)]);
    expect(w.widths).toBeInstanceOf(Float64Array);
    expect(Object.is(w.widths![0], -0)).toBe(true);
    expect(tidyWidths(new Float64Array(4))).toBeUndefined();
    expect([...packLwPoints([{ x: 1, y: 2 }, { x: 3, y: 4 }]).verts]).toEqual([1, 2, 0, 3, 4, 0]);
    const b = packBulge([{ x: 1, y: 2, bulge: 1 }, { x: 3, y: 4 }]);
    expect(b).toBeInstanceOf(Float64Array);
    expect([...b]).toEqual([1, 2, 1, 3, 4, 0]);
  });

  it('사본은 원본과 버퍼를 함께 쓰지 않는다(복제·구조화 복제·깊은 복사)', () => {
    const e = lw([[0, 0], [5, 0, 1], [5, 5]]) as LwPolylineEntity;
    setLwVertex(e, 1, { startWidth: 2 });
    for (const c of [cloneLwArrays(e), cloneEntity(e), structuredClone(e)]) {
      expect(c.verts).toBeInstanceOf(Float64Array);
      expect(c.widths).toBeInstanceOf(Float64Array);
      expect(c.verts.buffer).not.toBe(e.verts.buffer);
      c.verts[0] = 99;
      c.widths![2] = 7;
      expect(e.verts[0]).toBe(0);
      expect(e.widths![2]).toBe(2);
    }
    expect(lwVertices(e)[1]).toEqual(V(5, 0, 1, 2, 0));
    const h = hatch(0, 0, 10, 10);
    h.paths = [{ flags: 2, polyline: { closed: true, verts: packBulge([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]) } }];
    const hc = cloneEntity<HatchEntity>(h);
    expect(hc.paths[0]!.polyline!.verts).toBeInstanceOf(Float64Array);
    expect(hc.paths[0]!.polyline!.verts.buffer).not.toBe(h.paths[0]!.polyline!.verts.buffer);
  });

  it('읽는 동안에는 덩어리에서 0으로 채운 뷰를 떼어 주고, 보내기 전에 제 버퍼로 바꾼다', () => {
    const [a, b, big] = withF64Pool(() => [newF64(6), f64Of([1, 2, 3]), newF64(1 << 17)]);
    // 같은 덩어리의 이웃 자리
    expect(a.buffer).toBe(b.buffer);
    expect(b.byteOffset).toBe(a.byteOffset + a.byteLength);
    expect([...a]).toEqual([0, 0, 0, 0, 0, 0]);
    expect([...b]).toEqual([1, 2, 3]);
    // 덩어리보다 큰 요청은 새 덩어리
    expect(big.buffer).not.toBe(a.buffer);
    expect(big.length).toBe(1 << 17);
    // 밖에서는 늘 제 버퍼
    const own = newF64(4);
    expect(own.buffer.byteLength).toBe(own.byteLength);
    expect(ownF64(own)).toBe(own);
    const e = withF64Pool(() => ({ ...(lw([[0, 0], [5, 0]]) as LwPolylineEntity), verts: f64Of([0, 0, 0, 5, 0, 0]), widths: f64Of([1, 1, 2, 2]) }));
    const h = hatch(0, 0, 1, 1);
    h.paths = [{ flags: 2, polyline: { closed: true, verts: withF64Pool(() => (newF64(3), f64Of([0, 0, 0, 1, 0, 0, 1, 1, 0]))) } }];
    expect(e.verts.buffer).toBe(e.widths!.buffer);
    ownEntityArrays(e);
    ownEntityArrays(h);
    for (const v of [e.verts, e.widths!, h.paths[0]!.polyline!.verts]) expect(v.buffer.byteLength).toBe(v.byteLength);
    expect([...e.verts]).toEqual([0, 0, 0, 5, 0, 0]);
    expect([...h.paths[0]!.polyline!.verts]).toEqual([0, 0, 0, 1, 0, 0, 1, 1, 0]);
  });

  it('POLYLINE·스플라인·지시선·메시 좌표도 읽기에서 덩어리 뷰로 받고, 보내기 전에 모두 제 버퍼가 된다', () => {
    const doc = createNewDocument('metric');
    const ms = doc.blocks.get(MODEL_SPACE)!.entities;
    const P = (x: number, y: number, z = 0) => ({ x, y, z });
    ms.push(
      { ...entityDefaults(), handle: 'A1', type: 'POLYLINE', kind: '2d', flags: 0, ...packPoly([{ location: P(0, 0), bulge: 0.5, startWidth: 1, endWidth: 2, flags: 0 }, { location: P(5, 0), bulge: 0, startWidth: 0, endWidth: 0, flags: 0 }]), elevation: 0, defaultStartWidth: 0, defaultEndWidth: 0, mCount: 0, nCount: 0, mDensity: 0, nDensity: 0, smoothType: 0 },
      { ...entityDefaults(), handle: 'A2', type: 'SPLINE', flags: 8, degree: 3, knots: [0, 0, 0, 0, 1, 1, 1, 1], controlVerts: pack3([P(0, 0), P(1, 2), P(3, 2), P(4, 0)]), fitVerts: new Float64Array(0), knotTolerance: 1e-10, controlTolerance: 1e-10, fitTolerance: 1e-10 },
      { ...entityDefaults(), handle: 'A3', type: 'MESH', ...packMesh([P(0, 0), P(1, 0), P(0, 1)], [[0, 1, 2]], [[0, 1]]), subdivision: 0 },
    );
    const back = readCadFile(writeDxf(doc, { version: 'AC1032' }).data, 'x.dxf');
    const got = [...back.blocks.get(MODEL_SPACE)!.entities];
    const arrays = (es: Entity[]) =>
      es.flatMap((e) => Object.values(e as unknown as Record<string, unknown>).filter((v): v is Float64Array => v instanceof Float64Array && v.length > 0));
    const views = arrays(got);
    expect(views.length).toBeGreaterThanOrEqual(5);
    expect(views.every((v) => v.buffer.byteLength > v.byteLength)).toBe(true);
    for (const e of got) ownEntityArrays(e);
    expect(arrays(got).every((v) => v.byteOffset === 0 && v.buffer.byteLength === v.byteLength)).toBe(true);
    const pl = got.find((e) => e.handle === 'A1') as PolylineEntity;
    expect([...pl.bulges!]).toEqual([0.5, 0]);
    expect(splineCtrl(got.find((e) => e.handle === 'A2') as SplineEntity)).toEqual([P(0, 0), P(1, 2), P(3, 2), P(4, 0)]);
  });

  it('감사(AUDIT)는 형식 배열 속 수가 아닌 값도 찾는다', () => {
    const { doc, h } = setup();
    const ok = { ...(lw([[0, 0], [1, 0]]) as LwPolylineEntity), handle: h() };
    const bad = { ...(lw([[0, 0], [1, 0]]) as LwPolylineEntity), handle: h() };
    bad.verts[3] = Number.NaN;
    doc.blocks.get(MODEL_SPACE)!.entities.push(ok, bad);
    const issues = auditDocument(doc).issues.filter((i) => i.phase === 'entities');
    expect(issues.map((i) => i.handle)).toEqual([bad.handle]);
    expect(issues[0]!.message).toMatch(/수가 아닙니다/);
  });
});
