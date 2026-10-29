/**
 * DIST·MEASUREGEOM 거리의 다중 점. AutoCAD 도움말(우리말 요약):
 * - DIST: 둘째 점 프롬프트의 <다중 점>(기본값 — Enter, 또는 M)은 여러 점을 지정해 거리의 누적 합계를 기록하고,
 *   호와 지정한 길이의 선 구간 옵션이 더 나온다. 누적 합계는 이미 지정한 구간과 지금 고무줄 선으로 툴팁에도 보인다.
 * - MEASUREGEOM 다중 점: 이어지는 점 사이 거리의 누적 합계를 보인다. 호·길이·명령 취소를 고르면 폴리선을 그릴 때와 비슷한 옵션이 나온다.
 *   호는 호 구간을 합계에 더하고(호의 끝점·각도·중심·방향·반지름·두 번째 점·닫기), 길이는 선 구간이면 앞 구간과 같은 각도로
 *   (앞 구간이 호면 그 호에 접하게), 호 구간이면 현의 길이다. 닫기는 마지막 점에서 시작점까지(점이 둘 이상일 때),
 *   명령 취소는 마지막으로 더한 구간을 뺀다.
 * 도움말에 없어 이 앱이 정한 것: 선 구간은 두 점의 Z로 3D 거리(두 점 DIST와 같다), 호 구간은 앞 점 높이의 평면 호(폴리선처럼),
 * 도면 공간은 평면 거리. 호 옵션과 하위 프롬프트는 이 앱의 PLINE과 같다(폭·반폭은 없다).
 */
import type { CommandContext, PointResult } from './app';
import type { Pt } from './view';
import type { MeasureResult } from './measure-result';
import { bulgeArc, ccwSweep, TAU } from '../geom/curves';
import { arcByCenter, arcByCenterAngle, arcByCenterChord, arcByDirection, arcByRadiusAngle, arcByRadiusEnd } from '../edit/geom/drawgeom';
import { arc3p, getAngle, getDistance, polyPreview } from './draw';
import { ctrlHeld } from './gripmenu';

export type Pt3 = Pt & { z: number };

/** 경로의 점과 그 점에서 다음 점까지 구간의 볼록(0이면 선) */
export interface PathVertex extends Pt3 {
  bulge: number;
}

/** 구간 하나의 길이: 선은 3D(flat이면 평면), 호는 평면 호(반지름 × 사이각) */
export function segmentLength(a: PathVertex, b: Pt3, flat = false): number {
  const arc = a.bulge ? bulgeArc(a.x, a.y, b.x, b.y, a.bulge) : null;
  if (arc) return Math.abs(arc.sweep) * arc.r;
  return Math.hypot(b.x - a.x, b.y - a.y, flat ? 0 : b.z - a.z);
}

/** 경로 전체 길이(누적 거리) */
export function pathLength(vs: readonly PathVertex[], flat = false): number {
  let t = 0;
  for (let i = 1; i < vs.length; i++) t += segmentLength(vs[i - 1]!, vs[i]!, flat);
  return t;
}

/** 구간(a → b, a의 볼록) 끝의 진행 방향(XY 평면) */
function endDir(a: PathVertex, b: Pt): number {
  const arc = bulgeArc(a.x, a.y, b.x, b.y, a.bulge);
  if (!arc) return Math.atan2(b.y - a.y, b.x - a.x);
  return arc.a0 + arc.sweep + (arc.sweep > 0 ? Math.PI / 2 : -Math.PI / 2);
}

const ang = (a: Pt, b: Pt) => Math.atan2(b.y - a.y, b.x - a.x);

export interface MultiHost {
  /** 점 결과 → 3D 점(좌표의 Z·스냅 점의 Z·지금 고도) */
  point3(r: Extract<PointResult, { point: Pt }>): Pt3;
  /** 다음 점 요청의 기준점 */
  base(p: Pt3): Pt & { z?: number };
  /** 길이 글(도면 단위) */
  length(v: number): string;
  /** 단위 꼬리(" mm", 단위 없는 도면은 빈 글) */
  unit: string;
  /** 도면 공간: 평면 거리 */
  flat: boolean;
}

/** 누적 거리 결과 카드(휴대폰 보기 모드) */
export function totalResult(value: string): MeasureResult {
  return { kind: 'distance', label: '누적 거리', value, details: [] };
}

/**
 * 첫 점 다음의 다중 점 입력. 구간을 더할 때마다 누적 거리를 명령행에 보이고, Enter로 끝낸다(닫기도 끝낸다).
 * 지정한 점들(마지막 점의 볼록은 0)을 돌려준다
 */
export async function measureMultiple(ctx: CommandContext, first: Pt3, host: MultiHost): Promise<PathVertex[]> {
  const vs: PathVertex[] = [{ x: first.x, y: first.y, z: first.z, bulge: 0 }];
  let arcMode = false;
  const total = () => pathLength(vs, host.flat);
  const report = () => {
    const v = host.length(total()) + host.unit;
    ctx.print(`거리 = ${v}`, 'res', totalResult(v));
  };
  const last = () => vs[vs.length - 1]!;
  /** 접선 방향(마지막 구간 끝의 진행 방향) */
  const tangentAt = (): number | null => (vs.length < 2 ? null : endDir(vs[vs.length - 2]!, last()));
  /** 앞 구간에 접하는 호의 볼록(앞 구간이 없으면 선) */
  const bulgeFor = (from: Pt, to: Pt): number => {
    const t = tangentAt();
    const d = t === null ? 0 : ang(from, to) - t;
    return Math.tan(Math.atan2(Math.sin(d), Math.cos(d)) / 2);
  };
  /** Ctrl: 접하는 호를 같은 원의 나머지 호로 */
  const flipTangent = (b: number): number => (Math.abs(b) > 1e-9 ? -1 / b : b);
  /** 구간을 더한다(호는 앞 점 높이의 평면 호) */
  const add = (p: Pt3, bulge = 0) => {
    const a = last();
    a.bulge = bulge;
    vs.push({ x: p.x, y: p.y, z: bulge ? a.z : p.z, bulge: 0 });
    report();
  };
  /** 지금까지의 경로와 커서까지의 구간(볼록 bulge) */
  const rubber = (q: Pt | null, bulge = 0) => {
    const tmp = vs.map((v) => ({ x: v.x, y: v.y, bulge: v.bulge }));
    if (q) {
      tmp[tmp.length - 1]!.bulge = bulge;
      tmp.push({ x: q.x, y: q.y, bulge: 0 });
    }
    return [{ pts: polyPreview(tmp, false) }];
  };
  /** 툴팁: 누적 거리 + 지금 고무줄 구간(평면) */
  const tip = (q: Pt, bulge = 0) => {
    const a = last();
    const seg = segmentLength({ ...a, bulge }, { x: q.x, y: q.y, z: a.z }, true);
    return `거리 = ${host.length(total() + seg)}${host.unit}`;
  };
  const arcRubber = (bulge: number | null, ep: Pt | null) => (bulge === null || !ep ? rubber(null) : rubber(ep, bulge));
  const flat3 = (p: Pt): Pt3 => ({ x: p.x, y: p.y, z: last().z });

  /** 호 모드의 각도(A)·중심(CE)·방향(D)·반지름(R)·두 번째 점(S). 처리했으면 true(PLINE과 같은 하위 프롬프트) */
  const arcOption = async (k: string): Promise<boolean> => {
    const lp = { x: last().x, y: last().y };
    const tan = tangentAt();
    if (k === 'A') {
      const sw = await getAngle(ctx, '사이각 지정', null, Math.PI / 2);
      if (Math.abs(sw) < 1e-12) return true;
      const r = await ctx.getPoint('호의 끝점 지정(방향 전환은 Ctrl 키) 또는 [중심(CE)/반지름(R)]:', {
        base: lp,
        keywords: [
          { key: 'CE', label: '중심' },
          { key: 'R', label: '반지름' },
        ],
        rubber: (q) => arcRubber(Math.tan((ctrlHeld() ? -sw : sw) / 4), q),
      });
      if ('point' in r) add(flat3(r.point), Math.tan((r.ctrl ? -sw : sw) / 4));
      else if ('keyword' in r && r.keyword === 'CE') {
        const c = await ctx.getPoint('호의 중심점 지정:', {
          base: lp,
          rubber: (q) => {
            const a = arcByCenterAngle(lp, q, sw);
            return a ? arcRubber(a.bulge, a.end) : rubber(null);
          },
        });
        const a = 'point' in c ? arcByCenterAngle(lp, c.point, sw) : null;
        if (a) add(flat3(a.end), a.bulge);
      } else if ('keyword' in r && r.keyword === 'R') {
        const R = await getDistance(ctx, '호의 반지름 지정', lp);
        const dir = await getAngle(ctx, '호의 현 방향 지정', lp, (tan ?? 0) + sw / 2);
        const a = arcByRadiusAngle(lp, R, sw, dir);
        if (a) add(flat3(a.end), a.bulge);
      }
      return true;
    }
    if (k === 'CE') {
      const cr = await ctx.getPoint('호의 중심점 지정:', { base: lp });
      if (!('point' in cr)) return true;
      const c = cr.point;
      const r = await ctx.getPoint('호의 끝점 지정(방향 전환은 Ctrl 키) 또는 [각도(A)/길이(L)]:', {
        base: c,
        keywords: [
          { key: 'A', label: '각도' },
          { key: 'L', label: '길이' },
        ],
        rubber: (q) => {
          const a = arcByCenter(lp, c, q, !ctrlHeld());
          return a ? arcRubber(a.bulge, a.end) : rubber(null);
        },
      });
      let a: { end: Pt; bulge: number } | null = null;
      if ('point' in r) a = arcByCenter(lp, c, r.point, !r.ctrl);
      else if ('keyword' in r && r.keyword === 'A') a = arcByCenterAngle(lp, c, await getAngle(ctx, '사이각 지정', null, Math.PI / 2));
      else if ('keyword' in r && r.keyword === 'L') a = arcByCenterChord(lp, c, await getDistance(ctx, '현의 길이 지정', lp));
      if (a) add(flat3(a.end), a.bulge);
      else if (!('enter' in r)) ctx.print('호를 만들 수 없습니다.', 'err');
      return true;
    }
    if (k === 'D') {
      const dir = await getAngle(ctx, '호의 시작 방향 지정', lp, tan ?? 0);
      const er = await ctx.getPoint('호의 끝점 지정(방향 전환은 Ctrl 키):', { base: lp, rubber: (q) => arcRubber(arcByDirection(lp, ctrlHeld() ? dir + Math.PI : dir, q), q) });
      if (!('point' in er)) return true;
      const b = arcByDirection(lp, er.ctrl ? dir + Math.PI : dir, er.point);
      if (b !== null) add(flat3(er.point), b);
      return true;
    }
    if (k === 'R') {
      const R = await getDistance(ctx, '호의 반지름 지정', lp);
      if (!(R > 0)) return true;
      const flip = (b: number | null, on: boolean) => (b !== null && on ? -b : b);
      const r = await ctx.getPoint('호의 끝점 지정(방향 전환은 Ctrl 키) 또는 [각도(A)]:', {
        base: lp,
        keywords: [{ key: 'A', label: '각도' }],
        rubber: (q) => arcRubber(flip(arcByRadiusEnd(lp, R, q), ctrlHeld()), q),
      });
      if ('point' in r) {
        const b = flip(arcByRadiusEnd(lp, R, r.point), !!r.ctrl);
        if (b === null) ctx.print('호를 만들 수 없습니다. 반지름이 너무 작습니다.', 'err');
        else add(flat3(r.point), b);
      } else if ('keyword' in r) {
        const sw = await getAngle(ctx, '사이각 지정', null, Math.PI / 2);
        const dir = await getAngle(ctx, '호의 현 방향 지정', lp, (tan ?? 0) + sw / 2);
        const a = arcByRadiusAngle(lp, R, sw, dir);
        if (a) add(flat3(a.end), a.bulge);
      }
      return true;
    }
    if (k === 'S') {
      const mr = await ctx.getPoint('호의 두 번째 점 지정:', { base: lp });
      if (!('point' in mr)) return true;
      const mp = mr.point;
      const er = await ctx.getPoint('호의 끝점 지정:', { base: mp });
      if (!('point' in er)) return true;
      const ep = er.point;
      const a3 = arc3p(lp, mp, ep);
      if (!a3) return true;
      const sweep = ccwSweep(ang(a3.c, lp), ang(a3.c, ep));
      const ccw = ccwSweep(ang(a3.c, lp), ang(a3.c, mp)) <= sweep;
      add(flat3(ep), Math.tan((ccw ? sweep : -(TAU - sweep)) / 4));
      return true;
    }
    return false;
  };

  for (;;) {
    const a = last();
    const lp = { x: a.x, y: a.y };
    let r: PointResult;
    if (!arcMode) {
      const close = vs.length > 2;
      r = await ctx.getPoint(close ? '다음 점 지정 또는 [호(A)/닫기(C)/길이(L)/명령 취소(U)]:' : '다음 점 지정 또는 [호(A)/길이(L)/명령 취소(U)]:', {
        base: host.base(a),
        snapZ: true,
        keywords: [{ key: 'A', label: '호' }, ...(close ? [{ key: 'C', label: '닫기' }] : []), { key: 'L', label: '길이' }, { key: 'U', label: '명령 취소' }],
        rubber: (q) => rubber(q),
        tip: (q) => tip(q),
      });
    } else {
      const close = vs.length > 1;
      r = await ctx.getPoint(
        close
          ? '호의 끝점 지정(방향 전환은 Ctrl 키) 또는 [각도(A)/중심(CE)/닫기(CL)/방향(D)/선(L)/반지름(R)/두 번째 점(S)/명령 취소(U)]:'
          : '호의 끝점 지정(방향 전환은 Ctrl 키) 또는 [각도(A)/중심(CE)/방향(D)/선(L)/반지름(R)/두 번째 점(S)/명령 취소(U)]:',
        {
          base: lp,
          keywords: [
            { key: 'A', label: '각도' },
            { key: 'CE', label: '중심' },
            ...(close ? [{ key: 'CL', label: '닫기' }] : []),
            { key: 'D', label: '방향' },
            { key: 'L', label: '선' },
            { key: 'R', label: '반지름' },
            { key: 'S', label: '두 번째 점' },
            { key: 'U', label: '명령 취소' },
          ],
          rubber: (q) => {
            const b = bulgeFor(lp, q);
            return rubber(q, ctrlHeld() ? flipTangent(b) : b);
          },
          tip: (q) => {
            const b = bulgeFor(lp, q);
            return tip(q, ctrlHeld() ? flipTangent(b) : b);
          },
        },
      );
    }
    if ('enter' in r) return vs;
    if ('keyword' in r) {
      const k = r.keyword;
      if (k === 'A' && !arcMode) {
        arcMode = true;
        continue;
      }
      if (k === 'L' && arcMode) {
        arcMode = false;
        continue;
      }
      if (k === 'L') {
        // 앞 구간과 같은 각도(앞 구간이 호면 접선 방향, 앞 구간이 없으면 0 방향). 높이는 앞 점 그대로
        const len = await getDistance(ctx, '선의 길이 지정', lp);
        const t = tangentAt() ?? 0;
        add({ x: lp.x + Math.cos(t) * len, y: lp.y + Math.sin(t) * len, z: a.z });
        continue;
      }
      if (k === 'C' || k === 'CL') {
        const s = vs[0]!;
        add({ x: s.x, y: s.y, z: s.z }, arcMode ? bulgeFor(lp, s) : 0);
        return vs;
      }
      if (k === 'U') {
        if (vs.length > 1) {
          vs.pop();
          last().bulge = 0;
          report();
        }
        continue;
      }
      if (arcMode) await arcOption(k);
      continue;
    }
    if (!('point' in r)) continue;
    if (!arcMode) add(host.point3(r));
    else {
      const b = bulgeFor(lp, r.point);
      add(flat3(r.point), r.ctrl ? flipTangent(b) : b);
    }
  }
}
