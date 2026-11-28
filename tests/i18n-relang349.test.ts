// @vitest-environment jsdom
/**
 * 349차: 화면 언어 꼴 수(셈 소수 — 348차 decimalText: 독일어 「1,5 KB」, 나머지 넷 「1.5 KB」)를 넣은 칸이 떠 있는(그려진) 채 언어 메뉴로 언어를 바꾸면 새 언어 꼴로 다시 그려진다.
 * 번역층(i18n.ts)은 글 마디·속성을 원문으로 다시 옮기지만 틀 {0}에 넣은 수는 넣은 때 꼴 그대로라, 다시 그리지 않던 셋은 앞 언어 꼴이 남았다(한국어 화면에서 그린 「1.5 KB」가 독일어 화면에):
 * 파일 탭 풀이 글(Shell.refreshTabs — 열기·닫기·저장 때만 그렸다), 시작 화면 안내 상자의 이름 줄(열기 중단 「이름 (크기)」 — 번역하지 않는 칸이라 번역층도 손대지 않는다),
 * 떠 있는 알림(큰 파일 8초·도면을 보는 중의 열기 중단 9초). 이제 Shell.relang(languagechange)이 셋을 다시 쓴다. 시작 화면 최근 문서 목록(크기·날짜)은 전부터 다시 그린다 — 대조.
 * 대화 상자(도면 정보·DWGPROPS·도면 비교 정보·342차 확인 글)는 뒤 막(.dialog-back)이 머리줄의 언어 메뉴를 덮어 열린 동안 바꿀 수 없고,
 * 명령행 기록 줄(TIME·ETRANSMIT·WMFOUT 결과·열기 실패 줄)은 찍은 때 글 그대로(339차 판단) — 이 시험 밖(표는 CHANGELOG 349차 절).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/app/app';
import { installLocalization } from '../src/app/i18n';
import { openErrorInfo } from '../src/app/openerror';
import { recentTimeLabel } from '../src/app/recent';
import { formatBytes, h as el, toast } from '../src/app/ui/dom';
import { Shell } from '../src/app/ui/shell';

/** 1536바이트 → 「1.5 KB」(독일어 「1,5 KB」) */
const KB = 1536;
const SEP: Record<string, string> = { ko: '.', en: '.', de: ',', ja: '.', 'zh-CN': '.' };
const BIG = (size: string) => `큰 파일(${size})이라 여는 데 시간이 걸리고 메모리를 많이 씁니다. 다른 탭을 닫아 두면 좋습니다.`;
const HANGUL = /[가-힣]/;

// jsdom 환경에서는 import.meta.url이 file: 주소가 아니다 — 저장소 뿌리(vitest가 도는 곳)에서 찾는다
const SRC = join(process.cwd(), 'src/');
const files = (d: string): string[] =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? files(p) : n.endsWith('.ts') ? [p] : [];
  });
const src = (f: string) => readFileSync(join(SRC, f), 'utf8');

let dispose: (() => void) | undefined;
afterEach(() => {
  vi.restoreAllMocks();
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
  document.documentElement.lang = '';
  history.replaceState(null, '', '/');
});

/** 언어 메뉴로 l을 고르고 html lang이 바뀔 때까지(마감 3초) */
async function switchTo(root: HTMLElement, l: string): Promise<void> {
  root.querySelector<HTMLButtonElement>('.language-trigger')!.click();
  document.querySelector<HTMLButtonElement>(`.language-list [data-language="${l}"]`)!.click();
  await vi.waitFor(() => expect(document.documentElement.lang).toBe(l), { timeout: 3000 });
}

type FakeShell = {
  start: HTMLElement;
  fileTabs: HTMLElement;
  buildStart(): void;
  refreshTabs(): void;
  refreshRecent(): Promise<void>;
  showOpenError(name: string, info: ReturnType<typeof openErrorInfo>, size?: number): void;
};

describe('화면 언어 꼴 수가 든 칸 — 떠 있는 채 언어를 바꾸면 새 언어 꼴로 다시 그린다(349차)', () => {
  it('(가) 파일 탭 풀이 글·시작 화면 안내 상자 이름 줄·떠 있는 알림 둘이 ko → de → en → de에서 그 언어 소수점(앞 언어 꼴 0), 최근 문서 목록(대조 — 날짜 꼴도)', async () => {
    history.replaceState(null, '', '/');
    const root = document.createElement('div');
    root.append(Object.assign(document.createElement('header'), { className: 'titlebar' }));
    document.body.append(root);
    dispose = await installLocalization(root);
    expect(document.documentElement.lang).toBe('ko');
    const time = Date.now();
    const doc = { name: '평면도.dwg', saveName: '평면도.dwg', size: KB, session: { dirty: false } };
    const app = { docs: [doc], active: doc, activate() {}, close() {} };
    const recent = { list: async () => [{ id: 'a', name: '평면도.dwg', size: KB, time }], clear: async () => {}, remove: async () => {} };
    // 셸 전체를 만들지 않고 시작 화면·도면 탭 줄만 그린다(stuckfocus289·tabkeys259 꼴 — 리본 단추 상태 맞추기는 빈 함수). 언어 바꿈은 번역층이 root에 보내는 languagechange
    const sh = Object.assign(Object.create(Shell.prototype) as object, {
      app,
      root,
      start: el('div', {}),
      guide: null,
      recent,
      recentList: el('ul', { class: 'recent' }),
      recentClear: el('button', { type: 'button', class: 'recent-clear', hidden: true }, '모두 지우기'),
      recentSeq: 0,
      startError: el('div', { class: 'start-error', hidden: true }),
      fileTabs: el('div', { class: 'filetabs' }),
      refreshRibbonState() {},
    }) as unknown as FakeShell;
    root.append(sh.fileTabs, sh.start);
    sh.buildStart();
    sh.refreshTabs();
    await sh.refreshRecent();
    // 지난번 열기가 끝나지 못한 도면(editor.ts — 시작 화면이면 안내 상자)
    sh.showOpenError('지도.dwg', openErrorInfo('interrupted'), KB);
    // 큰 파일 알림(shell.ts 파일 열기 — 소스 꼴은 (나))과 도면을 보는 중의 열기 중단 알림(App.reportOpenError — 시작 화면이 아니면 알림).
    // 알림이 시험 동안 사라지지 않게 열기 중단 알림의 시간 재기(9초)만 막는다
    toast(() => BIG(formatBytes(KB)), 'warn', 0);
    const timer = vi.spyOn(globalThis, 'setTimeout').mockImplementation((() => 0) as never);
    App.prototype.reportOpenError.call({ cmd: { print() {} }, active: doc, ui: {}, errorNoticed: false } as unknown as App, '지도.dwg', openErrorInfo('interrupted'), KB);
    timer.mockRestore();
    const cells = () => ({
      tab: sh.fileTabs.querySelectorAll('.filetab-open')[1]?.getAttribute('title') ?? '',
      name: sh.start.querySelector('.start-error-name')?.textContent ?? '',
      toasts: [...document.querySelectorAll('.toast-text')].map((t) => t.textContent ?? ''),
      recent: sh.start.querySelector('.recent-open small')?.textContent ?? '',
    });
    for (const l of ['ko', 'de', 'en', 'de']) {
      if (l !== 'ko') await switchTo(root, l);
      const size = `1${SEP[l]}5 KB`;
      const other = `1${l === 'de' ? '.' : ','}5 KB`;
      await vi.waitFor(
        () => {
          const c = cells();
          expect(c.tab, l).toContain(`(${size})`);
          expect(c.name, l).toBe(`지도.dwg (${size})`);
          expect(c.toasts, l).toHaveLength(2);
          for (const t of c.toasts) expect(t, l).toContain(size);
          expect(c.recent, l).toBe(`${size} · ${recentTimeLabel(time, Date.now(), l)}`);
          expect(JSON.stringify(c), l).not.toContain(other);
          // 다시 쓴 알림 글도 번역층이 옮긴다(큰 파일 알림 — 한국어 화면 밖 한글 0)
          expect(HANGUL.test(c.toasts[0]!), `${l}: ${c.toasts[0]}`).toBe(l === 'ko');
        },
        { timeout: 3000 },
      );
    }
  });

  it('(나) 소스 꼴: 셸이 languagechange에서 relang을 부르고, 큰 파일 알림은 글을 만드는 함수로, 열기 중단은 크기를 따로 넘긴다 — 화면 언어 꼴 수·날짜를 넣는 자리가 늘면 실패', () => {
    expect(src('app/ui/shell.ts')).toContain("this.root.addEventListener('languagechange', () => this.relang());");
    expect(src('app/ui/shell.ts')).toContain('toast(() => `큰 파일(${formatBytes(f.size)})이라');
    expect(src('editor.ts')).toContain("app.reportOpenError(m.name, openErrorInfo('interrupted'), m.size);");
    // 화면 언어 꼴 수·날짜 도우미(datetext.ts·dom.ts formatBytes·recent.ts)를 부르는 줄(주석·정의 빼고) — 349차 셈. 새 자리가 생기면 그 칸이 떠 있는 채
    // 언어를 바꿀 수 있는지(대화 상자 뒤 막·명령행 기록 줄이면 둠) 보고, 바꿀 수 있으면 Shell.relang에 다시 그리는 길을 더한 뒤 이 표를 고친다
    const CALL = /\b(?:formatBytes|decimalText|dateTimeText|drawingTimeText|recentTimeLabel)\(/;
    const seen: Record<string, number> = {};
    for (const f of files(SRC))
      for (const s of readFileSync(f, 'utf8').split('\n'))
        if (CALL.test(s) && !/^\s*(?:\*|\/\/|\/\*)/.test(s) && !/export function/.test(s)) seen[f.slice(SRC.length)] = (seen[f.slice(SRC.length)] ?? 0) + 1;
    expect(seen).toEqual({
      // 열기 중단 이름 「이름 (크기)」 — 명령행 기록 줄·알림(알림은 relangToasts)
      'app/app.ts': 1,
      // 도면 비교 정보·DWGPROPS — 대화 상자(열린 동안 언어를 바꿀 수 없음)
      'app/compare.ts': 1,
      'app/dwgprops.ts': 2,
      // 도우미 안(drawingTimeText → dateTimeText·formatBytes → decimalText·recentTimeLabel → dateTimeText)
      'app/datetext.ts': 1,
      'app/ui/dom.ts': 2,
      'app/recent.ts': 1,
      // 명령행 기록 줄(TIME 셋·ETRANSMIT·WMFOUT — 찍은 때 그대로)
      'app/propcmds.ts': 3,
      'app/transmit.ts': 1,
      'app/filecmds-export.ts': 1,
      // 큰 파일 알림(relangToasts)·탭 풀이 글·최근 문서(relang)·열기 안내 상자 이름 줄(relang)·도면 정보(대화 상자)
      'app/ui/shell.ts': 5,
    });
  });
});
