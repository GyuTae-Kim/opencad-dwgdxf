/**
 * 스케치(SKETCH): 마우스로 그린 획(점 목록)을 선·폴리선·스플라인으로 만든다.
 * 점은 증분(SKETCHINC) 이상 떨어질 때만 기록하고, 스플라인은 공차(SKPOLY 2의 맞춤 공차)로 점을 줄여 맞춤점으로 쓴다.
 */
import type { Entity, EntityBase, Vec3 } from '../core/model';
import { fitSplineAcad, interpolateFitPoints } from '../geom/curves';
import { packLwPoints } from '../core/lwpoly';
import { pack3 } from '../core/flat3';

export type SketchType = 'line' | 'polyline' | 'spline';

export interface P2 {
  x: number;
  y: number;
}

/** 증분 이상 떨어지면 점을 더한다(더했으면 true) */
export function recordPoint(stroke: P2[], p: P2, increment: number): boolean {
  const last = stroke[stroke.length - 1];
  if (last && Math.hypot(p.x - last.x, p.y - last.y) < Math.max(increment, 1e-12)) return false;
  stroke.push({ x: p.x, y: p.y });
  return true;
}

/** 더글러스-포이커 줄이기(끝점은 남긴다) */
export function simplify(pts: readonly P2[], tol: number): P2[] {
  if (pts.length <= 2 || !(tol > 0)) return [...pts];
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    const a = pts[i]!;
    const b = pts[j]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L = Math.hypot(dx, dy);
    let best = -1;
    let bi = -1;
    for (let k = i + 1; k < j; k++) {
      const q = pts[k]!;
      const d = L > 1e-12 ? Math.abs((q.x - a.x) * dy - (q.y - a.y) * dx) / L : Math.hypot(q.x - a.x, q.y - a.y);
      if (d > best) {
        best = d;
        bi = k;
      }
    }
    if (best > tol && bi > 0) {
      keep[bi] = 1;
      stack.push([i, bi], [bi, j]);
    }
  }
  return pts.filter((_, k) => keep[k]);
}

const v3 = (p: P2, z = 0): Vec3 => ({ x: p.x, y: p.y, z });

/**
 * 획들을 객체로(handle은 ''). 점이 둘 미만인 획은 버린다.
 * z: 점의 Z(SKETCH 명령은 현재 고도 — 찍은 점은 X·Y뿐). 선은 두 끝점, 폴리선은 고도(DXF 38), 스플라인은 맞춤점·조정점이 모두 이 값이다
 */
export function sketchEntities(strokes: readonly P2[][], type: SketchType, props: Omit<EntityBase, 'type' | 'handle'>, tolerance: number, z = 0): Entity[] {
  const out: Entity[] = [];
  for (const s of strokes) {
    if (s.length < 2) continue;
    if (type === 'line') {
      for (let i = 1; i < s.length; i++) out.push({ ...props, type: 'LINE', handle: '', start: v3(s[i - 1]!, z), end: v3(s[i]!, z) } as Entity);
    } else if (type === 'polyline') {
      out.push({
        ...props,
        type: 'LWPOLYLINE',
        handle: '',
        closed: false,
        plinegen: false,
        constantWidth: 0,
        elevation: z,
        ...packLwPoints(s),
      } as Entity);
    } else {
      // .map(v3)이면 배열 색인이 Z로 들어간다
      const fit = simplify(s, tolerance).map((p) => v3(p, z));
      if (fit.length < 2) continue;
      // AutoCAD와 같은 맞춤점 보간(현 길이, 자연 끝) — DWG에 맞춤점 자료로 쓸 수 있다
      const sp = fitSplineAcad(fit, 0) ?? interpolateFitPoints(fit);
      // 맞춤점이 모두 고도 평면에 있으니 조정점도 그 평면이다 — 풀이의 반올림 없이 고도 값 그대로(X·Y는 Z와 따로 풀려 고도 0과 같다, 고도 0은 전과 같은 값)
      const ctrl = z ? sp.ctrl.map((c) => ({ ...c, z })) : sp.ctrl;
      out.push({
        ...props,
        type: 'SPLINE',
        handle: '',
        flags: 8 | 1024 | 32,
        degree: sp.degree,
        knots: sp.knots,
        controlVerts: pack3(ctrl),
        fitVerts: pack3(fit),
        knotTolerance: 1e-10,
        controlTolerance: 1e-10,
        fitTolerance: tolerance,
      } as Entity);
    }
  }
  return out;
}
