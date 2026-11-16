/**
 * R2000 DWG로 쓸 때의 AutoCAD 왕복 확장 자료(138차): R2000 도형 색 칸은 ACI뿐이라 AutoCAD는 트루컬러·색상표 색을 ACAD 확장 자료
 * "RTTcAl" 묶음(1070 R2004 ENC 낱말 · 1071 0xC2RRGGBB · 1000 색상표 이름/$$NoName$$)으로 남긴다. 전에는 이 앱이 R2000으로 쓰면
 * 가장 가까운 ACI만 남아 트루컬러를 잃었다. 꼴·자리는 AutoCAD가 같은 도면을 R2004와 R2000으로 쓴 공개 표본 짝에서 갈랐다.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CadColor, CadDocument, Entity, LineEntity, XData, XDataItem } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { roundTripXDataForR2000 } from '../../src/io/dwg/xdata';
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
const ent = (color: CadColor, more: { type?: string; lineweight?: number; transparency?: number } = {}) => ({
  type: more.type ?? 'LINE',
  color,
  lineweight: more.lineweight ?? -1,
  transparency: more.transparency ?? -1,
});
const acadItems = (xd: XData[] | undefined) => xd?.find((x) => x.app === 'ACAD')?.items;

describe('R2000 DWG 쓰기의 왕복 확장 자료(138차)', () => {
  it('트루컬러·색상표·투명도 플래그: AutoCAD R2000 표본과 같은 낱말', () => {
    // 표본 짝의 값(R2004 판 색·투명도 → R2000 판 RTTcAl)
    expect(acadItems(roundTripXDataForR2000(undefined, ent({ aci: 82, rgb: 0x34c918 }), 82))).toEqual(tc(0x8052, 0xc234c918));
    expect(acadItems(roundTripXDataForR2000(undefined, ent({ aci: 183, rgb: 0x803dc2 }, { transparency: -2 }), 183))).toEqual(tc(0xa0b7, 0xc2803dc2));
    expect(acadItems(roundTripXDataForR2000(undefined, ent({ aci: 42, rgb: 0xe29000, name: 'RAL CLASSIC$RAL 1006' }), 42))).toEqual(
      tc(0xc02a, 0xc2e29000, 'RAL CLASSIC$RAL 1006'),
    );
    // 트루컬러의 ACI 칸이 ByLayer면 쓸 ACI(가장 가까운 색)를 낱말에
    expect(acadItems(roundTripXDataForR2000(undefined, ent({ aci: 256, rgb: 0x34c918 }), 82))).toEqual(tc(0x8052, 0xc234c918));
  });

  it('남기지 않는 도형: ACI 색(투명도만 있는 것 포함), PDF 언더레이 — 받은 배열 그대로', () => {
    const other: XData[] = [{ app: 'MY_APP', items: [{ code: 1000, value: 'x' }] }];
    expect(roundTripXDataForR2000(undefined, ent({ aci: 1 }, { transparency: -2 }), 1)).toBeUndefined();
    expect(roundTripXDataForR2000(other, ent({ aci: 256 }), 256)).toBe(other);
    expect(roundTripXDataForR2000(undefined, ent({ aci: 193, rgb: 0x9b42ec }, { type: 'PDFUNDERLAY' }), 193)).toBeUndefined();
  });

  it('자리: ACAD 자료 끝(DSTYLE 뒤), 여러 줄 문자 묶음 앞, ACAD가 없으면 다른 앱 뒤', () => {
    const dstyle: XDataItem[] = [
      { code: 1000, value: 'DSTYLE' },
      { code: 1002, value: '{' },
      { code: 1070, value: 40 },
      { code: 1040, value: 2 },
      { code: 1002, value: '}' },
    ];
    const col = { aci: 193, rgb: 0x9b42ec };
    expect(acadItems(roundTripXDataForR2000([{ app: 'ACAD', items: dstyle }], ent(col, { type: 'DIMENSION' }), 193))).toEqual([...dstyle, ...tc(0x80c1, 0xc29b42ec)]);
    const mtext: XDataItem[] = [
      { code: 1000, value: 'ACAD_MTEXT_DEFINED_HEIGHT_BEGIN' },
      { code: 1070, value: 46 },
      { code: 1040, value: 5 },
      { code: 1000, value: 'ACAD_MTEXT_DEFINED_HEIGHT_END' },
    ];
    expect(acadItems(roundTripXDataForR2000([{ app: 'ACAD', items: mtext }], ent(col, { type: 'MTEXT' }), 193))).toEqual([...tc(0x80c1, 0xc29b42ec), ...mtext]);
    const xd = roundTripXDataForR2000([{ app: 'AVE_RENDER', items: [{ code: 1070, value: 1 }] }], ent(col), 193)!;
    expect(xd.map((x) => x.app)).toEqual(['AVE_RENDER', 'ACAD']);
  });

  it('있는 RTTcAl: 같은 색이면 그대로, 색을 바꾼 도형은 같은 자리에 새로, 낡은 자료는 지운다', () => {
    const tail: XDataItem[] = [{ code: 1000, value: 'MTEXTBEGIN' }, { code: 1070, value: 73 }, { code: 1000, value: 'MTEXTEND' }];
    const read: XData[] = [{ app: 'ACAD', items: [...tc(0xa097, 0xc250b3ff), ...tail] }];
    // AutoCAD가 쓴 투명도 플래그(값 없음)도 그대로
    expect(roundTripXDataForR2000(read, ent({ aci: 151, rgb: 0x50b3ff }, { type: 'MTEXT' }), 151)).toBe(read);
    // 모델에 트루컬러가 없어도 색 번호가 같으면 둔다(DXF로 옮겨진 옛 판 자료 등 — 다시 읽으면 트루컬러)
    expect(roundTripXDataForR2000(read, ent({ aci: 151 }, { type: 'MTEXT' }), 151)).toBe(read);
    expect(acadItems(roundTripXDataForR2000(read, ent({ aci: 151, rgb: 0x50b3fe }, { type: 'MTEXT' }), 151))).toEqual([...tc(0x8097, 0xc250b3fe), ...tail]);
    // ACI를 바꾼 도형: 낡은 묶음을 지우고 ACAD에 남는 것이 없으면 ACAD 자료째
    expect(acadItems(roundTripXDataForR2000(read, ent({ aci: 1 }, { type: 'MTEXT' }), 1))).toEqual(tail);
    expect(roundTripXDataForR2000([{ app: 'ACAD', items: tc(0x80b7, 0xc2803dc2) }], ent({ aci: 256 }), 256)).toBeUndefined();
  });

  it('RTLwPs: 제 칸의 선가중치와 같으면 뺀다(R2000은 선가중치 칸이 있다), 다르면 둔다', () => {
    const col = { aci: 82, rgb: 0x34c918 };
    // R14 표본 꼴: RTLwPs(0.40 mm) 뒤 RTTcAl
    const r14: XData[] = [{ app: 'ACAD', items: [...lwPs(138), ...tc(0x8052, 0xc234c918)] }];
    expect(acadItems(roundTripXDataForR2000(r14, ent(col, { lineweight: 40 }), 82))).toEqual(tc(0x8052, 0xc234c918));
    expect(acadItems(roundTripXDataForR2000(r14, ent(col, { lineweight: 50 }), 82))).toBe(r14[0]!.items);
    expect(roundTripXDataForR2000([{ app: 'ACAD', items: lwPs(158) }], ent({ aci: 7 }, { lineweight: -2 }), 7)).toBeUndefined();
  });

  function lineDoc(color: CadColor, xdata?: XData[], transparency = -1): CadDocument {
    const doc = createNewDocument('metric');
    const e = { ...entityDefaults(), type: 'LINE', handle: 'A1', layer: '0', color, transparency, xdata, start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 0, z: 0 } } as LineEntity;
    doc.blocks.get(MODEL_SPACE)!.entities.push(e as Entity);
    doc.entityIndex.set('A1', e as Entity);
    return doc;
  }
  const back = (doc: CadDocument, version: 'AC1015' | 'AC1018') => readDwg(writeDwg(doc, { version }).data).entityIndex.get('A1')!;

  it('R2000 DWG로 쓴 트루컬러·색상표 도형을 다시 읽으면 같은 색, R2004+는 제 칸(묶음 없음)', () => {
    for (const color of [{ aci: 82, rgb: 0x34c918 }, { aci: 42, rgb: 0xe29000, name: 'RAL CLASSIC$RAL 1006' }, { aci: 256, rgb: 0x123456 }] as CadColor[]) {
      const r = back(lineDoc(color), 'AC1015');
      expect(r.color.rgb).toBe(color.rgb);
      expect(r.color.name).toBe(color.name);
      expect(acadItems(r.xdata)?.[0]).toEqual({ code: 1000, value: 'RTTcAl' });
      const n = back(lineDoc(color), 'AC1018');
      expect(n.color.rgb).toBe(color.rgb);
      expect(n.xdata).toBeUndefined();
    }
    // 다른 앱 자료가 있으면 ACAD는 그 뒤
    const r = back(lineDoc({ aci: 82, rgb: 0x34c918 }, [{ app: 'ACAD_PSEXT', items: [{ code: 1000, value: 'x' }] }], -2), 'AC1015');
    expect(r.xdata?.map((x) => x.app)).toEqual(['ACAD_PSEXT', 'ACAD']);
    expect(acadItems(r.xdata)).toEqual(tc(0xa052, 0xc234c918));
    // ACI 도형은 전처럼 확장 자료 없음
    expect(back(lineDoc({ aci: 3 }, undefined, -2), 'AC1015').xdata).toBeUndefined();
  });

  const S = (v: string) => join(FIXTURES, 'samples', `sample_${v}.dwg`);
  const VERS = ['AC1014', 'AC1018', 'AC1021', 'AC1024', 'AC1027', 'AC1032'];
  it.skipIf(![...VERS, 'AC1015'].every((v) => existsSync(S(v))))('표본: AutoCAD 여러 판을 R2000으로 쓰면 RTTcAl이 AutoCAD R2000 판과 같다', () => {
    const ents = (doc: CadDocument) => new Map([...doc.blocks.values()].flatMap((b) => b.entities.map((e) => [e.handle.toUpperCase(), e] as const)));
    const group = (e: Entity | undefined) => {
      const items = acadItems(e?.xdata) ?? [];
      const i = items.findIndex((it) => it.code === 1000 && it.value === 'RTTcAl');
      return i < 0 ? undefined : { at: i, items: items.slice(i, i + 4) };
    };
    const acad = ents(readDwg(new Uint8Array(readFileSync(S('AC1015')))));
    for (const v of VERS) {
      const src = readDwg(new Uint8Array(readFileSync(S(v))));
      const out = ents(readDwg(writeDwg(src, { version: 'AC1015' }).data));
      let same = 0;
      for (const h of new Set([...acad.keys(), ...out.keys()])) {
        const a = group(acad.get(h));
        const b = group(out.get(h));
        expect(b, `${v} ${h}`).toEqual(a);
        if (a) same++;
      }
      expect(same, v).toBe(22);
      // 트루컬러 도형은 다시 읽어도 같은 색(PDF 언더레이는 R2000에 ACI만 — AutoCAD도 같다)
      for (const e of ents(src).values())
        if (e.color.rgb !== undefined) expect(out.get(e.handle.toUpperCase())!.color, `${v} ${e.handle}`).toEqual(e.type === 'PDFUNDERLAY' ? { aci: e.color.aci } : e.color);
    }
  });
});
