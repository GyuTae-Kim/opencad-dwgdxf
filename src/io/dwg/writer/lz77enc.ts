/**
 * R2004 계열 압축(사양 4.7의 명령 형식, decompressR18의 짝).
 * 3바이트 해시로 직전 위치를 찾는 단순한 탐욕 방식이다.
 *
 * 쓰기는 객체 자료를 0x7400바이트 쪽마다 따로 압축하므로 큰 도면에서는 수만 번 불린다(125차).
 * 예전에는 부를 때마다 해시 표(128KiB)·자라는 출력 버퍼·(길이, 거리) 객체 목록을 새로 만들어, 쪽 1만 개가 넘는 도면에서
 * 바깥 메모리(ArrayBuffer)가 수 GB 오갔고 V8이 그만큼 큰 GC를 앞당겨 객체 본문 수백만 개를 든 힙을 여러 번 훑었다
 * (객체 92만 개 도면의 R2018 DWG 저장에서 GC가 시간의 절반). 이제 해시 표와 출력 버퍼는 모듈에 하나 두고 다시 쓰고,
 * 일치를 찾는 대로 내보낸다(일치 명령은 다음 글자 수를 담으므로 다음 일치를 찾거나 끝에 닿을 때 앞 일치를 쓴다). 내는 바이트는 예전과 같다.
 */

const MAX_NEAR = 0x3fff; // 2바이트 거리
// 먼 거리 명령(0x10~0x1F)은 쓰지 않는다: 사양이 거리 기준(+1 여부)을 분명히 하지 않고
// AutoCAD 파일에서도 보지 못해 다른 리더와 어긋날 수 있다.
const MAX_FAR = MAX_NEAR;
const HASH = 1 << 15;

/** 3바이트 해시 → 마지막 위치(부를 때마다 -1로 비운다) */
const head = new Int32Array(HASH);
/** 출력 버퍼(모자라면 두 배로 키운다 — 돌려줄 때는 쓴 만큼 복사한다) */
let out = new Uint8Array(1 << 16);
/** 출력 버퍼에 쓴 바이트 수 */
let on = 0;
/** 이보다 커진 출력 버퍼는 다 쓴 뒤 놓아 준다(쪽 압축은 0x7400바이트 남짓이다) */
const KEEP = 1 << 20;

function room(k: number): void {
  if (on + k <= out.length) return;
  let s = out.length * 2;
  while (s < on + k) s *= 2;
  const b = new Uint8Array(s);
  b.set(out.subarray(0, on));
  out = b;
}

/** 글자 길이(4 이상): 0x01~0x0F 또는 0x00 + 확장 */
function literalLength(n: number): void {
  room(3 + ((n / 0xff) | 0));
  if (n <= 18) {
    out[on++] = (n - 3) & 0xff;
    return;
  }
  out[on++] = 0;
  let rem = n - 3 - 0x0f;
  while (rem > 0xff) {
    out[on++] = 0;
    rem -= 0xff;
  }
  out[on++] = rem & 0xff;
}

/** 긴 압축 길이(1 이상) */
function longValue(v: number): void {
  room(3 + ((v / 0xff) | 0));
  if (v <= 0xff) {
    out[on++] = v & 0xff;
    return;
  }
  out[on++] = 0;
  let rem = v - 0xff;
  while (rem > 0xff) {
    out[on++] = 0;
    rem -= 0xff;
  }
  out[on++] = rem & 0xff;
}

/** 되돌아 복사 명령. 다음 글자 수(lit)가 1~3이면 명령에 넣고 true */
function match(len: number, dist: number, lit: number): boolean {
  const d = dist - 1;
  const small = lit >= 1 && lit <= 3 ? lit : 0;
  room(3);
  if (d <= 0x3ff && len <= 14) {
    out[on++] = (((len + 1) << 4) | ((d & 3) << 2) | small) & 0xff;
    out[on++] = (d >> 2) & 0xff;
  } else if (d <= MAX_NEAR) {
    if (len <= 33) out[on++] = (0x1e + len) & 0xff;
    else {
      out[on++] = 0x20;
      longValue(len - 0x21);
    }
    room(2);
    out[on++] = (((d & 0x3f) << 2) | small) & 0xff;
    out[on++] = (d >> 6) & 0xff;
  } else {
    const dd = d - 0x3fff;
    if (len <= 17) out[on++] = (0x10 + len - 2) & 0xff;
    else {
      out[on++] = 0x10;
      longValue(len - 9);
    }
    room(2);
    out[on++] = (((dd & 0x3f) << 2) | small) & 0xff;
    out[on++] = (dd >> 6) & 0xff;
  }
  return small !== 0;
}

/** 원본 글자 src[from..to)를 그대로 */
function literals(src: Uint8Array, from: number, to: number): void {
  const k = to - from;
  if (k <= 0) return;
  room(k);
  if (k > 16) out.set(src.subarray(from, to), on);
  else for (let j = 0; j < k; j++) out[on + j] = src[from + j];
  on += k;
}

export function compressR18(input: Uint8Array): Uint8Array {
  // 첫 글자 묶음은 0이거나 4바이트 이상이어야 하므로 아주 짧은 입력은 0으로 채운다(풀 때 크기로 자른다)
  let src = input;
  if (src.length > 0 && src.length < 4) {
    src = new Uint8Array(4);
    src.set(input);
  }
  const n = src.length;
  head.fill(-1);
  on = 0;
  // 출력: 첫 글자, (명령 + 글자)…, 끝 0x11.
  // 앞 일치(pLen·pDist)는 다음 글자 수를 알 때(다음 일치를 찾거나 끝에서) 쓴다
  let started = false;
  let pLen = 0;
  let pDist = 0;
  let litStart = 0;
  let i = 0;
  while (i + 3 <= n) {
    const h = Math.imul((src[i] << 16) ^ (src[i + 1] << 8) ^ src[i + 2], 0x9e3779b1) >>> 17;
    const cand = head[h];
    head[h] = i;
    let len = 0;
    let dist = 0;
    if (cand >= 0 && i - cand <= MAX_FAR) {
      let l = 0;
      const max = Math.min(n - i, 0xffff);
      while (l < max && src[cand + l] === src[i + l]) l++;
      dist = i - cand;
      len = l;
      // 먼 거리에서는 3바이트 일치를 쓸 수 없다
      if (dist - 1 > MAX_NEAR && len < 4) len = 0;
    }
    // 첫 글자 묶음은 0이거나 4바이트 이상이어야 한다
    if (len >= 3 && (started || !(i - litStart > 0 && i - litStart < 4))) {
      const lit = i - litStart;
      if (started ? !match(pLen, pDist, lit) && lit > 0 : lit > 0) literalLength(lit);
      literals(src, litStart, i);
      started = true;
      pLen = len;
      pDist = dist;
      for (let k = 1; k < len && i + k + 3 <= n; k++) {
        const j = i + k;
        head[Math.imul((src[j] << 16) ^ (src[j + 1] << 8) ^ src[j + 2], 0x9e3779b1) >>> 17] = j;
      }
      i += len;
      litStart = i;
    } else i++;
  }
  const tail = n - litStart;
  if (started ? !match(pLen, pDist, tail) && tail > 0 : tail > 0) literalLength(tail);
  literals(src, litStart, n);
  room(3);
  out[on++] = 0x11;
  out[on++] = 0;
  out[on++] = 0;
  const res = out.slice(0, on);
  if (out.length > KEEP) out = new Uint8Array(1 << 16);
  return res;
}
