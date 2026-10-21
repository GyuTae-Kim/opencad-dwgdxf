/**
 * 휴대폰 보기 모드(app.viewOnly): 휴대폰에서는 그리기·고치기보다 도면을 보고 치수를 확인하는 일이 많으므로,
 * 편집 리본·명령행·제도 상태 막대를 숨기고 다음을 둔다.
 * - 보기 단추 줄: 전체 보기, 거리·반지름·각도·면적 재기, 도면층, 치수 목록(편집 화면과 오가는 단추는 제목 막대)
 * - 측정 띠(도면 아래): 명령의 프롬프트와 키워드·<기본값> 단추(Enter·Esc 대신), 끝나면 결과와 "다시 재기".
 *   측정 결과는 명령이 넘긴 값(measure-result.ts)으로 큰 값 한 줄과 작은 보조 줄로 보이고, 누르면 명령행 원문을 펼친다
 * - 정보 카드: 누른 객체 하나의 길이·반지름·지름·면적·치수 값 같은 치수 정보
 * 손가락 기기에서 좁거나 낮은 화면(겹침 리본 배치)이면 처음부터 켜고, 사용자가 고른 모드는 이 브라우저에 기억한다.
 */
import type { App } from '../app';
import type { DocState } from '../docstate';
import type { Entity } from '../../core/model';
import type { SnapKind } from '../view';
import { entityProperties, typeName } from '../inquiry';
import type { MeasureResult } from '../measure-result';
import { h, showMenu, toast } from './dom';
import { icon } from './icons';
import { ribbonOverlay } from './layout';

export type MobileMode = 'view' | 'edit';

const MODE_KEY = 'opencad-dwgdxf.mobile-mode';

export function readMobileMode(): MobileMode | null {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v === 'view' || v === 'edit' ? v : null;
  } catch {
    return null;
  }
}

export function storeMobileMode(m: MobileMode): void {
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {
    /* 저장소를 못 쓰는 브라우저 */
  }
}

/** 보기 모드 측정 띠의 객체 스냅 칩(재는 동안 켜고 끈다) */
export const VIEW_SNAPS: { kind: SnapKind; label: string }[] = [
  { kind: 'end', label: '끝점' },
  { kind: 'mid', label: '중간점' },
  { kind: 'cen', label: '중심' },
  { kind: 'int', label: '교차점' },
  // 데스크톱 이름 '수직'은 다른 곳에서 '세로'로도 번역되므로 칩은 따로 쓴다(수선의 발)
  { kind: 'per', label: '수직 발' },
  { kind: 'nea', label: '근처점' },
];
const SNAP_KEY = 'opencad-dwgdxf.mobile-snaps';

/** 보기 모드에서 고른 객체 스냅(이 브라우저에 기억). 고른 적이 없으면 null */
export function readViewSnaps(): SnapKind[] | null {
  try {
    const v = localStorage.getItem(SNAP_KEY);
    if (v === null) return null;
    const all = new Set<string>(['end', 'mid', 'cen', 'qua', 'int', 'ins', 'nod', 'per', 'nea', 'tan', 'ext', 'gcen', 'app', 'par']);
    return v.split(',').filter((k) => all.has(k)) as SnapKind[];
  } catch {
    return null;
  }
}

export function storeViewSnaps(kinds: Iterable<SnapKind>): void {
  try {
    localStorage.setItem(SNAP_KEY, [...kinds].join(','));
  } catch {
    /* 저장소를 못 쓰는 브라우저 */
  }
}

/** 찾지 못한 참조 파일(외부 참조·이미지·PDF·SHX 글꼴) 개수 */
export interface MissingRefs {
  xref: number;
  image: number;
  pdf: number;
  shx: number;
}

/** 빠진 참조 안내 줄들(줄마다 번역 사전의 한 문장) */
export function missingLines(m: MissingRefs): string[] {
  const out: string[] = [];
  if (m.xref) out.push(`외부 참조 ${m.xref}개`);
  if (m.image) out.push(`이미지 ${m.image}개`);
  if (m.pdf) out.push(`PDF 참고 ${m.pdf}개`);
  if (m.shx) out.push(`SHX 글꼴 ${m.shx}개`);
  return out;
}

/** 손가락이 주인 기기(휴대폰·태블릿)인지 */
export function isCoarse(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

/** 처음 보기 모드로 열지: 손가락 기기만. 고른 적이 있으면 그대로, 아니면 겹침 리본 배치(휴대폰 크기)일 때 */
export function startInViewMode(stored: MobileMode | null, coarse: boolean, width: number, height: number): boolean {
  if (!coarse) return false;
  if (stored) return stored === 'view';
  return ribbonOverlay(width, height);
}

export interface PromptParts {
  /** 프롬프트 전체(번역 목록의 키와 같게 그대로 보인다) */
  text: string;
  /** 대괄호 안 키워드: 누르면 key를 넣는다 */
  keywords: { key: string; label: string }[];
  /** <기본값>: Enter로 고르는 것(없으면 null) */
  fallback: string | null;
}

/** "점 지정 또는 [윈도우(W)/이전(P)] <범위>:" → 본문, 키워드, <기본값> */
export function promptParts(prompt: string): PromptParts {
  const kw = /\[(.*?)\]/.exec(prompt);
  const keywords = kw
    ? kw[1]!
        .split('/')
        .map((p) => p.trim())
        .filter((p) => p)
        .map((label) => ({ key: /\(([^)]+)\)/.exec(label)?.[1] ?? label, label }))
    : [];
  const def = /<([^<>]+)>\s*:?\s*$/.exec(prompt);
  return { text: prompt, keywords, fallback: def ? def[1]!.trim() : null };
}

/** 정보 카드에 보일 치수 항목(이 차례로, 있는 것만) */
const INFO_KEYS = ['측정값', '표시 문자', '치수 종류', '길이', '반지름', '지름', '호 길이', '사이 각도', '각도', '둘레', '면적', '장축 반지름', '단축 반지름', '델타 X', '델타 Y', '문자 높이', '높이', '내용', '이름'];
const INFO_MAX = 6;

/** 객체의 치수 정보 행(정보 카드): 특성 목록에서 치수에 쓰는 것만 골라 앞에서 INFO_MAX개 */
export function infoRows(groups: readonly { rows: readonly { k: string; v: string }[] }[]): { k: string; v: string }[] {
  const all = new Map<string, string>();
  for (const g of groups) for (const r of g.rows) if (!all.has(r.k)) all.set(r.k, r.v);
  const out: { k: string; v: string }[] = [];
  for (const k of INFO_KEYS) {
    const v = all.get(k);
    if (v !== undefined && v !== '') out.push({ k, v });
    if (out.length >= INFO_MAX) break;
  }
  return out;
}

/** 명령이 남긴 결과·오류 한 줄(측정 명령은 값을 단다) */
export interface ResultLine {
  text: string;
  cls?: 'err' | 'res';
  measure?: MeasureResult;
}
/** 결과 카드의 한 덩어리: 측정 값 하나(그 값을 단 명령행 줄들) 또는 그냥 한 줄 */
export type ResultBlock = { measure: MeasureResult; text: string[] } | { line: ResultLine };

/** 결과 줄 묶기: 같은 측정 값을 단 이어진 줄(거리·증분 두 줄 등)은 한 덩어리, 나머지는 한 줄씩 */
export function resultBlocks(lines: readonly ResultLine[]): ResultBlock[] {
  const out: ResultBlock[] = [];
  for (const l of lines) {
    const last = out[out.length - 1];
    if (l.measure && last && 'measure' in last && last.measure === l.measure) last.text.push(l.text);
    else if (l.measure) out.push({ measure: l.measure, text: [l.text] });
    else out.push({ line: l });
  }
  return out;
}

/** 카드에 보일 덩어리: 측정 값이 있으면 마지막 측정과 그 뒤(이어 잰 앞 결과는 빼고), 없으면 모두 */
export function latestResults(blocks: readonly ResultBlock[]): ResultBlock[] {
  for (let i = blocks.length - 1; i >= 0; i--) if ('measure' in blocks[i]!) return blocks.slice(i);
  return [...blocks];
}

/**
 * 측정 결과: 이름·큰 값·보조 줄(누르면 명령행 원문을 펼친다). 값은 번역하지 않는다.
 * 원문은 줄마다 따로 두어야 번역 사전의 줄 문장과 맞는다(여러 줄을 한 title에 넣으면 반쯤만 번역된다)
 */
export function measureView(m: MeasureResult, text: readonly string[]): HTMLDetailsElement {
  const sub = h('span', { class: 'mv-sub' });
  m.details.forEach((d, i) => {
    if (i) sub.append(' · ');
    sub.append(h('span', {}, d.k), ' ', h('b', { 'data-i18n-skip': '' }, d.v));
  });
  const summary = h(
    'summary',
    {},
    h('span', { class: 'mv-kind' }, m.label),
    h('span', { class: 'mv-big', 'data-i18n-skip': '' }, m.value),
    m.details.length ? sub : null,
  );
  return h('details', { class: `mv-measure ${m.kind}` }, summary, h('div', { class: 'mv-raw' }, ...text.map((t) => h('div', {}, t))));
}

/** 보기 단추 줄의 측정 명령 */
const MEASURES: { name: string; ico: string; label: string; title: string }[] = [
  { name: 'DIST', ico: 'dist', label: '거리', title: '두 점 사이 거리 재기' },
  { name: 'MEASURERADIUS', ico: 'radius', label: '반지름', title: '원·호의 반지름과 지름 재기' },
  { name: 'MEASUREANGLE', ico: 'angle', label: '각도', title: '두 선 사이·호의 각도 재기' },
  { name: 'AREA', ico: 'area', label: '면적', title: '점이나 객체로 면적과 둘레 재기' },
];
/** MEASURERADIUS는 MEASUREGEOM으로 돈다 */
const RUNS_AS: Record<string, string> = { MEASURERADIUS: 'MEASUREGEOM' };

/**
 * 보기 단추 이름 글자 단계(styles.css): 기본 12px, .tight 11.5px, .tighter 10.5px, .tightest 10px에 단추 최소 폭 40px·옆 여백을 줄이고
 * 더 보기는 44px(높이 44px 그대로)
 */
const FIT_STEPS = ['tight', 'tighter', 'tightest'] as const;

/** 보기 단추 줄: 기본 글자로 넘치면 한 단계씩 작게. 가장 작게도 넘치면 줄이 가로로 밀린다. 고른 단계를 돌려준다 */
export function fitLabels(bar: HTMLElement): string {
  bar.classList.remove(...FIT_STEPS);
  const over = () => bar.clientWidth > 0 && bar.scrollWidth > bar.clientWidth + 1;
  let step = '';
  for (const s of FIT_STEPS) {
    if (!over()) break;
    if (step) bar.classList.remove(step);
    bar.classList.add(s);
    step = s;
  }
  return step;
}

export interface MobileViewHost {
  openPalette(tab: string): void;
  closePalette(): void;
  /** 모드가 바뀐 뒤(셸이 배치를 다시 맞춘다) */
  modeChanged(): void;
}

export class MobileView {
  /** 보기 단추 줄(#app 2행, 보기 모드에서만 보인다) */
  readonly bar: HTMLDivElement;
  /** 측정 띠·정보 카드(도면 영역 아래) */
  readonly card: HTMLDivElement;
  private readonly measureBtns = new Map<string, HTMLButtonElement>();
  /** 지금 명령이 남긴 결과·오류 줄 */
  private lines: ResultLine[] = [];
  /** 측정 결과의 명령행 원문을 펼쳐 두었는지(다시 그려도 그대로) */
  private rawOpen = false;
  /** 결과를 남긴 명령(다시 재기) */
  private lastMeasure: string | null = null;
  /** 결과 띠를 닫았는지 */
  private dismissed = false;
  private renderQueued = false;
  private fitQueued = false;
  /** 보기 모드에서 이미 전체 보기로 맞춘 문서(파일에 저장된 화면은 데스크톱 비율이라 휴대폰에서 잘린다) */
  private readonly fitted = new WeakSet<object>();
  /** 편집 화면의 객체 스냅(보기 모드를 나가면 되돌린다) */
  private editSnaps: Set<SnapKind> | null = null;
  /** 들어갈 때 편집 화면의 객체 스냅 켜고 끔(OSNAP) */
  private editOsnap: boolean | null = null;
  /** 문서마다 찾지 못한 참조(알아보는 중이면 null)와 안내를 닫았는지 */
  private readonly missing = new WeakMap<DocState, MissingRefs | null>();
  private readonly noticeClosed = new WeakSet<DocState>();

  constructor(
    private readonly app: App,
    private readonly host: MobileViewHost,
    private readonly root: HTMLElement,
  ) {
    const btn = (ico: string, label: string, title: string, run: () => void): HTMLButtonElement =>
      h('button', { class: 'vb-btn', type: 'button', title, 'aria-label': title, html: icon(ico), onclick: run }, h('span', { class: 'vb-lbl' }, label));
    const fit = btn('extents', '전체 보기', '도면 전체 보기', () => void app.run('ZOOMEXTENTS'));
    const measures = MEASURES.map((m) => {
      const b = btn(m.ico, m.label, m.title, () => this.startMeasure(m.name));
      this.measureBtns.set(m.name, b);
      return b;
    });
    const layers = btn('layers', '도면층', '도면층 켜고 끄기', () => host.openPalette('layers'));
    // 이름은 짧게(영어 등에서도 한 줄에 들어가게), 자세한 뜻은 제목 풍선
    const dims = btn('dimlist', '치수', '치수 목록(표시 값과 실제 길이 비교)', () => host.openPalette('dims'));
    // 더 보기: 점 좌표(ID), 문자 찾기, 빠진 참조 파일 고르기(외부 참조·이미지·PDF·SHX 글꼴)
    // 이름 없이 아이콘만(좁은 화면에서 다른 단추 이름이 줄지 않게 — 접근 이름은 제목)
    const more = btn('more', '', '더 보기: 좌표·찾기·참조 파일', () => {
      const r = more.getBoundingClientRect();
      showMenu(r.left, r.bottom + 2, [
        { label: '점 좌표 (ID)', icon: 'id', run: () => this.startMeasure('ID') },
        { label: '문자 찾기', icon: 'find', run: () => host.openPalette('find') },
        { label: '참조 파일 고르기(외부 참조·SHX 글꼴)', icon: 'folder', run: () => void this.pickRefFiles() },
      ]);
    });
    more.classList.add('vb-more');
    more.querySelector('.vb-lbl')?.remove();
    this.bar = h('div', { class: 'viewbar', role: 'toolbar', 'aria-label': '보기 도구' }, fit, ...measures, layers, dims, more);
    this.card = h('div', { class: 'mview-card', role: 'status', 'aria-live': 'polite', hidden: true });
    app.cmd.watchers.add({
      prompt: () => this.queue(),
      print: (text, cls, measure) => this.onPrint(text, cls, measure),
    });
    // 이름 길이가 언어·화면 폭마다 달라 보기 단추 줄이 넘칠 때만 글자를 줄인다
    const refit = () => this.queueFit();
    if (typeof window !== 'undefined') window.addEventListener('resize', refit);
    root.addEventListener('languagechange', refit);
  }

  /** 보기 모드 켜고 끄기(기억한다) */
  setMode(m: MobileMode): void {
    storeMobileMode(m);
    this.apply(m === 'view');
  }

  /** 기억 없이 모드만 맞춘다(처음 열 때) */
  apply(view: boolean): void {
    // 보기 모드의 객체 스냅은 따로 기억한다(측정 띠의 칩): 들어갈 때 편집 화면 것(스냅 종류와 켜고 끔)을 두고, 나갈 때 되돌린다
    const modes = this.app.snapModes;
    if (view && !this.editSnaps) {
      this.editSnaps = new Set(modes);
      this.editOsnap = this.app.osnapOn;
      const saved = readViewSnaps();
      if (saved) {
        modes.clear();
        for (const k of saved) modes.add(k);
      }
    } else if (!view && this.editSnaps) {
      modes.clear();
      for (const k of this.editSnaps) modes.add(k);
      this.editSnaps = null;
      // 보기 모드의 칩이 객체 스냅을 켰어도(편집 화면에서 껐던 경우) 편집 화면 상태로
      if (this.editOsnap !== null && this.app.osnapOn !== this.editOsnap) {
        this.app.osnapOn = this.editOsnap;
        this.app.ui?.refreshStatus?.();
      }
      this.editOsnap = null;
    }
    this.app.setViewOnly(view);
    this.root.classList.toggle('view-mode', view);
    if (!view) this.card.hidden = true;
    this.host.modeChanged();
    this.render();
    this.queueFit();
  }

  /** 다음 그리기 전에(번역이 끝난 뒤) 보기 단추 이름을 한 줄에 맞춘다 */
  private queueFit(): void {
    if (this.fitQueued || typeof requestAnimationFrame !== 'function') return;
    this.fitQueued = true;
    requestAnimationFrame(() => {
      this.fitQueued = false;
      fitLabels(this.bar);
    });
  }

  get viewMode(): boolean {
    return this.app.viewOnly;
  }

  /** 고른 것·도면이 바뀌었을 때(셸의 refreshPalette) */
  refresh(): void {
    this.queue();
  }

  private startMeasure(name: string): void {
    this.host.closePalette();
    this.dismissed = false;
    void this.app.run(name);
  }

  private onPrint(text: string, cls?: 'err' | 'res', measure?: MeasureResult): void {
    // 새 명령이 시작하면 결과를 비운다(run()이 "명령: 이름"을 먼저 찍는다)
    const m = /^명령: (\S+)/.exec(text);
    // 화면 명령(전체 보기 등)은 재던 결과를 지우지 않는다
    if (m && !/^(ZOOM|PAN$|REGEN)/.test(m[1]!)) {
      this.lines = [];
      this.dismissed = false;
      this.rawOpen = false;
      const name = m[1]!;
      if (MEASURES.some((x) => x.name === name || RUNS_AS[x.name] === name)) this.lastMeasure = MEASURES.find((x) => x.name === name)?.name ?? (name === 'MEASUREGEOM' ? 'MEASURERADIUS' : name);
      else if (name === 'ID') this.lastMeasure = 'ID';
    } else if (cls && !m) {
      for (const line of text.split('\n')) this.lines.push({ text: line, cls, measure });
      if (this.lines.length > 8) this.lines.splice(0, this.lines.length - 8);
    }
    this.queue();
  }

  /** 같은 틱의 여러 알림(프롬프트·출력)을 한 번에 그린다 */
  private queue(): void {
    if (this.renderQueued) return;
    this.renderQueued = true;
    queueMicrotask(() => {
      this.renderQueued = false;
      this.render();
    });
  }

  private render(): void {
    const app = this.app;
    const card = this.card;
    // 도면이 없으면 보기 단추는 누를 수 없다(누르면 "열린 도면이 없습니다"만 나온다)
    for (const b of this.bar.querySelectorAll('button')) b.disabled = !app.active;
    if (!app.viewOnly || !app.active) {
      card.hidden = true;
      return;
    }
    if (!this.fitted.has(app.active)) {
      this.fitted.add(app.active);
      app.view.zoomExtents();
    }
    const running = app.busyCommand;
    for (const [name, b] of this.measureBtns) b.classList.toggle('on', running === name || running === RUNS_AS[name]);
    card.replaceChildren();
    card.className = 'mview-card';
    const prompt = app.cmd.prompt;
    if (running && prompt) {
      this.renderPrompt(prompt);
      return;
    }
    if (!running && this.lines.length && !this.dismissed) {
      this.renderResult();
      return;
    }
    if (!running && this.renderInfo()) return;
    if (!running && this.renderNotice(app.active)) return;
    card.hidden = true;
  }

  /** 찾지 못한 참조 파일 안내(문서마다 한 번, 닫을 수 있다). 보였으면 true */
  private renderNotice(st: DocState): boolean {
    if (this.noticeClosed.has(st)) return false;
    if (!this.missing.has(st)) {
      this.missing.set(st, null);
      void this.checkMissing(st);
      return false;
    }
    const m = this.missing.get(st);
    const lines = m ? missingLines(m) : [];
    if (!lines.length) return false;
    const card = this.card;
    card.classList.add('is-notice');
    const body = h('div', { class: 'mv-body' }, h('div', { class: 'mv-title' }, h('b', {}, '찾지 못한 참조 파일')), ...lines.map((l) => h('div', { class: 'mv-res' }, l)), h('div', { class: 'mv-res' }, '이 기기에서 파일을 고르면 원래대로 그립니다.'));
    const acts = h('div', { class: 'mv-acts' }, h('button', { class: 'mv-chip primary', type: 'button', onclick: () => void this.pickRefFiles() }, '파일 고르기'));
    const close = h('button', {
      class: 'mv-close',
      type: 'button',
      title: '닫기',
      'aria-label': '닫기',
      html: icon('close2'),
      onclick: () => {
        this.noticeClosed.add(st);
        this.render();
      },
    });
    card.append(body, close, acts);
    card.hidden = false;
    return true;
  }

  /** 문서가 쓰는 외부 참조·이미지·PDF·SHX 글꼴 중 이 기기에 없는 것을 센다(참조 모듈은 처음 쓸 때 불러온다) */
  private async checkMissing(st: DocState): Promise<void> {
    const [refs, shx] = await Promise.all([import('../refs'), import('../shxfonts')]);
    const miss = refs.docRefs(this.app, st.doc).filter((r) => !r.found);
    const n = (k: string) => miss.filter((r) => r.kind === k).length;
    this.missing.set(st, { xref: n('xref'), image: n('image'), pdf: n('pdf'), shx: shx.missingShxFonts(this.app, st.doc).length });
    this.queue();
  }

  /** 참조 파일 고르기(손가락 기기에는 폴더 고르기가 없어 파일 여러 개): 확장자대로 외부 참조·이미지·PDF·SHX 글꼴에 잇는다 */
  private async pickRefFiles(): Promise<void> {
    const files = await new Promise<File[]>((resolve) => {
      const input = h('input', { type: 'file', multiple: true, style: 'display:none' }) as HTMLInputElement;
      const done = (f: File[]) => {
        resolve(f);
        input.remove();
      };
      input.addEventListener('change', () => done([...(input.files ?? [])]));
      input.addEventListener('cancel', () => done([]));
      document.body.append(input);
      input.click();
    });
    if (!files.length) return;
    const [refs, shx] = await Promise.all([import('../refs'), import('../shxfonts')]);
    const app = this.app;
    const xr = await refs.linkXrefFiles(app, files);
    const img = await refs.linkImageFiles(app, files);
    const pdf = await refs.linkPdfFiles(app, files);
    const fonts = await shx.addShxFonts(app, await shx.readShx(files), true);
    const n = xr.length + img.linked.length + pdf.linked.length + fonts;
    toast(n ? `파일 ${n}개를 연결했습니다.` : '연결할 수 있는 파일이 없습니다(DWG·DXF·이미지·PDF·SHX).', n ? 'info' : 'warn');
    for (const d of app.docs) this.missing.delete(d);
    this.queue();
  }

  /** 명령 중: 프롬프트, 키워드·<기본값> 단추, 취소 */
  private renderPrompt(prompt: string): void {
    const card = this.card;
    const parts = promptParts(prompt);
    card.classList.add('is-prompt');
    const body = h('div', { class: 'mv-body' });
    // 직전 결과(MEASUREGEOM처럼 이어서 재는 명령): 마지막 측정 값, 없으면 마지막 두 줄
    const blocks = latestResults(resultBlocks(this.lines));
    if (blocks.some((b) => 'measure' in b)) for (const b of blocks) body.append(this.resultEl(b));
    else for (const l of this.lines.slice(-2)) body.append(h('div', { class: `mv-res ${l.cls}` }, l.text));
    body.append(h('div', { class: 'mv-prompt' }, parts.text));
    const acts = h('div', { class: 'mv-acts' });
    // <기본값>이 키워드와 같으면(<객체(O)>) 그 키워드 단추를 앞세우고 따로 두지 않는다
    for (const k of parts.keywords) acts.append(h('button', { class: `mv-chip${k.label === parts.fallback ? ' primary' : ''}`, type: 'button', onclick: () => this.app.cmd.chooseKeyword(k.key) }, k.label));
    if (parts.fallback && !parts.keywords.some((k) => k.label === parts.fallback)) acts.append(h('button', { class: 'mv-chip primary', type: 'button', title: 'Enter', onclick: () => this.app.cmd.pressEnter() }, parts.fallback));
    else if (this.app.pendingInput?.kind === 'select') acts.append(h('button', { class: 'mv-chip primary', type: 'button', title: 'Enter', onclick: () => this.app.cmd.pressEnter() }, '완료'));
    const close = h('button', { class: 'mv-close', type: 'button', title: '취소', 'aria-label': '취소', html: icon('close2'), onclick: () => this.app.cmd.escape() });
    card.append(body, close, acts);
    // 점을 고를 때: 객체 스냅 칩(끝점·중간점·중심·교차점·수직 발·근처점) — 데스크톱의 제도 상태 막대 대신
    if (this.app.pendingInput?.kind === 'point') card.append(this.snapChips());
    card.hidden = false;
  }

  private snapChips(): HTMLElement {
    const app = this.app;
    const row = h('div', { class: 'mv-snaps', role: 'group', 'aria-label': '객체 스냅' });
    for (const s of VIEW_SNAPS) {
      const on = app.osnapOn && app.snapModes.has(s.kind);
      const b = h('button', { class: `mv-snap${on ? ' on' : ''}`, type: 'button', 'aria-pressed': on ? 'true' : 'false', title: `객체 스냅: ${s.label}` }, s.label);
      b.addEventListener('click', () => {
        if (!app.osnapOn) {
          // 편집 화면에서 객체 스냅을 껐으면 켜고 이 스냅만
          app.osnapOn = true;
          app.snapModes.clear();
          app.snapModes.add(s.kind);
        } else if (app.snapModes.has(s.kind)) app.snapModes.delete(s.kind);
        else app.snapModes.add(s.kind);
        storeViewSnaps(app.snapModes);
        this.render();
      });
      row.append(b);
    }
    return row;
  }

  /** 명령이 끝난 뒤: 결과 줄과 다시 재기·닫기 */
  private renderResult(): void {
    const card = this.card;
    card.classList.add('is-result');
    const body = h('div', { class: 'mv-body' });
    for (const b of latestResults(resultBlocks(this.lines))) body.append(this.resultEl(b));
    const acts = h('div', { class: 'mv-acts' });
    const again = this.lastMeasure;
    if (again) acts.append(h('button', { class: 'mv-chip', type: 'button', html: `${icon('undo')}<span>다시 재기</span>`, onclick: () => this.startMeasure(again) }));
    const close = h('button', {
        class: 'mv-close',
        type: 'button',
        title: '닫기',
        'aria-label': '닫기',
        html: icon('close2'),
        onclick: () => {
          this.dismissed = true;
          this.app.view.overlay.marks = [];
          this.app.view.requestOverlay();
          this.render();
        },
      });
    card.append(body, close, acts);
    card.hidden = false;
  }

  /** 결과 덩어리 하나: 측정 값은 큰 값 카드(펼침 상태를 기억), 나머지는 명령행 글 그대로 */
  private resultEl(b: ResultBlock): HTMLElement {
    if ('line' in b) return h('div', { class: `mv-res ${b.line.cls ?? ''}` }, b.line.text);
    const el = measureView(b.measure, b.text);
    el.open = this.rawOpen;
    el.addEventListener('toggle', () => (this.rawOpen = el.open));
    return el;
  }

  /** 고른 객체 하나의 치수 정보. 보였으면 true */
  private renderInfo(): boolean {
    const st = this.app.active;
    if (!st || st.selection.size !== 1) return false;
    const handle = [...st.selection][0]!;
    const e = st.doc.entityIndex.get(handle) as Entity | undefined;
    if (!e) return false;
    const rows = infoRows(entityProperties(st.doc, e, st.units));
    const card = this.card;
    card.classList.add('is-info');
    const body = h('div', { class: 'mv-body' });
    const head = h('div', { class: 'mv-title' }, h('b', {}, typeName(e)), h('span', { class: 'mv-layer', 'data-i18n-skip': '' }, e.layer));
    body.append(head);
    const grid = h('dl', { class: 'mv-rows' });
    for (const r of rows) grid.append(h('dt', {}, r.k), h('dd', { 'data-i18n-skip': '' }, r.v));
    if (rows.length) body.append(grid);
    const acts = h('div', { class: 'mv-acts' });
    acts.append(h('button', { class: 'mv-chip', type: 'button', html: `${icon('props')}<span>특성 전체</span>`, onclick: () => this.host.openPalette('props') }));
    const close = h('button', { class: 'mv-close', type: 'button', title: '선택 해제', 'aria-label': '선택 해제', html: icon('close2'), onclick: () => this.app.clearSelection() });
    card.append(body, close, acts);
    card.hidden = false;
    return true;
  }
}
