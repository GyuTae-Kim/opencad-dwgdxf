/**
 * 프록시 그림(사용자 객체가 남긴 그림)을 보통 도형으로: 해석할 수 없는 사용자 객체를 다른 형식·버전으로 저장할 때
 * 객체를 빼는 대신 보이는 모양(선·폴리선·원·호·문자·구성선)을 남긴다(AutoCAD에서 프록시를 분해한 것과 같은 결과).
 * 그림 해석은 렌더러와 같은 parseProxyGraphics(ODA 명세 29장).
 */
import type { CadColor, Entity, UnknownEntity, Vec3 } from '../../core/model';
import { entityDefaults } from '../../core/model';
import { packLw } from '../../core/lwpoly';
import { type Mat, apply, applyDir, identity, mat, multiply } from '../../geom/matrix';
import { ccwSweep } from '../../geom/curves';
import { parseProxyGraphics } from '../../render/proxy';
import { packPoly } from '../../core/polyverts';

type P3 = [number, number, number];

function v3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

/** 법선이 Z(±)에 가까운가 — 평면 원·호로 쓸 수 있다 */
function flatNormal(n: P3): 1 | -1 | 0 {
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  if (Math.abs(n[0] / l) < 1e-9 && Math.abs(n[1] / l) < 1e-9) return n[2] < 0 ? -1 : 1;
  return 0;
}

/**
 * 프록시 그림을 객체 목록으로(객체의 도면층·선종류 등은 프록시의 것, 그림의 색 바꾸기는 객체 색으로).
 * 그림이 없거나 그릴 것이 없으면 빈 목록
 */
export function proxyEntities(e: UnknownEntity, decode?: (b: Uint8Array) => string): Entity[] {
  if (!e.graphics?.length) return [];
  let parsed;
  try {
    parsed = parseProxyGraphics(e.graphics, decode);
  } catch {
    return [];
  }
  const out: Entity[] = [];
  const base = (): Omit<Entity, 'type'> => {
    const b = { ...entityDefaults(), layer: e.layer, color: { ...color }, linetype: e.linetype, lineweight: lineweight, ltscale: e.ltscale, handle: '' } as Entity;
    if (e.transparency !== undefined) (b as { transparency?: number }).transparency = e.transparency;
    if (e.paperSpace) b.paperSpace = true;
    if (e.owner) b.owner = e.owner;
    return b;
  };
  let color: CadColor = { ...e.color };
  let lineweight = e.lineweight;
  const stack: Mat[] = [identity()];
  const top = () => stack[stack.length - 1]!;
  const P = (p: P3) => apply(top(), p[0], p[1], p[2]);
  // 변환이 Z축을 그대로 두는 평면 변환인가(원·호를 그대로 쓸 수 있는가)
  const planar = () => {
    const m = top();
    const z = applyDir(m, 0, 0, 1);
    return Math.abs(z.x) < 1e-9 && Math.abs(z.y) < 1e-9;
  };
  const scaleOf = () => {
    const d = applyDir(top(), 1, 0, 0);
    return Math.hypot(d.x, d.y, d.z);
  };
  const poly = (pts: Vec3[], closed: boolean) => {
    if (pts.length < 2) return;
    if (pts.length === 2 && !closed) {
      out.push({ ...base(), type: 'LINE', start: pts[0]!, end: pts[1]! } as Entity);
      return;
    }
    const z = pts[0]!.z;
    if (pts.every((p) => Math.abs(p.z - z) < 1e-9)) {
      out.push({ ...base(), type: 'LWPOLYLINE', ...packLw(pts.map((p) => ({ x: p.x, y: p.y, bulge: 0, startWidth: 0, endWidth: 0 }))), closed, plinegen: false, constantWidth: 0, elevation: z } as Entity);
    } else {
      out.push({
        ...base(),
        type: 'POLYLINE',
        kind: '3d',
        flags: 8 | (closed ? 1 : 0),
        elevation: 0,
        defaultStartWidth: 0,
        defaultEndWidth: 0,
        mCount: 0,
        nCount: 0,
        mDensity: 0,
        nDensity: 0,
        smoothType: 0,
        ...packPoly(pts.map((p) => ({ location: p, bulge: 0, startWidth: 0, endWidth: 0, flags: 32 }))),
      } as Entity);
    }
  };
  /** 평면 원·호(중심·반지름·시작각·사이각, 평면 Z) */
  const arcOrCircle = (c: Vec3, r: number, a0: number | null, sweep: number) => {
    if (!(r > 0)) return;
    if (a0 === null || Math.abs(sweep) >= Math.PI * 2 - 1e-12) {
      out.push({ ...base(), type: 'CIRCLE', center: c, radius: r } as Entity);
      return;
    }
    const s = sweep >= 0 ? a0 : a0 + sweep;
    out.push({ ...base(), type: 'ARC', center: c, radius: r, startAngle: s, endAngle: s + Math.abs(sweep) } as Entity);
  };
  /** 일반 원호를 점으로(평면이 아니거나 변환이 기울었을 때) */
  const ring = (c: P3, r: number, u: P3, v: P3, a0: number, sweep: number, closed: boolean) => {
    const n = Math.max(16, Math.min(256, Math.ceil(Math.abs(sweep) / (Math.PI / 32))));
    const pts: Vec3[] = [];
    for (let i = 0; i <= n - (closed ? 1 : 0); i++) {
      const a = a0 + (sweep * i) / n;
      pts.push(P([c[0] + r * (Math.cos(a) * u[0] + Math.sin(a) * v[0]), c[1] + r * (Math.cos(a) * u[1] + Math.sin(a) * v[1]), c[2] + r * (Math.cos(a) * u[2] + Math.sin(a) * v[2])]));
    }
    poly(pts, closed);
  };
  const axes = (n: P3): [P3, P3] => {
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    const N: P3 = [n[0] / l, n[1] / l, n[2] / l];
    // 임의 축 규칙(AutoCAD OCS)
    const ax: P3 = Math.abs(N[0]) < 1 / 64 && Math.abs(N[1]) < 1 / 64 ? [N[2], 0, -N[0]] : [-N[1], N[0], 0];
    const al = Math.hypot(...ax) || 1;
    const u: P3 = [ax[0] / al, ax[1] / al, ax[2] / al];
    const v: P3 = [N[1] * u[2] - N[2] * u[1], N[2] * u[0] - N[0] * u[2], N[0] * u[1] - N[1] * u[0]];
    return [u, v];
  };
  for (const p of parsed.prims) {
    switch (p.k) {
      case 'poly': {
        const pts: Vec3[] = [];
        for (let i = 0; i + 2 < p.pts.length; i += 3) pts.push(P([p.pts[i]!, p.pts[i + 1]!, p.pts[i + 2]!]));
        poly(pts, p.closed || (p.fill && pts.length >= 3));
        break;
      }
      case 'circle': {
        const fn = flatNormal(p.n);
        if (fn && planar()) {
          const c = P(p.c);
          arcOrCircle(c, p.r * scaleOf(), null, Math.PI * 2);
        } else {
          const [u, v] = axes(p.n);
          ring(p.c, p.r, u, v, 0, Math.PI * 2, true);
        }
        break;
      }
      case 'arc': {
        const fn = flatNormal(p.n);
        const [u, v] = axes(p.n);
        const a0 = Math.atan2(p.start[0] * v[0] + p.start[1] * v[1] + p.start[2] * v[2], p.start[0] * u[0] + p.start[1] * u[1] + p.start[2] * u[2]);
        if (fn && planar()) {
          // 법선이 −Z이면 평면 각도가 거꾸로 돈다
          const d = applyDir(top(), Math.cos(a0) * u[0] + Math.sin(a0) * v[0], Math.cos(a0) * u[1] + Math.sin(a0) * v[1], 0);
          const start = Math.atan2(d.y, d.x);
          arcOrCircle(P(p.c), p.r * scaleOf(), start, fn * p.sweep);
        } else ring(p.c, p.r, u, v, a0, p.sweep, false);
        break;
      }
      case 'arc3':
      case 'circle3': {
        const [a, b, c] = p.p.map((q) => P(q)) as [Vec3, Vec3, Vec3];
        const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
        if (Math.abs(d) < 1e-15) break;
        const a2 = a.x ** 2 + a.y ** 2;
        const b2 = b.x ** 2 + b.y ** 2;
        const c2 = c.x ** 2 + c.y ** 2;
        const cx = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
        const cy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
        const r = Math.hypot(a.x - cx, a.y - cy);
        if (p.k === 'circle3') arcOrCircle(v3(cx, cy, a.z), r, null, Math.PI * 2);
        else {
          const t0 = Math.atan2(a.y - cy, a.x - cx);
          const tm = Math.atan2(b.y - cy, b.x - cx);
          const t1 = Math.atan2(c.y - cy, c.x - cx);
          let sw = ccwSweep(t0, t1);
          if (ccwSweep(t0, tm) > sw) sw -= Math.PI * 2;
          arcOrCircle(v3(cx, cy, a.z), r, t0, sw);
        }
        break;
      }
      case 'text': {
        const at = P(p.at);
        const d = applyDir(top(), p.dir[0], p.dir[1], p.dir[2]);
        out.push({
          ...base(),
          type: 'TEXT',
          insert: at,
          height: p.height * scaleOf(),
          text: p.text,
          rotation: Math.atan2(d.y, d.x),
          widthFactor: p.width || 1,
          oblique: p.oblique || 0,
          style: 'Standard',
          generation: 0,
          halign: 0,
          valign: 0,
        } as Entity);
        break;
      }
      case 'xline': {
        const a = P(p.a);
        const b = P(p.b);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        const l = Math.hypot(dx, dy, dz);
        if (l > 0) out.push({ ...base(), type: p.ray ? 'RAY' : 'XLINE', base: a, direction: v3(dx / l, dy / l, dz / l) } as Entity);
        break;
      }
      case 'color':
        color = { aci: p.aci };
        break;
      case 'rgb':
        color = { aci: 7, rgb: p.rgb };
        break;
      case 'lineweight':
        lineweight = p.lw;
        break;
      case 'push': {
        const q = p.m;
        stack.push(multiply(top(), mat(q[0]!, q[1]!, q[2]!, q[3]!, q[4]!, q[5]!, q[6]!, q[7]!, q[8]!, q[9]!, q[10]!, q[11]!)));
        break;
      }
      case 'pop':
        if (stack.length > 1) stack.pop();
        break;
      default:
        break;
    }
  }
  return out;
}
