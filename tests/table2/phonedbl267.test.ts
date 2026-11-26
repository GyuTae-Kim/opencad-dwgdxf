// @vitest-environment jsdom
/**
 * 267차: 휴대폰 두 번 톡(README 표 셀 — 「셀 안을 두 번 누르거나(휴대폰은 두 번 톡) … 문자 편집기」)의 두 번째 톡이 그립을 잡던 것.
 * 첫 톡이 셀을 고르면 손가락의 위·아래 그립 띠가 셀 안 가운데 선까지 덮는다(30차). 두 번 누르기 판정(isDoubleClickFollowUp)은 Windows 마우스 값
 * 4px라, 손가락의 두 번째 톡이 첫 톡에서 4px 넘게 떨어지면 그립 편집이 시작되고 뒤따르는 dblclick은 명령 중이라 편집기를 열지 않았다.
 * 이 앱은 손가락 톡을 PICKBOX × 3 안이면 같은 객체로 치므로(onClick·subGripAt), 손가락의 두 톡도 그 거리 안이면 같은 자리다.
 * 마우스·펜(4px), 0.5초 규칙, 그 거리 밖의 톡은 예전 그대로.
 * 이 시험의 화면은 1 도면 단위 = 1px(FakeView), PICKBOX 5(손가락 고르기 15px), 손가락 그립 거리 12px(마우스 6px). C3은 x 90..130 · y 76..83.5.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isDoubleClickFollowUp } from '../../src/app/app';
import { registerModifyCommands } from '../../src/app/modify';
import { activeEditor } from '../../src/app/textedit/editor';
import { settle } from '../polish/real-app';
import { X0, Y0, box, setup as setup28 } from './fixture28';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../polish/fakes')).FakeCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));

afterEach(() => {
  activeEditor()?.cancel();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

const C3 = { x0: X0 + 80, x1: X0 + 120, y0: Y0 - 24, y1: Y0 - 16.5 };
const MIDX = (C3.x0 + C3.x1) / 2;
const MIDY = (C3.y0 + C3.y1) / 2;
// grips() 차례: 오른쪽 0, 아래 1, 왼쪽 2, 위 3
const TOP = 3;

const setup = () => {
  const h = setup28();
  registerModifyCommands(h.app);
  h.app.osnapOn = false;
  return h;
};
const pending = (h: ReturnType<typeof setup>) => (h.app as unknown as { request: { kind: string } | null }).request;
const touch = { pointerType: 'touch' } as const;

describe('손가락 두 번 톡의 두 번째 톡(267차)', () => {
  it('고르지 않은 셀을 두 번 톡(두 톡 사이 6px): 두 번째 톡이 위 그립 띠여도 그립을 잡지 않고, dblclick이 그 셀 편집기를 연다', async () => {
    const h = setup();
    const t0 = h.data();
    const undo0 = h.st.session.undoTop();
    const now = vi.spyOn(performance, 'now').mockReturnValue(1e6);
    h.click({ x: MIDX, y: MIDY }, touch);
    expect(h.cur()).toEqual([2, 2, 2, 2]);
    // 두 번째 톡 자리: 손가락 위 그립 띠(그립에서 hypot(6, 2) = 6.3), 첫 톡에서 hypot(6, 1.75) = 6.25px
    const p2 = { x: MIDX + 6, y: C3.y1 - 2 };
    expect(h.cells.gripAt!(p2, 12, 15, true)).toBe(TOP);
    now.mockReturnValue(1e6 + 200);
    h.click(p2, touch);
    await settle();
    // 전에는 그립 편집(「신축점 지정」)이 시작됐다
    expect(pending(h)).toBeNull();
    expect(h.data()).toEqual(t0);
    expect(h.st.session.undoTop()).toBe(undo0);
    // 브라우저가 두 번째 톡 뒤에 보내는 dblclick
    h.view.events.dblclick!(p2, p2);
    await vi.waitFor(() => expect(box()?.getAttribute('aria-label')).toBe('테이블 셀 편집 — C3'), { timeout: 5000 });
  });

  it('손가락으로 고른 선을 곧바로 다시 톡(5.8px): 두 번째 톡이 가운데 그립에 닿아도 그립 편집을 시작하지 않는다', async () => {
    const h = setup();
    const ln = h.line({ x: 200, y: 50 }, { x: 260, y: 50 });
    const now = vi.spyOn(performance, 'now').mockReturnValue(1e6);
    h.click({ x: 226, y: 50 }, touch);
    expect([...h.st.selection]).toEqual([ln]);
    now.mockReturnValue(1e6 + 200);
    // 가운데 그립 (230, 50)에서 3.2px(손가락 그립 12 안), 첫 톡에서 hypot(5, 3) = 5.83px
    h.click({ x: 231, y: 53 }, touch);
    await settle();
    expect(h.view.overlay.hotGrip).toBeNull();
    expect(pending(h)).toBeNull();
    expect([...h.st.selection]).toEqual([ln]);
  });
});

describe('그대로인 갈래', () => {
  it('마우스는 4px: 같은 두 자리를 누르면 두 번째 누르기가 그립 편집(선 가운데 그립·셀 위 그립)', async () => {
    const h = setup();
    h.line({ x: 200, y: 50 }, { x: 260, y: 50 });
    const now = vi.spyOn(performance, 'now').mockReturnValue(1e6);
    h.click({ x: 226, y: 50 });
    now.mockReturnValue(1e6 + 200);
    h.click({ x: 231, y: 53 });
    await settle();
    expect(h.view.overlay.hotGrip).toEqual({ x: 230, y: 50 });
    expect(pending(h)?.kind).toBe('point');
    h.app.cancel(true);
    await settle();

    const g = setup();
    const now2 = vi.spyOn(performance, 'now').mockReturnValue(2e6);
    g.click({ x: MIDX, y: MIDY });
    expect(g.cur()).toEqual([2, 2, 2, 2]);
    // 마우스 위 그립(안쪽 1 < 1/4 = 1.875, 그립에서 5.1 ≤ 6), 첫 클릭에서 hypot(5, 2.75) = 5.7px
    const q = { x: MIDX + 5, y: C3.y1 - 1 };
    expect(g.cells.gripAt!(q, 6, 5, false)).toBe(TOP);
    now2.mockReturnValue(2e6 + 200);
    g.click(q);
    await settle();
    expect(pending(g)?.kind).toBe('point');
    expect(g.cmd.prompt).toBe('신축점 지정 또는 [종료(X)]:');
    g.app.cancel(true);
    await settle();
  });

  it('손가락도 0.5초가 지났거나 첫 톡에서 손가락 고르기 거리(15px)보다 멀면 그립 편집', async () => {
    const h = setup();
    h.line({ x: 200, y: 50 }, { x: 260, y: 50 });
    const now = vi.spyOn(performance, 'now').mockReturnValue(1e6);
    h.click({ x: 226, y: 50 }, touch);
    now.mockReturnValue(1e6 + 600);
    h.click({ x: 231, y: 53 }, touch);
    await settle();
    expect(h.view.overlay.hotGrip).toEqual({ x: 230, y: 50 });
    h.app.cancel(true);
    await settle();

    const g = setup();
    g.line({ x: 200, y: 50 }, { x: 260, y: 50 });
    const now2 = vi.spyOn(performance, 'now').mockReturnValue(2e6);
    g.click({ x: 210, y: 50 }, touch);
    now2.mockReturnValue(2e6 + 200);
    // 첫 톡에서 hypot(20, 1) = 20.02px
    g.click({ x: 230, y: 51 }, touch);
    await settle();
    expect(g.view.overlay.hotGrip).toEqual({ x: 230, y: 50 });
    g.app.cancel(true);
    await settle();
  });

  it('그립을 누른 뒤의 톡은 앞 고르기 톡과 짝짓지 않는다(두 번 누르기는 바로 이은 두 누르기 — 그립 편집을 취소한 뒤 0.5초 안이어도)', async () => {
    const h = setup();
    const now = vi.spyOn(performance, 'now').mockReturnValue(1e6);
    h.click({ x: MIDX, y: MIDY }, touch);
    expect(h.cur()).toEqual([2, 2, 2, 2]);
    // 표 밖 오른쪽 그립 옆(첫 톡에서 30px): 그립 편집
    now.mockReturnValue(1e6 + 100);
    h.click({ x: C3.x1 + 10, y: MIDY }, touch);
    await settle();
    expect(pending(h)?.kind).toBe('point');
    h.app.cancel();
    await settle();
    // 범위 안 오른쪽 그립(첫 톡에서 15px — 손가락 거리 안이지만 바로 앞 누르기는 그립): 그립 편집
    now.mockReturnValue(1e6 + 200);
    h.click({ x: C3.x1 - 5, y: MIDY }, touch);
    await settle();
    expect(pending(h)?.kind).toBe('point');
    h.app.cancel(true);
    await settle();
  });

  it('isDoubleClickFollowUp: 거리를 주지 않으면 4px 그대로, 거리를 주면 그 거리까지', () => {
    const prev = { time: 1000, screen: { x: 100, y: 100 } };
    expect(isDoubleClickFollowUp(prev, 1200, { x: 104, y: 100 })).toBe(true);
    expect(isDoubleClickFollowUp(prev, 1200, { x: 110, y: 100 })).toBe(false);
    expect(isDoubleClickFollowUp(prev, 1200, { x: 110, y: 100 }, 15)).toBe(true);
    expect(isDoubleClickFollowUp(prev, 1200, { x: 116, y: 100 }, 15)).toBe(false);
    expect(isDoubleClickFollowUp(prev, 1501, { x: 100, y: 100 }, 15)).toBe(false);
  });
});
