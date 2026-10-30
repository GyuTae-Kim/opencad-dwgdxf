/**
 * 24차: 도면 위 측정 결과 글·커서 툴팁이 보기 가장자리에서 잘리거나 떠 있는 판(명령행·휴대폰 측정 띠)에 가리지 않게.
 * 375px 헤드리스 재현(고치기 전 빌드): 오른쪽 가장자리 점의 거리 글이 66px 잘리고, 위 가장자리 점의 글이 10px 잘리고,
 * 편집 화면 명령행 아래 점의 글이 명령행 밑에 숨었다(1,033px²). 겹치지도 잘리지도 않는 기본 자리는 그대로다.
 */
import { describe, expect, it } from 'vitest';
import { type Box, coverBoxes, placeLabel, placeTip } from '../../src/app/overlay-place';

// 375 × 641 보기, 아래 측정 띠(8..367, 507..633), 명령행(8..367, 525..608)
const W = 375;
const H = 641;
const CARD: Box = { x0: 8, y0: 507, x1: 367, y1: 633 };
const CMD: Box = { x0: 8, y0: 525, x1: 367, y1: 608 };
const TW = 80;
const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
const within = (a: Box) => a.x0 >= 0 && a.y0 >= 0 && a.x1 <= W && a.y1 <= H;

describe('측정 결과 글의 자리(placeLabel)', () => {
  it('겹치지도 잘리지도 않으면 예전 자리(점 오른쪽 위 7, −6)', () => {
    const r = placeLabel({ x: 100, y: 200 }, TW, 10, 3, W, H, [CARD]);
    expect(r).toEqual({ x: 107, y: 194, box: { x0: 107, y0: 184, x1: 187, y1: 197 } });
  });

  it('오른쪽 가장자리: 점 왼쪽 위로(잘리지 않게)', () => {
    const r = placeLabel({ x: 355, y: 288 }, TW, 10, 3, W, H, [CARD]);
    expect(r.x).toBe(355 - 7 - TW);
    expect(r.y).toBe(282);
    expect(within(r.box)).toBe(true);
  });

  it('위 가장자리: 점 오른쪽 아래로, 오른쪽 위 구석은 왼쪽 아래로', () => {
    const top = placeLabel({ x: 187.5, y: 6 }, TW, 10, 3, W, H, []);
    expect(top).toMatchObject({ x: 194.5, y: 22 });
    expect(within(top.box)).toBe(true);
    const corner = placeLabel({ x: 360, y: 5 }, TW, 10, 3, W, H, []);
    expect(corner).toMatchObject({ x: 360 - 7 - TW, y: 21 });
  });

  it('측정 띠 바로 위 점: 아래로 내리면 띠에 걸리니 위 그대로, 띠와 겹치는 기본 자리만 옮긴다', () => {
    // 기본 상자(y 491..504)는 띠(507~)와 겹치지 않는다
    expect(placeLabel({ x: 200, y: 510 - 9 }, TW, 10, 3, W, H, [CARD]).y).toBe(495);
    // 점이 띠 위 끝에 붙어 기본 상자가 띠에 걸리면(y 498..511) 왼쪽 위도 같은 높이라 걸리고, 아래 둘도 띠 안 — 띠 위로 올린다
    const r = placeLabel({ x: 200, y: 514 }, TW, 10, 3, W, H, [CARD]);
    expect(overlap(r.box, CARD)).toBe(0);
    expect(r.box.y1).toBeLessThanOrEqual(CARD.y0);
    expect(r.x).toBe(207);
  });

  it('명령행 밑의 점: 명령행 위로 올리고 가로는 보기 안', () => {
    const r = placeLabel({ x: 187.5, y: 566.5 }, TW, 10, 3, W, H - 25, [CMD]);
    expect(overlap(r.box, CMD)).toBe(0);
    expect(r.y).toBeCloseTo(CMD.y0 - 3 - 2, 9);
    expect(r.x).toBe(194.5);
    // 오른쪽 끝 + 명령행 밑: 가로도 보기 안으로 당긴다
    const e = placeLabel({ x: 370, y: 566.5 }, TW, 10, 3, W, H - 25, [CMD]);
    expect(overlap(e.box, CMD)).toBe(0);
    expect(e.box.x1).toBeLessThanOrEqual(W);
  });

  it('보이지 않는 점(보기 밖)의 글은 가장자리에 붙여 두지 않는다(예전 자리)', () => {
    expect(placeLabel({ x: 420, y: 100 }, TW, 10, 3, W, H, [])).toMatchObject({ x: 427, y: 94 });
    expect(placeLabel({ x: 100, y: -30 }, TW, 10, 3, W, H, [])).toMatchObject({ x: 107, y: -36 });
  });
});

describe('커서 툴팁의 자리(placeTip)', () => {
  it('덮개와 겹치지 않으면 예전 식 그대로(오른쪽 아래, 오른쪽·아래 끝에서 안으로)', () => {
    expect(placeTip({ x: 100, y: 100 }, 90, 20, false, W, H, [CMD], 2)).toMatchObject({ x: 118, y: 122 });
    expect(placeTip({ x: 360, y: 100 }, 90, 20, false, W, H, [], 2)).toMatchObject({ x: W - 90 - 2, y: 122 });
    expect(placeTip({ x: 100, y: 630 }, 90, 20, false, W, H, [], 2)).toMatchObject({ y: H - 20 - 4 });
    // 정밀 조준: 커서 위
    expect(placeTip({ x: 100, y: 300 }, 90, 20, true, W, H, [CARD], 2)).toMatchObject({ x: 118, y: 254 });
  });

  it('명령행에 걸리면 커서 위로 뒤집는다', () => {
    const r = placeTip({ x: 100, y: 515 }, 90, 20, false, W, H, [CMD], 2);
    expect(r).toMatchObject({ x: 118, y: 515 - 26 - 20 });
    expect(overlap(r.box, CMD)).toBe(0);
  });

  it('정밀 조준인데 위가 막혔으면 아래, 둘 다 막혔으면 왼쪽, 빈자리가 없으면 예전 자리', () => {
    const topBar: Box = { x0: 0, y0: 0, x1: W, y1: 60 };
    const r = placeTip({ x: 100, y: 70 }, 90, 20, true, W, H, [topBar], 2);
    expect(r.y).toBe(92);
    // 오른쪽 위·오른쪽 아래가 막히면 왼쪽
    const right: Box = { x0: 290, y0: 0, x1: W, y1: H };
    const l = placeTip({ x: 300, y: 300 }, 90, 20, false, W, H, [right], 2);
    expect(l).toMatchObject({ x: 300 - 18 - 90, y: 322 });
    const all: Box = { x0: 0, y0: 0, x1: W, y1: H };
    expect(placeTip({ x: 100, y: 100 }, 90, 20, false, W, H, [all], 2)).toMatchObject({ x: 118, y: 122 });
  });
});

describe('떠 있는 판의 상자(coverBoxes)', () => {
  const el = (r: { left: number; top: number; width: number; height: number } | null, extra: Record<string, unknown> = {}) =>
    ({
      isConnected: true,
      hidden: false,
      getClientRects: () => (r ? [r] : []),
      getBoundingClientRect: () => (r ? { ...r, right: r.left + r.width, bottom: r.top + r.height } : { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }),
      ...extra,
    }) as unknown as Element;
  const view = el({ left: 0, top: 135, width: 375, height: 641 });

  it('보기 기준 좌표로, 숨었거나(hidden·표시 없음·연결 끊김) 보기와 겹치지 않는 판은 뺀다', () => {
    const card = el({ left: 8, top: 642, width: 359, height: 126 });
    const hidden = el({ left: 8, top: 642, width: 359, height: 126 }, { hidden: true });
    const none = el(null);
    const gone = el({ left: 8, top: 642, width: 359, height: 126 }, { isConnected: false });
    const side = el({ left: 380, top: 135, width: 300, height: 641 });
    expect(coverBoxes(view, [card, hidden, none, gone, side, null, undefined])).toEqual([{ x0: 8, y0: 507, x1: 367, y1: 633 }]);
  });
});
