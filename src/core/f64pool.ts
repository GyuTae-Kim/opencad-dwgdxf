/**
 * 도면을 읽는 동안 평탄 좌표(Float64Array)를 덩어리에서 떼어 준다.
 *
 * 객체마다 ArrayBuffer를 만들면 바깥 메모리가 늘 때마다 V8이 큰 GC를 앞당겨 큰 힙을 여러 번 훑는다
 * (569MB 킬 지도 읽기에서 큰 GC가 0.2~0.4초에서 3.5~3.8초로 늘었다). 덩어리를 두 배씩 키워 잡으면 할당 횟수가 로그로 준다.
 * 떼어 준 배열은 덩어리의 뷰라 구조화 복제가 덩어리 전체를 복사한다: 워커 밖으로 보내기 전에 ownEntityArrays로 제 버퍼로 바꾼다.
 * 덩어리는 withF64Pool 안(readCadFile 한 번)에서만 쓰고, 그 밖에서는 늘 새 배열을 만든다.
 */
import type { Entity } from './model';

/** 첫 덩어리와 가장 큰 덩어리(수 개수): 512KiB, 256MiB */
const FIRST = 1 << 16;
const MAX = 1 << 25;

let pool: { chunk: Float64Array; at: number } | null = null;

/** fn을 도는 동안 newF64·f64Of가 덩어리에서 떼어 준다 */
export function withF64Pool<T>(fn: () => T): T {
  const prev = pool;
  pool = { chunk: new Float64Array(0), at: 0 };
  try {
    return fn();
  } finally {
    pool = prev;
  }
}

/** 0으로 채운 길이 n의 평탄 좌표(읽는 중이면 덩어리에서 — 덩어리는 다시 쓰지 않으므로 늘 0이다) */
export function newF64(n: number): Float64Array {
  const p = pool;
  if (!p || n === 0) return new Float64Array(n);
  if (p.at + n > p.chunk.length) {
    p.chunk = new Float64Array(Math.max(n, Math.min(MAX, Math.max(FIRST, p.chunk.length * 2))));
    p.at = 0;
  }
  const v = p.chunk.subarray(p.at, p.at + n);
  p.at += n;
  return v;
}

/** 수들을 담은 평탄 좌표(읽는 중이면 덩어리에서) */
export function f64Of(a: ArrayLike<number>): Float64Array {
  const v = newF64(a.length);
  v.set(a);
  return v;
}

/** 덩어리의 뷰면 제 버퍼 사본으로 */
export function ownF64(v: Float64Array): Float64Array {
  return v.byteOffset === 0 && v.byteLength === v.buffer.byteLength ? v : v.slice();
}

/**
 * 객체의 평탄 좌표를 제 버퍼로 바꾼다(구조화 복제로 워커 밖에 보내기 전에): 객체 바로 아래의 Float64Array 속성
 * (경량 폴리선·POLYLINE 정점·볼록·폭, 스플라인 조정점·맞춤점, 지시선·메시 정점)과 해치 폴리선 경계 정점
 */
export function ownEntityArrays(e: Entity): void {
  const o = e as unknown as Record<string, unknown>;
  for (const k in o) {
    const v = o[k];
    if (v instanceof Float64Array) o[k] = ownF64(v);
  }
  if (e.type === 'HATCH' || e.type === 'MPOLYGON') for (const p of e.paths) if (p.polyline) p.polyline.verts = ownF64(p.polyline.verts);
}
