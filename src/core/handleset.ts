/** 비트 표에 두는 핸들의 상한(이보다 작은 0 이상 정수 — 비트 표는 많아야 4 MiB) */
const SMALL_HANDLE = 1 << 25;

/**
 * 핸들 값 모음(126차): `Set<number>`의 has·add·delete와 같은 결과를 내되, 2^25보다 작은 0 이상 정수는 비트 표에 둔다(필요한 만큼 두 배씩 늘린다).
 * 그 밖의 값(아주 큰 핸들 등)은 Set에 둔다. DWG·DXF 쓰기는 정점·SEQEND까지 객체마다 쓴 핸들과 쓸 객체 핸들을 넣고 다시 묻는데,
 * 객체 700만 개 도면에서 Set이 DWG 저장 CPU의 약 18%, DXF 저장의 약 21%였다
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
