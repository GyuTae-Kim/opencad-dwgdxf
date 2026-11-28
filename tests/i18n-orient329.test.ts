/**
 * 329차: 「가로」·「세로」 뜻 갈림 — 이 앱은 같은 한국어 낱말을 두 뜻으로 쓴다(사전만 읽는다 — 빌드 없이).
 * - 수평·수직(글 방향): PLOTSTAMP 대화 상자 「방향」 고르기(src/app/filecmds-stamp.ts — H 가로·V 세로, 세로는 아래에서 위로 읽는 글).
 *   홀로 쓴 사전 열쇠 「가로」·「세로」는 이 뜻(Horizontal·Vertical 꼴)이다.
 * - 용지 방향: -PLOT 옵션 「세로(P)」·「가로(L)」(옵션 글자가 붙은 열쇠 — 바로 가기 메뉴도 `이름(글자)`로 보인다), 페이지 설정 「세로(A)」·「가로(N)」,
 *   배치 만들기 결과 줄·마법사 요약·328차 페이지 설정 설명 틀(통째 열쇠). 배치 마법사(LAYOUTWIZARD) 「방향」 쪽 라디오만 홀로 「세로」·「가로」를 써
 *   수평·수직으로 읽혔다(en Vertical·Horizontal) → 뜻을 품은 원문 「세로 방향」·「가로 방향」으로 나눴다(화면은 i18n-screens327이 본다).
 * - 글꼴 패밀리 이름(같은 차수 — 문자 편집기 글꼴 고르기를 옮기며 찾음): 문자 스타일 대화 상자(textedit/styledlg.ts TTF_FONTS)·편집기 글꼴 목록
 *   (textedit/editor.ts FONTS)의 한국어 트루타입 글꼴 이름은 고유 이름인데 사전이 낱말 뜻으로 옮겨 두었다(굴림 Roll·바탕 Background·궁서 Palace·
 *   맑은 고딕 Clear Gothic 등). 같은 사전에 이미 있던 로마자 이름(ja·zh Malgun Gothic, zh Gulim, en·zh·de Dotum, ja DotumChe)대로 네 언어 모두
 *   Windows 글꼴 이름(고정폭 「…체」는 …Che)으로 맞췄다.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { translate } from '../site/i18n.mjs';

const LANGS = ['en', 'ja', 'zh-CN', 'de'] as const;
const HANGUL = /[ㄱ-ㆎ가-힣]/;
/** 옵션 글자를 뗀 낱말(「Portrait (P)」 → 「Portrait」, 「縦(P)」 → 「縦」) */
const word = (key: string, lang: string) => translate(key, lang).replace(/\s*\([A-Z]\)$/, '');

describe('「가로」·「세로」 뜻 갈림(329차)', () => {
  for (const lang of LANGS)
    it(`${lang}: 용지 방향 원문은 같은 사전의 용지 방향 낱말, 홀로 쓴 「가로」·「세로」는 수평·수직 그대로`, () => {
      for (const k of ['세로 방향', '가로 방향', '세로', '가로']) expect(translate(k, lang), k).not.toMatch(HANGUL);
      // 새 원문 = 같은 사전의 -PLOT 옵션·페이지 설정 라디오 낱말(둘이 같은지도 — 한 사전 안에서 용지 방향 낱말이 하나)
      expect(word('세로(A)', lang)).toBe(word('세로(P)', lang));
      expect(word('가로(N)', lang)).toBe(word('가로(L)', lang));
      expect(translate('세로 방향', lang)).toBe(word('세로(P)', lang));
      expect(translate('가로 방향', lang)).toBe(word('가로(L)', lang));
      // 홀로 쓴 「세로」(PLOTSTAMP 수직 글)를 용지 방향 낱말로 바꾸면 그 자리가 틀린다. 「가로」는 일본어만 두 뜻 모두 横(같은 사전 「가로」·「가로(L)」)
      expect(translate('세로', lang)).not.toBe(translate('세로 방향', lang));
      if (lang !== 'ja') expect(translate('가로', lang)).not.toBe(translate('가로 방향', lang));
    });
});

const src = (path: string) => readFileSync(new URL(`../src/app/${path}`, import.meta.url), 'utf8');
/** 문자 스타일 대화 상자의 트루타입 글꼴 패밀리(소스 그대로 읽는다 — 목록이 바뀌면 시험도 따라간다) */
const TTF = [...src('textedit/styledlg.ts').matchAll(/family: '([^']+)'/g)].map((m) => m[1]!);
/** 문자 편집기 글꼴 고르기의 앱 글꼴 목록 */
const EDITOR_FONTS = JSON.parse(src('textedit/editor.ts').match(/const FONTS = (\[[^\]]*\]);/)![1]!.replace(/'/g, '"')) as string[];
/** 한국어 트루타입 글꼴의 Windows 글꼴 이름 */
const FONT_NAMES: Record<string, string> = {
  '맑은 고딕': 'Malgun Gothic',
  굴림: 'Gulim',
  굴림체: 'GulimChe',
  바탕: 'Batang',
  바탕체: 'BatangChe',
  돋움: 'Dotum',
  돋움체: 'DotumChe',
  궁서: 'Gungsuh',
  궁서체: 'GungsuhChe',
};

describe('글꼴 패밀리 이름은 고유 이름(329차)', () => {
  it('문자 스타일 대화 상자·편집기 글꼴 목록의 한국어 글꼴 이름은 네 언어 모두 로마자 Windows 글꼴 이름이다', () => {
    const korean = [...new Set([...TTF, ...EDITOR_FONTS].filter((f) => HANGUL.test(f)))].sort();
    expect(korean).toEqual(Object.keys(FONT_NAMES).sort());
    expect(EDITOR_FONTS.filter((f) => HANGUL.test(f))).toEqual(['맑은 고딕', '굴림', '바탕']);
    for (const lang of LANGS) for (const f of korean) expect(translate(f, lang), `${lang}: ${f}`).toBe(FONT_NAMES[f]);
  });
});
