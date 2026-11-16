/**
 * 호 길이 치수(ARC_DIMENSION)의 지시선 깃발(134차): AcDbArcDimension의 71(지시선 있음)이 0이면 16·17(지시선 점)이 있어도 지시선이 없다.
 * AutoCAD는 지시선이 없는 호 길이 치수에도 16·17에 두 보조선 끝(13·14)을 적는다 — 같은 도면을 AutoCAD가 DWG·DXF로 쓴 공개 짝
 * (R2000~R2018 여섯 판)에서 DWG의 같은 자리 비트(지시선 있음)는 0이고 AutoCAD 치수 블록에도 지시선이 없다. DWG 리더는 이미 그 비트로 가른다.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, DimensionEntity, FaceEntity, LineEntity } from '../../src/core/model';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { generateDimensionGeometry } from '../../src/edit/dim';

const dxf = (ents: string[]) =>
  ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1032', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES', ...ents, '0', 'ENDSEC', '0', 'EOF', ''].join('\n');

/** 반지름 10인 사분원(0° → 90°)의 호 길이 치수. 치수 호는 반지름 12. 16·17은 주어진 점(없으면 쓰지 않음) */
const ARC = (hasLeader: 0 | 1, l1?: [number, number], l2?: [number, number]) => [
  ...['0', 'ARC_DIMENSION', '5', '5BB', '100', 'AcDbEntity', '8', '0', '100', 'AcDbDimension', '2', '*D1'],
  ...['10', '8.485281374', '20', '8.485281374', '30', '0', '11', '9.9', '21', '9.9', '31', '0', '70', '37', '71', '5', '42', '15.70796327', '3', 'Standard'],
  ...['100', 'AcDbArcDimension', '13', '10', '23', '0', '33', '0', '14', '0', '24', '10', '34', '0', '15', '0', '25', '0', '35', '0'],
  ...['70', '0', '40', '0', '41', '1.570796327', '71', String(hasLeader)],
  ...(l1 ? ['16', String(l1[0]), '26', String(l1[1]), '36', '0'] : []),
  ...(l2 ? ['17', String(l2[0]), '27', String(l2[1]), '37', '0'] : []),
];

const dimOf = (doc: CadDocument) => doc.entityIndex.get('5BB') as DimensionEntity;
const count = (doc: CadDocument) => {
  const g = generateDimensionGeometry(doc, dimOf(doc));
  return { lines: g.entities.filter((e): e is LineEntity => e.type === 'LINE').length, solids: g.entities.filter((e): e is FaceEntity => e.type === 'SOLID').length };
};

describe('호 길이 치수의 지시선 깃발(DXF 71)', () => {
  // AutoCAD가 지시선 없는 치수에 적는 꼴: 16 = 13, 17 = 14
  const noLeader = () => readDxf(new TextEncoder().encode(dxf(ARC(0, [10, 0], [0, 10]))));
  // DIMARC 지시선(L): 재는 호 위(16)와 치수 호 바깥(17)
  const withLeader = () => readDxf(new TextEncoder().encode(dxf(ARC(1, [7.0710678, 7.0710678], [10.6066017, 10.6066017]))));

  it('71이 0이면 16·17이 있어도 지시선 점을 두지 않고, 그림은 16·17이 없을 때와 같다', () => {
    const d = dimOf(noLeader());
    expect(d.subtype).toBe('ARC_DIMENSION');
    expect(d.arc!.leader1).toBeUndefined();
    expect(d.arc!.leader2).toBeUndefined();
    // 16·40은 지시선 점·호 시작 매개변수 — 호 위치(defPoint5)·지시선 길이로 읽지 않는다(DWG 리더와 같다)
    expect(d.defPoint5).toEqual({ x: 0, y: 0, z: 0 });
    expect(d.leaderLength).toBe(0);
    const bare = readDxf(new TextEncoder().encode(dxf(ARC(0))));
    expect(count(noLeader())).toEqual(count(bare));
    // 두 보조선 끝을 잇는 선(전에는 지시선으로 그었다)이 없다
    const g = generateDimensionGeometry(noLeader(), d);
    const chord = g.entities.some((e) => e.type === 'LINE' && Math.hypot(e.start.x, e.start.y - 10) < 1e-6 && Math.abs(e.end.y) < 0.5);
    expect(chord).toBe(false);
  });

  it('71이 1이면 지시선 점을 읽고 지시선(선 하나·화살촉 하나)을 더 그린다', () => {
    const d = dimOf(withLeader());
    expect(d.arc!.leader1!.x).toBeCloseTo(7.0710678, 6);
    expect(d.arc!.leader2!.y).toBeCloseTo(10.6066017, 6);
    const a = count(withLeader());
    const b = count(noLeader());
    expect(a.lines).toBe(b.lines + 1);
    expect(a.solids).toBe(b.solids + 1);
  });

  it('저장: 지시선 없는 치수는 DXF 71 = 0·DWG 비트 0으로 쓰고, 지시선 있는 치수는 그대로 남는다', () => {
    for (const v of ['AC1018', 'AC1032'] as const) {
      const out = new TextDecoder().decode(writeDxf(noLeader(), { version: v }).data).replace(/\r/g, '');
      const sub = out.slice(out.indexOf('AcDbArcDimension'));
      expect(/\n *71\n *(\d+)\n/.exec(sub)![1]).toBe('0');
      expect(dimOf(readDxf(writeDxf(noLeader(), { version: v }).data)).arc!.leader1).toBeUndefined();
      expect(dimOf(readDwg(writeDwg(noLeader(), { version: v }).data)).arc!.leader1).toBeUndefined();
      const back = dimOf(readDxf(writeDxf(withLeader(), { version: v }).data));
      expect(back.arc!.leader1!.x).toBeCloseTo(7.0710678, 6);
      const backDwg = dimOf(readDwg(writeDwg(withLeader(), { version: v }).data));
      expect(backDwg.arc!.leader2!.x).toBeCloseTo(10.6066017, 6);
    }
  });
});
