/**
 * 65차: 큰 선택 ERASE의 2.6초 내역(43~45차에 남긴 일).
 * 앱에서 재 보니(선 20만 개, 개발 서버) ERASE 한 번이 2.9초짜리 작업 하나였고, 그 가운데 약 2.3초는 OOPS가 ERASE를 감싸
 * 지운 객체마다 블록 안 자리를 indexOf로 찾는 일(객체 수의 제곱)이었다. 나머지 가장 큰 몫은 지운 객체 20만 개를 워커에 통째로 보내는 구조화 복제(0.19초)다.
 * 보장은 indexOf를 부르지 않는지, OOPS가 원래 자리에 되살리는지, 줄인 전송으로 워커 문서가 예전 전송과 같아지는지로 본다.
 */
import { describe, expect, it } from 'vitest';
import { MODEL_SPACE, entityDefaults, type AttribEntity, type CadDocument, type Entity, type InsertEntity, type LineEntity } from '../../src/core/model';
import { registerDrawCommands } from '../../src/app/draw';
import { registerUtil2MiscCommands } from '../../src/app/util2-misc';
import { type EditOp, applyOps, inverseTransaction } from '../../src/edit/session';
import { packOps, unpackOps } from '../../src/worker/editwire';
import { makeHarness } from '../cmds2/harness';
import { newDoc } from '../edit/make';

const lineAt = (i: number, handle: string): LineEntity => ({ ...entityDefaults(), type: 'LINE', handle, start: { x: i, y: 0, z: 0 }, end: { x: i, y: 1, z: 0 } });
const attrib = (handle: string, text: string): AttribEntity =>
  ({ ...entityDefaults(), type: 'ATTRIB', handle, insert: { x: 0, y: 0, z: 0 }, height: 1, text, rotation: 0, widthFactor: 1, oblique: 0, style: 'Standard', generation: 0, halign: 0, valign: 0, tag: 'T', attFlags: 0 }) as AttribEntity;
const insertWith = (handle: string, attribs: AttribEntity[]): InsertEntity =>
  ({ ...entityDefaults(), type: 'INSERT', handle, block: 'B', insert: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, rotation: 0, columnCount: 1, rowCount: 1, columnSpacing: 0, rowSpacing: 0, attribs }) as InsertEntity;

describe('OOPS가 감싼 ERASE', () => {
  function harness(n: number) {
    const h = makeHarness((doc) => {
      const ms = doc.blocks.get(MODEL_SPACE)!;
      for (let i = 0; i < n; i++) {
        const e = lineAt(i, (0x1000 + i).toString(16).toUpperCase());
        e.owner = ms.recordHandle;
        ms.entities.push(e);
        doc.entityIndex.set(e.handle, e);
      }
    });
    registerDrawCommands(h.app);
    (h.app as unknown as { findCommand: (n: string) => unknown }).findCommand ??= (name: string) => h.app.commands.get(name.toUpperCase());
    registerUtil2MiscCommands(h.app);
    return h;
  }

  it('지운 객체의 자리를 블록을 훑어 찾지 않는다(전에는 객체마다 indexOf — 선 20만 개 Node 5.8초)', async () => {
    const h = harness(2000);
    const list = h.doc.blocks.get(MODEL_SPACE)!.entities;
    let calls = 0;
    const own = list.indexOf;
    list.indexOf = function (this: Entity[], ...a: Parameters<Entity[]['indexOf']>) {
      calls++;
      return own.apply(this, a);
    };
    await h.run('ERASE', [{ sel: list.map((e) => e.handle) }]);
    expect(h.doc.blocks.get(MODEL_SPACE)!.entities).toHaveLength(0);
    expect(calls).toBe(0);
  });

  it('OOPS는 사이사이 지운 객체를 원래 자리에 되살린다', async () => {
    const h = harness(30);
    const before = h.doc.blocks.get(MODEL_SPACE)!.entities.map((e) => e.handle);
    const gone = before.filter((_, i) => i % 3 !== 1);
    await h.run('ERASE', [{ sel: gone }]);
    expect(h.doc.blocks.get(MODEL_SPACE)!.entities).toHaveLength(10);
    await h.run('OOPS', []);
    expect(h.doc.blocks.get(MODEL_SPACE)!.entities.map((e) => e.handle)).toEqual(before);
  });
});

describe('워커에 보내는 편집', () => {
  /** 모형 공간: 선 40개 + 속성 블록 참조 2개, 블록 B: 선 5개 */
  function base(): CadDocument {
    const doc = newDoc();
    const ms = doc.blocks.get(MODEL_SPACE)!;
    const add = (block: string, e: Entity) => {
      doc.blocks.get(block)!.entities.push(e);
      doc.entityIndex.set(e.handle, e);
      if (e.type === 'INSERT') for (const a of e.attribs) doc.entityIndex.set(a.handle, a);
    };
    doc.blocks.set('B', { name: 'B', handle: 'B0', recordHandle: 'B1', basePoint: { x: 0, y: 0, z: 0 }, flags: 0, entities: [] });
    for (let i = 0; i < 40; i++) add(MODEL_SPACE, lineAt(i, `L${i}`));
    add(MODEL_SPACE, insertWith('I1', [attrib('A1', 'x'), attrib('A2', 'y')]));
    add(MODEL_SPACE, insertWith('I2', [attrib('A3', 'z')]));
    for (let i = 0; i < 5; i++) add('B', lineAt(i, `BL${i}`));
    add('B', insertWith('BJ', [attrib('BK', 'p')]));
    doc.objects.set('D0', { type: 'DICTIONARY', handle: 'D0', owner: '0', entries: new Map([['A', 'L2']]) } as never);
    void ms;
    return doc;
  }
  const state = (doc: CadDocument) => ({
    blocks: [...doc.blocks].map(([k, b]) => [k, b.name, b.entities.map((e) => JSON.stringify(e))]),
    index: [...doc.entityIndex.keys()].sort(),
    objects: [...doc.objects].map(([k, o]) => [k, JSON.stringify(o)]).sort(),
  });

  /** ERASE처럼 뒤에서부터 지우기, 속성 블록 참조 지우기, 다른 블록의 지우기, 속성이 바뀌는 바꾸기, 더하기를 섞은 변경 */
  function edits(doc: CadDocument): EditOp[] {
    const ms = doc.blocks.get(MODEL_SPACE)!.entities;
    const ops: EditOp[] = [];
    for (let i = 30; i >= 10; i--) ops.push({ kind: 'remove', block: MODEL_SPACE, entity: ms[i]!, index: i });
    const i1 = ms.findIndex((e) => e.handle === 'I1');
    const i2 = ms.findIndex((e) => e.handle === 'I2');
    ops.push({ kind: 'modify', block: MODEL_SPACE, before: ms[i2]!, after: insertWith('I2', [attrib('A4', 'w')]) });
    // 앞에서 21개를 지웠으므로 그만큼 당겨진 자리(ERASE처럼 지울 때의 자리)
    ops.push({ kind: 'remove', block: MODEL_SPACE, entity: ms[i1]!, index: i1 - 21 });
    ops.push({ kind: 'remove', block: MODEL_SPACE, entity: ms[3]!, index: 3 });
    const b = doc.blocks.get('B')!.entities;
    ops.push({ kind: 'remove', block: 'B', entity: b[4]!, index: 4 }, { kind: 'remove', block: 'B', entity: b[0]!, index: 0 });
    ops.push({ kind: 'add', block: MODEL_SPACE, entity: lineAt(99, 'N1') });
    ops.push({ kind: 'modify', block: MODEL_SPACE, before: ms[0]!, after: { ...lineAt(0, 'L0'), layer: 'X' } as Entity });
    // 블록 정의를 통째로 바꾸고(치수 블록을 다시 만들 때처럼) 사전을 만들고 바꾼다. 바꾸기 전 값은 그때의 블록(앞에서 BL0·BL4를 지웠다)
    const blk = doc.blocks.get('B')!;
    const cur = { ...blk, entities: blk.entities.filter((e) => e.handle !== 'BL0' && e.handle !== 'BL4') };
    ops.push({ kind: 'blockDef', key: 'B', before: cur, after: { ...blk, entities: [lineAt(7, 'BN1'), insertWith('BI', [attrib('BA', 'q')])] } });
    ops.push({ kind: 'object', key: 'D1', before: null, after: { type: 'DICTIONARY', handle: 'D1', owner: '0', entries: new Map([['K', 'L1']]) } as never });
    ops.push({ kind: 'object', key: 'D0', before: doc.objects.get('D0')!, after: { ...doc.objects.get('D0')!, entries: new Map() } as never });
    return ops;
  }

  it('핸들만 보낸 지우기와 바꾸기 전 객체로도 워커 문서가 예전 전송(객체 통째)과 같아진다(되돌리기 포함)', () => {
    const doc = base();
    const ops = edits(doc);
    const old = structuredClone(doc);
    const now = structuredClone(doc);
    applyOps(old, structuredClone(ops));
    applyOps(now, unpackOps(structuredClone(packOps(ops))));
    expect(state(now)).toEqual(state(old));
    // 명령 취소: 메인 문서의 객체로 만든 되돌리기 변경
    const undo = inverseTransaction({ label: 'T', ops }).ops;
    applyOps(old, structuredClone(undo));
    applyOps(now, unpackOps(structuredClone(packOps(undo))));
    expect(state(now)).toEqual(state(old));
    expect(state(now)).toEqual(state(doc));
  });

  it('이어진 지우기는 핸들·자리 배열 하나로 보낸다(속성 블록 참조와 다른 블록은 끊는다)', () => {
    const doc = base();
    const wire = packOps(edits(doc));
    expect(wire.map((o) => (o.kind === 'removeRun' ? `run ${o.block === MODEL_SPACE ? 'M' : o.block} ${o.handles.length}` : o.kind))).toEqual(['run M 21', 'modify', 'remove', 'run M 1', 'run B 2', 'add', 'modify', 'blockDef', 'object', 'object']);
    // 블록 정의의 바꾸기 전 값은 객체 핸들만, 객체의 바꾸기 전 값은 보내지 않는다
    const bd = wire[7] as Extract<EditOp, { kind: 'blockDef' }>;
    expect(bd.before).toEqual({ entities: [...['BL1', 'BL2', 'BL3'].map((handle) => ({ type: 'LINE', handle })), { type: 'INSERT', handle: 'BJ', attribs: [{ handle: 'BK' }] }] });
    expect((wire[9] as Extract<EditOp, { kind: 'object' }>).before).toBeNull();
    // 지우는 객체 본문을 보내지 않는다
    const remove = wire[2] as Extract<EditOp, { kind: 'remove' }>;
    expect(remove.entity).toEqual({ type: 'INSERT', handle: 'I1', attribs: [{ handle: 'A1' }, { handle: 'A2' }] });
    expect((wire[1] as Extract<EditOp, { kind: 'modify' }>).before).toEqual({ type: 'INSERT', handle: 'I2', attribs: [{ handle: 'A3' }] });
  });
});
