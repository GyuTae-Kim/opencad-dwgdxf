/**
 * 334차: 333차가 보고 둔 다국어 꼴 셋(사전·번역층·진짜 명령행, 빌드 없이).
 * (가) 물음 줄(commandline.ts setPrompt)의 끝 마디 「]:」은 한글이 없어 번역층이 거꾸로 찾기(sourceMessage — 등록된 사전의 값 → 열쇠)로
 *     en 값이 「]:」인 열쇠 「] 입력:」을 되찾아 ja 「] を入力:」·de 「] ein:」, 한국어 화면에서도 「] 입력:」(언어를 바꾼 뒤 — en 사전이 등록됨)으로 보였다.
 *     zh 사전만이면 「]:」. 기록 줄(331차 조각 길)은 「]」 + 그 언어 쌍점이라 같은 물음의 두 줄 꼬리가 갈렸다. 기본값 없는 「…[…]:」 물음 207의
 *     값 끝 꼴 다수(jq — en 「]:」 207, ja 「]:」 198·「]：」 9, zh 「]：」 159·「]:」 44, de 「]:」 169·「… [?] ein:」 꼴 38)대로 끝 마디를
 *     「]」 + 그 언어 쌍점(한국어는 원문)으로 정한다. 휴대폰 카드 물음(.mv-prompt — 친 입력 없는 통째 한 마디)도 통째 열쇠가 없으면 같은 조각 번역.
 * (나) PEDIT 단추 칩(물음 줄 .kw·휴대폰 .mv-chip·바로 가기 메뉴)은 물음의 옵션 조각 「이름(글자)」 그대로라 물음 옵션 값과 같은 열쇠다.
 *     칩에 보이지 않는 홀로 쓴 이름 열쇠(kwsOf label — 한국어로 친 이름 견주기 몫) 가운데 PEDIT 목록만 쓰는 둘(비곡선화·선종류생성)을
 *     같은 사전의 옵션 값으로(zh 非曲面 「곡면 아님」 오역 포함 — 한 기능 한 낱말). 다른 명령·화면이 함께 쓰는 이름(반전·닫기·결합·스플라인·명령 취소)은 그대로.
 * (다) 333차 앞 조각 셋 뒤로 결과가 쓰이지 않는 -VPORTS 틀 둘(「{0} 뷰포트 구성의 이름 입력 또는 [」·「… [?]:」 — 채우는 곳은 vports.ts 한 줄의 동사 셋)을 지웠다.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installLocalization } from '../src/app/i18n';
import { installFileGuard } from '../src/app/fileguard';
import { CommandLine } from '../src/app/commandline';
import { promptParts } from '../src/app/ui/mobileview';
import { createNewDocument } from '../src/core/newdoc';
// 네 사전을 모두 등록한다(언어를 바꾼 뒤의 앱 꼴 — 거꾸로 찾기가 모든 등록 사전의 값을 본다)
import '../site/i18n.mjs';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

const LANGS = ['en', 'ja', 'zh-CN', 'de'] as const;
type Lang = (typeof LANGS)[number];
const hangul = (s: string): number => s.match(/[가-힣]/g)?.length ?? 0;
const load = (lang: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../site/locales/${lang}.json`, import.meta.url), 'utf8'));
const dict = Object.fromEntries(LANGS.map((l) => [l, load(l)])) as Record<Lang, Record<string, string>>;
/** 옵션 목록 「[이름(글자)/…]」의 항목 */
const optsOf = (s: string): string[] => /\[([^[\]]*)\]/.exec(s)![1]!.split('/');

/** 그 언어 사전에서 기본값 없는 「…[…]:」 물음 값의 끝 「]」 + 쌍점 다수 꼴 */
const tailOf = (l: Lang): string => {
  const ends = Object.keys(dict[l])
    .filter((k) => /\[[^\]]*\]:$/.test(k))
    .map((k) => dict[l][k]!);
  return ends.filter((v) => v.endsWith(']：')).length > ends.filter((v) => v.endsWith(']:')).length ? ']：' : ']:';
};

/** modify2-pedit.ts 250·251줄 목록(3D·2D × 닫힘·열림 — [글자, 이름]) */
const P3: [string, string][] = [['E', '정점 편집'], ['S', '스플라인 곡선'], ['D', '비곡선화'], ['R', '반전'], ['U', '명령 취소']];
const P2: [string, string][] = [['J', '결합'], ['W', '폭'], ['E', '정점 편집'], ['F', '맞춤'], ['S', '스플라인'], ['D', '비곡선화'], ['L', '선종류생성'], ['R', '반전'], ['U', '명령 취소']];
const LISTS = [P3, P2].flatMap((rest) => [['C', '닫기'], ['O', '열기']].map((c) => [c as [string, string], ...rest]));
const PEDIT = LISTS.map((list) => `옵션 입력 [${list.map(([k, l]) => `${l}(${k})`).join('/')}]:`);
const VPORTS = ['저장할', '복원할', '삭제할'].map((v) => `${v} 뷰포트 구성의 이름 입력 또는 [?]:`);
/** 통째 열쇠가 없는 「…]:」 물음(331차 셈 11): 양쪽(B) 둘·-RENAME·표 셀 정렬·VPORTS 셋·PEDIT 넷 */
const ASKS = [
  '통과점 지정 또는 [양쪽(B)]:',
  '간격띄우기할 면의 점 지정 또는 [양쪽(B)]:',
  '이름을 바꿀 객체 유형 입력 [블록(B)/치수 스타일(D)/도면층(LA)/선종류(LT)/문자 스타일(S)/배치(L)]:',
  '정렬 입력 [맨 위 왼쪽(TL)/맨 위 중심(TC)/맨 위 오른쪽(TR)/중간 왼쪽(ML)/중간 중심(MC)/중간 오른쪽(MR)/맨 아래 왼쪽(BL)/맨 아래 중심(BC)/맨 아래 오른쪽(BR)/스타일 따름(S)]:',
  ...VPORTS,
  ...PEDIT,
];

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

/** 한 언어 화면에서 물음마다 물음 줄·기록 줄(물음 + 친 입력)·휴대폰 카드 물음을 진짜 번역층으로 옮긴 글 */
async function render(l: Lang | 'ko'): Promise<{ q: string; shown: string; rec: string; mobile: string; input: string }[]> {
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
  const out: { q: string; shown: string; rec: string; mobile: string; input: string }[] = [];
  for (const q of ASKS) {
    // 친 입력: 이름은 도면 글 표시(app.ts promptOf), 옵션은 친 글자 그대로
    const input = VPORTS.includes(q) ? 'A' : 'B';
    cmd.setPrompt(q);
    cmd.print(`${q} ${VPORTS.includes(q) ? '⁨A⁩' : 'B'}`);
    card.replaceChildren(Object.assign(document.createElement('div'), { className: 'mv-prompt', textContent: q }));
    await quiet(app);
    out.push({ q, shown: prompt.textContent!, rec: document.querySelector('.cmd-history')!.lastElementChild!.textContent!, mobile: card.textContent!, input });
  }
  dispose();
  dispose = undefined;
  vi.unstubAllGlobals();
  dom.window.close();
  return out;
}

describe('333차가 보고 둔 다국어 꼴 셋 — 물음 줄 끝 마디·PEDIT 이름 열쇠·VPORTS 틀(334차)', () => {
  it('(가) 기본값 없는 「…[…]:」 물음 값의 끝 꼴 다수 — en·ja·de 「]:」, zh 「]：」', () => {
    // 207(334차 고치기 전 jq) − 지운 VPORTS 틀 「… [?]:」 하나 = 206(틀 9 포함) — 지금 en 「]:」 206, ja 197·「]：」 9, zh 「]：」 158·「]:」 44, de 「]:」 169
    for (const l of LANGS) expect(Object.keys(dict[l]).filter((k) => /\[[^\]]*\]:$/.test(k)).length, l).toBe(206);
    expect(LANGS.map(tailOf)).toEqual([']:', ']:', ']：', ']:']);
    // 거꾸로 찾기가 「]:」을 되찾던 열쇠(en 값이 「]:」) — 뒤 글이 있는 끝 조각
    expect(Object.keys(dict.en).filter((k) => dict.en[k] === ']:')).toEqual(['] 지정:', '] 입력:']);
  });

  it('(가) 물음 줄·기록 줄·휴대폰 카드 물음이 네 언어에서 한글 0·같은 문장·다수 끝 꼴, 한국어 화면은 원문 그대로', async () => {
    expect(ASKS.length).toBe(11);
    for (const q of ASKS) expect(dict.en[q], q).toBeUndefined();
    const bad: string[] = [];
    for (const l of LANGS) {
      for (const { q, shown, rec, mobile, input } of await render(l)) {
        if (hangul(shown) || !shown.endsWith(tailOf(l))) bad.push(`${l} 물음 줄: ${shown}`);
        // 343차: 전각 쌍점 뒤에는 친 입력 앞 빈칸이 없다(fileguard.ts glue — 같은 사전 다수 꼴)
        const want = `${shown}${shown.endsWith('：') ? '' : ' '}${input}`;
        if (rec !== want) bad.push(`${l} 기록 줄: ${rec} ≠ ${want}`);
        if (mobile !== shown) bad.push(`${l} 휴대폰: ${mobile} ≠ ${shown} (${q})`);
      }
    }
    // 한국어 화면(다른 언어 사전이 등록된 뒤 — 언어를 바꾸고 돌아온 꼴): 원문 그대로, 끝 마디에 「입력」이 붙지 않는다
    for (const { q, shown, rec, mobile, input } of await render('ko')) {
      if (shown !== q) bad.push(`ko 물음 줄: ${shown}`);
      if (rec !== `${q} ${input}`) bad.push(`ko 기록 줄: ${rec}`);
      if (mobile !== q) bad.push(`ko 휴대폰: ${mobile}`);
    }
    expect(bad, bad.slice(0, 8).join('\n')).toEqual([]);
  });

  it('(나) PEDIT 단추 칩은 물음의 옵션 조각 그대로 — PEDIT만 쓰는 이름 열쇠 둘은 같은 사전의 옵션 값(글자 뺌)', () => {
    // 휴대폰 카드 칩(promptParts) = 물음 옵션 조각(물음 줄 .kw 마디·바로 가기 메뉴 ctxmenu.ts `${label}(${key})`도 같은 조각 — 코드)
    for (const q of PEDIT) expect(promptParts(q).keywords.map((k) => k.label), q).toEqual(optsOf(q));
    const strip = (v: string): string => v.replace(/\s*\([A-Z]+\)$/, '');
    for (const l of LANGS)
      for (const [k, w] of [['D', '비곡선화'], ['L', '선종류생성']] as const) expect(dict[l][w], `${l} ${w}`).toBe(strip(dict[l][`${w}(${k})`]!));
    expect(LANGS.map((l) => dict[l]['비곡선화'])).toEqual(['Decurve', '非曲線化', '非曲线化', 'Entkurven']);
    expect(Object.values(dict['zh-CN'])).not.toContain('非曲面');
  });

  it('(다) 결과가 쓰이지 않는 -VPORTS 틀 둘은 네 사전에 없다 — 앞 조각 셋은 그대로', () => {
    for (const l of LANGS) {
      expect(Object.keys(dict[l]).filter((k) => k.includes('{0} 뷰포트 구성의 이름 입력')), l).toEqual([]);
      for (const q of VPORTS) expect(hangul(dict[l][q.slice(0, q.indexOf('[') + 1)] ?? '가'), `${l} ${q}`).toBe(0);
    }
  });
});
