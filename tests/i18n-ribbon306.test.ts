/**
 * 306차: 리본 묶음(탭·패널 이름, 단추 이름·풍선, 펼침 단추 목록, 접힌 패널 단추)의 번역과 305차가 남긴 것.
 * - 빠진 번역: 펼침 메뉴 끝 항목 「단추 이름 (명령)」(shell.ts ribbonButton `${b.label} (${b.cmd})` — 메뉴 항목은 ui-copy 밖이라 틀이 잡은 단추 이름을 옮기지 않았다) 여덟.
 *   접힌 패널 단추(「{0} 패널 펼치기」 풍선·「{0} ▾」)는 ui-copy 안이라 패널 이름까지 옮겨진다 — 영어 어순만 고쳤다.
 * - 오역: 독일어 세로좌표 Vertikale Koordinate(304차 치수 제목 넷과 함께), 중국어 扩展名(확장자)·申请(신청)·控制柄·基本模式·标注比例尺(305차가 남긴 것),
 *   리본 단추의 부착 Attachment·付·Anhang, 분해 Decomposition·拆卸·Zerfall, 속성 properties, 구속 Restraint·Rückhaltestange, 고정 已修复·Behoben, 정렬 (AL) 排序·Sortieren,
 *   다중선 Mehrzeilig(여러 줄 문자), 참조 参考文献, 옛 지시선 领导层文件夹 등을 같은 사전 안의 맞는 번역으로. 글 꼴은 소스에서 확인한다.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { translate } from '../site/i18n.mjs';

const LANGS = ['en', 'de', 'ja', 'zh-CN'] as const;
type Lang = (typeof LANGS)[number];
const HANGUL = /[가-힣]/;
const load = (lang: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../site/locales/${lang}.json`, import.meta.url), 'utf8'));
const dict = Object.fromEntries(LANGS.map((l) => [l, load(l)])) as Record<Lang, Record<string, string>>;
const shell = readFileSync(new URL('../src/app/ui/shell.ts', import.meta.url), 'utf8');
const strip = (s: string | undefined) => (s ?? '').replace(/\s*[(（][A-Z]+[)）]$/, '');

/** 펼침 메뉴가 있는 리본 단추(shell.ts RIBBON — 이름·명령) */
const MENU: [string, string][] = [
  ['원', 'CIRCLE'],
  ['호', 'ARC'],
  ['해치', 'HATCH'],
  ['점', 'POINT'],
  ['3D 폴리선', '3DPOLY'],
  ['여러 줄', 'MLINE'],
  ['복사', 'COPY'],
  ['자르기', 'TRIM'],
  ['배열', 'ARRAYRECT'],
  ['폴리선 편집', 'PEDIT'],
  ['측정', 'MEASUREGEOM'],
  ['신속 선택', 'QSELECT'],
  ['뷰포트 구성', 'VPORTS'],
];
/** 이번에 「이름 (명령)」 열쇠를 더한 것(원·호·해치·점·여러 줄은 이미 옮겨졌다) */
const ADDED = MENU.filter(([n]) => !['원', '호', '해치', '점', '여러 줄'].includes(n));
/** 접힌 패널 단추에 이름이 들어가는 패널 제목 몇 */
const PANELS = ['그리기', '수정', '주석', '도면층', '특성', '유틸리티', '그룹', '블록', '정리', '외부 참조 비교'];

describe('리본 묶음의 번역과 305차가 남긴 것(306차)', () => {
  it('펼침 메뉴 끝 항목과 접힌 패널 단추가 네 언어 모두 한국어 없이 보인다', () => {
    expect(shell).toContain('{ label: `${b.label} (${b.cmd})`, icon: b.icon, run: () => go(b.cmd!) }');
    expect(shell).toContain("'data-i18n-ui-copy': '', title: `${p.title} 패널 펼치기`");
    expect(shell).toContain("h('span', {}, `${p.title} ▾`)");
    for (const [n, c] of MENU) expect(shell, c).toMatch(new RegExp(`cmd: '${c}',\\n\\s+label: '${n}',`));
    for (const t of PANELS) expect(shell, t).toContain(`title: '${t}'`);
    const left: string[] = [];
    for (const l of LANGS) {
      for (const [n, c] of MENU) if (HANGUL.test(translate(`${n} (${c})`, l))) left.push(`${l}: ${translate(`${n} (${c})`, l)}`);
      for (const t of PANELS)
        for (const s of [`${t} 패널 펼치기`, `${t} ▾`]) if (HANGUL.test(translate(s, l, true))) left.push(`${l}: ${translate(s, l, true)}`);
    }
    expect(left).toEqual([]);
    expect(translate('복사 (COPY)', 'en')).toBe('Copy (COPY)');
    expect(translate('뷰포트 구성 (VPORTS)', 'de')).toBe('Ansichtsfensterkonfiguration (VPORTS)');
    expect(translate('자르기 (TRIM)', 'zh-CN')).toBe('修剪 (TRIM)');
    expect(translate('측정 (MEASUREGEOM)', 'ja')).toBe('測定 (MEASUREGEOM)');
    expect(translate('원 (CIRCLE)', 'en')).toBe('Circle (CIRCLE)');
    expect(translate('그리기 패널 펼치기', 'en', true)).toBe('Expand Draw panel');
    expect(translate('그리기 ▾', 'de', true)).toBe('Zeichnen ▾');
  });

  it('고친 번역은 같은 사전의 낱말이다(리본 묶음과 305차가 남긴 것)', () => {
    const [en, de, ja, zh] = [dict.en, dict.de, dict.ja, dict['zh-CN']];
    // 영어: 세로좌표 Ordinate(「세로좌표(O)」 — Vertical coordinate가 아니다), 부착 Attach(「PDF 부착」·「이미지 부착」 — Attachment가 아니다), 결합 Join, 구속 constraint(Restraint가 아니다)
    expect(en['세로좌표']).toBe(strip(en['세로좌표(O)']));
    expect([en['DWG 부착'], en['래스터 이미지 부착 (IAT)']]).toEqual([en['PDF 부착']!.replace('PDF', 'DWG'), `${en['이미지 부착']!.replace('image', 'raster image')} (IAT)`]);
    expect(en['결합 (J)']).toBe(`${en['결합']} (J)`);
    expect(en['구속 막대 표시·숨기기 (CBAR)']).toContain(en['구속 막대']!.toLowerCase());
    expect(en['선택한 객체의 구속 모두 지우기']).toContain(en['구속 삭제']!.split(' ')[1]!);
    // 특성 properties(characteristics가 아니다), 분해 explode·속성 attribute(decompose·properties가 아니다)
    for (const k of ['동적 특성', '동적 블록 특성', '블록·외부 참조 안 객체의 특성 (XLIST)']) {
      expect(en[k]!.toLowerCase(), k).toContain(en['특성']!.toLowerCase());
      expect(en[k], k).not.toMatch(/characteristic/i);
    }
    expect(en['분해(속성 유지)']).toBe(en['분해(속성 값 유지)']!.replace('attribute values', 'attributes'));
    for (const k of ['분해(속성 유지)', '속성 남기고 분해', '속성을 문자로 남기고 분해 (BURST)', '분해할 문자(문자·여러 줄 문자·속성 정의·원호 정렬 문자)를 고르지 않았습니다.']) {
      expect(en[k], k).toMatch(/explod/i);
      expect(en[k], k).not.toMatch(/decompos/i);
    }
    for (const k of ['분해(속성 유지)', '속성 남기고 분해', '속성 가져오기', '속성 내보내기', '속성 관리', '속성 바로 편집']) {
      expect(en[k], k).toMatch(/attribute/i);
      expect(en[k], k).not.toMatch(/propert/i);
    }
    expect(en['속성 가져오기']).toBe(en['속성 가져오기(탭 구분 파일)']!.replace(' (tab-delimited file)', ''));
    // 팔레트 Palette(Pallet가 아니다), 「X 닫기」 = Close X 어순, 「명령 기록 펼치기」 꼴 Expand …, 여러 줄로(TXT2MTXT) = 여러 줄 문자(multiline = MLINE이 아니다), 배열 원본 source
    expect(en['블록 팔레트']).toBe(en['블록 팔레트 닫기']!.replace('Close ', ''));
    expect(en['{0} 닫기']).toBe(en['블록 팔레트 닫기']!.replace(en['블록 팔레트']!, '{0}'));
    expect(en['{0} 패널 펼치기']).toBe('Expand {0} panel');
    expect([en['여러 줄로'], en['여러 줄로 변환']]).toEqual([`To ${en['여러 줄 문자']!.toLowerCase()}`, `Convert to ${en['여러 줄 문자']!.toLowerCase()}`]);
    expect([en['배열 원본 편집 저장'], en['배열 원본 편집 취소']]).toEqual(['Save array source edit', 'Cancel array source edit']);
    expect(en['원본 객체 선택:']).toContain('source');
    // 일본어: 부착 アタッチ(付·取付け가 아니다), 격리 隔離(分離 = XREF 분리(D)가 아니다), 특성 プロパティ(属性 = 속성이 아니다), 여러 줄로 マルチテキスト, MLE 追加 겹침, 「X 닫기」 꼴
    expect(ja['DWG 부착']).toBe(ja['이미지 부착']!.replace('イメージ', 'DWG'));
    expect(ja['DWG·DXF를 외부 참조로 부착 (XA)']).toContain(ja['이미지 부착']!.split(' ')[1]!);
    expect(ja['DWG·DXF를 외부 참조로 부착 (XA)']).not.toContain('取付');
    expect(ja['격리']).toBe(ja['격리 해제']!.replace('解除', ''));
    expect(ja['특성으로 선택']).toBe(`${ja['특성']}で選択`);
    const mt = strip(ja['여러 줄 문자 (MT)']);
    expect([ja['여러 줄로'], ja['여러 줄로 변환']]).toEqual([`${mt}へ`, `${mt}に変換`]);
    expect(ja['다중 지시선에 지시선 추가·제거 (MLE)']).not.toContain('追加追加');
    expect(ja['{0} 닫기']).toBe(ja['참조 닫기']!.replace(ja['참조']!, '{0}'));
    // 중국어 305차 남은 것: 확장 扩展(扩展名 확장자가 아니다), 적용 应用(申请 신청이 아니다), 핸들 句柄, 기본 모드 = 「기본값」 默认, 주석 축척 注释比例(标注 = 치수가 아니다)
    expect(zh['확장 간격띄우기']).toBe(`${zh['확장 데이터']!.replace('数据', '')}偏移`);
    expect(zh['확장 자료 크기가 잘못되었습니다']).toContain(zh['확장 데이터']!);
    for (const k of ['확장 간격띄우기', '확장 자료 크기가 잘못되었습니다']) expect(zh[k], k).not.toContain('扩展名');
    expect(zh['{0} 적용']).toBe('应用{0}');
    expect(zh['구속조건을 적용할 수 없습니다.']).toContain('应用');
    for (const k of ['새 핸들', '새 핸들 없음', '핸들 {0}{1}에 해당하는 블록 참조가 이 도면에 없습니다({2}개).']) {
      expect(zh[k], k).toContain(zh['핸들']!);
      expect(zh[k], k).not.toContain('控制柄');
    }
    expect(zh['기본 모드']).toBe(`${zh['기본값']}模式`);
    for (const k of ['주석 축척 맞추기 실패', '주석 축척 자체 기록 바꾸기 실패', '주석 축척 처리 실패']) {
      expect(zh[k], k).toContain(zh['주석 축척']!);
      expect(zh[k], k).not.toContain('标注');
    }
    // 중국어 리본: 고정 固定(已修复 고쳐짐이 아니다), 고친 修改, 구름형 云状修订(票形이 아니다), 분해 分解(拆卸·解构가 아니다), GATTE 바꾸기, REFEDIT 편집(反射가 아니다),
    // 비교 닫기 关闭比较(紧密 = 빈틈없는이 아니다), 옛 지시선 引线, RSCRIPT 다시 시작(重写 = 다시 쓰기가 아니다), 정렬 (AL) 对齐(排序 = 정렬하기 sort가 아니다), 정리 清理, 참조 参照(参考文献이 아니다), 호 圆弧
    expect(zh['고정']).toBe(zh['고정 구속']!.replace('约束', ''));
    expect(zh['고친 속성 파일을 읽어 값 바꾸기 (ATTIN)']).toContain(zh['수정(M)']!.replace('(M)', ''));
    expect(zh['고친 속성 파일을 읽어 값 바꾸기 (ATTIN)']).not.toContain('固定');
    for (const k of ['구름형 수정 기호', '구름형 수정 기호 (REVCLOUD)']) expect(zh[k], k).toContain(zh['구름형 리비전']!);
    expect(zh['분해 (X)']).toBe(`${zh['분해']} (X)`);
    expect(zh['분해(속성 유지)']).toBe(zh['분해(속성 값 유지)']!.replace('值', ''));
    for (const k of ['분해 (X)', '분해(속성 유지)', '속성 남기고 분해', '문자 분해']) {
      expect(zh[k], k).toContain(zh['분해']!);
      expect(zh[k], k).not.toMatch(/拆卸|解构|离开/);
    }
    expect(zh['모든 블록 참조의 속성 값을 한 번에 (GATTE)']).not.toContain('获取');
    expect(zh['블록·외부 참조를 제자리에서 고치기 (REFEDIT)']).toContain(zh['편집']!);
    expect(zh['블록·외부 참조를 제자리에서 고치기 (REFEDIT)']).not.toContain('反射');
    expect(zh['비교 닫기']).toBe(zh['비교 닫기(COMPARECLOSE)']!.replace(' (COMPARECLOSE)', ''));
    expect(zh['옛 지시선']).toBe(`旧版${zh['지시선']}`);
    expect(zh['스크립트를 처음부터 다시 (RSCRIPT)']).toContain(zh['스크립트 처음부터 다시']!);
    expect(zh['정렬 (AL)']).toBe(`${zh['정렬']} (AL)`);
    expect(zh['정리']).toBe(zh['중복 정리']!.replace('重复项', ''));
    expect(zh['정리']).not.toBe(zh['소거']);
    for (const k of ['참조 열기', '참조 선택:', '참조 이름(R):']) {
      expect(zh[k], k).toContain(zh['참조 이름']!.replace('名称', ''));
      expect(zh[k], k).not.toContain('参考文献');
    }
    expect(zh['표 셀 문자 편집(표를 두 번 눌러도 됨)']).not.toContain('完成');
    expect(zh['호 (A)']).toBe(zh['호(A)']!.replace('(A)', ' (A)'));
    // 독일어 출발점: 세로좌표 Ordinate(「세로좌표(O)」 — Vertikale Koordinate가 아니다), 304차 치수 제목 넷 = 「치수 ({0})」 + 「세로좌표(X)」
    expect(de['세로좌표']).toBe(strip(de['세로좌표(O)']));
    for (const a of ['X', 'Y']) {
      expect(de[`세로좌표(${a})`], a).toBe(de['세로좌표(O)']!.replace('(O)', `(${a})`));
      expect(de[`치수 (세로좌표(${a}))`], a).toBe(de['치수 ({0})']!.replace('{0}', de[`세로좌표(${a})`]!));
      expect(de[`치수 (세로좌표(${a})) ({0})`], a).toBe(`${de[`치수 (세로좌표(${a}))`]} ({0})`);
    }
    // 독일어 리본: 고정 Fest(Behoben 고쳐짐이 아니다), 분해 Auflösen(Zerfall이 아니다), 정렬 Ausrichten(Sortieren이 아니다), 여러 줄(MLINE) Multilinie(mehrzeilig = 여러 줄 문자가 아니다),
    // RSCRIPT 다시 시작(neu schreiben이 아니다), 지시선 Führungslinie, 새 도면 Zeichnung(Teilbild가 아니다), 외부 참조 Externe Referenz, 특성 Eigenschaft(Attribut·Sortieren이 아니다)
    expect(de['고정']).toBe(de['고정 구속']!.split(' ')[0]!.replace(/e$/, ''));
    expect(de['분해 (X)']).toBe(`${de['분해']} (X)`);
    expect(de['정렬 (AL)']).toBe(`${de['정렬']} (AL)`);
    expect([de['여러 줄 (ML)'], de['여러 줄 스타일'], de['여러 줄 편집']]).toEqual([`${de['여러 줄']} (ML)`, de['다중선 스타일'], `${de['여러 줄']} bearbeiten`]);
    expect(de['스크립트를 처음부터 다시 (RSCRIPT)']).toContain(de['스크립트 처음부터 다시']!.replace('Skript ', ''));
    expect(de['스크립트를 처음부터 다시 (RSCRIPT)']).not.toMatch(/schreiben/);
    expect(de['옛 지시선']).toBe(`Alte ${de['지시선']}`);
    expect(de['블록·객체를 새 도면 파일로 (W)']).toContain(de['새 도면']!.split(' ')[1]!);
    expect(de['블록·객체를 새 도면 파일로 (W)']).not.toContain('Teilbild');
    for (const k of ['외부 참조·이미지·PDF 언더레이 (XR)', '외부 참조·이미지·글꼴 경로 (REDIR)']) {
      expect(de[k]!.toLowerCase(), k).toContain(de['외부 참조']!.toLowerCase());
      expect(de[k], k).not.toContain('Verweis');
    }
    for (const k of ['특성으로 선택', '종류·특성·값으로 고르기 (QSELECT)']) {
      expect(de[k], k).toContain(de['특성']!.replace(/en$/, ''));
      expect(de[k], k).not.toMatch(/Attribut|Sortier/);
    }
    // 부착 anhängen(Anhang 첨부물이 아니다), ATTOUT 블록 속성(blockieren 막다가 아니다), 비교 닫기 schließen, 구속 Abhängigkeit(308차 리드 결정 — AutoCAD 독일어판 낱말, 구속 막대 Abhängigkeitsleiste. Auto Constraint·Rückhaltestange·Einschränkung이 아니다), 끊기선 Bruchlinie,
    // 결합(JOIN) Verbinden, 기본 모드 = 「기본값」 Standard, 단일 행 einzeilig(「단일 행 문자」). 「정리」 패널은 같은 패널 「소거」 Bereinigen과 같은 이름이 되어 그대로 둔다
    expect([de['DWG 부착'], de['래스터 이미지 부착 (IAT)']]).toEqual([de['PDF 부착']!.replace('PDF', 'DWG'), `${de['이미지 부착']!.replace('Bild', 'Rasterbild')} (IAT)`]);
    expect(de['블록 속성을 탭 구분 파일로 (ATTOUT)']).toContain(de['블록 속성 관리자']!.split('-')[0]!);
    expect(de['블록 속성을 탭 구분 파일로 (ATTOUT)']).not.toMatch(/blockier/i);
    expect(de['비교 닫기']).toBe(de['도면 비교 닫기']!.replace('Zeichnungsvergleich', 'Vergleich'));
    expect(de['자동 구속']).toBe(strip(de['자동 구속(A)']));
    expect(de['구속 막대 표시·숨기기 (CBAR)']).toContain(de['구속 막대']!);
    expect(de['끊기선 기호']).toContain(de['끊기선']!);
    expect(de['결합 (J)']).toBe(`${de['결합']} (J)`);
    expect(de['기본 모드']).toBe(`${de['기본값']}modus`);
    expect(de['단일 행']).toBe(de['단일 행 문자 (DT)']!.split('er ')[0]);
    expect(de['정리']).not.toBe(de['소거']);
  });

  it('새 열쇠는 단추 이름 번역 + 「 (명령)」 꼴이다(펼침 메뉴 끝 항목)', () => {
    for (const l of LANGS) {
      const d = dict[l];
      for (const [n, c] of ADDED) expect(d[`${n} (${c})`], `${l}: ${n}`).toBe(`${d[n]} (${c})`);
    }
  });
});
