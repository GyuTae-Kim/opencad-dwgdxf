/**
 * 296차: 제도 설정·객체 스냅·격자·스냅·극좌표·동적 입력 묶음(GRID·SNAP·DSETTINGS·OSNAP·-OSNAP·객체 스냅 재지정·상태 막대 제도 단추와 메뉴·
 * 극좌표·객체 스냅 추적 툴팁·OPTIONS 제도 탭·ISODRAFT·ISOPLANE·등각원)의 번역과 295차가 한도 밖으로 남긴 오역.
 * - 빠진 번역: 상태 막대 객체 스냅 메뉴의 켠 항목 「✓ 끝점」 등과 등각평면 메뉴(옛 틀 「{0}등각평면 {1}」이 평면 이름을 잡음 — ISODRAFT 명령행
 *   뒤 조각 「] <등각평면 왼쪽>:」도 그 틀에 걸렸다), 객체 스냅 추적 툴팁 「끝점: 12 < 45°」, SNAP 통째 줄의 「종횡비(A)/」, -OSNAP 「<없음>」,
 *   OPTIONS 검사 글의 칸 이름은 틀이 앱 낱말을 잡아 옮기지 않았다.
 * - 오역: 영어 「⋯」 단추 이름 끝의 Select·등각 제도 Conformal system·Interval·Crosshair·Inversion curve·to load·소문자 endpoint·node,
 *   일본어 교차점 交差点·<간격띄우기> ギャップオフ·조준창 ピックボックス, 중국어 간격 偏移量·등각 图标·虚拟交集·四分之一点·等距·行类型·连续·어순,
 *   독일어 속성 Eigenschaft·Immobilienverwaltung·색상표 Farbpalette·Farbtabelle·Farbkarte·Color Table·객체 위로 Up-Objekt·ans Ende —
 *   같은 사전 안의 맞는 번역으로. 프롬프트·메뉴·툴팁 꼴은 소스에서 확인한다.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installLocalization } from '../src/app/i18n';
import { guardedTranslate, installFileGuard, translateTail } from '../src/app/fileguard';
import { CommandLine } from '../src/app/commandline';
import { createNewDocument } from '../src/core/newdoc';
import { ALL_SNAPS, SNAP_NAMES } from '../src/app/snap';
import { translate } from '../site/i18n.mjs';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

const LANGS = ['en', 'de', 'ja', 'zh-CN'] as const;
type Lang = (typeof LANGS)[number];
const HANGUL = /[가-힣]/;
const load = (lang: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../site/locales/${lang}.json`, import.meta.url), 'utf8'));
const dict = Object.fromEntries(LANGS.map((l) => [l, load(l)])) as Record<Lang, Record<string, string>>;
const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const squash = (s: string | undefined) => (s ?? '').replace(/\s/g, '');

const GRID = '격자 간격두기(X) 지정 또는 [켜기(ON)/끄기(OFF)/스냅(S)/주(M)/종횡비(A)] <10.0000>:';
const SNAP = '스냅 간격두기 지정 또는 [켜기(ON)/끄기(OFF)/종횡비(A)/스타일(S)/유형(T)] <10.0000>:';
const SNAP_ISO = '스냅 간격두기 지정 또는 [켜기(ON)/끄기(OFF)/스타일(S)/유형(T)] <10.0000>:';
const STYLE = '스냅 그리드 스타일 입력 [표준(S)/등각투영(I)] <S>:';
const DS = '설정할 항목 [스냅 및 그리드(S)/극좌표 추적(P)/객체 스냅(O)] <스냅 및 그리드>:';
const OSNAP = '객체 스냅 모드 리스트 입력 <없음>:';
const FROM = '<간격띄우기>:';
const ISODRAFT = '옵션 입력 [직교(O)/등각평면 왼쪽(L)/등각평면 위(T)/등각평면 오른쪽(R)] <등각평면 왼쪽>:';
const ISOPLANE = '등각평면 설정 입력 [왼쪽(L)/위(T)/오른쪽(R)] <위>:';
const ISOCIRCLE = '등각원의 반지름 지정 또는 [지름(D)]:';
const PROMPTS = [GRID, SNAP, SNAP_ISO, STYLE, DS, OSNAP, FROM, ISODRAFT, ISOPLANE, ISOCIRCLE];

/** 상태 막대 메뉴(shell.ts — 켠 항목은 「✓ 」, 아니면 객체 스냅은 전각 빈칸(U+2003)·등각평면은 빈칸 하나를 앞에 붙인다) */
const PLANES = ['왼쪽', '위', '오른쪽'];
const MENU = [
  ...ALL_SNAPS.flatMap((k) => [`✓ ${SNAP_NAMES[k]}`, ` ${SNAP_NAMES[k]}`]),
  ...PLANES.flatMap((n) => [`✓ 등각평면 ${n}`, ` 등각평면 ${n}`]),
  '✓ 직교(끄기)',
  ' 직교(끄기)',
];
/** 객체 스냅 추적 툴팁(tracking.ts — 획득점 이름: 길이 < 각도) */
const TIPS = [...ALL_SNAPS.map((k) => `${SNAP_NAMES[k]}: 12.5000 < 45°`), '임시 추적점: 3.0000 < 90°'];
/** OPTIONS 제도 탭 검사(options.ts intIn) */
const CHECKS = ['AutoSnap 표식기 크기: 1과(와) 20 사이의 정수가 필요합니다.', '조준창 크기: 1과(와) 50 사이의 정수가 필요합니다.'];

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.unstubAllGlobals();
});

describe('제도 설정·객체 스냅·격자·스냅·극좌표·동적 입력 묶음의 번역과 295차 한도 밖 오역(296차)', () => {
  it('명령행 입력 줄(앞 글 「… [」·옵션·뒤 글 「] <…>:」)이 네 언어 모두 한국어 없이 보이고, 고친 조각 낱말이 보인다', async () => {
    for (const [f, s] of [
      ['app/drafting.ts', 'const r = await ctx.getPoint(`격자 간격두기(X) 지정 또는 [켜기(ON)/끄기(OFF)/스냅(S)/주(M)/종횡비(A)] <${cur}>:`, {'],
      ['app/drafting.ts', "const r = await ctx.getPoint(`스냅 간격두기 지정 또는 [켜기(ON)/끄기(OFF)/${iso ? '' : '종횡비(A)/'}스타일(S)/유형(T)] <${iso ? formatLength(st.snap.y, st.units) : cur}>:`, {"],
      ['app/drafting.ts', "const s = await ctx.getPoint(`스냅 그리드 스타일 입력 [표준(S)/등각투영(I)] <${iso ? 'I' : 'S'}>:`, {"],
      ['app/drafting.ts', `: await ctx.getPoint('${DS}', {`],
      ['app/drafting.ts', "const cur = ALL_SNAPS.filter((k) => app.snapModes.has(k)).map((k) => Object.keys(SNAP_ABBR).find((a) => SNAP_ABBR[a] === k)).join(',') || '없음';"],
      ['app/drafting.ts', 'const r = await ctx.getPoint(`객체 스냅 모드 리스트 입력 <${cur}>:`, { allowText: true });'],
      ['app/osnap-override.ts', `const p = await pointOf(io, '${FROM}', { base: b });`],
      ['app/viewtools-iso.ts', 'const r = await ctx.getPoint(`옵션 입력 [직교(O)/등각평면 왼쪽(L)/등각평면 위(T)/등각평면 오른쪽(R)] <${cur}>:`, {'],
      ['app/viewtools-iso.ts', 'const cur = s.style === 1 ? `등각평면 ${ISO_PLANE_NAMES[s.pair]}` : \'직교\';'],
      ['app/viewtools-iso.ts', 'const r = await ctx.getPoint(`등각평면 설정 입력 [왼쪽(L)/위(T)/오른쪽(R)] <${ISO_PLANE_NAMES[next]}>:`, { keywords: PLANE_KWS });'],
      ['app/viewtools-iso.ts', `const q = await ctx.getPoint(diameter ? '등각원의 지름 지정:' : '${ISOCIRCLE}', {`],
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
    // ISODRAFT 기본값은 옵션 이름의 번역(옛 틀 「{0}등각평면 {1}」이 「<Isoplane 왼쪽>」으로 남겼다), -OSNAP 기본값 「없음」
    expect(at('en', ISODRAFT)).toContain('<Isoplane Left>');
    expect(at('zh-CN', ISODRAFT)).toContain('<等轴测平面左侧>');
    expect(at('de', OSNAP)).toContain('<Keine>');
    // FROM 간격띄우기는 オフセット(gap off가 아니다), 등각원은 等轴测圆(아이콘 원이 아니다)
    expect(at('ja', FROM)).toContain('<オフセット>');
    expect(at('zh-CN', ISOCIRCLE)).toContain('指定等轴测圆的半径或 [');
  });

  it('상태 막대 객체 스냅·등각평면 메뉴, 객체 스냅 추적 툴팁, 통째 기록 줄, OPTIONS 검사 글이 네 언어 모두 한국어 없이 보인다', () => {
    for (const [f, s] of [
      ['app/ui/shell.ts', "label: `${app.snapModes.has(k) ? '✓ ' : ' '}${SNAP_NAMES[k]}`,"],
      ['app/ui/shell.ts', "label: `${cur.style === 1 && cur.pair === i ? '✓ ' : ' '}등각평면 ${name}`,"],
      ['app/ui/shell.ts', "...(['왼쪽', '위', '오른쪽'] as const).map((name, i) => ({"],
      ['app/tracking.ts', 'return { p: c.q, lines: [c.line], tip: `${c.label}: ${fmt(len)} < ${c.angle}` };'],
      ['app/app.ts', "this.tempTrack.points.push({ p: q.point, label: '임시 추적점' });"],
      ['app/options.ts', 'return Number.isInteger(v) && v >= lo && v <= hi ? v : `${label}: ${lo}과(와) ${hi} 사이의 정수가 필요합니다.`;'],
      ['app/options.ts', "markerSize: intIn(markerSize, 1, 20, 'AutoSnap 표식기 크기'),"],
      ['app/options.ts', "aperture: intIn(aperture, 1, 50, '조준창 크기'),"],
    ])
      expect(src(f!), s).toContain(s);
    // 메뉴 글은 번역층이 글 마디를 통째로, 커서 옆 툴팁은 uiTextGuarded(통째 + 꼬리), 기록 줄은 translateTail
    // (기본값 꼬리가 있는 프롬프트는 친 입력이 붙은 꼴도 — FROM 「<간격띄우기>:」는 기본값이 아니라 프롬프트 자체라 292차 꼴로 보지 않는다)
    const tr = (l: string) => (x: string) => guardedTranslate(x, l) ?? translate(x, l);
    const show = (s: string, l: string) => translateTail(s, tr(l)(s), tr(l));
    const left: string[] = [];
    for (const l of LANGS) {
      for (const s of [...MENU, ...CHECKS]) if (HANGUL.test(tr(l)(s))) left.push(`${l}: ${tr(l)(s)}`);
      for (const s of [...TIPS, ...PROMPTS.flatMap((p) => (p.endsWith('>:') && p !== FROM ? [p, `${p} A`] : [p]))]) if (HANGUL.test(show(s, l))) left.push(`${l}: ${show(s, l)}`);
    }
    expect(left).toEqual([]);
    expect(tr('en')('✓ 끝점')).toBe('✓ Endpoint');
    expect(tr('ja')('✓ 교차점')).toBe('✓ 交点');
    expect(tr('zh-CN')(' 등각평면 위')).toBe('等轴测平面顶部');
    expect(tr('de')('✓ 등각평면 오른쪽')).toBe('✓ Isometrische Ebene rechts');
    expect(show('끝점: 12.5000 < 45°', 'en')).toBe('Endpoint: 12.5000 < 45°');
    expect(show('임시 추적점: 3.0000 < 90°', 'zh-CN')).toBe('临时追踪点：3.0000 < 90°');
    expect(show(`${SNAP} A`, 'en')).toBe('Specify snap spacing or [On(ON)/Off(OFF)/Aspect Ratio (A)/Style(S)/Type(T)] <10.0000>: A');
    expect(show(OSNAP, 'en')).toBe('Enter object snap mode list <None>:');
    expect(show(`${ISODRAFT.replace('<등각평면 왼쪽>', '<등각평면 위>')} L`, 'zh-CN')).toBe('输入选项 [正交(O)/等轴测平面左侧(L)/等轴测平面顶部(T)/等轴测平面右侧(R)] <等轴测平面顶部>: L');
    expect(tr('ja')(CHECKS[1]!)).toBe('照準ウィンドウサイズ: 1 と 50 の間の整数が必要です。');
  });

  it('고친 번역은 같은 사전의 낱말이다 — 출발점(영어 경계·간격·십자·반전, 중국어 线型·Continuous·어순, 독일어 Attribut·Farbbuch·DRAWORDER)과 묶음, 새 열쇠는 이름·조각의 번역', () => {
    const [en, de, ja, zh] = [dict.en, dict.de, dict.ja, dict['zh-CN']];
    // 영어 출발점: 경계(명령행) Boundary, 간격(사용자 정의) Spacing, 십자 표시(CROSS 무늬)는 커서 십자선 Crosshair가 아니다, 반전 곡선 = 반전 원통 꼴
    expect([en['경계(명령행)'], en['간격(사용자 정의)'], en['반전 곡선']]).toEqual(['Boundary (command line)', 'Spacing (user defined)', 'Inverted curve']);
    expect(en['십자 표시']).not.toMatch(/crosshair/i);
    expect(en['반전 원통']).toMatch(/^Inverted /);
    expect(en['로드된 선종류 이름 입력 또는 [']).toBe('Enter the name of the loaded linetype, or [');
    // 영어 묶음: 「⋯」 단추 이름, 등각 제도(Conformal이 아니다), 간격 spacing, 스냅 이름 대문자
    expect(en['상태 막대의 나머지 항목']).toBe('Remaining status bar items');
    const drafting = en['등각투영 제도 (ISODRAFT) · 오른쪽 클릭으로 평면 선택, F5로 평면 전환']!.split(' (')[0]!;
    expect([en['등각 제도'], en['등각투영 제도'], en['<등각투영 제도 끄기>']]).toEqual([drafting, drafting, `<${drafting} off>`]);
    expect(en['간격은 0보다 커야 합니다.']).toMatch(/spacing/);
    expect([en['끝점'], en['노드']]).toEqual([en['객체 스냅: 끝점']!.replace('Object snap: ', ''), 'Node']);
    // 일본어: 교차점 交点(交差点이 아니다), <간격띄우기> オフセット, 조준창 = 「객체 스냅 조준창 크기(픽셀)」의 照準ウィンドウ(ピックボックス가 아니다)
    expect([ja['교차점'], ja['가상 교차점']]).toEqual([ja['객체 스냅: 교차점']!.split(': ')[1], '仮想交点']);
    expect(ja['<간격띄우기>:']).toBe(`<${ja['간격띄우기']}>：`);
    for (const k of ['조준창 크기', '조준창 크기(Z)']) {
      expect(ja[k], k).toContain('照準ウィンドウ');
      expect(ja[k], k).not.toContain('ピックボックス');
    }
    expect(ja['<등각투영 제도 끄기>']).toBe(`<${ja['등각투영 제도']} オフ>`);
    // 중국어 출발점: 선종류 线型, 선종류 이름 Continuous는 옮기지 않는다, 결과 줄 어순
    for (const k of ['선종류 {0}을(를) 찾을 수 없습니다. 먼저 로드하십시오.', '선종류 {0}의 이름은 바꿀 수 없습니다.', '선종류 문자열 영역이 넘쳐 일부 글자를 뺐습니다.', '설명: {0} 요소 {1}개(간격띄우기·색상·선종류): {2} 채우기: {3} 조인 표시: {4}']) {
      expect(zh[k], k).toContain('线型');
      expect(zh[k], k).not.toMatch(/行类型|线条类型/);
    }
    for (const k of ['로드된 선종류 이름 입력 <Continuous>:', '로드된 선종류 이름 입력 또는 [?] <Continuous>:', '로드된 선종류: Continuous', '선종류를 찾을 수 없어 Continuous로 두었습니다: {0}']) {
      expect(zh[k], k).toContain('Continuous');
      expect(zh[k], k).not.toContain('连续');
    }
    expect([zh['경계 {0}개를 제거했습니다.'], zh['해치가 아닌 객체 {0}개는 뺐습니다.']]).toEqual(['已移除 {0} 个边界。', '已移除 {0} 个非图案填充对象。']);
    // 중국어 묶음: 간격 间距(偏移量이 아니다), 등각 等轴测(图标이 아니다), 교차점 交点·사분점 象限点, ISODRAFT 통째 = 조각
    for (const k of ['간격은 0보다 커야 합니다.', '수직 간격두기 지정 <{0}>:', '수직 간격두기(Y) 지정 <{0}>:']) {
      expect(zh[k], k).toContain('间距');
      expect(zh[k], k).not.toContain('偏移量');
    }
    for (const k of ['등각 제도', '<등각투영 제도 끄기>', '등각원', '등각원의 중심 지정:', '등각원의 반지름 지정 또는 [지름(D)]:']) {
      expect(zh[k], k).toContain('等轴测');
      expect(zh[k], k).not.toContain('图标');
    }
    expect([zh['가상 교차점'], zh['사분점']]).toEqual([`虚拟${zh['교차점']}`, zh['사분점(Q)']!.replace('(Q)', '')]);
    expect(squash(zh['등각원의 반지름 지정 또는 [지름(D)]:'])).toBe(squash(`${zh['등각원의 반지름 지정 또는 [']}${zh['지름(D)']}]：`));
    for (const k of ['등각평면 왼쪽(L)', '등각평면 위(T)', '등각평면 오른쪽(R)']) expect(zh['옵션 입력 [직교(O)/등각평면 왼쪽(L)/등각평면 위(T)/등각평면 오른쪽(R)] <{0}>:'], k).toContain(zh[k]);
    // 독일어 출발점: 속성(attribute)은 Attribut(특성 Eigenschaft·부동산 Immobilien·분해 zersetzen이 아니다)
    for (const k of [
      'INSERT의 속성 값 입력을 대화상자로',
      '그 자리에 고칠 수 있는 속성이 없습니다.',
      '문자·여러 줄 문자·속성·치수·다중 지시선을 고르지 않았습니다.',
      '분해(속성 유지)',
      '블록만 표시(이름·속성)',
      '블록을 넣을 때 속성 값 묻기',
      '서식(글꼴·색·높이·스택·필드)은 그대로 두고 글자만 바꿉니다. 블록 참조를 고르면 그 속성을 바꿉니다.',
      '속성 관리',
      '속성 남기고 분해',
      '속성 정의 {0}개는 작업 세트에 넣지 않았습니다(설정 탭의 "편집을 위한 속성 정의 표시"로 넣을 수 있습니다).',
      '속성 정의를 바꿨습니다. 기존 블록 참조의 속성은 그대로이니 ATTSYNC로 맞추십시오.',
      '속성 표시(0 끄기, 1 보통, 2 모두)',
      '여러 줄 속성입니다. 줄바꿈은 그대로 여러 줄 문자 줄바꿈이 됩니다.',
      '작업 세트로 가져올 객체가 없습니다(속성 정의만 있는 블록은 설정 탭의 "편집을 위한 속성 정의 표시"를 켜십시오).',
    ]) {
      expect(de[k], k).toMatch(/Attribut/);
      expect(de[k], k).not.toMatch(/Eigenschaft|Immobilien|Zersetz/);
    }
    // 독일어 색상표(color book)는 Farbbuch(「색상표(색상 책)」 — ACI 색표 「참고: 현재 색상은 …」은 그대로)
    for (const [k, v] of Object.entries(de))
      if ((k.includes('색상표(CO)') || k === '색상표' || k.startsWith('색상표 색은') || k.startsWith('색상표(색상 책)')) && !k.startsWith('참고')) {
        expect(v, k).toMatch(/Farbbuch/);
        expect(v, k).not.toMatch(/Farbpalette|Farbtabelle|Farbkarte|Color Table/);
      }
    // 독일어 그리기 순서: 객체 위로·아래로 = 조각 「객체 위로(A)」·「객체 아래로(U)」의 낱말, 해치 맨 뒤로 결과 = 「해치 맨 뒤로」의 in den Hintergrund
    expect([de['객체 위로'], de['객체 아래로']]).toEqual([de['객체 위로(A)']!.replace(' (A)', ''), de['객체 아래로(U)']!.replace(' (U)', '')]);
    expect(de['해치 {0}개를 맨 뒤로 옮겼습니다.']).toContain('in den Hintergrund');
    // 새 열쇠: 메뉴 켠 항목 = 「✓ 」 + 이름, 툴팁 = 이름 + 「: 」, 등각평면 메뉴 = 옵션 조각에서 고를 글자를 뗀 것, 틀 통째 = 그 틀의 번역
    for (const l of LANGS) {
      const d = dict[l];
      const colon = l === 'zh-CN' ? '：' : ': ';
      for (const k of ALL_SNAPS) {
        const n = SNAP_NAMES[k]!;
        expect(d[`✓ ${n}`], `${l}: ${n}`).toBe(`✓ ${d[n]}`);
        expect(d[`${n}: {0} < {1}`], `${l}: ${n}`).toBe(`${d[n]}${colon}{0} < {1}`);
      }
      expect(d['임시 추적점: {0} < {1}'], l).toBe(`${d['임시 추적점']}${colon}{0} < {1}`);
      for (const [n, kk] of [['왼쪽', 'L'], ['위', 'T'], ['오른쪽', 'R']] as const)
        expect(d[`{0}등각평면 ${n}`], `${l}: ${n}`).toBe(`{0}${d[`등각평면 ${n}(${kk})`]!.replace(/\s*[(（][A-Z][)）]$/, '')}`);
      expect(d['{0}등각평면 {1}'], l).toBeUndefined();
      expect(d['스냅 간격두기 지정 또는 [켜기(ON)/끄기(OFF)/종횡비(A)/스타일(S)/유형(T)] <{0}>:'], l).toBe(
        d['스냅 간격두기 지정 또는 [켜기(ON)/끄기(OFF)/{0}스타일(S)/유형(T)] <{1}>:']!.replace('{0}', d['종횡비(A)/']!).replace('{1}', '{0}'),
      );
      expect(d[OSNAP], l).toBe(d['객체 스냅 모드 리스트 입력 <{0}>:']!.replace('{0}', d['없음']!));
      for (const n of ['AutoSnap 표식기 크기', '조준창 크기'])
        expect(d[`${n}: {0}과(와) {1} 사이의 정수가 필요합니다.`], `${l}: ${n}`).toBe(
          d['{0}: {1}과(와) {2} 사이의 정수가 필요합니다.']!.replace('{0}', d[n]!).replace('{1}', '{0}').replace('{2}', '{1}'),
        );
    }
  });
});
