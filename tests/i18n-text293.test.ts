/**
 * 293차: 문자 묶음(TEXT·DTEXT·MTEXT·STYLE·-STYLE·TEXTEDIT(DDEDIT)·FIND·JUSTIFYTEXT·SCALETEXT·TXT2MTXT)의 번역과 292차가 한도 밖으로 남긴 오역.
 * - 빠진 번역: 자리맞추기 옵션 「중간(M)」·「기존(E)」·「맨 위 왼쪽(TL)」~「맨 아래 오른쪽(BR)」은 열쇠가 없어 TEXT·MTEXT·SCALETEXT·JUSTIFYTEXT 명령행 옵션과
 *   통째 프롬프트(기록 줄·휴대폰 카드)가 한국어였고, -STYLE 높이 프롬프트·예/아니오 물음 넷(앞 조각 「… [」·통째), 기본값이 없는 「폭 지정:」·「새 길이 지정:」,
 *   틀이 앱 낱말을 잡는 줄 — TEXT·MTEXT 머리 줄의 「주석: 예/아니오」, -STYLE ? 목록의 「생성: 보통」 — 은 공용 번역기가 잡은 값을 옮기지 않아 네 언어 모두 한국어가 남았다.
 * - 오역: 영어 기준점을 Reference point(기준점 X는 X도 빠짐)·분해를 Disintegration·disassembled로, 독일어 속성을 Eigenschaft(특성)·결합(bind)을 kombinieren으로,
 *   BLOCK 대화 상자 「동작」(Behavior)을 Operation·运动·Betrieb로, 문자 묶음의 기호 깨짐·반대로 Conversely·보통 Average·대소문자 일치 Streichholzschachtel(성냥갑)·
 *   자간 Kerspace·중국어 중간 중심 中点(중간점)·기울기 각도 坡度角·단일 单行 등 — 같은 사전 안의 맞는 번역으로 고쳤다.
 * 프롬프트는 소스에서 모은다(textedit/commands.ts TEXT_JUSTIFY·MTEXT_JUSTIFY, modify2.ts JUST_LABELS, -STYLE 물음).
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
const squash = (s: string | undefined) => (s ?? '').replace(/\s/g, '');
const block = (s: string, from: string) => s.slice(s.indexOf(from), s.indexOf('];', s.indexOf(from)));

type Opt = readonly [string, string];
/** 자리맞추기 옵션: TEXT_JUSTIFY(열다섯 — 맞춤(F)은 명령행 열쇠 끝에 U+2060), MTEXT_JUSTIFY(아홉), JUST_LABELS(SCALETEXT·JUSTIFYTEXT 열다섯) */
const TEXT_J: Opt[] = [...src('textedit/commands.ts').matchAll(/^\s*\['(\w+)', '([^']+)', \d, \d, '/gm)].map((m) => [m[1]!, m[2]!] as const);
const MTEXT_J: Opt[] = [...block(src('textedit/commands.ts'), 'const MTEXT_JUSTIFY').matchAll(/\{ key: '(\w+)', label: '([^']+)' \}/g)].map((m) => [m[1]!, m[2]!] as const);
const JUST: Opt[] = [...block(src('modify2.ts'), 'const JUST_LABELS').matchAll(/\['(\w+)', '([^']+)'\]/g)].map((m) => [m[1]!, m[2]!] as const);
const opt = ([k, l]: Opt) => `${l}(${k})`;
/** TEXT 자리맞추기(J) 옵션 목록(JUSTIFY_PROMPT), MTEXT 자리맞추기, SCALETEXT 기준점(기존(E) + A·F 뺀 JUST_LABELS), JUSTIFYTEXT */
const TJ = TEXT_J.map(([k, l]) => (k === 'F' ? `${l}⁠(${k})` : opt([k, l]))).join('/');
const MJ = MTEXT_J.map(opt).join('/');
const SJ = [['E', '기존'] as const, ...JUST.filter(([k]) => k !== 'A' && k !== 'F')].map(opt).join('/');
const JJ = JUST.map(opt).join('/');

/** askYN(dashcmds-ask.ts) 꼴: 물음 [예(Y)/아니오(N)] <기본값>: */
const yn = (q: string, def: boolean) => `${q} [예(Y)/아니오(N)] <${def ? '예' : '아니오'}>:`;
/** -STYLE 예/아니오 물음(기본값은 새 스타일의 값) */
const QS: [string, boolean][] = [
  ['주석 문자 스타일을 작성하시겠습니까?', true],
  ['문자를 반대로 표시하시겠습니까?', false],
  ['문자를 거꾸로 표시하시겠습니까?', false],
  ['수직?', false],
];
/** -STYLE 높이 프롬프트(주석 스타일이면 용지 문자 높이) */
const HEIGHT = ['문자 높이 지정', '용지 문자 높이 지정'];
const PROMPTS = [
  `옵션 입력 [${TJ}]:`,
  `자리맞추기 입력 [${MJ}] <맨 위 왼쪽(TL)>:`,
  `자리맞추기 입력 [${MJ}] <중간 중심(MC)>:`,
  `축척에 대한 기준점 옵션 입력 [${SJ}] <기존>:`,
  `축척에 대한 기준점 옵션 입력 [${SJ}] <맨 위 왼쪽>:`,
  `자리맞추기 옵션 입력 [${JJ}] <왼쪽>:`,
  `자리맞추기 옵션 입력 [${JJ}] <맨 아래 오른쪽>:`,
  '폭 지정:',
  '새 길이 지정:',
  ...HEIGHT.map((h) => `${h} 또는 [주석(A)] <2.5000>:`),
  ...QS.map(([q, d]) => yn(q, d)),
];
/** -STYLE ? 목록의 생성 글(반대로·거꾸로·수직을 ", "로 잇고 없으면 보통) */
const GEN = ['보통', '반대로', '거꾸로', '수직', '반대로, 거꾸로', '반대로, 수직', '거꾸로, 수직', '반대로, 거꾸로, 수직'];
const LOG = [
  ...['예', '아니오'].map((a) => `현재 문자 스타일: "${ft('Standard')}"  문자 높이: 2.5000  주석: ${a}`),
  ...GEN.map((g) => `   높이: 2.5000  폭 비율: 1.0000  기울기 각도: 0  생성: ${g}`),
];

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.unstubAllGlobals();
});

describe('문자 묶음의 번역과 292차 한도 밖 오역(293차)', () => {
  it('명령행 입력 줄(앞 글 「… [」·옵션·뒤 글 「] <…>:」, 대괄호 없는 프롬프트)이 네 언어 모두 한국어 없이 보인다', async () => {
    // 소스에서 모은 옵션 목록과 프롬프트가 명령이 내는 글과 같다(코드가 짜 맞추는 꼴)
    const NINE = ['TL', 'TC', 'TR', 'ML', 'MC', 'MR', 'BL', 'BC', 'BR'];
    expect(TEXT_J.map(([k]) => k)).toEqual(['L', 'C', 'R', 'A', 'M', 'F', ...NINE]);
    expect(MTEXT_J).toEqual(TEXT_J.slice(6));
    expect(JUST.map(([k]) => k)).toEqual(['L', 'A', 'F', 'C', 'M', 'R', ...NINE]);
    expect(JUST.map(([, l]) => l)).toEqual(['L', 'A', 'F', 'C', 'M', 'R', ...NINE].map((k) => TEXT_J.find(([x]) => x === k)![1]));
    for (const [f, s] of [
      ['textedit/commands.ts', "const justifyOpt = ([k, l]: (typeof TEXT_JUSTIFY)[number]) => (k === 'F' ? '맞춤\\u{2060}' : l);"],
      ['textedit/commands.ts', "export const JUSTIFY_PROMPT = `옵션 입력 [${TEXT_JUSTIFY.map((j) => `${justifyOpt(j)}(${j[0]})`).join('/')}]:`;"],
      ['textedit/commands.ts', "const j = await ctx.getPoint(`자리맞추기 입력 [${MTEXT_JUSTIFY.map((k) => `${k.label}(${k.key})`).join('/')}] <${cur.label}(${cur.key})>:`, { keywords: MTEXT_JUSTIFY });"],
      ['textedit/commands.ts', 'const r = await ctx.getPoint(def !== undefined ? `${prompt} <${fmt(ctx, def)}>:` : `${prompt}:`, { base, allowText: true });'],
      ['textedit/commands.ts', "width = await askLength(ctx, '폭 지정', a);"],
      ['modify2.ts', "const baseKws: [string, string][] = [['E', '기존'], ...JUST_LABELS.filter(([k]) => k !== 'A' && k !== 'F')];"],
      ['modify2.ts', "const key = await choose(ctx, `축척에 대한 기준점 옵션 입력 [${kwText(baseKws)}] <${String(m.stBaseLabel ?? '기존')}>:`, kwList(baseKws), String(m.stBase ?? 'E'));"],
      ['modify2.ts', "return list.map(([k, l]) => `${l}(${k})`).join('/');"],
      ['modify2.ts', 'const key = await choose(ctx, `자리맞추기 옵션 입력 [${kwText(JUST_LABELS)}] <${defLabel}>:`, kwList(JUST_LABELS), defKey);'],
      ['modify2.ts', "const nl = await askNumber(ctx, '새 길이 지정', null, { positive: true });"],
      ['modify2-util.ts', 'const r = await ctx.getPoint(def !== null ? `${prompt} <${show(def)}>:` : `${prompt}:`, { preferNumber: true, base: opt.base ?? null, keywords: opt.keywords });'],
      ['dashcmds-tables.ts', "const r = await ctx.getPoint(`${annotative ? '용지 문자 높이 지정' : '문자 높이 지정'} 또는 [주석(A)] <${fmt4(s.height)}>:`, {"],
      ['dashcmds-tables.ts', "annotative = await askYN(ctx, '주석 문자 스타일을 작성하시겠습니까?', true);"],
      ['dashcmds-tables.ts', "const back = await askYN(ctx, '문자를 반대로 표시하시겠습니까?', !!(s.generation & 2));"],
      ['dashcmds-tables.ts', "const upside = await askYN(ctx, '문자를 거꾸로 표시하시겠습니까?', !!(s.generation & 4));"],
      ['dashcmds-tables.ts', "const vert = await askYN(ctx, '수직?', !!(s.flags & 4));"],
      ['dashcmds-ask.ts', "const k = await askOption(ctx, `${prompt} [예(Y)/아니오(N)] <${def ? '예' : '아니오'}>:`, YES_NO, def ? 'Y' : 'N');"],
    ])
      expect(src(f!), s).toContain(s);
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
      for (const p of PROMPTS) {
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

  it('통째 프롬프트(기록 줄·휴대폰 카드)와 TEXT·MTEXT 머리 줄, -STYLE ? 목록 줄이 네 언어 모두 한국어 없이 보인다', () => {
    const tr = (l: string) => (x: string) => guardedTranslate(x, l) ?? translate(x, l);
    const show = (s: string, l: string) => translateTail(s, tr(l)(s), tr(l));
    for (const [f, s] of [
      ['textedit/commands.ts', 'ctx.print(`현재 문자 스타일: "${ft(s?.name ?? name)}"  문자 높이: ${fmt(ctx, s?.height || defH)}  주석: ${textStyleAnnotative(doc, name) ? \'예\' : \'아니오\'}`);'],
      ['dashcmds-tables.ts', "const gen = [s.generation & 2 ? '반대로' : '', s.generation & 4 ? '거꾸로' : '', s.flags & 4 ? '수직' : ''].filter(Boolean).join(', ') || '보통';"],
      ['dashcmds-tables.ts', 'ctx.print(`   높이: ${fmt4(s.height)}  폭 비율: ${fmt4(s.widthFactor)}  기울기 각도: ${degText(s.oblique)}  생성: ${gen}`);'],
    ])
      expect(src(f!), s).toContain(s);
    const left: string[] = [];
    for (const l of LANGS) {
      // 기본값 꼬리가 있는 프롬프트는 친 입력이 붙은 기록 줄 꼴도
      for (const p of PROMPTS) for (const s of p.endsWith('>:') ? [p, `${p} Y`] : [p]) if (HANGUL.test(show(s, l))) left.push(`${l}: ${show(s, l)}`);
      for (const s of LOG) if (HANGUL.test(tr(l)(s))) left.push(`${l}: ${tr(l)(s)}`);
    }
    expect(left).toEqual([]);
    expect(show(PROMPTS[1]!, 'en')).toMatch(/^Enter justification \[Top Left \(TL\)\/Top Center \(TC\)\/.*\/Bottom Right \(BR\)\] <Top Left \(TL\)>:$/);
    expect(show(PROMPTS[3]!, 'de')).toMatch(/^Basispunktoptionen für den Maßstab eingeben \[Vorhanden \(E\)\/Links \(L\)\/.*\] <Vorhanden>:$/);
    expect(show(PROMPTS[6]!, 'ja')).toMatch(/^位置合わせオプションを入力 \[左\(L\)\/位置合わせ\(A\)\/フィット\(F\)\/.*\/右下\(BR\)\] <右下>:$/);
    expect(show(PROMPTS[0]!, 'zh-CN')).toBe('输入选项[左侧(L)/中心(C)/右侧(R)/对齐 (A)/中间(M)/调整(F)/左上角(TL)/顶部居中(TC)/右上角(TR)/左中(ML)/正中(MC)/右中(MR)/左下角(BL)/底部居中(BC)/右下角(BR)]：');
    expect([show('폭 지정:', 'en'), show('새 길이 지정:', 'de')]).toEqual(['Specify width:', 'Neue Länge angeben:']);
    expect(show(PROMPTS[10]!, 'en')).toBe('Specify paper text height or [Annotative (A)] <2.5000>:');
    expect(show(yn('수직?', false), 'zh-CN')).toBe('垂直？[是(Y)/否(N)] <否>：');
    expect(show(`${yn('주석 문자 스타일을 작성하시겠습니까?', true)} Y`, 'de')).toBe('Möchten Sie einen Beschriftungstextstil erstellen? [Ja (Y)/Nein (N)] <Ja>: Y');
    expect(tr('en')(LOG[1]!)).toBe('Current text style: "Standard" Text height: 2.5000 Annotative: No');
    expect(tr('de')(LOG[2 + 4]!)).toBe('Höhe: 2.5000 Breitenverhältnis: 1.0000 Neigungswinkel: 0 Effekte: Rückwärts, Auf dem Kopf');
    expect(tr('zh-CN')(LOG[2]!)).toBe('高度：2.5000 宽度比例：1.0000 倾斜角度：0 效果：普通');
  });

  it('고친 번역은 같은 사전의 낱말이다 — 기준점 base point·基点, 분해 explode, 동작 behavior, 속성 Attribut, 결합 binden, 문자 묶음 낱말, 새 통째 = 앞 조각 + 옵션 + 뒤 조각', () => {
    const row = (k: string) => LANGS.map((l) => dict[l][k]);
    const [en, de, ja, zh] = [dict.en, dict.de, dict.ja, dict['zh-CN']];
    const WBLOCK = '블록·객체는 기준점이 새 도면의 원점이 됩니다. 쓰이지 않는 블록·도면층·선종류·스타일은 넣지 않습니다. 파일은 이 컴퓨터에서 만들어 내려받습니다.';
    // 영어 기준점은 Base point(Reference point가 아니다 — 같은 사전의 「기준점(B)」 Base point (B))
    for (const k of [
      '기준점',
      '기준점 X',
      '기준점 Y',
      '기준점 Z',
      '기준점 화면상에 지정',
      '기준점:',
      '기준점: 숫자를 입력하십시오.',
      '기준점 지정:',
      '기준점 지정 <0,0,0>:',
      '삽입 기준점 지정 또는 [주석(A)]:',
      '새 블록의 삽입 기준점 지정:',
      WBLOCK,
      '축척에 대한 기준점 옵션 입력 [',
    ]) {
      expect(en[k], k).toMatch(/base point/i);
      expect(en[k], k).not.toMatch(/reference point/i);
    }
    expect([en['기준점 X'], en['기준점 Y'], en['기준점 Z']]).toEqual(['Base point X', 'Base point Y', 'Base point Z']);
    expect(en['삽입 기준점 지정 또는 [주석(A)]:']).toBe('Specify insertion base point or [Annotative (A)]:');
    // 중국어 기준점은 基点(参考点이 아니다)
    for (const k of ['기준점 화면상에 지정', '기준점:', '기준점: 숫자를 입력하십시오.', '기준점 지정:', WBLOCK, '{0}객체 {1}개{2} · 기준점 {3}, {4}']) {
      expect(zh[k], k).toContain('基点');
      expect(zh[k], k).not.toContain('参考点');
    }
    // 영어 분해는 explode(Disintegration·Decomposition·disassembled가 아니다)
    for (const k of ['분해 허용', '분해 허용(P)', '분해할 수 없는 블록입니다.', '분해할 수 있는 블록이 없습니다.', '분해 (X)']) {
      expect(en[k], k).toMatch(/explod/i);
      expect(en[k], k).not.toMatch(/disassembl|decompos|disintegr/i);
    }
    // BLOCK 대화 상자 「동작」 묶음(Behavior — 「Windows 표준 동작」 behavior·行为·Verhalten)
    expect(row('동작')).toEqual(['Behavior', 'Verhalten', '動作', '行为']);
    // 속성(attribute) — 특성(property·Eigenschaft)이 아니다
    for (const k of [
      '{0}개의 속성이 선택됨.',
      '고른 객체 중에 속성이 있는 블록이 없습니다.',
      '분해(속성 값 유지)',
      '블록 "{0}"을(를) 다시 정의했습니다(객체 {1}개). 참조 {2}개의 속성을 새 정의에 맞췄습니다.',
      '속성 {0}개를 바꿨습니다.',
      '속성 가져오기(탭 구분 파일)',
      '속성 값 입력',
      '속성 값 확인',
      '속성 내보내기(탭 구분 파일)',
      '속성 추출(명령행)',
      '속성을 유지하며 블록 재정의',
      '속성 {0}',
      '속성 정의 편집',
      '속성 정의...',
    ]) {
      expect(de[k], k).toContain('Attribut');
      expect(de[k], k).not.toMatch(/Eigenschaft/);
    }
    for (const k of ['속성 {0}', '속성 정의 편집', '속성 정의...']) {
      expect(en[k], k).toMatch(/attribute/i);
      expect(en[k], k).not.toMatch(/propert/i);
    }
    // 독일어 결합(bind)은 binden(kombinieren이 아니다 — 「결합됨: {0}.」 Gebunden)
    const XREF = '옵션 입력 [?/결합(B)/분리(D)/경로(P)/언로드(U)/다시 로드(R)/중첩(O)/부착(A)] <부착>:';
    for (const k of ['결합(B)', XREF, '외부 참조 기호 결합', '외부 참조 기호 결합(명령행)']) {
      expect(de[k], k).toMatch(/bind/i);
      expect(de[k], k).not.toMatch(/kombinier/i);
    }
    // 중국어: ATTREDEF 참조 수, PDF 쪽(page — 侧面이 아니다)·부착, -XREF 결합(绑定 — 合并为对象이 아니다)
    expect(zh['블록 "{0}"을(를) 다시 정의했습니다(객체 {1}개). 참조 {2}개의 속성을 새 정의에 맞췄습니다.']).toBe('已重新定义块“{0}”（{1} 个对象）。已将 {2} 个参照的属性与新定义同步。');
    expect(zh['PDF 언더레이 {0}({1}쪽)을(를) 부착했습니다.']).toBe('已附加 PDF 底图 {0}（第 {1} 页）。');
    expect(zh['외부 참조 "{0}"을(를) 결합했습니다(객체 {1}개{2}{3}).']).toBe('已绑定外部参照“{0}”（{1} 个对象{2}{3}）。');
    // 문자 묶음: 기호·반대로(backwards)·보통(normal)·단일(single)·선 간격두기(line spacing)·축척 비율(scale factor)
    expect(row('기호')).toEqual(['Symbol', 'Symbol', '記号', '符号']);
    expect(row('반대로')).toEqual(['Backwards', 'Rückwärts', '反転', '反向']);
    expect([en['보통'], de['보통']]).toEqual(['Normal', 'Normal']);
    expect(row('단일')).toEqual(['Single', 'Einzeln', '単一', '单个']);
    expect(row('단일(S)')).toEqual(['Single (S)', 'Einzeln (S)', '単一(S)', '单个(S)']);
    expect([de['선 간격두기(L)'], zh['선 간격두기(L)']]).toEqual(['Zeilenabstand (L)', '行距(L)']);
    expect([en['축척 비율 지정 또는 [참조(R)]'], ja['축척 비율 지정 또는 [참조(R)]'], zh['축척 비율 지정 또는 [참조(R)]']]).toEqual([
      'Specify scale factor or [Reference (R)]',
      '尺度係数を指定、または [参照(R)]',
      '指定比例因子或 [参考(R)]',
    ]);
    // 반대로·거꾸로 물음은 서로 다른 글(일본어·중국어가 같은 글이던 것)
    expect([ja['문자를 반대로 표시하시겠습니까?'], ja['문자를 거꾸로 표시하시겠습니까?']]).toEqual(['文字を反転表示しますか？', '文字を逆さまに表示しますか？']);
    expect([zh['문자를 반대로 표시하시겠습니까?'], zh['문자를 거꾸로 표시하시겠습니까?']]).toEqual(['是否要反向显示文本？', '是否要将文本倒置显示？']);
    expect([de['대소문자 일치'], de['새 문자 스타일'], de['자간'], de['자간(0.75~4)']]).toEqual(['Groß-/Kleinschreibung beachten', 'Neuer Textstil', 'Kerning', 'Kerning (0,75–4)']);
    expect([en['눌러서 이동'], de['눌러서 이동'], en['명령 복구 ({0}Y)'], en['단일 행']]).toEqual(['Click to go to it', 'Klicken, um dorthin zu wechseln', 'Redo ({0}Y)', 'Single line']);
    expect([zh['중간 중심'], zh['중간 중심 MC'], zh['새 스타일.'], zh['대치할 문자'], zh['사용 중인 스타일']]).toEqual(['正中', '正中 MC', '新样式。', '替换为', '正在使用的样式']);
    for (const k of ['기울기 각도', '기울기 각도 지정 <{0}>:', '기울기 각도(−85~85)', '기울기 각도는 −85에서 85 사이여야 합니다.']) expect(zh[k], k).toMatch(/倾斜角度/);
    expect([ja['간격두기 비율'], ja['간격두기 비율은 0.25에서 4 사이여야 합니다.']]).toEqual(['間隔の倍率', '間隔の倍率は0.25から4の間でなければなりません。']);
    // 새 열쇠: 자리맞추기 옵션은 그 낱말의 번역 + (글자), 옵션 통째 = 앞 조각 + 옵션 번역 + 뒤 조각, -STYLE 높이·물음 통째 = 앞 조각 + 옵션(·예/아니오)
    for (const l of LANGS) {
      const d = dict[l];
      const colon = l === 'zh-CN' ? '：' : ':';
      for (const [k, label] of [...TEXT_J.slice(6), ['M', '중간'] as const, ['E', '기존'] as const]) expect(squash(d[`${label}(${k})`]), `${l}: ${label}`).toBe(squash(`${d[label]}(${k})`));
      const opts = (s: string) => s.split('/').map((o) => d[o]!).join('/');
      for (const [front, list, tail] of [
        ['옵션 입력 [', TJ, ']'],
        ['자리맞추기 입력 [', MJ, '] <{0}>'],
        ['축척에 대한 기준점 옵션 입력 [', SJ, '] <{0}>'],
        ['자리맞추기 옵션 입력 [', JJ, '] <{0}>'],
      ] as const) {
        const k = `${front}${list}${tail}:`;
        expect(squash(d[k]), `${l}: ${k}`).toBe(squash(`${d[front]}${opts(list)}${tail}`) + colon);
      }
      for (const h of HEIGHT) expect(squash(d[`${h} 또는 [주석(A)] <{0}>:`]), `${l}: ${h}`).toBe(squash(`${d[`${h} 또는 [`]}${d['주석(A)']}] <{0}>`) + colon);
      for (const [q] of QS) {
        expect(squash(d[`${q} [`]), `${l}: ${q}`).toBe(`${squash(d[q])}[`);
        expect(squash(d[`${q} [예(Y)/아니오(N)] <{0}>:`]), `${l}: ${q}`).toBe(squash(`${d[`${q} [`]}${d['예(Y)']}/${d['아니오(N)']}] <{0}>`) + colon);
      }
      for (const a of ['예', '아니오']) expect(d[`현재 문자 스타일: "{0}" 문자 높이: {1} 주석: ${a}`], `${l}: ${a}`).toBeTruthy();
      for (const g of GEN) expect(d[`높이: {0} 폭 비율: {1} 기울기 각도: {2} 생성: ${g}`], `${l}: ${g}`).toBeTruthy();
    }
  });
});
