/**
 * 327차 「한글 0」 시험 — 영어(en) 몫. 332차(CI 13차)가 다섯 언어를 한 파일에서 그리던 것을 언어 파일 다섯(ko·en·ja·zh-CN·de)으로 나눴다.
 * 그리는 길·DOM 흉내·걸음·「아직 둔 것」은 도움 모듈 `tests/i18n-screens327-shared.ts`(머리 주석에 327~330차 내력). 이 파일은 영어를 한 번만 그린다.
 * 언어 하나만 쓰는 첫 언어 알림 차례 시험(en DOM)도 이 파일에 둔다.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { installLocalization } from '../src/app/i18n';
import { translate } from '../site/i18n.mjs';
import { HANGUL, NAMES, pendingFor, screensOnce, stubDom } from './i18n-screens327-shared';
import { settle } from './polish/real-app';

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

const LANG = 'en';

describe(NAMES.order, () => {
  it(NAMES.orderIt, async () => {
    for (const s of ['도면 공간', '특성', '도면층']) expect(translate(s, 'en')).not.toBe(s);
    const dom = stubDom('en');
    const root = document.getElementById('app')!;
    root.innerHTML = '<header class="titlebar"></header><div class="statusbar"><span class="status-text">모형</span></div>';
    // 상태 막대 글을 새 언어로 다시 쓰고 줄을 하나 더하는 받는 쪽(알림 안에서 동기로)
    root.addEventListener('languagechange', () => {
      root.querySelector('.status-text')!.textContent = '도면 공간';
      const late = document.createElement('span');
      late.className = 'late';
      late.title = '도면층';
      late.textContent = '특성';
      root.append(late);
    });
    const dispose = await installLocalization(root);
    await settle();
    try {
      expect(root.querySelector('.status-text')!.textContent).toBe(translate('도면 공간', 'en'));
      expect(root.querySelector('.late')!.textContent).toBe(translate('특성', 'en'));
      expect(root.querySelector('.late')!.getAttribute('title')).toBe(translate('도면층', 'en'));
    } finally {
      dispose();
      vi.unstubAllGlobals();
      dom.window.close();
    }
  });
});

describe(NAMES.screens, () => {
  it(
    NAMES.zero,
    async () => {
      const r = await screensOnce(LANG);
      // 도면 글(도면층 이름)·파일 이름은 번역층 밖이라 그대로 보인다
      expect(r.fileTextShown, LANG).toBe(true);
      // 남은 한글 = 이 언어의 「아직 둔 것」(언어 파일마다 제 몫 — PENDING의 차례는 네 언어를 모은 차례라 차례 없이 견준다)
      const pending = pendingFor(LANG);
      expect(r.steps.map(([step, k]) => `${step} · ${k} (${LANG})`).sort()).toEqual([...pending].sort());
      for (const p of pending) expect(p).toMatch(HANGUL);
    },
    240_000,
  );
  it(
    NAMES.orient,
    async () => {
      const r = await screensOnce(LANG);
      // 같은 사전의 용지 방향 낱말: -PLOT 옵션 「세로(P)」·「가로(L)」의 번역에서 옵션 글자를 뗀 것(Portrait·縦·纵向·Hochformat 꼴)
      expect(r.orient, LANG).toEqual(['세로(P)', '가로(L)'].map((k) => translate(k, LANG).replace(/\s*\([A-Z]\)$/, '')));
    },
    240_000,
  );
});
