/**
 * 휴대폰 보기 모드 보기 단추의 접근 이름(252차): 보이는 이름이 있는 단추는 그 이름이 접근 이름이다 — WCAG 2.2 2.5.3(보이는 이름이 접근 이름에
 * 들어 있어야 음성 조작으로 단추 이름을 말해 누를 수 있다). 데스크톱 리본 단추처럼 자세한 뜻은 제목 풍선(title — 접근 설명)에만 둔다.
 * 전에는 aria-label에 제목 풍선 글을 넣어 보이는 이름을 덮었고, 영어·중국어·독일어 사전에서는 「전체 보기」(독일어는 「치수」도)의
 * 보이는 이름이 접근 이름에 없었다. 진짜 App·MobileView와 화면 번역층(언어별 주소), 화면·명령행·엔진·글꼴은 가짜(i18n-mobileview.test.ts 꼴).
 */
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerCommands } from '../../src/app/commands';
import { installLocalization } from '../../src/app/i18n';
import { MobileView } from '../../src/app/ui/mobileview';
import { translate } from '../../site/i18n.mjs';
import { makeApp, settle } from '../polish/real-app';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('./fakes')).DirectCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));
vi.mock('../../src/app/ui/dom', async (orig) => ({ ...(await orig<object>()), showMenu: vi.fn(), closeMenu: vi.fn(), toast: vi.fn() }));

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
  const dom = new JSDOM('<!doctype html><html><head><title>OpenCAD</title></head><body><div id="app"><header class="titlebar"></header></div></body></html>', { url });
  for (const name of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'HTMLAnchorElement', 'MutationObserver', 'location', 'history', 'localStorage', 'CustomEvent'])
    vi.stubGlobal(name, (dom.window as unknown as Record<string, unknown>)[name]);
  return dom;
};

/** 보기 단추 줄(mobileview.ts — 전체 보기, 재기 넷, 도면층, 치수): 보이는 이름과 제목 풍선의 원문 */
const LABELLED: [label: string, tip: string][] = [
  ['전체 보기', '도면 전체 보기'],
  ['거리', '두 점 사이 거리 재기'],
  ['반지름', '원·호의 반지름과 지름 재기'],
  ['각도', '두 선 사이·호의 각도 재기'],
  ['면적', '점이나 객체로 면적과 둘레 재기'],
  ['도면층', '도면층 켜고 끄기'],
  ['치수', '치수 목록(표시 값과 실제 길이 비교)'],
];
/** 더 보기(아이콘만 — 보이는 이름 없음) */
const MORE = '더 보기: 좌표·찾기·참조 파일·보기 링크';

const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
/** 접근 이름(이 단추 꼴만 셈): aria-label, 없으면 aria-hidden이 아닌 글(아이콘 SVG는 aria-hidden), 그것도 없으면 title */
const accName = (el: Element): string => {
  const label = norm(el.getAttribute('aria-label'));
  if (label) return label;
  const c = el.cloneNode(true) as Element;
  for (const x of c.querySelectorAll('[aria-hidden="true"]')) x.remove();
  return norm(c.textContent) || norm(el.getAttribute('title'));
};

const LANGS = [
  ['ko', ''],
  ['en', 'en/'],
  ['ja', 'ja/'],
  ['zh-CN', 'zh-CN/'],
  ['de', 'de/'],
] as const;

describe('휴대폰 보기 단추 줄의 접근 이름(WCAG 2.5.3 — 진짜 MobileView와 화면 번역층)', () => {
  it.each(LANGS)('%s: 보이는 이름이 접근 이름이고, 제목 풍선은 화면 언어의 설명으로 그대로 — 더 보기는 aria-label', async (lang, path) => {
    stubDom(`https://gyutae-kim.github.io/opencad-dwgdxf/${path}`);
    const h = makeApp();
    registerCommands(h.app);
    const root = document.getElementById('app')!;
    const mv = new MobileView(h.app, { openPalette() {}, closePalette() {}, modeChanged() {} }, root);
    unwatch.push(() => {
      h.app.cmd.watchers.clear();
      h.app.cancel(true);
    });
    root.append(mv.bar, mv.card);
    dispose = await installLocalization(root);
    // 빠진 참조 안내(renderNotice)가 나눠 받는 모듈을 미리 받아 두어, 그 확인이 시험 안에서 끝나게 한다
    await Promise.all([import('../../src/app/refs'), import('../../src/app/shxfonts')]);
    mv.apply(true);
    await settle();

    expect(mv.bar.getAttribute('role')).toBe('toolbar');
    expect(mv.bar.getAttribute('aria-label')).toBe(translate('보기 도구', lang));
    const btns = [...mv.bar.querySelectorAll<HTMLButtonElement>('button')];
    expect(btns).toHaveLength(LABELLED.length + 1);
    const labelled = btns.filter((b) => b.querySelector('.vb-lbl'));
    const shown = labelled.map((b) => norm(b.querySelector('.vb-lbl')!.textContent));
    // 보이는 이름은 화면 언어로(원문 차례 그대로)
    expect(shown).toEqual(LABELLED.map(([l]) => translate(l, lang)));
    // 2.5.3: 보이는 이름이 접근 이름에 들어 있다(대소문자는 가리지 않는다) — 전에는 영어·중국어 「전체 보기」, 독일어 「전체 보기」·「치수」가 빠졌다
    const missing = labelled.flatMap((b, i) => (accName(b).toLocaleLowerCase().includes(shown[i]!.toLocaleLowerCase()) ? [] : [`${shown[i]} ↔ ${accName(b)}`]));
    expect(missing).toEqual([]);
    // 데스크톱 리본 단추 꼴: 접근 이름 = 보이는 이름, 자세한 뜻은 제목 풍선(접근 설명)으로 화면 언어 그대로
    expect(labelled.map(accName)).toEqual(shown);
    expect(labelled.map((b) => b.title)).toEqual(LABELLED.map(([, t]) => translate(t, lang)));
    if (lang === 'en') expect(accName(labelled[0]!)).toBe('Fit to view');
    // 더 보기는 보이는 이름이 없으니 접근 이름(aria-label)이 제목 풍선과 같다(지금 그대로)
    const more = btns.at(-1)!;
    expect(more.classList.contains('vb-more')).toBe(true);
    expect(more.querySelector('.vb-lbl')).toBeNull();
    expect(accName(more)).toBe(translate(MORE, lang));
    expect(more.title).toBe(translate(MORE, lang));
    // 한국어가 아닌 화면에는 한국어 이름·설명이 남지 않는다
    if (lang !== 'ko') for (const b of btns) expect(`${accName(b)} ${b.title}`).not.toMatch(/[가-힣]/);
  });
});
