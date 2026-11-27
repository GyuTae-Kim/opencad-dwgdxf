/**
 * 307차: 파라메트릭 구속 묶음(GEOMCONSTRAINT·AUTOCONSTRAIN 설정·DIMCONSTRAINT·PARAMETERS 매개변수 관리자·AutoCAD 구속 안내)의 번역과 306차가 남긴 것.
 * - 빠진 번역: GEOMCONSTRAINT 프롬프트는 `${label}(${key})`로 만들어 옵션 여덟(직교(P)·평행(PA)·부드럽게(SM)·일치(C)·동심(CON)·동일선상(COL)·대칭(S)·고정(F))과 통째가 한국어로 남았다.
 *   대화 상자 글은 ui-copy 밖이라 틀이 잡은 값을 옮기지 않는다 — 자동 구속 설정 칸 「{0} 적용」, 매개변수 관리자 유형 칸 「{0}(참조)」·오류 줄 「이름: 오류」, AutoCAD 구속 안내 「참고: {0}」.
 *   명령 제목 「{0} 구속조건」(명령 제안 ui-copy)은 공유 낱말(대칭 Mirror·동일 Same·일치 匹配·직교 Ortho)을 끼워 같은 명령의 리본 풍선 「X 구속」과 다른 이름이 됐다.
 * - 오역: 구속 Restraint·Zurückhaltung·Randbedingungen·Fixierungspunkt·Übereinstimmung·匹配, 첫 번째(객체) 箭头·Knoten, 식(expression) Formel·Gleichungen·除号 (^), 대칭 선 鏡像線,
 *   306차가 남긴 중국어(外部参照 비교 진행 꼴·부착 图纸附件·附上·구름형 리비전 云端·참조 参考文献·분해 拆卸·도넛 甜甜圈·호 拱形·「{0} 닫기」 어순 등)·독일어(「{0} 닫기」·DDA·XB·DAL·QPMODE nennen·
 *   선택 미리보기·뷰포트·연결선·새로 그리기 = 다시 그리기 등)를 같은 사전 안의 맞는 번역으로. 글 꼴은 소스에서 확인한다.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultWord, guardedTranslate } from '../src/app/fileguard';
import { ft } from '../src/app/filetext';
import { translate } from '../site/i18n.mjs';

const LANGS = ['en', 'de', 'ja', 'zh-CN'] as const;
type Lang = (typeof LANGS)[number];
const HANGUL = /[가-힣]/;
const load = (lang: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../site/locales/${lang}.json`, import.meta.url), 'utf8'));
const dict = Object.fromEntries(LANGS.map((l) => [l, load(l)])) as Record<Lang, Record<string, string>>;
const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const strip = (s: string | undefined) => (s ?? '').replace(/\s*[(（][A-Z]+[)）]$/, '');
const tr = (l: string) => (x: string) => guardedTranslate(x, l) ?? translate(x, l);

/** GEOMCONSTRAINT 옵션(constraints.ts GC_KEYS — 이름·고를 글자, 프롬프트 차례) */
const GC: [string, string][] = [
  ['수평', 'H'],
  ['수직', 'V'],
  ['직교', 'P'],
  ['평행', 'PA'],
  ['접선', 'T'],
  ['부드럽게', 'SM'],
  ['일치', 'C'],
  ['동심', 'CON'],
  ['동일선상', 'COL'],
  ['대칭', 'S'],
  ['동일', 'E'],
  ['고정', 'F'],
];
const KEY = Object.fromEntries(GC) as Record<string, string>;
const GC_PROMPT = `구속조건 유형 입력 [${GC.map(([n, k]) => `${n}(${k})`).join('/')}] <일치>:`;
/** 이번에 더한 옵션 여덟(수평·수직·접선·동일은 이미 옮겨졌다) */
const OPT_NEW = GC.filter(([n]) => !['수평', '수직', '접선', '동일'].includes(n));
/** 자동 구속 설정 칸(auto.ts AUTO_DEFAULTS.types 차례 → types.ts GEO_LABEL) */
const AUTO_TYPES: [string, string][] = [
  ['COINCIDENT', '일치'],
  ['COLLINEAR', '동일선상'],
  ['PARALLEL', '평행'],
  ['PERPENDICULAR', '직교'],
  ['TANGENT', '접선'],
  ['CONCENTRIC', '동심'],
  ['HORIZONTAL', '수평'],
  ['VERTICAL', '수직'],
  ['EQUAL', '동일'],
];
const AUTO = AUTO_TYPES.map(([, n]) => n);
/** 매개변수 관리자 유형 칸(constraints.ts rowsOf — 참조 치수 구속은 「(참조)」를 붙인다) */
const ROW_TYPES = ['각도', '반지름', '지름', '수평', '수직', '정렬'];
/** 매개변수 관리자 오류 줄에 오는 오류(params.ts paramNameProblem·parseParamExpr·evaluateParams) */
const ERRS = [
  '이름이 너무 깁니다.',
  '이름은 글자나 _로 시작하고 글자·숫자·_만 쓸 수 있습니다.',
  '"{0}"은(는) 함수·상수·단위 이름이라 쓸 수 없습니다.',
  '순환 참조입니다: {0}',
  '정의되지 않은 매개변수 "{0}"',
  '"{0}"의 값을 구할 수 없습니다.',
  '식의 결과가 수가 아닙니다.',
  '측정할 수 없습니다.',
  '식에는 getvar를 쓸 수 없습니다.',
  '식에는 점 고르기 함수를 쓸 수 없습니다.',
];
const shift = (s: string) => s.replace('{0}', '{1}');
/** AutoCAD 구속 안내(store.ts foreignConstraintNotice — 한 문장짜리 줄) */
const READ = 'AutoCAD 구속 그룹의 {0}를 읽었습니다. 구속 막대·PARAMETERS에서 고칠 수 있고, 저장하면 AutoCAD 형식 그대로 갱신됩니다.';
const NONE = '이 도면에는 AutoCAD가 만든 구속 정보(구속 그룹 {0}개)가 있지만 읽을 구속이 없습니다. 원본 그대로 저장됩니다.';
const notice = (s: string, ...v: number[]) => `참고: ${v.reduce((t, x, i) => t.replace(`{${i}}`, String(x)), s)}`;
const NOTICES = [
  notice(READ.replace('{0}', '구속 {0}개'), 3),
  notice(READ.replace('{0}', '사용자 매개변수 {0}개'), 2),
  notice(READ.replace('{0}', '구속 {0}개와 사용자 매개변수 {1}개'), 3, 2),
  notice(NONE, 2),
];

describe('파라메트릭 구속 묶음의 번역과 306차가 남긴 것(307차)', () => {
  it('GEOMCONSTRAINT 프롬프트·자동 구속 설정 칸·명령 제목·매개변수 관리자 줄·AutoCAD 구속 안내가 네 언어 모두 한국어 없이 보인다', () => {
    const c = src('app/constraints.ts');
    for (const s of [
      "구속조건 유형 입력 [${GC_KEYS.map((k) => `${k.label}(${k.key})`).join('/')}] <일치>:",
      'label: `${GEO_LABEL[t]} 적용`',
      'title: `${k.label} 구속조건`',
      'r.reference ? `${r.type}(참조)` : r.type',
      "c.type === 'ANGLE' ? '각도' : c.type === 'RADIUS' ? '반지름' : c.type === 'DIAMETER' ? '지름' : c.type === 'HDIST' ? '수평' : c.type === 'VDIST' ? '수직' : '정렬'",
      "return `${r.name || '(빈 이름)'}: ${why}`;",
      'return `${r.name}: ${e instanceof Error ? e.message : String(e)}`;',
      'err.textContent = `${ft(r.name)}: ${e}`;',
      'app.cmd.print(`참고: ${msg}`)',
      ...GC.map(([n, k]) => `{ key: '${k}', label: '${n}',`),
    ])
      expect(c, s).toContain(s);
    expect(src('edit/constraint/auto.ts')).toContain(`types: [${AUTO_TYPES.map(([t]) => `'${t}'`).join(', ')}]`);
    for (const [t, n] of AUTO_TYPES) expect(src('edit/constraint/types.ts'), t).toContain(`${t}: '${n}',`);
    const store = src('edit/constraint/store.ts');
    for (const s of ['parts.push(`구속 ${i.imported}개`)', 'parts.push(`사용자 매개변수 ${i.importedParams}개`)', "parts.join('와 ')", READ.replace('{0}', "${parts.join('와 ')}"), NONE.replace('{0}', '${i.groups}')])
      expect(store, s).toContain(s);
    const LINES = [
      GC_PROMPT,
      ...AUTO.map((n) => `${n} 적용`),
      ...GC.map(([n]) => `${n} 구속조건`),
      ...ROW_TYPES.map((t) => `${t}(참조)`),
      'abc: 이름이 너무 깁니다.',
      '1a: 이름은 글자나 _로 시작하고 글자·숫자·_만 쓸 수 있습니다.',
      'pi: "pi"은(는) 함수·상수·단위 이름이라 쓸 수 없습니다.',
      'd2: 식에는 getvar를 쓸 수 없습니다.',
      'd2: 식에는 점 고르기 함수를 쓸 수 없습니다.',
      '(빈 이름): 이름을 입력하십시오.',
      `${ft('d2')}: 순환 참조입니다: d1 → d2 → d1`,
      `${ft('d2')}: 정의되지 않은 매개변수 "x"`,
      `${ft('d3')}: "d2"의 값을 구할 수 없습니다.`,
      `${ft('d2')}: 식의 결과가 수가 아닙니다.`,
      `${ft('d1')}: 측정할 수 없습니다.`,
      ...NOTICES,
    ];
    const opts = GC.map(([n, k]) => `${n}(${k})`);
    const left: string[] = [];
    for (const l of LANGS) {
      for (const s of LINES) if (HANGUL.test(tr(l)(s))) left.push(`${l}: ${tr(l)(s)}`);
      // 명령행 조각: 「앞 글 [」·옵션마다·「] <일치>:」(기본값은 옵션 번역 — fileguard defaultWord)
      for (const s of ['구속조건 유형 입력 [', ...opts]) if (HANGUL.test(translate(s, l))) left.push(`${l}: ${translate(s, l)}`);
      const dw = defaultWord('] <일치>:', opts, (s) => translate(s, l));
      if (!dw || HANGUL.test(dw.to)) left.push(`${l}: ] <일치>: → ${dw?.to}`);
    }
    expect(left).toEqual([]);
    expect(tr('en')(GC_PROMPT)).toBe(
      'Enter constraint type [Horizontal (H)/Vertical (V)/Perpendicular (P)/Parallel (PA)/Tangent (T)/Smooth (SM)/Coincident (C)/Concentric (CON)/Collinear (COL)/Symmetric (S)/Equal (E)/Fixed (F)] <Coincident>:',
    );
    expect(defaultWord('] <일치>:', opts, (s) => translate(s, 'de'))).toEqual({ from: '일치', to: 'Koinzident' });
    expect(tr('zh-CN')('일치 적용')).toBe('应用重合');
    expect(tr('ja')('수직(참조)')).toBe('垂直（参照）');
    expect(tr('en')('대칭 구속조건')).toBe('Symmetric constraint');
    expect(tr('de')(`${ft('d2')}: 순환 참조입니다: d1 → d2 → d1`)).toBe('d2: Zirkelverweis: d1 → d2 → d1');
    expect(tr('zh-CN')('(빈 이름): 이름을 입력하십시오.')).toBe('（空名）：请输入名称。');
    expect(tr('en')(NOTICES[2]!)).toBe(
      'Note: Read 3 constraints and 2 user parameters from the AutoCAD constraint group. You can edit them with the constraint bar or PARAMETERS; saving updates them in AutoCAD format.',
    );
    expect(tr('ja')(NOTICES[0]!)).toBe('注: AutoCAD拘束グループの拘束3個を読みました。拘束バー・PARAMETERSで修正でき、保存するとAutoCAD形式のまま更新されます。');
  });

  it('고친 번역은 같은 사전의 낱말이다(구속 묶음과 306차가 남긴 것)', () => {
    const [en, de, ja, zh] = [dict.en, dict.de, dict.ja, dict['zh-CN']];
    // 영어: 구속 constraint(「구속 막대」 — Restraint가 아니다), 순환 참조 circular reference, 직교 = 「직교 구속」 Perpendicular(자동 구속 설정 — Orthogonal은 ORTHO), 기본값 <일치> = 옵션 「일치(C)」
    expect(en['구속 {0}개']).toBe(`{0} ${en['구속 막대']!.split(' ')[0]!.toLowerCase()}s`);
    expect(en['순환 참조입니다: {0}']).toBe('Circular reference: {0}');
    expect(en['{0}은(는) 지금 도면이라 자신에게 부착할 수 없습니다(순환 참조).']).toContain('circular reference');
    expect(en['직교 객체는 공유 교차점이 있어야 함']).toBe(en['접선 객체는 공유 교차점이 있어야 함']!.replace('Tangent', en['직교 구속']!.split(' ')[0]!).replace(/\.$/, ''));
    expect(en['같은 종류의 객체(선과 선, 호·원과 호·원)를 선택해야 합니다.']).toContain('(a line and a line, or an arc/circle and an arc/circle)');
    expect(en['구속조건 유형 입력 [{0}] <일치>:']).toBe(`Enter constraint type [{0}] <${strip(en['일치(C)'])}>:`);
    // 일본어: 구속 拘束(制約가 아니다), 대칭 선 = 「대칭 구속」 対称(鏡像 = MIRROR가 아니다), 목록 깨짐, 적용함 = 「매개변수를 적용했습니다」의 適用しました, すべての
    const jaC = ja['구속 막대']!.replace('バー', '');
    const jaS = ja['대칭 구속']!.replace(jaC, '');
    expect(ja['현재 설정: 구속조건 폼 = 동적']).toBe(`現在の設定: ${jaC}フォーム = 動的`);
    expect(ja['대칭 선 선택:']).toBe(`${jaS}線を選択:`);
    expect(ja['대칭 선은 대칭으로 만들 객체와 달라야 합니다.']).toBe(`${jaS}線は、${jaS}にするオブジェクトとは異なるものである必要があります。`);
    expect(ja['같은 종류의 객체(선과 선, 호·원과 호·원)를 선택해야 합니다.']).toContain('（線と線、円弧・円と円弧・円）');
    expect(ja['{0}개의 구속조건을 {1}개의 객체에 적용함']!.endsWith(ja['매개변수를 적용했습니다(바뀐 객체 {0}개).']!.split('を')[1]!.split('（')[0]!)).toBe(true);
    expect(ja['선택한 객체에서 모든 구속조건을 제거합니다…']).toContain(`すべての${jaC}`);
    // 중국어 306차 남은 것: 외부 참조 비교(진행 꼴은 「… 중…」 열쇠만), 부착 附加(「이미지 부착」), 구름형 리비전 云状修订(云端·云类型·云版本이 아니다), 블록 참조 块参照, 「X 닫기」 어순,
    // 이름 없는 그룹 개수 꼴, 참조 参照(参考文献 참고 문헌이 아니다), 분해 分解(拆卸가 아니다), 도넛 圆环, 호 圆弧(拱形이 아니다)
    expect(zh['외부 참조 비교']).toBe(zh['외부 참조 비교 중…']!.replace('正在', '').replace('…', ''));
    expect([zh['DWG 부착'], zh['PDF 부착']]).toEqual(['DWG', 'PDF'].map((x) => zh['이미지 부착']!.replace('图像', ` ${x}`)));
    for (const k of ['구름형 리비전 켜기', '구름형 리비전 표시', '구름형 리비전(R)', '비교-구름형 리비전']) {
      expect(zh[k], k).toContain(zh['구름형 리비전']!);
      expect(zh[k], k).not.toMatch(/云端|云类型|云版本/);
    }
    expect(zh['행·열로 배열한 블록 참조']!.endsWith(zh['블록 참조']!)).toBe(true);
    expect(zh['{0} 닫기']).toBe(zh['블록 팔레트 닫기']!.replace(zh['블록 팔레트']!, '{0}'));
    expect(zh['{0} 패널 펼치기']).toBe('展开{0}面板');
    expect(zh['이름 없는 그룹이 작성되었습니다(객체 {0}개).']).toContain('（{0} 个对象）');
    expect([zh['참조 수 {0}'], zh['참조 이름 경로']]).toEqual([`${zh['참조 이름']!.replace('名称', '数量')} {0}`, `${zh['참조 이름']}路径`]);
    expect(zh['분해할 문자(문자·여러 줄 문자·속성 정의·원호 정렬 문자)를 고르지 않았습니다.']).toContain(`要${zh['분해']}的`);
    expect(zh['도넛 (DO)']).toBe(`${zh['도넛']} (DO)`);
    expect(zh['그리기 경계의 호는 이 웹 버전에서 쓸 수 없습니다. 직선 점을 지정하십시오.']).toContain(`使用${zh['호']}作为`);
    // 중국어 묶음: 첫 번째(객체) 第一个对象(箭头 화살촉이 아니다), 식 기호 그대로(除号 (^)·π가 아니다), 같게 = 「동일 구속」 相等, 대칭 대상 对象, 일치 구속 重合约束(匹配가 아니다),
    // 필요합니다 = 「원이나 호가 필요합니다」 꼴(绘制·添加를 더하지 않는다), 「{0}개」 个 꼴, 각도 구속점 = 「두 번째 각도 구속점」 꼴, 기본값 <일치> = 「일치(C)」
    expect(zh['첫 번째는 스플라인이어야 합니다.']!.startsWith(zh['첫 번째 객체 선택:']!.replace('选择', '').replace('：', ''))).toBe(true);
    const EXPR = '식에는 수, + − * / ^, 괄호, 함수(sin·cos·sqrt …, 각도는 도), pi와 다른 매개변수 이름을 쓸 수 있습니다.';
    for (const s of ['+ − * / ^', 'sqrt', 'pi']) expect(zh[EXPR], s).toContain(s);
    expect(zh[EXPR]).not.toMatch(/除号|π/);
    expect(zh['선은 선과, 호·원은 호·원과 같게 만들 수 있습니다.']).toContain(zh['동일 구속']!.replace('约束', ''));
    expect(zh['대칭 선은 대칭으로 만들 객체와 달라야 합니다.']).toBe(`对称轴必须与要对称的${zh['객체']}不同。`);
    for (const k of ['일치 구속조건 {0}개 적용됨', '일치 구속조건에는 두 참조가 필요합니다.']) {
      expect(zh[k], k).toContain(zh['일치 구속']!);
      expect(zh[k], k).not.toContain('匹配');
    }
    expect(zh['원·호·타원이 필요합니다.']).toBe(zh['원이나 호가 필요합니다.']!.replace('圆或圆弧', '圆、圆弧或椭圆'));
    expect(zh['호가 필요합니다.']).toBe(zh['원이나 호가 필요합니다.']!.replace('圆或', ''));
    expect(zh['선이 필요합니다.']).toBe(`需要${zh['선 선택:']!.replace('选择', '').replace('：', '')}。`);
    expect(zh['곡선이 필요합니다.']).toBe(`需要${zh['두 번째 곡선 선택:']!.replace('选择第二条', '').replace('：', '')}。`);
    expect(zh['매개변수를 적용했습니다(바뀐 객체 {0}개).']).toContain('{0}个对象');
    expect(zh['{0}개의 구속조건을 {1}개의 객체에 적용함']).toBe('已对 {1} 个对象应用 {0} 个约束');
    expect(zh['{0}개의 구속조건을 제거했습니다.']).toBe('已移除 {0} 个约束。');
    expect(zh['일치 구속조건 {0}개 적용됨']).toBe(`已应用 {0} 个${zh['일치 구속']}`);
    expect(zh['첫 번째 각도 구속점 지정:']).toBe(zh['두 번째 각도 구속점 지정:']!.replace('第二', '第一'));
    expect(zh['구속조건 유형 입력 [{0}] <일치>:']).toBe(`输入约束类型 [{0}] <${strip(zh['일치(C)'])}>:`);
    // 독일어 306차 남은 것: 「X 닫기」 = 「블록 팔레트 닫기」 꼴, 패널 어순, 연관 해제 Zuordnung aufheben(Trennbemaßungen이 아니다), 결합 binden(integrieren이 아니다), 새 도면으로(vergleichen이 아니다),
    // 정렬 치수 Ausgerichtete Bemaßung(명령꼴 ausrichten이 아니다), 「Namen.」 꼬리, 부를 = aufrufen(nennen 이름 짓기가 아니다), 선택 미리보기 Auswahlvorschau, 뷰포트 Ansichtsfenster,
    // 연결선 거리 Anbindungsdistanz, 새로 그리기 = 「새 도면」(다시 그리기 Neu zeichnen과 다른 이름)
    expect(de['{0} 닫기']).toBe(de['블록 팔레트 닫기']!.replace(de['블록 팔레트']!, '{0}'));
    expect(de['{0} 패널 펼치기']).toBe('Bedienfeld {0} erweitern');
    expect(de['치수의 연관 끊기 (DDA)']).toBe(`Bemaßungs${de['연관 해제']!.toLowerCase()} (DDA)`);
    expect(de['외부 참조의 도면층·블록·스타일을 이 도면에 결합 (XB)']).toMatch(new RegExp(`${strip(de['결합(B)']).toLowerCase()} \\(XB\\)$`));
    expect(de['비교 결과를 새 도면으로']).toBe(`Vergleichsergebnisse in ${de['새 도면']!.replace('Neue', 'neue')}`);
    expect(de['정렬 치수 (DAL)']).toBe(`${de['정렬 치수']} (DAL)`);
    expect(de['정렬 치수 구속조건']).toBe(`${de['정렬 치수']!.split(' ')[0]} ${de['수평 치수 구속조건']!.split(' ')[1]}`);
    expect(de['이름에 = 를 쓸 수 없습니다.']).toBe('= ist in Namen nicht zulässig.');
    expect(de['AutoLISP 명령 {0}은(는) AutoLISP 식이 실행 중일 때 명령으로 부를 수 없습니다. (c:{1})처럼 함수로 부르십시오.']).toContain('aufgerufen');
    expect(de['빠른 특성 창을 저절로 띄우지 않습니다(QUICKPROPERTIES로 부를 수 있습니다).']).toContain('mit QUICKPROPERTIES aufrufen');
    expect(de['선택 미리보기']).toBe(`${de['선택']}${de['미리보기']!.toLowerCase()}`);
    expect(de['뷰포트 동기화']).toBe(`${de['뷰포트']}-Synchronisierung`);
    expect(de['고정 연결선 거리 지정 <{0}>:']).toContain(de['연결선 거리']!);
    expect(de['새로 그리기']).toBe(de['새 도면']);
    expect(de['새로 그리기']).not.toBe(de['다시 그리기']);
    // 독일어 묶음: 구속점 = 「구속점 선택」 Abhängigkeitspunkt(Fixierungspunkt 고정점이 아니다), 각도 구속점, 구속 Abhängigkeit(Randbedingungen·Zurückhaltung이 아니다 — 308차 리드 결정으로 Einschränkung도 Abhängigkeit로 통일), 일치 구속 koinzidente,
    // 첫 번째(객체) Objekt(Knoten이 아니다), 원·호·타원 가운데 하나(oder), 겹침 = 「중복」 Doppelte(überlappen이 아니다), 식 Ausdruck(Formel·Gleichung이 아니다), 직교 = 「직교 구속」 Senkrechte(Ortho가 아니다)
    const pt = de['구속점 선택:']!.split(' ')[0]!;
    for (const k of ['첫 번째 구속점 지정 또는 [', '첫 번째 구속점 지정 또는 [객체(O)] <객체>:', '첫 번째 구속점 지정 또는 [객체(O)/점과 선(P)/2선(2L)] <객체>:']) {
      expect(de[k], k).toContain(pt);
      expect(de[k], k).not.toContain('Fixierung');
    }
    expect(de['첫 번째 각도 구속점 지정:']).toBe(de['두 번째 각도 구속점 지정:']!.replace('zweiten', 'ersten'));
    expect(de['이 객체에는 구속조건을 적용할 수 없습니다.']).toContain(de['구속조건을 적용할 수 없습니다.']!.split(' ')[0]!);
    const koin = de['일치 구속']!.split(' ')[0]!.toLowerCase();
    for (const k of ['일치 구속조건 {0}개 적용됨', '일치 구속조건에는 두 참조가 필요합니다.']) {
      expect(de[k], k).toContain(koin);
      expect(de[k], k).not.toContain('Übereinstimmung');
    }
    expect(de['구속 {0}개']).toBe(de['{0}개의 구속조건을 제거했습니다.']!.replace(' entfernt.', ''));
    expect(de['첫 번째는 스플라인이어야 합니다.']).toBe(`Das erste ${de['객체']} muss ein Spline sein.`);
    expect(de['원·호·타원이 필요합니다.']).toBe(de['원이나 호가 필요합니다.']!.replace('Kreis oder Bogen', 'Kreis, Bogen oder Ellipse'));
    expect(de['이름 "{0}"이(가) 겹칩니다.']).toBe(`${de['중복 객체 삭제']!.split(' ')[0]}r Name „{0}“.`);
    expect(de['값이 올바르지 않습니다.']).toContain('falsch');
    expect(de['식이 올바르지 않습니다: {0}']).toBe(`Falscher ${de['식']}: {0}`);
    for (const k of [EXPR, '식에는 점 고르기 함수를 쓸 수 없습니다.']) {
      expect(de[k], k).toMatch(/^Ausdrücke dürfen /);
      expect(de[k], k).not.toMatch(/Gleichung|Formel/);
    }
    expect(de[EXPR]).toContain('sqrt');
    expect(de['구속조건 유형 입력 [{0}] <일치>:']).toBe(`${de['구속조건 유형 입력 [']}{0}] <${strip(de['일치(C)'])}>:`);
    expect(de['직교 객체는 공유 교차점이 있어야 함']!.startsWith(`${de['직교 구속']!.split(' ')[0]} Objekte`)).toBe(true);
    expect(de['순환 참조입니다: {0}']).toBe('Zirkelverweis: {0}');
  });

  it('새 열쇠는 조각·틀 번역에서 만든 꼴이다(구속 옵션·통째 프롬프트·설정 칸·명령 제목·유형 칸·오류 줄·안내)', () => {
    for (const l of LANGS) {
      const d = dict[l];
      // 옵션 = 같은 명령의 리본 풍선 「X 구속」 낱말 + 고를 글자. 일본어·중국어 직교는 「직교」(같은 프롬프트의 「수직(V)」 垂直과 겹치지 않게), 독일어 부드럽게는 「부드럽게(S)」
      const word = (n: string): string => {
        if ((l === 'ja' || l === 'zh-CN') && n === '직교') return d['직교']!;
        if (l === 'de' && n === '부드럽게') return strip(d['부드럽게(S)']);
        const t = d[`${n} 구속`]!;
        return l === 'en' ? t.replace(' constraint', '') : l === 'ja' ? t.replace('拘束', '') : l === 'zh-CN' ? t.replace('约束', '') : t.split(' ')[0]!.replace(/e$/, '');
      };
      for (const [n, k] of OPT_NEW) expect(d[`${n}(${k})`], `${l}: ${n}`).toBe(l === 'en' || l === 'de' ? `${word(n)} (${k})` : `${word(n)}(${k})`);
      expect(strip(d['직교(P)']), l).not.toBe(strip(d['수직(V)']));
      expect(d[GC_PROMPT], l).toBe(d['구속조건 유형 입력 [{0}] <일치>:']!.replace('{0}', GC.map(([n, k]) => d[`${n}(${k})`]).join('/')));
      for (const n of AUTO) expect(d[`${n} 적용`], `${l}: ${n}`).toBe(d['{0} 적용']!.replace('{0}', strip(d[`${n}(${KEY[n]})`])));
      for (const [n] of GC) expect(d[`${n} 구속조건`], `${l}: ${n}`).toBe(d[`${n} 구속`]);
      for (const t of ROW_TYPES) expect(d[`${t}(참조)`], `${l}: ${t}`).toBe(d['{0}(참조)']!.replace('{0}', d[t]!));
      // 오류 줄 = 「{0}: 식을 입력하십시오.」의 앞머리 + 그 오류의 번역(오류 안의 {0}은 {1}로)
      const sep = l === 'zh-CN' ? '：' : ': ';
      expect(d['{0}: 식을 입력하십시오.']!.startsWith(`{0}${sep}`), l).toBe(true);
      for (const m of ERRS) expect(d[`{0}: ${shift(m)}`], `${l}: ${m}`).toBe(`{0}${sep}${shift(d[m]!)}`);
      expect(d['(빈 이름): 이름을 입력하십시오.'], l).toBe(`${d['(빈 이름)']}${sep}${d['이름을 입력하십시오.']}`);
      // 안내 = 「참고: {0}」 + 「AutoCAD 구속 그룹의 {0}를 …」 + 「구속 {0}개」·「사용자 매개변수 {0}개」(와 = 「점과 선」의 and·と·和·und)
      const and = { en: ' and ', ja: 'と', 'zh-CN': '和', de: ' und ' }[l];
      expect(d['점과 선'], l).toContain(and.trim());
      const note = (x: string) => d['참고: {0}']!.replace('{0}', x);
      const read = (x: string) => note(d[READ]!.replace('{0}', x));
      expect(d[`참고: ${READ.replace('{0}', '구속 {0}개')}`], l).toBe(read(d['구속 {0}개']!));
      expect(d[`참고: ${READ.replace('{0}', '사용자 매개변수 {0}개')}`], l).toBe(read(d['사용자 매개변수 {0}개']!));
      expect(d[`참고: ${READ.replace('{0}', '구속 {0}개와 사용자 매개변수 {1}개')}`], l).toBe(read(`${d['구속 {0}개']}${and}${shift(d['사용자 매개변수 {0}개']!)}`));
      expect(d[`참고: ${NONE}`], l).toBe(note(d[NONE]!));
    }
  });
});
