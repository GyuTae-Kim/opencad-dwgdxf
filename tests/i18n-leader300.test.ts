/**
 * 300차: 지시선·표·공차·필드 주석 묶음(LEADER·QLEADER·MLEADER·MLEADEREDIT·MLEADERALIGN·MLEADERCOLLECT·MLEADERSTYLE·TABLE·TABLECELL·TABLESTYLE·TOLERANCE·FIELD)의 번역과 299차가 남긴 것.
 * - 빠진 번역: MLEADER 순서 옵션(지시선 화살촉 먼저(H)·지시선 연결선 먼저(L)·내용 먼저(C))과 그 앞 글·통째, 「첫 번째·두 번째 각도 구속 입력」(틀이 「첫 번째」를 잡았다),
 *   TABLECELL 옵션 조각·「행 높이·열 폭 입력」, 표 결과 줄(`${동작}: 표 R행 C열` — 틀이 동작 이름을 잡았다), FIELD 자리맞추기 옵션 조각, MLEADERSTYLE 관리자 설명 줄.
 * - 오역: 중국어 다중 지시선 多行引线(여러 줄)·前导线·引线连接器·第一个角点·换行符·排序·周长符文·圆柱体·面部轮廓, 독일어 Schneller Anführer·Füllzeichen·Sortierung·Mehrfachleiter·「[ [」,
 *   영어 30 degree heat·Minimum ingredients·connector·Align input, 일본어 輪郭図·改行 등과 299차 독일어 출발점(Bisektion·Umkreist·Akkord·Inkrementell·<Ende>·Gibt … an·Speicherort·Cloud-Revision)을
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

const MLA = '지시선 화살촉 위치 지정 또는 [지시선 연결선 먼저(L)/내용 먼저(C)/옵션(O)] <옵션>:';
const MLL = '지시선 연결선 위치 지정 또는 [지시선 화살촉 먼저(H)/내용 먼저(C)/옵션(O)] <옵션>:';
const MLT = '문자의 첫 번째 구석 지정 또는 [지시선 화살촉 먼저(H)/지시선 연결선 먼저(L)/옵션(O)] <옵션>:';
const MLB = '블록의 삽입점 지정 또는 [지시선 화살촉 먼저(H)/지시선 연결선 먼저(L)/옵션(O)] <옵션>:';
const MLO = '옵션 입력 [지시선 유형(L)/지시선 연결선(A)/내용 유형(C)/최대 점 수(M)/첫 번째 각도(F)/두 번째 각도(S)/옵션 종료(X)] <옵션 종료>:';
const ANG = ['첫 번째 각도 구속 입력 <0>:', '두 번째 각도 구속 입력 <15>:'];
const MLE = '옵션 지정 [지시선 추가(A)/지시선 제거(R)] <지시선 추가>:';
const MLAL = '옵션 입력 [분산(D)/지시선 세그먼트를 평행으로 지정(P)/간격두기 지정(S)/현재 간격두기 사용(U)] <현재 간격두기 사용>:';
const MLC = '다중 지시선 배치 지정 또는 [수직(V)/수평(H)/줄바꿈(W)] <수평>:';
const MLC_W = '줄바꿈 폭 지정 또는 [번호(N)]:';
const QL = '첫 번째 지시선 점 지정 또는 [설정(S)] <설정>:';
const CELL_KW = ['위에 행 삽입(RA)', '아래에 행 삽입(RB)', '행 삭제(DR)', '왼쪽에 열 삽입(CL)', '오른쪽에 열 삽입(CR)', '열 삭제(DC)', '셀 병합(M)', '셀 병합 해제(U)', '정렬(A)', '셀 스타일(S)', '행 높이(H)', '열 폭(W)', '문자 편집(E)'];
const CELL = `셀 A1 옵션 입력 [${CELL_KW.join('/')}] <문자 편집>:`;
const ALIGN_KW = ['맨 위 왼쪽(TL)', '맨 위 중심(TC)', '맨 위 오른쪽(TR)', '중간 왼쪽(ML)', '중간 중심(MC)', '중간 오른쪽(MR)', '맨 아래 왼쪽(BL)', '맨 아래 중심(BC)', '맨 아래 오른쪽(BR)', '스타일 따름(S)'];
const ALIGN = `정렬 입력 [${ALIGN_KW.join('/')}]:`;
const ROWCOL = ['행 높이 입력 <10>:', '열 폭 입력 <60>:'];
const JUST_KW = ['왼쪽 위(TL)', '중심 위(TC)', '오른쪽 위(TR)', '왼쪽 중간(ML)', '중간 중심(MC)', '오른쪽 중간(MR)', '왼쪽 아래(BL)', '중심 아래(BC)', '오른쪽 아래(BR)'];
const JUST = `자리맞추기 입력 [${JUST_KW.join('/')}] <왼쪽 위(TL)>:`;
// 299차 출발점(독일어): HELIX·XLINE·POLYGON·SPLINE·LENGTHEN·DONUT·LINE 등·MEASUREGEOM 각도·반지름
const HELIX = '기준 중심점 지정:';
const XLINE = '점 지정 또는 [수평(H)/수직(V)/각도(A)/이등분(B)/간격띄우기(O)]:';
const POLY = '옵션을 입력 [원에 내접(I)/원에 외접(C)] <I>:';
const KNOTS = '매듭 매개변수화 입력 [현(C)/제곱근(S)/균일(U)] <현>:';
const LEN = '측정할 객체 선택 또는 [증분(DE)/퍼센트(P)/합계(T)/동적(DY)] <합계(T)>:';
const DONUT = '도넛의 중심 지정 <종료>:';
const NEXT = '다음 점 지정:';
const ANG_END = ['각도의 첫 번째 끝점 지정:', '각도의 두 번째 끝점 지정:'];
const MEA_R = '호 또는 원 선택 [거리(D)/각도(A)/면적(AR)/종료(X)]:';
const PROMPTS = [MLA, MLL, MLT, MLB, MLO, ...ANG, MLE, MLAL, MLC, MLC_W, QL, CELL, ALIGN, ...ROWCOL, JUST, HELIX, XLINE, POLY, KNOTS, LEN, DONUT, NEXT, ...ANG_END, MEA_R];

/** 표 결과 줄의 동작 이름(tablecmds.ts·tablecell.ts·tablecell-palette.ts — `${label}: 표 ${rows}행 ${cols}열`) */
const TABLE_OPS = [
  '위에 행 삽입', '아래에 행 삽입', '행 삭제', '왼쪽에 열 삽입', '오른쪽에 열 삽입', '열 삭제', '셀 병합', '셀 병합 해제', '셀 정렬', '셀 스타일', '행 높이', '열 폭',
  '열 폭 같게', '행 높이 같게', '모든 특성 재지정 제거', '셀 배경 채우기', '셀 잠금', '특성 재지정 제거', '셀 문자 스타일', '셀 문자 높이', '셀 문자 색상',
];
/** MLEADERSTYLE 관리자 설명 줄(annot2-leader.ts — 내용 종류 셋 × 연결선 거리·없음) */
const INFO = ['여러 줄 문자', '블록', '없음'].flatMap((c) => [`내용: ${c}, 문자 높이 2.5, 화살촉 크기 3, 연결선 8, 축척 1`, `내용: ${c}, 문자 높이 2.5, 화살촉 크기 3, 연결선 없음, 축척 1`]);
const LINES = [
  ...TABLE_OPS.map((o) => `${o}: 표 4행 3열`),
  ...INFO,
  '블록이 없습니다.',
  '현재 스타일은 삭제할 수 없습니다.',
  '","이(가) 올바르지 않은 자리에 있습니다.',
  'CAL: ","이(가) 올바르지 않은 자리에 있습니다.',
  '구름형 리비전 쉐이프',
  '비교-구름형 리비전',
];

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.unstubAllGlobals();
});

describe('지시선·표·공차·필드 주석 묶음의 번역과 299차가 남긴 것(300차)', () => {
  it('명령행 입력 줄(앞 글 「… [」·옵션·뒤 글)이 네 언어 모두 한국어 없이 보이고, 고친 조각 낱말이 보인다', async () => {
    for (const [f, s] of [
      ['app/annotate.ts', "? `블록의 삽입점 지정 또는 [${others.map((k) => `${k.label}(${k.key})`).join('/')}/옵션(O)] <옵션>:`"],
      ['app/annotate.ts', ": `${s.order === 'L' ? '지시선 연결선 위치 지정' : '지시선 화살촉 위치 지정'} 또는 [${others.map((k) => `${k.label}(${k.key})`).join('/')}/옵션(O)] <옵션>:`;"],
      ['app/annotate.ts', "H: { key: 'H', label: '지시선 화살촉 먼저' },"],
      ['app/annotate.ts', "const k = await ctx.getPoint(`${first ? '첫 번째' : '두 번째'} 각도 구속 입력 <${+((cur * 180) / Math.PI).toFixed(4)}>:`, { preferNumber: true });"],
      ['app/annot2-leader.ts', "const w = await ctx.getPoint('줄바꿈 폭 지정 또는 [번호(N)]:', { keywords: [{ key: 'N', label: '번호' }], preferNumber: true });"],
      ['app/tablecmds.ts', "const r = await ctx.getPoint(`셀 ${cellName(cell.r, cell.c)} 옵션 입력 [${kw.map((k) => `${k.label}(${k.key})`).join('/')}] <문자 편집>:`, { keywords: kw });"],
      ['app/tablecmds.ts', "const a = await ctx.getPoint('정렬 입력 [' + ALIGN_KEYS.map((k) => `${k.label}(${k.key})`).join('/') + ']:', { keywords: ALIGN_KEYS });"],
      ['app/tablecmds.ts', "{ key: 'S', label: '스타일 따름' },"],
      ['app/tablecmds.ts', "const a = await ctx.getPoint(`${key === 'H' ? '행 높이' : '열 폭'} 입력 <${+cur.toFixed(4)}>:`, { preferNumber: true });"],
      ['app/fieldcmds.ts', "{ key: 'BC', label: '중심 아래' },"],
      ['app/helix.ts', "const c = await ctx.getPoint('기준 중심점 지정:');"],
      ['app/draw.ts', "const r0 = await ctx.getPoint('점 지정 또는 [수평(H)/수직(V)/각도(A)/이등분(B)/간격띄우기(O)]:', {"],
      ['app/draw.ts', "const k = await ctx.getPoint(`매듭 매개변수화 입력 [현(C)/제곱근(S)/균일(U)] <${KNOT_LABEL[knots]}>:`, {"],
      ['app/modify.ts', "const r = await ctx.getEntity(`측정할 객체 선택 또는 [증분(DE)/퍼센트(P)/합계(T)/동적(DY)] <${modeLabel[modeKey] ?? '합계'}(${modeKey})>:`, ["],
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
    // MLEADER 순서 옵션과 앞 글(새 조각), 연결선 landing·基线, 첫 번째 각도 第一角度(第一个角点 구석점이 아니다)
    expect(at('en', MLA)).toContain('[Leader landing first (L)/Content first (C)/');
    expect(at('de', MLA)).toContain('Pfeilspitze der Führungslinie positionieren oder [Führungslinien-Anbindung zuerst (L)/');
    expect(at('zh-CN', MLT)).toContain('[引线箭头优先(H)/引线基线优先(L)/');
    expect(at('zh-CN', MLO)).toContain('/引线基线(A)/');
    expect(at('zh-CN', MLO)).toContain('/第一角度(F)/');
    expect(at('en', MLO)).toContain('/Leader landing (A)/');
    expect(at('ja', ANG[0]!)).toBe('1番目の角度拘束を入力 <0>:');
    // MLEADEREDIT 지시선 添加引线(前导线 앞 채움선이 아니다), MLEADERALIGN 현재 간격두기 사용, MLEADERCOLLECT 줄바꿈 Wrap·环绕(줄바꿈 문자가 아니다)·독일어 다중 지시선
    expect(at('zh-CN', MLE)).toContain('[添加引线(A)/');
    expect(at('de', MLAL)).toContain('/Aktuellen Abstand verwenden (U)]');
    expect(at('de', MLC)).toContain('Multileader-Platzierung angeben oder [');
    expect(at('zh-CN', MLC)).toContain('/环绕(W)]');
    // 뒤 글(「]:」)은 번역층이 통째 열쇠 번역의 끝(중국어는 전각 「：」)을 따른다
    expect(at('zh-CN', MLC_W)).toBe('指定环绕宽度或 [编号(N)]：');
    expect(at('en', MLC_W)).toBe('Specify wrap width or [Number (N)]:');
    // QLEADER 첫 프롬프트: 독일어 앞 글의 「[ [」 겹침이 없다
    expect(at('de', QL)).toBe('Ersten Führungslinienpunkt angeben oder [Einstellungen (S)] <Einstellungen>:');
    // TABLECELL 옵션 조각·정렬 입력(정렬 = 맞춤 — Sort·排序·Sortierung이 아니다)·행 높이 입력, FIELD 자리맞추기 옵션 조각
    expect(at('en', CELL)).toContain('[Insert row above (RA)/Insert Row Below (RB)/');
    expect(at('en', ALIGN)).toContain('Enter alignment [Top Left (TL)/');
    expect(at('en', ALIGN)).toContain('/Follow style (S)]');
    expect(at('zh-CN', ALIGN)).toContain('输入对齐方式 [');
    expect(at('de', ALIGN)).toContain('Ausrichtung eingeben [');
    expect(at('zh-CN', ROWCOL[0]!)).toBe('输入行高 <10>：');
    expect(at('en', JUST)).toContain('[Top-left (TL)/Center Above (TC)/');
    // 299차 독일어 출발점
    expect(at('de', HELIX)).toBe('Basismittelpunkt angeben:');
    expect(at('de', XLINE)).toContain('/Halbierung (B)/');
    expect(at('de', KNOTS)).toContain('Knotenparametrisierung eingeben [Sehne (C)/Quadratwurzel (S)/Gleichmäßig (U)]');
    expect(at('de', LEN)).toContain('[Inkrement (DE)/');
    expect(at('de', DONUT)).toBe('Mittelpunkt des Donuts angeben <Beenden>:');
    expect(at('de', NEXT)).toBe('Nächsten Punkt angeben:');
    expect(at('de', ANG_END[0]!)).toBe('Ersten Endpunkt des Winkels angeben:');
    expect(at('de', MEA_R)).toContain('/Beenden (X)]');
  });

  it('결과·안내 줄(표 결과 줄·MLEADERSTYLE 설명 줄·CAL 오류)과 기록 줄이 네 언어 모두 한국어 없이 보인다', () => {
    for (const [f, s] of [
      ['app/tablecmds.ts', 'ctx.print(`${label}: 표 ${next.rows}행 ${next.cols}열`);'],
      ['app/tablecell.ts', 'app.cmd.print(`${label}: 표 ${next.rows}행 ${next.cols}열`);'],
      ['app/tablecell-palette.ts', "fmt('셀 문자 색상', (d, r, s) => {"],
      ['app/annot2-leader.ts', "info.textContent = s ? `내용: ${s.contentType === 2 ? '여러 줄 문자' : s.contentType === 1 ? '블록' : '없음'}, 문자 높이 ${s.textHeight}, 화살촉 크기 ${s.arrowSize}, 연결선 ${s.landing ? s.doglegLength : '없음'}, 축척 ${s.scale}` : '';"],
      ['app/annot2-leader.ts', "for (const s of styles(app)) list.append(h('option', { value: s.handle }, `${ft(s.name)}${cur?.handle === s.handle ? '  (현재)' : ''}`));"],
      ['edit/annot/tolerance.ts', "{ key: 'h', label: '원주 흔들림' },"],
    ])
      expect(src(f!), s).toContain(s);
    const tr = (l: string) => (x: string) => guardedTranslate(x, l) ?? translate(x, l);
    const show = (s: string, l: string) => translateTail(s, tr(l)(s), tr(l));
    const RECORDS = [`${MLA} O`, `${MLL} C`, `${MLT} H`, `${MLE} A`, `${MLO} A`, `${KNOTS} U`, `${LEN} DE`, `${DONUT} 10,10`, `${ANG[0]} 30`, `${ROWCOL[0]} 12`];
    const left: string[] = [];
    for (const l of LANGS) {
      for (const s of LINES) if (HANGUL.test(tr(l)(s))) left.push(`${l}: ${tr(l)(s)}`);
      for (const s of RECORDS) if (HANGUL.test(show(s, l))) left.push(`${l}: ${show(s, l)}`);
      const cur = tr(l)(`${ft('Standard')}  (현재)`);
      if (HANGUL.test(cur)) left.push(`${l}: ${cur}`);
    }
    expect(left).toEqual([]);
    expect(tr('en')('위에 행 삽입: 표 4행 3열')).toBe('Insert row above: table of 4 rows × 3 columns');
    expect(tr('de')('셀 정렬: 표 3행 3열')).toBe('Zellausrichtung: Tabelle mit 3 Zeilen × 3 Spalten');
    expect(tr('ja')('셀 문자 색상: 표 2행 2열')).toBe('セルの文字の色：表2行2列');
    expect(tr('zh-CN')('내용: 여러 줄 문자, 문자 높이 2.5, 화살촉 크기 3, 연결선 8, 축척 1')).toBe('内容：多行文本，文本高度2.5，箭头大小3，基线8，比例1');
    expect(tr('ja')('내용: 블록, 문자 높이 2.5, 화살촉 크기 3, 연결선 없음, 축척 1')).toBe('内容: ブロック、文字高さ 2.5、矢印サイズ 3、接続線 なし、尺度 1');
    expect(tr('en')('내용: 없음, 문자 높이 2.5, 화살촉 크기 3, 연결선 없음, 축척 1')).toBe('Content: None, text height 2.5, arrowhead size 3, landing None, scale 1');
    expect(tr('en')(`${ft('Standard')}  (현재)`)).toContain('(current)');
    expect(tr('zh-CN')('블록이 없습니다.')).toBe('没有块。');
    expect(tr('de')('","이(가) 올바르지 않은 자리에 있습니다.')).toBe('„,“ steht an einer ungültigen Position.');
    expect(tr('de')('CAL: ","이(가) 올바르지 않은 자리에 있습니다.')).toBe('CAL: „,“ steht an einer ungültigen Position.');
    expect(show(`${MLA} O`, 'en')).toBe('Specify leader arrowhead location or [Leader landing first (L)/Content first (C)/Option (O)] <Options>: O');
    expect(show(`${MLL} C`, 'zh-CN')).toBe('指定引线基线位置或 [引线箭头优先(H)/内容优先(C)/选项(O)] <选项>: C');
    expect(show(`${MLE} A`, 'de')).toBe('Optionen angeben [Führungslinie hinzufügen (A)/Führungslinie entfernen (R)] <Führungslinie hinzufügen>: A');
    expect(show(`${KNOTS} U`, 'de')).toBe('Knotenparametrisierung eingeben [Sehne (C)/Quadratwurzel (S)/Gleichmäßig (U)] <Sehne>: U');
    expect(show(`${DONUT} 10,10`, 'de')).toBe('Mittelpunkt des Donuts angeben <Beenden>: 10,10');
  });

  it('고친 번역은 같은 사전의 낱말이다 — 299차 독일어 출발점과 묶음, 새 열쇠는 조각·틀 번역에서 만든 꼴', () => {
    const [en, de, ja, zh] = [dict.en, dict.de, dict.ja, dict['zh-CN']];
    // 299차 독일어 출발점: 기준(HELIX) Basis, 이등분 Halbierung(XLINE 프롬프트 조각 — Bisektion·Teilung이 아니다), 원에 외접 Umschrieben(「원에 외접(C)」), 매듭 현·균일, 증분 Inkrement
    expect(de['기준 중심점 지정:']).toContain('Basis');
    expect(de['기준 반지름 지정']).toContain('Basis');
    expect([de['이등분'], de['이등분(B)']]).toEqual([strip(de['이등분(B)']), 'Halbierung (B)']);
    expect(de[XLINE]).toContain(`/${de['이등분(B)']}/`);
    expect(de['원에 외접']).toBe(strip(de['원에 외접(C)']));
    expect(de['매듭 매개변수화 입력 [현(C)/제곱근(S)/균일(U)] <{0}>:']).toContain(`[${de['현(C)']}/${de['제곱근(S)']}/${de['균일(U)']}]`);
    expect([de['증분'], strip(de['증분(I)']), strip(de['증분(DE)'])]).toEqual(['Inkrement', 'Inkrement', 'Inkrement']);
    expect(de['측정할 객체 선택 또는 [증분(DE)/퍼센트(P)/합계(T)/동적(DY)] <{0}({1})>:']).toContain(`[${de['증분(DE)']}/`);
    // 도넛 기본값 <종료> Beenden(Ende 끝이 아니다), 3인칭 「Gibt … an」 → 「다음 점 지정 또는 [」의 명령꼴, 종료(X) Beenden, 자리 Position(Speicherort 저장 위치가 아니다)
    expect(de[DONUT]).toBe(`Mittelpunkt des Donuts angeben <${de['종료']}>:`);
    expect(de[NEXT]).toBe(de['다음 점 지정 또는 [']!.replace(' oder [', ':'));
    for (const k of ANG_END) expect(de[k], k).not.toMatch(/^Gibt/);
    expect(de[MEA_R]).toContain(de['종료(X)']);
    expect(de['그 자리에 고칠 수 있는 속성이 없습니다.']).toContain('Position');
    expect(de['"{0}"이(가) 올바르지 않은 자리에 있습니다.']).toBe('„{0}“ steht an einer ungültigen Position.');
    expect(de['CAL: "{0}"이(가) 올바르지 않은 자리에 있습니다.']).toBe(`CAL: ${de['"{0}"이(가) 올바르지 않은 자리에 있습니다.']}`);
    // 구름형 리비전 나머지 Revisionswolke(「구름형 리비전」 — Cloud-Revision이 아니다)
    for (const k of ['구름형 리비전 쉐이프', '구름형 수정 기호', '비교-구름형 리비전', '구름형 리비전(R)']) expect(de[k], k).toContain(de['구름형 리비전']);
    expect(de['구름형 리비전(R)']).toBe(`${de['구름형 리비전']} (R)`);
    // 독일어 묶음: 지시선 Führungslinie(Anführer·Füllzeichen이 아니다), 스타일 Stil, 현재 간격두기 사용(통째 프롬프트의 기본값), 정렬 입력 = 자리맞추기 입력(Sortierung이 아니다)
    expect(de['빠른 지시선']).toContain(de['지시선']);
    expect(de[MLE]).toContain(`[${de['지시선 추가(A)']}/`);
    expect(de[MLE]).toContain(`<${de['지시선 추가']}>`);
    expect(de[MLE]).not.toMatch(/Füllzeichen/);
    expect(de['현재 스타일은 삭제할 수 없습니다.']).toContain('Stil');
    expect(de[MLAL]).toContain(`<${de['현재 간격두기 사용']}>`);
    expect(de['현재 간격두기 사용(U)']).toBe(`${de['현재 간격두기 사용']} (U)`);
    for (const l of ['ja', 'zh-CN', 'de'] as const) expect(dict[l]['정렬 입력 ['], l).toBe(dict[l]['자리맞추기 입력 [']);
    expect(en['정렬 입력 [']).toBe('Enter alignment [');
    expect(de['Enter 아래 셀 · Alt+Enter 줄 바꿈 · Tab 다음 셀 · Ctrl+Enter 확인']).toMatch(/^Eingabetaste .* · Alt\+Eingabetaste /);
    expect(de['다중 지시선 배치 지정 또는 [']!.startsWith(de['다중 지시선']!)).toBe(true);
    expect(de['첫 번째 지시선 점 지정 또는 [']).toBe(de[QL]!.slice(0, de[QL]!.indexOf('[') + 1));
    expect(de['지시선 연결선 먼저']).toBe(de['내용 먼저']!.replace('Inhalt', 'Führungslinien-Anbindung'));
    expect(de['지시선 연결선 위치 지정']).toContain('Führungslinien-Anbindung');
    // 기하 공차 기호(공차 대화 상자): 「…도」 度·ität, 「온 흔들림」 全跳动의 跳动, 「선의 윤곽도」 Linienform
    expect(zh['원주 흔들림']).toBe(zh['온 흔들림']!.replace('全', '圆'));
    for (const k of ['원통도', '면의 윤곽도', '선의 윤곽도']) expect(zh[k], k).toMatch(/度$/);
    expect(zh['동심도']).toMatch(/度$/);
    expect([ja['면의 윤곽도'], ja['선의 윤곽도']]).toEqual(['面の輪郭度', '線の輪郭度']);
    expect(ja['평행도']).toMatch(/度$/);
    expect(de['면의 윤곽도']).toBe(de['선의 윤곽도']!.replace('Linien', 'Flächen'));
    expect([de['원통도'], de['동심도']]).toEqual([expect.stringMatching(/ität$/), expect.stringMatching(/ität$/)]);
    // 중국어 다중 지시선 多重引线(多行 여러 줄이 아니다), 지시선 引线(前导 앞 채움이 아니다), 연결선 基线, 첫 번째 각도 第一角度, 줄바꿈 环绕, 블록 块
    expect(zh['새 다중 지시선 스타일 작성']).toContain('多重引线');
    for (const k of ['다중 지시선 선택:', '다중 지시선 수집', '다중 지시선 스타일', '다중 지시선', '다중 지시선 문자']) {
      expect(zh[k], k).toContain('多重引线');
      expect(zh[k], k).not.toContain('多行');
    }
    for (const k of ['지시선 추가(A)', '지시선 형식 옵션 입력 [', '지시선의 최대 점 수 입력 또는 [']) {
      expect(zh[k], k).toContain(zh['지시선']);
      expect(zh[k], k).not.toMatch(/前导/);
    }
    expect(zh['지시선 추가(A)']).toBe(`${zh['지시선 추가']}(A)`);
    expect(zh['지시선 연결선 위치 지정']).toContain('基线');
    expect([zh['지시선 연결선'], zh['지시선 연결선(A)'], zh['지시선 연결선 사용 [']]).toEqual(['引线基线', '引线基线(A)', '使用引线基线 [']);
    expect([zh['지시선 연결선 먼저'], zh['지시선 화살촉 먼저']]).toEqual([zh['내용 먼저']!.replace('内容', zh['지시선 연결선']!), zh['내용 먼저']!.replace('内容', '引线箭头')]);
    expect(zh['지시선 화살촉 위치 지정:']).toBe(`${zh['지시선 화살촉 위치 지정']}：`);
    expect(zh['지시선 연결선 위치 지정:']).toBe(`${zh['지시선 연결선 위치 지정']}：`);
    expect(zh['고정 연결선 거리 지정 <{0}>:']).toContain('基线');
    expect(zh['첫 번째 각도(F)']).toBe('第一角度(F)');
    expect(zh[MLO]).toContain('/第一角度(F)/');
    expect([zh['줄바꿈'], zh['줄바꿈(W)'], zh['줄바꿈 폭 지정 또는 [']]).toEqual([strip(zh['줄바꿈(W)']), '环绕(W)', `指定${zh['줄바꿈']}宽度或 [`]);
    expect(zh[MLC]).toContain('环绕(W)');
    expect([zh['현재 간격두기 사용'], zh['현재 간격두기 사용(U)']]).toEqual(['使用当前间距', '使用当前间距(U)']);
    expect(zh['블록이 없습니다.']).toContain(zh['블록']);
    // 영어: 연결선 landing(「지시선 연결선」 Leader landing), 화살촉 Open·Closed blank, 재료 Material, (현재) current, 셀 일치 Match, 줄바꿈 Wrap
    expect(en['지시선 연결선']).toBe('Leader landing');
    expect(en['지시선 연결선(A)']).toBe(`${en['지시선 연결선']} (A)`);
    expect(en['지시선 연결선 사용 [']).toBe(`Use ${en['지시선 연결선']!.toLowerCase()} [`);
    for (const k of ['연결선 자동 포함', '연결선 거리', '연결선 간격', '고정 연결선 거리 지정 <{0}>:', '내용: {0}, 문자 높이 {1}, 화살촉 크기 {2}, 연결선 {3}, 축척 {4}']) expect(en[k], k).toMatch(/[Ll]anding/);
    expect([en['30도 열기'], en['닫고 비움']]).toEqual([expect.stringContaining(en['열기']!), `${en['닫음']} blank`]);
    expect(en['닫고 채움']).toBe(`${en['닫음']} filled`);
    expect(en['Ⓛ 최소 재료']).toBe(en['Ⓜ 최대 재료']!.replace('Ⓜ Maximum', 'Ⓛ Minimum'));
    expect(en['(현재)']).toBe(en['{0} (현재)']!.replace('{0} ', ''));
    expect(en['셀 일치']).toBe(`${en['특성 일치']!.split(' ')[0]} cell`);
    expect([en['현재 간격두기 사용'], en['현재 간격두기 사용(U)']]).toEqual(['Use current spacing', 'Use current spacing (U)']);
    expect([en['줄바꿈'], en['줄바꿈 폭 지정 또는 [']]).toEqual([strip(en['줄바꿈(W)']), 'Specify wrap width or [']);
    expect(en['줄바꿈 폭 지정 또는 [번호(N)]:']).toBe(`${en['줄바꿈 폭 지정 또는 [']}${en['번호(N)']}]:`);
    // 일본어: 현재 간격두기 사용(통째 프롬프트 기본값), 줄바꿈 折り返し(「줄바꿈(W)」), 연결선 接続線, 간격두기 지정 = 「간격두기 지정(S)」의 이름
    expect(ja[MLAL]).toContain(`<${ja['현재 간격두기 사용']}>`);
    expect([ja['줄바꿈'], ja['줄바꿈 폭 지정 또는 [번호(N)]:']]).toEqual([strip(ja['줄바꿈(W)']), `${ja['줄바꿈 폭 지정 또는 [']}${ja['번호(N)']}]:`]);
    expect(ja['내용: {0}, 문자 높이 {1}, 화살촉 크기 {2}, 연결선 {3}, 축척 {4}']).toContain(`${ja['연결선 거리']!.replace('の距離', '')} {3}`);
    expect(ja['간격두기 지정 <{0}>:']).toBe(`${strip(ja['간격두기 지정(S)'])} <{0}>:`);
    // 새 열쇠: 옵션 조각 = 이름 + 고를 글자, 앞 글 = 이름 + 「또는 [」 꼴, 통째 = 앞 글 + 조각, 결과 줄 = 틀 「{0}: 표 {1}행 {2}열」 + 동작 이름, 설명 줄 = 틀 + 내용 이름
    const conn: Record<Lang, string> = { en: ' or [', de: ' oder [', ja: '、または [', 'zh-CN': '或 [' };
    for (const l of LANGS) {
      const d = dict[l];
      const sp = l === 'en' || l === 'de' ? ' ' : '';
      const opts: [string, string][] = [
        ['지시선 화살촉 먼저', 'H'], ['지시선 연결선 먼저', 'L'], ['내용 먼저', 'C'],
        ...CELL_KW.filter((k) => k !== '정렬(A)').map((k) => [k.replace(/\([A-Z]+\)$/, ''), k.match(/\(([A-Z]+)\)$/)![1]!] as [string, string]),
        ['스타일 따름', 'S'],
        ...JUST_KW.filter((k) => k !== '중간 중심(MC)').map((k) => [k.replace(/\([A-Z]+\)$/, ''), k.match(/\(([A-Z]+)\)$/)![1]!] as [string, string]),
      ];
      for (const [k, c] of opts) expect(d[`${k}(${c})`], `${l}: ${k}`).toBe(`${d[k]}${sp}(${c})`);
      for (const k of ['지시선 화살촉 위치 지정', '지시선 연결선 위치 지정']) expect(d[`${k} 또는 [`], `${l}: ${k}`).toBe(`${d[k]}${conn[l]}`);
      for (const p of [MLA, MLL, MLT]) {
        const [front, o1, o2] = [p.slice(0, p.indexOf('[') + 1), ...p.slice(p.indexOf('[') + 1, p.indexOf(']')).split('/')];
        expect(d[p], `${l}: ${p}`).toBe(`${d[front]}${d[o1!]}/${d[o2!]}/${d['옵션(O)']}] ${d['<옵션>:']}`);
      }
      const tmpl = d['{0}: 표 {1}행 {2}열']!;
      for (const o of TABLE_OPS) expect(d[`${o}: 표 {0}행 {1}열`], `${l}: ${o}`).toBe(tmpl.replace('{0}', d[o]!).replace('{1}', '{0}').replace('{2}', '{1}'));
      const info = d['내용: {0}, 문자 높이 {1}, 화살촉 크기 {2}, 연결선 {3}, 축척 {4}']!;
      for (const c of ['여러 줄 문자', '블록', '없음']) {
        const v = info.replace('{0}', d[c]!);
        expect(d[`내용: ${c}, 문자 높이 {0}, 화살촉 크기 {1}, 연결선 {2}, 축척 {3}`], `${l}: ${c}`).toBe(v.replace('{1}', '{0}').replace('{2}', '{1}').replace('{3}', '{2}').replace('{4}', '{3}'));
        expect(d[`내용: ${c}, 문자 높이 {0}, 화살촉 크기 {1}, 연결선 없음, 축척 {2}`], `${l}: ${c} 없음`).toBe(v.replace('{3}', d['없음']!).replace('{1}', '{0}').replace('{2}', '{1}').replace('{4}', '{2}'));
      }
      for (const k of ['행 높이', '열 폭']) expect(d[`${k} 입력 <{0}>:`], `${l}: ${k}`).toContain(l === 'en' ? d[k]!.toLowerCase() : d[k]!);
    }
    expect([en['첫 번째 각도 구속 입력 <{0}>:'], en['두 번째 각도 구속 입력 <{0}>:']]).toEqual(['Enter first angle constraint <{0}>:', 'Enter second angle constraint <{0}>:']);
    expect([ja['첫 번째 각도 구속 입력 <{0}>:'], zh['두 번째 각도 구속 입력 <{0}>:']]).toEqual([`${ja['첫 번째']}の角度拘束を入力 <{0}>:`, `输入${zh['두 번째']}角度约束 <{0}>：`]);
    expect(de['첫 번째 각도 구속 입력 <{0}>:']).toBe('Erste Winkelbeschränkung eingeben <{0}>:');
    expect(zh['행 높이 입력 <{0}>:']).toBe(zh['{0} 입력 <{1}>:']!.replace('{0}', zh['행 높이']!).replace('{1}', '{0}'));
  });
});
