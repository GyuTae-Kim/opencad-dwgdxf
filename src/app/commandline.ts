/**
 * 명령행: 기록, 프롬프트(키워드 클릭), 입력, 명령 자동 완성.
 * AutoCAD처럼 Enter·Space로 입력을 마치고, 빈 입력의 Enter는 직전 명령을 다시 실행한다.
 * 닫히지 않은 AutoLISP 식("(" 로 시작)을 치는 동안은 Space가 글자다.
 * 앱이 키를 먼저 볼 수 있다(intercept: 동적 입력의 Tab, 올가미 중 스페이스바). 기록·프롬프트의 오른쪽 클릭은 onContext로 넘긴다
 * (입력란은 브라우저의 복사·붙여넣기 메뉴 그대로).
 */
import { lispUnclosed } from '../edit/lisp/reader';
import type { MeasureResult } from './measure-result';
import { type AngleConvention, fromDrawingAngle } from './polar';
import { unmark } from './filetext';
/**
 * 차례로 이어 붙일 글 조각들: 도면 글 표시(ft — filetext.ts)가 조각 경계에서 나뉘면 그 조각 안에서 닫고 다음 조각에서 다시 연다
 * (프롬프트를 키워드 단추로 나눌 때 — 번역층은 글 마디마다 지킨다)
 */
export function balanceMarks(parts: readonly string[]): string[] {
  let open = false;
  return parts.map((p) => {
    const start = open;
    for (const ch of p) if (ch === '⁨') open = true;
    else if (ch === '⁩') open = false;
    return (start ? '⁨' : '') + p + (open ? '⁩' : '');
  });
}

export interface Suggestion {
  name: string;
  title: string;
}

export interface CommandLineHost {
  submit(text: string): void;
  cancel(): void;
  suggest(prefix: string): Suggestion[];
  keyword(k: string): void;
  /** 명령이 아닌 상태에서 입력란이 비었을 때 Enter·Space */
  repeat(): void;
}

/**
 * 프롬프트·출력을 지켜보는 쪽. 받는 글은 화면에 보일 글이라 도면 글 표시(ft — filetext.ts)를 그대로 둔다(106차 — 휴대폰 보기의 결과·프롬프트 카드도
 * 번역층이 표시로 도면 글을 지킨다). 값(명령 이름·키워드·비교)으로 쓸 때는 unmark로 뺀다
 */
export interface CommandLineWatcher {
  prompt?(text: string): void;
  /** measure: 측정 명령이 이 결과 줄과 함께 넘긴 값(휴대폰 보기 모드의 결과 카드) */
  print?(text: string, cls?: 'err' | 'res', measure?: MeasureResult): void;
}

export class CommandLine {
  readonly el: HTMLDivElement;
  private readonly hist: HTMLDivElement;
  private readonly promptEl: HTMLSpanElement;
  readonly input: HTMLInputElement;
  private readonly sugg: HTMLDivElement;
  private items: Suggestion[] = [];
  private selIdx = 0;
  private history: string[] = [];
  private histIdx = -1;
  /** 공백을 입력으로 받는지(문자열 입력 중) */
  acceptSpaces = false;
  /** 닫히지 않은 AutoLISP 식을 이어 받는 중(공백은 글자) */
  lispContinue = false;

  constructor(
    parent: HTMLElement,
    private readonly host: CommandLineHost,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'cmdline';
    this.hist = document.createElement('div');
    this.hist.className = 'cmd-history';
    const row = document.createElement('div');
    row.className = 'cmd-row';
    this.promptEl = document.createElement('span');
    this.promptEl.className = 'cmd-prompt';
    this.input = document.createElement('input');
    this.input.className = 'cmd-input';
    this.input.placeholder = '명령 입력';
    this.input.autocomplete = 'off';
    this.input.spellcheck = false;
    this.input.setAttribute('aria-label', '명령 입력');
    this.sugg = document.createElement('div');
    this.sugg.className = 'cmd-suggest';
    this.sugg.hidden = true;
    row.append(this.promptEl, this.input);
    this.el.append(this.hist, row, this.sugg);
    parent.append(this.el);
    this.input.addEventListener('keydown', (ev) => this.onKey(ev));
    this.input.addEventListener('input', () => this.updateSuggest());
    this.hist.addEventListener('dblclick', () => this.hist.classList.toggle('expanded'));
    this.el.addEventListener('contextmenu', (ev) => {
      if (ev.target === this.input || !this.onContext) return;
      ev.preventDefault();
      this.onContext(ev);
    });
    this.setPrompt('');
  }

  /** 키를 앱이 먼저 본다(처리했으면 true, 기본 동작은 앱이 막는다) */
  intercept: ((ev: KeyboardEvent) => boolean) | null = null;
  /** 기록·프롬프트를 오른쪽 클릭했을 때(명령행 바로 가기 메뉴) */
  onContext: ((ev: MouseEvent) => void) | null = null;

  /** 자동 완성 목록이 떠 있는지 */
  get suggesting(): boolean {
    return !this.sugg.hidden;
  }

  /** 입력란 글을 비운다(동적 입력 칸을 잠근 뒤 등) */
  clearInput(): void {
    this.input.value = '';
    this.onChange?.('');
    this.sugg.hidden = true;
  }

  /** 입력란 끝에 글을 넣는다(붙여넣기) */
  insertText(t: string): void {
    this.input.focus({ preventScroll: true });
    this.input.value += t;
    this.updateSuggest();
  }

  /** 기록 전체(기록 복사) */
  historyText(): string {
    return [...this.hist.children].map((c) => unmark(c.textContent ?? '')).join('\n');
  }

  /** 기록에서 고른 글(없으면 빈 글) */
  selectedText(): string {
    const sel = typeof window !== 'undefined' ? window.getSelection?.() : null;
    return sel && !sel.isCollapsed && this.hist.contains(sel.anchorNode) ? sel.toString() : '';
  }

  /** 입력란의 글을 Enter로 넣은 것처럼(Ctrl+J·Ctrl+M) */
  submitCurrent(): void {
    this.finish(false);
  }

  /** 빈 입력의 Enter(프롬프트의 <기본값> 고르기·마치기). 명령이 없으면 아무것도 하지 않는다(직전 명령 반복 없이) */
  pressEnter(): void {
    this.clearInput();
    if (this.promptEl.hidden) return;
    this.submit('');
  }

  /** 프롬프트 키워드 고르기(대괄호 안 키워드를 누른 것과 같다) */
  chooseKeyword(key: string): void {
    this.host.keyword(key);
  }

  /** Esc와 같다: 입력을 비우고 취소(Ctrl+\\) */
  escape(): void {
    this.clearInput();
    this.host.cancel();
  }

  toggleHistory(): void {
    this.hist.classList.toggle('expanded');
    this.hist.scrollTop = this.hist.scrollHeight;
  }

  /** 출력을 지켜보는 고리(스크립트 실행기가 오류 출력을 알아챈다). text는 표시를 뺀 글, shown은 표시를 둔 글(다시 찍을 때 — 107차) */
  onPrint: ((text: string, cls?: 'err' | 'res', shown?: string) => void) | null = null;
  /** 프롬프트·출력을 함께 지켜보는 쪽(휴대폰 보기 모드의 측정 띠). onPrint와 달리 여럿이 붙는다 */
  readonly watchers = new Set<CommandLineWatcher>();

  /** 지금 프롬프트(없으면 빈 글). 도면 글 표시를 뺀 값 */
  get prompt(): string {
    return this.promptText;
  }

  /** 화면에 보일 지금 프롬프트(도면 글 표시 그대로 — 휴대폰 보기의 프롬프트 카드) */
  get shownPrompt(): string {
    return this.promptShown;
  }

  private promptText = '';
  private promptShown = '';

  /**
   * 기록에 한 줄. measure는 지켜보는 쪽에만 넘기고 기록 글은 그대로다.
   * text의 도면 글 표시(ft — filetext.ts)는 화면에 보이는 기록 줄과 지켜보는 쪽(휴대폰 보기 카드)에 남겨 화면 번역층이 지키게 하고,
   * 출력 고리(onPrint — 스크립트 실행기가 글을 견준다)에는 뺀 글을 주고, 그 글을 다시 찍는 쪽을 위해 표시를 둔 글도 함께 준다
   */
  print(text: string, cls?: 'err' | 'res', measure?: MeasureResult): void {
    this.onPrint?.(unmark(text), cls, text);
    for (const w of this.watchers) w.print?.(text, cls, measure);
    const div = document.createElement('div');
    if (cls) div.className = cls;
    div.textContent = text;
    this.hist.append(div);
    while (this.hist.childElementCount > 400) this.hist.firstElementChild?.remove();
    this.hist.scrollTop = this.hist.scrollHeight;
  }

  /** "점 지정 또는 [윈도우(W)/이전(P)] <범위>:" 형식. 대괄호 안 키워드는 눌러서 고를 수 있다 */
  setPrompt(text: string): void {
    this.promptText = unmark(text);
    this.promptShown = text;
    for (const w of this.watchers) w.prompt?.(text);
    this.promptEl.textContent = '';
    if (!text) {
      this.promptEl.hidden = true;
      this.input.placeholder = '명령 입력';
      return;
    }
    this.promptEl.hidden = false;
    this.input.placeholder = '';
    const m = /^(.*?)\[(.*?)\](.*)$/.exec(text);
    if (!m) {
      this.promptEl.textContent = text;
      return;
    }
    const parts = m[2]!.split('/');
    // 글 마디(앞 글·키워드·/·뒤 글)마다 도면 글 표시(ft)를 닫고 다시 연다 — 번역층은 마디 단위로 지킨다
    const shown = balanceMarks([m[1] + '[', ...parts.flatMap((p, i) => (i < parts.length - 1 ? [p, '/'] : [p])), ']' + m[3]]);
    this.promptEl.append(document.createTextNode(shown[0]!));
    parts.forEach((p, i) => {
      const span = document.createElement('span');
      span.className = 'kw';
      span.textContent = shown[1 + i * 2]!;
      const key = /\(([^)]+)\)/.exec(unmark(p))?.[1] ?? unmark(p);
      span.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        this.host.keyword(key);
      });
      this.promptEl.append(span);
      if (i < parts.length - 1) this.promptEl.append(document.createTextNode(shown[2 + i * 2]!));
    });
    this.promptEl.append(document.createTextNode(shown[shown.length - 1]!));
  }

  focus(): void {
    this.input.focus({ preventScroll: true });
  }

  /** 도면 영역에서 누른 글자를 입력란으로 보낸다 */
  typeChar(ch: string): void {
    this.input.focus({ preventScroll: true });
    this.input.value += ch;
    this.updateSuggest();
  }

  /** 입력란 글자가 바뀔 때(동적 입력 표시) */
  onChange: ((text: string) => void) | null = null;

  private updateSuggest(): void {
    this.onChange?.(this.input.value);
    const v = this.input.value.trim();
    // AutoLISP 식("(…)"·"!변수")에는 명령 이름을 권하지 않는다
    if (!v || this.promptEl.hidden === false || v.startsWith('(') || v.startsWith('!')) {
      this.sugg.hidden = true;
      this.items = [];
      return;
    }
    this.items = this.host.suggest(v).slice(0, 8);
    this.selIdx = 0;
    this.sugg.innerHTML = '';
    this.items.forEach((it, i) => {
      const d = document.createElement('div');
      if (i === 0) d.className = 'sel';
      d.innerHTML = `<span></span><small></small>`;
      d.firstElementChild!.textContent = it.name;
      d.lastElementChild!.setAttribute('data-i18n-ui-copy','');
      d.lastElementChild!.textContent = it.title;
      d.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        this.input.value = '';
        this.onChange?.('');
        this.sugg.hidden = true;
        this.submit(it.name);
      });
      this.sugg.append(d);
    });
    this.sugg.hidden = this.items.length === 0;
  }

  private submit(text: string): void {
    if (text) {
      this.history.push(text);
      if (this.history.length > 100) this.history.shift();
    }
    this.histIdx = -1;
    this.host.submit(text);
  }

  private onKey(ev: KeyboardEvent): void {
    if (this.intercept?.(ev)) {
      ev.preventDefault();
      return;
    }
    if (ev.key === 'Escape') {
      ev.preventDefault();
      this.escape();
      return;
    }
    if (!this.sugg.hidden && (ev.key === 'ArrowDown' || ev.key === 'ArrowUp')) {
      ev.preventDefault();
      this.selIdx = (this.selIdx + (ev.key === 'ArrowDown' ? 1 : this.items.length - 1)) % this.items.length;
      [...this.sugg.children].forEach((c, i) => c.classList.toggle('sel', i === this.selIdx));
      return;
    }
    if (this.sugg.hidden && (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') && this.history.length) {
      ev.preventDefault();
      if (this.histIdx < 0) this.histIdx = this.history.length;
      this.histIdx = Math.max(0, Math.min(this.history.length - 1, this.histIdx + (ev.key === 'ArrowUp' ? -1 : 1)));
      this.input.value = this.history[this.histIdx] ?? '';
      return;
    }
    const space = ev.key === ' ' && !this.acceptSpaces && !this.lispContinue && !lispUnclosed(this.input.value);
    if (ev.key === 'Enter' || space || ev.key === 'Tab') {
      if (ev.key === 'Tab' && this.sugg.hidden) return;
      ev.preventDefault();
      this.finish(ev.key === 'Tab');
    }
  }

  /** 입력을 마친다(Tab이면 자동 완성 목록의 고른 항목) */
  private finish(tab: boolean): void {
    let v = this.input.value.trim();
    if (!this.sugg.hidden && this.items.length) {
      const exact = this.items.find((x) => x.name.toUpperCase() === v.toUpperCase());
      if (tab || !exact) v = this.items[this.selIdx]!.name;
    }
    this.input.value = '';
    this.onChange?.('');
    this.sugg.hidden = true;
    if (!v && this.promptEl.hidden) {
      this.host.repeat();
      return;
    }
    this.submit(v);
  }
}

/** 좌표 입력으로 읽은 점. z는 입력이 Z를 정했을 때만(없으면 명령이 고도를 쓴다) */
export interface PointInput {
  x: number;
  y: number;
  z?: number;
}

const NUM = '(-?[\\d.]+(?:e-?\\d+)?)';
const RE_XY = new RegExp(`^${NUM},${NUM}(?:,${NUM})?$`, 'i');
/** 극좌표 d<a, 원통 좌표 d<a,z */
const RE_POLAR = new RegExp(`^${NUM}<${NUM}(?:,${NUM})?$`, 'i');
/** 구 좌표 d<a<b(b = XY 평면에서 올려 본 각) */
const RE_SPHERE = new RegExp(`^${NUM}<${NUM}<${NUM}$`, 'i');

/**
 * 점 입력 해석(AutoCAD 좌표 입력): "x,y", "x,y,z", "@dx,dy[,dz]", "d<a", "@d<a", 원통 "d<a,z"·"@d<a,dz",
 * 구 "d<a<b"·"@d<a<b", 숫자(직접 거리). 각도는 도.
 * Z: 절대 좌표는 Z를 준 때만 z가 있다. @ 상대 좌표·직접 거리는 마지막 점(last)의 Z를 잇는다. last에 z가 없으면(평면 점)
 * 평면 상대 좌표에는 z가 없고, dz를 준 상대 좌표는 relZ0(고도)에서 잰다.
 * 극좌표·원통·구 좌표의 XY 평면 각도는 도면 단위의 0 방향(ANGBASE)에서 양의 방향(ANGDIR)으로 잰다(conv — AutoCAD 도움말
 * "About Entering 2D Polar Coordinates": 기본은 시계 반대 방향, 각도 규칙은 UNITS로 바꾼다). 구 좌표의 올려 본 각은 그대로.
 */
export function parsePointInput(s: string, last: { x: number; y: number; z?: number } | null, cursorDir: { x: number; y: number } | null, relZ0 = 0, conv: AngleConvention = {}): PointInput | null {
  const t = s.trim().replace(/\s+/g, '');
  if (!t) return null;
  const rel = t.startsWith('@');
  const body = rel ? t.slice(1) : t.startsWith('#') ? t.slice(1) : t;
  const base = rel ? (last ?? { x: 0, y: 0 }) : { x: 0, y: 0 };
  const baseZ = rel ? last?.z : undefined;
  /** dz를 주었으면 기준 Z(절대면 0, 상대면 마지막 점 — 없으면 relZ0)에 더하고, 주지 않았으면 상대 좌표만 마지막 점의 Z */
  const zOf = (dz: number | null): number | undefined => (dz === null ? baseZ : (rel ? (baseZ ?? relZ0) : 0) + dz);
  const out = (x: number, y: number, z: number | undefined): PointInput | null => {
    if (!Number.isFinite(x) || !Number.isFinite(y) || (z !== undefined && !Number.isFinite(z))) return null;
    return z === undefined ? { x, y } : { x, y, z };
  };
  const sph = RE_SPHERE.exec(body);
  if (sph) {
    const d = parseFloat(sph[1]!);
    const a = fromDrawingAngle((parseFloat(sph[2]!) * Math.PI) / 180, conv);
    const b = (parseFloat(sph[3]!) * Math.PI) / 180;
    const h = d * Math.cos(b);
    return out(base.x + h * Math.cos(a), base.y + h * Math.sin(a), zOf(d * Math.sin(b)));
  }
  const polar = RE_POLAR.exec(body);
  if (polar) {
    const d = parseFloat(polar[1]!);
    const a = fromDrawingAngle((parseFloat(polar[2]!) * Math.PI) / 180, conv);
    return out(base.x + d * Math.cos(a), base.y + d * Math.sin(a), zOf(polar[3] !== undefined ? parseFloat(polar[3]) : null));
  }
  const xy = RE_XY.exec(body);
  if (xy) return out(base.x + parseFloat(xy[1]!), base.y + parseFloat(xy[2]!), zOf(xy[3] !== undefined ? parseFloat(xy[3]) : null));
  const dist = /^-?[\d.]+(?:e-?\d+)?$/i.exec(body);
  if (dist && last && cursorDir && !rel) {
    const d = parseFloat(t);
    const l = Math.hypot(cursorDir.x, cursorDir.y);
    if (!Number.isFinite(d) || l < 1e-12) return null;
    // 직접 거리는 평면도의 커서 방향(수평)으로: Z는 마지막 점 그대로
    return out(last.x + (cursorDir.x / l) * d, last.y + (cursorDir.y / l) * d, last.z);
  }
  return null;
}
