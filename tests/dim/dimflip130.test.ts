/**
 * 130차: 치수 화살표 반전(AutoCAD "To Flip the Direction of an Arrowhead" — 치수를 고르고 오른쪽 클릭 "화살표 반전", AIDIMFLIPARROW)을 읽고 쓰기.
 * 반전은 치수마다 첫째·둘째 화살표 깃발이고, AutoCAD가 쓴 R2007+ DXF는 AcDbDimension 절의 42 뒤에 73·74·75를 적는다(실제 DXF 84개 치수 — 모두 0),
 * R2007+ DWG는 치수 공통 자료의 비트 셋(실제 DWG 744개의 R2007+ 치수 6,299개 가운데 반전 5개, 도면 3개).
 * 예전에는 리더가 버리고 쓰기가 0으로 써서, 반전한 치수를 저장하면 AutoCAD가 치수를 다시 그릴 때 반전이 풀렸다.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, DimensionEntity, Vec3 } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
import { createLinearDimension } from '../../src/edit/dim';
import { createNewDocument } from '../../src/core/newdoc';
import { writeDxf } from '../../src/io/dxf/writer';
import { writeDwg } from '../../src/io/dwg/writer/index';
import { readCadFile } from '../../src/io/index';

const V = (x: number, y: number, z = 0): Vec3 => ({ x, y, z });
/** 반전 없음·첫째·둘째·둘 다인 선형 치수 넷 */
const FLIPS: [boolean, boolean][] = [
  [false, false],
  [true, false],
  [false, true],
  [true, true],
];

function docWithDims(): CadDocument {
  const doc = createNewDocument('metric');
  const ms = doc.blocks.get(MODEL_SPACE)!;
  FLIPS.forEach(([f1, f2], i) => {
    const d = createLinearDimension(doc, V(0, i * 20), V(50, i * 20), V(25, i * 20 + 10));
    d.handle = `A${i}`;
    d.owner = ms.recordHandle;
    if (f1) d.flipArrow1 = true;
    if (f2) d.flipArrow2 = true;
    ms.entities.push(d);
    doc.entityIndex.set(d.handle, d);
  });
  return doc;
}

const dims = (doc: CadDocument): DimensionEntity[] => doc.blocks.get(MODEL_SPACE)!.entities.filter((e): e is DimensionEntity => e.type === 'DIMENSION');
const flips = (doc: CadDocument): [boolean, boolean][] => dims(doc).map((d) => [d.flipArrow1 === true, d.flipArrow2 === true]);

/** DXF 글에서 치수마다 AcDbDimension 절의 그룹 코드 차례 */
function dimSections(text: string): string[][] {
  const lines = text.split(/\r?\n/);
  const out: string[][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    if (lines[i]!.trim() !== '0' || lines[i + 1]!.trim() !== 'DIMENSION') continue;
    const seq: string[] = [];
    let sub = '';
    for (let j = i + 2; j + 1 < lines.length && lines[j]!.trim() !== '0'; j += 2) {
      const c = lines[j]!.trim();
      if (c === '100') sub = lines[j + 1]!.trim();
      else if (sub === 'AcDbDimension') seq.push(`${c}=${lines[j + 1]!.trim()}`);
    }
    out.push(seq);
  }
  return out;
}

describe('치수 화살표 반전(130차)', () => {
  it('R2007+ DXF·DWG로 써서 다시 읽으면 반전이 그대로다', () => {
    const doc = docWithDims();
    for (const [name, data] of [
      ['x.dxf', writeDxf(doc, { version: 'AC1032' }).data],
      ['x2007.dxf', writeDxf(doc, { version: 'AC1021' }).data],
      ['x.dwg', writeDwg(doc, { version: 'AC1032' }).data],
      ['x2010.dwg', writeDwg(doc, { version: 'AC1024' }).data],
    ] as const) {
      const back = readCadFile(data, name);
      expect(flips(back), name).toEqual(FLIPS);
      // 반전하지 않은 치수에는 깃발 칸이 생기지 않는다
      expect('flipArrow1' in dims(back)[0]!, name).toBe(false);
      expect('flipArrow2' in dims(back)[0]!, name).toBe(false);
    }
  });

  it('반전을 담을 자리가 없는 옛 판(R2004 이하 DWG·DXF)에는 쓰지 않는다', () => {
    const doc = docWithDims();
    for (const [name, data] of [
      ['x2004.dxf', writeDxf(doc, { version: 'AC1018' }).data],
      ['x12.dxf', writeDxf(doc, { version: 'AC1009' }).data],
      ['x2004.dwg', writeDwg(doc, { version: 'AC1018' }).data],
      ['x2000.dwg', writeDwg(doc, { version: 'AC1015' }).data],
    ] as const) {
      const back = readCadFile(data, name);
      expect(flips(back), name).toEqual(FLIPS.map(() => [false, false]));
    }
  });

  it('DXF는 반전한 치수에만 42 뒤 73·74·75를 AutoCAD 차례로 적고, 0으로 적힌 것은 반전이 아니다', () => {
    const text = new TextDecoder().decode(writeDxf(docWithDims(), { version: 'AC1032' }).data);
    const secs = dimSections(text);
    expect(secs).toHaveLength(4);
    /** 42 바로 뒤 세 칸(42가 꼭 있어야 한다) */
    const tail = (s: string[]) => {
      const i = s.findIndex((x) => x.startsWith('42='));
      expect(i).toBeGreaterThan(0);
      return s.slice(i + 1, i + 4);
    };
    expect(secs[0]!.some((x) => /^7[345]=/.test(x))).toBe(false);
    expect(tail(secs[1]!)).toEqual(['73=0', '74=1', '75=0']);
    expect(tail(secs[2]!)).toEqual(['73=0', '74=0', '75=1']);
    expect(tail(secs[3]!)).toEqual(['73=0', '74=1', '75=1']);
    // AutoCAD처럼 모든 치수에 73·74·75 = 0을 적은 DXF(반전한 치수는 그대로)
    const zeros = withZeroFlips(text);
    expect(tail(dimSections(zeros)[0]!)).toEqual(['73=0', '74=0', '75=0']);
    expect(flips(readCadFile(new TextEncoder().encode(zeros), 'z.dxf'))).toEqual(FLIPS);
  });
});

/** 치수의 AcDbDimension 절에서 42 뒤에 73이 없으면 73·74·75 = 0을 끼운다 */
function withZeroFlips(text: string): string {
  const lines = text.split('\r\n');
  const out: string[] = [];
  let ent = '';
  let sub = '';
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const c = lines[i]!.trim();
    const v = lines[i + 1]!;
    if (c === '0') {
      ent = v.trim();
      sub = '';
    } else if (c === '100') sub = v.trim();
    out.push(lines[i]!, v);
    if (ent === 'DIMENSION' && sub === 'AcDbDimension' && c === '42' && lines[i + 2]?.trim() !== '73') out.push(' 73', '0', ' 74', '0', ' 75', '0');
  }
  if (lines.length % 2) out.push(lines[lines.length - 1]!);
  return out.join('\r\n');
}
