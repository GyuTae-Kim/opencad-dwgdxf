/**
 * 311차: 310차가 남긴 중국어 RESETBLOCK 결과 줄과 스크립트·명령 별칭·디자인센터 묶음의 번역 대조·빠진 번역.
 * - 출발점(310차 보고 (3)): 중국어 「블록 {0}개를 재설정했습니다.」 重置块 {0}(수가 블록 이름처럼 읽힘) → 같은 사전 「{0} 个块」 꼴.
 * - 오역: 스크립트 멈춤 줄(줄 번호 자리·뜻), RESUME·RSCRIPT 안내(처음부터 = RSCRIPT), ALIASEDIT 「구분」·「명령」·명령 없음·기본값 복원 단추 이름,
 *   디자인센터 닫기(关闭 — 도형 닫기 闭合가 아니다)·도면과 종류·선택 상태 줄·로드 안내·ADCADD 제목과 안내(디자인센터에서 넣음 — 디자인센터에 넣음이 아니다)·
 *   함께 가져온 정의·용지·「{0} 추가(A)」 어순·Ctrl·Shift(어느 하나 — 함께 누름이 아니다)·설명 줄의 객체 수·데이터 문자.
 * - 빠진 번역: 디자인센터가 종류 이름표를 틀에 끼운 줄(바로 가기 메뉴·빈 목록·설명·가져오기 결과 — 틀은 잡은 값을 옮기지 않아 네 언어 모두 한국어),
 *   속성 있는 블록·용지 이름 없는 배치·문자 스타일 설명 줄.
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
/** 명령행·패널에 보이는 꼴(통째 번역 + 옵션 이름인 기본값 — fileguard translateTail) */
const show = (l: string) => (x: string) => translateTail(x, tr(l)(x), tr(l));

/** 스크립트 멈춤 줄(edit/script/runner.ts — Esc 멈춤·오류 멈춤) */
const STOP = '스크립트 "{0}"을(를) {1}번째 줄에서 멈췄습니다. 이어서 하려면 RESUME을 입력하십시오.';
const FAIL = '스크립트 "{0}" {1}번째 줄{2}에서 멈췄습니다: {3}';
const AGAIN = '고친 뒤 이어서 하려면 RESUME, 처음부터는 RSCRIPT를 입력하십시오.';
/** 디자인센터 내용 종류(edit/layertools/clone.ts DEF_KIND_LABEL 차례) */
const KINDS = ['블록', '도면층', '선종류', '문자 스타일', '치수 스타일', '다중 지시선 스타일', '테이블 스타일', '배치'] as const;
/** 영어·독일어 종류 낱말 — 복수는 같은 사전 「도면층 {0}개, 선종류 {1}개, 문자 스타일 {2}개, 치수 스타일 {3}개」 꼴 */
const PL: Record<'en' | 'de', readonly string[]> = {
  en: ['blocks', 'layers', 'linetypes', 'text styles', 'dimension styles', 'multileader styles', 'table styles', 'layouts'],
  de: ['Blöcke', 'Layer', 'Linientypen', 'Textstile', 'Bemaßungsstile', 'Multileader-Stile', 'Tabellenstile', 'Layouts'],
};
const SG: Record<'en' | 'de', readonly string[]> = {
  en: ['block', 'layer', 'linetype', 'text style', 'dimension style', 'multileader style', 'table style', 'layout'],
  de: ['Block', 'Layer', 'Linientyp', 'Textstil', 'Bemaßungsstil', 'Multileader-Stil', 'Tabellenstil', 'Layout'],
};

describe('스크립트·명령 별칭·디자인센터 묶음의 번역과 310차가 남긴 RESETBLOCK 결과 줄(311차)', () => {
  it('출발점과 스크립트·명령 별칭 글은 같은 사전의 낱말이다(재설정한 블록 수·줄 번호·처음부터 = RSCRIPT·구분·명령 없음·기본값 복원)', () => {
    const [en, de, ja, zh] = [dict.en, dict.de, dict.ja, dict['zh-CN']];
    expect(src('app/dynblock.ts')).toContain('ctx.print(`블록 ${n}개를 재설정했습니다.`);');
    const runner = src('edit/script/runner.ts');
    for (const s of [
      'this.say(`스크립트 "${ft(this.name)}"을(를) ${this.current?.line ?? 1}번째 줄에서 멈췄습니다. 이어서 하려면 RESUME을 입력하십시오.`);',
      "this.say(`스크립트 \"${ft(this.name)}\" ${t?.line ?? 0}번째 줄${t ? ` \"${ft(t.text)}\"` : ''}에서 멈췄습니다: ${message}`, 'err');",
      `this.say('${AGAIN}');`,
    ])
      expect(runner, s).toContain(s);
    const alias = src('app/aliasedit.ts');
    for (const s of [
      "pickList<Row>(['별칭', '명령', '구분'], (r) => [r.alias, r.cmd, r.kind], {",
      'err.textContent = `명령 "${c}"이(가) 없습니다.`',
      "return fail('별칭이 하나도 없습니다. 기본값 복원을 누르십시오.');",
      "btn('기본값 복원', restore)",
    ])
      expect(alias, s).toContain(s);
    // RESETBLOCK: 재설정한 블록 수 = 같은 사전 「블록 {0}개가 삭제되었습니다.」 已删除 {0} 个块 꼴(重置块 {0}은 수를 블록 이름처럼 읽힌다)
    expect(zh['블록 {0}개를 재설정했습니다.']).toBe(zh['블록 {0}개가 삭제되었습니다.']!.replace('删除', '重置'));
    expect(zh['블록 {0}개를 재설정했습니다.']).toBe('已重置 {0} 个块。');
    // 멈춘 줄 = 줄 번호(「{0}번째 줄: …」 第·行·Zeile·line), 오류 멈춤은 {1} 줄 번호 뒤에 {2}(「 "줄 글"」), {3} 까닭
    expect(zh[STOP]).toBe('脚本“{0}”在第 {1} 行停止。输入 RESUME 继续。');
    expect(zh['{0}번째 줄: 그룹 코드가 아닙니다.']).toContain('{0}行');
    expect(LANGS.map((l) => dict[l][FAIL])).toEqual([
      'Script "{0}" stopped at line {1}{2}: {3}',
      'Skript „{0}“ wurde in Zeile {1}{2} angehalten: {3}',
      'スクリプト「{0}」が{1}行目{2}で停止しました: {3}',
      '脚本“{0}”在第 {1} 行{2}处停止：{3}',
    ]);
    const LINE: Record<Lang, string> = { en: 'line {1}', de: 'Zeile {1}', ja: '{1}行目', 'zh-CN': '第 {1} 行' };
    for (const l of LANGS) {
      expect(dict[l][STOP], l).toContain(LINE[l]);
      expect(dict[l][FAIL], l).toContain(LINE[l]);
    }
    expect(show('zh-CN')(`스크립트 "${ft('a.scr')}"을(를) 3번째 줄에서 멈췄습니다. 이어서 하려면 RESUME을 입력하십시오.`)).toBe('脚本“a.scr”在第 3 行停止。输入 RESUME 继续。');
    // 고친 뒤 이어서 = RESUME, 처음부터 = RSCRIPT(「스크립트 처음부터 다시」 — 처음부터가 RESUME에 붙지 않는다)
    expect([en['스크립트 처음부터 다시'], de['스크립트 처음부터 다시']]).toEqual(['Restart script from the beginning', 'Skript neu starten']);
    expect(en[AGAIN]).toBe('To continue after fixing it, enter RESUME; to start over, enter RSCRIPT.');
    expect(de[AGAIN]).toBe('Um nach der Korrektur fortzufahren, geben Sie RESUME ein; um von vorn zu beginnen, RSCRIPT.');
    expect(`${en[AGAIN]} ${de[AGAIN]}`).not.toMatch(/from the beginning|von Anfang an/);
    expect([ja[AGAIN], zh[AGAIN]]).toEqual(['修正した後、続行するにはRESUME、最初からRSCRIPTと入力します。', '输入 RESUME 以在修复后继续，或输入 RSCRIPT 以重新开始。']);
    // ALIASEDIT: 열 머리 「구분」 = 범주(字段类别·项目类别 — 分离件은 떼어 낸 부품), 「명령」 = 「명령(C)」 낱말, 명령 없음 = 「그룹 "{0}"이(가) 없습니다.」 不存在 꼴
    expect(zh['구분']).toBe('类别');
    expect([zh['필드 범주'], zh['항목 클래스']].join('')).toContain('类别');
    expect(Object.values(zh).filter((v) => v.includes('分离件'))).toEqual([]);
    expect(en['명령']).toBe(en['명령(C)']!.replace(' (C)', ''));
    expect(zh['명령 "{0}"이(가) 없습니다.']).toBe(zh['그룹 "{0}"이(가) 없습니다.']!.replace('组', '命令'));
    // 별칭이 없을 때 누르라는 단추 이름 = 그 단추 글(「기본값 복원」 — 영어 문장 안의 단추 이름 대문자 꼴 Restore Defaults는 말투라 대소문자는 보지 않는다)
    for (const l of LANGS) expect(dict[l]['별칭이 하나도 없습니다. 기본값 복원을 누르십시오.']!.toLowerCase(), l).toContain(dict[l]['기본값 복원']!.toLowerCase());
    // 거꾸로 찾기
    for (const [l, k] of [['zh-CN', '블록 {0}개를 재설정했습니다.'], ['en', FAIL], ['de', AGAIN], ['zh-CN', '구분'], ['en', '명령']] as const) expect(sourceMessage(dict[l][k]!), `${l}: ${k}`).toBe(k);
  });

  it('디자인센터 글은 같은 사전의 낱말이다(닫기·종류·선택 상태·로드·ADCADD·함께 가져온 정의·용지·추가 어순·Ctrl·Shift·설명 줄)', () => {
    const [en, de, ja, zh] = [dict.en, dict.de, dict.ja, dict['zh-CN']];
    const dc = src('app/designcenter.ts');
    for (const s of [
      "title: '닫기 (ADCCLOSE)'",
      "'왼쪽에서 도면과 종류를 고르십시오.'",
      '`${this.sel.size}개 선택 → ${ft(target.name)}`',
      "'로드(L)로 도면 파일을 고르십시오.'",
      "title: '디자인센터 항목 추가',",
      "ctx.print('디자인센터(ADCENTER)에서 넣을 항목을 고르십시오.');",
      'ctx.print(`함께 가져온 정의: ${',
      "ft(l.plot.paperName) : '용지'} ${l.plot.paperWidth}×${l.plot.paperHeight} mm · 객체 ${n}개`",
      '`${DEF_KIND_LABEL[this.cur.kind]} 추가(A)`',
      "'항목을 고르십시오(Ctrl·Shift로 여러 개, 더블클릭으로 바로 추가).'",
      '데이터 문자 ${ft(s.cells.data.textStyle)} ${s.cells.data.height}',
      "객체 ${b.entities.length}개${att ? `, 속성 ${att}개` : ''} · 기준점 ",
    ])
      expect(dc, s).toContain(s);
    // 닫기 = 창 닫기(「디자인센터 닫기」 关闭 — 闭合는 도형 닫기)
    expect(zh['닫기 (ADCCLOSE)']).toBe(`${zh['디자인센터 닫기']!.slice(0, 2)} (ADCCLOSE)`);
    // 도면과 종류(「도면과 종류」 类型 — 键入은 타자)
    expect(zh['왼쪽에서 도면과 종류를 고르십시오.']).toBe('从左侧选择图形和类型。');
    expect(zh['도면과 종류']).toContain('类型');
    // 선택 상태 줄 = 고른 수(「{0}개 선택됨」 — 명령꼴 Select·Wählen Sie가 아니다)
    for (const l of ['en', 'de'] as const) expect(dict[l]['{0}개 선택 → {1}'], l).toBe(`${dict[l]['{0}개 선택됨']} → {1}`);
    expect(show('en')(`2개 선택 → ${ft('Drawing1.dwg')}`)).toBe('2 selected → Drawing1.dwg');
    // 로드(L)로 도면 파일 = Zeichnungsdatei(Teilbild가 아니다 — 306차)
    expect(de['로드(L)로 도면 파일을 고르십시오.']).toBe(`Wählen Sie mit ${de['로드(L)...']!.replace('...', '')} eine Zeichnungsdatei aus.`);
    expect(de['공유한 내용에 도면 파일이 없습니다. DWG·DXF 파일을 공유하십시오.']).toContain('Zeichnungsdatei');
    // ADCADD: 제목 = 항목 추가(일본어·중국어 追加·添加 — 지난 일 added가 아니다), 안내 = 디자인센터에서 고른 항목을 넣는다(일본어 から — 디자인센터에 넣는 것이 아니다)
    expect([en['디자인센터 항목 추가'], de['디자인센터 항목 추가']]).toEqual(['Add Design Center items', 'Design Center-Elemente hinzufügen']);
    expect([ja['디자인센터 항목 추가'], zh['디자인센터 항목 추가']].join('')).toMatch(/追加[\s\S]*添加/);
    const PICK = '디자인센터(ADCENTER)에서 넣을 항목을 고르십시오.';
    expect(LANGS.map((l) => dict[l][PICK])).toEqual([
      'Select the items to add in Design Center (ADCENTER).',
      'Wählen Sie im Design Center (ADCENTER) die hinzuzufügenden Elemente aus.',
      'デザインセンター（ADCENTER）から、追加する項目を選択してください。',
      '请在设计中心 (ADCENTER) 中选择要添加的项目。',
    ]);
    // 함께 가져온 정의 = 함께 들여온(「… 가져올 수 없습니다」 importiert·导入 — 합침 Zusammengeführt·요약 汇总이 아니다)
    const DEPS = '함께 가져온 정의: {0}';
    expect([en[DEPS], de[DEPS], zh[DEPS]]).toEqual(['Definitions also imported: {0}', 'Ebenfalls importierte Definitionen: {0}', '一并导入的定义：{0}']);
    expect([de['{0} {1}을(를) 가져올 수 없습니다.'], zh['{0} {1}을(를) 가져올 수 없습니다.']].join('')).toMatch(/importiert[\s\S]*导入/);
    // 용지 = 종이(「용지 크기」 纸张·Papier — 논문 论文·Dokument가 아니다, 301차 「용지 없음」)
    expect([de['용지'], zh['용지']]).toEqual(['Papier', '纸张']);
    expect([de['종이'], zh['종이']]).toEqual([de['용지'], zh['용지']]);
    expect(zh['용지 크기']!.startsWith(zh['용지']!)).toBe(true);
    expect(de['용지 크기']!.startsWith(de['용지']!)).toBe(true);
    // 「{0} 추가(A)」 = 「도면에 추가(A)」 어순(Add … (A)·… hinzufügen (A))
    expect([en['{0} 추가(A)'], de['{0} 추가(A)']]).toEqual(['Add {0} (A)', '{0} hinzufügen (A)']);
    expect(en['도면에 추가(A)']!.startsWith('Add ')).toBe(true);
    expect(de['도면에 추가(A)']!.endsWith(' hinzufügen (A)')).toBe(true);
    // Ctrl·Shift로 여러 개 = 어느 하나를 누른 채(도면층 팔레트 「Ctrl·Shift로 여러 개」 Strg oder Umschalt·Ctrl 或 Shift — 함께 누르는 키 조합이 아니다)
    const MANY = '항목을 고르십시오(Ctrl·Shift로 여러 개, 더블클릭으로 바로 추가).';
    const LAYPAL = '클릭하면 그 도면층만 보입니다. Ctrl·Shift로 여러 개, 오른쪽 클릭으로 선택 유지·참조되지 않은 항목 선택·검사. 도면은 이 창을 연 채 확대·초점이동할 수 있습니다.';
    expect(de[MANY]).toContain('Strg oder Umschalt');
    expect(zh[MANY]).toContain('Ctrl 或 Shift');
    expect(de[LAYPAL]).toContain('Strg oder Umschalt');
    expect(zh[LAYPAL]).toContain('Ctrl 或 Shift');
    expect(`${de[MANY]} ${zh[MANY]}`).not.toMatch(/Strg\+Umschalt|Ctrl\+Shift/);
    // 설명 줄: 배치의 객체 수 = 「객체 {0}개」({3} objects — Object {3}가 아니다), 데이터 문자 = 「데이터 문자 높이」 낱말(data text — 글자 character·끝의 至가 아니다), 블록 객체 수 = 对象 {1}(项目가 아니다)
    const MM = '{0} {1}×{2} mm · 객체 {3}개';
    for (const l of ['en', 'de'] as const) expect(dict[l][MM], l).toBe(`{0} {1}×{2} mm · ${dict[l]['객체 {0}개']!.replace('{0}', '{3}')}`);
    expect(show('en')(`${ft('Layout1')}\n${ft('ISO A4')} 210×297 mm · 객체 3개`)).toBe('Layout1 ISO A4 210×297 mm · 3 objects');
    const DATA = '{0}{1}데이터 문자 {2} {3}';
    expect([en[DATA], de[DATA], zh[DATA]]).toEqual(['{0}{1}data text {2} {3}', '{0}{1}Datentext {2} {3}', '{0}{1}数据文字 {2} {3}']);
    expect(en['데이터 문자 높이는 0보다 커야 합니다.']).toMatch(/^Data text /);
    const BLK = '{0}객체 {1}개{2} · 기준점 {3}, {4}';
    expect(zh[BLK]).toBe(`{0}${zh['객체 {0}개']!.replace('{0}', '{1}')}{2} · 基点 {3}, {4}`);
    // 거꾸로 찾기
    for (const [l, k] of [['zh-CN', '닫기 (ADCCLOSE)'], ['de', '디자인센터 항목 추가'], ['en', PICK], ['zh-CN', '왼쪽에서 도면과 종류를 고르십시오.'], ['de', MANY], ['en', DATA]] as const)
      expect(sourceMessage(dict[l][k]!), `${l}: ${k}`).toBe(k);
  });

  it('디자인센터가 종류 이름표를 끼운 줄과 설명 줄이 네 언어 모두 한국어 없이 보인다', () => {
    const clone = src('edit/layertools/clone.ts');
    for (const [k, id] of KINDS.map((k, i) => [k, ['block', 'layer', 'linetype', 'textStyle', 'dimStyle', 'mleaderStyle', 'tableStyle', 'layout'][i]] as const))
      expect(clone, k).toContain(`  ${id}: '${k}',`);
    const dc = src('app/designcenter.ts');
    for (const s of [
      "h('div', { class: 'dc-empty' }, `${DEF_KIND_LABEL[kind]}이(가) 없습니다.`)",
      '`${ft(s.label)} — ${DEF_KIND_LABEL[kind]} ${this.items.length}개`',
      "ctx.print(`${label} ${added.length}개가 추가되었습니다(${added.map(ft).join(', ')}).`);",
      // 339차: 종류 이름표는 명령행에서 틀 {n} 자리라 uiText로 끼운다(front337 339차 절)
      "else ctx.print(`중복된 정의는 무시됩니다(이 도면에 이미 있는 ${uiText(label)}: ${dup.map(ft).join(', ')}).`);",
      "if (miss.length) ctx.print(`${label} ${miss.map(ft).join(', ')}을(를) 가져올 수 없습니다.`, 'err');",
      "${s.height ? ` · 높이 ${s.height}` : ''}",
    ])
      expect(dc, s).toContain(s);
    const names = [ft('A'), ft('B')].join(', ');
    const LINES: string[] = [];
    KINDS.forEach((k, i) => {
      if (i) LINES.push(`${k} 추가(A)`, `중복된 정의는 무시됩니다(이 도면에 이미 있는 ${k}: ${names}).`);
      LINES.push(`${k}이(가) 없습니다.`, `${ft('Drawing1.dwg')} — ${k} 3개`, `${k} 2개가 추가되었습니다(${names}).`, `${k} ${ft('A')}을(를) 가져올 수 없습니다.`);
    });
    LINES.push(
      // 속성 있는 블록(설명 있음·없음)·용지 이름 없는 배치·문자 스타일(글꼴 · 높이) 설명 — 패널 설명 칸은 「이름\n설명」
      `${ft('BLK')}\n객체 3개, 속성 1개 · 기준점 0.00, 0.00`,
      `${ft('BLK')}\n${ft('door')} · 객체 3개, 속성 1개 · 기준점 1.00, 2.00`,
      `${ft('Layout1')}\n용지 210×297 mm · 객체 3개`,
      `${ft('Standard')}\n${ft('Arial')} · 높이 2.5`,
    );
    const left: string[] = [];
    for (const l of LANGS) for (const s of LINES) if (HANGUL.test(show(l)(s))) left.push(`${l}: ${show(l)(s)}`);
    expect(left).toEqual([]);
    expect(show('en')('도면층 추가(A)')).toBe('Add layer (A)');
    expect(show('de')(`${ft('Drawing1.dwg')} — 선종류 3개`)).toBe('Drawing1.dwg — 3 Linientypen');
    expect(show('ja')(`문자 스타일 2개가 추가되었습니다(${names}).`)).toBe('文字スタイル 2 個が追加されました（A, B）。');
    expect(show('zh-CN')(`배치 ${ft('A')}을(를) 가져올 수 없습니다.`)).toBe('无法导入布局 A。');
    expect(show('en')(`${ft('Layout1')}\n용지 210×297 mm · 객체 3개`)).toBe('Layout1\nPaper 210×297 mm · 3 objects');
    expect(show('de')(`${ft('BLK')}\n객체 3개, 속성 1개 · 기준점 0.00, 0.00`)).toBe('BLK 3 Objekte, 1 Attribute · Basispunkt 0.00, 0.00');
    expect(show('zh-CN')(`${ft('Standard')}\n${ft('Arial')} · 높이 2.5`)).toBe('Standard Arial · 高度 2.5');
    // 새 열쇠 = 같은 사전 낱말(일본어·중국어 종류 = 그 사전의 종류 이름표, 영어·독일어 = 복수 꼴) + 고친 틀·「열린 도면이 없습니다」 꼴
    KINDS.forEach((k, i) => {
      const [ja, zh] = [dict.ja[k]!, dict['zh-CN'][k]!];
      const want: Record<Lang, string[]> = {
        en: [`No ${PL.en[i]}.`, `{0} — {1} ${PL.en[i]}`, `Added {0} ${PL.en[i]} ({1}).`, `Could not import ${PL.en[i]}: {0}.`],
        de: [`Keine ${PL.de[i]}.`, `{0} — {1} ${PL.de[i]}`, `{0} ${PL.de[i]} wurden hinzugefügt ({1}).`, `${PL.de[i]} konnten nicht importiert werden: {0}.`],
        ja: [`${ja}がありません。`, `{0} — ${ja} {1}個`, `${ja} {0} 個が追加されました（{1}）。`, `${ja} {0} をインポートできません。`],
        'zh-CN': [`没有${zh}。`, `{0} — {1} 个${zh}`, `已添加 {0} 个${zh}（{1}）。`, `无法导入${zh} {0}。`],
      };
      for (const l of LANGS)
        expect([`${k}이(가) 없습니다.`, `{0} — ${k} {1}개`, `${k} {0}개가 추가되었습니다({1}).`, `${k} {0}을(를) 가져올 수 없습니다.`].map((x) => dict[l][x]), `${l}: ${k}`).toEqual(want[l]);
      if (!i) return;
      expect([`${k} 추가(A)`, `중복된 정의는 무시됩니다(이 도면에 이미 있는 ${k}: {0}).`].map((x) => LANGS.map((l) => dict[l][x])), k).toEqual([
        [dict.en['{0} 추가(A)']!.replace('{0}', SG.en[i]!), dict.de['{0} 추가(A)']!.replace('{0}', SG.de[i]!), `${ja}を追加(A)`, `添加${zh} (A)`],
        [
          `Duplicate definitions ignored (${PL.en[i]} already in this drawing: {0}).`,
          `Doppelte Definitionen werden ignoriert (bereits in dieser Zeichnung vorhandene ${PL.de[i]}: {0}).`,
          `重複する定義は無視されます（この図面に既にある${ja}: {0}）。`,
          `忽略重复定义（此图形中已有的${zh}：{0}）。`,
        ],
      ]);
    });
    expect(dict.en['도면층 {0}개, 선종류 {1}개, 문자 스타일 {2}개, 치수 스타일 {3}개']).toBe(`{0} ${PL.en[1]}, {1} ${PL.en[2]}, {2} ${PL.en[3]}, {3} ${PL.en[4]}`);
    expect(dict.de['도면층 {0}개, 선종류 {1}개, 문자 스타일 {2}개, 치수 스타일 {3}개']).toBe(`{0} ${PL.de[1]}, {1} ${PL.de[2]}, {2} ${PL.de[3]}, {3} ${PL.de[4]}`);
    // 설명 틀: 속성 있는 블록 = 있는 블록 틀의 {2} 자리에 속성 수, 배치 = 있는 배치 틀의 {0} 자리에 「용지」, 문자 스타일 = 「· 높이 {0}」 앞에 글꼴
    const ATT: Record<Lang, string> = { en: ', {2} attributes', de: ', {2} Attribute', ja: '、属性{2}個', 'zh-CN': '，属性 {2}' };
    for (const l of LANGS) {
      const d = dict[l];
      expect(d['{0}객체 {1}개, 속성 {2}개 · 기준점 {3}, {4}'], l).toBe(d['{0}객체 {1}개{2} · 기준점 {3}, {4}']!.replace('{2}', ATT[l]));
      expect(d['용지 {0}×{1} mm · 객체 {2}개'], l).toBe(d['{0} {1}×{2} mm · 객체 {3}개']!.replace('{0} {1}', `${d['용지']} {0}`).replace('{2}', '{1}').replace('{3}', '{2}'));
      expect(d['{0} · 높이 {1}'], l).toBe(`{0}${l === 'ja' ? '' : ' '}${d['· 높이 {0}']!.replace('{0}', '{1}')}`);
    }
  });
});
