/**
 * 여러 줄 문자 저장 묶음(140차): AutoCAD는 MTEXT를 옛 판으로 저장할 때 그 판에 칸이 없는 값을 ACAD 확장 자료에 남긴다 —
 * MTEXTBEGIN(73 줄 간격 방식·44 줄 간격 배수·74 0)과 ACAD_MTEXT_BBRT(91 배경 플래그·46 배경 배율·64 배경 색·65·66 이름·442 0).
 * 전에는 R14 DWG의 줄 간격과 R2000 이하의 배경 채우기를 읽지 않아(기본값·없음) 배경 가림을 잃었고, 묶음을 R2004+ DWG·DXF에도 그대로 옮겨 써서
 * AutoCAD 새 판(묶음 없이 제 칸에)과 확장 자료가 달랐다. 꼴은 AutoCAD가 같은 도면을 여러 판으로 쓴 공개 표본 짝에서 갈랐다.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CadDocument, Entity, LineEntity, MTextEntity, XData, XDataItem } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { applyMTextSaveXData, mtextSaveXDataForR2000, withoutRoundTripXData } from '../../src/io/dwg/xdata';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { FIXTURES } from '../oracle/ezdxf';

/** AutoCAD 표본 꼴(R14·R2000 DWG, R2000 DXF) */
const mtb = (style = 1, factor = 1, x74 = 0): XDataItem[] => [
  { code: 1000, value: 'MTEXTBEGIN' },
  { code: 1070, value: 73 },
  { code: 1070, value: style },
  { code: 1070, value: 44 },
  { code: 1040, value: factor },
  { code: 1070, value: 74 },
  { code: 1070, value: x74 },
  { code: 1000, value: 'MTEXTEND' },
];
const bbrt = (flags = 1, scale = 1.25, raw = 0xc2367542, name = '', x442 = 0): XDataItem[] => [
  { code: 1000, value: 'ACAD_MTEXT_BBRT' },
  { code: 1070, value: 91 },
  { code: 1071, value: flags },
  { code: 1070, value: 46 },
  { code: 1040, value: scale },
  { code: 1070, value: 64 },
  { code: 1071, value: raw | 0 },
  { code: 1070, value: 65 },
  { code: 1000, value: name },
  { code: 1070, value: 66 },
  { code: 1000, value: '' },
  { code: 1070, value: 442 },
  { code: 1071, value: x442 },
  { code: 1000, value: 'ACAD_MTEXT_BERT' },
];
/** 정적 단 정보(AutoCAD R2004~R2013에도 남는 묶음) */
const info: XDataItem[] = [
  { code: 1000, value: 'ACAD_MTEXT_COLUMN_INFO_BEGIN' },
  { code: 1070, value: 75 },
  { code: 1070, value: 1 },
  { code: 1070, value: 79 },
  { code: 1070, value: 0 },
  { code: 1070, value: 76 },
  { code: 1070, value: 1 },
  { code: 1070, value: 78 },
  { code: 1070, value: 0 },
  { code: 1070, value: 48 },
  { code: 1040, value: 20 },
  { code: 1070, value: 49 },
  { code: 1040, value: 5 },
  { code: 1000, value: 'ACAD_MTEXT_COLUMN_INFO_END' },
];
/** 표본 배경 색(0x367542 — AutoCAD R2004+ 판의 ACI도 97) */
const BG = { aci: 97, rgb: 0x367542 };
const acadItems = (xd: XData[] | undefined) => xd?.find((x) => x.app === 'ACAD')?.items;

function mtext(handle: string, items: XDataItem[] | undefined, over: Partial<MTextEntity> = {}): MTextEntity {
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
    backgroundFlags: 0,
    backgroundScale: 1.5,
    ...(items ? { xdata: [{ app: 'ACAD', items }] } : {}),
    ...over,
  } as MTextEntity;
}

function docOf(...ents: Entity[]): CadDocument {
  const doc = createNewDocument('metric');
  for (const e of ents) {
    doc.blocks.get(MODEL_SPACE)!.entities.push(e);
    doc.entityIndex.set(e.handle, e);
  }
  return doc;
}

describe('여러 줄 문자 저장 묶음(140차)', () => {
  it('R14 이하의 줄 간격과 R2000 이하의 배경을 모델 칸으로(확장 자료는 그대로)', () => {
    const items = [...mtb(2, 1.5), ...bbrt()];
    const e = mtext('A1', items);
    applyMTextSaveXData(e, true, true);
    expect([e.lineSpacingStyle, e.lineSpacingFactor]).toEqual([2, 1.5]);
    expect([e.backgroundFlags, e.backgroundScale, e.backgroundColor]).toEqual([1, 1.25, BG]);
    expect(acadItems(e.xdata)).toEqual(items);
    // R2000: 줄 간격은 제 칸이 있어 묶음을 보지 않는다
    const r2000 = mtext('A2', items, { lineSpacingStyle: 1, lineSpacingFactor: 2 });
    applyMTextSaveXData(r2000, false, true);
    expect([r2000.lineSpacingStyle, r2000.lineSpacingFactor, r2000.backgroundFlags]).toEqual([1, 2, 1]);
    // 배경이 이미 있으면(다른 프로그램이 쓴 DXF의 90) 두지 않는다
    const has = mtext('A3', items, { backgroundFlags: 3, backgroundScale: 1.1 });
    applyMTextSaveXData(has, true, true);
    expect([has.backgroundFlags, has.backgroundScale, has.backgroundColor]).toEqual([3, 1.1, undefined]);
  });

  it('꼴이 맞지 않는 묶음은 읽지 않는다', () => {
    for (const items of [
      mtb(3, 1.5), // 방식 1·2 밖
      mtb(2, 0), // 배수 0
      mtb(2, 1.5).slice(0, -1), // 끝 이름 없음
      bbrt(4), // 플래그 1·2·16 밖
      [...bbrt().slice(0, 5), ...bbrt().slice(7)], // 배경 색(1)인데 64 없음
      [{ code: 1000, value: 'MTEXTBEGIN' }, { code: 1040, value: 73 }, { code: 1070, value: 2 }, { code: 1000, value: 'MTEXTEND' }] as XDataItem[],
    ]) {
      const e = mtext('B1', items);
      applyMTextSaveXData(e, true, true);
      expect([e.lineSpacingStyle, e.lineSpacingFactor, e.backgroundFlags, e.backgroundScale], JSON.stringify(items)).toEqual([1, 1, 0, 1.5]);
    }
  });

  it('R2004+ DWG·R2000이 아닌 DXF로 쓰면 묶음 없이 제 칸에(다른 ACAD 묶음은 차례 그대로)', () => {
    const vals = { lineSpacingStyle: 2, lineSpacingFactor: 1.5, backgroundFlags: 1, backgroundScale: 1.25, backgroundColor: BG };
    const doc = () => docOf(mtext('C1', [...mtb(2, 1.5), ...bbrt()], vals), mtext('C2', [...info, ...mtb(2, 1.5), ...bbrt()], vals));
    const check = (e: Entity | undefined, label: string) => {
      const m = e as MTextEntity;
      expect([m.lineSpacingStyle, m.lineSpacingFactor, m.backgroundFlags, m.backgroundScale, m.backgroundColor], label).toEqual([2, 1.5, 1, 1.25, BG]);
    };
    for (const version of ['AC1018', 'AC1024', 'AC1027'] as const) {
      const r = readDwg(writeDwg(doc(), { version }).data);
      expect(r.entityIndex.get('C1')!.xdata, version).toBeUndefined();
      expect(acadItems(r.entityIndex.get('C2')!.xdata), version).toEqual(info);
      check(r.entityIndex.get('C1'), version);
      check(r.entityIndex.get('C2'), version);
    }
    const r2018 = readDwg(writeDwg(docOf(mtext('C1', [...mtb(2, 1.5), ...bbrt()], vals)), { version: 'AC1032' }).data).entityIndex.get('C1');
    expect(r2018!.xdata).toBeUndefined();
    check(r2018, 'AC1032');
    for (const version of ['AC1018', 'AC1021', 'AC1032'] as const) {
      const r = readDxf(writeDxf(docOf(mtext('C1', [...mtb(2, 1.5), ...bbrt()], vals)), { version }).data).entityIndex.get('C1');
      expect(r!.xdata, version).toBeUndefined();
      check(r, `dxf ${version}`);
    }
  });

  it('모델에 없는 값이 든 묶음과 MTEXT가 아닌 도형의 묶음은 남긴다', () => {
    const odd = [...mtb(1, 1, 1), ...bbrt(1, 1.25, 0xc2367542, '', 5), ...bbrt(1, 1.25, 0xc2367542, 'RAL$1000').slice(0)];
    expect(withoutRoundTripXData([{ app: 'ACAD', items: odd }], true)).toEqual([{ app: 'ACAD', items: odd }]);
    const plain = [...mtb(), ...bbrt()];
    expect(withoutRoundTripXData([{ app: 'ACAD', items: plain }], false)).toEqual([{ app: 'ACAD', items: plain }]);
    expect(withoutRoundTripXData([{ app: 'ACAD', items: plain }], true)).toBeUndefined();
    const line = {
      ...entityDefaults(),
      type: 'LINE',
      handle: 'D1',
      layer: '0',
      xdata: [{ app: 'ACAD', items: plain }],
      start: { x: 0, y: 0, z: 0 },
      end: { x: 1, y: 0, z: 0 },
    } as LineEntity;
    expect(acadItems(readDwg(writeDwg(docOf(line as Entity), { version: 'AC1018' }).data).entityIndex.get('D1')!.xdata)).toEqual(plain);
  });

  it('R2000 DWG·DXF는 묶음을 남기고 다시 열어도 배경이 남는다(모델 배경과 다른 낡은 배경 묶음은 뺀다)', () => {
    const vals = { lineSpacingStyle: 2, lineSpacingFactor: 1.5, backgroundFlags: 1, backgroundScale: 1.25, backgroundColor: BG };
    const items = [...info, ...mtb(2, 1.5), ...bbrt()];
    const read = [(d: CadDocument) => readDwg(writeDwg(d, { version: 'AC1015' }).data), (d: CadDocument) => readDxf(writeDxf(d, { version: 'AC1015' }).data)];
    for (const rd of read) {
      const m = rd(docOf(mtext('E1', items, vals))).entityIndex.get('E1') as MTextEntity;
      expect(acadItems(m.xdata)).toEqual(items);
      expect([m.lineSpacingStyle, m.lineSpacingFactor, m.backgroundFlags, m.backgroundScale, m.backgroundColor]).toEqual([2, 1.5, 1, 1.25, BG]);
      // 앱에서 배경을 지웠다·ACI 색으로 바꿨다: 낡은 배경 묶음을 빼서 다시 열 때 살아나지 않는다(R2000에는 배경 칸이 없다)
      for (const over of [{ backgroundFlags: 0 }, { backgroundColor: { aci: 3 } }]) {
        const s = rd(docOf(mtext('E2', items, { ...vals, ...over }))).entityIndex.get('E2') as MTextEntity;
        expect(acadItems(s.xdata), JSON.stringify(over)).toEqual([...info, ...mtb(2, 1.5)]);
        expect(s.backgroundFlags, JSON.stringify(over)).toBe(0);
      }
      // 배율·트루컬러를 바꿨다: 새 값으로 다시 만든다
      const s = rd(docOf(mtext('E3', items, { ...vals, backgroundScale: 1.5, backgroundColor: { aci: 1, rgb: 0xff0000 } }))).entityIndex.get('E3') as MTextEntity;
      expect(acadItems(s.xdata)).toEqual([...info, ...mtb(2, 1.5), ...bbrt(1, 1.5, 0xc2ff0000)]);
      expect([s.backgroundFlags, s.backgroundScale, s.backgroundColor]).toEqual([1, 1.5, { aci: 1, rgb: 0xff0000 }]);
    }
    const same: XData[] = [{ app: 'ACAD', items }];
    expect(mtextSaveXDataForR2000(same, vals)).toBe(same);
    const bad: XData[] = [{ app: 'ACAD', items: [...mtb(), ...bbrt(4)] }];
    expect(mtextSaveXDataForR2000(bad, { lineSpacingStyle: 1, lineSpacingFactor: 1, backgroundFlags: 0, backgroundScale: 1.5 })).toBe(bad);
  });

  it('R2000 DWG·DXF는 모든 MTEXT에 MTEXTBEGIN을 두고 표본 꼴 배경에 BBRT를 만든다(AutoCAD R2000 판처럼)', () => {
    const other: XData = { app: 'MY_APP', items: [{ code: 1000, value: 'k' }] };
    const dh: XDataItem[] = [
      { code: 1000, value: 'ACAD_MTEXT_DEFINED_HEIGHT_BEGIN' },
      { code: 1070, value: 46 },
      { code: 1040, value: 7 },
      { code: 1000, value: 'ACAD_MTEXT_DEFINED_HEIGHT_END' },
    ];
    const bgVals = { backgroundFlags: 1, backgroundScale: 1.25, backgroundColor: BG };
    const cases: [MTextEntity, XData[] | undefined][] = [
      // 확장 자료가 없다 → ACAD 자료를 만든다(다른 앱 뒤)
      [mtext('F1', undefined, { lineSpacingStyle: 2, lineSpacingFactor: 1.5 }), [{ app: 'ACAD', items: mtb(2, 1.5) }]],
      [{ ...mtext('F2', undefined), xdata: [other] }, [other, { app: 'ACAD', items: mtb() }]],
      // 단 정보 뒤, 정한 높이 앞(AutoCAD R14·R2000 표본 차례)
      [mtext('F3', [...info, ...dh]), [{ app: 'ACAD', items: [...info, ...mtb(), ...dh] }]],
      // 앱에서 줄 간격을 바꿨다 → 제 칸 값으로
      [mtext('F4', [...info, ...mtb(1, 1)], { lineSpacingStyle: 2, lineSpacingFactor: 0.8 }), [{ app: 'ACAD', items: [...info, ...mtb(2, 0.8)] }]],
      // 트루컬러 배경 → MTEXTBEGIN 바로 뒤에 BBRT
      [mtext('F5', undefined, bgVals), [{ app: 'ACAD', items: [...mtb(), ...bbrt()] }]],
      // 실물이 없는 배경(도면 창 색 2, ACI 색)은 만들지 않는다
      [mtext('F6', undefined, { ...bgVals, backgroundFlags: 3 }), [{ app: 'ACAD', items: mtb() }]],
      [mtext('F7', undefined, { ...bgVals, backgroundColor: { aci: 5 } }), [{ app: 'ACAD', items: mtb() }]],
      // 색상표 색은 같은 RGB의 표본 꼴로(이름은 빠진다 — 152차, roundtrip152)
      [mtext('F8', undefined, { ...bgVals, backgroundColor: { aci: 97, rgb: 0x367542, name: 'BOOK$C' } }), [{ app: 'ACAD', items: [...mtb(), ...bbrt()] }]],
    ];
    for (const [e, want] of cases) {
      const d = readDwg(writeDwg(docOf(structuredClone(e)), { version: 'AC1015' }).data).entityIndex.get(e.handle) as MTextEntity;
      expect(d.xdata, e.handle).toEqual(want);
      const x = readDxf(writeDxf(docOf(structuredClone(e)), { version: 'AC1015' }).data).entityIndex.get(e.handle) as MTextEntity;
      expect(x.xdata, `dxf ${e.handle}`).toEqual(want);
    }
    // 트루컬러 도형 색의 RTTcAl(138차 — DWG만)은 저장 묶음 앞(표본 9DA 차례: RTTcAl, MTEXTBEGIN, BBRT)
    const f10 = mtext('F10', undefined, { ...bgVals, color: { aci: 97, rgb: 0x367542 } });
    const d10 = acadItems(readDwg(writeDwg(docOf(f10), { version: 'AC1015' }).data).entityIndex.get('F10')!.xdata)!;
    expect(d10[0]).toEqual({ code: 1000, value: 'RTTcAl' });
    expect(d10.slice(4)).toEqual([...mtb(), ...bbrt()]);
    // 다시 연 R2000의 배경은 그대로, R2004+로 다시 쓰면 묶음 없이 제 칸에
    const r = readDwg(writeDwg(docOf(mtext('F9', undefined, bgVals)), { version: 'AC1015' }).data);
    const m = r.entityIndex.get('F9') as MTextEntity;
    expect([m.backgroundFlags, m.backgroundScale, m.backgroundColor]).toEqual([1, 1.25, BG]);
    const n = readDwg(writeDwg(r, { version: 'AC1018' }).data).entityIndex.get('F9') as MTextEntity;
    expect([n.xdata, n.backgroundFlags, n.backgroundScale, n.backgroundColor]).toEqual([undefined, 1, 1.25, BG]);
  });

  const S = (v: string) => join(FIXTURES, 'samples', `sample_${v}.dwg`);
  const NEW = ['AC1018', 'AC1024', 'AC1027', 'AC1032'] as const;
  it.skipIf(![...NEW, 'AC1014', 'AC1015'].every((v) => existsSync(S(v))))('표본: AutoCAD R14·R2000 판의 MTEXT를 읽은 칸, R2004+·R2000으로 쓴 확장 자료가 AutoCAD 같은 판과 같다', () => {
    const mtexts = (doc: CadDocument) =>
      new Map([...doc.blocks.values()].flatMap((b) => b.entities.filter((e) => e.type === 'MTEXT').map((e) => [e.handle.toUpperCase(), e as MTextEntity] as const)));
    const fields = (m: MTextEntity | undefined) =>
      m && JSON.stringify([m.lineSpacingStyle, m.lineSpacingFactor, m.backgroundFlags, m.backgroundFlags & 1 ? [m.backgroundScale, m.backgroundColor] : null]);
    const num = (it: XDataItem) => (it.code === 1070 ? (it.value as number) & 0xffff : Number.isInteger(it.value) ? it.value : Number((it.value as number).toPrecision(12)));
    const norm = (e: Entity | undefined) =>
      JSON.stringify((e?.xdata ?? []).map((x) => [x.app.toUpperCase(), x.items.map((it) => [it.code, typeof it.value === 'number' ? num(it) : it.value])]));
    // [같은 핸들 MTEXT 수, 그 가운데 칸이 같은 수, 확장 자료가 같은 수] — 전에는 R14 29·0, R2000 33·0(줄 간격 방식 1개·배경 2개, 저장 묶음)
    const expected: Record<string, [number, number, number]> = { AC1014: [32, 32, 32], AC1015: [35, 35, 35] };
    for (const sv of ['AC1014', 'AC1015'] as const) {
      const src = readDwg(new Uint8Array(readFileSync(S(sv))));
      const sm = mtexts(src);
      for (const v of NEW) {
        const acad = mtexts(readDwg(new Uint8Array(readFileSync(S(v)))));
        const out = mtexts(readDwg(writeDwg(src, { version: v }).data));
        const hs = [...acad.keys()].filter((h) => sm.has(h));
        const read = hs.filter((h) => fields(sm.get(h)) === fields(acad.get(h))).length;
        const xd = hs.filter((h) => norm(out.get(h)) === norm(acad.get(h))).length;
        expect([hs.length, read, xd], `${sv}→${v}`).toEqual(expected[sv]);
      }
    }
    // R2004+ 원본 → R2000: MTEXT 확장 자료(MTEXTBEGIN·BBRT·RTTcAl·단 정보)와 칸이 AutoCAD R2000 판과 같다(전에는 확장 자료 0개, 배경 2개를 잃었다)
    const acad2000 = mtexts(readDwg(new Uint8Array(readFileSync(S('AC1015')))));
    for (const v of ['AC1018', 'AC1032'] as const) {
      const out = mtexts(readDwg(writeDwg(readDwg(new Uint8Array(readFileSync(S(v)))), { version: 'AC1015' }).data));
      const hs = [...acad2000.keys()].filter((h) => out.has(h));
      const read = hs.filter((h) => fields(out.get(h)) === fields(acad2000.get(h))).length;
      const xd = hs.filter((h) => norm(out.get(h)) === norm(acad2000.get(h))).length;
      expect([hs.length, read, xd], `${v}→AC1015`).toEqual([35, 35, 35]);
    }
    // 줄 간격 방식 2(R14에는 칸이 없다)와 배경(R2000 이하에는 칸이 없다)
    const r14 = mtexts(readDwg(new Uint8Array(readFileSync(S('AC1014')))));
    expect(r14.get('3F6')!.lineSpacingStyle).toBe(2);
    for (const h of ['9DA', 'CDC']) expect([r14.get(h)!.backgroundFlags, r14.get(h)!.backgroundScale, r14.get(h)!.backgroundColor]).toEqual([1, 1.25, BG]);
  });
});
