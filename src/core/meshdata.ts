/**
 * MESH(세분 메시) 평탄 자료: 정점·면·모서리를 객체·배열 목록 대신 수 배열로 둔다(큰 도면의 문서 메모리·GC를 줄인다).
 * - verts: [x0, y0, z0, x1, y1, z1, …](WCS) — 정점 수 = verts.length / 3
 * - faceData: [면0의 정점 수, 번호…, 면1의 정점 수, 번호…, …]
 * - edgePairs: [a0, b0, a1, b1, …]
 * 쓰기·그리기·편집은 meshVertices·meshFaces·meshEdges로 풀어 쓰고, 고친 뒤 packMesh로 되돌린다.
 */
import type { MeshEntity, Vec3 } from './model';

export interface MeshPacked {
  verts: number[];
  faceData: number[];
  edgePairs: number[];
}

/** 풀어 쓴 정점·면·모서리 → 평탄 자료 */
export function packMesh(vertices: readonly Vec3[], faces: readonly (readonly number[])[], edges: readonly (readonly [number, number])[]): MeshPacked {
  const verts: number[] = [];
  for (const p of vertices) verts.push(p.x, p.y, p.z);
  return { verts: verts.slice(), faceData: packFaces(faces), edgePairs: packPairs(edges) };
}

export function packFaces(faces: readonly (readonly number[])[]): number[] {
  const out: number[] = [];
  for (const f of faces) {
    out.push(f.length);
    for (const i of f) out.push(i);
  }
  return out.slice();
}

export function packPairs(edges: readonly (readonly [number, number])[]): number[] {
  const out: number[] = [];
  for (const [a, b] of edges) out.push(a, b);
  return out.slice();
}

/** 정점 수 */
export const meshVertexCount = (e: Pick<MeshEntity, 'verts'>): number => (e.verts.length / 3) | 0;

/** 정점 i(새 객체) */
export function meshVertex(e: Pick<MeshEntity, 'verts'>, i: number): Vec3 {
  return { x: e.verts[i * 3]!, y: e.verts[i * 3 + 1]!, z: e.verts[i * 3 + 2]! };
}

/** 정점들(새 객체) */
export function meshVertices(e: Pick<MeshEntity, 'verts'>): Vec3[] {
  const n = meshVertexCount(e);
  const out = new Array<Vec3>(n);
  for (let i = 0; i < n; i++) out[i] = meshVertex(e, i);
  return out;
}

/** 면들(새 배열) */
export function meshFaces(e: Pick<MeshEntity, 'faceData'>): number[][] {
  const d = e.faceData;
  const out: number[][] = [];
  for (let k = 0; k < d.length; ) {
    const n = d[k]!;
    out.push(d.slice(k + 1, k + 1 + n));
    k += n + 1;
  }
  return out;
}

/** 면 수 */
export function meshFaceCount(e: Pick<MeshEntity, 'faceData'>): number {
  const d = e.faceData;
  let c = 0;
  for (let k = 0; k < d.length; k += d[k]! + 1) c++;
  return c;
}

/** 모서리들(새 배열) */
export function meshEdges(e: Pick<MeshEntity, 'edgePairs'>): [number, number][] {
  const d = e.edgePairs;
  const out: [number, number][] = [];
  for (let k = 0; k + 1 < d.length; k += 2) out.push([d[k]!, d[k + 1]!]);
  return out;
}

/** 모서리 수 */
export const meshEdgeCount = (e: Pick<MeshEntity, 'edgePairs'>): number => (e.edgePairs.length / 2) | 0;
