/**
 * 344차: 화면 글(명령행 결과·알림 줄·대화 상자·특성 팔레트·상태 막대)에 넣는 수 꼴.
 * - CAD 단위 값(길이·좌표·각도·넓이 — core/units.ts formatLength·formatAngle·formatArea와 toFixed 꼴)은 화면 언어와 상관없이 「.」 소수점·묶음 없음:
 *   명령행이 다시 읽는 꼴(parseLength·「x,y」 점 — 쉼표는 좌표 가름)과 같아야 한다.
 * - 사람이 읽는 셈 수(객체·항목·선택 수·바이트·반복 한도)도 앱 다수 꼴(「…${n}개」 템플릿 357 — 묶음 없음) 하나로. 고치기 전 18자리(16줄)는
 *   toLocaleString()(브라우저 지역 꼴 — 화면 언어가 아니라 브라우저 설정을 따라 독일어 브라우저면 「1.234」: CAD 값 소수점과 같은 글자)이거나
 *   toLocaleString('ko-KR')(쉼표 고정 — DWGPROPS 크기·객체 수, 같은 창의 배치 수는 묶음 없음)였다.
 * - 날짜·시각(DATES — 율리우스일·TIME·도면 비교)은 수 꼴이 아니라 두었다(344차에 보고 둠).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerArrayCommands } from '../src/app/arraycmd';
import { setArrayAssociativity } from '../src/app/assocarray';
import { guardedTranslate } from '../src/app/fileguard';
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
 * 지역 꼴로 남긴 날짜·시각 일곱 줄(수 꼴이 아니다 — 344차에 보고 둠): ko-KR 고정 넷(율리우스일·DWGPROPS·날짜 특성·TIME)과
 * 최근 파일 목록(recent.ts — 화면 언어 꼴, 한국어 화면은 'ko') 셋
 */
const DATES: [string, string][] = [
  ['app/compare.ts', "new Date((v - 2440587.5) * 86400000).toLocaleString('ko-KR', { timeZone: 'UTC' })"],
  ['app/dwgprops.ts', "d.toLocaleString('ko-KR') : ''"],
  ['app/propcmds.ts', "return d.toLocaleString('ko-KR');"],
  ['app/propcmds.ts', "${new Date().toLocaleString('ko-KR')}"],
  ['app/recent.ts', 'const opts: Intl.DateTimeFormatOptions = sameDay'],
  ['app/recent.ts', 'new Intl.DateTimeFormat(locale, opts).format(t)'],
  ['app/recent.ts', "new Intl.DateTimeFormat('ko', opts).format(t)"],
];

/** 독일어 브라우저(지역 de-DE)처럼: 인자 없는 수의 toLocaleString이 「1.234」 꼴 */
function germanBrowser(): void {
  const de = new Intl.NumberFormat('de-DE');
  vi.spyOn(Number.prototype, 'toLocaleString').mockImplementation(function (this: unknown) {
    return de.format(Number(this));
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  setArrayAssociativity(true);
});

describe('화면 글에 넣는 수 꼴 — CAD 단위 값·셈 수 모두 묶음 없는 꼴 하나(344차)', () => {
  it('(가) src에서 수를 지역 꼴로 만드는 길은 날짜·시각 넷뿐 — 셈 수·CAD 단위 값은 묶음 없는 꼴(셈이 비지 않는 대조)', () => {
    const hits = LINES.filter((x) => LOCALE.test(x.s)).map((x) => `${x.f}: ${x.s.trim()}`);
    expect(hits.length, hits.join('\n')).toBe(DATES.length);
    for (const [f, s] of DATES) expect(hits.some((h) => h.startsWith(`${f}:`) && h.includes(s)), `${f} ${s}`).toBe(true);
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
