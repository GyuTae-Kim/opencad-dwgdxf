/**
 * 327차 「한글 0」 시험 — 한국어(ko) 몫. 332차(CI 13차)가 다섯 언어를 한 파일에서 그리던 것을 언어 파일 다섯(ko·en·ja·zh-CN·de)으로 나눴다.
 * 그리는 길·DOM 흉내·걸음·「아직 둔 것」은 도움 모듈 `tests/i18n-screens327-shared.ts`(머리 주석에 327~330차 내력). 이 파일은 한국어를 한 번만 그린다.
 * 한국어 화면은 같은 훑기가 앱 글의 한글을 찾는지(시험이 눈멀지 않았는지 — 새 걸음마다 새 앱 글이 보여야 그 화면을 그린 것)와 방향 원문을 본다.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { NAMES, NEW_STEPS, screensOnce } from './i18n-screens327-shared';

vi.mock('../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('./polish/fakes')).FakeView }));
// 시작 길은 엔진의 save를 감싼다(refedit.ts installSaveGuard) — 가짜 엔진에 EngineClient의 나머지 메서드도 둔다(부르면 거절·무시)
vi.mock('../src/app/engine', async (orig) => {
  const { FakeEngine } = await import('./polish/fakes');
  class StartEngine extends FakeEngine {
    async open(): Promise<never> {
      throw new Error('open');
    }
    async adopt(): Promise<never> {
      throw new Error('adopt');
    }
    async save(): Promise<never> {
      throw new Error('save');
    }
    images(): void {}
    shx(): void {}
    replace(): void {}
  }
  return { ...(await orig<object>()), EngineClient: StartEngine };
});
vi.mock('../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('./polish/fakes')).FakeFonts }));
// 메뉴(showMenu)는 진짜를 쓴다(328차 — 리본 펼친 메뉴·바로 가기 메뉴·배치 탭 메뉴를 그려 본다). 알림(toast)만 가짜
vi.mock('../src/app/ui/dom', async (orig) => ({ ...(await orig<object>()), toast: vi.fn() }));
vi.mock('../src/app/pwa-app', () => ({ installPwa: vi.fn(), handleLaunchQuery: vi.fn(async () => {}) }));

// 보기 모드 안내(renderNotice)가 기다리지 않고 나눠 받는 모듈을 미리 받아 둔다(공용 규칙 5번 — 시험 파일이 끝난 뒤 모듈을 평가하지 않게)
beforeAll(async () => {
  await Promise.all([import('../src/app/refs'), import('../src/app/shxfonts')]);
});

describe(NAMES.screens, () => {
  it(
    NAMES.zero,
    async () => {
      // 한국어 화면: 같은 훑기가 앱 글의 한글을 찾는다(시험이 눈멀지 않음 — 새 걸음마다 새 앱 글이 보여야 그 화면을 그린 것)
      const ko = await screensOnce('ko');
      expect(ko.steps.length).toBeGreaterThan(20);
      expect(ko.fileTextShown).toBe(true);
      for (const step of NEW_STEPS) expect(ko.steps.some(([s]) => s === step), step).toBe(true);
    },
    240_000,
  );
  it(
    NAMES.orient,
    async () => {
      expect((await screensOnce('ko')).orient).toEqual(['세로 방향', '가로 방향']);
    },
    240_000,
  );
});
