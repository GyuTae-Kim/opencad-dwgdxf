/**
 * 빠른 치수(QDIM): 고른 객체의 치수 점을 모아 연속·다중(엇갈림)·기준선·세로좌표·반지름·지름 치수를 한꺼번에 만든다.
 * 치수 점 = 선·폴리선 끝점과 꼭짓점, 호 끝점, 원 중심, 점, 블록 삽입점. 반지름·지름은 원과 호. 모두 평면도(WCS XY) 자리다.
 * 방향: 치수선 위치가 점들의 범위 위·아래면 수평(X 거리), 왼쪽·오른쪽이면 수직(Y 거리).
 */
import type { CadDocument, DimensionEntity, Entity, Vec3 } from '../../core/model';
import { maxOf, minOf } from '../../core/arrays';
import { createDiameterDimension, createLinearDimension, createOrdinateDimension, createRadialDimension } from '../dim/create';
import { dimVars } from '../dim/vars';
import { polyLocs } from '../../core/polyverts';
import type { Affine } from '../geom/math';
import { circleOf, lwPlanVertices, ocsPlan } from '../geom/ocs';

export interface P {
  x: number;
  y: number;
}

export type QdimMode = 'C' | 'S' | 'B' | 'O' | 'R' | 'D';

export interface QdimGeometry {
  points: P[];
  circles: { c: P; r: number }[];
}

const v3 = (q: P, z = 0): Vec3 => ({ x: q.x, y: q.y, z });

/** OCS 평면 점의 평면도 자리(평면 사상 m이 없으면 — 자연 +Z·기운 돌출 방향 — 그대로) */
const onPlan = (m: Affine | null, q: P): P => (m ? { x: m[0] * q.x + m[2] * q.y + m[4], y: m[1] * q.x + m[3] * q.y + m[5] } : q);

/**
 * 고른 객체의 치수 점과 원·호(평면도 자리).
 * LINE의 끝점과 POINT의 위치(10)는 WCS 값이고, CIRCLE·ARC의 중심(10)·각도(50·51), LWPOLYLINE의 꼭짓점(10), 2D POLYLINE의 정점,
 * INSERT의 삽입점(10)은 객체 OCS 값이다(DXF 참조서 OCS). 돌출 방향이 −Z(대칭으로 뒤집힌 객체)면 OCS X = WCS −X라 치수 명령과 같은
 * 평면 사상(`geom/ocs.ts`의 `ocsPlan`·`circleOf`·`lwPlanVertices`)으로 옮긴다(177차 — 전에는 치수 점·원 중심이 X 거울상 자리에 생겨
 * 연관이 붙지 않았고 편집(E)도 그 자리를 봤다). 호의 점은 OCS 시작·끝 각도의 점 차례다. 선·점과 자연 +Z·돌출 방향이 기운 객체는 전과 같은 값
 */
export function qdimGeometry(ents: readonly Entity[]): QdimGeometry {
  const points: P[] = [];
  const circles: { c: P; r: number }[] = [];
  const add = (q: { x: number; y: number }) => {
    if (!points.some((o) => Math.abs(o.x - q.x) < 1e-9 && Math.abs(o.y - q.y) < 1e-9)) points.push({ x: q.x, y: q.y });
  };
  for (const e of ents) {
    switch (e.type) {
      case 'LINE':
        add(e.start);
        add(e.end);
        break;
      case 'LWPOLYLINE': {
        // 평면도 꼭짓점(뒤집힌 평면이면 볼록도 부호도 뒤집혀 호 중심이 평면도 자리로 셈된다)
        const vs = lwPlanVertices(e).vs;
        for (const v of vs) add(v);
        for (let i = 0; i < vs.length; i++) {
          const a = vs[i]!;
          const b = vs[(i + 1) % vs.length]!;
          if (!a.bulge || (!e.closed && i === vs.length - 1)) continue;
          // 호 세그먼트: 중심·반지름
          const d = Math.hypot(b.x - a.x, b.y - a.y);
          if (!(d > 0)) continue;
          const th = 4 * Math.atan(a.bulge);
          const r = Math.abs(d / (2 * Math.sin(th / 2)));
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          const h = (r * Math.cos(th / 2)) * Math.sign(a.bulge);
          const nx = -(b.y - a.y) / d;
          const ny = (b.x - a.x) / d;
          circles.push({ c: { x: mx + nx * h, y: my + ny * h }, r });
        }
        break;
      }
      case 'POLYLINE': {
        // 2D 정점은 OCS, 3D·메시·폴리페이스 정점은 WCS
        const m = e.kind === '2d' ? ocsPlan(e.extrusion, e.elevation) : null;
        for (const p of polyLocs(e)) add(onPlan(m, p));
        break;
      }
      case 'ARC': {
        const m = ocsPlan(e.extrusion, e.center.z);
        add(onPlan(m, { x: e.center.x + e.radius * Math.cos(e.startAngle), y: e.center.y + e.radius * Math.sin(e.startAngle) }));
        add(onPlan(m, { x: e.center.x + e.radius * Math.cos(e.endAngle), y: e.center.y + e.radius * Math.sin(e.endAngle) }));
        const g = circleOf(e)!;
        circles.push({ c: { x: g.c.x, y: g.c.y }, r: g.r });
        break;
      }
      case 'CIRCLE': {
        const g = circleOf(e)!;
        add(g.c);
        circles.push({ c: { x: g.c.x, y: g.c.y }, r: g.r });
        break;
      }
      case 'POINT':
        add(e.position);
        break;
      case 'INSERT':
        add(onPlan(ocsPlan(e.extrusion, e.insert.z), e.insert));
        break;
      default:
        break;
    }
  }
  return { points, circles };
}

/** 치수선 위치로 방향 정하기: 0 = 수평(X 거리), π/2 = 수직 */
export function qdimRotation(points: readonly P[], at: P): number {
  if (!points.length) return 0;
  const xs = points.map((q) => q.x);
  const ys = points.map((q) => q.y);
  const minX = minOf(xs);
  const maxX = maxOf(xs);
  const minY = minOf(ys);
  const maxY = maxOf(ys);
  const outX = Math.max(0, minX - at.x, at.x - maxX);
  const outY = Math.max(0, minY - at.y, at.y - maxY);
  if (outX === 0 && outY === 0) return maxX - minX >= maxY - minY ? 0 : Math.PI / 2;
  return outY >= outX ? 0 : Math.PI / 2;
}

/** 측정 축 좌표로 정렬하고 같은 좌표는 하나만 */
function sortedAlong(points: readonly P[], horizontal: boolean): P[] {
  const k = (q: P) => (horizontal ? q.x : q.y);
  const s = [...points].sort((a, b) => k(a) - k(b));
  const span = s.length ? Math.max(1, Math.abs(k(s[s.length - 1]!) - k(s[0]!))) : 1;
  const out: P[] = [];
  for (const q of s) if (!out.length || Math.abs(k(q) - k(out[out.length - 1]!)) > 1e-9 * span) out.push(q);
  return out;
}

export interface QdimOptions {
  /** 기준선·세로좌표의 데이텀 점 */
  datum?: P | null;
  /** 데이텀 점이 없을 때 세로좌표의 데이텀: 지금 공간의 UCS 원점(없으면 모형 공간 UCS 원점 $UCSORG — createOrdinateDimension) */
  ucsOrigin?: Vec3;
  style?: string;
}

/** 치수 만들기(블록은 부르는 쪽이 만든다) */
export function qdimCreate(doc: CadDocument, mode: QdimMode, g: QdimGeometry, at: P, opt: QdimOptions = {}): DimensionEntity[] {
  const out: DimensionEntity[] = [];
  const style = opt.style;
  if (mode === 'R' || mode === 'D') {
    for (const c of g.circles) {
      const a = Math.atan2(at.y - c.c.y, at.x - c.c.x);
      const on = v3({ x: c.c.x + c.r * Math.cos(a), y: c.c.y + c.r * Math.sin(a) });
      out.push(mode === 'R' ? createRadialDimension(doc, v3(c.c), c.r, on, { style }) : createDiameterDimension(doc, v3(c.c), c.r, on, { style }));
    }
    return out;
  }
  const rot = qdimRotation(g.points, at);
  const hz = rot === 0;
  const pts = sortedAlong(g.points, hz);
  if (!pts.length) return out;
  const ys = g.points.map((q) => (hz ? q.y : q.x));
  const mid = (minOf(ys) + maxOf(ys)) / 2;
  const atN = hz ? at.y : at.x;
  const away = atN >= mid ? 1 : -1;
  const probe = createLinearDimension(doc, v3(pts[0]!), v3(pts[pts.length - 1]!), v3(at), { rotation: rot, style });
  const raw = dimVars(doc, probe);
  const step = (raw.dli > 0 ? raw.dli : raw.txt * 2) * away;
  const lineAt = (k: number): Vec3 => (hz ? { x: at.x, y: at.y + k * step, z: 0 } : { x: at.x + k * step, y: at.y, z: 0 });
  const lin = (a: P, b: P, k: number) => createLinearDimension(doc, v3(a), v3(b), lineAt(k), { rotation: rot, style });
  if (mode === 'C') {
    for (let i = 0; i + 1 < pts.length; i++) out.push(lin(pts[i]!, pts[i + 1]!, 0));
  } else if (mode === 'S') {
    // 엇갈림: 안쪽 쌍부터 바깥 쌍으로, 바깥일수록 한 칸씩 멀리
    const n = pts.length;
    const pairs: [P, P][] = [];
    for (let i = 0; i < Math.floor(n / 2); i++) if (i !== n - 1 - i) pairs.push([pts[i]!, pts[n - 1 - i]!]);
    pairs.reverse().forEach(([a, b], k) => out.push(lin(a, b, k)));
  } else if (mode === 'B') {
    const datum = opt.datum ?? pts[0]!;
    const key = (q: P) => (hz ? q.x : q.y);
    const rest = pts.filter((q) => Math.abs(key(q) - key(datum)) > 1e-9 * Math.max(1, Math.abs(key(datum)))).sort((a, b) => Math.abs(key(a) - key(datum)) - Math.abs(key(b) - key(datum)));
    rest.forEach((q, k) => out.push(lin(datum, q, k)));
  } else if (mode === 'O') {
    for (const q of pts) {
      const end: Vec3 = hz ? { x: q.x, y: at.y, z: 0 } : { x: at.x, y: q.y, z: 0 };
      const d = createOrdinateDimension(doc, v3(q), end, { xAxis: hz, style, datum: opt.ucsOrigin });
      if (opt.datum) d.defPoint = v3(opt.datum);
      out.push(d);
    }
  }
  return out;
}
