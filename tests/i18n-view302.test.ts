/**
 * 302차: 뷰·좌표계 묶음(ZOOM·PAN·REGEN·PLAN·VIEWRES·UCS·UCSICON·UCSMAN·VIEW·-VIEW·뷰 탭·바로 가기 메뉴·ISODRAFT 등각원)의 번역과 301차가 남긴 것.
 * - 빠진 번역: ZOOM 뒤 조각 「] <실시간>:」(기본값이 옵션 이름이 아니다), VIEWRES 예/아니오 물음 앞 조각, -PLOT·VIEWRES 예/아니오 기록 줄(통째 열쇠 — 301차 보고),
 *   PLAN 「모형·배치 재생성 중.」·UCS 「현재 UCS 이름: *표준*」·-VIEW ? 목록 「… 종이·모형 폭 …」·뷰 관리자 「현재 뷰: 배치·모형」(틀이 앱 낱말을 잡았다).
 * - 오역: 확대·축소(ZOOMIN·ZOOMOUT — 중국어·독일어 축소가 「확대」), 초점이동 PAN(Focus shift·フォーカス移動·平移焦点·Fokus schwenken), 뷰 Anzeigen(보이다), 재생성 再生(재생),
 *   UCS 관리자 Administrator, 중국어 이전(P) 上一页(이전 쪽)·열린 도면이 없습니다 无法打开(열 수 없음)·301차 VPORTS 줄기(构造·视口缩放·限制·纸张空间), 독일어 3인칭 「Gibt … an」·Rückseite·Kachelansicht를
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

const ZOOM = '윈도우 구석 지정, 축척 비율(nX 또는 nXP) 입력, 또는 [전체(A)/중심(C)/범위(E)/이전(P)/윈도우(W)/객체(O)/축척(S)] <실시간>:';
const PLAN = '옵션 입력 [현재 UCS(C)/UCS(U)/표준(W)] <현재 UCS>:';
const UCS = 'UCS의 원점 지정 또는 [이름(NA)/객체(OB)/이전(P)/뷰(V)/표준(W)/Z] <표준>:';
const UCSICON = '옵션 입력 [켜기(ON)/끄기(OFF)/전체(A)/원점 없음(N)/원점(OR)] <켜기>:';
const VIEWOPT = '옵션 입력 [?/삭제(D)/복원(R)/저장(S)/창(W)]:';
const FAST_Q = '빠른 줌을 원하십니까?';
const FAST = `${FAST_Q} [예(Y)/아니오(N)] <예>:`;
const PAREA = '플롯 영역 입력 [화면표시(D)/범위(E)/한계(L)/뷰(V)/윈도우(W)] <범위>:';
const MVS_LIM = '옵션 입력 [도면층(L)/한계(LI)/단위(U)/외부 참조(X)] <종료>:';
const DONUT = '도넛의 내부 지름 지정 <0.5000>:';
const ISOD = '등각원의 지름 지정:';
const PEDIT_SW = '다음 세그먼트의 시작 폭 지정 <0.0000>:';
const PROMPTS = [ZOOM, PLAN, UCS, UCSICON, VIEWOPT, FAST, PAREA, MVS_LIM, DONUT, ISOD, PEDIT_SW];

/** -PLOT 예/아니오 물음(dashcmds-plot.ts askYN — 301차가 앞 조각을 더함) */
const YN_Q = ['상세한 플롯 구성을 원하십니까?', '위 아래를 뒤집어 플롯?', '플롯 스타일로 플롯?', '선가중치로 플롯?', '선가중치를 플롯 축척에 적용?', '도면 공간을 먼저 플롯?', '도면 공간 객체 숨기기?', '페이지 설정에 대한 변경 사항 저장', '플롯을 진행합니까?'];
const LINES = [
  '모형 재생성 중.',
  '배치 재생성 중.',
  '현재 UCS 이름: *표준*',
  '현재 UCS 이름: *이름 없음*',
  `${ft('V1')}  종이  폭 10.0000, 높이 5.0000`,
  `${ft('V1')}  모형  폭 10.0000, 높이 5.0000`,
  '현재 뷰: 배치',
  '현재 뷰: 모형',
];
/** 독일어 3인칭 「Gibt … an」이던 열쇠(300차 보고 — 299차 출발점 나머지) */
const GIBT = [
  '각도 치수 위치 지정 또는 {0}',
  '끝 반폭 지정',
  '다각형의 중심을 지정 또는 [모서리(E)]:',
  '다음 세그먼트의 끝 폭 지정',
  '다음 세그먼트의 시작 폭 지정',
  '도넛의 내부 지름 지정',
  '도넛의 외부 지름 지정',
  '등각원의 지름 지정:',
  '모서리의 첫 번째 끝점 지정:',
  '문자 기준선의 두 번째 끝점 지정:',
  '문자 기준선의 오른쪽 끝점 지정:',
  '문자 기준선의 첫 번째 끝점 지정:',
  '세그먼트의 길이 지정',
];

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.unstubAllGlobals();
});

describe('뷰·좌표계 묶음의 번역과 301차가 남긴 것(302차)', () => {
  it('명령행 입력 줄(앞 글 「… [」·옵션·뒤 글)이 네 언어 모두 한국어 없이 보이고, 고친 조각 낱말이 보인다', async () => {
    for (const [f, s] of [
      ['app/commands.ts', `await ctx.getPoint('${ZOOM}', { keywords: kws`],
      ['app/commands.ts', "app.register({ name: 'ZOOMIN', title: '확대', transparent: true,"],
      ['app/commands.ts', "app.register({ name: 'ZOOMOUT', title: '축소', transparent: true,"],
      ['app/commands.ts', "title: '초점이동',"],
      ['app/editcmds2-query.ts', `const fast = await askYN(ctx, '${FAST_Q}', cur.fast);`],
      ['app/editcmds2-query.ts', `'${PLAN}',`],
      ['app/ucs.ts', `const r = await ctx.getPoint('${UCS}', {`],
      ['app/ucs.ts', "const r = await ctx.getPoint(`옵션 입력 [켜기(ON)/끄기(OFF)/전체(A)/원점 없음(N)/원점(OR)] <${app.view.ucsIcon.on ? '켜기' : '끄기'}>:`, {"],
      ['app/viewcmds.ts', `const r = await ctx.getPoint('${VIEWOPT}', {`],
      ['app/dashcmds-ask.ts', "const k = await askOption(ctx, `${prompt} [예(Y)/아니오(N)] <${def ? '예' : '아니오'}>:`, YES_NO, def ? 'Y' : 'N');"],
      ['app/draw.ts', "const inner = await getDistance(ctx, '도넛의 내부 지름 지정', null, 0.5);"],
      ['app/viewtools-iso.ts', `diameter ? '${ISOD}'`],
      ['app/modify2-pedit.ts', "const sw = await askNumber(ctx, '다음 세그먼트의 시작 폭 지정', v.sw || cw, { min: 0 });"],
      ['app/ui/shell.ts', "tab: '뷰',"],
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
    // ZOOM 뒤 조각 「] <실시간>:」(기본값 실시간은 옵션 이름이 아니다), 중국어 이전(P) 上一个(上一页 이전 쪽이 아니다)
    for (const l of LANGS) expect(at(l, ZOOM), l).toContain(`] ${dict[l]['<실시간>:']}`);
    expect(at('en', ZOOM)).toContain('] <Real-time>:');
    expect(at('zh-CN', ZOOM)).toContain('/上一个(P)/');
    expect(at('zh-CN', UCS)).toContain('/上一个(P)/');
    // VIEWRES 예/아니오 물음: 앞 조각 = 물음 번역 + 「 [」(독일어 Lust auf 「입맛」이 아니다)
    for (const l of LANGS) expect(at(l, FAST), l).toContain(`${dict[l][FAST_Q]} [${dict[l]['예(Y)']}/${dict[l]['아니오(N)']}]`);
    expect(at('de', FAST)).toContain('Möchten Sie einen schnellen Zoom? [Ja (Y)/Nein (N)]');
    // 중국어 한계 界限(限制 제한이 아니다 — -PLOT 플롯 영역·MVSETUP), 독일어 3인칭 「Gibt … an」 → 이웃 열쇠 꼴
    expect(at('zh-CN', PAREA)).toContain('/界限(L)/');
    expect(at('zh-CN', MVS_LIM)).toContain('/界限(LI)/');
    expect(at('de', DONUT)).toBe('Innendurchmesser des Donuts angeben <0.5000>:');
    expect(at('de', ISOD)).toBe('Geben Sie den Durchmesser des isometrischen Kreises an:');
    expect(at('zh-CN', ISOD)).toBe('指定等轴测圆的直径：');
    expect(at('de', PEDIT_SW)).toBe('Startbreite des nächsten Segments angeben <0.0000>:');
    expect(at('de', UCS)).toContain('/Ansicht (V)/');
  });

  it('결과·이름표 줄(PLAN 재생성·UCS 현재 이름·-VIEW 목록·뷰 관리자 현재 뷰)과 기록 줄(-PLOT·VIEWRES 예/아니오·ZOOM·VPORTS·MVSETUP)이 네 언어 모두 한국어 없이 보인다', () => {
    for (const [f, s] of [
      ['app/editcmds2-query.ts', "ctx.print(`${st.isModel ? '모형' : '배치'} 재생성 중.`);"],
      ['app/ucs.ts', "ctx.print(`현재 UCS 이름: ${named ? ft(named) : isWorld(cur) ? '*표준*' : '*이름 없음*'}`);"],
      ['app/viewcmds.ts', "for (const v of list) ctx.print(`${ft(v.name)}  ${v.flags & 1 ? '종이' : '모형'}  폭 ${v.width.toFixed(4)}, 높이 ${v.height.toFixed(4)}`);"],
      ['app/viewcmds.ts', "h('div', { class: 'mgr-note' }, `현재 뷰: ${st.onLayout && !st.msVp ? '배치' : '모형'}`),"],
      ['app/dashcmds-plot.ts', "const detailed = await askYN(ctx, '상세한 플롯 구성을 원하십니까?', false);"],
    ])
      expect(src(f!), s).toContain(s);
    const tr = (l: string) => (x: string) => guardedTranslate(x, l) ?? translate(x, l);
    const show = (s: string, l: string) => translateTail(s, tr(l)(s), tr(l));
    const RECORDS = [
      ...YN_Q.map((q, i) => `${q} [예(Y)/아니오(N)] <${i % 2 ? '예' : '아니오'}>: Y`),
      `${FAST} N`,
      `${ZOOM} E`,
      '구성 입력 [수평(H)/수직(V)] <수직>: H',
      `${MVS_LIM} LI`,
    ];
    const left: string[] = [];
    for (const l of LANGS) {
      for (const s of LINES) if (HANGUL.test(tr(l)(s))) left.push(`${l}: ${tr(l)(s)}`);
      for (const s of RECORDS) if (HANGUL.test(show(s, l))) left.push(`${l}: ${show(s, l)}`);
    }
    expect(left).toEqual([]);
    expect(tr('en')('모형 재생성 중.')).toBe('Regenerating model.');
    expect(tr('ja')('배치 재생성 중.')).toBe('レイアウトを再生成中。');
    expect(tr('zh-CN')('모형 재생성 중.')).toBe('正在重新生成模型。');
    expect(tr('de')('현재 UCS 이름: *이름 없음*')).toBe('Aktueller BKS-Name: *Kein Name*');
    expect(tr('en')(LINES[4]!)).toBe('V1 Paper width 10.0000, height 5.0000');
    expect(tr('de')(LINES[5]!)).toBe('V1 Modell Breite 10.0000, Höhe 5.0000');
    expect(tr('zh-CN')('현재 뷰: 배치')).toBe('当前视图：布局');
    expect(show(RECORDS[0]!, 'en')).toBe('Want a detailed plot structure? [Yes (Y)/No (N)] <No>: Y');
    expect(show(RECORDS[7]!, 'de')).toBe('Änderungen an der Seiteneinrichtung speichern [Ja (Y)/Nein (N)] <Ja>: Y');
    expect(show(RECORDS[8]!, 'de')).toBe('Plotvorgang fortsetzen? [Ja (Y)/Nein (N)] <Nein>: Y');
    expect(show(RECORDS[9]!, 'ja')).toBe('クイックズームを使用しますか? [はい(Y)/いいえ(N)] <はい>: N');
    // 통째 기록 줄: 일본어 ZOOM 범위(E) 範囲(図面範囲 한계가 아니다), 중국어 축척(S) 比例·이전(P) 上一个, VPORTS 구성 配置(构造 구조가 아니다), MVSETUP 한계 界限(限值가 아니다)
    expect(show(RECORDS[10]!, 'ja')).toContain('/範囲(E)/');
    expect(show(RECORDS[10]!, 'zh-CN')).toContain('/上一个(P)/');
    expect(show(RECORDS[10]!, 'zh-CN')).toContain('/比例(S)]');
    expect(show(RECORDS[11]!, 'zh-CN')).toBe('输入配置 [水平(H)/垂直(V)] <垂直>: H');
    expect(show(RECORDS[12]!, 'zh-CN')).toContain('/界限(LI)/');
  });

  it('고친 번역은 같은 사전의 낱말이다 — 새 열쇠는 조각·틀 번역에서 만든 꼴', () => {
    const [en, de, ja, zh] = [dict.en, dict.de, dict.ja, dict['zh-CN']];
    const walk = Object.keys(en).find((k) => k.includes('확대·초점이동할 수 있습니다'))!;
    // 확대·축소(ZOOMIN·ZOOMOUT)와 ZOOM 제목: 「확대/축소」의 두 낱말(중국어·독일어 축소가 放大·Vergrößern 「확대」였다), 영어 Zoom/Pan·Scale down이 아니다
    expect(en['확대/축소']).toBe(en['줌']);
    expect([en['확대'], en['축소']]).toEqual(['Zoom In', 'Zoom Out']);
    expect(en['커서 위치를 기준으로 확대·축소']).toMatch(/^Zoom in\/out /);
    expect(en['선택한 객체로 확대']).toMatch(/^Zoom in /);
    for (const d of [zh, de]) expect([d['확대'], d['축소']]).toEqual(d['확대/축소']!.split('/'));
    // 초점이동(PAN): 도면층 탐색 「확대·초점이동」·UNDO 결합 물음의 낱말(Focus shift·フォーカス移動·平移焦点·Fokus schwenken이 아니다)
    expect(en['초점이동']).toBe('Pan');
    expect(en[walk]).toContain('zoom and pan');
    expect(en['확대/축소 및 초점이동 명령을 결합하시겠습니까?']).toBe('Combine zoom and pan commands?');
    expect(ja['초점이동']).toBe(ja['화면 이동']);
    expect(ja['확대/축소 및 초점이동 명령을 결합하시겠습니까?']).toContain(ja['화면 이동']);
    expect(zh['초점이동']).toBe('平移');
    expect(zh['확대/축소 및 초점이동 명령을 결합하시겠습니까?']).toContain(`${zh['초점이동']}命令`);
    expect(de['초점이동']).toBe('Verschieben');
    expect(de['확대/축소 및 초점이동 명령을 결합하시겠습니까?']).toContain(`„${de['초점이동']}“`);
    expect(en['범위 줌']).toBe('Zoom Extents');
    expect(en[ZOOM]).toContain('/Extents(E)/');
    // 재생성: 再生(재생)이 아니다, 영어·독일어 어순
    expect([en['{0} 재생성 중.'], de['{0} 재생성 중.']]).toEqual(['Regenerating {0}.', '{0} wird regeneriert.']);
    expect(de['전체(A)는 도면을 늘 재생성하므로 다른 명령 중에 투명하게 쓸 수 없습니다.']).toContain('regeneriert');
    expect(ja['{0} 재생성 중.']).toBe(`{0}を${ja['재생성']}中。`);
    expect(zh['{0} 재생성 중.']).toBe(`正在${zh['재생성']}{0}。`);
    // 뷰: 독일어 Anzeigen(보이다)이 아니라 Ansicht(「새 뷰」·「뷰(V)」), 뷰 해상도·뷰 이름, 이전 Vorheriges(좌표계가 아니다)
    expect(de['뷰']).toBe('Ansicht');
    expect(de['새 뷰']).toBe(`Neue ${de['뷰']}`);
    expect(de['뷰(V)']).toBe(`${de['뷰']} (V)`);
    expect([de['뷰 이름'], de['뷰 이름(N)'], de['뷰 해상도']]).toEqual(['Ansichtsname', 'Ansichtsname (N)', `${de['뷰']}sauflösung`]);
    expect(zh['뷰 해상도']).toBe(`${zh['뷰']}分辨率`);
    expect(de['이전']).toBe(strip(de['이전(P)']));
    expect(zh['이전(P)']).toBe('上一个(P)');
    expect(zh[ZOOM]).toContain(`/${zh['이전(P)']}/`);
    // UCS 관리자: 「뷰 관리자」의 Manager·管理器(Administrator·管理员 관리인이 아니다), 영어 UCSICON 원점 없음(N), 일본어 UCS 정렬 位置合わせ(ソート 차례 정렬이 아니다)
    expect(en['UCS 관리자']).toBe(`UCS ${en['뷰 관리자']!.split(' ')[1]}`);
    expect(zh['UCS 관리자']).toBe(`UCS${zh['뷰 관리자']!.slice(2)}`);
    expect(de['UCS 관리자']).toBe('BKS-Manager');
    expect(en['옵션 입력 [켜기(ON)/끄기(OFF)/전체(A)/원점 없음(N)/원점(OR)] <{0}>:']).toContain(`/${en['원점 없음']}(N)/`);
    expect(ja['UCS를 정렬할 객체 선택:']).toContain(ja['정렬점 획득']!.slice(0, 5));
    expect(ja['UCS를 정렬할 객체 선택:']).not.toMatch(/ソート/);
    expect(ja[ZOOM]).toContain(`/${ja['범위(E)']}/`);
    expect(zh[ZOOM]).toContain(`/${zh['축척(S)']}]`);
    // 뷰 관리자·바로 가기 메뉴: 재정의 물음 replace, 중국어 현재로 설정(C)(도면층 图层이 아니다), 휠 두 번(두 번 누르기 — 倍增·verdoppeln 곱절이 아니다), 독일어 선택한 객체로 확대 zoomen
    expect(en['뷰 "{0}"이(가) 이미 있습니다. 바꾸시겠습니까?']).toContain('replace');
    expect(en['"{0}"을(를) 무엇으로 바꾸겠습니까:']).toMatch(/^Replace /);
    expect(zh['현재로 설정(C)']).toBe(`${zh['현재로 설정']}(C)`);
    expect(zh['휠 두 번']).toBe(`双击${zh['휠']}`);
    expect(zh['가운데 버튼 두 번 누르기']).toMatch(/^双击/);
    expect(de['휠 두 번']).toBe(`${de['휠']} zweimal drücken`);
    expect(de['가운데 버튼 두 번 누르기']).toContain('zweimal');
    expect(de['선택한 객체로 확대']).toContain('zoomen');
    expect(de[FAST_Q]).toMatch(/^Möchten Sie /);
    expect(de['상세한 플롯 구성을 원하십니까?']).toMatch(/^Möchten Sie /);
    // 중국어: 열린 도면이 없습니다 = 「열린 도면 목록」 已打开的(无法打开 열 수 없음이 아니다), 휠 안내 초점이동 平移 빠짐, 등각원 지름 指定
    for (const k of ['열린 도면이 없습니다.', '열린 도면이 없습니다', '열린 도면이 없습니다. 먼저 파일을 여십시오.']) expect(zh[k], k).toMatch(/^没有已打开的图形/);
    expect(zh['열린 도면 목록']).toContain('已打开的');
    expect(zh['휠을 굴리거나 가운데 버튼으로 끌어 확대·이동하십시오.']).toContain(`缩放和${zh['초점이동']}`);
    expect(zh['등각원의 지름 지정:']).toMatch(new RegExp(`^${zh['등각원의 중심 지정:']!.slice(0, 7)}`));
    // 중국어 301차 VPORTS 줄기: 구성 配置(构造 구조가 아니다), 뷰포트 축척 比例(缩放 줌이 아니다), 한계 界限, 종이 공간 图纸空间(=「도면 공간」), 용지 어순, 300차 스타일 样式·대소문자 大小写
    expect(zh['구성 입력 [수평(H)/수직(V)/위(A)/아래(B)/왼쪽(L)/오른쪽(R)] <오른쪽>:']).toMatch(/^输入配置 \[/);
    expect(zh['구성 입력 [수평(H)/수직(V)] <수직>:']).toMatch(new RegExp(`^${zh['구성 입력 [']!.replace('[', '\\[')}`));
    expect(zh['구성']).toBe('配置');
    expect(zh['현재 구성:']).toContain(zh['구성']);
    expect(zh['옵션 입력 [정렬(A)/작성(C)/뷰포트 축척(S)/옵션(O)/제목 블록(T)/명령 취소(U)]:']).toContain(`/${zh['뷰포트 축척']}(S)/`);
    for (const k of ['뷰포트 축척 보기', '뷰포트 축척 동기화', '뷰포트 축척 비율: {0}xp']) expect(zh[k], k).toContain(zh['뷰포트 축척']);
    expect([zh['한계(L)'], zh['한계(LI)']]).toEqual([`${zh['한계']}(L)`, `${zh['한계']}(LI)`]);
    expect(zh[MVS_LIM]).toContain(`/${zh['한계']}(LI)/`);
    expect(zh['용지 {0} × {1}을(를) 축척 {2}(으)로 테두리를 그리고 한계를 맞췄습니다.']).toBe(`已按比例 {2} 为纸张 {0} × {1} 绘制边框并设置${zh['한계']}。`);
    expect(zh['종이 공간']).toBe(zh['도면 공간']);
    expect(zh['종이 공간으로']).toBe(zh['모형 공간으로']!.replace(zh['모형 공간']!, zh['도면 공간']!));
    expect(zh['새 스타일 이름']).toBe(`新${zh['스타일 이름']}`);
    expect(zh['대소문자']).toBe(zh['대소문자 일치']!.slice(0, 3));
    // 독일어 3인칭 「Gibt … an」은 사전에 남지 않는다(이웃 열쇠의 「… angeben」·「Geben Sie … an」 꼴), Rückseite(뒷면)·skalieren(동사)·Kachelansicht(타일 보기)
    expect(Object.values(de).filter((v) => /^Gibt /.test(v))).toEqual([]);
    for (const k of GIBT) expect(de[k], k).toMatch(/^Geben Sie | angeben/);
    expect(de['다른 객체의 맨 뒤로']).toBe(de['다른 객체의 맨 앞으로']!.replace('Vor', 'Hinter'));
    expect(de['새 객체의 선종류 축척']).toBe(`${de['선종류 축척']} neuer Objekte`);
    for (const k of ['타일 뷰포트 {0}/{1}', '타일 뷰포트(명령행)']) expect(de[k], k).toMatch(new RegExp(`^${de['최대화된 타일 뷰포트']!.replace('Maximiertes ', '')}`));
    // 새 열쇠: 예/아니오 통째 = 앞 조각 + 예(Y)·아니오(N) 조각 + 「] <{0}>:」, ZOOM 뒤 조각, 결과·이름표 줄 = 틀 + 앱 낱말
    for (const l of LANGS) {
      const d = dict[l];
      // 중국어 예/아니오 통째 열쇠는 전각 「：」로 끝난다(같은 사전의 통째 29 : 4 — 298차 꼴)
      const colon = l === 'zh-CN' ? '：' : ':';
      expect(d[`${FAST_Q} [`], l).toBe(`${d[FAST_Q]} [`);
      for (const q of [...YN_Q, FAST_Q]) expect(d[`${q} [예(Y)/아니오(N)] <{0}>:`], `${l}: ${q}`).toBe(`${d[`${q} [`]}${d['예(Y)']}/${d['아니오(N)']}] <{0}>${colon}`);
      expect(d['] <실시간>:'], l).toBe(`] ${d['<실시간>:']}`);
      for (const w of ['모형', '배치']) {
        expect(d[`${w} 재생성 중.`], `${l}: ${w}`).toBe(d['{0} 재생성 중.']!.replace('{0}', l === 'en' ? d[w]!.toLowerCase() : d[w]!));
        expect(d[`현재 뷰: ${w}`], `${l}: ${w}`).toBe(d['현재 뷰: {0}']!.replace('{0}', d[w]!));
      }
      for (const w of ['*표준*', '*이름 없음*']) expect(d[`현재 UCS 이름: ${w}`], `${l}: ${w}`).toBe(d['현재 UCS 이름: {0}']!.replace('{0}', d[w]!));
      for (const w of ['종이', '모형'])
        expect(d[`{0} ${w} 폭 {1}, 높이 {2}`], `${l}: ${w}`).toBe(d['{0} {1} 폭 {2}, 높이 {3}']!.replace('{1}', d[w]!).replace('{2}', '{1}').replace('{3}', '{2}'));
    }
  });
});
