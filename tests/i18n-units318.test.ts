/**
 * 318차: 317차가 남긴 것(핸들 낱말·쓰기 경고 「도형」·감사 대상 영어 소문자)과 단위·좌표 표시·각도 형식 묶음의 번역 대조.
 * - 핸들: 객체 핸들(handle) 뜻 열쇠는 같은 사전 「핸들」의 낱말(zh 句柄·de Handle — 手柄·Griff는 그립 뜻)로. 쓰는 곳은 AUDIT(edit/util/audit.ts)·
 *   DXF 쓰기 경고(io/dxf/wcontext.ts)·HANDSEED 설명(sysvars.ts)·블록 참조 찾기(blkcmds-att.ts) — 모두 객체 핸들이다.
 * - 쓰기 경고의 도형(엔티티)은 shape·形状·Form이 아니다(316차 읽기 경고와 같은 근거 — 「도형을 쓰지 못해 뺐습니다.」 entity·图形·grafisches Objekt).
 * - 감사 대상 「도면층 {0}」·「블록 {0}」은 audit.ts 대상 자리에만 쓰인다 — 줄 머리 이름표라 영어도 첫 글자 대문자(de Layer {0}·Block {0} 꼴).
 * - MVSETUP 단위 유형(filecmds-layout.ts): 키워드 조각은 같은 사전 낱말 열쇠(「과학」·「십진」·「공학」·「건축」·「미터법」) 꼴, 통째는 앞 조각으로 시작하고
 *   조각을 그대로 품는다(285차 규칙) — 일본어 構築·중국어 建筑物·小数点·工程计数法(공학 표기법)·독일어 Gebäude·영어 그대로 Science·Engineering이 아니다.
 * - -UNITS 목록 보기: 숫자 꼴은 옮기지 않는다(앱 출력은 core/units.ts toFixed — 소수점 「.」, 같은 목록 1번 독일어도 1.55E+01), 일본어 5번 測定(측정) → 測量,
 *   중국어 1번 십진 도수(도수 빠짐). UNITS 대화 상자 중국어 측량 단위 单元 → 单位(-UNITS 목록 꼴), 독일어 「삽입 축척 단위」 명령꼴,
 *   중국어 「각도 또는 점이 필요합니다.」 多个点(여러 점) — 같은 사전 「0이 아닌 거리 또는 점이 필요합니다.」 꼴.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sourceMessage } from '../site/i18n.mjs';

const LANGS = ['en', 'de', 'ja', 'zh-CN'] as const;
type Lang = (typeof LANGS)[number];
const load = (lang: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../site/locales/${lang}.json`, import.meta.url), 'utf8'));
const dict = Object.fromEntries(LANGS.map((l) => [l, load(l)])) as Record<Lang, Record<string, string>>;
const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
/** 빈칸을 보지 않고 견준다(285·316차 시험과 같음 — 소스 목록 줄은 빈칸으로 칸을 맞춘다) */
const squash = (s: string | undefined) => (s ?? '').replace(/\s/g, '');

/** 객체 핸들 열쇠(AUDIT·DXF 쓰기·HANDSEED·블록 참조 찾기) */
const H_SEED = '핸들 시드 {0}이(가) 가장 큰 핸들 {1}보다 작습니다.';
const H_NONE = '핸들 없음';
const H_TARGET = '{0}(핸들 없음)';
const H_MISSING = '핸들이 없습니다.';
const H_DUP = '핸들이 겹친 객체에 새 핸들을 붙였습니다.';
const H_NEXT = '다음 핸들';
const H_NEW = '새 핸들';
const H_NONEW = '새 핸들 없음';
const H_REF = '핸들 {0}{1}에 해당하는 블록 참조가 이 도면에 없습니다({2}개).';
/** DWG 쓰기 경고(writer/entities.ts·writer/context.ts) */
const W_ONE = '쓸 수 없는 도형 {0}';
const W_DROP = '이 버전으로 쓸 수 없는 도형 {0}개를 뺐습니다(원본 자료가 없거나 다른 버전).';
/** 감사 대상(audit.ts) */
const T_LAYER = '도면층 {0}';
const T_BLOCK = '블록 {0}';
/** MVSETUP 단위 유형(filecmds-layout.ts) */
const MV_HEAD = '단위 유형 입력 [';
const MV_FULL = '단위 유형 입력 [과학(S)/십진(D)/공학(E)/건축(A)/미터법(M)]:';
const MV_KW: [word: string, letter: string][] = [
  ['과학', 'S'],
  ['십진', 'D'],
  ['공학', 'E'],
  ['건축', 'A'],
  ['미터법', 'M'],
];
/** -UNITS 길이·각도 목록(dashcmds-tables.ts) — 열쇠와 그 보기 꼴 */
const DEC_DEG = '1. 십진 도수 45.0000';
const SURVEY_ITEM = '5. 측량 단위 N 45d0\'0" E';
const LIST: [key: string, sample: string][] = [
  ['1. 과학 1.55E+01', '1.55E+01'],
  ['2. 십진 15.50', '15.50'],
  ['3. 공학 1\'-3.50"', '1\'-3.50"'],
  ['4. 건축 1\'-3 1/2"', '1\'-3 1/2"'],
  ['5. 분수 15 1/2', '15 1/2'],
  [DEC_DEG, '45.0000'],
  ['2. 도/분/초 45d0\'0"', '45d0\'0"'],
  ['3. 그라디안 50.0000g', '50.0000g'],
  ['4. 라디안 0.7854r', '0.7854r'],
  [SURVEY_ITEM, 'N 45d0\'0" E'],
];
/** UNITS 대화 상자(tables.ts)·INSUNITS 설명(sysvars.ts) */
const SURVEY = '측량 단위';
const INSUNITS = '삽입 축척 단위';
/** 대시 명령 각도 입력 오류(dashcmds-ask.ts)와 같은 꼴의 이웃(dashcmds-array.ts) */
const ANG_PT = '각도 또는 점이 필요합니다.';
const DIST_PT = '0이 아닌 거리 또는 점이 필요합니다.';

describe('317차가 남긴 것과 단위·좌표 표시·각도 형식 묶음의 번역(318차)', () => {
  it('핸들: 객체 핸들 열쇠는 같은 사전 「핸들」 낱말(zh 句柄·de Handle)이고, 그립 열쇠는 그대로다', () => {
    const [de, zh] = [dict.de, dict['zh-CN']];
    const audit = src('edit/util/audit.ts');
    expect(audit).toContain("'핸들 없음'");
    expect(audit).toContain("message: '핸들이 없습니다.', fix: '새 핸들'");
    expect(audit).toContain('`핸들 시드 ${seed');
    expect(src('io/dxf/wcontext.ts')).toContain(`'${H_DUP}'`);
    expect(src('app/sysvars.ts')).toContain(`HANDSEED: '${H_NEXT}',`);
    expect(src('app/blkcmds-att.ts')).toContain('에 해당하는 블록 참조가 이 도면에 없습니다(');
    const keys = Object.keys(zh).filter((k) => k.includes('핸들'));
    for (const k of [H_SEED, H_NONE, H_TARGET, H_MISSING, H_DUP, H_NEXT, H_NEW, H_NONEW, H_REF]) expect(keys, k).toContain(k);
    for (const k of keys) {
      expect(zh[k], k).toContain(zh['핸들']!);
      expect(zh[k], k).not.toContain('手柄');
      expect(de[k], k).toMatch(/handle/i);
      expect(de[k], k).not.toMatch(/Griff/);
    }
    expect(zh[H_SEED]).toBe('句柄种子 {0} 小于最大句柄 {1}。');
    expect(zh[H_DUP]).toBe('已为句柄重复的对象分配新句柄。');
    expect(de[H_SEED]).toBe('Der Handle-Startwert {0} ist kleiner als das größte Handle {1}.');
    expect(de[H_DUP]).toBe('Einem Objekt mit doppeltem Handle wurde ein neues Handle zugewiesen.');
    // 317차 감사 대상 틀 「{0}(핸들 없음)」은 같은 사전 「핸들 없음」 값 그대로
    for (const l of LANGS) expect(dict[l][H_TARGET], l).toBe(`{0}(${dict[l][H_NONE]})`);
    // 그립 뜻(원문 「그립」)은 Griff·夹点 그대로
    expect(de['그립이 없습니다.']).toContain('Griff');
    expect(zh['그립이 없습니다.']).toContain('夹点');
  });

  it('쓰기 경고의 도형은 엔티티다(316차 읽기 경고와 같은 낱말 — shape·形状·Form이 아니다)', () => {
    const [en, de, zh] = [dict.en, dict.de, dict['zh-CN']];
    expect(src('io/dwg/writer/entities.ts')).toContain('`쓸 수 없는 도형 ${e.type}`');
    expect(src('io/dwg/writer/context.ts')).toContain('`이 버전으로 쓸 수 없는 도형 ${n}개를 뺐습니다(원본 자료가 없거나 다른 버전).`');
    const WROTE = '도형을 쓰지 못해 뺐습니다.';
    expect(en[WROTE]).toContain('entity');
    expect(zh[WROTE]).toContain('图形');
    expect(de[WROTE]).toContain('grafisches Objekt');
    for (const k of [W_ONE, W_DROP]) {
      expect(en[k], k).toMatch(/entit/);
      expect(en[k], k).not.toMatch(/shape/i);
      expect(zh[k], k).toContain('图形');
      expect(zh[k], k).not.toContain('形状');
      expect(de[k], k).toMatch(/[Gg]rafisches? Objekt/);
      expect(de[k], k).not.toMatch(/Form/);
    }
  });

  it('감사 대상 「도면층 {0}」·「블록 {0}」은 줄 머리 이름표라 영어도 첫 글자가 대문자다', () => {
    const audit = src('edit/util/audit.ts');
    expect(audit).toContain('target: `도면층 ${ft(l.name)}`');
    expect(audit).toContain('target: `블록 ${ft(b.name)}`');
    expect([dict.en[T_LAYER], dict.en[T_BLOCK]]).toEqual(['Layer {0}', 'Block {0}']);
    expect([dict.de[T_LAYER], dict.de[T_BLOCK]]).toEqual(['Layer {0}', 'Block {0}']);
  });

  it('MVSETUP 단위 유형: 조각은 같은 사전 낱말 열쇠 꼴, 통째는 앞 조각으로 시작해 조각을 그대로 품는다', () => {
    expect(src('app/filecmds-layout.ts')).toContain(`ctx.getPoint('${MV_FULL}'`);
    for (const l of LANGS) {
      const d = dict[l];
      const full = squash(d[MV_FULL]);
      expect(full.startsWith(squash(d[MV_HEAD])), `${l}: 앞 조각`).toBe(true);
      for (const [word, letter] of MV_KW) {
        const kw = `${word}(${letter})`;
        expect(full, `${l}: ${kw}`).toContain(squash(d[kw]));
        // 낱말 열쇠 꼴(중국어 「미터법」은 公制单位 — 조각은 公制(M) 그대로라 뺀다)
        if (l === 'zh-CN' && word === '미터법') continue;
        expect(d[kw], `${l}: ${kw}`).toBe(`${d[word]}${l === 'ja' || l === 'zh-CN' ? '' : ' '}(${letter})`);
      }
    }
    expect(dict['zh-CN'][MV_FULL]).not.toContain('计数法');
  });

  it('-UNITS 목록은 숫자 꼴을 옮기지 않고, 측량 단위·십진 도수·삽입 축척 단위·각도 입력 오류는 같은 사전의 낱말이다', () => {
    const [de, ja, zh] = [dict.de, dict.ja, dict['zh-CN']];
    const ut = squash(src('app/dashcmds-tables.ts'));
    for (const [k, sample] of LIST) {
      expect(ut, k).toContain(squash(k));
      for (const l of LANGS) expect(dict[l][k], `${l}: ${k}`).toContain(sample);
    }
    // 앱 출력의 소수점은 「.」(toFixed) — 같은 목록 1번 독일어도 점
    expect(src('core/units.ts')).toContain('trimZeros(v.toFixed(prec))');
    expect(de['1. 과학 1.55E+01']).toContain('1.55E+01');
    // 측량 단위: UNITS 대화 상자 각도 유형과 -UNITS 각도 목록 5번이 같은 낱말(일본어 測定 = 측정, 중국어 单元 = 단원·칸)
    expect(src('app/tables.ts')).toContain(`{ value: '4', label: '${SURVEY}' }`);
    for (const l of LANGS) expect(dict[l][SURVEY_ITEM], l).toContain(dict[l][SURVEY]!);
    expect(ja[SURVEY_ITEM]).not.toContain('測定');
    expect(zh[SURVEY]).toBe('测量单位');
    // 십진 도수: 각도 목록 1번은 「십진 도수」 낱말(중국어는 길이 목록 2번 「十进制」과 같은 이름이었다)
    for (const l of ['de', 'ja', 'zh-CN'] as const) expect(dict[l][DEC_DEG], l).toContain(dict[l]['십진 도수']!);
    // 삽입 축척 단위(UNITS 대화 상자·INSUNITS 설명): 독일어는 명령꼴(… einfügen)이 아니라 「삽입점」 Einfügepunkt 꼴 합성어
    expect(src('app/tables.ts')).toContain(`label: '${INSUNITS}',`);
    expect(src('app/sysvars.ts')).toContain(`INSUNITS: '${INSUNITS}',`);
    expect(de['삽입점']).toBe('Einfügepunkt');
    expect(de[INSUNITS]).not.toMatch(/einfügen$/);
    expect(de[INSUNITS]).toContain('Einfügemaßstab');
    // 각도 입력 오류: 「0이 아닌 거리 또는 점이 필요합니다.」 꼴(多个点 = 여러 점이 아니다)
    expect(src('app/dashcmds-ask.ts')).toContain(`'${ANG_PT}'`);
    expect(zh[ANG_PT]).toBe(zh[DIST_PT]!.replace('非零距离', '角度'));
    expect(zh[ANG_PT]).not.toContain('多个');
  });

  it('거꾸로 찾기: 바꾼 값은 제 원문으로 돌아온다(다른 일을 하는 칸과 같은 값이 아니다)', () => {
    const changed: [Lang, string[]][] = [
      ['zh-CN', [H_SEED, H_NONE, H_TARGET, H_MISSING, H_DUP, W_ONE, W_DROP, '건축(A)', '십진(D)', MV_FULL, SURVEY, DEC_DEG, ANG_PT]],
      ['de', [H_NEXT, H_NEW, H_NONEW, H_REF, H_SEED, H_NONE, H_TARGET, H_MISSING, H_DUP, W_ONE, W_DROP, '과학(S)', '공학(E)', '건축(A)', '미터법(M)', MV_FULL, '2. 십진 15.50', '3. 공학 1\'-3.50"', '4. 라디안 0.7854r', INSUNITS]],
      ['en', [W_ONE, W_DROP, T_LAYER, T_BLOCK, MV_HEAD]],
      ['ja', [SURVEY_ITEM, '건축(A)']],
    ];
    expect(changed.map(([, ks]) => ks.length)).toEqual([13, 20, 5, 2]);
    for (const [l, keys] of changed) for (const k of keys) expect(sourceMessage(dict[l][k]!), `${l}: ${k}`).toBe(k);
  });
});
