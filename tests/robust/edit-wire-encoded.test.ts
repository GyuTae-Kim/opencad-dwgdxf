/**
 * 79차: 큰 편집은 워커에 묶음 부호화(codec.ts)로 보낸다(editwire.ts encodeWire). 연관 도면 3만 개 MOVE의 작업을 postMessage로 보내면
 * 메인의 직렬화가 Node 잰 값으로 306ms, 부호화는 185ms(문자열 표 복제 포함)였다. 보장은 받은 작업과 워커 문서가 구조화 복제로 보낸 것과 같은지,
 * 작은 편집은 그대로 보내는지로 본다.
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MODEL_SPACE, type CadDocument } from '../../src/core/model';
import { EngineClient } from '../../src/app/engine';
import { registerDrawCommands } from '../../src/app/draw';
import { registerModifyCommands } from '../../src/app/modify';
import { applyOps, inverseTransaction, type EditOp } from '../../src/edit/session';
import { readDxf } from '../../src/io/dxf/reader';
import { ENCODE_MIN_OPS, decodeWire, encodeWire, packOps, unpackOps } from '../../src/worker/editwire';
import { makeHarness } from '../cmds2/harness';
import { runWith } from '../drawmod/ctx';
import { perCommandGroups } from '../drawmod/groups';

const SAMPLE = readFileSync(new URL('../../public/samples/opencad-sample.dxf', import.meta.url));
const load = () => readDxf(new Uint8Array(SAMPLE));

/** 견본 도면 전체를 명령으로 편집한 작업(치수·해치·블록 참조·여러 줄 문자·다중 지시선이 섞인다) */
async function opsOf(cmd: string, inputs: (hs: string[]) => never[]): Promise<EditOp[]> {
  const h = perCommandGroups(makeHarness((doc) => void Object.assign(doc, load())));
  registerDrawCommands(h.app);
  registerModifyCommands(h.app);
  await runWith(h, cmd, inputs(h.doc.blocks.get(MODEL_SPACE)!.entities.map((e) => e.handle)));
  return h.st.session.undoTop()!.ops;
}

const state = (doc: CadDocument) => ({
  blocks: [...doc.blocks].map(([k, b]) => [k, b.name, b.entities.map((e) => JSON.stringify(e))]),
  index: [...doc.entityIndex.keys()].sort(),
  objects: [...doc.objects].map(([k, o]) => [k, JSON.stringify(o, (_, v) => (v instanceof Map ? [...v] : v))]).sort(),
});

afterEach(() => vi.unstubAllGlobals());

describe('묶음 부호화로 보내는 편집', () => {
  it('MOVE·COPY·MIRROR의 작업을 부호화해 되살리면 구조화 복제와 같고, 워커 문서도 같아진다(되돌리기 포함)', async () => {
    for (const [cmd, inputs] of [
      ['MOVE', (hs: string[]) => [{ sel: hs }, '0,0', '10,10']],
      ['COPY', (hs: string[]) => [{ sel: hs }, '0,0', '10,10', '']],
      ['MIRROR', (hs: string[]) => [{ sel: hs }, '0,0', '0,10', 'Y']],
    ] as const) {
      const ops = await opsOf(cmd, inputs as never);
      const wire = packOps(ops);
      const enc = encodeWire(wire)!;
      expect(enc).not.toBeNull();
      const back = decodeWire(structuredClone(enc));
      expect(back).toEqual(structuredClone(wire));
      const doc = load();
      const viaClone = structuredClone(doc);
      const viaCodec = structuredClone(doc);
      applyOps(viaClone, unpackOps(structuredClone(wire)));
      applyOps(viaCodec, unpackOps(back));
      expect(state(viaCodec)).toEqual(state(viaClone));
      const undo = packOps(inverseTransaction({ label: cmd, ops }).ops);
      applyOps(viaClone, unpackOps(structuredClone(undo)));
      applyOps(viaCodec, unpackOps(decodeWire(encodeWire(undo)!)));
      expect(state(viaCodec)).toEqual(state(viaClone));
    }
  });

  it(`엔진은 작업이 ${ENCODE_MIN_OPS}개 이상이면 버퍼를 옮기는 editEncoded로, 적으면 edit로 보낸다`, async () => {
    const postMessage = vi.fn();
    vi.stubGlobal(
      'Worker',
      vi.fn(function () {
        return { postMessage };
      }),
    );
    const client = new EngineClient('/fonts/');
    const ops = await opsOf('COPY', ((hs: string[]) => [{ sel: hs }, '0,0', '10,10', '']) as never);
    const many: EditOp[] = [];
    while (many.length < ENCODE_MIN_OPS) many.push(...ops);
    client.edit(7, ops.slice(0, 3));
    client.edit(7, many);
    const [small, big] = postMessage.mock.calls.slice(-2) as [[{ type: string; ops?: unknown[] }, unknown[]?], [{ type: string; docId: number; enc: Parameters<typeof decodeWire>[0] }, ArrayBuffer[]]];
    expect([small[0].type, small[0].ops?.length]).toEqual(['edit', 3]);
    expect([big[0].type, big[0].docId, big[1].length]).toEqual(['editEncoded', 7, 4]);
    expect(decodeWire(big[0].enc)).toEqual(structuredClone(packOps(many)));
    // 작업 버퍼는 다음 큰 편집에 다시 쓴다(64MiB 안이면)
    const scratch = (client as unknown as { editScratch?: object }).editScratch;
    expect(scratch).toBeDefined();
    client.edit(7, many);
    expect((client as unknown as { editScratch?: object }).editScratch).toBe(scratch);
  });
});
