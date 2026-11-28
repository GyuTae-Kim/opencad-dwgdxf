/**
 * 337차: 물음 줄 앞 조각이 틀로 잡혀 한국어가 남는 것(336차에 보고 두 것 (3) — 사전·번역층·진짜 명령행, 빌드 없이).
 * - 명령행 물음 줄(commandline.ts setPrompt)은 「앞 글 … [」·옵션 하나씩·「]」 뒤 글을 다른 글 마디로 두어 마디마다 옮긴다(331차).
 *   공용 번역기(opencad-site-kit translate)는 통째 열쇠를 먼저 보고, 없으면 틀({n} 열쇠 — 글자 수가 긴 것부터)의 첫 맞는 값에
 *   잡은 글을 옮기지 않고 끼운다(명령행은 data-i18n-ui-copy 밖). 기록 줄·휴대폰 카드 물음은 물음 통째 열쇠를 먼저 본다.
 * - 여러 단 MTEXT 묶음 그립(mtextcols-grips.ts PROMPT — 단 폭·단 간격·단 높이)의 물음은 통째 열쇠(「단 높이 지정 또는 [종료(X)]:」)만 있고
 *   앞 조각 열쇠가 없어, 틀 「{0} 지정 또는 [」가 앞 조각을 잡아 {0} 자리에 「단 높이」가 그대로 끼었다
 *   (zh 「指定 단 높이 或 [退出(X)]：」·en 「Specify 단 높이 or [Exit (X)]:」 — 네 언어 모두. 336차가 zh 시험 중에 봄).
 *   사전의 물음 앞 조각 413(337차 jq — 한글·옵션 목록·쌍점 끝 열쇠의 첫 「[」까지, {n} 없는 것) 가운데 통째 열쇠가 빠진 것은 이 셋뿐이고,
 *   311은 통째 열쇠가 빠지면 틀이 잡는다(「{0} 지정 또는 [」 109·「{0} 또는 [」 98·「{0} 입력 [」 83 등).
 * - 고친 길: 틀은 원문 조각과 같은 문장 꼴이라 그대로 두고, 빠진 앞 조각 열쇠 셋을 네 사전에(같은 사전의 통째 값에서 「[」까지 — 물음 줄과 기록 줄이 같은 문장).
 * - 재발 막기: 물음 앞 조각마다 네 언어 번역에 한글 0이고 통째 열쇠가 있다(틀에 잡혀 {0}에 한국어가 끼면 실패).
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installLocalization } from '../src/app/i18n';
import { installFileGuard } from '../src/app/fileguard';
import { CommandLine } from '../src/app/commandline';
import { createNewDocument } from '../src/core/newdoc';
// 네 사전을 모두 등록한다(언어를 바꾼 뒤의 앱 꼴)
import { translate } from '../site/i18n.mjs';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

const LANGS = ['en', 'ja', 'zh-CN', 'de'] as const;
type Lang = (typeof LANGS)[number];
const hangul = (s: string): number => s.match(/[가-힣]/g)?.length ?? 0;
const load = (lang: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../site/locales/${lang}.json`, import.meta.url), 'utf8'));
const dict = Object.fromEntries(LANGS.map((l) => [l, load(l)])) as Record<Lang, Record<string, string>>;
/** 번역기가 열쇠를 찾는 꼴(빈칸 모음 — opencad-site-kit normalize와 같음) */
const normalize = (s: string): string => s.replace(/\s+/g, ' ').trim();
/** setPrompt와 같은 나눔의 앞 글 + 「[」 */
const frontOf = (q: string): string | null => {
  const m = /^(.*?)\[(.*?)\](.*)$/.exec(q);
  return m ? `${m[1]}[` : null;
};
/** 물음 열쇠(한글이 있고 옵션 목록 「[…]」이 있으며 쌍점으로 끝남 — 기본값 있는·없는 것 모두)의 앞 조각(한글이 있고 {n}이 없는 것) */
const FRONTS = [
  ...new Set(
    Object.keys(dict.en)
      .filter((k) => /[가-힣]/.test(k) && /\[[^\]]*\]/.test(k) && /[:：]$/.test(k))
      .map(frontOf)
      .filter((f): f is string => !!f && /[가-힣]/.test(f) && !/\{\d+\}/.test(f)),
  ),
];
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** 번역기와 같은 틀 차례(틀 밖 글자 수가 긴 것부터) */
const TEMPLATES = Object.keys(dict.en)
  .filter((k) => /\{\d+\}/.test(k))
  .map((k) => ({ key: k, re: new RegExp(`^${k.split(/\{\d+\}/).map(esc).join('(.*?)')}$`) }))
  .sort((a, b) => b.key.replace(/\{\d+\}/g, '').length - a.key.replace(/\{\d+\}/g, '').length);
/** 통째 열쇠가 없을 때 그 글을 잡는 첫 틀 */
const catcher = (s: string): string | undefined => TEMPLATES.find((t) => t.re.test(normalize(s)))?.key;
/** 여러 단 MTEXT 묶음 그립 물음(mtextcols-grips.ts PROMPT — col:w·col:g·col:h) */
const COLS = ['단 폭 지정 또는 [종료(X)]:', '단 간격 지정 또는 [종료(X)]:', '단 높이 지정 또는 [종료(X)]:'];
/** 같은 틀 꼴로 앞 조각 열쇠가 있던 물음(assocarray-grips.ts LABEL — 배열 그립 열 간격) */
const ARRAY = '열 간격 지정 또는 [종료(X)]:';

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.unstubAllGlobals();
});

/** el이 타이머 두 바퀴 잇달아 조용할 때까지(번역층이 다시 옮기기를 마침 — 마감 2초, 횟수 기다림 대신: 공용 규칙 13번) */
const quiet = async (el: Element): Promise<void> => {
  let seen = 0;
  const mo = new MutationObserver(() => {
    seen++;
  });
  mo.observe(el, { subtree: true, childList: true, characterData: true });
  const end = Date.now() + 2000;
  for (let calm = 0; calm < 2 && Date.now() < end; ) {
    const before = seen;
    await new Promise((r) => setTimeout(r, 0));
    calm = seen === before ? calm + 1 : 0;
  }
  mo.disconnect();
};

/** 한 언어 화면에서 물음마다 물음 줄·기록 줄(물음 + 친 좌표)·휴대폰 카드 물음을 진짜 번역층으로 옮긴 글 */
async function render(l: Lang | 'ko', asks: readonly string[]): Promise<{ q: string; shown: string; rec: string; mobile: string }[]> {
  const dom = new JSDOM('<!doctype html><html><head><title>OpenCAD</title></head><body><div id="app"><header class="titlebar"></header><div id="cmd"></div><div class="mv-card"></div></div></body></html>', {
    url: `https://gyutae-kim.github.io/opencad-dwgdxf/${l === 'ko' ? '' : `${l}/`}`,
  });
  for (const name of ['window', 'document', 'Node', 'Element', 'HTMLAnchorElement', 'MutationObserver', 'location', 'history', 'localStorage', 'CustomEvent'])
    vi.stubGlobal(name, (dom.window as unknown as Record<string, unknown>)[name]);
  installFileGuard({ docs: [{ doc: createNewDocument('metric') }] });
  dispose = await installLocalization(document.getElementById('app')!);
  const cmd = new CommandLine(document.getElementById('cmd')!, { submit() {}, cancel() {}, suggest: () => [], keyword() {}, repeat() {} });
  const app = document.getElementById('app')!;
  const prompt = document.querySelector('.cmd-prompt')!;
  const card = document.querySelector('.mv-card')!;
  const out: { q: string; shown: string; rec: string; mobile: string }[] = [];
  for (const q of asks) {
    // 그립 점 물음에 친 좌표(app.ts promptOf + 도면 글 표시)
    cmd.setPrompt(q);
    cmd.print(`${q} ⁨10,20⁩`);
    card.replaceChildren(Object.assign(document.createElement('div'), { className: 'mv-prompt', textContent: q }));
    await quiet(app);
    out.push({ q, shown: prompt.textContent!, rec: document.querySelector('.cmd-history')!.lastElementChild!.textContent!, mobile: card.textContent! });
  }
  dispose();
  dispose = undefined;
  vi.unstubAllGlobals();
  dom.window.close();
  return out;
}

/** 첫 「[」까지(물음 줄 앞 조각과 기록 줄 통째 값의 앞 문장) */
const head = (s: string): string => s.slice(0, s.indexOf('[') + 1);

describe('물음 줄 앞 조각이 틀로 잡혀 한국어가 남는 것(337차)', () => {
  it('(가) 여러 단 MTEXT 그립 물음 셋의 앞 조각 — 빠지면 틀 「{0} 지정 또는 [」가 잡는다, 네 사전에 통째 열쇠가 있고 통째 물음 값의 「[」까지와 같은 문장', () => {
    for (const q of [...COLS, ARRAY]) {
      const f = frontOf(q)!;
      expect(catcher(f), f).toBe('{0} 지정 또는 [');
      for (const l of LANGS) {
        expect(dict[l][q], `${l} ${q}`).toBeDefined();
        expect(dict[l][f], `${l} ${f}`).toBe(head(dict[l][q]!));
      }
    }
  });

  it('(가) 진짜 명령행 — 네 언어 물음 줄·기록 줄·휴대폰 카드 물음에 한글 0·물음 줄과 기록 줄의 앞 문장 같음, 한국어 화면은 원문 그대로', async () => {
    const asks = [...COLS, ARRAY];
    const bad: string[] = [];
    for (const l of LANGS) {
      for (const { q, shown, rec, mobile } of await render(l, asks)) {
        if (hangul(shown) || head(shown) !== head(dict[l][q]!)) bad.push(`${l} 물음 줄: ${shown}`);
        if (rec !== `${dict[l][q]} 10,20`) bad.push(`${l} 기록 줄: ${rec}`);
        if (mobile !== dict[l][q]) bad.push(`${l} 휴대폰: ${mobile}`);
      }
    }
    for (const { q, shown, rec, mobile } of await render('ko', asks)) {
      if (shown !== q) bad.push(`ko 물음 줄: ${shown}`);
      if (rec !== `${q} 10,20`) bad.push(`ko 기록 줄: ${rec}`);
      if (mobile !== q) bad.push(`ko 휴대폰: ${mobile}`);
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });

  it('(다) 물음 앞 조각마다 네 언어 번역에 한글 0이고 통째 열쇠가 있다 — 틀에 잡혀 {0}에 한국어가 끼면 실패(사전만으로), 한국어는 원문 그대로', () => {
    // 337차 jq: 413(열쇠가 늘어도 깨지지 않게 하한만)
    expect(FRONTS.length).toBeGreaterThan(400);
    const bad: string[] = [];
    for (const f of FRONTS) {
      if (translate(f, 'ko') !== f) bad.push(`ko: ${f}`);
      for (const l of LANGS) {
        const out = translate(f, l);
        if (hangul(out)) bad.push(`${l}: ${f} → ${out} (틀 ${catcher(f) ?? '없음'})`);
      }
    }
    expect(bad).toEqual([]);
    expect(FRONTS.filter((f) => LANGS.some((l) => dict[l][normalize(f)] === undefined))).toEqual([]);
  });
});
