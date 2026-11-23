/**
 * DWG에서 연 다중 지시선 스타일(MLEADERSTYLE)의 모델 밖 칸(157차).
 * DXF 참조서 MLEADERSTYLE 그룹 코드는 296 "Is Annotative", 143 "Break Gap Size", 174·178 문자 왼쪽·오른쪽 부착, 46 "Align Space" 등을 적는다.
 * 모델에 칸이 없는 이 값들을 DXF 리더는 원본 태그로 지니고, DWG 쓰기는 그 원본 태그에서 읽어 쓴다. 그런데 DWG 리더는 같은 칸을 읽고 버리고(295 뒤는 읽지도 않고)
 * 원본 태그를 만들지 않아, DWG에서 연 스타일은 DXF·다른 판 DWG로 저장하면 기본값이 되고 앱 안에서도 주석 스타일(296)·끊기 간격(143)을 볼 수 없었다.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, MLeaderStyleObject, RawTag } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { mleaderStyleAnnotative } from '../../src/edit/annoscale/xdata';

type Ver = 'AC1024' | 'AC1027' | 'AC1032';

/** 모델 밖 칸(DXF 코드)과 기본값이 아닌 값 */
const CUSTOM: Record<number, number | string> = {
  171: 0,
  172: 1,
  90: 5,
  40: 15,
  41: 30,
  291: 0,
  300: 'NOTE',
  174: 3,
  178: 4,
  175: 2,
  176: 1,
  292: 1,
  297: 1,
  46: 7,
  47: 2,
  49: 3,
  140: 4,
  293: 0,
  141: 0.5,
  294: 0,
  177: 1,
  295: 1,
  296: 1,
  143: 2.5,
  271: 1,
  272: 10,
  273: 10,
};
const CODES = Object.keys(CUSTOM).map(Number);

const styleOf = (doc: CadDocument): MLeaderStyleObject => [...doc.objects.values()].find((o) => o.type === 'MLEADERSTYLE') as MLeaderStyleObject;
const tagOf = (raw: RawTag[] | undefined, code: number) => raw?.find((t) => t.code === code)?.value;
/** DXF 리더는 정수 코드 값을 글로 지니므로 수로 맞춰 견준다(300만 글) */
const project = (s: MLeaderStyleObject) =>
  Object.fromEntries(
    CODES.map((c) => {
      const v = tagOf(s.raw, c);
      return [c, v === undefined || c === 300 ? v : Number(v)];
    }),
  );
/** 원본 태그 차례(핸들 값은 빼고) */
const shape = (s: MLeaderStyleObject) => (s.raw ?? []).map((t) => (t.code >= 340 && t.code <= 343 ? [t.code] : [t.code, t.value]));

/** DXF에서 연 것처럼 원본 태그를 지닌 Standard 스타일의 모델 밖 칸을 기본값이 아닌 값으로 */
function customDoc(): CadDocument {
  const doc = readDxf(writeDxf(createNewDocument('metric'), { version: 'AC1032' }).data);
  const s = styleOf(doc);
  s.raw = s.raw!.map((t) => (t.code in CUSTOM ? { code: t.code, value: CUSTOM[t.code]! } : t));
  return doc;
}

describe('DWG에서 연 다중 지시선 스타일의 모델 밖 칸(157차)', () => {
  it('DWG로 쓴 모델 밖 칸을 DWG 리더가 원본 태그로 지니고 주석 스타일(296)로 본다', () => {
    for (const version of ['AC1024', 'AC1027', 'AC1032'] as Ver[]) {
      const back = readDwg(writeDwg(customDoc(), { version }).data);
      const s = styleOf(back);
      // 전에는 원본 태그가 없어 모두 undefined, 주석 아님
      expect(project(s), version).toEqual(CUSTOM);
      expect(mleaderStyleAnnotative(back, s.handle), version).toBe(true);
    }
  });

  it('DWG에서 연 스타일을 DXF·다른 판 DWG로 저장해도 값이 남는다', () => {
    const fromDwg = readDwg(writeDwg(customDoc(), { version: 'AC1032' }).data);
    // 전에는 DXF 쓰기가 모델 값과 기본값(296 0, 143 3.75, 174·178 1 …)으로 썼다
    expect(project(styleOf(readDxf(writeDxf(fromDwg, { version: 'AC1032' }).data)))).toEqual(CUSTOM);
    expect(project(styleOf(readDwg(writeDwg(fromDwg, { version: 'AC1024' }).data)))).toEqual(CUSTOM);
  });

  it('원본 태그 없는 새 도면 스타일: DWG를 거쳐 쓴 DXF가 바로 쓴 DXF와 같은 태그다(끊기 간격은 $MEASUREMENT를 따름)', () => {
    for (const units of ['metric', 'imperial'] as const) {
      for (const version of ['AC1024', 'AC1027', 'AC1032'] as Ver[]) {
        const doc = createNewDocument(units);
        const direct = styleOf(readDxf(writeDxf(doc, { version }).data));
        const viaDwg = styleOf(readDxf(writeDxf(readDwg(writeDwg(doc, { version }).data), { version }).data));
        expect(shape(viaDwg), `${units} ${version}`).toEqual(shape(direct));
        expect(tagOf(viaDwg.raw, 143), `${units} ${version}`).toBe(units === 'metric' ? 3.75 : 0.125);
      }
    }
  });
});
