/**
 * 오른쪽 버튼 끌기 판정(화면 좌표 — 픽셀). 화면(view.ts)이 포인터 이벤트로 몰고, 끌어 놓으면 앱이 메뉴를 띄운다(dragmove.ts dropMenuItems).
 * AutoCAD 도움말 "About Copying Objects": "If you drag with the right mouse button instead of the left, a shortcut menu is displayed
 * after you drag the objects." 화면·DOM을 가져오지 않는다(시험이 가볍게 쓴다).
 */

interface Pt {
  x: number;
  y: number;
}

/** 오른쪽 버튼을 누른 채 이만큼(화면 픽셀) 넘게 움직이면 끌기(왼쪽 끌기와 같다) */
export const RIGHT_DRAG_PX = 5;
/** 끌어 놓은 뒤 이 시간(밀리초) 안에 오는 contextmenu는 그 놓기의 것(Windows는 버튼을 뗀 뒤에 보낸다) */
export const DROP_CONTEXT_MS = 600;

/**
 * 브라우저는 contextmenu를 버튼을 누를 때(macOS·Linux) 또는 뗄 때(Windows) 보낸다: 끌 수 있는 곳에서 누른 동안 온 것은 떼 볼 때까지
 * 미루고(끌었으면 버리고, 아니면 그때 보낸다), 끌어 놓은 바로 뒤에 온 것은 버린다. 그래서 끌지 않은 오른쪽 클릭은 이전과 같은 메뉴·Enter다
 */
export class RightDragGesture {
  private s: { start: Pt; dragging: boolean; ctx: (() => void) | null; gotCtx: boolean } | null = null;
  private dropAt = -Infinity;

  /** 누른 채 끌 수 있는 상태인지 */
  get active(): boolean {
    return !!this.s;
  }

  /** 끌 수 있는 곳(고른 객체 위)에서 오른쪽 버튼을 눌렀다 */
  down(p: Pt): void {
    this.s = { start: { x: p.x, y: p.y }, dragging: false, ctx: null, gotCtx: false };
  }

  /** 움직였다: 끌기 중이면 누른 자리, 아니면 null */
  move(p: Pt): Pt | null {
    const s = this.s;
    if (!s) return null;
    if (!s.dragging && Math.hypot(p.x - s.start.x, p.y - s.start.y) > RIGHT_DRAG_PX) s.dragging = true;
    return s.dragging ? s.start : null;
  }

  /**
   * contextmenu가 왔다(t: 밀리초): 'swallow'(끌기 중이거나 막 끌어 놓았다 — 버린다), 'defer'(누른 채 왔다 — 떼면 끌지 않았을 때만
   * send를 부른다), 'pass'(평소처럼)
   */
  context(t: number, send: () => void): 'swallow' | 'defer' | 'pass' {
    const s = this.s;
    if (s) {
      s.gotCtx = true;
      if (s.dragging) return 'swallow';
      s.ctx = send;
      return 'defer';
    }
    if (t - this.dropAt <= DROP_CONTEXT_MS) {
      this.dropAt = -Infinity;
      return 'swallow';
    }
    return 'pass';
  }

  /** 오른쪽 버튼을 뗐다(t: 밀리초): 끌었으면 놓기(누른 자리), 아니면 클릭(미뤄 둔 contextmenu를 보낸다). 누르지 않았으면 null */
  up(t: number): { drop: Pt } | { click: true } | null {
    const s = this.s;
    if (!s) return null;
    this.s = null;
    if (s.dragging) {
      // 누르는 동안 contextmenu가 오지 않았으면(Windows) 곧 올 것을 버린다
      if (!s.gotCtx) this.dropAt = t;
      return { drop: s.start };
    }
    s.ctx?.();
    return { click: true };
  }

  /** 포인터가 취소됐거나 새로 눌렀다: 끌기와 미뤄 둔 contextmenu를 버린다 */
  cancel(): void {
    this.s = null;
  }
}
