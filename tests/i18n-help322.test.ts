/**
 * 322차: 도움말(F1) 대화 상자의 명령 표 — 줄마다 이름·별칭 옆 제목 칸(src/editor.ts HELP, `data-i18n-ui-copy`)과 그 제목들의 번역 대조.
 * - 제목 칸은 통째 열쇠가 없으면 「: 」 조각마다 틀({0})이 잡은 값까지 옮긴다(src/app/i18n.ts value). 소스의 명령 제목(name·title 짝)과
 *   실행 중에 만드는 제목(PNG·JPEG·BMP 내보내기, 시스템 변수, AutoLISP 명령, 기하학적 구속조건, 외부 참조·도면 비교 변수, 동적 블록 작성 등)이
 *   네 언어 모두 한국어 없이 보인다 — 빠진 번역은 0이었다(새 명령이 열쇠 없이 들어오면 여기서 잡는다).
 * - 대화 상자 머리 글(「도움말」·「조작」·「명령(명령행에 입력)」·「점 입력」)은 320차, 조작 표는 277차가 대조했다.
 * - 오역(같은 사전의 맞는 번역으로): 영어 시스템 변수 틀의 복수·-LAYER 소문자·LAYMCUR 끝 마침표, AutoLISP 「함수로 부르라」를 「함수라고 부르라」로 옮긴 것(네 언어)과
 *   일본어가 치는 이름 C:·(c:…)를 전각으로 바꾼 것, 플롯 스타일 모드 변환 切り替え·切换, 중국어 MLSTYLE·MLEDIT 多行(여러 줄 문자의 낱말)·QTEXT 「입력」·XCLIP 修剪(TRIM의 낱말),
 *   독일어 XATTACH 알림 문장·DIMDISASSOCIATE·UNDEFINE 뜻 바뀜·끝 마침표·MVSETUP 「설정 보이기」·FILLMODE 형용사·-MLEDIT Mehrzeilig·-BOUNDARY Grenze.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { sourceMessage, translate } from '../site/i18n.mjs';

const LANGS = ['en', 'de', 'ja', 'zh-CN'] as const;
type Lang = (typeof LANGS)[number];
const HANGUL = /[가-힣]/;
const load = (lang: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../site/locales/${lang}.json`, import.meta.url), 'utf8'));
const dict = Object.fromEntries(LANGS.map((l) => [l, load(l)])) as Record<Lang, Record<string, string>>;
const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const src = (f: string) => readFileSync(join(SRC, f), 'utf8');
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** 도움말 명령 표의 제목 칸에 보이는 글(src/app/i18n.ts value의 uiCopy 길: 통째 열쇠, 없으면 「: 」 조각마다 틀의 잡은 값까지) */
function shown(title: string, l: Lang): string {
  return dict[l][norm(title)] ? translate(title, l, true) : title.split(/(:\s+)/).map((p: string) => translate(p, l, true)).join('');
}

function tsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? tsFiles(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : []));
}
const unquote = (s: string) => s.replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16))).replace(/\\(['\\])/g, '$1');

/** 소스의 명령 제목: name: '…' 바로 뒤의 title: '…'(같은 객체) */
function sourceTitles(): string[] {
  const out = new Set<string>();
  for (const f of tsFiles(SRC)) {
    let name: string | null = null;
    for (const m of readFileSync(f, 'utf8').matchAll(/\b(name|title): '((?:[^'\\\n]|\\.)*)'/g)) {
      if (m[1] === 'name') name = m[2]!;
      else if (name !== null) {
        out.add(unquote(m[2]!));
        name = null;
      }
    }
  }
  return [...out].filter((t) => HANGUL.test(t));
}

/** 실행 중에 만드는 명령 제목(값을 끼운 꼴) */
function runtimeTitles(): string[] {
  const gc = [...src('app/constraints.ts').matchAll(/\{ key: '[A-Z]+', label: '([^']+)', type: '[A-Z]+', cmd: 'GC[A-Z]+' \}/g)].map((m) => `${m[1]} 구속조건`);
  const dyn = [...src('app/blocks.ts').matchAll(/\['B[A-Z]+', \[[^\]]*\], '([^']+)'\]/g)].map((m) => m[1]!);
  const script = [...src('app/script.ts').matchAll(/sysvar\('[A-Z]+', '([^']+)'\)/g)].map((m) => m[1]!);
  const scale = [...src('app/tables.ts').matchAll(/scaleVar\('[A-Z]+', '\$[A-Z]+', '([^']+)'/g)].map((m) => m[1]!);
  const frame = [...src('app/modify2.ts').matchAll(/\['(?:IMAGE|WIPEOUT)FRAME', '[a-z]+', '([^']+)'\]/g)].map((m) => m[1]!);
  expect([gc.length, dyn.length, script.length, scale.length, frame.length]).toEqual([12, 9, 3, 2, 2]);
  return [
    ...gc, ...dyn, ...script, ...scale, ...frame,
    'PNG로 내보내기', 'JPEG로 내보내기', 'BMP로 내보내기', '시스템 변수 PDMODE', 'AutoLISP 명령 C:HELLO',
    '외부 참조 비교: XCOMPAREBAKPATH(이 웹 버전에는 없음)', '외부 참조 비교: XCOMPAREBAKSIZE(이 웹 버전에는 없음)',
    '도면 비교: 해치 비교', '외부 참조 비교: 외부 참조를 다시 로드할 때 이전 버전을 남기고 비교를 알림', '영역', '합집합', '차집합', '교집합',
  ];
}

const LISP_FN = 'AutoLISP 명령 {0}은(는) AutoLISP 식이 실행 중일 때 명령으로 부를 수 없습니다. (c:{1})처럼 함수로 부르십시오.';
const LISP_BACK = '{0} 명령을 되돌렸습니다. AutoLISP 명령은 (c:{1})로 부르십시오.';
const LISP_TITLE = 'AutoLISP 명령 C:{0}';
const LISP_GOES_ON = 'AutoLISP 명령 C:{0}이(가) 계속 실행됩니다.';
const XCLIP_ASK = '자르기 경계 지정 또는 [폴리선 선택(S)/다각형(P)/직사각형(R)] <직사각형>:';

describe('도움말(F1) 명령 표의 번역(322차)', () => {
  it('명령 표의 제목 칸은 네 언어 모두 한국어 없이 보인다 — 소스의 명령 제목과 실행 중에 만드는 제목(빠진 번역 0)', () => {
    const editor = src('editor.ts');
    expect(editor).toContain("h('td', { 'data-i18n-ui-copy': '' }, c.title)");
    expect(editor).toContain('title: `${label}로 내보내기`');
    expect(editor).toContain("['JPGOUT', 'jpg', 'JPEG']");
    expect(src('app/sysvars.ts')).toContain('title: `시스템 변수 ${n}`');
    expect(src('app/lisp.ts')).toContain('title: `AutoLISP 명령 C:${n}`');
    expect(src('app/xcompare.ts')).toContain("for (const name of ['XCOMPAREBAKPATH', 'XCOMPAREBAKSIZE'])");
    expect(src('app/xcompare.ts')).toContain('title: `외부 참조 비교: ${name}(이 웹 버전에는 없음)`');
    expect(src('app/compare-vars.ts')).toContain("title: `${v.name.startsWith('X') ? '외부 참조 비교' : '도면 비교'}: ${v.title}`");
    expect(src('app/commands.ts')).toContain("title: name === 'REGION' ? '영역' : name === 'UNION' ? '합집합' : name === 'SUBTRACT' ? '차집합' : '교집합',");
    const titles = sourceTitles();
    expect(titles.length).toBeGreaterThan(400);
    const all = [...titles, ...runtimeTitles()];
    const left: string[] = [];
    for (const l of LANGS) for (const t of all) if (HANGUL.test(shown(t, l))) left.push(`${l}: ${t} → ${shown(t, l)}`);
    expect(left).toEqual([]);
  });

  it('오역: 같은 사전의 맞는 번역으로 고쳤다', () => {
    const [en, de, ja, zh] = [dict.en, dict.de, dict.ja, dict['zh-CN']];
    // 영어: 이름 하나를 잡는 시스템 변수 틀은 단수(같은 사전 「{0} 변수는 읽기 전용입니다.」) — 복수 System Variables는 목록 대화 상자(SYSVDLG·SETVAR) 이름
    expect(en['{0} 변수는 읽기 전용입니다.']).toBe('The {0} variable is read-only.');
    expect(en['시스템 변수 {0}']).toBe('System variable {0}');
    expect(shown('시스템 변수 PDMODE', 'en')).toBe('System variable PDMODE');
    expect(en['시스템 변수']).toBe('System Variables');
    // -LAYER는 다른 「…(명령행)」 제목처럼 대문자로 시작, LAYMCUR는 이웃 제목처럼 마침표 없이
    expect(en['도면층 상태(명령행)']).toBe('Layer state (command line)');
    expect(en['도면층(명령행)']).toBe('Layer (command line)');
    expect(en['객체의 도면층을 현재로']).toBe("Make the object's layer current");
    // AutoLISP: 함수로 부르라(「함수라고 부르라」가 아니다) — 같은 사전 「… AutoLISP 명령은 (c:{1})로 부르십시오.」의 Invoke·aufrufen·调用
    expect(en[LISP_BACK]).toContain('Invoke the AutoLISP command as (c:{1})');
    expect(de[LISP_BACK]).toContain('Rufen Sie den AutoLISP-Befehl als (c:{1}) auf.');
    expect(zh[LISP_BACK]).toContain('调用为 (c:{1})');
    expect(en[LISP_FN]).toContain('Invoke it as a function, such as (c:{1}).');
    expect(de[LISP_FN]).toContain('Rufen Sie ihn als Funktion auf, z. B. (c:{1}).');
    expect(zh[LISP_FN]).toContain('请像 (c:{1}) 这样作为函数调用。');
    expect(ja[LISP_FN]).toContain('(c:{1}) のように関数として呼び出してください。');
    expect([en[LISP_FN], de[LISP_FN], zh[LISP_FN], ja[LISP_FN]].join('\n')).not.toMatch(/Call it a function|Nennen Sie|称为|関数と呼んで/);
    // 일본어: 치는 함수 이름 C:{0}·(c:{1})는 반각 그대로(다른 세 언어와 같음, 같은 사전 「….{2}」として呼び出す 꼴)
    expect(ja['참고: AutoLISP 명령 {0}이(가) 같은 이름의 기존 명령({1})보다 먼저 실행됩니다. 원래 명령은 .{2}으로 부를 수 있습니다.']).toContain('「.{2}」として呼び出す');
    for (const k of [LISP_TITLE, LISP_GOES_ON, LISP_FN, LISP_BACK]) expect(ja[k], k).not.toMatch(/[：（）]/);
    expect(ja[LISP_TITLE]).toBe('AutoLISPコマンド C:{0}');
    expect(ja[LISP_GOES_ON]).toBe('AutoLISPコマンド C:{0} は引き続き実行されます。');
    expect(ja[LISP_BACK]).toBe('{0} コマンドを戻しました。AutoLISPコマンドは (c:{1}) として呼び出してください。');
    for (const l of LANGS) expect(dict[l][LISP_BACK], l).toContain('(c:{1})');
    // 플롯 스타일 모드 변환: 같은 사전 「플롯 스타일 변환」의 낱말(바꾸어 놓기 切り替え·切换이 아니다)
    expect(ja['플롯 스타일 변환']).toBe('プロットスタイルの変換');
    expect(ja['플롯 스타일 모드 변환']).toBe('プロットスタイルモードの変換');
    expect(zh['플롯 스타일 변환']).toBe('转换打印样式');
    expect(zh['플롯 스타일 모드 변환']).toBe('转换打印样式模式');
    // 중국어 여러 줄(MLINE)은 多线 — 多行은 여러 줄 문자(MTEXT 多行文本)의 낱말
    expect([zh['여러 줄'], zh['여러 줄 문자']]).toEqual(['多线', '多行文本']);
    expect([zh['여러 줄 스타일'], zh['여러 줄 편집'], zh['여러 줄 편집(명령행)']]).toEqual([zh['다중선 스타일'], '多线编辑', '多线编辑（命令行）']);
    // QTEXT: 같은 사전 「빠른 문자 변수(…)」 快速文本变量 — 「입력」이 붙지 않는다
    expect(zh['빠른 문자']).toBe('快速文本');
    expect(zh['빠른 문자 변수(0 끄기, 1 켜기)']!.startsWith(zh['빠른 문자']!)).toBe(true);
    // XCLIP 자르기는 裁剪(같은 사전 XCLIP 조각 「자르기 경계 지정 또는 [」) — 修剪은 TRIM의 낱말
    expect(src('app/xclip.ts')).toContain(`'${XCLIP_ASK}'`);
    expect(zh['자르기 경계 지정 또는 [']).toBe('指定裁剪边界或 [');
    expect(zh[XCLIP_ASK]!.startsWith(zh['자르기 경계 지정 또는 [']!)).toBe(true);
    expect(zh['블록 자르기']).toBe('裁剪块');
    // 독일어: 부착은 같은 사전 「이미지 부착」 Bild anhängen 꼴(알림 문장 「… werden verknüpft」가 아니다)
    expect([de['이미지 부착'], de['이미지 부착 — {0}']]).toEqual(['Bild anhängen', 'Bild anhängen — {0}']);
    expect(de['외부 참조 부착']).toBe('Externe Referenz anhängen');
    expect(de['외부 참조 부착 — {0}']).toBe(`${de['외부 참조 부착']} — {0}`);
    // 연관 해제·정의 해제: 같은 사전 「치수 연관성」·「명령 정의 되돌리기」의 낱말(치수·명령 자체를 없애는 뜻이 아니다)
    expect(de['치수 연관 해제']).toBe(`${de['치수 연관성']} aufheben`);
    expect(de['명령 정의 되돌리기']).toBe('Befehlsdefinition zurücksetzen');
    expect(de['명령 정의 해제']).toBe('Befehlsdefinition aufheben');
    // 끝 마침표 없음(이웃 제목 꼴), 뷰 = Ansicht(「뷰 해상도」), 변수 = 「Variable für …」(「빠른 문자 변수」)
    expect([de['모형 탭'], de['뷰포트 최소화(복원)']]).toEqual(['Registerkarte „Modell“', 'Ansichtsfenster minimieren (wiederherstellen)']);
    expect(de['뷰 해상도']).toBe('Ansichtsauflösung');
    expect(de['뷰 설정(MVSETUP)']).toBe('Ansichtseinstellungen (MVSETUP)');
    expect(de['빠른 문자 변수(0 끄기, 1 켜기)']).toBe('Variable für Quicktext (0 aus, 1 ein)');
    expect(de['채우기 모드 변수(0 끄기, 1 켜기)']).toBe('Variable für Füllmodus (0 Aus, 1 Ein)');
    // 명령행 판 제목 = 대화 상자 판 제목 + (Befehlszeile)
    expect(de['여러 줄 편집(명령행)']).toBe(`${de['여러 줄 편집']} (Befehlszeile)`);
    expect(de['경계(명령행)']).toBe(`${de['경계']} (Befehlszeile)`);
  });

  it('거꾸로 찾기: 바꾼 값은 제 원문으로 돌아온다(다른 일을 하는 칸과 같은 값이 아니다)', () => {
    const changed: [Lang, string[]][] = [
      ['en', ['시스템 변수 {0}', '도면층(명령행)', '객체의 도면층을 현재로', LISP_FN]],
      ['ja', [LISP_TITLE, LISP_GOES_ON, LISP_FN, LISP_BACK, '플롯 스타일 모드 변환']],
      ['zh-CN', [LISP_FN, '플롯 스타일 모드 변환', '여러 줄 편집', '여러 줄 편집(명령행)', '빠른 문자', '블록 자르기', XCLIP_ASK]],
      ['de', [LISP_FN, '외부 참조 부착', '외부 참조 부착 — {0}', '치수 연관 해제', '명령 정의 해제', '모형 탭', '뷰 설정(MVSETUP)', '뷰포트 최소화(복원)', '채우기 모드 변수(0 끄기, 1 켜기)', '여러 줄 편집(명령행)', '경계(명령행)']],
    ];
    expect(changed.map(([, ks]) => ks.length)).toEqual([4, 5, 7, 11]);
    for (const [l, keys] of changed) for (const k of keys) expect(sourceMessage(dict[l][k]!), `${l}: ${k}`).toBe(k);
    // 중국어 「여러 줄 스타일」은 같은 일을 하는 「다중선 스타일」(MLSTYLE)과 같은 이름(306차 독일어 꼴) — 어느 열쇠로 돌아와도 같은 번역이다
    expect(['여러 줄 스타일', '다중선 스타일']).toContain(sourceMessage(dict['zh-CN']['여러 줄 스타일']!));
  });
});
