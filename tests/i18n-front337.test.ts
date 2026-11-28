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
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fileGuard, installLocalization } from '../src/app/i18n';
import { installFileGuard } from '../src/app/fileguard';
import { balanceMarks, CommandLine } from '../src/app/commandline';
import { unmark } from '../src/app/filetext';
import { createNewDocument } from '../src/core/newdoc';
// 네 사전을 모두 등록한다(언어를 바꾼 뒤의 앱 꼴)
import { sourceMessage, translate } from '../site/i18n.mjs';
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

/*
 * 338차: 코드가 낱말을 끼워 만드는 물음(337차에 보고 두 것 (1)). 위 (다)는 사전의 물음 열쇠에서 앞 조각을 모아, 사전에 통째 열쇠가 없고
 * 코드가 템플릿 리터럴(`${…}`)로 낱말(객체 이름·옵션·수)을 끼워 만드는 물음은 보지 못했다.
 * - 원문 꼴은 소스 글에서 뽑는다: src 아래 .ts의 한 줄 템플릿 리터럴 가운데 한글·`${`·옵션 목록 「[…(X)…]」이 있는 것(338차 grep 140과 같은 거르개).
 * - 끼우는 값: 삼항 식의 문자열 잎은 모두, ft()는 도면 글 자리(라틴 이름 — 옮기지 않음), 매개변수는 그 함수를 부르는 곳의 문자열(템플릿이면 다시 채움),
 *   같은 파일의 const는 그 오른쪽 식, 대문자 상수 표 찾기(GAP_LABEL[gap])는 그 파일·가져온 파일의 표 값, uiText(…)는 언어마다 그 번역,
 *   그 밖의 기본값 꺾쇠·옵션 목록 뒤는 수 「1」. 그 밖의 앞 조각·옵션 자리 식은 아래 FILL 표(값 종류와 함께) — 표에 없으면 실패(새 꼴).
 * - 고치기 전 13(흉내 넷 — 오지 않는 그립 이름 둘·꼬리 표를 수로 채운 둘)에서 실제 아홉, 꼬리 표 값을 실제로 채운 뒤 하나 더(TCASE 기본값 「문장 대소문자」).
 * - 물음 줄(setPrompt와 같은 마디 나눔)·기록 줄(물음 + 친 좌표)·휴대폰 카드 물음을 번역층 value()와 같은 길(도면 글 지킴 고리 fileGuard.fn → 거꾸로 찾기 + 통째 번역)로
 *   사전만으로 옮겨(요소 흉내 — DOM 없이), 네 언어 한글 0·한국어 원문 그대로인지 본다.
 */
const SRC = new URL('../src/', import.meta.url);
const walk = (dir: URL, rel = ''): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(new URL(`${d.name}/`, dir), `${rel}${d.name}/`) : d.name.endsWith('.ts') ? [`${rel}${d.name}`] : [],
  );
const SOURCES = new Map(walk(SRC).map((f) => [f, readFileSync(new URL(f, SRC), 'utf8').split('\n')] as const));

/** s[i]의 따옴표 문자열이 닫히는 자리 */
const quoteEnd = (s: string, i: number): number => {
  for (let j = i + 1; j < s.length; j++) {
    if (s[j] === '\\') j++;
    else if (s[j] === s[i]) return j;
  }
  return -1;
};
/** s[i]의 「`」로 연 템플릿이 닫히는 자리(${…} 안의 문자열·템플릿 건너뜀) */
function templateEnd(s: string, i: number): number {
  for (let j = i + 1; j < s.length; j++) {
    if (s[j] === '\\') j++;
    else if (s[j] === '`') return j;
    else if (s[j] === '$' && s[j + 1] === '{') {
      j = exprEnd(s, j + 2);
      if (j < 0) return -1;
    }
  }
  return -1;
}
/** 「${」 뒤 i부터 짝 맞는 「}」 자리 */
function exprEnd(s: string, i: number): number {
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    const c = s[j]!;
    if (c === "'" || c === '"') j = quoteEnd(s, j);
    else if (c === '`') j = templateEnd(s, j);
    else if (c === '{') depth++;
    else if (c === '}') {
      if (depth === 0) return j;
      depth--;
    }
    if (j < 0) return -1;
  }
  return -1;
}
/** 한 줄의 바깥 템플릿 리터럴 본문(주석 줄·줄 끝 주석·따옴표 문자열 밖) */
function templatesIn(line: string): string[] {
  const out: string[] = [];
  const t = line.trimStart();
  if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return out;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === "'" || c === '"') i = quoteEnd(line, i);
    else if (c === '/' && line[i + 1] === '/') break;
    else if (c === '`') {
      const end = templateEnd(line, i);
      if (end > 0) out.push(line.slice(i + 1, end));
      i = end;
    }
    if (i < 0) break;
  }
  return out;
}
const unescapeJs = (s: string): string =>
  s.replace(/\\u\{([0-9a-fA-F]+)\}|\\u([0-9a-fA-F]{4})|\\(.)/g, (_m, a?: string, b?: string, c?: string) =>
    a || b ? String.fromCodePoint(parseInt((a || b)!, 16)) : c === 'n' ? '\n' : c!,
  );
type Tok = { lit: string } | { expr: string };
/** 템플릿 본문 → 글 조각과 ${식} */
function tokens(body: string): Tok[] {
  const out: Tok[] = [];
  let lit = '';
  for (let j = 0; j < body.length; j++) {
    if (body[j] === '\\') {
      lit += body.slice(j, j + 2);
      j++;
    } else if (body[j] === '$' && body[j + 1] === '{') {
      const e = exprEnd(body, j + 2);
      if (e < 0) break;
      out.push({ lit: unescapeJs(lit) }, { expr: body.slice(j + 2, e).trim() });
      lit = '';
      j = e;
    } else lit += body[j];
  }
  out.push({ lit: unescapeJs(lit) });
  return out;
}
/** 삼항 「?」(선택 사슬 「?.」·「??」 뺌) */
const isQ = (e: string, j: number): boolean => e[j] === '?' && e[j + 1] !== '.' && e[j + 1] !== '?' && e[j - 1] !== '?';
/** 바깥 수준(괄호·문자열·템플릿 밖)에서 pred가 처음 맞는 자리 */
function topIndex(e: string, pred: (j: number) => boolean): number {
  let depth = 0;
  for (let j = 0; j < e.length; j++) {
    const c = e[j]!;
    if (c === "'" || c === '"') j = quoteEnd(e, j);
    else if (c === '`') j = templateEnd(e, j);
    else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (!depth && pred(j)) return j;
    if (j < 0) return -1;
  }
  return -1;
}
/** 식 전체가 한 괄호에 싸였는지 */
const wrapped = (e: string): boolean => e.startsWith('(') && e.endsWith(')') && balanced(e.slice(1, -1));
/** 괄호 짝이 맞고 중간에 바깥 괄호가 닫히지 않음 */
const balanced = (e: string): boolean => {
  let depth = 0;
  for (let j = 0; j < e.length; j++) {
    const c = e[j]!;
    if (c === "'" || c === '"') j = quoteEnd(e, j);
    else if (c === '`') j = templateEnd(e, j);
    else if (c === '(') depth++;
    else if (c === ')' && --depth < 0) return false;
    if (j < 0) return false;
  }
  return depth === 0;
};
/** 삼항 식의 값 잎(조건은 뺀다) */
function leaves(expr: string): string[] {
  const e = expr.trim();
  if (wrapped(e)) return leaves(e.slice(1, -1));
  const q = topIndex(e, (j) => isQ(e, j));
  if (q < 0) return [e];
  const rest = e.slice(q + 1);
  let nest = 0;
  const c = topIndex(rest, (j) => {
    if (isQ(rest, j)) nest++;
    else if (rest[j] === ':') {
      if (nest === 0) return true;
      nest--;
    }
    return false;
  });
  return c < 0 ? [e] : [...leaves(rest.slice(0, c)), ...leaves(rest.slice(c + 1))];
}

type Pos = 'front' | 'opts' | 'tail';
/** 도면 글 자리(ft — 라틴 이름이라 한글 셈에 들지 않는다) */
const DRAWING = '⁨A-1⁩';
interface Fill {
  kind: '도면 글' | '앱 낱말' | '수';
  values: string[];
  /** 그 파일 소스에 있어야 하는 글(값을 코드에서 옮겨 적은 근거) */
  pins: string[];
}
/** 앞 조각·옵션 자리에 끼우는 식 가운데 소스 글로 값을 뽑지 못하는 것(파일|식 → 값) */
const FILL: Record<string, Fill> = {
  // 그룹 이름(도면 글) — 이름 없는 그룹은 앱 낱말 「(이름 없음)」을 붙인다(groupLabel)
  'app/util2-select.ts|groupLabel(gs[i])': { kind: '도면 글', values: [DRAWING, `${DRAWING}(이름 없음)`], pins: ['`${ft(g.name)}(이름 없음)`'] },
  'app/editcmds2-query.ts|groupLabel(gs[i])': { kind: '도면 글', values: [DRAWING, `${DRAWING}(이름 없음)`], pins: ['`${ft(g.name)}(이름 없음)`'] },
  // PEDIT 스플라인 점 걷기(walkPoints를 부르는 곳의 물음 함수)
  'app/modify2-pedit.ts|prompt(e, i)': { kind: '앱 낱말', values: ['새 위치 지정', '새 가중치 입력(현재 = 1.0000)'], pins: ["() => '새 위치 지정'", '`새 가중치 입력(현재 = ${'] },
  // 연관 배열 그립 이름표(LABEL — arrayGripPoints가 만드는 그립 id는 모두 표에 있다. 원형 중심 「이동」은 「이동점 지정 또는 [종료(X)]:」로 먼저 돌아가
  // 「${label} 지정 또는 [종료(X)]:」에 오지 않고, 「?? '배열'」은 표 밖 id 받침이라 오지 않는다)
  "app/assocarray-grips.ts|LABEL[kind] ?? '배열'": {
    kind: '앱 낱말',
    values: ['열 간격', '열 수', '행 간격', '행 수', '행 및 열 수', '반지름', '항목 사이의 각도', '채울 각도', '항목 사이 거리', '항목 수'],
    pins: ["colsp: '열 간격'", "count: '항목 수'", "if (kind === 'center') {", "add('spacing'", "add('count'"],
  },
  // 소거 대상 이름(PURGE_KINDS·PURGE_EXTRA noun)
  'app/dashcmds-tables.ts|noun': {
    kind: '앱 낱말',
    values: ['블록', '치수 스타일', '도면층', '선종류', '문자 스타일', '그룹', '다중 지시선 스타일', '다중선 스타일', '테이블 스타일', '등록된 응용프로그램'],
    pins: ["noun: '블록'", "noun: '문자 스타일'", "noun: '그룹'", "noun: '등록된 응용프로그램'"],
  },
  // 도면의 블록 참조 수(EXPRESS 블록 처리)
  'app/express-select.ts|refs.length': { kind: '수', values: ['3'], pins: ['참조 수 = ${refs.length}'] },
};
const unresolved: string[] = [];

/** 모듈 상수 표(const NAME … = { k: '값', … } 또는 ['값', …])의 문자열 값 — 그 파일에 없으면 그 이름을 가져온 상대 경로 파일에서 */
function tableValues(file: string, name: string, depth = 0): string[] {
  const lines = SOURCES.get(file);
  if (!lines) return [];
  const at = lines.findIndex((l) => new RegExp(`\\b(?:const|let)\\s+${name}\\b[^=]*=`).test(l));
  if (at < 0) {
    const spec = depth ? undefined : lines.map((l) => new RegExp(`^import\\b.*\\b${name}\\b.*from\\s+'(\\.[^']+)'`).exec(l)?.[1]).find(Boolean);
    return spec ? tableValues(new URL(`${spec}.ts`, new URL(file, 'file:///s/')).pathname.slice(3), name, depth + 1) : [];
  }
  let text = '';
  for (let k = at; k < Math.min(lines.length, at + 60); k++) {
    text += `${lines[k]}\n`;
    if (/;\s*$/.test(lines[k]!)) break;
  }
  const lits = [...text.slice(text.indexOf('=', text.indexOf(name)) + 1).matchAll(/(:\s*)?'((?:\\.|[^'\\])*)'/g)];
  const keyed = lits.filter((x) => x[1]);
  return [...new Set((keyed.length ? keyed : lits).map((x) => unescapeJs(x[2]!)))];
}
/** 식의 대표 값들 */
function values(expr: string, file: string, at: number, pos: Pos, depth: number): string[] {
  return [...new Set(leaves(expr).flatMap((l) => leafValues(l, file, at, pos, depth)))];
}
function leafValues(leaf: string, file: string, at: number, pos: Pos, depth: number): string[] {
  const e = leaf.replace(/!(?=[)\].,]|$)/g, '').trim();
  const lit = /^(['"])((?:\\.|(?!\1)[^\\])*)\1$/.exec(e);
  if (lit) return [unescapeJs(lit[2]!)];
  if (e.startsWith('`') && e.endsWith('`')) return fill(e.slice(1, -1), file, at, pos, depth + 1);
  if (/\bft\(|\.map\(ft\)/.test(e)) return [DRAWING];
  // 앱 낱말을 화면 언어로 옮겨 끼우는 자리(uiText — 언어마다 그 번역으로 바꿔 본다: inLang)
  const ui = /^uiText\((.+)\)$/.exec(e);
  if (ui) return values(ui[1]!, file, at, pos, depth).map((v) => `\u0001${v}\u0002`);
  const m = FILL[`${file}|${e}`];
  if (m) return m.values;
  // 모듈 상수 표 찾기(GAP_LABEL[gap]·ISO_PLANE_NAMES[s.pair] — 그 파일이나 가져온 파일의 객체 값·배열 항목)
  const table = /^([A-Z][A-Z0-9_]*)\[[^\]]+\]$/.exec(e);
  const tv = table ? tableValues(file, table[1]!) : [];
  if (tv.length) return tv;
  if (depth < 4 && /^[A-Za-z_]\w*$/.test(e)) {
    const lines = SOURCES.get(file)!;
    for (let k = at; k >= 0; k--) {
      // 그 식을 매개변수로 받는 함수 → 부르는 곳의 문자열
      const fn = /(?:function\s+(\w+)\s*\(([^)]*)|const\s+(\w+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*(?::[^=]*)?=>)/.exec(lines[k]!);
      if (fn && new RegExp(`(?:^|[(,\\s])${e}\\s*[:,)]`).test(fn[2] ?? fn[4] ?? '')) return callers(fn[1] ?? fn[3]!, pos, depth);
      // 같은 파일의 const·let
      const def = new RegExp(`\\b(?:const|let)\\s+${e}\\s*(?::[^=]+)?=\\s*(.+?);?\\s*$`).exec(lines[k]!);
      if (def) return values(def[1]!, file, k, pos, depth + 1);
    }
  }
  if (pos === 'tail') return ['1'];
  unresolved.push(`${file}:${at + 1} ${e}`);
  return [];
}
/** name(ctx, '…')·name('…') 꼴로 부르는 곳의 물음 글 */
function callers(name: string, pos: Pos, depth: number): string[] {
  const re = new RegExp(`\\b${name}\\(\\s*(?:(?:ctx|c)\\s*,\\s*)?('(?:\\\\.|[^'\\\\])*'|\`[^\`]*\`)`, 'g');
  const out: string[] = [];
  for (const [file, lines] of SOURCES) lines.forEach((line, k) => {
    for (const m of line.matchAll(re)) out.push(...leafValues(m[1]!, file, k, pos, depth + 1));
  });
  return out;
}
/** 템플릿 본문을 대표 값으로 채운 글들(식마다 값을 하나씩 돌려 모든 값이 한 번 이상 나오게) */
function fill(body: string, file: string, at: number, pos: Pos | null, depth: number): string[] {
  const toks = tokens(body);
  let prefix = '';
  const slots: string[][] = [];
  for (const t of toks) {
    if ('lit' in t) {
      prefix += t.lit;
      continue;
    }
    const own: Pos =
      prefix.lastIndexOf('<') > prefix.lastIndexOf('>') ? 'tail' : !prefix.includes('[') ? 'front' : prefix.lastIndexOf('[') > prefix.lastIndexOf(']') ? 'opts' : 'tail';
    const v = values(t.expr, file, at, pos && pos !== 'front' ? pos : own, depth);
    slots.push(v.length ? v : ['?']);
    prefix += slots[slots.length - 1]![0];
  }
  const out = new Set<string>();
  for (let k = 0; k < Math.max(1, ...slots.map((s) => s.length)); k++) {
    let s = 0;
    out.add(
      toks
        .map((t) => {
          if ('lit' in t) return t.lit;
          const v = slots[s++]!;
          return v[k % v.length]!;
        })
        .join(''),
    );
  }
  return [...out];
}

/** 소스의 물음 꼴(자리 · 템플릿 본문 · 채운 물음) */
const FORMS = [...SOURCES].flatMap(([file, lines]) =>
  lines.flatMap((line, k) =>
    templatesIn(line)
      .filter((b) => /[가-힣]/.test(b) && b.includes('${') && /\[[^\]`]*\([A-Z]{1,3}\)/.test(b))
      .map((body) => ({ at: `${file}:${k + 1}`, body, asks: fill(body, file, k, null, 0) })),
  ),
);

/** 번역층이 보는 요소 흉내: 명령행(LOG 안), kw가 있으면 옵션 목록을 적어 둔 물음 줄 요소(data-kw) */
const elOf = (kw?: string): Element =>
  ({
    tagName: 'DIV',
    closest: (sel: string) => (sel.includes('.cmd-prompt') ? ({} as Element) : null),
    getAttribute: (n: string) => (n === 'data-kw' && kw !== undefined ? kw : null),
    hasAttribute: (n: string) => n === 'data-kw' && kw !== undefined,
  }) as unknown as Element;
/** i18n.ts value()와 같은 길: 도면 글 지킴 고리 → 없으면 거꾸로 찾기 + 통째 번역(앞뒤 빈칸 지킴) */
const shownText = (text: string, l: string, el: Element): string => {
  const g = fileGuard.fn!(text, l, el);
  if (g !== undefined) return g;
  const source = sourceMessage(text);
  const r = translate(source, l);
  return r === source ? source : (source.match(/^\s*/)?.[0] ?? '') + r + (source.match(/\s*$/)?.[0] ?? '');
};
/** 물음 줄(commandline.ts setPrompt와 같은 마디: 앞 글 「… [」·옵션·「/」·「]」 뒤 글 — 옵션은 data-kw 없는 span) */
const promptLine = (q: string, l: string): string => {
  const m = /^(.*?)\[(.*?)\](.*)$/.exec(q);
  if (!m) return shownText(q, l, elOf());
  const parts = m[2]!.split('/');
  const kw = parts.map(unmark).join('/');
  const nodes = balanceMarks([m[1] + '[', ...parts.flatMap((p, i) => (i < parts.length - 1 ? [p, '/'] : [p])), ']' + m[3]]);
  return nodes.map((t, i) => shownText(t, l, elOf(i % 2 === 0 ? kw : undefined))).join('');
};
/** 친 좌표(도면 글 표시 — app.ts 기록 줄) */
const TYPED = '⁨10,20⁩';
/** uiText로 끼운 낱말(\u0001…\u0002)을 그 화면 언어 번역으로(물음을 만드는 때의 언어 — i18n-text.ts uiText와 같은 translate) */
const inLang = (q: string, l: string): string => q.replace(/\u0001([^\u0002]*)\u0002/g, (_m, s: string) => translate(s, l));

describe('코드가 낱말을 끼워 만드는 물음(338차)', () => {
  it('(가) 소스의 물음 꼴을 모두 뽑고, 앞 조각·옵션 자리에 끼우는 식은 모두 대표 값이 있다(FILL 표 — 값을 옮겨 적은 소스 글이 그대로)', () => {
    // 338차 grep(한 줄 템플릿 · 한글 · ${ · 「[…(X)」): 140
    expect(FORMS.length).toBeGreaterThan(130);
    expect(unresolved).toEqual([]);
    for (const [key, f] of Object.entries(FILL)) {
      const src = SOURCES.get(key.split('|')[0]!)!.join('\n');
      for (const p of f.pins) expect(src.includes(p), `${key} ${p}`).toBe(true);
    }
  });

  it('(나) 고친 꼴 — 진짜 명령행(번역층·도면 글 지킴)에서 네 언어 물음 줄·기록 줄·휴대폰 카드 물음에 한글 0, 한국어 화면은 원문 그대로', async () => {
    // 고치기 전: PEDIT 스플라인 점 걷기 둘은 앞 조각이 틀 「{0} 지정 또는 [」·「{0} 또는 [」에 잡혀 물음 줄부터 한국어(「Specify 새 위치 or [」),
    // 나머지 셋은 물음 줄은 옮겨지나 기록 줄·휴대폰 카드가 통째 열쇠 없이 틀에 잡혀 끼운 낱말(인치)·옵션(현재 제외(X))·문장이 한국어로 남음
    const asks = [
      '새 위치 지정 또는 [다음(N)/이전(P)/점 선택(S)/종료(X)] <다음>:',
      '새 가중치 입력(현재 = 1.0000) 또는 [다음(N)/이전(P)/점 선택(S)/종료(X)] <다음>:',
      '플롯 축척 입력 (출력 인치=도면 단위)또는 [맞춤⁠⁠(F)] <맞춤⁠⁠>:',
      '뷰포트 지정 [전체(A)/선택(S)/현재(C)/현재 제외(X)] <현재>:',
      `${DRAWING}이(가) 이미 있습니다.  축척을 재정의하시겠습니까? [예(Y)/아니오(N)] <예>:`,
      // TCASE 기본값(모드 이름표 「문장 대소문자」 — 옵션 이름 「문장」과 달라 틀 {0}에 한국어로 남았다): 이제 express-text.ts가 uiText로 화면 언어로 끼운다
      '대소문자 선택 [문장(S)/소문자(L)/대문자(U)/제목(T)/대소문자 전환(G)] <\u0001문장 대소문자\u0002>:',
    ];
    // 모두 소스의 물음 꼴에서 채운 물음이다
    const made = new Set(FORMS.flatMap((f) => f.asks));
    expect(asks.filter((q) => !made.has(q))).toEqual([]);
    const bad: string[] = [];
    for (const l of LANGS) {
      for (const { shown, rec, mobile } of await render(l, asks.map((q) => inLang(q, l)))) {
        if (hangul(shown)) bad.push(`${l} 물음 줄: ${shown}`);
        if (hangul(rec)) bad.push(`${l} 기록 줄: ${rec}`);
        if (hangul(mobile)) bad.push(`${l} 휴대폰: ${mobile}`);
      }
    }
    for (const { q, shown, rec, mobile } of await render('ko', asks.map((a) => inLang(a, 'ko')))) {
      if (shown !== unmark(q)) bad.push(`ko 물음 줄: ${shown}`);
      if (rec !== `${unmark(q)} 10,20`) bad.push(`ko 기록 줄: ${rec}`);
      if (mobile !== unmark(q)) bad.push(`ko 휴대폰: ${mobile}`);
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });

  it('(다) 꼴마다 대표 값으로 만든 물음 줄·기록 줄·휴대폰 카드 물음이 네 언어 한글 0, 한국어는 원문 그대로(도면 글 자리는 옮기지 않음)', () => {
    installFileGuard({ docs: [{ doc: createNewDocument('metric') }] });
    const bad = new Map<string, string[]>();
    let asks = 0;
    for (const f of FORMS) {
      for (const ask of f.asks) {
        asks++;
        const q = inLang(ask, 'ko');
        const plain = unmark(q);
        const add = (s: string) => bad.set(`${f.at} ${plain}`, [...(bad.get(`${f.at} ${plain}`) ?? []), s]);
        if (unmark(promptLine(q, 'ko')) !== plain) add(`ko 물음 줄: ${promptLine(q, 'ko')}`);
        if (unmark(shownText(`${q} ${TYPED}`, 'ko', elOf())) !== `${plain} 10,20`) add('ko 기록 줄');
        for (const l of LANGS) {
          const ql = inLang(ask, l);
          const p = promptLine(ql, l);
          const r = shownText(`${ql} ${TYPED}`, l, elOf());
          const mv = shownText(ql, l, elOf());
          if (hangul(p)) add(`${l} 물음 줄: ${p}`);
          if (hangul(r)) add(`${l} 기록 줄: ${r}`);
          if (hangul(mv)) add(`${l} 휴대폰: ${mv}`);
        }
      }
    }
    const report = [`꼴 ${FORMS.length} · 채운 물음 ${asks} · 한글이 남는 물음 ${bad.size}`, ...[...bad].map(([k, v]) => `${k}\n    ${v.join('\n    ')}`)].join('\n');
    expect([...bad.keys()], report).toEqual([]);
  });
});
