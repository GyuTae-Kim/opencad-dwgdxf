/**
 * 299차: 조회·측정 명령 묶음(DIST·MEASUREGEOM·AREA·MEASUREANGLE·MASSPROP·ID·LIST·TIME·DBLIST·CAL·QUICKCALC)의 번역과 298차가 남긴 것.
 * - 빠진 번역: MEASUREGEOM 「다중 점(M)」, AREA 「면적 추가(A)」·「면적 빼기(S)」와 더하기·빼기 모드 앞 글(명령행은 앞 글·옵션·뒤 글 조각으로 찾는데 통째 열쇠만 있었다),
 *   DBLIST 빈 도면 줄, QuickCalc 「변수: 없음」, CAL 오류 줄(`CAL: ${오류}` — 오류 글 열쇠는 있으나 「CAL: 」을 붙인 통째는 없었다),
 *   틀 「{0}에는 점이 아니라 수가 필요합니다.」가 앱 낱말(거듭제곱·나누는 값·점의 좌표·단위·…의 인수)을 잡은 계산식 오류.
 * - 오역: 독일어 스냅 Snap(→ Fang)·해치 경계 Rand·Grenze(→ 같은 프롬프트 조각의 Begrenzung)·PEDIT 결합 유형 Dehnen·구름형 리비전 Cloud-Revision·PDMODE 안내(뜻 거꾸로),
 *   중국어 弧角·模块·二分法·扭转次数·「C 弦(C)」·角点点·PDMODE 안내, 묶음의 0으로 나누기 分割·ドット·フォント·繰り返し二乗·補償·角度测量单位·分割线·表达方式·清除录制·
 *   撰写人·Created by·端点(X)·Bereich(면적)·Leistung·Wert teilen 등 — 같은 사전 안의 맞는 번역으로. 프롬프트·결과 줄 꼴은 소스에서 확인한다.
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

const MEA = '첫 번째 점 지정 또는 [거리(D)/반지름(R)/각도(A)/면적(AR)/종료(X)] <거리>:';
const MEA2 = '두 번째 점 지정 또는 [다중 점(M)]:';
const MEA_R = '호 또는 원 선택 [거리(D)/각도(A)/면적(AR)/종료(X)]:';
const DIST2 = '두 번째 점 지정 또는 <다중 점>:';
const AREA0 = '첫 번째 구석점 지정 또는 [객체(O)/면적 추가(A)/면적 빼기(S)] <객체(O)>:';
const AREA_ADD = '(추가 모드) 첫 번째 구석점 지정 또는 [객체(O)/면적 빼기(S)/종료(X)]:';
const AREA_SUB = '(빼기 모드) 첫 번째 구석점 지정 또는 [객체(O)/면적 추가(A)/종료(X)]:';
const AREA_NEXT = '다음 점 지정 <합계>:';
const MP_FILE = '분석 결과를 파일에 쓰시겠습니까? [예(Y)/아니요(N)] <아니요>:';
const ANG = ['호, 원, 선을 선택하거나 <정점 지정>:', '각도의 첫 번째 끝점 지정:', '각도의 두 번째 끝점 지정:'];
const CAL_P = ['>> 표현식:', '>> 점 지정:'];
const HATCH_MAIN = '내부 점 지정 또는 [특성(P)/객체 선택(S)/그리기 경계(W)/경계 제거(B)/고급(A)/그리기 순서(DR)/원점(O)/주석(AN)/해치 색상(CO)/도면층(LA)/투명도(T)]:';
const HATCH_NEW = '새 경계의 시작점 지정 또는 <해치 적용>:';
const DR = '그리기 순서 옵션 입력 [지정 안 함(N)/맨 뒤로(B)/맨 앞으로(F)/경계 뒤(E)/경계 앞(R)] <경계 뒤>:';
const JOIN_TYPE = '결합 유형 입력 [연장(E)/추가(A)/모두(B)] <연장>:';
const KNOTS = '매듭 매개변수화 입력 [현(C)/제곱근(S)/균일(U)] <현>:';
const PROMPTS = [MEA, MEA2, MEA_R, DIST2, AREA0, AREA_ADD, AREA_SUB, '(추가 모드) 객체 선택:', '(빼기 모드) 객체 선택:', AREA_NEXT, MP_FILE, ...ANG, ...CAL_P, HATCH_MAIN, HATCH_NEW, DR, JOIN_TYPE, KNOTS];

/** CAL·QuickCalc 계산식 오류(edit/util/calc.ts CalcError — 값을 끼운 꼴). 외적(&)은 일본어 근거가 없어 뺀다 */
const CALC_ERRORS = [
  '따옴표가 닫히지 않았습니다.',
  '식이 비어 있습니다.',
  '식이 덜 끝났습니다.',
  '점은 [x,y] 또는 [x,y,z]로 씁니다.',
  '결과가 수가 아닙니다(0으로 나누기 등).',
  '점과 수는 더하거나 뺄 수 없습니다.',
  '0으로 나눌 수 없습니다.',
  '음수의 제곱근은 구할 수 없습니다.',
  'ang 함수에는 점 1개 또는 2개가 필요합니다.',
  'cvunit(값, 단위, 단위) 꼴로 씁니다.',
  'getvar는 계산 환경에서 처리합니다.',
  'getvar(변수 이름) 꼴로 씁니다.',
  '알 수 없는 글자 "$"',
  '"+" 앞에서 식이 끝나야 합니다.',
  '")"이(가) 필요합니다.',
  '알 수 없는 함수 "foo"',
  '","이(가) 올바르지 않은 자리에 있습니다.',
  '알 수 없는 단위 "xx"',
  '"end"은(는) 여기에 쓸 수 없습니다.',
  '정의되지 않은 변수 "a"',
  '점(end)을 고르지 않았습니다.',
  '알 수 없는 연산 "%"',
  '변수 "PDMODE"을(를) 읽을 수 없습니다.',
  'sin 함수에는 인수 1개가 필요합니다.',
  'max 함수에는 인수가 필요합니다.',
  ...['거듭제곱', '나누는 값', '점의 좌표', '단위', 'sin의 인수'].map((w) => `${w}에는 점이 아니라 수가 필요합니다.`),
];
/** 결과·안내 줄(소스 print — 빈칸은 그대로) */
const LINES = [
  ...CALC_ERRORS,
  ...CALC_ERRORS.map((m) => `CAL: ${m}`),
  'CAL: 식을 계산하지 못했습니다(boom).',
  '객체 0개 — 도면이 비어 있습니다.',
  '객체 12개.',
  '변수: 없음',
  '변수: a, b',
  'QuickCalc 변수 a = 3',
  '거리 = 12.0000 mm,  XY 평면에서의 각도 = 45,  XY 평면으로부터의 각도 = 0',
  'X 증분 = 8.4853,  Y 증분 = 8.4853,  Z 증분 = 0.0000',
  '반지름 = 5.0000 mm\n지름 = 10.0000 mm',
  '각도 = 30  (보각 150)',
  '면적 = 100.0000,  둘레 = 40.0000',
  '총 면적 = 100.0000',
  '면적을 잴 수 없는 객체입니다.',
  '점이 3개 이상 필요합니다.',
  '호나 원이 아닙니다.',
  '----------------   영역   ----------------',
  '면적:                    78.5398',
  '관성 곱:             XY: 0.0000',
  '도심 기준 주 모멘트와 X-Y 방향:',
  '                      I: 490.8739 방향 [1.0000 0.0000]',
  '이 도면의 시간:',
  '  작성:                 -',
  '  마지막 업데이트:      -',
  '결합 유형 = 연장',
  '결합할 수 있는 객체가 없습니다.',
  '경계의 폭과 높이가 0보다 커야 합니다.',
  '점이 잘 보이지 않으면 SETVAR로 PDMODE(예: 3)를 바꾸십시오.',
  '구름형 리비전을 완료했습니다.',
  '회전 수 = 3 비틀기=0',
];

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.unstubAllGlobals();
});

describe('조회·측정 명령 묶음의 번역과 298차가 남긴 것(299차)', () => {
  it('명령행 입력 줄(앞 글 「… [」·옵션·뒤 글)이 네 언어 모두 한국어 없이 보이고, 고친 조각 낱말이 보인다', async () => {
    for (const [f, s] of [
      ['app/commands.ts', "const r = await ctx.getPoint('첫 번째 점 지정 또는 [거리(D)/반지름(R)/각도(A)/면적(AR)/종료(X)] <거리>:', { keywords: kws, snapZ: true });"],
      ['app/commands.ts', "const r2 = await ctx.getPoint('두 번째 점 지정 또는 [다중 점(M)]:', { base: base3(app, a), snapZ: true, keywords: [{ key: 'M', label: '다중 점' }] });"],
      ['app/commands.ts', "const r = await ctx.getEntity('호 또는 원 선택 [거리(D)/각도(A)/면적(AR)/종료(X)]:', kws);"],
      ['app/commands.ts', "? `(${mode === 'A' ? '추가' : '빼기'} 모드) 첫 번째 구석점 지정 또는 [${kws.map((k) => `${k.label}(${k.key})`).join('/')}]:`"],
      ['app/commands.ts', ": '첫 번째 구석점 지정 또는 [객체(O)/면적 추가(A)/면적 빼기(S)] <객체(O)>:';"],
      ['app/commands.ts', "const er = await ctx.getEntity(mode ? `(${mode === 'A' ? '추가' : '빼기'} 모드) 객체 선택:` : '객체 선택:');"],
      ['app/commands.ts', "const r2 = await ctx.getPoint(pts.length >= 6 ? '다음 점 지정 <합계>:' : '다음 점 지정:', {"],
      ['app/commands.ts', "const p1 = await needPoint(ctx, '각도의 첫 번째 끝점 지정:', v);"],
      ['app/util2-misc.ts', "const r = await ctx.getPoint(snap ? `>> ${SNAP_NAMES[snap] ?? k} 선택:` : '>> 점 지정:');"],
      ['app/util2-misc.ts', "const text = arg?.trim() || (await askText(ctx, '>> 표현식:')).trim();"],
      ['app/dashcmds-hatch.ts', "{ key: 'W', label: '그리기 경계' },"],
      ['app/dashcmds-hatch.ts', "const first = await ctx.getPoint(loops.length ? '새 경계의 시작점 지정 또는 <해치 적용>:' : '시작점 지정:');"],
      ['app/dashcmds-hatch.ts', '`그리기 순서 옵션 입력 [지정 안 함(N)/맨 뒤로(B)/맨 앞으로(F)/경계 뒤(E)/경계 앞(R)] <${names[order]}>:`,'],
      ['app/modify2-pedit.ts', 'jm.type = (await choose(ctx, `결합 유형 입력 [연장(E)/추가(A)/모두(B)] <${JOIN_TYPE_LABEL[jm.type]}>:`,'],
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
    // AREA 옵션 조각·더하기 모드 앞 글, MEASUREGEOM 다중 점(M), 독일어 면적(AR)은 Fläche(Bereich 범위가 아니다)
    expect(at('en', AREA0)).toContain('[Object (O)/Add area (A)/Subtract area (S)]');
    expect(at('ja', MEA2)).toContain('[複数点(M)]');
    expect(at('zh-CN', AREA_ADD)).toContain('(“加”模式) 指定第一个角点或 [');
    expect(at('zh-CN', AREA_ADD)).toContain('/减少面积(S)/');
    expect(at('de', MEA)).toContain('/Fläche (AR)/Beenden (X)]');
    expect(at('zh-CN', AREA_NEXT)).toBe('指定下一个点 <总计>：');
    // 각도 끝점은 端点(「…を指定します。」 문장이 아니라 프롬프트), CAL 점 지정 点(ドット가 아니다)·표현식 表达式
    expect(at('ja', ANG[1]!)).toBe('角度の最初の端点を指定:');
    expect(at('ja', CAL_P[1]!)).toBe('>> 点の指定:');
    expect(at('zh-CN', CAL_P[0]!)).toBe('>> 表达式：');
    // 독일어 해치 경계는 같은 프롬프트 조각의 Begrenzung(Rand 가장자리·Zeichnungsgrenzen 도면 한계가 아니다)
    expect(at('de', HATCH_MAIN)).toContain('/Begrenzung zeichnen (W)/Begrenzung entfernen (B)/');
    expect(at('de', HATCH_NEW)).toBe('Startpunkt der neuen Begrenzung angeben oder <Schraffur anwenden>:');
    expect(at('de', JOIN_TYPE)).toBe('Verbindungstyp eingeben [Verlängern (E)/Hinzufügen (A)/Beide (B)] <Verlängern>:');
  });

  it('결과·안내 줄(CAL 오류·DBLIST·QuickCalc·측정 결과·MASSPROP·TIME)과 기록 줄이 네 언어 모두 한국어 없이 보인다', () => {
    for (const [f, s] of [
      ['app/util2-misc.ts', "ctx.print(e instanceof CalcError ? `CAL: ${e.message}` : `CAL: 식을 계산하지 못했습니다(${e instanceof Error ? e.message : String(e)}).`, 'err');"],
      ['app/util2-misc.ts', "h('span', { class: 'u2-note' }, `변수: ${Object.keys(qcState().vars ?? {}).join(', ') || '없음'}`)"],
      ['app/editcmds2-query.ts', "ctx.print(`객체 ${total}개${total ? '' : ' — 도면이 비어 있습니다'}.`);"],
      ['edit/util/calc.ts', 'if (isVec(v)) throw new CalcError(`${what}에는 점이 아니라 수가 필요합니다.`);'],
      ['edit/util/calc.ts', "return Math.pow(num(a, '거듭제곱'), num(b, '거듭제곱'));"],
      ['edit/util/calc.ts', "const d = num(b, '나누는 값');"],
      ['edit/util/calc.ts', "const v = n.items.map((x) => num(ev(x), '점의 좌표'));"],
      ['edit/util/calc.ts', "return (num(ev(n.a), '단위') * f) / unitMm;"],
      ['edit/util/calc.ts', 'const N = (i: number) => num(ev(args[i]!), `${name}의 인수`);'],
      ['edit/util/calc.ts', "if (!this.toks.length) throw new CalcError('식이 비어 있습니다.');"],
      ['app/modify2-pedit.ts', 'ctx.print(`결합 유형 = ${JOIN_TYPE_LABEL[jm.type]}`);'],
      ['app/imageclip.ts', "ctx.print('경계의 폭과 높이가 0보다 커야 합니다.', 'err');"],
      ['app/modify2.ts', "ctx.print('점이 잘 보이지 않으면 SETVAR로 PDMODE(예: 3)를 바꾸십시오.');"],
      ['app/propcmds.ts', 'ctx.print(`  작성:                 ${julian(hd.get(\'$TDCREATE\'))}`);'],
    ])
      expect(src(f!), s).toContain(s);
    const tr = (l: string) => (x: string) => guardedTranslate(x, l) ?? translate(x, l);
    const show = (s: string, l: string) => translateTail(s, tr(l)(s), tr(l));
    const RECORDS = [MEA, AREA0, MP_FILE, DR, JOIN_TYPE, KNOTS, '호의 사이각 지정 <90>:'].flatMap((p) => [p, `${p} ${p === MP_FILE ? 'Y' : 'E'}`]);
    const left: string[] = [];
    for (const l of LANGS) {
      for (const s of LINES) if (HANGUL.test(tr(l)(s))) left.push(`${l}: ${tr(l)(s)}`);
      for (const s of RECORDS) if (HANGUL.test(show(s, l))) left.push(`${l}: ${show(s, l)}`);
    }
    expect(left).toEqual([]);
    expect(tr('en')('CAL: 알 수 없는 함수 "foo"')).toBe('CAL: Unknown function "foo"');
    expect(tr('ja')('CAL: 거듭제곱에는 점이 아니라 수가 필요합니다.')).toBe('CAL：累乗には点ではなく数値が必要です。');
    expect(tr('de')('나누는 값에는 점이 아니라 수가 필요합니다.')).toBe('Divisor erfordert eine Zahl, keinen Punkt.');
    expect(tr('zh-CN')('객체 0개 — 도면이 비어 있습니다.')).toBe('0 个对象 — 图形为空。');
    expect(tr('zh-CN')('객체 12개.')).toBe('12 个对象。');
    expect(tr('en')('변수: 없음')).toBe('Variable: None');
    expect(tr('en')('  작성:                 -')).toBe('Created: -');
    expect(tr('ja')('각도 = 30  (보각 150)')).toBe('角度=30(補角150)');
    expect(tr('de')('결합 유형 = 연장')).toBe('Verbindungstyp = Verlängern');
    expect(tr('zh-CN')('회전 수 = 3 비틀기=0')).toBe('旋转次数 = 3 扭转 = 0');
    expect(show(`${JOIN_TYPE} E`, 'de')).toBe('Verbindungstyp eingeben [Verlängern (E)/Hinzufügen (A)/Beide (B)] <Verlängern>: E');
    expect(show(DR, 'de')).toBe('Geben Sie Optionen für die Zeichnungsreihenfolge ein [Nicht angegeben (N)/Hinten (B)/Vorne (F)/Hinter der Begrenzung (E)/Vor der Begrenzung (R)] <Hinter der Begrenzung>:');
    expect(show(MEA, 'en')).toBe('Specify first point or [Distance(D)/Radius(R)/Angle(A)/Area(AR)/Exit(X)] <Distance>:');
    expect(show(KNOTS, 'zh-CN')).toContain('[弦线(C)/平方根(S)/均匀(U)]');
  });

  it('고친 번역은 같은 사전의 낱말이다 — 298차 출발점(독일어 스냅·경계·PEDIT·구름형 리비전·PDMODE, 중국어)과 묶음, 새 열쇠는 조각·틀·오류 글의 번역', () => {
    const [en, de, ja, zh] = [dict.en, dict.de, dict.ja, dict['zh-CN']];
    // 독일어 스냅은 Fang(「스냅 X 간격」 Fang-X-Abstand — Snap이 아니다)
    expect([de['스냅 모드'], de['스냅 유형'], de['스냅 켜기 (F9)'], de['<스냅 {0}>'], de['스냅 해상도는']]).toEqual(['Fangmodus', 'Fangtyp', 'Fang einschalten (F9)', '<Fang {0}>', 'Fangauflösung ist']);
    expect(de['스냅 X 간격']).toMatch(/^Fang-/);
    expect(de['결합할 수 있는 객체가 없습니다.']).toContain('verbunden');
    // 해치 경계: 같은 프롬프트 조각 「경계 뒤(E)」·「경계 앞(R)」·「경계 제거(B)」의 Begrenzung(Rand·Grenze가 아니다)
    expect([de['경계 뒤'], de['경계 앞'], de['경계 제거'], de['그리기 경계(W)']]).toEqual([strip(de['경계 뒤(E)']), strip(de['경계 앞(R)']), strip(de['경계 제거(B)']), `${de['그리기 경계']} (W)`]);
    expect(de['그리기 순서 옵션 입력 [지정 안 함(N)/맨 뒤로(B)/맨 앞으로(F)/경계 뒤(E)/경계 앞(R)] <{0}>:']).toContain(`/${de['경계 뒤(E)']}/${de['경계 앞(R)']}] <{0}>:`);
    expect(de[HATCH_MAIN]).toContain(`/${de['그리기 경계(W)']}/${de['경계 제거(B)']}/`);
    for (const k of ['경계 뒤', '경계 앞', '경계 제거', '그리기 경계', '그리기 경계(W)', HATCH_NEW, '경계의 폭과 높이가 0보다 커야 합니다.', HATCH_MAIN]) expect(de[k], k).not.toMatch(/Rand|Grenze/);
    // PEDIT 결합 유형: 「연장(E)」 Verlängern(298차 — 통째 기록 줄의 Dehnen이 아니다)
    expect(de['결합 유형 = 연장']).toBe(`Verbindungstyp = ${de['연장']}`);
    for (const [w, c] of [['연장', 'E'], ['추가', 'A'], ['모두', 'B']] as const)
      expect(de[`결합 유형 입력 [연장(E)/추가(A)/모두(B)] <${w}>:`], w).toBe(`Verbindungstyp eingeben [${de['연장(E)']}/${de['추가(A)']}/${de['모두(B)']}] <${strip(de[`${w}(${c})`])}>:`);
    // 구름형 리비전 Revisionswolke(「구름형 리비전을 고쳤습니다.」 — Cloud-Revision이 아니다), PDMODE는 SETVAR로 바꾼다(PDMODE를 SETVAR로가 아니다)
    expect([de['구름형 리비전'], de['구름형 리비전을 완료했습니다.']]).toEqual(['Revisionswolke', 'Revisionswolke abgeschlossen.']);
    expect(de['구름형 리비전을 고쳤습니다.']).toContain(de['구름형 리비전']);
    const PD = '점이 잘 보이지 않으면 SETVAR로 PDMODE(예: 3)를 바꾸십시오.';
    expect([de[PD], zh[PD]]).toEqual(['Wenn der Punkt nicht deutlich sichtbar ist, ändern Sie PDMODE mit SETVAR (z. B. auf 3).', `如果${zh['점']}不清晰，请用 SETVAR 更改 PDMODE（例如改为 3）。`]);
    expect([de['첫 번째 구석점 지정'], zh['첫 번째 구석점 지정']]).toEqual([de['첫 번째 구석점 지정:']!.replace(/:$/, ''), zh['첫 번째 구석점 지정:']!.replace(/：$/, '')]);
    // 중국어 출발점: 호의 사이각 夹角(弧角이 아니다), 블록 块(模块이 아니다), 이등분 二分, 비틀기 扭转(횟수가 아니다), 현(C) 弦线(C)
    expect(zh['호의 사이각 지정']).toBe(`指定${zh['호']}${zh['사이각 지정']!.replace('指定', '')}`);
    expect(zh['삽입할 블록의 이름 입력:']).toContain(`${zh['블록']}名称`);
    expect(zh['삽입할 블록의 이름 입력:']).not.toContain('模块');
    expect(zh['이등분']).toBe(strip(zh['이등분(B)']));
    expect(zh['회전 수 = {0} 비틀기={1}']).toContain(`${zh['비틀기']} = {1}`);
    expect(zh['매듭 매개변수화 입력 [현(C)/제곱근(S)/균일(U)] <{0}>:']).toContain(`[${zh['현(C)']}/`);
    // 묶음 — 중국어
    expect(zh['각도 측정']).toBe(zh['반지름 측정']!.replace(zh['반지름']!, zh['각도']!));
    expect([zh['나누는 값'], de['나누는 값'], en['나누는 값']]).toEqual(['除数', 'Divisor', 'Divisor']);
    expect([zh['결과가 수가 아닙니다(0으로 나누기 등).'], de['결과가 수가 아닙니다(0으로 나누기 등).']]).toEqual([expect.stringContaining('除以'), expect.stringContaining('Division')]);
    expect(zh['>> 표현식:']).toBe(`>> ${zh['식이 비어 있습니다.']!.slice(0, 3)}：`);
    expect(zh['면적을 잴 수 없는 객체입니다.']).toContain(zh['면적']);
    expect(zh['다음 점 지정 <합계>:']).toBe(`${zh['다음 점 지정:']!.replace(/[:：]$/, '')} <${zh['합계']}>：`);
    expect(de['다음 점 지정 <합계>:']).toBe(`${de['다음 점 지정 또는 [']!.replace(/ oder \[$/, '')} <Summe>:`);
    expect(zh['수 결과와 영문 변수 이름이 필요합니다.']).not.toMatch(/[A-Za-z]/);
    expect(zh['변수: {0}']).toBe(`${zh['변수 이름']!.slice(0, 2)}：{0}`);
    expect(zh['기록 지우기']).toBe(`清除${zh['기록']}`);
    expect(zh['객체 {0}개{1}.']).toBe('{0} 个对象{1}。');
    // TIME 작성(만든 때 — 지은이·Created by가 아니다): 「만든 날짜: {0}」 Date created·创建日期·Erstellungsdatum
    expect([en['작성: {0}'], zh['작성: {0}'], de['작성: {0}']]).toEqual(['Created: {0}', '创建时间：{0}', 'Erstellt: {0}']);
    expect([en['만든 날짜: {0}'], zh['만든 날짜: {0}'], de['만든 날짜: {0}']]).toEqual([expect.stringContaining('created'), expect.stringContaining('创建'), expect.stringContaining('Erstell')]);
    // MEASUREGEOM 통째: 종료(X)는 「종료(X)」의 낱말(端点·终点 끝점·Ende가 아니다), 영어 앞 글 겹침 없음, 독일어 면적 Fläche
    // (독일어 「호 또는 원 선택 […]」 통째의 Ende (X)는 한도 밖 — 299차에 보고 두 것)
    for (const l of LANGS) {
      const d = dict[l];
      for (const k of l === 'de' ? [MEA] : [MEA, MEA_R]) expect(d[k], `${l}: ${k}`).toContain(strip(d['종료(X)']));
    }
    expect(en[MEA]!.startsWith(en['첫 번째 점 지정 또는 [']!)).toBe(true);
    expect([de['면적(AR)'], de['면적 {0}'], de[MEA]]).toEqual([`${de['면적']} (AR)`, `${de['면적']} {0}`, expect.stringContaining(`/${de['면적']}(AR)/`)]);
    expect([en['광선'], en['삼각 함수는 도 단위, 단위 붙은 수(25mm, 2ft)는 도면 단위로 바뀝니다.'], zh['삼각 함수는 도 단위, 단위 붙은 수(25mm, 2ft)는 도면 단위로 바뀝니다.']]).toEqual([
      'Ray',
      expect.stringContaining('use degrees'),
      expect.stringContaining('以度为单位'),
    ]);
    // 묶음 — 일본어: 0으로 나누기 で割る(分割 쪼개기가 아니다), 점 点(ドット가 아니다), 꼴 形式(フォント 글꼴이 아니다), 거듭제곱 累乗, 보각 補角, 끝점 端点
    expect(ja['0으로 나눌 수 없습니다.']).toContain('で割');
    expect(ja['결과가 수가 아닙니다(0으로 나누기 등).']).toContain('で割');
    expect(ja['>> 점 지정:']).toBe(`>> ${ja['점 지정:']}`);
    expect(ja['{0}에는 점이 필요합니다.']).toBe(ja['{0}에는 점이 아니라 수가 필요합니다.']!.replace('点ではなく数値', '点'));
    expect(ja['원호 캐시 꼴']).toContain('形式');
    for (const k of ['cvunit(값, 단위, 단위) 꼴로 씁니다.', 'getvar(변수 이름) 꼴로 씁니다.']) expect(ja[k], k).toContain('の形式で');
    expect([ja['거듭제곱'], de['거듭제곱']]).toEqual(['累乗', 'Potenz']);
    expect([ja['분모는 2의 거듭제곱(1~256)이어야 합니다.'], de['분모는 2의 거듭제곱(1~256)이어야 합니다.']]).toEqual([expect.stringContaining('累乗'), expect.stringContaining('Potenz')]);
    expect(ja['각도 = {0} (보각 {1})']).toBe(`角度={0}(${ja['보각']}{1})`);
    expect(ja['호의 끝점 지정:']).toContain('端点を指定:');
    expect([ja['각도의 첫 번째 끝점 지정:'], ja['각도의 두 번째 끝점 지정:']]).toEqual(['角度の最初の端点を指定:', '角度の2番目の端点を指定:']);
    // 새 열쇠: 옵션 조각 = 이름 + 고를 글자, 앞 글 = 통째의 「[」까지, 빈 도면·변수 없음 = 틀 + 조각, CAL 줄 = 「CAL: 」 + 오류 글, 이름 낀 오류 = 틀 + 이름
    for (const l of LANGS) {
      const d = dict[l];
      const sp = l === 'en' || l === 'de' ? ' ' : '';
      for (const [k, c] of [['다중 점', 'M'], ['면적 추가', 'A'], ['면적 빼기', 'S']] as const) expect(d[`${k}(${c})`], `${l}: ${k}`).toBe(`${d[k]}${sp}(${c})`);
      for (const p of [AREA_ADD, AREA_SUB]) expect(d[p.slice(0, p.indexOf('[') + 1)], `${l}: ${p}`).toBe(d[p]!.slice(0, d[p]!.indexOf('[') + 1));
      expect(d['객체 0개 — 도면이 비어 있습니다.'], l).toBe(d['객체 {0}개{1}.']!.replace('{0}', '0').replace('{1}', ` ${d['— 도면이 비어 있습니다']}`));
      expect(d['변수: 없음'], l).toBe(d['변수: {0}']!.replace('{0}', d['없음']!));
      const pre = d['CAL: 식을 계산하지 못했습니다({0}).']!.match(/^CAL[:：] ?/)![0];
      const calKeys = [
        ...CALC_ERRORS.slice(0, 12),
        '알 수 없는 글자 "{0}"',
        '"{0}" 앞에서 식이 끝나야 합니다.',
        '"{0}"이(가) 필요합니다.',
        '알 수 없는 함수 "{0}"',
        '"{0}"이(가) 올바르지 않은 자리에 있습니다.',
        '알 수 없는 단위 "{0}"',
        '"{0}"은(는) 여기에 쓸 수 없습니다.',
        '정의되지 않은 변수 "{0}"',
        '점({0})을 고르지 않았습니다.',
        '알 수 없는 연산 "{0}"',
        '변수 "{0}"을(를) 읽을 수 없습니다.',
        '{0} 함수에는 인수 {1}개가 필요합니다.',
        '{0} 함수에는 인수가 필요합니다.',
      ];
      for (const m of calKeys) expect(d[`CAL: ${m}`], `${l}: ${m}`).toBe(pre + d[m]);
      for (const w of ['거듭제곱', '나누는 값', '점의 좌표', '단위', '{0}의 인수']) {
        const v = d['{0}에는 점이 아니라 수가 필요합니다.']!.replace('{0}', d[w]!);
        expect([d[`${w}에는 점이 아니라 수가 필요합니다.`], d[`CAL: ${w}에는 점이 아니라 수가 필요합니다.`]], `${l}: ${w}`).toEqual([v, pre + v]);
      }
    }
  });
});
