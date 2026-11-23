/**
 * 선형 치수(회전·수평·수직 0, 정렬 1).
 * 정의점: 13 첫 치수보조선 원점, 14 둘째 원점, 10 치수선 위 점(둘째 보조선과 만나는 곳), 50 회전, 52 보조선 기울기.
 */
import { type ArrowKind, arrowKind, drawArrow } from './arrows';
import { type Out, type Rect, type TextPlace, cutSegment, extentAlong, parallel, textOnLine, textRect, verticalOffset } from './builder';
import { decideFit } from './fit';
import { type P, add, ang, dir, dist, dot, intersect, madd, mid, mul, neg, perp, project, sub, unit } from './vec';

export function linear(o: Out): void {
  const d = o.dim;
  const v = o.v;
  const p1 = o.w(d.defPoint2);
  const p2 = o.w(d.defPoint3);
  const dp = o.w(d.defPoint);
  const aligned = (d.dimType & 7) === 1;
  const theta = aligned ? (dist(p1, p2) > 1e-12 ? ang(sub(p2, p1)) : d.rotation || 0) : d.rotation || 0;
  const u = dir(theta);
  const n = perp(u);
  const e = d.obliqueAngle ? dir(d.obliqueAngle) : n;
  const d2 = intersect(dp, u, p2, e) ?? project(p2, dp, u);
  const d1 = intersect(dp, u, p1, e) ?? project(p1, dp, u);
  o.measurement = aligned ? dist(p1, p2) : Math.abs(dot(sub(p2, p1), u));

  // 치수보조선
  let e1 = sub(d1, p1);
  let e2 = sub(d2, p2);
  const side = unit(add(e1, e2), n);
  e1 = unit(e1, side);
  e2 = unit(e2, side);
  const extLine = (orig: P, at: P, ed: P, i: 1 | 2) => {
    let start = madd(orig, ed, v.exo);
    if (v.fxlon) {
      const natural = dot(sub(at, orig), ed) - v.exo;
      if (natural > v.fxl) start = madd(at, ed, -v.fxl);
    }
    o.line(start, madd(at, ed, v.exe), o.extProps(i));
  };
  if (!v.se1) extLine(p1, d1, e1, 1);
  if (!v.se2) extLine(p2, d2, e2, 2);

  const L = dist(d1, d2);
  const ux = L > 1e-12 ? unit(sub(d2, d1)) : u;
  const lineAng = ang(ux);
  const k1 = arrowKind(o, v.blk1);
  const k2 = arrowKind(o, v.blk2);
  const text = o.makeText(o.measurement);

  // 문자 각도와 맞춤
  const angIn = o.textAngle(lineAng, v.tih);
  const angOut = o.textAngle(lineAng, v.toh);
  const alongIn = text ? extentAlong(text.box, angIn, lineAng) : 0;
  const alongOut = text ? extentAlong(text.box, angOut, lineAng) : 0;
  // 맞춤(132차 — 실제 도면 840개의 AutoCAD 블록과 견줌, fit.ts FitSpace): 화살촉은 2·DIMGAP을 더한 자리가 있어야 안에 들고,
  // 제자리 문자가 치수선 위·아래(DIMTAD)면 문자와 화살촉이 저마다 들어가면 둘 다 안이다.
  // 옮긴 문자(사용자 위치 + DIMTMOVE 1, 또는 DIMTMOVE 2에 DIMATFIT 3이 아닌 것)는 치수선 자리를 차지하지 않고(폭 0),
  // DIMATFIT 0·1에서 문자 중간점이 치수보조선 밖이면 화살촉도 밖이다.
  // 문자가 없는 치수(숨긴 문자 ' ')는 치수선 자리를 차지하지 않으므로 둘 다 들어감 = 화살촉 자리(2·DIMGAP 더함)가 들어감이다(143차 —
  // 실제 도면의 그런 선형 치수 132개에서 AutoCAD는 (보조선 사이 − 2·DIMASZ)/DIMGAP이 1.981 이하면 모두 바깥, 2.143 이상이면 모두 안쪽으로
  // 문자 있는 치수의 경계와 같다). 전에는 문자 자리 0 + 화살촉 둘로 세어 2·DIMGAP이 빠졌다
  const moved = !!text && o.userText && (v.tmove === 1 || (v.tmove === 2 && v.atfit !== 3));
  const offLine = !!text && !o.userText && !textOnLine(o, angIn, lineAng);
  const fit = decideFit(o, L, text ? (moved ? 0 : alongIn) + 2 * v.gap : 0, Math.max(k1.size, k2.size) * 2, { arrowGap: true, textOffLine: offLine || !text });
  if (moved && !v.tix && v.atfit <= 1 && fit.arrowsInside) {
    const t = dot(sub(o.o(d.textMid), d1), ux);
    if (t < 0 || t > L) fit.arrowsInside = false;
  }

  let place: TextPlace | null = null;
  let textInside = fit.textInside;
  /** 문자 쪽(1 첫 보조선, 2 둘째) — 바깥일 때 */
  let outSide: 1 | 2 = v.just === 1 || v.just === 3 ? 1 : 2;
  let leaderFrom: P | null = null;
  /** DIMTMOVE 1 지시선과 밑줄(치수선 가운데 → 꺾는 점 → 밑줄 끝) */
  let movedLeader: [P, P, P] | null = null;
  let freeText = false;
  if (text) {
    if (o.userText) {
      const tm = o.o(d.textMid);
      if (v.tmove === 0) {
        const anchor = project(tm, d1, ux);
        const t = dot(sub(anchor, d1), ux);
        textInside = t >= 0 && t <= L;
        if (!textInside) outSide = t < 0 ? 1 : 2;
        const a = textInside ? angIn : angOut;
        place = { center: add(anchor, verticalOffset(o, text.box, a, lineAng, side)), angle: a };
      } else {
        freeText = true;
        textInside = false;
        const lt = v.tmove === 1 ? movedTextLeader(o, tm, text.box, angOut, lineAng, mid(d1, d2), side) : null;
        if (lt) {
          place = lt.place;
          movedLeader = lt.leader;
        } else {
          place = { center: tm, angle: angOut };
          if (v.tmove === 1) leaderFrom = mid(d1, d2);
        }
      }
    } else if (textInside) {
      let base: P;
      const off = 2 * Math.max(k1.size, k2.size) + v.gap + alongIn / 2;
      if (v.just === 1) base = madd(d1, ux, off);
      else if (v.just === 2) base = madd(d2, ux, -off);
      else base = mid(d1, d2);
      if (v.just === 3 || v.just === 4) {
        // 보조선 위: 보조선 방향으로 놓는다
        const at = v.just === 3 ? d1 : d2;
        const ed = v.just === 3 ? e1 : e2;
        const a = o.textAngle(ang(ed), false);
        const along = extentAlong(text.box, a, ang(ed));
        const up = dir(a + Math.PI / 2);
        const c = add(madd(at, ed, v.gap + along / 2), v.tad === 0 ? { x: 0, y: 0 } : mul(up, (dot(up, ux) > 0 ? -1 : 1) * (v.gap + text.box.h / 2)));
        place = { center: c, angle: a };
      } else place = { center: add(base, verticalOffset(o, text.box, angIn, lineAng, side)), angle: angIn };
    } else {
      const sgn = outSide === 2 ? 1 : -1;
      const at = outSide === 2 ? d2 : d1;
      const start = (fit.arrowsInside ? Math.max(k1.size, k2.size) : 2 * Math.max(k1.size, k2.size)) + v.gap;
      const base = madd(at, ux, sgn * (start + alongOut / 2));
      place = { center: add(base, verticalOffset(o, text.box, angOut, lineAng, side)), angle: angOut };
    }
  }

  // 치수선
  const pr = o.dimLineProps();
  const segs: [P, P][] = [];
  const show1 = !v.sd1;
  const show2 = !v.sd2;
  const arrowsIn = fit.arrowsInside;
  const flip1 = show1 && !fit.arrowsSuppressed && flippable(d, k1, d.flipArrow1);
  const flip2 = show2 && !fit.arrowsSuppressed && flippable(d, k2, d.flipArrow2);
  const trimIn = (k: ArrowKind, show: boolean) => (fit.arrowsSuppressed || !show ? 0 : k.tick ? -v.dle : k.trim);
  const rect: Rect | null = text && place && !freeText && textInside && textOnLine(o, place.angle, lineAng) ? textRect(place, text.box, v.gap) : null;
  // 바깥 문자까지 늘이는 선의 끝(문자 쪽)
  const textReach = (): number => {
    if (!text || !place || textInside || freeText) return 0;
    const along = extentAlong(text.box, place.angle, lineAng);
    const c = dot(sub(place.center, outSide === 2 ? d2 : d1), outSide === 2 ? ux : neg(ux));
    return textOnLine(o, place.angle, lineAng) ? c - along / 2 - v.gap : c + along / 2;
  };
  if (arrowsIn || fit.arrowsSuppressed) {
    let a = madd(d1, ux, trimIn(k1, show1));
    let b = madd(d2, ux, -trimIn(k2, show2));
    const reach = textReach();
    // 문자 쪽 화살촉을 반전했으면 문자까지 늘이는 선은 치수보조선 발에서 따로 긋는다(AutoCAD 블록과 같은 조각)
    const later: [P, P][] = [];
    if (reach > 0) {
      if (outSide === 2) {
        if (flip2) later.push([d2, madd(d2, ux, reach)]);
        else b = madd(d2, ux, Math.max(reach, -trimIn(k2, show2)));
      } else if (flip1) later.push([d1, madd(d1, ux, -reach)]);
      else a = madd(d1, ux, -Math.max(reach, -trimIn(k1, show1)));
    }
    segs.push(...cutSegment(a, b, rect), ...later);
  } else {
    // 화살촉 바깥: 꼬리선
    const tail = (at: P, s: number, k: ArrowKind, isTextSide: boolean) => {
      const from = madd(at, ux, s * k.trim);
      let len = k.size + k.size;
      if (isTextSide) len = Math.max(len, textReach());
      segs.push([from, madd(at, ux, s * len)]);
    };
    if (show1) tail(d1, -1, k1, !textInside && outSide === 1);
    if (show2) tail(d2, 1, k2, !textInside && outSide === 2);
    if (v.tofl) segs.push(...cutSegment(d1, d2, rect));
  }
  // 치수선 반쪽 숨기기
  let lines = segs;
  if (v.sd1 || v.sd2) {
    const split = place && textInside ? dot(sub(project(place.center, d1, ux), d1), ux) : L / 2;
    lines = [];
    for (const [a, b] of segs) {
      const ta = dot(sub(a, d1), ux);
      const tb = dot(sub(b, d1), ux);
      const lo = Math.min(ta, tb);
      const hi = Math.max(ta, tb);
      const keepLo = v.sd1 ? Math.max(lo, split) : lo;
      const keepHi = v.sd2 ? Math.min(hi, split) : hi;
      if (keepHi - keepLo > 1e-12) lines.push(ta <= tb ? [madd(d1, ux, keepLo), madd(d1, ux, keepHi)] : [madd(d1, ux, keepHi), madd(d1, ux, keepLo)]);
    }
  }
  for (const [a, b] of lines) o.line(a, b, pr);
  if (leaderFrom && place && text) leaderTo(o, leaderFrom, place, text.box);
  if (movedLeader) {
    o.line(movedLeader[0], movedLeader[1], pr);
    o.line(movedLeader[1], movedLeader[2], pr);
  }

  // 화살촉(1 = 첫 치수보조선 쪽). 반전한 화살촉은 반대쪽을 보고, 몸통 너머로 화살촉 길이만큼 선을 더하고
  // 원래 화살촉 자리(치수선을 자르던 길이)를 선으로 채운다
  if (!fit.arrowsSuppressed) {
    // 원래 몸통 쪽 방향: 안쪽 화살촉은 치수 안, 바깥 화살촉은 치수 밖
    const body1 = arrowsIn ? ux : neg(ux);
    const body2 = neg(body1);
    if (show1) {
      drawArrow(o, k1, d1, flip1 ? body1 : neg(body1), perp(ux));
      if (flip1) flippedLines(o, k1, d1, body1);
    }
    if (show2) {
      drawArrow(o, k2, d2, flip2 ? body2 : neg(body2), perp(ux));
      if (flip2) flippedLines(o, k2, d2, body2);
    }
  }

  if (text && place) {
    o.mtext(text, place);
    o.textMid = o.userText ? o.o(d.textMid) : place.center;
  } else o.textMid = mid(d1, d2);

  o.point(p1);
  o.point(p2);
  o.point(dp);
}

/**
 * 화살표 반전(DXF 74·75, AutoCAD "화살표 반전" AIDIMFLIPARROW)을 그리는 치수: 회전·정렬 선형 치수(종류 0·1)의 닫고 채운 기본 화살촉만.
 * AutoCAD가 그린 반전 블록이 있는 실물(실제 도면 3개의 치수 3개 — 바깥 화살촉 하나·둘을 안으로, 안쪽 화살촉 둘을 밖으로)은 모두 회전 치수다(131차).
 * 정렬 치수(150차)는 반전 실물이 없지만 같은 꼴로 그린다: 반전 깃발은 치수 공통 자료이고(R2007+ DWG 공통 비트·DXF AcDbDimension 73~75 — 130차),
 * 132차 맞춤 규칙이 정렬 치수에도 그대로 맞았으며(AutoCAD가 두 종류를 같은 배치로 그린다), 위 그리기는 치수선 방향만 다르고 규칙은 치수선 좌표로 적혀 있다.
 * 각도·반지름 등 다른 종류와 블록·눈금 화살촉은 실물이 없어 반전 없이 그린다(값은 저장에 그대로 옮긴다)
 */
export function flippable(d: { dimType: number }, k: ArrowKind, flag: boolean | undefined): boolean {
  return !!flag && (d.dimType & 7) <= 1 && k.type === 'solid';
}

/**
 * 반전한 화살촉의 선 둘(AutoCAD 블록의 차례): 반전한 몸통 밑동에서 같은 쪽으로 화살촉 길이만큼, 그리고 발 at에서 원래 몸통 쪽(body)으로
 * 원래 화살촉이 치수선을 자르던 길이만큼. 원래 바깥 화살촉의 꼬리·DIMTOFL 치수선·안쪽 치수선은 반전하지 않은 그림 그대로 둔다
 */
function flippedLines(o: Out, k: ArrowKind, at: P, body: P): void {
  const pr = o.dimLineProps();
  o.line(madd(at, body, -k.size), madd(at, body, -2 * k.size), pr);
  o.line(at, madd(at, body, k.trim), pr);
}

/**
 * 사용자 위치 문자 + DIMTMOVE 1(지시선과 함께)에서 문자가 치수선과 나란할 때의 문자 자리와 지시선(133차 — 실제 도면 840개의
 * AutoCAD 치수 블록에서 이 꼴인 지시선 31개·지시선 없는 2,787개와 견줌. 도움말 "Fit Tab"은 문자가 치수선에 너무 가까우면 지시선을 생략한다고만 한다):
 * - 문자 중간점(DXF 11)은 문자 밑 자리다. 문자 가운데는 거기서 치수선 위 문자와 같은 자리(DIMTAD — DIMGAP + 문자 높이/2)만큼 비킨다.
 * - 중간점이 치수선에서 DIMGAP + 1.1 × 문자 높이 안이면 지시선 없이 문자 가운데의 치수선 방향 자리를 중간점에 둔다
 *   (실물 경계: 한 줄 문자 1.595 DIMASZ는 지시선 없음·1.695는 지시선, 여러 줄은 문자 높이를 따라 넓어짐 — 위·아래 같음).
 * - 더 멀면 치수선 가운데에서 (중간점 − DIMGAP)까지 지시선, 거기서 문자 밑으로 문자 폭 + 2·DIMGAP 밑줄을 긋고,
 *   문자는 중간점에서 치수선 가운데의 반대쪽으로 뻗는다.
 * 나란하지 않은 문자(DIMTOH 수평·문자 회전)는 실물의 꼴이 달라(문자가 중간점 옆으로 비킴) null — 부르는 쪽이 전처럼 그린다
 */
function movedTextLeader(o: Out, tm: P, box: { w: number; h: number }, angle: number, lineAng: number, from: P, side: P): { place: TextPlace; leader: [P, P, P] | null } | null {
  if (!parallel(angle, lineAng)) return null;
  const v = o.v;
  const ax = dir(angle);
  const off = verticalOffset(o, box, angle, lineAng, side);
  const rel = sub(tm, from);
  if (Math.abs(dot(rel, perp(ax))) <= v.gap + 1.1 * box.h) return { place: { center: add(tm, off), angle }, leader: null };
  const s = dot(rel, ax) < 0 ? -1 : 1;
  return {
    place: { center: add(madd(tm, ax, (s * box.w) / 2), off), angle },
    leader: [from, madd(tm, ax, -s * v.gap), madd(tm, ax, s * (box.w + v.gap))],
  };
}

/** 문자 이동(DIMTMOVE 1): 치수선에서 문자까지 지시선(문자가 치수선과 나란하지 않을 때 — movedTextLeader) */
export function leaderTo(o: Out, from: P, place: TextPlace, box: { w: number; h: number }): void {
  const ax = dir(place.angle);
  const s = dot(sub(from, place.center), ax) < 0 ? -1 : 1;
  const edge = madd(place.center, ax, s * (box.w / 2 + o.v.gap));
  const land = madd(edge, ax, s * o.v.asz);
  const pr = o.dimLineProps();
  o.line(from, land, pr);
  o.line(land, edge, pr);
}
