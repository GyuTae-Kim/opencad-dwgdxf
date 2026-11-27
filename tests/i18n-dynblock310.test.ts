/**
 * 310차: 309차가 남긴 묶음 밖 오역과 동적 블록(블록 편집기)·그룹 묶음의 번역 대조·빠진 번역.
 * - 출발점(309차 보고 (3)): REFEDIT 흐림 정도의 흐리기(fade — Abblenden·淡入度), 독일어 LIMITS 도면 공간 한계(Grenzen — 구속 Beschränkung이 아니다),
 *   TRIM·EXTEND 앞 글(자르기 trim·연장 extend — clip·切り取る·裁剪·Auswahl erweitern이 아니다), 독일어 비교 설정 「구름형 리비전 켜기」 이름표 꼴, 중국어 「DWG 비교」.
 * - 오역: 동적 블록 정렬 그립(align — 정렬하기 sort가 아니다)·매개변수의 동작(action — behavior가 아니다)·고칠(edit — repair·fix가 아니다)·상태(Status — Staat가 아니다)·
 *   조회(lookup — 찾기 search가 아니다)·반전(反转)·특성(プロパティ), BEDIT 안내의 참조 바뀜(update — replace가 아니다), RESETBLOCK 풍선·제목, BSAVE 풍선, 저장 물음 제목, 이름 글자 안내.
 * - 빠진 번역: 동적 블록 특성 값 오류 줄(「{이름}: 각도가 올바르지 않습니다.」 등 — 틀이 없어 네 언어 모두 한국어), GROUPEDIT의 이름 없는 그룹 추가·제거 줄.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { guardedTranslate, translateTail } from '../src/app/fileguard';
import { ft } from '../src/app/filetext';
import { sourceMessage, translate } from '../site/i18n.mjs';

const LANGS = ['en', 'de', 'ja', 'zh-CN'] as const;
type Lang = (typeof LANGS)[number];
const HANGUL = /[가-힣]/;
const load = (lang: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../site/locales/${lang}.json`, import.meta.url), 'utf8'));
const dict = Object.fromEntries(LANGS.map((l) => [l, load(l)])) as Record<Lang, Record<string, string>>;
const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const tr = (l: string) => (x: string) => guardedTranslate(x, l) ?? translate(x, l);
/** 명령행·휴대폰 카드·커서 옆에 보이는 꼴(통째 번역 + 옵션 이름인 기본값 — fileguard translateTail) */
const show = (l: string) => (x: string) => translateTail(x, tr(l)(x), tr(l));

/** TRIM·EXTEND 프롬프트 앞 글(app/modify.ts — 「… 또는 [옵션]:」의 앞) */
const T = '자를 객체 선택 또는 Shift 키를 누른 채 선택하여 연장';
const E = '연장할 객체 선택 또는 Shift 키를 누른 채 선택하여 자르기';
/** 동적 블록 정의 안내(BEDIT — 고칠 edit·동작 action의 같은 사전 근거) */
const NOTE = '동적 블록 정의입니다. 형상은 고칠 수 있지만 매개변수·동작·가시성 상태는 이 웹 버전에서 만들거나 고칠 수 없어 그대로 둡니다.';
const U0 = '이 동적 블록 정의는 읽을 수 없는 자료({0})가 있어 고칠 수 없습니다.';
const U1 = '이 동적 블록 정의는 읽을 수 없는 자료가 있어 고칠 수 없습니다.';
const BE = '블록 편집기에서 그리기·수정 명령으로 블록 정의를 고칩니다. 닫으면 이 블록의 모든 참조가 바뀝니다.';
/** 이름 없는 그룹 꼬리(304차 「그룹 {0}(이름 없음)이(가) 분해되었습니다.」) */
const UNNAMED: Record<Lang, string> = { en: '(unnamed)', de: '(unbenannt)', ja: '（名前なし）', 'zh-CN': '（未命名）' };

describe('동적 블록·블록 편집기·그룹 묶음의 번역과 309차가 남긴 묶음 밖 오역(310차)', () => {
  it('출발점: 참조 편집 흐리기·도면 공간 한계·TRIM·EXTEND 앞 글·구름형 리비전 켜기·DWG 비교(309차 보고 (3))', () => {
    const [en, de, ja, zh] = [dict.en, dict.de, dict.ja, dict['zh-CN']];
    // 소스: XFADECTL 제목·LIMITS 재설정 줄·TRIM·EXTEND 프롬프트·비교 설정 확인란·비교 고르기 대화 상자 제목
    expect(src('app/refedit.ts')).toContain("title: '참조 편집 흐림 정도',");
    expect(src('app/util2-misc.ts')).toContain("ctx.print(isModel ? '모형 공간 한계 재설정:' : '도면 공간 한계 재설정:');");
    expect(src('app/modify.ts')).toContain(`\${mode === 'trim' ? '${T}' : '${E}'} 또는 [`);
    expect(src('app/compare-ui.ts')).toContain("'구름형 리비전 켜기',");
    expect(src('app/compare-ui.ts')).toContain("const back = dialog('DWG 비교', body, [");
    // 흐리기(fade) = 309차가 맞춘 「흐리기」 낱말, 참조 편집 = 「참조 편집」
    expect(de['참조 편집 흐림 정도']).toBe(`${de['참조 편집']}: ${de['흐리기']}`);
    expect(zh['참조 편집 흐림 정도']).toBe(`${zh['참조 편집']}${zh['흐리기']}`);
    for (const l of LANGS) expect(dict[l]['참조 편집 흐림 정도'], l).not.toMatch(/Blur|Weichzeichnen|ぼかし|模糊/);
    // 도면 공간 한계 = 「모형 공간 한계」 꼴(한계 Grenzen — 구속 Beschränkung이 아니다), 도면 공간 Papierbereich
    expect(de['도면 공간 한계 재설정:']).toBe(de['모형 공간 한계 재설정:']!.replace('Modellraum', `${de['도면 공간']}s`));
    // TRIM·EXTEND 앞 글 = 옵션 목록 앞 조각(「… 또는 [」, 297차)의 앞부분(자르기 trim·トリム·修剪·stutzen, 연장 extend·延伸·verlängern)
    const OR: Record<Lang, string> = { en: ' or [', de: ', oder [', ja: '、または [', 'zh-CN': '或 [' };
    for (const l of LANGS) expect(dict[l][`${T} 또는 [`], l).toBe(dict[l][T] + OR[l]);
    for (const l of ['de', 'ja', 'zh-CN'] as const) expect(dict[l][`${E} 또는 [`], l).toBe(dict[l][E] + OR[l]);
    expect([en[T], ja[T], zh[T]].join('')).not.toMatch(/clip|切り取|裁剪|扩展/);
    expect([de[T], de[E]].join('')).not.toMatch(/Zuschneiden|Auswahl zu erweitern|Trimmen|Beim/);
    expect([ja[E], zh[E]].join('')).not.toMatch(/トリミング|裁剪|鼠标/);
    // 구름형 리비전 켜기 = 확인란 이름표 꼴(「플롯 스탬프 켜기」·「그룹 선택 켜기」 … aktivieren — 명령꼴 Aktivieren Sie가 아니다)
    expect(de['구름형 리비전 켜기']).toBe(`${de['구름형 리비전']} aktivieren`);
    expect([de['플롯 스탬프 켜기'], de['그룹 선택 켜기']]).toEqual(['Plotstempel aktivieren', 'Gruppenauswahl aktivieren']);
    // DWG 비교 = DWG + 비교(比较) — 다른 언어처럼 DWG를 남긴다(「DWG 부착」 附加 DWG)
    expect(zh['DWG 비교']).toBe(`DWG ${zh['비교']}`);
    expect(zh['DWG 부착']).toContain('DWG');
    expect([en['DWG 비교'], de['DWG 비교'], ja['DWG 비교']]).toEqual(['DWG Comparison', 'DWG-Vergleich', 'DWG比較']);
    // 거꾸로 찾기: 바꾼 값이 제 원문으로 돌아온다
    for (const [l, k] of [['de', '참조 편집 흐림 정도'], ['zh-CN', '참조 편집 흐림 정도'], ['de', '도면 공간 한계 재설정:'], ['zh-CN', 'DWG 비교'], ['ja', T], ['de', E]] as const)
      expect(sourceMessage(dict[l][k]!), `${l}: ${k}`).toBe(k);
  });

  it('동적 블록·블록 편집기 글은 같은 사전의 CAD 낱말이다(정렬 align·동작 action·고칠 edit·상태·조회 lookup·반전·특성·참조 바뀜·재설정·저장)', () => {
    const [en, de, ja, zh] = [dict.en, dict.de, dict.ja, dict['zh-CN']];
    const dyn = src('app/dynblock.ts');
    for (const s of [
      "ctx.print('** 정렬 **');",
      "ctx.print('** 신축 **');",
      "ctx.print('고칠 수 있는 동적 블록 특성이 없습니다.');",
      '`고칠 특성 입력 [${kws.map((k) => `${k.label}(${k.key})`).join(\'/\')}] <종료>:`',
      "title: '블록 재설정',",
      "ctx.print('고른 객체 중 동적 블록 참조가 없습니다.');",
    ])
      expect(dyn, s).toContain(s);
    const types = src('edit/dynblock/types.ts');
    for (const s of [
      "MSG_UNSUPPORTED = '이 매개변수의 동작은 지원되지 않습니다.'",
      `MSG_UNDECODED = '${U1}'`,
      "FLIP_NOT = '반전되지 않음'",
      "FLIP_YES = '반전됨'",
    ])
      expect(types, s).toContain(s);
    expect(src('edit/dynblock/api.ts')).toContain("message: '목록에서 상태를 고르십시오.'");
    const blocks = src('app/blocks.ts');
    for (const s of [`note: '${BE}'`, "ask('블록 - 변경 사항이 저장되지 않음',", '`블록 ${ft(be.name)}을(를) 고쳤습니다.`']) expect(blocks, s).toContain(s);
    // 정렬 그립(정렬 매개변수 — 참조를 선·곡선 방향으로 옮김)의 머리 = 「** 신축 **」 꼴 + 「정렬」(align — 306차 리본 「정렬 (AL)」, sort가 아니다)
    expect([en['** 신축 **'], de['** 신축 **']]).toEqual(['** STRETCH **', '** STRECKEN **']);
    for (const l of LANGS) {
      const w = dict[l]['정렬']!;
      expect(dict[l]['** 정렬 **'], l).toBe(`** ${l === 'en' || l === 'de' ? w.toUpperCase() : w} **`);
      expect(dict[l]['** 정렬 **'], l).not.toMatch(/Sort|ソート|排序/i);
    }
    // 매개변수의 동작 = 동적 블록 동작(action — 「블록 동작」·동적 블록 정의 안내), 행동 behavior가 아니다
    const ACT: Record<Lang, string> = { en: 'action', de: 'Aktion', ja: 'アクション', 'zh-CN': '动作' };
    for (const l of LANGS) {
      expect(dict[l]['블록 동작'], l).toMatch(new RegExp(ACT[l], 'i'));
      expect(dict[l][NOTE], l).toMatch(new RegExp(ACT[l], 'i'));
      expect(dict[l]['이 매개변수의 동작은 지원되지 않습니다.'], l).toContain(ACT[l]);
      expect(dict[l]['이 매개변수의 동작은 지원되지 않습니다.'], l).not.toMatch(/behavior|Verhalten|動作|行为/);
    }
    // 고칠 = 고치기·바꾸기(edit — 같은 사전 동적 블록 정의 안내 「형상은 고칠 수 있지만」 edit·bearbeitet), 수리 repair·fix가 아니다
    expect(`${en[NOTE]} ${de[NOTE]}`).toMatch(/edit[\s\S]*bearbeitet/);
    expect(en[U0]).toBe('This dynamic block definition cannot be edited because it contains unreadable data ({0}).');
    expect(de[U0]).toBe('Diese dynamische Blockdefinition kann nicht bearbeitet werden, da sie nicht lesbare Daten ({0}) enthält.');
    for (const l of LANGS) expect(dict[l][U1], l).toBe(dict[l][U0]!.replace(/\s?[(（]\{0\}[)）]/, ''));
    const NONE = '고칠 수 있는 동적 블록 특성이 없습니다.';
    expect(en[NONE]).toBe(`There are no ${en['동적 블록 특성']!.toLowerCase()} that can be changed.`);
    expect(de[NONE]).toBe('Es gibt keine dynamischen Blockeigenschaften, die geändert werden können.');
    expect(ja[NONE]).toBe(`修正できる${ja['동적 블록 특성']}がありません。`);
    expect(zh[NONE]).toBe(`没有可修改的${zh['동적 블록 특성']}。`);
    // 고칠 특성 입력(-DYNPROPS): 통째 = 앞 조각 + 옵션 + 「] <종료>:」(특성 = 「동적 블록 특성」의 낱말 — 속성 attribute·특징 特征이 아니다)
    const P = '고칠 특성 입력 [';
    for (const l of LANGS) expect(dict[l][`${P}{0}] <종료>:`], l).toBe(`${dict[l][P]}{0}${dict[l]['] <종료>:']}`);
    expect([en[P], de[P], ja[P], zh[P]]).toEqual(['Enter property to modify [', 'Zu ändernde Eigenschaft eingeben [', '修正するプロパティを入力 [', '输入要修改的属性 [']);
    expect([en[P], de[P], ja[P], zh[P]].join('')).not.toMatch(/attribute|Attribut|Feature|特性|特征|修复|repar/);
    // BCLOSE 저장 줄: 고쳤습니다 = 바꿨다(BEDIT 안내 「블록 정의를 고칩니다」 Modify·Ändern)
    expect([en['블록 {0}을(를) 고쳤습니다.'], de['블록 {0}을(를) 고쳤습니다.']]).toEqual(['Modified block {0}.', 'Block {0} geändert.']);
    expect(en[BE]).toMatch(/^Modify /);
    expect(de[BE]).toMatch(/^Ändern /);
    // BEDIT 안내: 모든 참조가 바뀐다 = 고친 정의로 새로 그려진다(일본어 같은 열쇠 更新 — 바꿔치기 replace·ersetzt·替换가 아니다), 이 블록의 참조(블록 안 此块中的가 아니다)
    expect(ja[BE]).toContain('更新');
    expect(en[BE]).toContain('Closing updates all references to this block.');
    expect(de[BE]).toContain('Durch das Schließen werden alle Referenzen dieses Blocks aktualisiert.');
    expect(zh[BE]).toContain('关闭后，此块的所有引用都将更新。');
    expect([en[BE], de[BE], zh[BE]].join('')).not.toMatch(/replace|ersetzt|替换|此块中/);
    // 상태(가시성·조회 그립 — 「가시성 상태」 Sichtbarkeitsstatus·可視性状態): 나라 Staat·ステータス가 아니다
    expect(de['목록에서 상태를 고르십시오.']).toBe('Wählen Sie einen Status aus der Liste aus.');
    expect(de['가시성 상태']).toContain('status');
    expect(ja['가시성 상태 "{0}"이(가) 없습니다.']!.startsWith(ja['가시성 상태']!)).toBe(true);
    // 조회(lookup — 「조회 테이블」 Nachschlagetabelle·ルックアップ テーブル·查寻表): 찾기 search·検索·查找가 아니다
    const LK = '조회 값 "{0}"이(가) 표에 없습니다.';
    expect(en[LK]).toBe('Lookup value "{0}" is not in the table.');
    expect(de[LK]).toBe('Der Nachschlagewert „{0}“ ist nicht in der Tabelle vorhanden.');
    expect(ja[LK]).toBe(`${ja['조회 테이블']!.split(' ')[0]}値「{0}」はテーブル内に存在しません。`);
    expect(zh[LK]).toBe(`${zh['조회 테이블']!.replace('表', '')}值“{0}”不在表中。`);
    // 반전(뒤집기 매개변수 — 「반전 상태」 反转状态): 목록 값도 같은 낱말(倒置는 위아래 뒤집기 — 279차 「위아래 뒤집어 플롯」)
    expect([zh['반전됨'], zh['반전되지 않음']]).toEqual([`已${zh['반전 상태']!.slice(0, 2)}`, `未${zh['반전 상태']!.slice(0, 2)}`]);
    // 일본어 동적 블록·특성 = 같은 사전 다수 낱말(ダイナミックブロック·プロパティ), 독일어 고른 객체 가운데 = 「고른 객체 가운데 주석 객체가 없습니다.」 꼴(unter — 사이 zwischen이 아니다)
    expect(ja['고른 객체 중 동적 블록 참조가 없습니다.']).toContain(ja['동적 블록 참조가 아닙니다.']!.replace('ではありません。', ''));
    expect(Object.values(ja).filter((v) => v.includes('動的ブロック'))).toEqual([]);
    expect(de['고른 객체 중 동적 블록 참조가 없습니다.']).toBe(de['고른 객체 가운데 주석 객체가 없습니다.']!.replace('Beschriftungsobjekte', 'dynamischen Blockreferenzen'));
    // RESETBLOCK: 리본 풍선 = 정의 기본값으로 되돌리기(일본어 같은 열쇠 リセット — 정의하다 define가 아니다), 제목 = 「블록 {0}개를 재설정했습니다.」 낱말
    expect(src('app/ui/shell.ts')).toContain("{ cmd: 'RESETBLOCK', label: '블록 재설정', icon: 'redo', tip: '동적 블록 참조를 정의 기본값으로' },");
    const TIP = '동적 블록 참조를 정의 기본값으로';
    expect(ja[TIP]).toContain('リセット');
    expect(en[TIP]).toBe('Reset dynamic block references to definition defaults');
    expect(de[TIP]).toBe('Dynamische Blockreferenzen auf die Standardwerte der Definition zurücksetzen');
    expect(de['블록 {0}개를 재설정했습니다.']).toContain('zurückgesetzt');
    expect(de['블록 재설정']).toBe('Block zurücksetzen');
    // 블록 편집기 탭 줄: 풍선 = 단추 글 + 명령 이름(BSAVE·BCLOSE)
    expect(src('app/ui/shell.ts')).toContain("h('button', { class: 'layouttab', title: '블록 저장 (BSAVE)' }, '블록 저장');");
    for (const l of LANGS)
      for (const [n, c] of [['블록 저장', 'BSAVE'], ['블록 편집기 닫기', 'BCLOSE']] as const) expect(dict[l][`${n} (${c})`], `${l}: ${n}`).toBe(`${dict[l][n]} (${c})`);
    // 저장 물음 제목: 저장하지 않은 변경(「저장하지 않은 변경이 있습니다.」·「· 저장하지 않은 변경 있음」 — 저장되지 않을 것이 아니다)
    const UNSAVED = '블록 - 변경 사항이 저장되지 않음';
    expect(de[UNSAVED]).toBe('Block – Nicht gespeicherte Änderungen');
    expect(ja[UNSAVED]).toBe('ブロック - 保存されていない変更');
    expect(ja['저장하지 않은 변경이 있습니다.']).toContain('保存されていない変更');
    expect(de['· 저장하지 않은 변경 있음']).toContain('nicht gespeicherte Änderungen');
    // 이름 글자 안내(GROUP·GROUPEDIT·블록·배치 등이 함께 쓰는 열쇠 — 같은 뜻): 「뷰 이름에 쓸 수 없는 문자가 있습니다.」 꼴(덧붙은 「Hinweise zu Namen:」 뺌)
    expect(src('edit/util/groups.ts')).toContain("return '이름에 쓸 수 없는 문자가 있습니다.';");
    expect(de['이름에 쓸 수 없는 문자가 있습니다.']).toBe(de['뷰 이름에 쓸 수 없는 문자가 있습니다.']!.replace('Ansichtsname', 'Name'));
    // 거꾸로 찾기
    for (const [l, k] of [['en', '** 정렬 **'], ['de', '블록 재설정'], ['de', TIP], ['zh-CN', '반전됨'], ['ja', LK], ['de', UNSAVED]] as const) expect(sourceMessage(dict[l][k]!), `${l}: ${k}`).toBe(k);
  });

  it('동적 블록 특성 값 오류 줄·이름 없는 그룹 편집 줄이 네 언어 모두 한국어 없이 보인다', () => {
    const dyn = src('app/dynblock.ts');
    for (const s of [
      "(ctx ?? app.cmd).print(`${ft(p.label)}: ${c.error}`, 'err');",
      "if ('error' in c) return `${p.label}: ${c.error}`;",
      "{ error: '각도가 올바르지 않습니다.' }",
      "{ error: '좌표가 올바르지 않습니다.' }",
      "{ error: '0보다 큰 거리를 입력하십시오.' }",
      '{ error: `"${ft(t)}"은(는) 목록에 없습니다.` }',
    ])
      expect(dyn, s).toContain(s);
    const q = src('app/editcmds2-query.ts');
    for (const s of [
      'return g.group.unnamed ? `${ft(g.name)}(이름 없음)` : ft(g.name);',
      'ctx.print(`그룹 ${groupLabel(g)}에 객체 ${r.added}개를 추가했습니다.`);',
      'ctx.print(`그룹 ${groupLabel(g)}에서 객체 ${r.removed}개를 제거했습니다.`);',
    ])
      expect(q, s).toContain(s);
    const LINES = [
      `${ft('Distance1')}: 0보다 큰 거리를 입력하십시오.`,
      `${ft('Angle1')}: 각도가 올바르지 않습니다.`,
      `${ft('Position1')}: 좌표가 올바르지 않습니다.`,
      `${ft('Visibility1')}: "${ft('Open')}"은(는) 목록에 없습니다.`,
      // DYNPROPS 대화 상자 확인 글(이름 표지 없음)
      'Distance1: 0보다 큰 거리를 입력하십시오.',
      `그룹 ${ft('*A1')}(이름 없음)에 객체 2개를 추가했습니다.`,
      `그룹 ${ft('*A1')}(이름 없음)에서 객체 1개를 제거했습니다.`,
    ];
    const left: string[] = [];
    for (const l of LANGS) for (const s of LINES) if (HANGUL.test(show(l)(s))) left.push(`${l}: ${show(l)(s)}`);
    expect(left).toEqual([]);
    expect(show('en')(LINES[0]!)).toBe('Distance1: Enter a distance greater than 0.');
    expect(show('de')(LINES[3]!)).toBe('Visibility1: „Open“ ist nicht in der Liste.');
    expect(show('ja')(LINES[1]!)).toBe('Angle1：角度が正しくありません。');
    expect(show('zh-CN')(LINES[5]!)).toBe('已向组 *A1（未命名） 添加 2 个对象。');
    expect(show('en')(LINES[6]!)).toBe('Removed 1 objects from group *A1(unnamed).');
    // 새 열쇠 = 「{0}: 」(일본어·중국어 「{0}：」) + 그 오류 열쇠의 번역, 이름 없는 그룹 = 304차 꼴(분해 줄의 「(이름 없음)」 꼬리)
    for (const l of LANGS) {
      const d = dict[l];
      const pre = l === 'ja' || l === 'zh-CN' ? '{0}：' : '{0}: ';
      for (const e of ['각도가 올바르지 않습니다.', '좌표가 올바르지 않습니다.', '0보다 큰 거리를 입력하십시오.']) expect(d[`{0}: ${e}`], `${l}: ${e}`).toBe(pre + d[e]);
      expect(d['{0}: "{1}"은(는) 목록에 없습니다.'], l).toBe(pre + d['"{0}"은(는) 목록에 없습니다.']!.replace('{0}', '{1}'));
      const un = (k: string) => d[k]!.replace('{0}', `{0}${UNNAMED[l]}`);
      expect(d['그룹 {0}(이름 없음)이(가) 분해되었습니다.'], l).toBe(un('그룹 {0}이(가) 분해되었습니다.'));
      expect(d['그룹 {0}(이름 없음)에 객체 {1}개를 추가했습니다.'], l).toBe(un('그룹 {0}에 객체 {1}개를 추가했습니다.'));
      expect(d['그룹 {0}(이름 없음)에서 객체 {1}개를 제거했습니다.'], l).toBe(un('그룹 {0}에서 객체 {1}개를 제거했습니다.'));
    }
  });
});
