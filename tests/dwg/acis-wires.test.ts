/**
 * ACIS(REGION·3DSOLID) 모서리 선: SAT(판 1.06·4·7, DWG R14·R2000, DXF R2000~R2010)·SAB(DWG R2004+ 본문, DXF R2013+ ACDSDATA,
 * DWG R2013+ 자료 저장소)에서 같은 선을 뽑아 그린다(전에는 그리지 않았다).
 * DWG에서 읽은 SAT는 R2000~R2010 DXF에 ACIS 객체로 그대로 쓴다.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AcisEntity, CadDocument, Entity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { decodeSatLine, encodeSatLine, satWires } from '../../src/io/acis';
import { decodeCaret } from '../../src/io/dxf/records';
import { caret } from '../../src/io/dxf/tagwriter';
import { readDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { buildSpace } from '../../src/render/build';
import { stretch } from '../../src/edit/geom/stretch';
import { transformEntity } from '../../src/edit/geom/transform';
import { affTranslate } from '../../src/edit/geom/math';
import { TextEngine } from '../../src/text/layout';
import { FIXTURES } from '../oracle/ezdxf';

/** 정사각형 영역(판 7.0: 객체 번호·역사 포인터, 변환으로 (10, 20) 옮김) + 원 모서리 하나 */
const SAT700 = [
  '700 0 1 0',
  '@4 test @12 ACIS 32.0 NT @24 Thu Oct 21 00:00:00 2026',
  '1 9.9999999999999995e-07 1e-10',
  'body $-1 -1 $-1 $1 $-1 $2 #',
  'lump $-1 -1 $-1 $-1 $-1 $0 #',
  'transform $-1 -1 1 0 0 0 1 0 0 0 1 10 20 0 1 no_rotate no_reflect no_shear #',
  'point $-1 -1 $-1 0 0 0 #',
  'point $-1 -1 $-1 4 0 0 #',
  'point $-1 -1 $-1 4 4 0 #',
  'point $-1 -1 $-1 0 4 0 #',
  'vertex $-1 -1 $-1 $-1 $3 #',
  'vertex $-1 -1 $-1 $-1 $4 #',
  'vertex $-1 -1 $-1 $-1 $5 #',
  'vertex $-1 -1 $-1 $-1 $6 #',
  'straight-curve $-1 -1 $-1 0 0 0 1 0 0 I I #',
  'edge $-1 -1 $-1 $7 0 $8 4 $-1 $11 forward @7 unknown #',
  'edge $-1 -1 $-1 $8 0 $9 4 $-1 $11 forward @7 unknown #',
  'edge $-1 -1 $-1 $9 0 $10 4 $-1 $11 forward @7 unknown #',
  'edge $-1 -1 $-1 $10 0 $7 4 $-1 $11 forward @7 unknown #',
  'point $-1 -1 $-1 2 2 0 #',
  'point $-1 -1 $-1 3 2 0 #',
  'vertex $-1 -1 $-1 $-1 $17 #',
  'ellipse-curve $-1 -1 $-1 2 2 0 0 0 1 1 0 0 1 I I #',
  'edge $-1 -1 $-1 $18 0 $18 6.2831853 $-1 $19 forward @7 unknown #',
  'End-of-ACIS-data',
].join('\n');

const round = (w: { x: number; y: number }[][]) => w.map((l) => l.map((p) => [+p.x.toFixed(6), +p.y.toFixed(6)]));

describe('SAT 해석', () => {
  it('직선 모서리 넷과 원 모서리, 몸체 변환', () => {
    const w = satWires(SAT700);
    expect(w.length).toBe(5);
    expect(round(w.slice(0, 4))).toEqual([
      [[10, 20], [14, 20]],
      [[14, 20], [14, 24]],
      [[14, 24], [10, 24]],
      [[10, 24], [10, 20]],
    ]);
    // 원(중심 12,22 반지름 1)은 닫힌 선
    const c = w[4]!;
    for (const p of c) expect(Math.hypot(p.x - 12, p.y - 22)).toBeCloseTo(1, 6);
    expect(Math.hypot(c[0]!.x - c.at(-1)!.x, c[0]!.y - c.at(-1)!.y)).toBeLessThan(1e-9);
  });
  it('AutoCAD의 글자 감춤(A → ^, DXF 파일에는 캐럿 표기 "^ ")을 풀고 다시 감춘다', () => {
    const line = 'body $-1 -1 $-1 $1 @3 ABC #';
    const enc = encodeSatLine(line);
    expect(enc).toContain('^');
    expect(enc).not.toContain('^ ');
    expect(decodeSatLine(enc)).toBe(line);
    // DXF로 쓰고 읽으면 "^ " → ^로 풀려 같은 줄(A 다음 공백도 잃지 않는다)
    const spaced = 'A A';
    expect(decodeSatLine(decodeCaret(caret(encodeSatLine(spaced))))).toBe(spaced);
  });
});

const D = (p: string) => join(FIXTURES, p);
describe.skipIf(!existsSync(D('samples/sample_AC1015.dwg')))('AutoCAD 표본: 판마다 같은 모서리', () => {
  const regionOf = (doc: CadDocument) => [...doc.blocks.values()].flatMap((b) => b.entities).find((e) => e.type === 'REGION') as AcisEntity;
  const ref = () => round(regionOf(readDwg(new Uint8Array(readFileSync(D('samples/sample_AC1015.dwg'))))).wires!);
  it('DWG R14(SAT 1.06)·R2000(SAT)·R2004~R2010(SAB 본문)·R2013/R2018(자료 저장소), DXF R2000(SAT)·R2010·R2018(ACDSDATA SAB)', () => {
    const want = ref();
    expect(want.length).toBe(7);
    for (const f of ['samples/sample_AC1014.dwg', 'samples/sample_AC1018.dwg', 'samples/sample_AC1021.dwg', 'samples/sample_AC1024.dwg', 'samples/sample_AC1027.dwg', 'samples/sample_AC1032.dwg']) {
      if (!existsSync(D(f))) continue;
      expect(round(regionOf(readDwg(new Uint8Array(readFileSync(D(f))))).wires!), f).toEqual(want);
    }
    for (const f of ['samples-dxf/sample_AC1015_ascii.dxf', 'samples-dxf/sample_AC1024_ascii.dxf', 'samples-dxf/sample_AC1032_ascii.dxf']) {
      if (!existsSync(D(f))) continue;
      expect(round(regionOf(readDxf(new Uint8Array(readFileSync(D(f))))).wires!), f).toEqual(want);
    }
  });
  it('DWG R2000의 SAT는 R2010 DXF에 ACIS 그대로, R2018 DXF에는 와이어로', () => {
    const doc = readDwg(new Uint8Array(readFileSync(D('samples/sample_AC1015.dwg'))));
    const out = writeDxf(doc, { version: 'AC1024' });
    expect(out.warnings.map((w) => w.code)).not.toContain('entity.acis_dropped');
    const back = readDxf(out.data);
    const r = regionOf(back);
    expect(r.type).toBe('REGION');
    expect(round(r.wires!)).toEqual(ref());
    const out18 = writeDxf(doc, { version: 'AC1032' });
    expect(out18.warnings.map((w) => w.code)).toContain('entity.acis_as_wires');
  });
  it('3DSOLID의 DXF 꼬리: R2000·R2004는 AcDbModelerGeometry만, R2007부터 100 AcDb3dSolid와 350(AutoCAD DXF와 같다)', () => {
    const doc = readDwg(new Uint8Array(readFileSync(D('samples/sample_AC1015.dwg'))));
    const tail = (ver: 'AC1015' | 'AC1018' | 'AC1021' | 'AC1024') => {
      const txt = new TextDecoder().decode(writeDxf(doc, { version: ver }).data).split(/\r?\n/).map((l) => l.trim());
      const i = txt.findIndex((l, k) => l === '3DSOLID' && txt[k - 1] === '0');
      expect(i).toBeGreaterThan(0);
      const rec: string[] = [];
      for (let k = i + 1; k + 1 < txt.length && txt[k] !== '0'; k += 2) if (txt[k] === '100' || txt[k] === '350') rec.push(`${txt[k]}=${txt[k + 1]}`);
      return rec;
    };
    expect(tail('AC1015')).toEqual(['100=AcDbEntity', '100=AcDbModelerGeometry']);
    expect(tail('AC1018')).toEqual(['100=AcDbEntity', '100=AcDbModelerGeometry']);
    expect(tail('AC1021')).toEqual(['100=AcDbEntity', '100=AcDbModelerGeometry', '100=AcDb3dSolid', '350=0']);
    expect(tail('AC1024')).toEqual(['100=AcDbEntity', '100=AcDbModelerGeometry', '100=AcDb3dSolid', '350=0']);
  });
  it.skipIf(!existsSync(D('samples/sample_AC1014.dwg')))('R14의 SAT 1.06은 DXF로 옮기지 않고 와이어로', () => {
    const doc = readDwg(new Uint8Array(readFileSync(D('samples/sample_AC1014.dwg'))));
    expect(regionOf(doc).sat).toBeUndefined();
    expect(writeDxf(doc, { version: 'AC1024' }).warnings.map((w) => w.code)).toContain('entity.acis_as_wires');
  });
  it('그린다(전에는 entity.not_drawn)', () => {
    const doc = readDwg(new Uint8Array(readFileSync(D('samples/sample_AC1027.dwg'))));
    const s = buildSpace(doc, MODEL_SPACE, { text: new TextEngine(null) });
    expect(s.warnings.find((w) => w.code === 'entity.not_drawn')).toBeUndefined();
  });
});

describe('망가진 SAT', () => {
  it('넙스 매듭 겹침이 터무니없으면(10억) 그 곡선은 두 꼭짓점을 잇는 선으로(멈추지 않는다)', () => {
    const sat = [
      '400 0 1 0',
      '@7 OpenCAD 12 ACIS 7.0 NT 24 Thu Oct 22 00:00:00 2026',
      '1 9.9999999999999995e-07 1e-10',
      'body $-1 $1 $-1 $-1 #',
      'lump $-1 $-1 $2 $0 #',
      'shell $-1 $-1 $-1 $-1 $-1 $1 #',
      'edge $-1 $4 $5 $-1 $6 forward #',
      'vertex $-1 $3 $7 #',
      'vertex $-1 $3 $8 #',
      'intcurve-curve $-1 forward { exactcur nubs 3 open 2 0 1000000000 1 1000000000 0 0 0 1 0 0 2 0 0 3 0 0 0 } #',
      'point $-1 0 0 0 #',
      'point $-1 3 0 0 #',
      'End-of-ACIS-data',
    ].join('\n');
    const t0 = performance.now();
    const w = satWires(sat);
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(round(w)).toEqual([
      [
        [0, 0],
        [3, 0],
      ],
    ]);
  });
});

describe('자료가 없는 ACIS 객체', () => {
  it('그리지 않고 알린다', () => {
    const doc = createNewDocument('metric');
    doc.blocks.get(MODEL_SPACE)!.entities.push({ ...entityDefaults(), handle: '7F0', type: 'REGION' } as Entity);
    const s = buildSpace(doc, MODEL_SPACE, { text: new TextEngine(null) });
    expect(s.warnings.map((w) => w.code)).toContain('entity.not_drawn');
  });
});

describe('ACIS 자료가 있는 객체의 편집', () => {
  it('일부만 걸친 STRETCH와 MOVE는 모서리 선만 바꾸지 않는다(저장하면 원래 형상으로 돌아가므로)', () => {
    const doc = createNewDocument('metric');
    const e = { ...entityDefaults(), handle: '7F1', type: 'REGION', wires: satWires(SAT700), sat: SAT700 } as AcisEntity;
    doc.blocks.get(MODEL_SPACE)!.entities.push(e);
    const r = stretch([e], [{ x: 9, y: 19 }, { x: 12, y: 19 }, { x: 12, y: 25 }, { x: 9, y: 25 }], { x: 5, y: 0 }, doc);
    expect(r.replace ?? []).toEqual([]);
    expect(transformEntity(e, affTranslate(5, 0), doc).replace ?? []).toEqual([]);
    // ACIS 자료가 없으면(와이어만) 늘인다
    const bare = { ...entityDefaults(), handle: '7F2', type: 'REGION', wires: satWires(SAT700) } as AcisEntity;
    expect(stretch([bare], [{ x: 9, y: 19 }, { x: 12, y: 19 }, { x: 12, y: 25 }, { x: 9, y: 25 }], { x: 5, y: 0 }, doc).replace?.length).toBe(1);
  });
});
