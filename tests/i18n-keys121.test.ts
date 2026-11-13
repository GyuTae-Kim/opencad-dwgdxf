/**
 * 121차: 명령행 옵션 이름 열쇠 가르기에 남은 것(120차 MVIEW와 같은 길 — 한국어 화면 글은 그대로, 끝에 보이지 않는 U+2060).
 * Autodesk 도움말(2026 ENU·DEU·JPN·CHS)의 옵션 이름으로:
 * - COPY 배열 맞춤(Fit·Anpassen·フィット·调整)과 TEXT 자리맞추기 맞춤(Fit·Anpassen·フィット·调整)은 MVIEW·맞춤 탭 열쇠 '맞춤\u{2060}'.
 *   전에는 스플라인 맞춤 열쇠라 중국어 명령행에 拟合, 독일어 COPY 통째 프롬프트에 영어 Fit이 보였다.
 * - -PLOT 축척 맞춤(Fit·Einpassen·フィット·布满)은 새 열쇠 '맞춤\u{2060}\u{2060}'. 전에는 Anpassen·拟合(옵션 조각)이었다.
 * - LEADER 주석(A)(Annotation·Maßtext·注釈·注释)은 새 열쇠 '주석\u{2060}' — 주석 특성(Annotative)의 "주석(A)"과 같은 열쇠라 영어 명령행에
 *   Annotative가 보였다. 지시선 주석의 독일어 Kommentar는 LEADER 도움말 Maßtext, QLEADER 도움말 Beschriftung(Führungslinienbeschriftung·
 *   Beschriftungstyp)으로, 중국어 QLEADER 주석 유형 评论类型은 注释类型으로.
 * JUSTIFYTEXT(도움말 拟合)·스플라인 맞춤·주석 특성 "주석(A)"은 그대로. 옵션 이름을 쳐서 고르는 일치는 U+2060을 빼고 견준다(keywordLabelIs).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { installLocalization } from '../src/app/i18n';
import { installFileGuard } from '../src/app/fileguard';
import { CommandLine } from '../src/app/commandline';
import { createNewDocument } from '../src/core/newdoc';
import { keywordLabelIs, matchKeyword } from '../src/app/dashcmds-ask';
import { PLOT_FIT, parsePlotScale } from '../src/app/dashcmds-plot';
import { JUSTIFY_PROMPT } from '../src/app/textedit/commands';
import { translate } from '../site/i18n.mjs';

const LANGS = ['en', 'de', 'ja', 'zh-CN'] as const;
const WJ = String.fromCodePoint(0x2060);
const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
const tr = (k: string) => LANGS.map((l) => translate(k, l));
const COPY = `두 번째 점 지정 또는 [맞춤${WJ}(F)]:`;
const LEADER = `다음 점 지정 또는 [주석${WJ}(A)/형식(F)/명령 취소(U)] <주석${WJ}>:`;
const { JSDOM } = createRequire(import.meta.url)('jsdom');

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.unstubAllGlobals();
});

/** 명령행(조각마다 옮김)에 보이는 프롬프트 글 */
async function shown(url: string, prompt: string): Promise<string> {
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
}
const SITE = 'https://gyutae-kim.github.io/opencad-dwgdxf/';

describe('명령행 맞춤·지시선 주석 옵션 열쇠(121차)', () => {
  it('소스는 보이는 이스케이프로 쓴다', () => {
    for (const f of ['app/modify.ts', 'app/textedit/commands.ts', 'app/dashcmds-plot.ts', 'app/leaderold.ts']) expect(src(f), f).not.toContain(WJ);
    expect(src('app/modify.ts')).toContain(String.raw`getPoint('두 번째 점 지정 또는 [맞춤\u{2060}(F)]:', { base, keywords: [{ key: 'F', label: '맞춤\u{2060}' }]`);
    expect(src('app/dashcmds-plot.ts')).toContain(String.raw`export const PLOT_FIT = '맞춤\u{2060}\u{2060}';`);
    expect(src('app/leaderold.ts')).toContain(String.raw`{ key: 'A', label: '주석\u{2060}' }`);
    expect(src('app/leaderold.ts')).toContain(String.raw`'다음 점 지정 또는 [주석\u{2060}(A)/형식(F)/명령 취소(U)] <주석\u{2060}>:'`);
    expect(PLOT_FIT).toBe(`맞춤${WJ}${WJ}`);
  });

  it('COPY 배열·TEXT 자리맞추기 맞춤은 MVIEW와 같은 도움말 낱말(중국어 调整), 대화 상자·JUSTIFYTEXT는 그대로', () => {
    expect(tr(COPY)).toEqual(['Specify second point or [Fit (F)]:', 'Geben Sie den zweiten Punkt oder [Anpassen (F)] an:', '2 番目の点を指定、または [フィット(F)]:', '指定第二个点或 [调整(F)]：']);
    // TEXT 자리맞추기 프롬프트: 맞춤만 가른 열쇠, 나머지 옵션은 그대로
    expect(JUSTIFY_PROMPT).toContain(`/중간(M)/맞춤${WJ}(F)/맨 위 왼쪽(TL)/`);
    expect(JUSTIFY_PROMPT.split(WJ).length).toBe(2);
    expect(tr(`맞춤${WJ}(F)`)).toEqual(['Fit (F)', 'Anpassen (F)', 'フィット(F)', '调整(F)']);
    // 대화 상자 목록(속성 정의)의 TEXT_JUSTIFY 이름과 JUSTIFYTEXT 옵션(도움말 拟合)은 가르지 않는다
    expect(src('app/textedit/commands.ts')).toContain(`['F', '맞춤', 5, 0,`);
    expect(src('app/modify2.ts')).toContain(`['F', '맞춤'],`);
    expect(translate('맞춤', 'zh-CN')).toBe('拟合');
  });

  it('-PLOT 축척 맞춤은 Einpassen·布满(옵션 조각·통째 프롬프트·잘못 친 축척 알림)', () => {
    expect(tr(`${PLOT_FIT}(F)`)).toEqual(['Fit (F)', 'Einpassen (F)', 'フィット(F)', '布满(F)']);
    expect(tr(PLOT_FIT)).toEqual(['Fit', 'Einpassen', 'フィット', '布满']);
    const p = `플롯 축척 입력 (출력 밀리미터=도면 단위)또는 [${PLOT_FIT}(F)] <1=1>:`;
    expect(translate(p, 'de')).toContain('[Einpassen(F)] <1=1>:');
    expect(translate(p, 'zh-CN')).toContain('[布满(F)] <1=1>:');
    const bad = '축척은 "1=100"처럼 입력하거나 맞춤(F)을 입력하십시오.';
    expect([translate(bad, 'de'), translate(bad, 'zh-CN')]).toEqual(['Skalierung als „1=100“ eingeben oder „Einpassen(F)“ eingeben.', '输入比例“1=100”或输入“布满(F)”。']);
  });

  it('LEADER 주석(A)는 Annotation·Maßtext·注釈·注释, 주석 특성의 주석(A)은 그대로', () => {
    expect(tr(`주석${WJ}(A)`)).toEqual(['Annotation (A)', 'Maßtext (A)', '注釈(A)', '注释(A)']);
    expect(translate('주석(A)', 'en')).toBe('Annotative (A)');
    expect(tr(LEADER)).toEqual([
      'Specify next point or [Annotation (A)/Format (F)/Undo (U)] <Annotation>:',
      'Nächsten Punkt angeben oder [Maßtext (A)/Format (F)/Rückgängig (U)] <Maßtext>:',
      '次の点を指定、または [注釈(A)/形式(F)/元に戻す(U)] <注釈>:',
      '指定下一个点或使用 [注释(A)/格式化(F)/撤销(U)] <注释>：',
    ]);
  });

  it('지시선 주석 줄의 독일어 Kommentar·Anmerkung을 도움말 낱말로(LEADER Maßtext, QLEADER Beschriftung), 중국어 注释类型', () => {
    const keys = [
      '주석 문자의 다음 행 입력:',
      '주석 문자의 첫 번째 행 입력 <여러 줄 문자>:',
      '주석 문자의 첫 번째 행 입력 또는 <옵션>:',
      '주석 옵션 입력 [',
      '주석 옵션 입력 [공차(T)/복사(C)/블록(B)/없음(N)/여러 줄 문자(M)] <여러 줄 문자>:',
      '주석 유형',
      '지시선 주석',
      '단일 행 문자는 지시선 주석으로 이어지지 않습니다(복사만 합니다).',
      LEADER,
    ];
    for (const k of keys) {
      expect(translate(k, 'de'), k).not.toMatch(/Kommentar|Anmerkung|Hinweislinie/);
      expect(translate(k, 'ja'), k).not.toMatch(/注記/);
      expect(translate(k, 'zh-CN'), k).not.toMatch(/评论|引导注释/);
    }
    expect(tr('주석 유형')).toEqual(['Annotation type', 'Beschriftungstyp', '注釈のタイプ', '注释类型']);
    expect(translate('지시선 주석', 'de')).toBe('Führungslinienbeschriftung');
    expect(translate('주석 문자의 첫 번째 행 입력 또는 <옵션>:', 'de')).toBe('Erste Zeile des Maßtexts eingeben oder <Optionen>:');
    expect(translate('주석 문자의 첫 번째 행 입력 <여러 줄 문자>:', 'de')).toBe('Erste Zeile des Beschriftungstexts eingeben <Mehrzeiliger Text>:');
    // 중국어 첫 줄 프롬프트는 기본값 꺾쇠를 지킨다(명령행이 < >를 읽는다)
    expect(translate('주석 문자의 첫 번째 행 입력 또는 <옵션>:', 'zh-CN')).toBe('输入第一行注释文本或 <选项>：');
    expect(translate('주석 문자의 첫 번째 행 입력 <여러 줄 문자>:', 'zh-CN')).toBe('输入第一行注释文本 <多行文本>：');
  });

  it('명령행(조각마다 옮김): 중국어 -PLOT 布满·TEXT 调整, 영어 LEADER Annotation, 한국어 화면은 그대로', async () => {
    const plot = `플롯 축척 입력 (출력 밀리미터=도면 단위)또는 [${PLOT_FIT}(F)] <${PLOT_FIT}>:`;
    const zhPlot = await shown(`${SITE}zh-CN/`, plot);
    expect(zhPlot).toContain('[布满(F)]');
    expect(zhPlot).toMatch(/<布满>:?$/);
    const zhText = await shown(`${SITE}zh-CN/`, JUSTIFY_PROMPT);
    expect(zhText).toContain('/调整(F)/');
    expect(zhText).not.toContain('拟合');
    const enLeader = await shown(`${SITE}en/`, LEADER);
    expect(enLeader).toContain('[Annotation (A)/');
    expect(enLeader).toMatch(/<Annotation>:$/);
    expect(await shown(`${SITE}de/`, COPY)).toContain('Anpassen (F)');
    expect(await shown(SITE, LEADER)).toBe(LEADER);
  });

  it('중국어 격자(grid)는 GRID·제도 설정 도움말 낱말 栅格, 메시·해치 무늬 설명·눈금은 그대로', () => {
    const zh = JSON.parse(readFileSync(new URL('../site/locales/zh-CN.json', import.meta.url), 'utf8')) as Record<string, string>;
    expect(['격자', '그리드', '격자 X 간격', '스냅 및 그리드', '<스냅 및 그리드>:'].map((k) => zh[k])).toEqual(['栅格', '栅格', '栅格 X 间距', '捕捉和栅格', '<捕捉和栅格>:']);
    expect(zh['스냅 유형 입력 [극좌표(P)/그리드(G)] <그리드>:']).toBe('输入捕捉类型 [极坐标 (P)/栅格 (G)] <栅格>：');
    // 격자·그리드 열쇠에 网格이 남은 것은 해치 무늬 설명(NET·NET3 등)과 무늬 정의 오류 알림뿐
    const left = Object.entries(zh).filter(([k, v]) => /격자|그리드/.test(k) && v.includes('网格')).map(([k]) => k);
    expect(left.sort()).toEqual(['가로세로 격자', '격자 철망', '무늬 선분 방향이 격자 방향이 아님: {0}', '세 방향 격자'].sort());
    expect(['메시', '폴리곤 메시'].map((k) => zh[k])).toEqual(['网格', '多边形网格']);
  });

  it('한국어로 "맞춤"·"주석"을 쳐도 그 옵션을 고른다(U+2060을 빼고 견줌)', () => {
    expect(['맞춤', PLOT_FIT, 'F'].map((t) => matchKeyword(t, [{ key: 'F', label: PLOT_FIT }]))).toEqual(['F', 'F', 'F']);
    expect(['맞춤', 'f'].map((t) => matchKeyword(t, [{ key: 'F', label: `맞춤${WJ}` }]))).toEqual(['F', 'F']);
    const kws = [
      { key: 'A', label: `주석${WJ}` },
      { key: 'F', label: '형식' },
      { key: 'U', label: '명령 취소' },
    ];
    expect(['주석', 'a', '형식', '주석문자'].map((t) => matchKeyword(t, kws))).toEqual(['A', 'A', 'F', null]);
    expect(keywordLabelIs(PLOT_FIT, '맞춤')).toBe(true);
    expect([parsePlotScale('맞춤'), parsePlotScale(PLOT_FIT), parsePlotScale('fit'), parsePlotScale('1=100')]).toEqual(['fit', 'fit', 'fit', { paper: 1, units: 100 }]);
  });
});
