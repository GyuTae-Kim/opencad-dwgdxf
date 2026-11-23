/**
 * DWG에서 연 꺾기 반지름 치수(LARGE_RADIAL_DIMENSION)의 꺾기 각도(158차).
 * ObjectARX AcDbRadialDimensionLarge는 중심·현 점·재지정 중심·꺾기 점과 실수 하나(꺾기 각도 jogAngle)를 지닌다. DXF(AcDbRadialDimensionLarge 13·14·15·40)에서
 * 실수는 40 하나이고(AutoCAD 꼴 견본은 0.785 ≈ 45°), DWG 본문에서는 중심(10)·현 점(15) 다음 BD 하나 뒤에 재지정 중심(13)·꺾기 점(14)이 온다.
 * DXF 리더는 40을 모델(leaderLength)로 읽고 DXF·DWG 쓰기는 그 값을 40·BD로 쓰는데, DWG 리더는 그 BD를 읽고 버려 0이 됐다.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, DimensionEntity } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { createJoggedDimension } from '../../src/edit/annot/create';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';

type Ver = 'AC1018' | 'AC1024' | 'AC1027' | 'AC1032';

const dxf = (ents: string[][]): Uint8Array =>
  new TextEncoder().encode(['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1032', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES', ...ents.flat(), '0', 'ENDSEC', '0', 'EOF', ''].join('\n'));

/** AutoCAD 꼴의 꺾기 반지름 치수(tests/dxf/sweep-fixes.test.ts와 같은 꼴): 13 재지정 중심, 14 꺾기 점, 15 현 점, 40 꺾기 각도 */
const JOG = (handle: string, block: string, chord: number, angle: string): string[] => [
  '0', 'LARGE_RADIAL_DIMENSION', '5', handle, '100', 'AcDbEntity', '8', '0', '100', 'AcDbDimension', '2', block,
  '10', '0', '20', '0', '30', '0', '11', '5', '21', '6', '31', '0', '70', '169',
  '100', 'AcDbRadialDimensionLarge', '13', '1', '23', '1', '33', '0', '14', '2', '24', '2', '34', '0', '15', String(chord), '25', String(chord), '35', '0', '40', angle,
];

const dim = (doc: CadDocument, h: string) => doc.entityIndex.get(h) as DimensionEntity;
const pts = (d: DimensionEntity) => ({ c: d.defPoint, o: d.defPoint2, j: d.defPoint3, ch: d.defPoint4 });

/** DXF 출력에서 AcDbRadialDimensionLarge 하위 클래스 태그(다음 레코드 앞까지 — CLASSES 구역의 클래스 이름은 건너뛴다) */
const largeSub = (out: Uint8Array): string => {
  const t = new TextDecoder().decode(out);
  const i = t.search(/\r\n *100\r\nAcDbRadialDimensionLarge\r\n/);
  const rest = t.slice(i);
  const m = /\r\n *0\r\n(?=[A-Z])/.exec(rest);
  return m ? rest.slice(0, m.index) : rest;
};

describe('DWG에서 연 꺾기 반지름 치수의 꺾기 각도(158차)', () => {
  const doc = readDxf(dxf([JOG('58F', '*D2', 3, '0.785'), JOG('590', '*D3', 4, '1.2')]));

  it('DXF에서 연 치수를 DWG로 쓰고 다시 열면 꺾기 각도(40)가 남는다', () => {
    expect(dim(doc, '58F').leaderLength).toBe(0.785);
    expect(dim(doc, '590').leaderLength).toBe(1.2);
    for (const version of ['AC1018', 'AC1024', 'AC1027', 'AC1032'] as Ver[]) {
      const back = readDwg(writeDwg(doc, { version }).data);
      // 전에는 DWG 리더가 BD를 버려 0이었다
      expect(dim(back, '58F').leaderLength, version).toBe(0.785);
      expect(dim(back, '590').leaderLength, version).toBe(1.2);
      expect(dim(back, '58F').subtype, version).toBe('LARGE_RADIAL_DIMENSION');
      expect(pts(dim(back, '58F')), version).toEqual(pts(dim(doc, '58F')));
      expect(pts(dim(back, '590')), version).toEqual(pts(dim(doc, '590')));
    }
  });

  it('DWG R2018에서 연 그 치수를 DXF·다른 판 DWG로 다시 저장해도 꺾기 각도가 같다', () => {
    const d18 = readDwg(writeDwg(doc, { version: 'AC1032' }).data);
    for (const version of ['AC1018', 'AC1032'] as Ver[]) {
      const out = writeDxf(d18, { version }).data;
      // 전에는 40에 0을 썼다
      expect(largeSub(out), version).toMatch(/\r\n *40\r\n0\.785$/);
      const re = readDxf(out);
      expect(dim(re, '58F').leaderLength, version).toBeCloseTo(0.785, 12);
      expect(dim(re, '590').leaderLength, version).toBeCloseTo(1.2, 12);
    }
    for (const version of ['AC1018', 'AC1024'] as Ver[]) {
      const back = readDwg(writeDwg(d18, { version }).data);
      expect(dim(back, '58F').leaderLength, version).toBe(0.785);
      expect(dim(back, '590').leaderLength, version).toBe(1.2);
    }
  });

  it('이 앱이 만든 꺾기 반지름 치수(꺾기 각도 칸 0)는 DWG를 거친 DXF 태그가 바로 쓴 DXF와 같다(전후 같음)', () => {
    const app = createNewDocument('metric');
    const P = (x: number, y: number) => ({ x, y, z: 0 });
    const d = createJoggedDimension(app, P(0, -100), 100, P(70, -100), P(20, -115), P(45, -100));
    d.handle = 'A1';
    d.block = '*D1';
    app.blocks.get(MODEL_SPACE)!.entities.push(d);
    app.entityIndex.set(d.handle, d);
    expect(d.leaderLength).toBe(0);
    const direct = largeSub(writeDxf(app, { version: 'AC1032' }).data);
    expect(direct).toMatch(/\r\n *40\r\n/);
    for (const version of ['AC1024', 'AC1027', 'AC1032'] as Ver[]) {
      const back = readDwg(writeDwg(app, { version }).data);
      expect(dim(back, 'A1').leaderLength, version).toBe(0);
      expect(pts(dim(back, 'A1')), version).toEqual(pts(d));
      expect(largeSub(writeDxf(back, { version: 'AC1032' }).data), version).toBe(direct);
    }
  });
});
