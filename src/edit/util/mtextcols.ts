/**
 * R2000~R2013 형식의 여러 단 MTEXT(UI 없음).
 *
 * AutoCAD 2010부터의 여러 단 문자를 R2018 전 형식(DXF R2000~R2013, DWG R2000~R2013)으로 저장하면 단마다 MTEXT 객체가 따로 있고,
 * 첫 단 MTEXT의 ACAD 확장 자료에 다음 묶음이 붙는다(R2018은 한 MTEXT 안에 단 자료를 둔다 — model의 `columns`).
 *
 *   1000 ACAD_MTEXT_COLUMN_INFO_BEGIN  1070 75 1070 종류(1 정적·2 동적)  1070 79 1070 자동 높이  1070 76 1070 단 수
 *                                      1070 78 1070 흐름 거꾸로  1070 48 1040 단 폭  1070 49 1040 단 간격  [1070 50 1070 n 1040 높이…]
 *   1000 ACAD_MTEXT_COLUMN_INFO_END
 *   1000 ACAD_MTEXT_COLUMNS_BEGIN      1070 47 1070 단 객체 수(첫 단 포함)  1005 둘째 단 핸들 …
 *   1000 ACAD_MTEXT_COLUMNS_END
 *
 * 나머지 단 MTEXT에는 COLUMN_INFO만 있다. 이 앱은 단 객체를 그대로 두고(저장하면 원래 구조 그대로) 고를 때만 한 묶음으로 넓힌다.
 */
import type { CadDocument, Entity } from '../../core/model';
import { normalizeHandle } from '../../core/model';

const BEGIN = 'ACAD_MTEXT_COLUMNS_BEGIN';
const END = 'ACAD_MTEXT_COLUMNS_END';
const INFO_BEGIN = 'ACAD_MTEXT_COLUMN_INFO_BEGIN';
const INFO_END = 'ACAD_MTEXT_COLUMN_INFO_END';

/** 첫 단 MTEXT면 나머지 단의 핸들(대문자), 아니면 빈 배열 */
export function mtextColumnLinks(e: Entity): string[] {
  if (e.type !== 'MTEXT' || !e.xdata) return [];
  for (const x of e.xdata) {
    if (x.app.toUpperCase() !== 'ACAD') continue;
    const items = x.items;
    const at = items.findIndex((i) => i.code === 1000 && i.value === BEGIN);
    if (at < 0) continue;
    const out: string[] = [];
    for (let i = at + 1; i < items.length; i++) {
      const it = items[i]!;
      if (it.code === 1000 && it.value === END) break;
      if (it.code === 1005 && typeof it.value === 'string' && it.value && it.value !== '0') out.push(normalizeHandle(it.value));
    }
    return out;
  }
  return [];
}

/** 단 정보(COLUMN_INFO)의 단 수(76), 없으면 0 */
function infoColumnCount(items: readonly { code: number; value: unknown }[]): number {
  const at = items.findIndex((i) => i.code === 1000 && i.value === INFO_BEGIN);
  if (at < 0) return 0;
  for (let i = at + 1; i + 1 < items.length; i++) {
    const it = items[i]!;
    if (it.code === 1000 && it.value === INFO_END) break;
    if (it.code === 1070 && it.value === 76 && items[i + 1]!.code === 1070) return Number(items[i + 1]!.value) || 0;
  }
  return 0;
}

/**
 * 복사본(COPY·ARRAY·붙여넣기 등 새 핸들로 만드는 객체)에서 여러 단 연결을 뗀다: 첫 단의 다른 단 핸들(1005)은 원본의 단을 가리키므로
 * 그대로 두면 두 첫 단이 같은 단을 갖게 된다. 단이 둘 이상인 묶음의 단 정보·단 목록을 지워 복사본은 보통 MTEXT가 된다
 * (단마다 제 글과 폭을 가지므로 보이는 모양은 같다). 한 단짜리(AutoCAD 2010+의 기본 동적 단) 정보는 그대로 둔다.
 */
export function stripMTextColumnLinks(e: Entity): void {
  if (e.type !== 'MTEXT' || !e.xdata) return;
  const x = e.xdata.find((d) => d.app.toUpperCase() === 'ACAD');
  if (!x) return;
  const linked = x.items.some((i) => i.code === 1000 && i.value === BEGIN);
  if (!linked && infoColumnCount(x.items) < 2) return;
  const out: typeof x.items = [];
  let skip: string | null = null;
  for (const it of x.items) {
    if (skip) {
      if (it.code === 1000 && it.value === skip) skip = null;
      continue;
    }
    if (it.code === 1000 && it.value === BEGIN) skip = END;
    else if (it.code === 1000 && it.value === INFO_BEGIN) skip = INFO_END;
    else out.push(it);
  }
  if (out.length) e.xdata = e.xdata.map((d) => (d === x ? { ...d, items: out } : d));
  else {
    const rest = e.xdata.filter((d) => d !== x);
    if (rest.length) e.xdata = rest;
    else delete e.xdata;
  }
}

/** 단 묶음: 묶음에 든 MTEXT 핸들 → [첫 단, 둘째 단 …](문서에 있는 MTEXT만, 단이 둘 이상인 것만) */
export function mtextColumnSets(doc: CadDocument): Map<string, string[]> {
  const sets = new Map<string, string[]>();
  for (const b of doc.blocks.values()) {
    for (const e of b.entities) {
      if (e.type !== 'MTEXT' || !e.xdata) continue;
      const links = mtextColumnLinks(e);
      if (!links.length) continue;
      const head = normalizeHandle(e.handle);
      const list = [head, ...links.filter((h) => h !== head && doc.entityIndex.get(h)?.type === 'MTEXT')];
      if (list.length < 2) continue;
      for (const h of list) if (!sets.has(h)) sets.set(h, list);
    }
  }
  return sets;
}

/** 고른 핸들에 같은 여러 단 MTEXT의 다른 단을 더한다(순서 유지, 겹치지 않게) */
export function expandByMTextColumns(doc: CadDocument, handles: readonly string[], sets?: Map<string, string[]>): string[] {
  if (!handles.some((h) => doc.entityIndex.get(normalizeHandle(h))?.type === 'MTEXT')) return [...handles];
  const s = sets ?? mtextColumnSets(doc);
  if (!s.size) return [...handles];
  const out = [...handles];
  const have = new Set(handles.map((h) => normalizeHandle(h)));
  for (const h of handles) {
    for (const m of s.get(normalizeHandle(h)) ?? []) {
      if (have.has(m)) continue;
      have.add(m);
      out.push(m);
    }
  }
  return out;
}

const cache = new WeakMap<CadDocument, { gen: number; sets: Map<string, string[]> }>();

/** 편집 세대(gen)가 같으면 단 묶음을 다시 찾지 않는다 */
export function cachedMTextColumnSets(doc: CadDocument, gen: number): Map<string, string[]> {
  const c = cache.get(doc);
  if (c && c.gen === gen) return c.sets;
  const sets = mtextColumnSets(doc);
  cache.set(doc, { gen, sets });
  return sets;
}
