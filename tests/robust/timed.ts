/**
 * 35차 견고성 시험의 시간 단언.
 *
 * 시간은 기계마다 다르다(CI 실행 41321984041에서 같은 시험이 로컬 전체 시험 부하의 3.7배까지 걸렸다). 그래서 시험의 보장은 일·조각·할당 바이트·호출 수처럼
 * 결정적인 값으로 하고, 시간 단언은 고치기 전 코드처럼 끝나지 않는 것만 가른다.
 */
import { expect } from 'vitest';

const timed = <T>(f: () => T, limitMs: number): T => {
  const t0 = performance.now();
  const r = f();
  expect(performance.now() - t0).toBeLessThan(limitMs);
  return r;
};

/** 2초 안에 끝나야 한다. 전체 시험 부하의 로컬 값 × CI 배율 3.7에 3배 넘는 여유가 있는 자리만 쓴다(가장 빠듯한 자리가 약 8배) */
export const within2s = <T>(f: () => T): T => timed(f, 2000);

/**
 * 끝나지 않는 꼴을 가르는 상한: 고치기 전 코드는 이 꼴들이 30초 안에 끝나지 않았다.
 * 고친 뒤는 전체 시험 부하에서 로컬 1.2초 안쪽이고 CI 배율로 4.4초라 20초에 4.5배 여유가 있다. 시간이 아니라 함께 보는 일·호출 수가 보장이다
 */
export const beforeHang = <T>(f: () => T): T => timed(f, 20000);

/** 기본 한도의 블록 폭탄: 전체 시험 부하에서 로컬 5.7초, CI 배율로 21초라 90초에 4배 여유가 있다. 보장은 함께 보는 일·조각·할당이다 */
export const beforeHangAtDefaultLimit = <T>(f: () => T): T => timed(f, 90000);
