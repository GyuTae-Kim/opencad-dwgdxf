/**
 * MPOLYGON의 70·71(155차).
 * DXF 참조서 HATCH 그룹 코드: 70은 "Solid fill flag …; for MPolygon, the version of MPolygon", 71은 "Associativity flag …; for MPolygon, solid-fill flag
 * (0 = lacks solid fill; 1 = has solid fill)"다. DXF 쓰기는 이 뜻대로 70 = 1(판)·71 = 채우기로 쓰는데, 리더가 MPOLYGON도 HATCH 뜻(70 채우기, 71 연관)으로 읽어
 * 70 = 1인 MPOLYGON은 모두 채우기가 되고 채우기 MPOLYGON은 연관이 됐다. 그래서 무늬 MPOLYGON을 DXF로 다시 쓰면 71 = 1이 되고 무늬(52·41·77·무늬 선)가 빠졌으며,
 * DWG(HATCH로 씀)에는 무늬 대신 채우기 해치로 갔다. 장면은 무늬 MPOLYGON을 채운 면으로 그렸다(이제 채우기 아닌 MPOLYGON의 테두리 — 그리기 규칙은 그대로).
 */
import { describe, expect, it } from 'vitest';
import { packBulge } from '../../src/core/lwpoly';
import type { CadDocument, Entity, HatchEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { buildSpace } from '../../src/render/build';
import { TextEngine } from '../../src/text/layout';
import { bytesOf, dxfText } from '../robust/corrupt35';

const LINE = { angle: Math.PI / 4, base: { x: 0, y: 0 }, offset: { x: -1.5, y: 1.5 }, dashes: [] as number[] };

function mpolygon(handle: string, solid: boolean): HatchEntity {
  return {
    ...entityDefaults(),
    type: 'MPOLYGON',
    handle,
    patternName: solid ? 'SOLID' : 'ANSI31',
    solid,
    associative: false,
    hatchStyle: 0,
    patternType: 1,
    patternAngle: solid ? 0 : Math.PI / 6,
    patternScale: solid ? 1 : 2,
    patternDouble: false,
    elevation: 0,
    paths: [{ flags: 2, polyline: { closed: true, verts: packBulge([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]) } }],
    patternLines: solid ? [] : [{ ...LINE }],
    pixelSize: 0,
    seedPoints: [],
  } as HatchEntity;
}

function docOf(...es: Entity[]): CadDocument {
  const doc = createNewDocument('metric');
  for (const e of es) {
    doc.blocks.get(MODEL_SPACE)!.entities.push(e);
    doc.entityIndex.set(e.handle, e);
  }
  return doc;
}

/** 무늬 A1·채우기 A2 */
const both = () => docOf(mpolygon('A1', false), mpolygon('A2', true));

/** 채우기·연관·무늬 이름·각도·축척·무늬 선 */
const fill = (doc: CadDocument, h: string) => {
  const e = doc.entityIndex.get(h) as HatchEntity;
  return {
    type: e.type,
    solid: e.solid,
    associative: e.associative,
    pattern: e.patternName,
    angle: Number(e.patternAngle.toFixed(9)),
    scale: e.patternScale,
    lines: e.patternLines.map((l) => [Number(l.angle.toFixed(9)), l.offset.x, l.offset.y]),
  };
};
const PATTERN = { solid: false, associative: false, pattern: 'ANSI31', angle: Number((Math.PI / 6).toFixed(9)), scale: 2, lines: [[Number((Math.PI / 4).toFixed(9)), -1.5, 1.5]] };
const SOLID = { solid: true, associative: false, pattern: 'SOLID', angle: 0, scale: 1, lines: [] };

const DXF = ['AC1015', 'AC1018', 'AC1021', 'AC1024', 'AC1027', 'AC1032'] as const;

/** DXF 참조서 차례로 손으로 쓴 MPOLYGON(63은 70과 71 사이) */
const handDxf = (solid: 0 | 1, color?: number): string[] => [
  '0', 'MPOLYGON', '5', '5A', '100', 'AcDbEntity', '8', '0', '100', 'AcDbMPolygon',
  '70', '1', '10', '0', '20', '0', '30', '0', '210', '0', '220', '0', '230', '1', '2', solid ? 'SOLID' : 'ANSI31',
  ...(color === undefined ? [] : ['63', String(color)]), '71', String(solid),
  '91', '1', '92', '2', '73', '1', '72', '0', '93', '4', '10', '0', '20', '0', '10', '10', '20', '0', '10', '10', '20', '10', '10', '0', '20', '10',
  '76', '1', ...(solid ? [] : ['52', '30', '41', '2', '77', '0']), '73', '0',
  ...(solid ? [] : ['78', '1', '53', '45', '43', '0', '44', '0', '45', '-1.5', '46', '1.5', '79', '0']),
  '11', '0', '21', '0', '99', '0',
];
const scene = (text: string) => buildSpace(readDxf(bytesOf(text)), MODEL_SPACE, { text: new TextEngine(null) });
const triFloats = (s: ReturnType<typeof scene>) => s.list.chunks.reduce((a, c) => a + new Float32Array(c.tris).length, 0);
const segCount = (s: ReturnType<typeof scene>) => s.list.chunks.reduce((a, c) => a + c.segCount, 0);

describe('MPOLYGON의 70(판)·71(채우기)(155차)', () => {
  it('DXF로 쓴 MPOLYGON의 71을 채우기로 다시 읽는다(쓰기 꼴은 전과 같음)', () => {
    for (const version of DXF) {
      const out = writeDxf(both(), { version }).data;
      const text = new TextDecoder().decode(out);
      // 쓰기: 하위 클래스 표지 바로 뒤 70 = 1(판), 무늬 이름 뒤 71 = 채우기(DXF 참조서 뜻)
      expect(text, version).toMatch(/AcDbMPolygon\r\n\s*70\r\n\s*1\r\n(?:.*\r\n)*?\s*2\r\nANSI31\r\n\s*71\r\n\s*0\r\n\s*91\r\n/);
      expect(text, version).toMatch(/AcDbMPolygon\r\n\s*70\r\n\s*1\r\n(?:.*\r\n)*?\s*2\r\nSOLID\r\n\s*71\r\n\s*1\r\n\s*91\r\n/);
      const back = readDxf(out);
      expect(fill(back, 'A1'), version).toEqual({ type: 'MPOLYGON', ...PATTERN });
      expect(fill(back, 'A2'), version).toEqual({ type: 'MPOLYGON', ...SOLID });
    }
  });

  it('무늬 MPOLYGON을 DXF로 다시 저장해도 무늬가 남고, DWG에는 무늬 해치로 간다', () => {
    const once = readDxf(writeDxf(both(), { version: 'AC1032' }).data);
    // 전에는 71 = 1로 쓰고 52·41·77·무늬 선을 뺐다
    const twice = writeDxf(once, { version: 'AC1032' }).data;
    expect(new TextDecoder().decode(twice)).toMatch(/\s*2\r\nANSI31\r\n\s*71\r\n\s*0\r\n(?:.*\r\n)*?\s*78\r\n\s*1\r\n\s*53\r\n/);
    expect(fill(readDxf(twice), 'A1')).toEqual({ type: 'MPOLYGON', ...PATTERN });
    for (const version of ['AC1015', 'AC1018', 'AC1032'] as const) {
      const dwg = readDwg(writeDwg(once, { version }).data);
      expect(fill(dwg, 'A1'), version).toEqual({ type: 'HATCH', ...PATTERN });
      expect(fill(dwg, 'A2'), version).toEqual({ type: 'HATCH', ...SOLID });
    }
  });

  it('DXF 참조서 차례로 쓴 MPOLYGON: 71이 채우기, 63(70과 71 사이)은 채우기 색, 장면은 무늬 MPOLYGON을 채우지 않는다', () => {
    const p = readDxf(bytesOf(dxfText([handDxf(0, 3)])));
    const e = [...p.entityIndex.values()].find((x) => x.type === 'MPOLYGON') as HatchEntity;
    expect([e.solid, e.associative, e.fillColor, e.patternLines.length]).toEqual([false, false, { aci: 3 }, 1]);
    const s = readDxf(bytesOf(dxfText([handDxf(1, 3)])));
    const f = [...s.entityIndex.values()].find((x) => x.type === 'MPOLYGON') as HatchEntity;
    // 전에는 71 = 1을 연관으로 읽었다
    expect([f.solid, f.associative, f.fillColor]).toEqual([true, false, { aci: 3 }]);
    // 장면: 채우기 색이 없는 무늬 MPOLYGON은 테두리만(전에는 70 = 1 때문에 채운 면), 채우기 MPOLYGON은 전처럼 채운다
    const pattern = scene(dxfText([handDxf(0)]));
    expect(triFloats(pattern)).toBe(0);
    expect(segCount(pattern)).toBeGreaterThanOrEqual(4);
    expect(triFloats(scene(dxfText([handDxf(1)])))).toBeGreaterThan(0);
  });
});
