/**
 * 287차: 치수(DIM) 명령 묶음의 번역 — 뜻이 어긋난 번역(오역)과 사전에 열쇠가 없어 네 언어 모두 한국어로 보이던 글(빠진 번역).
 * - 빠진 번역: 옵션 목록을 코드로 짜 맞추는 프롬프트(DIMLINEAR·DIMALIGNED의 `kws.map(...)`, 스마트 치수 DIM의 `tail(kws)`·원·호 방식 고리)의
 *   통째 열쇠와 명령행 조각(「앞 글 [」·옵션 「이름(글자)」·「] 뒤 글」), 기본값이 옵션이 아닌 뒤 조각(<다음>·<추가(A)>·<"현재 사용">),
 *   틀에 한국어가 끼던 결과 줄(「새 치수의 도면층 = 현재 사용」)과 치수 스타일 관리자 목록 줄(「⁨이름⁩ (현재)」).
 * - 오역: 꺾기(jog)를 끊기(break)·굽힘·쉼으로, 끊기를 전화 끊기·치수 기입으로, 홈(H)을 도랑·원점·시작점으로, 기준 치수를 표준 치수로,
 *   de 첫 치수보조선을 치수선으로, 세로좌표를 수직 좌표로 옮긴 것 — 같은 사전 안의 맞는 번역(같은 프롬프트의 조각·옵션·통째)으로 고쳤다.
 * 프롬프트는 소스에서 모은다(dimsmart KW_*·RADIAL_KW·RADIAL_HEAD·DIM_MAIN_PROMPT, dimcmds 선형 kws).
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installLocalization } from '../src/app/i18n';
import { guardedTranslate, installFileGuard, translateTail } from '../src/app/fileguard';
import { ft } from '../src/app/filetext';
import { CommandLine } from '../src/app/commandline';
import { createNewDocument } from '../src/core/newdoc';
import { translate } from '../site/i18n.mjs';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

const LANGS = ['en', 'de', 'ja', 'zh-CN'] as const;
type Lang = (typeof LANGS)[number];
const HANGUL = /[가-힣]/;
const load = (lang: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../site/locales/${lang}.json`, import.meta.url), 'utf8'));
const dict = Object.fromEntries(LANGS.map((l) => [l, load(l)])) as Record<Lang, Record<string, string>>;
const src = (f: string) => readFileSync(new URL(`../src/app/${f}`, import.meta.url), 'utf8');
const opt = (m: RegExpMatchArray) => `${m[2]}(${m[1]})`;
const between = (text: string, start: string, end: string) => {
  const i = text.indexOf(start);
  return text.slice(i, text.indexOf(end, i + start.length));
};

const smart = src('dimsmart.ts');
const dimc = src('dimcmds.ts');
/** 스마트 치수 DIM의 키워드(KW_M·KW_T·KW_N·KW_U)와 원·호 방식(RADIAL_KW·RADIAL_HEAD) */
const KW = Object.fromEntries([...smart.matchAll(/const (KW_[A-Z]): Keyword = \{ key: '([^']+)', label: '([^']+)' \}/g)].map((m) => [m[1]!, `${m[3]}(${m[2]})`]));
const RK = Object.fromEntries([...between(smart, 'const RADIAL_KW', '};').matchAll(/(\w+): \{ key: '([^']+)', label: '([^']+)' \}/g)].map((m) => [m[1]!, `${m[3]}(${m[2]})`]));
const HEAD = Object.fromEntries([...between(smart, 'const RADIAL_HEAD', '};').matchAll(/(\w+): '([^']+)'/g)].map((m) => [m[1]!, m[2]!]));
const MODES = /const modes: RadialMode\[\] = isArc \? \[([^\]]+)\] : \[([^\]]+)\]/.exec(smart)!.slice(1, 3).map((s) => s.split(', ').map((x) => x.replace(/'/g, '')));
const TEXT = [KW.KW_M!, KW.KW_T!, KW.KW_N!, KW.KW_U!];
const tail = (o: string[]) => `[${o.join('/')}]:`;
/** DIMLINEAR(수평(H)·수직(V)·회전(R) 포함)·DIMALIGNED(dimcmds.ts linear — 처음 셋) */
const LIN = [...between(dimc, "const kws: Keyword[] = [{ key: 'M'", '치수선의 위치 지정 또는 [').matchAll(/\{ key: '([^']+)', label: '([^']+)' \}/g)].map(opt);
const DIM_MAIN = /export const DIM_MAIN_PROMPT = '([^']+)'/.exec(smart)![1]!;
const LAYER = '도면층 이름 입력 또는 도면층 이름을 지정할 객체 선택 또는 [현재 사용(.)] <"{0}">:';
/** 287차에 통째 열쇠를 더한 괄호 프롬프트(옵션 목록을 코드로 짬) */
const NEW_WHOLE = [
  `치수선의 위치 지정 또는 ${tail(LIN)}`,
  `치수선의 위치 지정 또는 ${tail(LIN.slice(0, 3))}`,
  `각도 치수 위치 지정 또는 ${tail(TEXT)}`,
  `치수선 위치 지정 또는 각도에 대한 두 번째 선 지정 ${tail(TEXT)}`,
  `치수선 위치 지정 또는 ${tail(TEXT)}`,
  ...MODES.flatMap((modes) => modes.filter((m) => m !== 'jogged').map((mode) => `${HEAD[mode]} 또는 ${tail([...modes.filter((m) => m !== mode).map((m) => RK[m]!), ...TEXT])}`)),
  `치수선 위치 지정 또는 ${tail([KW.KW_M!, KW.KW_T!, KW.KW_N!])}`,
  `두 번째 치수보조선 원점 지정 또는 ${tail(['선택(S)', '간격띄우기(O)', KW.KW_U!]).replace(/:$/, '')} <선택>:`,
  `지시선 끝점 지정 또는 ${tail(['X데이텀(X)', 'Y데이텀(Y)', ...TEXT])}`,
];
const LAYER_CUR = LAYER.replace('{0}', '현재 사용');
/** 기본값이 옵션이 아닌 뒤 조각을 쓰는 프롬프트(DIMREASSOCIATE·-DIMINSPECT) */
const BACKS = ['첫 번째 치수보조선 원점 지정 또는 [객체 선택(S)] <다음>:', '각도 정점 지정 또는 [호 또는 원 선택(S)] <다음>:', '검사 데이터 추가 또는 [제거(R)] <추가(A)>:'];
const squash = (s: string | undefined) => (s ?? '').replace(/\s/g, '');

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.unstubAllGlobals();
});

describe('치수 묶음의 번역(287차)', () => {
  it('명령행 입력 줄(앞 글 「… [」·옵션 「이름(글자)」·뒤 글 「] <…>:」)이 네 언어 모두 한국어 없이 보인다', async () => {
    // 소스에서 모은 프롬프트가 명령이 내는 글과 같다(코드가 짜 맞추는 꼴)
    expect(TEXT).toEqual(['여러 줄 문자(M)', '문자(T)', '문자 각도(N)', '명령 취소(U)']);
    expect(LIN).toEqual(['여러 줄 문자(M)', '문자(T)', '각도(A)', '수평(H)', '수직(V)', '회전(R)']);
    expect(MODES).toEqual([['radius', 'diameter', 'jogged', 'arclen', 'angular'], ['radius', 'diameter', 'jogged', 'angular']]);
    expect(NEW_WHOLE).toHaveLength(15);
    expect(NEW_WHOLE[5]).toBe('반지름 치수 위치 지정 또는 [지름(D)/꺾기(J)/호 길이(L)/각도(A)/여러 줄 문자(M)/문자(T)/문자 각도(N)/명령 취소(U)]:');
    for (const s of ['각도 치수 위치 지정 또는 ${tail(TEXT_KWS)}', '치수선 위치 지정 또는 각도에 대한 두 번째 선 지정 ${tail(TEXT_KWS)}', '${RADIAL_HEAD[mode]} 또는 ${tail(kws)}', "도면층 이름 입력 또는 도면층 이름을 지정할 객체 선택 또는 [현재 사용(.)] <\"${cur === '.' ? '현재 사용'"])
      expect(smart).toContain(s);
    for (const b of BACKS) expect(src('dimassoc.ts') + src('diminspect.ts') + src('dimcmds.ts')).toContain(`'${b}'`);
    const prompts = [DIM_MAIN, ...NEW_WHOLE, LAYER_CUR, ...BACKS];
    const left: string[] = [];
    for (const l of LANGS) {
      const dom = new JSDOM('<!doctype html><html><head><title>OpenCAD</title></head><body><div id="app"><header class="titlebar"></header><div id="cmd"></div></div></body></html>', {
        url: `https://gyutae-kim.github.io/opencad-dwgdxf/${l}/`,
      });
      for (const name of ['window', 'document', 'Node', 'Element', 'HTMLAnchorElement', 'MutationObserver', 'location', 'history', 'localStorage', 'CustomEvent'])
        vi.stubGlobal(name, (dom.window as unknown as Record<string, unknown>)[name]);
      installFileGuard({ docs: [{ doc: createNewDocument('metric') }] });
      dispose = await installLocalization(document.getElementById('app')!);
      const cmd = new CommandLine(document.getElementById('cmd')!, { submit() {}, cancel() {}, suggest: () => [], keyword() {}, repeat() {} });
      for (const p of prompts) {
        cmd.setPrompt(p);
        await new Promise((r) => setTimeout(r, 0));
        const shown = document.querySelector('.cmd-prompt')!.textContent!;
        if (HANGUL.test(shown)) left.push(`${l}: ${shown}`);
      }
      dispose();
      dispose = undefined;
      vi.unstubAllGlobals();
      dom.window.close();
    }
    expect(left).toEqual([]);
  });

  it('통째 프롬프트(기록 줄·휴대폰 카드·커서 옆)·결과 줄·치수 스타일 목록 줄이 네 언어 모두 한국어 없이 보인다', () => {
    const show = (s: string, l: string) => translateTail(s, translate(s, l), (x) => translate(x, l));
    const left: string[] = [];
    for (const l of LANGS) {
      for (const p of [...NEW_WHOLE, LAYER_CUR]) for (const s of p.endsWith('>:') ? [p, `${p} .`] : [p]) if (HANGUL.test(show(s, l))) left.push(`${l}: ${show(s, l)}`);
      for (const s of ['새 치수의 도면층 = 현재 사용', `${ft('Standard')} (현재)`, `${ft('Standard')} (현재)  · 3`]) {
        const t = guardedTranslate(s, l) ?? translate(s, l);
        if (HANGUL.test(t)) left.push(`${l}: ${t}`);
      }
    }
    expect(left).toEqual([]);
    expect(show(NEW_WHOLE[0]!, 'en')).toBe('Specify location for dimension line or [Multiline (M)/Text (T)/Angle (A)/Horizontal (H)/Vertical (V)/Rotate (R)]:');
    expect(guardedTranslate(`${ft('ISO-25')} (현재)  · 3`, 'de')).toBe('ISO-25 (aktuell) · 3');
    expect(translate('새 치수의 도면층 = 현재 사용', 'zh-CN')).toBe('新标注的图层 = 使用当前');
  });

  it('고친 번역은 같은 사전의 낱말이다 — 꺾기는 jog, 끊기는 break, 홈(H)·기울기(O)·세로좌표는 통째 프롬프트와 같은 낱말, 새 통째 = 조각 + 옵션', () => {
    const row = (k: string) => LANGS.map((l) => dict[l][k]);
    // 꺾기(DIMJOGGED·DIMJOGLINE·DIM J) — 끊기(DIMBREAK)·굽힘·쉼·곡선이 아니다
    const JOG = ['꺾기', '꺾기(J)', '꺾기 반지름 치수', '꺾기 반지름 치수 (DJO)', '꺾기 위치 지정(또는 ENTER 키 누르기):', '꺾기 위치 지정:', '꺾기가 있는 치수가 아닙니다.', '꺾기를 추가할 치수 선택 또는 [제거(R)]:', '꺾어진 선형', '제거할 꺾기 선택:'];
    for (const k of JOG) {
      expect(dict.en[k], k).toMatch(/jog/i);
      expect(dict.en[k], k).not.toMatch(/break|bend|vertex/i);
      expect(dict.de[k], k).toMatch(/Verkürz/);
      expect(dict.de[k], k).not.toMatch(/Pause|Bruch|Bieg|Unterbrech|gestrichelt|Verfahr/);
      expect(dict['zh-CN'][k], k).toContain('折弯');
      expect(dict['zh-CN'][k], k).not.toContain('曲线');
    }
    // 끊기(BREAK·DIMBREAK) — 전화 끊기·치수 기입·정류장(Halt)·분할(DIVIDE)이 아니다
    const BREAK = ['끊기', '치수를 끊을 객체 선택 또는 [', '치수를 끊을 객체 선택:', '치수를 끊을 객체 선택 또는 [자동(A)/수동(M)/제거(R)] <자동(A)>:', '치수를 끊을 객체 선택 또는 [자동(A)/제거(R)] <자동(A)>:', '첫 번째 끊기점 지정:', '두 번째 끊기점 지정:', '스플라인 다중 지시선은 끊을 수 없습니다.', '지시선(LEADER)은 끊을 수 없습니다.'];
    for (const k of BREAK) {
      expect(dict.en[k], k).not.toMatch(/hang/i);
      expect(dict.de[k], k).not.toMatch(/Legen Sie auf|Bemaßen auswählen|Halt/);
      expect(dict.ja[k], k).not.toContain('分割');
    }
    for (const k of BREAK.slice(1, 5)) expect(dict.de[k], k).toContain('Unterbrechen der Bemaßung');
    expect(row('끊기')).toEqual(['Break', 'Unterbrechen', '破断', '断点']);
    // 홈(H)은 문자를 기본 자리로(DIMEDIT·DIMTEDIT 통째와 같은 낱말), 기울기(O)는 DIMEDIT 통째의 기울이기
    const EDIT = '치수 편집의 유형 입력 [홈(H)/새로 만들기(N)/회전(R)/기울기(O)] <홈(H)>:';
    const TEDIT = '치수 문자에 대한 새 위치 지정 또는 [왼쪽(L)/오른쪽(R)/중심(C)/홈(H)/각도(A)]:';
    expect(row('홈(H)')).toEqual(['Home(H)', 'Ausgangsposition (H)', 'ホーム(H)', '默认(H)']);
    for (const l of LANGS) for (const k of [EDIT, TEDIT]) expect(squash(dict[l][k]), `${l}: ${k}`).toContain(squash(dict[l]['홈(H)']));
    for (const l of ['en', 'ja', 'zh-CN'] as const) expect(squash(dict[l][EDIT]), l).toContain(squash(dict[l]['기울기(O)']));
    expect(['en', 'ja', 'zh-CN'].map((l) => dict[l as Lang]['기울기'])).toEqual(['Oblique', '傾斜', '倾斜']);
    expect(dict.de[EDIT]).toMatch(/^Art der Bemaßungsbearbeitung eingeben \[/);
    // 기준 치수는 base·Basis(표준 치수가 아니다), de 치수보조선 원점은 Hilfslinie(치수선 Bemaßungslinie가 아니다)·두 번째 선은 Linie(글 줄이 아니다)
    for (const [k, v] of Object.entries(dict.en)) if (k.includes('기준 치수')) expect(v, k).not.toMatch(/standard/i);
    for (const [k, v] of Object.entries(dict.de)) if (k.includes('기준 치수')) expect(v, k).not.toMatch(/Standard/);
    for (const [k, v] of Object.entries(dict.de)) if (k.includes('치수보조선 원점')) expect(v, k).not.toContain('Bemaßungslinie');
    expect(row('기준 치수 선택:').slice(0, 2)).toEqual(['Select base dimension:', 'Basisbemaßung auswählen:']);
    expect(dict.de['두 번째 선 선택:']).toBe('Zweite Linie auswählen:');
    // DIM 첫 프롬프트의 옵션 = 옵션 열쇠 번역(세로좌표는 좌표 — 수직이 아니다, 정렬은 位置合わせ, 명령 취소는 元に戻す)
    const mainOpts = /\[(.*)\]/.exec(DIM_MAIN)![1]!.split('/');
    for (const l of LANGS) {
      expect(squash(dict[l][DIM_MAIN]), l).toContain(squash(`[${mainOpts.map((o) => dict[l][o]).join('/')}]`));
      expect(dict[l][DIM_MAIN], l).not.toMatch(/垂直|Ordinieren|並べ替え|キャンセル/);
    }
    expect(row('세로좌표(O)')).toEqual(['Ordinate (O)', 'Ordinate (O)', '座標(O)', '坐标(O)']);
    // 새 통째 = 명령행 앞 조각 + 옵션 번역(명령행 마디와 같은 낱말), 도면층 통째·뒤 조각·결과 줄 = 고친 틀 + 현재 사용(.) 번역
    for (const l of LANGS) {
      const d = dict[l];
      for (const p of NEW_WHOLE) {
        const opts = /\[(.*)\]/.exec(p)![1]!.split('/');
        expect(squash(d[p]), `${l}: ${p}`).toMatch(new RegExp('^' + squash(`${d[p.slice(0, p.indexOf('[') + 1)]}${opts.map((o) => d[o]).join('/')}]`).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      }
      const cur = d['현재 사용(.)']!.replace(/\s*\(\.\)$/, '');
      expect(d[LAYER_CUR], l).toBe(d[LAYER]!.replace('{0}', cur));
      expect(d['새 치수의 도면층 = 현재 사용'], l).toBe(d['새 치수의 도면층 = {0}']!.replace('{0}', cur));
      expect(squash(d['] <"현재 사용">:']), l).toBe(squash(`] <"${cur}">${l === 'zh-CN' ? '：' : ':'}`));
      // <다음>은 PEDIT·-ATTEDIT·도면 비교가 옵션 다음(N)으로 옮기던 글 그대로, <추가(A)>는 옵션 추가(A)
      expect(d['] <다음>:'], l).toBe(`] <${d['다음(N)']!.replace(/\s*\(N\)$/, '')}>:`);
      expect(d['] <추가(A)>:'], l).toBe(`] <${d['추가(A)']}>:`);
    }
    expect(row('현재 사용(.)')).toEqual(['Use current (.)', 'Aktuellen verwenden (.)', '現在使用(.)', '使用当前(.)']);
    expect(row('분수').slice(0, 2)).toEqual(['Fractional', 'Bruch']);
    expect(dict['zh-CN']['다중(M)']).toBe('多个(M)');
  });
});
