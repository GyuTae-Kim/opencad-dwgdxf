/**
 * 335차: 334차가 보고 둔 다국어 꼴 둘(사전·번역층·진짜 명령행, 빌드 없이).
 * (가) 번역층(i18n.ts value)은 도면 글 지킴(fileGuard.fn) 다음에 거꾸로 찾기(sourceMessage — 등록된 모든 사전의 값 → 열쇠, 뒤에 등록·뒤에 둔 열쇠가 이김)로
 *     원문을 되찾는다. 사전 열쇠는 모두 한글이나 {n}을 품어(공용 규칙 9번) 글자 없는 마디는 옮길 것이 없는데, 어느 사전 값과 같으면 그 열쇠의 번역으로 바뀌었다
 *     (「]:」 → 「] 입력:」 → ja 「] を入力:」·de 「] ein:」·한국어 화면 「] 입력:」, 「{0}」 → 「{0}할」). 334차는 물음 줄 끝 마디(data-kw 요소)만 막았다 —
 *     글자(모든 문자 체계)가 없는 마디는 어느 요소·속성에서나 원문 그대로(fileguard.ts — 규칙 하나).
 *     라틴 한두 자 값(「On」·「No」 꼴)은 막지 않는다: 언어 쪽 HTML은 빌드가 몸 글을 옮겨 두어 번역층이 옮긴 글을 거꾸로 찾기로 원문에 되돌려야 언어를 바꿀 수 있다.
 * (나) 통째 열쇠가 있는 기본값 없는 「…[…]:」 물음은 기록 줄·휴대폰 카드가 통째 값을, 물음 줄이 조각(끝 마디 — 그 사전 다수 꼴, 334차 closeTail)을 쓴다.
 *     ja 통째 값 아홉이 「]：」로 끝나(다수 「]:」 197) 두 줄 꼬리가 갈렸다 — 값 끝만 「]:」로. zh 「]:」 44·de 「… [?] ein:」 37은 30곳이 넘어 보고 둠(셈 고정).
 * 336차: zh 통째 값 44의 끝 「]:」 → 다수 꼴 「]：」(이번 차수만 한 언어 44곳 — 값 끝 한 글자). 끝 꼴은 언어마다 하나(en·ja·de 「]:」·zh 「]：」)이고
 *     어긋나는 것은 아직 둔 것 목록(de 동사가 끝에 오는 문장 37·zh 옵션 괄호 없는 값 4)과 같아야 한다.
 *     ja 일곱의 전각 옵션 괄호 「（B）」 → 같은 사전 다수 꼴 반각(옵션 조각 값 — 물음 줄 단추·휴대폰 칩과 같게).
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installLocalization } from '../src/app/i18n';
import { installFileGuard } from '../src/app/fileguard';
import { CommandLine } from '../src/app/commandline';
import { createNewDocument } from '../src/core/newdoc';
// 네 사전을 모두 등록한다(언어를 바꾼 뒤의 앱 꼴 — 거꾸로 찾기가 모든 등록 사전의 값을 본다)
import '../site/i18n.mjs';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

const LANGS = ['en', 'ja', 'zh-CN', 'de'] as const;
type Lang = (typeof LANGS)[number];
const load = (lang: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../site/locales/${lang}.json`, import.meta.url), 'utf8'));
const dict = Object.fromEntries(LANGS.map((l) => [l, load(l)])) as Record<Lang, Record<string, string>>;
/** 값에 글자(모든 문자 체계)가 없는 열쇠 — 334차 보고의 jq 꼴(`^[^A-Za-z가-힣ぁ-んァ-ン一-龥]*$`)과 같은 수 */
const letterless = (l: Lang): string[] => Object.keys(dict[l]).filter((k) => /^\P{L}*$/u.test(dict[l][k]!));
/** 사전 어딘가의 글자 없는 값(거꾸로 찾기의 표적) */
const VALUES = [...new Set(LANGS.flatMap((l) => letterless(l).map((k) => dict[l][k]!)))];
/** 지금은 사전 값이 아닌 글자 없는 마디(나눔·괄호·계산기 단추 util2-misc.ts — 앞으로 같은 값이 생기면 표적) */
const SYMBOLS = [': ', ' · ', '(', ')', '%', '[', ']', '12.5'];
/** 기본값 없는 「…[…]:」 물음 열쇠 */
const asks = (l: Lang): string[] => Object.keys(dict[l]).filter((k) => /\[[^\]]*\]:$/.test(k));
/** ja 통째 값이 「]：」로 끝나던 아홉(335차 고치기 전 jq) 가운데 틀이 아닌 여섯 — 명령이 그대로 묻는 글 */
const JA_ASKS = [
  '가져올 사용자 정의 페이지 설정 입력 또는 [?]:',
  '객체 선택 또는 [설정(S)]:',
  '객체 선택 또는 [설정(SE)]:',
  '객체 선택 또는 [연관해제됨(D)]:',
  '객체 선택 또는 [이름(N)/설명(D)]:',
  '구성선 각도 입력 (0) 또는 [참조(R)]:',
];
/** 336차: 기본값 없는 「…[…]:」 통째 값의 끝 꼴 — 언어마다 하나(그 사전 다수 꼴 = 334차 물음 줄 끝 마디) */
const TAIL: Record<Lang, string> = { en: ']:', ja: ']:', 'zh-CN': ']：', de: ']:' };
/**
 * 끝 꼴이 다른 아직 둔 것(336차 jq — 사전 차례). zh: 옵션 괄호 없는 값 4(「指定起点角度或使用参数 (P)：」 꼴 — 끝 한 글자로는 물음 줄 조각 꼴이 되지 않음),
 * de: 동사가 끝에 오는 문장 37(「… oder [?] ein:」·「… an:」 꼴 — 문장을 다시 써야 함). 목록에 있는데 이제 같으면 실패한다.
 */
const KEEP: Record<Lang, string[]> = {
  en: [],
  ja: [],
  'zh-CN': ['시작 각도 지정 또는 [매개변수(P)]:', '시작 매개변수 지정 또는 [각도(A)]:', '여러 줄 선택 또는 [명령 취소(U)]:', '이동점 지정 또는 [종료(X)]:'],
  de: [
    'UCS 이름 입력 또는 [?]:',
    'UCS를 저장할 이름 입력 또는 [?]:',
    '구성선 각도 입력 (0) 또는 [참조(R)]:',
    '그룹 선택 또는 [이름(N)]:',
    '기준 치수 선택 또는 [간격띄우기(O)]:',
    '기준선으로 첫 번째 치수보조선 원점 지정 또는 [간격띄우기(O)]:',
    '끊기선의 첫 번째 점 지정 또는 [블록(B)/크기(S)/확장(E)]:',
    '끝 매개변수 지정 또는 [각도(A)/사이각(I)]:',
    '끝 접선 지정 또는 [시스템 기본값(S)]:',
    '끝점 지정 또는 [시작점(S)]:',
    '다른 축으로 거리를 지정 또는 [회전(R)]:',
    '다음 점 입력 또는 [{0}]:',
    '대상 도면층에 있는 객체 선택 또는 [이름(N)]:',
    '두 번째 끊기점 지정 또는 [첫 번째 점(F)]:',
    '두 번째 점 지정 또는 [맞춤⁠(F)]:',
    '두 번째 점 지정 또는 [보이지 않음(I)]:',
    '등각원의 반지름 지정 또는 [지름(D)]:',
    '배열에서 대체할 항목 선택 또는 [원본 객체(S)]:',
    '배열의 중심점 지정 또는 [기준(B)]:',
    '배열의 중심점 지정 또는 [기준점(B)/회전축(A)]:',
    '변경점 지정 또는 [특성(P)]:',
    '변경할 특성 입력 [색상(C)/도면층(LA)/선종류(LT)/선종류 축척(S)/선가중치(LW)/두께(T)/투명도(TR)]:',
    '변수 이름 입력 또는 [?]:',
    '삽입 기준점 지정 또는 [주석(A)]:',
    '삽입점 지정 또는 [기준점(B)/축척(S)/X/Y/Z/회전(R)]:',
    '삽입점 지정 또는 [기준점(B)/축척(S)/X/Y/회전(R)]:',
    '삽입점 지정 또는 [축척(S)/회전(R)]:',
    '새 치수 스타일의 이름 입력 또는 [?]:',
    '색상 이름 또는 번호(1-255) 입력 또는 [트루컬러(T)/색상표(CO)]:',
    '색상 이름 또는 번호(1-255) 입력 또는 [트루컬러(T)]:',
    '스케치 지정 또는 [유형(T)/증분(I)/공차(L)]:',
    '시작 매개변수 지정 또는 [각도(A)]:',
    '점 지정 또는 [수평(H)/수직(V)/각도(A)/이등분(B)/간격띄우기(O)]:',
    '접선 벡터의 첫 번째 점 지정 또는 [일반(N)]:',
    '치수 호 선 위치 지정 또는 [여러 줄 문자(M)/문자(T)/각도(A)]:',
    '치수선 위치 지정 또는 [여러 줄 문자(M)/문자(T)/각도(A)]:',
    '폴리선 선택 또는 [다중(M)]:',
  ],
};
/** zh 통째 값이 「]:」로 끝나던 44(336차 고치기 전 jq) 가운데 진짜 명령행으로 보는 여섯(틀 아님) */
const ZH_ASKS = [
  '단 높이 지정 또는 [종료(X)]:',
  '다음 점 지정 또는 [호(A)/닫기(C)/반폭(H)/길이(L)/명령 취소(U)/폭(W)]:',
  '두 번째 치수보조선 원점 지정 또는 [명령 취소(U)]:',
  '치수선 위치 지정 또는 [여러 줄 문자(M)/문자(T)/각도(A)]:',
  '폴리선 선택 또는 [다중(M)]:',
  '뷰포트 뷰 잠금 [켜기(ON)/끄기(OFF)]:',
];
/** 값의 옵션 목록(마지막 「[」부터) */
const optsPart = (v: string): string => v.slice(v.lastIndexOf('['));

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
  mo.observe(el, { subtree: true, childList: true, characterData: true, attributes: true });
  const end = Date.now() + 2000;
  for (let calm = 0; calm < 2 && Date.now() < end; ) {
    const before = seen;
    await new Promise((r) => setTimeout(r, 0));
    calm = seen === before ? calm + 1 : 0;
  }
  mo.disconnect();
};

/** 한 언어 화면(네 사전 등록 · 도면 글 지킴 설치 — 편집기를 연 앱 꼴)을 열고 fn을 부른다 */
async function page<T>(l: Lang | 'ko', fn: (app: HTMLElement) => Promise<T>): Promise<T> {
  const dom = new JSDOM(
    '<!doctype html><html><head><title>OpenCAD</title></head><body><div id="app"><header class="titlebar"></header><span class="plain"></span>' +
      '<div class="cmd-history"><div class="line"></div></div><div class="mv-res"></div><button class="tip"></button><div id="cmd"></div><div class="mv-card"></div></div></body></html>',
    { url: `https://gyutae-kim.github.io/opencad-dwgdxf/${l === 'ko' ? '' : `${l}/`}` },
  );
  for (const name of ['window', 'document', 'Node', 'Element', 'HTMLAnchorElement', 'MutationObserver', 'location', 'history', 'localStorage', 'CustomEvent'])
    vi.stubGlobal(name, (dom.window as unknown as Record<string, unknown>)[name]);
  installFileGuard({ docs: [{ doc: createNewDocument('metric') }] });
  dispose = await installLocalization(document.getElementById('app')!);
  const out = await fn(document.getElementById('app')!);
  dispose();
  dispose = undefined;
  vi.unstubAllGlobals();
  dom.window.close();
  return out;
}

describe('334차가 보고 둔 다국어 꼴 둘 — 글자 없는 마디의 거꾸로 찾기·통째 물음 끝 꼴(335차)', () => {
  it('(가) 글자 없는 사전 값 — 틀 값 밖은 물음 끝 조각 「]:」(en)·「]：」(zh)뿐', () => {
    // 335차 jq: en 9 · ja 1 · zh-CN 7 · de 6(나머지는 「{0}」·「{0} {1}」·「{0}°」·「{0} · {1}」·「{0} — {1} {2}」·「] <{0}>:」 꼴 틀 값)
    expect(LANGS.map((l) => letterless(l).length)).toEqual([9, 1, 7, 6]);
    expect(LANGS.map((l) => letterless(l).filter((k) => !/\{\d+\}/.test(dict[l][k]!)).map((k) => `${k} → ${dict[l][k]}`))).toEqual([
      ['] 지정: → ]:', '] 입력: → ]:'],
      [],
      ['] 지정: → ]：', '] 입력: → ]：'],
      [],
    ]);
  });

  it('(가) 글자 없는 마디는 다섯 언어 화면 어느 요소·속성에서나 원문 그대로', async () => {
    const texts = [...VALUES, ...SYMBOLS];
    expect(texts.length).toBe(17);
    const bad: string[] = [];
    for (const l of ['ko', ...LANGS] as const) {
      await page(l, async (app) => {
        // 번역층 밖 칸(.plain)·명령행 기록 줄 마디(.cmd-history — data-kw 없음)·휴대폰 결과(.mv-res)·title 속성
        const plain = app.querySelector('.plain')!;
        const line = app.querySelector('.line')!;
        const res = app.querySelector('.mv-res')!;
        const tip = app.querySelector('.tip')!;
        for (const v of texts) {
          plain.textContent = v;
          line.textContent = v;
          res.textContent = v;
          tip.setAttribute('title', v);
          await quiet(app);
          for (const [where, got] of [['칸', plain.textContent], ['기록 줄', line.textContent], ['휴대폰', res.textContent], ['title', tip.getAttribute('title')]] as const)
            if (got !== v) bad.push(`${l} ${where}: ${JSON.stringify(v)} → ${JSON.stringify(got)}`);
        }
      });
    }
    expect(bad, bad.slice(0, 10).join('\n')).toEqual([]);
  });

  it('(나) 기본값 없는 「…[…]:」 통째 값의 끝 — ja는 다수 꼴 「]:」 하나, zh는 「]：」 202(336차), de 「… ein:」 37은 보고 둠', () => {
    for (const l of LANGS) expect(asks(l).length, l).toBe(206);
    const ends = (l: Lang, tail: string): number => asks(l).filter((k) => dict[l][k]!.endsWith(tail)).length;
    expect([ends('ja', ']:'), ends('ja', ']：')]).toEqual([206, 0]);
    // 336차: zh 「]:」 44 → 다수 꼴 「]：」(158 → 202 — 나머지 4는 옵션 괄호 없는 값, KEEP). de 다수 「]:」 169 밖의 동사 끝 꼴 「… oder [?] ein:」 37은 보고 둠
    expect([ends('zh-CN', ']:'), ends('zh-CN', ']：')]).toEqual([0, 202]);
    expect(asks('de').length - ends('de', ']:')).toBe(37);
    for (const q of JA_ASKS) expect(dict.ja[q], q).toMatch(/\]:$/);
    for (const q of ZH_ASKS) expect(dict['zh-CN'][q], q).toMatch(/\]：$/);
  });

  it('(나) 끝 꼴은 언어마다 하나 — en·ja·de 「]:」·zh 「]：」, 어긋나는 것은 아직 둔 것 목록(de 37·zh 4)뿐(336차)', () => {
    expect(LANGS.map((l) => KEEP[l].length)).toEqual([0, 0, 4, 37]);
    for (const l of LANGS) expect(asks(l).filter((k) => !dict[l][k]!.endsWith(TAIL[l])), l).toEqual(KEEP[l]);
  });

  it('(다) ja 통째 물음 값의 옵션 괄호는 같은 사전 다수 꼴 반각 — 전각 「（」「）」 0(336차)', () => {
    // 336차 jq(고치기 전): ja 「…[…]:」 값 206의 옵션 목록에 반각 「(」 183 · 전각 「（」 7(335차 아홉 가운데 일곱) — 옵션 조각 값(両側(B)·設定(S) 등)은 모두 반각
    expect(asks('ja').filter((k) => /[（）]/.test(optsPart(dict.ja[k]!)))).toEqual([]);
    expect(asks('ja').filter((k) => optsPart(dict.ja[k]!).includes('(')).length).toBe(190);
    for (const k of ['양쪽(B)', '종료(X)', '설정(S)', '설정(SE)', '이름(N)', '설명(D)', '참조(R)']) expect(dict.ja[k], k).toMatch(/\([A-Z]+\)$/);
  });

  it('(나) ja 화면에서 통째 열쇠 물음의 물음 줄·기록 줄·휴대폰 카드 물음 꼬리가 같은 「]:」', async () => {
    const tail = (s: string): string => s.slice(s.lastIndexOf(']'));
    const bad: string[] = [];
    await page('ja', async (app) => {
      const cmd = new CommandLine(document.getElementById('cmd')!, { submit() {}, cancel() {}, suggest: () => [], keyword() {}, repeat() {} });
      const prompt = document.querySelector('.cmd-prompt')!;
      const card = app.querySelector('.mv-card')!;
      for (const q of JA_ASKS) {
        cmd.setPrompt(q);
        cmd.print(`${q} 1`);
        card.replaceChildren(Object.assign(document.createElement('div'), { className: 'mv-prompt', textContent: q }));
        await quiet(app);
        const shown = prompt.textContent!;
        // 명령행이 만든 기록 칸(머리의 .cmd-history는 (가)의 줄 마디 칸)
        const rec = document.getElementById('cmd')!.querySelector('.cmd-history')!.lastElementChild!.textContent!;
        const mobile = card.textContent!;
        if (tail(shown) !== ']:') bad.push(`물음 줄: ${shown}`);
        if (rec !== `${dict.ja[q]} 1` || tail(rec.slice(0, -2)) !== tail(shown)) bad.push(`기록 줄: ${rec} ↔ ${shown}`);
        if (mobile !== dict.ja[q] || tail(mobile) !== tail(shown)) bad.push(`휴대폰: ${mobile} ↔ ${shown}`);
        // 336차: 기록 줄·휴대폰 카드의 옵션 괄호도 물음 줄 단추(옵션 조각 값 — 반각)와 같은 꼴
        if (/[（）]/.test(optsPart(rec)) || /[（）]/.test(optsPart(mobile))) bad.push(`옵션 괄호: ${rec} · ${mobile}`);
      }
    });
    expect(bad, bad.join('\n')).toEqual([]);
  });

  it('(나) zh 화면에서 통째 열쇠 물음의 물음 줄·기록 줄·휴대폰 카드 물음 꼬리가 같은 「]：」(336차)', async () => {
    const tail = (s: string): string => s.slice(s.lastIndexOf(']'));
    const zh = dict['zh-CN'];
    const bad: string[] = [];
    await page('zh-CN', async (app) => {
      const cmd = new CommandLine(document.getElementById('cmd')!, { submit() {}, cancel() {}, suggest: () => [], keyword() {}, repeat() {} });
      const prompt = document.querySelector('.cmd-prompt')!;
      const card = app.querySelector('.mv-card')!;
      for (const q of ZH_ASKS) {
        cmd.setPrompt(q);
        cmd.print(`${q} 1`);
        card.replaceChildren(Object.assign(document.createElement('div'), { className: 'mv-prompt', textContent: q }));
        await quiet(app);
        const shown = prompt.textContent!;
        const rec = document.getElementById('cmd')!.querySelector('.cmd-history')!.lastElementChild!.textContent!;
        const mobile = card.textContent!;
        if (tail(shown) !== ']：') bad.push(`물음 줄: ${shown}`);
        // 343차: 전각 쌍점 뒤에는 친 입력 앞 빈칸이 없다(fileguard.ts glue — 같은 사전 다수 꼴): 기록 줄 = 통째 값 + 「1」
        if (rec !== `${zh[q]}1` || tail(rec.slice(0, -1)) !== tail(shown)) bad.push(`기록 줄: ${rec} ↔ ${shown}`);
        if (mobile !== zh[q] || tail(mobile) !== tail(shown)) bad.push(`휴대폰: ${mobile} ↔ ${shown}`);
      }
    });
    expect(bad, bad.join('\n')).toEqual([]);
  });
});
