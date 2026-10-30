/**
 * 3D 점 목록의 평탄 좌표 [x0, y0, z0, x1, y1, z1, …] 도우미(지시선 LEADER 정점, 스플라인 조정점·맞춤점 등).
 * 큰 도면에서 점마다 객체를 두지 않으려고(문서 메모리·GC) 수만 이어 둔다. 편집 계산은 unpack3으로 풀어 쓴 뒤 pack3으로 되돌린다.
 */
import type { LeaderEntity, SplineEntity, Vec3 } from './model';
import { numArray } from './lwpoly';

/** 점들 → 평탄 좌표 */
export function pack3(pts: readonly Vec3[]): number[] {
  const out: number[] = [];
  for (const p of pts) out.push(p.x, p.y, p.z);
  return out.slice();
}

/** 점 수 */
export const count3 = (a: readonly number[]): number => (a.length / 3) | 0;

/** 점 i(새 객체) */
export function at3(a: readonly number[], i: number): Vec3 {
  return { x: a[i * 3]!, y: a[i * 3 + 1]!, z: a[i * 3 + 2]! };
}

/** 평탄 좌표 → 점들(새 객체) */
export function unpack3(a: readonly number[]): Vec3[] {
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

/** 구조화 복제한 스플라인의 평탄 좌표를 원본에서 다시 담는다(구조화 복제는 수를 하나씩 상자에 담는다, 키 순서는 그대로) */
export function unboxSpline(copy: Pick<SplineEntity, 'controlVerts' | 'fitVerts'>, src: Pick<SplineEntity, 'controlVerts' | 'fitVerts'>): void {
  copy.controlVerts = numArray(src.controlVerts);
  copy.fitVerts = numArray(src.fitVerts);
}
