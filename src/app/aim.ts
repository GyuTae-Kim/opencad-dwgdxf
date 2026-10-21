/**
 * 정밀 조준(터치): 한 손가락을 움직이지 않고 AIM_HOLD_MS 동안 누르면 손가락 위 AIM_OFFSET_PX에 십자선을 띄워
 * 손가락에 가리지 않은 채 스냅을 보며 점을 옮기고, 떼면 그 자리를 누른 것으로 친다(view.ts).
 */
import type { Pt } from './view';

/** 이만큼(ms) 움직이지 않고 누르고 있으면 정밀 조준 */
export const AIM_HOLD_MS = 350;
/** 십자선을 손가락 위로 띄우는 거리(화면 픽셀) */
export const AIM_OFFSET_PX = 64;

/** 십자선 자리: 손가락 바로 위(도면 영역 위 가장자리에서 멈춘다) */
export function aimPoint(p: Pt): Pt {
  return { x: p.x, y: Math.max(0, p.y - AIM_OFFSET_PX) };
}
