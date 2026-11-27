/**
 * 312차: 311차가 남긴 「옮길 수 없는 객체」 무리·중국어 「추가할 축척」과 주석 축척·축척 목록 묶음의 번역 대조·빠진 번역.
 * - 출발점(311차 보고 (2)): 「옮길 수 없는 객체」 여섯 열쇠는 쓰는 곳이 모두 다른 도면·파일로 복사해 넣는 일(ETRANSMIT 결합 bindXrefOps,
 *   디자인센터·파일 블록 DefinitionCopier, WBLOCK 새 파일)이라 도면 안 이동(MOVE — moved·verschieben·移動·移动)이 아니다 → WBLOCK 열쇠의 낱말로.
 *   중국어 「추가할 축척(Ctrl·Shift로 여러 개)」 缩放…可缩放(뜻 깨짐) → 「축척 추가」 添加比例·311차 「Ctrl 或 Shift 键可多选」 꼴.
 * - 오역: 축척 목록 메뉴 「사용자...」(사용자 정의 Custom), 뷰포트 잠김(축척 바꾸기 — 크기 바꾸기 scaled·skaliert·缩放가 아니다), 축척 수 한도·이름 겹침,
 *   독일어 축척 Maßstab(Skalierung·Skala가 아니다)·주석 축척 Beschriftungsmaßstab(Anmerkung 무리 — 305·307차 보고)·현재 주석 축척 값·용지 단위 1,
 *   일본어 재정의 再定義(オーバーライド가 아니다), 중국어 주석 注释(标注 = 치수)·수가 이름처럼 읽히던 결과 줄·축척 比例(缩放가 아니다)·块编辑器·도면 图形.
 * - 빠진 번역: -SCALELISTEDIT 삭제 막힘(틀이 {1}의 앱 글을 옮기지 않음)·재설정·재정의 물음, -OBJECTSCALE 「추가할·삭제할 명명된 축척」, 특성 팔레트 「*여러 개* …」.
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
/** 명령행·패널에 보이는 꼴(통째 번역 + 기록 줄의 프롬프트·기본값 꼬리 — fileguard translateTail) */
const show = (l: string) => (x: string) => translateTail(x, tr(l)(x), tr(l));

/** 「옮길 수 없는 객체」 무리 — 마지막(WBLOCK)은 이미 복사 뜻이라 근거 */
const SKIP = [
  '"{0}"을(를) 결합할 때 옮길 수 없는 객체 {1}개(다중 지시선·이미지·표 등)를 뺐습니다.',
  '블록 안의 옮길 수 없는 객체({0})는 뺐습니다.',
  '옮길 수 없는 객체 {0}개는 뺐습니다.',
  '옮길 수 없는 객체({0})는 뺐습니다(파일을 가리키는 이미지·언더레이 등).',
  '옮길 수 없는 객체({0})는 뺐습니다.',
  '{0}을(를) 썼습니다(객체 {1}개, {2} KB). 옮길 수 없는 객체 {3}개는 뺐습니다.',
] as const;
const ADD = '추가할 축척(Ctrl·Shift로 여러 개)';
const MANY = '항목을 고르십시오(Ctrl·Shift로 여러 개, 더블클릭으로 바로 추가).';

describe('주석 축척·축척 목록 묶음의 번역과 311차가 남긴 「옮길 수 없는 객체」 무리(312차)', () => {
  it('「옮길 수 없는 객체」는 다른 도면·파일로 복사하지 못한 객체이고, 중국어 「추가할 축척」은 「축척 추가」 낱말이다', () => {
    const [en, de, ja, zh] = [dict.en, dict.de, dict.ja, dict['zh-CN']];
    // 쓰는 곳: 모두 다른 도면의 객체를 이 도면·새 파일로 복사한다(도면 안 이동이 아니다)
    const tm = src('app/transmit.ts');
    expect(tm).toContain('const r = bindXrefOps(st.doc, s.blockKey, file.doc, alloc.newHandle);');
    expect(tm).toContain('notes.push(`"${s.item.name}"을(를) 결합할 때 옮길 수 없는 객체 ${r.skipped}개(다중 지시선·이미지·표 등)를 뺐습니다.`);');
    const dc = src('app/designcenter.ts');
    for (const s of ['const cp = new DefinitionCopier(p.doc, doc, () => st.session.newHandle());', 'ctx.print(`블록 안의 옮길 수 없는 객체(${skipped})는 뺐습니다.`);', 'ctx.print(`옮길 수 없는 객체(${skipped})는 뺐습니다(파일을 가리키는 이미지·언더레이 등).`);'])
      expect(dc, s).toContain(s);
    const fx = src('app/filecmds-export.ts');
    expect(fx).toContain('const cp = new DefinitionCopier(src, doc, () => s.newHandle());');
    expect(fx).toContain("${skipped ? ` 옮길 수 없는 객체(${skipped})는 뺐습니다.` : ''}");
    expect(src('app/wblockcmd.ts')).toContain("${built.skipped ? ` 옮길 수 없는 객체 ${built.skipped}개는 뺐습니다.` : ''}");
    // 복사 = WBLOCK 열쇠의 낱말(could not be copied·nicht übernommen·移せない·无法复制), 뺐습니다 = 빼놓음(left out·ausgelassen·除外·已排除)
    const COPY: Record<Lang, string> = { en: 'could not be copied', de: 'nicht übernommen werden konnten', ja: '移せない', 'zh-CN': '无法复制' };
    const LEFT: Record<Lang, RegExp> = { en: /[Ll]eft out/, de: /ausgelassen/, ja: /除外/, 'zh-CN': /已排除/ };
    for (const l of LANGS)
      for (const k of SKIP) {
        expect(dict[l][k], `${l}: ${k}`).toContain(COPY[l]);
        expect(dict[l][k], `${l}: ${k}`).toMatch(LEFT[l]);
        expect(dict[l][k], `${l}: ${k}`).not.toMatch(/moved|verschieb|移動|移行|移动|差し引/);
      }
    expect(en[SKIP[5]]).toBe('Wrote {0} ({1} objects, {2} KB). Left out {3} objects that could not be copied.');
    // WBLOCK 꼬리와 같은 꼴(「옮길 수 없는 객체 {0}개는 뺐습니다.」)
    expect(en[SKIP[2]]).toBe(en[SKIP[5]]!.split('. ')[1]!.replace('{3}', '{0}'));
    expect(de[SKIP[2]]).toBe(de[SKIP[5]]!.split('. ')[1]!.replace('{3}', '{0}'));
    expect(zh[SKIP[2]]).toBe(`${zh[SKIP[5]]!.split('。')[1]!.replace('{3}', '{0}')}。`);
    // {0}이 목록(「LINE 2개」)인 셋은 괄호 자리 — 수로 읽지 않는다(영어 「Left out {0} objects in the block」)
    expect([en[SKIP[1]], en[SKIP[3]], en[SKIP[4]]]).toEqual([
      'Objects in the block that could not be copied ({0}) were left out.',
      'Objects that could not be copied ({0}) were left out (e.g., images or underlays that reference files).',
      'Objects that could not be copied ({0}) were left out.',
    ]);
    expect([de[SKIP[1]], de[SKIP[4]]]).toEqual(['Objekte im Block, die nicht übernommen werden konnten ({0}), wurden ausgelassen.', 'Objekte, die nicht übernommen werden konnten ({0}), wurden ausgelassen.']);
    expect([zh[SKIP[1]], zh[SKIP[4]]]).toEqual(['已排除块内无法复制的对象（{0}）。', '已排除无法复制的对象（{0}）。']);
    // 결합 줄: 결합(bind)은 그대로(295·304차), 일본어 差し引いた(빼기 셈)가 아니다
    expect(en[SKIP[0]]).toBe('When binding "{0}", {1} objects that could not be copied (multileaders, images, tables, etc.) were left out.');
    expect(de[SKIP[0]]).toBe('Beim Binden von „{0}“ wurden {1} Objekte, die nicht übernommen werden konnten (Multiführungslinien, Bilder, Tabellen usw.), ausgelassen.');
    expect(ja[SKIP[0]]).toBe('「{0}」をバインドするときに移せないオブジェクト {1} 個（複数引出線・画像・表など）を除外しました。');
    expect(zh[SKIP[0]]).toBe('绑定“{0}”时，已排除 {1} 个无法复制的对象（多重引线、图像、表格等）。');
    // 추가할 축척(OBJECTSCALE 「객체에 축척 추가」 목록 머리): 중국어 = 「축척 추가」 添加比例 + 311차 「Ctrl 或 Shift 键可多选」, 독일어 = Maßstab + 「Strg oder Umschalt für mehrere」
    expect(src('app/annoscale-ui.ts')).toContain("h('div', { class: 'u2-note' }, '추가할 축척(Ctrl·Shift로 여러 개)')");
    expect(zh['축척 추가']).toBe('添加比例');
    expect(zh[MANY]).toContain('按住 Ctrl 或 Shift 键可多选');
    expect(zh[ADD]).toBe('要添加的比例（按住 Ctrl 或 Shift 键可多选）');
    expect(de[MANY]).toContain('Strg oder Umschalt für mehrere');
    expect(de[ADD]).toBe('Hinzuzufügende Maßstäbe (Strg oder Umschalt für mehrere)');
    expect(`${zh[ADD]}${de[ADD]}`).not.toMatch(/缩放|Skalierung|Strg\/Umschalt/);
    // 거꾸로 찾기
    for (const [l, k] of [['en', SKIP[1]], ['de', SKIP[4]], ['zh-CN', SKIP[0]], ['ja', SKIP[3]], ['zh-CN', ADD], ['de', ADD]] as const) expect(sourceMessage(dict[l][k]!), `${l}: ${k}`).toBe(k);
  });

  it('주석 축척·축척 목록 글은 같은 사전의 낱말이다(사용자 정의·축척 바꾸기·축척 수·겹침·Maßstab·Beschriftungsmaßstab·再定義·注释·比例·图形)', () => {
    const [en, de, ja, zh] = [dict.en, dict.de, dict.ja, dict['zh-CN']];
    const as = src('app/annoscale.ts');
    for (const s of ["title: '현재 주석 축척',", "title: '현재 주석 축척 값',", "title: '도면 축척 편집',", "title: '도면 축척 편집(명령행)',", "ctx.print(`${drop.length}개의 축척을 삭제했습니다.`);"])
      expect(as, s).toContain(s);
    const st = src('app/annoscale-status.ts');
    for (const s of ["{ label: '사용자...', run: () => void app.run('SCALELISTEDIT') },", '외부 참조 축척 숨기기`,', '비율 축척 백분율`,']) expect(st, s).toContain(s);
    expect(src('app/annoscale-core.ts')).toContain("app.cmd.print('뷰포트가 잠겨 있어 축척을 바꿀 수 없습니다.', 'err');");
    const sc = src('edit/annoscale/scales.ts');
    for (const s of ['return `축척은 ${MAX_SCALES}개를 넘을 수 없습니다.`;', 'return `축척 이름 ${s.name}이(가) 겹칩니다.`;', 'return `${fmtNum(s.paper)} 용지 단위 = ${fmtNum(s.drawing)} 도면 단위`;'])
      expect(sc, s).toContain(s);
    const ui = src('app/annoscale-ui.ts');
    for (const s of ["note: '축척 특성: 용지 단위 1이 도면 단위 몇과 같은지 입력합니다.',", "      '축척 편집',", "modal<'ok' | 'cancel'>('객체에 축척 추가',", "`선택한 주석 객체 ${objs.length}개`"])
      expect(ui, s).toContain(s);
    // 축척 목록 메뉴 「사용자...」(SCALELISTEDIT를 연다 — AutoCAD Custom) = 「사용자 정의」 + ...
    for (const l of LANGS) expect(dict[l]['사용자...'], l).toBe(`${dict[l]['사용자 정의']}...`);
    expect(LANGS.map((l) => dict[l]['사용자...'])).toEqual(['Custom...', 'Benutzerdefiniert...', 'ユーザー定義...', '用户自定义...']);
    // 켜진 메뉴 항목(✓ — 틀 {0})은 꺼진 항목과 같은 이름
    for (const l of LANGS) expect(dict[l]['{0}외부 참조 축척 숨기기'], l).toBe(`{0}${dict[l]['외부 참조 축척 숨기기']}`);
    // 뷰포트 잠김 = 축척을 바꿀 수 없음(「블록 편집기에서는 주석 축척을 바꿀 수 없습니다」 cannot be changed·nicht geändert·无法…更改 — 크기 바꾸기가 아니다)
    const LOCK = '뷰포트가 잠겨 있어 축척을 바꿀 수 없습니다.';
    expect([en[LOCK], de[LOCK], zh[LOCK]]).toEqual(['The viewport is locked, so its scale cannot be changed.', 'Das Ansichtsfenster ist gesperrt; der Maßstab kann nicht geändert werden.', '视口已锁定，无法更改比例。']);
    expect(en['블록 편집기에서는 주석 축척을 바꿀 수 없습니다.']).toContain('cannot be changed');
    expect(`${en[LOCK]} ${de[LOCK]} ${zh[LOCK]}`).not.toMatch(/scaled|skaliert|缩放/);
    // 축척 수 한도(원문 「개」 — 축척 값이 아니다), 축척 이름 겹침 = 중복(「이름 "{0}"이(가) 겹칩니다」 Doppelter Name, 「중복된 정의」 重复 — 도형 겹침 überschneiden·重叠이 아니다)
    const MAX = '축척은 {0}개를 넘을 수 없습니다.';
    expect([en[MAX], de[MAX], ja[MAX], zh[MAX]]).toEqual(['The number of scales cannot exceed {0}.', 'Die Anzahl der Maßstäbe darf {0} nicht überschreiten.', '尺度は {0} 個を超えることはできません。', '比例不能超过 {0} 个。']);
    const DUP = '축척 이름 {0}이(가) 겹칩니다.';
    expect(de['이름 "{0}"이(가) 겹칩니다.']).toBe('Doppelter Name „{0}“.');
    expect(de[DUP]).toBe('Doppelter Maßstabsname {0}.');
    expect(zh['중복된 정의는 무시됩니다(이 도면에 이미 있는 {0}: {1}).']).toContain('重复');
    expect(zh[DUP]).toBe('比例名称 {0} 重复。');
    // 독일어: 현재 주석 축척 값 ≠ 현재 주석 축척(다른 명령 — CANNOSCALEVALUE·CANNOSCALE)
    for (const l of LANGS) expect(dict[l]['현재 주석 축척 값'], l).not.toBe(dict[l]['현재 주석 축척']);
    expect(de['현재 주석 축척 값']).toBe('Wert des aktuellen Beschriftungsmaßstabs');
    // 독일어 축척 = Maßstab(「축척 추가」 Maßstab hinzufügen·「축척 리스트」 Maßstabsliste — Skalierung 크기 바꾸기·Skala 눈금이 아니다)
    expect([de['축척 추가'], de['축척 리스트']]).toEqual(['Maßstab hinzufügen', 'Maßstabsliste']);
    expect(de['축척 편집']).toBe(de['축척 추가']!.replace('hinzufügen', 'bearbeiten'));
    expect([de['객체에 축척 추가'], de['주석 축척 변경 시 축척 추가']]).toEqual(['Maßstab zu Objekten hinzufügen', 'Maßstab beim Ändern des Beschriftungsmaßstabs hinzufügen']);
    const LIST = ['축척 리스트를 기본값으로 재설정하시겠습니까?', '축척 리스트를 기본값으로 재설정했습니다.', '축척 리스트를 기본값으로 재설정하시겠습니까? 사용 중인 축척과 현재 축척은 남습니다.', '축척 리스트에 나타나는 이름(N)', '축척 리스트에는 축척이 하나 이상 있어야 합니다.'];
    for (const k of LIST) expect(de[k], k).toContain(de['축척 리스트']!);
    expect(de['축척 리스트에는 축척이 하나 이상 있어야 합니다.']).toBe('Die Maßstabsliste muss mindestens einen Maßstab enthalten.');
    expect(de['{0}개의 축척을 삭제했습니다.']).toBe(de['블록 {0}개가 삭제되었습니다.']!.replace('Blöcke', 'Maßstäbe'));
    for (const k of [...LIST, '축척 편집', '객체에 축척 추가', '주석 축척 변경 시 축척 추가', '{0}개의 축척을 삭제했습니다.']) expect(de[k], k).not.toMatch(/Skal/);
    // 독일어 주석 축척 = Beschriftungsmaßstab(「주석 축척」 — 119차, Anmerkung 무리는 305·307차 보고)
    const ANNO = [
      '뷰포트 주석 축척',
      '뷰포트 주석 축척: {0}{1}',
      '뷰포트 주석 축척: {0} (잠긴 뷰포트)',
      '도면 공간의 주석 축척은 1:1입니다. 모형 공간이나 뷰포트 안에서 바꾸십시오.',
      '블록 편집기에서는 주석 축척을 바꿀 수 없습니다.',
      '{0}개의 객체가 주석 축척 <{1}>을(를) 지원하도록 업데이트되었습니다.',
      '{0}은(는) 현재 주석 축척이므로 삭제할 수 없습니다.',
    ];
    expect(de['주석 축척']).toBe('Beschriftungsmaßstab');
    for (const k of ANNO) {
      expect(de[k], k).toContain('Beschriftungsmaßstab');
      expect(de[k], k).not.toMatch(/Anmerkung/);
    }
    expect(de['뷰포트 주석 축척']).toBe('Ansichtsfenster-Beschriftungsmaßstab');
    // 용지 단위 1 = 도면 단위 몇(1이 무엇인지), 도면 단위 = 「도면 단위(W)」 Zeichnungseinheiten(Zeicheneinheit 글자 단위가 아니다)
    expect(de['축척 특성: 용지 단위 1이 도면 단위 몇과 같은지 입력합니다.']).toBe('Maßstabseigenschaften: Geben Sie an, wie vielen Zeichnungseinheiten 1 Papiereinheit entspricht.');
    expect(de['{0} 용지 단위 = {1} 도면 단위']).toBe(`{0} Papiereinheit = {1} ${de['도면 단위(W)']!.replace(' (W)', '')}`);
    // 뷰포트 축척과 같지 않음 풍선(「… um … Synchronisieren」 깨짐)
    expect(de['주석 축척이 뷰포트 축척과 같지 않음: 동기화하려면 클릭']).toBe('Beschriftungsmaßstab stimmt nicht mit dem Ansichtsfenstermaßstab überein: Zum Synchronisieren klicken');
    // 일본어 재정의 = 再定義(オーバーライド 덮어쓰기가 아니다), 축척 = 尺度
    expect(ja['재정의']).toBe('再定義');
    expect(ja['{0}이(가) 이미 있습니다. 축척을 재정의하시겠습니까?']).toBe('{0} は既に存在します。尺度を再定義しますか？');
    // 중국어 주석 = 注释(「주석 축척」 注释比例 — 标注는 치수)
    const ZA = ['현재 주석 축척', '현재 주석 축척 값', '현재 주석 축척(CANNOSCALE)', '선택한 주석 객체 {0}개'];
    expect(ZA.map((k) => zh[k])).toEqual([`当前${zh['주석 축척']}`, `当前${zh['주석 축척']}值`, `当前${zh['주석 축척']} (CANNOSCALE)`, '已选择 {0} 个注释对象']);
    for (const k of ZA) expect(zh[k], k).not.toContain('标注');
    // 중국어 결과 줄: 수 = 「{0} 个…」(「블록 {0}개가 삭제되었습니다」 已删除 {0} 个块·311차 已重置 {0} 个块 — 「{0} 已…」은 수가 이름처럼 읽힌다)
    const ZN: [string, string][] = [
      ['{0}개의 축척을 삭제했습니다.', zh['블록 {0}개가 삭제되었습니다.']!.replace('块', '比例')],
      ['{0}개의 객체를 재설정했습니다.', zh['블록 {0}개를 재설정했습니다.']!.replace('块', '对象')],
      ['{0}개의 객체를 업데이트했습니다.', '已更新 {0} 个对象。'],
      ['{0}개의 객체가 주석 축척 <{1}>을(를) 지원하도록 업데이트되었습니다.', '已更新 {0} 个对象以支持注释比例 <{1}>。'],
      ['{0}개의 객체는 축척이 하나뿐이어서 삭제하지 않았습니다.', '{0} 个对象只有一个比例，因此未删除。'],
    ];
    for (const [k, v] of ZN) {
      expect(zh[k], k).toBe(v);
      expect(zh[k], k).not.toMatch(/^\{0\} 已|^\{0\} 未/);
    }
    // 중국어 축척 = 比例(「축척 추가」 添加比例 — 缩放은 확대·크기 바꾸기), 블록 편집기 = 块编辑器, 도면 = 图形(图纸는 용지·도면 공간)
    expect([zh['새 축척 이름 입력:'], zh['객체 축척 리스트(O)'], zh['{0}비율 축척 백분율']]).toEqual(['输入新的比例名称：', '对象比例列表 (O)', '{0}比例百分比']);
    for (const k of ['새 축척 이름 입력:', '객체 축척 리스트(O)', '{0}비율 축척 백분율', LOCK, ADD]) expect(zh[k], k).not.toContain('缩放');
    expect(zh['블록 편집기에서는 주석 축척을 바꿀 수 없습니다.']).toBe(`无法在${zh['블록 편집기']}中更改${zh['주석 축척']}。`);
    expect(zh['도면']).toBe('图形');
    expect(['도면 축척 편집', '도면 축척 편집(명령행)', '도면 축척 편집 (SCALELISTEDIT)'].map((k) => zh[k])).toEqual(['编辑图形比例', '编辑图形比例（命令行）', '编辑图形比例（SCALELISTEDIT）']);
    // 거꾸로 찾기
    for (const [l, k] of [['en', '사용자...'], ['de', '현재 주석 축척 값'], ['zh-CN', '도면 축척 편집'], ['ja', '{0}이(가) 이미 있습니다. 축척을 재정의하시겠습니까?'], ['zh-CN', '{0}개의 축척을 삭제했습니다.'], ['de', DUP], ['en', LOCK]] as const)
      expect(sourceMessage(dict[l][k]!), `${l}: ${k}`).toBe(k);
  });

  it('-SCALELISTEDIT·-OBJECTSCALE 물음·삭제 막힘 줄과 특성 팔레트 「*여러 개* …」가 네 언어 모두 한국어 없이 보인다', () => {
    const as = src('app/annoscale.ts');
    for (const s of [
      "ctx.print(`축척 ${ft(s.name)}은(는) ${s === cur ? '현재 주석 축척이므로' : '사용 중이므로'} 삭제할 수 없습니다.`);",
      "`${add ? '추가' : '삭제'}할 명명된 축척 입력 또는 [?] <${names.length ? '종료' : ft(def)}>:`",
      "askYesNo(ctx, '축척 리스트를 기본값으로 재설정하시겠습니까?', false)",
      'askYesNo(ctx, `${ft(have.name)}이(가) 이미 있습니다.  축척을 재정의하시겠습니까?`, false)',
    ])
      expect(as, s).toContain(s);
    expect(src('app/util2-ui.ts')).toContain("askKeyword(ctx, `${prompt} [예(Y)/아니오(N)] <${def ? '예' : '아니오'}>:`, [");
    // 명령행 입력 줄은 「앞 글 [」·옵션 마디·「] 뒤 글」로 나눠 옮긴다
    expect(src('app/commandline.ts')).toContain("const shown = balanceMarks([m[1] + '[', ");
    const pal = src('app/annoscale-palette.ts');
    expect(pal).toContain("let text = '*여러 개*';");
    expect(pal).toContain('`${text} …`');
    const LINES = [
      `축척 ${ft('1:50')}은(는) 현재 주석 축척이므로 삭제할 수 없습니다.`,
      `축척 ${ft('1:50')}은(는) 사용 중이므로 삭제할 수 없습니다.`,
      '추가할 명명된 축척 입력 또는 [',
      '삭제할 명명된 축척 입력 또는 [',
      '추가할 명명된 축척 입력 또는 [?] <종료>: 1:50',
      `추가할 명명된 축척 입력 또는 [?] <${ft('1:1')}>: 1:50`,
      '삭제할 명명된 축척 입력 또는 [?] <종료>: 1:50',
      `삭제할 명명된 축척 입력 또는 [?] <${ft('1:1')}>: 1:50`,
      '축척 리스트를 기본값으로 재설정하시겠습니까? [',
      '축척 리스트를 기본값으로 재설정하시겠습니까? [예(Y)/아니오(N)] <아니오>: Y',
      `${ft('1:50')}이(가) 이미 있습니다.  축척을 재정의하시겠습니까? [`,
      `${ft('1:50')}이(가) 이미 있습니다.  축척을 재정의하시겠습니까? [예(Y)/아니오(N)] <아니오>: N`,
      '*여러 개* …',
    ];
    const left: string[] = [];
    for (const l of LANGS) for (const s of LINES) if (HANGUL.test(show(l)(s))) left.push(`${l}: ${show(l)(s)}`);
    expect(left).toEqual([]);
    expect(show('en')(`축척 ${ft('1:50')}은(는) 사용 중이므로 삭제할 수 없습니다.`)).toBe('Scale 1:50 cannot be deleted because it is in use.');
    expect(show('de')('추가할 명명된 축척 입력 또는 [?] <종료>: 1:50')).toBe('Geben Sie einen hinzuzufügenden benannten Maßstab ein oder [?] <Beenden>: 1:50');
    expect(show('ja')(`삭제할 명명된 축척 입력 또는 [?] <${ft('1:1')}>: 1:50`)).toBe('削除する名前付き尺度を入力、または [?] <1:1>: 1:50');
    expect(show('zh-CN')(`${ft('1:50')}이(가) 이미 있습니다.  축척을 재정의하시겠습니까? [예(Y)/아니오(N)] <아니오>: N`)).toBe('1:50 已存在。是否要重新定义比例？ [是(Y)/否(N)] <否>： N');
    expect(show('en')('축척 리스트를 기본값으로 재설정하시겠습니까? [예(Y)/아니오(N)] <아니오>: Y')).toBe('Reset the scale list to default values? [Yes (Y)/No (N)] <No>: Y');
    expect(show('ja')('*여러 개* …')).toBe('*複数* …');
    // 새 열쇠 = 같은 사전 낱말: 삭제 막힘 = 「{0}은(는) 현재 주석 축척이므로 …」·「축척 {0}을(를) 찾지 못했습니다」 꼴, 통째 = 앞 조각 + 옵션 + 뒤 조각(286차 꼴), 물음 앞 조각 = 물음 + [
    const NO: Record<Lang, string> = { en: 'No', de: 'Nein', ja: 'いいえ', 'zh-CN': '否' };
    const IN_USE: Record<Lang, string> = {
      en: 'Scale {0} cannot be deleted because it is in use.',
      de: 'Maßstab {0} kann nicht gelöscht werden, da er verwendet wird.',
      ja: '尺度 {0} は使用中なので削除できません。',
      'zh-CN': '比例 {0} 无法删除，因为它正在使用中。',
    };
    const FRONT: Record<Lang, [add: string, del: string]> = {
      en: ['Enter a named scale to add or [', 'Enter a named scale to delete or ['],
      de: ['Geben Sie einen hinzuzufügenden benannten Maßstab ein oder [', 'Geben Sie einen zu löschenden benannten Maßstab ein oder ['],
      ja: ['追加する名前付き尺度を入力、または [', '削除する名前付き尺度を入力、または ['],
      'zh-CN': ['输入要添加的命名比例或 [', '输入要删除的命名比例或 ['],
    };
    for (const l of LANGS) {
      const d = dict[l];
      const colon = l === 'zh-CN' ? '：' : ':';
      const cur = '{0}은(는) 현재 주석 축척이므로 삭제할 수 없습니다.';
      if (l === 'ja') expect(d['축척 {0}은(는) 현재 주석 축척이므로 삭제할 수 없습니다.'], l).toBe('尺度 {0} は現在の注釈尺度なので削除できません。');
      else expect(d['축척 {0}은(는) 현재 주석 축척이므로 삭제할 수 없습니다.'], l).toBe(d[cur]!.replace('{0}', { en: 'Scale {0}', de: 'Maßstab {0}', 'zh-CN': '比例 {0}' }[l]));
      expect(d['축척 {0}은(는) 사용 중이므로 삭제할 수 없습니다.'], l).toBe(IN_USE[l]);
      expect(d['축척 {0}을(를) 찾지 못했습니다.'], l).toMatch(/Scale|Maßstab|尺度|比例/);
      const [fa, fd] = FRONT[l];
      expect([d['추가할 명명된 축척 입력 또는 ['], d['삭제할 명명된 축척 입력 또는 [']], l).toEqual([fa, fd]);
      for (const [k, f] of [['추가', fa], ['삭제', fd]] as const) {
        expect(d[`${k}할 명명된 축척 입력 또는 [?] <종료>:`], `${l}: ${k}`).toBe(`${f}?${d['] <종료>:']}`);
        expect(d[`${k}할 명명된 축척 입력 또는 [?] <{0}>:`], `${l}: ${k}`).toBe(`${f}?] <{0}>${colon}`);
      }
      for (const q of ['축척 리스트를 기본값으로 재설정하시겠습니까?', '{0}이(가) 이미 있습니다. 축척을 재정의하시겠습니까?']) {
        expect(d[`${q} [`], `${l}: ${q}`).toBe(`${d[q]} [`);
        expect(d[`${q} [예(Y)/아니오(N)] <아니오>:`], `${l}: ${q}`).toBe(`${d[q]} [${d['예(Y)']}/${d['아니오(N)']}] <${NO[l]}>${colon}`);
      }
      expect(d['*여러 개* …'], l).toBe(`${d['*여러 개*']} …`);
    }
    // 거꾸로 찾기
    for (const [l, k] of [['en', '추가할 명명된 축척 입력 또는 ['], ['de', '축척 {0}은(는) 사용 중이므로 삭제할 수 없습니다.'], ['zh-CN', '축척 리스트를 기본값으로 재설정하시겠습니까? ['], ['ja', '*여러 개* …']] as const)
      expect(sourceMessage(dict[l][k]!), `${l}: ${k}`).toBe(k);
  });
});
