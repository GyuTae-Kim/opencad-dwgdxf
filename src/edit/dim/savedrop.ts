/**
 * 지우거나 분해한 치수의 그림 블록(*D)을 저장 파일에서 뺀다(114차).
 *
 * 치수를 지워도 문서의 *D 블록은 남는다. 명령 취소·OOPS가 치수를 되살리면 그 블록을 다시 쓰기 때문이다. 그래서 문서는 그대로 두고 쓸 때만 뺀다.
 * 편집을 받는 워커가 지운 치수의 블록 이름을 모아 두고(noteRemovedDims), 저장할 때 그때도 아무도 쓰지 않는 것만 뺀다(withoutErasedDimBlocks).
 * 파일에서 읽은 *D는 쓰이지 않아 보여도 빼지 않는다 — 주석 축척 치수 레코드(DXF 2)만 쓰는 블록이 많고(실제 도면 840개의 *D 8,361개 가운데 1,253개),
 * 어디서도 쓰이지 않는 것도 어느 프로그램이 왜 남겼는지 알 수 없다.
 *
 * 115차: 지운 치수의 확장 사전과 그 아래 객체(주석 축척 레코드 등)도 저장에서 뺀다. DXF 쓰기는 소유 객체가 없는 객체를 이미 빼지만 DWG 쓰기는 그대로 써서
 * 소유자 없는 사전과 레코드가 파일에 남았고, 그 레코드가 *D를 붙잡고 있었다. 블록 정의를 통째로 지울 때 그 안의 치수도 같이 센다.
 */
import { normalizeHandle, tableKey, type CadDocument, type DictionaryObject, type Entity, type GenericObject } from '../../core/model';
import type { EditOp } from '../session';

/** 치수 주석 축척 레코드(annoscale/context.ts의 DIM_CLASSES 여섯 종류) */
const DIM_RECORD = /^ACDB_[A-Z]*DIM[A-Z]*OBJECTCONTEXTDATA_CLASS$/;

/**
 * 적용하기 전에 부른다: 이 작업들이 지울 치수의 *D 블록 열쇠를 into에, 치수 핸들을 dims에 더한다.
 * 워커로 온 작업에는 핸들만 있으므로(지우기의 객체, 블록 정의 지우기의 before) 문서에서 찾는다.
 */
export function noteRemovedDims(doc: CadDocument, ops: readonly EditOp[], into: Set<string>, dims?: Set<string>): void {
  const note = (e: Entity | undefined) => {
    if (e?.type !== 'DIMENSION') return;
    if (/^\*D/i.test(e.block ?? '')) into.add(tableKey(e.block));
    if (e.handle) dims?.add(normalizeHandle(e.handle));
  };
  for (const op of ops) {
    if (op.kind === 'remove') note(doc.entityIndex.get(op.entity.handle));
    else if (op.kind === 'blockDef' && op.before && !op.after) for (const e of doc.blocks.get(op.key)?.entities ?? []) note(e);
  }
}

/**
 * 아직 지워진 채인 치수가 소유한 객체(확장 사전과 그 아래 전부). 다른 사전의 항목인 객체는 DXF 쓰기처럼 소유자만 고쳐 살리므로 뺀다.
 * 명령 취소·OOPS로 되살아난 치수는 색인에 있어 세지 않는다.
 */
function objectsOfErasedDims(doc: CadDocument, dims: ReadonlySet<string> | undefined): Set<string> {
  const dead = new Set<string>();
  if (!dims?.size) return dead;
  const gone = new Set<string>();
  for (const h of dims) if (!doc.entityIndex.has(h)) gone.add(h);
  if (!gone.size) return dead;
  const children = new Map<string, string[]>();
  const dictRefs = new Set<string>();
  for (const [k, o] of doc.objects) {
    if (o.owner) {
      const owner = normalizeHandle(o.owner);
      const list = children.get(owner);
      if (list) list.push(k);
      else children.set(owner, [k]);
    }
    if (o.type === 'DICTIONARY' || o.type === 'ACDBDICTIONARYWDFLT') for (const h of (o as DictionaryObject).entries.values()) dictRefs.add(normalizeHandle(h));
  }
  const stack: string[] = [];
  for (const h of gone) for (const k of children.get(h) ?? []) if (!dictRefs.has(normalizeHandle(k))) stack.push(k);
  while (stack.length) {
    const k = stack.pop()!;
    if (dead.has(k)) continue;
    dead.add(k);
    for (const c of children.get(normalizeHandle(k)) ?? []) stack.push(c);
  }
  return dead;
}

/**
 * erased 가운데 어떤 객체·치수 레코드도 쓰지 않는 블록과 지운 치수가 소유한 객체를 뺀 문서(얕은 복사). 뺄 것이 없으면 doc 그대로.
 * 지운 치수의 레코드는 함께 빠지므로 그 레코드만 쓰는 블록도 뺀다.
 */
export function withoutErasedDimBlocks(doc: CadDocument, erased: ReadonlySet<string>, dims?: ReadonlySet<string>): CadDocument {
  const deadObjects = objectsOfErasedDims(doc, dims);
  const drop = new Set<string>();
  for (const k of erased) if (doc.blocks.has(k)) drop.add(k);
  if (drop.size) {
    for (const b of doc.blocks.values()) {
      for (const e of b.entities) {
        const ref = (e as { block?: unknown }).block;
        if (typeof ref === 'string' && ref) drop.delete(tableKey(ref));
      }
    }
    for (const [k, o] of doc.objects) {
      if (!DIM_RECORD.test(o.type) || deadObjects.has(k)) continue;
      const t = (o as GenericObject).raw?.find((r) => r.code === 2);
      if (t) drop.delete(tableKey(String(t.value).trim()));
    }
  }
  if (!drop.size && !deadObjects.size) return doc;
  const without = <V>(m: Map<string, V>, gone: ReadonlySet<string>) => (gone.size ? new Map([...m].filter(([k]) => !gone.has(k))) : m);
  return { ...doc, blocks: without(doc.blocks, drop), blockRecords: without(doc.blockRecords, drop), objects: without(doc.objects, deadObjects) };
}
