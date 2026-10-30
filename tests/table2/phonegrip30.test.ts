// @vitest-environment jsdom
/**
 * 30차: 휴대폰에서 작게 보이는 셀의 위·아래 그립을 잡는 띠.
 * 29차까지 고른 범위 안의 그립 띠는 그 변에서 범위 크기의 1/4까지라, 375px에 다섯 열 표를 맞추면(셀 69×8px) 위·아래 그립은 셀 안 2px와
 * 격자선 둘레 2px에서만 잡혔다. 이제 손가락의 위·아래 그립은 범위 가운데 선까지 잡힌다(그립 고르기 거리 안). 이웃 셀 안(그 셀 고르기)과
 * 그립에서 먼 격자선(표 고르기), 마우스·펜, 좌우 그립은 예전 그대로.
 * 이 시험의 화면은 1 도면 단위 = 1px(FakeView), C3은 x 90..130 · y 76..83.5(40×7.5px), 손가락 그립 거리 12px, 고르기 거리 15px.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
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
const RIGHT = 0;
const BOTTOM = 1;
const TOP = 3;

const setup = () => {
  const h = setup28();
  registerModifyCommands(h.app);
  h.app.osnapOn = false;
  return h;
};
const pending = (h: ReturnType<typeof setup>) => (h.app as unknown as { request: { kind: string } | null }).request;

describe('손가락의 위·아래 셀 그립 띠', () => {
  it('고른 셀 안은 가운데 선까지 가까운 위·아래 그립(마우스는 예전처럼 1/4까지), 이웃 셀 안과 그립에서 먼 격자선은 그대로', () => {
    const h = setup();
    h.click({ x: MIDX, y: MIDY });
    const at = (x: number, y: number, touch: boolean) => h.cells.gripAt!({ x, y }, touch ? 12 : 6, touch ? 15 : 5, touch);
    // 위 변에서 안쪽 3(1/4 = 1.875보다 깊고 가운데 선 3.75 안): 손가락은 위 그립, 마우스는 아니다
    expect(at(MIDX, C3.y1 - 3, true)).toBe(TOP);
    expect(at(MIDX, C3.y1 - 3, false)).toBe(-1);
    // 같은 자리를 29차 규칙(touch 없이 거리만 두 배)으로 물으면 그립이 아니었다
    expect(h.cells.gripAt!({ x: MIDX, y: C3.y1 - 3 }, 12, 15)).toBe(-1);
    // 아래 변에서 안쪽 3: 아래 그립, 그립 옆으로 8 비킨 자리도(그립 고르기 거리 12 안)
    expect(at(MIDX, C3.y0 + 3, true)).toBe(BOTTOM);
    expect(at(MIDX + 8, C3.y0 + 3, true)).toBe(BOTTOM);
    // 위 이웃 셀(C2, 7.5px) 안 — 격자선에서 1/4보다 먼 곳: 그 셀 고르기 자리라 그립이 아니다
    expect(at(MIDX, C3.y1 + 3, true)).toBe(-1);
    // 위 격자선 둘레(이웃 셀의 1/4 안): 예전처럼 그립
    expect(at(MIDX, C3.y1 + 1, true)).toBe(TOP);
    // 같은 격자선이라도 그립에서 12보다 먼 곳(B3 위 — C3 왼쪽 그립에서 20)은 그립이 아니다(표 고르기)
    expect(at(C3.x0 - 20, C3.y1 + 0.5, true)).toBe(-1);
    // 오른쪽 그립은 예전처럼 범위 폭의 1/4(10)까지: 오른쪽 변에서 안쪽 8은 오른쪽 그립
    expect(at(C3.x1 - 8, MIDY + 0.5, true)).toBe(RIGHT);
  });

  it('손가락으로 위 그립 띠(셀 안 2)를 톡 → 다른 자리를 톡 하면 그 행 높이만 바뀌고, 이웃 셀을 톡 하면 예전처럼 그 셀', async () => {
    const h = setup();
    const t0 = h.data();
    // 두 번 누르기(0.5초) 판정이 기계 부하에 흔들리지 않게 시간을 멈춘다
    const now = vi.spyOn(performance, 'now').mockReturnValue(1e6);
    h.click({ x: MIDX, y: MIDY }, { pointerType: 'touch' });
    expect(h.cur()).toEqual([2, 2, 2, 2]);
    now.mockReturnValue(1e6 + 2000);
    h.click({ x: MIDX, y: C3.y1 - 2 }, { pointerType: 'touch' });
    await settle();
    expect(pending(h)?.kind).toBe('point');
    expect(h.cmd.prompt).toBe('신축점 지정 또는 [종료(X)]:');
    now.mockReturnValue(1e6 + 4000);
    // 위로 5 옮겨 톡: 3행만 5 높아진다(그립 변은 누른 자리에서 옮긴 만큼)
    h.click({ x: MIDX, y: C3.y1 + 3 }, { pointerType: 'touch' });
    await settle();
    expect(pending(h)).toBeNull();
    expect(h.data().rowHeights[2]).toBeCloseTo(t0.rowHeights[2]! + 5, 9);
    expect(h.data().rowHeights.filter((_, i) => i !== 2)).toEqual(t0.rowHeights.filter((_, i) => i !== 2));
    expect(h.cur()).toEqual([2, 2, 2, 2]);
    h.st.session.undo();
    expect(h.data()).toEqual(t0);
    // 이웃 셀 B3 가운데를 톡: 그 셀
    now.mockReturnValue(1e6 + 6000);
    h.click({ x: MIDX - 40, y: MIDY }, { pointerType: 'touch' });
    expect(h.cur()).toEqual([2, 1, 2, 1]);
    expect(pending(h)).toBeNull();
  });

  it('넓어진 띠에서 두 번 톡: 두 번째 톡은 같은 자리라 바뀌지 않고, 두 번 누르기로 그 셀 편집기가 열린다', async () => {
    const h = setup();
    const t0 = h.data();
    const undo0 = h.st.session.undoTop();
    const now = vi.spyOn(performance, 'now').mockReturnValue(1e6);
    h.click({ x: MIDX, y: MIDY }, { pointerType: 'touch' });
    now.mockReturnValue(1e6 + 2000);
    const p = { x: MIDX, y: C3.y1 - 2 };
    h.click(p, { pointerType: 'touch' });
    await settle();
    expect(pending(h)?.kind).toBe('point');
    now.mockReturnValue(1e6 + 2200);
    h.click(p, { pointerType: 'touch' });
    await settle();
    expect(pending(h)).toBeNull();
    expect(h.data()).toEqual(t0);
    expect(h.st.session.undoTop()).toBe(undo0);
    // 브라우저가 두 번째 톡 뒤에 보내는 dblclick
    h.view.events.dblclick!(p, p);
    await vi.waitFor(() => expect(box()?.getAttribute('aria-label')).toBe('테이블 셀 편집 — C3'), { timeout: 5000 });
  });
});
