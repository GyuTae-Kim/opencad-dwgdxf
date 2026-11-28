/**
 * 295차: 선종류·선가중치·색·그리기 순서 묶음(LINETYPE·-LINETYPE·LTSCALE·CELTSCALE·LWDISPLAY·COLOR·CHPROP의 색·선종류·선가중치·DRAWORDER·
 * TEXTTOFRONT·HATCHTOBACK·색 고르기·CDORDER·MKLTYPE·STATUS의 현재 색상·선종류·선가중치 줄)의 번역과 294차가 한도 밖으로 남긴 오역.
 * - 빠진 번역: -LINETYPE 「선종류 "…"이(가) 이미 로드되었습니다. 다시 로드하시겠습니까?」·MKLTYPE 「… 이미 있습니다. 다시 정의하겠습니까?」 예/아니오 물음은
 *   이름을 잡는 앞 조각·통째 열쇠가 없었고, 「선종류 "…"이(가) (다시) 로드되었습니다.」·「선종류 "…"을(를) 만들었습니다·다시 정의했습니다: …」는 틀이 앱 낱말을 잡아
 *   옮기지 않았다. -LINETYPE ? 목록의 「(로드됨)」 줄과 STATUS 현재 색상·선종류·선가중치 줄(색 이름 빨간색~흰색·기본값)은 열쇠가 없었다.
 * - 오역: DRAWORDER 통째(영어 Object up·To the back, 일본어 맨 뒤로 上へ, 중국어 对象顶部·正面·背面), 중국어 맨 앞으로·맨 뒤로 正面·背面(면),
 *   색상표(color book) Color Chart·カラーパレット·调色板, 중국어 선종류 行类型(행)·线条类型, MKLTYPE 「고른 형상」 uniform shape·均等な形状,
 *   영어 경계 border(경계 세트·경계 모서리·자르기 경계), HATCH 「내부 점 선택 …」 Set(T)·「일반(홀짝)」 General, 독일어 결합(bind) kombinieren·속성(attribute) Eigenschaft —
 *   같은 사전 안의 맞는 번역으로. 프롬프트는 소스에서 모은다.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installLocalization } from '../src/app/i18n';
import { guardedTranslate, installFileGuard, translateTail } from '../src/app/fileguard';
import { CommandLine } from '../src/app/commandline';
import { createNewDocument } from '../src/core/newdoc';
import { STANDARD_LINETYPES } from '../src/edit/linetypes';
import { translate } from '../site/i18n.mjs';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

const LANGS = ['en', 'de', 'ja', 'zh-CN'] as const;
type Lang = (typeof LANGS)[number];
const HANGUL = /[가-힣]/;
const load = (lang: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../site/locales/${lang}.json`, import.meta.url), 'utf8'));
const dict = Object.fromEntries(LANGS.map((l) => [l, load(l)])) as Record<Lang, Record<string, string>>;
const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const squash = (s: string | undefined) => (s ?? '').replace(/\s/g, '');

/** askYN(dashcmds-ask.ts)·yesNo(modify2-util.ts) 꼴: 물음 [예(Y)/아니오(N)] <기본값>: */
const yn = (q: string, def: boolean) => `${q} [예(Y)/아니오(N)] <${def ? '예' : '아니오'}>:`;
/** -LINETYPE 로드(L)의 다시 로드 물음, MKLTYPE의 다시 정의 물음(이름을 잡는다) */
const RELOAD_Q = (n: string) => `선종류 "${n}"이(가) 이미 로드되었습니다. 다시 로드하시겠습니까?`;
const REDEF_Q = (n: string) => `선종류 "${n}"이(가) 이미 있습니다. 다시 정의하겠습니까?`;
const DRAW = '객체 순서 옵션 입력 [객체 위로(A)/객체 아래로(U)/맨 앞으로(F)/맨 뒤로(B)] <맨 뒤로>:';
const COLOR = '새 객체 색상 입력 [트루컬러(T)] <BYLAYER>:';
const CHCOLOR = '새 색상 [트루컬러(T)/색상표(CO)] <BYLAYER>:';
const CHPROP = '변경할 특성 입력 [색상(C)/도면층(LA)/선종류(LT)/선종류 축척(S)/선가중치(LW)/두께(T)/투명도(TR)]:';
const LTOPT = '옵션 입력 [?/작성(C)/로드(L)/설정(S)]:';
const LTNAME = '선종류 이름 지정 또는 [?] <ByLayer>:';
const HATCHPT = '내부 점 선택 또는 [객체 선택(S)/명령 취소(U)/설정(T)]:';
const LAYCOLOR = '색상 이름 또는 번호(1-255) 입력 또는 [트루컬러(T)/색상표(CO)]:';
const RELOAD = yn(RELOAD_Q('CENTER'), true);
const REDEF = yn(REDEF_Q('DASH2'), false);
const PROMPTS = [DRAW, RELOAD, REDEF, COLOR, CHCOLOR, CHPROP, LTOPT, LTNAME, HATCHPT, LAYCOLOR];

/** -LINETYPE·MKLTYPE 결과 줄 */
const RESULTS = ['선종류 "CENTER"이(가) 로드되었습니다.', '선종류 "CENTER"이(가) 다시 로드되었습니다.', '선종류 "DASH2"을(를) 만들었습니다: A,.5,-.25', '선종류 "DASH2"을(를) 다시 정의했습니다: A,.5,-.25'];
/** -LINETYPE ? 표준 선종류 목록(로드된 것) */
const LIST = STANDARD_LINETYPES.map((d) => `  ${d.name.padEnd(18)}(로드됨) ${d.description}`);
/** STATUS 줄(util2-misc.ts — padWide 칸 맞춤, 색 이름은 ACI 1~7) */
const ACI = ['빨간색', '노란색', '초록색', '하늘색', '파란색', '선홍색', '흰색'];
const STATUS = [
  ...['BYLAYER -- 30', 'BYBLOCK', '30', ...ACI.map((n, i) => `${i + 1} (${n})`), ...ACI.map((n, i) => `BYLAYER -- ${i + 1} (${n})`)].map((v) => `현재 색상:       ${v}`),
  ...['BYLAYER -- "Continuous"', 'CENTER', 'BYBLOCK'].map((v) => `현재 선종류:     ${v}`),
  ...['BYLAYER', 'BYBLOCK', '기본값', '0.25 mm'].map((v) => `현재 선가중치:   ${v}`),
];

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.unstubAllGlobals();
});

describe('선종류·선가중치·색·그리기 순서 묶음의 번역과 294차 한도 밖 오역(295차)', () => {
  it('명령행 입력 줄(앞 글 「… [」·옵션·뒤 글 「] <…>:」)이 네 언어 모두 한국어 없이 보이고, 고친 조각 낱말이 보인다', async () => {
    for (const [f, s] of [
      ['app/editcmds.ts', `const r = await ctx.getPoint('${DRAW}', {`],
      ['app/dashcmds-tables.ts', 'if (before && !(await askYN(ctx, `선종류 "${ft(before.name)}"이(가) 이미 로드되었습니다. 다시 로드하시겠습니까?`, true))) continue;'],
      ['app/dashcmds-ask.ts', "const k = await askOption(ctx, `${prompt} [예(Y)/아니오(N)] <${def ? '예' : '아니오'}>:`, YES_NO, def ? 'Y' : 'N');"],
      ['app/express-draw.ts', 'if (existing && !(await yesNo(ctx, `선종류 "${ft(existing.name)}"이(가) 이미 있습니다. 다시 정의하겠습니까?`, false))) return;'],
      ['app/modify2-util.ts', "const r = await ctx.getPoint(`${prompt} [예(Y)/아니오(N)] <${def ? '예' : '아니오'}>:`, {"],
      ['app/propcmds.ts', 'const r = await ctx.getPoint(`새 객체 색상 입력 [트루컬러(T)] <${colorLabel(cur)}>:`, {'],
      ['app/propcmds.ts', `const t = await ask('${CHCOLOR}');`],
      ['app/propcmds.ts', `const r = await ctx.getPoint('${CHPROP}', {`],
      ['app/dashcmds-tables.ts', `'${LTOPT}',`],
      ['app/dashcmds-tables.ts', 'const t = await askWord(ctx, `선종류 이름 지정 또는 [?] <${ft(cur)}>:`);'],
      ['app/hatchcmd.ts', `const r = await ctx.getPoint('${HATCHPT}', {`],
      ['app/layercmd.ts', `const t = await askWord(ctx, '${LAYCOLOR}');`],
    ])
      expect(src(f!), s).toContain(s);
    const left: string[] = [];
    const shown: Record<string, string[]> = {};
    for (const l of LANGS) {
      const dom = new JSDOM('<!doctype html><html><head><title>OpenCAD</title></head><body><div id="app"><header class="titlebar"></header><div id="cmd"></div></div></body></html>', {
        url: `https://gyutae-kim.github.io/opencad-dwgdxf/${l}/`,
      });
      for (const name of ['window', 'document', 'Node', 'Element', 'HTMLAnchorElement', 'MutationObserver', 'location', 'history', 'localStorage', 'CustomEvent'])
        vi.stubGlobal(name, (dom.window as unknown as Record<string, unknown>)[name]);
      installFileGuard({ docs: [{ doc: createNewDocument('metric') }] });
      dispose = await installLocalization(document.getElementById('app')!);
      const cmd = new CommandLine(document.getElementById('cmd')!, { submit() {}, cancel() {}, suggest: () => [], keyword() {}, repeat() {} });
      shown[l] = [];
      for (const p of PROMPTS) {
        cmd.setPrompt(p);
        await new Promise((r) => setTimeout(r, 0));
        const text = document.querySelector('.cmd-prompt')!.textContent!;
        shown[l]!.push(text);
        if (HANGUL.test(text)) left.push(`${l}: ${text}`);
      }
      dispose();
      dispose = undefined;
      vi.unstubAllGlobals();
      dom.window.close();
    }
    expect(left).toEqual([]);
    const at = (l: Lang, p: string) => shown[l]![PROMPTS.indexOf(p)]!;
    // DRAWORDER: 객체 위·아래(above/under)·맨 앞으로(bring to front)·맨 뒤로(send to back), 중국어는 前置·置于底层(正面·背面 면이 아니다)
    for (const s of ['Above Object (A)', 'Below Object (U)', 'Bring to Front (F)', 'Send to Back (B)']) expect(at('en', DRAW)).toContain(s);
    for (const s of ['前置(F)', '置于底层(B)', '<置于底层>']) expect(at('zh-CN', DRAW)).toContain(s);
    // 이름을 잡는 예/아니오 물음의 앞 조각
    expect(at('en', RELOAD)).toContain('Linetype "CENTER" is already loaded. Would you like to reload? [');
    expect(at('zh-CN', REDEF)).toContain('线型“DASH2”已存在。是否重新定义？[');
    // 색상표(CO)는 color book
    expect(at('en', CHCOLOR)).toContain('Color Book (CO)');
    expect(at('ja', CHCOLOR)).toContain('カラーブック(CO)');
    expect(at('zh-CN', LAYCOLOR)).toContain('配色系统(CO)');
    // HATCH 내부 점 선택의 설정(T)은 Settings(Set이 아니다), 내부 점은 interior point
    for (const s of ['Select interior point or [', 'Settings (T)']) expect(at('en', HATCHPT)).toContain(s);
  });

  it('통째 프롬프트(기록 줄·휴대폰 카드)와 -LINETYPE·MKLTYPE 결과 줄, ? 목록, STATUS 현재 색상·선종류·선가중치 줄이 네 언어 모두 한국어 없이 보인다', () => {
    for (const [f, s] of [
      ['app/dashcmds-tables.ts', "ctx.print(`선종류 \"${ft(name)}\"이(가) ${before ? '다시 로드되었습니다' : '로드되었습니다'}.`);"],
      ['app/express-draw.ts', "ctx.print(`선종류 \"${ft(rec.name)}\"을(를) ${existing ? '다시 정의했습니다' : '만들었습니다'}: ${r.pattern}`);"],
      // 339차: 「(로드됨)」은 명령행에서 틀 {n} 자리라 uiText로 끼운다(front337 339차 절)
      ['app/dashcmds-tables.ts', "ctx.print(`  ${d.name.padEnd(18)}${doc.linetypes.has(tableKey(d.name)) ? `${uiText('(로드됨)')} ` : ''}${d.description}`);"],
      ['app/util2-misc.ts', "const ACI_NAMES: Record<number, string> = { 1: '빨간색', 2: '노란색', 3: '초록색', 4: '하늘색', 5: '파란색', 6: '선홍색', 7: '흰색' };"],
      ['app/util2-misc.ts', "return `${aci}${ACI_NAMES[aci] ? ` (${ACI_NAMES[aci]})` : ''}`;"],
      ['app/util2-misc.ts', "out(`${padWide('현재 색상:', 16)} ${colorName(typeof cecolor === 'number' ? cecolor : 256)}${(typeof cecolor !== 'number' || cecolor === 256) && cl ? ` -- ${colorName(cl.color)}` : ''}`);"],
      ['app/util2-misc.ts', "out(`${padWide('현재 선종류:', 16)} ${ft(celt.toUpperCase())}${/^bylayer$/i.test(celt) && cl ? ` -- \"${ft(cl.linetype)}\"` : ''}`);"],
      ['app/util2-misc.ts', "out(`${padWide('현재 선가중치:', 16)} ${celw === -1 ? 'BYLAYER' : celw === -2 ? 'BYBLOCK' : celw === -3 ? '기본값' : `${(celw / 100).toFixed(2)} mm`}`);"],
    ])
      expect(src(f!), s).toContain(s);
    const tr = (l: string) => (x: string) => guardedTranslate(x, l) ?? translate(x, l);
    const show = (s: string, l: string) => translateTail(s, tr(l)(s), tr(l));
    const left: string[] = [];
    for (const l of LANGS) {
      // 기본값 꼬리가 있는 프롬프트는 친 입력이 붙은 기록 줄 꼴도
      for (const p of PROMPTS) for (const s of p.endsWith('>:') ? [p, `${p} Y`] : [p]) if (HANGUL.test(show(s, l))) left.push(`${l}: ${show(s, l)}`);
      for (const s of [...RESULTS, ...LIST, ...STATUS]) if (HANGUL.test(tr(l)(s))) left.push(`${l}: ${tr(l)(s)}`);
    }
    expect(left).toEqual([]);
    expect(show(RELOAD, 'en')).toBe('Linetype "CENTER" is already loaded. Would you like to reload? [Yes (Y)/No (N)] <Yes>:');
    expect(show(`${REDEF} Y`, 'ja')).toBe('線種「DASH2」は既に存在します。再定義しますか？[はい(Y)/いいえ(N)] <いいえ>: Y');
    expect(show(`${DRAW} F`, 'zh-CN')).toBe('输入对象顺序选项 [对象上移 (A)/对象下移 (U)/前置(F)/置于底层(B)] <置于底层>： F');
    expect(show(DRAW, 'en')).toBe('Enter object order option [Above Object (A)/Below Object (U)/Bring to Front (F)/Send to Back (B)] <Send to Back>:');
    expect(tr('en')(RESULTS[1]!)).toBe('Linetype "CENTER" reloaded.');
    expect(tr('de')(RESULTS[2]!)).toBe('Linientyp „DASH2“ wurde erstellt: A,.5,-.25');
    expect(tr('ja')(LIST.find((s) => s.includes('BORDER '))!)).toBe('BORDER (ロード済み) Border __ __ . __ __ . __ __ .');
    expect(tr('zh-CN')('현재 색상:       BYLAYER -- 7 (흰색)')).toBe('当前颜色：BYLAYER -- 7 (白色)');
    expect(tr('de')('현재 선가중치:   기본값')).toBe('Aktuelle Linienstärke: Standard');
    expect(tr('en')('현재 선종류:     BYLAYER -- "Continuous"')).toBe('Current linetype: BYLAYER -- "Continuous"');
  });

  it('고친 번역은 같은 사전의 낱말이다 — 경계 boundary, 前置·置于底层, 색상표 color book, 线型, 독일어 결합 binden·속성 Attribut, 새 통째 = 앞 조각 + 예/아니오, 덮인 틀은 지움', () => {
    const [en, de, ja, zh] = [dict.en, dict.de, dict.ja, dict['zh-CN']];
    // 경계(boundary): 영어 border가 아니다(PDF 언더레이 쪽 테두리 「… 경계만 보입니다.」는 빼고)
    expect(Object.entries(en).filter(([k, v]) => k.includes('경계') && /border/i.test(v) && !k.includes('페이지를 그리지')).map(([k]) => k)).toEqual([]);
    expect([en['경계 세트'], en['경계 모서리'], en['일반(홀짝)'], en['내부 점 선택 또는 [']]).toEqual(['Boundary set', 'Boundary edge', 'Normal (Even/Odd)', 'Select interior point or [']);
    expect(en[HATCHPT]).toBe('Select interior point or [Select object (S)/Undo (U)/Settings (T)]:');
    // DRAWORDER 통째 = 앞 조각 + 옵션 조각, 기본값은 맨 뒤로(B)의 이름(영어·일본어·중국어)
    for (const l of ['en', 'ja', 'zh-CN'] as const) {
      const d = dict[l];
      const name = d['맨 뒤로(B)']!.replace(/\s*[(（]B[)）]$/, '');
      const parts = ['객체 위로(A)', '객체 아래로(U)', '맨 앞으로(F)', '맨 뒤로(B)'].map((k) => d[k]).join('/');
      expect(squash(d[DRAW]), l).toBe(squash(`${d['객체 순서 옵션 입력 [']}${parts}] <${name}>`) + (l === 'zh-CN' ? '：' : ':'));
    }
    expect([en['객체 위로'], en['객체 아래로'], en['맨 앞으로']]).toEqual(['Above Object', 'Below Object', 'Bring to Front']);
    // 중국어 맨 앞으로·맨 뒤로는 前置·置于底层(正面·背面 면이 아니다)
    expect(Object.entries(zh).filter(([k, v]) => /맨 (앞|뒤)/.test(k) && /正面|背面/.test(v)).map(([k]) => k)).toEqual([]);
    expect([zh['맨 앞으로'], zh['맨 앞으로(F)'], zh['맨 뒤로(B)']]).toEqual(['前置', '前置(F)', '置于底层(B)']);
    // 색상표는 color book: 키워드 이름과 그 옵션을 담은 프롬프트 모두
    const book = { en: /Color Book/, ja: /カラーブック/, 'zh-CN': /配色系统/ } as const;
    for (const l of ['en', 'ja', 'zh-CN'] as const)
      for (const [k, v] of Object.entries(dict[l])) if (k.includes('색상표(CO)') || k === '색상표') expect(v, `${l}: ${k}`).toMatch(book[l]);
    // 중국어 선종류는 线型(行类型 행 유형·线条类型가 아니다), 끝점·이름 지정, CDORDER 뒤로·고른 색
    for (const k of ['선종류 관리자', '선종류 {0}개를 불러왔습니다.', '선종류 만들기', '불러올 선종류', '로드할 선종류 입력:', '로드된 선종류 이름 입력', '로드된 선종류 이름 입력 또는 [?]', '선종류 {0}', '선종류 ({0})']) {
      expect(zh[k], k).toMatch(/线型/);
      expect(zh[k], k).not.toMatch(/行类型|线条类型/);
    }
    expect([zh['선종류 정의의 끝점 지정:'], zh['선종류 이름 지정 또는 [?] <{0}>:'], zh['다른 객체의 맨 뒤로'], zh['고른 색']]).toEqual(['指定线型定义的端点：', '指定线型名称或 [?] <{0}>：', '其他对象的后方', '所选颜色']);
    expect([en['고른 형상으로 선종류 정의 (MKLTYPE)'], ja['고른 형상으로 선종류 정의 (MKLTYPE)'], en['새 객체의 선종류 축척']]).toEqual([
      'Define linetype from selected geometry (MKLTYPE)',
      '選んだ形状で線種を定義(MKLTYPE)',
      'Linetype scale of new object',
    ]);
    // 독일어 결합(bind)은 binden·gebunden(kombinieren 합치기가 아니다), 속성(attribute)은 Attribut(특성 Eigenschaft가 아니다)
    for (const k of [
      '"{0}"을(를) 결합할 때 옮길 수 없는 객체 {1}개(다중 지시선·이미지·표 등)를 뺐습니다.',
      ', 결합 {0}',
      '{0} {1}은(는) 결합할 수 없습니다{2}.',
      '결합한 기호가 없습니다.',
      '결합할 의존 기호를 고르십시오. 결합하면 "참조$0$이름"의 보통 기호가 됩니다.',
      '기호 결합',
      '외부 참조 "{0}"은(는) 로드되지 않아 결합하지 못했습니다(경로만 남은 외부 참조).',
      '외부 참조 "{0}"을(를) 결합했습니다(객체 {1}개{2}{3}).',
      '외부 참조 "{0}"의 파일이 연결되지 않아 결합할 수 없습니다. EXTERNALREFERENCES(XR)에서 파일을 먼저 연결하십시오.',
      '외부 참조를 결합으로 바꾸기',
      '외부 참조에서 가져온 도면층·스타일·블록 이름을 결합처럼 XREF$0$이름으로 바꿉니다. 끄면 이름을 그대로 두고 현재 도면에 같은 이름이 있으면 현재 도면의 것을 씁니다.',
      '중첩된 객체 복사 설정 입력 [삽입(I)/결합(B)] <{0}>:',
      '참조 파일을 연결하면(XR) 블록도 결합할 수 있습니다.',
    ]) {
      expect(de[k], k).toMatch(/bind|gebunden/i);
      expect(de[k], k).not.toMatch(/kombin/i);
    }
    for (const k of [
      '속성 편집 - {0}',
      '속성 표시',
      '전역 속성 편집',
      '전체 속성 편집',
      '속성 바로 편집',
      '속성 가져오기',
      '속성 내보내기',
      '편집할 속성 선택:',
      '속성 선택 또는 속성 이름 입력:',
      '속성 가시성 설정 입력 [',
      '문자, 여러 줄 문자, 속성 정의 또는 블록(속성) 선택:',
      '편집할 수 있는 속성이 없습니다.',
      '전역 속성 값 편집 수행 중.',
      '속성 {0}개를 바꿨습니다.{1}{2}',
      '편집을 위한 속성 정의 표시',
      '편집을 위한 속성 정의 표시(D)',
      '블록 참조 또는 속성 선택 [',
    ]) {
      expect(de[k], k).toMatch(/Attribut/);
      expect(de[k], k).not.toMatch(/Eigenschaft/);
    }
    // 새 열쇠: 예/아니오 물음 = 앞 조각 + 예(Y)/아니오(N), STATUS 색 이름·기본값은 그 낱말 열쇠의 번역, 덮인 틀 둘은 지웠다
    for (const l of LANGS) {
      const d = dict[l];
      const colon = l === 'zh-CN' ? '：' : ':';
      for (const q of [RELOAD_Q('{0}'), REDEF_Q('{0}')]) {
        expect(squash(d[`${q} [`]), `${l}: ${q}`).toBe(`${squash(d[q])}[`);
        expect(squash(d[`${q} [예(Y)/아니오(N)] <{1}>:`]), `${l}: ${q}`).toBe(squash(`${d[`${q} [`]}${d['예(Y)']}/${d['아니오(N)']}] <{1}>`) + colon);
      }
      for (const n of ACI) expect(d[`현재 색상: {0} (${n})`], `${l}: ${n}`).toBe(`${d['현재 색상: {0}']} (${d[n]})`);
      expect(d['현재 선가중치: 기본값'], l).toBe(d['현재 선가중치: {0}']!.replace('{0}', d['기본값']!));
      for (const k of ['선종류 "{0}"이(가) {1}.', '선종류 "{0}"을(를) {1}: {2}']) expect(d[k], `${l}: ${k}`).toBeUndefined();
    }
  });
});
