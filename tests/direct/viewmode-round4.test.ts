/**
 * 휴대폰 보기 모드: 측정 띠의 객체 스냅 칩, 더 보기(점 좌표 ID·문자 찾기·참조 파일), 찾지 못한 참조 파일 안내.
 * 진짜 App과 명령, 화면·명령행은 가짜(measurecard.test.ts와 같은 틀).
 */
import { createRequire } from 'node:module';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CadDocument } from '../../src/core/model';
import { registerCommands } from '../../src/app/commands';
import { MobileView, VIEW_SNAPS, missingLines, readViewSnaps } from '../../src/app/ui/mobileview';
import { showMenu } from '../../src/app/ui/dom';
import { makeApp, settle } from '../polish/real-app';
import { FakePicker } from './fakes';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('./fakes')).DirectCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));
vi.mock('../../src/app/ui/dom', async (orig) => ({ ...(await orig<object>()), showMenu: vi.fn(), closeMenu: vi.fn(), toast: vi.fn() }));

let dom: { window: Window & typeof globalThis & { close(): void } };
beforeAll(() => {
  dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost/' });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('localStorage', dom.window.localStorage);
});
afterAll(() => {
  vi.unstubAllGlobals();
  dom.window.close();
});
beforeEach(() => {
  dom.window.localStorage.clear();
  vi.mocked(showMenu).mockClear();
});

const P = (x: number, y: number) => ({ x, y });
const ev = { pointerType: 'touch', shiftKey: false, ctrlKey: false, metaKey: false, clientX: 0, clientY: 0 } as PointerEvent;

function setup(prep?: (doc: CadDocument) => void) {
  const h = makeApp(prep);
  registerCommands(h.app);
  const pk = new FakePicker(h.doc);
  (h.app as unknown as { picker: () => unknown }).picker = () => pk;
  const root = document.getElementById('app')!;
  root.replaceChildren();
  const opened: string[] = [];
  const mv = new MobileView(h.app, { openPalette: (t) => opened.push(t), closePalette() {}, modeChanged() {} }, root);
  root.append(mv.bar, mv.card);
  return { ...h, mv, opened, click: (p: { x: number; y: number }) => h.view.events.click!(p, p, ev) };
}
const until = async (f: () => boolean) => {
  for (let i = 0; i < 50 && !f(); i++) await settle();
  return f();
};

describe('측정 띠의 객체 스냅 칩', () => {
  it('점을 고를 때만 보이고, 누르면 그 스냅을 켜고 끄며 이 브라우저에 기억한다', async () => {
    const h = setup();
    h.mv.apply(true);
    void h.app.run('DIST');
    await settle();
    const chips = () => [...h.mv.card.querySelectorAll<HTMLButtonElement>('.mv-snaps .mv-snap')];
    expect(chips().map((b) => b.textContent)).toEqual(VIEW_SNAPS.map((s) => s.label));
    // 기본(끝점·중심·교차점)은 켜져 있고 중간점은 꺼져 있다
    const by = (label: string) => chips().find((b) => b.textContent === label)!;
    expect(by('끝점').getAttribute('aria-pressed')).toBe('true');
    expect(by('중간점').getAttribute('aria-pressed')).toBe('false');
    by('중간점').click();
    await settle();
    expect(h.app.snapModes.has('mid')).toBe(true);
    expect(by('중간점').getAttribute('aria-pressed')).toBe('true');
    by('끝점').click();
    await settle();
    expect(h.app.snapModes.has('end')).toBe(false);
    expect(readViewSnaps()).toContain('mid');
    expect(readViewSnaps()).not.toContain('end');
    h.app.cmd.escape();
    await settle();
    // 편집 화면으로 나가면 데스크톱 스냅으로 되돌리고, 다시 들어오면 보기 모드 스냅
    h.mv.apply(false);
    expect(h.app.snapModes.has('end')).toBe(true);
    expect(h.app.snapModes.has('mid')).toBe(false);
    h.mv.apply(true);
    expect(h.app.snapModes.has('mid')).toBe(true);
    expect(h.app.snapModes.has('end')).toBe(false);
  });

  it('객체를 고르는 프롬프트에는 칩이 없다', async () => {
    const h = setup();
    h.mv.apply(true);
    void h.app.run('MEASURERADIUS');
    await settle();
    expect(h.mv.card.querySelector('.mv-snaps')).toBeNull();
    h.app.cmd.escape();
    await settle();
  });

  it('편집 화면에서 객체 스냅을 껐으면 칩이 그 스냅만 켠다', async () => {
    const h = setup();
    h.mv.apply(true);
    h.app.osnapOn = false;
    void h.app.run('DIST');
    await settle();
    const mid = [...h.mv.card.querySelectorAll<HTMLButtonElement>('.mv-snap')].find((b) => b.textContent === '중간점')!;
    expect(mid.getAttribute('aria-pressed')).toBe('false');
    mid.click();
    expect(h.app.osnapOn).toBe(true);
    expect([...h.app.snapModes]).toEqual(['mid']);
    h.app.cmd.escape();
    await settle();
  });

  it('편집 화면에서 객체 스냅을 끈 채 들어와 칩으로 켜도, 나가면 편집 화면처럼 꺼진다(스냅 종류도 되돌린다)', async () => {
    const h = setup();
    h.app.osnapOn = false;
    const before = [...h.app.snapModes].sort();
    h.mv.apply(true);
    void h.app.run('DIST');
    await settle();
    [...h.mv.card.querySelectorAll<HTMLButtonElement>('.mv-snap')].find((b) => b.textContent === '중간점')!.click();
    expect(h.app.osnapOn).toBe(true);
    h.app.cmd.escape();
    await settle();
    h.mv.apply(false);
    expect(h.app.osnapOn).toBe(false);
    expect([...h.app.snapModes].sort()).toEqual(before);
  });
});

describe('더 보기: 점 좌표·문자 찾기', () => {
  it('점 좌표(ID)는 큰 좌표 값 카드와 다시 재기', async () => {
    const h = setup();
    h.mv.apply(true);
    const more = h.mv.bar.querySelector<HTMLButtonElement>('button[aria-label="더 보기: 좌표·찾기·참조 파일"]')!;
    // 좁은 화면에서 다른 단추 이름이 줄지 않게 아이콘만, 마지막 자리
    expect(more.classList.contains('vb-more')).toBe(true);
    expect(more.querySelector('.vb-lbl')).toBeNull();
    expect(h.mv.bar.lastElementChild).toBe(more);
    more.click();
    const items = vi.mocked(showMenu).mock.calls.at(-1)![2] as { label: string; run: () => void }[];
    expect(items.map((i) => i.label)).toEqual(['점 좌표 (ID)', '문자 찾기', '참조 파일 고르기(외부 참조·SHX 글꼴)']);
    items[0]!.run();
    await settle();
    expect(h.mv.card.querySelector('.mv-prompt')?.textContent).toBe('점 지정:');
    h.click(P(12, 34));
    await settle();
    expect(h.mv.card.classList.contains('is-result')).toBe(true);
    expect(h.mv.card.querySelector('.mv-kind')?.textContent).toBe('좌표');
    expect(h.mv.card.querySelector('.mv-big')?.textContent).toMatch(/^12(\.0+)?, 34(\.0+)?$/);
    const again = [...h.mv.card.querySelectorAll('.mv-chip')].find((b) => b.textContent?.includes('다시 재기')) as HTMLButtonElement;
    again.click();
    await settle();
    expect(h.app.busyCommand).toBe('ID');
    h.app.cmd.escape();
    await settle();
    items[1]!.run();
    expect(h.opened).toContain('find');
  });
});

describe('찾지 못한 참조 파일 안내', () => {
  it('SHX 글꼴이 없는 도면을 열면 안내 카드(파일 고르기·닫기), 닫으면 다시 보이지 않는다', async () => {
    const h = setup((doc) => {
      doc.textStyles.set('ROMANS', { name: 'ROMANS', handle: 'A1', flags: 0, height: 0, widthFactor: 1, oblique: 0, generation: 0, lastHeight: 2.5, font: 'romans.shx', bigFont: '' });
    });
    h.mv.apply(true);
    h.mv.refresh();
    expect(await until(() => h.mv.card.classList.contains('is-notice'))).toBe(true);
    expect([...h.mv.card.querySelectorAll('.mv-res')].map((d) => d.textContent)).toContain('SHX 글꼴 1개');
    expect([...h.mv.card.querySelectorAll('.mv-chip')].map((b) => b.textContent)).toEqual(['파일 고르기']);
    // 명령이 시작하면 프롬프트가 앞선다
    void h.app.run('DIST');
    await settle();
    expect(h.mv.card.classList.contains('is-prompt')).toBe(true);
    h.app.cmd.escape();
    await settle();
    h.mv.refresh();
    await settle();
    (h.mv.card.querySelector('.mv-close') as HTMLButtonElement).click();
    await settle();
    expect(h.mv.card.hidden).toBe(true);
    h.mv.refresh();
    await settle();
    expect(h.mv.card.classList.contains('is-notice')).toBe(false);
  });
  it('안내 줄', () => {
    expect(missingLines({ xref: 2, image: 0, pdf: 1, shx: 3 })).toEqual(['외부 참조 2개', 'PDF 참고 1개', 'SHX 글꼴 3개']);
    expect(missingLines({ xref: 0, image: 0, pdf: 0, shx: 0 })).toEqual([]);
  });
});
