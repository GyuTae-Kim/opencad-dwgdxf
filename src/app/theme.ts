/**
 * 화면 테마: COLORTHEME(0 어둡게, 1 밝게). 리본·팔레트·명령행 같은 화면 틀만 바꾸고 도면 영역은 그대로 둔다.
 * 이 브라우저에 보관한다.
 */
import type { App } from './app';

const PREF = 'opencad.colortheme';
/** 브라우저 주소 막대·홈 화면 앱 창 위 색(어두운 테마는 앱 정보 theme_color와 같다) */
export const THEME_COLORS = { dark: '#252a33', light: '#e2e5ea' } as const;
/** 테마가 바뀌면 window에 보내는 사건(제목 막대 단추가 그림을 바꾼다) */
export const THEME_EVENT = 'opencad:colortheme';

/** 문서에 테마를 입힌다(0 어둡게, 1 밝게): data-theme와 theme-color */
export function applyColorTheme(v: number): void {
  if (typeof document === 'undefined') return;
  if (v === 1) document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', v === 1 ? THEME_COLORS.light : THEME_COLORS.dark);
  if (typeof window !== 'undefined' && typeof CustomEvent === 'function') window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: v }));
}
const apply = applyColorTheme;

/** 테마를 바꾸고 이 브라우저에 기억한다(저장소를 못 쓰면 이번 세션만) */
export function setColorTheme(v: number): void {
  try {
    localStorage.setItem(PREF, String(v));
  } catch {
    /* 이번 세션만 */
  }
  apply(v);
}

export function colorTheme(): number {
  try {
    return localStorage.getItem(PREF) === '1' ? 1 : 0;
  } catch {
    return 0;
  }
}

export function registerThemeCommands(app: App): void {
  apply(colorTheme());
  app.register({
    name: 'COLORTHEME',
    title: '화면 테마',
    noDoc: true,
    transparent: true,
    async run(ctx) {
      const cur = colorTheme();
      const r = await ctx.getPoint(`COLORTHEME에 대한 새 값 입력 <${cur}>:`, { preferNumber: true, allowText: true });
      if (!('text' in r)) return;
      const v = Number(r.text);
      if (v !== 0 && v !== 1) {
        ctx.print('0(어둡게) 또는 1(밝게)을 입력하십시오.', 'err');
        return;
      }
      setColorTheme(v);
      app.view.requestOverlay();
    },
  });
}
