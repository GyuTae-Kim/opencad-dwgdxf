/**
 * 실제 도면 훑기에서 찾은 DXF 쪽 빈틈(자료는 직접 만든 합성 DXF):
 * - 호 길이·꺾기 반지름 치수의 종류 값(70): AutoCAD는 5·9를 쓴다(R2018 DXF의 호 길이도 5). 모델은 & 7로 가리는 5·4로 둔다
 * - 쉐이프 파일을 찾지 못한 SHAPE: AutoCAD는 이름(2) 대신 번호(70)를 쓴다 — 읽고, 쓸 때도 번호로 남긴다
 */
import { describe, expect, it } from 'vitest';
import type { DimensionEntity, ShapeEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { readDwg, writeDwg } from '../../src/io/dwg';

const dxf = (ver: string, ents: string[][]) =>
  ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', ver, '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES', ...ents.flat(), '0', 'ENDSEC', '0', 'EOF', ''].join('\n');

const ARC = (dt: number) => ['0', 'ARC_DIMENSION', '5', '5BB', '100', 'AcDbEntity', '8', '0', '100', 'AcDbDimension', '2', '*D1', '10', '0', '20', '0', '30', '0', '11', '5', '21', '6', '31', '0', '70', String(dt), '100', 'AcDbArcDimension', '13', '10', '23', '0', '33', '0', '14', '0', '24', '10', '34', '0', '15', '0', '25', '0', '35', '0', '40', '0', '41', '1.5707963', '70', '0', '71', '0'];
const JOG = (dt: number) => ['0', 'LARGE_RADIAL_DIMENSION', '5', '58F', '100', 'AcDbEntity', '8', '0', '100', 'AcDbDimension', '2', '*D2', '10', '0', '20', '0', '30', '0', '11', '5', '21', '6', '31', '0', '70', String(dt), '100', 'AcDbRadialDimensionLarge', '13', '1', '23', '1', '33', '0', '14', '2', '24', '2', '34', '0', '15', '3', '25', '3', '35', '0', '40', '0.785'];

describe('호 길이·꺾기 반지름 치수의 종류 값', () => {
  it('읽으면 모델 값(5·4), 쓰면 AutoCAD 값(5·9) — 다른 프로그램의 R2018 호 길이 8도 받는다', () => {
    for (const [arc, jog] of [
      [37, 169],
      [40, 169],
      [165, 137],
    ]) {
      const doc = readDxf(new TextEncoder().encode(dxf('AC1032', [ARC(arc!), JOG(jog!)])));
      const a = doc.entityIndex.get('5BB') as DimensionEntity;
      const j = doc.entityIndex.get('58F') as DimensionEntity;
      expect(a.subtype).toBe('ARC_DIMENSION');
      expect(a.dimType & 7).toBe(5);
      expect(a.dimType & ~0x0f).toBe(arc! & ~0x0f);
      expect(j.subtype).toBe('LARGE_RADIAL_DIMENSION');
      expect(j.dimType & 7).toBe(4);
      expect(j.dimType & ~0x0f).toBe(jog! & ~0x0f);
      for (const v of ['AC1018', 'AC1024', 'AC1032'] as const) {
        const text = new TextDecoder().decode(writeDxf(doc, { version: v }).data).replace(/\r/g, '');
        const typeOf = (name: string) => {
          // 도형 레코드(0 코드) — CLASSES 구역의 클래스 이름은 건너뛴다
          const i = text.search(new RegExp(`\\n *0\\n${name}\\n`));
          const sub = text.indexOf('AcDbDimension', i);
          const m = /\n *70\n *(\d+)\n/.exec(text.slice(sub));
          return Number(m![1]);
        };
        expect(typeOf('ARC_DIMENSION') & 0x0f).toBe(5);
        expect(typeOf('LARGE_RADIAL_DIMENSION') & 0x0f).toBe(9);
        const back = readDxf(writeDxf(doc, { version: v }).data);
        expect((back.entityIndex.get('5BB') as DimensionEntity).dimType).toBe(a.dimType);
        expect((back.entityIndex.get('58F') as DimensionEntity).dimType).toBe(j.dimType);
      }
    }
  });
});

describe('쉐이프 번호만 있는 SHAPE', () => {
  const SHAPE = ['0', 'SHAPE', '5', '889', '100', 'AcDbEntity', '8', '0', '100', 'AcDbShape', '10', '15.0', '20', '-20.0', '30', '0.0', '40', '1.0', '70', '3'];
  it('DXF 70을 번호로 읽고, 다시 쓸 때 빼지 않고 70으로 쓴다', () => {
    const doc = readDxf(new TextEncoder().encode(dxf('AC1024', [SHAPE])));
    const s = doc.entityIndex.get('889') as ShapeEntity;
    expect(s).toMatchObject({ type: 'SHAPE', name: '', shapeNumber: 3, size: 1 });
    for (const v of ['AC1015', 'AC1032'] as const) {
      const out = writeDxf(doc, { version: v });
      expect(out.warnings.map((w) => w.code)).not.toContain('entity.shape_dropped');
      expect((readDxf(out.data).entityIndex.get('889') as ShapeEntity).shapeNumber).toBe(3);
    }
    // R12 DXF에는 번호 자리가 없다
    expect(writeDxf(doc, { version: 'AC1009' }).warnings.map((w) => w.code)).toContain('entity.shape_dropped');
  });

  it('DWG에서 읽은 SHAPE(번호만 있다)를 DXF로 쓸 때 남긴다', () => {
    const doc = createNewDocument('metric');
    doc.blocks.get(MODEL_SPACE)!.entities.push({ ...entityDefaults(), handle: '7A1', type: 'SHAPE', insert: { x: 1, y: 2, z: 0 }, size: 2, name: '', shapeNumber: 12, rotation: 0, widthFactor: 1, oblique: 0 } as ShapeEntity);
    const back = readDwg(writeDwg(doc, { version: 'AC1032' }).data);
    expect((back.entityIndex.get('7A1') as ShapeEntity).shapeNumber).toBe(12);
    const out = writeDxf(back, { version: 'AC1032' });
    expect(out.warnings.map((w) => w.code)).not.toContain('entity.shape_dropped');
    expect(readDxf(out.data).entityIndex.get('7A1')).toMatchObject({ type: 'SHAPE', shapeNumber: 12, size: 2 });
  });
});
