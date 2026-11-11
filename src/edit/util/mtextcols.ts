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
 *   1000 ACAD_MTEXT_DEFINED_HEIGHT_BEGIN 1070 46 1040 정한 높이   1000 ACAD_MTEXT_DEFINED_HEIGHT_END
 *
 * 다른 단 MTEXT에는 정한 높이만 있다(정한 높이가 0이면 확장 자료가 없다). AutoCAD가 같은 도면을 R2018과 R2007로 쓴 짝에서 본 배치다:
 * 높이 목록(50)은 수동 높이 동적 단에만, 정한 높이는 그 값(R2018 46)이 0이 아닐 때만 있고, 단 수(76)는 단 객체 수(47)보다 클 수 있다
 * (정적 3단에 글이 두 단만 차면 단 객체는 둘). 이 앱은 단 객체를 그대로 두고(저장하면 원래 구조 그대로) 고를 때만 한 묶음으로 넓힌다.
 */
import type { CadDocument, Entity, MTextColumns, MTextEntity, Vec3, XData, XDataItem } from '../../core/model';
import { normalizeHandle } from '../../core/model';

const BEGIN = 'ACAD_MTEXT_COLUMNS_BEGIN';
const END = 'ACAD_MTEXT_COLUMNS_END';
const INFO_BEGIN = 'ACAD_MTEXT_COLUMN_INFO_BEGIN';
const INFO_END = 'ACAD_MTEXT_COLUMN_INFO_END';
const DH_BEGIN = 'ACAD_MTEXT_DEFINED_HEIGHT_BEGIN';
const DH_END = 'ACAD_MTEXT_DEFINED_HEIGHT_END';
const BLOCKS: Record<string, string> = { [BEGIN]: END, [INFO_BEGIN]: INFO_END, [DH_BEGIN]: DH_END };

/** 첫 단·다른 단의 ACAD 확장 자료에 든 여러 단 자료 */
export interface ColumnXData {
  /** 단 정보(COLUMN_INFO): 종류·단 수·폭·간격·자동 높이·흐름 거꾸로·높이 목록 */
  info?: MTextColumns;
  /** 단 목록(COLUMNS): 단 객체 수(47, 첫 단 포함)와 다른 단 핸들(대문자) */
  links?: { count: number; handles: string[] };
  /** 정한 높이(DEFINED_HEIGHT 46) */
  definedHeight?: number;
}

function acadOf(xdata: readonly XData[] | undefined): XData | undefined {
  return xdata?.find((d) => d.app.toUpperCase() === 'ACAD');
}

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v));

/** 확장 자료의 여러 단 자료(MTEXT가 아니거나 없으면 null) */
export function readColumnXData(e: Entity): ColumnXData | null {
  return e.type === 'MTEXT' ? columnXDataOf(e.xdata) : null;
}

export function columnXDataOf(xdata: readonly XData[] | undefined): ColumnXData | null {
  const x = acadOf(xdata);
  if (!x) return null;
  const items = x.items;
  let out: ColumnXData | null = null;
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    if (it.code !== 1000) continue;
    if (it.value === INFO_BEGIN) {
      const info: MTextColumns = { type: 0, count: 0, width: 0, gutter: 0, autoHeight: false, flowReversed: false, heights: [] };
      for (i++; i < items.length; i++) {
        const k = items[i]!;
        if (k.code === 1000 && k.value === INFO_END) break;
        if (k.code !== 1070 || i + 1 >= items.length) continue;
        const key = num(k.value);
        const v = num(items[i + 1]!.value);
        i++;
        if (key === 75) info.type = v;
        else if (key === 79) info.autoHeight = v === 1;
        else if (key === 76) info.count = v;
        else if (key === 78) info.flowReversed = v === 1;
        else if (key === 48) info.width = v;
        else if (key === 49) info.gutter = v;
        else if (key === 50) {
          for (let n = 0; n < v && i + 1 < items.length && items[i + 1]!.code === 1040; n++) info.heights.push(num(items[++i]!.value));
        }
      }
      (out ??= {}).info = info;
    } else if (it.value === BEGIN) {
      const links = { count: 0, handles: [] as string[] };
      for (i++; i < items.length; i++) {
        const k = items[i]!;
        if (k.code === 1000 && k.value === END) break;
        if (k.code === 1070 && num(k.value) === 47 && items[i + 1]?.code === 1070) links.count = num(items[++i]!.value);
        else if (k.code === 1005 && typeof k.value === 'string' && k.value && k.value !== '0') links.handles.push(normalizeHandle(k.value));
      }
      (out ??= {}).links = links;
    } else if (it.value === DH_BEGIN) {
      for (i++; i < items.length; i++) {
        const k = items[i]!;
        if (k.code === 1000 && k.value === DH_END) break;
        if (k.code === 1070 && num(k.value) === 46 && items[i + 1]?.code === 1040) (out ??= {}).definedHeight = num(items[++i]!.value);
      }
    }
  }
  return out;
}

/** 단 정보에 높이 목록을 쓰는지(수동 높이 동적 단) */
export function manualHeights(c: Pick<MTextColumns, 'type' | 'autoHeight'>): boolean {
  return c.type === 2 && !c.autoHeight;
}

/**
 * 정한 높이(46)를 확장 자료로 쓰는지: 값이 0이 아닐 때(단 종류와 상관없이 — AutoCAD가 쓴 짝에서 수동 높이 단도 46이 12면
 * 첫 단과 다른 단에 정한 높이가 있고, 46이 0인 단은 없다)
 */
export function hasDefinedHeight(rectHeight: number | undefined): boolean {
  return !!rectHeight && rectHeight > 0;
}

/** 여러 단 자료 → ACAD 확장 자료 항목(AutoCAD가 쓰는 차례: 단 정보, 단 목록, 정한 높이) */
export function columnXDataItems(c: ColumnXData): XDataItem[] {
  const out: XDataItem[] = [];
  const s = (v: string) => out.push({ code: 1000, value: v });
  const i16 = (v: number) => out.push({ code: 1070, value: v });
  const r = (v: number) => out.push({ code: 1040, value: v });
  if (c.info) {
    const f = c.info;
    s(INFO_BEGIN);
    i16(75);
    i16(f.type);
    i16(79);
    i16(f.autoHeight ? 1 : 0);
    i16(76);
    i16(f.count);
    i16(78);
    i16(f.flowReversed ? 1 : 0);
    i16(48);
    r(f.width);
    i16(49);
    r(f.gutter);
    if (manualHeights(f)) {
      i16(50);
      i16(f.heights.length);
      for (const h of f.heights) r(h);
    }
    s(INFO_END);
  }
  if (c.links) {
    s(BEGIN);
    i16(47);
    i16(c.links.count);
    for (const h of c.links.handles) out.push({ code: 1005, value: h });
    s(END);
  }
  if (c.definedHeight !== undefined) {
    s(DH_BEGIN);
    i16(46);
    r(c.definedHeight);
    s(DH_END);
  }
  return out;
}

/**
 * 확장 자료에서 여러 단 묶음(단 정보·단 목록·정한 높이)을 빼고 c가 있으면 그 자리에 c를 넣는다. 다른 앱·다른 ACAD 항목은 그대로.
 * 결과가 비면 undefined
 */
export function withColumnXData(xdata: readonly XData[] | undefined, c: ColumnXData | null): XData[] | undefined {
  const add = c ? columnXDataItems(c) : [];
  const x = acadOf(xdata);
  if (!x) {
    if (!add.length) return xdata?.length ? [...xdata] : undefined;
    return [...(xdata ?? []), { app: 'ACAD', items: add }];
  }
  const items: XDataItem[] = [];
  let at = -1;
  let skip: string | null = null;
  for (const it of x.items) {
    if (skip) {
      if (it.code === 1000 && it.value === skip) skip = null;
      continue;
    }
    const end = it.code === 1000 && typeof it.value === 'string' ? BLOCKS[it.value] : undefined;
    if (end) {
      if (at < 0) at = items.length;
      skip = end;
      continue;
    }
    items.push(it);
  }
  if (add.length) items.splice(at < 0 ? items.length : at, 0, ...add);
  const out = xdata!.flatMap((d) => (d !== x ? [d] : items.length ? [{ ...d, items }] : []));
  return out.length ? out : undefined;
}

/** 첫 단 MTEXT면 나머지 단의 핸들(대문자), 아니면 빈 배열 */
export function mtextColumnLinks(e: Entity): string[] {
  if (e.type !== 'MTEXT' || !e.xdata) return [];
  return readColumnXData(e)?.links?.handles ?? [];
}

/**
 * 복사본(COPY·ARRAY·붙여넣기 등 새 핸들로 만드는 객체)에서 여러 단 연결을 뗀다: 첫 단의 다른 단 핸들(1005)은 원본의 단을 가리키므로
 * 그대로 두면 두 첫 단이 같은 단을 갖게 된다. 단이 둘 이상인 묶음의 단 정보·단 목록·정한 높이를 지워 복사본은 보통 MTEXT가 된다
 * (단마다 제 글과 폭을 가지므로 보이는 모양은 같다). 한 단짜리(AutoCAD 2010+의 기본 동적 단) 정보는 그대로 둔다.
 * 묶음째 복사한 것은 relinkColumnCopies가 새 단끼리 다시 잇는다.
 */
export function stripMTextColumnLinks(e: Entity): void {
  if (e.type !== 'MTEXT' || !e.xdata) return;
  const c = readColumnXData(e);
  if (!c) return;
  const multi = !!c.links || (c.info?.count ?? 0) >= 2;
  // 다른 단(정한 높이만 있다)도 보통 MTEXT로
  if (!multi && (c.info || c.definedHeight === undefined)) return;
  const next = withColumnXData(e.xdata, null);
  if (next) e.xdata = next;
  else delete e.xdata;
}

/** 단 묶음: 묶음에 든 MTEXT 핸들 → [첫 단, 둘째 단 …](첫 단과 같은 블록에 있는 MTEXT만, 단이 둘 이상인 것만) */
export function mtextColumnSets(doc: CadDocument): Map<string, string[]> {
  const sets = new Map<string, string[]>();
  for (const b of doc.blocks.values()) {
    let own: Set<Entity> | null = null;
    for (const e of b.entities) {
      if (e.type !== 'MTEXT' || !e.xdata) continue;
      const links = mtextColumnLinks(e);
      if (!links.length) continue;
      own ??= new Set(b.entities);
      const head = normalizeHandle(e.handle);
      const list = [head];
      for (const h of links) {
        const m = doc.entityIndex.get(h);
        // 다른 블록을 가리키는 연결(새 핸들로 옮긴 사본에 남은 옛 연결)은 묶지 않는다
        if (h !== head && m?.type === 'MTEXT' && own.has(m) && !list.includes(h)) list.push(h);
      }
      if (list.length < 2) continue;
      for (const h of list) if (!sets.has(h)) sets.set(h, list);
    }
  }
  return sets;
}

/**
 * 그릴 때 줄을 나눌 단 폭: 첫 단(다른 단이 있거나 단 수가 둘 이상인 단 정보)은 제 단 정보의 단 폭, 다른 단(정한 높이만 있는 MTEXT)은
 * members(memberColumnWidths)에서 찾는다. AutoCAD는 다른 단 41에 전체 폭을, 첫 단 41에는 R2018 41을 써서(짝에서 전체 폭일 때가 많다)
 * 41로 나누면 단 사이로 글이 넘친다. 단 폭이 없으면 undefined(41로)
 */
export function columnWrapWidth(e: MTextEntity, members: () => Map<string, number>): number | undefined {
  if (!e.xdata || e.columns) return undefined;
  const c = readColumnXData(e);
  if (!c) return undefined;
  if (c.info) return c.info.type > 0 && c.info.width > 0 && (c.links?.handles.length || c.info.count >= 2) ? c.info.width : undefined;
  return c.definedHeight !== undefined && !c.links ? members().get(normalizeHandle(e.handle)) : undefined;
}

/** 묶음의 다른 단 → 첫 단 단 정보의 단 폭 */
export function memberColumnWidths(doc: CadDocument): Map<string, number> {
  const out = new Map<string, number>();
  for (const [h, list] of mtextColumnSets(doc)) {
    if (list[0] !== h) continue;
    const w = readColumnXData(doc.entityIndex.get(h)!)?.info?.width;
    if (w && w > 0) for (const m of list.slice(1)) out.set(m, w);
  }
  return out;
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

/**
 * 첫 단 + 다른 단(단 목록 차례) → 첫 단 자리의 MTEXT 하나: 글은 단 차례로 이어 붙이고(AutoCAD가 같은 도면을 R2018과 R2007로 쓴
 * 짝에서 이어 붙인 글이 R2018 글이다), 단 정보는 단 자료(columns)로, 정한 높이는 46으로. 확장 자료의 여러 단 묶음은 뺀다
 */
export function mergeColumnGroup(head: MTextEntity, c: ColumnXData, members: readonly MTextEntity[]): MTextEntity {
  const info = c.info!;
  const columns: MTextColumns = {
    type: info.type,
    count: info.count > 0 ? info.count : 1 + members.length,
    width: info.width,
    gutter: info.gutter,
    autoHeight: info.autoHeight,
    flowReversed: info.flowReversed,
    heights: manualHeights(info) ? [...info.heights] : [],
  };
  const out: MTextEntity = { ...head, text: head.text + members.map((m) => m.text).join(''), columns };
  const xd = withColumnXData(head.xdata, null);
  if (xd) out.xdata = xd;
  else delete out.xdata;
  // 정한 높이: 확장 자료에 있으면 그것(R2000 DXF 본문에는 46이 없다), 없으면 본문 46(짝에서 0)
  out.rectHeight = c.definedHeight ?? head.rectHeight ?? 0;
  delete out.dwgRaw;
  return out;
}

/**
 * 묶음에 든 MTEXT(어느 단이든) → 첫 단, 다른 단, 한 객체로 합친 모양. 단 정보가 없거나 묶음이 아니면 null.
 * 그립·제자리 편집이 묶음을 AutoCAD처럼 객체 하나로 다룰 때 쓴다(바꾸면 첫 단을 합친 객체로, 다른 단은 지운다)
 */
export function linkedColumnGroup(doc: CadDocument, e: Entity, sets?: Map<string, string[]>): { head: MTextEntity; members: MTextEntity[]; merged: MTextEntity } | null {
  if (e.type !== 'MTEXT') return null;
  const s = sets ?? mtextColumnSets(doc);
  const list = s.get(normalizeHandle(e.handle));
  const head = list ? doc.entityIndex.get(list[0]!) : undefined;
  if (!head || head.type !== 'MTEXT') return null;
  const g = columnGroupOf(doc, head, s);
  const c = readColumnXData(head);
  if (!g || g.length < 2 || !c?.info || c.info.type <= 0) return null;
  const members = g.slice(1);
  return { head, members, merged: mergeColumnGroup(head, c, members) };
}

/** 첫 단과 다른 단(문서 차례) — 묶음의 첫 단이 아니면 null */
export function columnGroupOf(doc: CadDocument, head: Entity, sets?: Map<string, string[]>): MTextEntity[] | null {
  if (head.type !== 'MTEXT') return null;
  const list = (sets ?? mtextColumnSets(doc)).get(normalizeHandle(head.handle));
  if (!list || list[0] !== normalizeHandle(head.handle)) return null;
  return list.map((h) => doc.entityIndex.get(h) as MTextEntity);
}

// ---------------------------------------------------------------------------
// 확장 자료의 단 값 축척(SCALE·축척한 블록 분해 — R2018 `columns`처럼)
// ---------------------------------------------------------------------------

/**
 * ACAD 확장 자료의 여러 단 항목만 값을 바꾼 사본(다른 항목·차례는 그대로). fn은 묶음 이름, 앞 열쇠(1070), 항목을 받아 새 항목을 돌려준다
 */
function mapColumnItems(xdata: readonly XData[], fn: (block: string, key: number, it: XDataItem) => XDataItem): XData[] {
  return xdata.map((d) => {
    if (d.app.toUpperCase() !== 'ACAD') return d;
    let block: string | null = null;
    let key = -1;
    // 열쇠(1070) 다음은 값 하나, 높이 목록(50)은 개수(1070) 다음 높이(1040) 개수만큼
    let expect: 'key' | 'value' | 'count' | 'list' = 'key';
    let left = 0;
    const items = d.items.map((it) => {
      if (it.code === 1000 && typeof it.value === 'string') {
        if (BLOCKS[it.value]) block = it.value;
        else if (block && BLOCKS[block] === it.value) block = null;
        expect = 'key';
        return it;
      }
      if (!block) return it;
      if (expect === 'key') {
        if (it.code !== 1070) return fn(block, -1, it);
        key = num(it.value);
        expect = key === 50 && block === INFO_BEGIN ? 'count' : 'value';
        return it;
      }
      if (expect === 'count') {
        left = num(it.value);
        expect = left > 0 ? 'list' : 'key';
        return it;
      }
      if (expect === 'list' && --left <= 0) expect = 'key';
      else if (expect === 'value') expect = 'key';
      return fn(block, key, it);
    });
    return { ...d, items };
  });
}

/** 단 폭·간격은 kx배, 높이·정한 높이는 ky배(값이 바뀌지 않으면 그대로) */
export function scaleColumnXData(e: MTextEntity, kx: number, ky: number): void {
  if (!e.xdata || (Math.abs(kx - 1) < 1e-12 && Math.abs(ky - 1) < 1e-12)) return;
  const c = readColumnXData(e);
  if (!c || (!c.info && c.definedHeight === undefined)) return;
  e.xdata = mapColumnItems(e.xdata, (block, key, it) => {
    if (it.code !== 1040) return it;
    const v = num(it.value);
    if (block === INFO_BEGIN && (key === 48 || key === 49)) return { code: 1040, value: v * kx };
    if ((block === INFO_BEGIN && key === 50) || (block === DH_BEGIN && key === 46)) return { code: 1040, value: v * ky };
    return it;
  });
}

// ---------------------------------------------------------------------------
// 복사본의 단 연결(90차)
// ---------------------------------------------------------------------------

interface CopyNote {
  /** 원본 핸들 */
  src: string;
  /** 떼기 전 확장 자료(변환한 값). 정한 높이가 0인 묶음의 다른 단은 확장 자료가 없다 */
  xdata: XData[] | undefined;
  /** 같은 변환으로 만든 복사본끼리 같은 꼬리표(행렬 등) */
  tag: string;
}

const notes = new WeakMap<Entity, CopyNote>();

/**
 * freshEntity가 부른다: MTEXT 복사본의 원본 핸들과 떼기 전 확장 자료를 적어 둔다(묶음의 다른 단은 확장 자료가 없을 수 있어
 * MTEXT는 모두 적는다 — 수동 높이 단의 정한 높이가 0이면 AutoCAD가 다른 단에 확장 자료를 쓰지 않는다).
 * 묶음의 모든 단이 같은 편집에서 같은 변환으로 복사되면 relinkColumnCopies가 새 단끼리 다시 잇는다
 */
export function noteColumnCopy(x: Entity): void {
  if (x.type !== 'MTEXT' || !x.handle) return;
  notes.set(x, { src: normalizeHandle(x.handle), xdata: x.xdata, tag: '' });
}

/** 같은 변환으로 만든 복사본에 같은 꼬리표(적어 둔 복사본만) */
export function tagColumnCopy(x: Entity, tag: string): void {
  const n = notes.get(x);
  if (n) n.tag = tag;
}

/** 변환 행렬(과 고도 차)의 꼬리표 */
export function transformTag(m: readonly number[], dz?: number): string {
  return `${m.join(',')}|${dz ?? 0}`;
}

function sub3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: (a.z ?? 0) - (b.z ?? 0) };
}
function dot3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + (a.z ?? 0) * (b.z ?? 0);
}

/** MTEXT의 X축(WCS 단위 벡터)과 Y축 — 방향이 없으면 회전각(OCS 법선이 +Z가 아니면 null) */
function textFrame(e: MTextEntity): { u: Vec3; v: Vec3 } | null {
  const n = e.extrusion ?? { x: 0, y: 0, z: 1 };
  let u: Vec3;
  if (e.direction && Math.hypot(e.direction.x, e.direction.y, e.direction.z ?? 0) > 0) u = e.direction;
  else if (Math.abs(n.x) < 1e-12 && Math.abs(n.y) < 1e-12 && n.z > 0) u = { x: Math.cos(e.rotation), y: Math.sin(e.rotation), z: 0 };
  else return null;
  const l = Math.hypot(u.x, u.y, u.z ?? 0);
  u = { x: u.x / l, y: u.y / l, z: (u.z ?? 0) / l };
  const v = { x: n.y * u.z - n.z * u.y, y: n.z * u.x - n.x * u.z, z: n.x * u.y - n.y * u.x };
  const lv = Math.hypot(v.x, v.y, v.z) || 1;
  return { u, v: { x: v.x / lv, y: v.y / lv, z: v.z / lv } };
}

/**
 * 첫 단에서 다른 단이 단 폭 + 간격씩 문자 방향으로 늘어섰는지(AutoCAD가 쓴 묶음의 배치 — 짝 도면의 단 삽입점이 모두 이렇다).
 * 글자를 읽을 수 있게 둔 대칭 복사(단 차례가 뒤집힌다)처럼 어긋난 복사본은 잇지 않는다
 */
export function columnLayoutFits(head: MTextEntity, members: readonly MTextEntity[], info: MTextColumns | undefined): boolean {
  if (!info || !(info.width > 0)) return false;
  const f = textFrame(head);
  if (!f) return false;
  const step = info.width + info.gutter;
  const sign = info.flowReversed ? -1 : 1;
  const tol = 1e-6 * Math.max(1, Math.abs(step) * (members.length + 1), Math.abs(head.insert.x), Math.abs(head.insert.y));
  for (let i = 0; i < members.length; i++) {
    const d = sub3(members[i]!.insert, head.insert);
    if (Math.abs(dot3(d, f.u) - sign * step * (i + 1)) > tol || Math.abs(dot3(d, f.v)) > tol) return false;
  }
  return true;
}

/**
 * 고른 객체에 묶음의 첫 단과 다른 단이 모두 들어 있고 배치가 맞는 묶음마다: 단 핸들 → 묶음 전체 상자(그 단의 삽입점 기준 글자 좌표).
 * 글자를 읽을 수 있게 두는 대칭은 글 상자를 거울상 자리에 두는데, R2018 꼴(객체 하나)은 묶음 전체가 한 상자이므로 단마다 객체인 꼴도 같은 상자로 옮겨야
 * 단 차례가 그대로이고 저장하면 첫 단 자리에서 다시 뻗어 나가지 않는다. 일부만 고르거나 배치가 어긋나면 넣지 않는다(지금처럼 제 상자).
 * measure는 단 폭으로 줄을 나눈 글 상자(단 삽입점 기준)를 돌려준다
 */
export function columnGroupBoxes(
  doc: CadDocument,
  handles: readonly string[],
  measure: (m: MTextEntity, width: number) => { minX: number; minY: number; maxX: number; maxY: number },
): Map<string, { minX: number; minY: number; maxX: number; maxY: number }> | undefined {
  let out: Map<string, { minX: number; minY: number; maxX: number; maxY: number }> | undefined;
  let selected: Set<string> | null = null;
  for (const h of handles) {
    const head = doc.entityIndex.get(h);
    if (head?.type !== 'MTEXT' || !head.xdata) continue;
    const c = readColumnXData(head);
    if (!c?.links?.handles.length || !c.info) continue;
    selected ??= new Set(handles.map(normalizeHandle));
    if (!c.links.handles.every((x) => selected!.has(x))) continue;
    const members = c.links.handles.map((x) => doc.entityIndex.get(x));
    if (!members.every((m): m is MTextEntity => m?.type === 'MTEXT') || !columnLayoutFits(head, members, c.info)) continue;
    const f = textFrame(head);
    if (!f) continue;
    const cols = [head, ...members];
    const at = cols.map((m) => {
      const d = sub3(m.insert, head.insert);
      return { u: dot3(d, f.u), v: dot3(d, f.v) };
    });
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    cols.forEach((m, i) => {
      const b = measure(m, c.info!.width);
      minX = Math.min(minX, b.minX + at[i]!.u);
      maxX = Math.max(maxX, b.maxX + at[i]!.u);
      minY = Math.min(minY, b.minY + at[i]!.v);
      maxY = Math.max(maxY, b.maxY + at[i]!.v);
    });
    out ??= new Map();
    cols.forEach((m, i) => out!.set(normalizeHandle(m.handle), { minX: minX - at[i]!.u, minY: minY - at[i]!.v, maxX: maxX - at[i]!.u, maxY: maxY - at[i]!.v }));
  }
  return out;
}

/** 단 목록의 핸들(1005)만 차례대로 바꾼 확장 자료(다른 항목은 그대로) */
function relinked(xdata: readonly XData[], handles: readonly string[]): XData[] {
  let j = 0;
  return mapColumnItems(xdata, (block, _key, it) => (block === BEGIN && it.code === 1005 && typeof it.value === 'string' && it.value && it.value !== '0' && j < handles.length ? { code: 1005, value: handles[j++]! } : it));
}

/**
 * 같은 편집에서 더하는 객체(새 핸들을 받은 뒤): 묶음의 첫 단과 다른 단이 모두 같은 변환으로 복사됐고 배치가 맞으면
 * 복사한 첫 단의 단 목록을 새 단 핸들로 바꾸고 단마다 떼어 둔 확장 자료를 되돌린다. 일부만 복사했으면 지금처럼 보통 MTEXT.
 * 잇은 묶음 수
 */
export function relinkColumnCopies(added: readonly Entity[]): number {
  let groups: Map<string, Map<string, Entity[]>> | null = null;
  for (const e of added) {
    const n = notes.get(e);
    if (!n) continue;
    groups ??= new Map();
    let g = groups.get(n.tag);
    if (!g) groups.set(n.tag, (g = new Map()));
    let l = g.get(n.src);
    if (!l) g.set(n.src, (l = []));
    l.push(e);
  }
  if (!groups) return 0;
  let linked = 0;
  for (const g of groups.values()) {
    for (const copies of g.values()) {
      for (let k = 0; k < copies.length; k++) {
        const head = copies[k] as MTextEntity;
        const n = notes.get(head)!;
        if (!n.xdata) continue;
        const c = columnXDataOf(n.xdata);
        if (!c?.links?.handles.length) continue;
        const members = c.links.handles.map((h) => g.get(h)?.[k] as MTextEntity | undefined);
        if (members.some((m) => !m || !m.handle) || !head.handle) continue;
        if (!columnLayoutFits(head, members as MTextEntity[], c.info)) continue;
        head.xdata = relinked(n.xdata, (members as MTextEntity[]).map((m) => normalizeHandle(m.handle)));
        for (const m of members as MTextEntity[]) {
          const xd = notes.get(m)!.xdata;
          if (xd) m.xdata = structuredClone(xd);
        }
        linked++;
      }
    }
  }
  for (const e of added) notes.delete(e);
  return linked;
}

/**
 * 원본을 그대로 복제해 새 핸들만 준 객체(블록으로 붙여넣기·연관 배열의 원본 블록 등): sources[i]가 copies[i]의 원본 핸들.
 * 첫 단의 단 목록을 복제한 단의 새 핸들로 바꾸고, 묶음이 다 복제되지 않았으면 단 연결을 뗀다(다른 곳의 옛 단을 가리키지 않게)
 */
export function relinkClonedColumns(copies: readonly Entity[], sources: readonly string[]): number {
  let map: Map<string, Entity> | null = null;
  let linked = 0;
  for (let i = 0; i < copies.length; i++) {
    const e = copies[i]!;
    if (e.type !== 'MTEXT' || !e.xdata) continue;
    const c = readColumnXData(e);
    if (!c?.links?.handles.length) continue;
    if (!map) {
      map = new Map();
      for (let j = 0; j < copies.length; j++) if (sources[j]) map.set(normalizeHandle(sources[j]!), copies[j]!);
    }
    const members = c.links.handles.map((h) => map!.get(h));
    if (members.every((m) => m?.type === 'MTEXT' && m.handle) && columnLayoutFits(e, members as MTextEntity[], c.info)) {
      e.xdata = relinked(e.xdata, (members as MTextEntity[]).map((m) => normalizeHandle(m.handle)));
      linked++;
    } else stripMTextColumnLinks(e);
  }
  return linked;
}
