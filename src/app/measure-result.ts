/**
 * 측정 명령(DIST·MEASUREGEOM·MEASUREANGLE·AREA)이 명령행 결과 줄과 함께 넘기는 값.
 * 명령행 글은 AutoCAD 문장 그대로 두고, 휴대폰 보기 모드의 결과 카드는 이 값으로 큰 값 한 줄과 작은 보조 줄을 그린다
 * (번역된 문장을 다시 읽지 않는다). 값 글은 도면 단위 형식(LUNITS·AUNITS·정밀도) 그대로 만든다.
 */
export interface MeasureResult {
  kind: 'distance' | 'radius' | 'angle' | 'area' | 'point';
  /** 값의 이름(작은 글씨, 번역된다): 거리·반지름·각도·면적·둘레 */
  label: string;
  /** 큰 글씨 값(단위 포함, 번역하지 않는다) */
  value: string;
  /** 보조 줄: 이름(번역된다)과 값 */
  details: { k: string; v: string }[];
}

/** 도면 단위로 값을 글로 */
export interface MeasureFormat {
  length(v: number): string;
  angle(a: number): string;
  area(v: number): string;
  /** 길이 단위(" mm"처럼 앞에 빈칸, 단위 없는 도면은 빈 글) */
  unit: string;
}

/**
 * DIST의 두 점 사이(지금 UCS의 증분 dx·dy·dz — 도움말 DIST: 모형 공간은 3D 거리, X·Y·Z 증분과 각도는 현재 UCS 기준).
 * d: 3D 거리. rise: XY 평면으로부터의 각도 — 두 점을 잇는 선이 XY 평면에서 기운 각도를 XY 평면 각도와 같은 0 ≤ θ < 2π 꼴로
 * (위로 기울면 0~90°, 아래로 기울면 270~360°, Z축과 나란하면 90°·270°, 같은 높이면 0)
 */
export function distance3d(dx: number, dy: number, dz: number): { d: number; rise: number } {
  const flat = Math.hypot(dx, dy);
  let rise = dz === 0 ? 0 : Math.atan2(dz, flat);
  if (Math.abs(rise) < 1e-15) rise = 0;
  else if (rise < 0) rise += Math.PI * 2;
  return { d: Math.hypot(flat, dz), rise };
}

/** 두 점 사이: 큰 값은 거리, 보조 줄은 XY 평면 각도·ΔX·ΔY(ΔZ는 0이 아닐 때만). angle을 주면 그 각도(도면 단위의 0 방향·방향으로 잰 값) */
export function distanceResult(f: MeasureFormat, dx: number, dy: number, dz = 0, angle?: number): MeasureResult {
  let ang = angle ?? Math.atan2(dy, dx);
  if (ang < 0) ang += Math.PI * 2;
  const details = [
    { k: '각도', v: f.angle(ang) },
    { k: 'ΔX', v: f.length(dx) },
    { k: 'ΔY', v: f.length(dy) },
  ];
  if (dz !== 0) details.push({ k: 'ΔZ', v: f.length(dz) });
  return { kind: 'distance', label: '거리', value: f.length(Math.hypot(dx, dy, dz)) + f.unit, details };
}

/** 호·원: 큰 값은 반지름, 보조 줄은 지름 */
export function radiusResult(f: MeasureFormat, r: number): MeasureResult {
  return { kind: 'radius', label: '반지름', value: f.length(r) + f.unit, details: [{ k: '지름', v: f.length(r * 2) + f.unit }] };
}

/** 각도(라디안). 두 선 사이면 보각도 보조 줄에 */
export function angleResult(f: MeasureFormat, a: number, supplement = false): MeasureResult {
  return { kind: 'angle', label: '각도', value: f.angle(a), details: supplement ? [{ k: '보각', v: f.angle(Math.PI - a) }] : [] };
}

/** 면적과 둘레(모르는 쪽은 null). 면적을 모르면 둘레가 큰 값 */
export function areaResult(f: MeasureFormat, area: number | null, perimeter: number | null): MeasureResult {
  const per = perimeter !== null ? f.length(perimeter) + f.unit : null;
  if (area === null) return { kind: 'area', label: '둘레', value: per ?? '-', details: [] };
  return { kind: 'area', label: '면적', value: f.area(area) + (f.unit ? `${f.unit}²` : ''), details: per !== null ? [{ k: '둘레', v: per }] : [] };
}

/** 점 좌표(ID): 큰 값은 "X, Y", 보조 줄은 Z(0이 아닐 때) */
export function pointResult(f: MeasureFormat, x: number, y: number, z = 0): MeasureResult {
  return { kind: 'point', label: '좌표', value: `${f.length(x)}, ${f.length(y)}`, details: z ? [{ k: 'Z', v: f.length(z) }] : [] };
}
