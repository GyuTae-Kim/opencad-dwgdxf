/**
 * R2000 DWG로 쓸 때 앱에서 색을 바꾼 도형의 낡은 RTTcAl 빼기(151차).
 * R13~R2000 DWG를 읽을 때 꼴이 맞고 색 번호가 도형 ACI와 같은 RTTcAl은 트루컬러로 옮기고(137차), R2000으로 쓸 때는 트루컬러 도형에만 RTTcAl을 둔다
 * (138차 — AutoCAD R2000 판의 ACI 색 도형에는 없다). 다만 모델에 트루컬러가 없어도 색 번호가 같은 RTTcAl은 그대로 두어(DXF·R2004+ DWG로 옮겨진 옛 판 자료를 살리려고),
 * R2000 DWG에서 연 트루컬러 도형을 앱에서 그 번호의 ACI로 바꿔 R2000으로 저장하면 다시 열 때(이 앱·AutoCAD 모두) 바꾸기 전 트루컬러가 돌아왔다.
 * R13~R2000 DWG에서 읽은 문서는 그런 묶음을 읽을 때 이미 트루컬러로 옮겼으므로, 트루컬러가 없는 도형에 남은 것은 편집으로 낡은 자료다 — 뺀다.
 * 읽을 때 옮기지 않는 원본(DXF·R2004+ DWG·새 도면)은 전처럼 둔다.
 */
import { describe, expect, it } from 'vitest';
import type { CadColor, CadDocument, Entity, LineEntity, SourceFormat, XData, XDataItem } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { roundTripXDataForR2000 } from '../../src/io/dwg/xdata';

/** 읽은 꼴(1070 부호 있는 16비트, 1071 부호 있는 32비트) */
const tc = (word: number, rgbWord: number, name = '$$NoName$$'): XDataItem[] => [
  { code: 1000, value: 'RTTcAl' },
  { code: 1070, value: (word << 16) >> 16 },
  { code: 1071, value: rgbWord | 0 },
  { code: 1000, value: name },
];
const ent = (color: CadColor, type = 'LINE') => ({ type, color, lineweight: -1, transparency: -1 });
const acadItems = (xd: XData[] | undefined) => xd?.find((x) => x.app === 'ACAD')?.items;

function lineDoc(color: CadColor, xdata?: XData[]): CadDocument {
  const doc = createNewDocument('metric');
  const e = { ...entityDefaults(), type: 'LINE', handle: 'A1', layer: '0', color, xdata, start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 0, z: 0 } } as LineEntity;
  doc.blocks.get(MODEL_SPACE)!.entities.push(e as Entity);
  doc.entityIndex.set('A1', e as Entity);
  return doc;
}
/** 모형 공간의 그 도형(편집은 블록의 객체를 고친다) */
const line = (doc: CadDocument): Entity => doc.blocks.get(MODEL_SPACE)!.entities.find((e) => e.handle === 'A1')!;
const back = (doc: CadDocument, version: 'AC1015' | 'AC1018' = 'AC1015') => line(readDwg(writeDwg(doc, { version }).data));

describe('R2000 DWG 쓰기의 낡은 RTTcAl(151차)', () => {
  it('규칙: 읽을 때 RTTcAl을 옮기는 원본이면 트루컬러 없는 도형의 같은 번호 묶음을 빼고, 아니면 전처럼 둔다', () => {
    const tail: XDataItem[] = [{ code: 1000, value: 'MTEXTBEGIN' }, { code: 1070, value: 73 }, { code: 1000, value: 'MTEXTEND' }];
    const read: XData[] = [{ app: 'ACAD', items: [...tc(0xa097, 0xc250b3ff), ...tail] }];
    // 앱에서 ACI 151로 바꾼 도형: 묶음만 빼고 나머지 ACAD 자료는 차례 그대로, 남는 것이 없으면 ACAD 자료째
    expect(acadItems(roundTripXDataForR2000(read, ent({ aci: 151 }, 'MTEXT'), 151, true))).toEqual(tail);
    expect(roundTripXDataForR2000([{ app: 'ACAD', items: tc(0x80b7, 0xc2803dc2) }], ent({ aci: 183 }), 183, true)).toBeUndefined();
    // 트루컬러가 그대로인 도형(편집하지 않음)은 받은 배열 그대로
    expect(roundTripXDataForR2000(read, ent({ aci: 151, rgb: 0x50b3ff }, 'MTEXT'), 151, true)).toBe(read);
    // 트루컬러가 있는데 RTTcAl을 만들지 않는 PDF 언더레이(읽은 묶음은 그대로 — 값을 잃지 않게)
    const pdf: XData[] = [{ app: 'ACAD', items: tc(0x80c1, 0xc29b42ec) }];
    expect(roundTripXDataForR2000(pdf, ent({ aci: 193, rgb: 0x9b42ec }, 'PDFUNDERLAY'), 193, true)).toBe(pdf);
    // 읽을 때 옮기지 않는 원본(DXF·R2004+ DWG·새 도면): 전처럼 둔다
    expect(roundTripXDataForR2000(read, ent({ aci: 151 }, 'MTEXT'), 151, false)).toBe(read);
    expect(roundTripXDataForR2000(read, ent({ aci: 151 }, 'MTEXT'), 151)).toBe(read);
  });

  it('R2000 DWG에서 연 트루컬러 도형을 그 번호의 ACI로 바꿔 R2000으로 저장하면 다시 열어도 ACI', () => {
    const src = readDwg(writeDwg(lineDoc({ aci: 151, rgb: 0x50b3ff }), { version: 'AC1015' }).data);
    expect([src.format, src.version]).toEqual(['dwg', 'AC1015']);
    const e = line(src);
    expect(e.color).toEqual({ aci: 151, rgb: 0x50b3ff });
    expect(acadItems(e.xdata)).toEqual(tc(0x8097, 0xc250b3ff));
    // 편집하지 않고 다시 쓰면 그대로
    const same = back(src);
    expect(same.color).toEqual(e.color);
    expect(same.xdata).toEqual(e.xdata);
    // 앱에서 색을 ACI 151로 바꿈(편집 커널은 확장 자료를 그대로 둔다)
    e.color = { aci: 151 };
    const r = back(src);
    expect(r.color).toEqual({ aci: 151 });
    expect(r.xdata).toBeUndefined();
    // R2004+는 전에도 제 칸(묶음을 쓰지 않는다)
    const n = back(src, 'AC1018');
    expect(n.color).toEqual({ aci: 151 });
    expect(n.xdata).toBeUndefined();
    // 다른 번호·다른 트루컬러로 바꾼 도형은 전과 같다(낡은 묶음을 지우고, 트루컬러면 새로)
    e.color = { aci: 1 };
    expect(back(src).color).toEqual({ aci: 1 });
    e.color = { aci: 151, rgb: 0x50b3fe };
    expect(back(src).color).toEqual({ aci: 151, rgb: 0x50b3fe });
  });

  it('원본마다: R13~R2000 DWG는 빼고, 읽을 때 옮기지 않는 DXF·R2004+ DWG·새 도면·R12 DWG는 둔다(다시 열면 트루컬러)', () => {
    const cases: [SourceFormat, string, boolean][] = [
      ['dwg', 'AC1012', true],
      ['dwg', 'AC1014', true],
      ['dwg', 'AC1015', true],
      ['dwg', 'AC1009', false],
      ['dwg', 'AC1018', false],
      ['dwg', 'AC1032', false],
      ['dxf', 'AC1015', false],
      ['dxf', 'AC1009', false],
      ['new', 'AC1032', false],
    ];
    for (const [format, version, drop] of cases) {
      const doc = lineDoc({ aci: 151 }, [{ app: 'ACAD', items: tc(0x8097, 0xc250b3ff) }]);
      doc.format = format;
      doc.version = version;
      const r = back(doc);
      expect(r.color, `${format} ${version}`).toEqual(drop ? { aci: 151 } : { aci: 151, rgb: 0x50b3ff });
      expect(acadItems(r.xdata), `${format} ${version}`).toEqual(drop ? undefined : tc(0x8097, 0xc250b3ff));
    }
  });
});
