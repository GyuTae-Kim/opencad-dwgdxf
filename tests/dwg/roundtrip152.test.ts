/**
 * MTEXT 배경 채우기의 색상표 색 이름(152차).
 * DXF 쓰기는 R2004+에서 배경 색을 63(ACI)·421(RGB)·431(색 이름 — DXF 참조서 MTEXT 그룹 코드 "430-439 Background color (if color name)")로 쓰고
 * DWG는 배경 CMC에 색상표·이름을 담는데(읽기 cmcToCad·쓰기 wcolor), DXF 리더가 431을 읽지 않아 DXF로 저장하고 다시 열면 색상표 이름이 빠졌다
 * (그 문서를 DWG로 쓰면 AutoCAD에 색상표 색이 아니라 트루컬러로 간다).
 * 이름을 읽으면 R2000 저장 묶음(140차 — 배경 칸이 없는 판의 ACAD_MTEXT_BBRT)이 이름 있는 배경을 만들지 않아 DXF 원본 색상표 배경이 R2000 출력에서 사라지므로,
 * 색상표 배경도 표본 꼴(64 = 0xC2RRGGBB — 색상표 색도 CMC RGB 낱말이 같다, 65·66 빈칸)로 남긴다. 이름은 빠지고 RGB는 남는다.
 */
import { describe, expect, it } from 'vitest';
import type { CadColor, CadDocument, Entity, MTextEntity, XData, XDataItem } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { mtextSaveXDataForR2000 } from '../../src/io/dwg/xdata';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';

/** AutoCAD R2000 표본 꼴(140차 시험과 같다) */
const mtb = (): XDataItem[] => [
  { code: 1000, value: 'MTEXTBEGIN' },
  { code: 1070, value: 73 },
  { code: 1070, value: 1 },
  { code: 1070, value: 44 },
  { code: 1040, value: 1 },
  { code: 1070, value: 74 },
  { code: 1070, value: 0 },
  { code: 1000, value: 'MTEXTEND' },
];
const bbrt = (scale = 1.25, raw = 0xc2367542): XDataItem[] => [
  { code: 1000, value: 'ACAD_MTEXT_BBRT' },
  { code: 1070, value: 91 },
  { code: 1071, value: 1 },
  { code: 1070, value: 46 },
  { code: 1040, value: scale },
  { code: 1070, value: 64 },
  { code: 1071, value: raw | 0 },
  { code: 1070, value: 65 },
  { code: 1000, value: '' },
  { code: 1070, value: 66 },
  { code: 1000, value: '' },
  { code: 1070, value: 442 },
  { code: 1071, value: 0 },
  { code: 1000, value: 'ACAD_MTEXT_BERT' },
];
/** 색상표 색(AutoCAD R2004+가 이 RGB에 주는 ACI도 97 — 140차 표본 배경 색) */
const NAMED: CadColor = { aci: 97, rgb: 0x367542, name: 'RAL CLASSIC$RAL 6001' };
const PLAIN: CadColor = { aci: 97, rgb: 0x367542 };
const acadItems = (xd: XData[] | undefined) => xd?.find((x) => x.app === 'ACAD')?.items;

function mtext(handle: string, color: CadColor, xdata?: XData[]): MTextEntity {
  return {
    ...entityDefaults(),
    type: 'MTEXT',
    handle,
    layer: '0',
    insert: { x: 0, y: 0, z: 0 },
    height: 2.5,
    width: 0,
    attachment: 1,
    drawingDirection: 1,
    text: 'AB',
    style: 'Standard',
    rotation: 0,
    lineSpacingStyle: 1,
    lineSpacingFactor: 1,
    backgroundFlags: 1,
    backgroundScale: 1.25,
    backgroundColor: color,
    ...(xdata ? { xdata } : {}),
  } as MTextEntity;
}

function docOf(e: Entity): CadDocument {
  const doc = createNewDocument('metric');
  doc.blocks.get(MODEL_SPACE)!.entities.push(e);
  doc.entityIndex.set(e.handle, e);
  return doc;
}

const bgOf = (doc: CadDocument, h = 'A1') => {
  const m = doc.entityIndex.get(h) as MTextEntity;
  return [m.backgroundFlags, m.backgroundScale, m.backgroundColor];
};

describe('MTEXT 배경의 색상표 색 이름(152차)', () => {
  it('DXF R2004+로 쓴 431(색 이름)을 다시 읽는다', () => {
    for (const version of ['AC1018', 'AC1021', 'AC1024', 'AC1027', 'AC1032'] as const) {
      const out = writeDxf(docOf(mtext('A1', NAMED)), { version }).data;
      // 쓰기는 AutoCAD 꼴 그대로: 63 ACI, 421 RGB, 431 이름
      const text = new TextDecoder().decode(out);
      expect(text, version).toMatch(/\n 63\r\n97\r\n421\r\n3568962\r\n431\r\nRAL CLASSIC\$RAL 6001\r\n/);
      expect(bgOf(readDxf(out)), version).toEqual([1, 1.25, NAMED]);
    }
    // 이름 없는 트루컬러·ACI 배경은 전과 같다
    for (const c of [PLAIN, { aci: 5 }]) expect(bgOf(readDxf(writeDxf(docOf(mtext('A1', c)), { version: 'AC1032' }).data))).toEqual([1, 1.25, c]);
  });

  it('DWG → DXF → DWG를 거쳐도 색상표 이름이 남는다', () => {
    const d1 = readDwg(writeDwg(docOf(mtext('A1', NAMED)), { version: 'AC1032' }).data);
    expect(bgOf(d1)).toEqual([1, 1.25, NAMED]);
    const x = readDxf(writeDxf(d1, { version: 'AC1032' }).data);
    expect(bgOf(x)).toEqual([1, 1.25, NAMED]);
    for (const version of ['AC1018', 'AC1032'] as const) expect(bgOf(readDwg(writeDwg(x, { version }).data)), version).toEqual([1, 1.25, NAMED]);
  });

  it('R2000 DWG·DXF: 색상표 배경도 표본 꼴 BBRT로 남긴다(이름은 빠지고 RGB는 그대로)', () => {
    const r2000 = [(d: CadDocument) => readDwg(writeDwg(d, { version: 'AC1015' }).data), (d: CadDocument) => readDxf(writeDxf(d, { version: 'AC1015' }).data)];
    for (const [i, rd] of r2000.entries()) {
      // DWG·새 도면에서 온 색상표 배경: 전에는 BBRT를 만들지 않아 R2000 출력에서 배경을 통째로 잃었다
      const a = rd(docOf(mtext('A1', NAMED)));
      expect(acadItems(a.entityIndex.get('A1')!.xdata), `${i}`).toEqual([...mtb(), ...bbrt()]);
      expect(bgOf(a), `${i}`).toEqual([1, 1.25, PLAIN]);
      // DXF에서 연 색상표 배경(이제 이름을 읽는다)도 전처럼(이름을 잃던 때처럼) BBRT로 — 값을 잃지 않는다
      const fromDxf = readDxf(writeDxf(docOf(mtext('A1', NAMED)), { version: 'AC1032' }).data);
      const b = rd(fromDxf);
      expect(acadItems(b.entityIndex.get('A1')!.xdata), `${i} dxf`).toEqual([...mtb(), ...bbrt()]);
      expect(bgOf(b), `${i} dxf`).toEqual([1, 1.25, PLAIN]);
    }
  });

  it('R2000 원본의 BBRT는 같은 RGB의 색상표 색으로 바꿔도 그대로 둔다(RGB가 다르면 새로)', () => {
    const items = [...mtb(), ...bbrt()];
    const same: XData[] = [{ app: 'ACAD', items }];
    const fields = { lineSpacingStyle: 1, lineSpacingFactor: 1, backgroundFlags: 1, backgroundScale: 1.25 };
    expect(mtextSaveXDataForR2000(same, { ...fields, backgroundColor: NAMED })).toBe(same);
    expect(mtextSaveXDataForR2000(same, { ...fields, backgroundColor: PLAIN })).toBe(same);
    const other = mtextSaveXDataForR2000(same, { ...fields, backgroundColor: { aci: 1, rgb: 0xff0000, name: 'RAL CLASSIC$RAL 3020' } });
    expect(acadItems(other)).toEqual([...mtb(), ...bbrt(1.25, 0xc2ff0000)]);
  });
});
