/**
 * 3D 점 목록의 평탄 좌표 [x0, y0, z0, x1, y1, z1, …] 도우미(지시선 LEADER 정점 등).
 * 큰 도면에서 점마다 객체를 두지 않으려고(문서 메모리·GC) 수만 이어 둔다. 편집 계산은 unpack3으로 풀어 쓴 뒤 pack3으로 되돌린다.
 */
import type { LeaderEntity, Vec3 } from './model';

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
