/**
 * 320차: 시작 화면·ABOUT·앱 메뉴 묶음(응용프로그램 메뉴·빠른 도구·제목 막대, 시작 화면 카드·최근 문서, OpenCAD 정보, 도움말 상자 머리, COLORTHEME,
 * 새 판 알림, 앱 메뉴 「도면 정보」 상자, 방문 통계 설정)과 공통 질문 일부의 번역 대조와 빠진 번역.
 * - 화면 글은 글 마디·title·aria-label마다 옮긴다(src/app/i18n.ts). ABOUT·시작 화면 바닥 글은 ui/dom.ts가 html을 innerHTML로 넣으므로
 *   문단 글 마디 열쇠로 보인다. 틀이 잡은 값은 data-i18n-ui-copy 안에서만 옮기므로, 틀에 잡힌 한국어 둘이 남았다:
 *   도면 정보 「형식」 줄 「DXF AC1027 이진」(열쇠 「이진」은 통째만 맞음)과 ?open= 주소가 https가 아닐 때의 「파일을 받지 못했습니다: https 주소만 …」.
 *   앞의 것은 고정 앞 글 틀(「DXF {0} 이진」 — 이진은 DXF에만 붙는다), 뒤의 것은 통째 열쇠(틀 번역에 조각 번역을 끼운 것 — 319차 꼴).
 * - 오역(같은 사전의 맞는 번역으로): 포트폴리오 단추 이름 어순(en·de 「Sean Kim Return…」), COLORTHEME 0/1은 어두운·밝은 테마(비교급 아님 —
 *   「어두운 테마로 바꾸기」의 낱말), ABOUT 글꼴 이름(이 앱이 싣는 글꼴은 Noto Sans KR — ja가 JP로 바꿈), ja 빠른 도구 키 이름 꼴·「계속하시겠습니까?」
 *   통째의 전각 괄호(앞 조각 「続行しますか? [」 꼴), zh 「도면 복구 관리자」 낱말 갈림(닫기 단추·새 판 알림은 图纸恢复管理器), zh 「플롯 스타일 변환」
 *   切换(바꾸어 놓기 — 같은 사전 변환은 转换), de 예제 도면 안내 뜻 바뀜·지원 범위 명령꼴·끌어다 놓기 「hierher … dort」.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sourceMessage, translate } from '../site/i18n.mjs';

const LANGS = ['en', 'de', 'ja', 'zh-CN'] as const;
type Lang = (typeof LANGS)[number];
const HANGUL = /[가-힣]/;
const load = (lang: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../site/locales/${lang}.json`, import.meta.url), 'utf8'));
const dict = Object.fromEntries(LANGS.map((l) => [l, load(l)])) as Record<Lang, Record<string, string>>;
const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const squash = (s: string | undefined) => (s ?? '').replace(/\s/g, '');

/** 새 열쇠 둘 */
const BINARY_TPL = 'DXF {0} 이진';
const FETCH_TPL = '파일을 받지 못했습니다: {0}';
const HTTPS_ONLY = 'https 주소만 열 수 있습니다.';
const FETCH_HTTPS = `파일을 받지 못했습니다: ${HTTPS_ONLY}`;
/** 오역을 고친 열쇠 */
const PORTFOLIO = '김규태 포트폴리오로 돌아가기';
const THEME_ERR = '0(어둡게) 또는 1(밝게)을 입력하십시오.';
const FONTS = 'DXF·DWG 리더와 쓰기(DWG는 ODA 공개 명세 기반)를 직접 구현했습니다. 글꼴: Hershey Roman Simplex(공개 도메인), Noto Sans KR(SIL OFL 1.1).';
const PRINT_QAT = 'PDF로 인쇄 (Ctrl+P)';
const GO_ON = '계속하시겠습니까? [예(Y)/아니오(N)] <아니오>:';
const RECOVERY = '도면 복구 관리자';
const RECOVERY_MENU = '도면 복구 관리자…';
const CONVERT = '플롯 스타일 변환';
const SAMPLE_NOTE = '예제 도면으로 기능을 둘러볼 수 있습니다.';
const DWG_SCOPE = 'DWG R2.6~R2018 열기, R2000~R2018 저장';
const DROP = 'DXF·DWG 파일을 여기에 끌어다 놓으십시오';

/** 화면에 보이는 글(틀은 값을 넣은 꼴) */
const SHOWN = [
  // 응용프로그램 메뉴(ui/shell.ts buildTitle)
  '응용프로그램 메뉴', '새로 만들기', '열기…', '예제 도면 열기', '저장', '다른 이름으로 저장…', RECOVERY_MENU, '복구(파일 열고 검사)…', 'PNG로 내보내기', 'SVG로 내보내기',
  '플롯(PDF)…', '게시(배치를 PDF로)…', '도면 특성…', '도면 정보', '닫기', '모두 닫기', '모두 저장', '옵션…', '어두운 테마로 바꾸기', '밝은 테마로 바꾸기', '단축키·도움말',
  '방문 통계 설정', 'OpenCAD 정보',
  // 빠른 도구·제목 막대 오른쪽
  '새 도면 (Ctrl+N)', '열기 (Ctrl+O)', '저장 (Ctrl+S)', '명령 취소 (Ctrl+Z)', '다시 실행 (Ctrl+Y)', PRINT_QAT, PORTFOLIO, '← 포트폴리오', '편집 화면으로(리본·명령행)', '편집 화면으로',
  '휴대폰 보기 모드로(보기·치수 확인)', '휴대폰 보기 모드로', '도움말 (F1)', '전체 화면', '전체 화면을 쓸 수 없습니다.',
  // 시작 화면(buildStart·refreshRecent·openRecent·openSample·openUrl)
  '최근 문서 목록을 모두 지웁니다(원래 파일은 그대로)', '모두 지우기', '안내 닫기', '도면 파일 열기', DROP, 'DXF·DWG 도면을 골라 여십시오', '또는', '파일 열기', '새 도면 (mm)',
  'acad 서식(영국식, 인치)', '인치', 'OpenCAD 무료 DWG·DXF 캐드', '새로 그리기', '빈 도면을 만들어 바로 그리기를 시작합니다(Ctrl+N).', '최근 문서',
  '최근 문서는 이 기기의 이 브라우저에만 저장하며 서버로 보내지 않습니다.', '처음이라면', SAMPLE_NOTE, '지원 범위', 'DXF R12~R2018(ASCII·이진) 열기·저장', DWG_SCOPE,
  '그리기·수정·그립, 치수·해치·문자·표, 블록·도면층·배치 편집', '측정, 객체 스냅, PNG·SVG·PDF 출력', '휴대폰에서 할 수 있는 것', 'DWG R2.6~R2018, DXF R12~R2018(ASCII·이진) 도면 열기',
  '전체 보기, 한 손가락으로 이동, 두 손가락으로 확대·축소', '거리·반지름·각도·면적 재기(길게 누르면 정밀 조준)', '객체를 눌러 길이·반지름·치수 값 보기, 도면층 켜고 끄기, 치수 목록',
  '그리기·고치기·저장은 제목 막대의 연필 단추(편집 화면)나 컴퓨터에서', '오픈소스 OpenCAD 프로젝트의 DWG·DXF 2D 캐드입니다(MIT). SKP·STEP·NC는 OpenCAD의 다른 도구로 엽니다. ·',
  'OpenCAD 도구 목록', '김규태 포트폴리오', '아직 연 문서가 없습니다.', '목록에서 지우기', '최근 문서에서 지우기: plan.dxf', '저장해 둔 파일을 찾지 못해 목록에서 지웠습니다.',
  '저장해 둔 파일을 지금 읽지 못했습니다. 잠시 뒤 다시 눌러 보십시오.', '예제 도면을 받지 못했습니다.', '파일을 받지 못했습니다: HTTP 404', FETCH_HTTPS,
  // OpenCAD 정보(editor.ts ABOUT — 글 마디)
  'CAD 파일을 특정 프로그램 없이 누구나 열고 고칠 수 있게 하려는 OpenCAD 프로젝트의 2D 캐드입니다. DWG·DXF 도면을 열거나 새로 만들어 그리고 고친 뒤 DWG·DXF로 저장합니다. 서버 없이 브라우저 안에서만 동작하며, 연 파일은 이 컴퓨터를 떠나지 않습니다.',
  FONTS, '소스:',
  // 도움말 상자 머리(277차 표 밖)·COLORTHEME·새 판 알림
  '도움말', '조작', '명령(명령행에 입력)', '점 입력', '100,50 (절대 좌표) · @20,0 (직전 점에서 상대) · @30<45 (거리<각도) · 숫자만 입력하면 커서 방향으로 그 거리',
  '화면 테마', 'COLORTHEME에 대한 새 값 입력 <0>:', THEME_ERR, '새 버전으로 바꾸기', '자동 저장하고 새로 고침', '나중에', '새 버전이 있습니다.', '새로 고침',
  '저장하지 않은 도면이 2개 있습니다. 새로 고치기 전에 이 브라우저에 자동 저장해 두며, 다시 열린 뒤 도면 복구 관리자(DRAWINGRECOVERY)로 되살릴 수 있습니다.',
  // 도면 정보 상자(shell.ts showInfo)·방문 통계 설정(사이트 도구)
  '파일', '형식', 'DXF AC1027 이진', '코드 페이지', '도면층·블록', '3개 · 2개', '1개', '읽기 시간', '객체 종류', '참고',
  '거절 (기본 방문만)', '수집 안 함', '허용',
  // 공통 질문(묶음 밖이던 것)
  GO_ON, CONVERT,
];

describe('시작 화면·ABOUT·앱 메뉴 묶음의 번역(320차)', () => {
  it('묶음 원문이 네 언어 모두 한국어 없이 보인다 — 도면 정보 「형식」 줄의 「이진」과 https 거절 알림도', () => {
    const shell = src('app/ui/shell.ts');
    expect(shell).toContain("`${d.format.toUpperCase()} ${d.version}${d.binary ? ' 이진' : ''}`");
    expect(shell).toContain(`throw new Error('${HTTPS_ONLY}')`);
    expect(shell).toContain('`파일을 받지 못했습니다: ${e instanceof Error ? e.message : String(e)}`');
    expect(src('editor.ts')).toContain(FONTS.replace('(SIL OFL 1.1).', '(SIL OFL 1.1).</p>'));
    const left: string[] = [];
    for (const l of LANGS) for (const s of SHOWN) if (HANGUL.test(translate(s, l))) left.push(`${l}: ${s} → ${translate(s, l)}`);
    expect(left).toEqual([]);
  });

  it('새 열쇠는 같은 사전의 낱말로 만든다(통째 = 틀 번역 + 조각 번역, 「이진」은 지원 범위 목록의 낱말)', () => {
    for (const l of LANGS) {
      const d = dict[l];
      expect(d[FETCH_HTTPS], l).toBe(d[FETCH_TPL]!.replace('{0}', d[HTTPS_ONLY]!));
      const word = /ASCII[/・]([^)）]+)/.exec(d['DWG R2.6~R2018, DXF R12~R2018(ASCII·이진) 도면 열기']!)![1];
      expect(d[BINARY_TPL], l).toBe(`DXF {0} ${word}`);
      expect(translate('DXF AC1027 이진', l), l).toBe(`DXF AC1027 ${word}`);
    }
    expect(dict.en[BINARY_TPL]).toBe('DXF {0} binary');
    expect(dict['zh-CN'][FETCH_HTTPS]).toBe('无法接收文件：只能打开https地址。');
  });

  it('오역: 포트폴리오 단추·COLORTHEME 0/1·글꼴 이름·키 이름 꼴·괄호 꼴·도면 복구 관리자·플롯 스타일 변환·예제 도면·지원 범위·끌어다 놓기는 같은 사전의 낱말이다', () => {
    const [en, de, ja, zh] = [dict.en, dict.de, dict['ja'], dict['zh-CN']];
    // 포트폴리오로 돌아가는 단추(title): 「김규태 포트폴리오」 낱말 + 「돌아가기」 — 이름 뒤에 동사가 붙은 꼴이 아니다
    expect(en[PORTFOLIO]).toBe(`Return to ${en['김규태 포트폴리오']}`);
    expect(de[PORTFOLIO]).toBe('Zurück zum Portfolio von Sean Kim');
    // (일본어 「Sean Kim ポートフォリオに戻る」는 이름이 포트폴리오를 꾸미는 어순이라 맞다)
    for (const l of ['en', 'de'] as const) expect(dict[l][PORTFOLIO]!.startsWith('Sean Kim '), l).toBe(false);
    // COLORTHEME 0 = 어두운 테마, 1 = 밝은 테마(theme.ts) — 「어두운 테마로 바꾸기」·「밝은 테마로 바꾸기」의 낱말, 비교급이 아니다
    expect(src('app/theme.ts')).toContain(`ctx.print('${THEME_ERR}', 'err');`);
    expect(en['어두운 테마로 바꾸기']).toContain('dark');
    expect(en[THEME_ERR]).toBe('Enter 0 (dark) or 1 (light).');
    expect(zh['어두운 테마로 바꾸기']).toContain('深色');
    expect(zh[THEME_ERR]).toBe('输入 0（深色）或 1（浅色）。');
    expect(de['밝은 테마로 바꾸기']).toContain('hellen');
    expect(de[THEME_ERR]).toBe('Geben Sie 0 (dunkel) oder 1 (hell) ein.');
    for (const l of LANGS) expect(dict[l][THEME_ERR], l).not.toMatch(/darker|lighter|较深|较亮|dunkler|heller/);
    // ABOUT 글꼴: 이 앱이 싣는 글꼴은 Noto Sans KR(public/fonts/noto-sans-kr) — 글꼴·라이선스 이름은 옮기지 않는다
    expect(existsSync(new URL('../public/fonts/noto-sans-kr/manifest.json', import.meta.url))).toBe(true);
    for (const l of LANGS) {
      expect(dict[l][FONTS], l).toContain('Noto Sans KR');
      expect(dict[l][FONTS], l).not.toContain('Noto Sans JP');
    }
    // 빠른 도구 키 이름은 옮기지 않는다(같은 줄의 「新規図面 (Ctrl+N)」 꼴)
    expect(ja['새 도면 (Ctrl+N)']).toBe('新規図面 (Ctrl+N)');
    expect(ja[PRINT_QAT]).toBe('PDFで印刷 (Ctrl+P)');
    // 통째 물음은 앞 조각 「続行しますか? [」로 시작하고 옵션 글자 괄호는 반각(285차 규칙)
    expect(squash(ja[GO_ON]).startsWith(squash(ja['계속하시겠습니까? [']))).toBe(true);
    expect(ja[GO_ON]).toBe('続行しますか? [はい(Y)/いいえ(N)] <いいえ>:');
    // 도면 복구 관리자: 닫기 단추·새 판 알림과 같은 낱말, 메뉴 이름 = 명령 이름 + 「…」
    expect(zh[RECOVERY]).toBe('图纸恢复管理器');
    expect(zh['도면 복구 관리자 닫기']).toContain(zh[RECOVERY]!);
    for (const l of LANGS) {
      expect(dict[l][RECOVERY_MENU], l).toBe(`${dict[l][RECOVERY]}…`);
      expect(dict[l]['저장하지 않은 도면이 {0}개 있습니다. 새로 고치기 전에 이 브라우저에 자동 저장해 두며, 다시 열린 뒤 도면 복구 관리자(DRAWINGRECOVERY)로 되살릴 수 있습니다.'], l).toContain(dict[l][RECOVERY]!);
    }
    // 플롯 스타일 변환(CONVERTPSTYLES 물음 제목): 같은 사전 「…플롯 스타일로 변환하면」의 转换 — 切换(바꾸어 놓기)이 아니다
    expect(src('app/filecmds-plot.ts')).toContain(`ask('${CONVERT}'`);
    expect(zh['도면을 색상 종속 플롯 스타일로 변환하면 도면층과 객체에 지정한 이름 있는 플롯 스타일이 모두 제거됩니다. 계속하시겠습니까?']).toContain('转换');
    expect(zh[CONVERT]).toBe('转换打印样式');
    // 독일어 시작 화면: 예제 도면으로 (앱의) 기능을 둘러본다 — 「예제 도면의 기능」이 아니다
    expect(en[SAMPLE_NOTE]).toContain('using an example drawing');
    expect(de[SAMPLE_NOTE]).toBe('Mit der Beispielzeichnung können Sie die Funktionen erkunden.');
    // 지원 범위 목록은 이웃 줄과 같은 부정사 꼴(명령꼴 「Öffnen Sie …」가 아니다)
    expect(de['DXF R12~R2018(ASCII·이진) 열기·저장']).toContain('öffnen/speichern');
    expect(de[DWG_SCOPE]).toBe('DWG R2.6~R2018 öffnen, R2000~R2018 speichern');
    // 끌어다 놓기: 같은 사전 「…eine Datei per Drag & Drop hinzufügen…」 꼴 — 「hierher … dort ab」(여기로 끌어 저기에 놓기)가 아니다
    const guide = Object.entries(de).find(([k]) => k.startsWith('프로그램이 준비되면') && k.includes('파일을 끌어다 놓거나'));
    expect(guide?.[1]).toContain('per Drag & Drop');
    expect(de[DROP]).toBe('Legen Sie DXF/DWG-Dateien per Drag & Drop hier ab');
  });

  it('거꾸로 찾기: 바꾼 값과 새 열쇠의 값은 제 원문으로 돌아온다(다른 일을 하는 칸과 같은 값이 아니다)', () => {
    const fresh = [BINARY_TPL, FETCH_HTTPS];
    const changed: [Lang, string[]][] = [
      ['en', [PORTFOLIO, THEME_ERR]],
      ['ja', [FONTS, PRINT_QAT, GO_ON]],
      ['zh-CN', [THEME_ERR, RECOVERY, RECOVERY_MENU, CONVERT]],
      ['de', [PORTFOLIO, THEME_ERR, SAMPLE_NOTE, DWG_SCOPE, DROP]],
    ];
    expect(changed.map(([, ks]) => ks.length)).toEqual([2, 3, 4, 5]);
    for (const [l, keys] of changed) for (const k of keys) expect(sourceMessage(dict[l][k]!), `${l}: ${k}`).toBe(k);
    for (const l of LANGS) for (const k of fresh) expect(sourceMessage(dict[l][k] ?? '(없음)'), `${l}: ${k}`).toBe(k);
  });
});
