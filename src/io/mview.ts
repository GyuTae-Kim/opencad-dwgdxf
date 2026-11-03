/** R12·R13·R14 VIEWPORT의 보기 정보: ACAD 확장 자료 "MVIEW"(R12 DXF·R12 DWG·R13·R14 DWG가 같은 순서) */
import type { Vec3, ViewportEntity } from '../core/model';

/**
 * 버전, 대상점, 방향, 비틀기, 높이, 중심 x·y, 렌즈, 앞·뒤 자르기, 보기 모드, 원 확대, 빠른 확대, UCS 아이콘, 스냅, 격자,
 * 스냅 방식, 등각 쌍, 스냅 각도, 스냅 기준 x·y, 스냅 간격 x·y, 격자 간격 x·y, 숨은선 출력, { 동결 도면층… }.
 * 동결 도면층(1003)은 R13·R14 DWG가 핸들, R12가 이름으로 적으므로 이름 찾기를 받는다
 */
export function applyMviewXData(e: ViewportEntity, layerName: (v: string) => string | undefined): void {
  e.styleSheet = '';
  e.ucsOrigin = { x: 0, y: 0, z: 0 };
  e.ucsXAxis = { x: 1, y: 0, z: 0 };
  e.ucsYAxis = { x: 0, y: 1, z: 0 };
  const x = e.xdata?.find((d) => d.app.toUpperCase() === 'ACAD');
  if (!x) return;
  const it = x.items;
  const i0 = it.findIndex((t) => t.code === 1000 && t.value === 'MVIEW');
  if (i0 < 0) return;
  let i = i0 + 1;
  if (it[i]?.code === 1002) i++;
  const next = (): unknown => it[i++]?.value;
  const num = (): number => Number(next()) || 0;
  next(); // 버전
  const target = next() as Vec3 | undefined;
  const dir = next() as Vec3 | undefined;
  if (target && typeof target === 'object') e.viewTarget = target;
  if (dir && typeof dir === 'object') e.viewDirection = dir;
  e.twistAngle = num();
  e.viewHeight = num();
  e.viewCenter = { x: num(), y: num() };
  e.lensLength = num() || 50;
  e.frontClip = num();
  e.backClip = num();
  let flags = num() & 0x1f;
  e.circleSides = num() || 100;
  if (num()) flags |= 128;
  const icon = num();
  if (icon & 1) flags |= 32;
  if (icon & 2) flags |= 64;
  if (num()) flags |= 256;
  if (num()) flags |= 512;
  if (num()) flags |= 1024;
  const iso = num();
  if (iso === 1) flags |= 4096;
  else if (iso === 2) flags |= 8192;
  e.snapAngle = num();
  e.snapBase = { x: num(), y: num() };
  e.snapSpacing = { x: num(), y: num() };
  e.gridSpacing = { x: num(), y: num() };
  if (num()) flags |= 2048;
  e.flags = flags;
  // 동결 도면층(1003)
  for (; i < it.length; i++) {
    const v = it[i];
    if (v.code !== 1003 || typeof v.value !== 'string') continue;
    const n = layerName(v.value);
    if (n) e.frozenLayers.push(n);
  }
}
