/**
 * 321차: index.html 정적 소개(<main> — 정적 안내 #viewer-guide 포함)의 번역 대조와 빌드 없이 도는 재발 막기.
 * - 정적 언어 쪽(dist/<언어>/index.html)은 공용 번역기 localizeHtml(opencad-site-kit)이 body를 태그와 글 마디로 나눠, 글 마디마다 빈칸을 하나로
 *   모은 글(normalize)을 열쇠로 옮긴다(alt·title·aria-label·placeholder도). 앱이 뜬 뒤에는 src/app/i18n.ts가 같은 글 마디를 다시 옮기고, 시작 화면은
 *   #viewer-guide를 그대로 쓴다(ui/shell.ts). 그래서 <a>로 나뉜 문단은 조각마다 열쇠이고 조각은 한국어 어순 그대로 이어진다.
 * - check:i18n은 빌드한 쪽의 main(언어 고르기 줄 [data-static-languages]를 뺀 것)에 한국어가 남는지를 빌드 뒤에만 본다(STEP 201차 CI 실패).
 *   이 시험은 index.html을 같은 번역기에 넣어 빌드 없이 먼저 본다 — 한글 글 마디는 틀·조각 나누기에 기대지 않고 사전 열쇠 그대로 있어야 한다.
 * - 오역(같은 사전의 맞는 번역으로): 수정 기능 목록의 자르기·모깎기(TRIM·FILLET 낱말 — en cutting, zh 倒角(모따기), de Schneiden), 독일어 지원 목록
 *   둘의 명령꼴(320차 이웃 목록 꼴), 소개 끝 문단이 가리키는 단추 이름(en·zh — 바로 위 단추 번역과 다름), ja 안내 쪽 이름 「開くと」(열면),
 *   「누가 만들고 관리하나요?」 답 조각(en 자리 글 [Author/Creator]·말줄임, de 「개발자가 프로젝트다」, zh 어순, ja 「～」 — GitHub 이슈는 같은
 *   사전 열기 오류 안내의 낱말과 맺음).
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { localizeHtml } from 'opencad-site-kit/i18n/localization-plugin';
import { sourceMessage } from '../site/i18n.mjs';
import { site } from '../tools/site.mjs';

const { JSDOM } = createRequire(import.meta.url)('jsdom');
const LANGS = ['en', 'ja', 'zh-CN', 'de'] as const;
type Lang = (typeof LANGS)[number];
const HANGUL = /[가-힣]/;
const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
const load = (lang: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../site/locales/${lang}.json`, import.meta.url), 'utf8'));
const dict = Object.fromEntries(LANGS.map((l) => [l, load(l)])) as Record<Lang, Record<string, string>>;
const INDEX = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

/** <main>(언어 고르기 줄은 뺀 것 — check:i18n과 같은 자리) */
function mainOf(html: string) {
  const main = new JSDOM(html).window.document.querySelector('main');
  main.querySelectorAll('[data-static-languages]').forEach((el: Element) => el.remove());
  return main;
}
/** 정적 소개·안내의 한글 글 마디(빈칸을 모은 글)와 번역기가 옮기는 속성 값 */
function koreanMessages(): string[] {
  const main = mainOf(INDEX);
  const found: string[] = [];
  const walk = main.ownerDocument.createTreeWalker(main, 4 /* NodeFilter.SHOW_TEXT */);
  for (let node = walk.nextNode(); node; node = walk.nextNode()) {
    const text = normalize(node.nodeValue ?? '');
    if (HANGUL.test(text)) found.push(text);
  }
  main.querySelectorAll('*').forEach((el: Element) => {
    for (const name of ['alt', 'title', 'aria-label', 'placeholder']) {
      const value = el.getAttribute(name);
      if (value && HANGUL.test(value)) found.push(normalize(value));
    }
  });
  return found;
}
const MESSAGES = koreanMessages();
const pick = (test: (m: string) => boolean): string => {
  const found = MESSAGES.find(test);
  if (!found) throw new Error('index.html <main>에 그 글 마디가 없다');
  return found;
};
/** 바꾼 열쇠(원문은 index.html에서 — 빈칸을 모은 글 그대로) */
const FEATURES_EDIT = pick((m) => m.includes('모깎기 같은 수정'));
const OPEN_LIST = pick((m) => m.startsWith('DWG R2.6') && m.endsWith('새 도면 만들기'));
const SAVE_LIST = pick((m) => m.startsWith('DWG R2000') && m.endsWith('측정'));
const GUIDE = pick((m) => m.startsWith('프로그램이 준비되면'));
const GUIDE_LINK = pick((m) => m.endsWith('표시 문제 점검'));
/** 「누가 만들고 관리하나요?」 답: 「A <a>이름</a>B <a>안내</a>C <a>이슈</a>D」 */
const OWNER = {
  a: pick((m) => m.endsWith('CAD/CAM 개발자')),
  name: pick((m) => m.startsWith('김규태(')),
  b: pick((m) => m.startsWith('의 개인 오픈소스')),
  source: pick((m) => m.startsWith('GitHub에서')),
  c: pick((m) => m.startsWith('를 확인하고')),
  issue: pick((m) => m === 'GitHub 이슈'),
  d: pick((m) => m.startsWith('로 알려')),
};
const OPEN_ERROR = '원래 프로그램에서 DXF로 다시 저장해 여십시오. 그래도 열리지 않으면 GitHub 이슈로 알려 주십시오.';
const localizedMain = (l: Lang) => mainOf(localizeHtml(INDEX, l, site));

describe('정적 소개·안내(index.html #viewer-guide)의 번역(321차)', () => {
  it('한글 글 마디·속성은 빈칸을 모은 글 그대로 네 사전의 열쇠다(빌드 없이 — 틀·조각 나누기에 기대지 않는다)', () => {
    // 정적 소개(제목·소개·단추·지원 목록)와 #viewer-guide(제목·문단·안내 쪽 이름·물음과 답)가 모두 든다
    for (const m of ['OpenCAD 무료 DWG·DXF 캐드', '파일 열기', 'DWG·DXF 도면을 확인하고 수정하는 무료 캐드', '누가 만들고 관리하나요?', 'OpenCAD 사용 안내', OWNER.b, FEATURES_EDIT])
      expect(MESSAGES).toContain(m);
    expect(new Set(MESSAGES).size).toBeGreaterThanOrEqual(30);
    for (const l of LANGS) expect(MESSAGES.filter((m) => !Object.hasOwn(dict[l], m)), l).toEqual([]);
  });

  it('정적 언어 쪽 main에 한국어가 남지 않는다(check:i18n 「untranslated static introduction」을 빌드 앞에서)', () => {
    for (const l of LANGS) expect(normalize(localizedMain(l).textContent ?? '').match(/\S*[가-힣]\S*/g) ?? [], l).toEqual([]);
  });

  it('오역: 수정 기능 목록·독일어 지원 목록·소개 끝 문단의 단추 이름·안내 쪽 이름은 같은 사전의 낱말이다', () => {
    const [en, ja, zh, de] = [dict.en, dict.ja, dict['zh-CN'], dict.de];
    // 자르기 = TRIM, 모깎기 = FILLET(같은 사전의 명령 이름) — 자름(cutting·Schneiden)이나 모따기(倒角)가 아니다
    expect(en['자르기']).toBe('Trim');
    expect(en[FEATURES_EDIT]).toContain('trimming, and filleting');
    for (const [l, d] of [['ja', ja], ['zh-CN', zh], ['de', de]] as const) {
      expect(d[FEATURES_EDIT], l).toContain(d['자르기']!);
      expect(d[FEATURES_EDIT], l).toContain(d['모깎기']!);
    }
    expect(zh[FEATURES_EDIT]).not.toContain(zh['모따기']!);
    // 지원 형식 목록은 320차가 맞춘 이웃 목록 「DWG R2.6~R2018 열기, R2000~R2018 저장」과 같은 부정사 꼴 — 명령꼴(… Sie)이 아니다
    expect(de['DWG R2.6~R2018 열기, R2000~R2018 저장']).toBe('DWG R2.6~R2018 öffnen, R2000~R2018 speichern');
    expect(de[OPEN_LIST]).toBe('DWG R2.6~R2018, DXF R12~R2018 (ASCII/binär) öffnen, neue Zeichnung erstellen');
    expect(de[SAVE_LIST]).toBe('DWG R2000~R2018, DXF R12~R2018 speichern, Abstand/Winkel/Fläche messen');
    for (const k of [OPEN_LIST, SAVE_LIST, FEATURES_EDIT]) expect(de[k], k).not.toMatch(/\bSie\b/);
    // 소개 끝 문단이 가리키는 ‘새 도면’·‘파일 열기’·‘예제 도면 열기’는 바로 위 단추의 번역과 같은 이름(WCAG 3.2.4)
    for (const l of LANGS) for (const button of ['새 도면', '파일 열기', '예제 도면 열기']) expect(dict[l][GUIDE], `${l}: ${button}`).toContain(dict[l][button]!);
    // 안내 쪽 이름 「… 파일 열기와 표시 문제 점검」: 열기는 같은 사전 「… 열기·저장」의 이름꼴 オープン — 「開くと」(열면)가 아니다
    expect(ja['DXF R12~R2018(ASCII·이진) 열기·저장']).toContain('オープン');
    expect(ja[GUIDE_LINK]).toBe('DWG・DXFファイルのオープンと表示の問題の確認');
  });

  it('「누가 만들고 관리하나요?」 답: <a>로 나뉜 조각이 한국어 어순 그대로 이어져도 그 언어의 문장이다(자리 글·뜻 바뀜 없이)', () => {
    const answer = (l: Lang): string => {
      const items: Element[] = Array.from(localizedMain(l).querySelectorAll('details'));
      const item = items.find((d) => normalize(d.querySelector('summary')?.textContent ?? '') === dict[l]['누가 만들고 관리하나요?']);
      return normalize(item?.querySelector('p')?.textContent ?? '');
    };
    // 공용 번역기는 조각마다 옮기고 조각 사이 빈칸은 원문 그대로 둔다
    for (const l of LANGS) {
      const d = dict[l];
      expect(answer(l), l).toBe(`${d[OWNER.a]} ${d[OWNER.name]}${d[OWNER.b]} ${d[OWNER.source]}${d[OWNER.c]} ${d[OWNER.issue]}${d[OWNER.d]}`);
    }
    expect(answer('en')).toBe('AI·CAD/CAM developer Sean Kim’s personal open-source project. Source code and usage instructions on GitHub: check them out, and report drawings that do not open or suggestions for improvement through GitHub Issues, please.');
    expect(answer('ja')).toBe('AI・CAD/CAM開発者 Sean Kimの個人オープンソースプロジェクトです。 GitHubのソースコードと使用ガイドを確認してください。開かない図面や改善に関するご意見は、 GitHub の Issueでお知らせください。');
    expect(answer('zh-CN')).toBe('AI·CAD/CAM开发人员 Sean Kim的个人开源项目。 GitHub 上的源代码和使用说明可供查阅；无法打开的图纸或改进建议请通过 GitHub Issue告诉我们。');
    expect(answer('de')).toBe('AI·CAD/CAM-Entwickler Sean Kim: ein persönliches Open-Source-Projekt. Quellcode und Nutzungshinweise auf GitHub: Sehen Sie sich diese an. Zeichnungen, die sich nicht öffnen lassen, und Verbesserungsvorschläge melden Sie bitte über den GitHub-Issue-Tracker.');
    // GitHub 이슈는 같은 사전 열기 오류 안내(openerror.ts 「…GitHub 이슈로 알려 주십시오.」)의 낱말·맺음과 같다(제품 기능 이름 — 「문제」로 옮기지 않는다)
    expect(readFileSync(new URL('../src/app/openerror.ts', import.meta.url), 'utf8')).toContain(OPEN_ERROR);
    for (const l of ['ja', 'zh-CN', 'de'] as const) expect(dict[l][OPEN_ERROR], l).toContain(dict[l][OWNER.issue]!);
    for (const l of ['ja', 'zh-CN'] as const) expect(dict[l][OPEN_ERROR], l).toContain(dict[l][OWNER.d]!);
  });

  it('거꾸로 찾기: 바꾼 값은 제 원문으로 돌아온다(어느 사전에도 같은 값을 가진 다른 열쇠가 없다)', () => {
    const changed: [Lang, string[]][] = [
      ['en', [FEATURES_EDIT, GUIDE, OWNER.b, OWNER.c, OWNER.d]],
      ['ja', [GUIDE_LINK, OWNER.issue, OWNER.d]],
      ['zh-CN', [FEATURES_EDIT, GUIDE, OWNER.b, OWNER.c, OWNER.issue, OWNER.d]],
      ['de', [OPEN_LIST, SAVE_LIST, FEATURES_EDIT, OWNER.b, OWNER.c, OWNER.issue, OWNER.d]],
    ];
    expect(changed.map(([, keys]) => keys.length)).toEqual([5, 3, 6, 7]);
    for (const [l, keys] of changed)
      for (const k of keys) {
        expect(sourceMessage(dict[l][k]!), `${l}: ${k}`).toBe(k);
        for (const other of LANGS)
          expect(Object.entries(dict[other]).filter(([key, value]) => value === dict[l][k] && key !== k).map(([key]) => key), `${other} ← ${l}: ${k}`).toEqual([]);
      }
  });
});
