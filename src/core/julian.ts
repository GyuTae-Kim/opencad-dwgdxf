/**
 * 지금 때를 도면 머리말 율리우스일로 — 새 도면·템플릿 새 도면·DWG/DXF 작성기(346차)와 시스템 변수 DATE(app/lisp-host.ts — 347차)가 함께 쓰는 한 곳.
 * $TDCREATE·$TDUPDATE는 쓰는 곳의 현지 벽시계, $TDUCREATE·$TDUUPDATE는 UTC 시각이다(AutoCAD 시스템 변수 정의).
 * 고치기 전 작성기 넷은 모두 UTC 율리우스일을 써 이 앱에서 만든 도면의 만든 때가 UTC 벽시계(한국 시간이면 9시간 앞)로 보였다.
 * 보이는 길은 src/app/datetext.ts drawingTimeText(현지 시각 변수는 칸 그대로). 브라우저 작업자에서도 도는 DWG 작성기가 부르므로 기댈 모듈이 없다.
 */

/** 지금(Date.now — 고치기 전 작성기들이 읽던 시계라 시험의 Date.now 고정이 그대로 듣는다) */
const now = () => new Date(Date.now());

/** 그 순간의 UTC 율리우스일(1970-01-01 00:00 UTC = 2440587.5) — $TDUCREATE·$TDUUPDATE */
export function julianUtc(at: Date = now()): number {
  return at.getTime() / 86400000 + 2440587.5;
}

/** 그 순간의 현지 벽시계 율리우스일(UTC 율리우스일 + 그 순간의 시간대 차 — 여름 시간 포함) — $TDCREATE·$TDUPDATE */
export function julianLocal(at: Date = now()): number {
  return julianUtc(at) - at.getTimezoneOffset() / 1440;
}
