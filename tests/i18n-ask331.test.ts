/**
 * 331차: 330·329차가 보고 둔 다국어 꼴 넷(사전과 번역층만 — 빌드 없이).
 * (가) 쌍점이 붙은 통째 열쇠가 없는 물음의 기록 줄(330차 askedLine — 「물음」 열쇠 번역 + 쌍점)은 원문 쌍점 「:」를 붙였다. 중국어 사전의 물음 꼴은
 *     전각 「：」가 다수라(jq — 기본값 없는 물음 값 566 / 645) 그 줄만 다른 줄과 갈렸다. 화면 언어 사전의 다수 쌍점을 붙인다(코드 안 표 — 기호 열쇠를
 *     두지 않는다: 공용 규칙 9번). 일본어는 반각이 다수(590 / 646)라 그대로다.
 * (나) 틀 열쇠 꼴 「…]:」 물음 10(「{0} 지정 또는 [양쪽(B)]:」 등)을 채우는 실제 물음(src) 35 가운데 통째 열쇠가 없는 것은 틀이 앞 낱말·옵션 목록을
 *     옮기지 않고 끼워(틀이 잡은 값은 그대로) 기록 줄에 한국어가 남았다. 물음 줄(commandline.ts setPrompt)처럼 앞 조각 「… [」·옵션 하나씩·「]」 + 쌍점으로
 *     옮긴다. 물음 줄 자체가 한국어이던 둘(VPORTS 이름 물음 — 앞 조각 열쇠 없음, PEDIT — 옵션 낱말 열쇠 없음)은 331차에 「아직 둔 것」이었고
 *     333차가 앞 조각 셋·옵션 낱말 여섯을 네 사전에 더해 목록에서 뺐다(이제 그 일곱도 조각으로 옮겨 한글 0 — i18n-ask333이 물음 줄·근거를 본다).
 * (다) 세로좌표(ordinate)의 zh 垂直坐标·QDIM 垂直(O), de QDIM Vertikale Koordinaten (O)는 「수직」 뜻 — 같은 사전의 세로좌표(O)(坐标(O)·Ordinate (O))로.
 * (라) 「한글 낱말 + {0}」 틀 넷(뷰·블록·설정·스타일 — 기본 이름 `뷰${n}` 꼴 코드에서 온 틀) 가운데 번역층을 지나는 쓰는 곳이 없는 셋은 지웠다
 *     (도면 이름이 되는 기본 이름 「뷰1」을 de 「Anzeigen1」로 보일 수 있었다). REDIR 줄(「  스타일 ⁨이름⁩: ⁨경로⁩」 — 두 걸음 조립)이 쓰는
 *     「스타일{0}」은 값의 {0} 앞 빈칸을 열쇠 꼴로 뺐다(빈칸 둘 「Style  이름」).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { guardedTranslate, translateTail } from '../src/app/fileguard';
import { unmark } from '../src/app/filetext';
import { translate } from '../site/i18n.mjs';

const LANGS = ['en', 'ja', 'zh-CN', 'de'] as const;
type Lang = (typeof LANGS)[number];
const hangul = (s: string): number => s.match(/[가-힣]/g)?.length ?? 0;
const load = (lang: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../site/locales/${lang}.json`, import.meta.url), 'utf8'));
const dict = Object.fromEntries(LANGS.map((l) => [l, load(l)])) as Record<Lang, Record<string, string>>;
/** 기록 줄을 번역층처럼(fileguard.ts installFileGuard — 통째 번역이 한국어를 남기면 translateTail, 화면 언어도 넘김) 옮기고 도면 글 표시를 뗀다 */
const show = (line: string, l: Lang): string => unmark(translateTail(line, translate(line, l), (s) => translate(s, l), l));
/** 옮긴 물음 + 친 입력(343차 — fileguard.ts glue): 전각 쌍점 뒤에는 빈칸을 두지 않는다(같은 사전 다수 꼴), 그 밖은 원문 빈칸 하나 */
const typed = (head: string, input: string): string => `${head}${head.endsWith('：') ? '' : ' '}${input}`;
/** 그 언어 사전에서 기본값 없는 물음(쌍점으로 끝나고 기본값 꼬리 「>:」가 아닌 열쇠) 값의 끝 쌍점 다수 꼴 */
const colonOf = (l: Lang): string => {
  const ends = Object.keys(dict[l]).filter((k) => /[^>]:$/.test(k)).map((k) => dict[l][k]!.slice(-1));
  return ends.filter((c) => c === '：').length > ends.filter((c) => c === ':').length ? '：' : ':';
};

/**
 * 「…]:」 틀 열쇠 10과 그 틀을 채우는 실제 물음(331차 src grep — 표는 .runtime 진행 기록). left = 물음 줄도 한국어라 남는 것,
 * gone = 사전에서 지운 틀(334차 — VPORTS 틀은 333차 앞 조각 셋 뒤로 결과가 쓰이지 않음: i18n-tail334). 물음은 그대로 본다
 */
const ROT = ['회전 각도', '새 각도', '축척 비율', '새 길이'];
const ARRAY = ['열 간격', '열 수', '행 간격', '행 수', '행 및 열 수', '반지름', '항목 사이의 각도', '채울 각도', '항목 사이 거리', '항목 수'];
const PEDIT3 = ['정점 편집(E)', '스플라인 곡선(S)', '비곡선화(D)', '반전(R)', '명령 취소(U)'];
const PEDIT2 = ['결합(J)', '폭(W)', '정점 편집(E)', '맞춤(F)', '스플라인(S)', '비곡선화(D)', '선종류생성(L)', '반전(R)', '명령 취소(U)'];
const RENAME = ['블록(B)', '치수 스타일(D)', '도면층(LA)', '선종류(LT)', '문자 스타일(S)', '배치(L)'];
const ALIGN = ['맨 위 왼쪽(TL)', '맨 위 중심(TC)', '맨 위 오른쪽(TR)', '중간 왼쪽(ML)', '중간 중심(MC)', '중간 오른쪽(MR)', '맨 아래 왼쪽(BL)', '맨 아래 중심(BC)', '맨 아래 오른쪽(BR)', '스타일 따름(S)'];
const DIM = ['여러 줄 문자(M)', '문자(T)', '각도(A)'];
const TEMPLATES: { t: string; asks: string[]; left?: true; gone?: true }[] = [
  { t: '{0} 또는 [{1}]:', asks: ROT.map((w) => `${w} 지정 또는 [기준점(B)/복사(C)/명령 취소(U)/참조(R)/종료(X)]:`) },
  { t: '{0} 뷰포트 구성의 이름 입력 또는 [?]:', asks: ['저장할', '복원할', '삭제할'].map((v) => `${v} 뷰포트 구성의 이름 입력 또는 [?]:`), gone: true },
  { t: '{0} 지정 또는 [기준점(B)/복사(C)/명령 취소(U)/종료(X)]:', asks: ['신축점', '이동점', '두 번째 점'].map((w) => `${w} 지정 또는 [기준점(B)/복사(C)/명령 취소(U)/종료(X)]:`) },
  { t: '{0} 지정 또는 [양쪽(B)]:', asks: ['통과점', '간격띄우기할 면의 점'].map((w) => `${w} 지정 또는 [양쪽(B)]:`) },
  { t: '{0} 지정 또는 [종료(X)]:', asks: ARRAY.map((w) => `${w} 지정 또는 [종료(X)]:`) },
  {
    t: '다음 점 입력 또는 [{0}]:',
    asks: [['시작 접촉부(T)', '공차(L)'], ['끝 접촉부(T)', '공차(L)', '명령 취소(U)'], ['끝 접촉부(T)', '공차(L)', '명령 취소(U)', '닫기(C)'], ['명령 취소(U)'], ['닫기(C)', '명령 취소(U)']].map(
      (o) => `다음 점 입력 또는 [${o.join('/')}]:`,
    ),
  },
  { t: '옵션 입력 [{0}]:', asks: [...['닫기(C)', '열기(O)'].map((c) => [c, ...PEDIT3]), ...['닫기(C)', '열기(O)'].map((c) => [c, ...PEDIT2])].map((o) => `옵션 입력 [${o.join('/')}]:`) },
  { t: '이름을 바꿀 객체 유형 입력 [{0}]:', asks: [`이름을 바꿀 객체 유형 입력 [${RENAME.join('/')}]:`] },
  { t: '정렬 입력 [{0}]:', asks: [`정렬 입력 [${ALIGN.join('/')}]:`] },
  { t: '치수선의 위치 지정 또는 [{0}]:', asks: [DIM, [...DIM, '수평(H)', '수직(V)', '회전(R)']].map((o) => `치수선의 위치 지정 또는 [${o.join('/')}]:`) },
];
/** 물음 줄(setPrompt)과 같은 조각 번역: 앞 조각 「… [」 + 옵션 하나씩 + 「]」 + 그 언어 쌍점 */
const asPrompt = (k: string, l: Lang): string => {
  const m = /^(.*?)\[(.*?)\]:$/.exec(k)!;
  return `${translate(`${m[1]}[`, l)}${m[2]!.split('/').map((o) => translate(o, l)).join('/')}]${colonOf(l)}`;
};

describe('330·329차가 보고 둔 다국어 꼴 넷(331차)', () => {
  it('(가) 쌍점 붙은 열쇠가 없는 물음은 그 언어 사전 물음 꼴의 다수 쌍점을 붙인다(중국어 전각) — 통째 열쇠가 있으면 사전 값 그대로', () => {
    expect(LANGS.map(colonOf)).toEqual([':', ':', '：', ':']);
    // 「직사각형의 길이 지정」(쌍점이 붙은 열쇠 없음 — 330차 표본) + 친 길이
    const k = '직사각형의 길이 지정';
    for (const l of LANGS) {
      expect(dict[l][`${k}:`], l).toBeUndefined();
      expect(show(`${k}: ⁨40⁩`, l), l).toBe(typed(`${dict[l][k]}${colonOf(l)}`, '40'));
    }
    expect(show(`${k}: ⁨40⁩`, 'zh-CN')).toBe('指定矩形的长度：40');
    // 통째 열쇠가 있으면 그 값의 쌍점(중국어 반각 값·일본어 전각 값도 그대로 — 사전 몫)
    const zhHalf = '(추가 모드) 객체 선택:';
    const jaFull = '2D 폴리선 선택:';
    expect([dict['zh-CN'][zhHalf]!.slice(-1), dict.ja[jaFull]!.slice(-1)]).toEqual([':', '：']);
    expect(show(`${zhHalf} ⁨10,20⁩`, 'zh-CN')).toBe(`${dict['zh-CN'][zhHalf]} 10,20`);
    expect(show(`${jaFull} ⁨10,20⁩`, 'ja')).toBe(typed(dict.ja[jaFull]!, '10,20'));
    // 한국어 화면은 번역층이 그대로 둔다
    expect(translate(`${k}: ⁨40⁩`, 'ko')).toBe(`${k}: ⁨40⁩`);
  });

  it('(나) 「…]:」 틀 10을 채우는 실제 물음 35의 기록 줄 — 통째 열쇠가 없으면 물음 줄처럼 조각마다 옮겨 한글 0(333차부터 아직 둔 것 없음)', () => {
    // 틀 열쇠 꼴 「…]:」는 네 사전 모두 10(331차 jq) → 9(334차가 VPORTS 틀을 지움)
    for (const l of LANGS)
      expect(
        Object.keys(dict[l])
          .filter((k) => /\]:$/.test(k) && /\{\d+\}/.test(k))
          .sort(),
        l,
      ).toEqual(TEMPLATES.filter((x) => !x.gone).map((x) => x.t).sort());
    const all = TEMPLATES.flatMap((x) => x.asks);
    // 4 + 3 + 3 + 2 + 10 + 5 + 4 + 1 + 1 + 2(틀 차례대로 — 331차 고치기 전 실행이 센 값)
    expect(all.length).toBe(35);
    const left: string[] = [];
    const still: string[] = [];
    let fixed = 0;
    for (const { asks, left: keep } of TEMPLATES)
      for (const k of asks) {
        const letter = /\(([^()]+)\)\]:$|\(([^()]+)\)\//.exec(k)?.slice(1).find(Boolean) ?? '?';
        if (!keep && !dict.en[k]) fixed++;
        for (const l of LANGS)
          for (const input of ['⁨10,20⁩', letter]) {
            const out = show(`${k} ${input}`, l);
            if (keep) {
              if (!hangul(out)) still.push(`${l}: ${out}`);
              continue;
            }
            const want = typed(dict[l][k] ?? asPrompt(k, l), unmark(input));
            if (out !== want || hangul(out)) left.push(`${l}: ${out} ≠ ${want}`);
          }
      }
    // 통째 열쇠가 없어 조각으로 옮기는 것: 양쪽(B) 둘·-RENAME·표 셀 정렬 넷 + 333차 VPORTS 저장·복원·삭제할 이름 물음 셋·PEDIT 옵션 넷
    expect(fixed).toBe(11);
    expect(left.length, left.slice(0, 6).join('\n')).toBe(0);
    // 아직 둔 것(left: true — 333차부터 없음)에 한글이 없어졌으면 목록에서 뺄 때
    expect(still, still.slice(0, 4).join('\n')).toEqual([]);
    // 표본: 간격띄우기 면의 점(express-draw.ts) + 옵션 글자
    const OFF = '통과점 지정 또는 [양쪽(B)]:';
    expect(show(`${OFF} B`, 'en')).toBe(`${dict.en['통과점 지정 또는 [']}${dict.en['양쪽(B)']}]: B`);
    expect(show(`${OFF} B`, 'zh-CN')).toBe(`${dict['zh-CN']['통과점 지정 또는 [']}${dict['zh-CN']['양쪽(B)']}]：B`);
    expect(translate(`${OFF} B`, 'ko')).toBe(`${OFF} B`);
    // 조각 기록 줄·물음 줄 단추가 보이는 옵션 「양쪽(B)」은 같은 물음 틀의 옵션 낱말(zh 仅显示 「보이기만」·de Nur 「만」이 아니다 — 331차 고치기 전 실행이 찾음)
    for (const l of ['en', 'zh-CN', 'de'] as const) expect(dict[l]['{0} 지정 또는 [양쪽(B)]:'], l).toContain(`[${dict[l]['양쪽(B)']}]`);
  });

  it('(다) 세로좌표는 같은 사전의 세로좌표(O) 낱말 — zh·de에서 「수직」 뜻 낱말을 쓰지 않는다', () => {
    const ORD = Object.keys(dict.en).filter((k) => k.includes('세로좌표'));
    expect(ORD.length).toBeGreaterThanOrEqual(13);
    for (const k of ORD) {
      expect(dict['zh-CN'][k], k).not.toMatch(/垂直/);
      expect(dict.de[k], k).not.toMatch(/Vertikal/);
    }
    const zh = dict['zh-CN'];
    expect(zh['세로좌표']).toBe(zh['세로좌표(O)']!.replace('(O)', ''));
    for (const a of ['X', 'Y']) {
      expect(zh[`세로좌표(${a})`], a).toBe(zh['세로좌표(O)']!.replace('(O)', `(${a})`));
      expect(zh[`치수 (세로좌표(${a}))`], a).toBe(zh['치수 ({0})']!.replace('{0}', zh[`세로좌표(${a})`]!));
      expect(zh[`치수 (세로좌표(${a})) ({0})`], a).toBe(`${zh[`치수 (세로좌표(${a}))`]} ({0})`);
    }
    // QDIM 물음의 옵션 = 옵션 열쇠 번역(ja·zh·de — en은 이 물음 옵션을 빈칸 없이 「Ordinate(O)」로 쓰는 꼴)
    const QDIM = '치수선의 위치 지정 또는 [연속(C)/다중(S)/기준선(B)/세로좌표(O)/반지름(R)/지름(D)/데이텀 점(P)/편집(E)/설정(T)] <{0}>:';
    for (const l of ['ja', 'zh-CN', 'de'] as const) expect(dict[l][QDIM], l).toContain(`/${dict[l]['세로좌표(O)']}/`);
  });

  it('(라) 「한글 낱말 + {0}」 틀은 REDIR 줄이 쓰는 「스타일{0}」 하나 — 기본 이름(도면 이름) 꼴은 옮기지 않는다', () => {
    for (const l of LANGS) {
      expect(
        Object.keys(dict[l]).filter((k) => /^[가-힣]+\{0\}$/.test(k)),
        l,
      ).toEqual(['스타일{0}']);
      expect(dict[l]['스타일{0}'], l).toBe(`${dict[l]['스타일']}{0}`);
      // REDIR 목록·결과 줄(express-draw.ts — 앞 낱말 + 빈칸 + 도면 이름·경로): 빈칸 하나
      expect(guardedTranslate('  스타일 ⁨Standard⁩: ⁨txt.shx⁩', l), l).toBe(`  ${dict[l]['스타일']} Standard: txt.shx`);
      // 지운 틀: 새 뷰·BLOCK·새 페이지 설정 기본 이름(입력 칸 값 — 도면 이름이 된다)
      for (const n of ['뷰1', '블록1', '설정1']) expect(translate(n, l), `${l} ${n}`).toBe(n);
    }
  });
});

/*
 * 343차(342차에 보고 둔 값 몫): (1) 같은 옵션의 통째 물음 값(기록 줄·휴대폰 카드)과 옵션 조각 값(물음 줄 단추·칩)이 한 낱말 — 「연관해제됨(D)」는
 * ja 関連付け解除(D) ↔ 関連解除済み(D)·zh 未关联 (D) ↔ 非关联(D)로 갈렸다. 같은 사전 어간(jq — ja 関連付け解除 6·関連解除 2, zh 未关联 6·非关联 2: 2는 조각 열쇠 둘)으로,
 * 같은 어간의 「연관 해제(DI)」(-HATCHEDIT) 조각도 통째 값 낱말로. zh 통째 옵션 「(X)」 앞 빈칸은 같은 사전 다수 꼴(없음 3,057 · 있음 203)로.
 * (2) 전각 쌍점 뒤 빈칸: zh 값 7(「创建日期： {0}」 등 — 같은 사전 「：」 뒤가 글자 652)과 기록 줄(옮긴 물음 + 빈칸 + 친 입력 — 331차에 보고 두 것 (5))을
 * 같은 사전 다수 꼴(빈칸 없음 — 기록 줄 틀 「…]：{0}」과 같음)로.
 */
describe('342차가 보고 둔 값 몫 — 옵션 낱말 하나·전각 쌍점 뒤 빈칸(343차)', () => {
  it('(1) 「연관해제됨(D)」 통째 물음 값의 옵션 = 옵션 조각 값(네 언어), ja·zh는 같은 사전 어간 하나(関連解除·非关联 0), 「연관 해제(DI)」도 ja·zh 한 낱말', () => {
    const optOf = (v: string): string => /\[([^\]]*)\]/.exec(v)![1]!.split('/')[0]!;
    const WHOLE = '객체 선택 또는 [연관해제됨(D)]:';
    for (const l of LANGS) expect(optOf(dict[l][WHOLE]!), l).toBe(dict[l]['연관해제됨(D)']);
    for (const l of ['ja', 'zh-CN'] as const) expect(optOf(dict[l]['해치 옵션 입력 [연관 해제(DI)/스타일(S)/특성(P)] <특성>:']!), l).toBe(dict[l]['연관 해제(DI)']);
    expect(Object.values(dict.ja).filter((v) => v.includes('関連解除'))).toEqual([]);
    expect(Object.values(dict['zh-CN']).filter((v) => v.includes('非关联'))).toEqual([]);
    expect(dict['zh-CN']['연관해제됨(D)']).toBe(`${dict['zh-CN']['연관해제됨']}(D)`);
    // 기록 줄(통째 값 + 친 옵션 글자)
    for (const l of LANGS) expect(show(`${WHOLE} D`, l), l).toBe(typed(dict[l][WHOLE]!, 'D'));
  });

  it('(2) 전각 쌍점 뒤 빈칸 없음 — ja·zh 사전 값 0, 「：」로 끝나는 물음(기본값 있는·없는 것)의 기록 줄은 「：」 + 친 입력(반각 쌍점·한국어는 원문 빈칸 그대로)', () => {
    for (const l of ['ja', 'zh-CN'] as const)
      expect(
        Object.entries(dict[l])
          .filter(([, v]) => /： /.test(v))
          .map(([k]) => k),
        l,
      ).toEqual([]);
    expect(dict['zh-CN']['만든 날짜: {0}']).toBe('创建日期：{0}');
    const bad: string[] = [];
    let seen = 0;
    for (const l of ['ja', 'zh-CN'] as const)
      for (const k of Object.keys(dict[l]).filter((x) => /[가-힣]/.test(x) && /:$/.test(x) && !/\{\d+\}/.test(x) && dict[l][x]!.endsWith('：'))) {
        seen++;
        const out = show(`${k} ⁨1⁩`, l);
        if (out.includes('： ')) bad.push(`${l}: ${out}`);
      }
    expect(seen).toBeGreaterThan(500);
    expect(bad.length, bad.slice(0, 6).join('\n')).toBe(0);
    expect(show('직사각형의 길이 지정: ⁨40⁩', 'en')).toBe(`${dict.en['직사각형의 길이 지정']}: 40`);
    expect(translate('직사각형의 길이 지정: ⁨40⁩', 'ko')).toBe('직사각형의 길이 지정: ⁨40⁩');
  });
});
