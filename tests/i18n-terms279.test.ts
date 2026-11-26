/**
 * 279차(278차 보고 두 것): 278차는 「다수 번역으로 맞추기」라 다수 번역 자체가 틀린 것은 두었다. 이번에는 CAD 뜻(이 앱 코드가 하는 일)을 근거로 고쳤다.
 * - 걸침(crossing — src/app/pick.ts select: window는 완전히 안, crossing은 경계에 걸치기만 해도 고름): ja 吊り·掛け(매달다), zh 重叠·de Überlappung
 *   (이 사전에서 「겹침」(OVERKILL·선택 순환)의 번역이라 걸침과 겹침이 같은 낱말이 됨) → ja 交差(사전 안 이미 3곳), zh 窗交(윈도우 窗口의 짝), de Kreuzung(다수).
 * - 대칭으로 플롯(-): 코드는 upsideDown(pagesetup-ui.ts rotation & 2, plot.ts turnPage — 쪽을 180° 돌림)인데 네 언어 모두 대칭(symmetry)으로 옮겼다
 *   → 같은 값을 묻는 -PLOT 「위 아래를 뒤집어 플롯?」의 번역 낱말로(zh 플롯 낱말은 같은 대화 상자 칸·사전 다수의 打印).
 * - 278차가 30곳 한도로 남긴 넷: zh·de 리본 툴팁 「대칭 (MI)」, zh 「가운데 버튼으로 끌거나…」 居中按钮(가운데 맞춤 단추), de 「치수 {0} = {1}」 Abmessung.
 * 표는 docs/CHANGELOG.md 279차 절.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const LANGS = ['en', 'de', 'ja', 'zh-CN'] as const;
type Lang = (typeof LANGS)[number];
const load = (lang: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../site/locales/${lang}.json`, import.meta.url), 'utf8'));
const dict = Object.fromEntries(LANGS.map((l) => [l, load(l)])) as Record<Lang, Record<string, string>>;

/** 객체 선택 프롬프트(src/app/selmethod.ts SELECT_HELP) */
const SELECT = '점 또는 윈도우(W)/최종(L)/걸침(C)/상자(BOX)/모두(ALL)/울타리(F)/윈도우 폴리곤(WP)/걸침 폴리곤(CP)/그룹(G)/추가(A)/제거(R)/다중(M)/이전(P)/명령 취소(U)/자동(AU)/단일(SI)이(가) 필요함';

describe('다수 번역이 틀렸던 용어(279차)', () => {
  it('걸침은 매달기·겹침이 아니라 交差·窗交·Kreuzung이고 「겹침」과 다른 낱말이다', () => {
    const bans: [Lang, RegExp][] = [
      ['ja', /吊り|掛け/],
      ['zh-CN', /重叠|跨|例如/],
      ['de', /Überlapp/],
    ];
    for (const [lang, ban] of bans)
      for (const [key, value] of Object.entries(dict[lang])) if (key.includes('걸침')) expect(value, `${lang}: ${key}`).not.toMatch(ban);
    for (const lang of LANGS) expect(dict[lang]['걸침'], lang).not.toBe(dict[lang]['겹침']);
    const forms: [key: string, ja: string, zh: string][] = [
      ['걸침', '交差', '窗交'],
      ['걸침 올가미', '交差なげなわ', '窗交套索'],
      ['걸침 폴리곤', '交差ポリゴン', '窗交多边形'],
    ];
    for (const [key, ja, zh] of forms) {
      expect(dict.ja[key], `ja: ${key}`).toBe(ja);
      expect(dict['zh-CN'][key], `zh-CN: ${key}`).toBe(zh);
    }
    expect(dict.ja['걸침 윈도우(C) 또는 걸침 폴리곤(CP)으로 선택하십시오.']).toContain('交差窓（C）');
    expect(dict['zh-CN']['윈도우 선택 / 걸침 선택']).toBe('窗口选择 / 窗交选择');
    expect(dict['zh-CN'][SELECT]).toContain('/窗交(C)/');
    expect(dict['zh-CN'][SELECT]).toContain('/窗交多边形(CP)/');
    expect(dict.de[SELECT]).toContain('/Kreuzung (C)/');
    expect(dict.de[SELECT]).toContain('/Kreuzungspolygon (CP)/');
  });

  it('대칭으로 플롯은 위아래 뒤집어 플롯(코드 upsideDown)이고 「위 아래를 뒤집어 플롯?」과 같은 낱말을 쓴다', () => {
    const core: Record<Lang, string> = { en: 'upside down', ja: '上下を反転', 'zh-CN': '倒置', de: 'Um 180 Grad gedreht' };
    for (const lang of LANGS) {
      for (const key of ['대칭으로 플롯', '대칭으로 플롯(-)', '위 아래를 뒤집어 플롯?']) {
        expect(dict[lang][key], `${lang}: ${key}`).toContain(core[lang]);
        expect(dict[lang][key], `${lang}: ${key}`).not.toMatch(/symmetr|対称|对称/i);
      }
      const gap = lang === 'en' || lang === 'de' ? ' ' : '';
      expect(dict[lang]['대칭으로 플롯(-)'], lang).toBe(`${dict[lang]['대칭으로 플롯']}${gap}(-)`);
    }
    expect(dict.en['대칭으로 플롯']).toBe('Plot upside down');
    expect(dict['zh-CN']['대칭으로 플롯']).toBe('倒置打印');
    expect(dict.de['대칭으로 플롯']).toBe('Um 180 Grad gedreht plotten');
  });

  it('278차가 남긴 넷: 「대칭 (MI)」·「치수 {0} = {1}」은 같은 사전의 「대칭」·「치수」이고 zh 가운데 버튼은 中间按钮', () => {
    for (const lang of LANGS) {
      expect(dict[lang]['대칭 (MI)'], lang).toBe(`${dict[lang]['대칭']} (MI)`);
      expect(dict[lang]['치수 {0} = {1}'], lang).toBe(`${dict[lang]['치수']} {0} = {1}`);
    }
    expect(dict['zh-CN']['가운데 버튼으로 끌거나, 두 점을 찍어 이동합니다.']).toContain('中间按钮');
    for (const [key, value] of Object.entries(dict['zh-CN'])) if (key.includes('가운데 버튼')) expect(value, key).not.toContain('居中');
  });
});
