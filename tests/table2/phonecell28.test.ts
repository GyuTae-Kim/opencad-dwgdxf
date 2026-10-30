// @vitest-environment jsdom
/**
 * 28차: 휴대폰(폭 480px 이하) 표 셀 편집기. 27차까지는 셀 글자가 편집기 최소 글자(12px)보다 작게 보이면 편집 상자만 그만큼 커져 옆 셀을 덮었고,
 * 편집기 도구 모음이 편집 상자 위(바로 위 행)에 떴다. 이제 그 크기까지 보기를 확대해 상자 = 셀 문자 폭, 도구 모음은 도면 영역 위 끝,
 * 편집 셀·위 행·양옆 셀이 그 아래 보이게 옮기고, 끝나면 예전 보기로 돌아간다(편집 중 사용자가 보기를 바꿨으면 그대로). 넓은 화면은 그대로.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { editTableAt } from '../../src/app/tablecmds';
import { activeEditor } from '../../src/app/textedit/editor';
import { cellRect } from '../../src/edit/table/model';
import { settle } from '../polish/real-app';
import { X0, Y0, box, key, setup } from './fixture28';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../polish/fakes')).FakeCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));

const W0 = window.innerWidth;
afterEach(() => {
  activeEditor()?.cancel();
  document.body.replaceChildren();
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: W0 });
});

/** 휴대폰 폭과 상태가 있는 카메라(375×600 보기, 축척 1에서 시작) */
function phone(h: ReturnType<typeof setup>) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
  const v = h.view as unknown as Record<string, unknown>;
  let cam = { cx: 60, cy: 80, scale: 1 };
  const W = 375;
  const H = 600;
  const sets: unknown[] = [];
  v.camera = () => cam;
  v.worldToScreen = (x: number, y: number) => ({ x: (x - cam.cx) * cam.scale + W / 2, y: -(y - cam.cy) * cam.scale + H / 2 });
  v.screenToWorld = (x: number, y: number) => ({ x: cam.cx + (x - W / 2) / cam.scale, y: cam.cy - (y - H / 2) / cam.scale });
  v.setViewCamera = (c: typeof cam) => {
    sets.push(c);
    cam = { ...c };
    return true;
  };
  v.el = { title: '', addEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: W, height: H, right: W, bottom: H }) };
  return { cam: () => cam, setCam: (c: typeof cam) => (cam = c), sets, W, H };
}

describe('휴대폰 셀 편집기(폭 480px 이하)', () => {
  it('셀 글자가 최소 글자(12px)보다 작게 보이면 그 크기까지 확대해 편집 상자 = 셀 문자 폭, 셀·위 행·양옆 셀은 위에 붙은 도구 모음 아래, 끝나면 예전 보기', async () => {
    const h = setup();
    const p = phone(h);
    void editTableAt(h.app, h.handle, h.center(2, 1));
    await settle();
    expect(box()?.getAttribute('aria-label')).toBe('테이블 셀 편집 — B3');
    const need = (12 * 0.7) / 4.5;
    expect(p.cam().scale).toBeCloseTo(need, 12);
    expect(parseFloat(box()!.style.fontSize)).toBeCloseTo(12, 6);
    // 상자 폭 = 셀 문자 폭(셀 폭 40 - 여백 2)의 화면 크기, 좌우 안쪽 여백 없음 → 옆 셀까지 넓어지지 않는다
    expect(parseFloat(box()!.style.width)).toBeCloseTo(38 * need, 6);
    expect([box()!.style.paddingLeft, box()!.style.paddingRight]).toEqual(['0px', '0px']);
    expect((document.querySelector('.te-bar') as HTMLElement).style.top).toBe('4px');
    // B3, 그 위 B2, 양옆 A3·C3이 화면 안(도구 모음 아래 — 시험 환경의 도구 모음 상자는 0)
    for (const [r, c] of [
      [2, 1],
      [1, 1],
      [2, 0],
      [2, 2],
    ] as const) {
      const q = cellRect(h.data(), r, c, h.ts.flow);
      const a = h.view.worldToScreen(X0 + q.x0, Y0 + q.y1);
      const b = h.view.worldToScreen(X0 + q.x1, Y0 + q.y0);
      expect(a.x).toBeGreaterThanOrEqual(8 - 1e-9);
      expect(b.x).toBeLessThanOrEqual(p.W - 8 + 1e-9);
      expect(a.y).toBeGreaterThanOrEqual(8 - 1e-9);
      expect(b.y).toBeLessThanOrEqual(p.H - 8 + 1e-9);
    }
    // Tab으로 같은 축척의 옆 셀: 이미 화면 안이면 옮기지 않는다
    const n = p.sets.length;
    key('Tab');
    await settle();
    expect(box()?.getAttribute('aria-label')).toBe('테이블 셀 편집 — C3');
    expect(p.sets.length).toBe(n);
    key('Escape');
    await settle();
    expect(p.cam()).toEqual({ cx: 60, cy: 80, scale: 1 });
  });

  it('편집 중에 사용자가 보기를 바꿨으면 되돌리지 않고, 이미 크게 보이면 확대하지 않는다', async () => {
    const h = setup();
    const p = phone(h);
    void editTableAt(h.app, h.handle, h.center(2, 0));
    await settle();
    const moved = { ...p.cam(), cx: p.cam().cx + 3 };
    p.setCam(moved);
    key('Escape');
    await settle();
    expect(p.cam()).toEqual(moved);
    // A3·A2와 옆 B3이 위쪽(도구 모음 아래 절반)에 크게 보이는 보기
    p.setCam({ cx: X0 + 40, cy: 30, scale: 3 });
    const n = p.sets.length;
    void editTableAt(h.app, h.handle, h.center(2, 0));
    await settle();
    expect(p.sets.length).toBe(n);
    expect(p.cam().scale).toBe(3);
    key('Escape');
    await settle();
  });

  it('넓은 화면은 예전처럼 보기를 바꾸지 않고 도구 모음도 편집 상자 곁', async () => {
    const h = setup();
    const v = h.view as unknown as Record<string, unknown>;
    const spy = vi.fn(() => true);
    v.setViewCamera = spy;
    void editTableAt(h.app, h.handle, h.center(2, 1));
    await settle();
    expect(box()?.getAttribute('aria-label')).toBe('테이블 셀 편집 — B3');
    expect(spy).not.toHaveBeenCalled();
    expect((document.querySelector('.te-bar') as HTMLElement).style.top).not.toBe('4px');
    expect(box()!.style.paddingLeft).toBe('');
    key('Escape');
    await settle();
  });
});
