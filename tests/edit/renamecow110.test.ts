/**
 * 110차: 이름만 바꾸는 길(RENAME·-RENAME 다섯 종류, 도면층 관리자, 문자·치수 스타일 대화 상자 이름 바꾸기, 도면층 변환기)과 SETBYLAYER가
 * 객체를 깊이 복사하지 않고 바뀌는 칸만 새 객체로 만든다.
 * - 문서 객체를 얼려도 변경을 만들고 확정할 수 있다(원본을 제자리에서 고치지 않는다)
 * - 바꾼 값과 칸 차례가 깊은 복사를 고치던 109차 길(아래 old* — 그때 코드의 고치기를 그대로 옮김)과 같다
 * - 바뀌지 않은 칸은 원본과 같은 객체다(깊은 복사가 없다)
 * - 명령 취소·다시 실행과 워커(묶음 부호화)가 같은 문서를 만든다
 */
import { describe, expect, it } from 'vitest';
import type { AttribEntity, CadDocument, DimensionEntity, DwgRawBody, Entity, InsertEntity, Layer, LineEntity, LwPolylineEntity, MTextEntity, TextEntity, ViewportEntity } from '../../src/core/model';
import { BYLAYER, LW_BYLAYER, MODEL_SPACE, TRANSPARENCY_BYLAYER, entityDefaults, tableKey } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import type { EditOp } from '../../src/edit/session';
import { applyOps, cloneEntity } from '../../src/edit/session';
import { createLinearDimension } from '../../src/edit/dim';
import { renameOps } from '../../src/edit/util/rename';
import { renameLayer } from '../../src/app/layers';
import { textStyleRenameOps } from '../../src/app/textedit/styledlg';
import { dimStyleRenameOps } from '../../src/app/dimstyle';
import { translateLayersOps } from '../../src/edit/layertools/translate';
import { SBL_DEFAULT, setByLayerOps } from '../../src/edit/layerstate/setbylayer';
import { decodeWire, encodeWire, packOps, unpackOps } from '../../src/worker/editwire';
import { type Harness, makeHarness } from '../cmds2/harness';

type Modify = Extract<EditOp, { kind: 'modify' }>;

const raw = (n: number): DwgRawBody => ({ version: 'AC1032', typeName: 'X', typeNum: 1, data: new Uint8Array([n, 2, 3]), dataBits: 24, handles: new Uint8Array([n]), handleBits: 8, fingerprint: `f${n}` });

const attrib = (handle: string, o: Partial<AttribEntity>): AttribEntity =>
  ({ ...entityDefaults(), type: 'ATTRIB', handle, insert: { x: 0, y: 0, z: 0 }, height: 1, text: 'v', rotation: 0, widthFactor: 1, oblique: 0, style: 'Standard', generation: 0, halign: 0, valign: 0, tag: 'T', attFlags: 0, ...o }) as AttribEntity;

const mtext = (o: Partial<MTextEntity>): MTextEntity =>
  ({ ...entityDefaults(), type: 'MTEXT', handle: '', insert: { x: 0, y: 0, z: 0 }, height: 1, width: 0, attachment: 1, drawingDirection: 1, text: 'm', style: 'S1', rotation: 0, lineSpacingStyle: 1, lineSpacingFactor: 1, backgroundFlags: 0, backgroundScale: 1.5, ...o }) as MTextEntity;

/** 시험 문서: 도면층 L1·L2, 선종류 DASHED, 문자 스타일 S1, 치수 스타일 D1, 블록 B1(선·여러 줄 속성 정의)과 모형 공간 객체(원본 본문이 달린 것 포함) */
function fill(doc: CadDocument): void {
  Object.assign(doc, createNewDocument('metric'));
  doc.header.set('$HANDSEED', 'F000');
  const l0 = doc.layers.get('0')!;
  doc.layers.set('L1', { ...structuredClone(l0), name: 'L1', handle: 'B01', color: { aci: 3 }, linetype: 'DASHED' });
  doc.layers.set('L2', { ...structuredClone(l0), name: 'L2', handle: 'B02', color: { aci: 5 } });
  doc.linetypes.set('DASHED', { ...structuredClone(doc.linetypes.get('CONTINUOUS')!), name: 'DASHED', handle: 'B03' });
  doc.textStyles.set('S1', { ...structuredClone(doc.textStyles.get('STANDARD')!), name: 'S1', handle: 'B04' });
  const std = doc.dimStyles.get(tableKey(String(doc.header.get('$DIMSTYLE'))))!;
  doc.dimStyles.set('D1', { ...structuredClone(std), name: 'D1', handle: 'B08' });
  const put = (list: Entity[], e: Entity) => {
    list.push(e);
    doc.entityIndex.set(e.handle, e);
    if (e.type === 'INSERT') for (const a of e.attribs) doc.entityIndex.set(a.handle, a);
  };
  const L1 = { layer: 'L1', color: { aci: 1 }, linetype: 'DASHED', lineweight: 25, transparency: 0x2000080 };
  const inner: Entity[] = [];
  doc.blocks.set('B1', { name: 'B1', handle: 'B05', recordHandle: 'B06', basePoint: { x: 0, y: 0, z: 0 }, flags: 0, entities: inner, endHandle: 'B07' });
  doc.blockRecords.set('B1', { name: 'B1', handle: 'B06', flags: 0, insertUnits: 0, explodable: true, scalable: true });
  put(inner, { ...entityDefaults(), ...L1, type: 'LINE', handle: 'D01', owner: 'B06', start: { x: 0, y: 1, z: 0 }, end: { x: 1, y: 2, z: 0 }, dwgRaw: raw(1) } as LineEntity);
  put(inner, { ...attrib('D02', { layer: 'L2', style: 'S1', mtext: mtext({ style: 'S1' }) }), type: 'ATTDEF', owner: 'B06', prompt: 'p' } as unknown as Entity);
  const list = doc.blocks.get(MODEL_SPACE)!.entities;
  put(list, { ...entityDefaults(), ...L1, type: 'LINE', handle: 'C01', start: { x: 0, y: 0, z: 0 }, end: { x: 5, y: 0, z: 0 }, dwgRaw: raw(2), xdata: [{ app: 'APP1', items: [{ code: 1000, value: 'L1' }] }] } as LineEntity);
  put(list, { ...entityDefaults(), ...L1, type: 'LWPOLYLINE', handle: 'C02', verts: new Float64Array([0, 0, 0, 0, 0, 1, 1, 0, 0, 0]), closed: false, plinegen: false, constantWidth: 0, elevation: 0, material: 'AB' } as unknown as LwPolylineEntity);
  put(list, { ...entityDefaults(), layer: 'L2', type: 'TEXT', handle: 'C03', insert: { x: 0, y: 5, z: 0 }, height: 1, text: 'L1 S1', rotation: 0, widthFactor: 1, oblique: 0, style: 'S1', generation: 0, halign: 0, valign: 0, plotStyle: 'CD' } as TextEntity);
  put(list, { ...mtext({ handle: 'C04', layer: 'L1', style: 'S1' }) });
  put(list, {
    ...entityDefaults(),
    layer: 'L2',
    color: { aci: 0 },
    type: 'INSERT',
    handle: 'C05',
    block: 'B1',
    insert: { x: 9, y: 9, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    rotation: 0,
    columnCount: 1,
    rowCount: 1,
    columnSpacing: 0,
    rowSpacing: 0,
    dwgRaw: raw(3),
    attribs: [
      attrib('C06', { layer: 'L1', style: 'S1', dwgRaw: raw(4), color: { aci: 2 } }),
      attrib('C07', { layer: 'L2', dwgRaw: raw(5) }),
      attrib('C08', { layer: 'L2', mtext: mtext({ style: 'S1' }) }),
      attrib('C09', { layer: 'L2' }),
    ],
  } as InsertEntity);
  put(list, { ...entityDefaults(), layer: 'L2', type: 'INSERT', handle: 'C0A', block: 'B1', insert: { x: 3, y: 9, z: 0 }, scale: { x: 1, y: 1, z: 1 }, rotation: 0, columnCount: 1, rowCount: 1, columnSpacing: 0, rowSpacing: 0, attribs: [attrib('C0B', { layer: 'L2' })] } as InsertEntity);
  put(list, {
    ...entityDefaults(),
    type: 'VIEWPORT',
    handle: 'C0C',
    center: { x: 5, y: 5, z: 0 },
    width: 10,
    height: 10,
    status: 1,
    id: 2,
    viewCenter: { x: 0, y: 0 },
    snapBase: { x: 0, y: 0 },
    snapSpacing: { x: 1, y: 1 },
    gridSpacing: { x: 1, y: 1 },
    viewDirection: { x: 0, y: 0, z: 1 },
    viewTarget: { x: 0, y: 0, z: 0 },
    lensLength: 50,
    frontClip: 0,
    backClip: 0,
    viewHeight: 10,
    snapAngle: 0,
    twistAngle: 0,
    circleSides: 100,
    flags: 0,
    frozenLayers: ['L2', 'l1'],
    renderMode: 0,
    ucsPerViewport: false,
  } as unknown as ViewportEntity);
  put(list, { ...createLinearDimension(doc, { x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 0, y: 3, z: 0 }), ...L1, handle: 'C0D', dimStyle: 'D1', dwgRaw: raw(6) } as DimensionEntity);
}

/** 깊이 얼린다(형식 배열은 얼릴 수 없어 그대로) — 원본을 제자리에서 고치면 엄격 모드에서 TypeError */
function deepFreeze(v: unknown): void {
  if (typeof v !== 'object' || v === null || ArrayBuffer.isView(v) || Object.isFrozen(v)) return;
  Object.freeze(v);
  for (const x of Object.values(v as object)) deepFreeze(x);
}
const freezeEntities = (doc: CadDocument) => {
  for (const b of doc.blocks.values()) for (const e of b.entities) deepFreeze(e);
};

/** 칸 차례·undefined 값·형식 배열 종류까지 담는 글 */
const canon = (v: unknown) => JSON.stringify(v, (_k, x) => (x === undefined ? { u: 1 } : ArrayBuffer.isView(x) ? { [x.constructor.name]: Array.from(x as Uint8Array) } : x));

const same = (a: string | undefined, k: string) => typeof a === 'string' && tableKey(a) === k;

/** 109차 길: 깊이 복사한 뒤 고치고(fix가 거짓이면 null), dropRaw면 원본 본문을 객체·모든 속성에서 지운다 */
function old(e: Entity, fix: (c: Entity) => boolean, dropRaw: boolean): Entity | null {
  const c = cloneEntity(e);
  if (!fix(c)) return null;
  if (dropRaw) {
    delete c.dwgRaw;
    if (c.type === 'INSERT') for (const a of c.attribs) delete a.dwgRaw;
  }
  return c;
}
const oldLayer = (k: string, to: string, frozen: boolean) => (c: Entity) => {
  let hit = false;
  if (same(c.layer, k)) ((c.layer = to), (hit = true));
  if (c.type === 'INSERT') for (const a of c.attribs) if (same(a.layer, k)) ((a.layer = to), (hit = true));
  if (frozen && c.type === 'VIEWPORT' && c.frozenLayers.some((l) => same(l, k))) ((c.frozenLayers = c.frozenLayers.map((l) => (same(l, k) ? to : l))), (hit = true));
  return hit;
};
const oldStyle = (k: string, to: string, anyMtext: boolean) => (c: Entity) => {
  let hit = false;
  const t = c as { style?: string; mtext?: { style: string } };
  if ((anyMtext ? typeof t.style === 'string' : c.type === 'TEXT' || c.type === 'MTEXT' || c.type === 'ATTRIB' || c.type === 'ATTDEF') && same(t.style, k)) ((t.style = to), (hit = true));
  if ((anyMtext || c.type === 'ATTRIB' || c.type === 'ATTDEF') && t.mtext && same(t.mtext.style, k)) ((t.mtext.style = to), (hit = true));
  if (c.type === 'INSERT')
    for (const a of c.attribs) {
      if (same(a.style, k)) ((a.style = to), (hit = true));
      if (a.mtext && same(a.mtext.style, k)) ((a.mtext.style = to), (hit = true));
    }
  return hit;
};

/** 모든 객체의 109차 결과(핸들 → 고친 사본) */
function expected(doc: CadDocument, f: (e: Entity) => Entity | null): Map<string, Entity> {
  const out = new Map<string, Entity>();
  for (const b of doc.blocks.values())
    for (const e of b.entities) {
      const c = f(e);
      if (c) out.set(e.handle, c);
    }
  return out;
}

const blockState = (doc: CadDocument) => canon([...doc.blocks].map(([k, b]) => [k, b.name, b.entities]));
// 표는 열쇠 차례로(이름 바꾸기를 되돌리면 지웠다 다시 넣은 항목이 Map 끝에 온다 — 전과 같은 동작)
const sorted = <V>(m: Iterable<[string, V]>) => [...m].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
const tableState = (doc: CadDocument) => canon([sorted(doc.layers), sorted(doc.linetypes), sorted(doc.textStyles), sorted(doc.dimStyles), sorted(doc.header).filter(([k]) => k !== '$HANDSEED' && !k.startsWith('$TD'))]);

/**
 * make가 얼린 문서로 변경을 만들어 확정한다(이미 확정하면 그대로). 바꾸기 변경의 after가 109차 값과 칸 차례까지 같은지,
 * 명령 취소·다시·워커가 같은지 본다
 */
function check(make: (h: Harness) => EditOp[] | void, want: (doc: CadDocument) => Map<string, Entity>, minOps: number): Modify[] {
  const h = makeHarness(fill);
  const exp = want(h.doc);
  const before = [blockState(h.doc), tableState(h.doc)];
  freezeEntities(h.doc);
  const depth = h.st.session.depth;
  const ops = make(h);
  if (ops) h.st.session.commit({ label: 'T', ops });
  expect(h.st.session.depth).toBe(depth + 1);
  const tx = h.st.session.undoTop()!.ops;
  const mods = tx.filter((o): o is Modify => o.kind === 'modify');
  expect(mods.length).toBeGreaterThanOrEqual(minOps);
  expect(new Set(mods.map((o) => o.before.handle))).toEqual(new Set(exp.keys()));
  for (const o of mods) expect(canon(o.after), o.before.handle).toBe(canon(exp.get(o.before.handle)));
  const after = [blockState(h.doc), tableState(h.doc)];
  expect(after).not.toEqual(before);
  h.st.session.undo();
  expect([blockState(h.doc), tableState(h.doc)]).toEqual(before);
  h.st.session.redo();
  expect([blockState(h.doc), tableState(h.doc)]).toEqual(after);
  const w = makeHarness(fill).doc;
  applyOps(w, unpackOps(decodeWire(encodeWire(packOps(tx))!)));
  expect([blockState(w), tableState(w)]).toEqual(after);
  return mods;
}
const mod = (mods: Modify[], h: string) => mods.find((o) => o.before.handle === h)!;

describe('이름 바꾸기·SETBYLAYER는 바뀌는 칸만 새 객체로(110차)', () => {
  it('-RENAME 도면층: 값·칸 차례가 109차와 같고(원본 본문은 객체·모든 속성에서 뺀다) 바뀌지 않은 칸은 원본을 함께 쓴다', () => {
    const mods = check(
      (h) => renameOps(h.doc, 'layer', 'L1', 'L9'),
      (doc) => expected(doc, (e) => old(e, oldLayer('L1', 'L9', true), true)),
      6,
    );
    const line = mod(mods, 'C01') as Extract<Modify, { before: LineEntity }> & { after: LineEntity; before: LineEntity };
    expect(line.after.start).toBe(line.before.start);
    expect(line.after.xdata).toBe(line.before.xdata);
    expect('dwgRaw' in line.after).toBe(false);
    const pl = mod(mods, 'C02') as unknown as { before: LwPolylineEntity; after: LwPolylineEntity };
    expect(pl.after.verts).toBe(pl.before.verts);
    const ins = mod(mods, 'C05') as unknown as { before: InsertEntity; after: InsertEntity };
    expect(ins.after.attribs[0]!.layer).toBe('L9');
    // 원본 본문이 있는 속성은 사본에서만 뺀다, 없는 속성은 함께 쓴다
    expect(ins.after.attribs[1]).not.toBe(ins.before.attribs[1]);
    expect(ins.before.attribs[1]!.dwgRaw).toBeDefined();
    expect(ins.after.attribs[2]).toBe(ins.before.attribs[2]);
    expect(ins.after.attribs[2]!.mtext).toBe(ins.before.attribs[2]!.mtext);
    expect((mod(mods, 'C0C').after as ViewportEntity).frozenLayers).toEqual(['L2', 'L9']);
  });

  it('-RENAME 선종류·문자 스타일·치수 스타일·블록도 109차와 같다', () => {
    check(
      (h) => renameOps(h.doc, 'linetype', 'DASHED', 'DASH9'),
      (doc) =>
        expected(doc, (e) =>
          old(
            e,
            (c) => {
              let hit = false;
              if (same(c.linetype, 'DASHED')) ((c.linetype = 'DASH9'), (hit = true));
              if (c.type === 'INSERT') for (const a of c.attribs) if (same(a.linetype, 'DASHED')) ((a.linetype = 'DASH9'), (hit = true));
              return hit;
            },
            true,
          ),
        ),
      4,
    );
    const mods = check(
      (h) => renameOps(h.doc, 'textStyle', 'S1', 'S9'),
      (doc) => expected(doc, (e) => old(e, oldStyle('S1', 'S9', false), true)),
      4,
    );
    const def = mod(mods, 'D02').after as unknown as AttribEntity;
    expect([def.style, def.mtext!.style]).toEqual(['S9', 'S9']);
    const ins = mod(mods, 'C05') as unknown as { before: InsertEntity; after: InsertEntity };
    expect(ins.after.attribs[2]!.mtext!.style).toBe('S9');
    expect(ins.before.attribs[2]!.mtext!.style).toBe('S1');
    expect(ins.after.attribs[3]).toBe(ins.before.attribs[3]);
    check(
      (h) => renameOps(h.doc, 'dimStyle', 'D1', 'D9'),
      (doc) => expected(doc, (e) => old(e, (c) => c.type === 'DIMENSION' && same(c.dimStyle, 'D1') && ((c.dimStyle = 'D9'), true), true)),
      1,
    );
    const blk = check(
      (h) => renameOps(h.doc, 'block', 'B1', 'B9'),
      (doc) => expected(doc, (e) => old(e, (c) => c.type === 'INSERT' && same(c.block, 'B1') && ((c.block = 'B9'), true), true)),
      2,
    );
    const b2 = mod(blk, 'C0A') as unknown as { before: InsertEntity; after: InsertEntity };
    expect(b2.after.attribs).toBe(b2.before.attribs);
  });

  it('도면층 관리자·문자/치수 스타일 대화 상자 이름 바꾸기: 원본 본문은 전처럼 남기고 값은 109차와 같다', () => {
    const mods = check(
      (h) => void renameLayer(h.app, 'L1', 'L8'),
      (doc) => expected(doc, (e) => old(e, oldLayer('L1', 'L8', false), false)),
      5,
    );
    expect(mod(mods, 'C01').after.dwgRaw).toBe(mod(mods, 'C01').before.dwgRaw);
    check(
      (h) => textStyleRenameOps(h.st, 'S1', 'S7'),
      (doc) => expected(doc, (e) => old(e, oldStyle('S1', 'S7', true), false)),
      4,
    );
    check(
      (h) => dimStyleRenameOps(h.st, 'D1', 'D7'),
      (doc) => expected(doc, (e) => old(e, (c) => c.type === 'DIMENSION' && tableKey(c.dimStyle || 'Standard') === 'D1' && ((c.dimStyle = 'D7'), true), false)),
      1,
    );
  });

  it('도면층 변환기(색·선종류·투명도 강제): 옮길 객체만 얕은 사본, 값은 109차와 같다', () => {
    const to: Layer = { name: 'T1', handle: '0', flags: 0, color: { aci: 4 }, off: false, frozen: false, locked: false, linetype: 'Continuous', lineweight: -3, plot: true, transparency: 255 };
    const move = (x: Entity) => {
      if (!same(x.layer, 'L1')) return false;
      x.layer = 'T1';
      x.color = { aci: BYLAYER };
      x.linetype = 'ByLayer';
      x.transparency = TRANSPARENCY_BYLAYER;
      return true;
    };
    const mods = check(
      (h) => translateLayersOps(h.doc, [{ from: 'L1', to }], { forceColor: true, forceLinetype: true, forceTransparency: true, blocks: true, purge: false }, () => h.st.session.newHandle()).ops,
      (doc) =>
        expected(doc, (e) =>
          old(
            e,
            (c) => {
              let hit = move(c);
              if (c.type === 'INSERT') for (const a of c.attribs) hit = move(a as unknown as Entity) || hit;
              if (c.type === 'VIEWPORT' && c.frozenLayers.some((n) => same(n, 'L1'))) ((c.frozenLayers = c.frozenLayers.map((n) => (same(n, 'L1') ? 'T1' : n))), (hit = true));
              return hit;
            },
            false,
          ),
        ),
      5,
    );
    const ins = mod(mods, 'C05') as unknown as { before: InsertEntity; after: InsertEntity };
    expect(ins.after.attribs[0]!.color).toEqual({ aci: BYLAYER });
    expect(ins.after.attribs[1]).toBe(ins.before.attribs[1]);
  });

  it('SETBYLAYER(블록 포함, ByBlock도): 고른 객체마다 깊이 복사하지 않고 값은 109차와 같다', () => {
    const targets = (doc: CadDocument) => doc.blocks.get(MODEL_SPACE)!.entities.map((entity) => ({ block: MODEL_SPACE, entity }));
    const opt = { mode: SBL_DEFAULT, byBlock: true, includeBlocks: true };
    const oldFix = (c: Entity) => {
      let hit = false;
      if (c.color.aci !== BYLAYER) ((c.color = { aci: BYLAYER }), (hit = true));
      if (tableKey(c.linetype || 'ByLayer') !== 'BYLAYER') ((c.linetype = 'ByLayer'), (hit = true));
      if (c.lineweight !== LW_BYLAYER) ((c.lineweight = LW_BYLAYER), (hit = true));
      if (c.transparency !== TRANSPARENCY_BYLAYER) ((c.transparency = TRANSPARENCY_BYLAYER), (hit = true));
      if (c.material) (delete c.material, (hit = true));
      if (c.plotStyle) (delete c.plotStyle, (hit = true));
      return hit;
    };
    const mods = check(
      (h) => setByLayerOps(h.doc, targets(h.doc), opt).ops,
      (doc) =>
        expected(doc, (e) =>
          old(
            e,
            (c) => {
              let hit = oldFix(c);
              if (c.type === 'INSERT') for (const a of c.attribs) hit = oldFix(a as unknown as Entity) || hit;
              return hit;
            },
            true,
          ),
        ),
      6,
    );
    expect('material' in mod(mods, 'C02').after).toBe(false);
    expect('plotStyle' in mod(mods, 'C03').after).toBe(false);
    const ins = mod(mods, 'C05') as unknown as { before: InsertEntity; after: InsertEntity };
    expect(ins.after.attribs[3]).toBe(ins.before.attribs[3]);
    // 바꿀 것이 없는 객체는 사본도 만들지 않는다(null)
    const h = makeHarness(fill);
    const once = setByLayerOps(h.doc, targets(h.doc), opt).ops;
    h.st.session.commit({ label: 'T', ops: once });
    freezeEntities(h.doc);
    expect(setByLayerOps(h.doc, targets(h.doc), opt).ops).toEqual([]);
  });
});
