/**
 * 화면에 보이는 날짜·시각 글을 만드는 한 곳(345차): 화면 언어 꼴로 Intl에 맡긴다.
 * 화면 언어는 html lang(i18n.ts가 언어를 바꿀 때 맞춘다 — 최근 문서 목록 recent.ts가 쓰던 길을 여기로 꺼냈다).
 * 고치기 전 넷(도면 비교 정보 「마지막 수정」·DWGPROPS 통계 「작성」「수정」·TIME)은 ko-KR 고정이라 다섯 언어 화면 모두
 * 「2026. 11. 28. 오후 3:00:00」 꼴이었다(다른 언어 화면에 한국어 — WCAG 3.1.2). 브라우저 지역(인자 없는 지역 꼴)도 쓰지 않는다:
 * 344차 판단대로 화면 글은 브라우저 설정이 아니라 화면 언어를 따른다.
 * 도면에 쓰는 값(TDCREATE 등)·파일 이름·내보내기·LISP 값과 숫자 꼴 시각(인쇄 머리·자동 저장 「YYYY-MM-DD hh:mm」 — 언어와 상관없음)은 이 길을 쓰지 않는다.
 */

/** 지금 화면 언어의 Intl 지역(ko·en·ja·zh-CN·de — 비었으면 한국어) */
export function screenLocale(): string {
  return (typeof document !== 'undefined' && document.documentElement.lang) || 'ko';
}

/**
 * 날짜·시각 글. opts에 날짜·시각 칸이 없으면 연·월·일·시·분·초(Date 지역 글의 기본 칸 — 고치기 전 넷과 같은 칸),
 * 지역 이름이 틀리면(RangeError) 한국어 꼴로
 */
export function dateTimeText(d: Date, opts?: Intl.DateTimeFormatOptions, locale = screenLocale()): string {
  try {
    return d.toLocaleString(locale, opts);
  } catch {
    return d.toLocaleString('ko', opts);
  }
}

/** UTC 시각을 적는 머리말 변수(AutoCAD 시스템 변수 정의 — 나머지 TDCREATE·TDUPDATE는 저장한 곳의 현지 시각) */
const UTC_TIMES = new Set(['$TDUCREATE', '$TDUUPDATE']);

/**
 * 도면 머리말의 때(율리우스일) → 화면 언어 꼴 날짜·시각 글(346차 — 도면 비교 정보·DWGPROPS 통계·TIME이 이 길 하나).
 * $TDCREATE·$TDUPDATE는 저장한 곳의 벽시계 값이라 시간대를 더하지 않는다: UTC로 읽어 칸을 그대로 보인다(고치기 전 DWGPROPS·TIME은
 * 보는 사람의 시간대를 또 더해 한국 시간이면 9시간 뒤로 보였고, 도면 비교만 그대로였다). $TDUCREATE·$TDUUPDATE는 UTC 시각이라
 * 보는 사람의 현지 시각으로 바꾼다 — 같은 도면의 두 값이 같은 때로 보인다.
 * 값이 없거나 날짜가 아니면(2000000 — 8세기 — 밑, 날짜 범위 밖) 빈 글. 도면에 쓰는 값은 이 길을 거치지 않는다(머리말 값 그대로).
 */
export function drawingTimeText(header: { get(name: string): unknown }, name: string): string {
  const jd = header.get(name);
  if (typeof jd !== 'number' || !(jd > 2000000)) return '';
  // ms로 반올림: 율리우스일(날 수 double)의 끝자리 오차로 10:00:00이 9:59:59.999 → 「9:59:59」로 보이지 않게(FIELD julianToLocal과 같음)
  const d = new Date(Math.round((jd - 2440587.5) * 86400000));
  if (!Number.isFinite(d.getTime())) return '';
  return dateTimeText(d, UTC_TIMES.has(name) ? undefined : { timeZone: 'UTC' });
}
