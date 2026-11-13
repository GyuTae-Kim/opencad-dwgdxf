/** 표에 두는 핸들의 상한(이보다 작은 0 이상 정수) */
const SMALL_HANDLE = 1 << 25;
/** 표 길이는 넣은 열쇠 수의 이 배 + TABLE_SLACK까지만 늘린다(성긴 핸들에 큰 표를 잡지 않게 — 넘는 열쇠는 Map에) */
const TABLE_PER_KEY = 8;
const TABLE_SLACK = 1 << 16;

/**
 * 핸들 값 → 값 모음(127차): `Map<number, V>`의 get·set·has·size·넣은 차례 훑기와 같은 결과를 내되,
 * 조밀한 0 이상 정수 핸들은 자리 표(Int32Array, 핸들 → 넣은 차례 + 1)로 찾는다. 열쇠·값은 넣은 차례의 두 배열에 둔다
 * (같은 열쇠를 다시 넣으면 Map처럼 처음 자리를 지키고 값만 바꾼다). 표 밖의 열쇠(아주 크거나 성긴 핸들, 음수·소수)는 Map에 둔다.
 * DWG 읽기는 객체마다 객체 지도·종류·읽은 도형을 핸들로 넣고 다시 찾는데, 객체 지도 302만 개 도면의 읽기 프로필에서 그 Map 넣기 줄 셋이 22.6%였다
 */
export class HandleMap<V> {
  /** 넣은 차례의 열쇠 */
  readonly keys: number[] = [];
  /** 넣은 차례의 값(keys와 같은 자리) */
  readonly vals: V[] = [];
  private slot = new Int32Array(0);
  private other: Map<number, number> | undefined;

  get size(): number {
    return this.keys.length;
  }

  /** 열쇠의 자리(넣은 차례), 없으면 -1 */
  indexOf(h: number): number {
    if (h >= 0 && h < this.slot.length && (h | 0) === h) {
      const s = this.slot[h]!;
      if (s !== 0) return s - 1;
    }
    if (this.other === undefined) return -1;
    const i = this.other.get(h);
    return i === undefined ? -1 : i;
  }

  get(h: number): V | undefined {
    const i = this.indexOf(h);
    return i < 0 ? undefined : this.vals[i];
  }

  has(h: number): boolean {
    return this.indexOf(h) >= 0;
  }

  set(h: number, v: V): this {
    const i = this.indexOf(h);
    if (i >= 0) {
      this.vals[i] = v;
      return this;
    }
    const n = this.keys.length;
    // Map처럼 -0은 0으로 둔다
    this.keys.push(h === 0 ? 0 : h);
    this.vals.push(v);
    if (h >= 0 && h < SMALL_HANDLE && (h | 0) === h && this.cover(h, n + 1)) this.slot[h] = n + 1;
    else (this.other ??= new Map()).set(h, n);
    return this;
  }

  /** 넣은 차례의 값 */
  values(): readonly V[] {
    return this.vals;
  }

  /** 넣은 차례의 [열쇠, 값] */
  *entries(): IterableIterator<[number, V]> {
    const { keys, vals } = this;
    for (let i = 0; i < keys.length; i++) yield [keys[i]!, vals[i]!];
  }

  [Symbol.iterator](): IterableIterator<[number, V]> {
    return this.entries();
  }

  /** 표가 h를 담게 늘린다(열쇠 count개에 허용하는 길이를 넘으면 늘리지 않고 거짓) */
  private cover(h: number, count: number): boolean {
    const len = this.slot.length;
    if (h < len) return true;
    if (h >= count * TABLE_PER_KEY + TABLE_SLACK) return false;
    let n = Math.max(1024, len * 2);
    while (n <= h) n *= 2;
    const t = new Int32Array(Math.min(n, SMALL_HANDLE));
    t.set(this.slot);
    this.slot = t;
    return true;
  }
}
