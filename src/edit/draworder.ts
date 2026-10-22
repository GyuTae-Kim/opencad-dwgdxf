/**
 * 그리기 순서와 ACAD_SORTENTS 표.
 * AutoCAD는 블록(공간)에 그리기 순서 표(SORTENTSTABLE: 객체 핸들 → 정렬 핸들)가 있으면 목록 순서가 아니라 정렬 핸들 순서로 그린다
 * (표에 없는 객체는 자기 핸들). 렌더러(src/render/build.ts ordered)도 같다. 그래서 순서를 바꾸는 명령은 목록과 함께 표도 고쳐야 한다.
 */
import type { CadDocument, DictionaryObject, Entity, SortEntsTableObject } from '../core/model';
import type { EditOp } from './session';

/** 블록 키(대문자 이름)의 그리기 순서 표. 없으면 null */
export function sortentsTable(doc: CadDocument, blockKey: string): SortEntsTableObject | null {
  const rec = doc.blockRecords.get(blockKey.toUpperCase());
  const xdict = rec?.xdict ? (doc.objects.get(rec.xdict) as DictionaryObject | undefined) : undefined;
  const h = xdict?.entries?.get('ACAD_SORTENTS');
  const t = h ? doc.objects.get(h) : undefined;
  return t && t.type === 'SORTENTSTABLE' ? (t as SortEntsTableObject) : null;
}

function key(h: string): bigint {
  try {
    return BigInt('0x' + (h || '0'));
  } catch {
    return 0n;
  }
}

/** 화면에 그리는 순서(정렬 표가 있으면 그 순서, 같은 키는 목록 순서) */
export function drawOrder(doc: CadDocument, blockKey: string, list: readonly Entity[] = doc.blocks.get(blockKey.toUpperCase())?.entities ?? []): Entity[] {
  const t = sortentsTable(doc, blockKey);
  if (!t || !t.entries.length) return [...list];
  const map = new Map(t.entries.map((x) => [x.entity.toUpperCase(), x.sort]));
  const keyed = list.map((e, i) => ({ e, v: key(map.get(e.handle.toUpperCase()) ?? e.handle), i }));
  keyed.sort((a, b) => (a.v < b.v ? -1 : a.v > b.v ? 1 : a.i - b.i));
  return keyed.map((k) => k.e);
}

/**
 * 블록의 그리기 순서를 desired(블록의 모든 객체, 앞에서 뒤로 = 먼저 그림)로 맞추는 표 바꾸기 작업.
 * 지금 쓰는 정렬 키들(표의 값 또는 자기 핸들)을 작은 것부터 desired 차례로 다시 나눠 준다 — 키가 겹치지 않고 새 객체(더 큰 핸들)는 계속 맨 앞에 그려진다.
 * 표가 없거나 바꿀 것이 없으면 null(목록 순서가 곧 그리기 순서)
 */
export function sortentsOp(doc: CadDocument, blockKey: string, desired: readonly Entity[]): EditOp | null {
  const t = sortentsTable(doc, blockKey);
  if (!t) return null;
  const map = new Map(t.entries.map((x) => [x.entity.toUpperCase(), x.sort]));
  const keys = desired.map((e) => map.get(e.handle.toUpperCase()) ?? e.handle);
  const sorted = [...keys].sort((a, b) => {
    const x = key(a);
    const y = key(b);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  const entries: { entity: string; sort: string }[] = [];
  desired.forEach((e, i) => {
    const s = sorted[i]!;
    if (key(s) !== key(e.handle)) entries.push({ entity: e.handle, sort: s });
  });
  // 지금 표로도 desired 차례라면 바꿀 것이 없다
  if (drawOrder(doc, blockKey, desired).every((e, i) => e === desired[i])) return null;
  // 원본 본문(dwgRaw)은 옛 순서라 버린다(모델 값으로 다시 쓴다)
  const { dwgRaw: _raw, ...rest } = t;
  void _raw;
  return { kind: 'object', key: t.handle, before: t, after: { ...rest, entries } as SortEntsTableObject };
}

/**
 * 새 객체 entity를 화면 순서의 자리 at에 넣는 표 바꾸기 작업(표가 없으면 null — 목록 자리로 충분).
 * at은 drawOrder(지금 화면 순서) 기준 자리.
 */
export function sortentsInsertOp(doc: CadDocument, blockKey: string, entity: Entity, at: number): EditOp | null {
  if (!sortentsTable(doc, blockKey)) return null;
  const visual = drawOrder(doc, blockKey);
  const i = Math.max(0, Math.min(visual.length, at));
  return sortentsOp(doc, blockKey, [...visual.slice(0, i), entity, ...visual.slice(i)]);
}
