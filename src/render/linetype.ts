/**
 * 선종류 무늬를 꺾은선에 입힌다(월드 좌표).
 * 무늬 길이: 양수 = 선, 음수 = 틈, 0 = 점. 길이는 이미 축척을 곱한 값이다.
 */
import { DASH_REPEAT_LIMIT, DASH_STEP_LIMIT } from '../core/limits';

export interface DashPattern {
  dashes: number[];
  period: number;
  /** 문자가 든 복합 선종류 요소(위치는 무늬 안 거리) */
  texts?: { at: number; text: string; style?: string; scale: number; rotation: number; absolute: boolean; dx: number; dy: number; shape?: { file: string; num: number } }[];
}

export type SegmentSink = (x0: number, y0: number, x1: number, y1: number) => void;

/** 무늬를 입히며 든 일(조각 단위)과, 요소가 너무 많아 실선으로 낮췄는지 */
export interface DashWork {
  n: number;
  limited?: boolean;
}

/**
 * pts를 따라 무늬를 그린다. 전체 길이가 무늬 한 주기보다 짧으면 실선(AutoCAD와 같다).
 * 반복이 한도를 넘거나 요소를 밟는 수가 한도를 넘어도 실선으로 그린다.
 * 반환: 실선으로 그렸으면 false
 */
export function dashPolyline(pts: ArrayLike<number>, closed: boolean, pat: DashPattern, sink: SegmentSink, textSink?: (x: number, y: number, angle: number, t: NonNullable<DashPattern['texts']>[number]) => void, work?: DashWork): boolean {
  const n = pts.length >> 1;
  if (n < 2) return false;
  let total = 0;
  const segCount = closed ? n : n - 1;
  for (let i = 0; i < segCount; i++) {
    const j = (i + 1) % n;
    total += Math.hypot(pts[j * 2]! - pts[i * 2]!, pts[j * 2 + 1]! - pts[i * 2 + 1]!);
  }
  const repeats = total / pat.period;
  // 복합 선종류의 문자·도형은 주기마다 글자 수만큼 배치한다(공백은 조각도 내지 않는다)
  let chars = 0;
  for (const t of pat.texts ?? []) chars += Math.max(1, t.text.length);
  const steps = Math.ceil(repeats) * (pat.dashes.length + chars);
  const tooMany = repeats <= DASH_REPEAT_LIMIT && steps > DASH_STEP_LIMIT;
  if (!(pat.period > 0) || total < pat.period || repeats > DASH_REPEAT_LIMIT || tooMany) {
    for (let i = 0; i < segCount; i++) {
      const j = (i + 1) % n;
      sink(pts[i * 2]!, pts[i * 2 + 1]!, pts[j * 2]!, pts[j * 2 + 1]!);
    }
    if (tooMany && work) work.limited = true;
    return false;
  }
  // 틈은 조각을 내지 않으므로 요소를 밟는 일을 따로 센다. 문자는 글자 하나가 요소 하나보다 훨씬 비싸다(문자 객체와 같은 몫)
  if (work) work.n += (steps >> 3) + (Math.ceil(repeats) * chars >> 1);
  const dashes = pat.dashes;
  let di = 0;
  let remain = Math.abs(dashes[0]!);
  let on = dashes[0]! >= 0;
  let dot = dashes[0] === 0;
  let dist = 0; // 무늬 시작부터 거리
  const texts = pat.texts;
  let nextText = 0;
  let periodStart = 0;
  for (let i = 0; i < segCount; i++) {
    const j = (i + 1) % n;
    let x = pts[i * 2]!;
    let y = pts[i * 2 + 1]!;
    const x1 = pts[j * 2]!;
    const y1 = pts[j * 2 + 1]!;
    let len = Math.hypot(x1 - x, y1 - y);
    if (len < 1e-15) continue;
    const ux = (x1 - x) / len;
    const uy = (y1 - y) / len;
    while (len > 1e-15) {
      if (dot) {
        sink(x, y, x, y);
        dot = false;
      }
      if (texts && textSink) {
        while (nextText < texts.length && periodStart + texts[nextText]!.at <= dist + Math.min(remain, len) + 1e-12) {
          const t = texts[nextText]!;
          const d = periodStart + t.at - dist;
          if (d >= -1e-12) textSink(x + ux * d, y + uy * d, Math.atan2(uy, ux), t);
          nextText++;
        }
      }
      const step = Math.min(remain, len);
      const nx = x + ux * step;
      const ny = y + uy * step;
      if (on && step > 0) sink(x, y, nx, ny);
      x = nx;
      y = ny;
      len -= step;
      remain -= step;
      dist += step;
      if (remain <= 1e-15) {
        di++;
        if (di >= dashes.length) {
          di = 0;
          periodStart = dist;
          nextText = 0;
        }
        const d = dashes[di]!;
        remain = Math.abs(d);
        on = d >= 0;
        dot = d === 0;
      }
    }
  }
  return true;
}

/** 무늬 선(해치) 한 줄 [t0, t1] 구간에 대시를 입힌다. 무늬는 t = 0에서 시작한다. */
export function dashInterval(t0: number, t1: number, dashes: readonly number[], period: number, emit: (a: number, b: number) => void): void {
  if (!dashes.length || !(period > 0)) {
    emit(t0, t1);
    return;
  }
  // 주기 번호가 2^53을 넘으면 k++가 값을 바꾸지 못해 아래 고리가 끝나지 않는다(무늬 원점에서 아주 먼 구간): 실선으로
  if (Math.abs(t0 / period) >= Number.MAX_SAFE_INTEGER || Math.abs(t1 / period) >= Number.MAX_SAFE_INTEGER) {
    emit(t0, t1);
    return;
  }
  let k = Math.floor(t0 / period);
  let base = k * period;
  for (; base < t1; k++, base = k * period) {
    let s = base;
    for (const d of dashes) {
      const e = s + Math.abs(d);
      if (d >= 0) {
        const a = Math.max(s, t0);
        const b = Math.min(d === 0 ? s : e, t1);
        if (d === 0) {
          if (s >= t0 && s <= t1) emit(s, s);
        } else if (b > a) emit(a, b);
      }
      s = e;
      if (s >= t1) break;
    }
  }
}
