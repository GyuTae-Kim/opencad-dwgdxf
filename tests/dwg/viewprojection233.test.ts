/**
 * 233차: 명명된 뷰의 보기 모드·렌즈·앞뒤 자르기 묶음(VIEW 71·42·43·44). Autodesk DXF 참조서 VIEW는 42를 렌즈 길이, 43·44를 앞뒤 자르기 면(대상에서 떨어진 거리),
 * 71을 보기 모드(VIEWMODE 비트 — 1 원근·2 앞 자르기·4 뒤 자르기·8 UCS 따라감·16 앞 자르기 면이 눈에 있지 않음)로 적는다. DWG(R13+)에서는 비틀림 뒤 BD 셋과
 * 보기 모드 비트 넷(1·2·4·16의 반대 — 8은 자리 없음)이다(153차가 종이 공간 비트를 읽으려고 이 앱 리더가 이미 지나가는 자리).
 * 전에는 모델에 칸이 없어 DXF 리더가 읽지 않고 DWG 리더가 읽고 버렸으며 두 쓰기가 0·50·0·0을 상수로 써서, 원근·자르기 뷰를 이 앱으로 다시 저장하면 그 설정을 잃었다
 * (232차 렌더 모드 281과 같은 꼴 — 비트가 렌즈·자르기 면과 함께여야 뜻이 서서 묶음 하나로 둔다).
 * 이제 두 리더가 넷 가운데 하나라도 기본이 아니면 묶음을 뷰 레코드에 두고 두 쓰기가 그 값을 쓴다. 기본값·범위 밖 값·값이 없는 뷰·새 도면은 전과 같다.
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

/** 모형 뷰 Front와 종이 공간 뷰 Sheet(232차 시험 꼴 — 이 앱 VIEW가 만든 뷰처럼 묶음 칸 없음) */
const FRONT = { name: 'Front', flags: 0, center: { x: 50, y: 25 }, width: 100, height: 50, viewDirection: { x: 0, y: 0, z: 1 }, viewTarget: { x: 0, y: 0, z: 0 }, twist: 0 };
const SHEET = { name: 'Sheet', flags: 1, center: { x: 105, y: 148.5 }, width: 210, height: 297, viewDirection: { x: 0, y: 0, z: 1 }, viewTarget: { x: 0, y: 0, z: 0 }, twist: 0 };

function viewDoc(extra: Partial<ViewRecord> = {}): CadDocument {
  const doc = createNewDocument('metric');
  doc.views.set(tableKey(FRONT.name), { ...FRONT, ...extra, handle: '' } as ViewRecord);
  doc.views.set(tableKey(SHEET.name), { ...SHEET, handle: '' } as ViewRecord);
  return doc;
}

type Pj = { viewMode: number; lensLength: number; frontClip: number; backClip: number };
const viewOf = (doc: CadDocument, name: string) => doc.views.get(tableKey(name)) as (ViewRecord & { projection?: unknown; renderMode?: unknown }) | undefined;
const pjOf = (doc: CadDocument, name = 'Front'): unknown => viewOf(doc, name)?.projection;
const pj = (viewMode: number, lensLength: number, frontClip: number, backClip: number): Pj => ({ viewMode, lensLength, frontClip, backClip });

const CODES = [42, 43, 44, 71] as const;
type Code = (typeof CODES)[number] | 281;
/** 뷰 하나의 42·43·44·71 값들(코드마다 목록) */
const tags = (lens: number, front: number, back: number, mode: number) => ({ 42: [lens], 43: [front], 44: [back], 71: [mode] });
const DEFAULT_TAGS = tags(50, 0, 0, 0);

/** DXF 글의 VIEW 레코드마다(이름) 42·43·44·71 값들. set을 주면 Front의 그 코드 값을 바꾼 글도 돌려준다 */
function viewTags(text: string, set: Partial<Record<Code, string>> = {}): { map: Record<string, Record<number, number[]>>; text: string } {
  const lines = text.split('\r\n');
  const map: Record<string, Record<number, number[]>> = {};
  let inView = false;
  let name = '';
  let cur: Record<number, number[]> | null = null;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i]!.trim());
    if (code === 0) {
      inView = lines[i + 1]!.trim() === 'VIEW';
      cur = null;
      continue;
    }
    if (inView && code === 2 && !cur) {
      name = lines[i + 1]!.trim();
      cur = map[name] = { 42: [], 43: [], 44: [], 71: [] };
    }
    if (!cur) continue;
    const s = set[code as Code];
    if (s !== undefined && name === 'Front') lines[i + 1] = s;
    if ((CODES as readonly number[]).includes(code)) cur[code]!.push(Number(lines[i + 1]));
  }
  return { map, text: lines.join('\r\n') };
}

/** AutoCAD가 Front를 그 보기 모드·렌즈·자르기로 저장한 것처럼 값을 바꾼 R2018 DXF */
function autocadLike(set: Partial<Record<Code, string>>): Uint8Array {
  const before = viewTags(dec(writeDxf(viewDoc(), { version: 'AC1032' }).data));
  // 시험 도면이 맞는지 — 두 뷰 모두 지금 쓰기 상수(코드마다 하나)
  expect(before.map).toEqual({ Front: DEFAULT_TAGS, Sheet: DEFAULT_TAGS });
  return enc(viewTags(before.text, set).text);
}

describe('명명된 뷰의 보기 모드·렌즈·앞뒤 자르기 묶음(233차)', () => {
  it('DXF 리더가 71·42·43·44를 묶음으로 읽고, DXF(R12·R2000·R2004·R2018)로 다시 쓰고 읽어도 같은 값이다', () => {
    const cases: [Partial<Record<Code, string>>, Pj][] = [
      // 원근 + 앞뒤 자르기
      [{ 42: '35', 43: '12.5', 44: '-40', 71: '7' }, pj(7, 35, 12.5, -40)],
      // 앞 자르기 면이 눈에 있지 않음(16)까지
      [{ 43: '3.25', 71: '18' }, pj(18, 50, 3.25, 0)],
      // UCS 따라감(8)만 — DXF끼리는 남는다
      [{ 71: '8' }, pj(8, 50, 0, 0)],
      // 렌즈만
      [{ 42: '85.5' }, pj(0, 85.5, 0, 0)],
    ];
    for (const [set, want] of cases) {
      const src = readDxf(autocadLike(set));
      const k = JSON.stringify(set);
      // 전에는 읽지 않아 undefined
      expect(pjOf(src), k).toEqual(want);
      expect(pjOf(src, 'Sheet'), k).toBeUndefined();
      for (const version of ['AC1009', 'AC1015', 'AC1018', 'AC1032'] as const) {
        const text = dec(writeDxf(src, { version }).data);
        // 전에는 0·50·0·0 상수
        expect(viewTags(text).map, `${k} ${version}`).toEqual({ Front: tags(want.lensLength, want.frontClip, want.backClip, want.viewMode), Sheet: DEFAULT_TAGS });
        expect(pjOf(readDxf(enc(text))), `${k} ${version}`).toEqual(want);
      }
    }
  });

  it('DWG(R2000·R2004·R2010·R2018)로 쓰고 읽어도 같은 묶음이고, 그 DWG를 다시 DXF로 써도 남는다 — 71의 8만 DWG에서 잃는다(전과 같음)', () => {
    // 1·2·4·16 모두 + 렌더 모드(232차 — 같은 자리 바로 뒤 RC)
    const src = readDxf(autocadLike({ 42: '35', 43: '12.5', 44: '-40', 71: '23', 281: '3' }));
    for (const version of ['AC1015', 'AC1018', 'AC1024', 'AC1032'] as const) {
      const back = readDwg(writeDwg(src, { version }).data);
      // 전에는 DWG 리더가 버리고 쓰기가 0·50·0·0
      expect(pjOf(back), version).toEqual(pj(23, 35, 12.5, -40));
      expect(pjOf(back, 'Sheet'), version).toBeUndefined();
      // 같은 자리 뒤의 렌더 모드(232차)·종이 공간 비트(153차)는 그대로 읽힌다
      expect(viewOf(back, 'Front')?.renderMode, version).toBe(3);
      expect(viewOf(back, 'Sheet')?.flags, version).toBe(1);
      expect(viewOf(back, 'Front')?.flags, version).toBe(0);
      expect(viewTags(dec(writeDxf(back, { version: 'AC1018' }).data)).map, version).toEqual({ Front: tags(35, 12.5, -40, 23), Sheet: DEFAULT_TAGS });
    }
    // 8(UCS 따라감)은 DWG VIEW에 자리가 없다: 나머지 비트·값은 남고 8만 빠진다
    const ucsFollow = readDxf(autocadLike({ 42: '28', 71: '9' }));
    expect(pjOf(ucsFollow)).toEqual(pj(9, 28, 0, 0));
    const b9 = readDwg(writeDwg(ucsFollow, { version: 'AC1032' }).data);
    expect(pjOf(b9)).toEqual(pj(1, 28, 0, 0));
    // 8만 있던 뷰는 DWG를 거치면 기본이 되어 칸이 없다
    const only8 = readDwg(writeDwg(readDxf(autocadLike({ 71: '8' })), { version: 'AC1015' }).data);
    expect(pjOf(only8)).toBeUndefined();
    expect(viewTags(dec(writeDxf(only8, { version: 'AC1032' }).data)).map).toEqual({ Front: DEFAULT_TAGS, Sheet: DEFAULT_TAGS });
  });

  it('범위 밖 값(렌즈 0·음수, 보기 모드 32·−1, 넘치는 자르기 거리)은 그 칸만 기본으로 두고, 모두 기본이면 칸이 없다', () => {
    for (const set of [{ 42: '0' }, { 42: '-10' }, { 71: '32' }, { 71: '-1' }, { 43: '1e999' }, { 44: '-1e999' }] as Partial<Record<Code, string>>[]) {
      const k = JSON.stringify(set);
      const src = readDxf(autocadLike(set));
      expect(pjOf(src), k).toBeUndefined();
      expect(viewTags(dec(writeDxf(src, { version: 'AC1032' }).data)).map, k).toEqual({ Front: DEFAULT_TAGS, Sheet: DEFAULT_TAGS });
      const back = readDwg(writeDwg(src, { version: 'AC1032' }).data);
      expect(pjOf(back), k).toBeUndefined();
    }
    // 렌즈만 범위 밖이면 렌즈만 50, 나머지는 남는다
    const mixed = readDxf(autocadLike({ 42: '-10', 43: '5', 71: '2' }));
    expect(pjOf(mixed)).toEqual(pj(2, 50, 5, 0));
    expect(pjOf(readDwg(writeDwg(mixed, { version: 'AC1015' }).data))).toEqual(pj(2, 50, 5, 0));
  });

  it('값이 없는(만든) 뷰·기본값은 전과 같이 0·50·0·0이고 칸이 생기지 않으며, 모델의 범위 밖 값은 기본으로 쓴다', () => {
    const doc = viewDoc();
    for (const version of ['AC1009', 'AC1015', 'AC1018', 'AC1032'] as const) {
      expect(viewTags(dec(writeDxf(doc, { version }).data)).map, version).toEqual({ Front: DEFAULT_TAGS, Sheet: DEFAULT_TAGS });
    }
    for (const version of ['AC1015', 'AC1032'] as const) {
      // 기본값을 읽어도 칸이 생기지 않는다(만든 뷰와 다시 읽은 뷰의 모델이 같음)
      expect('projection' in viewOf(readDwg(writeDwg(doc, { version }).data), 'Front')!, version).toBe(false);
      expect('projection' in viewOf(readDxf(writeDxf(doc, { version }).data), 'Front')!, version).toBe(false);
    }
    // 모델에 범위 밖 값이 들어와도(코드가 만든 레코드) 쓰기는 칸마다 기본으로 쓴다
    const bad = viewDoc({ projection: { viewMode: 64, lensLength: Number.NaN, frontClip: Number.POSITIVE_INFINITY, backClip: Number.NEGATIVE_INFINITY } });
    expect(viewTags(dec(writeDxf(bad, { version: 'AC1032' }).data)).map).toEqual({ Front: DEFAULT_TAGS, Sheet: DEFAULT_TAGS });
    expect(pjOf(readDwg(writeDwg(bad, { version: 'AC1032' }).data))).toBeUndefined();
  });
});
