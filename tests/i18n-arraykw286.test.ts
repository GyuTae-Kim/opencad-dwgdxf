/**
 * 286차: ARRAY 명령 묶음에서 사전에 열쇠가 없어 네 언어 모두 한국어로 보이던 글(285차 「보고 두 것」 (1)).
 * - 명령행 입력 줄(commandline.ts setPrompt)은 프롬프트를 「앞 글 [」·옵션마다 「이름(글자)」·「] 뒤 글」 마디로 나눠 마디마다 옮기고,
 *   바로 가기 메뉴(ctxmenu.ts)·휴대폰 단추(mobileview.ts promptParts)도 옵션 「이름(글자)」 열쇠를 쓴다. 뒤 글의 기본값은 옵션 이름일 때만
 *   옵션 번역으로 바뀐다(fileguard.ts defaultWord — 118차) — 「<중심>」·「<경로 곡선의 끝>」은 열쇠가 있어야 한다.
 * - 기록 줄·휴대폰 프롬프트 카드·커서 옆 프롬프트는 프롬프트 통째(translateTail). 공용 번역기는 틀({0})이 잡은 값을 옮기지 않으므로
 *   (「{0} 지정 또는 [종료(X)]:」·「{0} [예(Y)/아니오(N)] <{1}>:」·「그립을 선택하여 배열을 편집하거나 [{0}] <종료>:」·「옵션 입력 [{0}] <종료>:」)
 *   낱말이 정해진 프롬프트(그립 라벨·물음 본문·옵션 목록)와 그립 머리 「** 라벨 **」는 통째 열쇠를 둔다.
 * 프롬프트는 소스에서 모은다(편집 고리 RECT_KW·POLAR_KW, ARRAYEDIT KW, 그립 LABEL, 예/아니오 묻는 곳).
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installLocalization } from '../src/app/i18n';
import { installFileGuard, translateTail } from '../src/app/fileguard';
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
/** 소스 덩이(start부터 end 앞까지)의 { key, label } 옵션 → 프롬프트의 「이름(글자)」 */
const kwOf = (text: string, start: string, end: string): string[] => {
  const i = text.indexOf(start);
  const block = text.slice(i, text.indexOf(end, i + start.length));
  return [...block.matchAll(/\{ key: '([^']+)', label: '([^']+)' \}/g)].map((m) => `${m[2]}(${m[1]})`);
};

const arr = src('arraycmd.ts');
const ed = src('assocarray.ts');
const gripSrc = src('assocarray-grips.ts');
const editKw = ed.slice(ed.indexOf('const KW:'), ed.indexOf('\n};', ed.indexOf('const KW:')));
/** ARRAYRECT·ARRAYPOLAR 편집 고리(arraycmd.ts editLoop) */
const LOOPS = [kwOf(arr, 'const RECT_KW', '];'), kwOf(arr, 'const POLAR_KW', '];')].map((o) => `그립을 선택하여 배열을 편집하거나 [${o.join('/')}] <종료>:`);
/** ARRAYEDIT 직사각형·원형·경로(assocarray.ts) */
const EDITS = ['rect: [', 'polar: [', 'path: ['].map((s) => `옵션 입력 [${kwOf(editKw, s, '],').join('/')}] <종료>:`);
/** 배열 그립 라벨(assocarray-grips.ts LABEL) — 중심(이동)은 「이동점 지정 또는 [종료(X)]:」 */
const LABELS = [...gripSrc.slice(gripSrc.indexOf('const LABEL'), gripSrc.indexOf('};', gripSrc.indexOf('const LABEL'))).matchAll(/(\w+): '([^']+)'/g)].map((m) => ({ id: m[1]!, label: m[2]! }));
const GRIPS = LABELS.filter((g) => g.id !== 'center').map((g) => `${g.label} 지정 또는 [종료(X)]:`);
const HEADS = LABELS.map((g) => `** ${g.label} **`);
/** 예/아니오 물음(ARRAYRECT·ARRAYPATH 연관, ARRAYPATH·ARRAYEDIT 정렬·Z 방향·항목 회전, -ARRAY 객체 회전) */
const QUESTIONS = [
  ...new Set(['arraycmd.ts', 'arraypath.ts', 'assocarray.ts', 'dashcmds-array.ts'].flatMap((f) => [...src(f).matchAll(/(?:askYesNo|yesNo|askYN)\(ctx, '([^']+)'/g)].map((m) => m[1]!))),
];
const YES_NO = QUESTIONS.flatMap((q) => ['예', '아니오'].map((d) => `${q} [예(Y)/아니오(N)] <${d}>:`));
/** 기본값이 옵션이 아닌 기준점 프롬프트(arraycmd.ts 314·assocarray.ts 421·451·arraypath.ts 211) */
const BASE = ['기준점 지정 또는 [키 점(K)] <중심>:', '대체 객체의 기준점 선택 또는 [키 점(K)] <중심>:', '기준점 지정 또는 [키 점(K)] <경로 곡선의 끝>:'];

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.unstubAllGlobals();
});

describe('ARRAY 묶음의 빠진 번역(286차)', () => {
  it('명령행 입력 줄(앞 글 「… [」·옵션 「이름(글자)」·뒤 글 「] <…>:」)이 네 언어 모두 한국어 없이 보인다', async () => {
    // 소스에서 모은 프롬프트가 명령 시험(tests/drawmod/array·tests/assocarray/commands)이 기대하는 글과 같다
    expect(LOOPS[0]).toBe('그립을 선택하여 배열을 편집하거나 [연관(AS)/기준점(B)/개수(COU)/간격두기(S)/열(COL)/행(R)/레벨(L)/종료(X)] <종료>:');
    expect(EDITS[1]).toBe('옵션 입력 [소스(S)/대체(REP)/기준점(B)/항목(I)/사이 각도(A)/채울 각도(F)/행(ROW)/레벨(L)/항목 회전(ROT)/재설정(RES)/종료(X)] <종료>:');
    expect([LABELS.length, QUESTIONS.length]).toEqual([11, 5]);
    for (const b of BASE) expect(arr + ed + src('arraypath.ts')).toContain(`'${b}'`);
    const prompts = [...LOOPS, ...EDITS, ...GRIPS, ...YES_NO, ...BASE];
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

  it('통째 프롬프트(기록 줄·휴대폰 프롬프트 카드·커서 옆)와 그립 머리 「** 라벨 **」가 네 언어 모두 한국어 없이 보인다', () => {
    const show = (s: string, l: string) => translateTail(s, translate(s, l), (x) => translate(x, l));
    const left: string[] = [];
    for (const l of LANGS) {
      // 기본값 꼬리가 있는 프롬프트는 친 입력이 붙은 기록 줄 꼴도
      for (const p of [...LOOPS, ...EDITS, ...GRIPS, ...YES_NO])
        for (const s of p.endsWith('>:') ? [p, `${p} 1`] : [p]) if (HANGUL.test(show(s, l))) left.push(`${l}: ${show(s, l)}`);
      for (const h of HEADS) if (HANGUL.test(translate(h, l))) left.push(`${l}: ${translate(h, l)}`);
    }
    expect(left).toEqual([]);
    expect(show('연관 배열 작성 [예(Y)/아니오(N)] <아니오>:', 'en')).toBe('Create associative array [Yes (Y)/No (N)] <No>:');
    expect(show('열 간격 지정 또는 [종료(X)]:', 'zh-CN')).toBe('指定列间距或 [退出(X)]：');
    expect(translate('** 행 및 열 수 **', 'de')).toBe('** ANZAHL DER ZEILEN UND SPALTEN **');
  });

  it('새 열쇠는 같은 사전의 낱말이다 — 통째 = 틀·앞 조각 + 옵션 번역, 원형 배열 사이각(A)은 항목 사이의 각도', () => {
    const squash = (s: string | undefined) => (s ?? '').replace(/\s/g, '');
    for (const l of LANGS) {
      const d = dict[l];
      const colon = l === 'zh-CN' ? '：' : ':';
      // ARRAYPOLAR 사이각(A)·ARRAYEDIT 사이 각도(A)는 항목 사이의 각도(같은 한국어 이름 「사이각」인 타원 호 사이각(I) Included angle 뜻이 아니다)
      expect(d['사이각(A)'], l).toBe(d['사이 각도(A)']);
      expect(d['사이각(A)'], l).toContain(d['항목 사이의 각도']!);
      // 기록 줄의 통째 = 명령행 키워드 마디와 같은 옵션 번역
      for (const p of [...LOOPS, ...EDITS]) {
        const opts = /\[(.*)\]/.exec(p)![1]!.split('/');
        expect(d[p], `${l}: ${p}`).toContain(`[${opts.map((o) => d[o]).join('/')}]`);
      }
      // 그립 통째 = 명령행 앞 조각 + 종료(X)
      for (const p of GRIPS) expect(squash(d[p]), `${l}: ${p}`).toBe(squash(`${d[p.slice(0, p.indexOf('[') + 1)]}${d['종료(X)']}]`) + colon);
      // 예/아니오 앞 조각·통째 = 물음 번역(285차가 맞춘 정렬·Z 방향 포함)으로 시작
      for (const q of QUESTIONS) {
        expect(squash(d[`${q} [`]), `${l}: ${q}`).toBe(`${squash(d[q])}[`);
        expect(squash(d[`${q} [예(Y)/아니오(N)] <{0}>:`]), `${l}: ${q}`).toBe(squash(`${d[`${q} [`]}${d['예(Y)']}/${d['아니오(N)']}] <{0}>`) + colon);
      }
    }
    // 낱말 근거(같은 사전): 「개수 {0}」 Count·이름 Anzahl·個数·计数, 「배열할 때 항목 회전」 Rotate items·Elemente … drehen, 「간격두기 지정(S)」 間隔, 「재설정(R)」
    const row = (k: string) => LANGS.map((l) => dict[l][k]);
    expect(row('개수(COU)')).toEqual(['Count (COU)', 'Anzahl (COU)', '個数(COU)', '计数(COU)']);
    expect(row('항목 회전(ROT)')).toEqual(['Rotate items (ROT)', 'Elemente drehen (ROT)', '要素の回転(ROT)', '旋转项目(ROT)']);
    expect(row('간격두기(S)')).toEqual(['Spacing (S)', 'Abstand (S)', '間隔(S)', '间距(S)']);
    expect(row('재설정(RES)')).toEqual(row('재설정(R)').map((v) => v!.replace('(R)', '(RES)')));
  });
});
