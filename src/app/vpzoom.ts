/**
 * 배치 뷰포트 안 모형 공간(MSPACE)의 줌 셈(순수 함수 — view.ts의 카메라와 ZOOM 명령이 쓴다).
 * 근거(AutoCAD 도움말, 우리말 요약):
 * - ZOOM: 현재 뷰포트의 뷰 배율을 바꾼다. 윈도우는 고른 영역이 창을 채우고, 범위는 모든 객체의 범위를, 객체는 고른 객체를 뷰 가운데에
 *   가장 크게 보인다. 중심은 중심점과 배율 또는 높이(높이가 작을수록 크게)로 정한 뷰, 이전은 앞 뷰(10개까지)다.
 *   축척은 nX가 현재 뷰에 대해, nXP가 도면 공간 단위에 대해(.5XP면 모형 공간을 도면 공간 단위의 절반 축척으로) 바꾼다.
 *   접미사 없는 n은 도면 한계에 대해(2면 도면 한계로 줌했을 때 크기의 두 배 — 23차 limitsScale·limitsView).
 * - "About Scaling Views in Layout Viewports": 뷰포트 축척은 도면 공간 단위 ÷ 모형 공간 단위이고, 뷰포트 안 모형 공간에서
 *   ZOOM의 XP로 바꿀 수 있다. 뷰포트 테두리 크기를 바꿔도 뷰 축척은 그대로다.
 * - "To Lock the Scale of a Layout Viewport": 화면표시가 잠긴 뷰포트에서도 줌은 되지만 배치 전체에 걸리고 뷰포트 축척은 그대로다.
 * 이 앱은 비틀린 뷰포트로 들어가지 못하므로(enterViewport) 뷰 중심(DCS)은 뷰 대상에서 비틀림 없이 더한 값이다.
 */
import type { Camera } from './docstate';

/** 뷰포트의 종이 위치·크기와 지금 뷰(비틀림 없는 뷰포트) */
export interface VpFrame {
  center: { x: number; y: number };
  width: number;
  height: number;
  viewTarget: { x: number; y: number };
  viewCenter: { x: number; y: number };
  viewHeight: number;
}

/** 뷰포트의 뷰: 뷰포트 가운데에 오는 모형 점과 뷰 높이(모형 단위). 축척(종이/모형)은 뷰포트 높이 ÷ 뷰 높이 */
export interface VpView {
  refX: number;
  refY: number;
  viewHeight: number;
}

/** 뷰포트 객체에 쓰는 뷰 값(뷰 중심은 DCS — 뷰 대상 기준) */
export interface VpViewPatch {
  viewHeight: number;
  viewCenter: { x: number; y: number };
}

/** ZOOM 이전(P)이 되돌릴 수 있는 뷰포트 뷰 개수(도움말 ZOOM: 10개까지) */
export const VP_PREVIOUS_MAX = 10;

/** 지금 뷰 */
export function viewOf(vp: VpFrame): VpView {
  return { refX: vp.viewTarget.x + vp.viewCenter.x, refY: vp.viewTarget.y + vp.viewCenter.y, viewHeight: vp.viewHeight };
}

/** 뷰 → 뷰포트 객체 값 */
export function patchOf(vp: VpFrame, v: VpView): VpViewPatch {
  return { viewHeight: v.viewHeight, viewCenter: { x: v.refX - vp.viewTarget.x, y: v.refY - vp.viewTarget.y } };
}

/** 뷰가 쓸 만한지(뷰 높이 양수, 값이 모두 유한) */
export function validView(v: VpView): boolean {
  return v.viewHeight > 0 && Number.isFinite(v.viewHeight) && Number.isFinite(v.refX) && Number.isFinite(v.refY);
}

/** 모형 → 화면 카메라(모형 → 종이는 뷰포트 변환, 종이 → 화면은 종이 카메라) */
export function msCamera(vp: VpFrame, v: VpView, paper: Camera): Camera {
  const k = vp.height / v.viewHeight;
  return { cx: v.refX + (paper.cx - vp.center.x) / k, cy: v.refY + (paper.cy - vp.center.y) / k, scale: paper.scale * k };
}

/** MSPACE 카메라(휠·끌기로 바뀐 것) → 뷰포트 뷰(종이 카메라는 그대로) */
export function viewOfCamera(vp: VpFrame, c: Camera, paper: Camera): VpView {
  const k = c.scale / paper.scale;
  return { refX: c.cx - (paper.cx - vp.center.x) / k, refY: c.cy - (paper.cy - vp.center.y) / k, viewHeight: vp.height / k };
}

/** 화면표시가 잠긴 뷰포트: MSPACE 카메라 → 종이 카메라(뷰포트의 뷰는 그대로 두고 배치 전체를 확대·이동한다) */
export function lockedPaperCamera(vp: VpFrame, c: Camera): Camera {
  const v = viewOf(vp);
  const k = vp.height / v.viewHeight;
  return { cx: vp.center.x + (c.cx - v.refX) * k, cy: vp.center.y + (c.cy - v.refY) * k, scale: c.scale / k };
}

/** w×h 창을 W×H 틀에 맞추는 배율(여백 margin은 한쪽 비율). 맞출 수 없으면 null */
export function fitScale(w: number, h: number, W: number, H: number, margin: number): number | null {
  const s = Math.min((W * (1 - margin * 2)) / Math.max(Math.abs(w), 1e-9), (H * (1 - margin * 2)) / Math.max(Math.abs(h), 1e-9));
  return Number.isFinite(s) && s > 0 ? s : null;
}

/** 모형 창(x0, y0)–(x1, y1)이 뷰포트를 채우는 뷰: 창 가운데가 뷰포트 가운데로(도움말 ZOOM 윈도우·범위·객체) */
export function windowView(vp: VpFrame, x0: number, y0: number, x1: number, y1: number, margin: number): VpView {
  const k = fitScale(x1 - x0, y1 - y0, vp.width, vp.height, margin);
  return { refX: (x0 + x1) / 2, refY: (y0 + y1) / 2, viewHeight: k ? vp.height / k : vp.viewHeight };
}

/** 뷰포트 가운데를 그대로 두고 지금 뷰의 f배(nX) */
export function scaledView(vp: VpFrame, f: number): VpView {
  return { ...viewOf(vp), viewHeight: vp.viewHeight / f };
}

/** 뷰포트 가운데를 그대로 두고 도면 공간 단위에 대한 축척 n(nXP — 뷰포트 축척 n, 종이 1 = 모형 1/n) */
export function paperScaledView(vp: VpFrame, n: number): VpView {
  return { ...viewOf(vp), viewHeight: vp.height / n };
}

/** 도면 한계(모형 $LIMMIN·$LIMMAX, 배치는 그 배치의 한계) */
export interface LimitsRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * ZOOM n(접미사 없음 — 도움말 ZOOM 축척: 도면 한계에 대한 축척, 2를 넣으면 도면 한계로 줌했을 때 크기의 두 배로 보인다):
 * 한계가 W×H 틀을 꼭 채우는 배율(여백 없음)의 n배. 한계의 폭이나 높이가 0이거나 값이 이상하면 null(부르는 쪽이 nX처럼)
 */
export function limitsScale(lim: LimitsRect, W: number, H: number, n: number): number | null {
  const w = Math.abs(lim.x1 - lim.x0);
  const h = Math.abs(lim.y1 - lim.y0);
  if (!(w > 0 && h > 0 && n > 0) || !Number.isFinite(w) || !Number.isFinite(h)) return null;
  const s = fitScale(w, h, W, H, 0);
  return s ? s * n : null;
}

/** MSPACE의 ZOOM n: 뷰포트 가운데를 그대로 두고 모형 한계가 뷰포트를 꼭 채우는 뷰의 n배(뷰 높이 = 뷰포트 높이 ÷ (한계 배율 × n)) */
export function limitsView(vp: VpFrame, lim: LimitsRect, n: number): VpView | null {
  const k = limitsScale(lim, vp.width, vp.height, n);
  return k ? { ...viewOf(vp), viewHeight: vp.height / k } : null;
}

/** ZOOM 축척 입력: nX(현재 뷰에 대해), nXP(도면 공간 단위에 대해), 접미사 없는 n(도면 한계에 대해). 숫자가 아니거나 0 이하면 null */
export function parseZoomFactor(text: string): { n: number; unit: '' | 'x' | 'xp' } | null {
  const m = /^\s*(\d+(?:\.\d*)?|\.\d+)\s*(xp|x)?\s*$/i.exec(text);
  if (!m) return null;
  const n = parseFloat(m[1]!);
  if (!(n > 0) || !Number.isFinite(n)) return null;
  return { n, unit: (m[2]?.toLowerCase() ?? '') as '' | 'x' | 'xp' };
}

/** 이전 뷰 목록에 지금 뷰를 남긴다(뷰포트마다, 오래된 것부터 버린다) */
export function rememberView(list: VpViewPatch[], vp: VpFrame): void {
  list.push({ viewHeight: vp.viewHeight, viewCenter: { x: vp.viewCenter.x, y: vp.viewCenter.y } });
  while (list.length > VP_PREVIOUS_MAX) list.shift();
}
