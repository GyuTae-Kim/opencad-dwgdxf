/**
 * 외부 참조 블록 레코드(BLOCK_HEADER): R2004+는 외부 참조·덧씌우기 블록에 소유 객체 수·핸들을 두지 않는다.
 * - AutoCAD가 만든 R2018 외부 참조 도면(CAD_FIXTURES/accore/made)을 읽으면 외부 참조 블록과 경로가 살아 있다(예전에는 "잘못된 개수"로 건너뜀)
 * - 우리가 쓴 외부 참조 블록도 모든 버전에서 같은 배치로 다시 읽힌다
 * - 불러오지 않은(언로드) 상태: DWG 비트는 "불러오지 않음", DXF 70의 32는 "확인됨(불러옴)"이라 뜻이 반대다.
 *   DXF→DWG·DWG→DXF로 저장해도 불러온 외부 참조는 불러온 채로, 불러오지 않은 외부 참조는 그대로 남는다
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CadDocument, Entity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { FIXTURES } from '../oracle/ezdxf';

const MADE = join(FIXTURES, 'accore/made');

function xrefBlocks(doc: CadDocument): { name: string; path: string; flags: number }[] {
  return [...doc.blocks.values()].filter((b) => b.flags & 4).map((b) => ({ name: b.name, path: b.xrefPath ?? '', flags: b.flags & 12 }));
}

function insertNames(doc: CadDocument): string[] {
  return doc.blocks.get(MODEL_SPACE)!.entities.filter((e) => e.type === 'INSERT').map((e) => (e as { block: string }).block).sort();
}

/** 외부 참조 이름 → 불러오지 않음 여부 */
function unloadedState(doc: CadDocument): string {
  return [...doc.blocks.values()]
    .filter((b) => b.flags & 4)
    .map((b) => `${b.name}:${b.xrefUnloaded ? 'unloaded' : 'loaded'}`)
    .sort()
    .join(' ');
}

/** 우리가 쓴 DXF의 BLOCK 70 값(이름 → 값) */
function dxfBlockFlags(data: Uint8Array): Map<string, number> {
  const lines = new TextDecoder().decode(data).split(/\r?\n/);
  const out = new Map<string, number>();
  for (let i = 0; i + 1 < lines.length; i += 2) {
    if (lines[i].trim() !== '0' || lines[i + 1].trim() !== 'BLOCK') continue;
    let name = '';
    let flags = -1;
    for (let j = i + 2; j + 1 < lines.length && lines[j].trim() !== '0'; j += 2) {
      const c = Number(lines[j].trim());
      if (c === 2 && !name) name = lines[j + 1].trim();
      if (c === 70 && flags < 0) flags = Number(lines[j + 1].trim());
    }
    out.set(name, flags);
  }
  return out;
}

const skipped = (doc: CadDocument) => doc.warnings.filter((w) => w.code === 'dwg.object_skipped');

describe('외부 참조 블록 레코드 쓰기·읽기', () => {
  function makeDoc(): CadDocument {
    const doc = createNewDocument('metric');
    let seq = 0x7000;
    const h = () => (seq++).toString(16).toUpperCase();
    for (const [name, flags] of [
      ['PLAN', 4],
      ['OVER', 12],
    ] as const) {
      const rec = h();
      doc.blocks.set(name, { name, handle: h(), recordHandle: rec, basePoint: { x: 0, y: 0, z: 0 }, flags, entities: [], endHandle: h(), xrefPath: `./${name.toLowerCase()}.dwg` });
      doc.blockRecords.set(name, { name, handle: rec, flags: 0, insertUnits: 4, explodable: true, scalable: true });
      doc.blocks.get(MODEL_SPACE)!.entities.push({ ...entityDefaults(), handle: h(), type: 'INSERT', block: name, insert: { x: 10, y: 20, z: 0 }, scale: { x: 1, y: 1, z: 1 }, rotation: 0, columnCount: 1, rowCount: 1, columnSpacing: 0, rowSpacing: 0, attribs: [] } as Entity);
    }
    // 보통 블록은 그대로 소유 목록을 가진다
    const rec = h();
    doc.blocks.set('DOOR', { name: 'DOOR', handle: h(), recordHandle: rec, basePoint: { x: 0, y: 0, z: 0 }, flags: 0, entities: [{ ...entityDefaults(), handle: h(), type: 'LINE', start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 0, z: 0 } } as Entity], endHandle: h() });
    doc.blockRecords.set('DOOR', { name: 'DOOR', handle: rec, flags: 0, insertUnits: 4, explodable: true, scalable: true });
    return doc;
  }

  function withUnloaded(): CadDocument {
    const doc = makeDoc();
    doc.blocks.get('PLAN')!.flags = 4 | 32;
    doc.blocks.get('OVER')!.flags = 4 | 8 | 32;
    const rec = 'A100';
    doc.blocks.set('GONE', { name: 'GONE', handle: 'A101', recordHandle: rec, basePoint: { x: 0, y: 0, z: 0 }, flags: 4, xrefUnloaded: true, entities: [], endHandle: 'A102', xrefPath: './gone.dwg' });
    doc.blockRecords.set('GONE', { name: 'GONE', handle: rec, flags: 0, insertUnits: 4, explodable: true, scalable: true });
    return doc;
  }
  const WANT = 'GONE:unloaded OVER:loaded PLAN:loaded';

  for (const version of ['AC1015', 'AC1018', 'AC1024', 'AC1027', 'AC1032'] as const) {
    it(`${version}: 불러온·불러오지 않은 외부 참조가 DWG·DXF를 오가도 그대로`, () => {
      const dwg = readDwg(writeDwg(withUnloaded(), { version }).data);
      expect(unloadedState(dwg)).toBe(WANT);
      // 불러온 외부 참조는 DXF 뜻의 32(확인됨)를 가진다
      expect(dwg.blocks.get('PLAN')!.flags & 32).toBe(32);
      expect(dwg.blocks.get('GONE')!.flags & 32).toBe(0);
      const dxfOut = writeDxf(dwg, { version }).data;
      expect(dxfBlockFlags(dxfOut).get('PLAN')).toBe(36);
      expect(dxfBlockFlags(dxfOut).get('OVER')).toBe(44);
      expect(dxfBlockFlags(dxfOut).get('GONE')).toBe(4);
      const dxf = readDxf(dxfOut);
      expect(unloadedState(dxf)).toBe(WANT);
      expect(unloadedState(readDwg(writeDwg(dxf, { version }).data))).toBe(WANT);
    });

    it(`${version}: 외부 참조·덧씌우기 블록과 그 참조가 그대로`, () => {
      const back = readDwg(writeDwg(makeDoc(), { version }).data);
      expect(skipped(back)).toEqual([]);
      expect(xrefBlocks(back).sort((a, b) => a.name.localeCompare(b.name))).toEqual([
        { name: 'OVER', path: './over.dwg', flags: 12 },
        { name: 'PLAN', path: './plan.dwg', flags: 4 },
      ]);
      expect(insertNames(back)).toEqual(['OVER', 'PLAN']);
      expect(back.blocks.get('DOOR')!.entities.map((e) => e.type)).toEqual(['LINE']);
    });
  }
});

describe.skipIf(!existsSync(MADE))('AutoCAD가 만든 R2018 외부 참조 도면', () => {
  const cases: [string, string][] = [
    ['xref_attached.r2018.dwg', 'xref_attached.r2018.dxf'],
    ['E4_xref_unloaded.r2018.dwg', 'E4_xref_unloaded.r2018.dxf'],
    ['E4_xref_units_mm_host.r2018.dwg', 'E4_xref_units_mm_host.r2018.dxf'],
    ['E4_xref_units_inch_host.r2018.dwg', 'E4_xref_units_inch_host.r2018.dxf'],
  ];
  for (const [dwg, dxf] of cases) {
    it(`${dwg}: 같은 도면의 DXF와 외부 참조 블록·참조 이름이 같고, 같은 버전으로 되써도 남는다`, () => {
      const doc = readDwg(new Uint8Array(readFileSync(join(MADE, dwg))));
      expect(skipped(doc)).toEqual([]);
      const ref = readDxf(new Uint8Array(readFileSync(join(MADE, dxf))));
      const want = xrefBlocks(ref).sort((a, b) => a.name.localeCompare(b.name));
      expect(want.length).toBeGreaterThan(0);
      expect(xrefBlocks(doc).sort((a, b) => a.name.localeCompare(b.name))).toEqual(want);
      expect(insertNames(doc)).toEqual(insertNames(ref));
      const out = writeDwg(doc, { version: 'AC1032' });
      expect(out.warnings.filter((w) => w.code === 'dwg.write_missing_block')).toEqual([]);
      const back = readDwg(out.data);
      expect(skipped(back)).toEqual([]);
      expect(xrefBlocks(back).sort((a, b) => a.name.localeCompare(b.name))).toEqual(want);
      expect(insertNames(back)).toEqual(insertNames(ref));
    });

    it(`${dwg}: 불러오지 않은 상태가 DWG·DXF와 같고, DXF→DWG·DWG→DXF로 저장해도 그대로`, () => {
      const fromDwg = readDwg(new Uint8Array(readFileSync(join(MADE, dwg))));
      const fromDxf = readDxf(new Uint8Array(readFileSync(join(MADE, dxf))));
      const want = unloadedState(fromDxf);
      expect(unloadedState(fromDwg)).toBe(want);
      expect(unloadedState(readDwg(writeDwg(fromDxf, { version: 'AC1032' }).data))).toBe(want);
      expect(unloadedState(readDwg(writeDwg(fromDwg, { version: 'AC1032' }).data))).toBe(want);
      const dxfOut = writeDxf(fromDwg, { version: 'AC1032' }).data;
      expect(unloadedState(readDxf(dxfOut))).toBe(want);
      // DWG에서 쓴 DXF의 외부 참조 70 값이 AutoCAD가 쓴 DXF와 같다
      const ours = dxfBlockFlags(dxfOut);
      const theirs = dxfBlockFlags(new Uint8Array(readFileSync(join(MADE, dxf))));
      for (const b of fromDxf.blocks.values()) if (b.flags & 4) expect(ours.get(b.name)).toBe(theirs.get(b.name));
    });
  }

  it('E4_xref_unloaded: x_mm만 불러오지 않음', () => {
    const doc = readDwg(new Uint8Array(readFileSync(join(MADE, 'E4_xref_unloaded.r2018.dwg'))));
    expect(unloadedState(doc)).toBe('x_inch:loaded x_m:loaded x_mm:unloaded x_none:loaded');
  });
});
