/**
 * 237차: DWG에서 연 DICTIONARYVAR(CANNOSCALE 등)를 DXF로 쓸 때의 하위 클래스 표지.
 * Autodesk DXF 참조서 DICTIONARYVAR는 소유 사전(330) 뒤에 하위 클래스 표지 100 DictionaryVariables, 280 객체 스키마 번호, 1 값을 적는다.
 * DXF 리더는 표지를 원본 태그에 두고(그대로 쓴다) 이 앱이 만든 변수(edit/annoscale/vars.ts)도 표지를 넣는데, DWG 리더(io/dwg/build.ts)는
 * RC·TV를 280·1로만 풀어 DWG → DXF 출력에 표지가 빠졌다(236차 「보고 두 것」 (3) — 값은 잃지 않음).
 * 이제 DWG 리더가 이웃 RASTERVARIABLES·WIPEOUTVARIABLES처럼 표지를 원본 태그 앞에 둔다. DXF에서 연 것은 한 번 그대로(중복 없음),
 * 값·DWG 출력(DWG 쓰기는 280·1을 코드로 찾는다)은 전과 같다.
 */
import { describe, expect, it, vi } from 'vitest';
import type { CadDocument, GenericObject } from '../../src/core/model';
import { dictVarOps, readDictVar } from '../../src/edit/annoscale';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { commit, newDoc } from '../annoscale/helpers';

const dec = (d: Uint8Array): string => new TextDecoder().decode(d);
const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

const VARS = [
  ['CANNOSCALE', '1:50'],
  ['CMLEADERSTYLE', 'Standard'],
] as const;

/** 참조서 순서: 소유자(330) 뒤 100 표지 한 번, 280, 1 */
const WANT = VARS.map(([, v]) => ['100:DictionaryVariables', '280:0', `1:${v}`]).sort();

/** 이 앱이 변수 둘을 만든 새 도면(표지 있음) */
function varDoc(): CadDocument {
  const { doc, session } = newDoc('metric');
  for (const [n, v] of VARS) commit(session, dictVarOps(doc, n, v, () => session.newHandle()));
  return doc;
}

const dictVars = (doc: CadDocument): GenericObject[] => [...doc.objects.values()].filter((o) => o.type === 'DICTIONARYVAR') as GenericObject[];
const codes = (o: GenericObject): number[] => (o.raw ?? []).map((t) => t.code);

/** DXF 글의 DICTIONARYVAR 레코드마다 소유자(102 묶음 밖의 첫 330) 뒤 태그 "코드:값" */
function dxfVarTags(text: string): string[][] {
  const lines = text.split('\r\n');
  const out: string[][] = [];
  let cur: string[] | null = null;
  let inGroup = false;
  let owner = false;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i]!.trim());
    const v = lines[i + 1]!.trim();
    if (code === 0) {
      cur = v === 'DICTIONARYVAR' ? [] : null;
      if (cur) out.push(cur);
      inGroup = false;
      owner = false;
      continue;
    }
    if (!cur) continue;
    if (code === 102) {
      inGroup = v.startsWith('{');
      continue;
    }
    if (inGroup) continue;
    if (!owner) {
      if (code === 330) owner = true;
      continue;
    }
    cur.push(`${code}:${v}`);
  }
  return out.sort();
}

/** 읽은 변수 값과 원본 태그 꼴(표지 한 번) */
function expectVars(doc: CadDocument, label: string): void {
  for (const [n, v] of VARS) expect(readDictVar(doc, n), `${label} ${n}`).toBe(v);
  const vs = dictVars(doc);
  expect(vs.length, label).toBe(VARS.length);
  for (const o of vs) expect(codes(o), label).toEqual([100, 280, 1]);
  for (const o of vs) expect(String(o.raw![0]!.value), label).toBe('DictionaryVariables');
}

describe('DWG에서 연 DICTIONARYVAR의 하위 클래스 표지(237차)', () => {
  it('DWG(R2000·R2004·R2010·R2018)를 거친 변수를 DXF(R2000·R2004·R2018)로 쓰면 소유자 뒤에 100 DictionaryVariables가 한 번, 다시 읽은 값이 같다', () => {
    const src = varDoc();
    for (const version of ['AC1015', 'AC1018', 'AC1024', 'AC1032'] as const) {
      const back = readDwg(writeDwg(src, { version }).data);
      // 전에는 DWG 리더가 280·1만 남겼다(표지 없음)
      expectVars(back, `DWG ${version}`);
      for (const dxfVer of ['AC1015', 'AC1018', 'AC1032'] as const) {
        const label = `DWG ${version} → DXF ${dxfVer}`;
        const text = dec(writeDxf(back, { version: dxfVer }).data);
        expect(dxfVarTags(text), label).toEqual(WANT);
        expectVars(readDxf(enc(text)), label);
      }
    }
  });

  it('DXF에서 연 변수(표지가 이미 있음)는 DXF로 다시 써도, DWG를 거쳐 DXF로 써도 표지가 한 번이다', () => {
    const text1 = dec(writeDxf(varDoc(), { version: 'AC1032' }).data);
    // 이 앱이 만든 변수의 DXF 꼴(전과 같음)
    expect(dxfVarTags(text1)).toEqual(WANT);
    const fromDxf = readDxf(enc(text1));
    expectVars(fromDxf, 'DXF');
    const text2 = dec(writeDxf(fromDxf, { version: 'AC1032' }).data);
    expect(dxfVarTags(text2), 'DXF → DXF').toEqual(WANT);
    for (const version of ['AC1018', 'AC1032'] as const) {
      const viaDwg = readDwg(writeDwg(fromDxf, { version }).data);
      expectVars(viaDwg, `DXF → DWG ${version}`);
      expect(dxfVarTags(dec(writeDxf(viaDwg, { version: 'AC1032' }).data)), `DXF → DWG ${version} → DXF`).toEqual(WANT);
    }
  });

  it('DWG 쓰기는 표지를 보지 않는다 — 표지를 뺀(전 판 리더가 만든 꼴) 문서와 같은 바이트', () => {
    const src = varDoc();
    // 다른 판으로 쓴다(같은 판이면 원본 본문 다시 쓰기 갈래 — 그 지문은 읽을 때 표지를 넣은 뒤 떠서 읽기·쓰기가 서로 맞다)
    for (const [from, to] of [
      ['AC1032', 'AC1018'],
      ['AC1018', 'AC1032'],
      ['AC1015', 'AC1024'],
    ] as const) {
      const back = readDwg(writeDwg(src, { version: from }).data);
      const stripped: CadDocument = { ...back, objects: new Map(back.objects) };
      for (const o of dictVars(back)) stripped.objects.set(o.handle, { ...o, raw: o.raw!.filter((t) => t.code !== 100) } as GenericObject);
      expect(dictVars(stripped).every((o) => !codes(o).includes(100)), `${from} → ${to}`).toBe(true);
      vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
      vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(((a: unknown) => a) as never);
      try {
        const a = writeDwg(back, { version: to }).data;
        const b = writeDwg(stripped, { version: to }).data;
        expect(a.length, `${from} → ${to}`).toBe(b.length);
        expect(Buffer.from(a).equals(Buffer.from(b)), `${from} → ${to}`).toBe(true);
      } finally {
        vi.restoreAllMocks();
      }
    }
  });
});
