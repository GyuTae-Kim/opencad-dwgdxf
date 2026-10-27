/**
 * 점 프롬프트의 객체 스냅 재지정(다음 한 점만), AutoCAD 2026 한국어판 프롬프트:
 *  - 스냅: END·MID·CEN·GCE·NOD·QUA·INT·EXT·INS·PER·TAN·NEA·APP·PAR(이름 앞 세 글자, 쉼표로 여럿), NON(스냅 없이)
 *  - FROM: "기준점:" → "<간격띄우기>:" (기준점에서 @x,y·@d<a·직접 거리)
 *  - M2P·MTP: "중간점의 첫 번째 점:" → "중간점의 두 번째 점:" (두 점의 가운데)
 *  - TT: "임시 OTRACK 점 지정:" (객체 스냅 추적이 꺼져 있어도 그 점에서 추적)
 *  - 점 필터 .X·.Y·.Z·.XY·.XZ·.YZ: "대상:" → "(YZ 필요):" 등(남은 좌표 하나면 숫자만도 받는다). 좌표는 현재 UCS
 * 스냅·TT는 앱이 다음 점 해석에 쓰고, FROM·M2P·점 필터는 runPointOverride가 점을 더 물어 한 점을 만든다.
 */
import type { PointResult } from './app';
import { type Ucs, toUcs, toWcs } from './ucs';
import type { Pt, SnapKind } from './view';

export type Axis = 'x' | 'y' | 'z';

export type Override =
  | { kind: 'snap'; modes: SnapKind[] }
  | { kind: 'from' }
  | { kind: 'm2p' }
  | { kind: 'tt' }
  | { kind: 'filter'; take: Axis[] };

/** 스냅 이름 앞 세 글자 → 종류 */
const SNAP3: Record<string, SnapKind> = {
  END: 'end',
  MID: 'mid',
  CEN: 'cen',
  GCE: 'gcen',
  NOD: 'nod',
  QUA: 'qua',
  INT: 'int',
  EXT: 'ext',
  INS: 'ins',
  PER: 'per',
  TAN: 'tan',
  NEA: 'nea',
  APP: 'app',
  PAR: 'par',
};

/** 메뉴·안내에 쓰는 재지정 목록(AutoCAD 한국어판 이름) */
export const OVERRIDE_MENU: { key: string; kind?: SnapKind; label: string }[] = [
  { key: 'TT', label: '임시 추적점' },
  { key: 'FROM', label: '시작점' },
  { key: 'M2P', label: '두 점 사이의 중간점' },
  { key: 'END', kind: 'end', label: '끝점' },
  { key: 'MID', kind: 'mid', label: '중간점' },
  { key: 'INT', kind: 'int', label: '교차점' },
  { key: 'APP', kind: 'app', label: '가상 교차점' },
  { key: 'EXT', kind: 'ext', label: '연장선' },
  { key: 'CEN', kind: 'cen', label: '중심' },
  { key: 'GCE', kind: 'gcen', label: '기하학적 중심' },
  { key: 'QUA', kind: 'qua', label: '사분점' },
  { key: 'TAN', kind: 'tan', label: '접점' },
  { key: 'PER', kind: 'per', label: '수직' },
  { key: 'PAR', kind: 'par', label: '평행' },
  { key: 'NOD', kind: 'nod', label: '노드' },
  { key: 'INS', kind: 'ins', label: '삽입' },
  { key: 'NEA', kind: 'nea', label: '근처점' },
  { key: 'NON', label: '없음' },
];

/** 입력이 재지정이면 그 내용(국제 접두어 _ 허용), 아니면 null */
export function parseOverride(text: string): Override | null {
  const t = text.trim().replace(/^_+/, '').toUpperCase();
  if (!t) return null;
  if (t === 'FROM' || t === 'FRO') return { kind: 'from' };
  if (t === 'M2P' || t === 'MTP') return { kind: 'm2p' };
  if (t === 'TT' || t === 'TK') return { kind: 'tt' };
  if (t === 'NON' || t === 'NONE') return { kind: 'snap', modes: [] };
  const f = /^\.([XYZ]{1,2})$/.exec(t);
  if (f) {
    const take = [...new Set(f[1]!.toLowerCase().split(''))] as Axis[];
    return f[1]!.length === take.length ? { kind: 'filter', take } : null;
  }
  if (!/^[A-Z]{3,}(,[A-Z]{3,})*$/.test(t)) return null;
  const modes: SnapKind[] = [];
  for (const part of t.split(',')) {
    // GCEN은 GCE, 그 밖은 앞 세 글자
    const k = SNAP3[part.slice(0, 3)];
    if (!k) return null;
    if (!modes.includes(k)) modes.push(k);
  }
  return { kind: 'snap', modes };
}

/** runPointOverride가 점을 묻는 데 쓰는 것 */
export interface OverrideIO {
  getPoint(prompt: string, opt?: { base?: (Pt & { z?: number }) | null; allowText?: boolean; rubber?: (p: Pt) => { pts: number[]; dashed?: boolean }[] }): Promise<PointResult>;
  print(text: string, cls?: 'err' | 'res'): void;
  /** 점 필터의 좌표계 */
  ucs: Ucs;
  /** 고도(Z를 주지 않은 점의 Z — 점 필터·M2P가 Z를 섞을 때). 없으면 0 */
  elevation?: number;
}

/** Z를 정했을 수도 있는 점(z가 없으면 Z를 주지 않은 점) */
type P3 = Pt & { z?: number };

/** 필터에서 남은 좌표의 프롬프트 */
function needPrompt(take: Axis[]): { prompt: string; rest: Axis[] } {
  const rest = (['x', 'y', 'z'] as Axis[]).filter((a) => !take.includes(a));
  return { prompt: `(${rest.join('').toUpperCase()} 필요):`, rest };
}

/** 점 하나 받기: Enter면 null, 점이 아닌 글이면 다시 묻는다(숫자 하나를 받을 때는 allowNumber). 입력이 Z를 정했으면 z도 */
async function pointOf(io: OverrideIO, prompt: string, opt: { base?: P3 | null; rubber?: (p: Pt) => { pts: number[]; dashed?: boolean }[] } = {}, allowNumber = false): Promise<P3 | number | null> {
  for (;;) {
    const r = await io.getPoint(prompt, { ...opt, allowText: allowNumber });
    if ('point' in r) return r.z === undefined ? r.point : { ...r.point, z: r.z };
    if ('enter' in r) return null;
    if ('text' in r && allowNumber) {
      const v = Number(r.text.trim());
      if (r.text.trim() && Number.isFinite(v)) return v;
    }
    io.print('점이 올바르지 않습니다. 예: 100,50  @20,0  @30<45', 'err');
  }
}

/**
 * FROM·M2P·점 필터: 점을 더 물어 한 점을 만든다(Enter로 그만두면 null).
 * Z: 입력이 정한 Z를 잇는다(점 필터 .XY → "(Z 필요):"의 숫자, .Z는 첫 점의 Z, M2P는 두 점 Z의 가운데 — Z가 없는 점은 고도).
 * 어느 점도 Z를 정하지 않았으면 결과에도 z가 없다(2D 명령에는 같은 평면 점)
 */
export async function runPointOverride(ov: Extract<Override, { kind: 'from' | 'm2p' | 'filter' }>, io: OverrideIO): Promise<P3 | null> {
  const elev = io.elevation ?? 0;
  if (ov.kind === 'from') {
    const b = await pointOf(io, '기준점:');
    if (b === null || typeof b === 'number') return null;
    const p = await pointOf(io, '<간격띄우기>:', { base: b });
    return p === null || typeof p === 'number' ? null : p;
  }
  if (ov.kind === 'm2p') {
    const a = await pointOf(io, '중간점의 첫 번째 점:');
    if (a === null || typeof a === 'number') return null;
    const b = await pointOf(io, '중간점의 두 번째 점:', { base: a, rubber: (p) => [{ pts: [a.x, a.y, p.x, p.y], dashed: true }] });
    if (b === null || typeof b === 'number') return null;
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    return a.z === undefined && b.z === undefined ? m : { ...m, z: ((a.z ?? elev) + (b.z ?? elev)) / 2 };
  }
  // 점 필터: 고른 좌표는 첫 점에서, 남은 좌표는 둘째 점(남은 좌표가 하나면 숫자도). UCS는 평면 안이라 Z는 그대로
  const a = await pointOf(io, '대상:');
  if (a === null || typeof a === 'number') return null;
  const { prompt, rest } = needPrompt(ov.take);
  const b = await pointOf(io, prompt, {}, rest.length === 1);
  if (b === null) return null;
  const ua: P3 = { ...toUcs(io.ucs, a), ...(a.z !== undefined ? { z: a.z } : {}) };
  const ub: P3 = typeof b === 'number' ? { x: b, y: b, z: b } : { ...toUcs(io.ucs, b), ...(b.z !== undefined ? { z: b.z } : {}) };
  const from = (axis: Axis) => (ov.take.includes(axis) ? ua : ub);
  const out = toWcs(io.ucs, { x: from('x').x, y: from('y').y });
  // Z: 그 좌표를 준 점이 Z를 정했으면 그것. 정하지 않은 점이면 고도 — 두 점 모두 Z가 없으면 Z 없는 점
  const zSrc = from('z');
  if (zSrc.z !== undefined) return { ...out, z: zSrc.z };
  return a.z === undefined && (typeof b === 'number' || b.z === undefined) ? out : { ...out, z: elev };
}
