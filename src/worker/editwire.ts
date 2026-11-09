/**
 * 메인 → 워커 편집 전송 형식(protocol.ts의 edit). 워커는 지우는 객체와 바꾸기 전 객체에서 핸들(자리 찾기)과
 * 블록 참조 속성의 핸들(색인에서 빼기)만 쓴다(edit/session.ts applyOps). 그래서 지우기는 이어진 것끼리 핸들·자리 배열 하나로,
 * 바꾸기 전 객체는 핸들만 보낸다. 객체 본문을 통째로 보내면 선 20만 개를 지울 때 구조화 복제만 0.19초였다.
 * 블록 정의의 바꾸기 전 값은 객체 핸들만(색인에서 빼기), 사전 같은 객체의 바꾸기 전 값은 워커가 쓰지 않아 보내지 않는다(66차 — 연관 치수의 블록·DIMASSOC)
 * 바꾸기의 자리 짐작(index — 107차)은 그대로 보낸다: 워커 문서는 메인과 같은 변경을 같은 차례로 받아 블록 차례가 같으므로 워커도 자리 표 없이 쓰고,
 * 짐작을 쓸지(그 자리의 핸들이 같은지)도 두 문서에서 똑같이 정해진다
 */
import type { BlockDef, Entity } from '../core/model';
import type { EditOp } from '../edit/session';
import { Decoder, type Encoded, Encoder, type EncoderScratch } from './codec';

/** 같은 블록에서 이어진 지우기(속성이 있는 블록 참조는 빼고) */
export interface RemoveRun {
  kind: 'removeRun';
  block: string;
  handles: string[];
  index: number[];
}

export type WireOp = EditOp | RemoveRun;

/**
 * 워커가 지우는 객체에서 쓰는 것만 남긴 객체. 블록 참조는 속성이 없어도 빈 속성 배열을 둔다 — 색인에서 뺄 때 속성을 돌기 때문이다
 * (78차 — 전에는 속성 없는 블록 참조를 옮기거나 그런 참조가 든 치수 블록을 다시 만들면 워커의 applyOps가 그 작업에서 멈춰,
 * 워커 문서(다시 그리기와 저장에 쓴다)에 그 뒤의 작업이 빠졌다)
 */
function stub(e: Entity): Entity {
  if (e.type === 'INSERT') return { type: 'INSERT', handle: e.handle, attribs: e.attribs.map((a) => ({ handle: a.handle })) } as unknown as Entity;
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
    else if (op.kind === 'blockDef' && op.before) out.push({ ...op, before: { entities: op.before.entities.map(stub) } as unknown as BlockDef });
    else if (op.kind === 'object') out.push({ ...op, before: null });
    else out.push(op);
  }
  return out;
}

/**
 * 작업이 이만큼 많으면 묶음 부호화(codec.ts)로 보낸다(79차). 연관 도면 3만 개 MOVE의 작업(치수 블록 정의 1만 개 포함)을
 * postMessage로 보내면 메인의 직렬화가 Node 잰 값으로 306ms, 부호화는 185ms(문자열 표 복제 포함)이고 워커의 역직렬화 약 460ms가 되살리기 61ms가 된다.
 * 작은 편집은 부호화 준비가 더 들어 그대로 보낸다
 */
export const ENCODE_MIN_OPS = 256;

/** 보낼 변경을 묶음 부호화한다. 부호화할 수 없는 값이 있으면 null(그대로 보낸다) */
export function encodeWire(ops: readonly WireOp[], scratch?: EncoderScratch): Encoded | null {
  const enc = new Encoder(scratch);
  return enc.add(ops) ? enc.finish() : null;
}

/** encodeWire로 받은 변경 */
export function decodeWire(enc: Encoded): WireOp[] {
  return new Decoder(enc).next() as WireOp[];
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
