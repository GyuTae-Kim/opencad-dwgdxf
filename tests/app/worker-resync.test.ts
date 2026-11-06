/**
 * 80차: 워커가 편집을 적용하지 못하면 메인에 알리고(editFailed), 메인이 문서를 다시 보낼 때까지(replace) 그 문서의 편집을 버리고 저장을 거절한다.
 * 전에는 오류를 요청 번호 없이 보내 메인이 버렸고, 반쯤 적용된 워커 문서로 다시 그린 장면과 저장 파일이 화면의 도면과 어긋났다(78차 결함).
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MODEL_SPACE, type CadDocument } from '../../src/core/model';
import { EngineClient } from '../../src/app/engine';
import { readDxf } from '../../src/io/dxf/reader';
import type { EditOp } from '../../src/edit/session';
import { encodeWire, packOps } from '../../src/worker/editwire';
import type { FromWorker, ToWorker } from '../../src/worker/protocol';

const SAMPLE = readFileSync(new URL('../../public/samples/opencad-sample.dxf', import.meta.url));
const posted: FromWorker[] = [];
let send: (m: ToWorker) => Promise<void>;

beforeAll(async () => {
  // 워커 전역(self)을 흉내 내고 워커 모듈을 불러 onmessage를 직접 부른다
  const self = { postMessage: (m: FromWorker) => void posted.push(m) } as unknown as { onmessage: (ev: { data: ToWorker }) => Promise<void> };
  vi.stubGlobal('self', self);
  await import('../../src/worker/engine.worker');
  send = (m) => self.onmessage({ data: m });
});

afterEach(() => {
  posted.length = 0;
});

describe('워커 문서 다시 맞추기', () => {
  it('편집을 적용하지 못하면 알리고, 다시 받을 때까지 편집은 버리고 저장은 거절한다', async () => {
    const doc = readDxf(new Uint8Array(SAMPLE));
    await send({ type: 'adopt', id: 1, name: 't.dxf', doc: structuredClone(doc) });
    const docId = (posted.find((m) => m.type === 'scene') as Extract<FromWorker, { type: 'scene' }>).docId;
    const first = doc.blocks.get(MODEL_SPACE)!.entities[0]!;
    // 블록 참조를 속성 배열 없이 보낸 바꾸기(78차 전의 stub) — applyOps가 색인에서 빼다 멈춘다
    const broken = { kind: 'modify', block: MODEL_SPACE, before: { type: 'INSERT', handle: first.handle }, after: first } as never;
    posted.length = 0;
    await send({ type: 'edit', docId, ops: [broken] });
    expect(posted).toEqual([{ type: 'editFailed', docId, message: expect.stringContaining('attribs') }]);
    // 다시 받기 전의 편집은 버린다(또 알리지 않는다), 저장은 거절한다
    await send({ type: 'edit', docId, ops: [broken] });
    await send({ type: 'save', id: 2, docId, format: 'dxf', version: 'AC1032' });
    expect(posted.slice(1)).toEqual([{ type: 'error', id: 2, code: 'out_of_sync', message: expect.any(String) }]);
    // 메인 문서로 바꾸면 다시 저장된다
    await send({ type: 'replace', docId, doc: structuredClone(doc) });
    await send({ type: 'save', id: 3, docId, format: 'dxf', version: 'AC1032' });
    const saved = posted.find((m) => m.type === 'saved' && m.id === 3) as Extract<FromWorker, { type: 'saved' }>;
    expect(saved).toBeDefined();
    const back: CadDocument = readDxf(new Uint8Array(saved.data));
    expect(back.blocks.get(MODEL_SPACE)!.entities.length).toBe(doc.blocks.get(MODEL_SPACE)!.entities.length);
  });

  it('묶음 부호화한 편집(editEncoded)은 적용한 뒤 받은 버퍼를 놓아 준다(97차)', async () => {
    const doc = readDxf(new Uint8Array(SAMPLE));
    await send({ type: 'adopt', id: 4, name: 't.dxf', doc: structuredClone(doc) });
    const docId = (posted.find((m) => m.type === 'scene') as Extract<FromWorker, { type: 'scene' }>).docId;
    const list = doc.blocks.get(MODEL_SPACE)!.entities;
    expect(list.length).toBeGreaterThan(3);
    const ops: EditOp[] = list.map((e) => ({ kind: 'modify', block: MODEL_SPACE, before: e, after: { ...structuredClone(e), ltscale: 3 } }));
    const enc = encodeWire(packOps(ops))!;
    expect(enc.tags.byteLength).toBeGreaterThan(0);
    posted.length = 0;
    await send({ type: 'editEncoded', docId, enc });
    expect(posted).toEqual([]);
    // 받은 버퍼는 떼어 놓았다(ArrayBuffer.transfer가 있는 곳)
    for (const a of [enc.tags, enc.nums, enc.ints, enc.bins]) expect((a.buffer as ArrayBuffer & { detached?: boolean }).detached).toBe(true);
    // 편집은 워커 문서에 들어갔다
    await send({ type: 'save', id: 5, docId, format: 'dxf', version: 'AC1032' });
    const saved = posted.find((m) => m.type === 'saved' && m.id === 5) as Extract<FromWorker, { type: 'saved' }>;
    const back = readDxf(new Uint8Array(saved.data)).blocks.get(MODEL_SPACE)!.entities;
    expect(back.length).toBe(list.length);
    expect(back.every((e) => e.ltscale === 3)).toBe(true);
  });

  it('엔진은 editFailed를 앱에 넘기고, replace로 문서를 보낸다', () => {
    const postMessage = vi.fn();
    let worker: { onmessage?: (ev: { data: unknown }) => void } = {};
    vi.stubGlobal(
      'Worker',
      vi.fn(function () {
        worker = { postMessage } as typeof worker;
        return worker;
      }),
    );
    const client = new EngineClient('/fonts/');
    const failed = vi.fn();
    client.onEditFailed = failed;
    client.edit(4, []);
    worker.onmessage!({ data: { type: 'editFailed', docId: 4, message: 'boom' } });
    expect(failed).toHaveBeenCalledWith(4, 'boom');
    const doc = readDxf(new Uint8Array(SAMPLE));
    client.replace(4, doc);
    expect(postMessage.mock.calls.at(-1)).toEqual([{ type: 'replace', docId: 4, doc }, []]);
    vi.unstubAllGlobals();
  });
});
