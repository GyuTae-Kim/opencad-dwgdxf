/**
 * 지우거나 분해한 치수의 그림 블록(*D)을 저장 파일에서 뺀다(114차).
 *
 * 치수를 지워도 문서의 *D 블록은 남는다. 명령 취소·OOPS가 치수를 되살리면 그 블록을 다시 쓰기 때문이다. 그래서 문서는 그대로 두고 쓸 때만 뺀다.
 * 편집을 받는 워커가 지운 치수의 블록 이름을 모아 두고(noteRemovedDims), 저장할 때 그때도 아무도 쓰지 않는 것만 뺀다(withoutErasedDimBlocks).
 * 파일에서 읽은 *D는 쓰이지 않아 보여도 빼지 않는다 — 주석 축척 치수 레코드(DXF 2)만 쓰는 블록이 많고(실제 도면 840개의 *D 8,361개 가운데 1,253개),
 * 어디서도 쓰이지 않는 것도 어느 프로그램이 왜 남겼는지 알 수 없다.
 */
import { tableKey, type CadDocument, type GenericObject } from '../../core/model';
import type { EditOp } from '../session';

/** 치수 주석 축척 레코드(annoscale/context.ts의 DIM_CLASSES 여섯 종류) */
const DIM_RECORD = /^ACDB_[A-Z]*DIM[A-Z]*OBJECTCONTEXTDATA_CLASS$/;

/** 적용하기 전에 부른다: 이 작업들이 지울 치수의 *D 블록 열쇠를 into에 더한다(워커로 온 지우기 작업은 핸들만 있어 색인에서 찾는다) */
export function noteRemovedDims(doc: CadDocument, ops: readonly EditOp[], into: Set<string>): void {
  for (const op of ops) {
    if (op.kind !== 'remove') continue;
    const e = doc.entityIndex.get(op.entity.handle);
    if (e?.type === 'DIMENSION' && /^\*D/i.test(e.block ?? '')) into.add(tableKey(e.block));
  }
}

/** erased 가운데 어떤 객체·치수 레코드도 쓰지 않는 블록을 뺀 문서(얕은 복사). 뺄 것이 없으면 doc 그대로 */
export function withoutErasedDimBlocks(doc: CadDocument, erased: ReadonlySet<string>): CadDocument {
  const drop = new Set<string>();
  for (const k of erased) if (doc.blocks.has(k)) drop.add(k);
  if (!drop.size) return doc;
  for (const b of doc.blocks.values()) {
    for (const e of b.entities) {
      const ref = (e as { block?: unknown }).block;
      if (typeof ref === 'string' && ref) drop.delete(tableKey(ref));
    }
  }
  for (const o of doc.objects.values()) {
    if (!DIM_RECORD.test(o.type)) continue;
    const t = (o as GenericObject).raw?.find((r) => r.code === 2);
    if (t) drop.delete(tableKey(String(t.value).trim()));
  }
  if (!drop.size) return doc;
  const keep = <V>(m: Map<string, V>) => new Map([...m].filter(([k]) => !drop.has(k)));
  return { ...doc, blocks: keep(doc.blocks), blockRecords: keep(doc.blockRecords) };
}
