/**
 * 도면 자료의 깊은 복사(97차 — 편집이 객체마다 부르는 structuredClone 대신).
 *
 * structuredClone은 값을 한 번 직렬화했다가 다시 풀어 작은 객체에도 고정비가 크다(연관 도면 MOVE 3만 개에서 해치 하나 약 6.5µs,
 * 경량 폴리선 3.2µs, 치수 5.6µs — 명령 시간의 약 5분의 1). 도면 객체는 일반 객체·배열·형식 배열·원시 값뿐이라 여기서 바로 복사한다.
 *
 * structuredClone과 같은 것: 자기 열거 속성만 같은 차례로(undefined 값 속성도), 원형은 Object.prototype, 얼린 객체도 얼리지 않은 사본,
 * NaN·-0·BigInt 그대로, 형식 배열은 같은 종류의 새 버퍼.
 * 다른 것: 형식 배열은 보는 부분만 복사한다(구조화 복제는 버퍼 전체를 복사해 읽을 때 떼어 준 덩어리 뷰 — core/f64pool.ts — 하나에 512KiB를 옮긴다).
 * 한 값 안에서 같은 객체를 두 곳에서 가리키면 사본은 따로따로다(구조화 복제는 함께 쓴다 — 값은 같다).
 * 배열에 붙은 번호 아닌 속성은 옮기지 않고, 객체의 기호 열쇠 속성은 그대로 옮긴다(둘 다 도면 자료에는 없다. 찾으려면 값마다 열쇠 목록을 만들어야 해 비싸다).
 * 그 밖의 값(Map·Set·Date·클래스 객체·DataView·Node Buffer 같은 형식 배열 하위 클래스·빈칸 있는 배열·함수·기호·`__proto__` 속성·아주 깊은 값)이
 * 하나라도 있으면 값 전체를 structuredClone으로 복사한다(예전과 같은 결과·같은 오류).
 */

/** 이 깊이를 넘으면(순환 참조일 수 있다) structuredClone으로 */
const MAX_DEPTH = 64;

/** 복사할 수 없음(값 전체를 structuredClone으로) */
const FAIL: unknown = Symbol('clone-fallback');

/** 버퍼를 새로 잡아 복사하는 형식 배열 종류(정확히 이 원형일 때만 — 하위 클래스는 slice가 뷰일 수 있다) */
const TYPED = new Set<object>([
  Float64Array.prototype,
  Float32Array.prototype,
  Int32Array.prototype,
  Uint32Array.prototype,
  Int16Array.prototype,
  Uint16Array.prototype,
  Int8Array.prototype,
  Uint8Array.prototype,
  Uint8ClampedArray.prototype,
  BigInt64Array.prototype,
  BigUint64Array.prototype,
]);

function copy(v: unknown, depth: number): unknown {
  if (typeof v !== 'object' || v === null) return typeof v === 'function' || typeof v === 'symbol' ? FAIL : v;
  if (depth > MAX_DEPTH) return FAIL;
  if (Array.isArray(v)) {
    const n = v.length;
    const out: unknown[] = [];
    for (let i = 0; i < n; i++) {
      // 빈칸(희소 배열)은 구조화 복제처럼 빈칸으로 두기 어렵다
      if (!(i in v)) return FAIL;
      const x: unknown = v[i];
      if (typeof x !== 'object' || x === null) {
        if (typeof x === 'function' || typeof x === 'symbol') return FAIL;
        out.push(x);
      } else {
        const y = copy(x, depth + 1);
        if (y === FAIL) return FAIL;
        out.push(y);
      }
    }
    return out;
  }
  const proto = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== null) {
    if (TYPED.has(proto)) return (v as Float64Array).slice();
    return FAIL;
  }
  // 얕은 사본을 펼치기로 만든다: 원본과 같은 숨은 클래스(속성이 객체 안에)를 이어받아, 속성을 하나씩 붙인 객체보다
  // 뒤의 읽기(워커 전송 부호화·그리기)가 빠르다. 그다음 객체 값만 사본으로 바꾼다(있는 속성에 쓰기라 모양이 그대로다)
  const out = { ...(v as Record<string, unknown>) };
  for (const k in out) {
    const x = out[k];
    if (typeof x !== 'object' || x === null) {
      if (typeof x === 'function' || typeof x === 'symbol') return FAIL;
    } else {
      // `__proto__` 이름의 속성에 쓰면 원형이 바뀐다
      if (k === '__proto__') return FAIL;
      const y = copy(x, depth + 1);
      if (y === FAIL) return FAIL;
      out[k] = y;
    }
  }
  return out;
}

/** 도면 자료(객체·블록 정의 등)를 깊이 복사한다. 다루지 않는 값이 있으면 structuredClone과 같다 */
export function cloneData<T>(v: T): T {
  const r = copy(v, 0);
  return (r === FAIL ? structuredClone(v) : r) as T;
}
