/**
 * 경량 폴리선·해치 폴리선 경계의 평탄 좌표는 Float64Array다(내용이 JS 힙 한계 밖에 놓인다).
 */
import { describe, expect, it } from 'vitest';
import type { HatchEntity, LwPolylineEntity } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
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
