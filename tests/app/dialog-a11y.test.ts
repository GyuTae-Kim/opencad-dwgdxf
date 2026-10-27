// @vitest-environment jsdom
/** 키보드·화면 읽기 프로그램으로 쓰는 대화상자·메뉴·알림(ui/dom.ts)과 열기 실패 안내(openerror.ts) */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dialog, focusables, form, keyboardControl, showMenu, toast } from '../../src/app/ui/dom';
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

  it('마우스로 연 메뉴(키보드 초점 없음)는 초점을 옮기지 않는다', () => {
    showMenu(10, 10, [{ label: '복사' }]);
    expect(document.activeElement).toBe(document.body);
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
    expect(openErrorInfo('size_limit').message).toContain('512MB');
    expect(openErrorInfo('worker_load').hint).toContain('인터넷');
    expect(openErrorInfo('internal', 'Array buffer allocation failed').code).toBe('memory');
    expect(openErrorInfo('internal', 'bad handle').message).toBe('파일을 열지 못했습니다: bad handle');
    expect(openErrorInfo('internal').message).toBe('파일을 열지 못했습니다.');
  });

  it('모든 안내 문구가 네 언어 사전에 있고, 이름 — 문제 / 할 일로 이어도 다른 언어에서 조각마다 옮겨진다(파일 이름은 그대로)', () => {
    for (const code of ['file.empty', 'file.unrecognized', 'file.too_large', 'dxf.invalid', 'dwg.unsupported_version', 'dwg.corrupt', 'dwg.encrypted', 'size_limit', 'read', 'worker', 'worker_load', 'internal', 'memory']) {
      const info = code === 'memory' ? openErrorInfo('internal', 'allocation failed') : openErrorInfo(code);
      for (const text of [info.message, info.hint]) expect(en[text as keyof typeof en], `${code}: ${text}`).toBeTruthy();
    }
    if (!catalogs.en) registerCatalog('en', en);
    const out = translate(openErrorText('평면도_최종.dwg', openErrorInfo('dwg.corrupt')), 'en');
    expect(out.startsWith('평면도_최종.dwg — ')).toBe(true);
    expect(out.replace('평면도_최종.dwg', '')).not.toMatch(/[가-힣]/);
  });
});
