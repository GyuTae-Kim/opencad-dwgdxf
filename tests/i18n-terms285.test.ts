/**
 * 285차: ARRAY 명령 묶음(ARRAYRECT·ARRAYPOLAR·ARRAYPATH·ARRAYEDIT·ARRAYCLOSE·-ARRAY·배열 그립·특성 팔레트 배열 칸)의 보이는 글을 모아
 * 네 언어 번역이 코드가 하는 일(CAD 뜻)과 같은지 대조하고, 같은 사전 안의 맞는 번역을 근거로 고쳤다(표는 docs/CHANGELOG.md 285차 절).
 * - 같은 키워드는 이름·옵션·통째 프롬프트가 같은 낱말: 전체 경로 채우기(ja 「フルパスを入力」 파일 경로 입력·de 「pumpen」 펌프질),
 *   전체(T)(합계 — zh 全部·de Alle는 「전체(A)」 모두의 낱말 → 같은 사전 「합계(T)」 总计·「합계」 Gesamt), zh 단위 셀(U) 单位制(단위계)·원본 객체(S) 原稿(원고)·
 *   경로 편집 프롬프트의 기준점(B) 轴(축).
 * - 항목 정렬(경로 방향으로 돌려 맞춤)은 차례 정렬(sort·並べ替え·排序·sortieren)이 아니고, 레벨은 Z 방향 층(zh 级别·等级 등급, de Pegel·「-Ebene」),
 *   행 고도 증분(행마다 더하는 Z)은 표의 행 높이(行の高さ·行高·Zeilenhöhe)가 아니다.
 * - 항목은 zh 物品(물건)·输入(입력)이 아니고, zh 소스 源代码(소스 코드)·배열 布局(배치)·기록 录制(녹화)·경로 배열 排列路径(경로를 늘어놓다)을 고쳤다.
 *   en 「연관 배열 N개」·「열·행 개수」로 읽히던 줄, ja 키 점 基準点, ja·de 「유형 = … 연관 = …」이 한 낱말로 붙은 줄, de 영어로 남은 옵션도 같은 사전 꼴로.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const LANGS = ['en', 'de', 'ja', 'zh-CN'] as const;
type Lang = (typeof LANGS)[number];
const load = (lang: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../site/locales/${lang}.json`, import.meta.url), 'utf8'));
const dict = Object.fromEntries(LANGS.map((l) => [l, load(l)])) as Record<Lang, Record<string, string>>;
const [en, de, ja, zh] = [dict.en, dict.de, dict.ja, dict['zh-CN']];
/** 통째 프롬프트가 같은 프롬프트의 명령행 앞 조각(「… [」)으로 시작하는지(빈칸은 보지 않는다) */
const startsWithHead = (d: Record<string, string>, key: string): boolean => {
  const squash = (s: string | undefined) => (s ?? '').replace(/\s/g, '');
  const head = squash(d[key.slice(0, key.indexOf('[') + 1)]);
  return head.length > 1 && squash(d[key]).startsWith(head);
};

/** ARRAYPATH·ARRAYEDIT 항목 수(arraypath.ts 239·assocarray.ts 607) */
const PATH_COUNT = '항목 수 지정 또는 [전체 경로 채우기(F)/표현식(E)] <{0}>:';
/** ARRAYPATH 그립 편집(arraypath.ts 187) */
const PATH_EDIT = '그립을 선택하여 배열을 편집하거나 [연관(AS)/방법(M)/기준점(B)/접선 방향(T)/항목(I)/행(R)/레벨(L)/항목 정렬(A)/Z 방향(Z)/종료(X)] <종료>:';
/** ARRAYPATH·ARRAYEDIT 항목 정렬(A) 물음 */
const ALIGN = '경로를 따라 배열된 항목을 정렬하시겠습니까?';
/** 행 고도 증분 — 특성 팔레트 칸(assocarray-ui.ts 29)과 ARRAYEDIT 행(R) 프롬프트(assocarray.ts 396) */
const ROW_ELEV = '행 사이의 증분 고도 지정 또는 [표현식(E)] <{0}>:';
/** 행·열·레벨 사이 거리의 전체(T) 프롬프트 */
const TOTAL_T = ['행 사이의 거리 지정 또는 [전체(T)/표현식(E)] <{0}>:', '열 사이의 거리 지정 또는 [전체(T)/표현식(E)] <{0}>:', '레벨 사이의 거리 지정 또는 [전체(T)/표현식(E)] <{0}>:'];

describe('ARRAY 명령 묶음 번역(285차)', () => {
  it('같은 키워드는 이름·옵션·통째 프롬프트에서 같은 낱말이다(전체 경로 채우기·전체(T)·단위 셀(U)·원본 객체(S)·기준점(B))', () => {
    for (const lang of ['de', 'ja', 'zh-CN'] as const) {
      const d = dict[lang];
      const gap = lang === 'de' ? ' ' : '';
      expect(d['전체 경로 채우기(F)'], lang).toBe(`${d['전체 경로 채우기']}${gap}(F)`);
      expect(d[PATH_COUNT], lang).toContain(`[${d['전체 경로 채우기(F)']}/`);
    }
    for (const [key, value] of Object.entries(ja)) if (key.includes('전체 경로 채우기')) expect(value, key).not.toMatch(/入力|塗りつぶし/);
    for (const [key, value] of Object.entries(de)) if (key.includes('전체 경로 채우기')) expect(value, key).not.toMatch(/pumpen/);
    // 전체(T) = 시작~끝 전체 거리(합계) — 같은 사전 「합계(T)」·「합계」의 낱말
    expect(zh['전체(T)']).toBe(zh['합계(T)']);
    expect(de['전체(T)']).toBe(`${de['합계']} (T)`);
    for (const key of ['전체(T)', ...TOTAL_T]) {
      expect(zh[key], key).toContain('总计(T)');
      expect(zh[key], key).not.toContain('全部');
      expect(de[key], key).toMatch(/Gesamt ?\(T\)/);
      expect(de[key], key).not.toMatch(/Alle|Total|Expression/);
    }
    expect(zh['단위 셀(U)']).toBe(`${zh['단위 셀']}(U)`);
    expect(zh['배열에서 대체할 항목 선택 또는 [원본 객체(S)]:']).toContain(`[${zh['원본 객체(S)']}]`);
    expect(zh[PATH_EDIT]).toContain(`/${zh['기준점(B)']}/`);
    expect(zh['이동점 지정:']).toBe('指定移动点：');
    expect(de['이동점 지정:']).toBe('Verschiebungspunkt angeben:');
    expect(zh['다른 구석점 지정:']).toBe('指定另一个角点：');
  });

  it('항목 정렬은 차례 정렬이 아니고, 레벨은 Z 방향 층, 행 고도 증분은 표의 행 높이가 아니다', () => {
    const align: Record<Lang, [ban: RegExp, has: RegExp]> = {
      en: [/sort/i, /align/i],
      ja: [/並べ替え/, /整列/],
      'zh-CN': [/排序/, /对齐/],
      de: [/sortier/i, /ausrichten/],
    };
    for (const lang of LANGS) {
      expect(dict[lang][ALIGN], lang).not.toMatch(align[lang][0]);
      expect(dict[lang][ALIGN], lang).toMatch(align[lang][1]);
    }
    for (const [key, value] of Object.entries(zh)) if (key.includes('레벨')) expect(value, key).not.toMatch(/级别|等级/);
    for (const [key, value] of Object.entries(de)) if (key.includes('레벨')) expect(value, key).not.toMatch(/Pegel|^-/);
    expect([zh['레벨'], zh['레벨 간격'], zh[', 레벨 {0}']]).toEqual(['层级', '层级间距', '，层级{0}']);
    expect([de['레벨'], de['레벨 간격']]).toEqual(['Ebene', 'Ebenenabstand']);
    expect(startsWithHead(zh, '시작 레벨과 끝 레벨 사이의 전체 거리 지정 또는 [표현식(E)] <{0}>:')).toBe(true);
    const height: Partial<Record<Lang, RegExp>> = { ja: /高さ/, 'zh-CN': /行高|行间距/, de: /Zeilenhöhe|Schrittweite/ };
    for (const lang of ['de', 'ja', 'zh-CN'] as const) {
      for (const key of ['행 고도 증분', ROW_ELEV]) expect(dict[lang][key], `${lang}: ${key}`).not.toMatch(height[lang]!);
      expect(startsWithHead(dict[lang], ROW_ELEV), lang).toBe(true);
    }
    expect(ja['행 고도 증분']).toContain('標高');
    expect(zh['행 고도 증분']).toContain('高程');
    expect(de['행 고도 증분']).toBe('Höhenunterschied zwischen Zeilen');
    // de: 영어로 남은 옵션(Expression·Total)과 「~을 지정한다」 서술 대신 같은 프롬프트 앞 조각
    for (const key of ['경로를 따라 항목 사이의 거리 지정 또는 [표현식(E)] <{0}>:', '경로를 따라 항목 수 지정 또는 [표현식(E)] <{0}>:', TOTAL_T[2]!]) {
      expect(de[key], key).toContain('Ausdruck(E)');
      expect(startsWithHead(de, key), key).toBe(true);
    }
  });

  it('항목·유형·결과 줄은 같은 사전의 낱말과 꼴이다', () => {
    for (const [key, value] of Object.entries(zh)) if (key.includes('항목')) expect(value, key).not.toMatch(/物品|输入太多/);
    const zhFixed: [key: string, ban: RegExp][] = [
      ['소스', /代码/],
      ['그 자리로는 배열을 바꿀 수 없습니다.', /布局/],
      ['기록', /录制/],
      ['이동점 지정:', /要点/],
      ['단위 셀(U)', /单位制/],
      ['원본 객체(S)', /原稿/],
    ];
    for (const [key, ban] of zhFixed) expect(zh[key], key).not.toMatch(ban);
    expect(zh['경로 배열']).toBe('路径阵列');
    expect(zh['항목 사이 각도']).toBe(zh['항목 사이의 각도']);
    expect(zh['기록']).toBe('历史记录');
    // en: 경로는 「경로(PA)」의 낱말, 항목 자리는 몇째 열·행(개수가 아니다), 배열 하나에 항목 N개
    expect(en['경로']).toBe(en['경로(PA)']!.replace(/\s*\(PA\)$/, ''));
    expect(en['열 {0}, 행 {1}{2}']).toBe('Column {0}, row {1}{2}');
    expect(en['항목 {0}, 행 {1}{2}']).toBe('Item {0}, row {1}{2}');
    expect(en['항목 {0}개의 연관 배열({1})을 만들었습니다.']).not.toMatch(/arrays?\(s\)/);
    expect(en['항목 {0}개의 연관 배열({1})을 만들었습니다.']).toContain('with {0} item');
    expect(en['대체']).toBe('Replace');
    // ja: 키 점은 キーポイント(기준점 基準点이 아니다)
    for (const [key, value] of Object.entries(ja))
      if (key.includes('키 점') && !key.includes('기준점')) {
        expect(value, key).toContain('キーポイント');
        expect(value, key).not.toContain('基準点');
      }
    // 「유형 = … 연관 = …」은 칸 둘(유형·연관)이다 — 한 낱말로 붙이지 않는다
    for (const kind of ['직사각형', '원형', '경로']) {
      expect(ja[`유형 = ${kind} 연관 = {0}`], kind).toMatch(/^タイプ = \S+ 関連付け = \{0\}$/);
      expect(de[`유형 = ${kind} 연관 = {0}`], kind).toMatch(/^Typ = \S+ Assoziativ = \{0\}$/);
    }
    expect(de['유형 = {0} 연관 = 예']).toBe('Typ = {0} Assoziativ = Ja');
    expect(de['유형 = 직사각형 연관 = {0}']).toBe('Typ = Rechteckig Assoziativ = {0}');
    expect([de['개수'], de['직사각형 배열'], de['대체'], de['대체한 항목'], de['기록']]).toEqual(['Anzahl', 'Rechteckiges Array', 'Ersetzen', 'Ersetzte Elemente', 'Verlauf']);
    expect(de['이미 배열 편집 상태입니다. 먼저 ARRAYCLOSE로 저장하거나 취소하십시오.']).toMatch(/^Bereits .*zuerst/);
  });
});
