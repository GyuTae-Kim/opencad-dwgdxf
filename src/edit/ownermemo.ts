/**
 * 소유 블록 기억(EditSession 빠른 길 — 108차): 핸들 → (블록 키, 블록 안의 자리).
 *
 * 전에는 Map 둘(핸들 → 블록 키, 핸들 → 자리)에 문서의 모든 객체를 넣었다. 객체 42만 개 도면에서 그 표 만들기가 약 160ms로,
 * 명령 처음 소유 블록을 찾는 MOVE 2,000개(약 175ms)의 대부분이었다. 여기서는 정규형 16진 핸들(대문자, 앞 0 없음, 8자까지 —
 * 리더가 핸들을 이 꼴로 읽는다)을 수로 바꿔 형식 배열의 열린 주소 표(선형 탐사)에 담고, 블록 키는 블록 번호로 적는다.
 * 정규형 핸들끼리는 글자가 같아야 수가 같으므로 겹친 핸들도 글자 그대로 가려낸다. 정규형이 아닌 핸들(드물다)은 Map에 둔다.
 *
 * 기억은 지우지 않는다(지운 객체의 기억이 남아도 EditSession은 답을 언제나 지금 블록에서 확인한다). 자리 -1 = 모름.
 */
import type { CadDocument } from '../core/model';

/** 표의 가장 작은 칸 수(2의 거듭제곱) */
const MIN_SLOTS = 1024;
const EMPTY = 0;

/**
 * 정규형 16진 핸들의 표 열쇠(값 + 1, 1 이상 2³² − 1). 정규형이 아니거나 8자를 넘거나 값이 FFFFFFFF면 0(Map에 둔다).
 * 8자까지는 32비트 안이라 정수 연산으로 끝난다
 */
export function handleSlotKey(h: string): number {
  if (typeof h !== 'string') return EMPTY;
  const n = h.length;
  if (n === 0 || n > 8 || (n > 1 && h.charCodeAt(0) === 48)) return EMPTY;
  let v = 0;
  for (let i = 0; i < n; i++) {
    const c = h.charCodeAt(i);
    let d: number;
    if (c >= 48 && c <= 57) d = c - 48;
    else if (c >= 65 && c <= 70) d = c - 55;
    else return EMPTY;
    v = (v << 4) | d;
  }
  const u = v >>> 0;
  return u === 0xffffffff ? EMPTY : u + 1;
}

export class OwnerMemo {
  /** 열쇠(handleSlotKey, 0 = 빈 칸) */
  private keys: Uint32Array;
  /** 칸의 블록 번호(blockKeys 자리) */
  private blk: Int32Array;
  /** 칸의 블록 안 자리(-1 = 모름) */
  private pos: Int32Array;
  private shift: number;
  /** 표에 든 열쇠 수 */
  private used = 0;
  /** 블록 번호 → 블록 키 */
  private readonly blockKeys: string[] = [];
  private readonly blockNo = new Map<string, number>();
  /** 정규형이 아닌 핸들 → [블록 번호, 자리] */
  private readonly odd = new Map<string, [number, number]>();
  /** get이 찾은 블록 키와 자리 */
  block = '';
  at = -1;

  constructor(expected = 0) {
    let cap = MIN_SLOTS;
    while (cap < expected * 2) cap *= 2;
    this.keys = new Uint32Array(cap);
    this.blk = new Int32Array(cap);
    this.pos = new Int32Array(cap);
    this.shift = 32 - Math.log2(cap);
  }

  /**
   * 문서의 모든 블록 객체로 만든다(블록 차례·블록 안 차례). 핸들이 겹치거나 빈 핸들이 둘 이상이면 null
   * (EditSession이 옛 길로 간다 — 102차까지 표를 만들 때와 같은 판정)
   */
  static build(doc: CadDocument): OwnerMemo | null {
    let total = 0;
    for (const b of doc.blocks.values()) total += b.entities.length;
    const memo = new OwnerMemo(total);
    let unnamed = 0;
    for (const [k, b] of doc.blocks) {
      const no = memo.numberOf(k);
      const list = b.entities;
      for (let i = 0; i < list.length; i++) {
        const h = list[i]!.handle;
        if (!h) {
          if (++unnamed > 1) return null;
          continue;
        }
        if (!memo.insertNew(h, no, i)) return null;
      }
    }
    return memo;
  }

  /** 든 핸들 수 */
  get size(): number {
    return this.used + this.odd.size;
  }

  /** handle의 기억을 찾아 block·at에 둔다(없으면 거짓) */
  get(handle: string): boolean {
    const key = handleSlotKey(handle);
    if (key === EMPTY) {
      const x = this.odd.get(handle);
      if (!x) return false;
      this.block = this.blockKeys[x[0]]!;
      this.at = x[1];
      return true;
    }
    const s = this.slot(key);
    if (this.keys[s] === EMPTY) return false;
    this.block = this.blockKeys[this.blk[s]!]!;
    this.at = this.pos[s]!;
    return true;
  }

  /** handle이 블록 key에 있다고 적는다. at을 주지 않으면 기억한 자리를 그대로 둔다(없으면 -1) */
  put(handle: string, key: string, at?: number): void {
    const no = this.numberOf(key);
    const k = handleSlotKey(handle);
    if (k === EMPTY) {
      const x = this.odd.get(handle);
      if (x) {
        x[0] = no;
        if (at !== undefined) x[1] = at;
      } else this.odd.set(handle, [no, at ?? -1]);
      return;
    }
    let s = this.slot(k);
    if (this.keys[s] === EMPTY) {
      if ((this.used + 1) * 4 > this.keys.length * 3) {
        this.grow();
        s = this.slot(k);
      }
      this.keys[s] = k;
      this.pos[s] = at ?? -1;
      this.used++;
    } else if (at !== undefined) this.pos[s] = at;
    this.blk[s] = no;
  }

  /** 표를 만들 때 넣는다. 이미 든 핸들이면 거짓 */
  private insertNew(handle: string, no: number, at: number): boolean {
    const k = handleSlotKey(handle);
    if (k === EMPTY) {
      if (this.odd.has(handle)) return false;
      this.odd.set(handle, [no, at]);
      return true;
    }
    const s = this.slot(k);
    if (this.keys[s] !== EMPTY) return false;
    // 만들 때는 칸을 객체 수의 두 배 이상 잡아 늘리지 않는다
    this.keys[s] = k;
    this.blk[s] = no;
    this.pos[s] = at;
    this.used++;
    return true;
  }

  /** 열쇠 k가 든 칸, 없으면 그 열쇠가 들어갈 빈 칸 */
  private slot(k: number): number {
    const keys = this.keys;
    const mask = keys.length - 1;
    let s = Math.imul(k, 0x9e3779b1) >>> this.shift;
    for (;;) {
      const x = keys[s]!;
      if (x === k || x === EMPTY) return s;
      s = (s + 1) & mask;
    }
  }

  private grow(): void {
    const { keys, blk, pos } = this;
    const cap = keys.length * 2;
    this.keys = new Uint32Array(cap);
    this.blk = new Int32Array(cap);
    this.pos = new Int32Array(cap);
    this.shift--;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i]!;
      if (k === EMPTY) continue;
      const s = this.slot(k);
      this.keys[s] = k;
      this.blk[s] = blk[i]!;
      this.pos[s] = pos[i]!;
    }
  }

  private numberOf(key: string): number {
    let no = this.blockNo.get(key);
    if (no === undefined) {
      no = this.blockKeys.length;
      this.blockKeys.push(key);
      this.blockNo.set(key, no);
    }
    return no;
  }
}
