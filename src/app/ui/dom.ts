/** DOM 도우미: 요소 만들기, 알림, 메뉴, 대화상자 */
import { icon } from './icons';
import { clampBox } from './layout';

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | number | ((ev: Event) => void) | undefined> = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, ''), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

export function iconSpan(name: string, cls = 'ic'): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = cls;
  s.innerHTML = icon(name);
  return s;
}

let toastWrap: HTMLDivElement | null = null;

/** 알림에 붙는 단추(예: 새 버전 → 새로 고침) */
export interface ToastAction {
  label: string;
  run: () => void;
}

/**
 * 잠깐 보이는 알림. 오류는 화면 읽기 프로그램이 바로 읽게 role="alert"로 둔다.
 * action이 있으면 단추와 닫기 단추를 붙인다. ms가 0이면 닫을 때까지 남는다
 */
export function toast(text: string, kind: 'info' | 'warn' | 'error' = 'info', ms = 4200, action?: ToastAction): HTMLDivElement {
  if (!toastWrap || !toastWrap.isConnected) {
    toastWrap = h('div', { class: 'toast-wrap', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastWrap);
  }
  const t = h('div', { class: `toast ${kind === 'info' ? '' : kind}`, role: kind === 'error' ? 'alert' : undefined }, h('span', { class: 'toast-text' }, text));
  if (action) {
    t.classList.add('has-action');
    const run = h('button', { type: 'button', class: 'toast-action' }, action.label);
    run.addEventListener('click', () => {
      t.remove();
      action.run();
    });
    const close = h('button', { type: 'button', class: 'toast-close', 'aria-label': '알림 닫기', title: '알림 닫기', html: icon('close2') });
    close.addEventListener('click', () => t.remove());
    t.append(run, close);
  }
  toastWrap.append(t);
  if (ms > 0) setTimeout(() => t.remove(), ms);
  return t;
}

/** 키보드로 초점을 옮겨 온 요소인지(:focus-visible — 마우스로 누른 단추는 아니다). 이 판별을 못 하는 환경은 false */
export function focusVisible(el: Element): boolean {
  try {
    return el.matches(':focus-visible');
  } catch {
    return false;
  }
}

/** 키보드로 초점을 옮겨 온 단추·링크·탭 같은 컨트롤인지(그림 영역·문서 본문은 아니다). 앱의 Enter·Space·Tab 처리가 이것을 비켜 간다 */
export function keyboardControl(t: Element | null): boolean {
  if (!t || typeof t.matches !== 'function' || t === document.body || t.tagName === 'CANVAS') return false;
  return t.matches('button, a[href], summary, select, [role="button"], [role="tab"], [role="menuitem"], [role="option"], [tabindex]') && focusVisible(t);
}

/** 키보드로 옮겨 다닐 수 있는(보이는) 요소들 */
export function focusables(root: ParentNode): HTMLElement[] {
  const sel = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';
  return [...root.querySelectorAll<HTMLElement>(sel)].filter((el) => {
    if (el.closest('[hidden], [inert]')) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  });
}

export interface MenuItem {
  label?: string;
  icon?: string;
  kbd?: string;
  disabled?: boolean;
  separator?: boolean;
  heading?: string;
  run?: () => void;
  /** 마우스가 올라갈 때(선택 순환의 강조 등) */
  hover?: () => void;
}

let openMenu: HTMLDivElement | null = null;
/** 메뉴를 열기 전에 초점이 있던 곳(Esc로 닫으면 돌려준다) */
let menuOpener: HTMLElement | null = null;

export function closeMenu(restoreFocus = false): void {
  const had = !!openMenu;
  openMenu?.remove();
  openMenu = null;
  if (had && restoreFocus && menuOpener?.isConnected) menuOpener.focus({ preventScroll: true });
  menuOpener = null;
}

/**
 * 바로가기 메뉴. 키보드: 위·아래 화살표·Home·End로 옮기고 Enter·Space로 고르며, Esc는 닫고 연 곳으로 초점을 돌린다(Tab도 닫는다).
 * 키보드로 연 메뉴(초점이 단추 등에 있을 때)는 첫 항목에 초점을 둔다
 */
export function showMenu(x: number, y: number, items: MenuItem[]): void {
  closeMenu();
  const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
  const m = h('div', { class: 'menu', role: 'menu' });
  for (const it of items) {
    if (it.separator) {
      m.append(h('hr', { role: 'separator' }));
      continue;
    }
    if (it.heading) {
      m.append(h('div', { class: 'label', role: 'presentation' }, it.heading));
      continue;
    }
    const b = h(
      'button',
      {
        type: 'button',
        role: 'menuitem',
        tabindex: -1,
        disabled: !!it.disabled,
        onclick: () => {
          closeMenu(true);
          it.run?.();
        },
        onmouseenter: () => it.hover?.(),
      },
      it.icon ? iconSpan(it.icon) : h('span', { class: 'ic' }),
      it.label ?? '',
      it.kbd ? h('kbd', {}, it.kbd) : null,
    );
    m.append(b);
  }
  const enabled = () => [...m.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not([disabled])')];
  m.addEventListener('keydown', (ev) => {
    const k = ev as KeyboardEvent;
    const list = enabled();
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    let next = -1;
    if (k.key === 'ArrowDown') next = (i + 1) % list.length;
    else if (k.key === 'ArrowUp') next = (i - 1 + list.length) % list.length;
    else if (k.key === 'Home') next = 0;
    else if (k.key === 'End') next = list.length - 1;
    else if (k.key === 'Escape') {
      k.preventDefault();
      k.stopPropagation();
      closeMenu(true);
      return;
    } else if (k.key === 'Tab') {
      closeMenu(true);
      return;
    }
    if (next >= 0 && list.length) {
      k.preventDefault();
      k.stopPropagation();
      list[next]!.focus();
    }
  });
  document.body.append(m);
  const r = m.getBoundingClientRect();
  // 보이는 영역(소프트 키보드가 올라오면 그만큼 줄어든다) 안에 둔다. 데스크톱에서는 창 크기와 같다
  const vv = window.visualViewport;
  const ox = vv?.offsetLeft ?? 0;
  const oy = vv?.offsetTop ?? 0;
  const pos = clampBox(x - ox, y - oy, r.width, r.height, vv?.width ?? window.innerWidth, vv?.height ?? window.innerHeight);
  m.style.left = `${pos.left + ox}px`;
  m.style.top = `${pos.top + oy}px`;
  openMenu = m;
  menuOpener = opener;
  // 키보드로 연 메뉴는 첫 항목으로(마우스로 연 메뉴는 초점을 옮기지 않아 그리던 자리의 키 입력이 그대로 간다)
  if (opener && focusVisible(opener)) enabled()[0]?.focus();
  setTimeout(() => {
    const off = (ev: Event) => {
      if (openMenu && !openMenu.contains(ev.target as Node)) {
        closeMenu();
        window.removeEventListener('pointerdown', off, true);
      }
    };
    window.addEventListener('pointerdown', off, true);
  });
}

let dialogSeq = 0;

/**
 * 대화상자(모달). 키보드: 열면 주 단추(없으면 상자)에 초점, Tab·Shift+Tab은 상자 안에서만 돈다, Esc는 닫는다.
 * 어떻게 닫히든(단추·Esc·바깥 누르기·back.remove()) 열기 전에 초점이 있던 곳으로 초점을 돌린다
 */
export function dialog(title: string, body: Node | string, buttons: { label: string; primary?: boolean; run?: () => void | boolean }[] = [{ label: '닫기', primary: true }]): HTMLDivElement {
  const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
  const back = h('div', { class: 'dialog-back' });
  const close = () => back.remove();
  const titleId = `dialog-title-${++dialogSeq}`;
  const box = h(
    'div',
    // 이름은 aria-label(제목과 같은 글 — 다른 코드·시험이 이것으로 상자를 찾는다), 제목은 h2로 둬 화면 읽기 프로그램의 제목 이동에도 잡힌다
    { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, tabindex: -1 },
    h('header', {}, h('h2', { class: 'dialog-title', id: titleId }, title), h('button', { type: 'button', class: 'icon-btn', 'aria-label': '닫기', title: '닫기', onclick: close, html: icon('close2') })),
    h('div', { class: 'body' }, typeof body === 'string' ? h('div', { html: body }) : body),
    h(
      'footer',
      {},
      ...buttons.map((b) =>
        h(
          'button',
          {
            type: 'button',
            class: `btn ${b.primary ? 'primary' : ''}`,
            onclick: () => {
              const keep = b.run?.();
              if (keep !== true) close();
            },
          },
          b.label,
        ),
      ),
    ),
  );
  back.append(box);
  back.addEventListener('pointerdown', (ev) => {
    if (ev.target === back) close();
  });
  back.addEventListener('keydown', (ev) => {
    const k = ev as KeyboardEvent;
    if (k.key === 'Escape') {
      // 명령 중에 연 도움말 같은 상자를 Esc로 닫아도 진행 중인 명령은 그대로 둔다
      k.preventDefault();
      k.stopPropagation();
      close();
      return;
    }
    if (k.key !== 'Tab') return;
    const list = focusables(box);
    if (!list.length) {
      k.preventDefault();
      box.focus();
      return;
    }
    const first = list[0]!;
    const last = list[list.length - 1]!;
    const cur = document.activeElement;
    if (k.shiftKey && (cur === first || cur === box || !box.contains(cur))) {
      k.preventDefault();
      last.focus();
    } else if (!k.shiftKey && (cur === last || !box.contains(cur))) {
      k.preventDefault();
      first.focus();
    }
  });
  document.body.append(back);
  const obs = new MutationObserver(() => {
    if (back.isConnected) return;
    obs.disconnect();
    const now = document.activeElement;
    if (opener?.isConnected && (!now || now === document.body || !now.isConnected)) opener.focus({ preventScroll: true });
  });
  obs.observe(document.body, { childList: true });
  ((box.querySelector('footer .btn.primary') as HTMLButtonElement | null) ?? box).focus();
  return back;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** 버튼을 고르게 하는 질문 상자(닫으면 null) */
export function ask<T extends string>(title: string, text: string, buttons: { label: string; value: T; primary?: boolean }[]): Promise<T | null> {
  return new Promise((resolve) => {
    let done = false;
    const back = dialog(
      title,
      h('div', {}, text),
      buttons.map((b) => ({
        label: b.label,
        primary: b.primary,
        run: () => {
          done = true;
          resolve(b.value);
        },
      })),
    );
    const obs = new MutationObserver(() => {
      if (!back.isConnected) {
        obs.disconnect();
        if (!done) resolve(null);
      }
    });
    obs.observe(document.body, { childList: true });
  });
}

export type FormField =
  /** list: 고를 수 있는 값(입력 칸에 목록으로 뜬다 — 다른 값도 칠 수 있다) */
  | { key: string; label: string; type: 'text' | 'number'; value: string | number; placeholder?: string; wide?: boolean; list?: readonly string[] }
  | { key: string; label: string; type: 'select'; value: string; options: { value: string; label: string }[] }
  | { key: string; label: string; type: 'check'; value: boolean }
  | { key: string; label: string; type: 'textarea'; value: string }
  /**
   * 부른 쪽이 만든 칸(단추가 있는 목록 등 — 키는 그 칸이 받는다, Enter로 상자를 확인하지 않는다). read: 돌려줄 값(글).
   * check: 확인 직전에 부른다(넣다 만 값을 넣어 보고, 안 되면 문구 — 상자를 닫지 않는다)
   */
  | { key: string; label: string; type: 'custom'; el: HTMLElement; read: () => string; check?: () => string | null };

let formListSerial = 0;

/** 입력 칸 여러 개를 받는 대화상자(취소하면 null). check는 boolean, number는 숫자로 돌려준다 */
export function form(title: string, fields: FormField[], opt: { ok?: string; note?: string; validate?: (v: Record<string, string | number | boolean>) => string | null } = {}): Promise<Record<string, string | number | boolean> | null> {
  return new Promise((resolve) => {
    let done = false;
    const inputs = new Map<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>();
    const err = h('div', { class: 'form-error', role: 'alert' });
    const rows = fields.map((f) => {
      if (f.type === 'custom') {
        // 단추를 담은 칸은 <label>로 감싸지 않는다(이름표를 누르면 첫 단추가 눌린다). 이름은 칸 안의 요소가 스스로 단다
        return h('div', { class: 'form-row custom' }, h('span', {}, f.label), f.el);
      }
      let el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      if (f.type === 'select') {
        el = h('select', { 'aria-label': f.label }, ...f.options.map((o) => h('option', { value: o.value }, o.label)));
        el.value = f.value;
      } else if (f.type === 'check') {
        el = h('input', { type: 'checkbox', 'aria-label': f.label });
        (el as HTMLInputElement).checked = f.value;
      } else if (f.type === 'textarea') {
        el = h('textarea', { 'aria-label': f.label, rows: 4 });
        el.value = f.value;
      } else {
        el = h('input', { type: f.type === 'number' ? 'text' : 'text', inputmode: f.type === 'number' ? 'decimal' : undefined, 'aria-label': f.label, placeholder: f.placeholder ?? '' });
        el.value = String(f.value);
      }
      // 고를 수 있는 값 목록(입력 칸 + datalist — 다른 값도 칠 수 있다)
      const list = 'list' in f && f.list?.length ? h('datalist', { id: `form-list-${++formListSerial}` }, ...f.list.map((v) => h('option', { value: v }))) : null;
      if (list) el.setAttribute('list', list.id);
      inputs.set(f.key, el);
      el.addEventListener('keydown', (ev) => {
        const k = ev as KeyboardEvent;
        k.stopPropagation();
        if (k.key === 'Enter' && f.type !== 'textarea') submit();
      });
      return h('label', { class: `form-row ${f.type === 'check' ? 'check' : ''}` }, h('span', {}, f.label), el, list);
    });
    const read = () => {
      const out: Record<string, string | number | boolean> = {};
      for (const f of fields) {
        if (f.type === 'custom') {
          out[f.key] = f.read();
          continue;
        }
        const el = inputs.get(f.key)!;
        if (f.type === 'check') out[f.key] = (el as HTMLInputElement).checked;
        else if (f.type === 'number') out[f.key] = Number(el.value.trim());
        else out[f.key] = el.value;
      }
      return out;
    };
    const submit = () => {
      for (const f of fields) {
        const e = f.type === 'custom' ? (f.check?.() ?? null) : null;
        if (e) {
          err.textContent = e;
          return;
        }
      }
      const v = read();
      for (const f of fields) {
        if (f.type === 'number' && !Number.isFinite(v[f.key] as number)) {
          err.textContent = `${f.label}: 숫자를 입력하십시오.`;
          return;
        }
      }
      const e = opt.validate?.(v) ?? null;
      if (e) {
        err.textContent = e;
        return;
      }
      done = true;
      back.remove();
      resolve(v);
    };
    const body = h('div', { class: 'form' }, ...rows, opt.note ? h('div', { class: 'form-note' }, opt.note) : null, err);
    const back = dialog(title, body, [
      { label: '취소', run: () => undefined },
      { label: opt.ok ?? '확인', primary: true, run: () => (submit(), true) },
    ]);
    const obs = new MutationObserver(() => {
      if (!back.isConnected) {
        obs.disconnect();
        if (!done) resolve(null);
      }
    });
    obs.observe(document.body, { childList: true });
    setTimeout(() => {
      const first = inputs.values().next().value as HTMLElement | undefined;
      first?.focus();
      if (first instanceof HTMLInputElement) first.select();
    });
  });
}
