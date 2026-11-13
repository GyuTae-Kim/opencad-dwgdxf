/**
 * 120차: MVIEW 명령행 옵션 "맞춤"(Fit)을 치수 스타일 맞춤 탭(119차)과 같은 열쇠 '맞춤\u{2060}'(끝에 보이지 않는 U+2060)로 가른다.
 * Autodesk MVIEW 도움말의 옵션 제목이 en Fit, de Anpassen, ja フィット, zh 调整(2023 ENU·DEU·JPN·CHS)라 맞춤 탭 번역과 네 언어가 같다.
 * 전에는 옵션 조각 "맞춤(F)"이 스플라인 맞춤과 같은 열쇠라 중국어 명령행에 拟合(곡선 맞춤)이, 통째 프롬프트에는 适应·布满이 보였다.
 * 스플라인·폴리선 맞춤(拟合)과 복사 배열·플롯 축척·문자 자리맞춤의 맞춤은 도움말 낱말을 다 확인하지 못해 그대로 둔다.
 * 한국어 화면 글은 그대로 "맞춤"이고, 옵션 이름을 쳐서 고르는 일치는 U+2060을 빼고 견준다(App·matchKeyword·askKeyword).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { installLocalization } from '../src/app/i18n';
import { installFileGuard } from '../src/app/fileguard';
import { CommandLine } from '../src/app/commandline';
import { createNewDocument } from '../src/core/newdoc';
import { keywordLabelIs, matchKeyword } from '../src/app/dashcmds-ask';
import { translate } from '../site/i18n.mjs';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

const LANGS = ['en', 'de', 'ja', 'zh-CN'] as const;
const WJ = String.fromCodePoint(0x2060);
const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
const MVIEW = `뷰포트 구석 지정 또는 [켜기(ON)/끄기(OFF)/맞춤${WJ}(F)/잠금(L)/객체(O)/폴리곤(P)/2/3/4] <맞춤${WJ}>:`;
const FIRST = `첫 번째 구석 지정 또는 [맞춤${WJ}(F)] <맞춤${WJ}>:`;

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.unstubAllGlobals();
});

describe('MVIEW 맞춤 옵션 열쇠', () => {
  it('소스는 보이는 이스케이프로 쓰고 MVIEW 두 프롬프트와 옵션이 같은 열쇠', () => {
    const s = src('app/vpcmds.ts');
    expect(s).not.toContain(WJ);
    expect(s).toContain(String.raw`const FIT_OPT = '맞춤\u{2060}';`);
    expect(s).toContain(String.raw`'뷰포트 구석 지정 또는 [켜기(ON)/끄기(OFF)/맞춤\u{2060}(F)/잠금(L)/객체(O)/폴리곤(P)/2/3/4] <맞춤\u{2060}>:'`);
    expect(s).toContain(String.raw`'첫 번째 구석 지정 또는 [맞춤\u{2060}(F)] <맞춤\u{2060}>:'`);
    expect(s).not.toMatch(/label: '맞춤'/);
  });

  it('옵션 조각·통째 프롬프트는 도움말 낱말(중국어 调整), 다른 맞춤은 그대로', () => {
    expect(LANGS.map((l) => translate(`맞춤${WJ}(F)`, l))).toEqual(['Fit (F)', 'Anpassen (F)', 'フィット(F)', '调整(F)']);
    expect(translate(MVIEW, 'zh-CN')).toBe('指定视口角点或 [开启(ON)/关闭(OFF)/调整(F)/锁定(L)/对象(O)/多边形(P)/2/3/4] <调整>：');
    expect(translate(FIRST, 'zh-CN')).toBe('指定第一个角点或 [调整(F)] <调整>：');
    expect(translate(MVIEW, 'en')).toContain('/Fit (F)/');
    expect(translate(MVIEW, 'de')).toMatch(/\/Anpassen \(F\)\/.*<Anpassen>:$/);
    expect(translate(FIRST, 'ja')).toBe('最初の角を指定、または [フィット(F)] <フィット>:');
    for (const l of LANGS) expect(translate(MVIEW, l), l).not.toMatch(/[가-힣]/);
    // 스플라인 맞춤은 그대로(복사 배열 맞춤은 121차에 같은 열쇠로 — tests/i18n-keys121.test.ts)
    expect(translate('맞춤(F)', 'zh-CN')).toBe('拟合(F)');
  });

  it('한국어로 "맞춤"을 쳐도 그 옵션을 고른다(U+2060을 빼고 견줌)', () => {
    const kws = [
      { key: 'ON', label: '켜기' },
      { key: 'F', label: `맞춤${WJ}` },
    ];
    expect(['맞춤', `맞춤${WJ}`, 'f', 'F', '켜기'].map((t) => matchKeyword(t, kws))).toEqual(['F', 'F', 'F', 'F', 'ON']);
    expect(matchKeyword('맞춤점', kws)).toBeNull();
    expect([keywordLabelIs(`맞춤${WJ}`, '맞춤'), keywordLabelIs('맞춤', '맞춤'), keywordLabelIs('맞춤', `맞춤${WJ}`)]).toEqual([true, true, false]);
    // 앱의 명령행·선택 키워드와 askKeyword도 같은 일치를 쓴다
    expect(src('app/app.ts').match(/keywordLabelIs\(k\.label, t\)/g)?.length).toBe(2);
    expect(src('app/util2-ui.ts')).toContain('keywordLabelIs(x.label, t)');
  });

  it('명령행(조각마다 옮김)도 중국어는 调整, 한국어 화면은 그대로', async () => {
    const run = async (url: string, prompt: string) => {
      const dom = new JSDOM('<!doctype html><html><head><title>OpenCAD</title></head><body><div id="app"><header class="titlebar"></header><div id="cmd"></div></div></body></html>', { url });
      for (const name of ['window', 'document', 'Node', 'Element', 'HTMLAnchorElement', 'MutationObserver', 'location', 'history', 'localStorage', 'CustomEvent']) vi.stubGlobal(name, (dom.window as unknown as Record<string, unknown>)[name]);
      installFileGuard({ docs: [{ doc: createNewDocument('metric') }] });
      dispose = await installLocalization(document.getElementById('app')!);
      const cmd = new CommandLine(document.getElementById('cmd')!, { submit() {}, cancel() {}, suggest: () => [], keyword() {}, repeat() {} });
      cmd.setPrompt(prompt);
      await new Promise((r) => setTimeout(r, 0));
      const text = document.querySelector('.cmd-prompt')!.textContent!;
      dispose();
      dispose = undefined;
      vi.unstubAllGlobals();
      return text;
    };
    const zh = await run('https://gyutae-kim.github.io/opencad-dwgdxf/zh-CN/', MVIEW);
    expect(zh).toContain('/调整(F)/');
    expect(zh).toMatch(/<调整>:$/);
    expect(zh).not.toContain('拟合');
    expect(await run('https://gyutae-kim.github.io/opencad-dwgdxf/zh-CN/', FIRST)).toMatch(/\[调整\(F\)\] <调整>:$/);
    expect(await run('https://gyutae-kim.github.io/opencad-dwgdxf/', MVIEW)).toBe(MVIEW);
  });
});
