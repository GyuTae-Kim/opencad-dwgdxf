/**
 * 303차: 파일·저장·도면 정리 묶음(SAVEAS·QSAVE·NEW·CLOSEALL·QQUIT·SAVEALL·IMPORT·WMFOUT·PDFIMPORT·DRAWINGRECOVERY·RECOVER·AUDIT·UNITS·-UNITS·DWGPROPS·ETRANSMIT·
 * RENAME·-RENAME)의 번역과 302차가 남긴 것, 리드 결정(독일어 초점이동 PAN = Pan — 이동 MOVE의 Verschieben과 이름이 겹쳤다).
 * - 빠진 번역: 저장 확인·-UNITS 예/아니오 물음 앞 조각과 통째, -RENAME 종류별 이전·새 이름 프롬프트(틀이 한국어 종류 이름을 잡았다), 배치 이름 바꾸기 결과·오류,
 *   저장 결과 줄(틀이 형식 이름 「… 도면 (*.dwg)」·「 이진」을 잡았다), IMPORT·WMFOUT·QQUIT 결과 줄, ETRANSMIT 요약 줄(ft()가 「.zip」까지 지킴 자리에 넣어 「{0}.zip — …」 열쇠가 걸리지 않았다)·
 *   보고서 설정 줄, PDFIMPORT 축척 이름표.
 * - 오역: 감사 AUDIT(Thanks·ありがとう·谢谢), DWGPROPS 제목 「{0} 특성」(Trait·特点), -UNITS 목록(건축 Construction·構造·结构, 분수 噴水, 방향 남 M·上午·서 SEO), ETRANSMIT 转账(송금)·
 *   일본어 結合(bind), 302차가 남긴 독일어(Zeichenbildschirm·Viewport-·Fall·Datum 등)·중국어(数据标识符·连接·「…度」 빠짐 등)를 같은 사전 안의 맞는 번역으로. 프롬프트·결과 줄 꼴은 소스에서 확인한다.
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

const UNITS_Q = '각도를 시계 방향으로 측정하시겠습니까?';
const UNITS_P = `${UNITS_Q} [예(Y)/아니오(N)] <아니오>:`;
const SAVE_P = '그래도 저장하시겠습니까? [예(Y)/아니요(N)] <아니요>:';
/** -RENAME 종류(edit/util/rename.ts RENAME_KINDS) */
const KINDS = ['블록', '치수 스타일', '도면층', '선종류', '문자 스타일', '배치'];
const OLD = (k: string) => `이전 ${k} 이름 입력:`;
const NEW = (k: string) => `새 ${k} 이름 입력:`;
const PAN_PT = '초점 이동할 점 지정:';
const UCS = 'UCS의 원점 지정 또는 [이름(NA)/객체(OB)/이전(P)/뷰(V)/표준(W)/Z] <표준>:';
const CELL = '테이블 셀 선택 또는 <끝>:';
const PROMPTS = [UNITS_P, SAVE_P, ...KINDS.flatMap((k) => [OLD(k), NEW(k)]), PAN_PT, UCS, CELL];
/** 저장 형식 이름(save.ts SAVE_TYPES·TEMPLATE_TYPE 가운데 「도면」이 든 것) */
const DWG_LABELS = [
  'AutoCAD 2018/LT2018 도면 (*.dwg)',
  'AutoCAD 2013/LT2013 도면 (*.dwg)',
  'AutoCAD 2010/LT2010 도면 (*.dwg)',
  'AutoCAD 2004/LT2004 도면 (*.dwg)',
  'AutoCAD 2000/LT2000 도면 (*.dwg)',
  'AutoCAD 도면 템플릿 (*.dwt)',
];
const SAVED = (label: string) => `{0}을(를) ${label} 형식으로 저장했습니다({1} KB, {2}ms).`;
const BINARY = '{0}을(를) {1} 이진 형식으로 저장했습니다({2} KB, {3}ms).';
const SUM_REP = '{0} — 파일 {1}개 + 보고서 (주 도면 {2})';
const SUM = '{0} — 파일 {1}개 (주 도면 {2})';
/** ETRANSMIT 보고서 설정 줄(edit/transmit/plan.ts transmitReport) */
const REPORT = [
  '폴더 유형: 트리 유지(도면에 저장된 상대 경로대로)',
  '폴더 유형: 단일 폴더(모든 파일을 하나의 폴더에)',
  '도면 파일 형식: 기존 파일 형식 유지',
  '외부 참조: 그대로',
  '외부 참조: 결합으로 바꿈(외부 참조 파일은 넣지 않음)',
  '참조 경로: 유지',
  '참조 경로: 지움(파일 이름만)',
  '포함한 파일 (3 + 이 보고서)',
];
const VPARR = '뷰포트 배열 입력 [수평(H)/수직(V)/위(A)/아래(B)/왼쪽(L)/오른쪽(R)] <오른쪽>:';

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.unstubAllGlobals();
});

describe('파일·저장·도면 정리 묶음의 번역과 302차가 남긴 것(303차)', () => {
  it('명령행 입력 줄(앞 글 「… [」·옵션·뒤 글)이 네 언어 모두 한국어 없이 보이고, 고친 조각 낱말이 보인다', async () => {
    for (const [f, s] of [
      ['app/dashcmds-tables.ts', `const angdir = await askYN(ctx, '${UNITS_Q}', u.angdir === 1);`],
      ['app/dashcmds-ask.ts', "const k = await askOption(ctx, `${prompt} [예(Y)/아니오(N)] <${def ? '예' : '아니오'}>:`, YES_NO, def ? 'Y' : 'N');"],
      ['app/save.ts', `const r = await ctx.getPoint('${SAVE_P}', {`],
      ['app/util2-misc.ts', 'const oldName = (await askText(ctx, `이전 ${kd.label} 이름 입력:`)).trim();'],
      ['app/util2-misc.ts', 'const newName = (await askText(ctx, `새 ${kd.label} 이름 입력:`)).trim();'],
      ...KINDS.map((k) => ['edit/util/rename.ts', `label: '${k}'`]),
      ['app/filecmds-layout.ts', `const b = await ctx.getPoint('${PAN_PT}', { base: a.point });`],
      ['app/ucs.ts', `const r = await ctx.getPoint('${UCS}', {`],
      ['app/tablecmds.ts', `first ? '테이블 셀 선택:' : '${CELL}'`],
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
    // 예/아니오 물음: 앞 조각 = 물음 번역 + 「 [」(-UNITS), 저장 확인은 통째 열쇠의 앞부분
    for (const l of LANGS) {
      const d = dict[l];
      expect(at(l, UNITS_P), l).toContain(`${d[`${UNITS_Q} [`]}${d['예(Y)']}/${d['아니오(N)']}]`);
      expect(at(l, SAVE_P), l).toContain(`${d['그래도 저장하시겠습니까? [']}${d['예(Y)']}/${d['아니요(N)']}]`);
    }
    // -RENAME: 종류 이름이 그 언어로(틀 「이전 {0} 이름 입력:」은 한국어 종류 이름을 잡았다)
    expect(at('en', OLD('블록'))).toBe('Enter old block name:');
    expect(at('de', NEW('문자 스타일'))).toBe('Geben Sie einen neuen Textstilnamen ein:');
    expect(at('ja', OLD('배치'))).toBe('古いレイアウト名を入力:');
    expect(at('zh-CN', NEW('선종류'))).toBe('输入新的线型名称：');
    // MVSETUP 정렬의 「초점 이동할 점」: 독일어 Pan(리드 결정 — Fokuspunkt 초점이 아니다), 영어·일본어도 「초점이동」의 낱말
    expect(at('de', PAN_PT)).toBe('Punkt für Pan angeben:');
    expect(at('en', PAN_PT)).toBe('Specify point to pan:');
    expect(at('ja', PAN_PT)).toBe('画面移動する点を指定:');
    // 중국어 UCS 객체(OB) 对象(物体 물체가 아니다), 테이블 셀 <끝> 꺾쇠(结束位置가 아니다)
    expect(at('zh-CN', UCS)).toContain('/对象(OB)/');
    expect(at('zh-CN', CELL)).toBe('选择表格单元格或 <结束>：');
  });

  it('결과·이름표 줄(저장·IMPORT·WMFOUT·QQUIT·RENAME·ETRANSMIT 요약·보고서·PDFIMPORT)과 기록 줄(-UNITS 예/아니오·VPORTS 배열)이 네 언어 모두 한국어 없이 보인다', () => {
    for (const [f, s] of [
      // 340차: 형식 이름을 화면 언어로 끼움(uiText) · IMPORT는 통째 문장 둘(재정의했습니다/만들었습니다)과 덧붙인 문장을 따로 옮김
      ['app/save.ts', "ctx.print(`${ft(name)}을(를) ${uiText(label)}${t.binary ? ' 이진' : ''} 형식으로 저장했습니다(${(res.data.byteLength / 1024).toFixed(0)} KB, ${Math.round(res.ms)}ms).`);"],
      ...DWG_LABELS.map((x) => ['app/save.ts', `label: '${x}'`]),
      ['app/filecmds-export.ts', "개로 블록 \"${ft(name)}\"을(를) 재정의했습니다.` : `"],
      ['app/filecmds-export.ts', "ctx.print(`${uiText(made)}${skipped ? ` ${uiText(`옮길 수 없는 객체(${skipped})는 뺐습니다.`)}` : ''}`);"],
      ['app/filecmds-export.ts', "KB, 지금 ${st.onLayout ? '배치 용지' : '화면'} 범위, 래스터 이미지는 빠집니다).`);"],
      ['app/filecmds.ts', "ctx.print(`${n ? `도면 ${n}개를 모두 닫았습니다. ` : ''}브라우저에서는 이 탭을 직접 닫으십시오.`);"],
      ['app/util2-misc.ts', 'ctx.print(`${kd.label} "${ft(oldName)}"을(를) 찾을 수 없습니다.`, \'err\');'],
      ['app/util2-misc.ts', 'ctx.print(`${RENAME_KINDS.find((y) => y.kind === k)!.label} ${ft(x.orig)} → ${ft(x.now)}`);'],
      ['app/transmit.ts', "sum.textContent = `${ft(`${baseName(st.saveName)}.zip`)} — 파일 ${plan.files.length}개${read().report ? ' + 보고서' : ''}"],
      ['edit/transmit/plan.ts', "L.push(`  폴더 유형: ${settings.folder === 'flat' ? '단일 폴더(모든 파일을 하나의 폴더에)' : '트리 유지(도면에 저장된 상대 경로대로)'}`);"],
      ['edit/transmit/plan.ts', "keep: '기존 파일 형식 유지',"],
      ['edit/transmit/plan.ts', "L.push(`  외부 참조: ${settings.bind ? '결합으로 바꿈(외부 참조 파일은 넣지 않음)' : '그대로'}`);"],
      ['edit/transmit/plan.ts', "L.push(`  참조 경로: ${settings.clearPaths || settings.folder === 'flat' ? '지움(파일 이름만)' : '유지'}`);"],
      ['edit/transmit/plan.ts', "L.push(`포함한 파일 (${plan.files.length}${settings.report ? ' + 이 보고서' : ''})`);"],
      ['app/pdfimport.ts', "label: `축척(1 = 실제 크기, ${metric ? 'mm' : '인치'})`"],
    ])
      expect(src(f!), s).toContain(s);
    const tr = (l: string) => (x: string) => guardedTranslate(x, l) ?? translate(x, l);
    const show = (s: string, l: string) => translateTail(s, tr(l)(s), tr(l));
    const LINES = [
      ...DWG_LABELS.map((x) => `${ft('plan.dwg')}을(를) ${x} 형식으로 저장했습니다(120 KB, 35ms).`),
      `${ft('plan.dxf')}을(를) AutoCAD 2018 DXF (*.dxf) 이진 형식으로 저장했습니다(120 KB, 35ms).`,
      `${ft('a.dwg')}의 모형 객체 12개로 블록 "${ft('A')}"을(를) 만들었습니다.`,
      `객체 3개를 ${ft('a.wmf')}(으)로 저장했습니다(1.2 KB, 지금 화면 범위, 래스터 이미지는 빠집니다).`,
      `객체 3개를 ${ft('a.wmf')}(으)로 저장했습니다(1.2 KB, 지금 배치 용지 범위, 래스터 이미지는 빠집니다).`,
      '도면 3개를 모두 닫았습니다. 브라우저에서는 이 탭을 직접 닫으십시오.',
      ...KINDS.flatMap((k) => [`${k} "${ft('A1')}"을(를) 찾을 수 없습니다.`, `${k} ${ft('A1')} → ${ft('B1')}`]),
      `${ft('plan.zip')} — 파일 3개 + 보고서 (주 도면 ${ft('plan.dwg')})`,
      `${ft('plan.zip')} — 파일 3개 (주 도면 ${ft('plan.dwg')})`,
      ...REPORT,
      '축척(1 = 실제 크기, 인치)',
      // 340차: IMPORT로 있던 블록을 다시 정의(통째 문장 — 차례 번호 단언 밖이라 끝에)
      `${ft('a.dwg')}의 모형 객체 12개로 블록 "${ft('A')}"을(를) 재정의했습니다.`,
    ];
    const RECORDS =[`${UNITS_P} Y`, `${UNITS_Q} [예(Y)/아니오(N)] <예>: N`, `${VPARR} L`];
    // 341차: 형식마다의 저장 틀 여섯은 지웠다 — 앱(340차 save.ts)처럼 형식 이름을 화면 언어로 끼운 줄을 일반 틀 「{0}을(를) {1}{2} 형식으로 …」가 옮긴다
    const ui = (s: string, l: string) => DWG_LABELS.reduce((a, x) => a.replace(`을(를) ${x} 형식`, `을(를) ${translate(x, l)} 형식`), s);
    const left: string[] = [];
    for (const l of LANGS) {
      for (const s of LINES) if (HANGUL.test(tr(l)(ui(s, l)))) left.push(`${l}: ${tr(l)(ui(s, l))}`);
      for (const s of RECORDS) if (HANGUL.test(show(s, l))) left.push(`${l}: ${show(s, l)}`);
    }
    expect(left).toEqual([]);
    expect(tr('en')(ui(LINES[0]!, 'en'))).toBe('Saved plan.dwg in format AutoCAD 2018/LT2018 drawings (*.dwg) (120 KB, 35 ms).');
    expect(tr('zh-CN')(ui(LINES[4]!, 'zh-CN'))).toBe('plan.dwg 已保存为 AutoCAD 2000/LT2000 图纸 (*.dwg) 格式（120 KB，35 毫秒）。');
    expect(tr('de')(LINES[6]!)).toBe('Gespeichert plan.dxf im Format AutoCAD 2018 DXF (*.dxf) binär (120 KB, 35 ms).');
    expect(tr('zh-CN')(LINES[7]!)).toBe('已用 a.dwg 的 12 个模型对象创建块“A”。');
    expect(tr('ja')(LINES[9]!)).toBe('オブジェクト 3 個を a.wmf として保存しました (1.2 KB、現在のレイアウト用紙範囲、ラスターイメージは抜けます)。');
    expect(tr('en')(LINES[10]!)).toBe('All 3 drawings have been closed. Please close this tab directly in your browser.');
    expect(tr('en')(`배치 "${ft('A1')}"을(를) 찾을 수 없습니다.`)).toBe('Layout "A1" not found.');
    expect(tr('ja')(`배치 ${ft('A1')} → ${ft('B1')}`)).toBe('レイアウト A1 → B1');
    expect(tr('de')(`${ft('plan.zip')} — 파일 3개 + 보고서 (주 도면 ${ft('plan.dwg')})`)).toBe('plan.zip – 3 Dateien + Bericht (Hauptzeichnung plan.dwg)');
    expect(tr('zh-CN')(`${ft('plan.zip')} — 파일 3개 (주 도면 ${ft('plan.dwg')})`)).toBe('plan.zip — 文件 3（主图 plan.dwg）');
    expect(tr('ja')(REPORT[0]!)).toBe('フォルダーの種類: ツリーを保持(図面に保存された相対パスのまま)');
    expect(tr('en')(REPORT[2]!)).toBe('Drawing file format: Maintain existing file format');
    expect(tr('zh-CN')(REPORT[7]!)).toBe('嵌入式文件 (3 + 本报告)');
    expect(tr('en')('축척(1 = 실제 크기, 인치)')).toBe('Scale (1 = actual size, inch)');
    expect(show(RECORDS[0]!, 'en')).toBe('Do you want to measure the angle clockwise? [Yes (Y)/No (N)] <No>: Y');
    expect(show(RECORDS[1]!, 'zh-CN')).toBe('您想顺时针测量角度吗？ [是(Y)/否(N)] <是>：N');
    expect(show(RECORDS[2]!, 'de')).toBe('Ansichtsfenster-Layout eingeben [Horizontal (H)/Vertikal (V)/Oben (A)/Unten (B)/Links (L)/Rechts (R)] <Rechts>: L');
  });

  it('리드 결정과 고친 번역은 같은 사전의 낱말이다 — 새 열쇠는 조각·틀 번역에서 만든 꼴', () => {
    const [en, de, ja, zh] = [dict.en, dict.de, dict.ja, dict['zh-CN']];
    // 리드 결정: 독일어 초점이동(PAN)은 Pan(AutoCAD 독일어판 낱말) — 이동(MOVE) Verschieben과 같은 이름이던 것, MOVE는 그대로
    expect(de['초점이동']).toBe('Pan');
    expect(de['이동']).toBe('Verschieben');
    expect(de['확대/축소 및 초점이동 명령을 결합하시겠습니까?']).toContain(`„${de['초점이동']}“`);
    const pan = Object.keys(de).filter((k) => /초점\s?이동/.test(k));
    // 323차: UNDO 「확대/축소 및 초점이동 명령을 결합하시겠습니까?」 명령행 물음의 앞 조각(… [)·통째(… [예(Y)/아니오(N)] <{0}>:) 열쇠 둘이 더해져 6(값도 „Pan“)
    expect(pan.length).toBe(6);
    for (const k of pan) {
      expect(de[k], k).toMatch(/Pan|pannen/);
      expect(de[k], k).not.toMatch(/verschieb|Fokus/i);
    }
    // 감사(AUDIT): 「객체 감사」·「블록 감사」의 낱말(Thanks·ありがとう·谢谢가 아니다), 단계 이름도 같은 낱말
    expect(en['감사']).toBe(en['객체 감사']!.split(' ')[1]);
    expect(ja['감사']).toBe(ja['객체 감사']!.replace('オブジェクト', ''));
    expect(zh['감사']).toBe(zh['객체 감사']!.slice(0, 2));
    expect(en['테이블 감사']).toBe(`Table ${en['감사']}`);
    expect(ja['헤더 감사']).toContain(ja['감사']);
    // DWGPROPS 제목 「{0} 특성」: 「도면 특성…」의 낱말(Trait·特点 특징이 아니다)
    expect(en['{0} 특성']).toBe(`{0} ${en['도면 특성…']!.replace('Drawing ', '').replace('…', '')}`);
    expect(ja['{0} 특성']).toBe(`{0}${ja['특성']}`);
    expect(zh['{0} 특성']).toBe(`{0} ${zh['도면 특성…']!.slice(2, 4)}`);
    // -UNITS 목록: 낱말 열쇠(UNITS 대화 상자)와 같은 번역(건축 Construction·構造·结构, 분수 噴水 분수대, 과학 Science가 아니다), 측량 = 「미국 측량 피트」의 낱말
    for (const d of [en, ja, zh]) expect(d['4. 건축 1\'-3 1/2"']).toBe(`4. ${d['건축']} 1'-3 1/2"`);
    expect(ja['5. 분수 15 1/2']).toBe(`5. ${ja['분수']} 15 1/2`);
    expect(en['1. 과학 1.55E+01']).toBe(`1. ${en['과학']} 1.55E+01`);
    expect(en['5. 측량 단위 N 45d0\'0" E']).toBe(`5. ${en['측량 단위']} N 45d0'0" E`);
    expect(en['측량 단위']).toContain(en['미국 측량 피트']!.split(' ')[1]);
    // 방향 제어: 이웃 줄(동 East 3:00·북 North 12:00) 꼴, 중국어 남·서·북은 「남서 등각」 西南·「북서 등각」 西北의 글자(上午 오전·SEO가 아니다)
    expect(en['동 3 시 = 0']).toBe('East 3:00 = 0');
    expect([en['남 6 시 = 270'], en['서 9 시 = 180']]).toEqual(['South 6:00 = 270', 'West 9:00 = 180']);
    expect([zh['북 12 시 = 90'], zh['서 9 시 = 180'], zh['남 6 시 = 270']]).toEqual(['北 12 点钟方向 = 90', '西 9 点钟方向 = 180', '南 6 点钟方向 = 270']);
    expect(zh['남서 등각']).toMatch(/^西南/);
    // ETRANSMIT: 중국어 전송 传输(转账 송금이 아니다), 일본어 결합(bind) バインド(「결합(B)」 — 結合 JOIN이 아니다), 영어 bind·넣기 include
    for (const [k, v] of Object.entries(zh)) if (k.includes('전송')) expect(v, k).not.toContain('转账');
    expect(zh['이 전송에 대한 메모']).toContain(zh['전송 설정']!.slice(0, 2));
    expect(ja['결합(B)']).toBe('バインド(B)');
    for (const k of [
      '"{0}" 안의 중첩 외부 참조 {1}개는 결합 블록에 넣지 않았습니다.',
      '"{0}"을(를) 결합할 때 옮길 수 없는 객체 {1}개(다중 지시선·이미지·표 등)를 뺐습니다.',
      '외부 참조 "{0}"은(는) 로드되지 않아 결합하지 못했습니다(경로만 남은 외부 참조).',
      '외부 참조를 결합으로 바꾸기',
      '패키지의 지금 도면 사본에서 외부 참조를 블록으로 결합하고 외부 참조 파일은 넣지 않습니다.',
    ]) {
      expect(ja[k], k).toContain('バインド');
      expect(ja[k], k).not.toMatch(/結合|統合/);
    }
    for (const k of ['"{0}" 안의 중첩 외부 참조 {1}개는 결합 블록에 넣지 않았습니다.', '"{0}"을(를) 결합할 때 옮길 수 없는 객체 {1}개(다중 지시선·이미지·표 등)를 뺐습니다.'])
      expect(en[k], k).toMatch(/\bbound\b|\bbinding\b/);
    expect(en['"{0}"을(를) 넣지 못했습니다: {1}']).toContain(en['전송 보고서를 패키지에 넣기']!.split(' ')[0]!.toLowerCase());
    expect(zh['"{0}"을(를) 넣지 못했습니다: {1}']).toContain('放入');
    expect(zh['전송 보고서를 패키지에 넣기']).toContain('放入');
    // 묶음의 나머지: PDF 쪽 Page(Strip 띠가 아니다), RECOVER 검사(명령꼴 Examine이 아니다), 주제 Subject, 지금 now·今すぐ, 일본어 플롯 プロット(印刷 인쇄가 아니다)·찾음·이름 바꾸기 단추
    expect(en['쪽(1~{0})']).toMatch(/^Page /);
    expect(en['{0}을(를) 열었습니다. 도면을 검사합니다.']).toContain('Checking');
    expect(en['복구(파일 열고 검사)…']).toContain('check');
    expect(en['주제']).toBe(strip(en['주제(S)']));
    expect([en['지금 자동 저장'], ja['지금 자동 저장']]).toEqual(['Auto-save now', '今すぐ自動保存']);
    expect(en['기존 파일 형식 유지']).not.toMatch(/As of/);
    expect(ja['플롯(PDF)…']).toContain(ja['PDF (*.pdf) — 플롯']!.split('— ')[1]);
    expect(ja['찾음']!.slice(0, 4)).toBe(ja['찾을 수 없음']!.slice(0, 4));
    expect(ja['다음으로 이름 바꾸기(R):']).toBe('変更後の名前(R):');
    expect(ja['다음으로 대치']).toMatch(/^置換後の/);
    expect([en['초점 이동할 점 지정:'], ja['초점 이동할 점 지정:']]).toEqual([`Specify point to ${en['초점이동']!.toLowerCase()}:`, `${ja['초점이동']}する点を指定:`]);
    // 중국어 묶음: 만들기 创建(已创建 만들어짐이 아니다)·예제 도면 열기 打开(正在打开 여는 중이 아니다)·= 줄 남은 조각·이름 바꿈 결과 어순
    expect(zh['만들기']).toBe('创建');
    expect(zh['전송 파일 작성']).toMatch(/^创建/);
    expect(zh['예제 도면 열기']).toBe(`${zh['열기…']!.replace('…', '')}示例图形`);
    expect(zh['이름에 = 를 쓸 수 없습니다.']).toBe('名称中不能使用 = 等符号。');
    expect(zh['이름 {0}개를 바꿨습니다.']).toBe(`已${zh['이름 바꾸기(명령행)']!.slice(0, 3)} {0} 个名称。`);
    // 302차가 남긴 중국어: 화면 그리는 중 正在(绘图屏幕이 아니다), 데이텀 基准(数据 데이터가 아니다), 작성 날짜 = 「만든 날짜」, <끝>, Enter 키, 연결선 基线(「지시선 연결선」), 「…度」, 필드 어순, 객체(OB)
    expect(zh['화면 그리는 중']).toMatch(new RegExp(`^${zh['처리 중']!.slice(0, 2)}`));
    for (const k of ['데이텀 식별자', '데이텀 식별자(D)']) expect(zh[k], k).toMatch(new RegExp(`^${zh['데이텀 1']!.slice(0, 2)}`));
    expect(zh['작성 날짜']).toBe(zh['만든 날짜: {0}']!.split('：')[0]);
    expect(zh['테이블 셀 선택 또는 <끝>:']).toContain(zh['<끝>:']!.replace(':', ''));
    expect(zh['Enter 아래 셀 · Alt+Enter 줄 바꿈 · Tab 다음 셀 · Ctrl+Enter 확인']).toMatch(/^Enter /);
    for (const k of ['연결선', '연결선 간격', '연결선 거리', '연결선 자동 포함']) {
      expect(zh[k], k).toContain(zh['지시선 연결선']!.slice(2));
      expect(zh[k], k).not.toContain('连接');
    }
    for (const k of ['대칭도', '위치도', '경사도']) expect(zh[k], k).toMatch(/度$/);
    expect(zh['경사도']).toBe(`${zh['기울기']}度`);
    expect([zh['{0}개의 필드를 업데이트했습니다.'], zh['{0}개의 필드를 찾았습니다.']]).toEqual(['已更新 {0} 个字段。', '找到 {0} 个字段。']);
    expect(zh['객체(OB)']).toBe('对象(OB)');
    expect(zh[UCS]).toContain('对象 (OB)');
    // 302차가 남긴 독일어: 「… 중」 wird …, 바꾸기 ersetzen, 쓸 수 없는 문자, 구성 Konfiguration, 플롯 geplottet, 플롯 스탬프, 뷰포트 Ansichtsfenster(Ansichtsbereich·Viewport가 아니다),
    // 대소문자 Groß-/Kleinschreibung(Fall 경우가 아니다), 재료 Material(Zutaten 음식 재료가 아니다), 데이텀 Bezug(Datum 날짜가 아니다), 끊기 Unterbrechung, 다중 지시선 Multileader
    for (const k of ['화면 그리는 중', '글꼴 받는 중']) expect(de[k], k).toMatch(/ wird /);
    expect(de['글꼴 받는 중']).toContain(de['내려받기']!.replace('Herunterladen', 'heruntergeladen'));
    expect(de['뷰 "{0}"이(가) 이미 있습니다. 바꾸시겠습니까?']).toContain('ersetzen');
    expect(de['"{0}"을(를) 무엇으로 바꾸겠습니까:']).toMatch(/^Ersetzen /);
    expect(de['휠을 굴리거나 가운데 버튼으로 끌어 확대·이동하십시오.']).not.toMatch(/ Zum /);
    expect(de['뷰 이름에 쓸 수 없는 문자가 있습니다.']).toContain('die nicht verwendet werden dürfen');
    expect(de['이름에 쓸 수 없는 문자가 있습니다.']).toContain('die nicht verwendet werden dürfen');
    expect(de['구성 입력 [']).toBe(`${de['구성 입력 [수평(H)/수직(V)] <수직>:']!.split(' [')[0]} [`);
    expect(de['도면 한계가 없어 범위를 플롯합니다.']).toContain('geplottet');
    expect(de['{0}(으)로 플롯했습니다.']).toContain('geplottet');
    expect(de['한 줄로 플롯 스탬프']).toMatch(new RegExp(`^${de['플롯 스탬프']}`));
    for (const k of [
      '자를 뷰포트 선택:',
      '자를 수 있는 객체(블록·외부 참조, 이미지, 언더레이, 뷰포트)가 아닙니다.',
      '뷰포트 구성',
      '뷰포트 구성 {0}을(를) 저장했습니다.',
      '뷰포트 구성 {0}을(를) 찾을 수 없습니다.',
      // 334차가 결과가 쓰이지 않는 틀 「{0} 뷰포트 구성의 이름 입력 또는 [?]:」을 지움 — 그 물음의 앞 조각(333차)
      '저장할 뷰포트 구성의 이름 입력 또는 [',
      VPARR,
    ]) {
      expect(de[k], k).toContain('Ansichtsfenster');
      expect(de[k], k).not.toMatch(/Ansichtsbereich|Viewport/);
    }
    expect(de[VPARR]).toMatch(new RegExp(`^${de['뷰포트 배열 입력 [']!.replace('[', '\\[')}`));
    for (const k of ['대소문자', '대소문자 선택 [', '대소문자 전환(G)']) expect(de[k], k).toMatch(new RegExp(`^${de['대소문자 일치']!.split(' ')[0]!.replace(/[/-]/g, '\\$&')}`));
    expect(de['Ⓛ 최소 재료']).toBe(de['Ⓜ 최대 재료']!.replace('Ⓜ Maximales', 'Ⓛ Minimales'));
    expect([de['데이텀 1'], de['데이텀 2'], de['데이텀 3'], de['데이텀 식별자'], de['데이텀 식별자(D)']]).toEqual(['Bezug 1', 'Bezug 2', 'Bezug 3', 'Bezugskennung', 'Bezugskennung (D)']);
    expect(de['데이텀 삼각형']).toMatch(/^Bezug/);
    expect(de['끊기 크기']).toMatch(new RegExp(`^${strip(de['끊기(B)'])}`));
    expect(de['블록 정의를 찾을 수 없는 다중 지시선이 있습니다.']).toContain(de['다중 지시선']);
    // 새 열쇠: 예/아니오 통째 = 앞 조각 + 예(Y)·아니오(N) 조각 + 「] <{0}>:」, -RENAME 종류별 = 「이전·새 도면층 이름 입력:」 꼴, 결과 줄 = 틀 + 앱 낱말
    const word = { en: 'layer', ja: '画層', 'zh-CN': '图层', de: 'Layer' } as const;
    for (const l of LANGS) {
      const d = dict[l];
      const colon = l === 'zh-CN' ? '：' : ':';
      expect(d[`${UNITS_Q} [`], l).toBe(`${d[UNITS_Q]} [`);
      expect(d[`${UNITS_Q} [예(Y)/아니오(N)] <{0}>:`], l).toBe(`${d[`${UNITS_Q} [`]}${d['예(Y)']}/${d['아니오(N)']}] <{0}>${colon}`);
      expect(d['그래도 저장하시겠습니까? ['], l).toBe(d[SAVE_P]!.slice(0, d[SAVE_P]!.indexOf('[') + 1));
      for (const k of ['블록', '치수 스타일', '선종류', '문자 스타일', '배치']) {
        const w = l === 'en' ? d[k]!.toLowerCase() : d[k]!;
        expect(d[OLD(k)], `${l}: ${k}`).toBe(d[OLD('도면층')]!.replace(word[l], w));
        if (k !== '배치') expect(d[NEW(k)], `${l}: ${k}`).toBe(l === 'zh-CN' ? d['새 {0} 이름 입력:']!.replace(' {0}', w) : d[NEW('도면층')]!.replace(word[l], w));
      }
      expect(d['배치 "{0}"을(를) 찾을 수 없습니다.'], l).toBe(d['도면층 "{0}"을(를) 찾을 수 없습니다.']!.replace(word[l] === 'layer' ? 'Layer' : word[l], d['배치']!));
      expect(d['배치 {0} → {1}'], l).toBe(`${d['배치']} {0} → {1}`);
      const saved = d['{0}을(를) {1}{2} 형식으로 저장했습니다({3} KB, {4}ms).']!;
      // 341차: 형식마다의 틀은 지웠다(쓰는 곳 0 — 340차부터 형식 이름을 화면 언어로 끼워 일반 틀 saved가 같은 문장을 만든다). 형식 이름 열쇠는 한글 없이
      for (const x of DWG_LABELS) {
        expect(d[SAVED(x)], `${l}: ${x}`).toBeUndefined();
        expect(saved.replace('{1}', d[x]!), `${l}: ${x}`).not.toMatch(HANGUL);
      }
      if (l !== 'zh-CN') expect(d[BINARY], l).toBe(saved.replace('{2}', ` ${{ en: 'binary', ja: 'バイナリ', de: 'binär' }[l]}`).replace('{3}', '{2}').replace('{4}', '{3}'));
      const sum = d['{0}.zip — 파일 {1}개{2}{3}{4} (주 도면 {5})']!.replace('{0}.zip', '{0}');
      expect(d[SUM_REP], l).toBe(sum.replace('{2}', ` ${d['+ 보고서']}`).replace('{3}', '').replace('{4}', '').replace('{5}', '{2}'));
      expect(d[SUM], l).toBe(sum.replace('{2}', '').replace('{3}', '').replace('{4}', '').replace('{5}', '{2}'));
      expect(d['도면 {0}개를 모두 닫았습니다. 브라우저에서는 이 탭을 직접 닫으십시오.'], l).toBe(
        `${d['도면 {0}개를 모두 닫았습니다.']}${l === 'en' || l === 'de' ? ' ' : ''}${d['{0}브라우저에서는 이 탭을 직접 닫으십시오.']!.replace('{0}', '')}`,
      );
      expect(d['폴더 유형: 단일 폴더(모든 파일을 하나의 폴더에)'], l).toBe(d['폴더 유형: {0}']!.replace('{0}', d['단일 폴더(모든 파일을 하나의 폴더에)']!));
      expect(d['폴더 유형: 트리 유지(도면에 저장된 상대 경로대로)'], l).toMatch(new RegExp(`^${d['폴더 유형: {0}']!.replace('{0}', '')}`));
      if (l !== 'de') expect(d['도면 파일 형식: 기존 파일 형식 유지'], l).toBe(d['도면 파일 형식: {0}']!.replace('{0}', d['기존 파일 형식 유지']!));
      expect(d['외부 참조: 그대로'], l).toBe(d['외부 참조: {0}']!.replace('{0}', d['그대로']!));
      expect(d['외부 참조: 결합으로 바꿈(외부 참조 파일은 넣지 않음)'], l).toMatch(new RegExp(`^${d['외부 참조: {0}']!.replace('{0}', '')}.*(bound|バインド|绑定|Binden)`));
      expect(d['참조 경로: 유지'], l).toBe(d['참조 경로: {0}']!.replace('{0}', d['유지']!));
      expect(d['참조 경로: 지움(파일 이름만)'], l).toContain(d['참조 경로 지우기(파일 이름만)']!.replace(/^[^(（]*/, ''));
      expect(d['포함한 파일 ({0} + 이 보고서)'], l).toBe(d['포함한 파일 ({0}{1})']!.replace('{1}', ` ${d['+ 이 보고서']}`));
      expect(d['축척(1 = 실제 크기, 인치)'], l).toBe(d['축척(1 = 실제 크기, {0})']!.replace('{0}', l === 'en' ? d['인치']!.toLowerCase() : d['인치']!));
    }
    // IMPORT·WMFOUT: 만들기·지금 화면 범위·배치 용지의 낱말
    expect(en['{0}의 모형 객체 {1}개로 블록 "{2}"을(를) 만들었습니다.']).toMatch(new RegExp(`^${en['만들기']}d `));
    expect(ja['{0}의 모형 객체 {1}개로 블록 "{2}"을(를) 만들었습니다.']).toContain(ja['만들기']);
    expect(zh['{0}의 모형 객체 {1}개로 블록 "{2}"을(를) 만들었습니다.']).toContain(zh['만들기']);
    const WMF = (w: string) => `객체 {0}개를 {1}(으)로 저장했습니다({2} KB, 지금 ${w} 범위, 래스터 이미지는 빠집니다).`;
    expect(ja[WMF('화면')]).toContain(ja['지금 화면 범위를 SVG로 저장했습니다.']!.slice(0, 7));
    expect(zh[WMF('화면')]).toContain(zh['지금 화면 범위를 SVG로 저장했습니다.']!.slice(0, 6));
    expect(de[WMF('화면')]).toContain(de['지금 화면 범위를 SVG로 저장했습니다.']!.split(' ')[0]);
    expect(en[WMF('배치 용지')]).toContain(`now ${en['배치 용지']!.toLowerCase()} extents`);
    for (const d of [ja, zh]) expect(d[WMF('배치 용지')]).toContain(d['배치 용지']);
    expect(de[WMF('배치 용지')]).toContain(de['배치 용지']);
  });
});
