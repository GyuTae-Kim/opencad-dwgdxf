/** R12·R13·R14 VIEWPORT의 보기 정보: ACAD 확장 자료 "MVIEW"(R12 DXF·R12 DWG·R13·R14 DWG가 같은 순서) */
import type { Vec3, ViewportEntity, XData, XDataItem, XDataValue } from '../core/model';

/**
 * R2000+ DWG·DXF로 쓸 VIEWPORT의 ACAD 확장 자료에서 "MVIEW" 묶음(1000 "MVIEW", 1002 "{" … 1002 "}")을 뺀다(141차).
 * R2000+ VIEWPORT는 보기 정보를 제 칸에 쓰고(읽을 때 applyMviewXData가 모델로 옮겼다), AutoCAD는 같은 도면을 R2000+ DWG·DXF로 쓸 때
 * 이 묶음을 남기지 않는다(같은 도면을 여러 판으로 쓴 두 무리의 R12·R13·R14 뷰포트 ↔ 같은 핸들: R2000+ DWG 65쌍·DXF 78쌍에 모두 없고
 * R12 DXF에는 남는다). 묶음만 있던 ACAD 자료는 통째로 뺀다. 중괄호가 맞지 않는 묶음은 그대로 둔다.
 * @returns 바뀌지 않으면 받은 배열 그대로
 */
export function withoutMviewXData(xdata: XData[] | undefined): XData[] | undefined {
  const ai = xdata ? xdata.findIndex((d) => d.app.toUpperCase() === 'ACAD') : -1;
  if (ai < 0) return xdata;
  const items = xdata![ai]!.items;
  const i = items.findIndex((t) => t.code === 1000 && t.value === 'MVIEW');
  if (i < 0 || items[i + 1]?.code !== 1002 || items[i + 1]!.value !== '{') return xdata;
  let depth = 0;
  for (let j = i + 1; j < items.length; j++) {
    const t = items[j]!;
    if (t.code !== 1002) continue;
    if (t.value === '{') depth++;
    else if (t.value === '}' && --depth === 0) {
      const out = [...items.slice(0, i), ...items.slice(j + 1)];
      const list = [...xdata!];
      if (out.length) list[ai] = { app: xdata![ai]!.app, items: out };
      else list.splice(ai, 1);
      return list.length ? list : undefined;
    }
  }
  return xdata;
}

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

/**
 * R2000+ DWG·DXF로 쓸 VIEWPORT 90 플래그(143차). MVIEW 묶음에서 읽은 R12~R14 뷰포트(applyMviewXData)는 0x8000(DXF 참조서 "늘 켬")이 없고
 * 빠른 확대(128)가 켜져 있을 수 있다. AutoCAD는 같은 도면을 R2000+ DWG·DXF로 쓸 때 128을 빼고 0x8000을 더한다 — 같은 도면을 여러 판으로 쓴
 * 공개 표본 두 무리의 옛 판 뷰포트 ↔ 같은 핸들 R2000+ 판이 모두 그렇고, 한 무리는 R14 원본에 없는 격자 비트(0x40000 한계 밖 격자·
 * 0x80000 적응 격자)를 더 켜는데 원본에서 올 수 없는 값(AutoCAD 설정)이라 더하지 않는다. 그래서 MVIEW 묶음이 있고(옛 판에서 읽음) 0x8000이 없는
 * 뷰포트만 바꾸고, 그 밖(R2000+에서 읽은 것 — 90이 없어 0인 것 포함, 이 앱이 만든 것)은 그대로 쓴다. 모델 값은 바꾸지 않는다(R12 DXF 쓰기의 MVIEW는 142차대로)
 */
export function viewportFlagsR2000(e: ViewportEntity): number {
  const f = e.flags;
  return f & 0x8000 || withoutMviewXData(e.xdata) === e.xdata ? f : (f & ~128) | 0x8000;
}

/** 등각 쌍 칸(0 왼쪽·1 위·2 오른쪽): 90 플래그 4096만이면 위, 8192만이면 오른쪽, 그 밖은 왼쪽(DXF 참조서 VIEWPORT 90 — 둘 다면 왼쪽) */
const isoPair = (f: number): number => ((f & 0x3000) === 0x1000 ? 1 : (f & 0x3000) === 0x2000 ? 2 : 0);

/**
 * R12 DXF로 쓸 MVIEW 묶음을 모델에서 만든다(142차). 플래그 칸(보기 모드·UCS 아이콘·스냅·격자·스냅 방식·등각 쌍·숨은선 출력)은 읽을 때(applyMviewXData)의
 * 거꾸로 90 플래그에서 쓰고, 빠른 확대는 늘 1이다 — AutoCAD가 같은 도면을 R12 DXF로 쓴 두 무리에서 뷰포트 38개(R2000+ 원본 36·R13 원본 2)가
 * 모델 128 비트와 무관하게 모두 1이고, UCS 아이콘(32|64 → 3)·격자(512 → 1)는 모델 플래그를 따른다. 전에는 보기 모드·빠른 확대·UCS 아이콘·스냅·격자·
 * 스냅 방식·등각 쌍·숨은선 출력을 0·1·1·0·0·0·0·0으로 고정해 썼다. 동결 도면층(1003)은 이름이다
 */
export function mviewItems(e: ViewportEntity): XDataItem[] {
  const it: XDataItem[] = [];
  const f = e.flags;
  const n = (code: number, value: number) => it.push({ code, value });
  const bit = (m: number) => (f & m ? 1 : 0);
  it.push({ code: 1000, value: 'MVIEW' }, { code: 1002, value: '{' });
  n(1070, 16);
  it.push({ code: 1010, value: e.viewTarget }, { code: 1010, value: e.viewDirection });
  n(1040, e.twistAngle);
  n(1040, e.viewHeight);
  n(1040, e.viewCenter.x);
  n(1040, e.viewCenter.y);
  n(1040, e.lensLength || 50);
  n(1040, e.frontClip);
  n(1040, e.backClip);
  n(1070, f & 0x1f);
  n(1070, e.circleSides || 1000);
  n(1070, 1);
  n(1070, bit(32) | (bit(64) << 1));
  n(1070, bit(256));
  n(1070, bit(512));
  n(1070, bit(1024));
  n(1070, isoPair(f));
  n(1040, e.snapAngle);
  n(1040, e.snapBase.x);
  n(1040, e.snapBase.y);
  n(1040, e.snapSpacing.x || 0.5);
  n(1040, e.snapSpacing.y || 0.5);
  n(1040, e.gridSpacing.x || 0.5);
  n(1040, e.gridSpacing.y || 0.5);
  n(1070, bit(2048));
  it.push({ code: 1002, value: '{' });
  for (const l of e.frozenLayers) it.push({ code: 1003, value: l });
  it.push({ code: 1002, value: '}' }, { code: 1002, value: '}' });
  return it;
}

/** 값 26개의 그룹 코드: 버전, 대상점, 방향, 비틀기·높이·중심 x·y·렌즈·앞·뒤 자르기, 보기 모드~등각 쌍 8칸, 스냅 각도~격자 간격 y 7칸, 숨은선 출력 */
const CODES = [1070, 1010, 1010, 1040, 1040, 1040, 1040, 1040, 1040, 1040, 1070, 1070, 1070, 1070, 1070, 1070, 1070, 1070, 1040, 1040, 1040, 1040, 1040, 1040, 1040, 1070];

const isVec = (v: XDataValue | undefined): v is Vec3 => typeof v === 'object' && !(v instanceof Uint8Array) && typeof v.x === 'number' && typeof v.y === 'number';

/** items[i0]의 MVIEW 묶음이 mviewItems 꼴(값 26개 + 동결 도면층 중괄호)이면 마지막 "}" 자리, 아니면 -1 */
function mviewEnd(items: XDataItem[], i0: number): number {
  const brace = (j: number, v: string) => items[j]?.code === 1002 && items[j]!.value === v;
  if (!brace(i0 + 1, '{')) return -1;
  for (let k = 0; k < CODES.length; k++) {
    const t = items[i0 + 2 + k];
    if (!t || t.code !== CODES[k] || (t.code === 1010 ? !isVec(t.value) : typeof t.value !== 'number')) return -1;
  }
  let j = i0 + 2 + CODES.length;
  if (!brace(j, '{')) return -1;
  for (j++; items[j]?.code === 1003; j++) if (typeof items[j]!.value !== 'string') return -1;
  return brace(j, '}') && brace(j + 1, '}') ? j + 1 : -1;
}

/** 읽은 묶음의 값 칸 k(0 = 버전)가 모델과 뜻이 같은지. r = 그 묶음을 읽은(applyMviewXData) 모델 */
function sameField(k: number, r: ViewportEntity, e: ViewportEntity): boolean {
  const bits = (m: number) => ((r.flags ^ e.flags) & m) === 0;
  const v3 = (a: Vec3, b: Vec3) => a.x === b.x && a.y === b.y && (a.z ?? 0) === (b.z ?? 0);
  switch (k) {
    case 0:
      return true;
    case 1:
      return v3(r.viewTarget, e.viewTarget);
    case 2:
      return v3(r.viewDirection, e.viewDirection);
    case 3:
      return r.twistAngle === e.twistAngle;
    case 4:
      return r.viewHeight === e.viewHeight;
    case 5:
      return r.viewCenter.x === e.viewCenter.x;
    case 6:
      return r.viewCenter.y === e.viewCenter.y;
    case 7:
      return r.lensLength === e.lensLength;
    case 8:
      return r.frontClip === e.frontClip;
    case 9:
      return r.backClip === e.backClip;
    case 10:
      return bits(0x1f);
    case 11:
      return r.circleSides === e.circleSides;
    case 12:
      return bits(128);
    case 13:
      return bits(96);
    case 14:
      return bits(256);
    case 15:
      return bits(512);
    case 16:
      return bits(1024);
    case 17:
      return isoPair(r.flags) === isoPair(e.flags);
    case 18:
      return r.snapAngle === e.snapAngle;
    case 19:
      return r.snapBase.x === e.snapBase.x;
    case 20:
      return r.snapBase.y === e.snapBase.y;
    case 21:
      return r.snapSpacing.x === e.snapSpacing.x;
    case 22:
      return r.snapSpacing.y === e.snapSpacing.y;
    case 23:
      return r.gridSpacing.x === e.gridSpacing.x;
    case 24:
      return r.gridSpacing.y === e.gridSpacing.y;
    default:
      return bits(2048);
  }
}

/**
 * R12 DXF로 쓸 VIEWPORT의 확장 자료(142차). 첫 ACAD 자료에 읽은 MVIEW 묶음이 있으면 그 묶음을 다시 읽은 값이 모델과 다른 칸만 모델 값(mviewItems)으로 고친다 —
 * 바꾸지 않은 뷰포트는 묶음이 그대로라 출력 바이트가 같고(모델로 다시 만들면 달라지는 값이 있다 — R13 원본의 빠른 확대 0, 렌즈 0 등),
 * 앱에서 보기·플래그·동결 도면층을 바꾼 뷰포트는 바꾼 값이 남는다(전에는 읽은 묶음을 그대로 써서 R12 출력에서 바꾼 보기를 잃었다).
 * 꼴이 다른 묶음(값 수·그룹 코드가 다른 것)은 그대로 두고, 묶음이 없으면 모델로 만들어 ACAD 자료로 더한다.
 * @param layerName 묶음의 1003을 읽을 때처럼 도면층 이름으로 푼다(R13·R14 DWG는 핸들) — 못 찾으면 undefined
 * @returns 바뀌지 않으면 받은 배열 그대로
 */
export function r12ViewportXData(xdata: XData[] | undefined, e: ViewportEntity, layerName: (v: string) => string | undefined): XData[] | undefined {
  const ai = xdata ? xdata.findIndex((d) => d.app.toUpperCase() === 'ACAD') : -1;
  const items = ai >= 0 ? xdata![ai]!.items : [];
  const i0 = items.findIndex((t) => t.code === 1000 && t.value === 'MVIEW');
  if (i0 >= 0) {
    const end = mviewEnd(items, i0);
    if (end < 0) return xdata;
    const group = items.slice(i0, end + 1);
    const r = { type: 'VIEWPORT', xdata: [{ app: 'ACAD', items: group }], frozenLayers: [] } as unknown as ViewportEntity;
    applyMviewXData(r, layerName);
    const built = mviewItems(e);
    let out: XDataItem[] | undefined;
    for (let k = 0; k < CODES.length; k++) if (!sameField(k, r, e)) (out ??= group.slice())[k + 2] = built[k + 2]!;
    const fl = e.frozenLayers;
    if (r.frozenLayers.length !== fl.length || r.frozenLayers.some((l, k) => l !== fl[k])) out = [...(out ?? group).slice(0, CODES.length + 2), ...built.slice(CODES.length + 2)];
    if (!out) return xdata;
    const list = [...xdata!];
    list[ai] = { app: xdata![ai]!.app, items: [...items.slice(0, i0), ...out, ...items.slice(end + 1)] };
    return list;
  }
  if ((xdata ?? []).some((x) => x.app.toUpperCase() === 'ACAD' && x.items.some((t) => t.value === 'MVIEW'))) return xdata;
  return [...(xdata ?? []), { app: 'ACAD', items: mviewItems(e) }];
}
