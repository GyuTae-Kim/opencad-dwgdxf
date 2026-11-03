/**
 * 3D 점 목록의 평탄 좌표 [x0, y0, z0, x1, y1, z1, …] 도우미(지시선 LEADER 정점, 스플라인 조정점·맞춤점 등).
 * 큰 도면에서 점마다 객체를 두지 않으려고(문서 메모리·GC) 수만 이어 두고, Float64Array라 내용이 JS 힙 밖에 놓인다.
 * 편집 계산은 unpack3으로 풀어 쓴 뒤 pack3으로 되돌린다.
 */
import type { LeaderEntity, SplineEntity, Vec3 } from './model';
import { newF64 } from './f64pool';

/** 점들 → 평탄 좌표(읽는 중이면 덩어리에서 — src/core/f64pool.ts) */
export function pack3(pts: readonly Vec3[]): Float64Array {
  const out = newF64(pts.length * 3);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    out[i * 3] = p.x;
    out[i * 3 + 1] = p.y;
    out[i * 3 + 2] = p.z;
  }
  return out;
}

/** 점 수 */
export const count3 = (a: ArrayLike<number>): number => (a.length / 3) | 0;

/** 점 i(새 객체) */
export function at3(a: ArrayLike<number>, i: number): Vec3 {
  return { x: a[i * 3]!, y: a[i * 3 + 1]!, z: a[i * 3 + 2]! };
}

/** 평탄 좌표 → 점들(새 객체) */
export function unpack3(a: ArrayLike<number>): Vec3[] {
  const n = count3(a);
  const out = new Array<Vec3>(n);
  for (let i = 0; i < n; i++) out[i] = at3(a, i);
  return out;
}

/** 지시선 정점들(새 객체 — 고쳐도 문서는 그대로) */
export const leaderVertices = (e: Pick<LeaderEntity, 'verts'>): Vec3[] => unpack3(e.verts);

/** 지시선 정점 수 */
export const leaderCount = (e: Pick<LeaderEntity, 'verts'>): number => count3(e.verts);

// ---------------------------------------------------------------------------
// 스플라인 조정점·맞춤점(SplineEntity.controlVerts·fitVerts)
// ---------------------------------------------------------------------------

/** 스플라인 조정점들(새 객체 — 고쳐도 문서는 그대로) */
export const splineCtrl = (e: Pick<SplineEntity, 'controlVerts'>): Vec3[] => unpack3(e.controlVerts);

/** 스플라인 맞춤점들(새 객체) */
export const splineFit = (e: Pick<SplineEntity, 'fitVerts'>): Vec3[] => unpack3(e.fitVerts);

/** 조정점 수 */
export const ctrlCount = (e: Pick<SplineEntity, 'controlVerts'>): number => count3(e.controlVerts);

/** 맞춤점 수 */
export const fitCount = (e: Pick<SplineEntity, 'fitVerts'>): number => count3(e.fitVerts);

/** 조정점 i(새 객체). 없으면 undefined */
export const ctrlAt = (e: Pick<SplineEntity, 'controlVerts'>, i: number): Vec3 | undefined =>
  i >= 0 && i < count3(e.controlVerts) ? at3(e.controlVerts, i) : undefined;

/** 맞춤점 i(새 객체). 없으면 undefined */
export const fitAt = (e: Pick<SplineEntity, 'fitVerts'>, i: number): Vec3 | undefined => (i >= 0 && i < count3(e.fitVerts) ? at3(e.fitVerts, i) : undefined);

