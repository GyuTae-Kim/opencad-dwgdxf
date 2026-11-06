/**
 * 편집 세션: 문서에 변경을 적용하고 되돌린다(U·REDO).
 * 메인 스레드와 엔진 워커가 같은 변경을 같은 순서로 적용해 두 문서를 맞춘다.
 *
 * 변경 = 작업(op) 목록. 각 작업은 앞뒤 상태를 모두 담아 되돌리기가 그대로 반대 작업이다.
 */
import type { BlockDef, BlockRecord, CadDocument, CadObject, Entity, HeaderValue, Layer, Layout, LayoutObject, Linetype, TableHead, TableRecordBase, TextStyle, DimStyle, UcsRecord, ViewRecord, VPortRecord } from '../core/model';
import { pushAll } from '../core/arrays';
import { cloneData } from '../core/clone';
import { tableKey, normalizeHandle } from '../core/model';
import { HandleIndex } from '../core/handleindex';

export type EditOp =
  /** 블록(공간) block의 index 자리에 객체를 넣는다(index 없으면 끝) */
  | { kind: 'add'; block: string; entity: Entity; index?: number }
  /** 블록에서 객체를 뺀다(되돌릴 때 같은 자리에 넣는다) */
  | { kind: 'remove'; block: string; entity: Entity; index: number }
  /** 같은 핸들의 객체를 바꾼다 */
  | { kind: 'modify'; block: string; before: Entity; after: Entity }
  | { kind: 'layer'; key: string; before: Layer | null; after: Layer | null }
  | { kind: 'linetype'; key: string; before: Linetype | null; after: Linetype | null }
  | { kind: 'textStyle'; key: string; before: TextStyle | null; after: TextStyle | null }
  | { kind: 'dimStyle'; key: string; before: DimStyle | null; after: DimStyle | null }
  /** 명명된 뷰(VIEW 표). key = 이름(대문자) */
  | { kind: 'view'; key: string; before: ViewRecord | null; after: ViewRecord | null }
  /** 이름 붙은 UCS(UCS 표). key = 이름(대문자) */
  | { kind: 'ucs'; key: string; before: UcsRecord | null; after: UcsRecord | null }
  /** 뷰포트 표 전체(타일 뷰포트 *ACTIVE와 이름 있는 구성) */
  | { kind: 'vports'; before: VPortRecord[]; after: VPortRecord[] }
  | { kind: 'blockDef'; key: string; before: BlockDef | null; after: BlockDef | null }
  | { kind: 'blockRecord'; key: string; before: BlockRecord | null; after: BlockRecord | null }
  /** 객체(사전·배치·이미지 정의 등). key = 핸들 */
  | { kind: 'object'; key: string; before: CadObject | null; after: CadObject | null }
  | { kind: 'header'; name: string; before: HeaderValue | undefined; after: HeaderValue | undefined }
  /** 배치(모형·종이 공간 탭). key = 배치 블록 이름(대문자). 같은 핸들의 LAYOUT 객체도 맞춘다 */
  | { kind: 'layout'; key: string; before: Layout | null; after: Layout | null }
  /** 표 머리(TABLE 제어 객체: 확장 사전 등). key = 표 이름(LAYER …) */
  | { kind: 'tableHead'; key: string; before: TableHead | null; after: TableHead | null }
  /** 등록한 앱 이름(APPID 표: regapp·확장 데이터). key = 이름(대문자) */
  | { kind: 'appId'; key: string; before: TableRecordBase | null; after: TableRecordBase | null };

export interface Transaction {
  /** 명령 이름(명령 취소 메시지용) */
  label: string;
  ops: EditOp[];
  /** 같은 묶음 번호의 연속 트랜잭션은 명령 취소 때 하나로 되돌린다(명령 하나 안의 여러 단계) */
  group?: number;
  /** 그리기 순서처럼 덧그림으로 바로 보일 수 없는 변경: 곧바로 다시 그린다 */
  rebuildNow?: boolean;
}

/** 변경이 화면에 미치는 범위 */
export interface ChangeSummary {
  /** 공간 블록 키(대문자) → 바뀐 핸들(추가·삭제·수정) */
  spaces: Map<string, { removed: Set<string>; changed: Entity[] }>;
  /** 블록 정의가 바뀌었으면(블록 참조 다시 그리기 필요) */
  blocksChanged: boolean;
  /** 선종류·문자 스타일·치수 스타일이 바뀌었거나 도면층이 생기고 없어졌으면(다시 그리기 필요) */
  tablesChanged: boolean;
  /** 도면층 상태(켜기·동결·색 등)가 바뀌었으면(스타일 표만 다시 만들면 된다) */
  layersChanged: boolean;
  /** 배치가 생기거나 없어지거나 바뀌었으면(배치 탭·용지) */
  layoutsChanged?: boolean;
}

function invert(op: EditOp): EditOp {
  switch (op.kind) {
    case 'add':
      return { kind: 'remove', block: op.block, entity: op.entity, index: op.index ?? -1 };
    case 'remove':
      return { kind: 'add', block: op.block, entity: op.entity, index: op.index };
    case 'modify':
      return { kind: 'modify', block: op.block, before: op.after, after: op.before };
    case 'header':
      return { kind: 'header', name: op.name, before: op.after, after: op.before };
    default:
      return { ...op, before: op.after, after: op.before } as EditOp;
  }
}

export function inverseTransaction(tx: Transaction): Transaction {
  return { label: tx.label, ops: tx.ops.map(invert).reverse(), rebuildNow: tx.rebuildNow };
}

function indexEntity(doc: CadDocument, e: Entity, on: boolean): void {
  if (on) {
    if (e.handle) doc.entityIndex.set(e.handle, e);
    if (e.type === 'INSERT') for (const a of e.attribs) if (a.handle) doc.entityIndex.set(a.handle, a);
  } else {
    if (e.handle) doc.entityIndex.delete(e.handle);
    if (e.type === 'INSERT') for (const a of e.attribs) if (a.handle) doc.entityIndex.delete(a.handle);
  }
}

/**
 * 변경들을 차례로 적용하다 하나라도 실패하면 이미 적용한 것을 되돌리고 그 오류를 다시 던진다 — 문서가 반쯤 바뀐 채로 남지 않게
 * (명령 취소·다시 실행·확정이 실패해도 명령 취소 목록과 문서가 어긋나지 않는다)
 */
export function applyOpsAtomic(doc: CadDocument, ops: readonly EditOp[], summary?: ChangeSummary): void {
  // at.i = 적용하고 있는 변경의 자리(실패하면 그 앞까지 되돌린다)
  const at = { i: 0 };
  try {
    applyOps(doc, ops, summary, new EntityFinder(ops.length), at);
  } catch (err) {
    try {
      applyOps(doc, inverseTransaction({ label: '', ops: ops.slice(0, at.i) }).ops);
    } catch {
      /* 되돌리기도 실패하면 더 할 수 있는 것이 없다 */
    }
    throw err;
  }
}

/** 이만큼 많은 변경은 자리 표를 만들어 찾는다. 적은 변경은 그냥 훑는 쪽이 싸다 */
const FINDER_MIN_OPS = 64;
/** 자리 표를 다시 만드는 횟수. 더하기·지우기가 찾기와 번갈아 오면 표를 만드는 값이 더 커 그냥 훑는다 */
const FINDER_MAX_BUILDS = 4;
/**
 * 소유 블록을 찾다 기억한 자리가 이만큼 틀리면 표를 만든다(그때까지는 그냥 훑는다 — 몇 번만 찾는 작은 명령에는 표가 더 비싸다).
 * 빠른 길은 그 블록의 자리 표만, 옛 길(핸들이 겹친 문서)은 전체 표를 다시 만든다
 */
const OWNER_MISS_LIMIT = 16;
/** 빠른 길에서 소유 블록 기억에 적지 않고 미뤄 둔(객체를 넣은) 블록이 이보다 많으면 전체 표를 다시 만든다 */
const OWNER_PENDING_LIMIT = 8;

/** 블록마다 기억할 자리 옮김(OwnerStep) 수 */
const OWNER_STEP_LIMIT = 4;

/**
 * 확정 하나가 블록 하나에 한 자리 옮김(소유 블록 찾기 빠른 길): 앞자리부터 지운 옛 자리(오름차순)와 그 뒤 끝에 넣은 객체(from부터 added개).
 * 그 블록의 변경이 "자리가 줄어드는 차례의 지우기 → 끝에 넣기"(같은 핸들 바꾸기는 어디든)일 때만 남긴다(EXPLODE·ERASE·COPY의 확정 꼴 — app/modify.ts planResults).
 * 옛 자리 p의 새 자리는 p − (p보다 앞에서 지운 수)다. 기록이 틀려도(적용이 다른 자리를 지웠거나 세션 밖에서 바뀜) 답은 언제나 블록에서 확인하므로 맞고, 못 찾으면 자리 표로 간다
 */
interface OwnerStep {
  removed: Int32Array;
  from: number;
  added: number;
}

/** 블록 하나의 핸들 → 자리 표(소유 블록 찾기 빠른 길). list·len이 지금 블록과 다르면 낡은 표다 */
interface BlockSlots {
  list: readonly Entity[];
  len: number;
  /** 핸들 → 처음 자리(findIndex와 같은 답). 빗나감이 OWNER_MISS_LIMIT를 넘을 때 만든다 */
  at: Map<string, number> | null;
  misses: number;
}

/**
 * 변경 묶음 안에서 객체의 자리를 찾는다. 변경마다 블록을 훑으면 객체 20만 개를 옮길 때 200억 번을 비교해 화면이 멈춘다.
 * 표는 블록마다 처음 찾을 때 만들고, 맨 뒤가 아닌 자리에서 더하거나 지우면 버린다
 */
class EntityFinder {
  private readonly tables = new Map<BlockDef, Map<string, number>>();
  private builds = 0;

  constructor(private readonly ops: number) {}

  find(b: BlockDef, handle: string): number {
    if (this.ops < FINDER_MIN_OPS) return b.entities.findIndex((e) => e.handle === handle);
    let table = this.tables.get(b);
    if (!table) {
      if (this.builds >= FINDER_MAX_BUILDS) return b.entities.findIndex((e) => e.handle === handle);
      this.builds++;
      table = new Map();
      // 핸들이 겹치면 findIndex처럼 앞의 것
      for (let i = b.entities.length - 1; i >= 0; i--) table.set(b.entities[i]!.handle, i);
      this.tables.set(b, table);
    }
    return table.get(handle) ?? -1;
  }

  /** 자리 i의 핸들이 바뀌었다 */
  renamed(b: BlockDef, before: string, after: string, i: number): void {
    const table = this.tables.get(b);
    if (!table || before === after) return;
    table.delete(before);
    table.set(after, i);
  }

  /** 자리 i에 객체를 넣었다. 맨 뒤면 다른 객체의 자리는 그대로다. len = 넣은 뒤 블록 길이(묶어 넣을 때는 하나씩 넣었을 때의 길이) */
  added(b: BlockDef, handle: string, i: number, len = b.entities.length): void {
    const table = this.tables.get(b);
    if (!table) return;
    if (i < len - 1) this.tables.delete(b);
    else if (!table.has(handle)) table.set(handle, i);
  }

  /** 자리 i의 객체를 지웠다. 맨 뒤였으면 다른 객체의 자리는 그대로다. len = 지운 뒤 블록 길이 */
  removed(b: BlockDef, handle: string, i: number, len = b.entities.length): void {
    const table = this.tables.get(b);
    if (!table) return;
    if (i < len || table.get(handle) !== i) this.tables.delete(b);
    else table.delete(handle);
  }
}

type SpaceOf = (key: string) => { removed: Set<string>; changed: Entity[] } | null;
type RemoveOp = Extract<EditOp, { kind: 'remove' }>;
type AddOp = Extract<EditOp, { kind: 'add' }>;

/**
 * 같은 블록을 지우는 변경이 이어지고(ops[at.i]부터), 기억한 자리가 맞으며 자리가 줄어드는 차례면 앞의 지우기가 뒤 지우기의 자리를 밀지 않는다.
 * 그런 묶음은 블록을 한 번 훑어 한꺼번에 뺀다(99차 — 지우기마다 splice하면 그 뒤 객체를 모두 옮겨, 객체 42만 개 도면의 EXPLODE(지우기 14만 개)에서
 * 확정이 약 26초였다. 확정은 블록마다 뒤에서부터 지운다 — app/modify.ts planResults). 색인·알림은 하나씩 적용할 때와 같은 차례로 한다.
 * 묶었으면 at.i를 묶음의 마지막 변경으로 옮기고 참(두 개보다 적으면 묶지 않는다). 색인 빼기가 도중에 실패하면 블록을 그 변경까지 지운 상태로
 * 돌려 두고 at.i를 그 변경에 둔 채 다시 던진다(하나씩 적용하다 같은 변경에서 실패한 것과 같다)
 */
function removeRun(doc: CadDocument, b: BlockDef, ops: readonly EditOp[], at: { i: number }, space: SpaceOf, finder: EntityFinder): boolean {
  const k = at.i;
  const key = ops[k]!.kind === 'remove' ? (ops[k] as RemoveOp).block : '';
  const list = b.entities;
  let end = k;
  for (let prev = list.length; end < ops.length; end++) {
    const op = ops[end]!;
    if (op.kind !== 'remove' || op.block !== key) break;
    const i = op.index;
    if (!Number.isInteger(i) || i < 0 || i >= prev || list[i]!.handle !== op.entity.handle) break;
    prev = i;
  }
  if (end - k < 2) return false;
  // 가장 앞 자리부터 한 번 훑어 뺀다(뺀 객체는 실패할 때 되돌리려고 자리가 큰 것부터 둔다)
  const len0 = list.length;
  const out: Entity[] = [];
  let p = end - 1;
  let next = (ops[p] as RemoveOp).index;
  let w = next;
  for (let r = next; r < len0; r++) {
    if (r === next) {
      out.push(list[r]!);
      next = --p >= k ? (ops[p] as RemoveOp).index : -1;
      continue;
    }
    list[w++] = list[r]!;
  }
  list.length = w;
  out.reverse();
  let m = k;
  // 변경 요약의 공간 칸은 묶음에 하나다(처음 성공한 변경에서 찾는다 — 하나씩 할 때 처음 부르는 자리와 같다)
  let s: ReturnType<SpaceOf> | undefined;
  try {
    for (; m < end; m++) {
      const op = ops[m] as RemoveOp;
      finder.removed(b, op.entity.handle, op.index, len0 - (m - k) - 1);
      indexEntity(doc, op.entity, false);
      (s ??= space(key))?.removed.add(op.entity.handle);
    }
  } catch (err) {
    // m 뒤의 지우기는 아직 하지 않은 것으로: 자리가 작은 것부터 제자리에 다시 넣는다
    for (let j = end - 1; j > m; j--) list.splice((ops[j] as RemoveOp).index, 0, out[j - k]!);
    at.i = m;
    throw err;
  }
  at.i = end - 1;
  return true;
}

/**
 * 같은 블록에 넣는 변경이 이어지고 넣을 자리가 늘어나는 차례면(ops[at.i]부터), 뒤에 넣는 것이 앞에 넣은 것을 밀지 않으므로 넣을 자리가 곧 마지막 자리다.
 * 그런 묶음은 블록을 한 번 훑어 한꺼번에 넣는다(99차 — 명령 취소는 removeRun의 지우기를 자리가 늘어나는 차례로 다시 넣는다).
 * 나머지는 removeRun과 같다
 */
function addRun(doc: CadDocument, b: BlockDef, ops: readonly EditOp[], at: { i: number }, space: SpaceOf, finder: EntityFinder): boolean {
  const k = at.i;
  const key = ops[k]!.kind === 'add' ? (ops[k] as AddOp).block : '';
  const list = b.entities;
  const len0 = list.length;
  const idx: number[] = [];
  let end = k;
  for (let len = len0, prev = -1; end < ops.length; end++, len++) {
    const op = ops[end]!;
    if (op.kind !== 'add' || op.block !== key) break;
    const i = op.index === undefined || op.index < 0 || op.index > len ? len : op.index;
    if (!Number.isInteger(i) || i <= prev) break;
    idx.push(i);
    prev = i;
  }
  const n = end - k;
  if (n < 2) return false;
  // 뒤에서부터 채운다
  list.length = len0 + n;
  for (let w = len0 + n - 1, r = len0 - 1, p = n - 1; w >= idx[0]!; w--) {
    if (p >= 0 && w === idx[p]) list[w] = (ops[k + p--] as AddOp).entity;
    else list[w] = list[r--]!;
  }
  let m = k;
  let s: ReturnType<SpaceOf> | undefined;
  try {
    for (; m < end; m++) {
      const op = ops[m] as AddOp;
      finder.added(b, op.entity.handle, idx[m - k]!, len0 + (m - k) + 1);
      indexEntity(doc, op.entity, true);
      (s ??= space(key))?.changed.push(op.entity);
    }
  } catch (err) {
    // m 뒤에 넣은 것을 뺀다(자리가 큰 것부터)
    for (let j = n - 1; j > m - k; j--) list.splice(idx[j]!, 1);
    at.i = m;
    throw err;
  }
  at.i = end - 1;
  return true;
}

/** 정규화한 16진 핸들 글자(대문자, 앞 0 없음)의 다음 값. normalizeHandle(BigInt('0x' + h) + 1n)과 같다 */
function nextHandleText(h: string): string {
  let i = h.length - 1;
  while (i >= 0 && h.charCodeAt(i) === 70 /* F */) i--;
  if (i < 0) return '1' + '0'.repeat(h.length);
  const c = h.charCodeAt(i);
  return h.slice(0, i) + (c === 57 /* 9 */ ? 'A' : String.fromCharCode(c + 1)) + '0'.repeat(h.length - 1 - i);
}

/** 핸들이 같은 객체의 자리를 뒤에서부터 찾는다. 명령을 되돌릴 때는 더한 객체를 뒤에서부터 지운다 */
function lastIndexOfHandle(list: readonly Entity[], handle: string): number {
  for (let i = list.length - 1; i >= 0; i--) if (list[i]!.handle === handle) return i;
  return -1;
}

/**
 * 변경들을 차례로 문서에 적용한다(되돌릴 때는 inverse를 적용한다). at.i는 적용하고 있는 변경의 자리다(실패하면 그 변경에 머문다 — applyOpsAtomic).
 * 같은 블록을 지우거나 넣는 변경이 이어지면 묶어서 한 번에 한다(removeRun·addRun — 결과는 하나씩 적용한 것과 같다)
 */
export function applyOps(doc: CadDocument, ops: readonly EditOp[], summary?: ChangeSummary, finder = new EntityFinder(ops.length), at = { i: 0 }): void {
  const space: SpaceOf = (key: string) => {
    if (!summary) return null;
    // 블록 정의 안의 객체가 바뀌면 그 블록을 참조하는 곳을 다시 그려야 한다(블록 편집기에서는 그 블록도 공간처럼 덧그린다)
    if (!isLayoutBlock(key)) summary.blocksChanged = true;
    let s = summary.spaces.get(key);
    if (!s) {
      s = { removed: new Set(), changed: [] };
      summary.spaces.set(key, s);
    }
    return s;
  };
  for (; at.i < ops.length; at.i++) {
    const op = ops[at.i]!;
    switch (op.kind) {
      case 'add': {
        const b = doc.blocks.get(op.block);
        if (!b) throw new Error(`블록이 없습니다: ${op.block}`);
        if (addRun(doc, b, ops, at, space, finder)) break;
        const i = op.index === undefined || op.index < 0 || op.index > b.entities.length ? b.entities.length : op.index;
        b.entities.splice(i, 0, op.entity);
        finder.added(b, op.entity.handle, i);
        indexEntity(doc, op.entity, true);
        space(op.block)?.changed.push(op.entity);
        break;
      }
      case 'remove': {
        const b = doc.blocks.get(op.block);
        if (!b) break;
        if (removeRun(doc, b, ops, at, space, finder)) break;
        const h = op.entity.handle;
        let i = op.index >= 0 && b.entities[op.index]?.handle === h ? op.index : op.index < 0 ? lastIndexOfHandle(b.entities, h) : b.entities.findIndex((e) => e.handle === h);
        if (i < 0) i = b.entities.indexOf(op.entity);
        if (i >= 0) {
          b.entities.splice(i, 1);
          finder.removed(b, op.entity.handle, i);
        }
        indexEntity(doc, op.entity, false);
        space(op.block)?.removed.add(op.entity.handle);
        break;
      }
      case 'modify': {
        const b = doc.blocks.get(op.block);
        if (!b) break;
        const i = finder.find(b, op.before.handle);
        if (i >= 0) {
          b.entities[i] = op.after;
          finder.renamed(b, op.before.handle, op.after.handle, i);
        }
        indexEntity(doc, op.before, false);
        indexEntity(doc, op.after, true);
        const s = space(op.block);
        if (s) {
          s.removed.add(op.before.handle);
          s.changed.push(op.after);
        }
        break;
      }
      case 'layer':
        if (op.after) doc.layers.set(op.key, op.after);
        else doc.layers.delete(op.key);
        if (summary) {
          summary.layersChanged = true;
          // 선종류가 바뀌거나 도면층이 생기고 없어지면 선 무늬를 다시 만들어야 한다
          if (!op.before || !op.after || op.before.linetype !== op.after.linetype) summary.tablesChanged = true;
        }
        break;
      case 'linetype':
        if (op.after) doc.linetypes.set(op.key, op.after);
        else doc.linetypes.delete(op.key);
        if (summary) summary.tablesChanged = true;
        break;
      case 'textStyle':
        if (op.after) doc.textStyles.set(op.key, op.after);
        else doc.textStyles.delete(op.key);
        if (summary) summary.tablesChanged = true;
        break;
      case 'dimStyle':
        if (op.after) doc.dimStyles.set(op.key, op.after);
        else doc.dimStyles.delete(op.key);
        if (summary) summary.tablesChanged = true;
        break;
      case 'view':
        if (op.after) doc.views.set(op.key, op.after);
        else doc.views.delete(op.key);
        break;
      case 'ucs':
        if (op.after) doc.ucs.set(op.key, op.after);
        else doc.ucs.delete(op.key);
        break;
      case 'vports':
        doc.vports.splice(0, doc.vports.length, ...op.after);
        break;
      case 'blockDef': {
        // 다시 만든 블록이 같은 자리에 같은 핸들을 쓰면(치수 블록 — 86차) 색인에서 빼지 않고 아래에서 덮어 넣는다(블록 참조는 속성 때문에 전처럼 빼고 넣는다)
        const next = op.before && op.after ? op.after.entities : undefined;
        if (op.before)
          op.before.entities.forEach((e, i) => {
            const n = next?.[i];
            if (!n || n.handle !== e.handle || e.type === 'INSERT' || n.type === 'INSERT') indexEntity(doc, e, false);
          });
        if (op.after) {
          doc.blocks.set(op.key, op.after);
          for (const e of op.after.entities) indexEntity(doc, e, true);
        } else doc.blocks.delete(op.key);
        if (summary) summary.blocksChanged = true;
        break;
      }
      case 'blockRecord':
        if (op.after) doc.blockRecords.set(op.key, op.after);
        else doc.blockRecords.delete(op.key);
        break;
      case 'object':
        if (op.after) doc.objects.set(op.key, op.after);
        else doc.objects.delete(op.key);
        break;
      case 'tableHead':
        if (op.after) (doc.tableHeads ??= new Map()).set(op.key, op.after);
        else doc.tableHeads?.delete(op.key);
        break;
      case 'appId':
        if (op.after) doc.appIds.set(op.key, op.after);
        else doc.appIds.delete(op.key);
        break;
      case 'header':
        if (op.after === undefined) doc.header.delete(op.name);
        else doc.header.set(op.name, op.after);
        break;
      case 'layout': {
        const i = doc.layouts.findIndex((l) => tableKey(l.blockName) === op.key);
        if (op.after) {
          if (i >= 0) doc.layouts[i] = op.after;
          else doc.layouts.push(op.after);
          const obj = doc.objects.get(op.after.handle);
          if (obj?.type === 'LAYOUT') doc.objects.set(op.after.handle, { ...(obj as LayoutObject), layout: op.after });
        } else if (i >= 0) doc.layouts.splice(i, 1);
        doc.layouts.sort((a, b) => a.tabOrder - b.tabOrder);
        if (summary) summary.layoutsChanged = true;
        break;
      }
    }
  }
}

/** 모형·배치 공간 블록인지 */
export function isLayoutBlock(key: string): boolean {
  return /^\*(MODEL|PAPER)_SPACE/i.test(key);
}

export function emptySummary(): ChangeSummary {
  return { spaces: new Map(), blocksChanged: false, tablesChanged: false, layersChanged: false };
}

/** 객체가 들어 있는 블록 키 */
export function ownerBlockKey(doc: CadDocument, handle: string): string | null {
  for (const [k, b] of doc.blocks) if (b.entities.some((e) => e.handle === handle)) return k;
  return null;
}

/**
 * 편집 세션: 명령 하나 = 트랜잭션 하나. 되돌리기·다시 하기 목록을 가진다.
 */
export class EditSession {
  private readonly undoStack: Transaction[] = [];
  private readonly redoStack: Transaction[] = [];
  /** 저장한 뒤 바뀌었는지 */
  dirty = false;
  private savedDepth = 0;
  /**
   * 소유 블록 기억(핸들 → 블록 키)과 자리(핸들 → 블록 안의 자리). 자리는 편집으로 밀릴 수 있어 쓸 때 확인한다.
   *
   * 빠른 길(103차): 마지막 전체 표 만들기에서 핸들이 모두 하나씩이었던 문서. 핸들이 하나뿐이면 답(그 핸들이 든 블록과 자리)은 문서만으로 정해져,
   * 기억을 어떻게 고치든 확인을 거친 답은 옛 길과 같다. 그래서 확정은 넣은 객체마다 기억에 적지 않고 블록만 미뤄 두며(ownerPending),
   * 빗나간 자리는 최근 확정의 자리 옮김(ownerSteps — 지운 자리·끝에 넣은 범위)으로, 안 되면 그 블록의 자리 표(ownerSlots)로 찾는다
   * — 전체 표를 다시 만들지 않는다. 답은 모두 지금 블록에서 확인한 자리다.
   * 옛 길(ownerLegacy): 표를 만들 때 핸들이 겹치거나 빈 핸들이 둘 이상이었던 문서. 102차까지와 똑같이 한다(겹친 핸들의 답은 기억의 내력에 따라
   * 달라지므로 길을 바꾸면 답이 바뀔 수 있다). 한 번 옛 길이면 세션 끝까지 옛 길이다
   */
  private ownerCache: Map<string, string> | null = null;
  private ownerAt = new Map<string, number>();
  private ownerMisses = 0;
  private ownerLegacy = false;
  /** 빠른 길: 객체를 넣었으나 그 핸들을 기억에 적지 않은 블록(먼저 넣은 차례) */
  private readonly ownerPending: string[] = [];
  /** 빠른 길: 블록 키 → 자리 표. 확정이 그 블록에 넣거나 빼면 버린다 */
  private readonly ownerSlots = new Map<string, BlockSlots>();
  /** 빠른 길: 블록 키 → 최근 확정들의 자리 옮김(오래된 것부터, OWNER_STEP_LIMIT개까지). 꼴이 다른 확정이 오면 비운다 */
  private readonly ownerSteps = new Map<string, OwnerStep[]>();
  /** 빠른 길: ownerOf가 마지막으로 찾은 자리(ownerIndex가 쓴다) */
  private ownerLast = -1;
  /**
   * newHandle이 마지막으로 적은 $HANDSEED와 그 값. 머리말이 그대로면 다시 풀지 않는다
   * (77차 — 치수 1만 개를 옮기면 치수 블록 객체마다 불러 명령 하나에 10만 번이 넘었다)
   */
  private seedMemo: { seed: string; next: bigint } | null = null;

  constructor(
    readonly doc: CadDocument,
    /** 문서에 적용된 변경을 다른 쪽(화면·워커)에 알린다 */
    private readonly onApply: (tx: Transaction, summary: ChangeSummary) => void,
  ) {}

  /** 새 핸들($HANDSEED에서 하나씩) */
  newHandle(): string {
    const seed = this.doc.header.get('$HANDSEED');
    const memo = this.seedMemo;
    let next = 0n;
    // 머리말이 지난번에 적은 그대로면 그 글자가 곧 normalizeHandle(next)다. 다시 16진 글자로 바꾸지 않는다
    // (98차 — 연관 도면 COPY는 치수 블록 객체마다 불러 명령 하나에 15만 번, 한 번에 16진 글자 바꾸기 세 번이 COPY 명령 시간의 약 7%였다)
    let h0: string | undefined;
    if (memo && memo.seed === seed) {
      next = memo.next;
      h0 = memo.seed;
    } else
      try {
        next = BigInt('0x' + (typeof seed === 'string' && seed ? seed : '0'));
      } catch {
        next = 0n;
      }
    // 이미 쓰인 핸들과 겹치지 않게 한다. 두 색인이 HandleIndex이고 씨앗이 두 색인에 넣은 열쇠보다 모두 크면(core/handleindex.ts) 같은 열쇠가
    // 있을 수 없어 has를 부르지 않는다(100차 — 객체 42만 개 도면 EXPLODE는 새 핸들 약 124만 번, 두 has가 명령의 약 11%였다)
    h0 ??= normalizeHandle(next);
    let h = h0;
    const ix = this.doc.entityIndex;
    const objs = this.doc.objects;
    const fresh = ix instanceof HandleIndex && objs instanceof HandleIndex && ix.above(h0) && objs.above(h0);
    if (next === 0n || (!fresh && (ix.has(h0) || objs.has(h0)))) {
      let max = 0n;
      for (const h of this.doc.entityIndex.keys()) {
        try {
          const v = BigInt('0x' + h);
          if (v > max) max = v;
        } catch {
          /* 무시 */
        }
      }
      for (const h of this.doc.objects.keys()) {
        try {
          const v = BigInt('0x' + h);
          if (v > max) max = v;
        } catch {
          /* 무시 */
        }
      }
      for (const b of this.doc.blocks.values()) {
        for (const h of [b.handle, b.recordHandle, b.endHandle ?? '']) {
          if (!h) continue;
          try {
            const v = BigInt('0x' + h);
            if (v > max) max = v;
          } catch {
            /* 무시 */
          }
        }
      }
      if (next <= max) {
        next = max + 1n;
        h = normalizeHandle(next);
      }
    }
    const after = next + 1n;
    // h는 next를 정규화한 글자라 글자로 하나 늘리면 normalizeHandle(after)와 같다(99차 — 객체 42만 개 도면 EXPLODE는 새 핸들 약 124만 번, 16진 글자 바꾸기가 명령의 약 6.5%였다)
    const seed2 = nextHandleText(h);
    this.doc.header.set('$HANDSEED', seed2);
    if (memo) {
      memo.seed = seed2;
      memo.next = after;
    } else this.seedMemo = { seed: seed2, next: after };
    return h;
  }

  /** 블록 키(공간) */
  ownerOf(handle: string): string | null {
    if (!this.ownerCache) this.buildOwners();
    if (this.ownerLegacy) return this.ownerOfLegacy(handle);
    const owners = this.ownerCache!;
    const cached = owners.get(handle);
    const list = cached ? this.doc.blocks.get(cached)?.entities : undefined;
    if (cached && list) {
      // 기억한 자리가 맞으면 블록을 훑지 않는다. 훑으면 객체 20만 개를 옮길 때 이 확인이 200억 번 비교가 된다
      const at = this.ownerAt.get(handle) ?? -1;
      if (list[at]?.handle === handle) {
        this.ownerLast = at;
        return cached;
      }
      // 앞선 지우기·넣기로 자리가 밀렸다: 최근 확정의 자리 옮김으로, 안 되면 그 블록의 자리 표로
      // (103차 — 전에는 16번 빗나가면 모든 블록의 표를 다시 만들었다)
      let i = at >= 0 ? this.shiftedAt(cached, list, handle, at) : -1;
      if (i >= 0) this.ownerAt.set(handle, i);
      else i = this.slotOf(cached, list, handle);
      if (i >= 0) {
        this.ownerLast = i;
        return cached;
      }
    }
    // 확정이 넣고 기억에 적지 않은 객체: 미뤄 둔 블록에서(마지막 확정이 끝에 넣은 것이면 그 범위에서 핸들 차례로 찾는다)
    for (const k of this.ownerPending) {
      if (k === cached) continue;
      const pl = this.doc.blocks.get(k)?.entities;
      if (!pl) continue;
      let i = this.appendedAt(k, pl, handle);
      if (i < 0) i = this.slotOf(k, pl, handle);
      if (i >= 0) {
        this.ownerLast = i;
        return k;
      }
    }
    const k = ownerBlockKey(this.doc, handle);
    this.ownerLast = -1;
    if (k) {
      const i = this.doc.blocks.get(k)!.entities.findIndex((e) => e.handle === handle);
      owners.set(handle, k);
      this.ownerAt.set(handle, i);
      this.ownerLast = i;
    }
    return k;
  }

  /** 옛 길(102차까지 그대로 — 핸들이 겹친 문서) */
  private ownerOfLegacy(handle: string): string | null {
    if (!this.ownerCache) this.buildOwners();
    const cached = this.ownerCache!.get(handle);
    const list = cached ? this.doc.blocks.get(cached)?.entities : undefined;
    if (cached && list) {
      if (list[this.ownerAt.get(handle) ?? -1]?.handle === handle) return cached;
      // 앞선 지우기로 자리가 밀렸다. 많이 밀렸으면 표를 다시 만드는 쪽이 싸다
      if (++this.ownerMisses > OWNER_MISS_LIMIT) {
        this.buildOwners();
        return this.ownerOfLegacy(handle);
      }
      const at = list.findIndex((e) => e.handle === handle);
      if (at >= 0) {
        this.ownerAt.set(handle, at);
        return cached;
      }
    }
    const k = ownerBlockKey(this.doc, handle);
    if (k) {
      this.ownerCache!.set(handle, k);
      this.ownerAt.set(handle, this.doc.blocks.get(k)!.entities.findIndex((e) => e.handle === handle));
    }
    return k;
  }

  /**
   * 빠른 길: 블록 k(list)에서 handle의 처음 자리(없으면 -1). 답은 언제나 list에서 확인한 자리다.
   * 블록마다 빗나감이 OWNER_MISS_LIMIT를 넘으면 자리 표를 만들고(표에서 찾은 것은 기억에 적지 않는다), 표가 낡았으면(세션 밖에서 바뀜) 버리고 훑는다.
   * 훑어서 찾은 것은 기억에 적어 같은 핸들을 다시 찾을 때(명령은 ownerOf 뒤 ownerIndex를 부른다) 맞게 한다
   */
  private slotOf(k: string, list: readonly Entity[], handle: string): number {
    let s = this.ownerSlots.get(k);
    if (!s || s.list !== list || s.len !== list.length) {
      s = { list, len: list.length, at: null, misses: 0 };
      this.ownerSlots.set(k, s);
    }
    if (s.at) {
      const i = s.at.get(handle);
      if (i === undefined || list[i]?.handle === handle) return i ?? -1;
      // 길이는 같은데 자리가 달라졌다(세션 밖에서 바뀜): 표를 버린다
      s.at = null;
      s.misses = 0;
    } else if (++s.misses > OWNER_MISS_LIMIT) {
      // 처음 자리가 이기게 뒤에서부터 넣는다(findIndex와 같은 답)
      const at = new Map<string, number>();
      for (let i = list.length - 1; i >= 0; i--) at.set(list[i]!.handle, i);
      s.at = at;
      return at.get(handle) ?? -1;
    }
    const i = list.findIndex((e) => e.handle === handle);
    if (i >= 0) {
      this.ownerCache!.set(handle, k);
      this.ownerAt.set(handle, i);
    }
    return i;
  }

  /** 소유 블록 안의 자리(ownerOf가 확인한 값). 블록이 없으면 -1 */
  ownerIndex(handle: string): number {
    const k = this.ownerOf(handle);
    if (!k) return -1;
    return this.ownerLegacy ? (this.ownerAt.get(handle) ?? -1) : this.ownerLast;
  }

  private buildOwners(): void {
    const owners = new Map<string, string>();
    this.ownerAt.clear();
    this.ownerMisses = 0;
    this.ownerPending.length = 0;
    this.ownerSlots.clear();
    this.ownerSteps.clear();
    let named = 0;
    let unnamed = 0;
    for (const [k, b] of this.doc.blocks) {
      const list = b.entities;
      for (let i = 0; i < list.length; i++) {
        const h = list[i]!.handle;
        if (!h) {
          unnamed++;
          continue;
        }
        named++;
        owners.set(h, k);
        this.ownerAt.set(h, i);
      }
    }
    this.ownerCache = owners;
    // 핸들이 겹쳤으면(넣은 수보다 표가 작다) 옛 길로
    if (named !== owners.size || unnamed > 1) this.ownerLegacy = true;
  }

  /** 확정한 변경에 맞춰 소유 블록 기억을 고친다(applyOpsAtomic 뒤) */
  private noteOwners(ops: readonly EditOp[]): void {
    const owners = this.ownerCache;
    if (!owners) return;
    if (this.ownerLegacy) {
      // 소유 블록 기억: 같은 핸들을 제자리에서 바꾼 객체는 기억한 블록 그대로다(87차 — 연관 도면 MOVE의 바꾸기 3만 개마다 다시 넣었다)
      for (const op of ops) {
        if (op.kind === 'add') owners.set(op.entity.handle, op.block);
        else if (op.kind === 'modify' && op.after.handle !== op.before.handle) owners.set(op.after.handle, op.block);
      }
      return;
    }
    // 빠른 길: 넣은 객체마다 적지 않고 블록만 미뤄 둔다(103차 — 객체 42만 개 도면 EXPLODE는 넣기 124만 번, 그 기억이 명령의 약 14%였고
    // 다음 명령이 16번 빗나가 전체 표를 다시 만들면서 모두 버려졌다). 넣거나 뺀 블록의 자리 표는 버리고, 블록마다 자리 옮김을 남긴다
    const shapes = new Map<string, { removed: number[]; added: number; ok: boolean }>();
    let key = '';
    let cur: { removed: number[]; added: number; ok: boolean } | undefined;
    const shapeOf = (k: string) => {
      if (k !== key || !cur) {
        key = k;
        cur = shapes.get(k);
        if (!cur) shapes.set(k, (cur = { removed: [], added: 0, ok: true }));
      }
      return cur;
    };
    for (const op of ops) {
      if (op.kind === 'add') {
        const s = shapeOf(op.block);
        if (!s.added) {
          if (!this.ownerPending.includes(op.block)) this.ownerPending.push(op.block);
          this.ownerSlots.delete(op.block);
        }
        if (op.index !== undefined) s.ok = false;
        s.added++;
      } else if (op.kind === 'remove') {
        const s = shapeOf(op.block);
        if (!s.removed.length && !s.added) this.ownerSlots.delete(op.block);
        const i = op.index;
        const r = s.removed;
        // 지우기는 넣기 앞, 자리가 줄어드는 차례여야 앞의 지우기가 뒤 지우기의 자리를 밀지 않는다
        if (s.added || !Number.isInteger(i) || i < 0 || (r.length && i >= r[r.length - 1]!)) s.ok = false;
        r.push(i);
      } else if (op.kind === 'modify') {
        if (op.after.handle === op.before.handle) continue;
        owners.set(op.after.handle, op.block);
        this.ownerSlots.delete(op.block);
        shapeOf(op.block).ok = false;
      } else if (op.kind === 'blockDef') {
        this.ownerSlots.delete(op.key);
        shapeOf(op.key).ok = false;
      }
    }
    for (const [k, s] of shapes) {
      const len = this.doc.blocks.get(k)?.entities.length;
      if (!s.ok || len === undefined) {
        this.ownerSteps.delete(k);
        continue;
      }
      let steps = this.ownerSteps.get(k);
      if (!steps) this.ownerSteps.set(k, (steps = []));
      steps.push({ removed: Int32Array.from(s.removed).reverse(), from: len - s.added, added: s.added });
      if (steps.length > OWNER_STEP_LIMIT) steps.shift();
    }
    if (this.ownerPending.length > OWNER_PENDING_LIMIT) this.ownerCache = null;
  }

  /**
   * 빠른 길: 기억한 자리 p(어느 확정 앞의 것인지 모름)를 블록 k의 최근 자리 옮김으로 옮겨 handle이 든 지금 자리를 찾는다(없으면 -1).
   * 가장 최근 확정 하나부터 거슬러 올라가며 옮겨 보고, 맞는지는 블록에서 확인한다
   */
  private shiftedAt(k: string, list: readonly Entity[], handle: string, p: number): number {
    const steps = this.ownerSteps.get(k);
    if (!steps) return -1;
    for (let j = steps.length - 1; j >= 0; j--) {
      let q = p;
      for (let t = j; t < steps.length && q >= 0; t++) {
        const r = steps[t]!.removed;
        // q보다 앞에서 지운 수(이진 찾기). q 자리를 지웠으면 그 객체는 이 블록에서 빠졌다
        let lo = 0;
        let hi = r.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (r[mid]! < q) lo = mid + 1;
          else hi = mid;
        }
        q = r[lo] === q ? -1 : q - lo;
      }
      if (q >= 0 && list[q]?.handle === handle) return q;
    }
    return -1;
  }

  /**
   * 빠른 길: 블록 k의 마지막 확정이 끝에 넣은 범위에서 handle을 핸들 차례(길이, 같으면 글자 — 새 핸들은 늘어나는 차례로 낸다)로 찾는다(없으면 -1).
   * 범위가 그 차례가 아니면 못 찾을 뿐이고(자리 표로 간다), 찾은 자리는 핸들이 같은 것만 돌려준다
   */
  private appendedAt(k: string, list: readonly Entity[], handle: string): number {
    const steps = this.ownerSteps.get(k);
    const s = steps?.[steps.length - 1];
    if (!s || !s.added) return -1;
    let lo = s.from;
    let hi = Math.min(s.from + s.added, list.length);
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const m = list[mid]!.handle;
      if (m === handle) return mid;
      if (m.length < handle.length || (m.length === handle.length && m < handle)) lo = mid + 1;
      else hi = mid;
    }
    return -1;
  }

  /** UNDO 조정(C): 전체(기본)·하나·없음 */
  undoControl: 'all' | 'one' | 'none' = 'all';

  /** 명령 취소 목록의 맨 위 항목(UNDO 표식·그룹이 자리를 기억한다). 없으면 null */
  undoTop(): Transaction | null {
    return this.undoStack[this.undoStack.length - 1] ?? null;
  }

  /** 명령 취소 목록에서 그 항목의 자리(0부터). 이미 취소했거나 밀려났으면 -1 */
  undoIndex(tx: Transaction): number {
    return this.undoStack.lastIndexOf(tx);
  }

  /** 맨 위 항목이 이 묶음 번호이면 그 작업 수(명령 안에서 되돌릴 작업 수를 셀 때), 아니면 0 */
  opsInGroup(group: number): number {
    const top = this.undoStack[this.undoStack.length - 1];
    return top && top.group === group ? top.ops.length : 0;
  }

  /** 커밋 직전에 트랜잭션을 고치는 고리(주석 축척: 새 주석 객체에 축척 레코드 붙이기 등) */
  beforeCommit: ((tx: Transaction) => Transaction) | null = null;
  /** 커밋 뒤(적용·알림 다음) 부르는 고리(도면층 이전 기록, 연관 배열 경로 따라가기 등). 여기서 다시 커밋해도 된다 */
  afterCommit: ((tx: Transaction) => void) | null = null;

  commit(tx: Transaction): void {
    if (this.beforeCommit && tx.ops.length) tx = this.beforeCommit(tx);
    if (!tx.ops.length) return;
    const summary = emptySummary();
    applyOpsAtomic(this.doc, tx.ops, summary);
    this.noteOwners(tx.ops);
    const top = this.undoStack[this.undoStack.length - 1];
    if (tx.group !== undefined && top && top.group === tx.group) pushAll(top.ops, tx.ops);
    else {
      this.undoStack.push({ ...tx, ops: [...tx.ops] });
      // UNDO 조정(C) 하나·없음: 마지막 명령만 남긴다(없음은 명령 안의 단계 취소만 되고 U·UNDO는 거절한다)
      if (this.undoControl !== 'all' && this.undoStack.length > 1) {
        this.undoStack.splice(0, this.undoStack.length - 1);
        this.savedDepth = -1;
      }
    }
    if (this.undoStack.length > 500) this.undoStack.shift();
    this.redoStack.length = 0;
    this.dirty = true;
    this.onApply(tx, summary);
    this.afterCommit?.(tx);
  }

  /** 명령 안에서 마지막 단계만 되돌린다(LINE의 U 옵션 등). 되돌린 작업 수를 돌려준다 */
  undoLastStep(group: number, count: number): number {
    const top = this.undoStack[this.undoStack.length - 1];
    if (!top || top.group !== group || !count) return 0;
    const n = Math.min(count, top.ops.length);
    const ops = top.ops.slice(top.ops.length - n);
    const inv = inverseTransaction({ label: top.label, ops });
    const summary = emptySummary();
    applyOpsAtomic(this.doc, inv.ops, summary);
    top.ops.splice(top.ops.length - n, n);
    if (!top.ops.length) this.undoStack.pop();
    this.ownerCache = null;
    this.onApply(inv, summary);
    return n;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): Transaction | null {
    const tx = this.undoStack[this.undoStack.length - 1];
    if (!tx) return null;
    const inv = inverseTransaction(tx);
    const summary = emptySummary();
    // 되돌리기가 실패하면 문서는 그대로, 항목도 목록에 남는다(예전에는 항목을 먼저 꺼내 다시 실행도 못 했다)
    applyOpsAtomic(this.doc, inv.ops, summary);
    this.undoStack.pop();
    this.redoStack.push(tx);
    this.dirty = this.undoStack.length !== this.savedDepth;
    this.ownerCache = null;
    this.onApply(inv, summary);
    return tx;
  }

  redo(): Transaction | null {
    const tx = this.redoStack[this.redoStack.length - 1];
    if (!tx) return null;
    const summary = emptySummary();
    applyOpsAtomic(this.doc, tx.ops, summary);
    this.redoStack.pop();
    this.undoStack.push(tx);
    this.dirty = this.undoStack.length !== this.savedDepth;
    this.ownerCache = null;
    this.onApply(tx, summary);
    return tx;
  }

  /** depth(앞서 읽은 깊이) 뒤에 쌓인 명령 취소 항목을 하나로 합친다(스크립트 한 번 = 명령 취소 한 번). 합친 항목 수 */
  squashUndo(depth: number, label: string): number {
    const from = Math.max(0, Math.min(depth, this.undoStack.length));
    const n = this.undoStack.length - from;
    if (n < 2) return n;
    const items = this.undoStack.splice(from, n);
    const tx: Transaction = { label, ops: items.flatMap((t) => t.ops) };
    if (items.some((t) => t.rebuildNow)) tx.rebuildNow = true;
    this.undoStack.push(tx);
    if (this.savedDepth === from + n) this.savedDepth = from + 1;
    else if (this.savedDepth > from) this.savedDepth = -1;
    return n;
  }

  /** 명령 취소 기록 깊이(블록 편집기에서 변경을 버릴 때 쓴다) */
  get depth(): number {
    return this.undoStack.length;
  }

  markSaved(): void {
    this.savedDepth = this.undoStack.length;
    this.dirty = false;
  }
}

/** 객체를 깊이 복사한다(편집 전 상태 보관용) */
export function cloneEntity<T extends Entity>(e: T): T {
  // 평탄 좌표는 형식 배열이라 그대로 옮긴다(수 배열처럼 수를 하나씩 상자에 담지 않는다). structuredClone보다 빠른 복사(97차 — core/clone.ts)
  return cloneData(e);
}

export { tableKey };
