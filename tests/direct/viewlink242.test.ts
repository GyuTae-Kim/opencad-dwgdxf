/**
 * 보기 링크(#view=)로 연 도면과 휴대폰 보기 모드의 처음 전체 보기(242차): 링크를 적용하면 그 화면을 지키고(처음 맞추기를 건너뛴다),
 * 링크의 배치 탭이 이 도면에 없어 적용하지 못하면 알린 뒤 링크 없이 연 도면과 같게 처음 볼 때 도면 전체로 맞춘다
 * (데스크톱도 적용하지 못한 링크는 링크 없이 연 화면 그대로다). 241차까지는 링크를 받은 순간 처음 맞추기를 꺼서,
 * 배치가 없으면 파일에 저장된(데스크톱 비율) 화면이 휴대폰에 남았다.
 * 진짜 App·MobileView·installViewLinks(editor.ts와 같은 잇기), 화면·명령행·엔진·글꼴은 가짜(viewmode-round4.test.ts와 같은 틀).
 */
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MobileView } from '../../src/app/ui/mobileview';
import { toast } from '../../src/app/ui/dom';
import { encodeViewLink } from '../../src/app/viewlink';
import { installViewLinks } from '../../src/app/viewlink-app';
import { makeApp, settle } from '../polish/real-app';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('./fakes')).DirectCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));
vi.mock('../../src/app/ui/dom', async (orig) => ({ ...(await orig<object>()), showMenu: vi.fn(), closeMenu: vi.fn(), toast: vi.fn() }));

let close: (() => void) | undefined;
beforeEach(async () => {
  vi.mocked(toast).mockClear();
  // 빠진 참조 안내가 나눠 받는 모듈을 미리 받아 둔다(그 확인이 시험 안에서 끝나게)
  await Promise.all([import('../../src/app/refs'), import('../../src/app/shxfonts')]);
});
afterEach(() => {
  vi.unstubAllGlobals();
  close?.();
  close = undefined;
});

/**
 * 주소(해시)를 담은 페이지에서 앱을 띄우고, 도면이 열린 것처럼 잇는다: 보기 모드(view)면 시작 화면에서 먼저 보기 모드로 두고,
 * app.openFile처럼 같은 틱에 셸의 다시 그리기(refreshPalette → mobile.refresh)와 onOpened(보기 링크)를 부른다.
 */
async function open(hash: string, view: boolean) {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: `http://localhost/${hash}` });
  close = () => dom.window.close();
  for (const name of ['window', 'document', 'location', 'localStorage']) vi.stubGlobal(name, (dom.window as unknown as Record<string, unknown>)[name]);
  // 링크는 두 그리기 틀 뒤에 적용한다 — 타이머로 바꾼다
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => setTimeout(() => cb(0), 0));
  const h = makeApp();
  const root = document.getElementById('app')!;
  const mv = new MobileView(h.app, { openPalette() {}, closePalette() {}, modeChanged() {} }, root);
  root.append(mv.bar, mv.card);
  const fit = vi.spyOn(h.view, 'zoomExtents');
  const rect = vi.spyOn(h.view, 'zoomRect');
  // editor.ts와 같은 잇기(휴대폰 보기가 있는 셸)
  const links = installViewLinks(h.app, (st, keep) => mv.keepView(st, keep));
  const st = h.st;
  h.app.active = null;
  if (view) mv.apply(true);
  h.app.active = st;
  mv.refresh();
  links.opened(st);
  await settle();
  return { ...h, mv, fit, rect };
}

const toasted = () => vi.mocked(toast).mock.calls.length > 0;

describe('보기 링크로 연 도면의 휴대폰 처음 전체 보기(242차)', () => {
  it('링크 없이 열면 처음 볼 때 한 번 도면 전체로 맞춘다(기준)', async () => {
    const h = await open('', true);
    await settle();
    expect(h.fit).toHaveBeenCalledTimes(1);
    expect(h.rect).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it('적용한 링크(모형)는 그 화면을 지키고 전체 보기로 맞추지 않는다(그대로)', async () => {
    const h = await open('#' + encodeViewLink({ center: [1, 2], size: [3, 4] }), true);
    // 첫 그리기(링크를 적용하기 전)도 맞추지 않는다
    expect(h.fit).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(toasted()).toBe(true));
    await settle();
    expect(h.rect).toHaveBeenCalledWith(-0.5, 0, 2.5, 4, true, 0);
    expect(toast).toHaveBeenCalledWith('주소의 보기(가운데·배율·배치 탭)를 적용했습니다.');
    expect(h.fit).not.toHaveBeenCalled();
  });

  it('링크의 배치가 도면에 없으면 알린 뒤 링크 없이 연 것처럼 도면 전체로 맞춘다', async () => {
    const h = await open('#' + encodeViewLink({ center: [1, 2], size: [3, 4], layout: '없는 배치' }), true);
    expect(h.fit).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(toasted()).toBe(true));
    await settle();
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('이 도면에 없습니다'), 'warn');
    expect(h.rect).not.toHaveBeenCalled();
    expect(h.fit).toHaveBeenCalledTimes(1);
    // 그 뒤 다시 그려도 한 번만
    h.mv.refresh();
    await settle();
    expect(h.fit).toHaveBeenCalledTimes(1);
  });

  it('편집 화면에서 연 없는 배치 링크: 지금은 맞추지 않고, 보기 모드로 들어갈 때 링크 없이 연 도면처럼 맞춘다', async () => {
    const h = await open('#' + encodeViewLink({ center: [1, 2], size: [3, 4], layout: '없는 배치' }), false);
    await vi.waitFor(() => expect(toasted()).toBe(true));
    await settle();
    expect(h.fit).not.toHaveBeenCalled();
    h.mv.apply(true);
    await settle();
    expect(h.fit).toHaveBeenCalledTimes(1);
  });
});
