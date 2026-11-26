// @vitest-environment jsdom
/** 키보드·화면 읽기 프로그램으로 쓰는 대화상자·메뉴·알림(ui/dom.ts)과 열기 실패 안내(openerror.ts) */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeMenu, dialog, focusables, form, keyboardControl, showMenu, toast } from '../../src/app/ui/dom';
import { openErrorInfo, openErrorText } from '../../src/app/openerror';
import { catalogs, registerCatalog, translate } from '../../site/i18n-core.mjs';
import en from '../../site/locales/en.json';

const key = (el: Element, k: string, shift = false) => {
  const ev = new KeyboardEvent('keydown', { key: k, shiftKey: shift, bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
  return ev;
};
const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  document.body.innerHTML = '';
});

describe('대화상자 키보드', () => {
  it('열면 주 단추에 초점, 제목(h2)과 같은 이름을 붙이고, Tab·Shift+Tab은 상자 안에서만 돈다', () => {
    const back = dialog('도면 정보', '<p>본문 <a href="#x">링크</a></p>', [{ label: '취소' }, { label: '확인', primary: true }]);
    const box = back.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(box.getAttribute('aria-modal')).toBe('true');
    expect(box.getAttribute('aria-label')).toBe('도면 정보');
    expect(box.querySelector('h2.dialog-title')!.textContent).toBe('도면 정보');
    const items = focusables(box);
    expect(items.map((e) => e.textContent || e.getAttribute('aria-label'))).toEqual(['닫기', '링크', '취소', '확인']);
    expect(document.activeElement!.textContent).toBe('확인');
    // 마지막에서 Tab → 처음으로
    const ev = key(document.activeElement!, 'Tab');
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement!.getAttribute('aria-label')).toBe('닫기');
    // 처음에서 Shift+Tab → 마지막으로
    key(document.activeElement!, 'Tab', true);
    expect(document.activeElement!.textContent).toBe('확인');
    // 가운데서는 브라우저가 옮긴다
    items[1]!.focus();
    expect(key(items[1]!, 'Tab').defaultPrevented).toBe(false);
  });

  it('Esc는 상자를 닫고(뒤의 명령은 취소하지 않게 사건을 멈춘다) 열기 전 초점으로 돌아간다', () => {
    const opener = document.createElement('button');
    opener.textContent = '도움말';
    document.body.append(opener);
    opener.focus();
    const onWindow = vi.fn();
    window.addEventListener('keydown', onWindow);
    const back = dialog('도움말', '내용');
    key(document.activeElement!, 'Escape');
    window.removeEventListener('keydown', onWindow);
    expect(back.isConnected).toBe(false);
    expect(onWindow).not.toHaveBeenCalled();
    return flush().then(() => expect(document.activeElement).toBe(opener));
  });

  it('밖에서 back.remove()로 닫아도(입력 상자 확인 등) 초점이 돌아간다', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const p = form('이름 바꾸기', [{ key: 'name', label: '이름', type: 'text', value: 'A' }]);
    await flush();
    expect((document.activeElement as HTMLInputElement).value).toBe('A');
    key(document.activeElement!, 'Enter');
    expect(await p).toEqual({ name: 'A' });
    await flush();
    expect(document.activeElement).toBe(opener);
  });

  it('겹친 상자에서는 위의 상자만 Tab을 가둔다', () => {
    dialog('관리자', '아래', [{ label: '닫기', primary: true }]);
    const top = dialog('확인', '위', [{ label: '예', primary: true }, { label: '아니요' }]);
    expect(top.contains(document.activeElement)).toBe(true);
    key(document.activeElement!, 'Tab');
    key(document.activeElement!, 'Tab');
    key(document.activeElement!, 'Tab');
    expect(top.contains(document.activeElement)).toBe(true);
  });
});

describe('메뉴 키보드', () => {
  it('키보드로 연 메뉴는 첫 항목에 초점, 화살표·Home·End로 옮기고(꺼진 항목은 건너뜀) Esc는 닫고 연 단추로 돌아간다', () => {
    const opener = document.createElement('button');
    opener.textContent = 'A';
    document.body.append(opener);
    opener.focus();
    const visible = vi.spyOn(Element.prototype, 'matches').mockImplementation(function (this: Element, sel: string) {
      if (sel === ':focus-visible') return this === opener;
      return Element.prototype.closest.call(this, sel) === this;
    });
    const run = vi.fn();
    showMenu(0, 0, [{ label: '새로 만들기', run }, { separator: true }, { label: '저장', disabled: true }, { label: '열기…' }, { label: '닫기' }]);
    visible.mockRestore();
    const menu = document.querySelector('.menu')!;
    expect(menu.getAttribute('role')).toBe('menu');
    expect(document.activeElement!.textContent).toBe('새로 만들기');
    key(document.activeElement!, 'ArrowDown');
    expect(document.activeElement!.textContent).toBe('열기…');
    key(document.activeElement!, 'End');
    expect(document.activeElement!.textContent).toBe('닫기');
    key(document.activeElement!, 'ArrowDown');
    expect(document.activeElement!.textContent).toBe('새로 만들기');
    key(document.activeElement!, 'ArrowUp');
    expect(document.activeElement!.textContent).toBe('닫기');
    key(document.activeElement!, 'Escape');
    expect(document.querySelector('.menu')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('손가락·마우스로 연 메뉴(키보드 초점 없음)도 첫 켜진 항목에 초점, Esc는 닫고 넘긴 연 단추로(262차 — 전에는 옮기지 않았다). 커서를 올려 연 메뉴는 키보드 초점이 있을 때만, 꺼진 항목뿐이면 메뉴 자체에(263차)', () => {
    const opener = document.createElement('button');
    opener.textContent = '⋯';
    document.body.append(opener);
    const at = () => {
      const a = document.activeElement!;
      return a === document.body ? 'body' : a === opener ? 'opener' : a.classList.contains('menu') ? 'menu' : (a.textContent ?? '').trim();
    };
    // 누르기로 초점을 받지 않은 단추(Safari·iOS — 시험 환경의 click도 같다): 연 단추는 opener로 넘긴다. 제목·꺼진 항목은 건너뛴다
    showMenu(10, 10, [{ heading: '편집' }, { label: '잘라내기', disabled: true }, { label: '복사' }, { label: '붙여넣기' }], { opener });
    const got: unknown[] = [at()];
    key(document.activeElement!, 'ArrowUp');
    got.push(at());
    key(document.activeElement!, 'Escape');
    got.push(document.querySelector('.menu') === null, at());
    // 커서를 올려 연 메뉴(다기능 그립): 키보드로 옮긴 초점이 없으면 옮기지 않는다 — 치던 자리를 빼앗지 않는다
    opener.blur();
    showMenu(0, 0, [{ label: '스트레치' }], { hover: true });
    got.push(at());
    // 키보드로 옮긴 초점이 있으면 지금처럼 첫 항목
    opener.focus();
    const visible = vi.spyOn(Element.prototype, 'matches').mockImplementation(function (this: Element, sel: string) {
      if (sel === ':focus-visible') return this === opener;
      return Element.prototype.closest.call(this, sel) === this;
    });
    showMenu(0, 0, [{ label: '스트레치' }], { hover: true });
    visible.mockRestore();
    got.push(at());
    // 꺼진 항목뿐인 메뉴는 메뉴 자체(tabindex -1)에 초점(263차 — 전에는 옮기지 않아 메뉴의 키 처리가 Esc를 받지 못했다). Esc는 닫고 넘긴 연 단추로
    closeMenu();
    showMenu(0, 0, [{ label: '저장', disabled: true }], { opener });
    got.push(at(), document.querySelector('.menu')!.getAttribute('tabindex'));
    key(document.activeElement!, 'Escape');
    got.push(document.querySelector('.menu') === null, at());
    closeMenu();
    expect(got).toEqual(['복사', '붙여넣기', true, 'opener', 'body', '스트레치', 'menu', '-1', true, 'opener']);
  });

  it('onClose는 메뉴가 닫힐 때 한 번: 항목을 고르면 run보다 먼저, Esc·다른 메뉴로 닫혀도(오른쪽 끌어 놓기 미리보기 치우기)', () => {
    const order: string[] = [];
    showMenu(0, 0, [{ label: '여기로 이동', run: () => order.push('run') }], { onClose: () => order.push('close') });
    (document.querySelector('.menu button') as HTMLButtonElement).click();
    expect(order).toEqual(['close', 'run']);
    showMenu(0, 0, [{ label: '취소' }], { onClose: () => order.push('esc') });
    key(document.querySelector('.menu')!, 'Escape');
    expect(document.querySelector('.menu')).toBeNull();
    showMenu(0, 0, [{ label: '취소' }], { onClose: () => order.push('replaced') });
    showMenu(0, 0, [{ label: '다른 메뉴' }]);
    expect(order).toEqual(['close', 'run', 'esc', 'replaced']);
    closeMenu();
    closeMenu();
    expect(order).toHaveLength(4);
  });
});

describe('알림', () => {
  it('오류 알림은 바로 읽히게 role="alert", 단추가 있는 알림은 닫을 때까지 남고 단추를 누르면 닫힌다', () => {
    vi.useFakeTimers();
    try {
      const err = toast('열지 못했습니다', 'error', 1000);
      expect(err.getAttribute('role')).toBe('alert');
      expect(err.parentElement!.getAttribute('aria-live')).toBe('polite');
      const run = vi.fn();
      const upd = toast('새 버전이 있습니다.', 'info', 0, { label: '새로 고침', run });
      vi.advanceTimersByTime(60_000);
      expect(err.isConnected).toBe(false);
      expect(upd.isConnected).toBe(true);
      expect(upd.querySelector('.toast-close')!.getAttribute('aria-label')).toBe('알림 닫기');
      upd.querySelector<HTMLButtonElement>('.toast-action')!.click();
      expect(run).toHaveBeenCalledOnce();
      expect(upd.isConnected).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  const TWIST = '비틀린 뷰포트는 아직 모형 공간으로 들어갈 수 없습니다.';
  /** 떠 있는 알림의 [종류, 글] 차례 */
  const shown = () =>
    Array.from(document.querySelectorAll('.toast'), (t) => [t.classList.contains('error') ? 'error' : t.classList.contains('warn') ? 'warn' : 'info', t.textContent]);

  it('같은 종류·같은 글의 단추 없는 알림은 쌓지 않고 하나만: 옛 알림을 지우고 새로 붙여 시간이 마지막 알림부터 흐른다(271차 — 전에는 하나씩 쌓였다)', () => {
    vi.useFakeTimers();
    try {
      const a = toast(TWIST, 'error', 9000);
      vi.advanceTimersByTime(5000);
      const b = toast(TWIST, 'error', 9000);
      expect(a.isConnected).toBe(false);
      expect(b.isConnected).toBe(true);
      // 새 마디라 화면 읽기 프로그램이 다시 읽는다(오류 알림 role="alert", 알림 영역 aria-live)
      expect(b).not.toBe(a);
      expect(b.getAttribute('role')).toBe('alert');
      expect(b.parentElement!.getAttribute('aria-live')).toBe('polite');
      expect(shown()).toEqual([['error', TWIST]]);
      // 옛 알림의 시간(첫 알림부터 9초)은 새 알림을 지우지 않는다 — 새 알림부터 9초에 사라진다
      vi.advanceTimersByTime(4000);
      expect(b.isConnected).toBe(true);
      vi.advanceTimersByTime(4999);
      expect(b.isConnected).toBe(true);
      vi.advanceTimersByTime(1);
      expect(b.isConnected).toBe(false);
      expect(shown()).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('다른 종류·다른 글은 따로 쌓이고, 단추 있는 알림은 같은 글이어도 모두 남는다. 번역으로 글 마디가 바뀌어도 부른 쪽 글로 찾는다(271차)', () => {
    vi.useFakeTimers();
    try {
      const other = '열린 도면이 없습니다. 먼저 파일을 여십시오.';
      toast(TWIST, 'error', 9000);
      toast(TWIST, 'warn', 9000);
      toast(other, 'error', 9000);
      toast(TWIST, 'error', 9000);
      expect(shown()).toEqual([
        ['warn', TWIST],
        ['error', other],
        ['error', TWIST],
      ]);
      // 단추 있는 알림(새 판 등)은 사용자가 처리할 때까지 쌓이고, 단추 없는 같은 글이 와도 지우지 않는다
      const run = vi.fn();
      const u1 = toast('새 버전이 있습니다.', 'info', 0, { label: '새로 고침', run });
      const u2 = toast('새 버전이 있습니다.', 'info', 0, { label: '새로 고침', run });
      const p1 = toast('새 버전이 있습니다.', 'info', 3000);
      expect([u1.isConnected, u2.isConnected, p1.isConnected]).toEqual([true, true, true]);
      const p2 = toast('새 버전이 있습니다.', 'info', 3000);
      expect([u1.isConnected, u2.isConnected, p1.isConnected, p2.isConnected]).toEqual([true, true, false, true]);
      expect(document.querySelectorAll('.toast.has-action')).toHaveLength(2);
      // 번역층(i18n.ts)은 떠 있는 알림의 글 마디를 그 자리에서 번역 글로 바꾼다
      const tr = toast(other, 'error', 9000);
      tr.querySelector('.toast-text')!.firstChild!.nodeValue = 'No drawing is open. Open a file first.';
      const tr2 = toast(other, 'error', 9000);
      expect(tr.isConnected).toBe(false);
      expect(tr2.isConnected).toBe(true);
      expect(Array.from(document.querySelectorAll('.toast'), (t) => t.textContent).filter((t) => t === other || t?.startsWith('No drawing'))).toEqual([other]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('앱 단축키가 비켜 가는 컨트롤', () => {
  it('키보드로 초점을 옮긴 단추·탭·링크만(그림 영역·문서 본문은 아님)', () => {
    const b = document.createElement('button');
    const c = document.createElement('canvas');
    document.body.append(b, c);
    const spy = vi.spyOn(Element.prototype, 'matches').mockImplementation(function (this: Element, sel: string) {
      if (sel === ':focus-visible') return true;
      return Element.prototype.closest.call(this, sel) === this;
    });
    expect(keyboardControl(b)).toBe(true);
    expect(keyboardControl(c)).toBe(false);
    expect(keyboardControl(document.body)).toBe(false);
    expect(keyboardControl(null)).toBe(false);
    spy.mockImplementation(function (this: Element, sel: string) {
      if (sel === ':focus-visible') return false;
      return Element.prototype.closest.call(this, sel) === this;
    });
    // 마우스로 누른 단추(:focus-visible 아님)는 Enter·Space가 AutoCAD처럼 명령으로 간다
    expect(keyboardControl(b)).toBe(false);
    spy.mockRestore();
  });
});

describe('도면 열기 실패 안내', () => {
  it('코드마다 무엇이 문제인지와 할 일을 알려 준다', () => {
    expect(openErrorInfo('dwg.unsupported_version')).toMatchObject({ message: '아직 지원하지 않는 DWG 버전입니다.', hint: expect.stringContaining('R2018') });
    expect(openErrorInfo('file.unrecognized').hint).toContain('SKP·STEP·NC');
    expect(openErrorInfo('dwg.encrypted').hint).toContain('암호');
    expect(openErrorInfo('memory').hint).toContain('메모리');
    expect(openErrorInfo('worker_load').hint).toContain('인터넷');
    expect(openErrorInfo('internal', 'Array buffer allocation failed').code).toBe('memory');
    expect(openErrorInfo('internal', 'bad handle').message).toBe('파일을 열지 못했습니다: bad handle');
    expect(openErrorInfo('internal').message).toBe('파일을 열지 못했습니다.');
  });

  it('모든 안내 문구가 네 언어 사전에 있고, 이름 — 문제 / 할 일로 이어도 다른 언어에서 조각마다 옮겨진다(파일 이름은 그대로)', () => {
    for (const code of ['file.empty', 'file.unrecognized', 'file.too_large', 'dxf.invalid', 'dwg.unsupported_version', 'dwg.corrupt', 'dwg.encrypted', 'read', 'worker', 'worker_load', 'internal', 'memory']) {
      const info = openErrorInfo(code);
      for (const text of [info.message, info.hint]) expect(en[text as keyof typeof en], `${code}: ${text}`).toBeTruthy();
    }
    if (!catalogs.en) registerCatalog('en', en);
    const out = translate(openErrorText('평면도_최종.dwg', openErrorInfo('dwg.corrupt')), 'en');
    expect(out.startsWith('평면도_최종.dwg — ')).toBe(true);
    expect(out.replace('평면도_최종.dwg', '')).not.toMatch(/[가-힣]/);
  });
});
