/**
 * 232차: 명명된 뷰의 렌더 모드(VIEW 281). Autodesk DXF 참조서 VIEW는 281을 렌더 모드(0 2D 최적화·1 와이어프레임·2 숨은선·3 평면 음영·4 고러드 음영·
 * 5 평면 음영 + 와이어프레임·6 고러드 음영 + 와이어프레임 — SHADEMODE와 같은 값)로 적고, DWG(R2000+)에서는 보기 모드 다음 RC다(153차가 종이 공간 비트를 읽으려고
 * 이 앱 리더가 이미 지나가는 자리). 전에는 모델에 칸이 없어 DXF 리더가 읽지 않고 DWG 리더가 RC를 읽고 버렸으며 두 쓰기가 0을 상수로 써서, 숨은선·음영으로 저장한 뷰를
 * 이 앱으로 다시 저장하면 2D 최적화가 됐다(221차 PLOTSETTINGS 76·228차 VIEWPORT 170과 같은 꼴 — VIEWPORT 도형의 281은 이미 읽고 쓴다).
 * 이제 두 리더가 1~6을 뷰 레코드에 두고 두 쓰기가 그 값을 쓴다. 0·범위 밖 값·값이 없는 뷰·R12 DXF(그 칸이 없는 판)는 전과 같다.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, ViewRecord } from '../../src/core/model';
import { tableKey } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';

const dec = (d: Uint8Array): string => new TextDecoder().decode(d);
const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

/** 모형 뷰 Front와 종이 공간 뷰 Sheet(153차 시험 꼴 — 이 앱 VIEW가 만든 뷰처럼 렌더 모드 칸 없음) */
const FRONT = { name: 'Front', flags: 0, center: { x: 50, y: 25 }, width: 100, height: 50, viewDirection: { x: 0, y: 0, z: 1 }, viewTarget: { x: 0, y: 0, z: 0 }, twist: 0 };
const SHEET = { name: 'Sheet', flags: 1, center: { x: 105, y: 148.5 }, width: 210, height: 297, viewDirection: { x: 0, y: 0, z: 1 }, viewTarget: { x: 0, y: 0, z: 0 }, twist: 0 };

function viewDoc(): CadDocument {
  const doc = createNewDocument('metric');
  for (const v of [FRONT, SHEET]) doc.views.set(tableKey(v.name), { ...v, handle: '' } as ViewRecord);
  return doc;
}

const viewOf = (doc: CadDocument, name: string) => doc.views.get(tableKey(name)) as (ViewRecord & { renderMode?: unknown }) | undefined;
const modeOf = (doc: CadDocument, name = 'Front'): unknown => viewOf(doc, name)?.renderMode;

/** DXF 글의 VIEW 레코드마다(이름) 281 값들. set을 주면 Front의 281을 그 값으로 바꾼 글도 돌려준다 */
function viewTags(text: string, set?: number): { map: Record<string, number[]>; text: string } {
  const lines = text.split('\r\n');
  const map: Record<string, number[]> = {};
  let inView = false;
  let name = '';
  let cur: number[] | null = null;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i]!.trim());
    const v = lines[i + 1]!;
    if (code === 0) {
      inView = v.trim() === 'VIEW';
      cur = null;
      continue;
    }
    if (inView && code === 2 && !cur) {
      name = v.trim();
      cur = map[name] = [];
    }
    if (cur && code === 281) {
      if (set !== undefined && name === 'Front') lines[i + 1] = String(set);
      cur.push(Number(lines[i + 1]));
    }
  }
  return { map, text: lines.join('\r\n') };
}

/** AutoCAD가 Front를 그 렌더 모드로 저장한 것처럼 281을 바꾼 R2018 DXF */
function autocadLike(mode: number): Uint8Array {
  const out = viewTags(dec(writeDxf(viewDoc(), { version: 'AC1032' }).data), mode);
  // 바꾼 자리가 Front의 281 하나이고 Sheet는 0인지 — 시험 도면이 맞는지
  expect(out.map).toEqual({ Front: [mode], Sheet: [0] });
  return enc(out.text);
}

describe('명명된 뷰의 렌더 모드 281(232차)', () => {
  it('DXF 리더가 281(1~6)을 읽고, DXF(R2000·R2004·R2018)로 다시 쓰고 읽어도 같은 값이다', () => {
    for (const mode of [1, 2, 3, 4, 5, 6]) {
      const src = readDxf(autocadLike(mode));
      // 전에는 읽지 않아 undefined
      expect(modeOf(src), `${mode}`).toBe(mode);
      expect(modeOf(src, 'Sheet'), `${mode}`).toBeUndefined();
      for (const version of ['AC1015', 'AC1018', 'AC1032'] as const) {
        const text = dec(writeDxf(src, { version }).data);
        // 전에는 0 상수
        expect(viewTags(text).map, `${mode} ${version}`).toEqual({ Front: [mode], Sheet: [0] });
        const back = readDxf(enc(text));
        expect(modeOf(back), `${mode} ${version}`).toBe(mode);
        expect(viewOf(back, 'Sheet')?.flags, `${mode} ${version}`).toBe(1);
      }
    }
  });

  it('DWG(R2000·R2004·R2010·R2018)로 쓰고 읽어도 같은 값이고, 그 DWG를 다시 DXF로 써도 남는다', () => {
    const src = readDxf(autocadLike(2));
    for (const version of ['AC1015', 'AC1018', 'AC1024', 'AC1032'] as const) {
      const back = readDwg(writeDwg(src, { version }).data);
      // 전에는 DWG 리더가 RC를 버리고 쓰기가 0
      expect(modeOf(back), version).toBe(2);
      expect(modeOf(back, 'Sheet'), version).toBeUndefined();
      // 같은 자리 뒤의 종이 공간 비트(153차)는 그대로 읽힌다
      expect(viewOf(back, 'Sheet')?.flags, version).toBe(1);
      expect(viewOf(back, 'Front')?.flags, version).toBe(0);
      expect(viewTags(dec(writeDxf(back, { version: 'AC1018' }).data)).map, version).toEqual({ Front: [2], Sheet: [0] });
    }
  });

  it('참조서 범위 밖 값(7·9·−1)은 칸을 두지 않고 전처럼 0으로 쓴다', () => {
    for (const mode of [7, 9, -1]) {
      const src = readDxf(autocadLike(mode));
      expect(modeOf(src), `${mode}`).toBeUndefined();
      expect(viewTags(dec(writeDxf(src, { version: 'AC1032' }).data)).map, `${mode}`).toEqual({ Front: [0], Sheet: [0] });
      const back = readDwg(writeDwg(src, { version: 'AC1032' }).data);
      expect(modeOf(back), `${mode}`).toBeUndefined();
      expect(viewTags(dec(writeDxf(back, { version: 'AC1032' }).data)).map, `${mode}`).toEqual({ Front: [0], Sheet: [0] });
    }
  });

  it('값이 없는(만든) 뷰·0은 전과 같이 281 0이고 칸이 생기지 않으며, R12(그 칸이 없는 판)에는 쓰지 않는다', () => {
    const doc = viewDoc();
    for (const version of ['AC1015', 'AC1018', 'AC1032'] as const) expect(viewTags(dec(writeDxf(doc, { version }).data)).map, version).toEqual({ Front: [0], Sheet: [0] });
    for (const version of ['AC1015', 'AC1032'] as const) {
      // 0을 읽어도 칸이 생기지 않는다(만든 뷰와 다시 읽은 뷰의 모델이 같음)
      expect('renderMode' in viewOf(readDwg(writeDwg(doc, { version }).data), 'Front')!, version).toBe(false);
      expect('renderMode' in viewOf(readDxf(writeDxf(doc, { version }).data), 'Front')!, version).toBe(false);
    }
    const src = readDxf(autocadLike(3));
    expect(viewTags(dec(writeDxf(src, { version: 'AC1009' }).data)).map).toEqual({ Front: [], Sheet: [] });
  });
});
