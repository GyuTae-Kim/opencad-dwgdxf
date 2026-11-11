/**
 * 114차: 지우거나 분해한 치수의 그림 블록(*D)이 저장 파일에 남던 일. 치수를 지워도 문서의 블록은 명령 취소·OOPS를 위해 남겨 두므로
 * 저장할 때만 뺀다. 이 세션에서 지운 치수의 블록 가운데 저장할 때 아무도 쓰지 않는 것만 빠져야 한다.
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MODEL_SPACE, tableKey, type BlockDef, type CadDocument, type DimensionEntity, type GenericObject } from '../../src/core/model';
import { dimensionBlockOps } from '../../src/app/dimcmds';
import { registerDrawCommands } from '../../src/app/draw';
import { registerModifyCommands } from '../../src/app/modify';
import { DIM_CLASSES } from '../../src/edit/annoscale/context';
import { createLinearDimension } from '../../src/edit/dim';
import { noteRemovedDims, withoutErasedDimBlocks } from '../../src/edit/dim/savedrop';
import { inverseTransaction, type EditOp } from '../../src/edit/session';
import { readDxf } from '../../src/io/dxf/reader';
import { packOps } from '../../src/worker/editwire';
import type { FromWorker, ToWorker } from '../../src/worker/protocol';
import { makeHarness } from '../cmds2/harness';
import { perCommandGroups } from '../drawmod/groups';

const SAMPLE = readFileSync(new URL('../../public/samples/opencad-sample.dxf', import.meta.url));
const load = (): CadDocument => readDxf(new Uint8Array(SAMPLE));
const dimsOf = (doc: CadDocument) => doc.blocks.get(MODEL_SPACE)!.entities.filter((e): e is DimensionEntity => e.type === 'DIMENSION');
const removeOps = (doc: CadDocument, dims: DimensionEntity[]): EditOp[] => {
  const list = doc.blocks.get(MODEL_SPACE)!.entities;
  return dims.map((entity) => ({ kind: 'remove', block: MODEL_SPACE, entity, index: list.indexOf(entity) }));
};
const starD = (doc: CadDocument) => [...doc.blocks.keys()].filter((k) => /^\*D/.test(k));

describe('지운 치수의 *D 블록(문서 함수)', () => {
  it('아무도 쓰지 않는 블록만 빼고, 문서는 그대로 둔다', () => {
    const doc = load();
    const [gone] = dimsOf(doc);
    const key = tableKey(gone!.block);
    const erased = new Set<string>();
    noteRemovedDims(doc, removeOps(doc, [gone!]), erased);
    expect([...erased]).toEqual([key]);
    // 아직 치수가 문서에 있으면 빼지 않는다
    expect(withoutErasedDimBlocks(doc, erased)).toBe(doc);
    const list = doc.blocks.get(MODEL_SPACE)!.entities;
    list.splice(list.indexOf(gone!), 1);
    const out = withoutErasedDimBlocks(doc, erased);
    expect(out).not.toBe(doc);
    expect(out.blocks.has(key)).toBe(false);
    expect(out.blockRecords.has(key)).toBe(false);
    expect(out.blocks.size).toBe(doc.blocks.size - 1);
    // 원래 문서는 그대로(명령 취소·OOPS가 쓴다)
    expect(doc.blocks.has(key)).toBe(true);
    expect(doc.blockRecords.has(key)).toBe(true);
  });

  it('다른 치수가 같은 블록을 쓰면 남긴다', () => {
    const doc = load();
    const [a, b] = dimsOf(doc);
    b!.block = a!.block;
    const list = doc.blocks.get(MODEL_SPACE)!.entities;
    list.splice(list.indexOf(a!), 1);
    expect(withoutErasedDimBlocks(doc, new Set([tableKey(a!.block)]))).toBe(doc);
  });

  it('주석 축척 치수 레코드(DXF 2)가 쓰는 블록은 남긴다', () => {
    const doc = load();
    const [a] = dimsOf(doc);
    const list = doc.blocks.get(MODEL_SPACE)!.entities;
    list.splice(list.indexOf(a!), 1);
    const key = tableKey(a!.block);
    const rec = { type: 'ACDB_ALDIMOBJECTCONTEXTDATA_CLASS', handle: 'FFF0', raw: [{ code: 2, value: `${a!.block} ` }] } as unknown as GenericObject;
    doc.objects.set(rec.handle, rec);
    expect(withoutErasedDimBlocks(doc, new Set([key]))).toBe(doc);
    doc.objects.delete(rec.handle);
    expect(withoutErasedDimBlocks(doc, new Set([key])).blocks.has(key)).toBe(false);
  });

  it('치수 레코드 여섯 종류를 모두 알아본다', () => {
    const doc = load();
    const [a] = dimsOf(doc);
    const list = doc.blocks.get(MODEL_SPACE)!.entities;
    list.splice(list.indexOf(a!), 1);
    const key = tableKey(a!.block);
    expect(Object.keys(DIM_CLASSES)).toHaveLength(6);
    for (const type of Object.keys(DIM_CLASSES)) {
      const rec = { type, handle: 'FFF1', raw: [{ code: 2, value: a!.block }] } as unknown as GenericObject;
      doc.objects.set(rec.handle, rec);
      expect(withoutErasedDimBlocks(doc, new Set([key]))).toBe(doc);
    }
    doc.objects.delete('FFF1');
  });

  it('이번에 지우지 않은 쓰이지 않는 *D(파일에서 온 것)는 빼지 않는다', () => {
    const doc = load();
    const [a, b] = dimsOf(doc);
    const list = doc.blocks.get(MODEL_SPACE)!.entities;
    list.splice(list.indexOf(a!), 1);
    list.splice(list.indexOf(b!), 1);
    const out = withoutErasedDimBlocks(doc, new Set([tableKey(a!.block)]));
    expect(out.blocks.has(tableKey(a!.block))).toBe(false);
    expect(out.blocks.has(tableKey(b!.block))).toBe(true);
  });
});

describe('지운 치수가 소유한 객체(115차)', () => {
  /** 치수 하나에 확장 사전 → 관리자 사전 → 주석 축척 레코드를 달아 준다 */
  const attach = (doc: CadDocument, dim: DimensionEntity, n: number) => {
    const xdict = `AA${n}0`;
    const mgr = `AA${n}1`;
    const rec = `AA${n}2`;
    dim.xdict = xdict;
    const dict = (handle: string, owner: string, entries: [string, string][]) => ({ type: 'DICTIONARY', handle, owner, entries: new Map(entries), hardOwner: false, cloning: 1 }) as unknown as GenericObject;
    doc.objects.set(xdict, dict(xdict, dim.handle, [['AcDbContextDataManager', mgr]]));
    doc.objects.set(mgr, dict(mgr, xdict, [['*A1', rec]]));
    doc.objects.set(rec, { type: 'ACDB_ALDIMOBJECTCONTEXTDATA_CLASS', handle: rec, owner: mgr, raw: [{ code: 2, value: dim.block }] } as unknown as GenericObject);
    return [xdict, mgr, rec];
  };
  const erase = (doc: CadDocument, dim: DimensionEntity) => {
    const list = doc.blocks.get(MODEL_SPACE)!.entities;
    list.splice(list.indexOf(dim), 1);
    doc.entityIndex.delete(dim.handle);
  };

  it('지운 치수의 확장 사전과 그 아래 레코드를 빼고, 그 레코드만 쓰던 블록도 뺀다', () => {
    const doc = load();
    const [a] = dimsOf(doc);
    const handles = attach(doc, a!, 1);
    const key = tableKey(a!.block);
    const size = doc.objects.size;
    erase(doc, a!);
    const out = withoutErasedDimBlocks(doc, new Set([key]), new Set([a!.handle]));
    for (const h of handles) expect(out.objects.has(h)).toBe(false);
    expect(out.objects.size).toBe(size - 3);
    expect(out.blocks.has(key)).toBe(false);
    // 원래 문서는 그대로(명령 취소·OOPS가 쓴다)
    for (const h of handles) expect(doc.objects.has(h)).toBe(true);
    expect(doc.blocks.has(key)).toBe(true);
  });

  it('치수 핸들을 주지 않으면 레코드가 쓰는 블록은 전처럼 남긴다', () => {
    const doc = load();
    const [a] = dimsOf(doc);
    attach(doc, a!, 2);
    erase(doc, a!);
    expect(withoutErasedDimBlocks(doc, new Set([tableKey(a!.block)]))).toBe(doc);
  });

  it('되살아난 치수의 객체와 블록은 빼지 않는다', () => {
    const doc = load();
    const [a] = dimsOf(doc);
    const handles = attach(doc, a!, 3);
    const out = withoutErasedDimBlocks(doc, new Set([tableKey(a!.block)]), new Set([a!.handle]));
    expect(out).toBe(doc);
    for (const h of handles) expect(out.objects.has(h)).toBe(true);
  });

  it('살아 있는 치수의 레코드가 같은 블록을 쓰면 블록은 남기고 지운 치수의 객체만 뺀다', () => {
    const doc = load();
    const [a, b] = dimsOf(doc);
    const gone = attach(doc, a!, 4);
    const kept = attach(doc, b!, 5);
    (doc.objects.get(kept[2]!) as GenericObject).raw = [{ code: 2, value: a!.block }];
    const key = tableKey(a!.block);
    erase(doc, a!);
    const out = withoutErasedDimBlocks(doc, new Set([key]), new Set([a!.handle]));
    for (const h of gone) expect(out.objects.has(h)).toBe(false);
    for (const h of kept) expect(out.objects.has(h)).toBe(true);
    expect(out.blocks.has(key)).toBe(true);
  });

  it('다른 사전의 항목이면 소유자가 지워져도 빼지 않는다(DXF 쓰기와 같다)', () => {
    const doc = load();
    const [a] = dimsOf(doc);
    const [xdict] = attach(doc, a!, 6);
    doc.objects.set('AA7F', { type: 'DICTIONARY', handle: 'AA7F', owner: '0', entries: new Map([['X', xdict!]]), hardOwner: false, cloning: 1 } as unknown as GenericObject);
    erase(doc, a!);
    const out = withoutErasedDimBlocks(doc, new Set(), new Set([a!.handle]));
    expect(out).toBe(doc);
  });

  it('블록 정의를 통째로 지우면 그 안 치수의 *D와 핸들도 모은다(워커로 온 before는 핸들만)', () => {
    const doc = load();
    const dims = dimsOf(doc);
    const [a] = dims;
    const inner: BlockDef = { ...doc.blocks.get(MODEL_SPACE)!, name: 'WITHDIM', entities: [a!] };
    doc.blocks.set('WITHDIM', inner);
    const list = doc.blocks.get(MODEL_SPACE)!.entities;
    list.splice(list.indexOf(a!), 1);
    const stub = { entities: [{ handle: a!.handle }] } as unknown as BlockDef;
    const erased = new Set<string>();
    const handles = new Set<string>();
    noteRemovedDims(doc, [{ kind: 'blockDef', key: 'WITHDIM', before: stub, after: null }], erased, handles);
    expect([...erased]).toEqual([tableKey(a!.block)]);
    expect([...handles]).toEqual([a!.handle]);
    // 바꾸는 작업(after가 있음)은 세지 않는다
    const none = new Set<string>();
    noteRemovedDims(doc, [{ kind: 'blockDef', key: 'WITHDIM', before: stub, after: inner }], none);
    expect(none.size).toBe(0);
  });
});

describe('명령이 만든 지우기 작업', () => {
  /** 선형 치수 2개를 넣은 문서에서 치수 하나에 명령을 부르고, 워커처럼 적용 전에 지운 치수를 모은다 */
  async function run(cmd: 'ERASE' | 'EXPLODE') {
    const h = perCommandGroups(makeHarness());
    registerDrawCommands(h.app);
    registerModifyCommands(h.app);
    const dims = [0, 1].map((i) => {
      const d = createLinearDimension(h.doc, { x: 0, y: i * 10, z: 0 }, { x: 100, y: i * 10, z: 0 }, { x: 50, y: i * 10 + 5, z: 0 }, { rotation: 0 });
      const ops = dimensionBlockOps(h.st, d, false);
      d.handle = h.st.session.newHandle();
      d.owner = h.doc.blocks.get(MODEL_SPACE)!.recordHandle;
      h.st.session.commit({ label: 'DIM', ops: [...ops, { kind: 'add', block: MODEL_SPACE, entity: d }] });
      return d;
    });
    const erased = new Set<string>();
    const commit = h.st.session.commit.bind(h.st.session);
    h.st.session.commit = (tx) => {
      noteRemovedDims(h.doc, tx.ops, erased);
      commit(tx);
    };
    await h.run(cmd, [{ sel: [dims[0]!.handle] }]);
    const out = withoutErasedDimBlocks(h.doc, erased);
    expect([...erased]).toEqual([tableKey(dims[0]!.block)]);
    expect(out.blocks.has(tableKey(dims[0]!.block))).toBe(false);
    expect(out.blocks.has(tableKey(dims[1]!.block))).toBe(true);
    // 문서에는 남아 명령 취소·OOPS가 쓴다
    expect(h.doc.blocks.has(tableKey(dims[0]!.block))).toBe(true);
  }

  it('ERASE', () => run('ERASE'));
  it('EXPLODE', () => run('EXPLODE'));
});

describe('워커 저장', () => {
  const posted: FromWorker[] = [];
  let send: (m: ToWorker) => Promise<void>;

  beforeAll(async () => {
    const self = { postMessage: (m: FromWorker) => void posted.push(m) } as unknown as { onmessage: (ev: { data: ToWorker }) => Promise<void> };
    vi.stubGlobal('self', self);
    await import('../../src/worker/engine.worker');
    send = (m) => self.onmessage({ data: m });
  });

  afterEach(() => {
    posted.length = 0;
  });

  const adopt = async (id: number, doc: CadDocument) => {
    await send({ type: 'adopt', id, name: 't.dxf', doc: structuredClone(doc) });
    return (posted.find((m) => m.type === 'scene') as Extract<FromWorker, { type: 'scene' }>).docId;
  };
  const save = async (docId: number, id: number, format: 'dxf' | 'dwg' = 'dxf') => {
    await send({ type: 'save', id, docId, format, version: 'AC1032' });
    return posted.find((m) => m.type === 'saved' && m.id === id) as Extract<FromWorker, { type: 'saved' }>;
  };

  it('지운 치수의 블록은 파일에 없고, 명령 취소하면 다시 쓴다', async () => {
    const doc = load();
    const dims = dimsOf(doc);
    expect(dims.length).toBeGreaterThan(1);
    const docId = await adopt(10, doc);
    const before = readDxf(new Uint8Array((await save(docId, 11)).data));
    const key = tableKey(dims[0]!.block);
    expect(before.blocks.has(key)).toBe(true);

    const ops = removeOps(doc, [dims[0]!]);
    await send({ type: 'edit', docId, ops: packOps(ops) });
    const erasedFile = await save(docId, 12);
    const after = readDxf(new Uint8Array(erasedFile.data));
    expect(after.blocks.has(key)).toBe(false);
    expect(after.blockRecords.has(key)).toBe(false);
    expect(starD(after)).toHaveLength(starD(before).length - 1);
    // 남은 치수의 블록은 그대로다
    expect(after.blocks.has(tableKey(dims[1]!.block))).toBe(true);
    expect(dimsOf(after)).toHaveLength(dims.length - 1);

    // 명령 취소로 치수가 돌아오면 블록도 파일에 다시 들어간다
    await send({ type: 'edit', docId, ops: packOps(inverseTransaction({ label: 'ERASE', ops }).ops) });
    const undone = readDxf(new Uint8Array((await save(docId, 14)).data));
    expect(undone.blocks.has(key)).toBe(true);
    expect(dimsOf(undone)).toHaveLength(dims.length);
  });

  it('DWG로 저장해도 같다', async () => {
    const doc = load();
    const dims = dimsOf(doc);
    const docId = await adopt(20, doc);
    const whole = await save(docId, 21, 'dwg');
    await send({ type: 'edit', docId, ops: packOps(removeOps(doc, dims)) });
    const emptied = await save(docId, 22, 'dwg');
    const { readDwg } = await import('../../src/io/dwg/index');
    const back = readDwg(new Uint8Array(emptied.data));
    expect(starD(back)).toEqual([]);
    expect(emptied.data.byteLength).toBeLessThan(whole.data.byteLength);
  });

  it('주석 축척 치수를 지운 DWG에는 확장 사전·레코드가 남지 않고, 명령 취소하면 다시 쓴다(115차)', async () => {
    const doc = load();
    const [a] = dimsOf(doc);
    const xdict = 'AB10';
    const mgr = 'AB11';
    a!.xdict = xdict;
    const dict = (handle: string, owner: string, entries: [string, string][]) => ({ type: 'DICTIONARY', handle, owner, entries: new Map(entries), hardOwner: false, cloning: 1 }) as unknown as GenericObject;
    doc.objects.set(xdict, dict(xdict, a!.handle, [['AcDbContextDataManager', mgr]]));
    doc.objects.set(mgr, dict(mgr, xdict, []));
    const docId = await adopt(40, doc);
    const { readDwg } = await import('../../src/io/dwg/index');
    const before = readDwg(new Uint8Array((await save(docId, 41, 'dwg')).data));
    expect(before.objects.has(xdict)).toBe(true);
    const ops = removeOps(doc, [a!]);
    await send({ type: 'edit', docId, ops: packOps(ops) });
    const after = readDwg(new Uint8Array((await save(docId, 42, 'dwg')).data));
    expect(after.objects.has(xdict)).toBe(false);
    expect(after.objects.has(mgr)).toBe(false);
    await send({ type: 'edit', docId, ops: packOps(inverseTransaction({ label: 'ERASE', ops }).ops) });
    const undone = readDwg(new Uint8Array((await save(docId, 43, 'dwg')).data));
    expect(undone.objects.has(xdict)).toBe(true);
  });

  it('문서를 다시 받으면(replace) 기억을 버려 파일에서 온 블록을 빼지 않는다', async () => {
    const doc = load();
    const dims = dimsOf(doc);
    const docId = await adopt(30, doc);
    await send({ type: 'edit', docId, ops: packOps(removeOps(doc, [dims[0]!])) });
    const list = doc.blocks.get(MODEL_SPACE)!.entities;
    const copy = structuredClone(doc);
    copy.blocks.get(MODEL_SPACE)!.entities.splice(list.indexOf(dims[0]!), 1);
    await send({ type: 'replace', docId, doc: copy });
    const back = readDxf(new Uint8Array((await save(docId, 31)).data));
    expect(back.blocks.has(tableKey(dims[0]!.block))).toBe(true);
  });
});
