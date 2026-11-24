/**
 * PEDIT 여러 개(M) 결합의 퍼지 거리(AutoCAD "퍼지 거리 입력 또는 [결합 유형(J)]"):
 * 끝점 사이 틈이 퍼지 거리 이하인 폴리선 끝끼리 맞붙여, 뒤이은 결합(joinEntities)이 하나로 잇게 한다.
 *
 * - 연장(E): 두 끝 세그먼트(직선)를 늘이거나 잘라 두 직선이 만나는 점에서 잇는다. 한 직선 위에서 마주 보면 한쪽을 늘인다.
 *   끝 세그먼트가 호이거나 두 직선이 평행(어긋남)하면 잇지 않는다.
 * - 추가(A): 두 끝 사이에 직선 세그먼트를 더한다.
 * - 모두(B): 늘일 수 있으면 늘이고, 아니면 직선을 더한다.
 *
 * 가까운 틈부터 끝 하나에 한 번씩만 잇는다.
 */
import type { Entity, LineEntity, Vec2 } from '../../core/model';
import { type PV, type PolyEntity, frameVerts, is3d, isClosed, toOcs, vertexPoint, withVerts } from './pedit';
import { isPlanarExt, planZ } from './ocs';

export type JoinType = 'E' | 'A' | 'B';

interface End {
  i: number;
  atStart: boolean;
  p: Vec2;
  /** 끝 세그먼트가 직선이면 바깥 방향 단위 벡터 */
  dir: Vec2 | null;
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
const unit = (a: Vec2, b: Vec2): Vec2 | null => {
  const d = dist(a, b);
  return d > 0 ? { x: (a.x - b.x) / d, y: (a.y - b.y) / d } : null;
};

/** 퍼지 결합 준비: 끝을 옮긴 폴리선(같은 핸들)과 틈을 잇는 선(핸들 없음) */
export function fuzzJoinPrep(polys: readonly PolyEntity[], fuzz: number, type: JoinType): { polys: PolyEntity[]; bridges: LineEntity[]; joined: number } {
  const verts = polys.map((e) => frameVerts(e));
  const ends: End[] = [];
  let size = 1;
  polys.forEach((e, i) => {
    const vs = verts[i]!;
    if (isClosed(e) || vs.length < 2) return;
    const n = vs.length;
    const w = (v: PV) => vertexPoint(e, v);
    const p0 = w(vs[0]!);
    const pn = w(vs[n - 1]!);
    size = Math.max(size, Math.abs(p0.x), Math.abs(p0.y), Math.abs(pn.x), Math.abs(pn.y));
    ends.push({ i, atStart: true, p: p0, dir: vs[0]!.bulge === 0 ? unit(p0, w(vs[1]!)) : null });
    ends.push({ i, atStart: false, p: pn, dir: vs[n - 2]!.bulge === 0 ? unit(pn, w(vs[n - 2]!)) : null });
  });
  const tol = size * 1e-9;
  const pairs: [number, number, number][] = [];
  for (let a = 0; a < ends.length; a++)
    for (let b = a + 1; b < ends.length; b++) {
      if (ends[a]!.i === ends[b]!.i) continue;
      const d = dist(ends[a]!.p, ends[b]!.p);
      if (d > tol && d <= fuzz + tol) pairs.push([a, b, d]);
    }
  pairs.sort((x, y) => x[2] - y[2]);
  const used = new Set<number>();
  const moved = new Map<number, { start?: Vec2; end?: Vec2 }>();
  const setEnd = (e: End, p: Vec2) => {
    const m = moved.get(e.i) ?? {};
    if (e.atStart) m.start = p;
    else m.end = p;
    moved.set(e.i, m);
  };
  const bridges: LineEntity[] = [];
  let joined = 0;
  for (const [a, b, d] of pairs) {
    if (used.has(a) || used.has(b)) continue;
    const A = ends[a]!;
    const B = ends[b]!;
    let done = false;
    if (type !== 'A' && A.dir && B.dir) {
      const X = extendMeet(A, B, d);
      if (X) {
        setEnd(A, X);
        setEnd(B, X);
        done = true;
      }
    }
    if (!done && type !== 'E') {
      const src = polys[A.i]!;
      const z = bridgeZ(src);
      bridges.push({ ...lineBase(src), type: 'LINE', handle: '', start: { x: A.p.x, y: A.p.y, z }, end: { x: B.p.x, y: B.p.y, z } });
      done = true;
    }
    if (done) {
      used.add(a);
      used.add(b);
      joined++;
    }
  }
  const out = polys.map((e, i) => {
    const m = moved.get(i);
    if (!m) return e;
    const vs = verts[i]!.map((v) => ({ ...v }));
    const put = (k: number, p: Vec2) => {
      const q = toOcs(e, p);
      vs[k] = { ...vs[k]!, x: q.x, y: q.y };
    };
    if (m.start) put(0, m.start);
    if (m.end) put(vs.length - 1, m.end);
    return withVerts(e, vs, false);
  });
  return { polys: out, bridges, joined };
}

/** 연장으로 만나는 점: 두 끝 직선의 교점(한 직선 위면 B의 끝). 너무 멀면(틈의 10배 넘게) null */
function extendMeet(A: End, B: End, gap: number): Vec2 | null {
  const da = A.dir!;
  const db = B.dir!;
  const den = da.x * db.y - da.y * db.x;
  const w = { x: B.p.x - A.p.x, y: B.p.y - A.p.y };
  const limit = Math.max(gap, 1e-12) * 10;
  if (Math.abs(den) < 1e-9) {
    // 평행: 한 직선 위에서 마주 보면(A가 B 쪽으로 나간다) B의 끝까지 늘인다
    const off = Math.abs(w.x * da.y - w.y * da.x);
    const ahead = w.x * da.x + w.y * da.y;
    return off <= 1e-9 * Math.max(1, gap) && ahead > 0 && da.x * db.x + da.y * db.y < 0 ? { ...B.p } : null;
  }
  const t = (w.x * db.y - w.y * db.x) / den;
  const X = { x: A.p.x + da.x * t, y: A.p.y + da.y * t };
  if (dist(X, A.p) > limit || dist(X, B.p) > limit) return null;
  return X;
}

/**
 * 잇는 선의 높이(WCS Z, 178차). Autodesk PEDIT 도움말의 추가(A)·모두(B)는 가장 가까운 끝점 사이에 직선 세그먼트를 더해 잇는다.
 * 2D 폴리선(LWPOLYLINE·2D POLYLINE)의 고도는 객체 OCS 값이라(DXF 참조서 OCS) 돌출 방향이 Z축과 평행하면 끝점의 WCS 높이는
 * 편집 기하 커널의 평면 Z(`planZ` — entityPath, JOIN이 견주는 높이)다: −Z면 −고도. 전에는 LWPOLYLINE 고도를 OCS 값 그대로(−Z면 부호 반대),
 * 2D POLYLINE은 0으로 두어 고도가 0이 아닌 −Z 폴리선·2D POLYLINE을 이으면 JOIN이 높이가 다르다고 보아 3D 폴리선(호가 있으면 스플라인)을 만들었다.
 * 3D 폴리선(도움말의 3D 결합에 퍼지·결합 유형 규칙이 없다)과 돌출 방향이 기운 폴리선은 전과 같은 값
 */
function bridgeZ(e: PolyEntity): number {
  if (is3d(e)) return 0;
  if (!isPlanarExt(e.extrusion)) return e.type === 'LWPOLYLINE' ? e.elevation : 0;
  return planZ(e.extrusion, e.elevation) || 0;
}

function lineBase(e: Entity): Omit<LineEntity, 'type' | 'handle' | 'start' | 'end'> {
  const { layer, color, linetype, lineweight, ltscale, transparency } = e;
  return { layer, color, linetype, lineweight, ltscale, transparency };
}
