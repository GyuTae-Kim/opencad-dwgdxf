/**
 * 저장할 때 빠지는 것:
 * - 쓰기 경고 → 확인받을 손실 목록(2D에 보이지 않는 재질·비주얼 스타일 같은 객체는 묻지 않는다)
 * - AutoCAD R2007 도면을 R2004로 쓰면 ACIS·동적 블록 객체가 빠진다는 것을 목록이 보인다
 * - R2013+ 자료 저장소(ACIS 형상)는 같은 버전으로 쓰면 그대로 남는다
 * - DXF의 OLE2FRAME은 원본 태그(OLE 자료)를 지키고, 옮긴 모서리는 새 자리로 쓴다
 * - 원본 자료로 쓸 수 없는 사용자 객체(프록시)는 빼는 대신 그 그림을 보통 도형으로 남긴다(DXF·다른 버전 DWG)
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CadDocument, Entity, Ole2FrameEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readR2004Container } from '../../src/io/dwg/container/r2004';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { saveLosses, saveLossLines } from '../../src/app/saveloss';
import { FIXTURES } from '../oracle/ezdxf';

const has = (p: string) => existsSync(join(FIXTURES, p));
const read = (p: string) => readDwg(new Uint8Array(readFileSync(join(FIXTURES, p))));
const types = (doc: CadDocument) => {
  const m = new Map<string, number>();
  for (const b of doc.blocks.values()) for (const e of b.entities) m.set(e.type === 'UNKNOWN' ? `UNKNOWN:${e.originalType}` : e.type, (m.get(e.type === 'UNKNOWN' ? `UNKNOWN:${e.originalType}` : e.type) ?? 0) + 1);
  return m;
};

describe('손실 목록', () => {
  it('도형 손실·바뀜은 보이고, 재질·비주얼 스타일만 빠지면 묻지 않는다', () => {
    expect(saveLosses([{ code: 'dwg.write_object_dropped', message: 'x', count: 1, detail: { types: { MATERIAL: 3, VISUALSTYLE: 16 } } }])).toEqual([]);
    const l = saveLosses([
      { code: 'dwg.write_entity_dropped', message: '이 버전으로 쓸 수 없는 도형 3개를 뺐습니다(원본 자료가 없거나 다른 버전).', count: 1, detail: { types: { '3DSOLID': 2, REGION: 1 } } },
      { code: 'dwg.write_object_dropped', message: 'o', count: 1, detail: { types: { MATERIAL: 3, BLOCKXYPARAMETER: 2 } } },
      { code: 'entity.mleader_exploded', message: 'm', count: 4 },
      { code: 'object.orphan_dropped', message: 'orphan', count: 10 },
      { code: 'dwg.write_version', message: 'v', count: 1 },
    ]);
    expect(l.map((x) => [x.count, x.types, x.converted])).toEqual([
      [3, ['3DSOLID', 'REGION'], false],
      [2, ['BLOCKXYPARAMETER'], false],
      [4, [], true],
    ]);
    expect(saveLossLines(l)[0]).toBe('이 버전으로 쓸 수 없는 도형 3개를 뺐습니다(원본 자료가 없거나 다른 버전). (3): 3DSOLID, REGION');
  });

  it('DXF 쓰기 경고: 조용히 넘기는 종류(재질 등)는 개수에도 넣지 않는다', () => {
    const l = saveLosses([{ code: 'object.no_data', message: 'n', count: 30, detail: { items: ['MATERIAL', 'VISUALSTYLE', 'CELLSTYLEMAP'], types: { MATERIAL: 3, VISUALSTYLE: 24, CELLSTYLEMAP: 3 } } }]);
    expect(l.map((x) => [x.count, x.types])).toEqual([[3, ['CELLSTYLEMAP']]]);
    // 종류별 개수가 없으면 보이는 종류 수만
    expect(saveLosses([{ code: 'object.no_data', message: 'n', count: 30, detail: { items: ['MATERIAL', 'CELLSTYLEMAP'] } }]).map((x) => x.count)).toEqual([1]);
    // DXF 도형 손실은 경고 수(count)
    expect(saveLosses([{ code: 'entity.acis_dropped', message: 'a', count: 5, detail: { items: ['3DSOLID'], types: { '3DSOLID': 5 } } }]).map((x) => x.count)).toEqual([5]);
  });

  it.skipIf(!has('accore/made/E4_xref_units_mm_host.r2000.dwg'))('R2000 DWG를 DXF로: 손실 수는 보이는 종류(CELLSTYLEMAP)만 센다', () => {
    const doc = read('accore/made/E4_xref_units_mm_host.r2000.dwg');
    const out = writeDxf(doc, { version: 'AC1032' });
    const w = out.warnings.find((x) => x.code === 'object.no_data')!;
    const tally = (w.detail as { types: Record<string, number> }).types;
    const l = saveLosses(out.warnings).find((x) => x.message === w.message)!;
    expect(l.types).toEqual(['CELLSTYLEMAP']);
    expect(l.count).toBe(tally.CELLSTYLEMAP);
    expect(l.count).toBeLessThan(w.count!);
  });
});

describe.skipIf(!has('samples/sample_AC1021.dwg'))('AutoCAD 도면을 저장할 때', () => {
  it('R2007 도면을 R2004로: ACIS 손실이 목록에 있다', () => {
    const l = saveLosses(writeDwg(read('samples/sample_AC1021.dwg'), { version: 'AC1021' }).warnings);
    expect(l.flatMap((x) => x.types)).toEqual(expect.arrayContaining(['3DSOLID', 'REGION']));
  });
  it.skipIf(!has('all-samples/Structural - Imperial.dwg'))('동적 블록 객체가 빠지면 목록에 있다', () => {
    const l = saveLosses(writeDwg(read('all-samples/Structural - Imperial.dwg'), { version: 'AC1018' }).warnings);
    expect(l.flatMap((x) => x.types)).toEqual(expect.arrayContaining(['BLOCKXYPARAMETER', 'ACAD_EVALUATION_GRAPH']));
  });
  for (const v of ['AC1027', 'AC1032'] as const) {
    it.skipIf(!has(`samples/sample_${v}.dwg`))(`${v} 같은 버전: 자료 저장소(AcDsPrototype_1b)가 그대로 남고 손실이 없다`, () => {
      const src = new Uint8Array(readFileSync(join(FIXTURES, `samples/sample_${v}.dwg`)));
      const before = readR2004Container(src, Number(v.slice(2))).dataStore;
      expect(before?.data.length).toBeGreaterThan(0);
      const out = writeDwg(readDwg(src), { version: v });
      expect(saveLosses(out.warnings)).toEqual([]);
      const after = readR2004Container(out.data, Number(v.slice(2))).dataStore;
      expect(after?.data).toEqual(before!.data);
      // 다른 버전이면 쓰지 않는다고 알린다
      const other = writeDwg(readDwg(src), { version: v === 'AC1027' ? 'AC1032' : 'AC1027' });
      expect(other.warnings.map((w) => w.code)).toContain('dwg.write_datastore_dropped');
    });
  }
});

describe('DXF OLE2FRAME', () => {
  const dxf = (ole: string) =>
    ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1018', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES', ole, '0', 'ENDSEC', '0', 'EOF', ''].join('\n');
  const OLE = ['0', 'OLE2FRAME', '5', '2A', '100', 'AcDbEntity', '8', '0', '100', 'AcDbOle2Frame', '70', '2', '3', 'Paintbrush Picture', '10', '1.0', '20', '2.0', '30', '0.0', '11', '11.0', '21', '-3.0', '31', '0.0', '71', '2', '72', '0', '90', '8', '310', '0102030405060708', '1', 'OLE'].join('\n');
  it('읽고 다시 쓰면 OLE 자료(310)가 남는다, 옮긴 모서리는 새 자리', () => {
    const doc = readDxf(new TextEncoder().encode(dxf(OLE)));
    const e = doc.blocks.get(MODEL_SPACE)!.entities[0] as Ole2FrameEntity;
    expect(e.type).toBe('OLE2FRAME');
    expect(e.upperLeft).toMatchObject({ x: 1, y: 2 });
    e.upperLeft = { x: 101, y: 2, z: 0 };
    e.lowerRight = { x: 111, y: -3, z: 0 };
    const out = writeDxf(doc, { version: 'AC1032' });
    expect(out.warnings.map((w) => w.code)).not.toContain('entity.ole_dropped');
    const back = readDxf(out.data).blocks.get(MODEL_SPACE)!.entities[0] as Ole2FrameEntity;
    expect(back.type).toBe('OLE2FRAME');
    expect(back.upperLeft).toMatchObject({ x: 101, y: 2 });
    expect(back.lowerRight).toMatchObject({ x: 111, y: -3 });
    expect(back.raw!.filter((t) => t.code === 310).map((t) => String(t.value))).toEqual(['0102030405060708']);
    // R12에는 OLE2FRAME이 없다
    expect(writeDxf(doc, { version: 'AC1009' }).warnings.map((w) => w.code)).toContain('entity.ole_dropped');
  });
});

/** 프록시 그림 묶음(ODA 명세 29장): 색 1, 꺾은선 (0,0)→(10,5), 원 (1,2) r3 */
function proxyGraphics(): Uint8Array {
  const chunks: { type: number; size: number; body: (dv: DataView, o: number) => void }[] = [
    { type: 14, size: 4, body: (dv, o) => dv.setInt32(o, 1, true) },
    {
      type: 6,
      size: 4 + 2 * 24,
      body: (dv, o) => {
        dv.setInt32(o, 2, true);
        [0, 0, 0, 10, 5, 0].forEach((v, i) => dv.setFloat64(o + 4 + i * 8, v, true));
      },
    },
    {
      type: 2,
      size: 24 + 8 + 24,
      body: (dv, o) => {
        [1, 2, 0].forEach((v, i) => dv.setFloat64(o + i * 8, v, true));
        dv.setFloat64(o + 24, 3, true);
        [0, 0, 1].forEach((v, i) => dv.setFloat64(o + 32 + i * 8, v, true));
      },
    },
  ];
  const total = 8 + chunks.reduce((a, c) => a + 8 + c.size, 0);
  const dv = new DataView(new ArrayBuffer(total));
  dv.setUint32(0, total, true);
  dv.setUint32(4, chunks.length, true);
  let p = 8;
  for (const c of chunks) {
    dv.setUint32(p, 8 + c.size, true);
    dv.setUint32(p + 4, c.type, true);
    c.body(dv, p + 8);
    p += 8 + c.size;
  }
  return new Uint8Array(dv.buffer);
}

describe('프록시 객체를 다른 형식·버전으로', () => {
  function docWithProxy(): CadDocument {
    const doc = createNewDocument('metric');
    doc.blocks.get(MODEL_SPACE)!.entities.push({ ...entityDefaults(), handle: '7A0', layer: '0', type: 'UNKNOWN', originalType: 'MYCUSTOM', graphics: proxyGraphics() } as Entity);
    return doc;
  }
  it('DXF: 원본 태그가 없는 사용자 객체는 그 그림(꺾은선·원)으로 남기고 바뀜으로 알린다', () => {
    const out = writeDxf(docWithProxy(), { version: 'AC1032' });
    expect(out.warnings.map((w) => w.code)).toContain('entity.proxy_as_geometry');
    expect(saveLosses(out.warnings).some((l) => l.converted)).toBe(true);
    const ms = readDxf(out.data).blocks.get(MODEL_SPACE)!.entities;
    expect(ms.map((e) => e.type).sort()).toEqual(['CIRCLE', 'LINE']);
    const c = ms.find((e) => e.type === 'CIRCLE') as Entity & { center: { x: number; y: number }; radius: number; color: { aci: number } };
    expect([c.center.x, c.center.y, c.radius, c.color.aci]).toEqual([1, 2, 3, 1]);
  });
  it('DWG(원본 본문 없음)도 같다', () => {
    const out = writeDwg(docWithProxy(), { version: 'AC1018' });
    expect(out.warnings.map((w) => w.code)).toContain('entity.proxy_as_geometry');
    expect(readDwg(out.data).blocks.get(MODEL_SPACE)!.entities.map((e) => e.type).sort()).toEqual(['CIRCLE', 'LINE']);
  });
  it.skipIf(!has('accore/made/E1_proxy_entities.r2018.dwg'))('그림이 없는 AutoCAD 프록시는 같은 버전이면 그대로, 다른 형식이면 손실 목록에', () => {
    const src = () => read('accore/made/E1_proxy_entities.r2018.dwg');
    expect(types(readDwg(writeDwg(src(), { version: 'AC1032' }).data)).get('UNKNOWN:ACAD_PROXY_ENTITY')).toBe(2);
    const l = saveLosses(writeDxf(src(), { version: 'AC1032' }).warnings);
    expect(l.flatMap((x) => x.types)).toContain('ACAD_PROXY_ENTITY');
  });
});
