/**
 * 330차: 명령행 기록 줄(물음 + 친 입력)의 한국어(329차에 보고 두 것 (1)).
 * - 명령행은 받은 입력을 「물음 + 빈칸 + 친 입력」 한 글 마디로 기록에 적는다(app.ts `${this.promptOf(r)} ${입력}` — 좌표·수·도면 글은 ft() 표시,
 *   옵션은 친 글 그대로). 번역층(fileguard.ts translateTail)은 기본값 꼬리 「<값>:」 뒤에 붙은 입력만 떼어 물음 통째 열쇠로 옮겼다.
 *   옵션 목록으로 끝나는 기본값 없는 물음 「… [높이(H)/…/열(C)]:」(사전 열쇠 207 — 330차 셈)과 「첫 번째 점 지정:」 꼴은 기록 줄 틀(「…]: {0}」)이
 *   있어야 옮겨져, 329차 MTEXT 하나 밖에는 다른 언어에서 줄 통째가 한국어로 남았다.
 * - 고친 길: 쌍점 + 빈칸 자리(뒤에서부터)에서 앞이 물음 통째 열쇠로 한국어 없이 옮겨지면 거기서 나누고, 뒤(친 입력)는 친 그대로 붙인다.
 * - 친 입력은 옮기지 않는다 — 옵션 이름 「높이」(사전 낱말)를 친 기록도 「높이」. 명령행이 옵션으로 받는 글은 옵션 글자와 한국어 원문 이름뿐이라
 *   (dashcmds-ask.ts keywordLabelIs) 옮긴 이름을 보이면 그 화면에서 다시 쳐도 받지 않는 글을 친 것처럼 보인다. 단추·메뉴·칩은 옵션 글자를 넘긴다.
 *   그래서 다른 언어에서 기록 줄에 남는 한글은 사람이 한국어를 친 그 입력뿐이다.
 * 진짜 명령행에 LINE·RECTANG·MTEXT를 쳐 본 기록 줄은 i18n-screens327-<언어>(332차에 언어마다 나눔 — 그리는 길은 i18n-screens327-shared)가 본다.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { translateTail } from '../src/app/fileguard';
import { unmark } from '../src/app/filetext';
import { translate } from '../site/i18n.mjs';

const LANGS = ['en', 'ja', 'zh-CN', 'de'] as const;
const hangul = (s: string): number => s.match(/[가-힣]/g)?.length ?? 0;
const load = (lang: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../site/locales/${lang}.json`, import.meta.url), 'utf8'));
const dict = Object.fromEntries(LANGS.map((l) => [l, load(l)])) as Record<(typeof LANGS)[number], Record<string, string>>;
/**
 * 옵션 목록으로 끝나는 기본값 없는 물음(네 언어 열쇠 집합은 같다 — check:i18n). 틀 열쇠(「{0} 또는 [{1}]:」 꼴 10 — 330차 셈)는 뺀다:
 * 실제 기록 줄은 틀을 채운 글이라 {0}을 담지 않는다(틀 글 그대로 친 줄은 틀 하나가 통째로 맞아 쌍점 꼴이 사전 값과 달라진다 — ja 「：」)
 */
const ASKED = Object.keys(dict.en).filter((k) => /\]:$/.test(k) && !/\{\d+\}/.test(k));
/** 기록 줄을 번역층처럼(fileguard.ts — 통째 번역이 한국어를 남기면 translateTail) 옮기고 도면 글 표시를 뗀다 */
const show = (line: string, l: string): string => unmark(translateTail(line, translate(line, l), (s) => translate(s, l)));
/** 물음의 첫 옵션 [이름, 글자](「… [높이(H)/…]:」 → 높이, H) */
const firstOption = (k: string): [string, string] | null => {
  const m = /^(.*?\S)\s*\(([^()]+)\)$/.exec(/\[([^[\]]*)\]:$/.exec(k)?.[1]?.split('/')[0] ?? '');
  return m ? [m[1]!, m[2]!] : null;
};
/** 기록 줄이 보일 글: 기록 줄 틀(「물음 {0}」 — 329차 MTEXT)이 있으면 그 틀, 없으면 물음 통째 번역 + 빈칸 + 친 입력 */
// 343차: 전각 쌍점 「：」 뒤에는 친 입력 앞 빈칸이 없다(fileguard.ts glue — 같은 사전 다수 꼴, 기록 줄 틀 「…]：{0}」과 같음)
const want = (k: string, input: string, l: (typeof LANGS)[number]): string =>
  dict[l][`${k} {0}`]?.replace('{0}', input) ?? `${translate(k, l)}${translate(k, l).endsWith('：') ? '' : ' '}${input}`;
const MTEXT = '반대 구석 지정 또는 [높이(H)/자리맞추기(J)/선 간격두기(L)/회전(R)/스타일(S)/폭(W)/열(C)]:';

describe('명령행 기록 줄 — 기본값 없는 물음 + 친 입력(330차)', () => {
  it('네 언어: 「…]:」 물음마다 좌표·옵션 글자를 친 기록 줄은 물음 통째 번역 + 친 입력 그대로(한글 0)', () => {
    // 330차 셈 197(「…]:」 열쇠 207에서 틀 열쇠 10을 뺀 것 — 영어 사전). 열쇠가 늘어도 깨지지 않게 하한만
    expect(ASKED.length).toBeGreaterThan(190);
    expect(ASKED).toContain(MTEXT);
    const left: string[] = [];
    for (const l of LANGS)
      for (const k of ASKED) {
        const opt = firstOption(k);
        for (const input of ['⁨10,20⁩', ...(opt ? [opt[1]] : [])]) {
          const out = show(`${k} ${input}`, l);
          if (out !== want(k, unmark(input), l) || hangul(out)) left.push(`${l}: ${out}`);
        }
      }
    expect(left.length, left.slice(0, 8).join('\n')).toBe(0);
  });

  it('친 입력은 옮기지 않는다 — 한국어 옵션 이름(사전 낱말)을 친 기록 줄은 그 입력만 한글로 남는다', () => {
    const left: string[] = [];
    let seen = 0;
    for (const l of LANGS)
      for (const k of ASKED) {
        const name = firstOption(k)?.[0];
        if (!name || !hangul(name)) continue;
        seen++;
        const out = show(`${k} ${name}`, l);
        if (out !== want(k, name, l) || hangul(out) !== hangul(name)) left.push(`${l}: ${out}`);
      }
    expect(seen).toBeGreaterThan(400);
    expect(left.length, left.slice(0, 8).join('\n')).toBe(0);
    // 「높이」는 사전 낱말(en Height)이지만 친 글이라 그대로
    expect(dict.en['높이']).toBe('Height');
    expect(show(`${MTEXT} 높이`, 'en')).toBe(`${dict.en[MTEXT]} 높이`);
  });

  it('쌍점만으로 끝나는 물음·쌍점이 든 도면 글·다섯째 언어(한국어 화면은 번역층이 그대로 둔다)', () => {
    // 「첫 번째 점 지정:」(LINE — 기록 줄 틀 없음) + 좌표
    expect(show('첫 번째 점 지정: ⁨0,0⁩', 'de')).toBe(`${dict.de['첫 번째 점 지정:']} 0,0`);
    // 쌍점 앞까지만 열쇠인 물음(「직사각형의 길이 지정」 — 쌍점이 붙은 열쇠 없음): 물음 번역 + 원문 쌍점 + 친 입력
    expect(dict.en['직사각형의 길이 지정:']).toBeUndefined();
    expect(show('직사각형의 길이 지정: ⁨40⁩', 'en')).toBe(`${dict.en['직사각형의 길이 지정']}: 40`);
    // 도면 글 표시 안의 쌍점에서는 나누지 않는다(친 글 「A: B」를 그대로)
    const k = '다음 점 지정 또는 [명령 취소(U)]:';
    expect(show(`${k} ⁨A: B⁩`, 'ja')).toBe(`${dict.ja[k]} A: B`);
    // 한국어 화면(ko): 번역층은 원문을 그대로 둔다
    for (const s of [`${k} ⁨10,20⁩`, `${MTEXT} H`]) expect(translate(s, 'ko')).toBe(s);
  });
});
