/**
 * 141차: 옛 판 자료의 왕복 묶음을 새 판으로 쓸 때 AutoCAD처럼 빼기.
 * RTMaterial — AutoCAD는 R2004 이하 DWG에 칸이 없는 도형 재질을 ACAD 확장 자료 "RTMaterial"(1005 재질 핸들)로 남기고, 같은 도면을 R2007+ DWG로 쓸 때는
 * 재질 칸으로 옮기며 DXF에는 어느 판이든 쓰지 않는다. 이 앱은 가리키는 MATERIAL 객체를 같은 판으로 쓸 때만 옮기므로 전에는 R2007+ DWG·DXF 출력에
 * 끊긴 재질 핸들이 남았다. 꼴은 AutoCAD가 같은 도면을 여러 판으로 쓴 공개 표본 짝에서 갈랐다.
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

const rtMaterial = (h: string): XDataItem[] => [
  { code: 1000, value: 'RTMaterial' },
  { code: 1005, value: h },
];
const dstyle: XDataItem[] = [
  { code: 1000, value: 'DSTYLE' },
  { code: 1002, value: '{' },
  { code: 1070, value: 40 },
  { code: 1040, value: 2 },
  { code: 1002, value: '}' },
];
const mtextGroup: XDataItem[] = [{ code: 1000, value: 'MTEXTBEGIN' }, { code: 1070, value: 73 }, { code: 1070, value: 1 }, { code: 1000, value: 'MTEXTEND' }];
const acadItems = (xd: XData[] | undefined) => xd?.find((x) => x.app.toUpperCase() === 'ACAD')?.items;
const isMat = (it: XDataItem) => it.code === 1000 && it.value === 'RTMaterial';
const none = () => false;

describe('RTMaterial(141차)', () => {
  it('쓰지 않는 재질을 가리키는 묶음만 빼고 나머지는 차례 그대로', () => {
    const read: XData[] = [
      { app: 'ACAD_MATERIAL_MAPPER_2', items: [{ code: 1070, value: 0 }] },
      { app: 'ACAD', items: [...dstyle, ...rtMaterial('97'), ...mtextGroup] },
    ];
    expect(withoutRoundTripXData(read, false, none)).toEqual([read[0], { app: 'ACAD', items: [...dstyle, ...mtextGroup] }]);
    // 묶음만 있던 ACAD 자료는 통째로, 다 비면 확장 자료 없음
    expect(withoutRoundTripXData([{ app: 'ACAD', items: rtMaterial('DC0') }], false, none)).toBeUndefined();
    // 가리키는 객체를 쓰면 그대로
    const live: XData[] = [{ app: 'ACAD', items: [...rtMaterial('97'), ...dstyle] }];
    expect(withoutRoundTripXData(live, false, (h) => h === '97')).toBe(live);
    expect(withoutRoundTripXData(live, false, (h) => h === '98')).toEqual([{ app: 'ACAD', items: dstyle }]);
  });

  it('written이 없거나(R2000·R2004 DWG) 꼴이 맞지 않으면 받은 배열 그대로', () => {
    const read: XData[] = [{ app: 'ACAD', items: [...dstyle, ...rtMaterial('97')] }];
    expect(withoutRoundTripXData(read)).toBe(read);
    const odd: XData[] = [{ app: 'ACAD', items: [{ code: 1000, value: 'RTMaterial' }, { code: 1070, value: 5 }, ...dstyle] }];
    expect(withoutRoundTripXData(odd, false, none)).toBe(odd);
    const other: XData[] = [{ app: 'MY_APP', items: rtMaterial('97') }];
    expect(withoutRoundTripXData(other, false, none)).toBe(other);
  });

  /** 옛 판 DWG에서 읽은 것 같은 선: ACAD 자료에 DSTYLE과 RTMaterial */
  function lineDoc(items: (doc: CadDocument) => XDataItem[]): CadDocument {
    const doc = createNewDocument('metric');
    const e = {
      ...entityDefaults(),
      type: 'LINE',
      handle: 'A1',
      layer: '0',
      color: { aci: 3 },
      xdata: [{ app: 'ACAD', items: items(doc) }],
      start: { x: 0, y: 0, z: 0 },
      end: { x: 1, y: 0, z: 0 },
    } as LineEntity;
    doc.blocks.get(MODEL_SPACE)!.entities.push(e as Entity);
    doc.entityIndex.set('A1', e as Entity);
    return doc;
  }

  it('R2007+ DWG·DXF는 끊긴 재질 핸들을 빼고, R2000·R2004 DWG는 AutoCAD처럼 남긴다', () => {
    const doc = () => lineDoc(() => [...dstyle, ...rtMaterial('FFF0')]);
    for (const version of ['AC1024', 'AC1027', 'AC1032'] as const) {
      expect(acadItems(readDwg(writeDwg(doc(), { version }).data).entityIndex.get('A1')!.xdata), version).toEqual(dstyle);
    }
    for (const version of ['AC1015', 'AC1018'] as const) {
      expect(acadItems(readDwg(writeDwg(doc(), { version }).data).entityIndex.get('A1')!.xdata), version).toEqual([...dstyle, ...rtMaterial('FFF0')]);
    }
    for (const version of ['AC1009', 'AC1015', 'AC1018', 'AC1032'] as const) {
      expect(acadItems(readDxf(writeDxf(doc(), { version }).data).entityIndex.get('A1')!.xdata), version).toEqual(dstyle);
    }
  });

  it('가리키는 객체를 출력에 쓰면 R2007+ DWG·DXF에도 남긴다', () => {
    // 도면층 0의 표 레코드는 늘 같은 핸들로 쓴다(재질이 아니지만 살아 있는 핸들)
    const doc = () => lineDoc((d) => [...rtMaterial(d.layers.get('0')!.handle!.toUpperCase()), ...dstyle]);
    const want = (d: CadDocument) => [...rtMaterial(d.layers.get('0')!.handle!.toUpperCase()), ...dstyle];
    for (const version of ['AC1024', 'AC1032'] as const) {
      const d = doc();
      expect(acadItems(readDwg(writeDwg(d, { version }).data).entityIndex.get('A1')!.xdata), version).toEqual(want(d));
    }
    for (const version of ['AC1015', 'AC1032'] as const) {
      const d = doc();
      expect(acadItems(readDxf(writeDxf(d, { version }).data).entityIndex.get('A1')!.xdata), version).toEqual(want(d));
    }
  });

  const S = (v: string) => join(FIXTURES, 'samples', `sample_${v}.dwg`);
  const SX = (v: string) => join(FIXTURES, '..', 'acadsharp-dxf', 'samples', `sample_${v}_ascii.dxf`);
  const OLD = ['AC1014', 'AC1015', 'AC1018'] as const;
  const NEWDWG = ['AC1024', 'AC1027', 'AC1032'] as const;
  const DXFV = ['AC1015', 'AC1018', 'AC1021', 'AC1024', 'AC1027', 'AC1032'] as const;
  it.skipIf(![...OLD, ...NEWDWG].every((v) => existsSync(S(v))))('표본: AutoCAD 옛 판의 RTMaterial 도형을 새 판으로 쓰면 확장 자료가 AutoCAD 같은 판과 같다', () => {
    const ents = (doc: CadDocument) => new Map([...doc.blocks.values()].flatMap((b) => b.entities.map((e) => [e.handle.toUpperCase(), e] as const)));
    const norm = (e: Entity | undefined) =>
      JSON.stringify((e?.xdata ?? []).map((x) => [x.app.toUpperCase(), x.items.map((it) => [it.code, typeof it.value === 'number' && it.code === 1070 ? it.value & 0xffff : it.value])]));
    let n = 0;
    for (const sv of OLD) {
      const src = readDwg(new Uint8Array(readFileSync(S(sv))));
      const mat = [...ents(src)].filter(([, e]) => (acadItems(e.xdata) ?? []).some(isMat)).map(([h]) => h);
      expect(mat.length, sv).toBe(5);
      for (const v of NEWDWG) {
        const acad = ents(readDwg(new Uint8Array(readFileSync(S(v)))));
        const out = ents(readDwg(writeDwg(src, { version: v }).data));
        for (const h of mat) {
          expect((acadItems(out.get(h)?.xdata) ?? []).some(isMat), `${sv}→${v} ${h}`).toBe(false);
          expect(norm(out.get(h)), `${sv}→${v} ${h}`).toBe(norm(acad.get(h)));
          n++;
        }
      }
      // R2000·R2004 DWG: AutoCAD도 남긴다(다른 판이면 MATERIAL 객체는 옮기지 않아 핸들은 끊긴 채 — 전과 같다)
      for (const v of ['AC1015', 'AC1018'] as const) {
        if (v === sv) continue;
        const acad = ents(readDwg(new Uint8Array(readFileSync(S(v)))));
        const out = ents(readDwg(writeDwg(src, { version: v }).data));
        for (const h of mat) expect(norm(out.get(h)), `${sv}→${v} ${h}`).toBe(norm(acad.get(h)));
      }
      if (!DXFV.every((v) => existsSync(SX(v)))) continue;
      for (const v of DXFV) {
        const acad = ents(readDxf(new Uint8Array(readFileSync(SX(v)))));
        const out = ents(readDxf(writeDxf(src, { version: v }).data));
        for (const h of mat) expect(norm(out.get(h)), `${sv}→dxf ${v} ${h}`).toBe(norm(acad.get(h)));
      }
    }
    expect(n).toBe(45);
  });
});
