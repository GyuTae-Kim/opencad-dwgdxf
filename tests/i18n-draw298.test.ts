/**
 * 298차: 그리기 명령 묶음(LINE·PLINE·CIRCLE·ARC·RECTANG·POLYGON·ELLIPSE·SPLINE·POINT·XLINE·RAY·DONUT·DIVIDE·MEASURE·BOUNDARY·REVCLOUD·WIPEOUT·
 * SKETCH·HELIX·3DPOLY·3DFACE·TRACE)의 번역과 297차가 남긴 것.
 * - 빠진 번역: TRIM·EXTEND 현재 설정 줄(틀이 투영·모서리·모드 낱말을 잡음), PLINE 「호의 반지름 지정:」·「현의 길이 지정:」, SPLINE 「시작 접촉부(T)」·「끝 접촉부(T)」와
 *   다음 점 통째, SPLINE·REVCLOUD·SKETCH 현재 설정 줄, DIVIDE 정렬 물음·세그먼트·결과 줄, BOUNDARY 섬 검출, REVCLOUD 첫 프롬프트·방향 반전, WIPEOUT 폴리선 지우기,
 *   HELIX 기준·상단 반지름(틀이 첫 글을 잡음), 3DFACE 넷째 점 뒤 글.
 * - 오역: 반폭 Half width Receive·Erhalten Sie, 차수 Order·差分·排序·Reihenfolge, 접촉부(접선 tangency) contact·Kontakt beenden·接触, 3점 3分,
 *   두께 粗细, 구름형 리비전 云端(클라우드)·Cloud revision·fixiert, 도넛 甜甜圈, 트레이스 폭 描边·Linienstärke, 독일어 끊기·자르기 결과·연장 모드·-Modus·JOIN 결과·
 *   스냅 Y 간격·증분 각도·경계 세트, 일본어 주(M) 主軸 — 같은 사전 안의 맞는 번역으로. 프롬프트·설정 줄 꼴은 소스에서 확인한다.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installLocalization } from '../src/app/i18n';
import { guardedTranslate, installFileGuard, translateTail } from '../src/app/fileguard';
import { CommandLine } from '../src/app/commandline';
import { createNewDocument } from '../src/core/newdoc';
import { translate } from '../site/i18n.mjs';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

const LANGS = ['en', 'de', 'ja', 'zh-CN'] as const;
type Lang = (typeof LANGS)[number];
const HANGUL = /[가-힣]/;
const load = (lang: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../site/locales/${lang}.json`, import.meta.url), 'utf8'));
const dict = Object.fromEntries(LANGS.map((l) => [l, load(l)])) as Record<Lang, Record<string, string>>;
const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const strip = (s: string | undefined) => (s ?? '').replace(/\s*[(（][A-Z]+[)）]$/, '');

const PL_ARC = '호의 끝점 지정(방향 전환은 Ctrl 키) 또는 [각도(A)/중심(CE)/닫기(CL)/방향(D)/반폭(H)/선(L)/반지름(R)/두 번째 점(S)/명령 취소(U)/폭(W)]:';
const PL_R = '호의 반지름 지정:';
const PL_L = '현의 길이 지정:';
const CIRCLE = '원에 대한 중심점 지정 또는 [3점(3P)/2점(2P)/Ttr - 접선 접선 반지름(T)]:';
const ELL_END = '끝 매개변수 지정 또는 [각도(A)/사이각(I)]:';
const ELL_END2 = '끝 각도 지정 또는 [매개변수(P)/사이각(I)]:';
const SPL_CV = '첫 번째 점 지정 또는 [메서드(M)/차수(D)/객체(O)]:';
const SPL_N = [
  '다음 점 입력 또는 [시작 접촉부(T)/공차(L)]:',
  '다음 점 입력 또는 [끝 접촉부(T)/공차(L)/명령 취소(U)]:',
  '다음 점 입력 또는 [끝 접촉부(T)/공차(L)/명령 취소(U)/닫기(C)]:',
  '다음 점 입력 또는 [명령 취소(U)]:',
  '다음 점 입력 또는 [닫기(C)/명령 취소(U)]:',
];
const DIV_ALIGN = '블록을 객체에 정렬하시겠습니까? [예(Y)/아니오(N)] <예>:';
const DIV = ['세그먼트의 개수 입력 또는 [블록(B)]:', '세그먼트의 개수 입력:', '세그먼트의 길이 지정 또는 [블록(B)] <10.0000>:', '세그먼트의 길이 지정:'];
const RC_OPTS = '[호 길이(A)/객체(O)/직사각형(R)/폴리곤(P)/프리핸드(F)/스타일(S)/수정(M)] <객체>:';
const RC = ['첫 번째 구석점 지정', '시작점 지정', '첫 번째 점 지정'].map((f) => `${f} 또는 ${RC_OPTS}`);
const RC_REV = '방향 반전 [예(Y)/아니오(N)] <아니오>:';
const WO_DEL = '폴리선을 지우시겠습니까? [예(Y)/아니오(N)] <아니오>:';
const HX = ['기준 반지름 지정 또는 [지름(D)] <1.0000>:', '상단 반지름 지정 또는 [지름(D)] <1.0000>:'];
const FACE4 = '네 번째 점 지정 또는 [보이지 않음(I)] <세 개의 측면을 가진 면 작성>:';
const DONUT = '도넛의 중심 지정 <종료>:';
const EDGE = '암시적 모서리 연장 모드 입력 [연장(E)/연장 안 함(N)] <연장>:';
const GRID = '격자 간격두기(X) 지정 또는 [켜기(ON)/끄기(OFF)/스냅(S)/주(M)/종횡비(A)] <10.0000>:';
const PROMPTS = [PL_ARC, PL_R, PL_L, CIRCLE, ELL_END, ELL_END2, SPL_CV, ...SPL_N, DIV_ALIGN, ...DIV, ...RC, RC_REV, WO_DEL, ...HX, FACE4, DONUT, EDGE, GRID];

/** 현재 설정·결과 줄(소스 print — 빈칸 셋은 그대로) */
const TRIM_STATUS = ['없음', 'UCS', '뷰'].flatMap((p) => ['연장', '없음'].flatMap((e) => ['빠른 작업', '표준'].map((m) => `현재 설정: 투영=${p}, 모서리=${e}, 모드=${m}`)));
const STATUS = [
  ...TRIM_STATUS,
  ...['현', '제곱근', '균일'].map((k) => `현재 설정: 메서드=맞춤   매듭=${k}`),
  '현재 설정: 메서드=CV   차수=3',
  '점 4개를 놓았습니다.',
  '블록 "⁨DOOR⁩" 4개를 놓았습니다.',
  '섬 검출 = 예',
  '섬 검출 = 아니오',
  ...['일반', '컬리그래피'].flatMap((s) => ['직사각형', '폴리곤', '프리핸드'].map((t) => `최소 호 길이: 0.5000   최대 호 길이: 1.5000   스타일: ${s}   유형: ${t}`)),
  ...['선', '폴리선', '스플라인'].flatMap((t) => [`유형 = ${t}   증분 = 0.1000   공차 = 0.5000`, `${t} 12개가 기록되었습니다.`]),
  '현재 트레이스 폭 = 0.0500',
];

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.unstubAllGlobals();
});

describe('그리기 명령 묶음의 번역과 297차가 남긴 것(298차)', () => {
  it('명령행 입력 줄(앞 글 「… [」·옵션·뒤 글 「] <…>:」)이 네 언어 모두 한국어 없이 보이고, 고친 조각 낱말이 보인다', async () => {
    for (const [f, s] of [
      ['app/draw.ts', "const R = await getDistance(ctx, '호의 반지름 지정', lp);"],
      ['app/draw.ts', "else if ('keyword' in r && r.keyword === 'L') a = arcByCenterChord(lp, c, await getDistance(ctx, '현의 길이 지정', lp));"],
      ['app/draw.ts', "kws = n === 1 ? [{ key: 'T', label: '시작 접촉부' }, { key: 'L', label: '공차' }] : [{ key: 'T', label: '끝 접촉부' }, { key: 'L', label: '공차' }, { key: 'U', label: '명령 취소' }, ...(n >= 3 ? [{ key: 'C', label: '닫기' }] : [])];"],
      ['app/draw.ts', "prompt = kws.length ? `다음 점 입력 또는 [${kws.map((k) => `${k.label}(${k.key})`).join('/')}]:` : '다음 점 입력:';"],
      ['app/draw.ts', "const r = await ctx.getPoint(useParam ? '끝 매개변수 지정 또는 [각도(A)/사이각(I)]:' : '끝 각도 지정 또는 [매개변수(P)/사이각(I)]:', {"],
      ['app/modify2-util.ts', "const r = await ctx.getPoint(`${prompt} [예(Y)/아니오(N)] <${def ? '예' : '아니오'}>:`, { keywords: [{ key: 'Y', label: '예' }, { key: 'N', label: '아니오' }] });"],
      ['app/modify2-util.ts', 'const r = await ctx.getPoint(def !== null ? `${prompt} <${show(def)}>:` : `${prompt}:`, { preferNumber: true, base: opt.base ?? null, keywords: opt.keywords });'],
      ['app/modify2.ts', "align = await yesNo(ctx, '블록을 객체에 정렬하시겠습니까?', true);"],
      ['app/modify2.ts', "let n = await askNumber(ctx, '세그먼트의 개수 입력 또는 [블록(B)]', null, { int: true, min: 2, max: 32767, keywords: [{ key: 'B', label: '블록' }], distance: false });"],
      ['app/modify2.ts', "let L = await askNumber(ctx, '세그먼트의 길이 지정 또는 [블록(B)]', def, { positive: true, keywords: [{ key: 'B', label: '블록' }] });"],
      ['app/modify2.ts', "const first = type === 'R' ? '첫 번째 구석점 지정' : type === 'P' ? '시작점 지정' : '첫 번째 점 지정';"],
      ['app/modify2.ts', 'const r = await ctx.getPoint(`${first} 또는 [호 길이(A)/객체(O)/직사각형(R)/폴리곤(P)/프리핸드(F)/스타일(S)/수정(M)] <객체>:`, {'],
      ['app/modify2.ts', "const reverse = await yesNo(ctx, '방향 반전', false);"],
      ['app/modify2.ts', "(await yesNo(ctx, '폴리선을 지우시겠습니까?', false))"],
      ['app/helix.ts', "const r = await ctx.getPoint(`${prompt} 또는 [지름(D)] <${f(def)}>:`, { base: center, allowText: true, keywords: [{ key: 'D', label: '지름' }], rubber });"],
      ['app/helix.ts', "const b = await radiusInput(ctx, '기준 반지름 지정', center,"],
      ['app/helix.ts', "const t = await radiusInput(ctx, '상단 반지름 지정', center,"],
      ['app/draw3d.ts', "const d = await ask('네 번째 점 지정 또는 [보이지 않음(I)] <세 개의 측면을 가진 면 작성>:', c.p, true);"],
      ['app/draw.ts', "const c = pt(await ctx.getPoint('도넛의 중심 지정 <종료>:', {"],
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
    // SPLINE 접촉부 = 접선(tangency — 접촉 contact가 아니다), 차수 = degree(차례 排序가 아니다), 타원 사이각(I) = 夹角(角度 둘이 아니다)
    expect(at('en', SPL_N[2]!)).toBe('Enter the next point or [End tangency (T)/Tolerance (L)/Undo (U)/Close (C)]:');
    expect(at('de', SPL_N[0]!)).toContain('[Starttangente (T)/');
    expect(at('zh-CN', SPL_CV)).toContain('[方法(M)/阶数(D)/对象(O)]');
    expect(at('zh-CN', ELL_END)).toContain('/夹角(I)]');
    // 독일어 TRIM 암시적 모서리 연장 모드: 모서리 Kante·연장 Verlängern(Rand·Erweitern·aktivieren이 아니다 — 기본값도 옵션 번역으로)
    expect(at('de', EDGE)).toBe('Impliziten Kantenverlängerungsmodus eingeben [Verlängern (E)/Nicht verlängern (N)] <Verlängern>:');
    // 일본어 GRID 주(M)은 主(M)(주축 主軸이 아니다)
    expect(at('ja', GRID)).toContain('/主(M)/');
    expect(at('de', HX[0]!)).toBe('Basisradius angeben oder [Durchmesser (D)] <1.0000>:');
    expect(at('zh-CN', FACE4)).toBe('指定第四个点或 [不可见(I)] <创建三侧面>：');
    expect(at('en', DONUT)).toBe('Specify center of donut <Exit>:');
  });

  it('기록 줄(친 입력이 붙은 꼴 포함)·현재 설정 줄·결과 줄이 네 언어 모두 한국어 없이 보인다', () => {
    for (const [f, s] of [
      ['app/modify.ts', "const status = () => ctx.print(`현재 설정: 투영=${projLabel()}, 모서리=${edgeMode ? '연장' : '없음'}, 모드=${quick ? '빠른 작업' : '표준'}`);"],
      ['app/modify.ts', "const projLabel = () => (proj === 0 ? '없음' : proj === 2 ? '뷰' : 'UCS');"],
      ['app/draw.ts', "const KNOT_LABEL: Record<KnotParam, string> = { chord: '현', sqrt: '제곱근', uniform: '균일' };"],
      ['app/draw.ts', "const status = () => ctx.print(method === 'fit' ? `현재 설정: 메서드=맞춤   매듭=${KNOT_LABEL[knots]}` : `현재 설정: 메서드=CV   차수=${degree}`);"],
      ['app/modify2.ts', 'ctx.print(`${block ? `블록 "${ft(block)}"` : \'점\'} ${added.length}개를 놓았습니다.`);'],
      ['app/modify2.ts', "ctx.print(`섬 검출 = ${islands ? '예' : '아니오'}`);"],
      ['app/modify2.ts', "const typeName = () => (type === 'R' ? '직사각형' : type === 'P' ? '폴리곤' : '프리핸드');"],
      ['app/modify2.ts', "ctx.print(`최소 호 길이: ${fmtLen(app, minArc)}   최대 호 길이: ${fmtLen(app, maxArc)}   스타일: ${calligraphy ? '컬리그래피' : '일반'}   유형: ${typeName()}`);"],
      ['app/sketch.ts', 'const info = () => ctx.print(`유형 = ${TYPE_NAMES[type]}   증분 = ${f(inc)}   공차 = ${f(tolerance)}`);'],
      ['app/sketch.ts', 'ctx.print(`${TYPE_NAMES[type]} ${ents.length}개가 기록되었습니다.`);'],
      ['app/draw3d.ts', 'ctx.print(`현재 트레이스 폭 = ${formatLength(def, st.units)}`);'],
    ])
      expect(src(f!), s).toContain(s);
    // 기록 줄은 translateTail(기본값 꼬리가 있는 프롬프트는 친 입력이 붙은 꼴도), 설정·결과 줄은 번역층이 글 마디를 통째로
    const tr = (l: string) => (x: string) => guardedTranslate(x, l) ?? translate(x, l);
    const show = (s: string, l: string) => translateTail(s, tr(l)(s), tr(l));
    const left: string[] = [];
    for (const l of LANGS) {
      for (const s of PROMPTS.flatMap((p) => (p.endsWith('>:') ? [p, `${p} A`] : [p]))) if (HANGUL.test(show(s, l))) left.push(`${l}: ${show(s, l)}`);
      for (const s of STATUS) if (HANGUL.test(tr(l)(s))) left.push(`${l}: ${tr(l)(s)}`);
    }
    expect(left).toEqual([]);
    expect(show(`${RC[0]} A`, 'en')).toBe('Specify first corner point or [Arc Length (A)/Object (O)/Rectangle (R)/Polygon (P)/Freehand (F)/Style (S)/Modify (M)] <object>: A');
    expect(show(`${WO_DEL} N`, 'de')).toBe('Möchten Sie die Polylinie löschen? [Ja (Y)/Nein (N)] <Nein>: N');
    expect(show(SPL_N[1]!, 'ja')).toBe('次の点を入力、または [終点接線(T)/公差(L)/元に戻す(U)]:');
    expect(tr('en')('현재 설정: 투영=UCS, 모서리=연장, 모드=표준')).toBe('Current settings: Projection = UCS, Edge = Extend, Mode = Standard');
    expect(tr('de')('현재 설정: 투영=뷰, 모서리=없음, 모드=표준')).toBe('Aktuelle Einstellungen: Projektion = Ansicht, Kanten = Keine, Modus = Standard');
    expect(tr('ja')('현재 설정: 메서드=맞춤   매듭=제곱근')).toBe('現在の設定: 方法=フィット ノット=平方根');
    expect(tr('zh-CN')('점 4개를 놓았습니다.')).toBe('已放置 4 个点。');
    expect(tr('de')('블록 "⁨DOOR⁩" 4개를 놓았습니다.')).toBe('4 Blöcke „DOOR“ platziert.');
    expect(tr('en')('최소 호 길이: 0.5000   최대 호 길이: 1.5000   스타일: 컬리그래피   유형: 폴리곤')).toBe('Minimum arc length: 0.5000 Maximum arc length: 1.5000 Style: Calligraphy Type: Polygon');
    expect(tr('zh-CN')('스플라인 12개가 기록되었습니다.')).toBe('记录了 12 条样条曲线。');
    expect(tr('de')('현재 트레이스 폭 = 0.0500')).toBe('Aktuelle Spurbreite = 0.0500');
  });

  it('고친 번역은 같은 사전의 낱말이다 — 297차 출발점(독일어 끊기·자르기·연장·모드·결합·스냅·경계, 일본어 주(M))과 묶음, 새 열쇠는 조각·이름의 번역', () => {
    const [en, de, ja, zh] = [dict.en, dict.de, dict.ja, dict['zh-CN']];
    // 독일어 출발점: 끊기 Unterbrechen·자르기 Stutzen(geteilt·geschnitten·Zuschneiden이 아니다), 연장 Verlängern·모서리 Kante, 모드 Modus(-Modus가 아니다), 결합 verbinden
    expect(de['이 객체는 끊을 수 없습니다.']).toContain(de['끊기']!.toLowerCase().replace('unterbrechen', 'unterbrochen'));
    expect([de['이 객체는 자를 수 없습니다.'], de['자를 객체가 없습니다.']]).toEqual(['Dieses Objekt kann nicht gestutzt werden.', `Keine Objekte zum ${de['자르기']}.`]);
    expect([de['연장(E)'], de['연장 안 함(N)'], de['] <연장>:']]).toEqual([`${de['연장']} (E)`, 'Nicht verlängern (N)', `] <${de['연장']}>:`]);
    expect(de['암시적 모서리 연장 모드 입력 [']).toBe(`Impliziten ${de['모서리']}nverlängerungsmodus eingeben [`);
    expect(de['암시적 모서리 연장 모드 입력 [연장(E)/연장 안 함(N)] <{0}>:']).toBe(`${de['암시적 모서리 연장 모드 입력 [']}${de['연장(E)']}/${de['연장 안 함(N)']}] <{0}>:`);
    expect(de['모드']).toBe(strip(de['모드(O)']));
    for (const k of ['{0}개 객체가 1개 {1}(으)로 결합되었습니다.', '{0}개 객체가 {1}개 객체로 결합되었습니다.', '객체 {0}개를 {1}개로 결합했습니다.']) expect(de[k], k).toMatch(/verbunden\.$/);
    // 스냅은 Fang(「스냅 X 간격」 Fang-X-Abstand), 증분 각도 Inkrementwinkel(「증분 각도는 …」), 경계 세트 Umgrenzungssatz(「경계 세트(B)」 — Rand 가장자리가 아니다)
    expect(de['스냅 Y 간격']).toBe(de['스냅 X 간격']!.replace('X', 'Y'));
    expect(de['증분 각도는 {0}과(와) {1} 사이의 각도여야 합니다.']).toContain(de['증분 각도']);
    expect(de['경계 세트']).toBe(strip(de['경계 세트(B)']));
    // 일본어 GRID 주(M)은 「주」 主(「주 격자선」 主グリッド線 — 主軸 주축이 아니다)
    expect([ja['주(M)'], ja['주 격자선 간격(격자선 수)']!.slice(0, 1)]).toEqual([`${ja['주']}(M)`, ja['주']]);
    // 묶음: 반폭·차수는 옵션 조각의 낱말(Half width Receive·Erhalten Sie·Order·差分·排序·Reihenfolge가 아니다)
    for (const l of LANGS) {
      const d = dict[l];
      expect(d['반폭'], l).toBe(strip(d['반폭(H)']));
      expect(d['차수'], l).toBe(strip(d['차수(D)']));
    }
    expect([zh['차수(D)'], zh['현재 설정: 메서드=CV 차수={0}'], de['현재 설정: 메서드=CV 차수={0}']]).toEqual(['阶数(D)', '当前设置：方法 = CV 阶数 = {0}', 'Aktuelle Einstellung: Methode = CV, Grad = {0}']);
    expect(zh['스플라인 차수 입력']).toContain('阶数');
    // SPLINE 접촉부는 접선(tangency): 「접선」 Tangent·接線·切线·Tangente(contact·接触·Kontakt가 아니다)
    for (const l of LANGS) {
      const d = dict[l];
      for (const k of ['시작 접촉부', '끝 접촉부', '시작 접촉부 지정:', '끝 접촉부 지정:', '시작 접촉부(T)', '끝 접촉부(T)']) {
        expect(d[k]!.toLowerCase(), `${l}: ${k}`).toContain(d['접선']!.toLowerCase().slice(0, l === 'en' || l === 'de' ? 6 : 2));
        expect(d[k], `${l}: ${k}`).not.toMatch(/contact|Kontakt|接触|接点/i);
      }
      expect(d['시작 접촉부(T)'], l).toBe(`${d['시작 접촉부']}${l === 'en' || l === 'de' ? ' ' : ''}(T)`);
    }
    // 영어 고도 Elevation(RECTANG 「…고도(E)…」 — Altitude가 아니다), 나선 Helix, 비틀기 Twist, 구름형 리비전 Revision cloud
    expect([en['고도'], en['고도={0}'], en['나선'], de['나선'], en['비틀기(W)']]).toEqual(['Elevation', 'Elevation={0}', 'Helix', 'Helix', `${en['비틀기']} (W)`]);
    expect(en['첫 번째 구석점 지정 또는 [모따기(C)/고도(E)/모깎기(F)/두께(T)/폭(W)]:']).toContain(`${en['고도']}(E)`);
    expect([ja['비틀기'], zh['비틀기']]).toEqual([strip(ja['비틀기(W)']), '扭转']);
    expect(zh['나선 높이 지정 또는 [축 끝점(A)/회전(T)/회전 높이(H)/비틀기(W)] <{0}>:']).toContain(`${zh['비틀기']}(W)`);
    expect([en['구름형 리비전'], en['구름형 리비전을 완료했습니다.'], en['구름형 리비전을 고쳤습니다.']]).toEqual(['Revision cloud', 'Revision cloud completed.', 'Modified revision cloud.']);
    // 중국어: 3점·2점은 「3점(3P)」의 3 个点(3分이 아니다), 두께 厚度(粗细가 아니다), 모깎기 圆角(모따기 倒角이 아니다), 도넛 圆环(甜甜圈이 아니다), 구름형 리비전 云状修订(云端 클라우드가 아니다)
    expect([zh['3점'], zh['2점']]).toEqual([zh['3점(3P)']!.replace(/\s*\(3P\)$/, ''), zh['2점(2P)']!.replace(/\s*\(2P\)$/, '')]);
    expect([zh['두께'], zh['두께={0}']]).toEqual(['厚度', '厚度={0}']);
    expect(zh['첫 번째 구석점 지정 또는 [모따기(C)/고도(E)/모깎기(F)/두께(T)/폭(W)]:']).toContain(`${zh['두께']}(T)`);
    expect(zh['직사각형이 너무 작아 모깎기하지 않았습니다.']).toContain(zh['모깎기']);
    expect([zh['도넛'], zh['도넛의 중심 지정 <종료>:']]).toEqual(['圆环', '指定圆环中心 <退出>:']);
    expect(zh['도넛의 내부 지름 지정']).toContain(zh['도넛']);
    for (const k of ['구름형 리비전을 만들 수 없습니다.', '구름형 리비전을 완료했습니다.', '구름형 리비전을 고칠 수 없습니다.', '구름형 리비전을 고쳤습니다.', '시작점과 끝점이 같아 구름을 고칠 수 없습니다.']) {
      expect(zh[k], k).toContain(zh['구름형 리비전']);
      expect(zh[k], k).not.toMatch(/云端|固定/);
    }
    expect([zh['원 지름의 첫 번째 끝점 지정:'], de['원 지름의 첫 번째 끝점 지정:']]).toEqual([zh['원 지름의 두 번째 끝점 지정:']!.replace('第二', '第一'), 'Erster Endpunkt des Kreisdurchmessers:']);
    expect([zh['사이각(I)'], zh['다음 점 입력:']]).toEqual(['夹角(I)', '输入下一个点：']);
    expect(zh['사이각 지정']).toBe(zh['사이각 지정(방향 전환은 Ctrl 키):']!.replace(/（.*$/, ''));
    expect([zh['이 객체는 등분할할 수 없습니다.'], zh['이 객체는 길이 분할할 수 없습니다.']]).toEqual([`此对象无法${zh['등분할']}。`, `此对象无法按${zh['길이 분할']}。`]);
    expect([de['이 객체는 등분할할 수 없습니다.'], de['이 객체는 길이 분할할 수 없습니다.']]).toEqual(['Dieses Objekt kann nicht in gleiche Teile geteilt werden.', 'Dieses Objekt kann nicht nach Länge geteilt werden.']);
    // 트레이스 폭은 「트레이스 폭 지정 <{0}>:」의 낱말(선가중치 Linienstärke·描边이 아니다), 블록 Block(-Block이 아니다), 구름 고치기 geändert
    expect(de['현재 트레이스 폭 = {0}']).toContain(de['트레이스 폭 지정 <{0}>:']!.split(' ')[0]);
    expect(zh['현재 트레이스 폭 = {0}']).toContain(zh['트레이스 폭 지정 <{0}>:']!.slice(2, 6));
    expect([de['블록'], de['구름형 리비전을 고쳤습니다.']]).toEqual([strip(de['블록(B)']), 'Revisionswolke geändert.']);
    expect(de['시작점과 끝점이 같아 구름을 고칠 수 없습니다.']).toContain('geändert');
    // 새 열쇠: 통째 = 앞 글 + 옵션 조각, 예/아니오 통째 = 앞 글 + 예·아니오 조각, 「:」 꼴 = 본문 번역 + 콜론, 지운 틀 없음
    for (const l of LANGS) {
      const d = dict[l];
      const zhl = l === 'zh-CN';
      const colon = zhl ? '：' : ':';
      for (const p of SPL_N) {
        const [front, opts] = [p.slice(0, p.indexOf('[') + 1), p.slice(p.indexOf('[') + 1, -2).split('/')];
        expect(d[p], `${l}: ${p}`).toBe(`${d[front]}${opts.map((o) => d[o]).join('/')}]${colon}`);
      }
      for (const q of ['블록을 객체에 정렬하시겠습니까?', '방향 반전', '폴리선을 지우시겠습니까?']) {
        expect(d[`${q} [`], `${l}: ${q}`).toBe(`${d[q]} [`);
        expect(d[`${q} [예(Y)/아니오(N)] <{0}>:`], `${l}: ${q}`).toBe(`${d[`${q} [`]}${d['예(Y)']}/${d['아니오(N)']}] <{0}>${colon}`);
      }
      for (const k of ['세그먼트의 개수 입력 또는 [블록(B)]', '세그먼트의 개수 입력', '세그먼트의 길이 지정 또는 [블록(B)]', '호의 반지름 지정', '현의 길이 지정']) expect(d[`${k}:`], `${l}: ${k}`).toBe(`${d[k]}${colon}`);
      for (const k of ['기준 반지름 지정 또는 [', '상단 반지름 지정 또는 [']) expect(d[`${k}지름(D)] <{0}>:`], `${l}: ${k}`).toBe(`${d[k]}${d['지름(D)']}] <{0}>${colon}`);
      expect(d['] <세 개의 측면을 가진 면 작성>:'], l).toBe(d['네 번째 점 지정 또는 [보이지 않음(I)] <세 개의 측면을 가진 면 작성>:']!.slice(d['네 번째 점 지정 또는 [보이지 않음(I)] <세 개의 측면을 가진 면 작성>:']!.lastIndexOf(']')));
      expect(d['섬 검출 = 예'], l).toMatch(new RegExp(` = ${d['예']}$`));
      expect(d['섬 검출 = 아니오'], l).toMatch(new RegExp(` = ${d['아니오']}$`));
      expect(d['현재 설정: 투영=UCS, 모서리=연장, 모드=빠른 작업'], l).toContain(strip(d['빠른 작업(Q)']));
      expect(d['현재 설정: 투영=뷰, 모서리=없음, 모드=표준'], l).toContain(strip(d['뷰(V)']));
      expect(d['현재 설정: 투영=없음, 모서리=연장, 모드=표준'], l).toContain(strip(d['연장(E)']));
      for (const k of [
        '현재 설정: 투영={0}, 모서리={1}, 모드={2}',
        '현재 설정: 메서드=맞춤 매듭={0}',
        '{0} {1}개를 놓았습니다.',
        '섬 검출 = {0}',
        `{0} 또는 ${RC_OPTS}`,
        '최소 호 길이: {0} 최대 호 길이: {1} 스타일: {2} 유형: {3}',
        '유형 = {0} 증분 = {1} 공차 = {2}',
        '{0} {1}개가 기록되었습니다.',
        '{0} 또는 [지름(D)] <{1}>:',
      ])
        expect(d[k], `${l}: ${k}`).toBeUndefined();
    }
  });
});
