/**
 * 124차: R2018 이전 판의 여러 줄 속성(정의). R2018 아래 판에는 끼운 MTEXT 칸이 없어 AutoCAD는 한 줄 속성으로 쓰고
 * 확장 사전에 ACAD_MLATT XRECORD(MText 플래그·태그·MTEXT 자료)와 ACAD_XREC_ROUNDTRIP(ACAD_MATT_HEIGHT)를 둔다
 * (DXF 참조서 ATTRIB의 AcDbXrecord 절, AutoCAD가 같은 도면을 R2018·R2013·R2010·R2007·R2004·R2000·R14로 쓴 표본).
 * 123차까지는 그 기록을 읽지 않아 옛 판 속성을 한 줄 문자(태그 뒤 "_001")로 보였고, R2018 아래로 쓰면 DWG는 본문 글("")을 써서 값이 사라지고
 * DXF는 한 줄 문자가 됐다.
 */
import { describe, expect, it } from 'vitest';
import type { AttribEntity, BlockDef, CadDocument, DictionaryObject, Entity, InsertEntity, MTextEntity, XRecordObject } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { readCadFile } from '../../src/io/index';
import { writeDwg } from '../../src/io/dwg';
import { writeDxf } from '../../src/io/dxf/writer';
import { restoreMultilineAttribs } from '../../src/io/mlattr';
import { multilineAttribsForWrite } from '../../src/io/mlattr-write';

const P = (x: number, y: number) => ({ x, y, z: 0 });

function mtext(text: string, x: number, y: number, h: number): MTextEntity {
  return {
    ...entityDefaults(),
    type: 'MTEXT',
    handle: '',
    insert: P(x, y),
    height: h,
    width: 0,
    rectHeight: 0,
    attachment: 1,
    drawingDirection: 5,
    text,
    style: 'Standard',
    rotation: 0,
    lineSpacingStyle: 1,
    lineSpacingFactor: 1,
    backgroundFlags: 0,
    backgroundScale: 1.5,
  } as MTextEntity;
}

function attrib(type: 'ATTRIB' | 'ATTDEF', handle: string, tag: string, value: string, x: number, y: number, h: number): AttribEntity {
  return {
    ...entityDefaults(),
    type,
    handle,
    insert: P(x, y - h),
    alignPoint: P(x, y),
    height: h,
    // AutoCAD가 쓴 R2018 여러 줄 속성은 본문 글이 ""이고 세로 맞춤이 위(3)다
    text: '',
    rotation: 0,
    widthFactor: 1,
    oblique: 0,
    style: 'Standard',
    generation: 0,
    halign: 0,
    valign: 3,
    tag,
    attFlags: 0,
    lockPosition: true,
    mtext: mtext(value, x, y, h),
    ...(type === 'ATTDEF' ? { prompt: '메모' } : {}),
  } as AttribEntity;
}

/** 블록 MB(여러 줄 속성 정의 NOTE)와 그 참조(여러 줄 속성 값 "L1\PL2") */
function makeDoc(): CadDocument {
  const doc = createNewDocument('metric');
  const def = attrib('ATTDEF', '9001', 'NOTE', 'D1\\PD2', 1, 2, 0.5);
  const blk: BlockDef = { name: 'MB', handle: '9002', recordHandle: '9003', endHandle: '9004', basePoint: P(0, 0), flags: 2, entities: [def as Entity], layer: '0' };
  doc.blocks.set('MB', blk);
  doc.blockRecords.set('MB', { name: 'MB', handle: '9003', flags: 0, insertUnits: 4, explodable: true, scalable: true });
  const att = attrib('ATTRIB', '9006', 'NOTE', 'L1\\PL2', 11, 22, 1.5);
  att.owner = '9005';
  const ins: InsertEntity = {
    ...entityDefaults(),
    type: 'INSERT',
    handle: '9005',
    block: 'MB',
    insert: P(10, 20),
    scale: { x: 3, y: 3, z: 1 },
    rotation: 0,
    columnCount: 1,
    rowCount: 1,
    columnSpacing: 0,
    rowSpacing: 0,
    attribs: [att],
  } as InsertEntity;
  doc.blocks.get(MODEL_SPACE)!.entities.push(ins as Entity);
  for (const e of [def, att, ins] as Entity[]) doc.entityIndex.set(e.handle, e);
  return doc;
}

const insertOf = (doc: CadDocument) => doc.blocks.get(MODEL_SPACE)!.entities.find((e) => e.type === 'INSERT') as InsertEntity;
const defOf = (doc: CadDocument) => doc.blocks.get('MB')!.entities.find((e) => e.type === 'ATTDEF') as AttribEntity;
const mlattObjects = (doc: CadDocument) => [...doc.objects.values()].filter((o) => o.type === 'XRECORD' && (o as XRecordObject).data.some((t) => t.value === 'Embedded Object'));

type Save = { kind: 'dwg' | 'dxf'; version: string };
const saves: Save[] = [
  { kind: 'dwg', version: 'AC1027' },
  { kind: 'dwg', version: 'AC1018' },
  { kind: 'dwg', version: 'AC1015' },
  { kind: 'dxf', version: 'AC1027' },
  { kind: 'dxf', version: 'AC1021' },
  { kind: 'dxf', version: 'AC1015' },
];
const save = (doc: CadDocument, s: Save): Uint8Array => (s.kind === 'dwg' ? writeDwg(doc, { version: s.version as 'AC1027' }).data : writeDxf(doc, { version: s.version as 'AC1027' }).data);

describe('R2018 아래 판으로 저장', () => {
  for (const s of saves) {
    it(`${s.kind} ${s.version}: 여러 줄 속성(정의)이 값·태그·자리 그대로 돌아온다`, () => {
      const back = readCadFile(save(makeDoc(), s), 'b.' + s.kind);
      const a = insertOf(back).attribs[0]!;
      expect(a.tag).toBe('NOTE');
      expect(a.text).toBe('');
      expect(a.mtext?.text).toBe('L1\\PL2');
      expect(a.mtext!.insert.x).toBeCloseTo(11, 9);
      expect(a.mtext!.insert.y).toBeCloseTo(22, 9);
      expect(a.mtext!.height).toBeCloseTo(1.5, 9);
      expect(a.mtext!.attachment).toBe(1);
      // 읽은 뒤에는 R2018과 같은 모양 — 기록과 빈 확장 사전은 남지 않는다
      expect(a.xdict).toBeUndefined();
      const d = defOf(back);
      expect(d.mtext?.text).toBe('D1\\PD2');
      expect(d.tag).toBe('NOTE');
      expect(d.xdict).toBeUndefined();
      expect(mlattObjects(back)).toEqual([]);
    });
  }

  it('DXF R12: 확장 사전이 없어 한 줄 속성의 글은 여러 줄 값의 평문(줄은 빈칸)', () => {
    const back = readCadFile(writeDxf(makeDoc(), { version: 'AC1009' }).data, 'b.dxf');
    const a = insertOf(back).attribs[0]!;
    expect(a.mtext).toBeUndefined();
    expect(a.text).toBe('L1 L2');
  });

  it('DXF AC1027: ACAD_MLATT 자료 차례가 AutoCAD가 쓴 표본과 같다', () => {
    const text = new TextDecoder().decode(writeDxf(makeDoc(), { version: 'AC1027' }).data).replace(/\r/g, '');
    const lines = text.split('\n');
    const at = lines.findIndex((l, i) => l === 'Embedded Object' && lines[i - 2] === 'NOTE' && lines.slice(Math.max(0, i - 40), i).includes('AcDbXrecord'));
    expect(at).toBeGreaterThan(0);
    let s = at;
    while (lines[s] !== 'AcDbXrecord') s--;
    const codes: number[] = [];
    for (let i = s + 1; i < lines.length - 1; i += 2) {
      const c = Number(lines[i]!.trim());
      if (c === 0) break;
      codes.push(c);
    }
    // 280 복제, 70 MText 플래그·잠김·보조 수, 40 주석 축척, 2 태그, 1 Embedded Object, 10·20·30, 40, 41, 46, 71, 72, 1 글, 73, 44
    expect(codes).toEqual([280, 70, 70, 70, 40, 2, 1, 10, 20, 30, 40, 41, 46, 71, 72, 1, 73, 44]);
    expect(lines.filter((l) => l === 'ACAD_MLATT')).toHaveLength(2);
    expect(lines.filter((l) => l === 'ACAD_MATT_HEIGHT')).toHaveLength(2);
  });

  it('R2018은 예전처럼 끼운 MTEXT(기록 없음)', () => {
    for (const s of [
      { kind: 'dwg', version: 'AC1032' },
      { kind: 'dxf', version: 'AC1032' },
    ] as Save[]) {
      const data = save(makeDoc(), s);
      expect(new TextDecoder('latin1').decode(data).includes('ACAD_MLATT')).toBe(false);
      const a = insertOf(readCadFile(data, 'b.' + s.kind)).attribs[0]!;
      expect(a.mtext?.text).toBe('L1\\PL2');
    }
  });

  it('고친 값을 쓰고, 원래 문서는 바꾸지 않으며, 다른 확장 사전 항목은 지킨다', () => {
    const doc = makeDoc();
    const a = insertOf(doc).attribs[0]!;
    a.text = '옛 값';
    // R2007 이전 DXF는 비ASCII를 \U+로 쓰고 MTEXT 글은 그 꼴 그대로 읽으므로 ASCII 값으로 본다
    a.mtext!.text = 'NEW\\PVALUE';
    const other: XRecordObject = { type: 'XRECORD', handle: '9101', owner: '9100', reactors: ['9100'], cloning: 1, data: [{ code: 1, value: '다른 기록' }] };
    const dict: DictionaryObject = { type: 'DICTIONARY', handle: '9100', owner: '9006', entries: new Map([['MYREC', '9101']]), hardOwner: true, cloning: 1 };
    doc.objects.set('9100', dict);
    doc.objects.set('9101', other);
    a.xdict = '9100';
    const before = doc.objects.size;
    const out = multilineAttribsForWrite(doc, 'AC1027');
    expect(doc.objects.size).toBe(before);
    expect([...dict.entries.keys()]).toEqual(['MYREC']);
    expect(insertOf(doc).attribs[0]!.text).toBe('옛 값');
    const oa = insertOf(out).attribs[0]!;
    expect(oa.text).toBe('NEW VALUE');
    expect([...(out.objects.get('9100') as DictionaryObject).entries.keys()]).toEqual(['MYREC', 'ACAD_MLATT', 'ACAD_XREC_ROUNDTRIP']);
    for (const s of saves) {
      const back = readCadFile(save(doc, s), 'b.' + s.kind);
      const b = insertOf(back).attribs[0]!;
      expect(b.mtext?.text, `${s.kind} ${s.version}`).toBe('NEW\\PVALUE');
      const d = back.objects.get(b.xdict!.toUpperCase()) as DictionaryObject;
      expect([...d.entries.keys()]).toEqual(['MYREC']);
    }
  });
});

describe('옛 판 읽기(AutoCAD가 쓴 꼴)', () => {
  /** AutoCAD R2013 DXF 표본과 같은 꼴: 한 줄 속성(태그 _001, 글 = 값)과 확장 사전(정수는 DXF 글자 그대로) */
  function legacyDoc(extra = false): CadDocument {
    const doc = makeDoc();
    const a = insertOf(doc).attribs[0]!;
    delete a.mtext;
    a.tag = 'NOTE_001';
    a.text = 'L1 L2';
    a.valign = 0;
    delete a.alignPoint;
    a.xdict = '12E9';
    const entries = new Map([
      ['ACAD_MLATT', '12EB'],
      ['ACAD_XREC_ROUNDTRIP', '12EA'],
    ]);
    if (extra) entries.set('MYREC', '12EC');
    doc.objects.set('12E9', { type: 'DICTIONARY', handle: '12E9', owner: '9006', entries, hardOwner: true, cloning: 1 } as DictionaryObject);
    doc.objects.set('12EB', {
      type: 'XRECORD',
      handle: '12EB',
      owner: '12E9',
      reactors: ['12E9'],
      cloning: 1,
      data: [
        { code: 70, value: '     2' },
        { code: 70, value: '     0' },
        { code: 70, value: '     0' },
        { code: 40, value: 1 },
        { code: 2, value: 'NOTE' },
        { code: 1, value: 'Embedded Object' },
        { code: 10, value: '11' },
        { code: 20, value: 22 },
        { code: 30, value: 0 },
        { code: 40, value: 1.5 },
        { code: 41, value: 0 },
        { code: 46, value: 0 },
        { code: 71, value: '     1' },
        { code: 72, value: '     5' },
        { code: 1, value: 'L1\\PL2' },
        { code: 73, value: '     1' },
        { code: 44, value: 1 },
      ],
    } as XRecordObject);
    const rt = [
      { code: 102, value: 'ACAD_MATT_HEIGHT' },
      { code: 140, value: 1.5 },
    ];
    if (extra) rt.unshift({ code: 102, value: 'OTHER' }, { code: 70, value: 1 });
    doc.objects.set('12EA', { type: 'XRECORD', handle: '12EA', owner: '12E9', reactors: ['12E9'], cloning: 1, data: rt } as XRecordObject);
    if (extra) doc.objects.set('12EC', { type: 'XRECORD', handle: '12EC', owner: '12E9', cloning: 1, data: [{ code: 1, value: 'x' }] } as XRecordObject);
    return doc;
  }

  it('ACAD_MLATT → 끼운 MTEXT·XRECORD의 태그·본문 글 "", 기록과 빈 사전은 지운다', () => {
    const doc = legacyDoc();
    expect(restoreMultilineAttribs(doc)).toBe(1);
    const a = insertOf(doc).attribs[0]!;
    expect(a.tag).toBe('NOTE');
    expect(a.text).toBe('');
    expect(a.mtext).toMatchObject({ type: 'MTEXT', handle: '9006', text: 'L1\\PL2', insert: P(11, 22), height: 1.5, attachment: 1, drawingDirection: 5, width: 0, rectHeight: 0, style: 'Standard' });
    expect(a.xdict).toBeUndefined();
    for (const h of ['12E9', '12EA', '12EB']) expect(doc.objects.has(h)).toBe(false);
  });

  it('사전의 다른 항목과 ROUNDTRIP의 다른 절은 남긴다', () => {
    const doc = legacyDoc(true);
    restoreMultilineAttribs(doc);
    const a = insertOf(doc).attribs[0]!;
    expect(a.mtext?.text).toBe('L1\\PL2');
    expect(a.xdict).toBe('12E9');
    const d = doc.objects.get('12E9') as DictionaryObject;
    expect([...d.entries.keys()]).toEqual(['ACAD_XREC_ROUNDTRIP', 'MYREC']);
    expect((doc.objects.get('12EA') as XRecordObject).data).toEqual([
      { code: 102, value: 'OTHER' },
      { code: 70, value: 1 },
    ]);
    expect(doc.objects.has('12EB')).toBe(false);
  });

  it('MText 플래그가 2·4가 아니거나 Embedded Object가 없으면 그대로', () => {
    const doc = legacyDoc();
    const x = doc.objects.get('12EB') as XRecordObject;
    x.data = x.data.map((t, i) => (i === 0 ? { code: 70, value: 1 } : t));
    expect(restoreMultilineAttribs(doc)).toBe(0);
    expect(insertOf(doc).attribs[0]!.tag).toBe('NOTE_001');
    expect(doc.objects.has('12EB')).toBe(true);
  });

  it('옛 판 꼴 문서를 R2018로 쓰면 끼운 MTEXT, R2013으로 쓰면 기록 하나만', () => {
    const doc = legacyDoc();
    restoreMultilineAttribs(doc);
    const r18 = readCadFile(writeDwg(doc, { version: 'AC1032' }).data, 'b.dwg');
    expect(insertOf(r18).attribs[0]!.mtext?.text).toBe('L1\\PL2');
    const raw = writeDxf(doc, { version: 'AC1027' }).data;
    const lines = new TextDecoder().decode(raw).replace(/\r/g, '').split('\n');
    // 속성 정의 하나·속성 하나
    expect(lines.filter((l) => l === 'ACAD_MLATT')).toHaveLength(2);
  });
});
