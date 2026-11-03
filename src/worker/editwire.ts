/**
 * 메인 → 워커 편집 전송 형식(protocol.ts의 edit). 워커는 지우는 객체와 바꾸기 전 객체에서 핸들(자리 찾기)과
 * 블록 참조 속성의 핸들(색인에서 빼기)만 쓴다(edit/session.ts applyOps). 그래서 지우기는 이어진 것끼리 핸들·자리 배열 하나로,
 * 바꾸기 전 객체는 핸들만 보낸다. 객체 본문을 통째로 보내면 선 20만 개를 지울 때 구조화 복제만 0.19초였다.
 */
import type { Entity } from '../core/model';
import type { EditOp } from '../edit/session';

/** 같은 블록에서 이어진 지우기(속성이 있는 블록 참조는 빼고) */
export interface RemoveRun {
  kind: 'removeRun';
  block: string;
  handles: string[];
  index: number[];
}

export type WireOp = EditOp | RemoveRun;

/** 워커가 지우는 객체에서 쓰는 것만 남긴 객체 */
function stub(e: Entity): Entity {
  if (e.type === 'INSERT' && e.attribs.length) return { type: 'INSERT', handle: e.handle, attribs: e.attribs.map((a) => ({ handle: a.handle })) } as unknown as Entity;
  return { type: e.type, handle: e.handle } as Entity;
}

/** 보낼 변경: 차례는 그대로 */
export function packOps(ops: readonly EditOp[]): WireOp[] {
  const out: WireOp[] = [];
  for (const op of ops) {
    if (op.kind === 'remove') {
      if (op.entity.type === 'INSERT' && op.entity.attribs.length) {
        out.push({ ...op, entity: stub(op.entity) });
        continue;
      }
      const last = out[out.length - 1];
      if (last?.kind === 'removeRun' && last.block === op.block) {
        last.handles.push(op.entity.handle);
        last.index.push(op.index);
      } else out.push({ kind: 'removeRun', block: op.block, handles: [op.entity.handle], index: [op.index] });
    } else if (op.kind === 'modify') out.push({ ...op, before: stub(op.before) });
    else out.push(op);
  }
  return out;
}

/** 받은 변경 → applyOps에 넘길 변경(지우는 객체는 핸들만 든 객체) */
export function unpackOps(ops: readonly WireOp[]): EditOp[] {
  const out: EditOp[] = [];
  for (const op of ops) {
    if (op.kind !== 'removeRun') {
      out.push(op);
      continue;
    }
    for (let i = 0; i < op.handles.length; i++) out.push({ kind: 'remove', block: op.block, entity: { handle: op.handles[i]! } as Entity, index: op.index[i]! });
  }
  return out;
}
