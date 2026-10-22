/**
 * 각도 치수(두 선 2, 세 점 5)와 호 길이 치수(ARC_DIMENSION).
 * 세 점: 15 꼭짓점, 13·14 두 변 위 점, 10 치수 호 위 점.
 * 두 선: 13→14 첫 선, 15→10 둘째 선, 16 치수 호 위 점.
 * 호 길이: 15 중심, 13 시작점, 14 끝점, 10 치수 호 위 점.
 */
import { type ArrowKind, arrowKind, drawArrow } from './arrows';
import { type Out, type Rect, type TextPlace, arcClip, extentAlong, parallel, textOnLine, textRect, verticalOffset } from './builder';
import { decideFit } from './fit';
import type { Vec3 } from '../../core/model';
import { type P, add, ang, ccw, dir, dist, dot, intersect, madd, normPi, perp, sub, unit } from './vec';

/** 한 변: 각도, 보조선이 시작할 수 있는 거리 구간(꼭짓점 기준) */
interface Ray {
  a: number;
  tmin: number;
  tmax: number;
}

const chordAngle = (len: number, r: number) => 2 * Math.asin(Math.min(1, len / (2 * r)));

export function angular(o: Out): void {
  const d = o.dim;
  const two = (d.dimType & 7) === 2;
  let c: P;
  let r1: Ray;
  let r2: Ray;
  let arcPt: P;
  const pts: P[] = [];
  if (two) {
    const a1 = o.w(d.defPoint2);
    const b1 = o.w(d.defPoint3);
    const a2 = o.w(d.defPoint4);
    const b2 = o.w(d.defPoint);
    arcPt = o.o(d.defPoint5);
    const u1 = unit(sub(b1, a1));
    const u2 = unit(sub(b2, a2));
    const x = intersect(a1, u1, a2, u2);
    if (!x) {
      o.warn('dimension.angular_parallel');
      o.measurement = 0;
      for (const q of [arcPt, a1, a2, b1, b2]) o.point(q);
      return;
    }
    c = x;
    const g = ang(sub(arcPt, c));
    // 호 위 점이 든 사분면의 두 반직선
    const h1 = ang(u1);
    const h2 = ang(u2);
    let best: [number, number] = [h1, h2];
    for (const s1 of [h1, h1 + Math.PI])
      for (const s2 of [h2, h2 + Math.PI]) {
        const sw = ccw(s1, s2);
        if (sw < Math.PI + 1e-12 && ccw(s1, g) <= sw + 1e-12) best = [s1, s2];
        const sw2 = ccw(s2, s1);
        if (sw2 < Math.PI + 1e-12 && ccw(s2, g) <= sw2 + 1e-12) best = [s1, s2];
      }
    const span = (a: P, b: P, h: number): Ray => {
      const ud = dir(h);
      const ta = dot(sub(a, c), ud);
      const tb = dot(sub(b, c), ud);
      let tmin = Math.max(0, Math.min(ta, tb));
      let tmax = Math.max(ta, tb);
      if (tmax < 0) tmin = tmax = 0;
      return { a: h, tmin, tmax };
    };
    r1 = span(a1, b1, best[0]);
    r2 = span(a2, b2, best[1]);
    pts.push(arcPt, a1, a2, b1, b2);
  } else {
    c = o.w(d.defPoint4);
    const a = o.w(d.defPoint2);
    const b = o.w(d.defPoint3);
    arcPt = o.w(d.defPoint);
    r1 = { a: ang(sub(a, c)), tmin: dist(a, c), tmax: dist(a, c) };
    r2 = { a: ang(sub(b, c)), tmin: dist(b, c), tmax: dist(b, c) };
    pts.push(c, a, b, arcPt);
  }
  const g = ang(sub(arcPt, c));
  // 반시계 시작 변 정하기: 호 위 점이 시작→끝 사이에 들어야 한다
  let rs = r1;
  let re = r2;
  if (ccw(r1.a, g) > ccw(r1.a, r2.a) + 1e-12) {
    rs = r2;
    re = r1;
  }
  const sweep = ccw(rs.a, re.a);
  o.measurement = sweep;
  const R = dist(arcPt, c);
  drawCurved(o, c, R, rs, re, sweep, o.measurement);
  for (const q of pts) o.point(q);
}

/** 호 길이 치수 */
export function arcLength(o: Out): void {
  const d = o.dim;
  const c = o.w(d.arc?.center ?? d.defPoint4);
  const s = o.w(d.arc?.start ?? d.defPoint2);
  const e = o.w(d.arc?.end ?? d.defPoint3);
  const arcPt = o.w(d.defPoint);
  const r0 = dist(s, c);
  const as = ang(sub(s, c));
  const ae = ang(sub(e, c));
  const sweep = ccw(as, ae);
  o.measurement = r0 * sweep;
  const R = dist(arcPt, c);
  const v = o.v;
  if (sweep < Math.PI / 2 - 1e-9) {
    // 직교 보조선: 이등분선과 나란히
    const b = dir(as + sweep / 2);
    const hit = (q: P): P => {
      const w = sub(q, c);
      const bb = dot(w, b);
      const cc = dot(w, w) - R * R;
      const disc = bb * bb - cc;
      const t = disc >= 0 ? -bb + Math.sqrt(disc) : 0;
      return madd(q, b, t);
    };
    const hs = hit(s);
    const he = hit(e);
    const ext = (q: P, h: P, i: 1 | 2) => {
      const t = dot(sub(h, q), b);
      const sg = t >= 0 ? 1 : -1;
      o.line(madd(q, b, sg * v.exo), madd(h, b, sg * v.exe), o.extProps(i));
    };
    if (!v.se1) ext(s, hs, 1);
    if (!v.se2) ext(e, he, 2);
    const rs: Ray = { a: ang(sub(hs, c)), tmin: R, tmax: R };
    const re: Ray = { a: ang(sub(he, c)), tmin: R, tmax: R };
    drawCurved(o, c, R, rs, re, ccw(rs.a, re.a), o.measurement, true);
  } else {
    drawCurved(o, c, R, { a: as, tmin: r0, tmax: r0 }, { a: ae, tmin: r0, tmax: r0 }, sweep, o.measurement);
  }
  // 지시선(DIMARC 지시선(L), 71 = 1): 치수 호 쪽(17)에서 재는 호 위(16)로, 화살촉은 호 위에 — 호의 중심을 향한다
  if (d.arc?.leader1 && d.arc.leader2) {
    const l1 = o.w(d.arc.leader1);
    const l2 = o.w(d.arc.leader2);
    if (dist(l1, l2) > 1e-9) {
      const k = arrowKind(o, String(v.raw.DIMLDRBLK ?? ''));
      const u = unit(sub(l1, l2));
      o.line(l2, k.trim ? madd(l1, u, -k.trim) : l1, o.dimLineProps());
      drawArrow(o, k, l1, u, perp(u));
    }
  }
  o.point(s);
  o.point(e);
  o.point(c);
  o.point(arcPt);
}

/** 보조선(변 → 호), 치수 호, 화살촉, 문자 */
function drawCurved(o: Out, c: P, R: number, rs: Ray, re: Ray, sweep: number, measurement: number, noExt = false): void {
  const v = o.v;
  const d = o.dim;
  if (!noExt) {
    const ext = (ray: Ray, i: 1 | 2) => {
      const ud = dir(ray.a);
      if (R > ray.tmax + 1e-9) o.line(madd(c, ud, ray.tmax + v.exo), madd(c, ud, R + v.exe), o.extProps(i));
      else if (R < ray.tmin - 1e-9) o.line(madd(c, ud, ray.tmin - v.exo), madd(c, ud, R - v.exe), o.extProps(i));
    };
    if (!v.se1) ext(rs, 1);
    if (!v.se2) ext(re, 2);
  }
  const k1 = arrowKind(o, v.blk1);
  const k2 = arrowKind(o, v.blk2);
  const text = o.makeText(measurement);
  const a0 = rs.a;
  const a1 = rs.a + sweep;
  const L = R * sweep;
  const bis = a0 + sweep / 2;
  const tanAt = (a: number) => a + Math.PI / 2;
  const angAt = (a: number, horizontal: boolean) => o.textAngle(tanAt(a), horizontal);
  const alongIn = text ? extentAlong(text.box, angAt(bis, v.tih), tanAt(bis)) : 0;
  const fit = decideFit(o, L, text ? alongIn + 2 * v.gap : 0, Math.max(k1.size, k2.size) * 2);
  let textInside = fit.textInside;
  let place: TextPlace | null = null;
  let textAngle = bis;
  let freeText = false;
  const placeAt = (a: number, inside: boolean): TextPlace => {
    const ta = angAt(a, inside ? v.tih : v.toh);
    const q = madd(c, dir(a), R);
    return { center: add(q, verticalOffset(o, text!.box, ta, tanAt(a), dir(a))), angle: ta };
  };
  const startOff = (fit.arrowsInside ? Math.max(k1.size, k2.size) : 2 * Math.max(k1.size, k2.size)) + v.gap;
  if (text) {
    if (o.userText) {
      const tm = o.o(d.textMid);
      if (v.tmove === 0) {
        textAngle = ang(sub(tm, c));
        textInside = ccw(a0, textAngle) <= sweep + 1e-12;
        place = placeAt(textAngle, textInside);
      } else {
        freeText = true;
        textInside = false;
        place = { center: tm, angle: o.textAngle(tanAt(ang(sub(tm, c))), v.toh) };
      }
    } else if (textInside) {
      textAngle = bis;
      place = placeAt(bis, true);
    } else {
      const along = extentAlong(text.box, angAt(a1, v.toh), tanAt(a1));
      textAngle = a1 + (startOff + along / 2) / R;
      place = placeAt(textAngle, false);
    }
  }
  const pr = o.dimLineProps();
  const sh = (len: number) => chordAngle(len, R);
  const trim = (k: ArrowKind) => (fit.arrowsSuppressed ? 0 : k.tick ? -v.dle : k.trim);
  const rect: Rect | null = text && place && !freeText && textInside && textOnLine(o, place.angle, tanAt(textAngle)) ? textRect(place, text.box, v.gap) : null;
  const arcs: [number, number][] = [];
  const pushArc = (s: number, e: number) => {
    if (e - s > 1e-12) {
      const cut = rect ? arcClip(c, R, s, e - s, rect) : null;
      if (!cut) arcs.push([s, e]);
      else {
        if (cut[0] - s > 1e-12) arcs.push([s, cut[0]]);
        if (e - cut[1] > 1e-12) arcs.push([cut[1], e]);
      }
    }
  };
  // 바깥 문자까지 호를 늘인다(끝 쪽, 또는 문자가 시작 변 앞에 있으면 시작 쪽 — DIMANGULAR 사분점(Q))
  let reachEnd = 0;
  let reachStart = 0;
  if (text && place && !textInside && !freeText) {
    const along = extentAlong(text.box, place.angle, tanAt(textAngle));
    const onLine = !parallel(place.angle, tanAt(textAngle)) || v.tad === 0;
    const rel = ccw(a0, textAngle);
    const afterEnd = rel - sweep;
    const beforeStart = 2 * Math.PI - rel;
    const reach = (dd: number) => (onLine ? dd - along / 2 - v.gap : dd + along / 2);
    if (afterEnd <= beforeStart) reachEnd = reach(afterEnd * R);
    else reachStart = reach(beforeStart * R);
  }
  if (fit.arrowsInside || fit.arrowsSuppressed) {
    let s = a0 + Math.sign(trim(k1)) * sh(Math.abs(trim(k1)));
    let e = a1 - Math.sign(trim(k2)) * sh(Math.abs(trim(k2)));
    if (reachEnd > 0) e = Math.max(e, a1 + reachEnd / R);
    if (reachStart > 0) s = Math.min(s, a0 - reachStart / R);
    pushArc(s, e);
  } else {
    const t1 = sh(k1.trim);
    const t2 = sh(k2.trim);
    arcs.push([Math.min(a0 - sh(2 * k1.size), a0 - reachStart / R), a0 - t1]);
    if (v.tofl) pushArc(a0, a1);
    arcs.push([a1 + t2, Math.max(a1 + sh(2 * k2.size), a1 + reachEnd / R)]);
  }
  for (const [s, e] of arcs) o.arc(c, R, s, e, pr);
  if (!fit.arrowsSuppressed) {
    const ps = madd(c, dir(a0), R);
    const pe = madd(c, dir(a1), R);
    // 화살 방향: 호 위 화살 길이만큼 떨어진 점(현) → 끝
    const dirAt = (tip: P, a: number, toward: number, k: ArrowKind) => {
      const base = madd(c, dir(a + toward * sh(k.size)), R);
      return unit(sub(tip, base), perp(dir(a)));
    };
    if (fit.arrowsInside) {
      const ds = dirAt(ps, a0, 1, k1);
      const de = dirAt(pe, a1, -1, k2);
      drawArrow(o, k1, ps, ds, perp(ds));
      drawArrow(o, k2, pe, de, perp(de));
    } else {
      const ds = dirAt(ps, a0, -1, k1);
      const de = dirAt(pe, a1, 1, k2);
      drawArrow(o, k1, ps, ds, perp(ds));
      drawArrow(o, k2, pe, de, perp(de));
    }
  }
  if (text && place) {
    o.mtext(text, place);
    o.textMid = o.userText ? o.o(d.textMid) : place.center;
  } else o.textMid = madd(c, dir(bis), R);
}

/**
 * 각도 치수(세 점 5·두 선 2)의 재는 범위(평면도): 꼭짓점, 반시계 시작 변·끝 변 각도와 그 변의 보조선 원점, 치수 호 반지름.
 * forward: 세 점 치수에서 첫 변(13)에서 둘째 변(14)으로 반시계로 재는가. DIMCONTINUE·DIMBASELINE이 이어 붙일 때 쓴다
 */
export function angularSpan(d: { dimType: number; defPoint: Vec3; defPoint2: Vec3; defPoint3: Vec3; defPoint4: Vec3; defPoint5?: Vec3 }): { c: P; start: number; sweep: number; pStart: P; pEnd: P; R: number; forward: boolean } | null {
  const q = (v: Vec3): P => ({ x: v.x, y: v.y });
  let c: P;
  let cands: P[];
  let arcPt: P;
  if ((d.dimType & 7) === 2) {
    const a1 = q(d.defPoint2);
    const b1 = q(d.defPoint3);
    const a2 = q(d.defPoint4);
    const b2 = q(d.defPoint);
    const x = intersect(a1, unit(sub(b1, a1)), a2, unit(sub(b2, a2)));
    if (!x || !d.defPoint5) return null;
    c = x;
    cands = [a1, b1, a2, b2];
    arcPt = q(d.defPoint5);
  } else if ((d.dimType & 7) === 5) {
    c = q(d.defPoint4);
    cands = [q(d.defPoint2), q(d.defPoint3)];
    arcPt = q(d.defPoint);
  } else return null;
  const g = ang(sub(arcPt, c));
  const R = dist(arcPt, c);
  // 둘레의 변(보조선 방향) 후보: 세 점은 두 변, 두 선은 두 직선의 네 반직선
  const rays: number[] = [];
  for (const p0 of cands) if (dist(p0, c) > 1e-12) rays.push(ang(sub(p0, c)));
  if ((d.dimType & 7) === 2) rays.push(...rays.slice(0, 2).map((a) => a + Math.PI));
  if (rays.length < 2) return null;
  let best: { s: number; e: number } | null = null;
  for (const s0 of rays)
    for (const e0 of rays) {
      const sw = ccw(s0, e0);
      if (sw < 1e-9 || ((d.dimType & 7) === 2 && sw > Math.PI + 1e-9)) continue;
      if (ccw(s0, g) <= sw + 1e-12 && (!best || sw < ccw(best.s, best.e))) best = { s: s0, e: e0 };
    }
  if (!best) return null;
  const sweep = ccw(best.s, best.e);
  const on = (a: number): P => {
    let pick: P | null = null;
    for (const p0 of cands) {
      const da = Math.abs(normPi(ang(sub(p0, c)) - a));
      if (da < 1e-6 && (!pick || dist(p0, c) > dist(pick, c))) pick = p0;
    }
    return pick ?? madd(c, dir(a), R);
  };
  const forward = (d.dimType & 7) !== 5 || Math.abs(normPi(ang(sub(q(d.defPoint2), c)) - best.s)) < 1e-6;
  return { c, start: best.s, sweep, pStart: on(best.s), pEnd: on(best.e), R, forward };
}
