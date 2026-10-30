// @vitest-environment jsdom
/**
 * 29차: 휴대폰(폭 480px 이하) 표 셀 편집기의 도구 모음을 한 줄로. 28차까지는 넓은 화면과 같은 모든 도구가 375px에서 네 줄(142px)로 접혀
 * 도면 영역 위 끝을 덮었다. 이제 굵게·기울임꼴, 명령 취소·복구, 모든 셀, 확인·취소와 "도구 더 보기"(⋯)만 보이고 나머지(높이·글꼴·색상·
 * 밑줄·윗줄·취소선·스택·대소문자·정렬·글머리·기호·필드·기울기 각도·자간·폭 비율)는 더 보기를 누르면 그 아래 줄에 펼친다. 넓은 화면은 그대로.
 * 또 톡으로 연 편집기의 초점이 손가락을 뗀 뒤의 호환 마우스 누르기로 body로 빠지던 것(375px 헤드리스 — 연 직후 activeElement BODY)을 상자로 되돌린다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { editTableAt } from '../../src/app/tablecmds';
import { activeEditor } from '../../src/app/textedit/editor';
import { settle } from '../polish/real-app';
import { box, setup } from './fixture28';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../polish/fakes')).FakeCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));

const W0 = window.innerWidth;
afterEach(() => {
  activeEditor()?.cancel();
  document.body.replaceChildren();
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: W0 });
  vi.restoreAllMocks();
});

/** 휴대폰 폭(375)과 상태가 있는 카메라 */
function phone(h: ReturnType<typeof setup>) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
  const v = h.view as unknown as Record<string, unknown>;
  let cam = { cx: 60, cy: 80, scale: 1 };
  v.camera = () => cam;
  v.worldToScreen = (x: number, y: number) => ({ x: (x - cam.cx) * cam.scale + 375 / 2, y: -(y - cam.cy) * cam.scale + 300 });
  v.screenToWorld = (x: number, y: number) => ({ x: cam.cx + (x - 375 / 2) / cam.scale, y: cam.cy - (y - 300) / cam.scale });
  v.setViewCamera = (c: typeof cam) => ((cam = { ...c }), true);
  v.el = { title: '', addEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 375, height: 600, right: 375, bottom: 600 }) };
}

const bar = () => document.querySelector('.te-bar') as HTMLElement;
/** 보이는(더 보기에 숨기지 않은) 컨트롤의 글 */
const shown = () =>
  [...bar().querySelectorAll<HTMLElement>('button, select, input')].filter((el) => !el.closest('.te-sec') && !el.classList.contains('te-off')).map((el) => (el.tagName === 'BUTTON' ? el.textContent : el.getAttribute('aria-label')));
const hidden = () => [...bar().querySelectorAll<HTMLElement>('button, select, input')].filter((el) => el.closest('.te-sec')).map((el) => el.getAttribute('aria-label'));

describe('휴대폰 셀 편집기 도구 모음', () => {
  it('한 줄: 굵게·기울임꼴, 명령 취소·복구, 모든 셀, 확인·취소, 도구 더 보기. 더 보기를 누르면 나머지가 그 아래 줄에, 다시 누르면 접힌다', async () => {
    const h = setup();
    phone(h);
    void editTableAt(h.app, h.handle, h.center(2, 1));
    await settle();
    expect(box()?.getAttribute('aria-label')).toBe('테이블 셀 편집 — B3');
    expect(bar().classList.contains('te-compact')).toBe(true);
    expect(shown()).toEqual(['B', 'I', '↶', '↷', '모든 셀', '확인', '취소', '⋯']);
    expect(hidden()).toEqual(
      expect.arrayContaining(['문자 높이', '글꼴', '색상', '윗줄', '취소선', '스택', '왼쪽 정렬', '글머리 기호 및 번호 매기기', '기호', '기울기 각도(−85~85)', '자간(0.75~4)', '폭 비율(0.1~10)']),
    );
    expect(hidden().some((l) => l?.startsWith('밑줄'))).toBe(true);
    // 따로 펼치던 "형식 더 보기"(…)는 도구 더 보기가 대신한다
    expect(bar().querySelector('[aria-label^="형식 더 보기"]')!.classList.contains('te-off')).toBe(true);
    const tools = bar().querySelector<HTMLButtonElement>('[aria-label="도구 더 보기"]')!;
    expect(tools.getAttribute('aria-expanded')).toBe('false');
    tools.click();
    expect(tools.getAttribute('aria-expanded')).toBe('true');
    expect(bar().classList.contains('te-show-sec')).toBe(true);
    expect(bar().classList.contains('te-show-more')).toBe(true);
    tools.click();
    expect(tools.getAttribute('aria-expanded')).toBe('false');
    expect(bar().classList.contains('te-show-sec')).toBe(false);
    expect(bar().classList.contains('te-show-more')).toBe(false);
    // 숨긴 도구도 그대로 동작한다: 문자 높이 칸에 값을 넣으면 그 높이
    const hi = bar().querySelector<HTMLInputElement>('input[aria-label="문자 높이"]')!;
    expect(hi.closest('.te-sec')).not.toBeNull();
    // 모든 셀은 표 전체 셀 대화상자
    bar().querySelector<HTMLButtonElement>('[aria-label="표의 모든 셀을 대화상자에서 고칩니다"]')!.click();
    await settle();
    expect(document.querySelector('.dialog')).not.toBeNull();
  });

  it('넓은 화면은 예전 그대로(모든 도구, 더 보기 단추 없음)', async () => {
    const h = setup();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
    void editTableAt(h.app, h.handle, h.center(2, 1));
    await settle();
    expect(bar().classList.contains('te-compact')).toBe(false);
    expect(bar().querySelector('[aria-label="도구 더 보기"]')).toBeNull();
    expect(bar().querySelectorAll('.te-sec, .te-off')).toHaveLength(0);
  });
});

describe('톡으로 연 편집기의 초점', () => {
  it('연 직후(0.8초 안) 초점이 어디에도 없게 빠지면 상자로 되돌린다. 다른 컨트롤로 옮기거나 그 뒤에 빠지면 그대로', async () => {
    const h = setup();
    phone(h);
    void editTableAt(h.app, h.handle, h.center(2, 1));
    await settle();
    const b = box()!;
    expect(document.activeElement).toBe(b);
    b.blur();
    expect(document.activeElement).toBe(document.body);
    await new Promise((r) => setTimeout(r, 0));
    expect(document.activeElement).toBe(b);
    // 도구 모음의 칸으로 옮기면 그 칸
    const tools = bar().querySelector<HTMLButtonElement>('[aria-label="도구 더 보기"]')!;
    tools.click();
    const hi = bar().querySelector<HTMLInputElement>('input[aria-label="문자 높이"]')!;
    hi.focus();
    await new Promise((r) => setTimeout(r, 0));
    expect(document.activeElement).toBe(hi);
    // 0.8초 뒤에는 되돌리지 않는다
    b.focus();
    const t = performance.now();
    vi.spyOn(performance, 'now').mockReturnValue(t + 1000);
    b.blur();
    await new Promise((r) => setTimeout(r, 0));
    expect(document.activeElement).toBe(document.body);
  });
});
