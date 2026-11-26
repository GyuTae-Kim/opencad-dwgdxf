/**
 * 291차: 소거(PURGE·-PURGE)·블록 대치(BLOCKREPLACE·BLOCKTOXREF의 소거)·객체 격리(ISOLATEOBJECTS·HIDEOBJECTS·UNISOLATEOBJECTS) 묶음과
 * 290차가 한도 밖으로 남긴 줄(LAYTHW·COPYTOLAYER·SETBYLAYER·도면층 상태·LAYWALK·LAYTRANS·필터)의 번역 — 오역과 빠진 번역.
 * - 빠진 번역: -PURGE는 명사(블록·도면층 …)를 틀로 끼워 묻고 알린다 — 공용 번역기의 틀은 잡은 값을 옮기지 않으므로
 *   (「{0} "{1}"을(를) 삭제하는 중입니다.」·「참조되지 않은 {0}이(가) 없습니다.」) 네 언어 모두 한국어 명사가 남고, 확인 물음의 앞 조각
 *   「… 소거하시겠습니까? [」는 열쇠가 없어 통째로 한국어였다. BLOCKREPLACE·BLOCKTOXREF 결과 줄의 꼬리(소거했습니다·건너뛰었습니다)도 틀이 잡아 한국어.
 * - 오역: 소거를 비우기·지우기(Clear·erase·橡皮擦·Löschen)로, 일본어는 AutoCAD 일본어판 ERASE 이름(削除)으로, 고립된 데이터를 격리(Isolated·隔离·Isolierte)로,
 *   다중선 스타일을 여러 줄 문자·폴리선(多行·多段线·Mehrzeilig)으로, 대치(S)를 소리 옮김(Daechi)으로, 격리를 검역(quarantine·Quarantäne)으로,
 *   동결 해제를 tauen·Frieren으로, 특성 필터를 블록 속성 필터(Attributfilter)로, 필터를 사진 필터(滤镜)로 옮긴 것 — 같은 사전 안의 맞는 번역으로 고쳤다.
 * 프롬프트는 소스에서 모은다(dashcmds-tables PURGE_KINDS·PURGE_EXTRA·-PURGE 첫 프롬프트, dashcmds-ask askYN, blkcmds-xref 소거 물음).
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

const purgeSrc = src('dashcmds-tables.ts');
/** -PURGE가 묻고 알리는 명사(표 항목·블록 5 + 이름 있는 객체·등록된 응용프로그램 5) */
const NOUNS = [...purgeSrc.matchAll(/noun: '([^']+)'/g)].map((m) => m[1]!);
/** -PURGE 첫 프롬프트 */
const MAIN = /'(소거할 사용하지 않는 객체 유형 입력 \[[^']+)'/.exec(purgeSrc)![1]!;
/** askYN(dashcmds-ask.ts) 꼴: 물음 [예(Y)/아니오(N)] <기본값>: */
const yn = (q: string, def: boolean) => `${q} [예(Y)/아니오(N)] <${def ? '예' : '아니오'}>:`;
const VERIFY_Q = '소거할 각 이름을 확인하시겠습니까?';
const XREF_Q = '끝나면 참조되지 않는 항목을 소거하시겠습니까?';
/** 명사마다 확인 물음(기본값 아니오 — 도면 이름은 ft) */
const CONFIRM = NOUNS.map((n) => yn(`${n} "${ft('OLD-1')}"을(를) 소거하시겠습니까?`, false));
const PROMPTS = [
  MAIN,
  yn(VERIFY_Q, true),
  ...CONFIRM,
  yn(XREF_Q, true),
  // COPYTOLAYER(이미 있던 열쇠 — 290차 보고의 독일어 Exit·중국어 앞 조각)
  '지정된 기준점 또는 [종료(X)] <종료>:',
  `도면층 "${ft('NEW')}"이(가) 없습니다. 만드시겠습니까? [예(Y)/아니오(N)] <예>:`,
];

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.unstubAllGlobals();
});

describe('소거·블록 대치·객체 격리 묶음의 번역(291차)', () => {
  it('명령행 입력 줄(앞 글 「… [」·옵션 「이름(글자)」·뒤 글 「] <…>:」)이 네 언어 모두 한국어 없이 보인다', async () => {
    // 소스에서 모은 프롬프트가 명령이 내는 글과 같다(코드가 짜 맞추는 꼴)
    expect(NOUNS).toEqual(['블록', '치수 스타일', '도면층', '선종류', '문자 스타일', '그룹', '다중 지시선 스타일', '다중선 스타일', '테이블 스타일', '등록된 응용프로그램']);
    expect(MAIN.endsWith('/고립된 데이터(O)/모두(A)]:')).toBe(true);
    expect(src('dashcmds-ask.ts')).toContain("const k = await askOption(ctx, `${prompt} [예(Y)/아니오(N)] <${def ? '예' : '아니오'}>:`, YES_NO, def ? 'Y' : 'N');");
    for (const s of [
      `askYN(ctx, '${VERIFY_Q}', true)`,
      'askYN(ctx, `${noun} "${ft(name)}"을(를) 소거하시겠습니까?`, false)',
      'askYN(ctx, `${noun} "${ft(it.name)}"을(를) 소거하시겠습니까?`, false)',
      'ctx.print(`${noun} "${ft(name)}"을(를) 삭제하는 중입니다.`);',
      'ctx.print(`${noun} ${n}개가 삭제되었습니다.`);',
      'ctx.print(`참조되지 않은 ${noun}이(가) 없습니다.`);',
    ])
      expect(purgeSrc).toContain(s);
    expect(src('blkcmds-xref.ts')).toContain(`purge = await askYN(ctx, '${XREF_Q}', true);`);
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

  it('통째 프롬프트(기록 줄·휴대폰 카드)와 -PURGE·BLOCKREPLACE·BLOCKTOXREF·객체 격리 결과 줄이 네 언어 모두 한국어 없이 보인다', () => {
    const tr = (l: string) => (x: string) => guardedTranslate(x, l) ?? translate(x, l);
    const show = (s: string, l: string) => translateTail(s, tr(l)(s), tr(l));
    for (const s of [
      'ctx.print(`블록 ${ft(from)}의 참조 ${r.count}개를 ${ft(to)}(으)로 대치했습니다.${r.skipped ? ` ${r.skipped}개는 자기 참조가 되어 건너뛰었습니다.` : \'\'}${purged ? ` 블록 ${ft(from)}을(를) 소거했습니다.` : \'\'}`);',
    ])
      expect(src('util2-blocks.ts')).toContain(s);
    expect(src('blkcmds-xref.ts')).toContain(
      'ctx.print(`블록 참조 ${r.count}개를 외부 참조 ${ft(name)}(${ft(file.name)})(으)로 바꿨습니다.${r.droppedAttribs ? ` 속성이 있던 참조 ${r.droppedAttribs}개는 속성이 없어졌습니다.` : \'\'}${r.purged ? ` 블록 정의 ${block}을(를) 소거했습니다.` : \'\'}`);',
    );
    const [a, b] = [ft('DOOR'), ft('DOOR-2')];
    const xref = `블록 참조 3개를 외부 참조 ${ft('PART')}(${ft('part.dwg')})(으)로 바꿨습니다.`;
    /** 명령행 결과 줄(도면 이름은 ft, BLOCKTOXREF의 블록 정의 이름은 표시 없이) */
    const LOG = [
      ...NOUNS.flatMap((n) => [`${n} "${ft('OLD-1')}"을(를) 삭제하는 중입니다.`, `${n} 2개가 삭제되었습니다.`, `참조되지 않은 ${n}이(가) 없습니다.`]),
      `블록 ${a}의 참조 3개를 ${b}(으)로 대치했습니다.`,
      `블록 ${a}의 참조 3개를 ${b}(으)로 대치했습니다. 블록 ${a}을(를) 소거했습니다.`,
      `블록 ${a}의 참조 3개를 ${b}(으)로 대치했습니다. 1개는 자기 참조가 되어 건너뛰었습니다.`,
      xref,
      `${xref} 블록 정의 PART을(를) 소거했습니다.`,
      `${xref} 속성이 있던 참조 2개는 속성이 없어졌습니다.`,
      `${xref} 속성이 있던 참조 2개는 속성이 없어졌습니다. 블록 정의 PART을(를) 소거했습니다.`,
      '객체 3개를 격리했습니다. UNISOLATEOBJECTS로 모두 다시 보입니다.',
      '객체 3개를 숨겼습니다. UNISOLATEOBJECTS로 다시 보입니다.',
      '숨긴 객체 3개를 다시 보입니다.',
    ];
    const left: string[] = [];
    for (const l of LANGS) {
      // 기본값 꼬리가 있는 프롬프트는 친 입력이 붙은 기록 줄 꼴도
      for (const p of PROMPTS) for (const s of p.endsWith('>:') ? [p, `${p} Y`] : [p]) if (HANGUL.test(show(s, l))) left.push(`${l}: ${show(s, l)}`);
      for (const s of LOG) if (HANGUL.test(tr(l)(s))) left.push(`${l}: ${tr(l)(s)}`);
    }
    expect(left).toEqual([]);
    expect(show(yn(VERIFY_Q, true), 'en')).toBe('Would you like to check each name for purge? [Yes (Y)/No (N)] <Yes>:');
    expect(show(CONFIRM[0]!, 'de')).toBe('Block „OLD-1“ bereinigen? [Ja (Y)/Nein (N)] <Nein>:');
    expect(show(CONFIRM[2]!, 'ja')).toBe('画層 "OLD-1" を名前削除しますか? [はい(Y)/いいえ(N)] <いいえ>:');
    expect(tr('zh-CN')('블록 2개가 삭제되었습니다.')).toBe('已删除 2 个块。');
    expect(tr('en')('참조되지 않은 등록된 응용프로그램이(가) 없습니다.')).toBe('There are no unreferenced registered applications.');
    expect(tr('ja')(LOG[NOUNS.length * 3 + 1]!)).toBe('ブロック DOOR の参照 3 個を DOOR-2 に置き換えました。ブロック DOOR を削除しました。');
    expect(tr('en')(LOG[NOUNS.length * 3 + 6]!)).toBe(
      'Replaced 3 block references with external references PART (part.dwg). 2 references lost their attributes. Block definition PART has been purged.',
    );
  });

  it('고친 번역은 같은 사전의 낱말이다 — 소거 purge·名前削除·清除·bereinigen, 고립된 데이터·다중선 스타일, 대치(S), 격리 isolation, 동결 해제 auftauen, 필터, 새 통째 = 앞 조각 + 예/아니오', () => {
    const row = (k: string) => LANGS.map((l) => dict[l][k]);
    // 소거(PURGE) — 비우기·지우기(Clear·erase)·지우개(橡皮擦)·지우기(Löschen)가 아니다
    for (const k of ['소거(명령행)', '소거할 항목이 없습니다.', '소거할 이름 입력 <*>:', '{0} "{1}"을(를) 소거하시겠습니까?', '끝나면 참조되지 않는 블록 정의 소거', '블록 {0}을(를) 소거했습니다.']) {
      expect(dict.en[k], k).toMatch(/purg/i);
      expect(dict.en[k], k).not.toMatch(/clear|erase/i);
    }
    expect(row('소거(명령행)')).toEqual(['Purge (command line)', 'Bereinigen (Befehlszeile)', '名前削除(コマンドライン)', '清除（命令行）']);
    // 일본어 소거 제목·프롬프트는 名前削除(削除는 AutoCAD 일본어판 ERASE) — 같은 사전의 「…の名前削除」
    for (const k of ['소거', '도면층 소거', '소거할 사용하지 않는 객체 유형 입력 [', MAIN, '소거할 이름 입력 <*>:', VERIFY_Q, '{0} "{1}"을(를) 소거하시겠습니까?', '소거할 항목이 없습니다.', '참조되지 않은 블록 소거', '끝나면 참조되지 않는 블록 정의 소거', XREF_Q])
      expect(dict.ja[k], k).toContain('名前削除');
    // -PURGE 옵션: 고립된 데이터는 격리(isolate)가 아니고, 다중선은 여러 줄 문자·폴리선이 아니다(첫 프롬프트 통째와 같은 낱말)
    expect(row('고립된 데이터(O)')).toEqual(['Orphaned Data (O)', 'Verwaiste Daten (O)', '孤立データ(O)', '孤立数据(O)']);
    expect(row('다중선 스타일(M)')).toEqual(['Multiline style (M)', 'Multilinienstil (M)', 'マルチライン スタイル(M)', '多线样式(M)']);
    expect([dict.de['다중선 스타일'], dict['zh-CN']['다중선 스타일']]).toEqual(['Multilinienstil', '多线样式']);
    expect(dict['zh-CN'][MAIN]).toContain('/多线样式(M)/');
    expect([dict['zh-CN']['플롯 스타일(P)'], dict['zh-CN']['등록된 응용프로그램(R)'], dict['zh-CN']['등록된 응용프로그램']]).toEqual(['打印样式(P)', '注册应用程序(R)', '注册应用程序']);
    expect([dict.de['0 길이 형상(Z)'], dict.de['등록된 응용프로그램']]).toEqual(['Geometrie mit Länge 0 (Z)', 'Registrierte Anwendungen']);
    // 블록 대치: 대치(S)는 Replace, 「다음으로 대치」는 Replace with, 참조는 블록을 가리키는 참조(블록 안의 참조가 아니다)
    expect(row('대치(S)')).toEqual(['Replace (S)', 'Ersetzen (S)', '置換(S)', '替换(S)']);
    for (const l of LANGS) expect(Object.values(dict[l]).filter((v) => v.includes('Daechi')), l).toEqual([]);
    expect([dict.en['다음으로 대치'], dict.ja['다음으로 대치']]).toEqual(['Replace with', '置換後のブロック']);
    const rep = '블록 {0}의 참조 {1}개를 {2}(으)로 대치했습니다.{3}{4}';
    expect([dict.en[rep], dict.de[rep], dict['zh-CN'][rep]]).toEqual(['Replaced {1} references to block {0} with {2}.{3}{4}', '{1} Referenzen auf Block {0} durch {2} ersetzt.{3}{4}', '已将块 {0} 的 {1} 个参照替换为 {2}。{3}{4}']);
    expect(dict['zh-CN']['대치하려면 블록 정의가 둘 이상 있어야 합니다.']).toContain('两个');
    expect([dict['zh-CN']['{0} (참조 {1}개)'], dict['zh-CN']['같은 블록으로는 대치할 수 없습니다.']]).toEqual(['{0}（{1} 个参照）', '无法替换为相同的块。']);
    // 객체 격리 — 검역(quarantine·Quarantäne)이 아니고, UNISOLATEOBJECTS「로」 다시 보인다(…로서·…안에서·…꼴로가 아니다)
    for (const k of Object.keys(dict.en).filter((x) => x.includes('격리'))) {
      expect(dict.en[k], k).not.toMatch(/quarantin/i);
      expect(dict.de[k], k).not.toContain('Quarantäne');
    }
    expect(row('격리 끝')).toEqual(['End Isolation', 'Ende der Isolierung', '隔離終了', '隔离结束']);
    for (const k of ['객체 {0}개를 격리했습니다. UNISOLATEOBJECTS로 모두 다시 보입니다.', '객체 {0}개를 숨겼습니다. UNISOLATEOBJECTS로 다시 보입니다.']) {
      expect(dict.en[k], k).toContain('with UNISOLATEOBJECTS');
      expect(dict.de[k], k).toContain('Mit UNISOLATEOBJECTS');
      expect(dict.ja[k], k).toContain('UNISOLATEOBJECTSで');
      expect(dict['zh-CN'][k], k).toContain('可用 UNISOLATEOBJECTS');
    }
    expect(dict['zh-CN']['고른 객체만 보이기(UNISOLATEOBJECTS로 끝)']).not.toContain('结尾');
    // 290차 보고 (5) 둘레: LAYTHW auftauen, 리본 Einfrieren, COPYTOLAYER Beenden, 가져오기 importiert, SETBYLAYER·상태 복원 Eigenschaften, LAYWALK·LAYTRANS·색상표
    expect([dict.de['모든 도면층 동결 해제'], dict.de['모든 도면층의 동결을 풀었습니다.']]).toEqual(['Alle Layer auftauen', 'Alle Layer wurden aufgetaut.']);
    expect(dict.de['도면층 목록에서 켜기·동결·잠금·색을 바꿉니다 (LA)']).toContain('Einfrieren');
    expect(dict.de['지정된 기준점 또는 [종료(X)] <종료>:']).toBe('Angegebener Referenzpunkt oder [Beenden (X)] <Beenden>:');
    expect(dict.de['도면층 상태 {0}개를 가져왔습니다: {1}']).toBe('{0} Layerstatus importiert: {1}');
    for (const k of ['SETBYLAYER 특성', 'ByLayer로 바꿀 특성을 고릅니다(SETBYLAYERMODE).', '이 웹 버전은 뷰포트 재지정을 지원하지 않습니다. 이 옵션으로 복원하면 색상·선종류·선가중치·투명도·플롯 스타일은 건너뛰고 나머지 특성만 복원합니다.'])
      expect(dict.de[k], k).toContain('Eigenschaften');
    expect(dict.de['필터 "{0}"과(와) 그 안의 필터 {1}개를 삭제하시겠습니까?']).toContain('die {1} darin enthaltenen Filter');
    expect(dict.de['도면층 {0}개 중 {1}개 표시{2}']).toBe('Zeigt {1} von {0} Layern an{2}');
    expect(dict['zh-CN']['클릭하면 그 도면층만 보입니다. Ctrl·Shift로 여러 개, 오른쪽 클릭으로 선택 유지·참조되지 않은 항목 선택·검사. 도면은 이 창을 연 채 확대·초점이동할 수 있습니다.']).toContain('保持选区');
    expect(dict['zh-CN']['변환 시작에서 도면층을 하나 이상, 변환 대상에서 도면층 하나를 고르십시오.']).toContain('中选择一个图层');
    expect(dict['zh-CN']['색상표 색은 이 웹 버전에서 쓸 수 없습니다. 색상 번호나 트루컬러를 입력하십시오.']).toContain('真彩色');
    expect(dict['zh-CN']['도면층 "{0}"이(가) 없습니다. 만드시겠습니까? [']).toBe('图层“{0}”不存在。是否创建？[');
    expect(dict['zh-CN']['색상 종속 플롯 스타일 도면에서는 플롯 스타일을 복원하지 않습니다.']).toContain('颜色相关打印样式图形');
    // (4) 독일어 특성 필터는 Eigenschaftenfilter(블록 속성 Attribut가 아니다), 중국어 필터는 过滤器(사진 필터 滤镜가 아니다)
    expect(Object.values(dict.de).filter((v) => v.includes('Attributfilter'))).toEqual([]);
    expect(dict.de['특성 필터']).toBe('Eigenschaftenfilter');
    expect(Object.values(dict['zh-CN']).filter((v) => v.includes('滤镜'))).toEqual([]);
    expect(dict['zh-CN']['필터 선택']).toBe('选择过滤器');
    // 새 통째 = 명령행 앞 조각 + 예/아니오 번역(286차 꼴), 대괄호 없는 물음이 있으면 앞 조각 = 그 물음 + 「[」
    for (const l of LANGS) {
      const d = dict[l];
      const colon = l === 'zh-CN' ? '：' : ':';
      for (const q of [VERIFY_Q, XREF_Q]) {
        expect(squash(d[`${q} [`]), `${l}: ${q}`).toBe(`${squash(d[q])}[`);
        expect(squash(d[`${q} [예(Y)/아니오(N)] <{0}>:`]), `${l}: ${q}`).toBe(squash(`${d[`${q} [`]}${d['예(Y)']}/${d['아니오(N)']}] <{0}>`) + colon);
      }
      for (const n of NOUNS) {
        const q = `${n} "{0}"을(를) 소거하시겠습니까?`;
        expect(squash(d[`${q} [예(Y)/아니오(N)] <{1}>:`]), `${l}: ${n}`).toBe(squash(`${d[`${q} [`]}${d['예(Y)']}/${d['아니오(N)']}] <{1}>`) + colon);
      }
    }
    expect(row('블록 "{0}"을(를) 소거하시겠습니까? [')).toEqual(['Purge block "{0}"? [', 'Block „{0}“ bereinigen? [', 'ブロック "{0}" を名前削除しますか? [', '是否清除块“{0}”？[']);
  });
});
