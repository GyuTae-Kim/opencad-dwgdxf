/**
 * 큰 배열 다루기. `to.push(...items)`와 `Math.min(...items)`는 요소를 함수 인자로 스택에 올리므로 요소가 많으면 RangeError로 죽는다.
 * 잰 한도(Chromium 152)는 메인 스레드 약 12만 개, 작업자 약 6.3만 개다. 객체·정점·선택 수를 따라가는 배열에는 이 함수들을 쓴다.
 */

/** items를 to 뒤에 붙인다 */
export function pushAll<T>(to: T[], items: readonly T[]): void {
  const n = items.length;
  for (let i = 0; i < n; i++) to.push(items[i]!);
}

/** Math.min(...items)와 같다(비면 Infinity, NaN이 있으면 NaN) */
export function minOf(items: readonly number[]): number {
  let m = Infinity;
  for (let i = 0; i < items.length; i++) m = Math.min(m, items[i]!);
  return m;
}

/** Math.max(...items)와 같다(비면 -Infinity, NaN이 있으면 NaN) */
export function maxOf(items: readonly number[]): number {
  let m = -Infinity;
  for (let i = 0; i < items.length; i++) m = Math.max(m, items[i]!);
  return m;
}
