/**
 * 230차: 페이지 설정·플롯 대화 상자의 플롯 영역 「뷰」. Autodesk 페이지 설정 대화 상자 도움말은 플롯 대상(배치/한계·범위·화면표시·뷰·윈도우) 가운데
 * 뷰를 VIEW 명령으로 저장해 둔 이름 있는 뷰를 목록에서 골라 플롯하는 것으로 적는다(저장된 뷰가 없으면 쓸 수 없음). 전에는 대화 상자에 뷰가 없어
 * 읽은 74 = 3이 모형은 화면표시, 배치는 배치로 보이고, 다른 칸만 바꿔 적용해도 74가 0·5가 되어 파일의 뷰 플롯 설정을 잃었다(229차 보고).
 * 이제 칸이 74 = 3 ↔ 뷰, 6(229차 plotViewName) ↔ 뷰 이름으로 오가고, PLOT은 그 뷰 범위를 창으로 그리며,
 * VIEW 이름 바꾸기가 그 뷰를 쓰는 플롯 설정의 뷰 이름을 같은 명령 취소 단계에서 따라간다. 대화 상자 목록(가짜 DOM)은 tests/render/papers.test.ts.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, Layout, PlotSettings, PlotSettingsObject, ViewRecord } from '../../src/core/model';
import { MODEL_SPACE, tableKey } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { EditSession, applyOps } from '../../src/edit/session';
import { importPageSetupOps, namedPageSetups } from '../../src/edit/script/pagesetup';
import { type PageForm, layoutPlotOps, pageFormOf, pageSettingsOf, plotViewNames, plotViewRect, saveNamedSetupOps } from '../../src/app/pagesetup-ui';
import { initialPlotForm, plotSettingsOfForm } from '../../src/app/plot';
import { renameViewOps } from '../../src/app/viewcmds';
import { DocState } from '../../src/app/docstate';

/** [6 플롯 뷰 이름, 74 플롯 영역] */
type Pv = [view: string, type: number];

function viewRec(name: string, flags: number, center: [number, number], width: number, height: number, target: [number, number]): Omit<ViewRecord, 'handle'> {
  return { name, flags, center: { x: center[0], y: center[1] }, width, height, viewDirection: { x: 0, y: 0, z: 1 }, viewTarget: { x: target[0], y: target[1], z: 0 }, twist: 0 };
}

/** 새 도면(모형·배치 둘) + 이름 있는 모형 페이지 설정 하나(플롯 설정 셋) + 모형 뷰 Front·Side(대상 점이 0이 아님), 종이 공간 뷰 Sheet */
function baseDoc(): CadDocument {
  const doc = createNewDocument('metric');
  const s = new EditSession(doc, () => {});
  const plot: PlotSettings = { ...structuredClone(doc.layouts[0]!.plot), pageSetupName: 'Views' };
  applyOps(doc, importPageSetupOps(doc, [{ name: 'Views', plot, model: true }], new Set(), () => s.newHandle())!.ops);
  for (const v of [viewRec('Front', 0, [50, 25], 100, 50, [0, 0]), viewRec('Side', 0, [0, 0], 40, 20, [10, 5]), viewRec('Sheet', 1, [100, 50], 200, 100, [0, 0])]) {
    doc.views.set(tableKey(v.name), { ...v, handle: s.newHandle() });
  }
  return doc;
}

const dec = (d: Uint8Array): string => new TextDecoder().decode(d);
const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

/** DXF 글의 AcDbPlotSettings 묶음마다 [6, 74]. set을 주면 그 값으로 바꾼 글도 돌려준다(229차 시험과 같은 꼴) */
function plotTags(text: string, set?: Pv): { blocks: Pv[]; text: string } {
  const lines = text.split('\r\n');
  const blocks: Pv[] = [];
  let cur: Pv | null = null;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i]!.trim());
    if (code === 0 || code === 100) {
      cur = code === 100 && lines[i + 1] === 'AcDbPlotSettings' ? ['?', -1] : null;
      if (cur) blocks.push(cur);
      continue;
    }
    if (!cur) continue;
    if (code === 6) {
      if (set) lines[i + 1] = set[0];
      cur[0] = lines[i + 1]!;
    } else if (code === 74) {
      if (set) lines[i + 1] = String(set[1]);
      cur[1] = Number(lines[i + 1]);
    }
  }
  return { blocks, text: lines.join('\r\n') };
}

/** AutoCAD가 플롯 영역을 뷰로 둔 것처럼 6·74를 바꾼 R2018 DXF */
function autocadLike(pv: Pv): Uint8Array {
  const out = plotTags(dec(writeDxf(baseDoc(), { version: 'AC1032' }).data), pv);
  expect(out.blocks).toEqual([pv, pv, pv]);
  return enc(out.text);
}

/** 문서의 플롯 설정 셋(모형·배치·이름 있는 페이지 설정)의 플롯 뷰 이름 */
function names(doc: CadDocument): unknown[] {
  const plots: PlotSettings[] = [...doc.layouts.map((l) => l.plot), ...[...doc.objects.values()].filter((o) => o.type === 'PLOTSETTINGS').map((o) => (o as PlotSettingsObject).plot)];
  return plots.map((p) => p.plotViewName);
}

const modelOf = (doc: CadDocument): Layout => doc.layouts.find((l) => tableKey(l.blockName) === MODEL_SPACE)!;
const paperOf = (doc: CadDocument): Layout => doc.layouts.find((l) => tableKey(l.blockName) !== MODEL_SPACE)!;

const FRONT: Pv = ['Front', 3];

describe('페이지 설정 대화 상자의 플롯 영역 뷰(230차)', () => {
  it('읽은 74 = 3과 6을 칸이 뷰·뷰 이름으로 보이고, 다른 칸만 바꿔 적용해도 74·6이 남는다(DXF 저장까지)', () => {
    const doc = readDxf(autocadLike(FRONT));
    const m = modelOf(doc);
    const p = paperOf(doc);
    const setup = namedPageSetups(doc).items[0]!;
    const fm = pageFormOf(m.plot, true);
    const fp = pageFormOf(p.plot, false);
    const fs = pageFormOf(setup.plot, true);
    // 전에는 모형 화면표시·배치 배치, 뷰 이름 칸 없음
    for (const f of [fm, fp, fs]) expect(f).toMatchObject({ area: 'view', view: 'Front' });
    // 다른 뷰를 고르면 그 이름, 다른 영역을 고르면 74만 바뀌고 6은 남는다(229차 — 74와 무관하게 지킴)
    expect(pageSettingsOf(m.plot, { ...fm, view: 'Side' }, true)).toMatchObject({ plotType: 3, plotViewName: 'Side' });
    expect(pageSettingsOf(m.plot, { ...fm, area: 'extents' }, true)).toMatchObject({ plotType: 1, plotViewName: 'Front' });
    const npm = pageSettingsOf(m.plot, { ...fm, paper: 'A2', scale: '1:50' }, true);
    const npp = pageSettingsOf(p.plot, { ...fp, paper: 'A1', landscape: true }, false);
    const nps = pageSettingsOf(setup.plot, { ...fs, styleSheet: 'monochrome.ctb' }, true);
    // 전에는 [Front, 0], [Front, 5], [Front, 0]
    expect([npm, npp, nps].map((x) => [x.plotViewName, x.plotType])).toEqual([FRONT, FRONT, FRONT]);
    const s = new EditSession(doc, () => {});
    s.commit({ label: 'PAGESETUP', ops: [...layoutPlotOps(m, npm), ...layoutPlotOps(p, npp), ...saveNamedSetupOps(doc, setup.name, nps, () => s.newHandle())!] });
    expect(modelOf(doc).plot.paperWidth).toBe(594);
    expect(plotTags(dec(writeDxf(doc, { version: 'AC1032' }).data)).blocks).toEqual([FRONT, FRONT, FRONT]);
  });

  it('74가 3이 아닌 도면과 새 도면은 그대로다(영역·적용·칸 없음)', () => {
    const doc = createNewDocument('metric');
    const fm = pageFormOf(modelOf(doc).plot, true);
    const fp = pageFormOf(paperOf(doc).plot, false);
    expect([fm.area, fp.area]).toEqual(['display', 'layout']);
    expect([fm.view, fp.view]).toEqual([undefined, undefined]);
    const a = pageSettingsOf(modelOf(doc).plot, fm, true);
    const b = pageSettingsOf(paperOf(doc).plot, fp, false);
    expect([a.plotType, b.plotType]).toEqual([0, 5]);
    expect(['plotViewName' in a, 'plotViewName' in b]).toEqual([false, false]);
    // 74 = 5(배치)에 이름 Front를 지닌 파일: 영역은 배치, 적용해도 74·6 그대로
    const five = readDxf(autocadLike(['Front', 5]));
    const f5 = pageFormOf(paperOf(five).plot, false);
    expect(f5.area).toBe('layout');
    expect(pageSettingsOf(paperOf(five).plot, f5, false)).toMatchObject({ plotType: 5, plotViewName: 'Front' });
  });

  it('고를 수 있는 뷰와 그 범위: 모형은 모형 뷰, 배치는 종이 공간 뷰(대소문자 가리지 않음, VIEW 복원처럼 중심 + 대상)', () => {
    const doc = baseDoc();
    expect(plotViewNames(doc, true)).toEqual(['Front', 'Side']);
    expect(plotViewNames(doc, false)).toEqual(['Sheet']);
    expect(plotViewNames(createNewDocument('metric'), true)).toEqual([]);
    expect(plotViewRect(doc, 'Front', true)).toEqual([0, 0, 100, 50]);
    expect(plotViewRect(doc, 'side', true)).toEqual([-10, -5, 30, 15]);
    expect(plotViewRect(doc, 'Sheet', false)).toEqual([0, 0, 200, 100]);
    // 다른 공간의 뷰·없는 뷰·이름 없음
    expect(plotViewRect(doc, 'Sheet', true)).toBeNull();
    expect(plotViewRect(doc, 'Front', false)).toBeNull();
    expect(plotViewRect(doc, 'Gone', true)).toBeNull();
    expect(plotViewRect(doc, undefined, true)).toBeNull();
  });

  it('PLOT: 뷰면 그 뷰 범위를 창으로 그리고 다음 PLOT 처음 칸도 뷰다(찾지 못하면 전처럼 화면표시·배치 전체)', () => {
    const doc = baseDoc();
    const m = modelOf(doc);
    const f: PageForm = { ...pageFormOf(m.plot, true), area: 'view', view: 'Side' };
    const s = plotSettingsOfForm(f, true, false, 'pdf', 1, true, plotViewRect(doc, 'Side', true));
    expect(s).toMatchObject({ what: 'window', window: [-10, -5, 30, 15], view: 'Side' });
    expect(initialPlotForm(m, true, s, f).form).toMatchObject({ area: 'view', view: 'Side' });
    const fl: PageForm = { ...pageFormOf(paperOf(doc).plot, false), area: 'view', view: 'Sheet' };
    expect(plotSettingsOfForm(fl, false, false, 'pdf', 1, true, plotViewRect(doc, 'Sheet', false))).toMatchObject({ what: 'layout', area: 'window', window: [0, 0, 200, 100], view: 'Sheet' });
    const none = plotSettingsOfForm({ ...f, view: 'Gone' }, true, false, 'pdf', 1, true, null);
    expect([none.what, none.view]).toEqual(['display', undefined]);
    expect(plotSettingsOfForm({ ...fl, view: 'Gone' }, false, false, 'pdf', 1, true, null).area).toBe('layout');
  });

  it('VIEW 이름 바꾸기는 그 뷰를 쓰는 배치·이름 있는 페이지 설정의 뷰 이름을 같은 명령 취소 단계에서 바꾼다', () => {
    const doc = readDxf(autocadLike(FRONT));
    const st = new DocState(1, doc, 'a.dxf', 0, 0);
    st.session = new EditSession(doc, () => {});
    const handle = doc.views.get('FRONT')!.handle;
    st.session.commit({ label: 'VIEW', ops: renameViewOps(st, 'Front', 'Plan')!, group: 3 });
    expect(doc.views.get('PLAN')).toMatchObject({ name: 'Plan', handle });
    // 전에는 Front 그대로 — 저장하면 VIEW 표에 없어 ''
    expect(names(doc)).toEqual(['Plan', 'Plan', 'Plan']);
    expect(plotTags(dec(writeDxf(doc, { version: 'AC1032' }).data)).blocks).toEqual([['Plan', 3], ['Plan', 3], ['Plan', 3]]);
    st.session.undo();
    expect(doc.views.has('PLAN')).toBe(false);
    expect(names(doc)).toEqual(['Front', 'Front', 'Front']);
    // 대소문자만 바꾸면 전처럼 뷰 연산 하나(쓰기가 레코드 이름으로 쓴다), 다른 뷰의 이름 바꾸기는 플롯 설정을 건드리지 않는다
    expect(renameViewOps(st, 'Front', 'FRONT')!.length).toBe(1);
    expect(renameViewOps(st, 'Side', 'Left')!.length).toBe(2);
  });
});
