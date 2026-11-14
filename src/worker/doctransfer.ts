/**
 * 워커 → 메인 문서 보내기.
 *
 * 문서를 통째로 구조화 복제하면 수백만 객체에서 메인 스레드가 수 초~수십 초 멈춘다.
 * 그래서 객체가 많은 블록(대개 모형 공간)의 객체 목록은 빼고 나머지(표·블록·배치·사전 — "껍데기")만 구조화 복제로 보내고,
 * 뺀 객체는 묶음마다 codec으로 부호화해 따로 보낸다. 메인은 묶음을 받는 대로 풀어 붙이고, 끝에 핸들 색인을 다시 만든다.
 *
 * 핸들 색인(entityIndex)은 finalizeDocument처럼 블록 순서·객체 순서(블록 참조의 속성 포함)로 다시 만든다.
 * 워커 문서의 색인이 그 순서·그 객체와 꼭 같을 때만 이렇게 하고, 아니면 예전처럼 문서 전체를 구조화 복제한다.
 *
 * 비도형 객체(objects)가 많으면 그것도 codec으로 부호화해 껍데기와 같은 메시지로 보낸다(129차 — encodeObjects). 껍데기의 objects에는
 * 문서의 다른 곳과 같은 객체를 함께 쓰는 배치 객체만 남는다.
 */
import type { CadDocument, CadObject, Entity } from '../core/model';
import { ownEntityArrays } from '../core/f64pool';
import { HandleIndex } from '../core/handleindex';
import { Decoder, Encoder, type Encoded, type EncoderScratch, encodedTransfer, encoderScratch, releaseEncoded } from './codec';

/** 이보다 객체가 많은 블록만 따로 보낸다 */
const STREAM_MIN = 2000;
/** 한 묶음의 객체 수(메인에서 한 번에 푸는 시간이 수십 ms가 되게) */
const BATCH = 50000;
/**
 * 비도형 객체가 이만큼 많으면 부호화해 보낸다(129차). 적으면 모양마다 쓰기·만들기 함수를 짓는 값이 구조화 복제보다 크다
 * (실제 도면에서 객체 100여 개는 구조화 복제 약 0.6ms, 부호화·풀기 약 2ms)
 */
const OBJECTS_MIN = 1000;
/**
 * 비도형 객체를 부호화하기 전에 함께 쓰는 객체를 찾으려고 훑는 껍데기 나머지의 상한(비도형 객체 수의 배수). 넘으면 부호화하지 않는다
 * (훑는 값이 아낄 몫보다 커진다 — 실제 도면 417개에서 나머지/객체 수는 가운데 1.6, 8배를 넘는 도면은 6개)
 */
const REST_PER_OBJECT = 8;
/** 부호화한 비도형 객체 한 항목의 머리: 열쇠가 값의 handle과 같다 / 열쇠를 따로 적는다 / 껍데기에 남긴 객체(열쇠만) */
const OBJ_SAME = 0;
const OBJ_KEYED = 1;
const OBJ_KEPT = 2;

/** 따로 보내는 객체 묶음 하나 */
export interface DocPart {
  /** 블록 열쇠(doc.blocks의 키) */
  block: string;
  /** codec으로 부호화한 객체들 */
  enc?: Encoded;
  /** 부호화하지 못한 묶음은 그대로(구조화 복제) */
  entities?: Entity[];
}

/** 색인이 블록에서 다시 만든 것과 같은지(순서·객체 모두) */
function indexDerivable(doc: CadDocument): boolean {
  const it = doc.entityIndex.entries();
  const same = (e: Entity): boolean => {
    const n = it.next();
    return !n.done && n.value[0] === e.handle && n.value[1] === e;
  };
  for (const b of doc.blocks.values())
    for (const e of b.entities) {
      if (e.handle && !same(e)) return false;
      if (e.type === 'INSERT') for (const a of e.attribs) if (a.handle && !same(a)) return false;
    }
  return !!it.next().done;
}

/**
 * 구조화 복제로 보낼 블록의 평탄 좌표를 제 버퍼로 바꾼다. 읽을 때 덩어리에서 떼어 준 뷰를 그대로 보내면 덩어리 전체가 복사된다(core/f64pool.ts).
 * 묶음으로 보내는 큰 블록은 codec이 뷰의 바이트만 옮긴다
 */
function ownArrays(blocks: Iterable<{ entities: Entity[] }>): void {
  for (const b of blocks)
    for (const e of b.entities) {
      ownEntityArrays(e);
      if (e.type === 'INSERT') for (const a of e.attribs) ownEntityArrays(a);
    }
}

/**
 * 값 나무에서 구조화 복제가 따라가는 객체(일반 객체·배열·형식 배열·Map·Set)를 seen에 모은다. seen이 limit개를 넘으면 그만두고 false
 */
function collect(root: unknown, seen: Set<object>, limit: number): boolean {
  const stack: unknown[] = [root];
  while (stack.length) {
    const v = stack.pop();
    if (typeof v !== 'object' || v === null || seen.has(v)) continue;
    if (seen.size >= limit) return false;
    seen.add(v);
    if (ArrayBuffer.isView(v)) continue;
    if (Array.isArray(v)) for (let i = 0; i < v.length; i++) stack.push(v[i]);
    else if (v instanceof Map) for (const [k, x] of v) stack.push(k, x);
    else if (v instanceof Set) for (const x of v) stack.push(x);
    else for (const k of Object.keys(v)) stack.push((v as Record<string, unknown>)[k]);
  }
  return true;
}

/**
 * 껍데기의 비도형 객체(objects)를 차례대로 부호화한다(129차). 구조화 복제는 그 값(사용자 객체 수천~수만 개와 원본 본문 바이트 배열)을
 * 객체마다 속성 이름을 다시 읽어 되살리느라, 사용자 객체가 많은 R2018 도면에서는 문서 보내기·받기의 대부분이었다.
 * - 배치 객체(LAYOUT)는 껍데기의 objects에 남긴다: 그 layout은 doc.layouts의 같은 객체라 구조화 복제가 하나로 되살린다(항목은 열쇠만).
 * - codec은 같은 객체를 두 번 만나면 사본 둘을 만든다. 그래서 껍데기 나머지(남긴 배치 객체 포함)의 객체를 먼저 모으고, 부호화할 객체가 그중 하나이거나
 *   다른 비도형 객체와 같은 객체를 함께 쓰면 부호화하지 않는다(얼린 공유 객체는 codec이 한 번 보낸 안에서 함께 쓴다 — 큰 블록 묶음과 같다).
 * 부호화하지 않으면(객체가 적다·나머지가 너무 크다·함께 쓰는 객체·다루지 않는 값) null — 그때는 지금처럼 objects째 구조화 복제한다.
 * 돌려주는 껍데기는 objects만 남긴 배치 객체로 바꾼 얕은 사본이다(워커 문서는 그대로)
 */
function encodeObjects(shell: CadDocument, min: number, scratch?: EncoderScratch): { shell: CadDocument; enc: Encoded } | null {
  const objects = shell.objects;
  if (objects.size < min) return null;
  const kept = new Map<string, CadObject>();
  for (const [k, o] of objects) if (o.type === 'LAYOUT') kept.set(k, o);
  const out: CadDocument = { ...shell, objects: kept };
  const seen = new Set<object>();
  if (!collect(out, seen, objects.size * REST_PER_OBJECT)) return null;
  const enc = new Encoder(scratch, seen);
  for (const [k, o] of objects) {
    const ok = o.type === 'LAYOUT' ? enc.add(OBJ_KEPT) && enc.add(k) : o.handle === k ? enc.add(OBJ_SAME) && enc.add(o) : enc.add(OBJ_KEYED) && enc.add(k) && enc.add(o);
    if (!ok) return null;
  }
  return { shell: out, enc: enc.finish() };
}

/**
 * 문서를 메인으로 보낸다: post(껍데기 또는 문서 전체, 따로 보내는 블록과 객체 수, 부호화한 비도형 객체)를 먼저 부르고, 이어서 묶음마다 part를 부른다.
 * objects가 있으면 껍데기의 objects는 남긴 배치 객체뿐이고 메인이 receiveObjects로 합친다(옮길 버퍼는 encodedTransfer).
 * minEntities·batch·minObjects는 시험용.
 */
export function sendDocument(
  doc: CadDocument,
  post: (doc: CadDocument, streamed: [string, number][], objects?: Encoded) => void,
  part: (p: DocPart, transfer: Transferable[]) => void,
  onProgress?: (fraction: number) => void,
  opt: { minEntities?: number; batch?: number; minObjects?: number } = {},
): void {
  const min = opt.minEntities ?? STREAM_MIN;
  const size = opt.batch ?? BATCH;
  const minObjects = opt.minObjects ?? OBJECTS_MIN;
  const big = [...doc.blocks].filter(([, b]) => b.entities.length >= min);
  if (!big.length || !indexDerivable(doc)) {
    ownArrays(doc.blocks.values());
    const o = encodeObjects(doc, minObjects);
    if (o) post(o.shell, [], o.enc);
    else post(doc, []);
    return;
  }
  ownArrays([...doc.blocks.values()].filter((b) => b.entities.length < min));
  const scratch = encoderScratch();
  let shell: CadDocument = {
    ...doc,
    blocks: new Map([...doc.blocks].map(([k, b]) => [k, b.entities.length >= min ? { ...b, entities: [] } : b])),
    entityIndex: new Map(),
  };
  const o = encodeObjects(shell, minObjects, scratch);
  if (o) shell = o.shell;
  const total = big.reduce((a, [, b]) => a + b.entities.length, 0);
  post(
    shell,
    big.map(([k, b]) => [k, b.entities.length]),
    o?.enc,
  );
  let done = 0;
  for (const [key, b] of big) {
    const list = b.entities;
    for (let i = 0; i < list.length; i += size) {
      const end = Math.min(list.length, i + size);
      const enc = new Encoder(scratch);
      let ok = true;
      for (let j = i; j < end && ok; j++) ok = enc.add(list[j]);
      if (ok) {
        const e = enc.finish();
        part({ block: key, enc: e }, encodedTransfer(e));
      } else {
        // 부호화하지 못한 묶음은 구조화 복제로 보낸다(덩어리 뷰를 제 버퍼로 바꾼 뒤)
        const raw = list.slice(i, end);
        ownArrays([{ entities: raw }]);
        part({ block: key, entities: raw }, []);
      }
      done += end - i;
      onProgress?.(done / total);
    }
  }
}

/**
 * 메인: 받은 문서의 핸들 색인(entityIndex·objects)을 HandleIndex로 바꾼다(같은 열쇠·값·차례). 구조화 복제로 받은 색인은 일반 Map이라
 * 새 핸들이 쓰인 핸들인지 매번 찾아야 한다(core/handleindex.ts — 100차). 받자마자, 다른 곳이 색인을 쥐기 전에 부른다
 */
export function ownIndexes(doc: CadDocument): void {
  if (!(doc.entityIndex instanceof HandleIndex)) doc.entityIndex = HandleIndex.of(doc.entityIndex);
  if (!(doc.objects instanceof HandleIndex)) doc.objects = HandleIndex.of(doc.objects);
}

/**
 * 메인: 부호화해 받은 비도형 객체(encodeObjects)를 껍데기의 objects(남긴 배치 객체)와 워커 문서의 차례대로 합쳐 핸들 색인(HandleIndex)으로 둔다(129차).
 * 다 푼 뒤 받은 버퍼를 놓아 준다(객체의 바이트 배열은 제 버퍼로 복사돼 있다)
 */
export function receiveObjects(doc: CadDocument, enc: Encoded): void {
  const kept = doc.objects;
  const ix = new HandleIndex<CadObject>();
  const d = new Decoder(enc);
  while (d.more()) {
    const head = d.next();
    if (head === OBJ_SAME) {
      const o = d.next() as CadObject;
      ix.set(o.handle, o);
    } else if (head === OBJ_KEYED) {
      const k = d.next() as string;
      ix.set(k, d.next() as CadObject);
    } else if (head === OBJ_KEPT) {
      const k = d.next() as string;
      const o = kept.get(k);
      if (!o) throw new Error(`껍데기에 남긴 비도형 객체가 없습니다: ${k}`);
      ix.set(k, o);
    } else throw new Error('비도형 객체 부호화 자료가 올바르지 않습니다');
  }
  releaseEncoded(enc);
  doc.objects = ix;
}

/**
 * 메인: 'document' 메시지의 문서를 맞춘다 — 부호화한 비도형 객체를 합치고, 따로 오는 블록이 있으면 묶음을 붙일 DocAssembler를,
 * 없으면 핸들 색인을 바꾸고 null(문서가 다 왔다)을 돌려준다
 */
export function receiveDocument(doc: CadDocument, streamed: readonly [string, number][], objects?: Encoded): DocAssembler | null {
  if (objects) receiveObjects(doc, objects);
  if (streamed.length) return new DocAssembler(doc, streamed);
  ownIndexes(doc);
  return null;
}

/**
 * 메인: 껍데기와 묶음을 모아 문서를 되살린다. 핸들 색인은 finalizeDocument와 같은 순서(블록 순서 → 객체 순서, 블록 참조 뒤에 그 속성)로
 * 묶음이 오는 대로 조금씩 채운다(끝에 한꺼번에 수백만 개를 넣지 않게).
 */
export class DocAssembler {
  /** 따로 오는 블록 → 남은 객체 수 */
  private readonly waiting = new Map<string, number>();
  private readonly blocks: [string, { entities: Entity[] }][];
  /** 색인을 다 채운 블록 수(doc.blocks 순서)와 그다음 블록에서 색인에 넣은 객체 수 */
  private indexed = 0;
  private cursor = 0;

  constructor(
    readonly doc: CadDocument,
    streamed: readonly [string, number][],
  ) {
    for (const [k, n] of streamed) if (n > 0) this.waiting.set(k, n);
    this.blocks = [...doc.blocks];
    ownIndexes(doc);
    doc.entityIndex.clear();
    this.advance();
  }

  get complete(): boolean {
    return this.waiting.size === 0;
  }

  /**
   * 묶음 하나를 붙인다. 문서가 다 모였으면 true.
   * 부호화한 묶음은 다 푼 뒤 그 버퍼를 놓아 준다(96차 — 받은 메시지를 다시 쓰지 않는다. 객체의 형식 배열은 제 버퍼로 복사돼 있다)
   */
  add(p: DocPart): boolean {
    const b = this.doc.blocks.get(p.block);
    const left = this.waiting.get(p.block);
    if (!b || left === undefined) throw new Error(`기다리지 않는 블록 묶음입니다: ${p.block}`);
    const out = b.entities;
    const from = out.length;
    if (p.enc) {
      const d = new Decoder(p.enc);
      while (d.more()) out.push(d.next() as Entity);
      releaseEncoded(p.enc);
    } else if (p.entities) for (const e of p.entities) out.push(e);
    const rest = left - (out.length - from);
    if (rest > 0) this.waiting.set(p.block, rest);
    else this.waiting.delete(p.block);
    this.advance();
    return this.complete;
  }

  /** 받은 데까지 앞 블록부터 색인을 채운다(아직 받는 블록에서 멈춘다 — 묶음은 블록 순서대로 온다) */
  private advance(): void {
    const index = this.doc.entityIndex;
    while (this.indexed < this.blocks.length) {
      const [k, b] = this.blocks[this.indexed]!;
      const list = b.entities;
      for (let i = this.cursor; i < list.length; i++) {
        const e = list[i]!;
        if (e.handle) index.set(e.handle, e);
        if (e.type === 'INSERT') for (const a of e.attribs) if (a.handle) index.set(a.handle, a);
      }
      this.cursor = list.length;
      if (this.waiting.has(k)) return;
      this.indexed++;
      this.cursor = 0;
    }
  }
}
