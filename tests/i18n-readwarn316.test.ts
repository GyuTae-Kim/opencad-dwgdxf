/**
 * 316차: 315차가 남긴 것(중국어 ARRAY 레벨 낱말·짝 꼴 둘)과 도면 감사·복구·파일 읽기 경고 묶음의 번역 대조·빠진 번역.
 * - 출발점: 중국어 ARRAY 레벨은 285차 규칙대로 层级 — 「시작 레벨과 끝 레벨」 标高(315차 통일 뒤 행 고도 증분과 같은 낱말), 통째 프롬프트 楼层·그립 프롬프트 层은
 *   같은 프롬프트 앞 조각·「레벨(L)」 层级(L)과 다른 낱말이었다. 짝 꼴: 중국어 「새 객체의 고도」는 「새 객체의 두께」 新建对象…와 같은 꼴,
 *   독일어 ELEV 두 프롬프트는 같은 문장 꼴(… angeben <{0}>: — 같은 사전 「새 … 지정 <{0}>:」의 다수 꼴).
 * - 파일 읽기 경고(가): 도형(엔티티)은 shape·形状·Form이 아니다(같은 사전 「도형을 쓰지 못해 뺐습니다.」 entity·图形·grafisches Objekt — 쉐이프는 SHAPE 객체),
 *   중국어 객체 物体 → 对象·섹션 部分 → 节(같은 사전의 다른 섹션 줄), 「{0} 섹션 페이지」의 {0}은 섹션 이름(쪽 번호가 아니다), 뜻이 깨진 줄
 *   (「자기 자신을 참조하거나 너무 깊은 블록을 건너뛰었습니다」 중국어·독일어, 「객체가 너무 많아 {0}개를 읽지 않았습니다」 중국어, 「객체 위치가 잘못되어 건너뛰었습니다」 일본어 間違って — 실수로),
 *   도형 파일(SHX) 几何文件 → 形状文件, 단선 글꼴 实线(같은 사전 「실선」의 낱말) → 单线, SHX 글꼴 목록 「없음(대체 글꼴로 그림)」의 그림 图片·Bild(그림 = 그렸음), 독일어 대화 상자 제목 명령꼴.
 * - 빠진 번역(나): 도면을 열 때 명령행 「참고: {경고}{ (개수)}」 줄(app.ts)은 틀 「참고: {0}」이 경고 글을 잡아(잡은 값은 옮기지 않는다) 네 언어 모두 한국어로 남았다 —
 *   그리기(docstate.ts warningText)·DXF·DWG 리더 경고마다 「참고: …( ({n}))」 열쇠(값 = 같은 사전 「참고: {0}」 꼴 + 같은 사전의 경고 글 번역 + 개수, 314차 「종류 (개수)」 꼴).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { guardedTranslate, translateTail } from '../src/app/fileguard';
import { sourceMessage, translate } from '../site/i18n.mjs';

const LANGS = ['en', 'de', 'ja', 'zh-CN'] as const;
type Lang = (typeof LANGS)[number];
const HANGUL = /[가-힣]/;
const load = (lang: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../site/locales/${lang}.json`, import.meta.url), 'utf8'));
const dict = Object.fromEntries(LANGS.map((l) => [l, load(l)])) as Record<Lang, Record<string, string>>;
const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const tr = (l: string) => (x: string) => guardedTranslate(x, l) ?? translate(x, l);
/** 명령행에 보이는 꼴(통째 번역 + 기록 줄의 프롬프트·기본값 꼬리 — fileguard translateTail) */
const show = (l: string) => (x: string) => translateTail(x, tr(l)(x), tr(l));
/** 통째 프롬프트가 같은 프롬프트의 명령행 앞 조각(「… [」)으로 시작하는지(빈칸은 보지 않는다 — 285차 시험과 같음) */
const startsWithHead = (d: Record<string, string>, key: string): boolean => {
  const squash = (s: string | undefined) => (s ?? '').replace(/\s/g, '');
  const head = squash(d[key.slice(0, key.indexOf('[') + 1)]);
  return head.length > 1 && squash(d[key]).startsWith(head);
};
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** 틀 꼴 글({0})이 소스 글(`${…}`)로 그 파일들에 있는지 */
const inSource = (msg: string, files: readonly string[]): boolean => {
  const re = new RegExp(msg.split(/\{\d+\}/).map(esc).join('\\$\\{[^}]+\\}'));
  return files.some((f) => re.test(src(f)));
};

/** ARRAYPATH·ARRAYEDIT 레벨(arraypath.ts 266~278·assocarray.ts 401~413) */
const LV_HEAD = '시작 레벨과 끝 레벨 사이의 전체 거리 지정 또는 [';
const LV_TOTAL = '시작 레벨과 끝 레벨 사이의 전체 거리 지정 또는 [표현식(E)] <{0}>:';
const LV_DIST = '레벨 사이의 거리 지정 또는 [전체(T)/표현식(E)] <{0}>:';
const LV_COUNT = '레벨 수 입력 또는 [표현식(E)] <{0}>:';
const LV_NOTE = '레벨은 Z 방향으로 쌓이므로 평면도에서는 같은 자리에 겹쳐 보입니다.';
/** ARRAYPATH 그립 편집(arraypath.ts 187) */
const PATH_EDIT = '그립을 선택하여 배열을 편집하거나 [연관(AS)/방법(M)/기준점(B)/접선 방향(T)/항목(I)/행(R)/레벨(L)/항목 정렬(A)/Z 방향(Z)/종료(X)] <종료>:';

/** 그리기 경고(docstate.ts warningText — 그리기 엔진이 늘 개수를 붙여 보낸다) */
const SOME = '일부 객체를 그리지 못했습니다.';
const MEM = '메모리가 모자라 일부 객체를 그리지 못했습니다.';
const SELF = '자기 자신을 참조하거나 너무 깊은 블록을 건너뛰었습니다.';
const SHAPEF = '도형 파일(SHX)이 없어 쉐이프 객체를 그리지 못했습니다. SHXFONTS로 도형 파일을 불러올 수 있습니다.';
const DRAW = [
  '형상 자료를 풀 수 없는 3D 솔리드·영역과 그림이 없는 사용자 객체는 그리지 않았습니다.',
  SOME,
  MEM,
  '정의가 없는 블록 참조가 있습니다.',
  SELF,
  '블록을 펼치는 양이 너무 많아 일부 블록 참조는 그리지 않았습니다.',
  '그릴 조각이 너무 많아 남은 해치는 경계만, 남은 선은 실선으로 그렸습니다.',
  '차수가 너무 큰 스플라인은 차수 25로 계산해 그렸습니다.',
  '맞춤점이 너무 많은 곡선은 점을 잇는 꺾은선으로 그렸습니다.',
  '무늬 요소가 너무 많은 선종류와 해치 무늬는 실선으로 그렸습니다.',
  '외부 참조 파일은 열지 않았습니다.',
  '무늬가 아주 촘촘한 해치는 멀리서 볼 때 경계와 성긴 무늬로 그리고, 확대하면 보이는 곳을 원래 간격으로 그립니다.',
  '경계 고리가 너무 많이 겹쳐 든 채우기 해치는 채우지 않고 경계만 그렸습니다.',
  SHAPEF,
  '치수 블록이 없는 치수는 치수 스타일대로 다시 만들어 그렸습니다(저장한 파일에는 블록을 넣지 않습니다).',
  'R2000 이전 DWG에서 읽은 OLE 객체(붙여 넣은 표·그림)는 위치를 알 수 없어 그리지 않았습니다. 같은 버전 DWG로 저장하면 그대로 남습니다.',
  'OLE 객체(붙여 넣은 표·그림)는 내용 없이 틀만 그립니다.',
];
/** 리더 경고(DXF·DWG·R12·확장자·글꼴) — DWG 리더의 warn()은 늘 개수 1부터 */
const MANY = '객체가 너무 많아 {0}개를 읽지 않았습니다.';
const FONT_NOW = '글꼴을 받지 못해 일부 문자를 대체 글꼴로 그립니다.';
const POS = '객체 위치가 잘못되어 건너뛰었습니다.';
const ENT_LIMIT = '도형이 {0}개를 넘어 나머지는 읽지 않았습니다.';
const ORPHAN = '블록에 속하지 않은 도형 {0}개를 버렸습니다.';
const END = '파일 헤더 끝 표지가 맞지 않습니다.';
const SEC_FIND = '{0} 섹션의 페이지를 찾지 못했습니다.';
const SEC_OUT = '{0} 섹션의 페이지가 파일 밖에 있습니다.';
const SEC_UNPACK = '{0} 섹션 페이지를 풀지 못했습니다.';
const SEC_HEAD = '{0} 섹션 페이지 헤더가 맞지 않습니다.';
const SEC_END = '{0} 섹션 페이지가 파일 끝을 넘습니다.';
const SEC_SUM = '{0} 섹션 페이지 체크섬이 맞지 않습니다.';
const SEC_DECOMP = '{0} 섹션 페이지 압축을 풀지 못했습니다.';
const READ: [msg: string, count: boolean][] = [
  ['표시하지 않는 객체 종류가 있습니다.', true],
  [MANY, true],
  ['객체 {0}개의 CRC가 맞지 않습니다(내용은 그대로 읽었습니다).', true],
  ['객체 {0}개를 읽지 못해 건너뛰었습니다.', true],
  ['알 수 없는 R12 객체 {0}개를 건너뛰었습니다.', true],
  ['R12 객체 {0}개를 읽지 못해 건너뛰었습니다.', true],
  [FONT_NOW, false],
  ['확장자는 .{0}이지만 내용은 {1}입니다.', false],
  ...[
    '클래스 목록을 끝까지 읽지 못했습니다.',
    '헤더 시작 표지가 맞지 않습니다.',
    '헤더 CRC가 맞지 않습니다.',
    '헤더 변수를 읽다가 자료 끝을 넘었습니다.',
    '객체 지도 CRC가 맞지 않습니다.',
    POS,
    '객체 지도가 같은 객체를 너무 여러 번 가리켜 나머지 객체를 읽지 않았습니다.',
    ENT_LIMIT,
    '블록 목록이 이미 넣은 도형을 다시 가리킨 {0}곳은 건너뛰었습니다.',
    ORPHAN,
    '파일 헤더 CRC가 맞지 않습니다.',
    END,
    SEC_FIND,
    SEC_OUT,
    '{0} 섹션이 같은 페이지를 너무 여러 번 가리켜 나머지 페이지를 읽지 않았습니다.',
    SEC_UNPACK,
    SEC_HEAD,
    SEC_END,
    SEC_SUM,
    SEC_DECOMP,
  ].map((m): [string, boolean] => [m, true]),
];
const READ_FILES = [
  'io/dxf/reader.ts',
  'io/dwg/build.ts',
  'io/dwg/classes.ts',
  'io/dwg/header.ts',
  'io/dwg/handles.ts',
  'io/dwg/container/r2000.ts',
  'io/dwg/container/r2004.ts',
  'io/dwg/container/r2007.ts',
  'io/dwg/r12.ts',
  'io/index.ts',
  'worker/engine.worker.ts',
] as const;
/** SHX 글꼴(shxfonts.ts) */
const NONE = '없음(대체 글꼴로 그림)';
const SHX_TITLE = 'SHX 글꼴 불러오기';
const SHX_NOTE = '참고: SHX 글꼴 {0}이(가) 없어 비슷한 단선 글꼴로 그렸습니다. SHXFONTS로 이 컴퓨터의 SHX 글꼴을 불러올 수 있습니다.';

describe('도면 감사·복구·파일 읽기 경고 묶음의 번역(316차)', () => {
  it('출발점: 중국어 ARRAY 레벨은 层级(标高·楼层·层이 아니다)이고, 짝 꼴은 짝 열쇠와 같다', () => {
    const [de, zh] = [dict.de, dict['zh-CN']];
    const ap = src('app/arraypath.ts');
    for (const k of [LV_TOTAL, LV_DIST, LV_COUNT]) expect(ap, k).toContain(k.replace('<{0}>:', '<${'));
    expect(ap).toContain(`ctx.print('${LV_NOTE}')`);
    expect(ap).toContain(`'${PATH_EDIT}'`);
    for (const [k, v] of Object.entries(zh)) if (k.includes('레벨')) expect(v, k).not.toMatch(/标高|楼层|层 \(L\)/);
    for (const k of [LV_HEAD, LV_TOTAL, LV_DIST, LV_COUNT, LV_NOTE]) expect(zh[k], k).toContain(zh['레벨']!);
    for (const k of [LV_TOTAL, LV_DIST, LV_COUNT]) expect(startsWithHead(zh, k), k).toBe(true);
    expect(zh[PATH_EDIT]).toContain(`/${zh['레벨']} (L)/`);
    // 짝 꼴: 「새 객체의 고도」 = 「새 객체의 두께」 꼴(新建对象…), ELEV 두 프롬프트 = 같은 문장 꼴(「새 높이 지정」 Neue Höhe angeben 꼴)
    expect(zh['새 객체의 고도']).toBe(zh['새 객체의 두께']!.replace(zh['두께']!, zh['고도']!));
    expect(de['새 기본 두께 지정 <{0}>:']).toBe(de['새 기본 고도 지정 <{0}>:']!.replace('Standarderhebung', 'Standarddicke'));
    expect(de['새 기본 두께 지정 <{0}>:']).toBe(de['새 높이 지정 <{0}>:']!.replace('Höhe', 'Standarddicke'));
  });

  it('파일 읽기 경고·SHX 글꼴 글은 같은 사전의 낱말이다(도형 = 엔티티, 섹션 = 节, 단선 ≠ 실선, 그림 = 그렸음)', () => {
    const [en, de, ja, zh] = [dict.en, dict.de, dict.ja, dict['zh-CN']];
    const shx = src('app/shxfonts.ts');
    expect(shx).toContain(`'${NONE}'`);
    expect(shx).toContain(`title: '${SHX_TITLE}',`);
    // 도형(엔티티) = 같은 사전 「도형을 쓰지 못해 뺐습니다.」의 낱말 — 쉐이프(SHAPE 객체)·形状·Form이 아니다
    const WROTE = '도형을 쓰지 못해 뺐습니다.';
    expect(en[WROTE]).toContain('entity');
    expect(zh[WROTE]).toContain('图形');
    expect(de[WROTE]).toContain('grafisches Objekt');
    for (const k of [ENT_LIMIT, ORPHAN]) {
      expect(en[k], k).toContain('entities');
      expect(en[k], k).not.toMatch(/shape/i);
      expect(zh[k], k).toContain('图形');
      expect(zh[k], k).not.toContain('形状');
      expect(de[k], k).toContain('grafische Objekte');
      expect(de[k], k).not.toMatch(/Form/);
    }
    expect(zh[ORPHAN]).not.toContain('该块');
    // 섹션 = 节(部分은 「부분」), {0}은 섹션 이름이라 「section page {0}」·「Abschnittsseite {0}」(쪽 번호로 읽힘)이 아니다
    const SECTION = Object.keys(zh).filter((k) => k.startsWith('{0} 섹션'));
    expect(SECTION).toHaveLength(8);
    for (const k of SECTION) {
      expect(zh[k], k).toContain('{0} 节');
      expect(zh[k], k).not.toContain('部分');
      expect(en[k], k).toMatch(/section \{0\}|\{0\} section/i);
      expect(en[k], k).not.toMatch(/section page \{0\}/i);
      expect(de[k], k).not.toMatch(/Abschnittsseite \{0\}|^\{0\} /);
    }
    // 뜻이 깨진 줄
    expect(zh[SOME]).toBe(zh[MEM]!.split('，')[1]);
    expect(de[SOME]).toMatch(/\.$/);
    expect(zh[SELF]).toBe('已跳过引用自身或嵌套过深的块。');
    expect(de[SELF]).toBe('Blöcke, die sich selbst referenzieren oder zu tief verschachtelt sind, wurden übersprungen.');
    expect(zh[MANY]).toBe('对象过多，{0} 个未读取。');
    expect([ja[POS], en[POS], de[POS]]).toEqual(['位置が正しくないオブジェクトをスキップしました。', 'Skipped an object with an invalid location.', 'Ein Objekt mit falscher Position wurde übersprungen.']);
    expect(de[END]).toBe(de['헤더 시작 표지가 맞지 않습니다.']!.replace('Header-Startmarkierung', 'Endmarkierung des Dateikopfes'));
    // 도형 파일(SHX) = 쉐이프 파일(같은 줄의 쉐이프 객체 形状对象 — 几何는 「기하」)
    expect(zh[SHAPEF]!.match(/形状文件/g)).toHaveLength(2);
    expect(zh[SHAPEF]).not.toContain('几何');
    // 단선(한 획) 글꼴: 实线은 같은 사전 「실선」의 낱말
    expect(zh['실선']).toBe('实线');
    expect(zh[SHX_NOTE]).toContain('单线字体');
    expect(zh[SHX_NOTE]).not.toContain(zh['실선']!);
    // SHX 글꼴 목록 「없음(대체 글꼴로 그림)」의 그림 = 그렸음(图片·Bild가 아니다) — 같은 사전 「… 대체 글꼴로 그립니다」의 낱말
    expect(zh[FONT_NOW]).toContain('替代字体');
    expect(zh[NONE]).toBe('无（使用替代字体绘制）');
    expect(de[FONT_NOW]).toContain('Ersatzschriftart');
    expect(de[NONE]).toBe('Keine (mit Ersatzschriftart gezeichnet)');
    // 대화 상자 제목은 명령꼴이 아니다(같은 사전 「불러오기」 Laden)
    expect(de[SHX_TITLE]).toBe(`SHX-Schriftarten ${de['불러오기']!.toLowerCase()}`);
  });

  it('도면을 열 때 명령행 「참고:」 경고 줄은 네 언어 모두 한국어 없이 보인다(「참고: {0}」 꼴 + 같은 사전의 경고 글 + 개수)', () => {
    expect(src('app/app.ts')).toContain("this.cmd.print(`참고: ${x.message}${x.count ? ` (${x.count})` : ''}`);");
    const doc = src('app/docstate.ts');
    for (const m of DRAW) expect(doc, m).toContain(`return '${m}';`);
    for (const [m] of READ) expect(inSource(m, READ_FILES), m).toBe(true);
    const all: [string, boolean][] = [...DRAW.map((m): [string, boolean] => [m, true]), ...READ];
    expect(all).toHaveLength(45);
    expect(new Set(all.map(([m]) => m)).size).toBe(45);
    for (const l of LANGS) {
      const d = dict[l];
      for (const [m, count] of all) {
        const slots = (m.match(/\{\d+\}/g) ?? []).length;
        const key = `참고: ${m}${count ? ` ({${slots}})` : ''}`;
        expect(d[key], `${l}: ${key}`).toBeDefined();
        if (d[m]) expect(d[key], `${l}: ${key}`).toBe(d['참고: {0}']!.replace('{0}', d[m]!) + (count ? ` ({${slots}})` : ''));
        // 실제 줄: 섹션 이름·수를 끼우고 개수(3)를 붙인다
        const vals = Array.from({ length: slots }, (_v, i) => (m.includes('섹션') && i === 0 ? 'AcDb:ObjFreeSpace' : String(7 + i)));
        const fill = (t: string, v: string[]) => t.replace(/\{(\d+)\}/g, (_s, i: string) => v[Number(i)]!);
        const line = `참고: ${fill(m, vals)}${count ? ' (3)' : ''}`;
        const out = show(l)(line);
        expect(out, `${l}: ${line}`).not.toMatch(HANGUL);
        expect(out, `${l}: ${line}`).toBe(fill(d[key]!, [...vals, '3']));
      }
    }
  });

  it('거꾸로 찾기: 바꾼 값은 제 원문으로 돌아온다(다른 일을 하는 칸과 같은 값이 아니다)', () => {
    const changed: [Lang, string[]][] = [
      ['zh-CN', [LV_HEAD, LV_TOTAL, LV_DIST, LV_COUNT, LV_NOTE, PATH_EDIT, '새 객체의 고도', SOME, SELF, MANY, ENT_LIMIT, ORPHAN, SEC_FIND, SEC_OUT, SEC_UNPACK, SEC_HEAD, SEC_END, SEC_DECOMP, SHAPEF, NONE, SHX_NOTE]],
      ['de', ['새 기본 두께 지정 <{0}>:', SOME, SELF, POS, ENT_LIMIT, ORPHAN, END, SEC_UNPACK, SEC_END, SEC_SUM, SEC_DECOMP, NONE, SHX_TITLE]],
      ['en', [POS, ENT_LIMIT, ORPHAN, SEC_UNPACK, SEC_END, SEC_DECOMP]],
      ['ja', [POS]],
    ];
    expect(changed.map(([, ks]) => ks.length)).toEqual([21, 13, 6, 1]);
    for (const [l, keys] of changed) for (const k of keys) expect(sourceMessage(dict[l][k]!), `${l}: ${k}`).toBe(k);
  });
});
