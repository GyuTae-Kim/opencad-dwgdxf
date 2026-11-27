/**
 * 328차: 사전 열쇠는 한글이나 `{n}` 틀을 품는다(공용 규칙 9번 재발 막기 — NC 201차 #242·DWG 201차가 되돌린 꼴).
 * 한글 없는 기호 열쇠(':'·'-'·'/' 등)를 더하면 사이트 키트 translate()가 앞뒤 빈칸을 뺀 열쇠로 찾아 값만 돌려줘,
 * 조각을 이어 옮기는 길(mixNodes·uiText)에서 영어 「: 」 같은 앞뒤 빈칸을 잃는다. 기호 하나를 언어마다 다르게 하려면 그 기호가 든 통째 원문·틀 열쇠로 한다.
 * 빌드 없이 네 사전만 읽는다(321차 i18n-static321 꼴). 뺀 것은 og 그림 주소 하나(한글·틀이 없는 주소 — 사이트 공유 그림).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const LANGS = ['en', 'ja', 'zh-CN', 'de'] as const;
const OG_IMAGE = 'https://gyutae-kim.github.io/opencad-dwgdxf/og-opencad.jpg';

describe('사전 열쇠는 한글이나 {n} 틀을 품는다(328차 — 공용 규칙 9번)', () => {
  for (const lang of LANGS)
    it(`${lang}: 한글·{n} 없는 열쇠는 og 그림 주소 하나뿐`, () => {
      const catalog = JSON.parse(readFileSync(new URL(`../site/locales/${lang}.json`, import.meta.url), 'utf8')) as Record<string, string>;
      const bare = Object.keys(catalog).filter((k) => !/[가-힣]/.test(k) && !/\{\d+\}/.test(k));
      expect(bare).toEqual([OG_IMAGE]);
    });
});
