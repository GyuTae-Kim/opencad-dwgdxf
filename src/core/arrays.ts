/**
 * 큰 배열 다루기. `to.push(...items)`와 `Math.min(...items)`는 요소를 함수 인자로 스택에 올리므로 요소가 많으면 RangeError로 죽는다.
 * 잰 한도(Chromium 152)는 메인 스레드 약 12만 개, 작업자 약 6.3만 개다. 객체·정점·선택 수를 따라가는 배열에는 이 함수들을 쓴다.
 * String.fromCharCode(...codes)·arr.splice(i, 0, ...items)·arr.unshift(...items)도 같다(110차 — 파일 글자·붙여 넣은 글자·변경 목록).
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

/** items를 to 앞에 붙인다(to.unshift(...items)와 같다 — 110차) */
export function unshiftAll<T>(to: T[], items: readonly T[]): void {
  if (!items.length) return;
  const tail = to.splice(0);
  pushAll(to, items === to ? tail : items);
  pushAll(to, tail);
}

/** to의 at 자리에 items를 넣는다(to.splice(at, 0, ...items)와 같다 — 110차) */
export function insertAll<T>(to: T[], at: number, items: readonly T[]): void {
  if (!items.length) return;
  const src = items === to ? to.slice() : items;
  const tail = to.splice(at);
  pushAll(to, src);
  pushAll(to, tail);
}

/** 한 번에 펼쳐 넘기는 글자 수(인자 한도보다 넉넉히 작게) */
const CHUNK = 8192;

/** String.fromCharCode(...codes.slice(0, end))와 같다(110차 — 조각으로 나눠 글자 수 한도가 없다) */
export function charsOf(codes: readonly number[], end = codes.length): string {
  if (end <= CHUNK) return String.fromCharCode(...codes.slice(0, end));
  let s = '';
  for (let i = 0; i < end; i += CHUNK) s += String.fromCharCode(...codes.slice(i, Math.min(end, i + CHUNK)));
  return s;
}

/** String.fromCodePoint(...points)와 같다(110차 — 조각으로 나눠 글자 수 한도가 없다. 잘못된 부호는 같은 RangeError) */
export function codePointsOf(points: readonly number[]): string {
  if (points.length <= CHUNK) return String.fromCodePoint(...points);
  let s = '';
  for (let i = 0; i < points.length; i += CHUNK) s += String.fromCodePoint(...points.slice(i, i + CHUNK));
  return s;
}
