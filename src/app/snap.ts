/**
 * 객체 스냅: 끝점·중간점·중심·기하학적 중심·노드·사분점·교차점·연장선·삽입·수직·접점·근처점·가상 교차점·평행.
 * 연장선(EXT)·평행(PAR)은 커서를 끝점·선분 위에 잠시 머물러 얻은 획득점(SnapContext, 앱이 모은다)을 쓴다.
 * 중심·기하학적 중심은 원·호·닫힌 폴리선의 테두리 위에 커서를 두어도 잡힌다(AutoCAD와 같다).
 * 접점은 원·호·폴리선의 호 구간·타원·타원호·스플라인에 잡힌다(AutoCAD와 같다 — 타원은 해석적, 스플라인은 매개변수 위 근 찾기).
 * 지연된 접점은 명령이 받겠다고 한 점 요청에서만이고,
 * 원을 그리는 명령(CIRCLE 3P·Ttr·TTT)은 선·폴리선 직선 구간·구성선·광선에도 받는다(SnapContext.deferTanLines).
 */
import type { CadDocument, Entity } from '../core/model';
import { tableKey } from '../core/model';
import { type Mat, apply, applyXY, identity, multiply, rotationZ, scaling, translation, withOcs } from '../geom/matrix';
import { bulgeArc, ccwSweep, fitPointsCurve, nurbsPoints } from '../geom/curves';
import type { Picker } from './pick';
import type { Pt, SnapKind } from './view';
import { lwVertices } from '../core/lwpoly';
import { polyVertices } from '../core/polyverts';
import { entityPath } from '../edit/geom/path';
import { type ArcPiece, type EllPiece, type LinePiece, type NurbsPiece, pieceNearest } from '../edit/geom/curve';
import { commonTangentCurves, tangentNearPick, tangentsFromPoint } from '../edit/geom/tangent';
import { apparentSnaps } from './snap-app';
import { ctrlCount, fitCount, leaderVertices, splineCtrl, splineFit } from '../core/flat3';
import { entityZAt, intersectionZ } from './snapz';

export interface SnapPoint {
  x: number;
  y: number;
  /**
   * 스냅 점의 WCS Z(객체의 3D 위치 — AutoCAD OSNAPZ 0). 정의점(끝점·중간점·중심·기하학적 중심·사분점·노드·삽입점)은 그 Z,
   * 교차점·근처점·수직·접점은 그 점이 놓인 객체 위의 Z(snapz.ts — 교차점은 두 객체가 3D에서도 만날 때만).
   * 연장선·평행·가상 교차점·지연된 접점과 Z를 모르는 객체(블록 참조 안 등)는 없음
   */
  z?: number;
  kind: SnapKind;
  /** 스냅 점을 준 객체(교차점·근처점처럼 선분에서 구한 것은 없음) */
  handle?: string;
  handle2?: string;
  /** 연장선·평행 스냅의 정렬선(점선으로 보인다): 시작점과 단위 방향 */
  lines?: { from: Pt; dir: Pt }[];
  /** 지연된 접점: 기준점이 아직 없어 원·호 위 찍은 자리만 정했다(명령이 다음 점을 받은 뒤 접점을 구한다) */
  deferred?: boolean;
  /** 도면 공간에서 뷰포트에 보이는 모형 객체에 잡은 점(vpsnap.ts): 그 뷰포트와 모형 좌표. x·y는 종이 좌표다 */
  viewport?: ViewportSnap;
}

/** 뷰포트 안 모형 객체 스냅의 출처 */
export interface ViewportSnap {
  /** 뷰포트 핸들 */
  handle: string;
  /** 스냅 점의 모형 좌표(평면) */
  model: Pt;
}

/** 제도 설정 대화상자의 순서(AutoCAD 2026) */
export const ALL_SNAPS: SnapKind[] = ['end', 'mid', 'cen', 'gcen', 'nod', 'qua', 'int', 'ext', 'ins', 'per', 'tan', 'nea', 'app', 'par'];
export const SNAP_NAMES: Record<string, string> = {
  end: '끝점',
  mid: '중간점',
  cen: '중심',
  qua: '사분점',
  int: '교차점',
  ins: '삽입',
  nod: '노드',
  per: '수직',
  nea: '근처점',
  tan: '접점',
  ext: '연장선',
  gcen: '기하학적 중심',
  app: '가상 교차점',
  par: '평행',
};

/** 기본 켜진 스냅: AutoCAD 기본 OSMODE 4133 = 끝점(1)·중심(4)·교차점(32)·연장선(4096) */
export const DEFAULT_SNAPS: SnapKind[] = ['end', 'cen', 'int', 'ext'];

/** 연장선 획득점: 선분 끝(바깥 방향) 또는 호 끝(호가 놓인 원과 호 범위) */
export interface ExtAnchor {
  p: Pt;
  /** 선분 끝: 끝점에서 바깥으로 나가는 단위 방향 */
  dir?: Pt;
  /** 호 끝: 도면 좌표의 반시계 호(중심·반지름·시작 각·사잇각) */
  arc?: { cx: number; cy: number; r: number; a0: number; sweep: number };
}

/** 스냅이 쓰는 추적 상태(앱이 모아 넘긴다) */
export interface SnapContext {
  /** 연장선 획득점 */
  ext?: readonly ExtAnchor[];
  /** 평행: 획득한 선분 방향(단위 벡터) */
  par?: readonly Pt[];
  /** 접점을 지연된 접점으로 잡는다(기준점과 상관없이 원·호 위 찍은 자리, 명령이 받겠다고 한 점 요청만) */
  deferTan?: boolean;
  /** 지연된 접점을 선(선·폴리선 직선 구간·구성선·광선)에도 잡는다(원을 그리는 명령: 원은 선에도 접한다) */
  deferTanLines?: boolean;
}

function arcSnaps(m: Mat, cx: number, cy: number, z: number, r: number, a0: number, sweep: number, full: boolean, out: SnapPoint[]): void {
  const P = (a: number) => apply(m, cx + r * Math.cos(a), cy + r * Math.sin(a), z);
  const c = apply(m, cx, cy, z);
  out.push({ ...c, kind: 'cen' });
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    if (full || ccwSweep(a0, a) <= sweep + 1e-9) out.push({ ...P(a), kind: 'qua' });
  }
  if (!full) {
    out.push({ ...P(a0), kind: 'end' }, { ...P(a0 + sweep), kind: 'end' }, { ...P(a0 + sweep / 2), kind: 'mid' });
  }
}

function polySnaps(m: Mat, vs: { x: number; y: number; bulge: number }[], closed: boolean, z: number, out: SnapPoint[]): void {
  const n = vs.length;
  for (const v of vs) out.push({ ...apply(m, v.x, v.y, z), kind: 'end' });
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = vs[i]!;
    const b = vs[(i + 1) % n]!;
    const arc = bulgeArc(a.x, a.y, b.x, b.y, a.bulge);
    if (arc) {
      const am = arc.a0 + arc.sweep / 2;
      out.push({ ...apply(m, arc.cx + arc.r * Math.cos(am), arc.cy + arc.r * Math.sin(am), z), kind: 'mid' });
      out.push({ ...apply(m, arc.cx, arc.cy, z), kind: 'cen' });
    } else out.push({ ...apply(m, (a.x + b.x) / 2, (a.y + b.y) / 2, z), kind: 'mid' });
  }
}

/** 객체의 정의 스냅점(월드 좌표). 블록 참조는 안쪽 객체까지(깊이 제한) */
export function entitySnaps(doc: CadDocument, e: Entity, m: Mat, out: SnapPoint[], depth = 0): void {
  switch (e.type) {
    case 'LINE': {
      const a = apply(m, e.start.x, e.start.y, e.start.z);
      const b = apply(m, e.end.x, e.end.y, e.end.z);
      out.push({ ...a, kind: 'end' }, { ...b, kind: 'end' }, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2, kind: 'mid' });
      return;
    }
    case 'CIRCLE':
      arcSnaps(withOcs(m, e.extrusion), e.center.x, e.center.y, e.center.z, e.radius, 0, Math.PI * 2, true, out);
      return;
    case 'ARC':
      arcSnaps(withOcs(m, e.extrusion), e.center.x, e.center.y, e.center.z, e.radius, e.startAngle, ccwSweep(e.startAngle, e.endAngle), false, out);
      return;
    case 'ELLIPSE': {
      const n = e.extrusion ?? { x: 0, y: 0, z: 1 };
      const M = e.majorAxis;
      const mn = { x: (n.y * M.z - n.z * M.y) * e.ratio, y: (n.z * M.x - n.x * M.z) * e.ratio, z: (n.x * M.y - n.y * M.x) * e.ratio };
      const P = (t: number) => apply(m, e.center.x + M.x * Math.cos(t) + mn.x * Math.sin(t), e.center.y + M.y * Math.cos(t) + mn.y * Math.sin(t), e.center.z + M.z * Math.cos(t) + mn.z * Math.sin(t));
      out.push({ ...apply(m, e.center.x, e.center.y, e.center.z), kind: 'cen' });
      const full = Math.abs(e.endParam - e.startParam - Math.PI * 2) < 1e-9 || Math.abs(e.endParam - e.startParam) < 1e-12;
      const sweep = full ? Math.PI * 2 : ccwSweep(e.startParam, e.endParam);
      for (let k = 0; k < 4; k++) {
        const t = (k * Math.PI) / 2;
        if (full || ccwSweep(e.startParam, t) <= sweep + 1e-9) out.push({ ...P(t), kind: 'qua' });
      }
      if (!full) out.push({ ...P(e.startParam), kind: 'end' }, { ...P(e.startParam + sweep), kind: 'end' }, { ...P(e.startParam + sweep / 2), kind: 'mid' });
      return;
    }
    case 'LWPOLYLINE':
      polySnaps(withOcs(m, e.extrusion), lwVertices(e), e.closed, e.elevation, out);
      return;
    case 'POLYLINE': {
      const vs = polyVertices(e).filter((v) => !(v.flags & 16) && !(v.faceIndices && !(v.flags & 64)));
      if (e.kind === '2d') polySnaps(withOcs(m, e.extrusion), vs.map((v) => ({ x: v.location.x, y: v.location.y, bulge: e.flags & 2 ? 0 : v.bulge })), (e.flags & 1) !== 0, e.elevation, out);
      else for (const v of vs) out.push({ ...apply(m, v.location.x, v.location.y, v.location.z), kind: 'end' });
      return;
    }
    case 'SPLINE': {
      let pts: number[];
      if (ctrlCount(e) >= 2) pts = nurbsPoints(e.degree, e.knots, splineCtrl(e), e.weights, 1e9);
      else if (fitCount(e) >= 2) {
        const s = fitPointsCurve(e);
        pts = nurbsPoints(s.degree, s.knots, s.ctrl, undefined, 1e9);
      } else return;
      if (!(e.flags & 1)) {
        out.push({ ...apply(m, pts[0]!, pts[1]!, pts[2]!), kind: 'end' });
        out.push({ ...apply(m, pts[pts.length - 3]!, pts[pts.length - 2]!, pts[pts.length - 1]!), kind: 'end' });
      }
      for (const f of splineFit(e)) out.push({ ...apply(m, f.x, f.y, f.z), kind: 'nod' });
      return;
    }
    case 'POINT':
      out.push({ ...apply(m, e.position.x, e.position.y, e.position.z), kind: 'nod' });
      return;
    case 'TEXT':
    case 'ATTRIB':
    case 'ATTDEF': {
      const p = e.alignPoint && (e.halign !== 0 || e.valign !== 0) && e.halign !== 3 && e.halign !== 5 ? e.alignPoint : e.insert;
      out.push({ ...apply(withOcs(m, e.extrusion), p.x, p.y, p.z), kind: 'ins' });
      return;
    }
    case 'MTEXT':
      out.push({ ...apply(m, e.insert.x, e.insert.y, e.insert.z), kind: 'ins' });
      return;
    case 'INSERT': {
      const om = withOcs(m, e.extrusion);
      out.push({ ...apply(om, e.insert.x, e.insert.y, e.insert.z), kind: 'ins' });
      for (const a of e.attribs) entitySnaps(doc, a, m, out, depth + 1);
      if (depth >= 3) return;
      const b = doc.blocks.get(tableKey(e.block));
      if (!b || b.entities.length > 400) return;
      const local = multiply(translation(e.insert.x, e.insert.y, e.insert.z), multiply(rotationZ(e.rotation), scaling(e.scale.x || 1, e.scale.y || 1, e.scale.z || 1)));
      const bm = multiply(om, multiply(local, translation(-b.basePoint.x, -b.basePoint.y, -b.basePoint.z)));
      for (const c of b.entities) if (c.type !== 'ATTDEF') entitySnaps(doc, c, bm, out, depth + 1);
      return;
    }
    case 'DIMENSION':
      for (const p of [e.defPoint, e.defPoint2, e.defPoint3, e.defPoint4]) if (p.x || p.y || p.z) out.push({ ...apply(m, p.x, p.y, p.z), kind: 'nod' });
      return;
    case 'SOLID':
    case 'TRACE': {
      const om = withOcs(m, e.extrusion);
      for (const p of e.points) out.push({ ...apply(om, p.x, p.y, p.z), kind: 'end' });
      return;
    }
    case '3DFACE':
      for (const p of e.points) out.push({ ...apply(m, p.x, p.y, p.z), kind: 'end' });
      return;
    case 'LEADER':
      for (const p of leaderVertices(e)) out.push({ ...apply(m, p.x, p.y, p.z), kind: 'end' });
      return;
    case 'MULTILEADER':
      for (const l of e.context.leaders) {
        for (const ln of l.lines) for (const p of ln.vertices) out.push({ ...apply(m, p.x, p.y, p.z), kind: 'end' });
        if (l.lastLeaderPoint) out.push({ ...apply(m, l.lastLeaderPoint.x, l.lastLeaderPoint.y, l.lastLeaderPoint.z), kind: 'end' });
      }
      return;
    case 'VIEWPORT': {
      const c = e.center;
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ] as const)
        out.push({ ...apply(m, c.x + (sx * e.width) / 2, c.y + (sy * e.height) / 2, c.z), kind: 'end' });
      return;
    }
    default:
      return;
  }
}


/** Tab으로 도는 스냅 후보의 최대 개수 */
const MAX_CYCLE = 24;

const PRIORITY: Record<string, number> = { end: 0, int: 0, cen: 1, mid: 1, qua: 1, ins: 1, nod: 1, gcen: 1, per: 2, tan: 2, app: 2, ext: 3, par: 3, nea: 5 };

function segInter(a: number[], i: number, j: number): Pt | null {
  const x1 = a[i]!;
  const y1 = a[i + 1]!;
  const x2 = a[i + 2]!;
  const y2 = a[i + 3]!;
  const x3 = a[j]!;
  const y3 = a[j + 1]!;
  const x4 = a[j + 2]!;
  const y4 = a[j + 3]!;
  const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(d) < 1e-18) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / d;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
}

/** 2×2 부분이 뒤집힌(대칭) 변환인지 */
function mirrored(m: Mat): boolean {
  return m[0]! * m[5]! - m[1]! * m[4]! < 0;
}

/** 객체 좌표의 반시계 호를 도면 좌표의 반시계 호로(OCS가 뒤집혀 있으면 방향이 바뀐다) */
function worldArc(m: Mat, cx: number, cy: number, z: number, r: number, a0: number, sweep: number): { cx: number; cy: number; r: number; a0: number; sweep: number } {
  const c = applyXY(m, cx, cy, z);
  const s = applyXY(m, cx + r * Math.cos(a0), cy + r * Math.sin(a0), z);
  const e = applyXY(m, cx + r * Math.cos(a0 + sweep), cy + r * Math.sin(a0 + sweep), z);
  const rr = Math.hypot(s.x - c.x, s.y - c.y);
  const from = mirrored(m) ? e : s;
  return { cx: c.x, cy: c.y, r: rr, a0: Math.atan2(from.y - c.y, from.x - c.x), sweep };
}

/** 각 a가 반시계 호(a0에서 sweep) 안에 드는지 */
function onArc(a: number, a0: number, sweep: number): boolean {
  return sweep >= Math.PI * 2 - 1e-12 || ccwSweep(a0, a) <= sweep + 1e-9 || Math.abs(ccwSweep(a0, a) - Math.PI * 2) < 1e-9;
}

/** 연장선 획득점이 될 수 있는 객체의 끝(선·호·열린 폴리선) */
export function extAnchorsOf(e: Entity): ExtAnchor[] {
  switch (e.type) {
    case 'LINE': {
      const dx = e.end.x - e.start.x;
      const dy = e.end.y - e.start.y;
      const l = Math.hypot(dx, dy);
      if (l < 1e-12) return [];
      return [
        { p: { x: e.start.x, y: e.start.y }, dir: { x: -dx / l, y: -dy / l } },
        { p: { x: e.end.x, y: e.end.y }, dir: { x: dx / l, y: dy / l } },
      ];
    }
    case 'ARC': {
      const m = withOcs(identity(), e.extrusion);
      const a = worldArc(m, e.center.x, e.center.y, e.center.z, e.radius, e.startAngle, ccwSweep(e.startAngle, e.endAngle));
      const P = (t: number) => ({ x: a.cx + a.r * Math.cos(t), y: a.cy + a.r * Math.sin(t) });
      return [
        { p: P(a.a0), arc: a },
        { p: P(a.a0 + a.sweep), arc: a },
      ];
    }
    case 'LWPOLYLINE': {
      if (e.closed) return [];
      const vs = lwVertices(e);
      if (vs.length < 2) return [];
      const m = withOcs(identity(), e.extrusion);
      const end = (i: number, j: number, bulgeFrom: number): ExtAnchor | null => {
        // i = 끝 정점, j = 이웃 정점. 끝 선분의 볼록도는 bulgeFrom 정점의 것(앞 정점에서 뒤 정점으로)
        const a = vs[i]!;
        const b = vs[j]!;
        const pa = applyXY(m, a.x, a.y, e.elevation);
        const pb = applyXY(m, b.x, b.y, e.elevation);
        const bulge = vs[bulgeFrom]!.bulge;
        const first = i < j ? a : b;
        const second = i < j ? b : a;
        const arc = bulgeArc(first.x, first.y, second.x, second.y, bulge);
        // 볼록도 호의 사잇각은 부호가 있다(음수 = 시계 방향): 반시계 호로 바꾼다
        if (arc) return { p: pa, arc: worldArc(m, arc.cx, arc.cy, e.elevation, arc.r, arc.sweep < 0 ? arc.a0 + arc.sweep : arc.a0, Math.abs(arc.sweep)) };
        const l = Math.hypot(pa.x - pb.x, pa.y - pb.y);
        return l < 1e-12 ? null : { p: pa, dir: { x: (pa.x - pb.x) / l, y: (pa.y - pb.y) / l } };
      };
      const n = vs.length;
      return [end(0, 1, 0), end(n - 1, n - 2, n - 2)].filter((x): x is ExtAnchor => !!x);
    }
    default:
      return [];
  }
}

/** 커서 근처(aperture 안)의 연장선 획득점 후보 */
export function findExtAnchor(picker: Picker, p: Pt, aperture: number): ExtAnchor | null {
  let best: ExtAnchor | null = null;
  let bd = Infinity;
  for (const c of picker.candidates(p.x, p.y, aperture).slice(0, 200)) {
    const e = picker.entity(c.handle);
    if (!e) continue;
    for (const a of extAnchorsOf(e)) {
      const d = Math.hypot(a.p.x - p.x, a.p.y - p.y);
      if (d <= aperture && d < bd) {
        bd = d;
        best = a;
      }
    }
  }
  return best;
}

/** 커서 아래 선분의 방향(평행 획득). 없으면 null */
export function segmentDirAt(picker: Picker, p: Pt, aperture: number): { dir: Pt; at: Pt } | null {
  const s = picker.segmentsNear(p.x, p.y, aperture, 50);
  let best: { dir: Pt; at: Pt } | null = null;
  let bd = Infinity;
  for (let i = 0; i + 3 < s.length; i += 4) {
    const dx = s[i + 2]! - s[i]!;
    const dy = s[i + 3]! - s[i + 1]!;
    const l2 = dx * dx + dy * dy;
    if (l2 < 1e-24) continue;
    const t = Math.max(0, Math.min(1, ((p.x - s[i]!) * dx + (p.y - s[i + 1]!) * dy) / l2));
    const q = { x: s[i]! + dx * t, y: s[i + 1]! + dy * t };
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < bd) {
      bd = d;
      const l = Math.sqrt(l2);
      best = { dir: { x: dx / l, y: dy / l }, at: q };
    }
  }
  return best;
}

/** 연장선 스냅 후보: 선분 끝의 바깥 연장, 호의 원 위 연장, 두 연장선의 교점 */
export function extSnaps(anchors: readonly ExtAnchor[], p: Pt, aperture: number): SnapPoint[] {
  const out: SnapPoint[] = [];
  const rays: { from: Pt; dir: Pt }[] = [];
  for (const a of anchors) {
    if (a.dir) {
      const t = (p.x - a.p.x) * a.dir.x + (p.y - a.p.y) * a.dir.y;
      if (t <= 0) continue;
      rays.push({ from: a.p, dir: a.dir });
      const q = { x: a.p.x + a.dir.x * t, y: a.p.y + a.dir.y * t };
      if (Math.hypot(q.x - p.x, q.y - p.y) <= aperture) out.push({ ...q, kind: 'ext', lines: [{ from: a.p, dir: a.dir }] });
    } else if (a.arc) {
      const c = a.arc;
      const ang = Math.atan2(p.y - c.cy, p.x - c.cx);
      if (Math.abs(Math.hypot(p.x - c.cx, p.y - c.cy) - c.r) > aperture || onArc(ang, c.a0, c.sweep)) continue;
      out.push({ x: c.cx + c.r * Math.cos(ang), y: c.cy + c.r * Math.sin(ang), kind: 'ext' });
    }
  }
  // 두 연장선이 만나는 점
  for (let i = 0; i < rays.length; i++)
    for (let j = i + 1; j < rays.length; j++) {
      const A = rays[i]!;
      const B = rays[j]!;
      const den = A.dir.x * B.dir.y - A.dir.y * B.dir.x;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((B.from.x - A.from.x) * B.dir.y - (B.from.y - A.from.y) * B.dir.x) / den;
      const u = ((B.from.x - A.from.x) * A.dir.y - (B.from.y - A.from.y) * A.dir.x) / den;
      if (t <= 0 || u <= 0) continue;
      const q = { x: A.from.x + A.dir.x * t, y: A.from.y + A.dir.y * t };
      if (Math.hypot(q.x - p.x, q.y - p.y) <= aperture) out.push({ ...q, kind: 'ext', lines: [A, B] });
    }
  return out;
}

/** 평행 스냅 후보: 기준점에서 획득한 방향(앞뒤)으로 나가는 선 위 */
export function parSnaps(base: Pt, dirs: readonly Pt[], p: Pt, aperture: number): SnapPoint[] {
  const out: SnapPoint[] = [];
  for (const d of dirs)
    for (const s of [1, -1]) {
      const u = { x: d.x * s, y: d.y * s };
      const vx = p.x - base.x;
      const vy = p.y - base.y;
      const t = vx * u.x + vy * u.y;
      if (t <= 0) continue;
      if (Math.abs(vx * u.y - vy * u.x) > aperture) continue;
      out.push({ x: base.x + u.x * t, y: base.y + u.y * t, kind: 'par', lines: [{ from: base, dir: u }] });
    }
  return out;
}

/** 기준점에서 원(중심 c, 반지름 r)에 그은 접선의 접점들. 기준점이 원 안이면 없음 */
export function tangentPoints(base: Pt, c: Pt, r: number): Pt[] {
  const dx = base.x - c.x;
  const dy = base.y - c.y;
  const d = Math.hypot(dx, dy);
  if (r <= 0 || d <= r * (1 + 1e-12)) return [];
  const th = Math.atan2(dy, dx);
  const ph = Math.acos(r / d);
  return [th + ph, th - ph].map((a) => ({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) }));
}

/** 닫힌 꼭짓점 목록(볼록도 포함)의 면적 중심. 면적이 0이면 null */
export function polygonCentroid(vs: readonly { x: number; y: number; bulge: number }[]): Pt | null {
  const pts: number[] = [];
  const n = vs.length;
  for (let i = 0; i < n; i++) {
    const a = vs[i]!;
    const b = vs[(i + 1) % n]!;
    const arc = bulgeArc(a.x, a.y, b.x, b.y, a.bulge);
    if (arc) {
      // 호를 앞 정점에서 뒤 정점 쪽으로(사잇각은 부호가 있다) 잘게 나눈다. 끝점은 다음 정점이 넣는다
      const k = Math.max(4, Math.ceil(Math.abs(arc.sweep) / (Math.PI / 32)));
      for (let t = 0; t < k; t++) pts.push(arc.cx + arc.r * Math.cos(arc.a0 + (arc.sweep * t) / k), arc.cy + arc.r * Math.sin(arc.a0 + (arc.sweep * t) / k));
    } else pts.push(a.x, a.y);
  }
  let A = 0;
  let cx = 0;
  let cy = 0;
  const m = pts.length / 2;
  for (let i = 0; i < m; i++) {
    const x0 = pts[i * 2]!;
    const y0 = pts[i * 2 + 1]!;
    const x1 = pts[((i + 1) % m) * 2]!;
    const y1 = pts[((i + 1) % m) * 2 + 1]!;
    const f = x0 * y1 - x1 * y0;
    A += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  if (Math.abs(A) < 1e-18) return null;
  return { x: cx / (3 * A), y: cy / (3 * A) };
}

/** 닫힌 폴리선의 기하학적 중심(도면 좌표, z는 폴리선 평면 위 — 객체 스냅의 Z). 닫히지 않았으면 null */
export function geometricCenter(e: Entity): (Pt & { z: number }) | null {
  if (e.type === 'LWPOLYLINE') {
    if (!e.closed) return null;
    const c = polygonCentroid(lwVertices(e));
    return c ? apply(withOcs(identity(), e.extrusion), c.x, c.y, e.elevation) : null;
  }
  if (e.type === 'POLYLINE' && e.kind === '2d' && e.flags & 1) {
    const vs = polyVertices(e)
      .filter((v) => !(v.flags & 16))
      .map((v) => ({ x: v.location.x, y: v.location.y, bulge: e.flags & 2 ? 0 : v.bulge }));
    const c = polygonCentroid(vs);
    return c ? apply(withOcs(identity(), e.extrusion), c.x, c.y, e.elevation) : null;
  }
  return null;
}

/** 도면 좌표의 원·호(반시계 호: 시작 각·사잇각, 원이면 사잇각 2π) */
export interface WorldCircle {
  cx: number;
  cy: number;
  r: number;
  a0: number;
  sweep: number;
}

const onCircle = (c: WorldCircle, q: Pt) => onArc(Math.atan2(q.y - c.cy, q.x - c.cx), c.a0, c.sweep);

/**
 * 지연된 접점 하나 풀기: 점 p에서 원·호 c에 그은 접선의 접점 중 원·호 위에 있고 찍은 자리(pick)에 가까운 것.
 * p가 원 안이거나 접점이 호 밖이면 null
 */
export function tangentFrom(c: WorldCircle, pick: Pt, p: Pt): Pt | null {
  let best: Pt | null = null;
  for (const q of tangentPoints(p, { x: c.cx, y: c.cy }, c.r)) if (onCircle(c, q) && (!best || Math.hypot(q.x - pick.x, q.y - pick.y) < Math.hypot(best.x - pick.x, best.y - pick.y))) best = q;
  return best;
}

/**
 * 지연된 접점 둘 풀기: 두 원·호의 공통 접선(바깥 둘·안쪽 둘) 중 두 접점이 원·호 위에 있고 찍은 자리에 가장 가까운 것.
 * 그런 접선이 없으면(한 원이 다른 원 안, 같은 중심) null
 */
export function commonTangent(c1: WorldCircle, pick1: Pt, c2: WorldCircle, pick2: Pt): [Pt, Pt] | null {
  const dx = c2.cx - c1.cx;
  const dy = c2.cy - c1.cy;
  const D2 = dx * dx + dy * dy;
  if (D2 < 1e-24) return null;
  let best: [Pt, Pt] | null = null;
  let bd = Infinity;
  for (const s of [1, -1]) {
    // 접선 n·x + k = 0(|n| = 1): c1까지 r1, c2까지 s·r2 → n·(c2 − c1) = s·r2 − r1
    const dr = s * c2.r - c1.r;
    const h2 = D2 - dr * dr;
    if (h2 < -1e-12 * D2) continue;
    const h = Math.sqrt(Math.max(0, h2));
    for (const t of h > 1e-12 ? [1, -1] : [1]) {
      const nx = (dx * dr - t * dy * h) / D2;
      const ny = (dy * dr + t * dx * h) / D2;
      const T1 = { x: c1.cx - nx * c1.r, y: c1.cy - ny * c1.r };
      const T2 = { x: c2.cx - nx * s * c2.r, y: c2.cy - ny * s * c2.r };
      if (Math.hypot(T2.x - T1.x, T2.y - T1.y) < 1e-12 || !onCircle(c1, T1) || !onCircle(c2, T2)) continue;
      const d = Math.hypot(T1.x - pick1.x, T1.y - pick1.y) + Math.hypot(T2.x - pick2.x, T2.y - pick2.y);
      if (d < bd) {
        bd = d;
        best = [T1, T2];
      }
    }
  }
  return best;
}

/** 원·호(도면 좌표)와 호 범위 — 접점·중심 테두리 스냅용 */
export function circleOf(e: Entity): WorldCircle | null {
  if (e.type === 'CIRCLE') {
    const c = applyXY(withOcs(identity(), e.extrusion), e.center.x, e.center.y, e.center.z);
    return { cx: c.x, cy: c.y, r: e.radius, a0: 0, sweep: Math.PI * 2 };
  }
  if (e.type === 'ARC') return worldArc(withOcs(identity(), e.extrusion), e.center.x, e.center.y, e.center.z, e.radius, e.startAngle, ccwSweep(e.startAngle, e.endAngle));
  return null;
}

/** 접점이 잡히는 곡선 조각: 원·호, 타원·타원호, 스플라인(NURBS) */
export type TanCurve = ArcPiece | EllPiece | NurbsPiece;

/**
 * 접점이 잡히는 객체(원·호·폴리선 호 구간·타원·타원호·스플라인, 원 그리기에서는 선·구성선·광선도)의 평면도 조각.
 * AutoCAD 객체 스냅 설명처럼 접점은 원·호·타원·타원호·폴리선 호·스플라인에 잡힌다
 */
function tanPieces(e: Entity, lines: boolean): (TanCurve | LinePiece)[] {
  const ok =
    e.type === 'CIRCLE' ||
    e.type === 'ARC' ||
    e.type === 'ELLIPSE' ||
    e.type === 'SPLINE' ||
    e.type === 'LWPOLYLINE' ||
    (e.type === 'POLYLINE' && (e.kind === '2d' || (lines && e.kind === '3d'))) ||
    (lines && (e.type === 'LINE' || e.type === 'XLINE' || e.type === 'RAY'));
  if (!ok) return [];
  const path = entityPath(e);
  if (!path) return [];
  return path.pieces.filter((pc): pc is TanCurve | LinePiece => pc.k === 'arc' || pc.k === 'ell' || pc.k === 'nurbs' || (lines && pc.k === 'line' && Math.hypot(pc.b.x - pc.a.x, pc.b.y - pc.a.y) > 0));
}

/**
 * 지연된 접점 하나 풀기(원·호·타원·스플라인): 점 p에서 곡선에 그은 접선의 접점 중 곡선 범위 안에 있고 찍은 자리(pick)에 가까운 것.
 * 원·호는 tangentFrom과 같다. 없으면 null
 */
export function tangentFromCurve(c: TanCurve, pick: Pt, p: Pt): Pt | null {
  if (c.k === 'arc') return tangentFrom(arcPieceCircle(c), pick, p);
  return tangentNearPick(c, pick, p);
}

/**
 * 지연된 접점 둘 풀기: 두 곡선의 공통 접선 중 두 접점이 곡선 범위 안에 있고 찍은 자리에 가장 가까운 것.
 * 둘 다 원·호면 해석적(commonTangent), 타원·스플라인이 끼면 수치(src/edit/geom/tangent.ts). 없으면 null
 */
export function commonTangentOf(c1: TanCurve, pick1: Pt, c2: TanCurve, pick2: Pt): [Pt, Pt] | null {
  if (c1.k === 'arc' && c2.k === 'arc') return commonTangent(arcPieceCircle(c1), pick1, arcPieceCircle(c2), pick2);
  return commonTangentCurves(c1, pick1, c2, pick2);
}

/** 호 조각(부호 있는 중심각)을 도면 좌표의 반시계 원·호로 */
export function arcPieceCircle(pc: ArcPiece): WorldCircle {
  const full = Math.abs(pc.sw) >= Math.PI * 2 - 1e-12;
  if (full) return { cx: pc.c.x, cy: pc.c.y, r: pc.r, a0: 0, sweep: Math.PI * 2 };
  return { cx: pc.c.x, cy: pc.c.y, r: pc.r, a0: pc.sw < 0 ? pc.a0 + pc.sw : pc.a0, sweep: Math.abs(pc.sw) };
}

/** 선 조각에서 p에 가장 가까운 점(무한한 쪽은 자르지 않는다) */
function nearestOnLine(pc: LinePiece, p: Pt): Pt {
  const dx = pc.b.x - pc.a.x;
  const dy = pc.b.y - pc.a.y;
  let t = ((p.x - pc.a.x) * dx + (p.y - pc.a.y) * dy) / (dx * dx + dy * dy);
  if (!pc.inf0 && t < 0) t = 0;
  if (!pc.inf1 && t > 1) t = 1;
  return { x: pc.a.x + dx * t, y: pc.a.y + dy * t };
}

/**
 * 접점 대상 조각: 객체에서 pick에 가장 가까운 원·호·폴리선 호 구간·타원·타원호·스플라인(lines면 선·폴리선 직선 구간·구성선·광선도).
 * 지연된 접점을 받은 명령이 스냅 점(객체 위)으로 대상을 다시 찾는다. 대상이 아니면 null
 */
export function tanPieceAt(e: Entity, pick: Pt, lines = false): TanCurve | LinePiece | null {
  let best: TanCurve | LinePiece | null = null;
  let bd = Infinity;
  for (const pc of tanPieces(e, lines)) {
    let d: number;
    if (pc.k === 'arc') {
      const c = arcPieceCircle(pc);
      const a = Math.atan2(pick.y - c.cy, pick.x - c.cx);
      // 호 밖이면 가까운 끝까지
      d = onArc(a, c.a0, c.sweep)
        ? Math.abs(Math.hypot(pick.x - c.cx, pick.y - c.cy) - c.r)
        : Math.min(...[c.a0, c.a0 + c.sweep].map((t) => Math.hypot(pick.x - c.cx - c.r * Math.cos(t), pick.y - c.cy - c.r * Math.sin(t))));
    } else if (pc.k === 'line') {
      const q = nearestOnLine(pc, pick);
      d = Math.hypot(q.x - pick.x, q.y - pick.y);
    } else d = pieceNearest(pc, pick).d;
    if (d < bd - 1e-12) {
      bd = d;
      best = pc;
    }
  }
  return best;
}

/** 지연된 접점 스냅: 커서에서 가장 가까운 접점 대상 위 점(호는 호 범위 안일 때만)과 커서까지 거리 */
function deferredTanNear(e: Entity, p: Pt, lines: boolean): { q: Pt; d: number } | null {
  let best: { q: Pt; d: number } | null = null;
  for (const pc of tanPieces(e, lines)) {
    let q: Pt;
    let d: number;
    if (pc.k === 'arc') {
      const c = arcPieceCircle(pc);
      const a = Math.atan2(p.y - c.cy, p.x - c.cx);
      if (!onArc(a, c.a0, c.sweep)) continue;
      q = { x: c.cx + c.r * Math.cos(a), y: c.cy + c.r * Math.sin(a) };
      d = Math.abs(Math.hypot(p.x - c.cx, p.y - c.cy) - c.r);
    } else if (pc.k === 'line') {
      q = nearestOnLine(pc, p);
      d = Math.hypot(q.x - p.x, q.y - p.y);
    } else {
      // 타원·스플라인: 곡선 위 가장 가까운 점(범위 안)
      const n = pieceNearest(pc, p);
      q = n.p;
      d = n.d;
    }
    if (!best || d < best.d) best = { q, d };
  }
  return best;
}

/** 커서 근처의 스냅점(가장 알맞은 것). ctx는 연장선·평행 획득점(앱이 모은다) */
export function findSnap(doc: CadDocument, picker: Picker, p: Pt, aperture: number, modes: ReadonlySet<SnapKind>, base?: Pt | null, ctx?: SnapContext): SnapPoint | null {
  return findSnaps(doc, picker, p, aperture, modes, base, ctx)[0] ?? null;
}

/**
 * 커서 근처의 스냅점 후보 전부(알맞은 차례 — 거리와 종류 우선순위). 같은 자리의 후보는 하나만 둔다.
 * 겹친 후보는 스냅 표식 위에서 Tab으로 돈다(AutoCAD와 같다). 첫 후보가 findSnap의 결과다.
 */
/**
 * 두 스냅 목록(각 findSnaps 결과)을 점수 차례로 합친다(같은 자리는 하나만, 앞의 MAX_CYCLE개).
 * scores는 findSnaps가 채운 점수(커서까지 거리 / 조준창 + 종류 차례) — 조준창으로 나눈 값이라 축척이 다른 공간끼리 견줄 수 있다
 */
export function mergeSnaps(a: readonly SnapPoint[], b: readonly SnapPoint[], scores: ReadonlyMap<SnapPoint, number>, aperture: number): SnapPoint[] {
  if (!b.length) return [...a];
  const all = [...a, ...b].map((s, i) => ({ s, i, score: scores.get(s) ?? Infinity }));
  all.sort((x, y) => x.score - y.score || x.i - y.i);
  const out: SnapPoint[] = [];
  const eps = aperture * 1e-6;
  for (const { s } of all) {
    if (out.length >= MAX_CYCLE) break;
    if (!out.some((o) => Math.abs(o.x - s.x) <= eps && Math.abs(o.y - s.y) <= eps)) out.push(s);
  }
  return out;
}

/** scores를 주면 돌려준 점마다 그 점수를 담는다(mergeSnaps) */
export function findSnaps(doc: CadDocument, picker: Picker, p: Pt, aperture: number, modes: ReadonlySet<SnapKind>, base?: Pt | null, ctx?: SnapContext, scores?: Map<SnapPoint, number>): SnapPoint[] {
  if (!modes.size) return [];
  const cands = picker.candidates(p.x, p.y, aperture);
  const found: { s: SnapPoint; score: number }[] = [];
  /** d: 커서까지의 거리(테두리로 잡는 중심은 조준창의 절반으로 친다) */
  const considerAt = (s: SnapPoint, d: number) => {
    if (!modes.has(s.kind)) return;
    if (d > aperture) return;
    found.push({ s, score: d / aperture + (PRIORITY[s.kind] ?? 1) * 0.15 });
  };
  const consider = (s: SnapPoint) => considerAt(s, Math.hypot(s.x - p.x, s.y - p.y));
  // 평면도에서 구한 점(교차점·근처점·수직·접점)이 놓인 객체: 후보를 고른 뒤 그 객체 위의 Z를 단다(snapz.ts)
  const objs = new Map<SnapPoint, (string | undefined)[]>();
  const onObj = (s: SnapPoint, ...hs: (string | undefined)[]): SnapPoint => {
    objs.set(s, hs);
    return s;
  };
  const m = identity();
  for (const c of cands.slice(0, 200)) {
    const e = picker.entity(c.handle);
    if (!e) continue;
    const pts: SnapPoint[] = [];
    entitySnaps(doc, e, m, pts);
    for (const s of pts) consider({ ...s, handle: c.handle });
    // 테두리 위에 커서가 있으면 중심·기하학적 중심(AutoCAD와 같다)
    const round = e.type === 'CIRCLE' || e.type === 'ARC' || e.type === 'ELLIPSE';
    const poly = e.type === 'LWPOLYLINE' || e.type === 'POLYLINE';
    if (((round && modes.has('cen')) || (poly && modes.has('gcen'))) && picker.distance(c.handle, p.x, p.y) <= aperture) {
      if (poly) {
        const g = geometricCenter(e);
        if (g) considerAt({ ...g, kind: 'gcen', handle: c.handle }, aperture * 0.5);
      } else if (round) {
        const cp = apply(withOcs(m, e.extrusion), e.center.x, e.center.y, e.center.z);
        considerAt({ ...cp, kind: 'cen', handle: c.handle }, aperture * 0.5);
      }
    }
    if (modes.has('tan') && (base || ctx?.deferTan)) {
      if (ctx?.deferTan) {
        // 지연된 접점: 커서에서 가장 가까운 원·호(폴리선 호 구간 포함, 원 그리기는 선도) 위 점 — 접점은 명령이 다음 점을 받은 뒤 구한다
        const t = deferredTanNear(e, p, !!ctx.deferTanLines);
        if (t) considerAt({ ...t.q, kind: 'tan', handle: c.handle, deferred: true }, t.d);
      } else if (base && (e.type !== 'SPLINE' || picker.distance(c.handle, p.x, p.y) <= aperture))
        // 스플라인은 접점을 근 찾기로 구하므로, 커서가 그 곡선 가까이(조준창 안)일 때만 — 접점은 곡선 위라 그보다 멀면 잡히지 않는다
        for (const pc of tanPieces(e, false)) {
          if (pc.k === 'arc') {
            const circ = arcPieceCircle(pc);
            for (const q of tangentPoints(base, { x: circ.cx, y: circ.cy }, circ.r))
              if (onArc(Math.atan2(q.y - circ.cy, q.x - circ.cx), circ.a0, circ.sweep)) consider(onObj({ ...q, kind: 'tan', handle: c.handle }, c.handle));
          } else if (pc.k !== 'line') {
            // 타원·타원호(해석적)·스플라인(근 찾기): 기준점에서 그은 접선의 접점
            for (const s of tangentsFromPoint(pc, base)) consider(onObj({ ...s.p, kind: 'tan', handle: c.handle }, c.handle));
          }
        }
    }
  }
  if (modes.has('ext') && ctx?.ext?.length) for (const s of extSnaps(ctx.ext, p, aperture)) consider(s);
  if (modes.has('par') && base && ctx?.par?.length) for (const s of parSnaps(base, ctx.par, p, aperture)) consider(s);
  const needSegs = modes.has('int') || modes.has('nea') || (modes.has('per') && base);
  if (needSegs) {
    // 선분마다 그 객체(교차점·근처점·수직의 Z를 구한다 — 후보가 정해진 뒤 앞의 것만)
    const owners: string[] = [];
    const segs = picker.segmentsNear(p.x, p.y, aperture, 800, owners);
    const n = segs.length / 4;
    const own = (i: number) => (owners.length === n ? owners[i] : undefined);
    if (modes.has('int') && n > 1) {
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) {
          const q = segInter(segs, i * 4, j * 4);
          if (!q) continue;
          // 같은 꺾은선의 이어진 꼭짓점은 교차점이 아니다
          const shared =
            (Math.abs(q.x - segs[i * 4]!) < 1e-12 && Math.abs(q.y - segs[i * 4 + 1]!) < 1e-12) ||
            (Math.abs(q.x - segs[i * 4 + 2]!) < 1e-12 && Math.abs(q.y - segs[i * 4 + 3]!) < 1e-12);
          const shared2 =
            (Math.abs(q.x - segs[j * 4]!) < 1e-12 && Math.abs(q.y - segs[j * 4 + 1]!) < 1e-12) ||
            (Math.abs(q.x - segs[j * 4 + 2]!) < 1e-12 && Math.abs(q.y - segs[j * 4 + 3]!) < 1e-12);
          if (shared && shared2) continue;
          consider(onObj({ ...q, kind: 'int' }, own(i), own(j)));
        }
    }
    if (modes.has('per') && base) {
      for (let i = 0; i < n; i++) {
        const x0 = segs[i * 4]!;
        const y0 = segs[i * 4 + 1]!;
        const x1 = segs[i * 4 + 2]!;
        const y1 = segs[i * 4 + 3]!;
        const dx = x1 - x0;
        const dy = y1 - y0;
        const l2 = dx * dx + dy * dy;
        if (l2 < 1e-24) continue;
        const t = ((base.x - x0) * dx + (base.y - y0) * dy) / l2;
        if (t < 0 || t > 1) continue;
        consider(onObj({ x: x0 + dx * t, y: y0 + dy * t, kind: 'per' }, own(i)));
      }
    }
    if (modes.has('nea') && !found.length) {
      for (let i = 0; i < n; i++) {
        const x0 = segs[i * 4]!;
        const y0 = segs[i * 4 + 1]!;
        const x1 = segs[i * 4 + 2]!;
        const y1 = segs[i * 4 + 3]!;
        const dx = x1 - x0;
        const dy = y1 - y0;
        const l2 = dx * dx + dy * dy;
        const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - x0) * dx + (p.y - y0) * dy) / l2)) : 0;
        consider(onObj({ x: x0 + dx * t, y: y0 + dy * t, kind: 'nea' }, own(i)));
      }
    }
  }
  if (modes.has('app')) {
    // 가상 교차점: 근처 객체의 곡선을 늘린 것(선 → 무한선, 호 → 원, 타원호 → 타원)끼리의 정확한 교점(snap-app.ts)
    for (const q of apparentSnaps(doc, picker, p, aperture)) consider({ x: q.x, y: q.y, kind: 'app', handle: q.handle, handle2: q.handle2 });
  }
  // 알맞은 차례(점수가 같으면 먼저 찾은 것), 같은 자리는 하나만. Tab으로 돌 후보는 앞의 MAX_CYCLE개면 된다(촘촘한 해치 위에서도 가볍게)
  found.sort((a, b) => a.score - b.score);
  const out: SnapPoint[] = [];
  const eps = aperture * 1e-6;
  for (const { s, score } of found) {
    if (out.length >= MAX_CYCLE) break;
    if (!out.some((o) => Math.abs(o.x - s.x) <= eps && Math.abs(o.y - s.y) <= eps)) {
      out.push(s);
      scores?.set(s, score);
    }
  }
  for (const s of out) {
    const hs = objs.get(s);
    if (!hs) continue;
    const zs = hs.map((h) => {
      const e = h ? picker.entity(h) : undefined;
      return e ? entityZAt(e, s) : undefined;
    });
    // 교차점은 두 객체가 그 자리에서 같은 Z를 지날 때만(3D에서도 만날 때). 평면도에서만 겹치면 Z 없이(지금 고도 — 전과 같다)
    const z = zs.length >= 2 ? intersectionZ(zs[0], zs[1]) : zs[0];
    if (z !== undefined) s.z = z;
  }
  return out;
}
