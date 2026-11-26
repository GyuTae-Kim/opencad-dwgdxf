/**
 * 301차: 배치·출력 묶음(LAYOUT·LAYOUTWIZARD·MVSETUP·PAGESETUP·PLOT·-PLOT·PSETUPIN·MVIEW·VPORTS·VPLAYER·VPCLIP·CHSPACE·PLOTSTAMP)의 번역과 300차가 남긴 것.
 * - 빠진 번역: -PLOT 예/아니오 물음의 앞 조각(askYN), MVSETUP 「] <작성>:」·-PLOT 플롯 스타일 테이블 뒤 조각·VPLAYER 「현재 제외(X)」·-PLOT 배치 이름 <모형>·플롯 축척 앞 조각(틀이 밀리미터·인치를 잡았다),
 *   페이지 설정 관리자(「*모형*」·현재 배치·적용·바꿈·저장 결과 줄 — 틀이 「모형」·「배치 "…"」를 잡았다), LAYOUTWIZARD 요약·결과 줄, MVIEW·CHSPACE·VPLAYER·PSETUPIN·PLOTSTAMP 결과 줄,
 *   300차가 한도 밖으로 남긴 표 스타일 편집기 오류 열둘(틀이 제목·머리글·데이터를 잡았다).
 * - 오역: 매수 Buy·ノット数·采购·Kaufen, 넷 Net·网络·Netz, 셋 セット·设置, 플롯 Handlungsstruktur·Grundstücksmitte·平面图·剧情, 용지 论文·Dokument, 한계 Limitations·制限·局限,
 *   도면 방향 가로(N)·세로(A)·-PLOT 세로(P) Horizontal·Vertical·水平·垂直, 300차 출발점 중국어 통째 기록 줄(前导符·引线连接器·多行引线·换行符)과 독일어 296·294차 나머지(Echte Farbe·Aktuelle Verwendung·Rückseite·Assoziieren)를
 *   같은 사전 안의 맞는 번역으로. 프롬프트·결과 줄 꼴은 소스에서 확인한다.
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
const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const strip = (s: string | undefined) => (s ?? '').replace(/\s*[(（][A-Z]+[)）]$/, '');

/** -PLOT 예/아니오 물음(dashcmds-plot.ts askYN — `${물음} [예(Y)/아니오(N)] <…>:`) */
const YN_Q = ['상세한 플롯 구성을 원하십니까?', '위 아래를 뒤집어 플롯?', '플롯 스타일로 플롯?', '선가중치로 플롯?', '선가중치를 플롯 축척에 적용?', '도면 공간을 먼저 플롯?', '도면 공간 객체 숨기기?', '페이지 설정에 대한 변경 사항 저장', '플롯을 진행합니까?'];
const YN = YN_Q.map((q) => `${q} [예(Y)/아니오(N)] <아니오>:`);
const FIT = '맞춤\u{2060}\u{2060}';
const MVS_OPT = '옵션 입력 [객체 삭제(D)/뷰포트 작성(C)/명령 취소(U)] <작성>:';
const PSTYLE = `플롯 스타일 테이블 이름 또는 [?] 입력 (없는 경우 . 입력) <${ft('acad.ctb')}>:`;
const VPSEL = '뷰포트 지정 [전체(A)/선택(S)/현재(C)/현재 제외(X)] <현재>:';
const PSCALE = [`플롯 축척 입력 (출력 밀리미터=도면 단위)또는 [${FIT}(F)] <${FIT}>:`, `플롯 축척 입력 (출력 인치=도면 단위)또는 [${FIT}(F)] <1=1>:`];
const LAYNAME = '배치 이름 또는 [?] 입력 <모형>:';
const PORI = '용지 방향 입력 [세로(P)/가로(L)] <가로>:';
const PAREA = '플롯 영역 입력 [화면표시(D)/범위(E)/한계(L)/뷰(V)/윈도우(W)] <범위>:';
const MVS_LIM = '옵션 입력 [도면층(L)/한계(LI)/단위(U)/외부 참조(X)] <종료>:';
const MVS_MAIN = '옵션 입력 [정렬(A)/작성(C)/뷰포트 축척(S)/옵션(O)/제목 블록(T)/명령 취소(U)]:';
const MVS_PS = '도면 공간을 사용하시겠습니까? [아니오(N)/예(Y)] <예>:';
const VPCFG = '구성 입력 [수평(H)/수직(V)] <수직>:';
const VPLAYER = '옵션 입력 [?/동결(F)/동결 해제(T)/재설정(R)/새 동결(N)/뷰포트 기본 가시성(V)]:';
const VPCLIP = '자르기 객체 선택 또는 [폴리곤(P)/삭제(D)] <폴리곤>:';
// 300차 출발점(독일어 296·294차 나머지): 색 고르기 트루컬러·해치 색 현재 사용·-HATCH 고급 연관·UNDO 뒤
const CHCOLOR = '새 색상 [트루컬러(T)/색상표(CO)] <BYLAYER>:';
const HCOLOR = '해치 색상 입력 또는 [트루 컬러(T)/색상표(CO)] <현재 사용>:';
const HADV = '옵션 입력 [경계 세트(B)/유지(R)/섬 검출(I)/스타일(S)/연관(A)/틈 허용 공차(G)/개별 해치 작성(H)] <종료>:';
const UNDO = '명령 취소할 작업의 수 또는 [자동(A)/조정(C)/시작(BE)/끝(E)/표식(M)/뒤(B)] 입력 <1>:';
const PROMPTS = [...YN, MVS_OPT, PSTYLE, VPSEL, ...PSCALE, LAYNAME, PORI, PAREA, MVS_LIM, MVS_MAIN, MVS_PS, VPCFG, VPLAYER, VPCLIP, CHCOLOR, HCOLOR, HADV, UNDO];

/** 표 스타일 편집기 오류(tablecmds.ts — `${KIND_LABEL[k]} …`) */
const KINDS = ['제목', '머리글', '데이터'];
const KIND_T = ['{0} 문자 높이는 0보다 커야 합니다.', '{0} 문자 색상: ByBlock·ByLayer 또는 1~255', '{0} 채우기 색상: 비우면 없음, 또는 1~255', '{0} 테두리 색상: ByBlock·ByLayer 또는 1~255'];
const KIND_LINES = KIND_T.flatMap((t) => KINDS.map((k) => t.replace('{0}', k)));
const PAPER = 'ISO A3 (297 × 420 mm)';
const LINES = [
  '*모형*',
  `*모형 (${ft('S1')})*`,
  '현재 배치: 모형',
  '페이지 설정 - 모형',
  `페이지 설정 "${ft('S1')}"을(를) 모형에 적용했습니다.`,
  `페이지 설정 "${ft('S1')}"을(를) 배치 "${ft('Layout1')}"에 적용했습니다.`,
  '모형의 페이지 설정을 바꿨습니다.',
  `배치 "${ft('Layout1')}"의 페이지 설정을 바꿨습니다.`,
  '지금 설정을 모형의 페이지 설정으로 저장했습니다.',
  `지금 설정을 배치 "${ft('Layout1')}"의 페이지 설정으로 저장했습니다.`,
  ...['가로', '세로'].flatMap((o) => ['밀리미터', '인치'].map((u) => `용지: ${PAPER}, ${o}, ${u}`)),
  '제목 블록: 없음',
  ...['가로', '세로'].flatMap((o) => [`배치 "${ft('L2')}"을(를) 만들었습니다(${PAPER}, ${o}).`, `배치 "${ft('L2')}"을(를) 만들었습니다(${PAPER}, ${o}, ISO A3 제목 블록).`]),
  '뷰포트 4개를 만들었습니다(2D 도면이라 네 뷰포트 모두 평면 뷰).',
  '뷰포트 2: 동결된 도면층 없음',
  '3개 객체를 종이 공간으로 옮겼습니다.',
  '3개 객체를 모형 공간으로 옮겼습니다.',
  '뷰포트 2개를 켰습니다.',
  '뷰포트 2개를 껐습니다.',
  '페이지 설정 3개를 가져왔습니다(재정의 1개).',
  '미리보기: (필드 없음) — 스탬프는 화면에 그리지 않고 PLOT·PUBLISH의 PDF·SVG에만 넣습니다.',
  '플롯 스탬프를 켰습니다: (필드 없음)',
  '플롯 미리보기 (2쪽)',
  ...KIND_LINES,
];

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.unstubAllGlobals();
});

describe('배치·출력 묶음의 번역과 300차가 남긴 것(301차)', () => {
  it('명령행 입력 줄(앞 글 「… [」·옵션·뒤 글)이 네 언어 모두 한국어 없이 보이고, 고친 조각 낱말이 보인다', async () => {
    for (const [f, s] of [
      ['app/dashcmds-ask.ts', "const k = await askOption(ctx, `${prompt} [예(Y)/아니오(N)] <${def ? '예' : '아니오'}>:`, YES_NO, def ? 'Y' : 'N');"],
      ['app/dashcmds-plot.ts', "const detailed = await askYN(ctx, '상세한 플롯 구성을 원하십니까?', false);"],
      ['app/dashcmds-plot.ts', "const t = await askWord(ctx, `플롯 스타일 테이블 이름 또는 [?] 입력 (없는 경우 . 입력) <${ft(curTable)}>:`);"],
      ['app/dashcmds-plot.ts', "const t = await askWord(ctx, `플롯 축척 입력 (출력 ${inches ? '인치' : '밀리미터'}=도면 단위)또는 [${PLOT_FIT}(F)] <"],
      ['app/dashcmds-plot.ts', "const t = await askWord(ctx, `배치 이름 또는 [?] 입력 <${cur ? shownName(cur) : '모형'}>:`);"],
      ['app/dashcmds-plot.ts', "{ key: 'P', label: '세로' },"],
      ['app/filecmds-layout.ts', `const c = await ctx.getPoint('${MVS_OPT}', {`],
      ['app/filecmds-layout.ts', `const r = await ctx.getPoint('${MVS_LIM}', {`],
      ['app/filecmds-layout.ts', `const r = await ctx.getPoint('${MVS_MAIN}', { keywords: MAIN_KW });`],
      ['app/filecmds-layout.ts', `const r = await ctx.getPoint('${MVS_PS}', {`],
      ['app/vpcmds.ts', "const r = await ctx.getPoint(`뷰포트 지정 [전체(A)/선택(S)/현재(C)${withExcept ? '/현재 제외(X)' : ''}] <현재>:`, {"],
      ['app/vpcmds.ts', `const r = await ctx.getPoint('${VPLAYER}', {`],
      ['app/vpcmds.ts', "{ key: 'N', label: '새 동결' },"],
      ['app/vpcmds.ts', "const r = await ctx.getPoint(`자르기 객체 선택 또는 [폴리곤(P)${vp.clipBoundary ? '/삭제(D)' : ''}] <폴리곤>:`, {"],
      ['app/vports.ts', `await ctx.getPoint('${VPCFG}', {`],
      ['app/propcmds.ts', `const t = await ask('${CHCOLOR}');`],
      ['app/dashcmds-hatch.ts', `return askColor(ctx, '${HCOLOR}', k ?? t);`],
      ['app/dashcmds-hatch.ts', `'${HADV}',`],
      ['app/undocmd.ts', `const r = await ctx.getPoint('${UNDO}', {`],
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
    // -PLOT 예/아니오 물음: 앞 조각 = 물음 번역 + 「 [」, 옵션은 예(Y)·아니오(N) 조각
    for (const l of LANGS) {
      const d = dict[l];
      for (const [i, q] of YN_Q.entries()) expect(at(l, YN[i]!), `${l}: ${q}`).toContain(`${d[q]} [${d['예(Y)']}/${d['아니오(N)']}]`);
    }
    expect(at('de', YN[0]!)).toContain('Möchten Sie eine detaillierte Plotkonfiguration? [Ja (Y)/Nein (N)]');
    expect(at('zh-CN', YN[0]!)).toContain('是否需要详细的打印配置？ [');
    // MVSETUP 기본값 <작성>(옵션 이름이 아니라 뒤 조각), -PLOT 플롯 스타일 테이블 뒤 조각, 배치 이름 <모형>, 플롯 축척(밀리미터·인치 — 틀이 잡던 단위)
    expect(at('en', MVS_OPT)).toContain('] <Create>:');
    expect(at('en', PSTYLE)).toBe('Enter plot style table name or [?] (enter . for none) <acad.ctb>:');
    expect(at('en', LAYNAME)).toBe('Enter layout name or [?] <Model>:');
    expect(at('de', LAYNAME)).toContain('<Modell>:');
    expect(at('en', PSCALE[0]!)).toContain('Enter plot scale (output millimeters=drawing units) or [Fit (F)]');
    expect(at('ja', PSCALE[1]!)).toContain('(出力 インチ=図面単位)、または [');
    // VPLAYER 현재 제외(X), 새 동결(N) Neu einfrieren(Neue Fixierung 고정이 아니다)
    expect(at('en', VPSEL)).toContain('/Except current(X)]');
    expect(at('de', VPLAYER)).toContain('/Neu einfrieren (N)/');
    // 용지 방향 세로(P) Portrait·縦·纵向·Hochformat(Vertical·垂直 세로선이 아니다), 한계 Limits·図面範囲, VPORTS 구성 配置(构造 구조가 아니다), MVSETUP 뷰포트 축척 比例(缩放 줌이 아니다)
    expect(at('en', PORI)).toContain('[Portrait (P)/Landscape (L)]');
    expect(at('ja', PORI)).toContain('[縦(P)/横(L)]');
    expect(at('zh-CN', PORI)).toContain('[纵向(P)/横向(L)]');
    expect(at('de', PORI)).toContain('[Hochformat (P)/Querformat (L)]');
    expect(at('en', PAREA)).toContain('/Limits (L)/');
    expect(at('ja', PAREA)).toContain('/図面範囲(L)/');
    expect(at('en', MVS_LIM)).toContain('/Limits (LI)/');
    expect(at('ja', MVS_LIM)).toContain('/図面範囲(LI)/');
    expect(at('zh-CN', VPCFG)).toMatch(/^输入配置 \[/);
    expect(at('zh-CN', MVS_MAIN)).toContain('/视口比例 (S)/');
    expect(at('de', MVS_PS)).toMatch(/^Papierbereich verwenden\? \[/);
    // 300차 출발점 독일어: 트루컬러 True Color(Echtfarben이 아니다), 현재 사용 Aktuellen verwenden, 연관 Assoziativ, UNDO 뒤 Zurück(Rückseite 뒷면이 아니다)
    expect(at('de', CHCOLOR)).toContain('[True Color (T)/');
    expect(at('de', HCOLOR)).toContain('[True Color (T)/');
    expect(at('de', HCOLOR)).toContain('<Aktuellen verwenden>');
    expect(at('de', HADV)).toContain('/Assoziativ (A)/');
    expect(at('de', UNDO)).toContain('/Zurück (B)]');
  });

  it('결과·이름표 줄(페이지 설정 관리자·LAYOUTWIZARD·MVIEW·CHSPACE·PSETUPIN·PLOTSTAMP·표 스타일 오류)과 기록 줄이 네 언어 모두 한국어 없이 보인다', () => {
    for (const [f, s] of [
      ['app/pagesetup-ui.ts', "const label = model ? '모형' : layout.name;"],
      ['app/pagesetup-ui.ts', "h('div', { class: 'mgr-note' }, `현재 배치: ${model ? label : ft(label)}`),"],
      ['app/pagesetup-ui.ts', "`페이지 설정 \"${ft(row0.setup.name)}\"을(를) ${model ? '모형' : `배치 \"${ft(layout.name)}\"`}에 적용했습니다.`"],
      ['app/pagesetup-ui.ts', "`${model ? '모형' : `배치 \"${ft(layout.name)}\"`}의 페이지 설정을 바꿨습니다.`"],
      ['app/plot.ts', "ctx.print(`지금 설정을 ${model ? '모형' : `배치 \"${ft(layout.name)}\"`}의 페이지 설정으로 저장했습니다.`);"],
      ['app/filecmds-layout.ts', "h('li', {}, `용지: ${p?.label ?? s.paper}, ${s.landscape ? '가로' : '세로'}, ${s.inch ? '인치' : '밀리미터'}`),"],
      ['app/filecmds-layout.ts', "ctx.print(`배치 \"${ft(s.name)}\"을(를) 만들었습니다(${paperOf(s.paper)?.label ?? s.paper}, ${s.landscape ? '가로' : '세로'}${sheet ? `, ISO ${sheet.key} 제목 블록` : ''}).`);"],
      ['app/filecmds-layout.ts', "ctx.print(`뷰포트 ${rects.length}개를 만들었습니다${choice === 2 ? '(2D 도면이라 네 뷰포트 모두 평면 뷰)' : ''}.`);"],
      ['app/vpcmds.ts', "ctx.print(`${n}개 객체를 ${fromModel ? '종이 공간으로' : '모형 공간으로'} 옮겼습니다.`);"],
      ['app/vpcmds.ts', "ctx.print(`뷰포트 ${vps.length}개를 ${on ? '켰습니다' : '껐습니다'}.`);"],
      ['app/dashcmds-plot.ts', "ctx.print(`페이지 설정 ${r.added.length + r.replaced.length}개를 가져왔습니다${r.replaced.length ? `(재정의 ${r.replaced.length}개)` : ''}.`);"],
      ['app/tablecmds.ts', 'if (!(v > 0)) return `${KIND_LABEL[k]} 문자 높이는 0보다 커야 합니다.`;'],
      ['edit/table/style.ts', "export const KIND_LABEL: Record<CellKind, string> = { title: '제목', header: '머리글', data: '데이터' };"],
    ])
      expect(src(f!), s).toContain(s);
    const tr = (l: string) => (x: string) => guardedTranslate(x, l) ?? translate(x, l);
    const show = (s: string, l: string) => translateTail(s, tr(l)(s), tr(l));
    const RECORDS = [
      '옵션 지정 [지시선 추가(A)/지시선 제거(R)] <지시선 추가>: A',
      '옵션 입력 [분산(D)/지시선 세그먼트를 평행으로 지정(P)/간격두기 지정(S)/현재 간격두기 사용(U)] <현재 간격두기 사용>: U',
      '다중 지시선 배치 지정 또는 [수직(V)/수평(H)/줄바꿈(W)] <수평>: W',
      '옵션 입력 [지시선 유형(L)/지시선 연결선(A)/내용 유형(C)/최대 점 수(M)/첫 번째 각도(F)/두 번째 각도(S)/옵션 종료(X)] <옵션 종료>: A',
      `${LAYNAME} Layout1`,
      `${MVS_OPT} C`,
      '자르기 객체 선택 또는 [폴리곤(P)] <폴리곤>: P',
      `${MVS_PS} N`,
    ];
    const left: string[] = [];
    for (const l of LANGS) {
      for (const s of LINES) if (HANGUL.test(tr(l)(s))) left.push(`${l}: ${tr(l)(s)}`);
      for (const s of RECORDS) if (HANGUL.test(show(s, l))) left.push(`${l}: ${show(s, l)}`);
    }
    expect(left).toEqual([]);
    expect(tr('en')(`*모형 (${ft('S1')})*`)).toBe('*Model (S1)*');
    expect(tr('en')(`페이지 설정 "${ft('S1')}"을(를) 배치 "${ft('Layout1')}"에 적용했습니다.`)).toBe('Applied page setup "S1" to layout "Layout1".');
    expect(tr('zh-CN')('지금 설정을 모형의 페이지 설정으로 저장했습니다.')).toBe('当前设置已保存为模型的页面设置。');
    expect(tr('de')(`용지: ${PAPER}, 가로, 밀리미터`)).toBe(`Papier: ${PAPER}, Querformat, Millimeter`);
    expect(tr('ja')(`배치 "${ft('L2')}"을(를) 만들었습니다(${PAPER}, 세로, ISO A3 제목 블록).`)).toBe(`レイアウト「L2」を作成しました(${PAPER}、縦、ISO A3タイトルブロック)。`);
    expect(tr('en')('3개 객체를 종이 공간으로 옮겼습니다.')).toBe('Moved 3 objects to paper space.');
    expect(tr('de')('뷰포트 2개를 껐습니다.')).toBe('2 Ansichtsfenster ausgeschaltet.');
    expect(tr('ja')('페이지 설정 3개를 가져왔습니다(재정의 1개).')).toBe('3個のページ設定を読み込みました（再定義 1個）。');
    expect(tr('en')('머리글 채우기 색상: 비우면 없음, 또는 1~255')).toBe('Header fill color: None if empty, or 1 to 255');
    expect(tr('zh-CN')('플롯 미리보기 (2쪽)')).toBe('打印预览（2 页）');
    // 300차 출발점 중국어 통째 기록 줄: 지시선 引线(前导符 앞 채움 문자가 아니다)·연결선 基线·현재 간격두기 사용·다중 지시선 多重引线
    expect(show(RECORDS[0]!, 'zh-CN')).toBe('指定选项 [添加引线(A)/移除引线(R)] <添加引线>: A');
    expect(show(RECORDS[1]!, 'zh-CN')).toBe('输入选项 [分散(D)/设置引线平行(P)/设置间距(S)/使用当前间距(U)] <使用当前间距>: U');
    expect(show(RECORDS[2]!, 'zh-CN')).toContain('指定多重引线位置或 [');
    expect(show(RECORDS[3]!, 'zh-CN')).toContain('/引线基线(A)/');
    expect(show(RECORDS[4]!, 'en')).toBe('Enter layout name or [?] <Model>: Layout1');
    expect(show(RECORDS[6]!, 'zh-CN')).toContain('选择裁剪对象或 [');
  });

  it('고친 번역은 같은 사전의 낱말이다 — 새 열쇠는 조각·틀 번역에서 만든 꼴', () => {
    const [en, de, ja, zh] = [dict.en, dict.de, dict.ja, dict['zh-CN']];
    // 매수(플롯 부수): 「매수: 1과(와) 99 …」 오류 줄의 낱말(Buy·ノット数·采购·Kaufen이 아니다), 일본어·중국어는 「복사본이 너무 많습니다」의 コピー·副本数量
    expect([en['매수'], de['매수']]).toEqual([en['매수: 1과(와) 99 사이의 정수가 필요합니다.']!.split(':')[0], de['매수: 1과(와) 99 사이의 정수가 필요합니다.']!.split(':')[0]]);
    expect(ja['매수']).toBe(`${ja['복사본이 너무 많습니다(10000개까지).']!.slice(0, 3)}数`);
    expect(zh['매수']).toBe(zh['복사본이 너무 많습니다(10000개까지).']!.slice(0, 4));
    for (const l of LANGS) {
      expect(dict[l]['매수(B)'], l).toBe(`${dict[l]['매수']}${l === 'en' || l === 'de' ? ' ' : ''}(B)`);
      expect(dict[l]['매수: 1과(와) 99 사이의 정수가 필요합니다.'], l).toMatch(new RegExp(`^${dict[l]['매수']}[:：]`));
    }
    // VPORTS 셋·넷: 「셋: …」 Three·Drei, 「네 뷰포트」 four·vier·4つ·四个, 「경계는 점이 셋 이상」 3つ·三个
    expect([en['넷: 동일'], de['넷: 동일'], ja['넷: 동일'], zh['넷: 동일']]).toEqual(['Four: Same', 'Vier: Identisch', '4つ：同一', '四个：相同']);
    expect(en['(2D 도면이라 네 뷰포트 모두 평면 뷰)']).toContain('four');
    expect(zh['(2D 도면이라 네 뷰포트 모두 평면 뷰)']).toContain('四个');
    for (const k of ['수직', '수평', '아래', '오른쪽', '왼쪽', '위']) {
      expect(ja[`셋: ${k}`], k).toMatch(/^3つ：/);
      expect(zh[`셋: ${k}`], k).toMatch(/^三个：/);
    }
    expect(ja['경계는 점이 셋 이상이어야 합니다.']).toContain('3つ');
    expect(zh['경계는 점이 셋 이상이어야 합니다.']).toContain('三个');
    expect(de['셋: 오른쪽']).toBe(`Drei: ${de['오른쪽']}`);
    // 도면 방향 가로(N)·세로(A)와 -PLOT 세로(P): 「용지 방향 입력 [세로(P)/가로(L)]」·「가로(L)」의 용지 방향 낱말
    for (const l of LANGS) {
      const d = dict[l];
      expect(strip(d['가로(N)']), l).toBe(strip(d['가로(L)']));
      expect(strip(d['세로(A)']), l).toBe(strip(d['세로(P)']));
      expect(d['용지 방향 입력 [세로(P)/가로(L)] <{0}>:'], l).toContain(strip(d['세로(P)']));
    }
    // 한계(플롯 영역·MVSETUP 한계 LIMITS): 플롯 영역 통째 프롬프트의 낱말
    expect([en['한계'], strip(en['한계(L)']), strip(en['한계(LI)'])]).toEqual(['Limits', 'Limits', 'Limits']);
    expect([ja['한계'], strip(ja['한계(L)']), strip(ja['한계(LI)'])]).toEqual(['図面範囲', '図面範囲', '図面範囲']);
    expect(ja['플롯 영역 입력 [화면표시(D)/범위(E)/한계(L)/뷰(V)/윈도우(W)] <{0}>:']).toContain(`/${ja['한계(L)']}/`);
    expect(zh['플롯 영역 입력 [화면표시(D)/범위(E)/한계(L)/뷰(V)/윈도우(W)] <{0}>:']).toContain(`/${zh['한계']}(L)/`);
    expect(en['도면 한계가 없어 범위를 플롯합니다.']).toContain('extents');
    // 플롯: 독일어 Handlungsstruktur(줄거리)·Grundstücksmitte(땅), 중국어 平面图·剧情이 아니다
    expect(de['상세한 플롯 구성을 원하십니까?']).toContain('Plotkonfiguration');
    expect([de['플롯의 중심'], de['플롯의 중심(C)']]).toEqual(['Plot zentrieren', `Plot ${de['중심(C)']!.replace('Zentrieren', 'zentrieren')}`]);
    expect(zh['상세한 플롯 구성을 원하십니까?']).toContain(zh['플롯']);
    expect(zh['플롯 미리보기 ({0}쪽)']).toBe(`${zh['플롯 미리보기']}（{0} 页）`);
    // 용지·공간·페이지 설정·동결·뷰포트 축척
    expect(de['용지 "{0}"을(를) 찾을 수 없습니다. ?로 목록을 보십시오.']).toMatch(/^Papier /);
    expect(zh['용지 "{0}"을(를) 찾을 수 없습니다. ?로 목록을 보십시오.']).toContain(zh['용지 크기']!.slice(0, 2));
    expect([de['모형 공간으로'], de['종이 공간으로']]).toEqual(['In Modellbereich', 'In Papierbereich']);
    expect(de['도면 공간을 사용하시겠습니까? [']).toBe(`${de['도면 공간']} verwenden? [`);
    expect(de['도면 공간을 사용하시겠습니까? [아니오(N)/예(Y)] <예>:']).toMatch(/^Papierbereich verwenden\? \[/);
    expect(de['공간 변경']).toBe(`${de['공간']} ändern`);
    expect([en['새 페이지 설정'], de['새 페이지 설정']]).toEqual([strip(en['새 페이지 설정 이름(N)']).replace(' name', ''), `Neue ${de['페이지 설정']}`]);
    expect([de['새 동결'], de['새 동결(N)']]).toEqual(['Neu einfrieren', 'Neu einfrieren (N)']);
    expect(de['옵션 입력 [?/동결(F)/동결 해제(T)/재설정(R)/새 동결(N)/뷰포트 기본 가시성(V)]:']).toContain('Neu einfrieren(N)');
    expect(de['새 뷰포트의 기본 가시성 [동결(F)/동결 해제(T)] <동결 해제>:']).toContain(`[${de['동결(F)']}/${de['동결 해제(T)']}] <${strip(de['동결 해제(T)'])}>`);
    expect([en['뷰포트 자르기'], en['뷰포트를 자를 객체 선택:']]).toEqual(['Clip viewport', 'Select object to clip viewport:']);
    expect(en['자를 뷰포트 선택:']).toContain('clip');
    expect(zh['자르기 객체 선택 또는 [폴리곤(P){0}] <폴리곤>:']).toMatch(new RegExp(`^${zh['자르기 객체 선택 또는 [']!.replace('[', '\\[')}`));
    expect([zh['뷰포트 축척'], strip(zh['뷰포트 축척(S)'])]).toEqual(['视口比例', '视口比例']);
    expect(zh['선가중치 축척']).toContain('比例');
    expect([zh['구성 입력 ['], zh['구성 {0}:']]).toEqual(['输入配置 [', '配置 {0}:']);
    expect(zh['현재 구성:']).toContain('配置');
    expect([ja['구성 {0}:'], ja['구성 입력 [수평(H)/수직(V)/위(A)/아래(B)/왼쪽(L)/오른쪽(R)] <오른쪽>:']]).toEqual(['構成{0}：', '構成入力 [水平(H)/垂直(V)/上(A)/下(B)/左(L)/右(R)] <右>:']);
    expect(ja['(재정의 {0}개)']).toContain(ja['재정의']);
    expect([en['객체의 선가중치 플롯'], ja['객체의 선가중치 플롯'], de['객체의 선가중치 플롯']]).toEqual(['Plot object lineweights', 'オブジェクトの線の太さを印刷', 'Objektlinienstärken plotten']);
    expect([en['간격띄우기 X'], en['과학 축척'], zh['건축 축척']]).toEqual([en['간격띄우기 Y']!.replace('Y', 'X'), `${en['과학']} scale`, `${zh['건축']}比例尺`]);
    expect(zh['{0} (불러온 표)']).toContain('已加载');
    expect(zh['이미 이 배치의 페이지 설정입니다.']).toBe('已经是此布局的页面设置。');
    // 300차 출발점 중국어 통째 기록 줄: 같은 사전의 조각 번역
    expect(zh['옵션 지정 [지시선 추가(A)/지시선 제거(R)] <지시선 추가>:']).toContain(`[${zh['지시선 추가(A)']}/`);
    expect(zh['옵션 지정 [지시선 추가(A)/지시선 제거(R)] <지시선 추가>:']).not.toMatch(/前导/);
    expect(zh['옵션 입력 [지시선 유형(L)/지시선 연결선(A)/내용 유형(C)/최대 점 수(M)/첫 번째 각도(F)/두 번째 각도(S)/옵션 종료(X)] <옵션 종료>:']).toContain(`/${zh['지시선 연결선(A)']}/`);
    expect(zh['옵션 입력 [분산(D)/지시선 세그먼트를 평행으로 지정(P)/간격두기 지정(S)/현재 간격두기 사용(U)] <현재 간격두기 사용>:']).toContain(`/${zh['현재 간격두기 사용(U)']}] <${zh['현재 간격두기 사용']}>`);
    expect(zh['다중 지시선 배치 지정 또는 [수직(V)/수평(H)/줄바꿈(W)] <수평>:']).toContain('多重引线');
    expect(zh['줄바꿈 폭 지정 또는 [번호(N)]:']).toBe(`${zh['줄바꿈 폭 지정 또는 [']}${zh['번호(N)']}]：`);
    // 300차 출발점 독일어(296·294차 나머지): 트루 컬러 = 프롬프트 조각 True Color, 현재 사용 = 「현재 사용(.)」, 연관(A) = -HATCH 고급 통째, 뒤(B) = UNDO 통째, MKLTYPE 고른 = ausgewählt
    for (const k of ['트루 컬러', '트루컬러']) {
      expect(de[k], k).toBe('True Color');
      expect(de[`${k}(T)`], k).toBe(`${de[k]} (T)`);
    }
    expect(de['새 색상 입력 [트루 컬러(T)/색상표(CO)] <{0}>:']).toContain(de['트루 컬러(T)']);
    expect(de['트루컬러 {0},{1},{2}']).toBe('True Color {0},{1},{2}');
    expect([de['현재 사용'], de['<현재 사용>:']]).toEqual([strip(de['현재 사용(.)']!.replace(' (.)', '')), `<${strip(de['현재 사용(.)']!.replace(' (.)', ''))}>:`]);
    expect(de['연관(A)']).toBe('Assoziativ (A)');
    expect(de[HADV]).toContain('Assoziativ (A)');
    expect(de['뒤(B)']).toBe('Zurück (B)');
    expect(de[UNDO]).toContain('Zurück(B)');
    expect(de['고른 형상으로 선종류 정의 (MKLTYPE)']).toContain('ausgewählter');
    // 새 열쇠: 예/아니오 앞 조각 = 물음 + 「 [」, 결과·이름표 줄 = 틀 + 앱 낱말, 표 스타일 오류 = 틀 + 행 종류 이름
    for (const l of LANGS) {
      const d = dict[l];
      for (const q of YN_Q) expect(d[`${q} [`], `${l}: ${q}`).toBe(`${d[q]} [`);
      expect(d['*모형*'], l).toBe(`*${d['모형']}*`);
      expect(d['*모형 ({0})*'], l).toBe(`*${d['모형']} ({0})*`);
      expect(d['현재 배치: 모형'], l).toBe(d['현재 배치: {0}']!.replace('{0}', d['모형']!));
      expect(d['페이지 설정 - 모형'], l).toBe(d['페이지 설정 - {0}']!.replace('{0}', d['모형']!));
      expect(d['현재 제외(X)'], l).toBe(d['/현재 제외(X)']!.slice(1));
      expect(d['] <작성>:'], l).toBe(`] ${d['<작성>:']}`);
      expect(d['제목 블록: 없음'], l).toBe(d['제목 블록: {0}']!.replace('{0}', d['없음']!));
      expect(d['뷰포트 {0}: 동결된 도면층 없음'], l).toBe(d['뷰포트 {0}: {1}']!.replace('{1}', d['동결된 도면층 없음']!));
      expect(d['플롯 스탬프를 켰습니다: (필드 없음)'], l).toBe(d['플롯 스탬프를 켰습니다: {0}']!.replace('{0}', d['(필드 없음)']!));
      expect(d['플롯 축척 입력 (출력 밀리미터=도면 단위)또는 ['], l).toContain(l === 'en' ? 'millimeters' : d['밀리미터']!);
      for (const t of KIND_T)
        for (const k of KINDS) {
          const v = d[t.replace('{0}', k)]!;
          if (l === 'en') expect(v.toLowerCase(), `${l}: ${k} ${t}`).toBe(d[t]!.replace('{0}', d[k]!).toLowerCase());
          else expect(v, `${l}: ${k} ${t}`).toBe(d[t]!.replace('{0}', d[k]!));
        }
    }
    expect(en['제목 문자 높이는 0보다 커야 합니다.']).toBe('Title text height must be greater than 0.');
    expect(de['데이터 테두리 색상: ByBlock·ByLayer 또는 1~255']).toBe('Daten Rahmenfarbe: ByBlock·ByLayer oder 1~255');
  });
});
