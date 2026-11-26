/**
 * 메뉴의 첫 글자 찾기(265차 — 262차 「보고 두 것」 (4), W3C APG 메뉴·메뉴 단추 꼴 키보드 표).
 * 262차부터 손가락·마우스로 연 메뉴도 초점이 메뉴 안에 있어, 메뉴가 열린 동안 친 글자는 아무것도 하지 않았다. 이제 글자 한 자를 치면
 * 그 글자로 시작하는 다음 켜진 항목으로 초점을 옮긴다(같은 글자를 다시 치면 그다음, 끝에서 처음으로, 맞는 항목이 없으면 그대로).
 * 견주는 이름은 항목 단추 바로 아래 글 마디(번역층이 바꾼 뒤의 화면 글 — 아이콘·단축키 표시는 빼고, 앞의 켜짐 표시 「✓」도 뺌)의 첫 글자이고,
 * 대소문자는 가리지 않는다(APG 예제와 같다). 한글은 음절 그대로(초성 찾기 없음). 꺼진 항목·머리글·구분선은 건너뛰고, Ctrl·Alt·⌘와 함께 친 글자는 넘긴다.
 * 실행은 Enter·Space 그대로(글자는 초점만 옮긴다).
 * 진짜 메뉴(showMenu)와 진짜 App·제목 막대(응용프로그램 메뉴 A), 영어 화면은 화면 번역층(언어별 주소). 화면·명령행·엔진·글꼴·토스트는 가짜(menuname264·viewa11y252 꼴).
 */
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installLocalization } from '../../src/app/i18n';
import { closeMenu, showMenu } from '../../src/app/ui/dom';
import { makeApp, settle } from '../polish/real-app';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('./fakes')).DirectCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));
// 메뉴는 진짜(키로 옮기는 초점을 본다), 토스트만 가짜
vi.mock('../../src/app/ui/dom', async (orig) => ({ ...(await orig<object>()), toast: vi.fn() }));

let dom: { window: Window & typeof globalThis & { close(): void } };
let dispose: (() => void) | undefined;
afterEach(async () => {
  closeMenu();
  // 메뉴가 건 바깥 누르기 지켜보기(타이머)·번역층이 이 문서에서 끝나게 한 뒤 전역을 되돌린다
  await settle();
  dispose?.();
  dispose = undefined;
  vi.unstubAllGlobals();
  dom.window.close();
});

/** 언어별 주소의 문서로 전역을 바꾼다(viewa11y252 꼴) */
const stubDom = (url: string) => {
  dom = new JSDOM('<!doctype html><html><head><title>OpenCAD</title></head><body><div id="app"><header class="titlebar"></header></div></body></html>', { url });
  for (const name of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'HTMLButtonElement', 'HTMLAnchorElement', 'MouseEvent', 'MutationObserver', 'location', 'history', 'localStorage', 'CustomEvent'])
    vi.stubGlobal(name, (dom.window as unknown as Record<string, unknown>)[name]);
};

const menu = () => document.querySelector<HTMLElement>('.menu[role="menu"]');
const items = () => [...menu()!.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')];
/** 메뉴 항목의 이름(아이콘·단축키 글을 뺀 글 마디) */
const label = (b: Element) =>
  [...b.childNodes]
    .filter((n) => n.nodeType === 3)
    .map((n) => n.textContent)
    .join('')
    .trim();
/** 지금 초점: 메뉴 안이면 그 항목 이름, 본문 'body' */
const at = () => {
  const a = document.activeElement;
  if (a && menu()?.contains(a)) return label(a);
  return a === document.body ? 'body' : `other:${a?.tagName}`;
};
/** 지금 초점이 있는 곳에 키를 누른다(실제와 같다) */
const press = (k: string, mod: { shiftKey?: boolean; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean } = {}) => {
  const ev = new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mod });
  (document.activeElement ?? document.body).dispatchEvent(ev);
  return ev;
};

/** 셸 전체를 만들지 않고 제목 막대만 그린다(menuname264 꼴) — 응용프로그램 메뉴 A */
const titleBar = async () => {
  const { Shell } = await import('../../src/app/ui/shell');
  const h = makeApp();
  const title = document.createElement('div');
  document.getElementById('app')!.append(title);
  const sh = Object.assign(Object.create(Shell.prototype) as object, { app: h.app, title, status: document.createElement('div'), statusBtns: {}, refreshStatus() {}, afterRibbonCommand() {} }) as unknown as {
    buildTitle(): void;
  };
  sh.buildTitle();
  return title.querySelector<HTMLButtonElement>('button.app-button')!;
};

describe('메뉴가 열린 동안 친 글자로 그 글자로 시작하는 항목을 찾는다(265차 — 262차 보고 (4))', () => {
  it('한 글자·같은 글자 거듭(끝에서 처음으로)·대소문자·켜짐 표시 「✓」: 꺼진 항목·머리글은 건너뛰고, 수정 키·맞지 않는 글자·자모·빈칸·입력기 키는 아무것도 하지 않는다', () => {
    stubDom('https://gyutae-kim.github.io/opencad-dwgdxf/');
    const run = vi.fn();
    const onWindow = vi.fn();
    window.addEventListener('keydown', onWindow);
    showMenu(0, 0, [
      { heading: '편집' },
      { label: '복사', kbd: 'Ctrl+C', run },
      { label: '붙여넣기', kbd: 'Ctrl+V', run },
      { label: '복제', disabled: true, run },
      { separator: true },
      { label: '✓ 블록으로 붙여넣기', run },
      { label: ' 복원', run },
      { label: 'Block 편집', run },
      { label: 'base point', kbd: 'B', run },
    ]);
    // 손가락·마우스로 연 메뉴도 첫 켜진 항목에 초점(262차)
    const got: unknown[] = [at()];
    const step = (k: string, mod: Parameters<typeof press>[1] = {}) => {
      const ev = press(k, mod);
      got.push([at(), ev.defaultPrevented]);
    };
    // 「복」: 꺼진 「복제」를 건너뛰고 「복원」(앞의 em 빈칸은 뺌), 다시 「복」은 끝에서 돌아 「복사」
    step('복');
    step('복');
    // 「블」: 켜짐 표시 「✓ 」를 뗀 이름으로
    step('블');
    // 대소문자는 가리지 않는다: b → Block 편집 → base point, Shift+B → 돌아 Block 편집
    step('b');
    step('b');
    step('B', { shiftKey: true });
    // Ctrl·Alt·⌘와 함께면 넘긴다(브라우저·앱 단축키 그대로)
    step('b', { ctrlKey: true });
    step('b', { altKey: true });
    step('b', { metaKey: true });
    // 맞는 항목이 없음: 로마자, 머리글 「편집」(항목이 아님), 자모(초성 찾기 없음), 빈칸(Space는 고르기), 입력기 조합 키
    step('x');
    step('편');
    step('ㅂ');
    step(' ');
    step('Process');
    // 글자는 고르지 않는다(메뉴 그대로, run 없음). 맞은 키는 메뉴가 먹어 창으로 가지 않는다
    got.push(menu() !== null, run.mock.calls.length, onWindow.mock.calls.length);
    window.removeEventListener('keydown', onWindow);

    const stay: unknown[] = Array.from({ length: 8 }, () => ['Block 편집', false]);
    expect(got).toEqual([
      '복사',
      ['복원', true],
      ['복사', true],
      ['✓ 블록으로 붙여넣기', true],
      ['Block 편집', true],
      ['base point', true],
      ['Block 편집', true],
      ...stay,
      true,
      0,
      8,
    ]);
  });

  it('응용프로그램 메뉴 A(한국어 화면): 한글은 음절 첫 글자 그대로(「도」 셋을 돌고, 자모 「ㄷ」은 찾지 않음), 로마자로 시작하는 항목은 글자로, Esc는 그대로', async () => {
    stubDom('https://gyutae-kim.github.io/opencad-dwgdxf/');
    const a = await titleBar();
    a.click();
    await settle();
    const got: unknown[] = [at()];
    for (const k of ['도', '도', '도', '도', 'ㄷ', 'p']) {
      press(k);
      got.push(at());
    }
    // 맞는 항목이 지금 항목 하나뿐이면 그 자리
    press('P', { shiftKey: true });
    got.push(at());
    for (const k of ['s', 'o', '모', '모']) {
      press(k);
      got.push(at());
    }
    got.push(menu() !== null, a.getAttribute('aria-expanded'));
    press('Escape');
    got.push(menu() === null, document.activeElement === a);

    expect(got).toEqual([
      '새로 만들기',
      '도면 복구 관리자…',
      '도면 특성…',
      '도면 정보',
      '도면 복구 관리자…',
      '도면 복구 관리자…',
      'PNG로 내보내기',
      'PNG로 내보내기',
      'SVG로 내보내기',
      'OpenCAD 정보',
      '모두 닫기',
      '모두 저장',
      true,
      'true',
      true,
      true,
    ]);
  });

  it('응용프로그램 메뉴 A(영어 화면): 번역된 화면 글로 견준다 — s는 Save·Save As…·Save all·Switch…·Shortcut…을 돌고, 한국어 원문 글자(「저」)는 찾지 않는다', async () => {
    stubDom('https://gyutae-kim.github.io/opencad-dwgdxf/en/');
    const a = await titleBar();
    dispose = await installLocalization(document.getElementById('app')!);
    a.click();
    await settle();
    const got: unknown[] = [items().length, at()];
    for (const k of ['s', 's', 's', 's', 's', 's', '저', 'p', 'p', 'p', 'e']) {
      press(k);
      got.push(at());
    }
    press('E', { shiftKey: true });
    got.push(at());
    for (const k of ['a', 'd']) {
      press(k);
      got.push(at());
    }

    expect(got).toEqual([
      21,
      'New',
      'Save',
      'Save As…',
      'Save all',
      'Switch to light theme',
      'Shortcut key/Help',
      'Save',
      'Save',
      'Plot (PDF)…',
      'Publish (layouts to PDF)…',
      'Plot (PDF)…',
      'Export as PNG',
      'Export to SVG',
      'About OpenCAD',
      'Drawing Recovery Manager…',
    ]);
  });
});
