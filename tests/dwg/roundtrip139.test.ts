/**
 * 새 판으로 쓸 때의 AutoCAD 왕복 확장 자료(139차): 이 앱은 R13·R14 DWG의 ACAD "RTLwPs"를 선가중치로, R2000 이하 "RTTcAl"을 트루컬러로
 * 읽어 제 칸에 둔다(137차). AutoCAD는 같은 도면을 R2004+ DWG나 DXF(어느 판이든)로 쓸 때 이 묶음을 남기지 않는데, 전에는 이 앱이
 * 그 묶음을 그대로 옮겨 써서 R2004+ DWG·DXF 출력의 확장 자료가 AutoCAD 새 판과 달랐다(R12 DXF에는 1071이 없어 RTTcAl이 1040으로 망가졌다).
 * 꼴은 AutoCAD가 같은 도면을 여러 판으로 쓴 공개 표본 짝에서 갈랐다. R2000 DWG 쓰기는 138차 그대로다.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CadDocument, Entity, LineEntity, XData, XDataItem } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { withoutRoundTripXData } from '../../src/io/dwg/xdata';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { FIXTURES } from '../oracle/ezdxf';

/** 읽은 꼴(1070 부호 있는 16비트, 1071 부호 있는 32비트) */
const tc = (word: number, rgbWord: number, name = '$$NoName$$'): XDataItem[] => [
  { code: 1000, value: 'RTTcAl' },
  { code: 1070, value: (word << 16) >> 16 },
  { code: 1071, value: rgbWord | 0 },
  { code: 1000, value: name },
];
const lwPs = (v: number): XDataItem[] => [
  { code: 1000, value: 'RTLwPs' },
  { code: 1070, value: v },
];
const dstyle: XDataItem[] = [
  { code: 1000, value: 'DSTYLE' },
  { code: 1002, value: '{' },
  { code: 1070, value: 40 },
  { code: 1040, value: 2 },
  { code: 1002, value: '}' },
];
const mtextGroup: XDataItem[] = [{ code: 1000, value: 'MTEXTBEGIN' }, { code: 1070, value: 73 }, { code: 1070, value: 1 }, { code: 1000, value: 'MTEXTEND' }];
const rtMaterial: XDataItem[] = [
  { code: 1000, value: 'RTMaterial' },
  { code: 1005, value: '97' },
];
const acadItems = (xd: XData[] | undefined) => xd?.find((x) => x.app === 'ACAD')?.items;
const isRt = (it: XDataItem) => it.code === 1000 && (it.value === 'RTLwPs' || it.value === 'RTTcAl');

describe('새 판 쓰기의 왕복 확장 자료(139차)', () => {
  it('RTLwPs·RTTcAl만 빼고 나머지 ACAD 묶음·다른 앱 자료는 차례 그대로', () => {
    // R14 표본 꼴: DSTYLE 뒤 RTLwPs·RTTcAl, 그 뒤 저장 때 만든 여러 줄 문자 묶음
    const read: XData[] = [
      { app: 'AVE_RENDER', items: [{ code: 1070, value: 1 }] },
      { app: 'ACAD', items: [...dstyle, ...lwPs(138), ...tc(0x8052, 0xc234c918), ...rtMaterial, ...mtextGroup] },
    ];
    expect(withoutRoundTripXData(read)).toEqual([read[0], { app: 'ACAD', items: [...dstyle, ...rtMaterial, ...mtextGroup] }]);
    // 색상표 이름(0x4000)·투명도 플래그(0x2000)가 있는 꼴
    expect(withoutRoundTripXData([{ app: 'ACAD', items: [...tc(0xc02a, 0xc2e29000, 'RAL CLASSIC$RAL 1006'), ...dstyle] }])).toEqual([{ app: 'ACAD', items: dstyle }]);
    expect(withoutRoundTripXData([{ app: 'ACAD', items: [...tc(0xa0b7, 0xc2803dc2), ...mtextGroup] }])).toEqual([{ app: 'ACAD', items: mtextGroup }]);
    // 이름 항목이 없는 RTTcAl(셋째 1000이 다른 묶음 이름이면 그 묶음은 남는다)
    expect(withoutRoundTripXData([{ app: 'ACAD', items: [...tc(0x8052, 0xc234c918).slice(0, 3), ...mtextGroup] }])).toEqual([{ app: 'ACAD', items: mtextGroup }]);
  });

  it('묶음만 있던 ACAD 자료는 통째로, 다른 앱이 없으면 확장 자료 없음', () => {
    expect(withoutRoundTripXData([{ app: 'ACAD', items: [...lwPs(158)] }])).toBeUndefined();
    expect(withoutRoundTripXData([{ app: 'ACAD', items: [...lwPs(128), ...tc(0x80c1, 0xc29b42ec)] }])).toBeUndefined();
    expect(withoutRoundTripXData([{ app: 'ACAD', items: lwPs(131) }, { app: 'MY_APP', items: [{ code: 1000, value: 'x' }] }])).toEqual([
      { app: 'MY_APP', items: [{ code: 1000, value: 'x' }] },
    ]);
  });

  it('꼴이 맞지 않는 묶음·RTMaterial·ACAD가 없는 자료는 받은 배열 그대로', () => {
    const odd: XData[] = [{ app: 'ACAD', items: [...lwPs(10), { code: 1000, value: 'RTTcAl' }, { code: 1070, value: 5 }, ...rtMaterial] }];
    expect(withoutRoundTripXData(odd)).toBe(odd);
    const other: XData[] = [{ app: 'MY_APP', items: lwPs(138) }];
    expect(withoutRoundTripXData(other)).toBe(other);
    expect(withoutRoundTripXData(undefined)).toBeUndefined();
  });

  /** R14에서 읽은 것 같은 선: 선가중치·트루컬러는 제 칸, ACAD 자료에 RT 묶음과 DSTYLE이 남아 있다 */
  function lineDoc(items: XDataItem[]): CadDocument {
    const doc = createNewDocument('metric');
    const xdata: XData[] = [{ app: 'ACAD', items }];
    const e = {
      ...entityDefaults(),
      type: 'LINE',
      handle: 'A1',
      layer: '0',
      color: { aci: 82, rgb: 0x34c918 },
      lineweight: 40,
      xdata,
      start: { x: 0, y: 0, z: 0 },
      end: { x: 1, y: 0, z: 0 },
    } as LineEntity;
    doc.blocks.get(MODEL_SPACE)!.entities.push(e as Entity);
    doc.entityIndex.set('A1', e as Entity);
    return doc;
  }

  it('R2004+ DWG·DXF로 쓰면 묶음 없이 제 칸, R2000 DWG는 전처럼 RTTcAl', () => {
    for (const version of ['AC1018', 'AC1024', 'AC1027', 'AC1032'] as const) {
      const only = readDwg(writeDwg(lineDoc([...lwPs(138), ...tc(0x8052, 0xc234c918)]), { version }).data).entityIndex.get('A1')!;
      expect(only.xdata, version).toBeUndefined();
      expect(only.lineweight, version).toBe(40);
      expect(only.color, version).toEqual({ aci: 82, rgb: 0x34c918 });
      const kept = readDwg(writeDwg(lineDoc([...lwPs(138), ...tc(0x8052, 0xc234c918), ...dstyle]), { version }).data).entityIndex.get('A1')!;
      expect(acadItems(kept.xdata), version).toEqual(dstyle);
    }
    for (const version of ['AC1009', 'AC1015', 'AC1018', 'AC1032'] as const) {
      const r = readDxf(writeDxf(lineDoc([...lwPs(138), ...tc(0x8052, 0xc234c918), ...dstyle]), { version }).data).entityIndex.get('A1')!;
      expect(acadItems(r.xdata), version).toEqual(dstyle);
    }
    // R2000: RTLwPs는 제 칸과 같아 빼고 RTTcAl은 남긴다(138차)
    const r2000 = readDwg(writeDwg(lineDoc([...lwPs(138), ...tc(0x8052, 0xc234c918)]), { version: 'AC1015' }).data).entityIndex.get('A1')!;
    expect(acadItems(r2000.xdata)).toEqual(tc(0x8052, 0xc234c918));
    expect(r2000.color).toEqual({ aci: 82, rgb: 0x34c918 });
  });

  const S = (v: string) => join(FIXTURES, 'samples', `sample_${v}.dwg`);
  const NEW = ['AC1018', 'AC1024', 'AC1027', 'AC1032'] as const;
  it.skipIf(![...NEW, 'AC1014', 'AC1015'].every((v) => existsSync(S(v))))('표본: AutoCAD R14·R2000 판을 R2004+로 쓰면 확장 자료가 AutoCAD 새 판과 같다', () => {
    const ents = (doc: CadDocument) => new Map([...doc.blocks.values()].flatMap((b) => b.entities.map((e) => [e.handle.toUpperCase(), e] as const)));
    const norm = (e: Entity | undefined) =>
      JSON.stringify((e?.xdata ?? []).map((x) => [x.app.toUpperCase(), x.items.map((it) => [it.code, typeof it.value === 'number' && it.code === 1070 ? it.value & 0xffff : it.value])]));
    // AutoCAD 새 판에도 남는 다름: 저장 때 만든 여러 줄 문자 묶음(MTEXT 2개 — AutoCAD 새 판에 없다), R2007+의 RTMaterial(재질 칸으로 옮긴다 — 이 앱은 하지 않는다)
    const expected: Record<string, Record<string, [number, number]>> = {
      AC1014: { AC1018: [87, 89], AC1024: [86, 89], AC1027: [86, 89], AC1032: [86, 89] },
      AC1015: { AC1018: [20, 22], AC1024: [20, 22], AC1027: [20, 22], AC1032: [20, 22] },
    };
    for (const sv of ['AC1014', 'AC1015'] as const) {
      const src = readDwg(new Uint8Array(readFileSync(S(sv))));
      const rt = [...ents(src)].filter(([, e]) => (acadItems(e.xdata) ?? []).some(isRt)).map(([h]) => h);
      for (const v of NEW) {
        const acad = ents(readDwg(new Uint8Array(readFileSync(S(v)))));
        const out = ents(readDwg(writeDwg(src, { version: v }).data));
        for (const e of out.values()) expect((acadItems(e.xdata) ?? []).some(isRt), `${sv}→${v} ${e.handle}`).toBe(false);
        const same = rt.filter((h) => norm(out.get(h)) === norm(acad.get(h))).length;
        expect([same, rt.length], `${sv}→${v}`).toEqual(expected[sv]![v]);
      }
      // DXF: 묶음만 빠지고 나머지 ACAD 항목은 원본 차례 그대로(R12는 1071 칸이 없어 비교하지 않는다)
      const srcEnts = ents(src);
      for (const v of ['AC1009', 'AC1015', 'AC1032'] as const) {
        const out = ents(readDxf(writeDxf(src, { version: v }).data));
        for (const h of rt) {
          const got = acadItems(out.get(h)?.xdata) ?? [];
          expect(got.some(isRt), `${sv}→dxf ${v} ${h}`).toBe(false);
          if (v !== 'AC1009') expect(got, `${sv}→dxf ${v} ${h}`).toEqual(acadItems(withoutRoundTripXData(srcEnts.get(h)!.xdata)) ?? []);
        }
      }
    }
  });
});
