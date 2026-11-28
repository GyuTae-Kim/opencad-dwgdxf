/**
 * 341차: 명령이 물음을 띄운 동안 화면 언어를 바꾸면 물음 줄·휴대폰 물음 카드를 새 언어로 다시 그리는지(338·339·340차가 보고 둔 것 — WCAG 3.1.2)와
 * 340차가 보고 둔 둘(쓰는 곳이 없어진 열쇠 · 오류 글 멤버와 저장 손실 확인 창의 형식 이름).
 * - 번역층(src/app/i18n.ts)은 글 마디마다 원문을 적어 두어, 언어를 바꾸면 그 원문으로 다시 옮긴다 — 한국어 원문만으로 된 물음(옵션 목록·도면 글 ⁨…⁩)은 그대로 된다.
 * - 코드가 화면 언어로 옮겨 끼운 앱 낱말(uiText — TCASE 기본값 「문장 대소문자」, 338차)은 물음을 만든 때의 언어 글이 원문이 되어, 언어를 바꿔도 앞 언어로 남았다
 *   (한국어 → 영어 「<문장 대소문자>」, 영어 → 일본어 「<Sentence case>」 — 틀 {0} 자리라 거꾸로 찾기가 원문을 찾지 못함, 339차 표).
 * - 고친 길: 그런 물음은 명령이 물음을 다시 만드는 함수(PointOptions.relabel)를 함께 주고, App.relabelPrompt가 languagechange(editor.ts)에서 그 함수로
 *   물음을 새 언어로 다시 만들어 그린다. 이미 찍힌 기록 줄은 찍은 때의 글 그대로(AutoCAD처럼 — 339차 판단).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CommandLine } from '../src/app/commandline';
import { registerExpressTextCommands } from '../src/app/express-text';
import { installFileGuard } from '../src/app/fileguard';
import { ft } from '../src/app/filetext';
import { installLocalization } from '../src/app/i18n';
import { openErrorInfo } from '../src/app/openerror';
import { registerSaveCommands } from '../src/app/save';
import { MobileView } from '../src/app/ui/mobileview';
import { MODEL_SPACE, entityDefaults, type CadDocument, type Entity } from '../src/core/model';
import { translate } from '../site/i18n.mjs';
import { makeApp, settle } from './polish/real-app';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

vi.mock('../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('./polish/fakes')).FakeView }));
vi.mock('../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('./direct/fakes')).DirectCommandLine, RealCommandLine: (await orig<{ CommandLine: unknown }>()).CommandLine }));
vi.mock('../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('./polish/fakes')).FakeEngine }));
vi.mock('../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('./polish/fakes')).FakeFonts }));
vi.mock('../src/app/ui/dom', async (orig) => ({ ...(await orig<object>()), showMenu: vi.fn(), closeMenu: vi.fn(), toast: vi.fn() }));

const LANGS = ['en', 'ja', 'zh-CN', 'de'] as const;
type Lang = (typeof LANGS)[number] | 'ko';
const hangul = (s: string): number => s.match(/[가-힣]/g)?.length ?? 0;
const load = (lang: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../site/locales/${lang}.json`, import.meta.url), 'utf8'));
const dict = Object.fromEntries(LANGS.map((l) => [l, load(l)])) as Record<(typeof LANGS)[number], Record<string, string>>;
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SRC = new URL('../src/', import.meta.url);
const src = (f: string): string => readFileSync(new URL(f, SRC), 'utf8');
/** src 아래 .ts 파일(경로는 src/ 기준) */
const SRC_FILES = (readdirSync(SRC, { recursive: true }) as string[]).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'));

// 기다리지 않는 동적 가져오기를 미리 받아 둔다(공용 규칙 5번 — 휴대폰 카드의 안내·저장 길의 필드 고치기)
beforeAll(async () => {
  await Promise.all([import('../src/app/refs'), import('../src/app/shxfonts'), import('../src/app/fieldcmds')]);
});

let dispose: (() => void) | undefined;
const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const c of closers.splice(0).reverse()) await c();
  dispose?.();
  dispose = undefined;
  vi.unstubAllGlobals();
});

function stubDom(lang: Lang): { window: { close(): void } } {
  const dom = new JSDOM('<!doctype html><html lang="ko"><head><title>OpenCAD</title></head><body><div id="app"><header class="titlebar"></header><div id="cmd"></div></div></body></html>', {
    url: `https://gyutae-kim.github.io/opencad-dwgdxf/${lang === 'ko' ? '' : `${lang}/`}`,
  });
  const w = dom.window as unknown as Record<string, unknown>;
  for (const name of ['window', 'document', 'Node', 'NodeFilter', 'Element', 'HTMLElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLAnchorElement', 'MouseEvent', 'KeyboardEvent', 'MutationObserver', 'location', 'history', 'localStorage', 'CustomEvent'])
    vi.stubGlobal(name, w[name]);
  vi.stubGlobal('getComputedStyle', (el: Element, pseudo?: string) => dom.window.getComputedStyle(el, pseudo));
  vi.stubGlobal('matchMedia', (media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  );
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  return dom;
}

/** el이 타이머 두 바퀴 잇달아 조용할 때까지(번역층·카드가 다시 그리기를 마침 — 마감 2초, 공용 규칙 13번) */
const quiet = async (el: Node): Promise<void> => {
  let seen = 0;
  const mo = new MutationObserver(() => {
    seen++;
  });
  mo.observe(el, { subtree: true, childList: true, characterData: true, attributes: true });
  const end = Date.now() + 2000;
  for (let calm = 0; calm < 2 && Date.now() < end; ) {
    const before = seen;
    await new Promise((r) => setTimeout(r, 0));
    calm = seen === before ? calm + 1 : 0;
  }
  mo.disconnect();
};

/** 화면 언어를 바꾼 뒤 문서 언어가 lang이 되고 DOM이 타이머 세 바퀴 잇달아 조용할 때까지(마감 3초 — i18n-filetext 꼴, 공용 규칙 13번) */
const switched = async (lang: Lang): Promise<void> => {
  let seen = 0;
  const mo = new MutationObserver(() => {
    seen++;
  });
  mo.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true });
  const end = Date.now() + 3000;
  for (let calm = 0; calm < 3 && Date.now() < end; ) {
    const before = seen;
    await new Promise((r) => setTimeout(r, 0));
    calm = document.documentElement.lang === lang && seen === before ? calm + 1 : 0;
  }
  mo.disconnect();
};

/** 도면 글(축척 이름 — 한글이라 옮겨지면 보인다) */
const DRAWING = '한빛 축척';
/** 대표 물음 셋: 틀에 끼운 앱 낱말(TCASE 기본값 — uiText) · 도면 글(annoscale 축척 재정의 꼴) · 옵션 목록(vpcmds 뷰포트 지정 꼴) */
const ASKS = ['-TCASE', 'T341D', 'T341V'] as const;
const TEXT_HANDLE = 'C341';

function addText(doc: CadDocument): void {
  const ms = doc.blocks.get(MODEL_SPACE)!;
  const e = {
    ...entityDefaults(),
    handle: TEXT_HANDLE,
    owner: ms.recordHandle,
    layer: '0',
    type: 'TEXT',
    insert: { x: 0, y: 0, z: 0 },
    height: 2.5,
    text: 'abc',
    rotation: 0,
    widthFactor: 1,
    oblique: 0,
    style: 'Standard',
    generation: 0,
    halign: 0,
    valign: 0,
  } as unknown as Entity;
  ms.entities.push(e);
  doc.entityIndex.set(TEXT_HANDLE, e);
}

/** 진짜 App(가짜 화면·엔진)·진짜 명령행 물음 줄(지켜보는 쪽으로 이음)·휴대폰 보기 카드·번역층을 한 언어로 띄운다 */
async function open(lang: Lang) {
  const dom = stubDom(lang);
  const h = makeApp(addText);
  registerExpressTextCommands(h.app);
  h.app.register({
    name: 'T341D',
    title: 'T341D',
    run: async (ctx) => void (await ctx.getPoint(`${ft(DRAWING)}이(가) 이미 있습니다.  축척을 재정의하시겠습니까? [예(Y)/아니오(N)] <예>:`)),
  });
  h.app.register({ name: 'T341V', title: 'T341V', run: async (ctx) => void (await ctx.getPoint('뷰포트 지정 [전체(A)/선택(S)/현재(C)/현재 제외(X)] <현재>:')) });
  const { RealCommandLine } = (await import('../src/app/commandline')) as unknown as { RealCommandLine: typeof CommandLine };
  const root = document.getElementById('app')!;
  const line = new RealCommandLine(document.getElementById('cmd')!, { submit() {}, cancel() {}, suggest: () => [], keyword() {}, repeat() {} });
  // App이 명령행에 넘기는 물음을 진짜 명령행 물음 줄에도(App의 명령행은 시험 가짜 — 물음 줄 마디 나눔·번역은 진짜로 본다)
  h.app.cmd.watchers.add({ prompt: (t) => line.setPrompt(t) });
  const mv = new MobileView(h.app, { openPalette() {}, closePalette() {}, modeChanged() {} }, root);
  root.append(mv.bar, mv.card);
  installFileGuard({ docs: h.app.docs });
  const off = await installLocalization(root);
  // editor.ts와 같은 고리(341차 — 그 소스 줄은 아래 시험이 본다)
  root.addEventListener('languagechange', () => (h.app as unknown as { relabelPrompt?: () => void }).relabelPrompt?.());
  mv.apply(true);
  await settle();
  const close = async () => {
    h.app.cmd.watchers.clear();
    h.app.cancel(true);
    await settle();
    off();
    vi.unstubAllGlobals();
    dom.window.close();
  };
  closers.push(close);
  return { h, root, mv, close: async () => void (closers.splice(closers.indexOf(close), 1), await close()) };
}
type Session = Awaited<ReturnType<typeof open>>;

/** 물음을 띄운다(TCASE는 문자 하나를 먼저 고른다) */
async function ask(s: Session, name: (typeof ASKS)[number]): Promise<void> {
  if (name === '-TCASE') s.h.app.setSelection([TEXT_HANDLE], 'replace');
  void s.h.app.run(name);
  await settle();
  await quiet(s.root);
}

/** TCASE 모드를 「문장 대소문자」로(옵션 이름 「문장」과 다른 모드 이름표 — uiText로 끼우는 기본값. 모듈 상태라 한 번 고르면 이어진다) */
async function sentenceMode(s: Session): Promise<void> {
  await ask(s, '-TCASE');
  (s.h.app.cmd as unknown as { type(t: string): void }).type('S');
  await settle();
}

/** 지금 물음 줄과 휴대폰 카드(물음 본문 · 키워드·<기본값> 단추) */
const look = (s: Session): { line: string; card: string } => ({
  line: s.root.querySelector('.cmd-prompt')?.textContent ?? '',
  card: [s.mv.card.querySelector('.mv-prompt')?.textContent ?? '', ...[...s.mv.card.querySelectorAll('.mv-acts .mv-chip')].map((c) => c.textContent ?? '')].join(' | '),
});

describe('물음이 떠 있는 동안 화면 언어를 바꾸면 물음 줄·휴대폰 카드를 새 언어로(341차)', () => {
  it('대표 물음 셋 × 한국어 → 영어 → 일본어 → 중국어 → 독일어 → 한국어: 바꾼 뒤 물음 줄·카드가 그 언어로 처음 띄운 것과 같다(앞 언어 글 0·도면 글 그대로)', async () => {
    const fresh = {} as Record<Lang, Record<string, { line: string; card: string }>>;
    for (const l of ['ko', ...LANGS] as const) {
      const s = await open(l);
      await sentenceMode(s);
      fresh[l] = {};
      for (const name of ASKS) {
        await ask(s, name);
        fresh[l][name] = look(s);
        s.h.app.cancel(true);
        await settle();
      }
      await s.close();
    }
    // 처음 띄운 물음이 그 언어 글인지(시험이 보는 값의 바탕): 끼운 앱 낱말은 그 언어 번역, 도면 글은 그대로, 다른 언어 화면은 한글이 도면 글뿐
    for (const l of LANGS) {
      expect(fresh[l]['-TCASE']!.line, l).toContain(`<${dict[l]['문장 대소문자']}>`);
      expect(fresh[l].T341D!.line, l).toContain(DRAWING);
      for (const name of ASKS) expect(hangul(fresh[l][name]!.line.replace(DRAWING, '')) + hangul(fresh[l][name]!.card.replace(DRAWING, '')), `${l} ${name}`).toBe(0);
    }
    expect(fresh.ko['-TCASE']!.line).toContain('<문장 대소문자>');

    const s = await open('ko');
    const bad: string[] = [];
    for (const name of ASKS) {
      await ask(s, name);
      let from: Lang = 'ko';
      for (const l of [...LANGS, 'ko'] as const) {
        (document.querySelector(`.language-list [data-language="${l}"]`) as HTMLElement).click();
        await switched(l);
        await settle();
        await quiet(s.root);
        const now = look(s);
        if (now.line !== fresh[l][name]!.line) bad.push(`${name} ${from} → ${l} 물음 줄: ${now.line} (처음 띄우면 ${fresh[l][name]!.line})`);
        if (now.card !== fresh[l][name]!.card) bad.push(`${name} ${from} → ${l} 휴대폰: ${now.card} (처음 띄우면 ${fresh[l][name]!.card})`);
        from = l;
      }
      s.h.app.cancel(true);
      await settle();
    }
    await s.close();
    expect(bad, bad.join('\n')).toEqual([]);
  });

  it('editor.ts가 languagechange에서 App.relabelPrompt를 부르고, 물음 꼴에 uiText로 앱 낱말을 끼우는 곳은 다시 만드는 함수(relabel)를 함께 준다', () => {
    expect(src('editor.ts')).toContain("root.addEventListener('languagechange', () => app.relabelPrompt());");
    // 한 줄 템플릿 물음 꼴(한글 · 옵션 목록 「[…(X)…]」 — 338차 grep 거르개)에 uiText가 있으면: `const 이름 = () => \`…\`` 꼴로 만들고 같은 파일에 `relabel: 이름`
    const sites: string[] = [];
    const bad: string[] = [];
    for (const f of SRC_FILES.filter((x) => x.startsWith('app/'))) {
      const lines = src(f).split('\n');
      const text = lines.join('\n');
      lines.forEach((line, i) => {
        const at = `${f}:${i + 1}`;
        // 물음을 묻는 줄에 uiText를 곧바로 끼우면 다시 만들 함수가 없다(getEntity·getSelection은 relabel을 받지 않는다 — 필요하면 그 요청에도 더한다)
        if (/\b(?:getPoint|getEntity|getSelection)\(/.test(line) && line.includes('uiText(')) bad.push(`${at} 물음 줄에 uiText를 곧바로 끼움`);
        for (const m of line.matchAll(/`([^`]*)`/g)) {
          const body = m[1]!;
          if (!/[가-힣]/.test(body) || !/\[[^\]]*\([A-Z]+\)[^\]]*\]/.test(body) || !body.includes('uiText(')) continue;
          const fn = /\bconst (\w+) = \(\) =>\s*$/.exec(line.slice(0, m.index))?.[1];
          sites.push(`${at} ${fn ?? '?'}`);
          if (!fn || !text.includes(`relabel: ${fn}`)) bad.push(`${at} uiText를 끼운 물음에 relabel이 없음`);
        }
      });
    }
    expect(bad, bad.join('\n')).toEqual([]);
    expect(sites).toEqual(['app/express-text.ts:88 caseAsk']);
  });
});

describe('쓰는 곳이 없어진 열쇠를 지움(341차 — 340차가 보고 둔 것 (2))', () => {
  /** 340차가 문장을 통째 틀로 나눈 동사 조각 틀 둘 · 형식 이름을 화면 언어로 끼우게 된 저장 줄(340차 save.ts uiText(label))의 형식마다 틀 여섯 */
  const DWG = ['AutoCAD 2018/LT2018 도면 (*.dwg)', 'AutoCAD 2013/LT2013 도면 (*.dwg)', 'AutoCAD 2010/LT2010 도면 (*.dwg)', 'AutoCAD 2004/LT2004 도면 (*.dwg)', 'AutoCAD 2000/LT2000 도면 (*.dwg)', 'AutoCAD 도면 템플릿 (*.dwt)'];
  const GONE = ['{0}의 모형 객체 {1}개로 블록 "{2}"을(를) {3}습니다.{4}', '치수 스타일 "{0}"을(를) {1}. 현재 치수 스타일입니다.', ...DWG.map((t) => `{0}을(를) ${t} 형식으로 저장했습니다({1} KB, {2}ms).`)];

  it('네 사전에 없고, 소스가 그 틀로 옮겨질 글을 다시 만들지 않는다(한 줄 템플릿·두 걸음 조립 — 다시 쓰이면 실패: 열쇠를 되살린다)', () => {
    for (const l of LANGS) expect(GONE.filter((k) => k in dict[l]), l).toEqual([]);
    const all = SRC_FILES.map(src).join('\n');
    for (const k of GONE) expect(new RegExp(k.split(/\{\d+\}/).map(esc).join('\\$\\{[^}]+\\}')).test(all), k).toBe(false);
    // 두 걸음 조립: 저장 줄은 형식 이름을 화면 언어로 끼운다(한국어 형식 이름을 넘기면 형식마다의 틀이 다시 쓰인다) — 형식 이름 열쇠는 네 사전에 한글 없이
    expect(src('app/save.ts')).toContain('을(를) ${uiText(label)}${t.binary ? \' 이진\' : \'\'} 형식으로 저장했습니다(');
    for (const l of LANGS) for (const t of DWG) expect(hangul(dict[l][t] ?? '가'), `${l} ${t}`).toBe(0);
    // 동사 조각 틀 대신 쓰는 통째 문장(340차)은 네 사전에 있다
    const whole = ['{0}의 모형 객체 {1}개로 블록 "{2}"을(를) 재정의했습니다.', '{0}의 모형 객체 {1}개로 블록 "{2}"을(를) 만들었습니다.', '치수 스타일 "{0}"을(를) 재정의했습니다. 현재 치수 스타일입니다.', '치수 스타일 "{0}"을(를) 저장했습니다. 현재 치수 스타일입니다.'];
    for (const l of LANGS) expect(whole.filter((k) => !dict[l][k]), l).toEqual([]);
  });
});

/** 한 언어 화면의 명령행 기록 줄로 찍어 진짜 번역층(도면 글 지킴 포함)이 옮긴 글 */
async function printed(lang: Lang, lines: readonly string[]): Promise<string[]> {
  const dom = stubDom(lang);
  const { RealCommandLine } = (await import('../src/app/commandline')) as unknown as { RealCommandLine: typeof CommandLine };
  installFileGuard({ docs: [] });
  const off = await installLocalization(document.getElementById('app')!);
  const cmd = new RealCommandLine(document.getElementById('cmd')!, { submit() {}, cancel() {}, suggest: () => [], keyword() {}, repeat() {} });
  for (const l of lines) cmd.print(l, 'err');
  await quiet(document.body);
  const out = [...document.querySelectorAll('.cmd-history > div')].map((d) => d.textContent ?? '');
  off();
  vi.unstubAllGlobals();
  dom.window.close();
  return out;
}

describe('오류 글 멤버를 끼우는 줄과 저장 손실 확인 창(341차 — 340차가 보고 둔 것 (3)(4))', () => {
  /** 소스의 `error: '…'` 문장(앱이 쓴 입력 오류 글 — 사전 열쇠) */
  const errorsIn = (f: string): string[] => [...new Set([...src(f).matchAll(/\berror: '([^']+)'/g)].map((m) => m[1]!))];

  it('입력 오류 문장 줄 「이름: 문장」 — 동적 블록 특성(이름은 도면 글)은 틀 「{0}: 문장」(310차)로, 특성 팔레트는 칸 이름(앱 낱말)을 화면 언어로 끼워 같은 틀(빠진 둘은 341차)로 네 언어 한글 0', async () => {
    expect(src('app/dynblock.ts')).toContain('.print(`${ft(p.label)}: ${c.error}`');
    expect(src('app/ui/palettes.ts')).toContain('.print(`${f.fileLabel ? aria : uiText(aria)}: ${r.error}`');
    const dyn = errorsIn('app/dynblock.ts');
    const prop = errorsIn('app/propedit.ts');
    expect(dyn.length).toBeGreaterThan(0);
    expect(prop.length).toBeGreaterThan(0);
    // 틀 열쇠가 문장마다 네 사전에 있다(값은 같은 사전의 통째 문장 + 그 사전 「{0}: 문장」 꼴의 쌍점 — ja·zh 「{0}：」 다수 꼴)
    for (const l of LANGS) expect([...dyn, ...prop].filter((e) => !dict[l][`{0}: ${e}`]), l).toEqual([]);
    const bad: string[] = [];
    for (const l of LANGS) {
      // 동적 블록 특성 이름은 도면 글(ft), 특성 팔레트 칸 이름은 앱 낱말(「높이」 — 앱이 화면 언어로 끼운다)
      const now = [...dyn.map((e) => `${ft('거리1')}: ${e}`), ...prop.map((e) => `${translate('높이', l)}: ${e}`)];
      const before = prop.map((e) => `높이: ${e}`);
      const out = await printed(l, [...now, ...before]);
      out.slice(0, now.length).forEach((t) => void (hangul(t.replace('거리1', '')) && bad.push(`${l} ${t}`)));
      // 고치기 전 꼴(칸 이름 한국어 원문을 끼움)은 틀이 잡은 값을 옮기지 않아 한국어가 남는다 — 시험이 결함을 보는지
      out.slice(now.length).forEach((t) => void (!hangul(t) && bad.push(`${l} 칸 이름을 끼우지 않아도 옮겨짐(시험 바로잡기): ${t}`)));
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });

  it('열지 못한 까닭 줄(「이름 — 까닭」)은 나눔 「 — 」 조각마다 옮겨져 네 언어 한글 0(고치지 않음 — 엔진이 보낸 오류 글 detail은 339차 규칙대로 둔다)', async () => {
    const codes = ['file.empty', 'file.unrecognized', 'file.too_large', 'dxf.invalid', 'dwg.unsupported_version', 'dwg.corrupt', 'dwg.encrypted', 'worker', 'read', 'worker_load', 'interrupted', 'memory', 'internal'];
    const lines = codes.map((c) => `${ft('평면도.dwg')} — ${openErrorInfo(c).message}`);
    const bad: string[] = [];
    for (const l of LANGS) for (const t of await printed(l, lines)) if (hangul(t.replace('평면도.dwg', ''))) bad.push(`${l} ${t}`);
    expect(bad, bad.join('\n')).toEqual([]);
  });

  it('저장 손실 확인 창(대화 상자)은 네 언어 한글 0 — 형식 이름은 data-i18n-ui-copy 틀 자리라 번역층이 옮기고, 한국어 화면은 형식 이름 그대로', async () => {
    const LOSS = { code: 'dwg.write_entity_dropped', message: '이 버전으로 쓸 수 없는 도형 3개를 뺐습니다(원본 자료가 없거나 다른 버전).', count: 1, detail: { types: { '3DSOLID': 2, REGION: 1 } } };
    const bad: string[] = [];
    for (const l of ['ko', ...LANGS] as const) {
      const dom = stubDom(l);
      const h = makeApp();
      h.doc.format = 'dwg';
      h.doc.version = 'AC1021';
      registerSaveCommands(h.app);
      (h.app.engine as unknown as { save: unknown }).save = async () => ({ data: new Uint8Array([1, 2, 3]), warnings: [LOSS], ms: 1 });
      const off = await installLocalization(document.getElementById('app')!);
      void h.app.run('QSAVE');
      const end = Date.now() + 15000;
      while (!document.querySelector('.dialog') && Date.now() < end) await new Promise((r) => setTimeout(r, 10));
      await quiet(document.body);
      const text = document.querySelector('.dialog')?.textContent ?? '';
      if (l === 'ko') {
        if (!text.includes('AutoCAD 2004/LT2004 도면 (*.dwg)(으)로 저장하면')) bad.push(`ko 형식 이름: ${text}`);
      } else if (!text || hangul(text)) bad.push(`${l} ${text}`);
      h.app.cancel(true);
      await settle();
      off();
      vi.unstubAllGlobals();
      dom.window.close();
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });
});

describe('TCASE 옵션 낱말 한 낱말(342차 — 341차가 보고 둔 것 (1))', () => {
  /** 휴대폰 카드·기록 줄은 통째 값, 물음 줄 단추는 옵션 조각 값으로 옮긴다(324차 짝 꼴) — 같은 옵션이면 같은 낱말이어야 한다 */
  const WHOLE = '대소문자 선택 [문장(S)/소문자(L)/대문자(U)/제목(T)/대소문자 전환(G)] <{0}>:';
  const PIECES = ['문장(S)', '소문자(L)', '대문자(U)', '제목(T)', '대소문자 전환(G)'];

  it('네 사전에서 통째 값의 옵션 낱말이 옵션 조각 값과 같고, 모드 이름표 「대소문자 전환」(기본값·대화 상자·결과 줄)도 그 옵션 낱말이다', () => {
    expect(src('app/express-text.ts')).toContain('`대소문자 선택 [문장(S)/소문자(L)/대문자(U)/제목(T)/대소문자 전환(G)] <${uiText(CASE_LABEL[caseMode])}>:`');
    expect(src('edit/express/tcase.ts')).toContain("toggle: '대소문자 전환',");
    const bad: string[] = [];
    for (const l of LANGS) {
      const opts = /\[([^\]]*)\]/.exec(dict[l][WHOLE] ?? '')?.[1]?.split('/') ?? [];
      const pieces = PIECES.map((p) => dict[l][p] ?? p);
      if (opts.join('/') !== pieces.join('/')) bad.push(`${l} 통째 ${opts.join('/')} ↔ 조각 ${pieces.join('/')}`);
      const toggle = (dict[l]['대소문자 전환(G)'] ?? '').replace(/\s*\(G\)$/, '');
      if (toggle !== dict[l]['대소문자 전환']) bad.push(`${l} 이름표 ${dict[l]['대소문자 전환']} ↔ 옵션 ${toggle}`);
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });
});

/** 한 언어 화면의 대화 상자 확인 글 칸(.dialog .form-error)에 글을 넣어 진짜 번역층(도면 글 지킴 포함)이 옮긴 글 */
async function inDialog(lang: Lang, lines: readonly string[]): Promise<string[]> {
  const dom = stubDom(lang);
  installFileGuard({ docs: [] });
  const off = await installLocalization(document.getElementById('app')!);
  const box = document.createElement('div');
  box.className = 'dialog';
  document.body.append(box);
  for (const t of lines) {
    const d = document.createElement('div');
    d.className = 'form-error';
    d.textContent = t;
    box.append(d);
  }
  await quiet(document.body);
  const out = [...box.children].map((d) => d.textContent ?? '');
  off();
  vi.unstubAllGlobals();
  dom.window.close();
  return out;
}

describe('대화 상자 확인 글 「이름: 문장」(342차 — 341차가 보고 둔 것 (2))', () => {
  /** 소스 줄(조각 frag가 든 첫 줄)의 첫 한 줄 템플릿 */
  const templateAt = (f: string, frag: string): string => {
    const line = src(f).split('\n').find((x) => x.includes(frag));
    const t = line ? /`([^`]*)`/.exec(line)?.[1] : undefined;
    if (!t) throw new Error(`${f}: 「${frag}」 줄이 없음 — 시험 바로잡기`);
    return t;
  };
  /** 템플릿을 채운다: 식 → 한국어 화면 값(uiText(식)은 그 언어 번역 · ft(식)은 도면 글 가둠 — 표에 없는 식은 새 꼴이라 실패) */
  const fill = (tpl: string, s: Record<string, string>, l: Lang): string =>
    tpl.replace(/\$\{([^}]+)\}/g, (_m, e: string) => {
      const w = /^(uiText|ft)\((.+)\)$/.exec(e);
      const v = s[w ? w[2]! : e];
      if (v === undefined) throw new Error(`표에 없는 식(새 꼴): ${e} — ${tpl}`);
      return w?.[1] === 'uiText' ? (l === 'ko' ? v : translate(v, l)) : w ? ft(v) : v;
    });
  const unescape = (s: string): string => s.replace(/\\u\{([0-9a-fA-F]+)\}/g, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)));
  /** 폼(ui/dom.ts form)의 숫자 칸 이름표 — 리터럴로 쓴 것 */
  const NUMBER_LABELS = [...new Set(SRC_FILES.filter((f) => f.startsWith('app/')).flatMap((f) => [...src(f).matchAll(/label: '([^']+)', type: 'number'/g)].map((m) => unescape(m[1]!))))];
  const ARC_LABELS = [...(/for \(const \[k, label\] of \[([\s\S]*?)\] as const\)/.exec(src('app/arctext.ts'))?.[1] ?? '').matchAll(/'\w+', '([^']+)'/g)].map((m) => m[1]!);
  const INTS = [...src('app/options.ts').matchAll(/intIn\(\w+, (-?\d+), (-?\d+), '([^']+)'\)/g)].map((m) => ({ lo: m[1]!, hi: m[2]!, label: m[3]! }));
  /** 도면 글(이름표·이름·파일 — 옮기지 않음, 한글 셈에서 뺌) */
  const DRAWN = ['거리1', '갑', '을', '상태1', '설명글', '표준.dws', '표준.dwg'];
  const WHY = ['이름이 너무 깁니다.', '이름은 글자나 _로 시작하고 글자·숫자·_만 쓸 수 있습니다.'];
  /** 한 줄 템플릿 자리: [파일, 줄 조각, 채울 값들] */
  const SITES: [string, string, Record<string, string>[]][] = [
    ['app/ui/dom.ts', ': 숫자를 입력하십시오.`', NUMBER_LABELS.map((label) => ({ 'f.label': label }))],
    ['app/arctext.ts', ': 숫자를 입력하십시오.`', ARC_LABELS.map((label) => ({ label }))],
    ['app/options.ts', ' 사이의 정수가 필요합니다.`', INTS],
    ['app/dynblock.ts', "if ('error' in c) return `", [...new Set([...src('app/dynblock.ts').matchAll(/\berror: '([^']+)'/g)].map((m) => m[1]!))].map((e) => ({ 'p.label': '거리1', 'c.error': e }))],
    ['app/constraints.ts', 'if (why) return `', [{ "r.name || '(빈 이름)'": '(빈 이름)', why: '이름을 입력하십시오.' }, ...WHY.map((why) => ({ "r.name || '(빈 이름)'": 'd1', why }))]],
    ['app/constraints.ts', ': 식을 입력하십시오.`', [{ 'r.name': 'd1' }]],
    ['app/cadstandards.ts', ': 이 도면에 연결되어 있지만', [{ 'f.name': '표준.dws' }]],
  ];
  const ui = (s: string, l: Lang): string => (l === 'ko' ? s : translate(s, l));
  /** 이름 바꾸기 확인 글(rename.ts renameProblem — 잠금 까닭 · 이미 있는 이름 · 블록 *): 앞에 「이름: 」을 붙이면 통째 열쇠가 잡히지 않는다 */
  const RENAME = ['외부 참조 도면층은 이름을 바꿀 수 없습니다.', '도면층 0의 이름은 바꿀 수 없습니다.', '을은(는) 이미 있는 이름입니다.', '블록 이름은 *로 시작할 수 없습니다.'];
  /** 템플릿 안에 템플릿을 둔 줄(소스 줄 그대로 고정 + 그 줄이 그 언어 화면에서 만드는 글) */
  const NESTED: [string, string, (l: Lang) => string[]][] = [
    ['app/util2-misc.ts', 'err.textContent = `${ft(t.now)}: ${bad ? uiText(bad) : `${ft(t.next)}은(는) 이미 있는 이름입니다.`}`;', (l) => [`${ft('갑')}: ${ft('을')}은(는) 이미 있는 이름입니다.`, ...RENAME.map((b) => `${ft('갑')}: ${ui(b, l)}`)]],
    ['app/layerstate-ui.ts', "`${sel.key}: 도면층 ${sel.state.layers.filter((l) => l.name).length}개${sel.state.description ? ` — ${sel.state.description}` : ''}`", () => ['상태1: 도면층 3개', '상태1: 도면층 3개 — 설명글']],
    ['app/blkcmds-misc.ts', "note: `${ft(f.name)}: 치수 스타일 ${content.styles.length}개(${content.styles.map((s) => ft(s.name)).join(', ')}). 이 도면에 이미 있는 것: ${dup.map(ft).join(', ')}`", () => [`${ft('표준.dwg')}: 치수 스타일 2개(${ft('갑')}, ${ft('을')}). 이 도면에 이미 있는 것: ${ft('갑')}`]],
  ];

  it('자리마다 다섯 언어로 그려 네 언어 한글 0(도면 글은 그대로) — 앱 낱말 이름표(폼 숫자 칸·ARCTEXT 칸)는 화면 언어로 끼운다', async () => {
    // 셈의 바탕: 숫자 칸 이름표(리터럴)·ARCTEXT 여섯·OPTIONS 정수 일곱·동적 블록 입력 오류 문장, 이름 확인 글(params.ts)·이름 바꾸기 확인 글(rename.ts)
    expect(NUMBER_LABELS.length).toBeGreaterThan(40);
    expect(ARC_LABELS).toHaveLength(6);
    expect(INTS).toHaveLength(7);
    for (const w of ["return '이름을 입력하십시오.';", ...WHY.map((w) => `return '${w}';`)]) expect(src('edit/constraint/params.ts')).toContain(w);
    for (const w of ['return `${newName}은(는) 이미 있는 이름입니다.`;', "return '외부 참조 도면층은 이름을 바꿀 수 없습니다.';", 'return `도면층 ${l.name}의 이름은 바꿀 수 없습니다.`;', "return '블록 이름은 *로 시작할 수 없습니다.';"])
      expect(src('edit/util/rename.ts')).toContain(w);
    for (const [f, pin] of NESTED) expect(src(f), f).toContain(pin);
    const bad: string[] = [];
    for (const l of ['ko', ...LANGS] as const) {
      const rows = [
        ...SITES.flatMap(([f, frag, vals]) => vals.map((s) => ({ at: f, text: fill(templateAt(f, frag), s, l) }))),
        ...NESTED.flatMap(([f, , lines]) => lines(l).map((text) => ({ at: f, text }))),
      ];
      const out = await inDialog(l, rows.map((r) => r.text));
      out.forEach((t, i) => {
        const left = DRAWN.reduce((x, d) => x.split(d).join(''), t);
        if (l === 'ko' ? t !== rows[i]!.text.replace(/[⁨⁩]/g, '') : hangul(left)) bad.push(`${l} ${rows[i]!.at}: ${t}`);
      });
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });
});
