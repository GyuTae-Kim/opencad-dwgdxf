/**
 * 235차: UCS 표 레코드의 고도(146). Autodesk DXF 참조서 UCS 표는 Y 축 방향(12) 뒤에 79(늘 0)·146(고도)을 적는다. DWG(R2000+)에서는 Y 축 BD3 바로 뒤의 BD다
 * (이 앱 쓰기가 그 자리에 BD 0·BS 0·BS 0을 쓴다 — 자료 셋 가운데 실수는 고도 하나. VIEW 연결 UCS·VPORT·VIEWPORT 도형의 UCS도 Y 축 뒤 고도 BD·직교 유형 BS 꼴).
 * 전에는 모델에 칸이 없어 DXF 리더가 읽지 않고 DWG 리더가 Y 축에서 멈췄으며 두 쓰기가 0을 상수로 써서, 고도를 둔 UCS를 이 앱으로 다시 저장하면 고도를 잃었다
 * (232차 「보고 두 것」 (4)). 이제 두 리더가 유한하고 0이 아닌 고도를 UCS 레코드에 두고 두 쓰기가 그 값을 쓴다(232·233차 꼴).
 * 0·없음·유한하지 않은 값·이 앱이 만든 UCS·새 도면은 전과 같다. R12 DXF UCS에는 146 칸이 없다(전과 같음).
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, UcsRecord } from '../../src/core/model';
import { tableKey } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';

const dec = (d: Uint8Array): string => new TextDecoder().decode(d);
const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

/** UCS 둘(이 앱 UCS 저장이 만든 것처럼 고도 칸 없음). Side는 기운 축 — 고도가 축·원점과 섞이지 않는지 본다 */
const PLAN = { name: 'Plan', flags: 0, origin: { x: 10, y: 20, z: 0 }, xAxis: { x: 1, y: 0, z: 0 }, yAxis: { x: 0, y: 1, z: 0 } };
const SIDE = { name: 'Side', flags: 0, origin: { x: 0, y: 0, z: 5 }, xAxis: { x: 0, y: 1, z: 0 }, yAxis: { x: 0, y: 0, z: 1 } };

function ucsDoc(extra: Partial<UcsRecord> = {}): CadDocument {
  const doc = createNewDocument('metric');
  doc.ucs.set(tableKey(PLAN.name), { ...PLAN, ...extra, handle: '' } as UcsRecord);
  doc.ucs.set(tableKey(SIDE.name), { ...SIDE, handle: '' } as UcsRecord);
  return doc;
}

const ucsOf = (doc: CadDocument, name: string) => doc.ucs.get(tableKey(name)) as (UcsRecord & { elevation?: unknown }) | undefined;
const elevOf = (doc: CadDocument, name = 'Plan'): unknown => ucsOf(doc, name)?.elevation;

type Tags = Record<number, number[]>;
const tags = (elev: number): Tags => ({ 79: [0], 146: [elev] });
const DEFAULT_TAGS = tags(0);
/** R12 DXF UCS에는 79·146이 없다 */
const R12_TAGS: Tags = { 79: [], 146: [] };

/** DXF 글의 UCS 레코드마다(이름) 79·146 값들. elev를 주면 Plan의 146 값을 바꾼 글도 돌려준다 */
function ucsTags(text: string, elev?: string): { map: Record<string, Tags>; text: string } {
  const lines = text.split('\r\n');
  const map: Record<string, Tags> = {};
  let inUcs = false;
  let name = '';
  let cur: Tags | null = null;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i]!.trim());
    if (code === 0) {
      inUcs = lines[i + 1]!.trim() === 'UCS';
      cur = null;
      continue;
    }
    if (inUcs && code === 2 && !cur) {
      name = lines[i + 1]!.trim();
      cur = map[name] = { 79: [], 146: [] };
    }
    if (!cur) continue;
    if (code === 146 && elev !== undefined && name === 'Plan') lines[i + 1] = elev;
    if (code === 79 || code === 146) cur[code]!.push(Number(lines[i + 1]));
  }
  return { map, text: lines.join('\r\n') };
}

/** AutoCAD가 Plan을 그 고도로 저장한 것처럼 146을 바꾼 R2018 DXF */
function autocadLike(elev: string): Uint8Array {
  const before = ucsTags(dec(writeDxf(ucsDoc(), { version: 'AC1032' }).data));
  // 시험 도면이 맞는지 — 두 UCS 모두 지금 쓰기 상수(79 0·146 0)
  expect(before.map).toEqual({ Plan: DEFAULT_TAGS, Side: DEFAULT_TAGS });
  return enc(ucsTags(before.text, elev).text);
}

/** 원점·축이 그대로인지 */
function expectAxes(doc: CadDocument, label: string): void {
  for (const want of [PLAN, SIDE]) {
    const u = ucsOf(doc, want.name);
    expect(u?.origin, `${label} ${want.name}`).toEqual(want.origin);
    expect(u?.xAxis, `${label} ${want.name}`).toEqual(want.xAxis);
    expect(u?.yAxis, `${label} ${want.name}`).toEqual(want.yAxis);
  }
}

describe('UCS 표 레코드의 고도 146(235차)', () => {
  it('DXF 리더가 146을 읽고, DXF(R2000·R2004·R2018)로 다시 쓰고 읽어도 같은 값이다 — R12에는 칸이 없다', () => {
    for (const [s, want] of [
      ['12.5', 12.5],
      ['-3.75', -3.75],
      ['1000', 1000],
    ] as const) {
      const src = readDxf(autocadLike(s));
      // 전에는 읽지 않아 undefined
      expect(elevOf(src), s).toBe(want);
      expect(elevOf(src, 'Side'), s).toBeUndefined();
      expectAxes(src, s);
      for (const version of ['AC1015', 'AC1018', 'AC1032'] as const) {
        const text = dec(writeDxf(src, { version }).data);
        // 전에는 146 0 상수. 79는 참조서대로 늘 0
        expect(ucsTags(text).map, `${s} ${version}`).toEqual({ Plan: tags(want), Side: DEFAULT_TAGS });
        const again = readDxf(enc(text));
        expect(elevOf(again), `${s} ${version}`).toBe(want);
        expectAxes(again, `${s} ${version}`);
      }
      // R12 DXF UCS는 79·146 칸이 없다(형식 한계 — 전과 같음)
      const r12 = dec(writeDxf(src, { version: 'AC1009' }).data);
      expect(ucsTags(r12).map, `${s} AC1009`).toEqual({ Plan: R12_TAGS, Side: R12_TAGS });
      expect(elevOf(readDxf(enc(r12))), `${s} AC1009`).toBeUndefined();
    }
  });

  it('DWG(R2000·R2004·R2010·R2018)로 쓰고 읽어도 같은 고도이고, 그 DWG를 다시 DXF로 써도 남는다', () => {
    for (const [s, want] of [
      ['12.5', 12.5],
      ['-3.75', -3.75],
    ] as const) {
      const src = readDxf(autocadLike(s));
      for (const version of ['AC1015', 'AC1018', 'AC1024', 'AC1032'] as const) {
        const back = readDwg(writeDwg(src, { version }).data);
        // 전에는 DWG 리더가 Y 축에서 멈추고 쓰기가 BD 0
        expect(elevOf(back), `${s} ${version}`).toBe(want);
        expect(elevOf(back, 'Side'), `${s} ${version}`).toBeUndefined();
        expectAxes(back, `${s} ${version}`);
        expect(ucsTags(dec(writeDxf(back, { version: 'AC1018' }).data)).map, `${s} ${version}`).toEqual({ Plan: tags(want), Side: DEFAULT_TAGS });
      }
    }
  });

  it('0·−0·유한하지 않은 값(1e999·−1e999)은 칸이 없고 전처럼 0으로 쓴다', () => {
    for (const s of ['0', '-0', '1e999', '-1e999']) {
      const src = readDxf(autocadLike(s));
      expect('elevation' in ucsOf(src, 'Plan')!, s).toBe(false);
      expect(ucsTags(dec(writeDxf(src, { version: 'AC1032' }).data)).map, s).toEqual({ Plan: DEFAULT_TAGS, Side: DEFAULT_TAGS });
      const back = readDwg(writeDwg(src, { version: 'AC1032' }).data);
      expect('elevation' in ucsOf(back, 'Plan')!, s).toBe(false);
    }
  });

  it('고도가 없는(만든) UCS·새 도면은 전과 같이 146 0이고 칸이 생기지 않으며, 모델의 유한하지 않은 값은 0으로 쓴다', () => {
    const doc = ucsDoc();
    for (const version of ['AC1015', 'AC1018', 'AC1032'] as const) {
      expect(ucsTags(dec(writeDxf(doc, { version }).data)).map, version).toEqual({ Plan: DEFAULT_TAGS, Side: DEFAULT_TAGS });
    }
    expect(ucsTags(dec(writeDxf(doc, { version: 'AC1009' }).data)).map).toEqual({ Plan: R12_TAGS, Side: R12_TAGS });
    for (const version of ['AC1015', 'AC1032'] as const) {
      // 0을 읽어도 칸이 생기지 않는다(만든 UCS와 다시 읽은 UCS의 모델이 같음)
      expect('elevation' in ucsOf(readDwg(writeDwg(doc, { version }).data), 'Plan')!, version).toBe(false);
      expect('elevation' in ucsOf(readDxf(writeDxf(doc, { version }).data), 'Plan')!, version).toBe(false);
    }
    // 모델에 유한하지 않은 값이 들어와도(코드가 만든 레코드) 쓰기는 0으로 쓴다
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const d = ucsDoc({ elevation: bad });
      expect(ucsTags(dec(writeDxf(d, { version: 'AC1032' }).data)).map, String(bad)).toEqual({ Plan: DEFAULT_TAGS, Side: DEFAULT_TAGS });
      expect(elevOf(readDwg(writeDwg(d, { version: 'AC1032' }).data)), String(bad)).toBeUndefined();
    }
  });
});
