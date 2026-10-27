/**
 * 9차 후속: 가상 교차점(APP)을 객체의 정확한 형상으로(src/app/snap-app.ts).
 * - 선을 늘린 무한선, 호를 늘린 원, 타원호를 늘린 타원끼리의 교점(Float32 꺾은선이 아니라 정확히)
 * - 원·호 하나뿐이면 꺾은선 현이 만나는 가짜 가상 교차점이 없다(근처점을 가리지 않는다)
 * - 블록 안 객체는 블록 변환대로(비균일 축척의 호는 타원호)
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, Entity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import type { Picker } from '../../src/app/pick';
import { findSnaps } from '../../src/app/snap';
import { affinePiece, apparentSnaps } from '../../src/app/snap-app';
import { pieceAt } from '../../src/edit/geom/curve';
import { entityPath } from '../../src/edit/geom/path';
import { arc, circle, ellipse, line, newDoc } from '../edit/make';

type Pt = { x: number; y: number };
const P = (x: number, y: number): Pt => ({ x, y });
const APP = new Set(['app'] as const);

function setup(...es: Entity[]): { doc: CadDocument; pk: Picker; hs: string[] } {
  const doc = newDoc();
  const hs = es.map((e, i) => {
    e.handle = `E${i}`;
    doc.blocks.get(MODEL_SPACE)!.entities.push(e);
    doc.entityIndex.set(e.handle, e);
    return e.handle;
  });
  // 모든 객체를 후보로(블록 참조도 — 거리는 snap-app이 조각으로 잰다)
  const pk = { candidates: () => [...doc.entityIndex.keys()].map((handle) => ({ handle })), entity: (h: string) => doc.entityIndex.get(h), distance: () => 0, segmentsNear: () => [] } as unknown as Picker;
  return { doc, pk, hs };
}

describe('가상 교차점(APP)', () => {
  it('만나지 않는 두 선을 늘린 교점, 나란하면 없음', () => {
    const { doc, pk, hs } = setup(line(0, 0, 4, 0), line(6, -3, 6, -1));
    const s = findSnaps(doc, pk, P(6.2, 0.1), 1, APP)[0]!;
    expect(s).toMatchObject({ kind: 'app', handle: hs[0], handle2: hs[1] });
    expect(s.x).toBeCloseTo(6, 12);
    expect(s.y).toBeCloseTo(0, 12);
    const par = setup(line(0, 0, 4, 0), line(0, 1, 4, 1));
    expect(findSnaps(par.doc, par.pk, P(5, 0.5), 1, APP)).toEqual([]);
  });

  it('호는 원으로 늘린다: 선 x = 3과 반지름 5인 원의 교점 (3, −4)', () => {
    const { doc, pk } = setup(arc(0, 0, 5, 0, 60), line(3, -10, 3, -6));
    const s = findSnaps(doc, pk, P(3.1, -4.1), 1.2, APP)[0]!;
    expect(s.kind).toBe('app');
    expect(s.x).toBeCloseTo(3, 12);
    expect(s.y).toBeCloseTo(-4, 12);
  });

  it('타원과 선 y = 1(떨어져 있음): x = 2√3', () => {
    const { doc, pk } = setup(ellipse(0, 0, 4, 0, 0.5, 0, Math.PI / 4), line(5, 1, 9, 1));
    const s = findSnaps(doc, pk, P(3.6, 1.05), 1.5, APP)[0]!;
    expect(s.x).toBeCloseTo(2 * Math.sqrt(3), 9);
    expect(s.y).toBeCloseTo(1, 12);
  });

  it('원 하나뿐이면 가상 교차점이 없어 근처점이 잡힌다', () => {
    const { doc, pk } = setup(circle(0, 0, 5));
    expect(apparentSnaps(doc, pk, P(5.05, 0.3), 0.5)).toEqual([]);
  });

  it('블록 안 객체는 블록 변환대로', () => {
    const doc0 = newDoc();
    doc0.blocks.set('B', { name: 'B', handle: 'B0', recordHandle: 'B1', basePoint: { x: 0, y: 0, z: 0 }, flags: 0, entities: [{ ...line(0, 0, 1, 0), handle: 'B2' } as Entity], endHandle: 'B3' } as never);
    const ins = { ...entityDefaults(), handle: '', type: 'INSERT', block: 'B', insert: { x: 0, y: 5, z: 0 }, scale: { x: 2, y: 2, z: 1 }, rotation: Math.PI / 2, columnCount: 1, rowCount: 1, columnSpacing: 0, rowSpacing: 0, attribs: [] } as Entity;
    const { doc, pk, hs } = setup(ins, line(2, 0, 4, 0));
    doc.blocks.set('B', doc0.blocks.get('B')!);
    const s = findSnaps(doc, pk, P(0.2, 0.2), 1.3, APP)[0]!;
    expect(s).toMatchObject({ kind: 'app', handle: hs[0], handle2: hs[1] });
    expect(s.x).toBeCloseTo(0, 12);
    expect(s.y).toBeCloseTo(0, 12);
  });

  it('조각의 아핀 옮기기: 닮음이면 호, 비균일 축척이면 같은 점을 지나는 타원호', () => {
    const pc = entityPath(arc(1, 2, 3, 10, 80))!.pieces[0]!;
    const rot: number[] = [0, 1, -1, 0, 5, 5];
    const r = affinePiece(pc, rot);
    expect(r.k).toBe('arc');
    const stretch: number[] = [2, 0, 0, 1, 0, 0];
    const s = affinePiece(pc, stretch);
    expect(s.k).toBe('ell');
    for (const t of [0, 0.3, 1]) {
      const q = pieceAt(pc, t);
      const a = pieceAt(r, t);
      const b = pieceAt(s, t);
      expect(a.x).toBeCloseTo(-q.y + 5, 12);
      expect(a.y).toBeCloseTo(q.x + 5, 12);
      expect(b.x).toBeCloseTo(2 * q.x, 12);
      expect(b.y).toBeCloseTo(q.y, 12);
    }
  });
});
