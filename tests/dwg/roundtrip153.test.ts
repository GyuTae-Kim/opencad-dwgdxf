/**
 * 명명된 뷰의 종이 공간 플래그(153차).
 * DXF 참조서 VIEW: 70(표준 플래그) 비트 1 "If set, this is a paper space view". 배치에서 VIEW·-VIEW로 저장한 뷰(app/viewcmds.ts — flags 1)를
 * DXF 쓰기는 70으로, DWG 쓰기는 VIEW 본문의 종이 공간 비트(보기 모드·렌더 모드·R2007+ 조명 칸 뒤의 B — VPORT와 같은 머리 뒤)로 쓰는데,
 * DXF 리더는 R2000+ 꼴(하위 클래스 표지 AcDbViewTableRecord 뒤의 70)을, DWG 리더는 비틀림 뒤를 읽지 않아 다시 열면 두 형식 모두 모형 뷰였다
 * (뷰 관리자가 「모형」으로 보이고 복원이 모형 공간으로 가서 종이 좌표로 확대했다). R12 DXF(하위 클래스 표지 없음)는 전에도 읽었다.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, ViewRecord } from '../../src/core/model';
import { tableKey } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';

/** 종이 공간 뷰(A4 용지)와 모형 뷰 */
const SHEET = { name: 'Sheet', flags: 1, center: { x: 105, y: 148.5 }, width: 210, height: 297, viewDirection: { x: 0, y: 0, z: 1 }, viewTarget: { x: 0, y: 0, z: 0 }, twist: 0 };
const PLAN = { name: 'Plan', flags: 0, center: { x: 5000, y: 2500 }, width: 12000, height: 8000, viewDirection: { x: 0, y: 0, z: 1 }, viewTarget: { x: 10, y: 20, z: 0 }, twist: 0 };

function docWithViews(): CadDocument {
  const doc = createNewDocument('metric');
  for (const v of [SHEET, PLAN]) doc.views.set(tableKey(v.name), { ...v, handle: '' } as ViewRecord);
  return doc;
}

const viewsOf = (doc: CadDocument) => [SHEET, PLAN].map((v) => doc.views.get(tableKey(v.name)));
const expected = () => [SHEET, PLAN].map((v) => expect.objectContaining({ ...v, handle: expect.any(String) }));

const DXF = ['AC1009', 'AC1015', 'AC1018', 'AC1021', 'AC1024', 'AC1027', 'AC1032'] as const;
const DWG = ['AC1015', 'AC1018', 'AC1024', 'AC1027', 'AC1032'] as const;

describe('명명된 뷰의 종이 공간 플래그(153차)', () => {
  it('DXF로 쓴 70 비트 1을 다시 읽는다(쓰기 꼴은 전과 같다)', () => {
    for (const version of DXF) {
      const out = writeDxf(docWithViews(), { version }).data;
      const text = new TextDecoder().decode(out);
      // 쓰기: 이름 바로 뒤 70(R2000+는 AcDbViewTableRecord 표지 뒤 — DXF 참조서 VIEW 차례)
      expect(text, version).toMatch(version === 'AC1009' ? /\r\nVIEW\r\n(?:.*\r\n)*?\s*2\r\nSheet\r\n\s*70\r\n\s*1\r\n/ : /AcDbViewTableRecord\r\n\s*2\r\nSheet\r\n\s*70\r\n\s*1\r\n/);
      expect(viewsOf(readDxf(out)), version).toEqual(expected());
    }
  });

  it('DWG로 쓴 종이 공간 비트를 다시 읽고 다른 칸은 그대로다', () => {
    for (const version of DWG) expect(viewsOf(readDwg(writeDwg(docWithViews(), { version }).data)), version).toEqual(expected());
  });

  it('DWG → DXF → DWG를 거쳐도 종이 공간 뷰로 남는다', () => {
    const d1 = readDwg(writeDwg(docWithViews(), { version: 'AC1032' }).data);
    const x = readDxf(writeDxf(d1, { version: 'AC1032' }).data);
    expect(viewsOf(x)).toEqual(expected());
    for (const version of ['AC1015', 'AC1032'] as const) expect(viewsOf(readDwg(writeDwg(x, { version }).data)), version).toEqual(expected());
  });
});
