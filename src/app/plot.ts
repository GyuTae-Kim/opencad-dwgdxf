/**
 * 출력: PLOT(명명된 페이지 설정·용지·축척·간격띄우기·플롯 스타일·매수를 골라 PDF·SVG·브라우저 인쇄로), PREVIEW, PUBLISH(고른 배치를 한 PDF로).
 * PLOT의 "배치에 적용"은 지금 설정을 배치(모형 탭이면 모형)의 페이지 설정으로 도면에 저장한다(명령 취소 한 단계).
 */
import { ensureLayoutVariants } from './psltscale';
import { type Layout, MODEL_SPACE, tableKey } from '../core/model';
import type { PlotStyle } from '../render/styles';
import type { App, CommandContext } from './app';
import type { DocState } from './docstate';
import { type LayoutPlotView, type Page, type PageOptions, PT_PER_MM, baseName, download, exportPageSvg, layoutPage, modelPage, pdfDocument } from './export';
import { paperInfo } from './scene';
import { dialog, h } from './ui/dom';
import { namedPageSetups } from '../edit/script/pagesetup';
import { type PageForm, layoutPlotOps, pageFields, pageFormOf, pageSettingsOf } from './pagesetup-ui';
import { checkIn, fail, group, numIn, numOf, resultDialog, row, selectIn } from './mgr-ui';
import { inScript } from './script';
import { ctbByName, pickCtbFiles } from './ctblib';
import { PAPERS, paperOf } from './papers';
import { plotStampOn, setPlotStampOn, stampPages } from './filecmds-stamp';

/** 용지(mm, 세로 방향 폭 × 높이) — ISO A·B, JIS B, ANSI, ARCH와 사용자 크기(src/app/papers.ts) */
export { PAPERS } from './papers';

/** 플롯 스타일 표(CTB) 이름 → 출력 색 처리 */
export function styleSheetPlotStyle(name: string | undefined): PlotStyle | null {
  const n = (name ?? '').toLowerCase();
  if (!n) return null;
  if (n.startsWith('monochrome')) return 'mono';
  if (n.startsWith('grayscale')) return 'gray';
  return 'color';
}


/** 도면 단위 1이 몇 mm인지(INSUNITS) */
export function unitMm(insunits: number): number {
  const t: Record<number, number> = { 1: 25.4, 2: 304.8, 3: 1609344, 4: 1, 5: 10, 6: 1000, 7: 1e6, 8: 0.0000254, 9: 0.0254, 10: 914.4, 11: 1e-7, 12: 1e-6, 13: 1e-3, 14: 100, 15: 10000, 16: 100000 };
  return t[insunits] ?? 1;
}

export interface PlotSettings {
  what: 'display' | 'extents' | 'window' | 'layout' | 'layouts';
  /** what이 layouts일 때 플롯할 배치 블록 이름(대문자). 없으면 모든 배치 */
  layouts?: string[];
  /** 플롯 간격띄우기(mm, 용지 왼쪽 아래 기준). centered가 참이면 쓰지 않는다 */
  offset?: { x: number; y: number };
  /** 플롯의 중심(기본 참) */
  centered?: boolean;
  /** 거꾸로(180°) 플롯 */
  upsideDown?: boolean;
  /** 매수(1~) */
  copies?: number;
  paper: string;
  landscape: boolean;
  scale: string;
  plotStyle: PlotStyle;
  /** 불러온 플롯 스타일 표(CTB) 이름. 있으면 plotStyle 대신 쓴다 */
  ctb?: string;
  lineweights: boolean;
  format: 'pdf' | 'svg';
  margin: number;
  window?: [number, number, number, number];
  /** 축척 "a:b"의 용지 단위(a mm 또는 a 인치 = 도면 단위 b). 없으면 mm */
  paperUnits?: 'mm' | 'in';
  /** 투명도 플롯 */
  transparency?: boolean;
  /** 도면 공간을 나중에 플롯(배치) */
  paperspaceLast?: boolean;
  /** 선가중치를 플롯 축척에 맞춰 늘이고 줄인다(배치) */
  scaleLineweights?: boolean;
  /** 배치 플롯 대상(대화상자의 배치·범위·화면표시·윈도우). 없으면 배치 전체 */
  area?: 'layout' | 'extents' | 'display' | 'window';
  /** 배치 플롯에서 배치의 용지를 그대로 쓴다(대화상자 용지가 목록에 없을 때) */
  keepPaper?: boolean;
}

/** 문서별 마지막 출력 설정(PLOT·-PLOT이 함께 쓴다) */
export const lastSettings = new WeakMap<DocState, PlotSettings>();

/** 모형 출력 페이지 */
function modelPlotPage(app: App, st: DocState, s: PlotSettings, unitsPerMm: number): Page | null {
  const v = app.view;
  let rect: [number, number, number, number];
  if (s.what === 'window' && s.window) rect = s.window;
  else if (s.what === 'extents') {
    const b = st.scenes.get(MODEL_SPACE)?.bounds;
    if (!b) return null;
    rect = [b.minX, b.minY, b.maxX, b.maxY];
  } else {
    rect = v.visibleWorld();
  }
  const paper = paperOf(s.paper) ?? PAPERS[1]!;
  const pw = s.landscape ? paper.h : paper.w;
  const ph = s.landscape ? paper.w : paper.h;
  const rw = Math.max(1e-9, rect[2] - rect[0]);
  const rh = Math.max(1e-9, rect[3] - rect[1]);
  let mmPerUnit: number;
  if (s.scale === 'fit') mmPerUnit = Math.min((pw - 2 * s.margin) / rw, (ph - 2 * s.margin) / rh);
  else mmPerUnit = scaleMmPerUnit(s);
  // 용지 영역 밖은 자른다: 그릴 사각형을 용지에 맞게 넓히거나 줄인다
  const cx = (rect[0] + rect[2]) / 2;
  const cy = (rect[1] + rect[3]) / 2;
  const hw = (pw - 2 * s.margin) / 2 / mmPerUnit;
  const hh = (ph - 2 * s.margin) / 2 / mmPerUnit;
  let area: [number, number, number, number] = s.scale === 'fit' ? rect : [cx - hw, cy - hh, cx + hw, cy + hh];
  // 중심이 아니면 플롯 영역의 왼쪽 아래를 용지의 (간격띄우기 X, Y) mm에 둔다: 용지 전체에 해당하는 도면 사각형
  if (s.centered === false && s.offset) {
    const ax = rect[0] - s.offset.x / mmPerUnit;
    const ay = rect[1] - s.offset.y / mmPerUnit;
    area = [ax, ay, ax + pw / mmPerUnit, ay + ph / mmPerUnit];
  }
  // 플롯 영역 밖(같은 용지 위라도)은 그리지 않는다(AutoCAD와 같다)
  return modelPage(st, area, pw * unitsPerMm, ph * unitsPerMm, mmPerUnit * unitsPerMm, unitsPerMm, pageOptions(s), true, rect);
}

/** 고정 축척 "a:b"의 용지 mm / 도면 단위(AutoCAD: a 용지 단위 = b 도면 단위, 도면 단위의 실제 길이(INSUNITS)는 보지 않는다) */
export function scaleMmPerUnit(s: Pick<PlotSettings, 'scale' | 'paperUnits'>): number {
  const [a, b] = s.scale.split(':').map(Number);
  if (!(a! > 0 && b! > 0)) return 1;
  return ((s.paperUnits === 'in' ? 25.4 : 1) * a!) / b!;
}

/**
 * 배치를 대화상자 설정(용지·방향·축척·플롯 대상·간격띄우기)으로 플롯할 때의 보기. 배치의 페이지 설정과 같으면(용지 같음, 1:1, 배치 전체) null
 * — 배치 그대로 그린다.
 */
export function layoutView(app: App, st: DocState, space: string, s: PlotSettings, unitsPerMm: number): LayoutPlotView | null {
  const lay = st.layoutFor(space);
  if (!lay) return null;
  const scene = st.scenes.get(space);
  const paper = paperInfo(lay, scene?.bounds ?? null);
  const lw = (paper.maxX - paper.minX) * paper.mmPerUnit;
  const lh = (paper.maxY - paper.minY) * paper.mmPerUnit;
  const pp = s.keepPaper ? null : paperOf(s.paper);
  // 배치 용지를 그대로 쓸 때도 방향을 바꾸면 돌린다
  const flip = !pp && s.landscape !== lw >= lh;
  const pw = pp ? (s.landscape ? pp.h : pp.w) : flip ? lh : lw;
  const ph = pp ? (s.landscape ? pp.w : pp.h) : flip ? lw : lh;
  const area = s.area ?? 'layout';
  const one = s.scale !== 'fit' && Math.abs(scaleMmPerUnit(s) - paper.mmPerUnit) < 1e-9;
  if (area === 'layout' && one && Math.abs(pw - lw) < 1 && Math.abs(ph - lh) < 1) return null;
  let region: [number, number, number, number];
  if (area === 'extents' && scene?.bounds) region = [scene.bounds.minX, scene.bounds.minY, scene.bounds.maxX, scene.bounds.maxY];
  else if (area === 'window' && s.window) region = s.window;
  else if (area === 'display' && st.displaySpace === space) region = app.view.visibleWorld();
  else region = [paper.minX, paper.minY, paper.maxX, paper.maxY];
  const rw = Math.max(1e-9, region[2] - region[0]);
  const rh = Math.max(1e-9, region[3] - region[1]);
  const mmPer = s.scale === 'fit' ? Math.min((pw - 2 * s.margin) / rw, (ph - 2 * s.margin) / rh) : scaleMmPerUnit(s);
  const k = mmPer * unitsPerMm;
  const W = pw * unitsPerMm;
  const H = ph * unitsPerMm;
  const centered = s.centered !== false;
  const offX = centered ? (W - rw * k) / 2 : (s.offset?.x ?? 0) * unitsPerMm;
  const offY = centered ? (H - rh * k) / 2 : H - (s.offset?.y ?? 0) * unitsPerMm - rh * k;
  return { width: W, height: H, region, k, offX, offY, lwFactor: s.scaleLineweights ? mmPer / paper.mmPerUnit : 1 };
}

function pageOptions(s: PlotSettings): PageOptions {
  const ctb = ctbByName(s.ctb);
  const common = { lineweights: s.lineweights, transparency: !!s.transparency, paperspaceLast: !!s.paperspaceLast };
  return ctb ? { ctb, ...common } : { plotStyle: s.plotStyle, ...common };
}

/** 설정대로 페이지들을 만든다(배치 장면이 없으면 그려 온다). 플롯 스탬프를 켰으면 각 쪽에 적는다(화면에는 그리지 않는다) */
export async function plotPages(app: App, st: DocState, s: PlotSettings, unitsPerMm: number): Promise<Page[]> {
  const pages = await drawPages(app, st, s, unitsPerMm);
  // 배치의 간격띄우기: 용지 위에서 그림 전체를 옮긴다(모형은 modelPlotPage가, 대화상자 설정으로 그린 배치는 layoutView가 맞춘다)
  if ((s.what === 'layouts' || (s.what === 'layout' && !pages.some((p) => p.viewed))) && s.centered === false && s.offset && (s.offset.x || s.offset.y)) for (const p of pages) shiftPage(p, s.offset.x * unitsPerMm, -s.offset.y * unitsPerMm);
  if (s.upsideDown) for (const p of pages) turnPage(p);
  if (pages.length && plotStampOn()) await stampPages(app, st, s, pages, unitsPerMm);
  const n = Math.max(1, Math.min(99, Math.round(s.copies ?? 1)));
  if (n > 1) {
    const one = [...pages];
    for (let i = 1; i < n; i++) pages.push(...one);
  }
  return pages;
}

/** 쪽의 그림을 출력 단위로 옮긴다 */
function shiftPage(p: Page, dx: number, dy: number): void {
  for (const L of p.layers) {
    L.m = [L.m[0], L.m[1], L.m[2], L.m[3], L.m[4] + dx, L.m[5] + dy];
    if (L.clipPx) L.clipPx = [L.clipPx[0] + dx, L.clipPx[1] + dy, L.clipPx[2] + dx, L.clipPx[3] + dy];
    if (L.clipPoly) L.clipPoly = L.clipPoly.map((v, i) => v + (i & 1 ? dy : dx));
  }
}

/** 쪽을 180° 돌린다(대칭으로 플롯) */
function turnPage(p: Page): void {
  const W = p.width;
  const H = p.height;
  for (const L of p.layers) {
    const m = L.m;
    L.m = [-m[0], -m[1], -m[2], -m[3], W - m[4], H - m[5]];
    if (L.clipPx) L.clipPx = [W - L.clipPx[2], H - L.clipPx[3], W - L.clipPx[0], H - L.clipPx[1]];
    if (L.clipPoly) L.clipPoly = L.clipPoly.map((v, i) => (i & 1 ? H - v : W - v));
  }
}

async function drawPages(app: App, st: DocState, s: PlotSettings, unitsPerMm: number): Promise<Page[]> {
  await app.edits.flush(st);
  const opt = pageOptions(s);
  const pages: Page[] = [];
  if (s.what === 'layouts') {
    const pick = s.layouts?.length ? new Set(s.layouts.map((x) => x.toUpperCase())) : null;
    const lays = st.layouts.filter((l) => tableKey(l.blockName) !== MODEL_SPACE && (!pick || pick.has(tableKey(l.blockName)))).sort((a, b) => a.tabOrder - b.tabOrder);
    if (lays.length) await app.ensureScene(st, MODEL_SPACE);
    for (const l of lays) {
      await app.ensureScene(st, l.blockName);
      await ensureLayoutVariants(app, st, l.blockName);
      const p = layoutPage(st, tableKey(l.blockName), unitsPerMm, opt);
      if (p) pages.push(p);
    }
    return pages;
  }
  if (s.what === 'layout' && st.onLayout) {
    await ensureLayoutVariants(app, st, st.displaySpace);
    const p = layoutPage(st, st.displaySpace, unitsPerMm, opt, layoutView(app, st, st.displaySpace, s, unitsPerMm) ?? undefined);
    if (p) pages.push(p);
    return pages;
  }
  const p = modelPlotPage(app, st, s, unitsPerMm);
  if (p) pages.push(p);
  return pages;
}

/** 출력 페이지를 SVG 그림으로 미리 보인다(용지 그림자, 여러 쪽은 아래로) */
async function showPreview(app: App, st: DocState, s: PlotSettings): Promise<boolean> {
  const pages = await plotPages(app, st, s, 1);
  if (!pages.length) return false;
  const urls: string[] = [];
  const wrap = h('div', { style: 'width:min(80vw,960px);max-height:70vh;overflow:auto;background:#5b616b;padding:16px;box-sizing:border-box;display:flex;flex-direction:column;gap:16px;align-items:center' });
  for (const pg of pages) {
    const url = URL.createObjectURL(exportPageSvg(pg, 'mm'));
    urls.push(url);
    const img = h('img', { src: url, alt: '플롯 미리보기', style: 'background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.5);width:100%;height:auto' });
    wrap.append(img);
  }
  const free = () => {
    for (const u of urls) URL.revokeObjectURL(u);
    return true;
  };
  dialog(`플롯 미리보기 (${pages.length}쪽)`, wrap, [
    {
      label: '플롯…',
      run: () => {
        free();
        void app.run('PLOT');
        return true;
      },
    },
    { label: '닫기', primary: true, run: free },
  ]);
  return true;
}

async function askWindow(ctx: CommandContext): Promise<[number, number, number, number] | null> {
  const a = await ctx.getPoint('첫 번째 구석 지정:');
  if (!('point' in a)) return null;
  const p = a.point;
  const b = await ctx.getPoint('반대 구석 지정:', { base: p, rubber: (q) => [{ pts: [p.x, p.y, q.x, p.y, q.x, q.y, p.x, q.y], closed: true, dashed: true }] });
  if (!('point' in b)) return null;
  const q = b.point;
  return [Math.min(p.x, q.x), Math.min(p.y, q.y), Math.max(p.x, q.x), Math.max(p.y, q.y)];
}

export function registerPlotCommands(app: App): void {
  app.register({
    name: 'PLOT',
    aliases: ['PRINT', 'EXPORTPDF'],
    title: '플롯(PDF로 출력)',
    async run(ctx) {
      // FIELDEVAL 플롯 비트: 출력하기 전에 필드를 다시 계산한다(fieldcmds는 app.ts와 순환하므로 동적으로)
      (await import('./fieldcmds')).updateFieldsOn(app, 'plot');
      await runPlot(app, ctx);
    },
  });

  app.register({
    name: 'PREVIEW',
    aliases: ['PRE'],
    title: '플롯 미리보기',
    async run(ctx) {
      const st = app.active!;
      const prev = lastSettings.get(st);
      const s: PlotSettings = prev
        ? { ...prev, what: st.onLayout ? (prev.what === 'layouts' ? 'layouts' : 'layout') : prev.what === 'layout' || prev.what === 'layouts' ? 'display' : prev.what }
        : { what: st.onLayout ? 'layout' : 'display', paper: st.units.measurement ? 'A3' : 'TABLOID', landscape: true, scale: 'fit', plotStyle: 'mono', lineweights: true, format: 'pdf', margin: 5 };
      if (!(await showPreview(app, st, s))) ctx.print('미리 볼 내용이 없습니다.', 'err');
    },
  });

  app.register({
    name: 'PUBLISH',
    title: '여러 도면의 배치를 PDF 하나로 게시',
    async run(ctx) {
      (await import('./fieldcmds')).updateFieldsOn(app, 'plot');
      const st = app.active!;
      // 시트 목록: 열린 도면마다 배치(지금 도면은 고른 채로), 원하면 모형(범위·맞춤) — AutoCAD PUBLISH의 시트 추가와 같다
      const sheets = publishSheets(app);
      // 도면이 하나뿐이고 배치가 없으면 PLOT으로(여러 도면이면 모형끼리도 묶는다)
      if (app.docs.length < 2 && !sheets.some((x) => !x.model)) {
        ctx.print('배치가 없습니다. 모형은 PLOT으로 출력하십시오.', 'err');
        return;
      }
      // 처음 고른 시트: 지금 도면의 배치(배치가 없으면 그 모형)
      const mineHasLayout = sheets.some((x) => x.st === st && !x.model);
      const preset = (x: (typeof sheets)[number]) => x.st === st && x.model !== mineHasLayout;
      let chosen = sheets.filter(preset);
      if (!inScript(app)) {
        const checks = sheets.map((x) => checkIn(preset(x), x.label));
        const many = new Set(sheets.map((x) => x.st)).size > 1;
        const groups = [...new Set(sheets.map((x) => x.st))].map((d) =>
          group(
            many ? baseName(d.saveName) : '게시할 시트',
            ...sheets.flatMap((x, i) => (x.st === d ? [row(x.model ? '모형(범위, 용지에 맞춤)' : x.name, checks[i]!)] : [])),
          ),
        );
        const note = many ? '고른 시트를 열린 도면 차례, 배치 탭 순서대로 PDF 한 파일에 담습니다. 각 배치의 페이지 설정(용지)을 씁니다.' : '고른 배치를 탭 순서대로 PDF 한 파일에 담습니다. 각 배치의 페이지 설정(용지)을 씁니다.';
        const body = h('div', { class: 'mgr-dlg' }, ...groups, h('div', { class: 'mgr-note' }, note));
        const r = await resultDialog('게시', body, { ok: '게시(P)', width: 460, submit: () => (checks.some((c) => c.checked) ? sheets.filter((_, i) => checks[i]!.checked) : fail('게시할 시트를 하나 이상 고르십시오.')) });
        if (!r) return;
        chosen = r;
      }
      const pages: Page[] = [];
      const docs = [...new Set(chosen.map((x) => x.st))];
      for (const d of docs) {
        const base: PlotSettings = { ...(lastSettings.get(d) ?? { what: 'layouts', paper: d.units.measurement ? 'A3' : 'TABLOID', landscape: true, scale: 'fit', plotStyle: 'mono', lineweights: true, format: 'pdf', margin: 5 }), copies: 1 };
        const mine = chosen.filter((x) => x.st === d);
        if (mine.some((x) => x.model)) pages.push(...(await plotPages(app, d, { ...base, what: 'extents', scale: 'fit' }, PT_PER_MM)));
        const lays = mine.filter((x) => !x.model).map((x) => x.key);
        if (lays.length) pages.push(...(await plotPages(app, d, { ...base, what: 'layouts', layouts: lays }, PT_PER_MM)));
      }
      if (!pages.length) {
        ctx.print('배치가 없습니다. 모형은 PLOT으로 출력하십시오.', 'err');
        return;
      }
      const name = docs.length > 1 ? `${baseName(st.saveName)}-게시.pdf` : `${baseName(docs[0]!.saveName)}-배치.pdf`;
      download(await pdfDocument(pages, docs.length > 1 ? baseName(st.saveName) : docs[0]!.saveName), name);
      ctx.print(docs.length > 1 ? `도면 ${docs.length}개의 시트 ${pages.length}쪽을 PDF 하나로 저장했습니다.` : `배치 ${pages.length}쪽을 PDF 하나로 저장했습니다.`);
    },
  });
}

/** PUBLISH 시트 후보: 열린 도면마다 모형 하나와 배치들(탭 순서) */
export function publishSheets(app: App): { st: DocState; key: string; name: string; label: string; model: boolean }[] {
  const out: { st: DocState; key: string; name: string; label: string; model: boolean }[] = [];
  for (const d of app.docs) {
    const doc = baseName(d.saveName);
    out.push({ st: d, key: MODEL_SPACE, name: '모형', label: `${doc} - 모형`, model: true });
    for (const l of d.layouts.filter((x) => tableKey(x.blockName) !== MODEL_SPACE).sort((a, b) => a.tabOrder - b.tabOrder)) out.push({ st: d, key: tableKey(l.blockName), name: l.name, label: `${doc} - ${l.name}`, model: false });
  }
  return out;
}

// ---------------------------------------------------------------------------
// PLOT 대화상자
// ---------------------------------------------------------------------------

type Device = 'pdf' | 'svg' | 'print' | 'preview';

const DEVICES: { value: Device; label: string }[] = [
  { value: 'pdf', label: 'DWG To PDF.pc3 (PDF 파일로 내려받기)' },
  { value: 'print', label: '브라우저 인쇄(이 컴퓨터의 프린터)' },
  { value: 'svg', label: 'SVG(첫 쪽, mm)' },
  { value: 'preview', label: '미리보기만(내려받지 않음)' },
];

/** 플롯 대화상자 칸 → 출력 설정 */
export function plotSettingsOfForm(f: PageForm, model: boolean, allLayouts: boolean, device: Device, copies: number, metric: boolean): PlotSettings {
  const ctb = ctbByName(f.styleSheet);
  const what: PlotSettings['what'] = !model ? (allLayouts ? 'layouts' : 'layout') : f.area === 'extents' ? 'extents' : f.area === 'window' || f.area === 'limits' ? 'window' : 'display';
  return {
    what,
    paper: f.paper === 'KEEP' ? (metric ? 'A3' : 'TABLOID') : f.paper,
    landscape: f.landscape,
    scale: f.scale,
    plotStyle: ctb ? 'color' : (styleSheetPlotStyle(f.styleSheet) ?? 'color'),
    ctb: ctb?.name,
    lineweights: f.lineweights,
    format: device === 'svg' ? 'svg' : 'pdf',
    margin: 5,
    window: f.window,
    paperUnits: f.paperUnits,
    transparency: f.plotTransparency,
    paperspaceLast: f.paperspaceLast,
    scaleLineweights: f.scaleLineweights,
    area: model ? undefined : f.area === 'limits' ? 'layout' : f.area,
    keepPaper: !model && f.paper === 'KEEP' ? true : undefined,
    centered: f.centered,
    offset: { x: f.offsetX, y: f.offsetY },
    upsideDown: f.upsideDown,
    copies,
  };
}

/**
 * PLOT 대화상자의 처음 칸(이전 플롯 → 배치(모형)의 페이지 설정 → 기본값)과 "배치 용지" 항목 이름.
 * 모형은 목록의 용지로 플롯한다. 배치는 목록에 없는 배치 용지(ARCH D·사용자 크기 등)를 그대로 쓸 수 있다.
 */
export function initialPlotForm(layout: Layout | undefined, model: boolean, prev: PlotSettings | undefined, defaults: PageForm): { form: PageForm; keepLabel?: string } {
  const fromLayout = layout && (!model || layout.plot.pageSetupName || layout.plot.paperWidth > 0) ? pageFormOf(layout.plot, model) : { ...defaults };
  const keepLabel = !model && layout && fromLayout.paper === 'KEEP' ? `배치 용지(${keepPaperName(layout.plot)})` : undefined;
  if (fromLayout.paper === 'KEEP' && !keepLabel) fromLayout.paper = defaults.paper;
  let form: PageForm = prev ? formOfSettings(prev, fromLayout) : fromLayout;
  if (form.paper === 'KEEP' && !keepLabel) form = { ...form, paper: fromLayout.paper === 'KEEP' ? defaults.paper : fromLayout.paper };
  if (model && form.area === 'layout') form.area = 'display';
  if (!model && form.area === 'limits') form.area = 'layout';
  return { form, keepLabel };
}

/** 출력 설정 → 플롯 대화상자 칸(이전 플롯) */
function formOfSettings(s: PlotSettings, base: PageForm): PageForm {
  return {
    ...base,
    paper: s.keepPaper ? 'KEEP' : s.paper,
    landscape: s.landscape,
    scale: s.scale,
    styleSheet: s.ctb ?? (s.plotStyle === 'mono' ? 'monochrome.ctb' : s.plotStyle === 'gray' ? 'Grayscale.ctb' : base.styleSheet),
    area: s.what === 'extents' ? 'extents' : s.what === 'window' ? 'window' : s.what === 'display' ? 'display' : (s.area ?? base.area),
    window: s.window ?? base.window,
    lineweights: s.lineweights,
    paperUnits: s.paperUnits ?? base.paperUnits,
    plotTransparency: !!s.transparency,
    paperspaceLast: s.paperspaceLast ?? base.paperspaceLast,
    scaleLineweights: s.scaleLineweights ?? base.scaleLineweights,
    centered: s.centered ?? true,
    offsetX: s.offset?.x ?? 0,
    offsetY: s.offset?.y ?? 0,
    upsideDown: !!s.upsideDown,
  };
}

/** 브라우저 인쇄: 쪽을 SVG 그림으로 인쇄 전용 영역에 놓고 window.print() */
async function printPages(pages: Page[], paperMm: { w: number; h: number }): Promise<void> {
  const urls = pages.map((pg) => URL.createObjectURL(exportPageSvg(pg, 'mm')));
  const box = h('div', { id: 'mgr-print' }, ...urls.map((u) => h('img', { src: u, alt: '' })));
  const style = h('style', {}, `#mgr-print{display:none}
@media print{body>*:not(#mgr-print){display:none!important}#mgr-print{display:block}#mgr-print img{display:block;width:${paperMm.w}mm;height:${paperMm.h}mm;page-break-after:always;break-after:page}@page{size:${paperMm.w}mm ${paperMm.h}mm;margin:0}}`);
  document.head.append(style);
  document.body.append(box);
  await Promise.all([...box.querySelectorAll('img')].map((img) => (img.complete ? Promise.resolve() : new Promise((r) => img.addEventListener('load', r, { once: true })))));
  const done = () => {
    box.remove();
    style.remove();
    for (const u of urls) URL.revokeObjectURL(u);
  };
  window.addEventListener('afterprint', done, { once: true });
  window.print();
  // afterprint를 주지 않는 브라우저
  setTimeout(() => {
    if (box.isConnected) done();
  }, 60_000);
}

async function runPlot(app: App, ctx: CommandContext): Promise<void> {
  const st = app.active!;
  if (st.blockEdit) {
    ctx.print('블록 편집기에서는 쓸 수 없습니다.', 'err');
    return;
  }
  const model = !st.onLayout;
  const layout = st.layoutFor(st.displaySpace);
  const metric = !!st.units.measurement;
  const layoutCount = st.layouts.filter((l) => tableKey(l.blockName) !== MODEL_SPACE).length;
  const prev = lastSettings.get(st);
  // 처음 값: 이전 플롯 → 배치(모형)의 페이지 설정
  const defaults: PageForm = {
    paper: metric ? 'A3' : 'TABLOID',
    landscape: true,
    upsideDown: false,
    styleSheet: 'monochrome.ctb',
    area: model ? 'display' : 'layout',
    scale: 'fit',
    offsetX: 0,
    offsetY: 0,
    centered: true,
    lineweights: true,
    scaleLineweights: false,
    paperUnits: metric ? 'mm' : 'in',
    plotTransparency: false,
    paperspaceLast: false,
  };
  const init = initialPlotForm(layout ?? undefined, model, prev, defaults);
  const keepLabel = init.keepLabel;
  let form = init.form;
  let device: Device = prev?.format === 'svg' ? 'svg' : 'pdf';
  let copies = prev?.copies ?? 1;
  let allLayouts = prev?.what === 'layouts';
  let setupName = '';
  for (;;) {
    const r = await plotDialog(app, ctx, { form, model, device, copies, allLayouts, setupName, layoutCount, hasPrev: !!prev, keepLabel });
    if (!r) return;
    ({ form, device, copies, allLayouts, setupName } = r);
    if (r.action === 'window') {
      const w = await askWindow(ctx);
      if (w) form = { ...form, window: w, area: 'window' };
      continue;
    }
    if (r.action === 'apply') {
      if (!layout) ctx.print('모형 탭의 페이지 설정이 이 도면에 없어 저장하지 못했습니다.', 'err');
      else {
        const np = pageSettingsOf(layout.plot, form, model);
        np.pageSetupName = setupName;
        st.session.commit({ label: 'PLOT', ops: layoutPlotOps(layout, np), group: ctx.group });
        ctx.print(`지금 설정을 ${model ? '모형' : `배치 "${layout.name}"`}의 페이지 설정으로 저장했습니다.`);
      }
      continue;
    }
    break;
  }
  if (form.area === 'window' && model && !form.window) {
    const w = await askWindow(ctx);
    if (!w) return;
    form = { ...form, window: w };
  }
  if (form.area === 'limits' && model) {
    const lo = st.doc.header.get('$LIMMIN') as { x: number; y: number } | undefined;
    const hi = st.doc.header.get('$LIMMAX') as { x: number; y: number } | undefined;
    form = { ...form, window: lo && hi ? [lo.x, lo.y, hi.x, hi.y] : form.window };
  }
  const s = plotSettingsOfForm(form, model, allLayouts, device, copies, metric);
  lastSettings.set(st, s);
  if (device === 'preview') {
    await showPreview(app, st, s);
    return;
  }
  ctx.print('출력 파일을 만드는 중…');
  const name = baseName(st.saveName);
  if (device === 'svg') {
    const pages = await plotPages(app, st, s, 1);
    if (!pages.length) return;
    download(exportPageSvg(pages[0]!, 'mm'), `${name}.svg`);
    ctx.print('SVG로 저장했습니다(단위 mm).');
    return;
  }
  if (device === 'print') {
    const pages = await plotPages(app, st, s, 1);
    if (!pages.length) {
      ctx.print('출력할 내용이 없습니다.', 'err');
      return;
    }
    const first = pages[0]!;
    await printPages(pages, { w: first.width, h: first.height });
    ctx.print(`브라우저 인쇄 창에 ${pages.length}쪽을 보냈습니다.`);
    return;
  }
  const pages = await plotPages(app, st, s, PT_PER_MM);
  if (!pages.length) {
    ctx.print('출력할 내용이 없습니다.', 'err');
    return;
  }
  const blob = await pdfDocument(pages, st.saveName);
  const suffix = s.what === 'layouts' ? '-배치' : s.what === 'layout' ? `-${layout?.name ?? 'layout'}` : '';
  download(blob, `${name}${suffix}.pdf`);
  ctx.print(`PDF ${pages.length}쪽을 저장했습니다.`);
}

interface PlotDialogState {
  form: PageForm;
  model: boolean;
  device: Device;
  copies: number;
  allLayouts: boolean;
  setupName: string;
  layoutCount: number;
  hasPrev: boolean;
  /** 목록에 없는 배치 용지를 그대로 쓰는 항목의 이름(배치에서만) */
  keepLabel?: string;
}

/** 목록에 없는 배치 용지의 이름: 매체 이름과 크기(mm) */
export function keepPaperName(p: { paperName: string; paperWidth: number; paperHeight: number }): string {
  const size = `${+p.paperWidth.toFixed(1)} × ${+p.paperHeight.toFixed(1)} mm`;
  const name = p.paperName.replace(/_/g, ' ').trim();
  return name ? `${name}, ${size}` : size;
}

function plotDialog(app: App, ctx: CommandContext, v: PlotDialogState): Promise<(PlotDialogState & { action: 'plot' | 'window' | 'apply' }) | null> {
  const st = app.active!;
  const named = namedPageSetups(st.doc).items.filter((x) => x.model === v.model);
  const setup = selectIn([{ value: '', label: '<없음>' }, ...named.map((x) => ({ value: x.name, label: x.name }))], v.setupName, '페이지 설정 이름');
  const fields = pageFields(v.form, v.model, Number(st.doc.header.get('$INSUNITS') ?? 0), v.keepLabel);
  setup.addEventListener('change', () => {
    const it = named.find((x) => x.name === setup.value);
    if (it) fields.set(pageFormOf(it.plot, v.model));
  });
  const device = selectIn(DEVICES, v.device, '프린터/플로터 이름');
  const copies = numIn(v.copies, '매수');
  const all = checkIn(v.allLayouts, '모든 배치 플롯');
  const stamp = checkIn(plotStampOn(), '플롯 스탬프 켜기');
  let action: 'plot' | 'window' | 'apply' = 'plot';
  let submitNow: (() => void) | null = null;
  fields.onWindow(() => {
    action = 'window';
    submitNow?.();
  });
  const loadCtb = async () => {
    const loaded = await pickCtbFiles();
    if (!loaded.length) {
      ctx.print('플롯 스타일 표 파일을 읽지 못했습니다.', 'err');
      return;
    }
    ctx.print(`플롯 스타일 표 ${loaded.map((t) => t.name).join(', ')}을(를) 불러왔습니다.`);
    fields.set({ ...fields.read(), styleSheet: loaded[0]!.name });
  };
  const body = h(
    'div',
    { class: 'mgr-dlg' },
    group('페이지 설정', row('이름(A)', setup)),
    h('div', { class: 'mgr-cols' }, group('프린터/플로터', row('이름(M)', device)), group('매수(B)', row('1~99', copies))),
    fields.el,
    !v.model && v.layoutCount > 1 ? row(`모든 배치 플롯(${v.layoutCount}쪽)`, all) : null,
    row('플롯 스탬프 켜기', stamp),
    h('div', { class: 'mgr-note' }, '파일은 이 컴퓨터에서 만들어 바로 내려받습니다. 플롯하지 않는 도면층과 Defpoints는 빠집니다. 여러 배치를 한 번에 플롯하면 배치마다 그 페이지 설정을 씁니다.'),
  );
  return resultDialog('플롯', body, {
    ok: '확인',
    width: 720,
    bind: (s) => (submitNow = s),
    extra: [
      { label: '플롯 스타일 불러오기…', run: () => void loadCtb() },
      {
        label: '배치에 적용(U)',
        run: () => {
          action = 'apply';
          submitNow?.();
        },
      },
    ],
    submit: () => {
      const n = numOf(copies);
      if (!Number.isInteger(n) || n < 1 || n > 99) return fail('매수: 1과(와) 99 사이의 정수가 필요합니다.');
      const f = fields.read();
      if (!f.centered && (!Number.isFinite(f.offsetX) || !Number.isFinite(f.offsetY))) return fail('플롯 간격띄우기: 숫자를 입력하십시오.');
      setPlotStampOn(stamp.checked);
      const a = action;
      action = 'plot';
      return { ...v, form: f, device: device.value as Device, copies: n, allLayouts: all.checked, setupName: setup.value, action: a };
    },
  });
}
