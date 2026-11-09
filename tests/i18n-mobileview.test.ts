/**
 * 휴대폰 보기의 결과·프롬프트 카드에 들어가는 도면 글(106차): 명령행이 지켜보는 쪽에 도면 글 표시(ft — U+2068·U+2069)를 둔 글을 주어
 * 화면 번역층이 표시로 지키고, 값(명령 이름·키워드·<기본값> 비교)에서는 표시를 뺀다. 105차까지는 표시를 뺀 글을 받아 이름 표로만 지켰다.
 */
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ft } from '../src/app/filetext';
import { CommandLine } from '../src/app/commandline';
import { installFileGuard } from '../src/app/fileguard';
import { installLocalization } from '../src/app/i18n';
import { createNewDocument } from '../src/core/newdoc';
import { registerCommands } from '../src/app/commands';
import { MobileView, promptParts } from '../src/app/ui/mobileview';
import { translate } from '../site/i18n.mjs';
import { makeApp, settle } from './polish/real-app';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

vi.mock('../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('./polish/fakes')).FakeView }));
vi.mock('../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('./direct/fakes')).DirectCommandLine, RealCommandLine: (await orig<{ CommandLine: unknown }>()).CommandLine }));
vi.mock('../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('./polish/fakes')).FakeEngine }));
vi.mock('../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('./polish/fakes')).FakeFonts }));
vi.mock('../src/app/ui/dom', async (orig) => ({ ...(await orig<object>()), showMenu: vi.fn(), closeMenu: vi.fn(), toast: vi.fn() }));

const MARK = /[⁨⁩]/;

let dispose: (() => void) | undefined;
/** 시험이 끝난 뒤 카드가 다시 그리지 않게(전역 문서를 되돌린 뒤 마이크로태스크가 돌지 않게) 지켜보기를 뗀다 */
const unwatch: (() => void)[] = [];
afterEach(async () => {
  for (const f of unwatch.splice(0)) f();
  await settle();
  dispose?.();
  dispose = undefined;
  vi.unstubAllGlobals();
});

const stubDom = (url: string) => {
  const dom = new JSDOM('<!doctype html><html><head><title>OpenCAD</title></head><body><div id="app"><header class="titlebar"></header><div id="cmd"></div></div></body></html>', { url });
  for (const name of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'HTMLAnchorElement', 'MutationObserver', 'location', 'history', 'localStorage', 'CustomEvent'])
    vi.stubGlobal(name, (dom.window as unknown as Record<string, unknown>)[name]);
  return dom;
};

describe('프롬프트 나누기(promptParts)의 도면 글 표시', () => {
  it('보일 글(단추·<기본값>)에는 표시를 두고 조각 경계에서 닫고 다시 연다 — 넣을 키워드에는 표시가 없다', () => {
    const p = promptParts(`속성 ${ft('치수 · 문자')} 값 [${ft('치수(D)')}/아니오(N)] <${ft('치수(D)')}>:`);
    expect(p.keywords.map((k) => k.key)).toEqual(['D', 'N']);
    expect(p.keywords.map((k) => k.label)).toEqual([ft('치수(D)'), '아니오(N)']);
    expect(p.fallback).toBe(ft('치수(D)'));
    // 프롬프트 전체를 감싼 표시가 키워드·<기본값>에 걸치면 조각마다 닫고 다시 연다
    const q = promptParts(ft('도면층 [가(A)/나(B)] <가(A)>:'));
    expect(q.keywords).toEqual([
      { key: 'A', label: ft('가(A)') },
      { key: 'B', label: ft('나(B)') },
    ]);
    expect(q.fallback).toBe(ft('가(A)'));
    // 표시만 있는 조각은 빈 키워드로 보지 않는다
    expect(promptParts(`고르기 [${ft('')}/예(Y)]:`).keywords.map((k) => k.key)).toEqual(['Y']);
    // 표시가 없으면 105차와 같다
    expect(promptParts('첫 번째 구석점 지정 또는 [객체(O)] <객체(O)>:')).toEqual({ text: '첫 번째 구석점 지정 또는 [객체(O)] <객체(O)>:', keywords: [{ key: 'O', label: '객체(O)' }], fallback: '객체(O)' });
  });
});

describe('명령행이 지켜보는 쪽에 주는 글', () => {
  it('지켜보는 쪽은 표시를 둔 글, 출력 고리·프롬프트 값은 뺀 글', async () => {
    stubDom('https://gyutae-kim.github.io/opencad-dwgdxf/');
    const { RealCommandLine } = (await import('../src/app/commandline')) as unknown as { RealCommandLine: typeof CommandLine };
    const cmd = new RealCommandLine(document.getElementById('cmd')!, { submit() {}, cancel() {}, suggest: () => [], keyword() {}, repeat() {} });
    const seen: string[] = [];
    const hooked: string[] = [];
    cmd.watchers.add({ print: (t) => void seen.push(t), prompt: (t) => void seen.push('P:' + t) });
    cmd.onPrint = (t) => void hooked.push(t);
    cmd.print(`블록 ${ft('치수')}을(를) 저장했습니다.`, 'res');
    cmd.setPrompt(`이름 <${ft('치수 · 문자')}>:`);
    expect(seen).toEqual([`블록 ${ft('치수')}을(를) 저장했습니다.`, `P:이름 <${ft('치수 · 문자')}>:`]);
    expect(hooked).toEqual(['블록 치수을(를) 저장했습니다.']);
    expect(cmd.prompt).toBe('이름 <치수 · 문자>:');
    expect(cmd.shownPrompt).toBe(`이름 <${ft('치수 · 문자')}>:`);
  });
});

describe('휴대폰 보기 카드(진짜 App·MobileView, 영어 화면)', () => {
  const setup = async () => {
    stubDom('https://gyutae-kim.github.io/opencad-dwgdxf/en/');
    const h = makeApp();
    registerCommands(h.app);
    // 이 시험만의 명령: 도면 글이 든 프롬프트로 점을 묻는다
    h.app.register({ name: 'T106', title: 'T106', run: async (ctx) => void (await ctx.getPoint(`블록 ${ft('치수 · 문자')} 넣을 점 [${ft('치수(D)')}/아니오(N)] <${ft('치수(D)')}>:`)) });
    const root = document.getElementById('app')!;
    const mv = new MobileView(h.app, { openPalette() {}, closePalette() {}, modeChanged() {} }, root);
    unwatch.push(() => {
      h.app.cmd.watchers.clear();
      h.app.cancel(true);
    });
    root.append(mv.bar, mv.card);
    installFileGuard({ docs: [{ doc: createNewDocument('metric') }] });
    dispose = await installLocalization(root);
    mv.apply(true);
    return { ...h, mv };
  };
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it('결과 줄의 도면 글은 번역층이 그대로 두고 앱 글만 옮긴다(표시는 보이는 글에서 빠진다)', async () => {
    const h = await setup();
    // 줄 전체가 도면 글(사전 열쇠와 같은 글)·나눔 글을 품은 이름: 표시가 없으면 번역층이 바꾼다
    expect(translate('치수', 'en')).not.toBe('치수');
    h.app.cmd.print(ft('치수'), 'res');
    h.app.cmd.print(`선  도면층: "${ft('치수 · 문자')}"  공간: 모형 공간  핸들 = 2A`, 'res');
    await settle();
    await tick();
    const rows = [...h.mv.card.querySelectorAll('.mv-res')].map((d) => d.textContent ?? '');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toBe('치수');
    expect(rows[1]).toContain('"치수 · 문자"');
    for (const r of rows) expect(r).not.toMatch(MARK);
    // 앱 글은 옮겨졌다(한국어 "도면층"이 남지 않는다)
    expect(rows[1]).not.toContain('도면층');
  });

  it('프롬프트 카드: 본문·키워드·<기본값> 단추의 도면 글은 그대로, 키워드 값은 표시 없이', async () => {
    const h = await setup();
    void h.app.run('T106');
    await settle();
    await tick();
    expect(h.mv.card.classList.contains('is-prompt')).toBe(true);
    const prompt = h.mv.card.querySelector('.mv-prompt')!.textContent!;
    expect(prompt).toContain('치수 · 문자');
    expect(prompt).not.toMatch(MARK);
    const chips = [...h.mv.card.querySelectorAll('.mv-acts .mv-chip')];
    expect(chips.map((c) => c.textContent)).toEqual(['치수(D)', expect.any(String)]);
    // <기본값>이 키워드와 같으면 그 단추를 앞세운다(표시를 빼고 견준다)
    expect(chips[0]!.classList.contains('primary')).toBe(true);
    expect(chips).toHaveLength(2);
  });
});
