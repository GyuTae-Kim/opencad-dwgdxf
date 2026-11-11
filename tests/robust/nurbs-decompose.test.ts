/**
 * 112차: 큰 스플라인의 베지어 분해(toBezier)가 매듭마다 insertKnot로 배열을 새로 만들어 조각 수의 제곱이었다(조각 2만 개 수 초, 20만 개는 끝나지 않음).
 * 매듭을 왼쪽부터 한 번 훑는 꼴로 바꿨다. 예전 식(매듭마다 insertKnot)과 조각 수·조정점이 수치 허용 안에서 같은지,
 * 뜻이 애매한 매듭(겹침이 차수보다 많음·순서가 틀림·끝과 거의 같음)은 예전 길과 똑같은지, 큰 곡선이 끝나는지 본다.
 */
import { describe, expect, it } from 'vitest';
import { type Nurbs, clampNurbs, domain, insertKnot, nurbsPoint, toBezier } from '../../src/edit/geom/nurbs';
import { within2s } from './timed';

/** 고치기 전의 식: 안쪽 매듭마다 insertKnot로 차수만큼 넣고 p개씩 자른다 */
function beforeBezier(c0: Nurbs): number[][][] {
  let c = clampNurbs(c0);
  const p = c.degree;
  const [a, b] = domain(c);
  for (const u of new Set(c.knots.filter((k) => k > a && k < b))) c = insertKnot(c, u, p);
  const Pw = c.ctrl.map((q, i) => {
    const w = c.weights ? (c.weights[i] ?? 1) : 1;
    return [q.x * w, q.y * w, q.z * w, w];
  });
  const segs: number[][][] = [];
  for (let i = 0; i + p < Pw.length; i += p) segs.push(Pw.slice(i, i + p + 1));
  return segs;
}

let seed = 1121;
const rnd = (): number => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

/** 무작위 곡선: 안쪽 매듭 겹침 1~차수, 끝 고정 또는 비고정, 가중치 있거나 없음 */
function randomCurve(jitter = 0): Nurbs {
  const degree = 1 + Math.floor(rnd() * 5);
  const groups = Math.floor(rnd() * 30);
  const inner: number[] = [];
  let u = rnd() * 5;
  const scale = rnd() < 0.3 ? 1 : 0.1 + rnd() * 50;
  const a = u * scale;
  for (let g = 0; g < groups; g++) {
    u += 0.05 + rnd();
    const mult = 1 + Math.floor(rnd() * degree);
    for (let k = 0; k < mult; k++) inner.push(u * scale + (k && jitter ? rnd() * jitter : 0));
  }
  inner.sort((p, q) => p - q);
  u += 0.05 + rnd();
  const b = u * scale;
  const clamped = rnd() < 0.7;
  const knots = clamped
    ? [...Array.from({ length: degree + 1 }, () => a), ...inner, ...Array.from({ length: degree + 1 }, () => b)]
    : [...Array.from({ length: degree + 1 }, (_, i) => a - (degree - i) * 0.3), ...inner, ...Array.from({ length: degree + 1 }, (_, i) => b + i * 0.3)];
  const n = knots.length - degree - 1;
  const ctrl = Array.from({ length: n }, () => ({ x: (rnd() - 0.5) * 100, y: (rnd() - 0.5) * 100, z: rnd() < 0.5 ? 0 : rnd() * 10 }));
  const weights = rnd() < 0.5 ? Array.from({ length: n }, () => 0.2 + rnd() * 5) : undefined;
  return { degree, knots, ctrl, weights };
}

function expectClose(a: number[][][], b: number[][][], tol: number): void {
  expect(a.length).toBe(b.length);
  for (let s = 0; s < a.length; s++) {
    expect(a[s]!.length).toBe(b[s]!.length);
    for (let i = 0; i < a[s]!.length; i++) for (let k = 0; k < 4; k++) expect(Math.abs(a[s]![i]![k]! - b[s]![i]![k]!)).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(b[s]![i]![k]!)));
  }
}

/** 베지어 조각의 점(동차, 드 카스텔조) */
function bezierPoint(seg: number[][], t: number): [number, number, number] {
  let cur = seg.map((h) => [...h]);
  while (cur.length > 1) cur = cur.slice(1).map((h, i) => h.map((v, k) => (1 - t) * cur[i]![k]! + t * v));
  const [x, y, z, w] = cur[0]!;
  return [x! / w!, y! / w!, z! / w!];
}

describe('toBezier를 한 번에 펼치기(112차)', () => {
  it('무작위 곡선(차수 1~5, 겹침 1~차수, 비고정 끝, 가중치)의 조각 수·조정점이 매듭마다 넣던 식과 같다', () => {
    for (let t = 0; t < 400; t++) {
      const c = randomCurve();
      expectClose(toBezier(c), beforeBezier(c), 1e-9);
    }
  });

  it('조각을 이어 잰 점이 곡선 위 점과 같다', () => {
    for (let t = 0; t < 100; t++) {
      const c = clampNurbs(randomCurve());
      const segs = toBezier(c);
      const [a, b] = domain(c);
      const breaks = [a, ...new Set(c.knots.filter((k) => k > a && k < b)), b];
      expect(segs.length).toBe(breaks.length - 1);
      for (let s = 0; s < segs.length; s++) {
        for (const f of [0.17, 0.5, 0.83]) {
          const [x, y, z] = bezierPoint(segs[s]!, f);
          const q = nurbsPoint(c, breaks[s]! + (breaks[s + 1]! - breaks[s]!) * f);
          expect(Math.abs(x - q.x)).toBeLessThan(1e-7);
          expect(Math.abs(y - q.y)).toBeLessThan(1e-7);
          expect(Math.abs(z - q.z)).toBeLessThan(1e-7);
        }
      }
    }
  });

  it('안쪽 매듭이 허용치(1e-12) 안으로 거의 같아도 조각 수가 같고 곡선 위에 있다(예전 식은 곡선 밖으로 나갔다 — 겹침을 왼쪽 매듭만 보고 셌다)', () => {
    for (let t = 0; t < 200; t++) {
      const c = clampNurbs(randomCurve(1e-13));
      const segs = toBezier(c);
      expect(segs.length).toBe(beforeBezier(c).length);
      const [a, b] = domain(c);
      const breaks = [a];
      for (const k of c.knots) if (k > a && k < b && k - breaks[breaks.length - 1]! > 1e-9) breaks.push(k);
      breaks.push(b);
      expect(segs.length).toBe(breaks.length - 1);
      for (let s = 0; s < segs.length; s++)
        for (const f of [0.17, 0.5, 0.83]) {
          const [x, y] = bezierPoint(segs[s]!, f);
          const q = nurbsPoint(c, breaks[s]! + (breaks[s + 1]! - breaks[s]!) * f);
          expect(Math.abs(x - q.x)).toBeLessThan(1e-6);
          expect(Math.abs(y - q.y)).toBeLessThan(1e-6);
        }
    }
    // 예전 식이 곡선 밖으로 나가던 꼴(겹침 2, 3차): 곡선 위 점과 거리 1.18 → 1e-13
    const c: Nurbs = { degree: 3, knots: [0, 0, 0, 0, 1, 1 + 1e-13, 2, 3, 3, 3, 3], ctrl: [[0, 0], [1, 2], [2, -1], [3, 3], [4, 0], [5, 1], [6, 0]].map(([x, y]) => ({ x: x!, y: y!, z: 0 })) };
    const [x, y] = bezierPoint(toBezier(c)[0]!, 0.5);
    const q = nurbsPoint(c, 0.5);
    expect(Math.hypot(x - q.x, y - q.y)).toBeLessThan(1e-9);
  });

  it('뜻이 애매한 매듭은 예전 식 그대로다(겹침이 차수보다 많음·순서가 틀림·정의역 끝과 거의 같음·정의역 길이 0)', () => {
    const P = (i: number) => ({ x: i, y: i * i, z: 0 });
    const curve = (degree: number, knots: number[]): Nurbs => ({ degree, knots, ctrl: Array.from({ length: knots.length - degree - 1 }, (_, i) => P(i)) });
    for (const c of [
      curve(1, [0, 0, 1, 1, 2, 2]),
      curve(2, [0, 0, 0, 1, 1, 1, 2, 2, 2]),
      curve(3, [0, 0, 0, 0, 2, 1, 3, 3, 3, 3]),
      curve(2, [0, 0, 0, 1e-13, 1, 2, 2, 2]),
      curve(2, [0, 0, 0, 1, 2 - 1e-13, 2, 2, 2]),
      curve(2, [1, 1, 1, 1, 1, 1]),
    ])
      expect(toBezier(c)).toEqual(beforeBezier(c));
  });

  it('가중치 있는 곡선의 조각은 동차 좌표다(x·y·z에 w가 곱해져 있다)', () => {
    const c: Nurbs = { degree: 2, knots: [0, 0, 0, 1, 1, 1], ctrl: [{ x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }], weights: [1, Math.SQRT1_2, 1] };
    expect(toBezier(c)).toEqual([[[1, 0, 0, 1], [Math.SQRT1_2, Math.SQRT1_2, 0, Math.SQRT1_2], [0, 1, 0, 1]]]);
  });

  it('조각 2만·20만 개 곡선이 끝난다(예전 제곱)', () => {
    for (const N of [20_000, 200_000]) {
      const inner = Array.from({ length: N - 1 }, (_, i) => i + 1);
      const c: Nurbs = { degree: 3, knots: [0, 0, 0, 0, ...inner, N, N, N, N], ctrl: Array.from({ length: N + 3 }, (_, i) => ({ x: i, y: Math.sin(i), z: 0 })) };
      const segs = within2s(() => toBezier(c));
      expect(segs.length).toBe(N);
      expect(segs[0]!.length).toBe(4);
      // 이음매의 끝과 시작이 같다
      expect(segs[N - 1]![0]).toEqual(segs[N - 2]![3]);
    }
  });
});
