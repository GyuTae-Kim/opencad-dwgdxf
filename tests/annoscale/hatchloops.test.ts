/**
 * 해치 축척 레코드의 루프 경계(122차): 루프마다 BL 90 종류·B 290 뒤, 290이 0이면 그 루프의 경계가 해치 본문의 경계 경로와 같은
 * 꼴(원본 객체 수 없이)로 따른다 — 공개 도면 DWG(R2018) 20개의 레코드 67개가 끝 비트까지 맞고 점이 해치 본문의 같은 루프와 같다.
 * DXF 태그는 HATCH 경계 경로의 그룹 코드 차례(폴리선 72·73·93·10/20·42, 모서리 93·72…, 각도 50·51은 도).
 * - 읽기: 손으로 짠 비트(폴리선 루프)를 그 태그로 푼다, 쓰기가 같은 비트를 낸다
 * - DWG 코덱: 폴리선(볼록 있음·없음)·선·호·타원호·스플라인(맞춤점은 R2010+) 루프 태그 → 비트 → 태그(R2000~R2018)
 * - 도면 왕복(DWG R2018·R2013·R2000, DXF R2018): 레코드 태그·주석 상태(축척을 읽을 수 있음)가 같다
 */
import { describe, expect, it } from 'vitest';
import type { DictionaryObject, Entity, GenericObject, HatchEntity, RawTag } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
import { ScaleIndex, annoState, contextRecords, findScale, makeAnnotative, readScaleList, withAnnotativeFlag } from '../../src/edit/annoscale';
import { EDGE_LINE } from '../../src/core/hatchedges';
import { BitReader } from '../../src/io/dwg/bitstream';
import { decodeCtx, encodeCtx, writeCtxOps } from '../../src/io/dwg/ctxcodec';
import { writeDwg } from '../../src/io/dwg';
import { BitWriter } from '../../src/io/dwg/writer/bitwriter';
import { encoderFor } from '../../src/io/dwg/writer/codepage';
import { writeDxf } from '../../src/io/dxf/writer';
import { readCadFile } from '../../src/io/index';
import { addModel, commit, envOf, hatch, newDoc } from './helpers';

const HATCH = 'ACDB_HATCHSCALECONTEXTDATA_CLASS';

/** 값 비교(수는 상대 1e-9) */
function expectSameTags(a: readonly RawTag[], b: readonly RawTag[], what: string): void {
  expect(a.map((t) => t.code), what).toEqual(b.map((t) => t.code));
  a.forEach((t, i) => {
    const x = Number(t.value);
    const y = Number(b[i]!.value);
    const same = Number.isFinite(x) && Number.isFinite(y) && String(t.value).trim() !== '' ? Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x)) : String(t.value).trim().toUpperCase() === String(b[i]!.value).trim().toUpperCase();
    expect(same, `${what} #${i} ${t.code}: ${t.value} ≠ ${b[i]!.value}`).toBe(true);
  });
}

const head = (scale: string, def: boolean, ver = 4): RawTag[] => [
  { code: 100, value: 'AcDbObjectContextData' },
  { code: 70, value: ver },
  { code: 290, value: def ? 1 : 0 },
  { code: 100, value: 'AcDbAnnotScaleObjectContextData' },
  { code: 340, value: scale },
];

/** 패턴 선 하나(ANSI31 꼴), 배율, 방향 */
const fields = (k: number): RawTag[] => [
  { code: 100, value: 'AcDbHatchObjectContextData' },
  { code: 78, value: 1 },
  { code: 53, value: 45 },
  { code: 43, value: 0 },
  { code: 44, value: 0 },
  { code: 45, value: -2.2450640303 * k },
  { code: 46, value: 2.2450640303 * k },
  { code: 79, value: 0 },
  { code: 40, value: 1 },
  { code: 10, value: 0.7071067811865476 },
  { code: 20, value: 0.7071067811865476 },
  { code: 30, value: 0 },
];

const pts = (code: number, ...xy: number[]): RawTag[] => {
  const out: RawTag[] = [];
  for (let i = 0; i < xy.length; i += 2) out.push({ code, value: xy[i]! }, { code: code + 10, value: xy[i + 1]! });
  return out;
};

/** 루프 넷: 경계 없음(290 = 1), 볼록 있는 폴리선, 모서리 넷(선·호·타원호·스플라인), 볼록 없는 폴리선 */
function loops(ver: number): RawTag[] {
  const fit = ver >= 1024 ? [{ code: 97, value: 2 }, ...pts(11, 0, 0, 6, 1), ...pts(12, 1, 0), ...pts(13, 1, 0)] : [];
  return [
    { code: 90, value: 4 },
    { code: 90, value: 7 },
    { code: 290, value: 1 },
    { code: 90, value: 519 },
    { code: 290, value: 0 },
    { code: 72, value: 1 },
    { code: 73, value: 1 },
    { code: 93, value: 3 },
    ...pts(10, 0, 0),
    { code: 42, value: 0 },
    ...pts(10, 5, 0),
    { code: 42, value: 0.5 },
    ...pts(10, 5, 5),
    { code: 42, value: 0 },
    { code: 90, value: 513 },
    { code: 290, value: 0 },
    { code: 93, value: 4 },
    { code: 72, value: 1 },
    ...pts(10, 0, 0),
    ...pts(11, 1, 0),
    { code: 72, value: 2 },
    ...pts(10, 1, 1),
    { code: 40, value: 1 },
    { code: 50, value: 270 },
    { code: 51, value: 360 },
    { code: 73, value: 1 },
    { code: 72, value: 3 },
    ...pts(10, 3, 1),
    ...pts(11, 1, 0),
    { code: 40, value: 0.5 },
    { code: 50, value: 180 },
    { code: 51, value: 360 },
    { code: 73, value: 0 },
    { code: 72, value: 4 },
    { code: 94, value: 3 },
    { code: 73, value: 1 },
    { code: 74, value: 0 },
    { code: 95, value: 8 },
    { code: 96, value: 4 },
    ...[0, 0, 0, 0, 1, 1, 1, 1].map((v) => ({ code: 40, value: v })),
    ...pts(10, 4, 1),
    { code: 42, value: 1 },
    ...pts(10, 4, 3),
    { code: 42, value: 0.5 },
    ...pts(10, 2, 3),
    { code: 42, value: 0.5 },
    ...pts(10, 0, 0),
    { code: 42, value: 1 },
    ...fit,
    { code: 90, value: 519 },
    { code: 290, value: 0 },
    { code: 72, value: 0 },
    { code: 73, value: 1 },
    { code: 93, value: 2 },
    ...pts(10, 0, 0, 0, 5),
  ];
}

function bitsOf(raw: readonly RawTag[], ver: number): { d: BitWriter; hd: BitWriter } {
  const ops = encodeCtx(HATCH, raw, ver);
  expect(ops).toBeTruthy();
  const enc = encoderFor('UTF-8');
  const d = new BitWriter(ver, enc);
  const hd = new BitWriter(ver, enc);
  if (ver >= 1021) d.strWriter = new BitWriter(ver, enc);
  writeCtxOps(d, hd, ops!, ver, (h) => parseInt(h, 16) || 0, () => 0);
  return { d, hd };
}

function decode(d: BitWriter, hd: BitWriter, ver: number): { tags: RawTag[]; left: number } {
  const r = new BitReader(d.bytes(), ver, new TextDecoder('utf-8'));
  r.end = d.pos;
  const hr = new BitReader(hd.bytes(), ver, new TextDecoder('utf-8'));
  hr.end = hd.pos;
  const tags = decodeCtx(HATCH, r, hr, 0, ver);
  return { tags, left: r.end - r.pos };
}

describe('해치 레코드 루프 경계: 비트 배치', () => {
  it('290 = 0 폴리선 루프: B 볼록, B 닫힘, BL 수, 꼭짓점마다 2RD(볼록이면 BD) — 손으로 짠 비트를 풀고, 쓰기가 같은 비트를 낸다', () => {
    const ver = 1032;
    const w = new BitWriter(ver, encoderFor('UTF-8'));
    const hw = new BitWriter(ver, encoderFor('UTF-8'));
    w.BS(4);
    w.B(0);
    hw.H(5, 0x1a);
    w.BL(0); // 패턴 선 없음
    w.BD(1);
    w.BD3({ x: 1, y: 0, z: 0 });
    w.BL(2);
    w.BL(7);
    w.B(1);
    w.BL(519);
    w.B(0);
    w.B(1);
    w.B(1);
    w.BL(2);
    w.RD(10);
    w.RD(20);
    w.BD(0.25);
    w.RD(30);
    w.RD(40);
    w.BD(0);
    const { tags, left } = decode(w, hw, ver);
    expect(left).toBe(0);
    const body: RawTag[] = [
      ...head('1A', false),
      { code: 100, value: 'AcDbHatchObjectContextData' },
      { code: 78, value: 0 },
      { code: 40, value: 1 },
      { code: 10, value: 1 },
      { code: 20, value: 0 },
      { code: 30, value: 0 },
      { code: 90, value: 2 },
      { code: 90, value: 7 },
      { code: 290, value: 1 },
      { code: 90, value: 519 },
      { code: 290, value: 0 },
      { code: 72, value: 1 },
      { code: 73, value: 1 },
      { code: 93, value: 2 },
      ...pts(10, 10, 20),
      { code: 42, value: 0.25 },
      ...pts(10, 30, 40),
      { code: 42, value: 0 },
    ];
    expectSameTags(tags, body, '풀기');
    const { d } = bitsOf(body, ver);
    expect(d.pos).toBe(w.pos);
    expect([...d.bytes().subarray(0, w.byteLength())]).toEqual([...w.bytes().subarray(0, w.byteLength())]);
  });

  for (const ver of [1015, 1018, 1021, 1024, 1027, 1032]) {
    it(`AC${ver}: 폴리선·선·호·타원호·스플라인 루프 태그 → 비트 → 태그`, () => {
      const cls = ver >= 1024 ? 4 : 3;
      const raw = [...head('1A', true, cls), ...fields(1), ...loops(ver)];
      const { d, hd } = bitsOf(raw, ver);
      const { tags, left } = decode(d, hd, ver);
      expect(left).toBe(0);
      expectSameTags(tags, raw, `AC${ver}`);
    });
  }

  it('R2010+ 태그(스플라인 맞춤점)를 R2007 이전 비트로 쓰면 맞춤점만 빠진다', () => {
    const raw = [...head('1A', true, 3), ...fields(1), ...loops(1032)];
    const { d, hd } = bitsOf(raw, 1021);
    expectSameTags(decode(d, hd, 1021).tags, [...head('1A', true, 3), ...fields(1), ...loops(1021)], 'AC1021');
  });

  it('290 = 0 루프의 경계가 모자라면 쓰지 않는다(원본 비트만)', () => {
    const raw = [...head('1A', true), ...fields(1), { code: 90, value: 1 }, { code: 90, value: 519 }, { code: 290, value: 0 }, { code: 72, value: 0 }, { code: 73, value: 1 }, { code: 93, value: 2 }, ...pts(10, 0, 0)];
    expect(encodeCtx(HATCH, raw, 1032)).toBeNull();
  });
});

/** 객체에 AutoCAD 꼴 레코드 사슬을 직접 붙인다(records.test.ts와 같은 꼴) */
function attach(doc: ReturnType<typeof newDoc>['doc'], session: ReturnType<typeof newDoc>['session'], e: Entity, records: RawTag[][]): Entity {
  const h = () => session.newHandle();
  const xd = h();
  const mg = h();
  const sc = h();
  const recs = records.map((raw) => ({ type: HATCH, handle: h(), owner: sc, reactors: [sc], raw }) as GenericObject);
  const d = (handle: string, owner: string, entries: [string, string][], hard = false): DictionaryObject => ({ type: 'DICTIONARY', handle, owner, entries: new Map(entries), hardOwner: hard, cloning: 1 });
  const after = { ...e, xdict: xd, xdata: withAnnotativeFlag(e.xdata, true) } as Entity;
  commit(session, [
    { kind: 'object', key: xd, before: null, after: d(xd, e.handle, [['AcDbContextDataManager', mg]], true) },
    { kind: 'object', key: mg, before: null, after: d(mg, xd, [['ACDB_ANNOTATIONSCALES', sc]]) },
    { kind: 'object', key: sc, before: null, after: d(sc, mg, recs.map((r, i) => [`*A${i + 1}`, r.handle])) },
    ...recs.map((r) => ({ kind: 'object' as const, key: r.handle, before: null, after: r })),
    { kind: 'modify', block: MODEL_SPACE, before: e, after },
  ]);
  return doc.entityIndex.get(e.handle)!;
}

describe('만드는 해치 레코드의 루프 종류', () => {
  it('경로 플래그 그대로: 폴리선 경로는 비트 2를 두고 모서리 경로는 뺀다, 경계는 해치에서(290 = 1)', () => {
    const { doc, session } = newDoc();
    const e = hatch();
    e.paths[0]!.flags = 519;
    e.paths.push({ flags: 3, edgeData: [EDGE_LINE, 40, 40, 60, 40, EDGE_LINE, 60, 40, 60, 60, EDGE_LINE, 60, 60, 40, 40] });
    const h = addModel(doc, session, e) as Entity;
    const r = makeAnnotative(envOf(doc, session), h, '1:1');
    commit(session, [...r.ops, { kind: 'modify', block: MODEL_SPACE, before: h, after: r.entity }]);
    const rec = contextRecords(doc, doc.entityIndex.get(h.handle)!)[0]!;
    const i40 = rec.body.findIndex((t) => t.code === 40);
    expect(rec.body.slice(i40 + 4)).toEqual([
      { code: 90, value: 2 },
      { code: 90, value: 519 },
      { code: 290, value: 1 },
      { code: 90, value: 1 },
      { code: 290, value: 1 },
    ]);
  });
});

describe('해치 레코드 루프 경계: 도면 왕복', () => {
  const { doc, session } = newDoc();
  const list = readScaleList(doc);
  const s1 = findScale(list, '1:1')!.handle!;
  const s5 = findScale(list, '1:5')!.handle!;
  const base = hatch();
  // 바깥 폴리선 루프(해치의 루프와 같은 점을 레코드에 둔다 — 실물과 같은 꼴)
  base.paths[0]!.flags = 519;
  const loop: RawTag[] = [
    { code: 90, value: 1 },
    { code: 90, value: 519 },
    { code: 290, value: 0 },
    { code: 72, value: 0 },
    { code: 73, value: 1 },
    { code: 93, value: 4 },
    ...pts(10, 0, 0, 100, 0, 100, 100, 0, 100),
  ];
  let h = addModel(doc, session, base) as Entity;
  h = attach(doc, session, h, [
    [...head(s1, true), ...fields(1), ...loop],
    [...head(s5, false), ...fields(5), { code: 90, value: 1 }, { code: 90, value: 519 }, { code: 290, value: 1 }],
  ]);
  const handle = h.handle;
  const want = contextRecords(doc, h).map((r) => r.raw);

  const check = (back: ReturnType<typeof readCadFile>, cls: number, what: string) => {
    const e = back.entityIndex.get(handle) as HatchEntity;
    const got = contextRecords(back, e).map((r) => r.raw);
    expect(got.length, what).toBe(2);
    got.forEach((raw, i) =>
      expectSameTags(
        raw,
        want[i]!.map((t, j) => (j === 1 ? { code: 70, value: cls } : t)),
        `${what} #${i}`,
      ),
    );
    const st = annoState(back, e, new ScaleIndex(back))!;
    expect(st.foreign, what).toBe(false);
    expect(st.scales, what).toEqual(['1:1', '1:5']);
  };

  for (const v of ['AC1032', 'AC1027', 'AC1015'] as const) {
    it(`DWG ${v}`, () => {
      const res = writeDwg(doc, { version: v });
      expect(res.warnings.filter((w) => /dropped/.test(w.code))).toEqual([]);
      const back = readCadFile(res.data, 'rt.dwg');
      check(back, Number(v.slice(2)) >= 1024 ? 4 : 3, v);
      // 다시 읽은 DWG를 같은 판으로 다시 쓰고 읽어도 같다(원본 본문 되쓰기)
      check(readCadFile(writeDwg(back, { version: v }).data, 'rt2.dwg'), Number(v.slice(2)) >= 1024 ? 4 : 3, `${v} 두 번`);
    });
  }

  it('DXF AC1032 → DWG AC1032', () => {
    const out = writeDxf(doc, { version: 'AC1032' as never });
    const txt = new TextDecoder().decode(out.data);
    // 290 0 다음에 HATCH 경계 경로 태그(72 볼록·73 닫힘·93 수)
    expect(/\n\s*290\r?\n\s*0\r?\n\s*72\r?\n\s*0\r?\n\s*73\r?\n\s*1\r?\n\s*93\r?\n\s*4\r?\n/.test(txt)).toBe(true);
    const back = readCadFile(out.data, 'rt.dxf');
    check(back, 4, 'DXF');
    check(readCadFile(writeDwg(back, { version: 'AC1032' }).data, 'rt.dwg'), 4, 'DXF → DWG');
  });
});
