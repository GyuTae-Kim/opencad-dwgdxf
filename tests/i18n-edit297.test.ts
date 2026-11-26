/**
 * 297차: 수정(편집) 명령 묶음(MOVE·COPY·ROTATE·SCALE·MIRROR·OFFSET·TRIM·EXTEND·BREAK·LENGTHEN·EXPLODE·FILLET·CHAMFER·JOIN·STRETCH·
 * ALIGN·BLEND·COPYM·EXTRIM)의 번역과 296차가 한도 밖으로 남긴 오역.
 * - 빠진 번역: TRIM·EXTEND 프롬프트 통째(앞 글 「… Shift 키를 누른 채 선택하여 연장 또는 [」와 옵션 절단 모서리(T)·걸치기(C)·프로젝트(P) 등),
 *   예/아니오 물음 셋(MIRROR·OFFSET 지우기·ALIGN 축척), OFFSET 통과점·면의 점, 연장 모드, CHAMFER 첫 선, ALIGN 근원점·대상점(틀이 「첫 번째」를 잡음),
 *   COPY·ROTATE·OFFSET·FILLET·CHAMFER·BLEND 현재 설정 줄(틀이 앱 낱말 「다중(M)」·「시계 방향」·「예」·「자르기」·「접선」을 잡음) 등.
 * - 오역: 걸치기 Putting on·着る·悬挑·Anziehen, 프로젝트(투영) Projects·项目, 분해 disassembled·拆卸·模块, 자르기 clip·切り取る·裁剪, 연장 扩展,
 *   독일어 교차점 Kreuzung·중심 Mittelpunkt(중간점과 같은 낱말)·스냅 Schnappschuss·등각 제도 Konformes System·모깎기 Filet·끊기점 Haltepunkt 등 —
 *   같은 사전 안의 맞는 번역으로. 프롬프트·설정 줄 꼴은 소스에서 확인한다.
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

const TRIM_F = '자를 객체 선택 또는 Shift 키를 누른 채 선택하여 연장 또는 [';
const EXT_F = '연장할 객체 선택 또는 Shift 키를 누른 채 선택하여 자르기 또는 [';
const TRIM_Q = `${TRIM_F}절단 모서리(T)/걸치기(C)/모드(O)/프로젝트(P)/지우기(R)/명령 취소(U)]:`;
const TRIM_S = `${TRIM_F}절단 모서리(T)/울타리(F)/걸치기(C)/모드(O)/프로젝트(P)/모서리(E)/지우기(R)/명령 취소(U)]:`;
const EXT_Q = `${EXT_F}경계 모서리(B)/걸치기(C)/모드(O)/프로젝트(P)]:`;
const EXT_S = `${EXT_F}경계 모서리(B)/울타리(F)/걸치기(C)/모드(O)/프로젝트(P)/모서리(E)/명령 취소(U)]:`;
const COPY2 = '두 번째 점 지정 또는 [배열(A)] <첫 번째 점을 변위로 사용>:';
const MIRROR = '원본 객체를 지우시겠습니까? [예(Y)/아니오(N)] <아니오>:';
const OFFSET_E = '간격띄우기 후 원본 객체를 지우시겠습니까? [예(Y)/아니오(N)] <예>:';
const ALIGN_S = '정렬 점을 기준으로 객체에 축척을 적용합니까? [예(Y)/아니오(N)] <아니오>:';
const THROUGH = '통과점 지정 또는 [종료(E)/다중(M)/명령 취소(U)] <다음 객체>:';
const SIDE = '간격띄우기할 면의 점 지정 또는 [종료(E)/다중(M)/명령 취소(U)] <종료>:';
const EXT_MODE = '연장 모드 옵션 입력 [빠른 작업(Q)/표준(S)] <표준>:';
const EDGE = '암시적 모서리 연장 모드 입력 [연장(E)/연장 안 함(N)] <연장>:';
const TOTAL = '전체 길이 또는 [각도(A)] 지정 <1.0000>:';
const FIL1 = '첫 번째 객체 선택 또는 [명령 취소(U)/폴리선(P)/반지름(R)/자르기(T)/다중(M)]:';
const CHA1 = '첫 번째 선 선택 또는 [명령 취소(U)/폴리선(P)/거리(D)/각도(A)/자르기(T)/메서드(E)/다중(M)]:';
const ALIGN = ['첫 번째 근원점 지정:', '두 번째 근원점 지정:', '세 번째 근원점 지정 또는 <계속>:', '첫 번째 대상점 지정:', '두 번째 대상점 지정:', '세 번째 대상점 지정:'];
const BREAK2 = '두 번째 끊기점 지정 또는 [첫 번째 점(F)]:';
const GAP = '간격 거리 지정:';
const PROMPTS = [TRIM_Q, TRIM_S, EXT_Q, EXT_S, COPY2, MIRROR, OFFSET_E, ALIGN_S, THROUGH, SIDE, EXT_MODE, EDGE, TOTAL, FIL1, CHA1, ...ALIGN, BREAK2, GAP];

/** 명령 시작의 현재 설정 줄(소스 print — OFFSET은 빈칸 둘)과 결과 줄 */
const STATUS = [
  '현재 설정: 복사 모드 = 다중(M)',
  '현재 설정: 복사 모드 = 단일(S)',
  'UCS에서 현재 양의 각도: 측정 방향=시계 반대 방향 기준 방향=0',
  'UCS에서 현재 양의 각도: 측정 방향=시계 방향 기준 방향=90',
  ...['예', '아니오'].flatMap((e) => ['현재', '원본'].map((y) => `현재 설정: 원본 지우기=${e}  도면층=${y}  OFFSETGAPTYPE=0`)),
  '현재 설정: 모드 = 자르기, 반지름 = 0.0000',
  '현재 설정: 모드 = 자르지 않기, 반지름 = 5.0000',
  ...['자르기', '자르지 않기'].flatMap((m) => [`(${m} 모드) 현재 모따기 길이 = 1.0000, 각도 = 45`, `(${m} 모드) 현재 모따기 거리1 = 1.0000, 거리2 = 2.0000`]),
  '현재 길이: 10.0000, 사이각: 90.0000',
  '5개를 찾음 (2개 중복)',
  '연속성 = 접선',
  '연속성 = 부드럽게',
  '블록이 너무 커서 펼침 몫을 넘은 블록 참조는 모서리·경계로 쓰지 않았습니다.',
];

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.unstubAllGlobals();
});

describe('수정(편집) 명령 묶음의 번역과 296차 한도 밖 오역(297차)', () => {
  it('명령행 입력 줄(앞 글 「… [」·옵션·뒤 글 「] <…>:」)이 네 언어 모두 한국어 없이 보이고, 고친 조각 낱말이 보인다', async () => {
    for (const [f, s] of [
      ['app/modify.ts', "const prompt = `${mode === 'trim' ? '자를 객체 선택 또는 Shift 키를 누른 채 선택하여 연장' : '연장할 객체 선택 또는 Shift 키를 누른 채 선택하여 자르기'} 또는 [${kws.map((k) => `${k.label}(${k.key})`).join('/')}]:`;"],
      ['app/modify.ts', "const edgeKw: Keyword = mode === 'trim' ? { key: 'T', label: '절단 모서리' } : { key: 'B', label: '경계 모서리' };"],
      ['app/modify.ts', "const prompt = first ? '두 번째 점 지정 또는 [배열(A)] <첫 번째 점을 변위로 사용>:' : '두 번째 점 지정 또는 [배열(A)/종료(E)/명령 취소(U)] <종료>:';"],
      ['app/modify.ts', "const erase = await yesNo(ctx, '원본 객체를 지우시겠습니까?', false);"],
      ['app/modify.ts', "if (r.keyword === 'E') erase = await yesNo(ctx, '간격띄우기 후 원본 객체를 지우시겠습니까?', erase);"],
      ['app/modify.ts', "const q = await ctx.getPoint(`${through ? '통과점' : '간격띄우기할 면의 점'} 지정 또는 [종료(E)/다중(M)/명령 취소(U)] <${multiple ? '다음 객체' : '종료'}>:`, {"],
      ['app/modify.ts', "const k = await ctx.getPoint(`${mode === 'trim' ? '자르기' : '연장'} 모드 옵션 입력 [빠른 작업(Q)/표준(S)] <${quick ? '빠른 작업' : '표준'}>:`, {"],
      ['app/modify.ts', "const k = await ctx.getPoint(`암시적 모서리 연장 모드 입력 [연장(E)/연장 안 함(N)] <${edgeMode ? '연장' : '연장 안 함'}>:`, {"],
      ['app/modify.ts', 'const v = await ctx.getPoint(`전체 길이 또는 [각도(A)] 지정 <${formatLength(Number(m.lenTotal ?? 1), st.units)}>:`,'],
      ['app/modify.ts', "const first = kind === 'fillet' ? '첫 번째 객체 선택' : '첫 번째 선 선택';"],
      ['app/modify.ts', "let r = await ctx.getPoint('두 번째 끊기점 지정 또는 [첫 번째 점(F)]:', { keywords: [{ key: 'F', label: '첫 번째 점' }] });"],
      ['app/modify2.ts', "const ord = ['첫 번째', '두 번째', '세 번째'];"],
      ['app/modify2.ts', "const prompt = i === 2 ? '세 번째 근원점 지정 또는 <계속>:' : `${ord[i]} 근원점 지정:`;"],
      ['app/modify2.ts', 'const b = await ctx.getPoint(`${ord[i]} 대상점 지정:`, {'],
      ['app/modify2.ts', "const scale = src.length === 2 ? await yesNo(ctx, '정렬 점을 기준으로 객체에 축척을 적용합니까?', false) : false;"],
      ['app/modify2.ts', "const s = await askNumber(ctx, '간격 거리 지정', null, { positive: true, base });"],
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
    // TRIM 옵션: 걸치기 = crossing, 프로젝트 = 투영(projection) — 명령행 마디가 잇닿아 통째 번역과 같다
    expect(at('en', TRIM_S)).toBe('Select object to trim or shift-select to extend or [Cutting Edge (T)/Fence (F)/Crossing (C)/Mode (O)/Projection (P)/Edge (E)/Erase (R)/Undo (U)]:');
    expect(at('ja', EXT_Q)).toContain('[境界エッジ(B)/交差(C)/モード(O)/投影(P)]');
    expect(at('de', TRIM_Q)).toContain('/Kreuzung (C)/');
    // 연장 모드의 연장은 延伸(扩展이 아니다 — 기본값도 옵션 번역으로), 끊기점은 Trennpunkt(Haltepunkt가 아니다)
    expect(at('zh-CN', EDGE)).toContain('[延伸(E)/不延伸(N)] <延伸>');
    expect(at('de', BREAK2)).toContain('Trennpunkt');
    expect(at('en', COPY2)).toContain('<Use first point as displacement>');
    expect(at('ja', ALIGN[2]!)).toContain('源点');
  });

  it('기록 줄(친 입력이 붙은 꼴 포함)·현재 설정 줄·결과 줄이 네 언어 모두 한국어 없이 보인다', () => {
    for (const [f, s] of [
      ['app/modify.ts', "ctx.print(`현재 설정: 복사 모드 = ${multiple ? '다중(M)' : '단일(S)'}`);"],
      ['app/modify.ts', "ctx.print(`UCS에서 현재 양의 각도: 측정 방향=${angdir ? '시계 방향' : '시계 반대 방향'} 기준 방향=${deg(angbase).toFixed(0)}`);"],
      ['app/modify.ts', "ctx.print(`현재 설정: 원본 지우기=${erase ? '예' : '아니오'}  도면층=${layerCurrent ? '현재' : '원본'}  OFFSETGAPTYPE=${offsetGapType()}`);"],
      ['app/modify.ts', "const mode = trim ? '자르기' : '자르지 않기';"],
      ['app/modify.ts', "if (kind === 'fillet') ctx.print(`현재 설정: 모드 = ${mode}, 반지름 = ${formatLength(hnum(st, '$FILLETRAD', 0), st.units)}`);"],
      ['app/modify.ts', "else if (m.chamferMethod === 'A') ctx.print(`(${mode} 모드) 현재 모따기 길이 = ${formatLength(hnum(st, '$CHAMFERC', 0), st.units)}, 각도 = ${deg(hnum(st, '$CHAMFERD', 0)).toFixed(0)}`);"],
      ['app/modify.ts', "else ctx.print(`(${mode} 모드) 현재 모따기 거리1 = ${formatLength(hnum(st, '$CHAMFERA', 0), st.units)}, 거리2 = ${formatLength(hnum(st, '$CHAMFERB', 0), st.units)}`);"],
      ['app/modify.ts', 'ctx.print(`현재 길이: ${formatLength(len, st.units)}${arc}`);'],
      ['app/editcmds2-stretch.ts', "ctx.print(`${hs.length}개를 찾음${n < hs.length ? ` (${hs.length - n}개 중복)` : ''}`);"],
      ['app/modify2.ts', "ctx.print(`연속성 = ${cont === 'tangent' ? '접선' : '부드럽게'}`);"],
      ['edit/geom/types.ts', "blockEdgesCut: '블록이 너무 커서 펼침 몫을 넘은 블록 참조는 모서리·경계로 쓰지 않았습니다.',"],
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
    expect(show(`${MIRROR} Y`, 'ja')).toBe('元のオブジェクトを削除しますか？ [はい(Y)/いいえ(N)] <いいえ>: Y');
    expect(show(`${THROUGH} M`, 'en')).toBe('Specify through point or [Exit (E)/Multiple (M)/Undo (U)] <next object>: M');
    expect(show(`${EXT_MODE} Q`, 'de')).toBe('Option für Verlängern-Modus eingeben [Schnellaktion (Q)/Standard (S)] <Standard>: Q');
    expect(show(FIL1, 'zh-CN')).toBe('选择第一个对象或 [撤销(U)/多段线(P)/半径(R)/修剪(T)/多个(M)]：');
    expect(tr('en')(STATUS[5]!)).toBe('Current settings: Erase source=Yes, Layer=Source, OFFSETGAPTYPE=0');
    expect(tr('de')('(자르지 않기 모드) 현재 모따기 거리1 = 1.0000, 거리2 = 2.0000')).toBe('(Nicht-Stutzen-Modus) Aktueller Fasenabstand 1 = 1.0000, Abstand 2 = 2.0000');
    expect(tr('zh-CN')('현재 설정: 복사 모드 = 단일(S)')).toBe('当前设置：复制模式 = 单个(S)');
    expect(tr('ja')('연속성 = 부드럽게')).toBe('連続性 = 滑らか');
  });

  it('고친 번역은 같은 사전의 낱말이다 — 296차 출발점(독일어 교차점·중심·스냅·등각 제도)과 묶음, 새 열쇠는 조각·이름의 번역', () => {
    const [en, de, ja, zh] = [dict.en, dict.de, dict.ja, dict['zh-CN']];
    // 독일어 출발점: 교차점 Schnittpunkt(길 교차로 Kreuzung이 아니다 — 「객체 스냅: 교차점」), 중심 Zentrum(중간점 Mittelpunkt와 다른 낱말 — 「객체 스냅: 중심」),
    // 상태 막대 메뉴 켠 항목·추적 툴팁은 이름 열쇠를 따른다(296차)
    expect([de['교차점'], de['가상 교차점'], de['중심']]).toEqual([de['객체 스냅: 교차점']!.split(': ')[1], 'Virtueller Schnittpunkt', de['객체 스냅: 중심']!.split(': ')[1]]);
    expect(de['중심']).not.toBe(de['중간점']);
    for (const n of ['교차점', '가상 교차점', '중심']) {
      expect(de[`✓ ${n}`], n).toBe(`✓ ${de[n]}`);
      expect(de[`${n}: {0} < {1}`], n).toBe(`${de[n]}: {0} < {1}`);
    }
    // 독일어 스냅은 Fang(사진 Schnappschuss가 아니다 — 「스냅 및 그리드(S)」), 등각 제도는 「등각투영 제도 (ISODRAFT) · …」의 Isometrisches Zeichnen, 기준점 Basispunkt
    expect([de['스냅 및 그리드'], de['등각투영 스냅']]).toEqual([strip(de['스냅 및 그리드(S)']), 'Isometrischer Fang']);
    const iso = de['등각투영 제도 (ISODRAFT) · 오른쪽 클릭으로 평면 선택, F5로 평면 전환']!.split(' (')[0]!;
    expect([de['등각 제도'], de['등각투영 제도'], de['<등각투영 제도 끄기>']]).toEqual([iso, iso, `<${iso} aus>`]);
    expect(de['기준점:']).toBe('Basispunkt:');
    // 걸치기(TRIM·EXTEND 옵션) = 걸침(crossing): 交差·窗交·Kreuzung(着る·悬挑·Anziehen·Putting on이 아니다), 프로젝트 = 투영(projection)
    expect(LANGS.map((l) => dict[l]['걸치기'])).toEqual(['Crossing', 'Kreuzung', ja['걸침'], zh['걸침']]);
    expect(LANGS.map((l) => dict[l]['프로젝트'])).toEqual(['Projection', 'Projektion', '投影', '投影']);
    for (const l of LANGS) expect(dict[l]['투영 옵션 입력 ['], l).toMatch(/projection|Projektion|投影/i);
    // 모깎기는 Abrunden(고기 Filet이 아니다 — 「모깎기(F)」·「…모깎기하지 않았습니다」), 폴리선 끝 모깎기는 verrundet(gefüllt가 아니다)
    expect([de['모깎기'], de['모깎기 (F)']]).toEqual(['Abrunden', 'Abrunden (F)']);
    expect(de['폴리선의 끝 세그먼트만 모깎기·모따기할 수 있습니다.']).toContain('verrundet');
    expect(ja['같은 객체의 같은 세그먼트는 모깎기·모따기할 수 없습니다.']).toContain(`${ja['모깎기']}・${ja['모따기']}`);
    // 간격띄우기(offset)는 versetzen(verschieben = 이동이 아니다), 끊기점은 Trennpunkt, 모따기 거리는 Fasenabstand(길이 Fasenlänge가 아니다)
    expect(de['해당 객체를 간격띄우기할 수 없습니다.']).toContain('versetzt');
    expect(de['해당 거리로 간격띄우기할 수 없습니다.']).toContain('Versatz');
    for (const k of ['두 번째 끊기점 지정 또는 [', '끊기점 지정:', '두 번째 끊기점 지정 또는 [첫 번째 점(F)]:']) expect(de[k], k).toContain('Trennpunkt');
    expect(de['첫 번째 모따기 거리 지정']).toContain('Fasenabstand');
    // 분해는 explode·分解(disassembled·拆卸·模块이 아니다), 자르기(EXTRIM)는 trim·トリム·修剪(clip·切り取る·裁剪이 아니다), 연장은 延伸·verlängern
    expect([en['{0}개는 분해할 수 없습니다.'], en['{0}개를 분해해 객체 {1}개를 만들었습니다.']]).toEqual(['{0} could not be exploded.', 'Exploded {0} into {1} objects.']);
    for (const k of ['이 객체는 분해할 수 없습니다.', '이 블록은 분해할 수 없도록 정의되어 있습니다.']) expect(zh[k], k).toMatch(/^此(对象|块).*分解/);
    for (const k of ['자를 쪽 지정:', '자를 객체가 없습니다.']) {
      expect(en[k], k).toMatch(/trim/);
      expect(ja[k], k).toContain('トリム');
    }
    expect([zh['이 객체는 자를 수 없습니다.'], zh['자를 객체가 없습니다.']]).toEqual(['此对象无法修剪。', '没有可修剪的对象。']);
    expect([zh['이 객체는 연장할 수 없습니다.'], zh['연장(E)'], zh['연장 안 함(N)']]).toEqual(['此对象无法延伸。', '延伸(E)', '不延伸(N)']);
    expect(de['이 객체는 연장할 수 없습니다.']).toContain('verlängert');
    expect(ja['암시적 모서리 연장 모드 입력 [']).toContain('エッジ');
    expect(zh['암시적 모서리 연장 모드 입력 [연장(E)/연장 안 함(N)] <{0}>:']).toBe(`${zh['암시적 모서리 연장 모드 입력 [']}${zh['연장(E)']}/${zh['연장 안 함(N)']}] <{0}>：`);
    // 원본(S)(OFFSET 도면층 옵션 — 원본 객체의 도면층)은 源·Quelle(원점 原点·Ursprung이 아니다), ALIGN 근원점은 source point·源点·Quellpunkt
    expect([zh['원본(S)'], de['원본(S)']]).toEqual(['源(S)', 'Quelle (S)']);
    expect(LANGS.map((l) => dict[l]['세 번째 근원점 지정 또는 <계속>:'])).toEqual([
      'Specify third source point or <continue>:',
      'Dritten Quellpunkt angeben oder <weiter>:',
      '3 番目の源点を指定、または <継続>:',
      '指定第三个源点或 <继续>：',
    ]);
    // 키워드 이름(바로 가기 메뉴)은 옵션 조각의 낱말: 모드 Mode, 부드럽게 Smooth·Glätten, 분할 Divide·分割, 반복(마지막) 重复（上次）
    expect([en['모드'], en['부드럽게'], de['부드럽게'], en['분할'], zh['분할']]).toEqual(['Mode', strip(en['부드럽게(S)']), strip(de['부드럽게(S)']), strip(en['분할(D)']), strip(zh['분할(D)'])]);
    expect(zh['반복(마지막)']).toBe('重复（上次）');
    // 새 열쇠: TRIM·EXTEND 통째 = 앞 글 + 옵션 조각, 옵션 조각 = 키워드 이름 + 고를 글자, 예/아니오 통째 = 앞 글 + 예·아니오 조각, 지운 틀 없음
    for (const l of LANGS) {
      const d = dict[l];
      const zhl = l === 'zh-CN';
      const gap = l === 'en' || l === 'de' ? ' ' : '';
      for (const [n, k] of [['절단 모서리', 'T'], ['경계 모서리', 'B'], ['걸치기', 'C'], ['프로젝트', 'P'], ['지우기', 'R'], ['울타리', 'F']] as const) expect(d[`${n}(${k})`], `${l}: ${n}`).toBe(`${d[n]}${gap}(${k})`);
      for (const p of [TRIM_Q, TRIM_S, EXT_Q, EXT_S, FIL1, CHA1]) {
        const [front, opts] = [p.slice(0, p.indexOf('[') + 1), p.slice(p.indexOf('[') + 1, -2).split('/')];
        expect(d[p], `${l}: ${p}`).toBe(`${d[front]}${opts.map((o) => d[o]).join('/')}${zhl ? ']：' : ']:'}`);
      }
      for (const q of ['원본 객체를 지우시겠습니까? [', '간격띄우기 후 원본 객체를 지우시겠습니까? [', '정렬 점을 기준으로 객체에 축척을 적용합니까? ['])
        expect(d[`${q}예(Y)/아니오(N)] <{0}>:`], `${l}: ${q}`).toBe(`${d[q]}${d['예(Y)']}/${d['아니오(N)']}${zhl ? '] <{0}>：' : '] <{0}>:'}`);
      for (const k of [
        '현재 설정: 복사 모드 = {0}',
        'UCS에서 현재 양의 각도: 측정 방향={0} 기준 방향={1}',
        '현재 설정: 원본 지우기={0} 도면층={1} OFFSETGAPTYPE={2}',
        '현재 설정: 모드 = {0}, 반지름 = {1}',
        '({0} 모드) 현재 모따기 길이 = {1}, 각도 = {2}',
        '({0} 모드) 현재 모따기 거리1 = {1}, 거리2 = {2}',
        '연속성 = {0}',
        '{0} 근원점 지정:',
        '{0} 대상점 지정:',
        '{0} 모드 옵션 입력 [빠른 작업(Q)/표준(S)] <{1}>:',
        '{0} 모드 옵션 입력 [',
      ])
        expect(d[k], `${l}: ${k}`).toBeUndefined();
    }
  });
});
