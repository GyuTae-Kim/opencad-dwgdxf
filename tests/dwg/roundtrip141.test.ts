/**
 * 141차: 옛 판 자료의 왕복 묶음을 새 판으로 쓸 때 AutoCAD처럼 빼기.
 * RTMaterial — AutoCAD는 R2004 이하 DWG에 칸이 없는 도형 재질을 ACAD 확장 자료 "RTMaterial"(1005 재질 핸들)로 남기고, 같은 도면을 R2007+ DWG로 쓸 때는
 * 재질 칸으로 옮기며 DXF에는 어느 판이든 쓰지 않는다. 이 앱은 가리키는 MATERIAL 객체를 같은 판으로 쓸 때만 옮기므로 전에는 R2007+ DWG·DXF 출력에
 * 끊긴 재질 핸들이 남았다. 꼴은 AutoCAD가 같은 도면을 여러 판으로 쓴 공개 표본 짝에서 갈랐다.
 * MVIEW — R12~R14 VIEWPORT는 보기 정보를 ACAD 확장 자료 "MVIEW"에 두고(읽을 때 모델로 옮긴다) R2000+는 제 칸에 쓴다. AutoCAD는 같은 도면을
 * R2000+ DWG·DXF로 쓸 때 이 묶음을 남기지 않는데, 전에는 이 앱이 R2000+ 출력에도 그대로 옮겨 썼다(R12 DXF에는 그대로 둔다).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CadDocument, Entity, LineEntity, ViewportEntity, XData, XDataItem } from '../../src/core/model';
import { MODEL_SPACE, PAPER_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { withoutRoundTripXData } from '../../src/io/dwg/xdata';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { withoutMviewXData } from '../../src/io/mview';
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

describe('VIEWPORT의 MVIEW 묶음(141차)', () => {
  /** R13·R14 DWG 꼴(1003 동결 도면층은 핸들) */
  const mview = (frozen: string[] = []): XDataItem[] => [
    { code: 1000, value: 'MVIEW' },
    { code: 1002, value: '{' },
    { code: 1070, value: 16 },
    { code: 1010, value: { x: 0, y: 0, z: 0 } },
    { code: 1010, value: { x: 0, y: 0, z: 1 } },
    { code: 1040, value: 0 },
    { code: 1040, value: 12 },
    { code: 1002, value: '{' },
    ...frozen.map((h) => ({ code: 1003, value: h })),
    { code: 1002, value: '}' },
    { code: 1002, value: '}' },
  ];
  const other: XDataItem[] = [{ code: 1000, value: 'MY_GROUP' }, { code: 1070, value: 1 }];

  it('MVIEW 묶음만 빼고(안쪽 중괄호 포함) 나머지는 차례 그대로', () => {
    const read: XData[] = [
      { app: 'MY_APP', items: [{ code: 1000, value: 'x' }] },
      { app: 'ACAD', items: [...other, ...mview(['2F', '30']), ...dstyle] },
    ];
    expect(withoutMviewXData(read)).toEqual([read[0], { app: 'ACAD', items: [...other, ...dstyle] }]);
    expect(withoutMviewXData([{ app: 'ACAD', items: mview() }])).toBeUndefined();
    expect(withoutMviewXData([{ app: 'ACAD', items: mview() }, read[0]!])).toEqual([read[0]]);
  });

  it('중괄호가 맞지 않거나 MVIEW·ACAD가 없으면 받은 배열 그대로', () => {
    const open: XData[] = [{ app: 'ACAD', items: mview().slice(0, -1) }];
    expect(withoutMviewXData(open)).toBe(open);
    const bare: XData[] = [{ app: 'ACAD', items: [{ code: 1000, value: 'MVIEW' }, { code: 1070, value: 16 }] }];
    expect(withoutMviewXData(bare)).toBe(bare);
    const plain: XData[] = [{ app: 'ACAD', items: dstyle }];
    expect(withoutMviewXData(plain)).toBe(plain);
    const app: XData[] = [{ app: 'MY_APP', items: mview() }];
    expect(withoutMviewXData(app)).toBe(app);
    expect(withoutMviewXData(undefined)).toBeUndefined();
  });

  /** R12 DXF로 쓰고 다시 읽은 뷰포트 문서(확장 자료에 MVIEW, 보기 정보는 모델에) */
  function r12Doc(): CadDocument {
    const doc = createNewDocument('metric');
    doc.layers.set('HIDDEN', { ...doc.layers.get('0')!, name: 'HIDDEN', handle: '' });
    const vp = {
      ...entityDefaults(),
      handle: '3A',
      layer: '0',
      type: 'VIEWPORT',
      center: { x: 5, y: 5, z: 0 },
      width: 10,
      height: 8,
      status: 2,
      id: 2,
      viewCenter: { x: 30, y: 40 },
      snapBase: { x: 0, y: 0 },
      snapSpacing: { x: 1, y: 1 },
      gridSpacing: { x: 1, y: 1 },
      viewDirection: { x: 0, y: 0, z: 1 },
      viewTarget: { x: 0, y: 0, z: 0 },
      lensLength: 50,
      frontClip: 0,
      backClip: 0,
      viewHeight: 12,
      snapAngle: 0,
      twistAngle: 0,
      circleSides: 100,
      flags: 0,
      frozenLayers: ['HIDDEN'],
      renderMode: 0,
      ucsPerViewport: false,
    } as ViewportEntity;
    doc.blocks.get(PAPER_SPACE)!.entities.push(vp);
    return readDxf(writeDxf(doc, { version: 'AC1009' }).data);
  }
  // DWG는 배치의 뷰포트가 하나면 번호 1로 읽으므로 핸들로 찾는다
  const vpOf = (doc: CadDocument) => doc.blocks.get(PAPER_SPACE)!.entities.find((e) => e.type === 'VIEWPORT' && e.handle.toUpperCase() === '3A') as ViewportEntity;
  const hasMview = (e: Entity) => (acadItems(e.xdata) ?? []).some((it) => it.code === 1000 && it.value === 'MVIEW');

  it('R2000+ DWG·DXF는 묶음 없이 제 칸에 보기 정보를 쓰고, R12 DXF는 묶음을 둔다', () => {
    expect(hasMview(vpOf(r12Doc()))).toBe(true);
    const check = (got: ViewportEntity, label: string) => {
      expect(hasMview(got), label).toBe(false);
      expect(got.viewCenter, label).toEqual({ x: 30, y: 40 });
      expect(got.viewHeight, label).toBe(12);
      expect(got.frozenLayers, label).toEqual(['HIDDEN']);
    };
    for (const version of ['AC1015', 'AC1018', 'AC1024', 'AC1032'] as const) check(vpOf(readDwg(writeDwg(r12Doc(), { version }).data)), `dwg ${version}`);
    for (const version of ['AC1015', 'AC1032'] as const) check(vpOf(readDxf(writeDxf(r12Doc(), { version }).data)), `dxf ${version}`);
    // R12 DXF는 읽은 묶음을 그대로 쓴다(모델로 다시 만들지 않는다 — 다시 만들면 늘 1인 UCS 아이콘 칸이 3이 아니게 된다)
    const src = r12Doc();
    const items = acadItems(vpOf(src).xdata)!;
    items[15] = { code: 1070, value: 3 };
    const r12 = vpOf(readDxf(writeDxf(src, { version: 'AC1009' }).data));
    expect(acadItems(r12.xdata)).toEqual(items);
    expect(r12.viewCenter).toEqual({ x: 30, y: 40 });
  });

  const S = (v: string) => join(FIXTURES, 'samples', `sample_${v}.dwg`);
  const SX = (v: string) => join(FIXTURES, '..', 'acadsharp-dxf', 'samples', `sample_${v}_ascii.dxf`);
  const NEW = ['AC1015', 'AC1018', 'AC1024', 'AC1027', 'AC1032'] as const;
  const DXFV = ['AC1015', 'AC1018', 'AC1021', 'AC1024', 'AC1027', 'AC1032'] as const;
  it.skipIf(![...NEW, 'AC1014'].every((v) => existsSync(S(v))))('표본: AutoCAD R14 판의 뷰포트를 R2000+로 쓰면 확장 자료가 AutoCAD 같은 판과 같다', () => {
    const ents = (doc: CadDocument) => new Map([...doc.blocks.values()].flatMap((b) => b.entities.map((e) => [e.handle.toUpperCase(), e] as const)));
    const norm = (e: Entity | undefined) => JSON.stringify((e?.xdata ?? []).map((x) => [x.app.toUpperCase(), x.items.map((it) => [it.code, it.value])]));
    const src = readDwg(new Uint8Array(readFileSync(S('AC1014'))));
    const vps = [...ents(src)].filter(([, e]) => e.type === 'VIEWPORT' && hasMview(e)).map(([h]) => h);
    expect(vps.length).toBe(6);
    let n = 0;
    for (const v of NEW) {
      const acad = ents(readDwg(new Uint8Array(readFileSync(S(v)))));
      const out = ents(readDwg(writeDwg(src, { version: v }).data));
      for (const h of vps) {
        expect(norm(out.get(h)), `→${v} ${h}`).toBe(norm(acad.get(h)));
        n++;
      }
    }
    if (DXFV.every((v) => existsSync(SX(v))))
      for (const v of DXFV) {
        const acad = ents(readDxf(new Uint8Array(readFileSync(SX(v)))));
        const out = ents(readDxf(writeDxf(src, { version: v }).data));
        for (const h of vps) {
          expect(norm(out.get(h)), `→dxf ${v} ${h}`).toBe(norm(acad.get(h)));
          n++;
        }
      }
    expect(n).toBe(66);
  });
});
