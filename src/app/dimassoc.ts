/**
 * 연관 치수: DIMREASSOCIATE(DRE), DIMDISASSOCIATE(DDA), DIMREGEN, DIMASSOC(시스템 변수)
 * 그리고 치수 명령·수정 명령이 쓰는 연결 도우미(작성할 때 연관 만들기, 편집할 때 따라가기).
 * 기록 해석·계산은 src/edit/dim/assoc.ts. 프롬프트는 AutoCAD 2026 한국어판을 따른다.
 */
import { pushAll } from '../core/arrays';
import type { DimensionEntity, Entity, HeaderValue } from '../core/model';
import { tableKey } from '../core/model';
import type { EditOp } from '../edit/session';
import {
  type AssocChanges,
  type DefKey,
  DEFAULT_ORDER,
  type FollowResult,
  OSNAP,
  type PointRef,
  arcEndsSwapped,
  assocKeys,
  dimAssocOf,
  findRefAt,
  followAssociations,
  followable,
  isAssocGeometry,
  movedDimension,
  regenAssociations,
  segmentSnapRef,
  setDimAssocChanges,
  snapRef,
  tolFor,
} from '../edit/dim/assoc';
import { explodeEntity } from '../edit/geom';
import { affApply } from '../edit/geom/math';
import { circleOf } from '../edit/geom/ocs';
import type { App, CommandContext, Keyword, PointResult } from './app';
import { dimensionBlockOps, originsFromEntity, polyArcOf } from './dimcmds';
import type { DocState } from './docstate';
import { unlockedOnly } from './layers';
import { askNumber } from './modify2-util';
import type { Affine } from './modify';
import { commitResults } from './modify';
import type { OverlayGeom, Pt, SnapKind } from './view';

// ---------------------------------------------------------------------------
// DIMASSOC 변수
// ---------------------------------------------------------------------------

/** $DIMASSOC: 0 분해된 치수, 1 연관하지 않는 치수 객체, 2 연관 치수(없으면 2) */
export function dimAssocMode(doc: { header: Map<string, HeaderValue> }): 0 | 1 | 2 {
  const v = Number(doc.header.get('$DIMASSOC') ?? 2);
  return v === 0 ? 0 : v === 1 ? 1 : 2;
}

// ---------------------------------------------------------------------------
// 찍은 점 → 점 참조
// ---------------------------------------------------------------------------

/** 점 요청이 넘기는 객체 스냅(app.ts가 넘기면 그것을 쓴다) */
export interface SnapInfo {
  kind: SnapKind;
  handle?: string;
  handle2?: string;
}

const KIND_OSNAP: Partial<Record<SnapKind, number>> = {
  end: OSNAP.END,
  mid: OSNAP.MID,
  cen: OSNAP.CEN,
  qua: OSNAP.QUAD,
  int: OSNAP.INT,
  ins: OSNAP.INS,
  nod: OSNAP.NODE,
  per: OSNAP.PERP,
  nea: OSNAP.NEAR,
  tan: OSNAP.TAN,
};

/**
 * 찍은 점의 객체 스냅. 점 결과에 snap이 있으면(null = 스냅 없이 찍음) 그것, 없으면 화면의 스냅 표식이
 * 그 점에 있을 때 그 종류. 알 수 없으면 undefined.
 */
function snapOf(app: App, r: { point: Pt; snap?: SnapInfo | null }): SnapInfo | null | undefined {
  if (r.snap !== undefined) return r.snap;
  const s = app.view.overlay.snap;
  if (s && Math.hypot(s.p.x - r.point.x, s.p.y - r.point.y) <= tolFor(r.point)) return { kind: s.kind };
  return undefined;
}

/** 점 근처의 형상 객체(치수·해치 등은 뺀다) */
function nearby(app: App, p: Pt, radius: number, first?: string[]): Entity[] {
  const st = app.active!;
  const doc = st.doc;
  const out: Entity[] = [];
  const seen = new Set<string>();
  const push = (h: string | undefined) => {
    if (!h || seen.has(h)) return;
    seen.add(h);
    const e = doc.entityIndex.get(h);
    if (e && isAssocGeometry(e) && !st.hiddenObjects.has(h)) out.push(e);
  };
  for (const h of first ?? []) push(h);
  const pk = app.picker();
  if (pk) for (const b of pk.candidates(p.x, p.y, radius)) push(b.handle);
  else for (const e of doc.blocks.get(st.space)?.entities ?? []) push(e.handle);
  return out;
}

/**
 * 찍은 점의 연관 참조. 객체 스냅 종류를 알면 그 종류로(그 자리에 다른 객체의 스냅 점만 있으면 그 객체로),
 * 모르면 그 자리에 정확히 있는 스냅 점(끝점·교차점·중심·중간점·사분점·노드·삽입점)으로 찾는다.
 * 근처점·직교·접점은 근처점으로 둔다. 찾지 못하거나 스냅 없이 찍었으면 null.
 * 도면 공간에서 뷰포트 안 모형 객체에 잡은 점(snap.viewport)도 null — 공간을 넘는 연관은 아직 만들지 않는다(비연관 치수)
 */
export function pointRef(app: App, r: PointResult): PointRef | null {
  if (!('point' in r) || !app.active) return null;
  if (r.snap?.viewport) return null;
  const res = r as { point: Pt; snap?: SnapInfo | null };
  const p = res.point;
  const snap = snapOf(app, res);
  if (snap === null) return null;
  const doc = app.active.doc;
  const px = app.view.pixelSize();
  const exact = tolFor(p) * 10;
  const loose = Math.max(exact, 3 * px);
  const ents = nearby(app, p, Math.max(loose, 12 * px), [snap?.handle, snap?.handle2].filter((h): h is string => !!h));
  if (snap) {
    const k = KIND_OSNAP[snap.kind];
    if (k === OSNAP.NEAR || k === OSNAP.PERP || k === OSNAP.TAN) {
      const ref = findRefAt(doc, ents, p, { tol: loose, kinds: [OSNAP.NEAR], nearTol: loose });
      if (ref) return ref;
    } else if (k === OSNAP.INT) {
      const ref = findRefAt(doc, ents, p, { tol: loose, kinds: [OSNAP.INT] });
      if (ref) return ref;
    } else if (k !== undefined) {
      const ref = findRefAt(doc, ents, p, { tol: exact, kinds: [k] });
      if (ref) return ref;
    }
  }
  // 스냅이 치수 자신 등 형상이 아닌 것에 걸렸거나 모를 때: 그 자리에 스냅 점이 있는 객체
  return findRefAt(doc, ents, p, { tol: exact, kinds: DEFAULT_ORDER });
}

/** 고른 객체의 스냅 점 참조(정확한 자리) */
export function objectRef(app: App, e: Entity | undefined, osnap: number, p: Pt): PointRef | null {
  if (!e || !app.active) return null;
  return snapRef(app.active.doc, e, osnap, p, Math.max(tolFor(p) * 10, 1e-9));
}

/**
 * 고른 폴리선 세그먼트 seg(0부터)의 스냅 점 참조(정확한 자리 — 세그먼트 번호 표지, 192차 `segmentSnapRef`).
 * DIMARC가 폴리선 호 세그먼트로 만든 호 길이 치수의 끝점 둘·중심(193차)
 */
export function segmentRef(app: App, e: Entity | undefined, osnap: number, seg: number, p: Pt): PointRef | null {
  if (!e || !app.active) return null;
  return segmentSnapRef(e, osnap, seg, p, Math.max(tolFor(p) * 10, 1e-9));
}

/** 고른 원·호 위 점의 근처점 참조 */
export function curveRef(app: App, e: Entity | undefined, p: Pt): PointRef | null {
  if (!e || !app.active) return null;
  return findRefAt(app.active.doc, [e], p, { tol: 0, kinds: [OSNAP.NEAR], nearTol: Math.max(3 * app.view.pixelSize(), tolFor(p) * 10) });
}

/** 다른 치수(연속·기준선의 기준)의 정의점 연관을 이어받는다 */
export function inheritedRef(app: App, from: DimensionEntity, key: DefKey): PointRef | null {
  const st = app.active;
  if (!st) return null;
  const a = dimAssocOf(st.doc, from);
  if (!a) return null;
  const i = assocKeys(from).indexOf(key);
  const r = i >= 0 ? a.data.refs[i] : null;
  if (!r || !followable(r) || ![...r.ids, ...(r.ids2 ?? [])].every((h) => st.doc.entityIndex.has(h))) return null;
  return structuredClone(r);
}

// ---------------------------------------------------------------------------
// 새 치수에 연관 붙이기
// ---------------------------------------------------------------------------

function toOps(st: DocState, ch: AssocChanges, skip: ReadonlySet<string> = new Set()): EditOp[] {
  const ops: EditOp[] = [];
  for (const [h, after] of ch.entities) {
    if (skip.has(h)) continue;
    const before = st.doc.entityIndex.get(h);
    const block = st.session.ownerOf(h);
    if (!before || !block) continue;
    ops.push({ kind: 'modify', block, before, after });
  }
  for (const o of ch.objects) ops.push({ kind: 'object', key: o.key, before: o.before, after: o.after });
  return ops;
}

/**
 * 아직 문서에 넣지 않은 새 치수(핸들이 붙은 것)에 연관을 붙이는 작업. DIMASSOC가 2가 아니거나 참조가 없으면 [].
 * 치수의 정의점을 참조 점(정확한 스냅 자리)에 맞추고 확장 사전 핸들을 넣는다 — 치수 블록을 만들기 전에 부르면 된다.
 */
export function snapNewDimension(app: App, dim: DimensionEntity, refs: readonly (PointRef | null)[]): boolean {
  const st = app.active;
  if (!st || dimAssocMode(st.doc) !== 2 || !refs.some((r) => r)) return false;
  const keys = assocKeys(dim);
  refs.forEach((r, i) => {
    const k = keys[i];
    if (r && k) dim[k] = { x: r.point.x, y: r.point.y, z: dim[k].z };
  });
  if (dim.subtype === 'ARC_DIMENSION' && dim.arc) dim.arc = { ...dim.arc, center: { ...dim.defPoint4 }, start: { ...dim.defPoint2 }, end: { ...dim.defPoint3 } };
  return true;
}

/** 새 치수(핸들이 붙었고 같은 커밋에서 넣는다)의 연관 작업. dim.xdict를 채운다 */
export function newDimensionAssocOps(app: App, dim: DimensionEntity, refs: readonly (PointRef | null)[]): EditOp[] {
  const st = app.active;
  if (!st || dimAssocMode(st.doc) !== 2 || !refs.some((r) => r) || !dim.handle) return [];
  const { dim: d, changes } = setDimAssocChanges(st.doc, dim, refs, { alloc: () => st.session.newHandle(), current: (h) => st.doc.entityIndex.get(h) });
  if (d.xdict) dim.xdict = d.xdict;
  return toOps(st, changes, new Set([dim.handle]));
}

/** 이미 넣은 치수에 연관을 붙인다(같은 명령 묶음으로). 붙였으면 true */
export function attachAssociation(app: App, ctx: CommandContext, handle: string, refs: readonly (PointRef | null)[], label: string): boolean {
  const st = app.active;
  if (!st || dimAssocMode(st.doc) !== 2 || !refs.some((r) => r)) return false;
  const dim = st.doc.entityIndex.get(handle);
  if (dim?.type !== 'DIMENSION') return false;
  const { changes } = setDimAssocChanges(st.doc, dim, refs, { alloc: () => st.session.newHandle(), current: (h) => st.doc.entityIndex.get(h) });
  const ops = toOps(st, changes);
  if (!ops.length) return false;
  st.session.commit({ label, ops, group: ctx.group });
  return true;
}

/** DIMASSOC 0이면 방금 넣은 치수들을 분해한다(같은 명령 묶음, 쓰지 않게 된 *D 블록도 지운다). 더한 작업 수를 돌려준다 */
export function finishNewDimension(app: App, ctx: CommandContext, handles: string | readonly string[], label: string): number {
  const st = app.active;
  if (!st || dimAssocMode(st.doc) !== 0) return 0;
  const results = [];
  const blocks: string[] = [];
  for (const h of typeof handles === 'string' ? [handles] : handles) {
    const dim = st.doc.entityIndex.get(h);
    if (dim?.type !== 'DIMENSION') continue;
    const r = explodeEntity(dim, st.doc);
    if (!r.add?.length) continue;
    results.push(r);
    if (/^\*D/i.test(dim.block)) blocks.push(tableKey(dim.block));
  }
  if (!results.length) return 0;
  let n = commitResults(app, ctx, results, label, { quiet: true }).ops;
  const ops: EditOp[] = [];
  for (const key of blocks) {
    const used = [...st.doc.blocks.values()].some((b) => b.entities.some((e) => (e.type === 'DIMENSION' || e.type === 'INSERT') && tableKey(e.block) === key));
    const def = st.doc.blocks.get(key);
    const rec = st.doc.blockRecords.get(key);
    if (used || !def) continue;
    ops.push({ kind: 'blockDef', key, before: def, after: null });
    if (rec) ops.push({ kind: 'blockRecord', key, before: rec, after: null });
  }
  if (ops.length) {
    st.session.commit({ label, ops, group: ctx.group });
    n += ops.length;
  }
  return n;
}

// ---------------------------------------------------------------------------
// 편집 따라가기(commitResults가 부른다)
// ---------------------------------------------------------------------------

export interface FollowPlan {
  /** 바뀌는 객체(핸들 → 편집 뒤): 이미 있는 바꾸기 작업은 after를 이것으로 바꾸고, 없으면 새로 만든다 */
  entities: Map<string, Entity>;
  /** 정의점이 옮겨져 치수 블록을 다시 만들어야 하는 치수 */
  moved: Set<string>;
  /** 사전·DIMASSOC 작업 */
  objectOps: EditOp[];
  /** 연관이 풀린 치수 수 */
  released: number;
}

function planOf(r: FollowResult): FollowPlan {
  const entities = new Map<string, Entity>(r.entities);
  const moved = new Set<string>();
  for (const [h, d] of r.dims) entities.set(h, d);
  for (const h of r.dims.keys()) moved.add(h);
  return { entities, moved, objectOps: r.objects.map((o) => ({ kind: 'object', key: o.key, before: o.before, after: o.after })), released: r.released.size };
}

/**
 * 도면에 연관 기록(DIMASSOC)이 있는지 — 없으면 planFollow는 changes를 보지 않고 빈 계획(emptyFollow)을 낸다.
 * 없으면 객체 사전을 모두 훑으므로 확정 하나에 한 번만 부른다
 */
export function hasDimAssoc(st: DocState): boolean {
  for (const o of st.doc.objects.values()) if (o.type === 'DIMASSOC') return true;
  return false;
}

/** 연관 기록이 없을 때의 빈 따라가기 계획 */
export function emptyFollow(): FollowPlan {
  return { entities: new Map(), moved: new Set(), objectOps: [], released: 0 };
}

/**
 * 편집(핸들 → 편집 뒤 객체, null = 지움)에 연관 치수를 맞추는 계획. transform은 바뀐 객체가 모두 받은 변환
 * (이동·회전·축척·대칭)이다. 연관 기록이 없는 도면에서는 빈 계획이다.
 */
export function planFollow(st: DocState, changes: ReadonlyMap<string, Entity | null>, transform?: Affine): FollowPlan {
  const doc = st.doc;
  if (!hasDimAssoc(st)) return emptyFollow();
  const r = followAssociations(doc, changes, () => st.session.newHandle(), transform ? { transform: (p) => affApply(transform, p) } : {});
  // 정의점이 실제로 바뀐 치수만 블록을 다시 만든다
  const plan = planOf(r);
  plan.moved.clear();
  for (const [h, d] of r.dims) {
    const before = changes.get(h) ?? doc.entityIndex.get(h);
    if (!before || before.type !== 'DIMENSION') continue;
    const k = ['defPoint', 'defPoint2', 'defPoint3', 'defPoint4', 'defPoint5', 'textMid'] as const;
    if (k.some((x) => before[x].x !== d[x].x || before[x].y !== d[x].y)) plan.moved.add(h);
  }
  return plan;
}

/**
 * commitResults를 거치지 않는 편집(ERASE·특성 팔레트 등)이 쓸 수 있는 따라가기 작업.
 * changes = 이 편집이 바꿀 객체(핸들 → 편집 뒤, null = 지움). patched는 changes에 든 객체의 새 after(바꿔 넣어야 한다).
 */
export function followOps(st: DocState, changes: ReadonlyMap<string, Entity | null>): { ops: EditOp[]; patched: Map<string, Entity> } {
  const plan = planFollow(st, changes);
  const ops: EditOp[] = [];
  const patched = new Map<string, Entity>();
  const extra = new Set<string>();
  for (const [h, e] of plan.entities) {
    if (changes.has(h)) {
      if (e.type === 'DIMENSION' && plan.moved.has(h)) ops.push(...dimensionBlockOps(st, e, true, extra));
      patched.set(h, e);
      continue;
    }
    const before = st.doc.entityIndex.get(h);
    const block = st.session.ownerOf(h);
    if (!before || !block) continue;
    if (e.type === 'DIMENSION' && plan.moved.has(h)) {
      try {
        ops.push(...dimensionBlockOps(st, e, true, extra));
      } catch {
        /* 생성기가 못 다루는 치수 */
      }
    }
    ops.push({ kind: 'modify', block, before, after: e });
  }
  // 따라가는 연관 객체 수는 옮긴 객체에 붙은 치수 수를 따른다(펼치지 않고 붙인다 — 110차)
  pushAll(ops, plan.objectOps);
  return { ops, patched };
}

// ---------------------------------------------------------------------------
// 표식(DIMREASSOCIATE)
// ---------------------------------------------------------------------------

/** 정의점 표식: 연관 = 상자 안 X, 아님 = X */
function markers(app: App, list: { p: Pt; on: boolean }[]): OverlayGeom {
  const s = 6 * app.view.pixelSize();
  const segs: number[] = [];
  for (const { p, on } of list) {
    segs.push(p.x - s, p.y - s, p.x + s, p.y + s, p.x - s, p.y + s, p.x + s, p.y - s);
    if (on) {
      const b = s * 1.4;
      segs.push(p.x - b, p.y - b, p.x + b, p.y - b, p.x + b, p.y - b, p.x + b, p.y + b, p.x + b, p.y + b, p.x - b, p.y + b, p.x - b, p.y + b, p.x - b, p.y - b);
    }
  }
  return { segs };
}

// ---------------------------------------------------------------------------
// 명령
// ---------------------------------------------------------------------------

/** 치수에 지금 남아 있는(객체가 있는) 연관 참조 */
function liveRefs(st: DocState, d: DimensionEntity): (PointRef | null)[] {
  const a = dimAssocOf(st.doc, d);
  const refs: (PointRef | null)[] = [null, null, null, null];
  a?.data.refs.forEach((r, i) => {
    if (r && [...r.ids, ...(r.ids2 ?? [])].every((h) => st.doc.entityIndex.has(h))) refs[i] = r;
  });
  return refs;
}

/** 치수 하나를 바꾼다(정의점 → 블록 다시 만들기, 연관 기록) */
function commitDim(st: DocState, ctx: CommandContext, before: DimensionEntity, after: DimensionEntity, refs: readonly (PointRef | null)[], label: string): void {
  const block = st.session.ownerOf(before.handle);
  if (!block) return;
  const { dim, changes } = setDimAssocChanges(st.doc, after, refs, { alloc: () => st.session.newHandle(), current: (h) => (h === before.handle ? after : st.doc.entityIndex.get(h)) });
  const ops: EditOp[] = [];
  const movedPts = (['defPoint', 'defPoint2', 'defPoint3', 'defPoint4', 'defPoint5'] as const).some((k) => before[k].x !== dim[k].x || before[k].y !== dim[k].y);
  if (movedPts) {
    try {
      ops.push(...dimensionBlockOps(st, dim, true));
    } catch {
      /* 생성기가 못 다루는 치수 */
    }
  }
  if (dim !== before) ops.push({ kind: 'modify', block, before, after: dim });
  ops.push(...toOps(st, changes, new Set([before.handle])));
  if (ops.length) st.session.commit({ label, ops, group: ctx.group });
}

export function registerDimAssocCommands(app: App): void {
  // ------------------------------------------------------------- DIMASSOC
  app.register({
    name: 'DIMASSOC',
    title: '치수 연관성',
    transparent: true,
    async run(ctx) {
      const st = app.active!;
      const cur = dimAssocMode(st.doc);
      const v = await askNumber(ctx, 'DIMASSOC에 대한 새 값 입력', cur, { int: true, min: 0, max: 2 });
      if (typeof v !== 'number' || v === cur) return;
      st.session.commit({ label: 'DIMASSOC', ops: [{ kind: 'header', name: '$DIMASSOC', before: st.doc.header.get('$DIMASSOC'), after: v }], group: ctx.group });
    },
  });

  // ------------------------------------------------------------- DIMDISASSOCIATE
  app.register({
    name: 'DIMDISASSOCIATE',
    aliases: ['DDA'],
    title: '치수 연관 해제',
    async run(ctx) {
      const st = app.active!;
      ctx.print('연관해제할 치수를 선택하십시오 ...');
      const hs = await ctx.getSelection('객체 선택:');
      const dims = hs.map((h) => st.doc.entityIndex.get(h)).filter((e): e is DimensionEntity => e?.type === 'DIMENSION' && !!dimAssocOf(st.doc, e));
      const open = unlockedOnly(app, dims.map((d) => d.handle));
      const filtered = hs.length - open.length;
      app.clearSelection();
      let n = 0;
      for (const h of open) {
        const d = st.doc.entityIndex.get(h) as DimensionEntity;
        commitDim(st, ctx, d, d, [], 'DIMDISASSOCIATE');
        n++;
      }
      if (filtered > 0) ctx.print(`${filtered}개가 걸러짐`);
      ctx.print(`${n}개가 연관해제됨`);
    },
  });

  // ------------------------------------------------------------- DIMREGEN
  app.register({
    name: 'DIMREGEN',
    title: '치수 재생성',
    run(ctx) {
      const st = app.active!;
      const r = regenAssociations(st.doc, () => st.session.newHandle());
      const plan = planOf(r);
      const ops: EditOp[] = [];
      const extra = new Set<string>();
      for (const [h, e] of plan.entities) {
        const before = st.doc.entityIndex.get(h);
        const block = st.session.ownerOf(h);
        if (!before || !block) continue;
        if (e.type === 'DIMENSION' && r.dims.has(h)) {
          try {
            ops.push(...dimensionBlockOps(st, e, true, extra));
          } catch {
            /* 생성기가 못 다루는 치수 */
          }
        }
        ops.push({ kind: 'modify', block, before, after: e });
      }
      pushAll(ops, plan.objectOps);
      if (ops.length) st.session.commit({ label: 'DIMREGEN', ops, group: ctx.group });
    },
  });

  // ------------------------------------------------------------- DIMREASSOCIATE
  app.register({
    name: 'DIMREASSOCIATE',
    aliases: ['DRE'],
    title: '치수 재연관',
    async run(ctx) {
      const st = app.active!;
      const doc = st.doc;
      ctx.print('재연관시킬 치수를 선택하십시오 ...');
      let hs: string[];
      try {
        hs = await ctx.getSelection('객체 선택 또는 [연관해제됨(D)]:', { keywords: [{ key: 'D', label: '연관해제됨' }] });
      } catch (e) {
        if ((e as { keyword?: string }).keyword !== 'D') throw e;
        // 지금 공간에서 연관되지 않은 치수 전부(잠긴 도면층 제외)
        hs = (doc.blocks.get(st.space)?.entities ?? []).filter((x) => x.type === 'DIMENSION' && !liveRefs(st, x).some((r) => r)).map((x) => x.handle);
        ctx.print(`${hs.length}개를 찾음`);
      }
      const dims = unlockedOnly(app, hs)
        .map((h) => doc.entityIndex.get(h))
        .filter((e): e is DimensionEntity => e?.type === 'DIMENSION');
      app.clearSelection();
      if (!dims.length) return;
      for (const d0 of dims) {
        const d = doc.entityIndex.get(d0.handle) as DimensionEntity | undefined;
        if (!d) continue;
        await reassociate(app, ctx, d);
      }
    },
  });
}

/** 치수 하나 재연관(종류별 프롬프트) */
async function reassociate(app: App, ctx: CommandContext, dim: DimensionEntity): Promise<void> {
  const st = app.active!;
  const doc = st.doc;
  const keys = assocKeys(dim);
  const refs = liveRefs(st, dim);
  const pts = new Map<DefKey, Pt>();
  let touched = false;
  const P = (k: DefKey): Pt => pts.get(k) ?? { x: dim[k].x, y: dim[k].y };
  const show = (only?: DefKey[]) => () => [
    markers(
      app,
      keys
        .map((k, i) => ({ k, i }))
        .filter((x): x is { k: DefKey; i: number } => !!x.k && (!only || only.includes(x.k)))
        .map(({ k, i }) => ({ p: P(k), on: !!refs[i] })),
    ),
  ];
  const idx = (k: DefKey) => keys.indexOf(k);
  /** 표식을 곧바로 보인다(커서를 움직이면 점 요청의 미리보기가 같은 표식을 그린다) */
  const mark = (only?: DefKey[]) => {
    app.view.overlay.ghost = show(only)();
    app.view.requestOverlay();
  };
  /** 점 하나: Enter = 다음(그대로). 스냅이 없으면 그 점으로 옮기고 연관하지 않는다 */
  const askPoint = async (k: DefKey, prompt: string, kws: Keyword[] = []): Promise<'next' | 'done' | { keyword: string }> => {
    mark([k]);
    const r = await ctx.getPoint(prompt, { keywords: kws, ghost: show([k]) });
    if ('enter' in r) return 'next';
    if ('keyword' in r) return { keyword: r.keyword };
    if (!('point' in r)) return 'done';
    const ref = pointRef(app, r);
    const i = idx(k);
    pts.set(k, ref ? { x: ref.point.x, y: ref.point.y } : r.point);
    if (i >= 0) refs[i] = ref;
    touched = true;
    return 'next';
  };
  /** 객체 하나: ok는 고른 객체와 고른 점을 받는다(받지 않으면 다시 선택) */
  const askEntity = async (prompt: string, ok: (e: Entity, at: Pt) => boolean): Promise<{ e: Entity; at: Pt } | null> => {
    mark();
    for (;;) {
      const r = await ctx.getEntity(prompt);
      if (!('handle' in r)) return null;
      const e = doc.entityIndex.get(r.handle);
      if (e && ok(e, r.point)) return { e, at: r.point };
      ctx.print('객체를 다시 선택하십시오.', 'err');
    }
  };
  const t = dim.dimType & 7;
  if (dim.subtype === 'ARC_DIMENSION') {
    // 192차: 프롬프트(AutoCAD 2026 한국어판)대로 폴리선 호 세그먼트도 받는다 — Autodesk DIMARC 도움말의 첫 프롬프트도 호 또는 폴리선 호 세그먼트이고,
    // 연관 치수 도움말이 연관하지 않는 객체로 적은 것(해치·이미지·언더레이·다중선·2D 솔리드·두께 있는 객체)에 폴리선은 없다. 세그먼트는 DIMARC 만들기와 같은
    // 182차 `polyArcOf`(가장 가까운 세그먼트가 호일 때, 맞춤이 아닌 2D POLYLINE도, −Z는 평면도)로 고르고, ARC처럼 반시계 시작(13)·끝(14)·중심(15)에 연관한다.
    // 참조는 고른 세그먼트 번호 표지로 만든다(`segmentSnapRef`). 전에는 거르개가 ARC만 받아 폴리선을 고르면 다시 선택하게 했다 — 182차부터 연관 없이
    // 만든 폴리선 호 길이 치수를 연관할 길이 없었다. ARC 갈래는 그대로
    const sel = await askEntity('호 또는 폴리선 호 세그먼트 선택 <다음>:', (e, at) => e.type === 'ARC' || polyArcOf(e, at)?.seg !== undefined);
    if (sel && sel.e.type === 'ARC') {
      // 194차: 호의 평면도 중심·반시계 범위(`circleOf` — DIMARC 만들기 174차와 같은 규칙). −Z 호의 OCS 중심·각도는 X 거울상 자리라 전에는
      // 정의점을 거기로 옮기고 연관하지 못했다. 자연 +Z·돌출 방향이 기운 호는 OCS 값 그대로(같은 값)
      const e = sel.e;
      const g = circleOf(e)!;
      const a = { x: g.c.x + g.r * Math.cos(g.a0!), y: g.c.y + g.r * Math.sin(g.a0!) };
      const b = { x: g.c.x + g.r * Math.cos(g.a1!), y: g.c.y + g.r * Math.sin(g.a1!) };
      const cen = { x: g.c.x, y: g.c.y };
      const r0 = objectRef(app, e, OSNAP.END, a);
      const r1 = objectRef(app, e, OSNAP.END, b);
      const rc = objectRef(app, e, OSNAP.CEN, cen);
      refs[0] = r0;
      refs[1] = r1;
      refs[2] = rc;
      pts.set('defPoint2', a);
      pts.set('defPoint3', b);
      pts.set('defPoint4', cen);
      touched = true;
    } else if (sel) {
      const g = polyArcOf(sel.e, sel.at);
      const seg = g?.seg;
      if (g && seg !== undefined) {
        const on = (a: number): Pt => ({ x: g.c.x + g.r * Math.cos(a), y: g.c.y + g.r * Math.sin(a) });
        const want: [DefKey, number, Pt][] = [
          ['defPoint2', OSNAP.END, on(g.a0)],
          ['defPoint3', OSNAP.END, on(g.a1)],
          ['defPoint4', OSNAP.CEN, { x: g.c.x, y: g.c.y }],
        ];
        want.forEach(([k, osnap, p], i) => {
          const ref = segmentSnapRef(sel.e, osnap, seg, p, Math.max(tolFor(p) * 10, 1e-9));
          refs[i] = ref;
          pts.set(k, ref ? { x: ref.point.x, y: ref.point.y } : p);
        });
        touched = true;
      }
    }
  } else if (t === 0 || t === 1) {
    const r = await askPoint('defPoint2', '첫 번째 치수보조선 원점 지정 또는 [객체 선택(S)] <다음>:', [{ key: 'S', label: '객체 선택' }]);
    if (r === 'done') return;
    if (typeof r === 'object' && r.keyword === 'S') {
      // 191차: Autodesk DIMREASSOCIATE 도움말 — 선형·정렬 치수의 첫 원점 프롬프트에서 S를 넣고 형상 객체를 고른다(받는 종류·점은 적지 않음).
      // 같은 옵션인 DIMLINEAR·DIMALIGNED <객체 선택>의 원점(`originsFromEntity` — 고른 선·호의 끝점, 폴리선은 고른 세그먼트의 두 꼭짓점,
      // 호 세그먼트는 호 위 거리, −Z 호·폴리선은 평면도 자리, 맞춤이 아닌 2D POLYLINE도)에 연관한다. 전에는 176·189차 이전의 옛 사본이라
      // 호 세그먼트의 불룩한 쪽을 고르면 이웃 세그먼트에 연관했고, 2D POLYLINE은 다시 선택하게 했으며, −Z 호·폴리선은 X 거울상 자리로 옮겼다.
      // 선·경량 폴리선·호는 전처럼 받고, 2D POLYLINE은 원점이 나올 때만 받는다(맞춤·3D·돌출 방향이 기운 것은 전처럼 다시 선택)
      const sel = await askEntity(
        '객체 선택:',
        (e, at) => e.type === 'LINE' || e.type === 'ARC' || e.type === 'LWPOLYLINE' || (e.type === 'POLYLINE' && originsFromEntity(e, at) !== null),
      );
      if (sel) {
        const ends = originsFromEntity(sel.e, sel.at);
        if (ends) {
          refs[0] = objectRef(app, sel.e, OSNAP.END, ends[0]);
          refs[1] = objectRef(app, sel.e, OSNAP.END, ends[1]);
          pts.set('defPoint2', ends[0]);
          pts.set('defPoint3', ends[1]);
          touched = true;
        }
      }
    } else {
      const r2 = await askPoint('defPoint3', '두 번째 치수보조선 원점 지정 <다음>:');
      if (r2 === 'done') return;
    }
  } else if (t === 2) {
    for (const [i, prompt] of [
      [0, '첫 번째 선 선택 <다음>:'],
      [1, '두 번째 선 선택 <다음>:'],
    ] as const) {
      const sel = await askEntity(prompt, (e) => e.type === 'LINE');
      if (!sel || sel.e.type !== 'LINE') continue;
      const e = sel.e;
      const [ka, kb] = i === 0 ? (['defPoint2', 'defPoint3'] as const) : (['defPoint4', 'defPoint'] as const);
      refs[idx(ka)] = objectRef(app, e, OSNAP.END, e.start);
      refs[idx(kb)] = objectRef(app, e, OSNAP.END, e.end);
      pts.set(ka, { x: e.start.x, y: e.start.y });
      pts.set(kb, { x: e.end.x, y: e.end.y });
      touched = true;
    }
  } else if (t === 5) {
    const r = await askPoint('defPoint4', '각도 정점 지정 또는 [호 또는 원 선택(S)] <다음>:', [{ key: 'S', label: '호 또는 원 선택' }]);
    if (r === 'done') return;
    if (typeof r === 'object' && r.keyword === 'S') {
      const sel = await askEntity('호 또는 원 선택:', (e) => e.type === 'ARC' || e.type === 'CIRCLE');
      if (sel) {
        // 194차: 원·호의 평면도 중심·반시계 범위(`circleOf` — DIMANGULAR 만들기 175차와 같은 규칙, −Z는 X 거울상 자리에서 돌아옴, +Z는 같은 값)
        const e = sel.e as Extract<Entity, { type: 'ARC' | 'CIRCLE' }>;
        const g = circleOf(e)!;
        const cen = { x: g.c.x, y: g.c.y };
        refs[2] = objectRef(app, e, OSNAP.CEN, cen);
        pts.set('defPoint4', cen);
        if (e.type === 'ARC') {
          const a = { x: g.c.x + g.r * Math.cos(g.a0!), y: g.c.y + g.r * Math.sin(g.a0!) };
          const b = { x: g.c.x + g.r * Math.cos(g.a1!), y: g.c.y + g.r * Math.sin(g.a1!) };
          refs[0] = objectRef(app, e, OSNAP.END, a);
          refs[1] = objectRef(app, e, OSNAP.END, b);
          pts.set('defPoint2', a);
          pts.set('defPoint3', b);
        } else {
          const ref = curveRef(app, e, sel.at);
          if (ref) {
            refs[0] = ref;
            pts.set('defPoint2', { x: ref.point.x, y: ref.point.y });
          }
          await askPoint('defPoint3', '두 번째 각도 끝점 지정 <다음>:');
        }
        touched = true;
      }
    } else {
      if ((await askPoint('defPoint2', '첫 번째 각도 끝점 지정 <다음>:')) === 'done') return;
      if ((await askPoint('defPoint3', '두 번째 각도 끝점 지정 <다음>:')) === 'done') return;
    }
  } else if (t === 3 || t === 4) {
    const sel = await askEntity('호 또는 원 선택 <다음>:', (e) => e.type === 'ARC' || e.type === 'CIRCLE');
    if (sel) {
      // 194차: 원·호의 평면도 중심(`circleOf` — DIMRADIUS·DIMDIAMETER 만들기 174차와 같은 규칙, −Z는 X 거울상 자리에서 돌아옴, +Z는 같은 값)
      const e = sel.e as Extract<Entity, { type: 'ARC' | 'CIRCLE' }>;
      const g = circleOf(e)!;
      const c = { x: g.c.x, y: g.c.y };
      const old = P('defPoint4');
      const oc = t === 4 ? P('defPoint') : { x: (P('defPoint').x + old.x) / 2, y: (P('defPoint').y + old.y) / 2 };
      let a = Math.atan2(old.y - oc.y, old.x - oc.x);
      if (!Number.isFinite(a)) a = 0;
      const chord = { x: c.x + g.r * Math.cos(a), y: c.y + g.r * Math.sin(a) };
      refs[0] = curveRef(app, e, chord);
      pts.set('defPoint4', chord);
      if (t === 4) {
        refs[1] = objectRef(app, e, OSNAP.CEN, c);
        pts.set('defPoint', c);
      } else {
        const far = { x: 2 * c.x - chord.x, y: 2 * c.y - chord.y };
        refs[1] = curveRef(app, e, far);
        pts.set('defPoint', far);
      }
      touched = true;
    }
  } else if (t === 6) {
    if ((await askPoint('defPoint2', '피쳐 위치 지정 <다음>:')) === 'done') return;
  }
  if (!touched) return;
  const moved = pts.size ? (movedDimension(doc, dim, pts as Map<DefKey, Pt>) ?? dim) : dim;
  if (moved !== dim && arcEndsSwapped(moved, pts)) [refs[0], refs[1]] = [refs[1] ?? null, refs[0] ?? null];
  commitDim(st, ctx, dim, moved, refs, 'DIMREASSOCIATE');
}

/** 치수 선택 도우미(테스트·다른 명령용): 연관 치수인지 */
export function isAssociativeDimension(st: DocState, d: DimensionEntity): boolean {
  return liveRefs(st, d).some((r) => r);
}
