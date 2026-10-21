/**
 * 플롯·PDF 출력:
 * - 축척은 AutoCAD처럼 "용지 단위 a = 도면 단위 b"(INSUNITS와 무관), 실제 축척 안내
 * - 모형 플롯 영역 밖은 같은 용지 위라도 자른다, 배치는 대화상자 보기(영역·축척·자리)로 그리고 도면 공간을 먼저(기본)
 * - PDF: 투명도(그래픽 상태), 도면층(OCG), 같은 스타일 채우기 한 경로, 검색되는 숨은 문자, 자르기 경계의 글자
 * - 목록에 없는 배치 용지(ARCH D·사용자 크기): PLOT은 "배치 용지"를 그대로 쓴다(A3·Tabloid에 1:1로 놓아 잘리지 않게)
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, Entity } from '../../src/core/model';
import { MODEL_SPACE, PAPER_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { buildSpace } from '../../src/render/build';
import { TextEngine } from '../../src/text/layout';
import { DocState } from '../../src/app/docstate';
import { EditSession } from '../../src/edit/session';
import { PdfResources, layoutPage, modelPage, pdfContent, pdfDocument } from '../../src/app/export';
import { initialPlotForm, keepPaperName, layoutView, plotSettingsOfForm, scaleMmPerUnit } from '../../src/app/plot';
import { type PageForm, realScaleNote } from '../../src/app/pagesetup-ui';
import { createHatch } from '../../src/edit/hatch/create';

const fakeRenderer = { upload: () => ({}), dispose: () => {} } as never;
let seq = 0x4000;
const H = () => (seq++).toString(16).toUpperCase();
const ent = (e: Partial<Entity> & { type: Entity['type'] }): Entity => ({ ...entityDefaults(), handle: H(), ...e }) as Entity;

function stateWith(doc: CadDocument, spaces: string[] = [MODEL_SPACE]): DocState {
  const st = new DocState(1, doc, 't.dwg', 0, 0);
  st.session = new EditSession(doc, () => {});
  for (const space of spaces) {
    const s = buildSpace(doc, space, { text: new TextEngine(null) });
    st.addScene(fakeRenderer, { list: s.list, styles: s.styles.specs, layers: s.layers, layerIndex: [...s.layerIndex], warnings: s.warnings, ms: 0 }, space);
  }
  return st;
}

describe('플롯 축척', () => {
  it('용지 단위 a = 도면 단위 b(INSUNITS와 무관)', () => {
    expect(scaleMmPerUnit({ scale: '1:100', paperUnits: 'mm' })).toBeCloseTo(0.01);
    expect(scaleMmPerUnit({ scale: '1:1', paperUnits: 'in' })).toBeCloseTo(25.4);
    expect(scaleMmPerUnit({ scale: '1:100' })).toBeCloseTo(0.01);
  });
  it('실제 크기 기준 축척 안내(도면 단위가 m이면 1:100 mm = 실제 1:100000)', () => {
    expect(realScaleNote('1:100', 'mm', 6)).toContain('1:100000');
    expect(realScaleNote('1:100', 'mm', 4)).toContain('1:100');
    expect(realScaleNote('fit', 'mm', 6)).toBe('');
    expect(realScaleNote('1:1', 'in', 1)).toContain('1:1');
  });
});

describe('모형 플롯 영역', () => {
  it('고정 축척이면 쪽은 용지 전체지만 그리는 것은 플롯 영역 안만', () => {
    const doc = createNewDocument('metric');
    doc.blocks.get(MODEL_SPACE)!.entities.push(ent({ type: 'LINE', start: { x: 0, y: 0, z: 0 }, end: { x: 100, y: 0, z: 0 } } as never));
    const st = stateWith(doc);
    const area: [number, number, number, number] = [-200, -200, 200, 200];
    const page = modelPage(st, area, 400, 400, 1, 1, { lineweights: true }, true, [0, -10, 50, 10])!;
    const L = page.layers.at(-1)!;
    expect(L.clipWorld).toEqual([0, -10, 50, 10]);
    expect(L.clipPx).toEqual([200, 190, 250, 210]);
  });
});

describe('PDF', () => {
  function docWithStuff(): CadDocument {
    const doc = createNewDocument('metric');
    doc.layers.set('WALL', { ...doc.layers.get('0')!, name: 'WALL', handle: H() });
    const ms = doc.blocks.get(MODEL_SPACE)!;
    ms.entities.push(ent({ type: 'LINE', layer: 'WALL', start: { x: 0, y: 0, z: 0 }, end: { x: 100, y: 0, z: 0 }, transparency: 128 } as never));
    ms.entities.push(ent({ type: 'TEXT', insert: { x: 10, y: 10, z: 0 }, height: 5, text: 'AØB', rotation: 0, widthFactor: 1, oblique: 0, style: 'Standard', generation: 0, halign: 0, valign: 0 } as never));
    return doc;
  }
  it('투명도를 켜면 그래픽 상태(gs), 끄면 없다; 도면층마다 표시된 내용(OC)', () => {
    const st = stateWith(docWithStuff());
    const on = modelPage(st, [-10, -10, 110, 30], 600, 200, 5, 1, { lineweights: true, transparency: true })!;
    const res = new PdfResources();
    const c = pdfContent(on, [], res);
    expect(c).toMatch(/\/GS\d+ gs/);
    expect([...res.alphas.keys()]).toContain('0.502');
    expect(c).toMatch(/\/OC \/OC\d+ BDC/);
    expect([...res.layers.keys()]).toContain('WALL');
    const off = modelPage(st, [-10, -10, 110, 30], 600, 200, 5, 1, { lineweights: true })!;
    const res2 = new PdfResources();
    expect(pdfContent(off, [], res2)).not.toMatch(/\/GS\d+ gs[\s\S]*0\.502/);
    expect([...res2.alphas.keys()].filter((a) => a !== '1.000')).toEqual([]);
  });
  it('숨은 검색 문자: 글자마다 Tj, 문서에는 ToUnicode', async () => {
    const st = stateWith(docWithStuff());
    const page = modelPage(st, [-10, -10, 110, 30], 600, 200, 5, 1, { lineweights: true })!;
    const res = new PdfResources();
    const c = pdfContent(page, [], res);
    expect(c).toContain('3 Tr');
    expect((c.match(/Tj/g) ?? []).length).toBe(3);
    expect(res.glyphs.map((g) => String.fromCodePoint(g.cp)).sort()).toEqual(['A', 'B', 'Ø']);
    // 글자 폭은 글리프의 실제 전진 폭(예전에는 모두 0.6이라 PDF 보기 프로그램이 낱말 사이에 빈칸을 넣었다)
    for (const g of res.glyphs) expect(g.adv).toBeGreaterThan(0);
    const pdf = await (await pdfDocument([page], '도면')).text();
    expect(pdf).toContain('/Subtype /Type3');
    expect(pdf).toContain('beginbfchar');
    expect(pdf).toContain('<00d8>');
    expect(pdf).toContain('/OCProperties');
    expect(pdf).toContain('/Title <FEFF');
  });
  it('PDF 보기 프로그램(pdf.js)이 숨은 문자를 낱말로 읽는다(글자 폭 = 실제 전진 폭)', async () => {
    const doc = createNewDocument('metric');
    const ms = doc.blocks.get(MODEL_SPACE)!;
    ms.entities.push(ent({ type: 'TEXT', insert: { x: 10, y: 10, z: 0 }, height: 5, text: 'Hello World 12', rotation: 0, widthFactor: 1, oblique: 0, style: 'Standard', generation: 0, halign: 0, valign: 0 } as never));
    ms.entities.push(ent({ type: 'TEXT', insert: { x: 10, y: 30, z: 0 }, height: 3, text: 'Wall illumination', rotation: 0.4, widthFactor: 0.8, oblique: 0, style: 'Standard', generation: 0, halign: 0, valign: 0 } as never));
    const st = stateWith(doc);
    const page = modelPage(st, [-10, -10, 110, 60], 600, 400, 5, 1, { lineweights: true })!;
    const data = new Uint8Array(await (await pdfDocument([page], 't')).arrayBuffer());
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const pdf = await pdfjs.getDocument({ data, isEvalSupported: false, verbosity: 0 }).promise;
    const tc = await (await pdf.getPage(1)).getTextContent();
    const text = tc.items.map((it) => ('str' in it ? it.str : '')).join('').replace(/\s+/g, ' ');
    expect(text).toContain('Hello World 12');
    expect(text).toContain('Wall illumination');
  });
  it('자르기 경계에 걸친 글자도 남는다(삽입점이 경계 밖)', () => {
    const doc = createNewDocument('metric');
    doc.blocks.get(MODEL_SPACE)!.entities.push(ent({ type: 'TEXT', insert: { x: -3, y: 0, z: 0 }, height: 5, text: 'WW', rotation: 0, widthFactor: 1, oblique: 0, style: 'Standard', generation: 0, halign: 0, valign: 0 } as never));
    const st = stateWith(doc);
    const page = modelPage(st, [0, -5, 50, 10], 500, 150, 10, 1, { lineweights: true })!;
    const c = pdfContent(page, [], new PdfResources());
    expect((c.match(/Tj/g) ?? []).length).toBe(2);
  });
  it('같은 스타일의 채우기(솔리드 해치)는 한 번에 칠한다', () => {
    const doc = createNewDocument('metric');
    const h = createHatch(doc, [{ flags: 1, polyline: { closed: true, verts: [0, 0, 0, 100, 0, 0, 100, 100, 0, 0, 100, 0] } } as never], { pattern: 'SOLID' });
    h.handle = H();
    // 구멍 여럿(삼각형이 많다)
    for (let i = 0; i < 5; i++) h.paths.push({ flags: 0, polyline: { closed: true, verts: [10 + i * 15, 10, 0, 18 + i * 15, 10, 0, 18 + i * 15, 18, 0, 10 + i * 15, 18, 0] } } as never);
    doc.blocks.get(MODEL_SPACE)!.entities.push(h);
    const st = stateWith(doc);
    const c = pdfContent(modelPage(st, [-5, -5, 105, 105], 400, 400, 3, 1, { lineweights: true })!, [], new PdfResources());
    expect(c.split('\n').filter((l) => l === 'f').length).toBe(1);
  });
});

describe('배치 플롯 보기', () => {
  function layoutDoc() {
    const doc = createNewDocument('metric');
    const ps = doc.blocks.get(PAPER_SPACE)!;
    ps.entities.push(ent({ type: 'LINE', paperSpace: true, start: { x: 0, y: 0, z: 0 }, end: { x: 400, y: 280, z: 0 } } as never));
    return doc;
  }
  it('영역·축척·자리 보기: 쪽 크기와 영역 자르기, 도면 공간 먼저(기본)·나중', () => {
    const doc = layoutDoc();
    const st = stateWith(doc, [MODEL_SPACE, PAPER_SPACE]);
    const view = { width: 297, height: 210, region: [0, 0, 100, 50] as [number, number, number, number], k: 2, offX: 48.5, offY: 55, lwFactor: 1 };
    const page = layoutPage(st, PAPER_SPACE, 1, { lineweights: true }, view)!;
    expect([page.width, page.height]).toEqual([297, 210]);
    expect(page.viewed).toBe(true);
    const paperLayer = page.layers.find((l) => l.scene === st.scenes.get(PAPER_SPACE))!;
    expect(paperLayer.clipPx).toEqual([48.5, 55, 248.5, 155]);
    expect(page.layers.indexOf(paperLayer)).toBe(0);
    const last = layoutPage(st, PAPER_SPACE, 1, { lineweights: true, paperspaceLast: true }, view)!;
    expect(last.layers.at(-1)!.scene).toBe(st.scenes.get(PAPER_SPACE));
  });
});


describe('목록에 없는 배치 용지(ARCH D)', () => {
  const defaults: PageForm = { paper: 'A3', landscape: true, upsideDown: false, styleSheet: 'monochrome.ctb', area: 'layout', scale: 'fit', offsetX: 0, offsetY: 0, centered: true, lineweights: true, scaleLineweights: false, paperUnits: 'mm', plotTransparency: false, paperspaceLast: false };
  function archD() {
    const doc = createNewDocument('metric');
    const lay = doc.layouts.find((l) => l.blockName.toUpperCase() === PAPER_SPACE)!;
    Object.assign(lay.plot, { paperName: 'ARCH_D_(36.00_x_24.00_Inches)', paperWidth: 914.4, paperHeight: 609.6, rotation: 0, paperUnits: 1, margins: [0, 0, 0, 0], scaleNumerator: 1, scaleDenominator: 1, flags: lay.plot.flags & ~16, plotType: 5 });
    lay.limitsMin = { x: 0, y: 0 };
    lay.limitsMax = { x: 914.4, y: 609.6 };
    doc.blocks.get(PAPER_SPACE)!.entities.push(ent({ type: 'LINE', paperSpace: true, start: { x: 0, y: 0, z: 0 }, end: { x: 900, y: 600, z: 0 } } as never));
    return { doc, lay };
  }
  it('대화상자 처음 값은 배치 용지(KEEP)이고, 항목 이름에 매체 이름과 크기를 보인다', () => {
    const { lay } = archD();
    const { form, keepLabel } = initialPlotForm(lay, false, undefined, defaults);
    expect(form.paper).toBe('KEEP');
    expect(keepLabel).toBe('배치 용지(ARCH D (36.00 x 24.00 Inches), 914.4 × 609.6 mm)');
    expect(keepPaperName({ paperName: '', paperWidth: 100, paperHeight: 50 })).toBe('100 × 50 mm');
    // 모형은 목록 용지로
    expect(initialPlotForm(lay, true, undefined, defaults).form.paper).toBe('A3');
    // 이전 플롯이 배치 용지였으면 다시 배치 용지
    const s = plotSettingsOfForm(form, false, false, 'pdf', 1, true);
    expect(s.keepPaper).toBe(true);
    expect(initialPlotForm(lay, false, s, defaults).form.paper).toBe('KEEP');
  });
  it('배치 용지 그대로 1:1이면 배치 그대로 그리고(잘림 없음), 방향을 바꾸면 용지를 돌린다', () => {
    const { doc, lay } = archD();
    const st = stateWith(doc, [MODEL_SPACE, PAPER_SPACE]);
    const app = { view: {} } as never;
    const { form } = initialPlotForm(lay, false, undefined, defaults);
    const s = plotSettingsOfForm({ ...form, scale: '1:1' }, false, false, 'pdf', 1, true);
    expect(layoutView(app, st, PAPER_SPACE, s, 1)).toBeNull();
    const turned = layoutView(app, st, PAPER_SPACE, { ...s, landscape: false }, 1)!;
    expect([turned.width, turned.height].map((v) => +v.toFixed(1))).toEqual([609.6, 914.4]);
    // 예전처럼 A3로 바꾸면 A3 쪽(420 × 297)에 1:1로 놓여 잘린다
    const a3 = layoutView(app, st, PAPER_SPACE, { ...s, keepPaper: undefined, paper: 'A3' }, 1)!;
    expect([a3.width, a3.height]).toEqual([420, 297]);
  });
});
