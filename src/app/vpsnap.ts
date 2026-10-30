/**
 * 도면 공간에서 뷰포트에 보이는 모형 객체의 객체 스냅과 DIST의 투영 거리.
 * AutoCAD 도움말(우리말 요약):
 * - "To Set Dimension Scale for Creating Dimensions in a Layout": 도면 공간에서 객체 스냅으로 모형 공간의 점에 스냅하거나 객체를 바로 고를 수 있다.
 * - DIST: 대개 모형 공간에서는 3D 거리, 배치의 도면 공간에서는 2D 거리(도면 공간 단위)를 알린다. 그러나 단일 뷰포트에 보이는
 *   모형 공간 객체에 객체 스냅을 쓰면, 거리는 화면과 나란한 평면에 투영한 2D 모형 공간 거리로 알린다.
 * 이 앱의 뷰포트는 늘 평면도(장면이 그리는 변환: 종이 = 중심 + k·R(−비틀기)·(모형 − 기준))라 화면과 나란한 평면은 모형의 XY 평면이고,
 * 투영 거리는 두 모형 점의 평면 거리다(종이 거리 ÷ 축척과 같다).
 * 도움말에 없어 이 앱이 정한 것: 증분과 XY 평면 각도는 화면(지금 도면 공간 UCS) 방향으로 잰 모형 단위 값, 점 하나만 모형 스냅이거나
 * 두 점의 뷰포트가 다르거나 그 점을 덮는 뷰포트가 둘 이상이면 도면 공간 2D 거리(전과 같다). 뷰포트 안 모형 스냅은 DIST의 점 요청에서만 잡는다.
 */
import type { CadDocument, Entity, Layout } from '../core/model';
import { tableKey } from '../core/model';
import type { LayerState } from '../render/styles';
import { pointInPolygon } from '../render/displaylist';
import type { Picker } from './pick';
import { type ViewportXf, layoutViewports, viewportXf } from './scene';
import { type SnapPoint, type ViewportSnap, findSnaps } from './snap';
import type { Pt, SnapKind } from './view';

/** 뷰포트 변환 가운데 이 모듈이 쓰는 것(시험이 직접 만든다) */
export type VpXf = Pick<ViewportXf, 'k' | 'twist' | 'refX' | 'refY' | 'clip'> & { vp: Pick<ViewportXf['vp'], 'handle' | 'center' | 'width' | 'height'> };

/** 뷰포트에 보이는 모형 점의 종이 좌표(장면의 drawViewport와 같은 변환) */
export function modelToPaperVp(vx: VpXf, m: Pt): Pt {
  const c = Math.cos(-vx.twist);
  const s = Math.sin(-vx.twist);
  const dx = m.x - vx.refX;
  const dy = m.y - vx.refY;
  return { x: vx.vp.center.x + vx.k * (c * dx - s * dy), y: vx.vp.center.y + vx.k * (s * dx + c * dy) };
}

/** 종이 점에 보이는 모형 점(modelToPaperVp의 역) */
export function paperToModelVp(vx: VpXf, p: Pt): Pt {
  const c = Math.cos(vx.twist);
  const s = Math.sin(vx.twist);
  const dx = (p.x - vx.vp.center.x) / vx.k;
  const dy = (p.y - vx.vp.center.y) / vx.k;
  return { x: vx.refX + c * dx - s * dy, y: vx.refY + s * dx + c * dy };
}

/** 뷰포트가 종이 점을 덮는지(사각형 안, 자르기 경계가 있으면 그 안도) */
export function viewportCovers(vx: VpXf, p: Pt): boolean {
  const v = vx.vp;
  const tol = Math.max(v.width, v.height) * 1e-9;
  if (Math.abs(p.x - v.center.x) > v.width / 2 + tol || Math.abs(p.y - v.center.y) > v.height / 2 + tol) return false;
  return !vx.clip || pointInPolygon(p.x, p.y, vx.clip);
}

/**
 * 두 모형 점(평면)을 화면과 나란한 평면에 투영한 증분을 화면(종이) 축 방향으로: R(−비틀기)·(b − a). 길이는 두 점의 평면 거리 그대로다
 */
export function projectedDelta(vx: Pick<VpXf, 'twist'>, a: Pt, b: Pt): Pt {
  const c = Math.cos(-vx.twist);
  const s = Math.sin(-vx.twist);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return { x: c * dx - s * dy, y: s * dx + c * dy };
}

/** 점 하나: 종이 좌표와 그 점을 잡은 뷰포트 안 모형 스냅(없으면 도면 공간 점) */
export interface PaperPick {
  p: Pt;
  viewport?: ViewportSnap | null;
}

/**
 * 도면 공간 DIST의 투영 뷰포트(도움말 DIST "단일 뷰포트에 보이는 모형 공간 객체에 객체 스냅"):
 * 점이 모두 뷰포트 안 모형 객체 스냅이고 모두 같은 뷰포트이며, 점마다 그 점을 덮는 뷰포트가 그것 하나뿐이면 그 뷰포트. 아니면 null(도면 공간 2D)
 */
export function projectionViewport<T extends VpXf>(vxs: readonly T[], pts: readonly PaperPick[]): T | null {
  const h = pts[0]?.viewport?.handle;
  if (!h || pts.some((q) => q.viewport?.handle !== h)) return null;
  const vx = vxs.find((v) => v.vp.handle === h);
  if (!vx) return null;
  for (const q of pts) {
    const cover = vxs.filter((v) => viewportCovers(v, q.p));
    if (cover.length !== 1 || cover[0] !== vx) return null;
  }
  return vx;
}

/** 배치의 뷰포트 변환(전체 용지 뷰포트·꺼진 것 제외) */
export function layoutXfs(doc: CadDocument, layout: Layout | undefined): ViewportXf[] {
  return layout ? layoutViewports(doc, layout).map((v) => viewportXf(doc, v)) : [];
}

/** 후보를 거른 고르기(같은 색인·형상 캐시를 쓴다) */
function filtered(pk: Picker, ok: (e: Entity) => boolean): Picker {
  const v = Object.create(pk) as Picker;
  v.candidates = (x, y, tol) =>
    pk.candidates(x, y, tol).filter((b) => {
      const e = pk.entity(b.handle);
      return !!e && ok(e);
    });
  return v;
}

/**
 * 종이 점 p(커서) 둘레의 뷰포트 안 모형 객체 스냅. p를 덮는 뷰포트마다 커서·기준점·조준창을 모형으로 옮겨 모형 객체의 스냅을 구하고
 * (그 뷰포트에서 꺼지거나 동결된 도면층은 빼고), 뷰포트 안에 보이는 점만 종이 좌표로 돌려준다. Z는 담지 않는다(도면 공간 점).
 * 연장선·평행·지연된 접점은 보지 않는다. scores에는 findSnaps와 같은 점수를 담는다(조준창으로 나눈 값이라 종이 스냅과 견줄 수 있다)
 */
export function viewportSnaps(
  doc: CadDocument,
  vxs: readonly ViewportXf[],
  model: Picker,
  layers: ReadonlyMap<string, LayerState>,
  p: Pt,
  aperture: number,
  modes: ReadonlySet<SnapKind>,
  base: Pt | null,
  scores: Map<SnapPoint, number>,
): SnapPoint[] {
  const out: SnapPoint[] = [];
  for (const vx of vxs) {
    if (!(vx.k > 0) || !viewportCovers(vx, p)) continue;
    const visible = (e: Entity) => {
      const k = tableKey(e.layer);
      const l = layers.get(k);
      return (!l || (l.on && !l.frozen)) && !vx.frozen.has(k);
    };
    const local = new Map<SnapPoint, number>();
    const found = findSnaps(doc, filtered(model, visible), paperToModelVp(vx, p), aperture / vx.k, modes, base ? paperToModelVp(vx, base) : null, undefined, local);
    for (const s of found) {
      if (s.deferred || s.lines) continue;
      const q = modelToPaperVp(vx, s);
      if (!viewportCovers(vx, q)) continue;
      const t: SnapPoint = { x: q.x, y: q.y, kind: s.kind, viewport: { handle: vx.vp.handle, model: { x: s.x, y: s.y } } };
      if (s.handle) t.handle = s.handle;
      if (s.handle2) t.handle2 = s.handle2;
      out.push(t);
      scores.set(t, local.get(s) ?? Infinity);
    }
  }
  return out;
}
