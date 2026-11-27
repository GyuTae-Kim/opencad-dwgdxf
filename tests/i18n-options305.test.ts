/**
 * 305차: 옵션 대화 상자·상태 막대 묶음(OPTIONS 탭 이름표·값·정수 검사 오류, 상태 막대 켜고 끄기 단추 풍선·주석 축척 항목·VPMAX 풍선·선택 수)의 번역과 304차가 남긴 것.
 * - 빠진 번역: 옵션 정수 오류 줄(틀 「{0}: {1}과(와) {2} …」이 이름표를 옮기지 않았다 — 296차가 더한 AutoSnap 표식기·조준창 꼴), 잠긴 뷰포트의 주석 축척 풍선(「 (잠긴 뷰포트)」가 틀 자리),
 *   최대화 중 VPMAX 풍선(maximizedLabel이 틀 자리), 같은 종류 여럿 제목 나머지 아홉(304차 보고 (4) — 「표 (3)」은 기존 틀 「표 {0}{1}」이 옮긴다).
 * - 오역: 상태 막대 ORTHO Orthogonal·선택 수 명령꼴(Select·Wählen Sie), 오른쪽 클릭 기본 모드 Basic, 중국어 주석 축척 标注(치수)·조준창·열기 및 저장·숫자 号码,
 *   304차가 남긴 독일어(Thema·Hyperlink-Referenz·Join-Block·kombinierte·Verbindung·명령꼴 등)·중국어(原始·扩展名·申请·控制柄 등)·일본어(次のグリップ)를 같은 사전 안의 맞는 번역으로. 글 꼴은 소스에서 확인한다.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { guardedTranslate } from '../src/app/fileguard';
import { ft } from '../src/app/filetext';
import { translate } from '../site/i18n.mjs';

const LANGS = ['en', 'de', 'ja', 'zh-CN'] as const;
type Lang = (typeof LANGS)[number];
const HANGUL = /[가-힣]/;
const load = (lang: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../site/locales/${lang}.json`, import.meta.url), 'utf8'));
const dict = Object.fromEntries(LANGS.map((l) => [l, load(l)])) as Record<Lang, Record<string, string>>;
const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const strip = (s: string | undefined) => (s ?? '').replace(/\s*[(（][A-Z]+[)）]$/, '');
const tr = (l: string) => (x: string) => guardedTranslate(x, l) ?? translate(x, l);

/** 옵션 정수 검사(options.ts intIn — 이름표·아래·위) */
const INTS: [string, number, number][] = [
  ['저장 간격', 1, 600],
  ['십자선 크기', 1, 100],
  ['확인란 크기', 0, 50],
  ['그립 크기', 1, 255],
  ['AutoSnap 표식기 크기', 1, 20],
  ['조준창 크기', 1, 50],
  ['길게 누르는 시간', 100, 10000],
];
const intErr = ([n, lo, hi]: [string, number, number]) => `${n}: ${lo}과(와) ${hi} 사이의 정수가 필요합니다.`;
/** VPMAX 이름표(viewtools-vpmax.ts maximizedLabel) */
const MAXED = ['최대화된 뷰포트 3', '최대화된 뷰포트', '최대화된 타일 뷰포트'];
const VPTIP = (label: string) => `${label} · 누르면 복원 (VPMIN), Ctrl+R 다음 뷰포트`;
/** 종류 이름(inquiry.ts TYPE_NAMES) 가운데 이번에 「종류 ({0})」 열쇠를 더한 것(304차 나머지) */
const TYPES = ['트레이스', '3D 면', '모양', '메시', '본체', 'OLE 객체', 'PDF 언더레이', 'DWF 언더레이', 'DGN 언더레이'];

describe('옵션 대화 상자·상태 막대 묶음의 번역과 304차가 남긴 것(305차)', () => {
  it('옵션 정수 오류 줄·잠긴 뷰포트 주석 축척 풍선·VPMAX 풍선·선택 수·같은 종류 여럿 제목이 네 언어 모두 한국어 없이 보인다', () => {
    for (const [f, s] of [
      ['app/options.ts', '`${label}: ${lo}과(와) ${hi} 사이의 정수가 필요합니다.`'],
      ['app/options.ts', "intIn(saveMin, 1, 600, '저장 간격')"],
      ['app/options.ts', "intIn(cursor, 1, 100, '십자선 크기')"],
      ['app/options.ts', "intIn(pickbox, 0, 50, '확인란 크기')"],
      ['app/options.ts', "intIn(gripsize, 1, 255, '그립 크기')"],
      ['app/options.ts', "intIn(markerSize, 1, 20, 'AutoSnap 표식기 크기')"],
      ['app/options.ts', "intIn(aperture, 1, 50, '조준창 크기')"],
      ['app/options.ts', "intIn(duration, 100, 10000, '길게 누르는 시간')"],
      ['app/annoscale-status.ts', "`뷰포트 주석 축척: ${ft(s?.name ?? '')}${sh.locked ? ' (잠긴 뷰포트)' : ''}`"],
      ['app/ui/shell.ts', 'vpm.title = label ? `${label} · 누르면 복원 (VPMIN), Ctrl+R 다음 뷰포트`'],
      ['app/ui/shell.ts', '`선택 ${st.selection.size.toLocaleString()}개`'],
      ['app/viewtools-vpmax.ts', "if (m.kind === 'tiles') return '최대화된 타일 뷰포트';"],
      ['app/viewtools-vpmax.ts', "return vp ? `최대화된 뷰포트 ${vp.id}` : '최대화된 뷰포트';"],
      ['app/ui/palettes.ts', '`${typeName(sel[0]!)} (${sel.length.toLocaleString()})`'],
      ...TYPES.map((x) => ['app/inquiry.ts', `'${x}'`]),
    ])
      expect(src(f!), s).toContain(s);
    const LINES = [
      ...INTS.map(intErr),
      `뷰포트 주석 축척: ${ft('1:50')} (잠긴 뷰포트)`,
      `뷰포트 주석 축척: ${ft('1:50')}`,
      ...MAXED.map(VPTIP),
      '선택 3개',
      ...TYPES.map((x) => `${x} (3)`),
    ];
    const left: string[] = [];
    for (const l of LANGS) for (const s of LINES) if (HANGUL.test(tr(l)(s))) left.push(`${l}: ${tr(l)(s)}`);
    expect(left).toEqual([]);
    expect(tr('en')(intErr(INTS[0]!))).toBe('Save interval: An integer between 1 and 600 is required.');
    expect(tr('de')(intErr(INTS[2]!))).toBe('Auswahlfeldgröße: Eine Ganzzahl zwischen 0 und 50 ist erforderlich.');
    expect(tr('zh-CN')(intErr(INTS[5]!))).toBe('靶框大小：需要 1 和 50 之间的整数。');
    expect(tr('zh-CN')(`뷰포트 주석 축척: ${ft('1:50')} (잠긴 뷰포트)`)).toBe('视口注释比例：1:50（锁定视口）');
    expect(tr('ja')(`뷰포트 주석 축척: ${ft('1:50')} (잠긴 뷰포트)`)).toBe('ビューポートの注釈尺度: 1:50 (ロックされたビューポート)');
    expect(tr('en')(VPTIP(MAXED[0]!))).toBe('Maximized viewport 3 · Press to restore (VPMIN), Ctrl+R next viewport');
    expect(['en', 'de', 'zh-CN'].map((l) => tr(l)('선택 3개'))).toEqual(['3 selected', '3 ausgewählt', '已选择 3 个']);
    expect(tr('ja')('메시 (3)')).toBe('メッシュ (3)');
    expect(tr('zh-CN')('모양 (3)')).toBe('形状 (3)');
    expect(tr('en')('표 (3)')).toBe('Table (3)');
  });

  it('고친 번역은 같은 사전의 낱말이다(상태 막대·옵션 묶음과 304차가 남긴 것)', () => {
    const [en, de, ja, zh] = [dict.en, dict.de, dict.ja, dict['zh-CN']];
    // 상태 막대 ORTHO 단추 = 「<직교 켜기>」의 Ortho(등각투영 메뉴의 직교(끄기)는 ISODRAFT 「직교(O)」 Orthogonal을 따른다 — 그대로)
    expect(en['직교 (F8)']).toBe(`${en['<직교 켜기>']!.slice(1).split(' ')[0]} (F8)`);
    expect(en['{0}직교(끄기)']).toContain(strip(en['직교(O)']));
    // 상태 막대 선택 수 = 「{0}개를 선택했습니다.」 꼴(명령꼴 Select·Wählen Sie가 아니다)
    for (const d of [en, de]) expect(d['선택 {0}개']).toBe(d['{0}개를 선택했습니다.']!.replace(/\.$/, ''));
    expect(zh['선택 {0}개']).toBe(zh['{0}개 항목이 선택되었습니다.']!.replace('项目。', ''));
    // 오른쪽 클릭 사용자화 기본 모드(default mode) = 「기본값」의 낱말(Basic·基本이 아니다)
    expect(en['기본 모드']).toBe(`${en['기본값']} mode`);
    expect(ja['기본 모드']).toBe(`${ja['기본값']!.replace('値', '')}モード`);
    // NCOPY 중첩 복사 = 「중첩된 객체 복사」의 nested·ネストされた(겹침 Overlap·重ね合わせ가 아니다)
    expect(en['중첩 복사']).toBe(`Copy ${en['중첩된 객체 복사']!.split(' ')[1]}`);
    expect(ja['중첩 복사']).toBe(`${ja['중첩된 객체 복사']!.split('オブジェクト')[0]}コピー`);
    // 다중 지시선 연결선(landing) = 「연결선 거리」·「지시선 연결선 먼저」의 낱말(Connecting line·Verbindung이 아니다), 간격 ↔ 거리는 다른 이름
    expect(en['연결선']).toBe(en['연결선 거리']!.split(' ')[0]);
    expect(de['연결선']).toBe(de['지시선 연결선 먼저']!.split('-')[1]!.split(' ')[0]);
    for (const k of ['연결선 간격', '연결선 거리', '연결선 자동 포함']) expect(de[k], k).toContain(de['연결선']!);
    expect(de['연결선 간격']).not.toBe(de['연결선 거리']);
    // 일본어: 격자 표시 = 「<격자 켜기>」의 グリッド(格子가 아니다), 다음 핸들(HANDSEED) ハンドル(グリップ 그립이 아니다)
    expect(ja['격자 표시 (F7)']).toBe(`${ja['<격자 켜기>']!.slice(1).split(' ')[0]}表示(F7)`);
    expect(ja['다음 핸들']).toBe(`次の${ja['핸들']}`);
    // 시작 화면 「새로 그리기」: REDRAW 「다시 그리기」와 다른 이름(일본어 再描画), 중국어 새 도면층 绘制新图层이 아니다
    expect(ja['새로 그리기']).toBe(`${ja['새 도면']!.replace('図面', '')}作図`);
    for (const d of [en, ja, zh]) expect(d['새로 그리기']).not.toBe(d['다시 그리기']);
    expect(zh['새로 그리기']).not.toContain(zh['도면층']!);
    // 중국어 304차 남은 것: 원본 객체 源对象, 경계 수 = 「지시선 수」 꼴, 끝 X·Y·Z = 「시작 X」 꼴 + 끝점 终点, 끝 각도 = 「끝 각도 지정 또는 [」의 末端角度,
    // 확장 데이터 扩展数据(扩展名 확장자가 아니다), 등록된 응용 프로그램 应用程序(申请 신청이 아니다), 여러 줄 (ML) 多线, 핸들 句柄, 모양 마침표, (S) 자리, 필터링된 선택 종료 退出
    expect(zh['고른 특성만 원본에서 대상 객체로 옮깁니다.']).toContain('源对象');
    expect(zh['원본 객체 선택:']).toBe('选择源对象：');
    expect(zh['경계 수']).toBe(zh['지시선 수']!.replace('引线', '边界'));
    for (const a of ['X', 'Y', 'Z']) expect(zh[`끝 ${a}`], a).toBe(zh['시작 X']!.replace('X', a).replace('起点', zh['끝점']!));
    expect(zh['끝 각도']).toBe(zh['끝 각도 지정 또는 [']!.replace('指定', '').replace('或 [', ''));
    expect(zh['끝 각도 지정 또는 [매개변수(P)/사이각(I)]:']!.startsWith(zh['끝 각도 지정 또는 [']!)).toBe(true);
    expect(zh['객체에 확장 데이터가 없습니다.']).toContain(zh['확장 데이터']!);
    expect(zh['확장 데이터 보기']).toBe(`查看${zh['확장 데이터']}`);
    expect(zh['등록된 응용 프로그램 이름']).toBe(`已${zh['* 등록된 응용 프로그램 이름: {0}']!.replace('* ', '').replace('：{0}', '')}`);
    expect(zh['등록된 응용 프로그램: {0}']).toBe(`${zh['등록된 응용 프로그램 이름']!.replace('名称', '')}：{0}`);
    expect(zh['여러 줄 (ML)']).toBe(`${zh['여러 줄']} (ML)`);
    expect(zh['같은 핸들을 가진 객체가 있습니다.']).toContain(zh['핸들']!);
    expect(zh['모양이 잘못된 객체를 쓰지 않았습니다.']).toContain(zh['모양']!);
    expect(zh['모양']).not.toMatch(/。$/);
    expect(zh['명령이 활성화되어 있을 때(S)']).toBe(`${zh['명령이 활성화되어 있을 때']}(S)`);
    expect(zh['필터링된 선택 종료함. {0}개 선택.']).toContain(zh['종료']!);
    expect(zh['필터링된 선택 종료함. {0}개 선택.']).toContain(zh['선택 {0}개']!);
    // 중국어 묶음: 주석 축척 注释比例(标注 = 치수가 아니다), 조준창 = 「조준창 크기(Z)」의 靶框, 열기 및 저장 和(「<스냅 및 그리드>」), 숫자 数字(号码 번호가 아니다), 외부 참조 外部参照
    for (const k of [
      '뷰포트 주석 축척',
      '뷰포트 주석 축척: {0}{1}',
      '주석 축척(CANNOSCALE): {0}',
      '주석 축척: 도면 공간의 주석 축척은 1:1입니다',
      '주석 축척이 뷰포트 축척과 같지 않음: 동기화하려면 클릭',
      '주석 축척 변경 시 축척 추가',
      '주석 축척 변경 시 축척 추가 (ANNOAUTOSCALE) · 켜면 주석 축척을 바꿀 때 주석 객체에 새 축척을 더합니다',
    ]) {
      expect(zh[k], k).toContain(zh['주석 축척']!);
      expect(zh[k], k).not.toContain(zh['치수']!);
    }
    expect(zh['조준창 크기']).toBe(strip(zh['조준창 크기(Z)']));
    expect(zh['<스냅 및 그리드>:']).toContain('和');
    expect(zh['열기 및 저장']).toBe(`${zh['열기']}和${zh['저장']}`);
    expect(zh['{0}: 숫자를 입력하십시오.']).toBe(`{0}：${zh['숫자를 입력하십시오.']}`);
    expect(zh['{0}외부 참조 축척 숨기기']).toContain(zh['외부 참조']!);
    // 독일어 304차 남은 것: 주제 Betreff, 하이퍼링크 기준 Basis(「기준점」 Basispunkt — Referenz 참조가 아니다), 결합(bind) gebunden·Bindet(Join-·kombiniert·zusammenfassen이 아니다),
    // 작성·저장·열기 단추 이름(진행 중 꼴 wird …가 아니다), 뷰포트 Ansichtsfenster, 원본 Quellobjekt, 선택 Auswahl(명령꼴 auswählen·Wählen Sie가 아니다), 명령 취소 Rückgängig,
    // 경계 Umgrenzung, 이전(P), 보다 작음 kleiner(「> 보다 큼」), 검사 geprüft(명령꼴 Untersuchen Sie가 아니다 — 감사 Prüfung)
    expect(de['주제(S)']).toBe(`${de['주제']} (S)`);
    for (const k of ['하이퍼링크 기준', '하이퍼링크 기준 경로', '하이퍼링크 기준(H)']) expect(de[k], k).toContain(`Hyperlink-${de['기준점']!.replace('punkt', '')}`);
    expect(strip(de['결합(B)'])).toBe('Binden');
    for (const k of [
      '"{0}" 안의 중첩 외부 참조 {1}개는 결합 블록에 넣지 않았습니다.',
      '결합한 외부 참조 ({0})',
      '— 결합한 참조 안의 참조라 결합 블록에 넣지 않았습니다',
      '패키지의 지금 도면 사본에서 외부 참조를 블록으로 결합하고 외부 참조 파일은 넣지 않습니다.',
    ]) {
      expect(de[k], k).toMatch(/[Gg]ebunden|^Bindet /);
      expect(de[k], k).not.toMatch(/Join-|kombinier|Fasst/);
    }
    expect([de['전송 파일 작성'], de['파일 저장'], de['예제 도면 열기']]).toEqual([
      'Übertragungsdatei erstellen',
      `Datei ${de['저장']!.toLowerCase()}`,
      `Beispielzeichnung ${de['열기']!.toLowerCase()}`,
    ]);
    expect(de['뷰포트 뷰 잠금 [켜기(ON)/끄기(OFF)]:']).toMatch(new RegExp(`^${de['뷰포트']}-`));
    expect(de['뷰포트 뷰 잠금 [']).toBe(`${de['뷰포트 뷰 잠금 [켜기(ON)/끄기(OFF)]:']!.split(' [')[0]} [`);
    expect(de['원본 객체를 지우시겠습니까?']).toContain('Quellobjekt');
    expect(de['원본 객체 선택:']).toBe('Quellobjekt auswählen:');
    expect([de['선택 모드'], de['선택 설정(옵션 › 선택)'], de['그립 설정(옵션 › 선택)']]).toEqual([
      `${de['선택']}modus`,
      `${de['선택']}einstellungen (Optionen › ${de['선택']})`,
      `Griffeinstellungen (Optionen › ${de['선택']})`,
    ]);
    expect(de['되돌릴 선택이 없습니다.']).toBe(`Es gibt keine ${de['선택']} zum ${de['명령 취소']}machen.`);
    expect(de['경계 수']).toBe(de['지시선 수']!.replace('Führungslinien', `${de['경계']}en`));
    expect(de['{0}개를 선택했습니다. 다음 명령에서 이전(P)으로 쓸 수 있습니다.']).toContain(de['이전(P)']!);
    expect(de['< 보다 작음']).toBe(de['> 보다 큼']!.replace('>', '<').replace('größer', 'kleiner'));
    expect(de['감사']).toBe('Prüfung');
    expect(de['{0}을(를) 열었습니다. 도면을 검사합니다.']).toBe('{0} wurde geöffnet. Die Zeichnung wird geprüft.');
    // 독일어 묶음: 저장 간격 = 「저장 간격 분」의 Speicherintervall(「간격을 저장하라」 Intervall speichern이 아니다)
    expect(de['저장 간격']).toBe(de['저장 간격 분']!.replace(' in Minuten', ''));
  });

  it('새 열쇠는 조각·틀 번역에서 만든 꼴이다(옵션 정수 오류·잠긴 뷰포트 풍선·VPMAX 풍선·종류 + 개수)', () => {
    for (const l of LANGS) {
      const d = dict[l];
      const generic = d['{0}: {1}과(와) {2} 사이의 정수가 필요합니다.']!;
      for (const [n] of INTS)
        expect(d[`${n}: {0}과(와) {1} 사이의 정수가 필요합니다.`], `${l}: ${n}`).toBe(generic.replace('{0}', d[n]!).replace('{1}', '{0}').replace('{2}', '{1}'));
      expect(d['뷰포트 주석 축척: {0} (잠긴 뷰포트)'], l).toBe(d['뷰포트 주석 축척: {0}{1}']!.replace('{1}', `${l === 'zh-CN' ? '' : ' '}${d['(잠긴 뷰포트)']}`));
      const tip = d['{0} · 누르면 복원 (VPMIN), Ctrl+R 다음 뷰포트']!;
      expect(d['최대화된 뷰포트 {0} · 누르면 복원 (VPMIN), Ctrl+R 다음 뷰포트'], l).toBe(tip.replace('{0}', d['최대화된 뷰포트 {0}']!));
      for (const m of ['최대화된 뷰포트', '최대화된 타일 뷰포트']) expect(d[VPTIP(m)], `${l}: ${m}`).toBe(tip.replace('{0}', d[m]!));
      for (const x of TYPES) expect(d[`${x} ({0})`], `${l}: ${x}`).toBe(`${d[x]} ({0})`);
    }
  });
});
