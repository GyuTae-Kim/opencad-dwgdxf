/**
 * 도면 공간에서 뷰포트에 보이는 모형 객체의 객체 스냅과 DIST의 투영 거리.
 * AutoCAD 도움말(우리말 요약):
 * - "To Set Dimension Scale for Creating Dimensions in a Layout": 도면 공간에서 객체 스냅으로 모형 공간의 점에 스냅하거나 객체를 바로 고를 수 있다.
 * - DIST: 대개 모형 공간에서는 3D 거리, 배치의 도면 공간에서는 2D 거리(도면 공간 단위)를 알린다. 그러나 단일 뷰포트에 보이는
 *   모형 공간 객체에 객체 스냅을 쓰면, 거리는 화면과 나란한 평면에 투영한 2D 모형 공간 거리로 알린다.
 * 이 앱의 뷰포트는 늘 평면도(장면이 그리는 변환: 종이 = 중심 + k·R(−비틀기)·(모형 − 기준))라 화면과 나란한 평면은 모형의 XY 평면이고,
 * 투영 거리는 두 모형 점의 평면 거리다(종이 거리 ÷ 축척과 같다).
 * 도움말에 없어 이 앱이 정한 것: 증분과 XY 평면 각도는 화면(지금 도면 공간 UCS) 방향으로 잰 모형 단위 값, 점 하나만 모형 스냅이거나
 * 두 점의 뷰포트가 다르거나 그 점을 덮는 뷰포트가 둘 이상이면 도면 공간 2D 거리(전과 같다).
 * 뷰포트 안 모형 스냅은 DIST·MEASUREGEOM 거리(23차 — 도움말 MEASUREGEOM: AREA·DIST·MASSPROP과 같은 계산을 많이 한다)의 점 요청과
 * 도면 공간 치수의 점 요청(22차 선형·정렬 원점, 23차 각도 정점·끝점·세로좌표 피쳐·호 길이 부분 점 — dimcmds.ts)에서만 잡는다.
 * 23차: 치수 명령의 객체 고르기도 도면 공간에서 단일 뷰포트에 보이는 모형 객체를 고른다(viewportPick — 위 도움말의 "객체를 바로 골라").
 */
import type { CadDocument, Entity, Layout } from '../core/model';
import { tableKey } from '../core/model';
import type { LayerState } from '../render/styles';
import { pointInPolygon } from '../render/displaylist';
import type { Picker } from './pick';
import { type ViewportXf, layoutViewports, viewportXf } from './scene';
import { type SnapPoint, type ViewportSnap, findSnaps } from './snap';
import type { OverlayGeom, Pt, SnapKind } from './view';

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

/**
 * 배치의 도면 공간(뷰포트 안 모형 공간이 아닌)에서 점이 모두 같은 뷰포트 하나의 모형 스냅이면 그 뷰포트 변환(projectionViewport),
 * 아니면 null. 도면 공간 DIST의 투영 거리와 도면 공간 선형·정렬 치수의 축척 맞춤이 쓴다
 */
export function paperProjection(
  st: { readonly isModel: boolean; readonly msVp: unknown; readonly doc: CadDocument; readonly displaySpace: string; layoutFor(space: string): Layout | undefined },
  pts: readonly PaperPick[],
): ViewportXf | null {
  if (st.isModel || st.msVp) return null;
  return projectionViewport(layoutXfs(st.doc, st.layoutFor(st.displaySpace)), pts);
}

/** 뷰포트에 보이는 모형 객체인지(도면층이 꺼지거나 동결되지 않았고 그 뷰포트에서 동결되지 않은 것) */
function visibleIn(vx: Pick<ViewportXf, 'frozen'>, layers: ReadonlyMap<string, LayerState>): (e: Entity) => boolean {
  return (e) => {
    const k = tableKey(e.layer);
    const l = layers.get(k);
    return (!l || (l.on && !l.frozen)) && !vx.frozen.has(k);
  };
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
    const local = new Map<SnapPoint, number>();
    const found = findSnaps(doc, filtered(model, visibleIn(vx, layers)), paperToModelVp(vx, p), aperture / vx.k, modes, base ? paperToModelVp(vx, base) : null, undefined, local);
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

/** 도면 공간에서 고른 뷰포트 안 모형 객체(getEntity의 viewportPick): 모형 객체 핸들과 그 뷰포트·고른 자리의 모형 좌표 */
export interface ViewportPick {
  handle: string;
  viewport: ViewportSnap;
}

/**
 * 종이 점 p에서 단일 뷰포트에 보이는 모형 객체 고르기(도움말 "To Set Dimension Scale for Creating Dimensions in a Layout":
 * 도면 공간에서 객체를 바로 골라 모형 공간 값의 치수를 만든다). p를 덮는 뷰포트가 하나뿐일 때만(DIST의 "단일 뷰포트"와 같은 규칙 —
 * 겹친 자리는 어느 뷰포트의 객체인지 알 수 없다) 그 뷰포트에서 보이는 모형 객체 가운데 허용 거리(tol ÷ 축척) 안의 가장 가까운 것
 */
export function viewportPick(vxs: readonly (VpXf & Pick<ViewportXf, 'frozen'>)[], model: Picker, layers: ReadonlyMap<string, LayerState>, p: Pt, tol: number): ViewportPick | null {
  const cover = vxs.filter((v) => v.k > 0 && viewportCovers(v, p));
  if (cover.length !== 1) return null;
  const vx = cover[0]!;
  const m = paperToModelVp(vx, p);
  const h = filtered(model, visibleIn(vx, layers)).pick(m.x, m.y, tol / vx.k);
  return h ? { handle: h, viewport: { handle: vx.vp.handle, model: m } } : null;
}

/** 모형 형상(선분·삼각형)을 뷰포트로 본 종이 형상(고를 때 강조) */
export function geometryToPaper(vx: VpXf, g: OverlayGeom): OverlayGeom {
  const map = (a: readonly number[]) => {
    const out: number[] = new Array(a.length);
    for (let i = 0; i + 1 < a.length; i += 2) {
      const q = modelToPaperVp(vx, { x: a[i]!, y: a[i + 1]! });
      out[i] = q.x;
      out[i + 1] = q.y;
    }
    return out;
  };
  return g.tris ? { segs: map(g.segs), tris: map(g.tris) } : { segs: map(g.segs) };
}

/**
 * 모형 원·호를 뷰포트로 본 종이 원·호: 중심은 뷰포트 변환, 반지름은 축척배, 각도는 비틀기만큼 돈다
 * (뷰포트 변환은 회전과 확대뿐이라 원은 원, 반시계 호는 반시계 호로 간다)
 */
export function circleToPaper<T extends { c: Pt; r: number; a0?: number; a1?: number }>(vx: VpXf, c: T): T {
  const out = { ...c, c: modelToPaperVp(vx, c.c), r: c.r * vx.k };
  if (c.a0 !== undefined) out.a0 = c.a0 - vx.twist;
  if (c.a1 !== undefined) out.a1 = c.a1 - vx.twist;
  return out;
}
