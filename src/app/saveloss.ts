/**
 * 저장할 때 빠지거나 바뀌는 것: 쓰기 경고(DWG·DXF 쓰기의 warn 코드)를 사용자에게 보일 목록으로 고른다.
 * 저장은 워커에서 파일을 다 만든 뒤 내려받기·파일 쓰기 전에 이 목록을 보여 확인을 받는다(save.ts).
 *
 * - 도형이 빠지거나(…_dropped) 다른 모양으로 바뀌는(…_as_…, 분해·근사) 것은 모두 보인다.
 * - 객체가 빠지는 것은 2D 도면에 보이지 않는 3D·문서화 스타일(재질·비주얼 스타일·단면/상세 뷰 스타일)을 빼고 보인다.
 *   DXF로 쓸 수 없는 객체가 섞인 연관 동작을 통째로 뺀 것(object.assoc_dropped — 객체는 남고 연관만 풀린다)도 여기에 든다.
 * - 고아 객체·빠진 객체를 가리키던 사전 항목은 위 항목의 결과라 따로 보이지 않는다.
 */
import type { ReadWarning } from '../core/model';

export interface SaveLoss {
  /** 쓰기 경고 문구(이미 번역 사전에 있다) */
  message: string;
  count: number;
  /** 빠지는 종류(객체 이름) */
  types: string[];
  /** 바뀜(남지만 모양이 다름) */
  converted: boolean;
}

/** 2D 도면에 보이지 않아 따로 묻지 않는 객체 종류 */
const QUIET_OBJECTS = new Set(['MATERIAL', 'VISUALSTYLE', 'ACDBSECTIONVIEWSTYLE', 'ACDBDETAILVIEWSTYLE', 'SCALE', 'DICTIONARYVAR', 'XRECORD']);

/** 도형이 빠지는 경고 */
const ENTITY_DROPS = new Set([
  'dwg.write_entity_dropped',
  'dwg.write_object_failed',
  'entity.invalid_dropped',
  'entity.acis_dropped',
  'entity.unknown_dropped',
  'entity.ole_dropped',
  'entity.shape_dropped',
  'entity.image_dropped',
  'entity.underlay_dropped',
  'entity.table_dropped',
  'entity.dimension_dropped',
  'table.cells_dropped',
  'r12.unsupported',
  'r12.layout_dropped',
]);

/** 남지만 바뀌는 경고 */
const CONVERSIONS = new Set([
  'entity.acis_as_wires',
  'entity.mleader_exploded',
  'entity.table_as_insert',
  'dwg.write_table_as_insert',
  'entity.dimension_as_insert',
  'entity.mesh_as_polyface',
  'entity.proxy_as_geometry',
  'r12.approximated',
  'r12.mtext_as_text',
  'r12.leader_as_polyline',
  'dwg.write_spline_fit_dropped',
]);

/** 객체가 빠지는 경고(종류에 따라) */
const OBJECT_DROPS = new Set(['dwg.write_object_dropped', 'object.no_data', 'object.corrupt_dropped', 'object.assoc_dropped']);

function typesOf(w: ReadWarning): string[] {
  const d = w.detail as { types?: Record<string, number>; items?: unknown[] } | undefined;
  if (d?.types && typeof d.types === 'object') return Object.keys(d.types);
  if (Array.isArray(d?.items)) return d.items.filter((x): x is string => typeof x === 'string');
  return [];
}

/** 쓰기 경고 → 사용자에게 확인받을 손실 목록(없으면 빈 목록) */
export function saveLosses(warnings: readonly ReadWarning[]): SaveLoss[] {
  const out: SaveLoss[] = [];
  for (const w of warnings) {
    const types = typesOf(w);
    if (ENTITY_DROPS.has(w.code) || CONVERSIONS.has(w.code)) {
      const d = w.detail as { types?: Record<string, number> } | undefined;
      // DWG 쓰기는 종류별 개수만 세고(count 1), DXF 쓰기는 경고마다 count를 센다
      const count = d?.types ? Math.max(Object.values(d.types).reduce((a, b) => a + (Number(b) || 0), 0), w.count ?? 1) : (w.count ?? 1);
      out.push({ message: w.message, count, types, converted: CONVERSIONS.has(w.code) });
    } else if (OBJECT_DROPS.has(w.code)) {
      const loud = types.filter((t) => !QUIET_OBJECTS.has(t.toUpperCase()));
      // 종류를 모르면(세부 없음) 보인다
      if (types.length && !loud.length) continue;
      const d = w.detail as { types?: Record<string, number> } | undefined;
      // 조용히 넘기는 종류(재질 등)는 개수에도 넣지 않는다. 종류별 개수를 모르면 보이는 종류 수만 센다
      const count = d?.types ? loud.reduce((a, t) => a + (Number(d.types![t]) || 0), 0) : loud.length < types.length ? loud.length : (w.count ?? 1);
      out.push({ message: w.message, count, types: loud, converted: false });
    }
  }
  return out;
}

/** 손실 목록의 글(명령행·확인창 공용). 한 줄에 하나 */
export function saveLossLines(losses: readonly SaveLoss[]): string[] {
  return losses.map((l) => `${l.message} (${l.count})${l.types.length ? `: ${l.types.slice(0, 8).join(', ')}${l.types.length > 8 ? ' …' : ''}` : ''}`);
}
