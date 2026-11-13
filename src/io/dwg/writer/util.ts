/** 쓰기 도우미: 선가중치 번호, 핸들 문자열, 핸들 모음, 경고 */
import type { ReadWarning } from '../../../core/model';

const LW_TABLE = [0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140, 158, 200, 211];

/** 1/100 mm 선가중치 → DWG 번호(표에 없으면 가장 가까운 아래 값). 30은 0.30 mm다(번호 30인 ByBlock은 -2) */
export function lwIndex(v: number): number {
  if (v === -1) return 29;
  if (v === -2) return 30;
  if (v === -3 || !Number.isFinite(v) || v < 0) return 31;
  let best = 0;
  for (let i = 0; i < LW_TABLE.length; i++) if (LW_TABLE[i] <= v) best = i;
  return best;
}

/**
 * "1F" → 0x1F. 잘못된 값은 0.
 * 126차: 흔한 꼴(앞뒤 공백 없는 16진 1~13자)은 trim·정규식·parseInt 없이 바로 센다(13자 = 52비트라 정확하다) — 결과는 아래 길과 같다.
 * 도형마다 핸들을 받고 그리기 순서 표 항목마다 세 번 부르는데, 객체 42만 개 도면 저장 CPU의 약 10%였다
 */
export function parseHandle(h: string | undefined): number {
  if (!h) return 0;
  const n = h.length;
  if (n <= 13) {
    let v = 0;
    let i = 0;
    for (; i < n; i++) {
      const c = h.charCodeAt(i);
      const d = c >= 48 && c <= 57 ? c - 48 : c >= 65 && c <= 70 ? c - 55 : c >= 97 && c <= 102 ? c - 87 : -1;
      if (d < 0) break;
      v = v * 16 + d;
    }
    if (i === n) return v;
  }
  const t = h.trim();
  if (!/^[0-9A-Fa-f]{1,13}$/.test(t)) return 0;
  return parseInt(t, 16);
}

/** 비트 표에 두는 핸들의 상한(이보다 작은 0 이상 정수 — 비트 표는 많아야 4 MiB) */
const SMALL_HANDLE = 1 << 25;

/**
 * 핸들 모음(126차): `Set<number>`의 has·add·delete와 같은 결과를 내되, 2^25보다 작은 0 이상 정수는 비트 표에 둔다(필요한 만큼 두 배씩 늘린다).
 * 그 밖의 값(아주 큰 핸들 등)은 Set에 둔다. 쓰기 계획은 정점·SEQEND까지 객체마다 쓴 핸들과 쓸 객체 핸들을 넣고 저장 끝에 객체마다 다시 묻는데,
 * 객체 700만 개 도면에서 Set 둘이 저장 CPU의 약 18%와 큰 GC 몫이었다
 */
export class HandleSet {
  private bits = new Uint32Array(64);
  private other: Set<number> | undefined;

  has(h: number): boolean {
    if (h >= 0 && h < SMALL_HANDLE && (h | 0) === h) {
      const w = h >>> 5;
      return w < this.bits.length && (this.bits[w]! & (1 << (h & 31))) !== 0;
    }
    return this.other !== undefined && this.other.has(h);
  }

  add(h: number): this {
    if (h >= 0 && h < SMALL_HANDLE && (h | 0) === h) {
      const w = h >>> 5;
      if (w >= this.bits.length) this.grow(w);
      this.bits[w] = this.bits[w]! | (1 << (h & 31));
    } else (this.other ??= new Set()).add(h);
    return this;
  }

  delete(h: number): boolean {
    if (h >= 0 && h < SMALL_HANDLE && (h | 0) === h) {
      const w = h >>> 5;
      if (w >= this.bits.length) return false;
      const m = 1 << (h & 31);
      const had = (this.bits[w]! & m) !== 0;
      this.bits[w] = this.bits[w]! & ~m;
      return had;
    }
    return this.other !== undefined && this.other.delete(h);
  }

  private grow(w: number): void {
    let n = this.bits.length * 2;
    while (n <= w) n *= 2;
    const b = new Uint32Array(n);
    b.set(this.bits);
    this.bits = b;
  }
}

/** 같은 경고는 한 번만 넣고 개수를 센다 */
export function warnOnce(list: ReadWarning[], code: string, message: string, detail?: Record<string, unknown>): void {
  const w = list.find((x) => x.code === code && x.message === message);
  if (w) {
    w.count = (w.count ?? 1) + 1;
    return;
  }
  list.push(detail ? { code, message, count: 1, detail } : { code, message, count: 1 });
}
