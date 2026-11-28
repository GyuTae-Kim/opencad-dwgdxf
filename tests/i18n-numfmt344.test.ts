/**
 * 344차: 화면 글(명령행 결과·알림 줄·대화 상자·특성 팔레트·상태 막대)에 넣는 수 꼴.
 * - CAD 단위 값(길이·좌표·각도·넓이 — core/units.ts formatLength·formatAngle·formatArea와 toFixed 꼴)은 화면 언어와 상관없이 「.」 소수점·묶음 없음:
 *   명령행이 다시 읽는 꼴(parseLength·「x,y」 점 — 쉼표는 좌표 가름)과 같아야 한다.
 * - 사람이 읽는 셈 수(객체·항목·선택 수·바이트·반복 한도)도 앱 다수 꼴(「…${n}개」 템플릿 357 — 묶음 없음) 하나로. 고치기 전 18자리(16줄)는
 *   toLocaleString()(브라우저 지역 꼴 — 화면 언어가 아니라 브라우저 설정을 따라 독일어 브라우저면 「1.234」: CAD 값 소수점과 같은 글자)이거나
 *   toLocaleString('ko-KR')(쉼표 고정 — DWGPROPS 크기·객체 수, 같은 창의 배치 수는 묶음 없음)였다.
 * - 날짜·시각(DATES — 율리우스일·TIME·도면 비교·최근 파일 목록)은 수 꼴이 아니다 — 345차에 화면 언어 꼴 한 곳(datetext.ts)으로 모았다.
 * - 348차: 셈 소수(파일 크기 「1.5 KB」 — formatBytes 쓰는 곳 7·WMFOUT 결과 줄)의 소수점은 화면 언어 꼴(독일어 「1,5 KB」 — datetext.ts decimalText).
 *   CAD 단위 값·명령줄 입력·LISP·파일에 쓰는 값은 「.」 그대로(위 첫째 줄). ms·%·정수 KB는 소수점이 없어 그대로.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerArrayCommands } from '../src/app/arraycmd';
import { setArrayAssociativity } from '../src/app/assocarray';
import { guardedTranslate } from '../src/app/fileguard';
import { ft } from '../src/app/filetext';
import { formatBytes } from '../src/app/ui/dom';
import { formatAngle, formatArea, formatLength, parseLength } from '../src/core/units';
import { translate } from '../site/i18n.mjs';
import { makeHarness } from './cmds2/harness';
import { perCommandGroups } from './drawmod/groups';
import { lw } from './edit/make';

const LANGS = ['en', 'de', 'ja', 'zh-CN'] as const;
const tr = (l: string) => (x: string) => guardedTranslate(x, l) ?? translate(x, l);
/** 천 단위로 묶은 수(「1.234」·「1,234」) */
const GROUPED = /\d[.,]\d{3}(?!\d)/;

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const files = (d: string): string[] =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? files(p) : n.endsWith('.ts') ? [p] : [];
  });
const LINES = files(SRC).flatMap((f) =>
  readFileSync(f, 'utf8')
    .split('\n')
    .map((s) => ({ f: f.slice(SRC.length), s })),
);
const LOCALE = /\.toLocale(?:Date|Time)?String\(|Intl\.(?:NumberFormat|DateTimeFormat|PluralRules)/;
/**
 * 지역 꼴로 만드는 날짜·시각 넷 줄(수 꼴이 아니다): 344차의 일곱 줄(ko-KR 고정 넷 — 율리우스일·DWGPROPS·날짜 특성·TIME, 최근 파일 목록 recent.ts 셋)을
 * 345차가 화면 언어 꼴 한 곳(datetext.ts dateTimeText — 옵션 형식 줄·지역 꼴 둘)으로 모았다. recent.ts에는 칸을 고르는 옵션 줄만 남는다(tests/i18n-datefmt345.test.ts)
 */
const DATES: [string, string][] = [
  ['app/datetext.ts', 'opts?: Intl.DateTimeFormatOptions'],
  ['app/datetext.ts', 'return d.toLocaleString(locale, opts);'],
  ['app/datetext.ts', "return d.toLocaleString('ko', opts);"],
  ['app/recent.ts', 'const opts: Intl.DateTimeFormatOptions = sameDay'],
];
/**
 * 348차: 셈 소수(파일 크기 「1.5 KB」)의 소수점을 화면 언어 글자로 바꾸는 한 줄(datetext.ts decimalText — 지역 꼴로 소수점 글자만 읽는다).
 * 묶음은 넣지 않는다(344차 — 셈 수는 묶음 없는 꼴). CAD 단위 값은 이 길을 쓰지 않는다
 */
const NUMS: [string, string][] = [['app/datetext.ts', 'new Intl.NumberFormat(locale).formatToParts(1.5)']];

/** 독일어 브라우저(지역 de-DE)처럼: 인자 없는 수의 toLocaleString이 「1.234」 꼴 */
function germanBrowser(): void {
  const de = new Intl.NumberFormat('de-DE');
  vi.spyOn(Number.prototype, 'toLocaleString').mockImplementation(function (this: unknown) {
    return de.format(Number(this));
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setArrayAssociativity(true);
});

/** 화면 언어가 l인 동안(html lang — datetext.ts screenLocale이 읽는 곳; 이 시험은 node 환경이라 document를 그 칸만 흉내) f를 부른다 */
function onScreen<T>(l: string, f: () => T): T {
  vi.stubGlobal('document', { documentElement: { lang: l } });
  try {
    return f();
  } finally {
    vi.unstubAllGlobals();
  }
}

describe('화면 글에 넣는 수 꼴 — CAD 단위 값·셈 수 모두 묶음 없는 꼴 하나(344차)', () => {
  it('(가) src에서 수를 지역 꼴로 만드는 길은 날짜·시각 넷과 셈 소수 소수점 글자 하나(348차)뿐 — 셈 수·CAD 단위 값은 묶음 없는 꼴(셈이 비지 않는 대조)', () => {
    const hits = LINES.filter((x) => LOCALE.test(x.s)).map((x) => `${x.f}: ${x.s.trim()}`);
    expect(hits.length, hits.join('\n')).toBe(DATES.length + NUMS.length);
    for (const [f, s] of [...DATES, ...NUMS]) expect(hits.some((h) => h.startsWith(`${f}:`) && h.includes(s)), `${f} ${s}`).toBe(true);
    // 대조: 묶음 없는 셈 수 템플릿·CAD 값 toFixed 자리·단위 꼴 도우미 쓰는 곳(344차 셈 365·192·106줄)
    expect(LINES.filter((x) => /\}개/.test(x.s)).length).toBeGreaterThan(300);
    expect(LINES.filter((x) => /\.toFixed\(/.test(x.s)).length).toBeGreaterThan(150);
    expect(LINES.filter((x) => /\b(formatLength|formatAngle|formatArea|formatPolarAngle|formatPolarAddAng|formatDeg|fmtLen)\(/.test(x.s) && !/export (function|const)/.test(x.s)).length).toBeGreaterThan(90);
  });

  it('(나) 독일어 지역 브라우저에서도 셈 수는 묶음 없는 꼴 — 진짜 ARRAYRECT 결과 줄(항목 1000개)과 네 언어 옮김, 상태 막대·특성 팔레트·DWGPROPS 틀', async () => {
    germanBrowser();
    expect((1234).toLocaleString()).toBe('1.234');
    setArrayAssociativity(true);
    const h = perCommandGroups(makeHarness());
    registerArrayCommands(h.app);
    const s = h.add({ ...lw([[0, 0], [1, 0], [1, 1], [0, 1]], true), handle: '' });
    await h.run('ARRAYRECT', [{ sel: [s.handle] }, 'COU', '40', '25', '']);
    const line = h.printed.find((t) => t.startsWith('항목 ') && t.includes('연관 배열'));
    expect(line).toBe('항목 1000개의 연관 배열(직사각형)을 만들었습니다.');
    for (const l of LANGS) {
      const out = tr(l)(line!);
      expect(out, l).toContain('1000');
      expect(GROUPED.test(out), `${l}: ${out}`).toBe(false);
    }
    expect(tr('en')(line!)).toMatch(/^Created an associative array \(.*\) with 1000 item\(s\)\.$/);
    // 소스 꼴(고친 템플릿)과 그 줄을 독일어 화면에서
    const src = (f: string) => readFileSync(join(SRC, f), 'utf8');
    for (const [f, t] of [
      ['app/ui/shell.ts', '`선택 ${st.selection.size}개`'],
      ['app/ui/palettes.ts', '`전체 (${sel.length})`'],
      ['app/dwgprops.ts', '`${st.size}바이트`'],
      ['app/app.ts', '객체 ${res.doc.entityIndex.size}개, 읽기'],
    ])
      expect(src(f!), t).toContain(t);
    expect(tr('de')('선택 1234개')).toBe('1234 ausgewählt');
    for (const x of ['전체 (1234)', '1234567바이트', '항목 1234개를 대체했습니다.', '배열 항목이 너무 많습니다(최대 100000개).'])
      for (const l of LANGS) {
        const out = tr(l)(x);
        expect(/[가-힣]/.test(out), `${l}: ${out}`).toBe(false);
        expect(out, l).toMatch(/1234|100000/);
        expect(GROUPED.test(out), `${l}: ${out}`).toBe(false);
      }
  });

  it('(다) CAD 단위 값은 독일어 화면·독일어 브라우저에서도 「.」 소수점·묶음 없음 — 명령행이 다시 읽는 꼴과 같다', () => {
    germanBrowser();
    const u = { lunits: 2, luprec: 4, aunits: 0, auprec: 2 };
    const len = formatLength(12345.6789, u);
    expect(len).toBe('12345.6789');
    expect(parseLength(len)).toBe(12345.6789);
    expect(formatArea(1234567.25, u)).toBe('1234567.2500');
    expect(formatAngle(Math.PI / 3, u)).toBe('60.00°');
    expect(tr('de')(`거리 = ${len}`)).toBe('Abstand = 12345.6789');
    for (const l of LANGS) expect(tr(l)(`거리 = ${len}`), l).toContain('12345.6789');
  });
});

describe('셈 소수의 소수점 — 화면 언어 꼴(348차)', () => {
  /** 화면 언어마다 소수점 글자: 독일어 「,」, 한국어·영어·일본어·중국어 「.」(다른 OpenCAD 앱과 같은 판단 — 리드가 정함) */
  const SEP: Record<string, string> = { ko: '.', en: '.', de: ',', ja: '.', 'zh-CN': '.' };
  const FIVE = ['ko', ...LANGS];
  const U = { lunits: 2, luprec: 4, aunits: 0, auprec: 2 };

  it('(라) 다섯 언어 화면에서 파일 크기(formatBytes — 큰 파일 알림·ETRANSMIT 결과·도면 정보·탭·최근 문서·열기 중단 알림)는 그 언어 소수점·묶음 없음, CAD 단위 값은 다섯 언어 모두 「.」', () => {
    for (const l of FIVE) {
      const p = SEP[l]!;
      const [kb, mb, b, big, len, area] = onScreen(l, () => [formatBytes(1536), formatBytes(2.5 * 1024 * 1024), formatBytes(1000), formatBytes(1234.5 * 1024 * 1024), formatLength(12345.6789, U), formatArea(1234567.25, U)]);
      expect([kb, mb, b, big], l).toEqual([`1${p}5 KB`, `2${p}5 MB`, '1000 B', `1234${p}5 MB`]);
      expect([len, area], l).toEqual(['12345.6789', '1234567.2500']);
      // 화면 글: 틀 {n} 자리에 그 언어 꼴 수가 그대로 옮겨진다(사전 바꿈 없음 — 번역기 틀 자리는 (.*?)). WMFOUT 결과 줄은 소스 꼴(아래)의 수
      const toast = `큰 파일(${big})이라 여는 데 시간이 걸리고 메모리를 많이 씁니다. 다른 탭을 닫아 두면 좋습니다.`;
      const wmf = `객체 3개를 ${ft('a.wmf')}(으)로 저장했습니다(1${p}2 KB, 지금 화면 범위, 래스터 이미지는 빠집니다).`;
      for (const [x, n] of [[toast, `1234${p}5 MB`], [wmf, `1${p}2 KB`]] as const) {
        const out = l === 'ko' ? x : tr(l)(x);
        expect(out, `${l}: ${out}`).toContain(n);
        if (l !== 'ko') expect(/[가-힣]/.test(out), `${l}: ${out}`).toBe(false);
        expect(GROUPED.test(out), `${l}: ${out}`).toBe(false);
      }
    }
    // 소스: 셈 소수 두 자리가 decimalText를 부른다(고치기 전 toFixed(1) 그대로 — 다섯 언어 모두 「.」)
    const src = (f: string) => readFileSync(join(SRC, f), 'utf8');
    expect(src('app/ui/dom.ts')).toContain('return `${decimalText(n / 1024, 1)} KB`;');
    expect(src('app/ui/dom.ts')).toContain('return `${decimalText(n / 1024 / 1024, 1)} MB`;');
    expect(src('app/filecmds-export.ts')).toContain('(${decimalText(data.length / 1024, 1)} KB, 지금');
    // CAD 단위 값 길(단위 꼴 도우미)은 화면 언어를 읽지 않는다
    expect(src('core/units.ts')).not.toMatch(/decimalText|screenLocale/);
  });

  it('(마) 셈 소수를 「.」 고정으로 만드는 새 자리가 생기면 실패 — 단위(KB·MB·GB·ms·%·초)를 붙이는 toFixed(1자리 이상) 꼴 0', () => {
    const FIXED = /\.toFixed\([1-9]\d*\)(?:\}\s?|\s*\+\s*['"`]\s?)(?:KB|MB|GB|ms|%|초)/;
    const hits = LINES.filter((x) => FIXED.test(x.s)).map((x) => `${x.f}: ${x.s.trim()}`);
    expect(hits, hits.join('\n')).toEqual([]);
    // 대조: 정수 KB(toFixed(0) — 소수점 없음)·정수 ms 자리는 그대로 남는다(셈이 비지 않음)
    expect(LINES.filter((x) => /\.toFixed\(0\)\}\s?KB/.test(x.s)).length).toBeGreaterThanOrEqual(5);
    expect(LINES.filter((x) => /Math\.round\([^)]*\)\}\s?ms/.test(x.s)).length).toBeGreaterThanOrEqual(3);
  });
});
