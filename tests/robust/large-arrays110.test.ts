/**
 * 110차: 도면 크기를 따르는 배열을 함수 인자로 펼쳐 넘기던 곳(push(...)·unshift(...)·splice(…, ...)·Math.max(...)·
 * String.fromCharCode(...)·String.fromCodePoint(...))이 요소가 많으면 RangeError(Maximum call stack size exceeded)로 죽던 결함.
 * 한도는 Node 약 15만 개, 브라우저 메인 스레드 약 12만·작업자 약 6.3만 개다(42·109차와 같은 꼴). 아래 시험은 모두 20만 개 꼴이다.
 */
import { describe, expect, it, vi } from 'vitest';

const { formAnswers } = vi.hoisted(() => ({ formAnswers: [] as (Record<string, boolean> | null)[] }));
vi.mock('../../src/app/ui/dom', async (orig) => ({
  ...(await orig<object>()),
  form: vi.fn(async () => formAnswers.shift() ?? null),
}));

import type { AttribEntity, CadDocument, Entity, InsertEntity, LineEntity, SplineEntity, TextEntity, XRecordObject } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { charsOf, codePointsOf, insertAll, unshiftAll } from '../../src/core/arrays';
import { registerEditCommands } from '../../src/app/editcmds';
import { registerDashTableCommands } from '../../src/app/dashcmds-tables';
import { attRedefOps } from '../../src/edit/blkcmds/attredef';
import { xbindOps } from '../../src/edit/blkcmds/xref';
import { writeDxf } from '../../src/io/dxf/writer';
import { buildSpace } from '../../src/render/build';
import { TextEngine } from '../../src/text/layout';
import { DocState } from '../../src/app/docstate';
import { EditSession } from '../../src/edit/session';
import { PdfResources, modelPage, pdfContent } from '../../src/app/export';
import { insertItems, itemsIn, mtextMeaning, parseRich, serializeRich } from '../../src/text/mtextedit';
import { plainText } from '../../src/app/inquiry';
import { colWidths } from '../../src/app/dataextract';
import { sortForCount } from '../../src/edit/express/tcount';
import { DEFAULT_OPTIONS, entitySignature } from '../../src/edit/compare/signature';
import { piecesNurbs } from '../../src/edit/geom/path';
import type { LinePiece } from '../../src/edit/geom/curve';
import { makeHarness } from '../cmds2/harness';
import { makeLispApp } from '../lisp/app';

/** Node 한도(약 15만 개)보다 많은 수 */
const N = 200_000;
const hx = (n: number) => n.toString(16).toUpperCase();
const line = (handle: string, o: Partial<LineEntity> = {}): LineEntity => ({ ...entityDefaults(), type: 'LINE', handle, start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 0, z: 0 }, ...o });
const put = (doc: CadDocument, e: Entity, block = MODEL_SPACE) => {
  doc.blocks.get(block)!.entities.push(e);
  doc.entityIndex.set(e.handle, e);
};

describe('배열 함수(110차)', () => {
  it('unshiftAll·insertAll·charsOf·codePointsOf는 펼침과 같고 인자 한도가 없다', () => {
    for (const [a, b] of [
      [[1, 2], [3]],
      [[], [4, 5]],
      [[6], []],
    ] as [number[], number[]][]) {
      const x = [...a];
      const y = [...a];
      unshiftAll(x, b);
      y.unshift(...b);
      expect(x).toEqual(y);
      for (const at of [0, 1, -1, 5]) {
        const p = [...a];
        const q = [...a];
        insertAll(p, at, b);
        q.splice(at, 0, ...b);
        expect(p).toEqual(q);
      }
    }
    const self = [1, 2];
    unshiftAll(self, self);
    expect(self).toEqual([1, 2, 1, 2]);
    const big = Array.from({ length: N }, (_, i) => i);
    const to = [-1, -2];
    unshiftAll(to, big);
    insertAll(to, N + 1, big);
    expect([to.length, to[0], to[N - 1], to[N], to[N + 1], to.at(-1)]).toEqual([2 * N + 2, 0, N - 1, -1, 0, -2]);
    const codes = Array.from({ length: N }, (_, i) => 0x41 + (i % 26));
    const s = charsOf(codes);
    expect([s.length, s.slice(0, 3), s.slice(-1)]).toEqual([N, 'ABC', String.fromCharCode(0x41 + ((N - 1) % 26))]);
    expect(charsOf([0x41, 0x42, 0], 2)).toBe('AB');
    expect(charsOf(codes, 9000)).toBe(String.fromCharCode(...codes.slice(0, 9000)));
    const pts = Array.from({ length: N }, (_, i) => (i % 2 ? 0x1f600 : 0xac00));
    expect(codePointsOf(pts).length).toBe(N * 1.5);
    expect(() => codePointsOf([-1])).toThrow(RangeError);
  });
});

describe('PURGE·-PURGE(110차)', () => {
  function harness(apps: number, zero: number) {
    const h = makeHarness((doc) => {
      Object.assign(doc, createNewDocument('metric'));
      for (let i = 0; i < apps; i++) doc.appIds.set(`APP${i}`, { name: `APP${i}`, handle: hx(0x100000 + i), flags: 0 });
      for (let i = 0; i < zero; i++) put(doc, line(hx(0x200000 + i), { start: { x: i, y: 0, z: 0 }, end: { x: i, y: 0, z: 0 } }));
    });
    registerEditCommands(h.app);
    registerDashTableCommands(h.app);
    return h;
  }

  it('-PURGE 등록된 응용프로그램 20만 개', async () => {
    const h = harness(N, 0);
    await h.run('-PURGE', ['R', '*', 'N']);
    expect([...h.doc.appIds.keys()].filter((k) => k.startsWith('APP')).length).toBe(0);
  });

  it('PURGE 대화 상자: 0 길이 형상 20만 개와 등록된 응용프로그램 20만 개', async () => {
    const h = harness(N, N);
    formAnswers.push({ regApps: true, zeroEmpty: true });
    await h.run('PURGE', []);
    expect([h.doc.blocks.get(MODEL_SPACE)!.entities.length, [...h.doc.appIds.keys()].filter((k) => k.startsWith('APP')).length]).toEqual([0, 0]);
    expect(h.st.session.undo()).toBeTruthy();
    expect(h.doc.blocks.get(MODEL_SPACE)!.entities.length).toBe(N);
  });
});

describe('블록·외부 참조(110차)', () => {
  it('ATTREDEF: 참조 20만 개를 새 정의에 맞춘다', () => {
    const doc = createNewDocument('metric');
    doc.blocks.set('B', { name: 'B', handle: 'B01', recordHandle: 'B02', basePoint: { x: 0, y: 0, z: 0 }, flags: 0, entities: [line('B03', { owner: 'B02' })], endHandle: 'B04' });
    doc.blockRecords.set('B', { name: 'B', handle: 'B02', flags: 0, insertUnits: 0, explodable: true, scalable: true });
    for (let i = 0; i < N; i++)
      put(doc, { ...entityDefaults(), type: 'INSERT', handle: hx(0x100000 + i), block: 'B', insert: { x: i, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, rotation: 0, columnCount: 1, rowCount: 1, columnSpacing: 0, rowSpacing: 0, attribs: [] } as InsertEntity);
    const att = { ...entityDefaults(), type: 'ATTDEF', handle: 'C01', insert: { x: 0, y: 0, z: 0 }, height: 1, text: 'v', rotation: 0, widthFactor: 1, oblique: 0, style: 'Standard', generation: 0, halign: 0, valign: 0, tag: 'T', prompt: 'p', attFlags: 0 } as AttribEntity;
    put(doc, att as unknown as Entity);
    let n = 0x400000;
    const r = attRedefOps(doc, 'B', MODEL_SPACE, ['C01'], { x: 0, y: 0, z: 0 }, () => hx(n++));
    expect(r.references).toBe(N);
    expect(r.ops.filter((o) => o.kind === 'modify').length).toBe(N);
  });

  it('XBIND: 결합한 도면층을 쓰는 객체 20만 개의 이름을 바꾼다', () => {
    const doc = createNewDocument('metric');
    doc.blocks.set('X', { name: 'X', handle: 'B01', recordHandle: 'B02', basePoint: { x: 0, y: 0, z: 0 }, flags: 4, entities: [], endHandle: 'B03', xrefPath: 'x.dwg' } as never);
    doc.blockRecords.set('X', { name: 'X', handle: 'B02', flags: 4, insertUnits: 0, explodable: true, scalable: true });
    doc.layers.set('X|A', { ...doc.layers.get('0')!, name: 'X|A', handle: 'B05', flags: 16 | 32 });
    for (let i = 0; i < N; i++) put(doc, line(hx(0x100000 + i), { layer: 'X|A' }));
    let n = 0x400000;
    const r = xbindOps(doc, 'X', [{ kind: 'layer', name: 'X|A' }], null, () => hx(n++));
    expect(r.failed).toEqual([]);
    expect(r.ops.filter((o) => o.kind === 'modify').length).toBe(N);
  });
});

describe('파일 쓰기·LISP(110차)', () => {
  it('DXF 쓰기: 태그 20만 개인 ACDSDATA 레코드', () => {
    const doc = createNewDocument('metric');
    const tags = [{ code: 0, value: 'ACDSRECORD' }, { code: 90, value: 1 }, { code: 2, value: 'AcDbDs::ID' }];
    for (let i = 0; i < N; i++) tags.push({ code: 310, value: '00FF' });
    doc.rawSections = [{ name: 'ACDSDATA', version: 'AC1032', tags }];
    const text = new TextDecoder().decode(writeDxf(doc).data);
    expect((text.match(/\n *310\r?\n00FF(?=\r?\n)/g) ?? []).length).toBe(N);
  });

  it('LISP entget: 자료 20만 개인 XRECORD', async () => {
    const h = makeLispApp((doc) => {
      const data = Array.from({ length: N }, (_, i) => ({ code: 1, value: `v${i}` }));
      doc.objects.set('ABC01', { type: 'XRECORD', handle: 'ABC01', owner: '0', cloning: 1, data } as XRecordObject);
    });
    await h.lisp('(length (entget (handent "ABC01")))');
    expect(h.errors()).toEqual([]);
    expect(Number(h.printed.at(-1)?.text)).toBeGreaterThan(N);
  });
});

describe('PDF 내보내기(110차)', () => {
  it('같은 스타일의 채운 삼각형 20만 개와 숨은 검색 글자 20만 개', () => {
    const doc = createNewDocument('metric');
    for (let i = 0; i < N / 2; i++) {
      const x = (i % 400) * 2;
      const y = Math.floor(i / 400) * 2;
      put(doc, { ...entityDefaults(), type: 'SOLID', handle: hx(0x100000 + i), points: [{ x, y, z: 0 }, { x: x + 1, y, z: 0 }, { x, y: y + 1, z: 0 }, { x: x + 1, y: y + 1, z: 0 }], invisibleEdges: 0 } as unknown as Entity);
    }
    for (let i = 0; i < 1000; i++)
      put(doc, { ...entityDefaults(), type: 'TEXT', handle: hx(0x300000 + i), insert: { x: 0, y: -10 - i * 2, z: 0 }, height: 1, text: 'A'.repeat(200), rotation: 0, widthFactor: 1, oblique: 0, style: 'Standard', generation: 0, halign: 0, valign: 0 } as TextEntity);
    const st = new DocState(1, doc, 't.dwg', 0, 0);
    st.session = new EditSession(doc, () => {});
    const s = buildSpace(doc, MODEL_SPACE, { text: new TextEngine(null) });
    st.addScene({ upload: () => ({}), dispose: () => {} } as never, { list: s.list, styles: s.styles.specs, layers: s.layers, layerIndex: [...s.layerIndex], warnings: s.warnings, ms: 0 }, MODEL_SPACE);
    const page = modelPage(st, [-10, -2100, 810, 520], 800, 800, 1, 1, { lineweights: true })!;
    const c = pdfContent(page, [], new PdfResources());
    expect((c.match(/ l h/g) ?? []).length).toBe(N);
    expect((c.match(/Tj/g) ?? []).length).toBe(N);
  });
});

describe('여러 줄 문자·문자열(110차)', () => {
  const big = 'A'.repeat(N);

  it('제자리 편집기: 문자 서식으로 쓰기·붙여 넣기·고른 조각·뜻 비교', () => {
    const d = parseRich(big);
    expect(serializeRich(d, { mode: 'text' }).length).toBe(N);
    expect(itemsIn(d, 0, N).length).toBe(N);
    const e = parseRich('xy');
    expect(insertItems(e, 1, itemsIn(d, 0, N))).toBe(N + 1);
    expect(serializeRich(e, { mode: 'text' })).toBe(`x${big}y`);
    const m = mtextMeaning(big) as { runs: { text: string }[] }[];
    expect(m[0]!.runs.map((r) => r.text).join('').length).toBe(N);
  });

  it('조회 명령의 보이는 글자(%%코드 풀기)', () => {
    const sym = plainText('%%c');
    expect(sym).not.toBe('%%c');
    expect(plainText(`${big}%%c`)).toBe(`${big}${sym}`);
  });
});

describe('선택·추출·비교·곡선(110차)', () => {
  it('데이터 추출 표의 열 폭: 행 20만 개', () => {
    const w = colWidths({ columns: ['이름', '수'], rows: Array.from({ length: N }, (_, i) => [i === 7 ? 'WIDEST-NAME' : 'a', '1']) }, 1, 0.5);
    expect(w[0]).toBeCloseTo('WIDEST-NAME'.length * 0.62 + 1, 6);
  });

  it('TCOUNT 정렬: 문자 20만 개', () => {
    const items = Array.from({ length: N }, (_, i) => ({ handle: hx(i), p: { x: N - i, y: 0 } }));
    const order = sortForCount(items, 'X');
    expect([order.length, order[0], order.at(-1)]).toEqual([N, hx(N - 1), hx(0)]);
  });

  it('COMPARE 서명: 매듭 20만 개 스플라인', () => {
    const k = N;
    const cv = new Float64Array((k - 4) * 3).map((_, i) => i);
    const sp = { ...entityDefaults(), type: 'SPLINE', handle: 'S1', flags: 8, degree: 3, knots: Array.from({ length: k }, (_, i) => i), controlVerts: cv, fitVerts: new Float64Array(0), weights: Array.from({ length: k - 4 }, () => 1) } as unknown as SplineEntity;
    const s = entitySignature(sp, DEFAULT_OPTIONS);
    expect(s).toBeTruthy();
  });

  it('조각 20만 개를 NURBS 하나로', () => {
    const pieces: LinePiece[] = Array.from({ length: N }, (_, i) => ({ k: 'line', a: { x: i, y: 0 }, b: { x: i + 1, y: 0 } }));
    const n = piecesNurbs(pieces);
    expect(n).not.toBeNull();
  });
});
