/** 오른쪽 팔레트: 특성, 도면층, 치수 목록, 문자 찾기 */
import type { App } from '../app';
import type { CadColor, CadDocument, DimensionEntity, Entity, InsertEntity } from '../../core/model';
import { tableKey } from '../../core/model';
import { aciToRgb, nearestAci, rgbToCss } from '../../core/color';
import { formatLength } from '../../core/units';
import { colorText, dimDisplayText, dimTypeName, entityLength, entityProperties, lineweightText, typeName } from '../inquiry';
import { zoomToHandles } from '../commands';
import { type Field, GENERAL_FIELDS, LINEWEIGHTS, applyField, attribFields, commonValue, formatValue, geometryFields, parseValue } from '../propedit';
import { type LayerPatch, cannotDeleteLayer, createLayer, currentLayer, deleteLayer, layerUsage, newLayerName, patchLayers, renameLayer, setCurrentLayer } from '../layers';
import { pickColor } from './colorpick';
import { h, showMenu } from './dom';
import { icon } from './icons';
import { NARROW_WIDTH, sheetFraction } from './layout';
import { dynPaletteGroup } from '../dynblock';
import { arrayPaletteGroup } from '../assocarray-ui';
import { annoCurrentRow, annoPaletteGroup } from '../annoscale-palette';
import { layerFilterPanel } from '../layerfilter-ui';
import { isTextEditable } from '../textedit/entity';
import { findPanel, newFindState, tableCellGroup } from '../textedit/palette';
import { cellSelectionGroup } from '../tablecell-palette';
import { tableCellSelection } from '../tablecell';
import { ft } from '../filetext';

type Tab = 'props' | 'layers' | 'dims' | 'find';

const TABS: { key: Tab; label: string }[] = [
  { key: 'props', label: '특성' },
  { key: 'layers', label: '도면층' },
  { key: 'dims', label: '치수' },
  { key: 'find', label: '찾기' },
];
/** 탭 몸과 탭의 id(팔레트는 앱에 하나 — 리본 ribbon-panel·ribbon-tab-N 꼴) */
const PANEL_ID = 'palette-panel';
const tabId = (key: Tab) => `palette-tab-${key}`;

/**
 * 좁은 화면(760px 미만 — styles.css 같은 기준)에서 아래쪽 시트로 보이는지. 휴대폰 시트만 열 때 초점을 옮기고 닫을 때 돌려주며 Esc로 닫는다(255차).
 * 데스크톱 오른쪽 팔레트(가로로 눕힌 휴대폰 포함)는 붙박이 패널이라 그대로
 */
const isSheet = (): boolean => typeof window !== 'undefined' && window.innerWidth < NARROW_WIDTH;

/** 글 칸(앱 키 처리의 typing과 같은 갈래): 그 칸의 Esc(값 되돌리기·이름 바꾸기 취소 등)가 먼저라 시트를 닫지 않는다 */
function textField(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || !!el.isContentEditable);
}

/** 지금 초점이 있는 요소(문서 본문이면 null) */
function focusedElement(): HTMLElement | null {
  const a = document.activeElement as HTMLElement | null;
  return a && a !== document.body ? a : null;
}

/** 초점을 받는 요소(다시 그린 뒤 같은 뜻의 요소를 찾는 범위 — 256차) */
const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]';

/**
 * 다시 그려도 같은 뜻인 요소의 열쇠(256차): 특성 칸 data-field, 탭 id(253차), 도면층 행 단추 data-act(켜기·동결·잠금 — 접근 이름이 상태로 바뀜),
 * 그 밖은 접근 이름(aria-label, 없으면 글 — 「모두 켜기」 등)
 */
function focusKey(el: HTMLElement): string {
  const field = el.closest<HTMLElement>('[data-field]')?.dataset.field;
  if (field !== undefined) return `field:${field}`;
  if (el.id) return `id:${el.id}`;
  if (el.dataset.act) return `act:${el.dataset.act}`;
  return `${el.tagName}:${el.getAttribute('aria-label') ?? el.textContent?.trim() ?? ''}`;
}

/** 특성 칸을 그린 대상(257차): 문서와 targetKey(탭·보기 모드·공간·고른 객체·고른 표 셀) */
interface DrawnFor {
  st: App['active'];
  key: string;
}

/** 다시 그리기 전 초점 자리(256차) */
interface FocusMark {
  key: string;
  /** 도면층 행(data-layer — 도면층 열쇠 이름): 같은 요소가 없으면 그 행의 첫 단추 */
  layer: string | null;
  /** 글 칸의 커서·고른 범위(특성 칸은 257차부터) */
  range: [number, number, 'forward' | 'backward' | 'none'] | null;
  /** 특성 칸(data-field 글 칸)의 글(257차) — 글 칸이 아니면 null */
  text: string | null;
  /** 그 글이 칸을 그릴 때의 값(도면 값)과 다른지(치는 중 — Enter·칸 떠남 전) */
  dirty: boolean;
  /** 그 칸을 그린 대상 */
  drawnFor: DrawnFor | null;
}

export class Palette {
  readonly el: HTMLDivElement;
  private readonly tabs: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private tab: Tab = 'props';
  private layerFilter = '';
  private readonly findState = newFindState();
  private dimFilter: 'all' | 'mismatch' = 'all';
  private width = 320;
  /** 시트를 연 곳(보기 단추·정보 카드 칩·명령행 등 — 255차: 휴대폰 시트를 닫을 때 초점을 돌려준다). 본문에서 열었으면 null */
  private opener: HTMLElement | null = null;
  /** 지난번에 그린 특성 칸의 대상과 칸마다 그때의 값(도면 값) — 257차: 다시 그리기 전 글이 이 값과 다르면 치는 중 */
  private drawnFor: DrawnFor | null = null;
  private readonly drawn = new WeakMap<Element, string>();
  /** 몸을 비우는 중(257차 — 그동안 칸이 받는 blur는 칸 떠남이 아니다) */
  private redrawing = false;

  constructor(
    private readonly app: App,
    parent: HTMLElement,
  ) {
    this.tabs = h('div', { class: 'palette-tabs', role: 'tablist' });
    const close = h('button', { class: 'icon-btn', title: '팔레트 닫기', 'aria-label': '팔레트 닫기', html: icon('close2') });
    close.addEventListener('click', () => this.close());
    // 탭 몸(253차 — 리본 ribbon-panel 꼴): 탭이 aria-controls로 가리키고, 이름은 고른 탭(refresh)
    this.body = h('div', { class: 'palette-body', id: PANEL_ID, role: 'tabpanel' });
    // 휴대폰 보기 모드의 특성 탭은 값을 보이기만 한다(247차): 칸·단추는 그릴 때 막고(refresh), 막힌 칸으로 온 고치기 사건(change·input·click)도
    // 여기서 멈춰 칸마다의 처리기(특성·주석·사용자화·배열·표 셀)에 닿지 않게 한다 — 한 자리 검사로 모든 묶음을 덮는다.
    // 보이는 값만 바꾸는 칸(표지 data-display-only — 표 「셀」 고르기)은 그대로 둔다(248차)
    for (const type of ['change', 'input', 'click'])
      this.body.addEventListener(
        type,
        (ev) => {
          if (this.tab === 'props' && this.app.viewOnly && !displayOnly(ev.target)) ev.stopPropagation();
        },
        true,
      );
    const grip = h('div', { class: 'palette-resize', 'aria-hidden': 'true' });
    this.el = h('div', { class: 'palette', hidden: true }, grip, h('div', { class: 'palette-head' }, this.tabs, close), this.body);
    // 휴대폰 시트는 Esc로 닫는다(255차 — 252차 보고 (3), W3C APG 상자 꼴의 Esc를 비모달 시트에): 초점이 시트 안 글 칸 밖일 때만 —
    // 글 칸의 Esc가 먼저고(앱 키 처리의 typing 꼴) 안쪽이 이미 처리한 Esc도 그대로 둔다. 앱 취소로 넘기지 않아 진행 중인 재기는 그대로다
    // (대화 상자 Esc 꼴 — 시트 밖·연 단추에서 한 번 더 누르면 앱이 취소한다). 데스크톱 팔레트는 그대로(앱 취소)
    this.el.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape' || ev.defaultPrevented || this.el.hidden || !isSheet() || textField(ev.target)) return;
      ev.preventDefault();
      ev.stopPropagation();
      this.close();
    });
    parent.append(this.el);
    try {
      const w = Number(localStorage.getItem('opencad.palette.width'));
      if (w >= 240 && w <= 900) this.width = w;
    } catch {
      /* 저장소를 못 쓰는 환경 */
    }
    this.el.style.setProperty('--palette-w', `${this.width}px`);
    // 좁은 화면(760px 미만)에서는 아래쪽 시트: 손잡이를 위아래로 끌어 높이를 바꾼다(작업 영역 높이에 대한 비율)
    let sheet = 0.5;
    try {
      sheet = sheetFraction(Number(localStorage.getItem('opencad.palette.sheet') ?? 0.5));
    } catch {
      /* 저장소를 못 쓰는 환경 */
    }
    parent.style.setProperty('--sheet-h', `${Math.round(sheet * 100)}%`);
    grip.addEventListener('pointerdown', (ev) => {
      grip.setPointerCapture(ev.pointerId);
      const asSheet = isSheet();
      const x0 = ev.clientX;
      const w0 = this.el.getBoundingClientRect().width;
      const host = parent.getBoundingClientRect();
      const move = (e: PointerEvent) => {
        if (asSheet) {
          sheet = sheetFraction((host.bottom - e.clientY) / Math.max(1, host.height));
          parent.style.setProperty('--sheet-h', `${Math.round(sheet * 100)}%`);
          return;
        }
        this.width = Math.max(240, Math.min(900, w0 + (x0 - e.clientX)));
        this.el.style.setProperty('--palette-w', `${this.width}px`);
      };
      const up = () => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        grip.removeEventListener('pointercancel', up);
        try {
          if (asSheet) localStorage.setItem('opencad.palette.sheet', sheet.toFixed(3));
          else localStorage.setItem('opencad.palette.width', String(Math.round(this.width)));
        } catch {
          /* 무시 */
        }
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
      grip.addEventListener('pointercancel', up);
    });
  }

  /** inside: 시트 머리 탭으로 바꿈(연 곳은 그대로) */
  open(tab: string, inside = false): void {
    // 바깥(보기 단추·정보 카드 칩·명령행 등)에서 열면 연 곳을 둔다 — 휴대폰 시트를 닫을 때 돌려준다(255차). 시트 안에서 탭을 바꾸면 그대로
    const from = focusedElement();
    if (!inside && !(from && this.el.contains(from))) this.opener = from;
    this.tab = (TABS.find((t) => t.key === tab)?.key ?? 'props') as Tab;
    this.el.hidden = false;
    this.refresh();
    if (this.tab === 'find') (this.body.querySelector('input.search') as HTMLInputElement | null)?.focus();
    // 휴대폰 시트는 초점을 시트 안 고른 탭(253차 aria-selected)으로 옮긴다(255차 — WCAG 2.4.3, APG 상자 꼴). 찾기 탭은 지금처럼 찾을 글 칸.
    // 탭을 바꾸면 탭을 다시 그려도 새 고른 탭에. 데스크톱 오른쪽 팔레트는 초점을 옮기지 않는다(그대로)
    else if (isSheet()) this.tabs.querySelector<HTMLElement>('[aria-selected="true"]')?.focus({ preventScroll: true });
  }

  close(): void {
    // 휴대폰 시트(255차 — WCAG 2.4.3, APG 상자 꼴): 닫을 때(닫기 단추·Esc·재기 단추) 초점이 시트 안이었으면 연 곳으로 돌려준다.
    // 연 곳이 사라졌거나(정보 카드를 다시 그림) 초점을 받지 못하면(숨은 보기 단추 줄) 시트 안 초점을 풀어 본문으로 — 도면 영역은 초점을 받는 요소가 없고
    // 앱 키 처리는 본문을 도면으로 받는다(dom.ts keyboardControl). 초점이 시트 밖이면(다른 곳을 고름) 그대로, 데스크톱 팔레트도 그대로
    const inside = !this.el.hidden && this.el.contains(document.activeElement);
    const opener = this.opener;
    this.opener = null;
    this.el.hidden = true;
    if (!inside || !isSheet()) return;
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    const now = document.activeElement as HTMLElement | null;
    if (now && this.el.contains(now)) now.blur();
  }

  refresh(): void {
    if (this.el.hidden) return;
    // 탭 줄과 몸을 통째로 새로 만든다 — 그 안에 있던 초점은 다시 그린 뒤 같은 뜻의 요소로 돌려준다(256차, restoreFocus)
    const mark = this.focusMark();
    this.tabs.innerHTML = '';
    // 고른 탭을 알린다(253차 — WCAG 4.1.2, 리본 탭 꼴): aria-selected와 탭 ↔ 몸 이음. 휴대폰 보기 시트와 데스크톱 팔레트가 같은 코드다.
    // 탭 줄은 Tab 한 자리(258차 — 253차 보고 (1), W3C APG 탭 꼴·리본 탭 꼴의 로빙 tabindex): 고른 탭만 0, 나머지 -1.
    // 왼쪽·오른쪽 화살표(끝에서 돌아감)·Home·End는 초점만 옮기고 Enter·Space(단추 누르기)로 고른다(리본처럼 수동 고르기 — 고르면 다시 그려 tabindex가 따라감).
    // 다시 그려도 초점은 restoreFocus(탭 id — 256차)가 같은 탭에 돌려준다. 보이는 표시(class active)는 그대로
    TABS.forEach((t, i) => {
      const on = t.key === this.tab;
      const b = h('button', { class: `palette-tab ${on ? 'active' : ''}`, role: 'tab', id: tabId(t.key), 'aria-selected': on ? 'true' : 'false', 'aria-controls': PANEL_ID, tabindex: on ? 0 : -1 }, t.label);
      b.addEventListener('click', () => this.open(t.key, true));
      b.addEventListener('keydown', (ev) => {
        const k = ev.key;
        const n = TABS.length;
        const to = k === 'ArrowRight' ? (i + 1) % n : k === 'ArrowLeft' ? (i - 1 + n) % n : k === 'Home' ? 0 : k === 'End' ? n - 1 : -1;
        if (to < 0) return;
        ev.preventDefault();
        ev.stopPropagation();
        (this.tabs.children[to] as HTMLElement | undefined)?.focus();
      });
      this.tabs.append(b);
    });
    this.body.setAttribute('aria-labelledby', tabId(this.tab));
    const scroll = this.body.scrollTop;
    this.redrawing = true;
    this.body.innerHTML = '';
    this.redrawing = false;
    const st = this.app.active;
    if (!st) {
      this.body.append(h('div', { class: 'empty' }, '열린 도면이 없습니다.'));
      this.noteDrawn();
      this.restoreFocus(mark);
      return;
    }
    switch (this.tab) {
      case 'props':
        this.props();
        // 휴대폰 보기 모드(247차): 값을 보이기만 — 글 칸은 읽기 전용(값을 골라 복사할 수 있게), 고르기·단추·확인란은 막는다
        if (this.app.viewOnly) lockControls(this.body);
        break;
      case 'layers':
        this.layers();
        break;
      case 'dims':
        this.dims();
        break;
      case 'find':
        this.find();
        break;
    }
    this.body.scrollTop = scroll;
    this.noteDrawn();
    this.restoreFocus(mark);
  }

  /**
   * 특성 칸이 가리키는 대상(257차): 탭·보기 모드·공간·고른 객체 집합·고른 표 셀 — 문서까지 같으면 다시 그려도 칸의 뜻이 같다.
   * refresh는 고른 것이 바뀐 뒤에 불리므로 다시 그리기 직전이 아니라 지난번에 그릴 때(noteDrawn) 잰 것과 견준다
   */
  private targetKey(): string {
    const st = this.app.active;
    const c = tableCellSelection(this.app)?.current();
    return JSON.stringify([this.tab, this.app.viewOnly, st?.space ?? null, st ? [...st.selection].sort() : [], c ? [c.handle, c.r0, c.c0, c.r1, c.c1] : null]);
  }

  /** 그린 대상과 특성 칸(data-field 글 칸)마다 그린 값(도면 값)을 둔다(257차) */
  private noteDrawn(): void {
    this.drawnFor = { st: this.app.active, key: this.targetKey() };
    for (const el of this.body.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[data-field], textarea[data-field]')) this.drawn.set(el, el.value);
  }

  /** 다시 그리기 전 초점 자리(256차): 탭 줄·몸(다시 그리는 곳) 안일 때만 — 닫기 단추·팔레트 밖이면 null */
  private focusMark(): FocusMark | null {
    const a = document.activeElement as HTMLElement | null;
    if (!a || !(this.tabs.contains(a) || this.body.contains(a))) return null;
    const key = focusKey(a);
    const input = a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' ? (a as HTMLInputElement) : null;
    let range: FocusMark['range'] = null;
    if (input) {
      try {
        if (input.selectionStart !== null && input.selectionEnd !== null) range = [input.selectionStart, input.selectionEnd, input.selectionDirection ?? 'none'];
      } catch {
        /* 고른 범위가 없는 칸(확인란 등) */
      }
    }
    // 특성 칸은 친 글과 그 칸을 그린 대상도 둔다(257차)
    const field = input && key.startsWith('field:') ? input : null;
    return {
      key,
      layer: a.closest<HTMLElement>('[data-layer]')?.dataset.layer ?? null,
      range,
      text: field ? field.value : null,
      dirty: !!field && this.drawn.has(field) && field.value !== this.drawn.get(field),
      drawnFor: this.drawnFor,
    };
  }

  /**
   * 다시 그린 뒤 초점을 돌려준다(256차 — 255차 보고 (1)·(3), WCAG 2.4.3 초점 순서): 전에는 특성 칸만 되돌려 누른 도면층 단추·탭의 초점이 본문으로 빠졌다
   * (키보드 사용자가 자리를 잃고, 휴대폰 시트는 그 뒤 Esc가 시트 밖 Esc라 닫히지 않음). 데스크톱 팔레트·휴대폰 시트 모두.
   * 같은 열쇠의 요소(도면층 행 요소는 같은 행 안에서) → 없거나 받지 못하면(사라짐·꺼짐) 그 도면층 행의 첫 단추 → 고른 탭.
   * 다시 그리는 동안 다른 곳이 초점을 가져갔으면 그대로 둔다. 새로 돌려주는 초점은 화면을 옮기지 않는다(몸 스크롤은 위에서 되돌림).
   * 특성 칸은 그린 대상이 같으면 치던 글·커서도 되돌린다(257차)
   */
  private restoreFocus(m: FocusMark | null): void {
    if (!m) return;
    const now = document.activeElement;
    if (now && now !== document.body && now.isConnected) return;
    const take = (el: HTMLElement | null | undefined): boolean => {
      if (!el) return false;
      el.focus({ preventScroll: true });
      return document.activeElement === el;
    };
    const row = m.layer === null ? null : ([...this.body.querySelectorAll<HTMLElement>('[data-layer]')].find((r) => r.dataset.layer === m.layer) ?? null);
    const scope = m.layer === null ? [...this.tabs.querySelectorAll<HTMLElement>(FOCUSABLE), ...this.body.querySelectorAll<HTMLElement>(FOCUSABLE)] : [...(row?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    const same = scope.find((el) => focusKey(el) === m.key);
    if (same && m.key.startsWith('field:')) {
      // 특성 칸(257차 — 256차 보고 (1)·(2)): 그린 대상(문서·탭·보기 모드·공간·고른 객체·고른 셀)이 같으면 칸의 뜻이 같다 —
      // 치던 글(Enter·칸 떠남 전)과 커서·고른 범위를 그대로 되돌린다(전에는 도면 값을 다시 그려 친 글을 잃고 전체를 골랐다). 치지 않은 칸은 새 도면 값이 같을 때 커서만.
      // 고른 것이 바뀌었거나(다른 객체) 치지 않은 칸의 도면 값이 바뀌었으면 지금처럼 다시 골라 둔다(Tab으로 옮긴 칸 꼴). 읽기 전용 칸에는 글을 되돌리지 않는다
      const t = same as HTMLInputElement;
      const typed = same.tagName === 'INPUT' || same.tagName === 'TEXTAREA' ? m.text : null;
      const was = m.drawnFor;
      const drew = this.drawnFor;
      const keep = typed !== null && !!was && !!drew && was.st === drew.st && was.key === drew.key && (m.dirty ? !t.readOnly : typed === t.value);
      if (keep && typed !== null && t.value !== typed) {
        t.value = typed;
        this.commitOnBlur(t);
      }
      same.focus();
      if (keep) {
        if (m.range) t.setSelectionRange(...m.range);
      } else if (same.tagName === 'INPUT') t.select();
      if (document.activeElement === same) return;
    } else if (take(same)) {
      // 도면층 찾기 칸 등: 글마다 다시 그려도 커서 자리를 지킨다(전에는 글 끝으로)
      if (m.range) (same as HTMLInputElement).setSelectionRange(...m.range);
      return;
    }
    if (row && [...row.querySelectorAll<HTMLElement>(FOCUSABLE)].some((el) => take(el))) return;
    take(this.tabs.querySelector<HTMLElement>('[aria-selected="true"]'));
  }

  /**
   * 되돌린 글(257차)은 스크립트가 넣은 값이라 브라우저가 칸을 떠날 때 change를 보내지 않을 수 있다(사용자가 고친 값만 보냄).
   * 더 고치지 않고 떠나면(Enter·Tab·바깥 누르기) 글이 도면 값과 다를 때 change를 대신 보내 확정 규칙을 지킨다. 브라우저가 change를 보냈으면(더 고침) 그대로,
   * Esc는 도면 값으로 되돌린 뒤 떠나 보내지 않는다. 다시 그리기가 칸을 떼어 내는 동안 받는 blur는 떠남이 아니다
   */
  private commitOnBlur(el: HTMLInputElement | HTMLTextAreaElement): void {
    let sent = false;
    el.addEventListener(
      'change',
      () => {
        sent = true;
      },
      { once: true },
    );
    el.addEventListener(
      'blur',
      () => {
        if (!sent && !this.redrawing && el.value !== this.drawn.get(el)) el.dispatchEvent(new Event('change', { bubbles: true }));
      },
      { once: true },
    );
  }

  private props(): void {
    const app = this.app;
    const st = app.active!;
    const sel = [...st.selection].map((x) => st.doc.entityIndex.get(x)).filter((e): e is Entity => !!e);
    if (!sel.length) {
      // 31차: 고른 표 셀(객체 선택 없이 셀 안을 눌러 고른 것)의 셀 특성
      const cells = cellSelectionGroup(app);
      if (cells) {
        this.body.append(...cells);
        return;
      }
      this.body.append(h('div', { class: 'empty' }, '선택한 객체가 없습니다. 도면에서 객체를 클릭하십시오.'));
      this.currentSettings();
      return;
    }
    const handles = sel.map((e) => e.handle);
    const types = new Set(sel.map((e) => e.type));
    const title = sel.length === 1 ? typeName(sel[0]!) : types.size === 1 ? `${typeName(sel[0]!)} (${sel.length.toLocaleString()})` : `전체 (${sel.length.toLocaleString()})`;
    this.body.append(h('div', { class: 'prop-title' }, title));
    this.editGroup('일반', GENERAL_FIELDS, sel, handles);
    const anno = annoPaletteGroup(this.app, sel);
    if (anno) this.body.append(anno);
    if (types.size === 1) {
      const t = sel[0]!.type;
      const fields = geometryFields(t);
      const title = t === 'TEXT' || t === 'MTEXT' || t === 'ATTDEF' ? '문자' : t === 'DIMENSION' ? '치수' : t === 'MULTILEADER' ? '다중 지시선' : t === 'TOLERANCE' ? '공차' : '형상';
      if (fields.length) this.editGroup(title, fields, sel, handles);
      if (sel.length === 1 && isTextEditable(sel[0])) this.body.append(this.textEditButton(sel[0]!.handle));
      if (sel.length === 1 && t === 'ACAD_TABLE') {
        const tg = tableCellGroup(app, sel[0]!.handle);
        if (tg) this.body.append(tg);
      }
      if (sel.length === 1 && t === 'INSERT') {
        const dyn = dynPaletteGroup(app, sel[0]!.handle);
        if (dyn) this.body.append(dyn);
        const arr = arrayPaletteGroup(app, sel[0]!.handle);
        if (arr) this.body.append(arr);
        const af = attribFields(sel[0] as InsertEntity);
        if (af.length) this.editGroup('속성', af, sel, handles);
      }
    }
    if (sel.length === 1) {
      const edited = new Set(['도면층', '색상', '선종류', '선종류 축척', '선가중치', '투명도', ...geometryFields(sel[0]!.type).map((f) => f.label)]);
      const dup = /^(시작점|끝점|중심|위치|삽입점|축척|내용)$/;
      for (const g of entityProperties(st.doc, sel[0]!, st.units)) {
        const rows = g.rows.filter((r) => !edited.has(r.k) && !dup.test(r.k));
        if (rows.length) this.group(g.title === '일반' ? '정보' : g.title === '형상' ? '측정' : g.title, rows);
      }
      return;
    }
    const counts = new Map<string, number>();
    for (const e of sel) counts.set(typeName(e), (counts.get(typeName(e)) ?? 0) + 1);
    let total = 0;
    let lenCount = 0;
    for (const e of sel) {
      const l = entityLength(e);
      if (l !== null) {
        total += l;
        lenCount++;
      }
    }
    this.group('종류별', [
      ...[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ k, v: v.toLocaleString() })),
      ...(lenCount ? [{ k: `길이 합계(${lenCount})`, v: formatLength(total, st.units) }] : []),
    ]);
  }

  /** 선택이 없을 때: 새로 그릴 객체의 현재 특성 */
  private currentSettings(): void {
    const app = this.app;
    const st = app.active!;
    const hdr = st.doc.header;
    const cur = {
      layer: String(hdr.get('$CLAYER') ?? '0'),
      color: currentColor(st.doc),
      linetype: String(hdr.get('$CELTYPE') ?? 'ByLayer'),
      lineweight: Number(hdr.get('$CELWEIGHT') ?? -1),
      ltscale: Number(hdr.get('$CELTSCALE') ?? 1),
    };
    const setHeader = (name: string, after: string | number) => {
      const before = st.doc.header.get(name);
      if (before === after) return;
      st.session.commit({ label: 'SETVAR', ops: [{ kind: 'header', name, before, after }] });
    };
    const fake = { ...cur, type: 'CURRENT', handle: '', transparency: -1 } as unknown as Entity;
    const rows: HTMLElement[] = [];
    for (const f of GENERAL_FIELDS) {
      if (f.label === '투명도') continue;
      rows.push(
        this.editor(f, [fake], (v) => {
          if (f.label === '도면층') setCurrentLayer(app, String(v));
          else if (f.label === '색상') setHeader('$CECOLOR', colorToHeader(v as CadColor));
          else if (f.label === '선종류') setHeader('$CELTYPE', String(v));
          else if (f.label === '선가중치') setHeader('$CELWEIGHT', Number(v));
          else if (f.label === '선종류 축척') setHeader('$CELTSCALE', Number(v));
        }),
      );
    }
    const annoRow = annoCurrentRow(app);
    if (annoRow) rows.push(annoRow);
    this.body.append(h('div', { class: 'prop-group' }, h('h4', {}, '새 객체의 현재 특성'), ...rows));
  }

  private editGroup(title: string, fields: Field[], sel: Entity[], handles: string[]): void {
    const rows = fields.map((f) => this.editor(f, sel, (v) => applyField(this.app, handles, f, v)));
    this.body.append(h('div', { class: 'prop-group' }, h('h4', {}, title), ...rows));
  }

  /** 항목 하나의 편집 줄 */
  private editor(f: Field, sel: Entity[], commit: (v: unknown) => void): HTMLElement {
    const st = this.app.active!;
    const { value, varies } = commonValue(f, sel, st.doc);
    const id = `pf-${f.label}`;
    // 속성 태그처럼 도면에서 온 이름표는 옮기지 않는다(104차)
    const aria = f.fileLabel ? ft(f.label) : f.label;
    let ctl: HTMLElement;
    switch (f.kind) {
      case 'select': {
        const opts = f.options?.(st.doc) ?? [];
        const sv = value === undefined ? '' : String(value);
        if (!varies && sv && !opts.some((o) => o.value.toUpperCase() === sv.toUpperCase())) opts.unshift({ value: sv, label: sv });
        const el = h('select', { 'data-field': id, 'aria-label': aria }, ...(varies ? [h('option', { value: '' }, '*여러 개*')] : []), ...opts.map((o) => h('option', { value: o.value }, o.label)));
        const match = opts.find((o) => o.value.toUpperCase() === sv.toUpperCase());
        el.value = varies ? '' : (match?.value ?? sv);
        el.addEventListener('change', () => {
          if (el.value !== '') commit(el.value);
        });
        ctl = el;
        break;
      }
      case 'bool': {
        const el = h('select', { 'data-field': id, 'aria-label': aria }, ...(varies ? [h('option', { value: '' }, '*여러 개*')] : []), h('option', { value: '1' }, '예'), h('option', { value: '0' }, '아니오'));
        el.value = varies ? '' : value ? '1' : '0';
        el.addEventListener('change', () => {
          if (el.value !== '') commit(el.value === '1');
        });
        ctl = el;
        break;
      }
      case 'color': {
        const c = value as CadColor | undefined;
        const rgb = c ? (c.rgb !== undefined && c.aci !== 0 && c.aci !== 256 ? c.rgb : c.aci > 0 && c.aci < 256 ? aciToRgb(c.aci, true) : null) : null;
        const el = h(
          'button',
          { class: 'prop-color', 'data-field': id, 'aria-label': aria },
          h('span', { class: 'swatch', style: rgb === null ? 'background:transparent' : `background:${rgbToCss(rgb)}` }),
          varies ? '*여러 개*' : c ? colorText(c) : '',
        );
        el.addEventListener('click', async () => {
          const r = await pickColor(c ?? { aci: 256 }, { allowBy: true });
          if (r) commit(r);
        });
        ctl = el;
        break;
      }
      case 'multiline': {
        const el = h('textarea', { 'data-field': id, rows: 3, 'aria-label': aria, placeholder: varies ? '*여러 개*' : '' }) as HTMLTextAreaElement;
        el.value = varies ? '' : String(value ?? '');
        el.addEventListener('change', () => commit(el.value));
        ctl = el;
        break;
      }
      default: {
        const el = h('input', { 'data-field': id, 'aria-label': aria, placeholder: varies ? '*여러 개*' : '', readonly: !!f.readonly }) as HTMLInputElement;
        el.value = varies ? '' : formatValue(f, value, st.units);
        if (f.readonly) {
          ctl = el;
          break;
        }
        const orig = el.value;
        el.addEventListener('keydown', (ev) => {
          if ((ev as KeyboardEvent).key === 'Enter') el.blur();
          if ((ev as KeyboardEvent).key === 'Escape') {
            el.value = orig;
            el.blur();
          }
        });
        el.addEventListener('change', () => {
          if (el.value === orig || (varies && !el.value.trim())) return;
          const r = parseValue(f, el.value, st.units);
          if ('error' in r) {
            this.app.cmd.print(`${aria}: ${r.error}`, 'err');
            el.value = orig;
            return;
          }
          commit(r.value);
        });
        ctl = el;
      }
    }
    return h('label', { class: 'prop-row edit' }, h('span', { class: 'k', translate: f.fileLabel ? 'no' : undefined }, f.label), ctl);
  }

  /** 문자 편집 단추(제자리 편집기로 TEXTEDIT) */
  private textEditButton(handle: string): HTMLElement {
    const b = h('button', { class: 'btn', type: 'button' }, '문자 편집...');
    b.addEventListener('click', () => {
      this.app.setSelection([handle], 'replace');
      void this.app.run('TEXTEDIT', handle);
    });
    return h('div', { class: 'prop-group', style: 'display:flex;justify-content:flex-end;padding:4px 8px' }, b);
  }

  private group(title: string, rows: { k: string; v: string; file?: boolean }[]): void {
    this.body.append(
      h(
        'div',
        { class: 'prop-group' },
        h('h4', {}, title),
        // 도면에서 온 값(도면층·스타일·블록 이름, 문자 내용 등)은 옮기지 않는다(104차)
        ...rows.map((r) => h('div', { class: 'prop-row' }, h('span', { class: 'k' }, r.k), h('span', { class: 'v', title: r.v, translate: r.file ? 'no' : undefined }, r.v))),
      ),
    );
  }

  private layers(): void {
    const app = this.app;
    const st = app.active!;
    const search = h('input', { class: 'search', placeholder: '도면층 이름 찾기', value: this.layerFilter, 'aria-label': '도면층 찾기' });
    search.addEventListener('input', () => {
      this.layerFilter = search.value;
      // 다시 그린 찾기 칸에 초점과 커서 자리를 돌려준다(refresh — 256차: 전에는 커서를 글 끝으로 옮겼다)
      this.refresh();
    });
    const used = layerUsage(app);
    const q = this.layerFilter.trim().toUpperCase();
    // 도면층 필터(필터 트리에서 고른 필터와 필터 반전) 안에서 이름 찾기
    const lf = layerFilterPanel(app, () => this.refresh());
    const rows = [...st.doc.layers.entries()].filter(([k]) => lf.visible.has(k) && (!q || k.includes(q))).sort((a, b) => a[1].name.localeCompare(b[1].name, 'ko'));
    const clayer = tableKey(currentLayer(app));
    if (this.layerSel && !st.doc.layers.has(this.layerSel)) this.layerSel = null;
    const sel = this.layerSel;
    const bar = h(
      'div',
      { class: 'layer-bar' },
      h('button', { class: 'icon-btn', title: '새 도면층', 'aria-label': '새 도면층', html: icon('layerNew'), onclick: () => this.newLayer() }),
      h('button', {
        class: 'icon-btn',
        title: '지우기',
        'aria-label': '도면층 지우기',
        html: icon('layerDelete'),
        disabled: !sel,
        onclick: () => sel && deleteLayer(app, sel),
      }),
      h('button', { class: 'icon-btn', title: '현재 도면층으로', 'aria-label': '현재 도면층으로', html: icon('layerCurrent'), disabled: !sel, onclick: () => sel && setCurrentLayer(app, sel) }),
      ...lf.barButtons,
      h('span', { class: 'status-sep' }),
      h('button', { class: 'btn', onclick: () => patchLayers(app, 'LAYON', rows.map(([, l]) => [l.name, { off: false }])) }, '모두 켜기'),
      h('button', { class: 'btn', onclick: () => patchLayers(app, 'LAYTHW', rows.map(([, l]) => [l.name, { frozen: false }])) }, '동결 해제'),
      h('span', { class: 'chip', style: 'align-self:center;margin-left:auto' }, `${rows.length} / ${st.doc.layers.size}`),
    );
    const tbody = h('tbody');
    for (const [k, lay] of rows) {
      const color = lay.color.rgb !== undefined ? lay.color.rgb : aciToRgb(lay.color.aci, true);
      // data-act: 다시 그린 뒤 같은 단추로 초점을 돌려주는 표지(256차 — 접근 이름은 「켜짐」·「꺼짐」처럼 상태로 바뀜). 켜기 off·동결 frozen·잠금 locked
      const tog = (ic: string, title: string, off: boolean, patch: LayerPatch) => {
        const b = h('button', { class: `toggle ${off ? 'off' : ''}`, title, 'aria-label': `${ft(lay.name)} ${title}`, 'data-act': Object.keys(patch)[0], html: icon(ic) });
        b.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (patch.frozen && k === clayer) {
            app.cmd.print('현재 도면층은 동결할 수 없습니다.', 'err');
            return;
          }
          patchLayers(app, 'LAYER', [[lay.name, patch]]);
        });
        return b;
      };
      const sw = h('button', { class: 'toggle', title: `색: ${colorText(lay.color)}`, 'aria-label': `${ft(lay.name)} 색 바꾸기` },h('span', { class: 'swatch', style: `background:${rgbToCss(color)}` }));
      sw.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        // 휴대폰 보기 모드의 도면층 시트는 켜고 끄기만(246차): 색 견본은 색을 보이기만 하고, 이름·행 두 번 누르기와 행 메뉴도 열지 않는다
        if (app.viewOnly) return;
        const c = await pickColor(lay.color);
        if (c) patchLayers(app, 'LAYER', [[lay.name, { color: c }]]);
      });
      const lt = h('select', { class: 'cell-select', 'aria-label': `${ft(lay.name)} 선종류` },...[...st.doc.linetypes.values()].filter((l) => !/^by(layer|block)$/i.test(l.name)).map((l) => h('option', { value: l.name }, l.name)));
      lt.value = [...st.doc.linetypes.values()].find((l) => tableKey(l.name) === tableKey(lay.linetype))?.name ?? lay.linetype;
      lt.addEventListener('change', () => patchLayers(app, 'LAYER', [[lay.name, { linetype: lt.value }]]));
      const lw = h('select', { class: 'cell-select', 'aria-label': `${ft(lay.name)} 선가중치` },h('option', { value: '-3' }, '기본값'), ...LINEWEIGHTS.map((w) => h('option', { value: String(w) }, lineweightText(w))));
      lw.value = String(lay.lineweight);
      lw.addEventListener('change', () => patchLayers(app, 'LAYER', [[lay.name, { lineweight: Number(lw.value) }]]));
      const nameCell = h('td', { class: 'layer-name', title: `${lay.name}${lay.description ? ` — ${lay.description}` : ''}` }, lay.name);
      nameCell.addEventListener('dblclick', (ev) => {
        ev.stopPropagation();
        if (app.viewOnly) return;
        this.renameInline(nameCell, k, lay.name);
      });
      // data-layer(도면층 열쇠 이름): 다시 그린 뒤 같은 행 안에서 초점을 돌려주는 표지(256차)
      const tr = h(
        'tr',
        { class: `${k === clayer ? 'current' : ''} ${k === sel ? 'selected' : ''}`, 'data-layer': k },
        h('td', { class: 'cur', title: k === clayer ? '현재 도면층' : '' }, k === clayer ? '✓' : ''),
        h('td', {}, tog(lay.off ? 'eyeOff' : 'eye', lay.off ? '꺼짐' : '켜짐', lay.off, { off: !lay.off })),
        h('td', {}, tog(lay.frozen ? 'snow' : 'sun', lay.frozen ? '동결' : '동결 해제', lay.frozen, { frozen: !lay.frozen })),
        h('td', {}, tog(lay.locked ? 'lock' : 'unlock', lay.locked ? '잠김' : '잠기지 않음', !lay.locked, { locked: !lay.locked })),
        h('td', {}, sw),
        nameCell,
        h('td', {}, lt),
        h('td', {}, lw),
        h('td', { style: 'color:var(--text-faint);text-align:right' }, String(used.get(k) ?? 0)),
      );
      tr.addEventListener('click', () => {
        this.layerSel = k;
        this.refresh();
      });
      // 보기 모드: 현재 도면층(숨긴 칸)을 바꾸지 않는다 — 켜기 단추를 빨리 두 번 눌러도 행으로 올라온다
      tr.addEventListener('dblclick', () => {
        if (!app.viewOnly) setCurrentLayer(app, lay.name);
      });
      lf.draggable(tr, lay.name);
      tr.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        // 보기 모드: 행 메뉴(안드로이드 길게 누르기도 여기로 온다)를 열지 않는다 — 도면 영역 메뉴와 같은 규칙. 브라우저 메뉴도 막은 채로
        if (app.viewOnly) return;
        this.layerSel = k;
        showMenu(ev.clientX, ev.clientY, [
          { label: '현재 도면층으로', icon: 'layerCurrent', run: () => setCurrentLayer(app, lay.name) },
          { label: '이름 바꾸기', run: () => this.renameInline(nameCell, k, lay.name) },
          {
            label: '색 바꾸기',
            run: async () => {
              const c = await pickColor(lay.color);
              if (c) patchLayers(app, 'LAYER', [[lay.name, { color: c }]]);
            },
          },
          { separator: true },
          { label: '이 도면층만 켜기', run: () => patchLayers(app, 'LAYISO', [...st.doc.layers.values()].map((l) => [l.name, { off: tableKey(l.name) !== k }])) },
          { label: '이 도면층 객체 모두 선택', run: () => this.selectLayer(k) },
          { label: '고른 객체를 이 도면층으로', disabled: !st.selection.size, run: () => applyField(app, [...st.selection], GENERAL_FIELDS[0]!, lay.name) },
          { separator: true },
          { label: '도면층 지우기', icon: 'layerDelete', disabled: !!cannotDeleteLayer(app, k), run: () => deleteLayer(app, k) },
          ...lf.rowMenu(lay.name),
        ]);
      });
      tbody.append(tr);
    }
    this.body.append(
      search,
      bar,
      lf.wrap(h(
        'div',
        { class: 'layer-table' },
        h(
          'table',
          { class: 'grid' },
          h(
            'thead',
            {},
            h('tr', {}, h('th', {}, ''), h('th', {}, '켜기'), h('th', {}, '동결'), h('th', {}, '잠금'), h('th', {}, '색'), h('th', {}, '이름'), h('th', {}, '선종류'), h('th', {}, '선가중치'), h('th', { style: 'text-align:right' }, '객체')),
          ),
          tbody,
        ),
      )),
      lf.footer(rows.length),
      // 보기 모드는 켜고 끄기만이라 데스크톱 조작(두 번 누르기·오른쪽 클릭) 안내 대신 보기 단추 "도면층"의 설명 글(모드를 바꾸면 setViewOnly가 다시 그린다)
      h(
        'div',
        { style: 'margin-top:8px;color:var(--text-faint)' },
        app.viewOnly ? '도면층 켜고 끄기' : '행을 두 번 누르면 현재 도면층이 되고, 이름을 두 번 누르면 이름을 바꿉니다. 오른쪽 클릭으로 더 많은 기능을 씁니다.',
      ),
    );
  }

  private layerSel: string | null = null;

  private newLayer(): void {
    const app = this.app;
    const name = newLayerName(app);
    const l = createLayer(app, name);
    if (!l) return;
    this.layerSel = tableKey(name);
    this.refresh();
    const cell = [...this.body.querySelectorAll<HTMLTableCellElement>('td.layer-name')].find((c) => c.textContent === name);
    if (cell) this.renameInline(cell, tableKey(name), name);
  }

  private renameInline(cell: HTMLElement, key: string, name: string): void {
    const input = h('input', { class: 'cell-input', value: name, 'aria-label': '새 도면층 이름' }) as HTMLInputElement;
    cell.innerHTML = '';
    cell.append(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      if (ok && input.value.trim() && input.value.trim() !== name) renameLayer(this.app, key, input.value.trim());
      else this.refresh();
    };
    input.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter') finish(true);
      if (ev.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('click', (ev) => ev.stopPropagation());
    input.addEventListener('dblclick', (ev) => ev.stopPropagation());
  }

  private selectLayer(k: string): void {
    const app = this.app;
    const st = app.active!;
    const scene = st.scenes.get(st.space);
    if (!scene) return;
    const hs = scene.entities.filter((b) => tableKey(st.doc.entityIndex.get(b.handle)?.layer ?? '') === k).map((b) => b.handle);
    app.setSelection(hs);
    app.cmd.print(`도면층 "${st.layers.get(k)?.name}" 객체 ${hs.length}개를 선택했습니다.`);
  }

  private dims(): void {
    const app = this.app;
    const st = app.active!;
    const scene = st.scenes.get(st.space);
    const list: { e: DimensionEntity; text: string; value: string; match: boolean | null }[] = [];
    for (const b of scene?.entities ?? []) {
      const e = st.doc.entityIndex.get(b.handle);
      if (e?.type !== 'DIMENSION') continue;
      const t = dimDisplayText(st.doc, e);
      const num = parseFloat(t.text.replace(/[^\d.\-]/g, ''));
      const fnum = parseFloat(t.formatted.replace(/[^\d.\-]/g, ''));
      let match: boolean | null = null;
      if (e.text && e.text !== '<>' && !e.text.includes('<>') && Number.isFinite(num) && Number.isFinite(fnum)) {
        const dec = (t.formatted.split('.')[1] ?? '').replace(/\D/g, '').length;
        match = Math.abs(num - fnum) <= 0.5 * Math.pow(10, -dec) + 1e-9;
      } else if (!e.text || e.text.includes('<>')) match = true;
      list.push({ e, text: t.text, value: t.isAngle ? `${((t.value * 180) / Math.PI).toFixed(4)}°` : formatLength(t.value, { lunits: 2, luprec: 4 }), match });
    }
    const mism = list.filter((x) => x.match === false).length;
    const sel = h('select', { style: 'height:26px;background:var(--bg-input);color:var(--text);border:1px solid var(--border-soft);border-radius:3px' }, h('option', { value: 'all' }, `모두 (${list.length})`), h('option', { value: 'mismatch' }, `재지정 값 불일치 (${mism})`));
    (sel as HTMLSelectElement).value = this.dimFilter;
    sel.addEventListener('change', () => {
      this.dimFilter = (sel as HTMLSelectElement).value as 'all' | 'mismatch';
      this.refresh();
    });
    const rows = list.filter((x) => this.dimFilter === 'all' || x.match === false);
    if (!list.length) {
      this.body.append(h('div', { class: 'empty' }, '이 공간에는 치수가 없습니다.'));
      return;
    }
    const tbody = h('tbody');
    for (const r of rows) {
      const tr = h(
        'tr',
        { class: 'clickable', title: '눌러서 이동' },
        h('td', {}, dimTypeName(r.e)),
        h('td', { style: 'max-width:110px;overflow:hidden;text-overflow:ellipsis', translate: r.text ? 'no' : undefined }, r.text || '(숨김)'),
        h('td', { style: 'font-family:var(--mono);color:var(--text-dim)' }, r.value),
        h('td', {}, r.match === false ? h('span', { class: 'chip warn', title: '표시 문자가 실제 측정값과 다릅니다' }, '다름') : r.match ? '✓' : '-'),
      );
      tr.addEventListener('click', () => {
        app.setSelection([r.e.handle]);
        zoomToHandles(app, [r.e.handle]);
      });
      tbody.append(tr);
    }
    this.body.append(
      h('div', { style: 'margin-bottom:6px' }, sel),
      h('table', { class: 'grid' }, h('thead', {}, h('tr', {}, h('th', {}, '종류'), h('th', {}, '표시'), h('th', {}, '측정값'), h('th', {}, '일치'))), tbody),
    );
  }

  /** 찾기 및 대치(FIND): src/app/textedit/palette.ts */
  private find(): void {
    this.body.append(findPanel(this.app, this.findState));
  }
}

/** 보기 모드 특성 탭(247차): 글 칸은 읽기 전용, 고르기·단추·확인란은 막는다(보이는 값만 바꾸는 칸은 빼고 — 248차) */
function lockControls(root: HTMLElement): void {
  for (const el of root.querySelectorAll<HTMLInputElement>('input:not([type=checkbox]):not([type=radio]), textarea')) if (!displayOnly(el)) el.readOnly = true;
  for (const el of root.querySelectorAll<HTMLButtonElement>('select, button, input[type=checkbox], input[type=radio]')) if (!displayOnly(el)) el.disabled = true;
}

/** 보이는 값만 바꾸는 칸(도면을 고치지 않음 — 표 「셀」 고르기, 표지 data-display-only)인지: 보기 모드 특성 탭에서도 막지 않는다(248차) */
function displayOnly(t: EventTarget | null): boolean {
  return !!(t as Element | null)?.closest?.('[data-display-only]');
}

/** 머리말 $CECOLOR(색 번호: 256 ByLayer, 0 ByBlock) → 색 */
export function currentColor(doc: CadDocument): CadColor {
  const v = doc.header.get('$CECOLOR');
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 256 ? { aci: v } : { aci: 256 };
}

/** 색 → $CECOLOR 값(트루컬러는 가장 가까운 색 번호로) */
export function colorToHeader(c: CadColor): number {
  if (c.aci === 256 || c.aci === 0) return c.aci;
  if (c.rgb !== undefined) return nearestAci(c.rgb);
  return c.aci;
}
