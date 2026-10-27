/**
 * 다른 버전으로 저장할 때의 ACIS 객체(REGION·3DSOLID·BODY). 자료는 직접 만든 합성 SAT다.
 * - DWG R2000: SAT(판 7.0 이하 — DXF R2000~R2010 원본 태그나 DWG R2000 본문)를 AutoCAD R2000 파일과 같은 판 1 자료로 쓴다
 * - 그 밖의 버전(R2004+ DWG는 SAB·자료 저장소): 전에는 빠졌다 — 이제 DXF 쓰기처럼 모서리 선을 3D 폴리선으로 남긴다
 * - DXF R2013+ ACDSDATA: 지운 솔리드의 형상 레코드는 쓰지 않는다
 */
import { describe, expect, it } from 'vitest';
import type { AcisEntity, CadDocument, Entity, PolylineEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { satDxfTags, satWires } from '../../src/io/acis';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';

/** 사각형 영역(판 7.0, (10, 20)으로 옮기는 몸체 변환) */
const sat = (version: number) =>
  [
    `${version} 0 1 0`,
    '@4 test @12 ACIS 32.0 NT @24 Thu Oct 21 00:00:00 2026',
    '1 9.9999999999999995e-07 1e-10',
    'body $-1 -1 $-1 $1 $-1 $2 #',
    'lump $-1 -1 $-1 $-1 $-1 $0 #',
    'transform $-1 -1 1 0 0 0 1 0 0 0 1 10 20 0 1 no_rotate no_reflect no_shear #',
    'point $-1 -1 $-1 0 0 0 #',
    'point $-1 -1 $-1 4 0 0 #',
    'point $-1 -1 $-1 4 4 0 #',
    'point $-1 -1 $-1 0 4 0 #',
    'vertex $-1 -1 $-1 $-1 $3 #',
    'vertex $-1 -1 $-1 $-1 $4 #',
    'vertex $-1 -1 $-1 $-1 $5 #',
    'vertex $-1 -1 $-1 $-1 $6 #',
    'straight-curve $-1 -1 $-1 0 0 0 1 0 0 I I #',
    'edge $-1 -1 $-1 $7 0 $8 4 $-1 $11 forward @7 unknown #',
    'edge $-1 -1 $-1 $8 0 $9 4 $-1 $11 forward @7 unknown #',
    'edge $-1 -1 $-1 $9 0 $10 4 $-1 $11 forward @7 unknown #',
    'edge $-1 -1 $-1 $10 0 $7 4 $-1 $11 forward @7 unknown #',
    'End-of-ACIS-data',
  ].join('\n');

/** DXF R2000에서 읽은 것 같은 REGION(원본 태그에 SAT, 모서리 선) */
function regionDoc(version = 700): { doc: CadDocument; e: AcisEntity } {
  const doc = createNewDocument('metric');
  const text = sat(version);
  const e = { ...entityDefaults(), handle: '9A1', layer: '0', type: 'REGION', raw: satDxfTags(text, 'REGION', 1015), rawVersion: 'AC1015', wires: satWires(text) } as AcisEntity;
  doc.blocks.get(MODEL_SPACE)!.entities.push(e as Entity);
  return { doc, e };
}

describe('ACIS 객체를 다른 버전 DWG로', () => {
  it('R2000: DXF의 SAT를 ACIS 객체로 쓴다(판 1 자료) — 다시 읽으면 같은 SAT와 모서리 선', () => {
    const { doc, e } = regionDoc();
    const out = writeDwg(doc, { version: 'AC1015' });
    expect(out.warnings.map((w) => w.code)).not.toContain('dwg.write_entity_dropped');
    expect(out.warnings.map((w) => w.code)).not.toContain('entity.acis_as_wires');
    const back = readDwg(out.data);
    const r = back.entityIndex.get('9A1') as AcisEntity;
    expect(r.type).toBe('REGION');
    expect(r.sat?.trim()).toBe(sat(700).trim());
    expect(r.wires).toEqual(e.wires);
    expect(back.warnings).toEqual([]);
    // 다시 R2000 DXF로: 같은 SAT가 ACIS 객체로 남는다
    const dxf = readDxf(writeDxf(back, { version: 'AC1015' }).data);
    expect((dxf.entityIndex.get('9A1') as AcisEntity).wires).toEqual(e.wires);
  });

  it('R2000이 담지 않는 판(R2004+ SAT)은 와이어로', () => {
    const { doc } = regionDoc(21500);
    const out = writeDwg(doc, { version: 'AC1015' });
    expect(out.warnings.find((w) => w.code === 'entity.acis_as_wires')?.detail).toEqual({ types: { REGION: 1 } });
  });

  for (const v of ['AC1018', 'AC1024', 'AC1032'] as const) {
    it(`${v}: 쓸 수 없는 ACIS 객체는 빼지 않고 모서리 선을 3D 폴리선으로 남긴다(첫 선이 핸들을 잇는다)`, () => {
      const { doc, e } = regionDoc();
      e.layer = '0';
      e.color = { aci: 3 };
      const out = writeDwg(doc, { version: v });
      const codes = out.warnings.map((w) => w.code);
      expect(codes).not.toContain('dwg.write_entity_dropped');
      expect(out.warnings.find((w) => w.code === 'entity.acis_as_wires')?.detail).toEqual({ types: { REGION: 1 } });
      const back = readDwg(out.data);
      const polys = back.blocks.get(MODEL_SPACE)!.entities.filter((x): x is PolylineEntity => x.type === 'POLYLINE');
      expect(polys.length).toBe(4);
      expect(polys[0]!.handle).toBe('9A1');
      expect(polys.every((p) => p.kind === '3d' && p.color.aci === 3)).toBe(true);
      expect(polys.map((p) => p.vertices.map((q) => [q.location.x, q.location.y]))).toEqual(e.wires!.map((w) => w.map((q) => [q.x, q.y])));
      expect(back.warnings).toEqual([]);
    });
  }
});

describe('DXF R2013+ ACDSDATA', () => {
  const asm = (h: string) => ['0', 'ACDSRECORD', '90', '1', '2', 'AcDbDs::ID', '280', '10', '320', h, '2', 'ASM_Data', '280', '15', '94', '4', '310', '41434953'];
  const solid = (h: string) => ['0', '3DSOLID', '5', h, '330', '1F', '100', 'AcDbEntity', '8', '0', '100', 'AcDbModelerGeometry', '290', '1', '2', `{0000000${h}-0000-0000-0000-000000000000}`, '100', 'AcDb3dSolid', '350', '0'];
  const dxf = (solids: string[]) =>
    [
      ...['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1032', '0', 'ENDSEC'],
      ...['0', 'SECTION', '2', 'ENTITIES', ...solids.flatMap(solid), '0', 'ENDSEC'],
      ...['0', 'SECTION', '2', 'ACDSDATA', '70', '2', '71', '6'],
      ...['0', 'ACDSSCHEMA', '90', '1', '1', 'AcDb3DSolid_ASM_Data', '2', 'AcDbDs::ID', '280', '10', '91', '8', '2', 'ASM_Data', '280', '15', '91', '0'],
      ...['0', 'ACDSRECORD', '90', '0', '2', 'AcDbDs::ID', '280', '10', '320', '22', '2', 'Thumbnail_Data', '280', '15', '94', '2', '310', '0102'],
      ...asm('A1'),
      ...asm('A2'),
      ...['0', 'ENDSEC', '0', 'EOF', ''],
    ].join('\n');
  // 미리 보기 레코드의 핸들은 이 합성 문서에 없는 객체라 0으로 쓴다(종류만 본다)
  const records = (text: string) => [...text.replace(/\r/g, '').matchAll(/\n *320\n([0-9A-F]+)\n *2\n(ASM_Data|Thumbnail_Data)\n/g)].map((m) => (m[2] === 'ASM_Data' ? `${m[1]}:${m[2]}` : m[2]));

  it('솔리드를 지운 뒤 저장하면 그 형상 레코드가 남지 않는다(미리 보기 레코드는 그대로)', () => {
    const doc = readDxf(new TextEncoder().encode(dxf(['A1', 'A2'])));
    expect(records(new TextDecoder().decode(writeDxf(doc, { version: 'AC1032' }).data))).toEqual(['Thumbnail_Data', 'A1:ASM_Data', 'A2:ASM_Data']);
    const ms = doc.blocks.get(MODEL_SPACE)!;
    ms.entities = ms.entities.filter((e) => e.handle !== 'A2');
    doc.entityIndex.delete('A2');
    expect(records(new TextDecoder().decode(writeDxf(doc, { version: 'AC1032' }).data))).toEqual(['Thumbnail_Data', 'A1:ASM_Data']);
  });
});
