// @vitest-environment jsdom
/**
 * 345차: 화면에 보이는 날짜·시각 글은 화면 언어 꼴 한 곳(src/app/datetext.ts dateTimeText — html lang을 따른다: 최근 문서 목록이 쓰던 길을 꺼냄).
 * 고치기 전 넷 — 도면 비교 정보 「마지막 수정」(compare.ts)·DWGPROPS 통계 「작성」「수정」(dwgprops.ts julianText)·TIME 「작성」「마지막 업데이트」
 * (propcmds.ts julian)·TIME 「현재 시간」 — 은 ko-KR 고정이라 다섯 언어 화면 모두 「2026. 11. 28. 오후 3:00:00」 꼴이었다(다른 언어 화면에 한국어 「오후」 — WCAG 3.1.2).
 * 브라우저 지역(인자 없는 지역 꼴)도 쓰지 않는다 — 344차 판단대로 화면 글은 브라우저 설정이 아니라 화면 언어를 따른다.
 * 총 편집 시간 「N일 hh:mm:ss」 틀의 en·de 값은 「Day N」(날째 — 기간이 아니다)이 아니라 같은 사전 「{0}일」 값 꼴 「N days」·「N Tage」(AutoCAD TIME 꼴).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerDwgProps } from '../src/app/dwgprops';
import { guardedTranslate } from '../src/app/fileguard';
import { installLocalization } from '../src/app/i18n';
import { registerPropCommands } from '../src/app/propcmds';
import { recentTimeLabel } from '../src/app/recent';
import { translate } from '../site/i18n.mjs';
import { makeHarness } from './cmds2/harness';

const LANGS = ['en', 'de', 'ja', 'zh-CN'] as const;
const HANGUL = /[가-힣]/;
/** 시각이 든 글(「3:00」·「15:00」) */
const TIMED = /\d:\d\d/;
/** 2026-11-28 15:00 UTC의 율리우스일(2451545.0 = 2000-01-01 12:00 UTC에 9828.125일 — 0.125는 2진수로 딱 떨어져 ms가 정수) */
const JD = 2461373.125;
const AT = new Date((JD - 2440587.5) * 86400000);
/** 머리말 현지 시각 변수의 칸을 그대로 읽는 꼴(346차 — datetext.ts drawingTimeText) */
const UTC = { timeZone: 'UTC' } as const;
/** 총 편집 시간 1.5일 → 「1일 12:00:00」 */
const EDIT = 1.5;
const DURATION: Record<string, string> = { ko: '1일 12:00:00', en: '1 days 12:00:00', de: '1 Tage 12:00:00', ja: '1日12:00:00', 'zh-CN': '1 天 12:00:00' };
const tr = (l: string) => (x: string) => guardedTranslate(x, l) ?? translate(x, l);

// jsdom 환경에서는 import.meta.url이 file: 주소가 아니다 — 저장소 뿌리(vitest가 도는 곳)에서 찾는다
const SRC = join(process.cwd(), 'src/');
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
const src = (f: string) => readFileSync(join(SRC, f), 'utf8');

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
  document.documentElement.lang = '';
  history.replaceState(null, '', '/');
});

/** 화면 언어 l로 연 편집기 흉내(번역층 i18n.ts installLocalization — html lang·DOM 글 옮김·언어 메뉴) */
async function screen(l: string): Promise<HTMLElement> {
  history.replaceState(null, '', l === 'ko' ? '/' : `/${l}/`);
  const root = document.createElement('div');
  root.append(Object.assign(document.createElement('header'), { className: 'titlebar' }));
  document.body.append(root);
  dispose = await installLocalization(root);
  expect(document.documentElement.lang).toBe(l);
  return root;
}

const dlg = () => document.querySelector<HTMLElement>('.dialog');
/** DWGPROPS를 열어 값 칸 글(번역층을 거친 글)을 want가 맞을 때까지(마감 3초) 읽고 확인으로 닫는다 */
async function propsCells(want: (cells: string[]) => boolean): Promise<string[]> {
  const h = makeHarness((d) => {
    d.header.set('$TDCREATE', JD);
    d.header.set('$TDUPDATE', JD);
    d.header.set('$TDINDWG', EDIT);
  });
  registerDwgProps(h.app);
  const run = h.run('DWGPROPS', []);
  await vi.waitFor(() => expect(dlg()?.getAttribute('aria-label')).toBeTruthy(), { timeout: 3000 });
  const cells = () => [...dlg()!.querySelectorAll('.mgr-row > div')].map((d) => d.textContent ?? '');
  await vi.waitFor(() => expect(want(cells()), cells().join(' | ')).toBe(true), { timeout: 3000 });
  const out = cells();
  (dlg()!.querySelector('footer .btn.primary') as HTMLButtonElement).click();
  await run;
  return out;
}

describe('화면에 보이는 날짜·시각 글은 화면 언어 꼴(345차)', () => {
  it('(가) src의 날짜·시각 지역 꼴은 datetext.ts 한 곳 — ko-KR 고정 0(새로 생기면 실패), 고치기 전 넷과 최근 문서 목록이 그 길을 부른다', () => {
    // 344차 셈: 날짜·시각 지역 꼴 일곱 줄 — ko-KR 고정 넷(다섯 언어에 「오후」)과 recent.ts 화면 언어 꼴 셋. 345차: 넷을 화면 언어 꼴로, recent.ts의 길을 datetext.ts로 꺼냄
    const koKR = LINES.filter((x) => /['"`]ko-KR['"`]/.test(x.s)).map((x) => `${x.f}: ${x.s.trim()}`);
    expect(koKR, koKR.join('\n')).toEqual([]);
    const calls = LINES.filter((x) => /\.toLocale(?:Date|Time)?String\(|new Intl\.DateTimeFormat\(/.test(x.s)).map((x) => x.f);
    expect(calls).toEqual(['app/datetext.ts', 'app/datetext.ts']);
    // 346차: 도면 머리말 율리우스일 셋(도면 비교·DWGPROPS·TIME)은 datetext.ts drawingTimeText 한 길(시간대 — tests/i18n-julian346.test.ts)
    for (const [f, s] of [
      ['app/datetext.ts', "dateTimeText(d, UTC_TIMES.has(name) ? undefined : { timeZone: 'UTC' })"],
      ['app/compare.ts', "drawingTimeText(d.header, '$TDUPDATE')"],
      ['app/dwgprops.ts', "drawingTimeText(H, '$TDCREATE')"],
      ['app/propcmds.ts', "drawingTimeText(hd, '$TDCREATE')"],
      ['app/propcmds.ts', '${dateTimeText(new Date())}'],
      ['app/recent.ts', 'return dateTimeText(t, opts, locale);'],
      ['app/ui/shell.ts', 'recentTimeLabel(r.time, now)'],
    ])
      expect(src(f!), `${f} ${s}`).toContain(s);
    expect(LINES.filter((x) => /\bdateTimeText\(/.test(x.s) && !/export function/.test(x.s))).toHaveLength(3);
  });

  it('(나) 다섯 언어 화면의 DWGPROPS 통계 「작성」「수정」「총 편집 시간」·TIME 결과 줄 — 날짜·시각은 그 화면 언어 꼴, 한국어 화면 밖 한글 0', async () => {
    for (const l of ['ko', ...LANGS]) {
      await screen(l);
      // TDCREATE·TDUPDATE는 저장한 곳의 현지 시각 — 시간대를 더하지 않고 그대로(346차, 전에는 보는 사람의 시간대를 더한 AT.toLocaleString(l))
      const date = AT.toLocaleString(l, UTC);
      expect(HANGUL.test(date), `${l}: ${date}`).toBe(l === 'ko');
      const cells = await propsCells((c) => c.filter((x) => x === date).length === 2 && c.includes(DURATION[l]!));
      expect(cells.filter((x) => x === date), l).toHaveLength(2);
      expect(cells, l).toContain(DURATION[l]);
      // 시각이 든 칸(「h:mm」 꼴)만 — 형식·파일 이름 칸의 글은 이 시험 밖
      if (l !== 'ko') expect(cells.filter((x) => TIMED.test(x) && HANGUL.test(x)), l).toEqual([]);
      // TIME: 기록 줄은 찍을 때의 화면 언어 꼴(339차 — 기록 줄은 찍은 때의 글 그대로)
      const h = makeHarness((d) => {
        d.header.set('$TDCREATE', JD);
        d.header.set('$TDUPDATE', JD);
        d.header.set('$TDINDWG', EDIT);
        d.header.set('$TDUSRTIMER', 0);
      });
      registerPropCommands(h.app);
      await h.run('TIME', []);
      expect(h.printed, l).toHaveLength(6);
      expect(h.printed[2], l).toContain(date);
      expect(h.printed[3], l).toContain(date);
      if (l === 'ko') expect(h.printed[4]).toContain(DURATION.ko);
      else
        for (const line of h.printed) {
          const out = tr(l)(line.trim());
          expect(HANGUL.test(out), `${l}: ${out}`).toBe(false);
        }
      if (l === 'en') expect(tr('en')(h.printed[4]!.trim())).toBe(`Total editing time: ${DURATION.en}`);
      if (l === 'de') expect(tr('de')(h.printed[4]!.trim())).toBe(`Bearbeitungszeit insgesamt: ${DURATION.de}`);
      dispose?.();
      dispose = undefined;
      document.body.replaceChildren();
    }
  });

  it('(다) 언어 메뉴로 바꾸면 다음에 여는 DWGPROPS·최근 문서 때가 새 언어 꼴(html lang을 따른다)', async () => {
    const root = await screen('en');
    const en = AT.toLocaleString('en', UTC);
    expect((await propsCells((c) => c.includes(en))).filter((x) => x === en)).toHaveLength(2);
    const clock = { hour: 'numeric', minute: '2-digit' } as const;
    expect(recentTimeLabel(AT.getTime(), AT.getTime())).toBe(AT.toLocaleString('en', clock));
    root.querySelector<HTMLButtonElement>('.language-trigger')!.click();
    document.querySelector<HTMLButtonElement>('.language-list [data-language=de]')!.click();
    await vi.waitFor(() => expect(document.documentElement.lang).toBe('de'), { timeout: 3000 });
    const de = AT.toLocaleString('de', UTC);
    expect(de).not.toBe(en);
    const cells = await propsCells((c) => c.includes(de));
    expect(cells.filter((x) => x === de)).toHaveLength(2);
    expect(cells.includes(en)).toBe(false);
    expect(cells.filter((x) => TIMED.test(x) && HANGUL.test(x))).toEqual([]);
    expect(recentTimeLabel(AT.getTime(), AT.getTime())).toBe(AT.toLocaleString('de', clock));
  });
});
