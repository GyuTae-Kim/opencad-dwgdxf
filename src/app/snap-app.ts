/**
 * 가상 교차점(APP) 스냅: 커서 근처 객체의 곡선을 자연스럽게 늘린 것(선 → 무한선, 호 → 원, 타원호 → 타원, 스플라인은 그대로)끼리의
 * 교점을 객체의 정확한 형상으로 구한다(src/edit/geom/intersect.ts intersectPieces — 선·원·타원은 해석적, 그 밖은 뉴턴).
 * 평면도에 투영해 만나 보이면 Z가 달라도 잡힌다(가상). AutoCAD 도움말처럼 선·폴리선(2D·3D)·광선·구성선·호·원·타원·타원호·스플라인에
 * 잡히고, 블록 안의 그런 객체도 블록 변환대로 본다.
 *
 * 전에는 화면 장면의 선분(곡선을 꺾은선으로 그린 Float32 선분)을 무한히 늘려 만난 점이었다. 그래서
 *  - 원·호·타원·스플라인 위에서는 이웃한 두 현이 꺾인 자리마다 가짜 가상 교차점이 생겼고(근처점보다 먼저 잡혀 근처점을 가렸다),
 *  - 호의 연장이 원이 아니라 끝 현의 직선이었고, 교점도 꺾은선 오차·Float32 반올림만큼 어긋났으며,
 *  - 해치 무늬·문자 획·치수 화살촉 선분끼리도 가상 교차점이 되었다.
 */
import type { CadDocument, Entity } from '../core/model';
import { tableKey } from '../core/model';
import { type Mat, identity, multiply, rotationZ, scaling, translation, withOcs } from '../geom/matrix';
import { type Piece, pieceBox, pieceNearest } from '../edit/geom/curve';
import { intersectPieces } from '../edit/geom/intersect';
import { mapNurbs } from '../edit/geom/nurbs';
import { entityPath } from '../edit/geom/path';
import type { Picker } from './pick';
import type { Pt } from './view';

/** 가상 교차점 후보 하나 */
export interface AppPoint {
  x: number;
  y: number;
  handle: string;
  handle2: string;
}

/** 블록 안 객체의 조각(그 블록 참조의 핸들) */
interface OwnedPiece {
  pc: Piece;
  handle: string;
  /** 늘린 곡선에서 커서까지 거리 */
  d: number;
}

/** 4×4 변환의 평면도 부분(객체 Z에서) → 2D 아핀 [a, b, c, d, e, f] (x' = a·x + c·y + e) */
function planAffine(m: Mat, z: number): [number, number, number, number, number, number] {
  return [m[0]!, m[4]!, m[1]!, m[5]!, m[3]! + m[2]! * z, m[7]! + m[6]! * z];
}

/** 조각을 2D 아핀으로 옮긴다(호는 닮음이면 호, 아니면 타원호 — 둘 다 정확) */
export function affinePiece(pc: Piece, A: readonly number[]): Piece {
  const [a, b, c, d, e, f] = A as [number, number, number, number, number, number];
  const P = (q: Pt) => ({ x: a * q.x + c * q.y + e, y: b * q.x + d * q.y + f });
  const L = (q: Pt) => ({ x: a * q.x + c * q.y, y: b * q.x + d * q.y });
  switch (pc.k) {
    case 'line':
      return { ...pc, a: P(pc.a), b: P(pc.b) };
    case 'arc': {
      const det = a * d - b * c;
      const s = Math.sqrt(Math.abs(det));
      const similar = Math.abs(a - (det < 0 ? -d : d)) <= 1e-12 * Math.max(1, s) && Math.abs(b - (det < 0 ? c : -c)) <= 1e-12 * Math.max(1, s);
      if (similar && s > 0) {
        const u = L({ x: Math.cos(pc.a0), y: Math.sin(pc.a0) });
        return { ...pc, c: P(pc.c), r: pc.r * s, a0: Math.atan2(u.y, u.x), sw: det < 0 ? -pc.sw : pc.sw };
      }
      return { k: 'ell', c: P(pc.c), u: L({ x: pc.r, y: 0 }), v: L({ x: 0, y: pc.r }), t0: pc.a0, dt: pc.sw };
    }
    case 'ell':
      return { ...pc, c: P(pc.c), u: L(pc.u), v: L(pc.v) };
    case 'nurbs':
      return { ...pc, n: mapNurbs(pc.n, (q) => ({ ...P(q), z: q.z })) };
  }
}

/** 늘린 곡선(선 → 무한선, 호 → 원, 타원호 → 타원, 스플라인 그대로)에서 q까지 거리 */
function carrierDist(pc: Piece, q: Pt): number {
  switch (pc.k) {
    case 'line': {
      const dx = pc.b.x - pc.a.x;
      const dy = pc.b.y - pc.a.y;
      const l = Math.hypot(dx, dy);
      return l > 0 ? Math.abs(dx * (q.y - pc.a.y) - dy * (q.x - pc.a.x)) / l : Math.hypot(q.x - pc.a.x, q.y - pc.a.y);
    }
    case 'arc':
      return Math.abs(Math.hypot(q.x - pc.c.x, q.y - pc.c.y) - pc.r);
    case 'ell':
      return pieceNearest(pc, q, false).d;
    case 'nurbs':
      return pieceNearest(pc, q).d;
  }
}

/** 조각을 모은다(블록 참조는 안쪽 객체까지, 깊이·개수 제한 — entitySnaps와 같다) */
function collect(doc: CadDocument, e: Entity, m: Mat | null, handle: string, depth: number, out: { pc: Piece; handle: string }[]): void {
  if (e.type === 'INSERT') {
    if (depth >= 3) return;
    const blk = doc.blocks.get(tableKey(e.block));
    if (!blk || blk.entities.length > 400) return;
    const om = withOcs(m ?? identity(), e.extrusion);
    const local = multiply(translation(e.insert.x, e.insert.y, e.insert.z), multiply(rotationZ(e.rotation), scaling(e.scale.x || 1, e.scale.y || 1, e.scale.z || 1)));
    const bm = multiply(om, multiply(local, translation(-blk.basePoint.x, -blk.basePoint.y, -blk.basePoint.z)));
    for (const c of blk.entities) if (c.type !== 'ATTDEF') collect(doc, c, bm, handle, depth + 1, out);
    return;
  }
  const path = entityPath(e);
  if (!path) return;
  const A = m ? planAffine(m, path.z) : null;
  for (const pc of path.pieces) out.push({ pc: A ? affinePiece(pc, A) : pc, handle });
}

/**
 * 커서 p 근처의 가상 교차점: 조준창 4배 안에 있는 객체의 조각 중 늘린 곡선이 조준창 안을 지나는 것끼리의 교점(조준창 안).
 * 같은 조각끼리는 보지 않는다(서로 다른 객체·같은 폴리선의 다른 구간)
 */
export function apparentSnaps(doc: CadDocument, picker: Picker, p: Pt, aperture: number): AppPoint[] {
  const reach = aperture * 4;
  const all: { pc: Piece; handle: string }[] = [];
  for (const c of picker.candidates(p.x, p.y, reach).slice(0, 200)) {
    const e = picker.entity(c.handle);
    // 화면 형상(캐시)으로 먼저 거른다: 조준창 4배 밖의 객체는 조각을 만들지 않는다
    if (!e || picker.distance(c.handle, p.x, p.y) > reach) continue;
    collect(doc, e, null, c.handle, 0, all);
    if (all.length > 4000) break;
  }
  const near: OwnedPiece[] = [];
  for (const { pc, handle } of all) {
    // 범위 상자(무한선은 상자가 없다)로 먼저 거르고, 조각 자체가 조준창 4배 안 + 늘린 곡선이 조준창 안
    if (pc.k !== 'line' || (!pc.inf0 && !pc.inf1)) {
      const b = pieceBox(pc);
      if (b.minX - reach > p.x || b.maxX + reach < p.x || b.minY - reach > p.y || b.maxY + reach < p.y) continue;
    }
    const d = carrierDist(pc, p);
    if (d > aperture) continue;
    if (pieceNearest(pc, p).d > reach) continue;
    near.push({ pc, handle, d });
  }
  near.sort((a, b) => a.d - b.d);
  const list = near.slice(0, 40);
  const out: AppPoint[] = [];
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const A = list[i]!;
      const B = list[j]!;
      for (const h of intersectPieces(A.pc, B.pc, true, true))
        if (Math.hypot(h.p.x - p.x, h.p.y - p.y) <= aperture) out.push({ x: h.p.x, y: h.p.y, handle: A.handle, handle2: B.handle });
    }
  return out;
}
