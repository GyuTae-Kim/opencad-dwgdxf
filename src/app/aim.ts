/**
 * 정밀 조준(터치): 한 손가락을 움직이지 않고 AIM_HOLD_MS 동안 누르면 손가락 위 AIM_OFFSET_PX에 십자선을 띄워
 * 손가락에 가리지 않은 채 스냅을 보며 점을 옮기고, 떼면 그 자리를 누른 것으로 친다(view.ts).
 */
import type { Box } from './overlay-place';
import type { Pt } from './view';

/** 이만큼(ms) 움직이지 않고 누르고 있으면 정밀 조준 */
export const AIM_HOLD_MS = 350;
/** 십자선을 손가락 위로 띄우는 거리(화면 픽셀) */
export const AIM_OFFSET_PX = 64;
/** 십자선이 떠 있는 판(덮개)에서 떨어지는 가장 작은 거리(화면 픽셀) — 십자선 가운데와 둘레가 보이게(SketchUp 앱 25차 십자선 비키기와 같은 값) */
export const AIM_COVER_GAP_MIN = 8;

/**
 * 십자선이 덮개에서 떨어질 거리(26차): 조준창(APERTURE 화소) 안에서 잡힌 스냅 점과 그 표식기(반지름 markerRadius, 선 굵기 2)가
 * 덮개 밖에 보이도록 조준창 + 표식기 반지름 + 2. 기본값(조준창 10, 표식기 크기 5 → 반지름 6)에서 18화소
 */
export function aimCoverGap(aperturePx: number, markerRadius: number): number {
  return Math.max(AIM_COVER_GAP_MIN, aperturePx + markerRadius + 2);
}

/**
 * 십자선 자리: 손가락 바로 위(도면 영역 위 가장자리에서 멈춘다).
 * covers(도면 위에 떠 있는 판 — 명령행·휴대폰 보기 모드의 측정 띠·특성 시트, 보기 좌표. 측정 결과 글·툴팁이 비키는 24차 덮개와 같은 것)가 있으면
 * 그 밑에 숨지 않게(26차) 십자선 자리가 덮개에서 gap 안으로 들어가면 가장 가까운 변 바깥 gap으로 민다. 덮개 밑은 보이지 않아 겨눌 수 없으므로
 * 도면 영역 위 가장자리처럼 벽으로 본다(손가락을 더 내려도 십자선은 덮개 변 바깥에 머문다). gap이 조준창 + 표식기 반지름이면(aimCoverGap)
 * 조준창 안에서 잡힌 스냅 점의 표식기도 덮개 밖에 보인다 — 스냅 계산은 그대로 십자선 자리에서 한다.
 * 민 좌표가 보기(view) 가장자리에서 gap 안이면 그 변은 쓰지 않고(화면 끝·좁은 틈으로 밀지 않게), 다른 덮개에 드는 변보다 들지 않는 변을 먼저 쓴다.
 * 덮개마다 한 번(SketchUp 앱 25차 aimPoint와 같은 규칙. 다만 그 앱은 민 자리의 두 좌표를 다 보아 화면 왼쪽·오른쪽 끝 8화소 안의 손가락은
 * 위아래로도 밀지 않는데, 여기서는 gap이 18화소라 민 쪽의 좌표만 본다)
 */
export function aimPoint(p: Pt, covers: readonly Box[] = [], view?: { w: number; h: number }, gap = AIM_COVER_GAP_MIN): Pt {
  const q = { x: p.x, y: Math.max(0, p.y - AIM_OFFSET_PX) };
  if (!covers.length) return q;
  const g = gap;
  const w = view?.w ?? Infinity;
  const h = view?.h ?? Infinity;
  const near = (a: Pt, c: Box, e: number): boolean => a.x > c.x0 - g - e && a.x < c.x1 + g + e && a.y > c.y0 - g - e && a.y < c.y1 + g + e;
  const done = new Set<Box>();
  for (;;) {
    // 덮개(와 gap)에 든 자리 — 경계 위도 든 것으로
    const c = covers.find((r) => !done.has(r) && near(q, r, 1e-9));
    if (!c) break;
    done.add(c);
    let best: { x: number; y: number; d: number; free: boolean } | null = null;
    for (const s of [
      { x: q.x, y: c.y0 - g, v: true },
      { x: q.x, y: c.y1 + g, v: true },
      { x: c.x0 - g, y: q.y, v: false },
      { x: c.x1 + g, y: q.y, v: false },
    ]) {
      // 민 쪽의 좌표만 본다(손가락이 화면 왼쪽 끝이어도 위로는 민다)
      if (s.v ? s.y < g || s.y > h - g : s.x < g || s.x > w - g) continue;
      const d = Math.hypot(s.x - q.x, s.y - q.y);
      const free = !covers.some((r) => r !== c && near(s, r, 0));
      if (!best || (free && !best.free) || (free === best.free && d < best.d)) best = { ...s, d, free };
    }
    if (best) {
      q.x = best.x;
      q.y = best.y;
    }
  }
  return q;
}
