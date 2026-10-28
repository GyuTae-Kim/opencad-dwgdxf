/**
 * POLYLINE(2D·3D·다각형 메시·폴리페이스) 정점 평탄 좌표 도우미.
 *
 * 문서는 정점을 객체 배열 대신 평탄 배열로 둔다(큰 도면의 문서 메모리·GC를 줄인다 — 경량 폴리선의 src/core/lwpoly.ts와 같은 방식).
 * - verts: [x0, y0, z0, x1, y1, z1, …] — 정점 수 = verts.length / 3
 * - bulges: [볼록0, 볼록1, …] — 모두 +0이면 없다(undefined)
 * - widths: [시작 폭0, 끝 폭0, 시작 폭1, 끝 폭1, …] — 모두 +0이면 없다
 * - vflags: [VERTEX 70 플래그0, …] — 모두 0이면 없다
 * - tangents: [곡선 맞춤 접선0(라디안) 또는 null, …] — 하나도 없으면 없다
 * - faceRecs: [폴리페이스 면 레코드의 정점 번호0 또는 null, …] — 하나도 없으면 없다
 * 그리기·읽기·쓰기처럼 많이 도는 곳은 배열을 바로 읽고, 편집 계산은 polyVertices로 풀어 쓴 뒤 packPoly·setPolyVertices로 되돌린다.
 * 객체 리터럴에는 `{ ...packPoly(vs) }`로 펼쳐 넣는다(없는 배열도 키를 남겨 앞 값을 덮는다).
 */
import type { PolylineEntity, PolyVertex, Vec2, Vec3 } from './model';
import { numArray, zeros } from './lwpoly';

/** 평탄 정점 자료 */
export interface PolyPacked {
  verts: number[];
  bulges: number[] | undefined;
  widths: number[] | undefined;
  vflags: number[] | undefined;
  tangents: (number | null)[] | undefined;
  faceRecs: (number[] | null)[] | undefined;
}

/** 평탄 정점을 읽는 쪽이 보는 부분 */
export type PolyArrays = Pick<PolylineEntity, 'verts' | 'bulges' | 'widths' | 'vflags' | 'tangents' | 'faceRecs'>;

/** +0인지(-0은 값으로 본다 — 예전 정점 객체와 같은 값을 돌려주려고) */
const isPlusZero = (v: number): boolean => v === 0 && 1 / v > 0;

/** 풀어 쓴 정점들을 평탄 자료로 */
export function packPoly(vs: readonly PolyVertex[]): PolyPacked {
  const n = vs.length;
  const verts: number[] = [];
  let bulges: number[] | undefined;
  let widths: number[] | undefined;
  let vflags: number[] | undefined;
  let tangents: (number | null)[] | undefined;
  let faceRecs: (number[] | null)[] | undefined;
  for (let i = 0; i < n; i++) {
    const v = vs[i]!;
    const p = v.location;
    verts.push(p.x, p.y, p.z);
    if (!bulges && !isPlusZero(v.bulge)) bulges = zeros(n);
    if (bulges) bulges[i] = v.bulge;
    if (!widths && !(isPlusZero(v.startWidth) && isPlusZero(v.endWidth))) widths = zeros(n * 2);
    if (widths) {
      widths[i * 2] = v.startWidth;
      widths[i * 2 + 1] = v.endWidth;
    }
    if (!vflags && v.flags !== 0) vflags = zeros(n);
    if (vflags) vflags[i] = v.flags;
    if (!tangents && v.tangent !== undefined) tangents = new Array<number | null>(n).fill(null);
    if (tangents) tangents[i] = v.tangent ?? null;
    if (!faceRecs && v.faceIndices) faceRecs = new Array<number[] | null>(n).fill(null);
    if (faceRecs) faceRecs[i] = v.faceIndices ? v.faceIndices.slice() : null;
  }
  return { verts: verts.slice(), bulges, widths, vflags, tangents, faceRecs };
}

/**
 * 정점을 하나씩 받아 평탄 자료를 만든다(읽기용 — 정점 객체를 만들지 않는다). packPoly와 같은 규칙으로 배열을 둔다.
 */
export class PolyAccum {
  private verts: number[] = [];
  private bulges: number[] | undefined;
  private widths: number[] | undefined;
  private vflags: number[] | undefined;
  private tangents: (number | null)[] | undefined;
  private faceRecs: (number[] | null)[] | undefined;
  private n = 0;

  add(x: number, y: number, z: number, bulge: number, startWidth: number, endWidth: number, flags: number, tangent?: number, face?: number[]): void {
    const i = this.n++;
    this.verts.push(x, y, z);
    if (!this.bulges && !isPlusZero(bulge)) this.bulges = zeros(i);
    this.bulges?.push(bulge);
    if (!this.widths && !(isPlusZero(startWidth) && isPlusZero(endWidth))) this.widths = zeros(i * 2);
    this.widths?.push(startWidth, endWidth);
    if (!this.vflags && flags !== 0) this.vflags = zeros(i);
    this.vflags?.push(flags);
    if (!this.tangents && tangent !== undefined) this.tangents = new Array<number | null>(i).fill(null);
    this.tangents?.push(tangent ?? null);
    if (!this.faceRecs && face) this.faceRecs = new Array<number[] | null>(i).fill(null);
    this.faceRecs?.push(face ?? null);
  }

  finish(): PolyPacked {
    return {
      verts: this.verts.slice(),
      bulges: this.bulges?.slice(),
      widths: this.widths?.slice(),
      vflags: this.vflags?.slice(),
      tangents: this.tangents,
      faceRecs: this.faceRecs,
    };
  }
}

/** 정점 수 */
export function polyCount(e: Pick<PolylineEntity, 'verts'>): number {
  return (e.verts.length / 3) | 0;
}

/** 정점 번호 i가 있는지(예전 `vertices[i]`가 있던 것과 같다 — 정수이고 범위 안) */
export function polyHas(e: Pick<PolylineEntity, 'verts'>, i: number): boolean {
  return Number.isInteger(i) && i >= 0 && i < polyCount(e);
}

export const polyX = (e: Pick<PolylineEntity, 'verts'>, i: number): number => e.verts[i * 3]!;
export const polyY = (e: Pick<PolylineEntity, 'verts'>, i: number): number => e.verts[i * 3 + 1]!;
export const polyZ = (e: Pick<PolylineEntity, 'verts'>, i: number): number => e.verts[i * 3 + 2]!;
export const polyBulge = (e: Pick<PolylineEntity, 'bulges'>, i: number): number => (e.bulges ? e.bulges[i]! : 0);
export const polyStartWidth = (e: Pick<PolylineEntity, 'widths'>, i: number): number => (e.widths ? e.widths[i * 2]! : 0);
export const polyEndWidth = (e: Pick<PolylineEntity, 'widths'>, i: number): number => (e.widths ? e.widths[i * 2 + 1]! : 0);
export const polyFlags = (e: Pick<PolylineEntity, 'vflags'>, i: number): number => (e.vflags ? e.vflags[i]! : 0);
export const polyTangent = (e: Pick<PolylineEntity, 'tangents'>, i: number): number | undefined => e.tangents?.[i] ?? undefined;
export const polyFace = (e: Pick<PolylineEntity, 'faceRecs'>, i: number): number[] | undefined => e.faceRecs?.[i] ?? undefined;

/** 정점 위치(새 객체) */
export function polyLoc(e: Pick<PolylineEntity, 'verts'>, i: number): Vec3 {
  const v = e.verts;
  return { x: v[i * 3]!, y: v[i * 3 + 1]!, z: v[i * 3 + 2]! };
}

/** 정점 위치들(새 객체) */
export function polyLocs(e: Pick<PolylineEntity, 'verts'>): Vec3[] {
  const n = polyCount(e);
  const out = new Array<Vec3>(n);
  for (let i = 0; i < n; i++) out[i] = polyLoc(e, i);
  return out;
}

/** 정점 하나를 풀어 쓴다(새 객체 — 고쳐도 문서는 그대로) */
export function polyVertex(e: PolyArrays, i: number): PolyVertex {
  const v: PolyVertex = { location: polyLoc(e, i), bulge: polyBulge(e, i), startWidth: polyStartWidth(e, i), endWidth: polyEndWidth(e, i), flags: polyFlags(e, i) };
  const t = e.tangents?.[i];
  if (t !== undefined && t !== null) v.tangent = t;
  const f = e.faceRecs?.[i];
  if (f) v.faceIndices = f.slice();
  return v;
}

/** 정점들을 풀어 쓴다(새 객체) */
export function polyVertices(e: PolyArrays): PolyVertex[] {
  const n = polyCount(e);
  const out = new Array<PolyVertex>(n);
  for (let i = 0; i < n; i++) out[i] = polyVertex(e, i);
  return out;
}

/** 정점들을 바꾼다(그 자리에서) */
export function setPolyVertices(e: PolyArrays, vs: readonly PolyVertex[]): void {
  Object.assign(e, packPoly(vs));
}

/** 그려지는 정점인지(스플라인 맞춤의 틀 정점 — 플래그 16 — 이 아닌 것) */
export const polyDrawn = (e: Pick<PolylineEntity, 'vflags'>, i: number): boolean => !(polyFlags(e, i) & 16);

/** 폴리페이스 면 레코드인지(면 번호가 있고 메시 정점 플래그 64가 없는 것) — 예전 `v.faceIndices && !(v.flags & 64)` */
export const polyIsFaceRecord = (e: Pick<PolylineEntity, 'vflags' | 'faceRecs'>, i: number): boolean => !!e.faceRecs?.[i] && !(polyFlags(e, i) & 64);

/** 그려지는 정점(틀 정점 16을 뺀)의 OCS 위치·볼록 */
export function polyDrawnBulgeVerts(e: PolyArrays): { x: number; y: number; bulge: number }[] {
  const out: { x: number; y: number; bulge: number }[] = [];
  const n = polyCount(e);
  for (let i = 0; i < n; i++) if (polyDrawn(e, i)) out.push({ x: polyX(e, i), y: polyY(e, i), bulge: polyBulge(e, i) });
  return out;
}

/** 그려지는 정점(틀 정점 16을 뺀)의 위치 */
export function polyDrawnPoints(e: PolyArrays): Vec2[] {
  const out: Vec2[] = [];
  const n = polyCount(e);
  for (let i = 0; i < n; i++) if (polyDrawn(e, i)) out.push({ x: polyX(e, i), y: polyY(e, i) });
  return out;
}

/** 정점 하나를 고친다(그 자리에서 — 문서에 들어 있지 않은 사본에만 쓸 것) */
export function setPolyVertex(e: PolyArrays, i: number, v: Partial<PolyVertex>): void {
  const vs = polyVertices(e);
  vs[i] = { ...vs[i]!, ...v };
  setPolyVertices(e, vs);
}

/** 위치만 바꾼 사본 자료(다른 배열은 복사) — 변환·신축처럼 정점 수와 다른 값이 그대로인 편집 */
export function polyMapLocs(e: PolyArrays, f: (p: Vec3, i: number) => Vec3): PolyPacked {
  const n = polyCount(e);
  const verts: number[] = [];
  for (let i = 0; i < n; i++) {
    const q = f(polyLoc(e, i), i);
    verts.push(q.x, q.y, q.z);
  }
  return {
    verts: verts.slice(),
    bulges: e.bulges?.slice(),
    widths: e.widths?.slice(),
    vflags: e.vflags?.slice(),
    tangents: e.tangents?.slice(),
    faceRecs: e.faceRecs?.map((f) => (f ? f.slice() : null)),
  };
}

/** 구조화 복제한 POLYLINE의 평탄 좌표를 원본에서 다시 복사한다(구조화 복제는 수 배열의 수를 하나씩 상자에 담는다) */
export function unboxPoly(copy: PolyArrays, src: PolyArrays): void {
  copy.verts = numArray(src.verts);
  if (src.bulges) copy.bulges = numArray(src.bulges);
  if (src.widths) copy.widths = numArray(src.widths);
}
