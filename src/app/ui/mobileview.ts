/**
 * 휴대폰 보기 모드(app.viewOnly): 휴대폰에서는 그리기·고치기보다 도면을 보고 치수를 확인하는 일이 많으므로,
 * 편집 리본·명령행·제도 상태 막대를 숨기고 다음을 둔다.
 * - 보기 단추 줄: 전체 보기, 거리·반지름·각도·면적 재기, 도면층, 치수 목록(편집 화면과 오가는 단추는 제목 막대)
 * - 측정 띠(도면 아래): 명령의 프롬프트와 키워드·<기본값> 단추(Enter·Esc 대신), 끝나면 결과와 "다시 재기"
 * - 정보 카드: 누른 객체 하나의 길이·반지름·지름·면적·치수 값 같은 치수 정보
 * 손가락 기기에서 좁거나 낮은 화면(겹침 리본 배치)이면 처음부터 켜고, 사용자가 고른 모드는 이 브라우저에 기억한다.
 */
import type { App } from '../app';
import type { Entity } from '../../core/model';
import { entityProperties, typeName } from '../inquiry';
import { h } from './dom';
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

/** 보기 단추 줄의 측정 명령 */
const MEASURES: { name: string; ico: string; label: string; title: string }[] = [
  { name: 'DIST', ico: 'dist', label: '거리', title: '두 점 사이 거리 재기' },
  { name: 'MEASURERADIUS', ico: 'radius', label: '반지름', title: '원·호의 반지름과 지름 재기' },
  { name: 'MEASUREANGLE', ico: 'angle', label: '각도', title: '두 선 사이·호의 각도 재기' },
  { name: 'AREA', ico: 'area', label: '면적', title: '점이나 객체로 면적과 둘레 재기' },
];
/** MEASURERADIUS는 MEASUREGEOM으로 돈다 */
const RUNS_AS: Record<string, string> = { MEASURERADIUS: 'MEASUREGEOM' };

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
  private lines: { text: string; cls?: 'err' | 'res' }[] = [];
  /** 결과를 남긴 명령(다시 재기) */
  private lastMeasure: string | null = null;
  /** 결과 띠를 닫았는지 */
  private dismissed = false;
  private renderQueued = false;
  /** 보기 모드에서 이미 전체 보기로 맞춘 문서(파일에 저장된 화면은 데스크톱 비율이라 휴대폰에서 잘린다) */
  private readonly fitted = new WeakSet<object>();

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
    const dims = btn('dimlist', '치수 목록', '치수 목록(표시 값과 실제 길이 비교)', () => host.openPalette('dims'));
    this.bar = h('div', { class: 'viewbar', role: 'toolbar', 'aria-label': '보기 도구' }, fit, ...measures, layers, dims);
    this.card = h('div', { class: 'mview-card', role: 'status', 'aria-live': 'polite', hidden: true });
    app.cmd.watchers.add({
      prompt: () => this.queue(),
      print: (text, cls) => this.onPrint(text, cls),
    });
  }

  /** 보기 모드 켜고 끄기(기억한다) */
  setMode(m: MobileMode): void {
    storeMobileMode(m);
    this.apply(m === 'view');
  }

  /** 기억 없이 모드만 맞춘다(처음 열 때) */
  apply(view: boolean): void {
    this.app.setViewOnly(view);
    this.root.classList.toggle('view-mode', view);
    if (!view) this.card.hidden = true;
    this.host.modeChanged();
    this.render();
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

  private onPrint(text: string, cls?: 'err' | 'res'): void {
    // 새 명령이 시작하면 결과를 비운다(run()이 "명령: 이름"을 먼저 찍는다)
    const m = /^명령: (\S+)/.exec(text);
    // 화면 명령(전체 보기 등)은 재던 결과를 지우지 않는다
    if (m && !/^(ZOOM|PAN$|REGEN)/.test(m[1]!)) {
      this.lines = [];
      this.dismissed = false;
      const name = m[1]!;
      if (MEASURES.some((x) => x.name === name || RUNS_AS[x.name] === name)) this.lastMeasure = MEASURES.find((x) => x.name === name)?.name ?? (name === 'MEASUREGEOM' ? 'MEASURERADIUS' : name);
    } else if (cls && !m) {
      for (const line of text.split('\n')) this.lines.push({ text: line, cls });
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
    card.hidden = true;
  }

  /** 명령 중: 프롬프트, 키워드·<기본값> 단추, 취소 */
  private renderPrompt(prompt: string): void {
    const card = this.card;
    const parts = promptParts(prompt);
    card.classList.add('is-prompt');
    const body = h('div', { class: 'mv-body' });
    // 직전 결과(MEASUREGEOM처럼 이어서 재는 명령)
    const res = this.lines.filter((l) => l.cls).slice(-2);
    for (const l of res) body.append(h('div', { class: `mv-res ${l.cls}` }, l.text));
    body.append(h('div', { class: 'mv-prompt' }, parts.text));
    const acts = h('div', { class: 'mv-acts' });
    // <기본값>이 키워드와 같으면(<객체(O)>) 그 키워드 단추를 앞세우고 따로 두지 않는다
    for (const k of parts.keywords) acts.append(h('button', { class: `mv-chip${k.label === parts.fallback ? ' primary' : ''}`, type: 'button', onclick: () => this.app.cmd.chooseKeyword(k.key) }, k.label));
    if (parts.fallback && !parts.keywords.some((k) => k.label === parts.fallback)) acts.append(h('button', { class: 'mv-chip primary', type: 'button', title: 'Enter', onclick: () => this.app.cmd.pressEnter() }, parts.fallback));
    else if (this.app.pendingInput?.kind === 'select') acts.append(h('button', { class: 'mv-chip primary', type: 'button', title: 'Enter', onclick: () => this.app.cmd.pressEnter() }, '완료'));
    const close = h('button', { class: 'mv-close', type: 'button', title: '취소', 'aria-label': '취소', html: icon('close2'), onclick: () => this.app.cmd.escape() });
    card.append(body, close, acts);
    card.hidden = false;
  }

  /** 명령이 끝난 뒤: 결과 줄과 다시 재기·닫기 */
  private renderResult(): void {
    const card = this.card;
    card.classList.add('is-result');
    const body = h('div', { class: 'mv-body' });
    for (const l of this.lines) body.append(h('div', { class: `mv-res ${l.cls ?? ''}` }, l.text));
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
