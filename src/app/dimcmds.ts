/**
 * 치수 작성: DIMLINEAR, DIMALIGNED, DIMANGULAR, DIMRADIUS, DIMDIAMETER, DIMORDINATE, DIMARC
 * 치수 그림(익명 *D 블록)은 src/edit/dim의 생성기가 치수 스타일대로 만든다.
 * DIMASSOC가 2이면 객체 스냅으로 찍은 점·고른 객체에 치수를 연관시킨다(dimassoc.ts), 0이면 분해된 치수를 만든다.
 * 프롬프트와 옵션은 AutoCAD 2026 한국어판을 따른다.
 * 배치의 도면 공간(22·23차): 점은 뷰포트에 보이는 모형 객체에도 스냅하고, 객체 고르기는 단일 뷰포트에 보이는 모형 객체도 고른다(vpsnap.ts).
 * 근거(AutoCAD 도움말, 우리말 요약): "To Set Dimension Scale for Creating Dimensions in a Layout" — 도면 공간에서 모형 공간 점에
 * 객체 스냅으로 잡거나 객체를 바로 골라 모형 공간 값의 치수를 만든다. DIMLFAC — 반지름·지름·좌표를 포함한 모든 선형 치수 거리에
 * 곱하고, 각도 치수에는 효과가 없다. 그래서 모형 객체를 재는 선형·정렬·반지름·지름·호 길이·세로좌표 치수는 뷰포트 축척을
 * DIMLFAC 재지정(viewportScaled)으로 맞추고, 각도 치수는 그대로 둔다(뷰포트 변환은 회전과 확대뿐이라 각도가 같다).
 */
import type { BlockDef, BlockRecord, CadDocument, DimensionEntity, Entity, Layer, Vec3 } from '../core/model';
import { tableKey } from '../core/model';
import { formatLength } from '../core/units';
import {
  createAlignedDimension,
  createAngular2LineDimension,
  createAngularDimension,
  createArcLengthDimension,
  createDiameterDimension,
  createLinearDimension,
  createOrdinateDimension,
  createRadialDimension,
  dimensionText,
  generateDimensionGeometry,
  measureVars,
  nextDimBlockName,
  ordinateChainEnd,
  placeIn,
  rawDimVars,
} from '../edit/dim';
import type { DimKindName } from '../edit/dim/format';
import { angularSpan } from '../edit/dim/angular';
import { OSNAP, type PointRef, circlePointRef } from '../edit/dim/assoc';
import type { EditOp } from '../edit/session';
import type { App, CommandContext, EntityResult, Keyword } from './app';
import { finishNewDimension, inheritedRef, newDimensionAssocOps, objectRef, pointRef, snapNewDimension } from './dimassoc';
import type { DocState } from './docstate';
import { textDialog } from './draw';
import { headerOverrides, overridesOf } from './dimstyle';
import { applyOverrides } from '../edit/annot/override';
import type { OverlayGeom, Pt } from './view';
import { lwCount, lwVertices } from '../core/lwpoly';
import type { ViewportXf } from './scene';
import { circleToPaper, layoutXfs, modelToPaperVp, paperProjection } from './vpsnap';
import { plainText } from './inquiry';
import { currentUcs, ucsOrigin } from './ucs';

const v3 = (p: Pt): Vec3 => ({ x: p.x, y: p.y, z: 0 });

/** 치수 명령의 객체 고르기: 도면 공간이면 단일 뷰포트에 보이는 모형 객체도(결과의 viewport) */
export const VP_PICK = { viewportPick: true } as const;

/** 도면 공간에서 고른 뷰포트 안 모형 객체(getEntity의 viewportPick)의 뷰포트 변환. 배치 객체를 골랐으면 null */
export function pickedViewport(app: App, r: EntityResult): ViewportXf | null {
  if (!('handle' in r) || !r.viewport) return null;
  const st = app.active!;
  const h = r.viewport.handle;
  return layoutXfs(st.doc, st.layoutFor(st.displaySpace)).find((v) => v.vp.handle === h) ?? null;
}

/** 모형 점을 그 뷰포트로 본 종이 점(Z는 0 — 도면 공간 점). vx가 없으면(배치 객체) 그대로 */
const toPaper = (vx: ViewportXf | null, p: Vec3): Vec3 => (vx ? v3(modelToPaperVp(vx, p)) : p);

/** 블록 이름이 이 치수 하나만 쓰는 익명 블록인지 */
function ownBlock(doc: CadDocument, dim: DimensionEntity): boolean {
  if (!/^\*D/i.test(dim.block)) return false;
  let n = 0;
  for (const b of doc.blocks.values())
    for (const e of b.entities) if (e.type === 'DIMENSION' && tableKey(e.block) === tableKey(dim.block) && e.handle !== dim.handle) n++;
  return n === 0;
}

/**
 * 치수 객체의 그림을 (다시) 만들어 블록 작업과 함께 돌려준다.
 * reuse가 참이면 이 치수만 쓰는 블록을 그대로 바꾸고, 아니면 새 *D 블록을 만든다.
 * 치수 객체의 block·textMid·measurement는 여기서 채운다(객체 자체를 넣는 작업은 부르는 쪽이 만든다).
 */
export function dimensionBlockOps(st: DocState, dim: DimensionEntity, reuse: boolean, extraNames: Set<string> = new Set()): EditOp[] {
  const doc = st.doc;
  const s = st.session;
  const g = generateDimensionGeometry(doc, dim);
  dim.textMid = g.textMid;
  dim.measurement = g.measurement;
  const ops: EditOp[] = [];
  // 기본 화살촉 블록, 정의점 도면층
  for (const ab of g.arrowBlocks) {
    const key = tableKey(ab.name);
    if (doc.blocks.has(key) || extraNames.has(key)) continue;
    extraNames.add(key);
    const rec: BlockRecord = { name: ab.name, handle: s.newHandle(), flags: 0, insertUnits: 0, explodable: true, scalable: true };
    for (const e of ab.entities) {
      e.handle = s.newHandle();
      e.owner = rec.handle;
    }
    ops.push({ kind: 'blockRecord', key, before: null, after: rec }, { kind: 'blockDef', key, before: null, after: { name: ab.name, handle: s.newHandle(), recordHandle: rec.handle, basePoint: { x: 0, y: 0, z: 0 }, flags: 0, entities: ab.entities, endHandle: s.newHandle() } });
  }
  const dl = tableKey(g.defpointsLayer);
  if (g.defpointsLayer && !doc.layers.has(dl) && !extraNames.has(`layer:${dl}`)) {
    extraNames.add(`layer:${dl}`);
    const l0 = doc.layers.get('0');
    const layer: Layer = { name: g.defpointsLayer, handle: s.newHandle(), flags: 0, color: { aci: 7 }, off: false, frozen: false, locked: false, linetype: 'Continuous', lineweight: -3, plot: false, transparency: 255, plotStyle: l0?.plotStyle };
    ops.push({ kind: 'layer', key: dl, before: null, after: layer });
  }
  // 치수 블록
  const before = reuse && dim.block && ownBlock(doc, dim) ? doc.blocks.get(tableKey(dim.block)) : undefined;
  let name = before?.name ?? '';
  if (!name) {
    name = nextDimBlockName(doc);
    while (extraNames.has(tableKey(name))) name = `*D${Number(name.slice(2)) + 1}`;
    extraNames.add(tableKey(name));
  }
  const key = tableKey(name);
  let recordHandle = before?.recordHandle ?? doc.blockRecords.get(key)?.handle;
  if (!recordHandle) {
    recordHandle = s.newHandle();
    ops.push({ kind: 'blockRecord', key, before: null, after: { name, handle: recordHandle, flags: 1, insertUnits: 0, explodable: true, scalable: true } });
  }
  for (const e of g.entities) {
    e.handle = s.newHandle();
    e.owner = recordHandle;
  }
  const def: BlockDef = { name, handle: before?.handle ?? s.newHandle(), recordHandle, basePoint: { x: 0, y: 0, z: 0 }, flags: 1, entities: g.entities, endHandle: before?.endHandle ?? s.newHandle() };
  ops.push({ kind: 'blockDef', key, before: before ?? null, after: def });
  dim.block = name;
  return ops;
}

/**
 * 새 치수를 지금 공간에 넣는다. refs는 점 참조 번호 차례의 연관 참조(DIMASSOC 2일 때만 쓴다).
 * 넣은 작업 수를 돌려준다(명령 안의 명령 취소용).
 */
export function addDimension(app: App, ctx: CommandContext, dim: DimensionEntity, label: string, refs: readonly (PointRef | null)[] = []): number {
  const st = app.active!;
  withStyleOverrides(st.doc, dim);
  const assoc = snapNewDimension(app, dim, refs);
  // 놓일 공간을 먼저 정한다: 치수 그림의 문자가 모형 공간 치수의 음수 DIMLFAC를 1로 쓴다(edit/dim/vars.ts measureVars)
  placeDimension(st, dim);
  const blockOps = dimensionBlockOps(st, dim, false);
  dim.handle = st.session.newHandle();
  const assocOps = assoc ? newDimensionAssocOps(app, dim, refs) : [];
  const ops: EditOp[] = [...blockOps, { kind: 'add', block: st.space, entity: dim }, ...assocOps];
  st.session.commit({ label, ops, group: ctx.group });
  const shownDim = { ...dim };
  const n = ops.length + finishNewDimension(app, ctx, dim.handle, label);
  printDimText(app, ctx, shownDim);
  return n;
}

/** 새 치수가 지금 공간에 놓이는 자리(소유 블록 레코드와 도면 공간 표지 — edit/dim/vars.ts placeIn) */
function placeDimension(st: DocState, dim: DimensionEntity): void {
  placeIn(st.doc, st.space, dim);
}

/**
 * <스타일 재지정>: 머리말 치수 변수가 현재 치수 스타일과 다르면 새 치수가 그 값을 자기 재지정으로 지닌다(AutoCAD와 같다).
 * 치수가 현재 스타일이 아니거나 이미 재지정을 가진 변수는 그대로 둔다.
 */
export function withStyleOverrides(doc: CadDocument, dim: DimensionEntity): void {
  const cur = String(doc.header.get('$DIMSTYLE') ?? '');
  if (!cur || tableKey(dim.dimStyle || 'Standard') !== tableKey(cur)) return;
  const ov = overridesOf(doc, headerOverrides(doc, cur));
  for (const k of Object.keys(dim.overrides ?? {})) delete ov[Number(k)];
  if (Object.keys(ov).length) Object.assign(dim, applyOverrides(dim, ov));
}

/**
 * 도면 공간 치수가 뷰포트 하나(축척 k = 종이/모형)의 모형 점 둘을 재면 측정값을 모형 공간 거리로: DIMLFAC 재지정 = −|지금 DIMLFAC| ÷ k.
 * 근거(AutoCAD 도움말, 우리말 요약): "To Set Dimension Scale for Creating Dimensions in a Layout" — 도면 공간에서 모형 공간의 점에
 * 객체 스냅으로 잡아 모형 공간 값의 치수를 만든다. "About Setting the Scale for Dimensions" — 연관 치수는 뷰포트 축척 맞춤이
 * 지금 DIMLFAC와 합쳐져 치수 스타일 재지정으로 남고, 비연관 치수는 DIMLFAC를 뷰포트마다 정해야 한다. DIMLFAC — 음수는 도면 공간에서만
 * 쓰고, 뷰포트(Viewport) 옵션은 모형 → 종이 축척의 음수를 넣는다. 이 앱은 아직 공간을 넘는 연관을 만들지 않으므로 비연관 치수에 그 값을 넣는다
 */
export function viewportScaled(doc: CadDocument, dim: DimensionEntity, k: number): DimensionEntity {
  if (!(k > 0) || !Number.isFinite(k)) return dim;
  withStyleOverrides(doc, dim);
  const cur = Number(rawDimVars(doc, dim).DIMLFAC ?? 1) || 1;
  return applyOverrides(dim, { 144: -Math.abs(cur) / k });
}

/** 치수 문자 안내 */
function printDimText(app: App, ctx: CommandContext, dim: DimensionEntity): void {
  const st = app.active!;
  const t = dim.dimType & 7;
  const kind: DimKindName = dim.subtype === 'ARC_DIMENSION' ? 'arc' : t === 2 || t === 5 ? 'angular' : t === 3 ? 'diameter' : t === 4 ? 'radius' : t === 6 ? 'ordinate' : 'linear';
  let shown: string;
  try {
    shown = dimensionText(measureVars(st.doc, dim), kind, dim.measurement, '').measured;
  } catch {
    shown = formatLength(dim.measurement, st.units);
  }
  // 각도·지름·호 기호(\U+00B0 등)와 서식 코드는 글자로(이전에는 코드 그대로 보였다)
  ctx.print(`치수 문자 = ${plainText(dim.text && dim.text !== '<>' ? dim.text.replace('<>', shown) : shown)}`);
}

/** 원·호 객체(연관 참조용) */
function circleEntity(e: Entity | undefined): Entity | undefined {
  return e && (e.type === 'CIRCLE' || e.type === 'ARC') ? e : undefined;
}

/** 문서 기본 치수 스타일 옵션(문자 재지정) */
export interface DimOpts {
  text?: string;
  /** 여러 줄 문자(M) 편집기의 <> 칩에 보일 측정값(모르면 <>) */
  measure?: string;
  /** 각도(A): 치수 문자 각도(라디안, DXF 53). 0이면 기본 방향 */
  angle?: number;
}

/** 옵션(문자 각도)을 새 치수에 */
export function withDimOpts(d: DimensionEntity, o: DimOpts): DimensionEntity {
  if (o.angle) d.textRotation = o.angle;
  return d;
}

/** 미리보기 형상 */
export function preview(app: App, make: (p: Pt) => DimensionEntity | null): (p: Pt) => OverlayGeom[] {
  return (p) => {
    const pk = app.picker();
    const d = make(p);
    if (!pk || !d) return [];
    // 놓일 공간에서 그리는 것과 같게(모형 공간 치수의 음수 DIMLFAC는 1)
    if (!d.owner && d.paperSpace === undefined) placeDimension(app.active!, d);
    try {
      const g = generateDimensionGeometry(app.active!.doc, d);
      return [pk.geometryOf(g.entities)];
    } catch {
      return [];
    }
  };
}

/** 문자(T)·여러 줄 문자(M)·각도(A) 옵션 처리. 계속하면 true */
export async function textOption(ctx: CommandContext, key: string, o: DimOpts): Promise<boolean> {
  if (key === 'A') {
    for (;;) {
      const r = await ctx.getPoint(`치수 문자의 각도를 지정 <${+(((o.angle ?? 0) * 180) / Math.PI).toFixed(4)}>:`, { preferNumber: true });
      if ('text' in r) {
        const v = Number(r.text);
        if (!Number.isFinite(v)) {
          ctx.print('각도를 입력하십시오.', 'err');
          continue;
        }
        o.angle = (v * Math.PI) / 180;
      } else if ('point' in r) {
        const r2 = await ctx.getPoint('두 번째 점 지정:', { base: r.point });
        if ('point' in r2) o.angle = Math.atan2(r2.point.y - r.point.y, r2.point.x - r.point.x);
      }
      return true;
    }
  }
  if (key === 'T') {
    const r = await ctx.getPoint(`치수 문자를 입력 <${o.text ? o.text : '<>'}>:`, { allowText: true });
    if ('text' in r) o.text = r.text;
    return true;
  }
  if (key === 'M') {
    const t = await textDialog('치수 문자(<>는 측정값)', o.text || '<>', 0, { app: ctx.app, ctx, measure: o.measure });
    if (t) o.text = t.text;
    return true;
  }
  return false;
}

/** 선택한 객체에서 두 치수보조선 원점(선·폴리선 세그먼트·호) */
export function originsFromEntity(e: Entity | undefined, pick: Pt): [Pt, Pt] | null {
  if (!e) return null;
  if (e.type === 'LINE') return [e.start, e.end];
  if (e.type === 'ARC') {
    const a = { x: e.center.x + e.radius * Math.cos(e.startAngle), y: e.center.y + e.radius * Math.sin(e.startAngle) };
    const b = { x: e.center.x + e.radius * Math.cos(e.endAngle), y: e.center.y + e.radius * Math.sin(e.endAngle) };
    return [a, b];
  }
  if (e.type === 'LWPOLYLINE' && lwCount(e) >= 2) {
    const vs = lwVertices(e);
    const n = e.closed ? vs.length : vs.length - 1;
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < n; i++) {
      const a = vs[i]!;
      const b = vs[(i + 1) % vs.length]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const L = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((pick.x - a.x) * dx + (pick.y - a.y) * dy) / L));
      const d = Math.hypot(a.x + dx * t - pick.x, a.y + dy * t - pick.y);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    const a = vs[best]!;
    const b = vs[(best + 1) % vs.length]!;
    return [a, b];
  }
  return null;
}

/** 호·원에서 중심·반지름(폴리선 볼록 세그먼트 포함) */
function circleOf(e: Entity | undefined): { c: Pt; r: number; a0?: number; a1?: number } | null {
  if (!e) return null;
  if (e.type === 'CIRCLE') return { c: e.center, r: e.radius };
  if (e.type === 'ARC') return { c: e.center, r: e.radius, a0: e.startAngle, a1: e.endAngle };
  return null;
}

export function registerDimCommands(app: App): void {
  // ------------------------------------------------------------- DIMLINEAR·DIMALIGNED
  const linear = (aligned: boolean) => async (ctx: CommandContext) => {
    const st = app.active!;
    const doc = st.doc;
    let p1: Pt;
    let p2: Pt;
    let refs: (PointRef | null)[] = [];
    // 배치의 도면 공간이면 원점은 뷰포트에 보이는 모형 객체에도 스냅하고, 두 점이 같은 뷰포트 하나의 모형 스냅이면 그 축척으로 맞춘다
    let vx: ViewportXf | null = null;
    const r1 = await ctx.getPoint('첫 번째 치수보조선 원점 지정 또는 <객체 선택>:', { viewportSnaps: true });
    if ('enter' in r1) {
      // 도면 공간이면 단일 뷰포트에 보이는 모형 선·호·폴리선 세그먼트도 고른다: 원점은 그 뷰포트로 본 종이 점, 값은 뷰포트 축척으로 맞춘다
      const pick = await ctx.getEntity('치수기입할 객체 선택:', undefined, VP_PICK);
      if (!('handle' in pick)) return;
      const picked = doc.entityIndex.get(pick.handle);
      const pvx = pickedViewport(app, pick);
      const o = originsFromEntity(picked, pvx && pick.viewport ? pick.viewport.model : pick.point);
      if (!o) {
        ctx.print('선, 호, 폴리선 세그먼트를 선택하십시오.', 'err');
        return;
      }
      if (pvx) {
        // 공간을 넘는 연관은 아직 만들지 않는다(비연관 — 원점 스냅과 같다)
        p1 = modelToPaperVp(pvx, o[0]);
        p2 = modelToPaperVp(pvx, o[1]);
        vx = pvx;
      } else {
        [p1, p2] = o;
        refs = [objectRef(app, picked, OSNAP.END, p1), objectRef(app, picked, OSNAP.END, p2)];
      }
    } else if ('point' in r1) {
      p1 = r1.point;
      const ref1 = pointRef(app, r1);
      const r2 = await ctx.getPoint('두 번째 치수보조선 원점 지정:', { base: p1, viewportSnaps: true });
      if (!('point' in r2)) return;
      p2 = r2.point;
      refs = [ref1, pointRef(app, r2)];
      vx = paperProjection(st, [
        { p: p1, viewport: r1.snap?.viewport },
        { p: p2, viewport: r2.snap?.viewport },
      ]);
    } else return;
    const o: DimOpts = {};
    let rotation: number | undefined;
    const scaled = (d: DimensionEntity) => (vx ? viewportScaled(doc, d, vx.k) : d);
    for (;;) {
      const make = (p: Pt) =>
        scaled(withDimOpts(aligned ? createAlignedDimension(doc, v3(p1), v3(p2), v3(p), { text: o.text }) : createLinearDimension(doc, v3(p1), v3(p2), v3(p), { text: o.text, rotation }), o));
      const kws: Keyword[] = [{ key: 'M', label: '여러 줄 문자' }, { key: 'T', label: '문자' }, { key: 'A', label: '각도' }];
      if (!aligned) kws.push({ key: 'H', label: '수평' }, { key: 'V', label: '수직' }, { key: 'R', label: '회전' });
      const r = await ctx.getPoint(`치수선의 위치 지정 또는 [${kws.map((k) => `${k.label}(${k.key})`).join('/')}]:`, { keywords: kws, ghost: preview(app, make) });
      if ('point' in r) {
        addDimension(app, ctx, make(r.point), aligned ? 'DIMALIGNED' : 'DIMLINEAR', refs);
        return;
      }
      if (!('keyword' in r)) return;
      if (await textOption(ctx, r.keyword, o)) continue;
      if (r.keyword === 'H') rotation = 0;
      else if (r.keyword === 'V') rotation = Math.PI / 2;
      else if (r.keyword === 'R') {
        const a = await ctx.getPoint('치수선의 각도 지정 <0>:', { preferNumber: true });
        rotation = 'text' in a ? ((Number(a.text) || 0) * Math.PI) / 180 : 0;
      }
    }
  };
  app.register({ name: 'DIMLINEAR', aliases: ['DLI', 'DIMLIN'], title: '선형 치수', run: linear(false) });
  app.register({ name: 'DIMALIGNED', aliases: ['DAL', 'DIMALI'], title: '정렬 치수', run: linear(true) });

  // ------------------------------------------------------------- DIMANGULAR
  app.register({
    name: 'DIMANGULAR',
    aliases: ['DAN', 'DIMANG'],
    title: '각도 치수',
    async run(ctx) {
      const st = app.active!;
      const doc = st.doc;
      const o: DimOpts = {};
      let make: ((p: Pt) => DimensionEntity) | null = null;
      // 점 참조 번호 차례: 3점 각도 [13, 14, 15(정점)], 두 선 각도 [13, 14, 15, 10]
      let refs: (PointRef | null)[] = [];
      // 사분점(Q)에 쓰는 꼭짓점과 재는 범위를 나누는 반직선 각도
      let vertex: Pt = { x: 0, y: 0 };
      let bounds: number[] = [];
      const angTo = (c: { x: number; y: number }, q: { x: number; y: number }) => Math.atan2(q.y - c.y, q.x - c.x);
      // 도면 공간이면 단일 뷰포트에 보이는 모형 호·원·선도 고르고(그 뷰포트로 본 종이 형상으로 잰다 — 각도는 축척과 무관),
      // 정점·끝점은 뷰포트에 보이는 모형 객체에도 스냅한다. 모형 객체 쪽은 연관하지 않는다(공간을 넘는 연관은 아직 없다)
      const r = await ctx.getEntity('호, 원, 선을 선택하거나 <정점 지정>:', undefined, VP_PICK);
      if ('enter' in r) {
        const v = await ctx.getPoint('각도 정점 지정:', { viewportSnaps: true });
        if (!('point' in v)) return;
        const rv = pointRef(app, v);
        const a = await ctx.getPoint('첫 번째 각도 끝점 지정:', { base: v.point, viewportSnaps: true });
        if (!('point' in a)) return;
        const ra = pointRef(app, a);
        const b = await ctx.getPoint('두 번째 각도 끝점 지정:', { base: v.point, viewportSnaps: true });
        if (!('point' in b)) return;
        refs = [ra, pointRef(app, b), rv];
        vertex = v.point;
        bounds = [angTo(v.point, a.point), angTo(v.point, b.point)];
        make = (p) => createAngularDimension(doc, v3(v.point), v3(a.point), v3(b.point), v3(p), { text: o.text });
      } else if ('handle' in r) {
        const e = doc.entityIndex.get(r.handle);
        const vx1 = pickedViewport(app, r);
        if (e?.type === 'LINE') {
          const r2 = await ctx.getEntity('두 번째 선 선택:', undefined, VP_PICK);
          if (!('handle' in r2)) return;
          const e2 = doc.entityIndex.get(r2.handle);
          if (e2?.type !== 'LINE') {
            ctx.print('선을 선택하십시오.', 'err');
            return;
          }
          const vx2 = pickedViewport(app, r2);
          const ref = (vx: ViewportXf | null, l: typeof e, p: Vec3) => (vx ? null : objectRef(app, l, OSNAP.END, p));
          refs = [ref(vx1, e, e.start), ref(vx1, e, e.end), ref(vx2, e2, e2.start), ref(vx2, e2, e2.end)];
          const s1 = toPaper(vx1, e.start);
          const t1 = toPaper(vx1, e.end);
          const s2 = toPaper(vx2, e2.start);
          const t2 = toPaper(vx2, e2.end);
          const d1 = { x: t1.x - s1.x, y: t1.y - s1.y };
          const d2 = { x: t2.x - s2.x, y: t2.y - s2.y };
          const den = d1.x * d2.y - d1.y * d2.x;
          if (Math.abs(den) > 1e-12) {
            const t = ((s2.x - s1.x) * d2.y - (s2.y - s1.y) * d2.x) / den;
            vertex = { x: s1.x + d1.x * t, y: s1.y + d1.y * t };
            const h1 = Math.atan2(d1.y, d1.x);
            const h2 = Math.atan2(d2.y, d2.x);
            bounds = [h1, h2, h1 + Math.PI, h2 + Math.PI];
          }
          make = (p) => createAngular2LineDimension(doc, s1, t1, s2, t2, v3(p), { text: o.text });
        } else if (e?.type === 'ARC') {
          const am = { x: e.center.x + e.radius * Math.cos(e.startAngle), y: e.center.y + e.radius * Math.sin(e.startAngle), z: 0 };
          const bm = { x: e.center.x + e.radius * Math.cos(e.endAngle), y: e.center.y + e.radius * Math.sin(e.endAngle), z: 0 };
          refs = vx1 ? [] : [objectRef(app, e, OSNAP.END, am), objectRef(app, e, OSNAP.END, bm), objectRef(app, e, OSNAP.CEN, e.center)];
          const c = toPaper(vx1, e.center);
          const a = toPaper(vx1, am);
          const b = toPaper(vx1, bm);
          const tw = vx1?.twist ?? 0;
          vertex = c;
          bounds = [e.startAngle - tw, e.endAngle - tw];
          make = (p) => createAngularDimension(doc, c, a, b, v3(p), { text: o.text });
        } else if (e?.type === 'CIRCLE') {
          const first = r.point;
          const c = toPaper(vx1, e.center);
          const b = await ctx.getPoint('각도의 두 번째 끝점 지정:', { base: c, ...(vx1 ? { viewportSnaps: true } : {}) });
          if (!('point' in b)) return;
          refs = vx1 ? [] : [circlePointRef(e, first), pointRef(app, b), objectRef(app, e, OSNAP.CEN, e.center)];
          vertex = c;
          bounds = [angTo(c, first), angTo(c, b.point)];
          make = (p) => createAngularDimension(doc, c, v3(first), v3(b.point), v3(p), { text: o.text });
        } else {
          ctx.print('호, 원, 선을 선택하십시오.', 'err');
          return;
        }
      } else return;
      const make0 = make;
      // 사분점(Q): 재는 각도를 고른 사분면에 묶고, 치수 호 위치가 그 밖이면 문자를 그 자리에 두고 호를 늘인다(AutoCAD와 같다)
      let quad: Pt | null = null;
      const sector = (g: number): number => {
        const rs = bounds.map((a) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)).sort((x, y) => x - y);
        const gg = ((g % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        let k = rs.length - 1;
        for (let i = 0; i < rs.length; i++) if (gg >= rs[i]! - 1e-12) k = i;
        return k;
      };
      const makeQ = (q: Pt): DimensionEntity => {
        if (!quad || bounds.length < 2) return make0(q);
        const R = Math.hypot(q.x - vertex.x, q.y - vertex.y);
        const gq = angTo(vertex, quad);
        const d = make0({ x: vertex.x + R * Math.cos(gq), y: vertex.y + R * Math.sin(gq) });
        if (sector(angTo(vertex, q)) !== sector(gq)) {
          d.textMid = v3(q);
          d.dimType |= 128;
        }
        return d;
      };
      make = (q: Pt) => withDimOpts(makeQ(q), o);
      for (;;) {
        const kws: Keyword[] = [{ key: 'M', label: '여러 줄 문자' }, { key: 'T', label: '문자' }, { key: 'A', label: '각도' }, { key: 'Q', label: '사분점' }];
        const p = await ctx.getPoint('치수 호 선 위치 지정 또는 [여러 줄 문자(M)/문자(T)/각도(A)/사분점(Q)]:', { keywords: kws, ghost: preview(app, make) });
        if ('point' in p) {
          addDimension(app, ctx, make(p.point), 'DIMANGULAR', refs);
          return;
        }
        if ('keyword' in p && p.keyword === 'Q') {
          const qp = await ctx.getPoint('사분점 지정:', { base: vertex });
          if ('point' in qp) quad = qp.point;
          continue;
        }
        if (!('keyword' in p) || !(await textOption(ctx, p.keyword, o))) return;
      }
    },
  });

  // ------------------------------------------------------------- DIMRADIUS·DIMDIAMETER·DIMARC
  const radial = (kind: 'radius' | 'diameter' | 'arc') => async (ctx: CommandContext) => {
    const st = app.active!;
    const doc = st.doc;
    // 도면 공간이면 단일 뷰포트에 보이는 모형 호·원도 고른다: 그 뷰포트로 본 종이 원·호에 치수를 두고 값은 뷰포트 축척으로 맞춘다
    const r = await ctx.getEntity(kind === 'arc' ? '호 또는 폴리선 호 세그먼트 선택:' : '호 또는 원 선택:', undefined, VP_PICK);
    if (!('handle' in r)) return;
    const picked = circleEntity(doc.entityIndex.get(r.handle));
    const vx = pickedViewport(app, r);
    const c0 = circleOf(picked);
    const c = c0 && vx ? circleToPaper(vx, c0) : c0;
    if (!c || (kind === 'arc' && c.a0 === undefined)) {
      ctx.print(kind === 'arc' ? '호를 선택하십시오.' : '호 또는 원을 선택하십시오.', 'err');
      return;
    }
    const o: DimOpts = {};
    const center = v3(c.c);
    // 호 길이 치수의 부분(P): 호 위 두 점 사이만
    let span: { a0: number; a1: number } | null = null;
    const make = (p: Pt): DimensionEntity => {
      const d = withDimOpts(make1(p), o);
      return vx ? viewportScaled(doc, d, vx.k) : d;
    };
    // 지시선(L): 90°보다 큰 호에서만(AutoCAD와 같다). 치수 호에서 재는 호로 반지름 방향(문자 쪽 각도)
    let leader = false;
    const sweepOf = () => {
      const a0 = span?.a0 ?? c.a0!;
      let sw = (span?.a1 ?? c.a1!) - a0;
      while (sw <= 0) sw += 2 * Math.PI;
      return { a0, sw };
    };
    const make1 = (p: Pt): DimensionEntity => {
      if (kind === 'arc') {
        const d = createArcLengthDimension(doc, center, c.r, span?.a0 ?? c.a0!, span?.a1 ?? c.a1!, v3(p), { text: o.text });
        if (span && d.arc) d.arc.partial = true;
        const R = Math.hypot(p.x - c.c.x, p.y - c.c.y);
        if (leader && d.arc && Math.abs(R - c.r) > 1e-9) {
          const { a0, sw } = sweepOf();
          const th = a0 + sw / 2;
          d.arc.leader1 = { x: c.c.x + c.r * Math.cos(th), y: c.c.y + c.r * Math.sin(th), z: center.z };
          d.arc.leader2 = { x: c.c.x + R * Math.cos(th), y: c.c.y + R * Math.sin(th), z: center.z };
        }
        return d;
      }
      const a = Math.atan2(p.y - c.c.y, p.x - c.c.x);
      const on = { x: c.c.x + c.r * Math.cos(a), y: c.c.y + c.r * Math.sin(a), z: 0 };
      const d = kind === 'radius' ? createRadialDimension(doc, center, c.r, on, { text: o.text }) : createDiameterDimension(doc, center, c.r, on, { text: o.text });
      // 문자 위치는 커서(사용자 위치)
      d.textMid = v3(p);
      d.dimType |= 128;
      return d;
    };
    const what = kind === 'arc' ? '호 길이 치수 위치 지정' : '치수선의 위치 지정';
    for (;;) {
      const kws: Keyword[] = [{ key: 'M', label: '여러 줄 문자' }, { key: 'T', label: '문자' }, { key: 'A', label: '각도' }];
      if (kind === 'arc') {
        kws.push({ key: 'P', label: '부분' });
        if (sweepOf().sw > Math.PI / 2 + 1e-9) kws.push(leader ? { key: 'N', label: '지시선 없음' } : { key: 'L', label: '지시선' });
      }
      const p = await ctx.getPoint(`${what} 또는 [${kws.map((k) => `${k.label}(${k.key})`).join('/')}]:`, { keywords: kws, ghost: preview(app, make) });
      if ('keyword' in p && (p.keyword === 'L' || p.keyword === 'N') && kind === 'arc') {
        leader = p.keyword === 'L';
        continue;
      }
      if ('keyword' in p && p.keyword === 'P' && kind === 'arc') {
        // 호 위의 두 점(호의 시작에서 반시계로 잰 각을 호 범위로)
        const onArc = (q: Pt): number => {
          let a = Math.atan2(q.y - c.c.y, q.x - c.c.x);
          const a0 = c.a0!;
          let sweep = c.a1! - a0;
          while (sweep <= 0) sweep += 2 * Math.PI;
          let t = a - a0;
          while (t < 0) t += 2 * Math.PI;
          if (t > sweep) t = t - sweep < 2 * Math.PI - t ? sweep : 0;
          a = a0 + t;
          return a;
        };
        // 뷰포트 안 모형 호면 두 점도 그 뷰포트에 보이는 모형 객체에 스냅한다
        const vs = vx ? { viewportSnaps: true } : {};
        const q1 = await ctx.getPoint('호 길이 치수의 첫 번째 점 지정:', vs);
        if (!('point' in q1)) continue;
        const q2 = await ctx.getPoint('호 길이 치수의 두 번째 점 지정:', vs);
        if (!('point' in q2)) continue;
        const b0 = onArc(q1.point);
        const b1 = onArc(q2.point);
        const lo = (x: number) => {
          let t = x - c.a0!;
          while (t < 0) t += 2 * Math.PI;
          return t;
        };
        span = lo(b0) <= lo(b1) ? { a0: b0, a1: b1 } : { a0: b1, a1: b0 };
        if (Math.abs(span.a1 - span.a0) < 1e-9) span = null;
        continue;
      }
      if ('point' in p) {
        const d = make(p.point);
        // 반지름 [15 현 위 점, 10 중심], 지름 [15, 10 반대쪽 현 위 점], 호 길이 [13 시작, 14 끝, 15 중심].
        // 뷰포트 안 모형 객체는 연관하지 않는다(공간을 넘는 연관은 아직 없다)
        let refs: (PointRef | null)[] = [];
        if (picked && !vx) {
          if (kind === 'arc') refs = [objectRef(app, picked, OSNAP.END, d.defPoint2), objectRef(app, picked, OSNAP.END, d.defPoint3), objectRef(app, picked, OSNAP.CEN, d.defPoint4)];
          else if (kind === 'radius') refs = [circlePointRef(picked, d.defPoint4), objectRef(app, picked, OSNAP.CEN, d.defPoint)];
          else refs = [circlePointRef(picked, d.defPoint4), circlePointRef(picked, d.defPoint)];
        }
        addDimension(app, ctx, d, kind === 'radius' ? 'DIMRADIUS' : kind === 'diameter' ? 'DIMDIAMETER' : 'DIMARC', refs);
        return;
      }
      if (!('keyword' in p) || !(await textOption(ctx, p.keyword, o))) return;
    }
  };
  app.register({ name: 'DIMRADIUS', aliases: ['DRA', 'DIMRAD'], title: '반지름 치수', run: radial('radius') });
  app.register({ name: 'DIMDIAMETER', aliases: ['DDI', 'DIMDIA'], title: '지름 치수', run: radial('diameter') });
  app.register({ name: 'DIMARC', aliases: ['DAR'], title: '호 길이 치수', run: radial('arc') });

  // ------------------------------------------------------------- DIMCONTINUE·DIMBASELINE
  /** 이어 붙일 수 있는 치수: 선형·정렬·세로좌표, 각도(세 점·두 선 — AutoCAD처럼 각도 기준선·연속) */
  const chainable = (e: Entity | undefined): e is DimensionEntity => e?.type === 'DIMENSION' && [0, 1, 6, 2, 5].includes(e.dimType & 7) && !e.subtype;
  /** 직전에 만든(또는 고른) 이어 붙일 치수 */
  const lastDim = (): DimensionEntity | null => {
    const st = app.active!;
    for (let i = app.lastCreated.length - 1; i >= 0; i--) {
      const e = st.doc.entityIndex.get(app.lastCreated[i]!);
      if (chainable(e)) return e;
    }
    return null;
  };
  const chain = (baseline: boolean) => async (ctx: CommandContext) => {
    const st = app.active!;
    const doc = st.doc;
    let base = lastDim();
    const pickBase = async (): Promise<DimensionEntity | null> => {
      const r = await ctx.getEntity(baseline ? '기준 치수 선택:' : '연속된 치수 선택:');
      if (!('handle' in r)) return null;
      const e = doc.entityIndex.get(r.handle);
      if (!chainable(e)) {
        ctx.print('선형·정렬·세로좌표·각도 치수를 선택하십시오.', 'err');
        return null;
      }
      return e;
    };
    if (!base) base = await pickBase();
    if (!base) return;
    // 기준선: 치수선 사이 간격 = DIMDLI × DIMSCALE
    const raw = rawDimVars(doc, base) as Record<string, number | string>;
    const scale = Number(raw.DIMSCALE) > 0 ? Number(raw.DIMSCALE) : 1;
    const step = (Number(raw.DIMDLI) || 0) * scale;
    let prev = base;
    let origin = baseline ? base.defPoint2 : base.defPoint3;
    const steps: number[] = [];
    // 각도 기준선의 첫 치수 호 반지름(그다음은 DIMDLI만큼씩 바깥으로)
    let angularRadius = angularSpan(base)?.R ?? 0;
    for (;;) {
      const make = (p: Pt): DimensionEntity => {
        const t = prev.dimType & 7;
        if (t === 2 || t === 5) {
          // 각도: 같은 꼭짓점에서 앞 치수의 둘째 변(연속) 또는 기준 치수의 첫 변(기준선)부터, 같은 방향으로
          const sp = angularSpan(baseline ? base! : prev);
          if (!sp) return createAngularDimension(doc, prev.defPoint4, prev.defPoint3, v3(p), prev.defPoint, { style: prev.dimStyle });
          const startP = baseline ? (sp.forward ? sp.pStart : sp.pEnd) : sp.forward ? sp.pEnd : sp.pStart;
          const a = Math.atan2(startP.y - sp.c.y, startP.x - sp.c.x);
          const b = Math.atan2(p.y - sp.c.y, p.x - sp.c.x);
          const tau = 2 * Math.PI;
          const sw = sp.forward ? (((b - a) % tau) + tau) % tau : -((((a - b) % tau) + tau) % tau);
          const R = baseline ? angularRadius + (steps.length + 1) * step : angularRadius;
          const mid = a + sw / 2;
          const arcPt = { x: sp.c.x + R * Math.cos(mid), y: sp.c.y + R * Math.sin(mid), z: 0 };
          return createAngularDimension(doc, v3(sp.c), v3(startP), v3(p), arcPt, { style: prev.dimStyle });
        }
        if (t === 6) {
          // 세로좌표: 같은 축, 지시선 끝은 앞 치수와 같은 높이·폭. 데이텀은 DIMORDINATE처럼 지금 공간의 UCS 원점(25차 — 도면 공간은 $PUCSORG),
          // 축은 지금 UCS의 방향(26차 — 높이·폭도 그 축으로 잰다. 돌지 않은 UCS는 예전과 같다)
          const xAxis = (prev.dimType & 64) !== 0;
          const ua = currentUcs(st).angle;
          const end = ordinateChainEnd(v3(p), prev.defPoint3, xAxis, ua);
          return createOrdinateDimension(doc, v3(p), end, { xAxis, style: prev.dimStyle, datum: ucsOrigin(st), ucsAngle: ua });
        }
        const rot = t === 1 ? Math.atan2(prev.defPoint3.y - prev.defPoint2.y, prev.defPoint3.x - prev.defPoint2.x) : prev.rotation;
        let line = prev.defPoint;
        if (baseline) {
          // 앞 치수선에서 원점 반대쪽으로 한 칸
          const ux = Math.cos(rot);
          const uy = Math.sin(rot);
          const nx = -uy;
          const ny = ux;
          const side = Math.sign((prev.defPoint.x - prev.defPoint2.x) * nx + (prev.defPoint.y - prev.defPoint2.y) * ny) || 1;
          line = { x: prev.defPoint.x + nx * side * step, y: prev.defPoint.y + ny * side * step, z: 0 };
        }
        return createLinearDimension(doc, origin, v3(p), line, { rotation: rot, style: prev.dimStyle });
      };
      // 도면 공간이면 두 번째 원점(세로좌표는 피쳐 위치)도 뷰포트에 보이는 모형 객체에 스냅한다(24차 — 도움말 "To Set Dimension Scale for
      // Creating Dimensions in a Layout"). 값은 이전과 같다: 도움말 DIMCONTINUE·DIMCONTINUEMODE는 앞 치수의 치수 스타일·도면층을 잇는다고만
      // 하고, 앞 치수의 뷰포트 축척 재지정을 잇는지·앞 치수와 다른 뷰포트면 어떻게 하는지는 없다(README 남은 일)
      const r = await ctx.getPoint('두 번째 치수보조선 원점 지정 또는 [선택(S)/명령 취소(U)] <선택>:', {
        keywords: [{ key: 'S', label: '선택' }, { key: 'U', label: '명령 취소' }],
        ghost: preview(app, make),
        viewportSnaps: true,
      });
      if ('point' in r) {
        const d = make(r.point);
        // 연관: 원점은 기준 치수의 같은 점 연관을 이어받는다(세로좌표는 피쳐 위치만)
        const pt = prev.dimType & 7;
        let refs: (PointRef | null)[];
        if (pt === 2 || pt === 5) {
          // 각도 [13 시작 변, 14 새 점, 15 꼭짓점]: 세 점 치수면 변의 점·꼭짓점 연관을 이어받는다
          const src = baseline ? base : prev;
          const sp = angularSpan(src);
          const three = (src.dimType & 7) === 5 && !!sp;
          const first = three ? (baseline ? 'defPoint2' : 'defPoint3') : null;
          refs = [first ? inheritedRef(app, src, first) : null, pointRef(app, r), three ? inheritedRef(app, src, 'defPoint4') : null];
        } else refs = pt === 6 ? [null, pointRef(app, r)] : [baseline ? inheritedRef(app, base, 'defPoint2') : inheritedRef(app, prev, 'defPoint3'), pointRef(app, r)];
        const label = baseline ? 'DIMBASELINE' : 'DIMCONTINUE';
        const n = addDimension(app, ctx, d, label, refs);
        steps.push(n);
        prev = d;
        if (!baseline) origin = d.defPoint3;
        continue;
      }
      if ('keyword' in r && r.keyword === 'U') {
        const n = steps.pop();
        if (n) st.session.undoLastStep(ctx.group, n);
        continue;
      }
      if ('enter' in r || ('keyword' in r && r.keyword === 'S')) {
        if ('enter' in r && steps.length) return;
        const b = await pickBase();
        if (!b) return;
        base = b;
        prev = b;
        origin = baseline ? b.defPoint2 : b.defPoint3;
        angularRadius = angularSpan(b)?.R ?? 0;
        steps.length = 0;
        continue;
      }
      return;
    }
  };
  app.register({ name: 'DIMCONTINUE', aliases: ['DCO', 'DIMCONT'], title: '연속 치수', run: chain(false) });
  app.register({ name: 'DIMBASELINE', aliases: ['DBA', 'DIMBASE'], title: '기준선 치수', run: chain(true) });

  // ------------------------------------------------------------- DIMORDINATE
  app.register({
    name: 'DIMORDINATE',
    aliases: ['DOR', 'DIMORD'],
    title: '세로좌표 치수',
    async run(ctx) {
      const st = app.active!;
      const doc = st.doc;
      // 도면 공간이면 피쳐 위치가 뷰포트에 보이는 모형 객체에도 스냅하고, 단일 뷰포트의 모형 스냅이면 그 축척으로 맞춘다
      // (DIMLFAC는 좌표에도 곱한다. 데이텀은 도움말대로 지금 UCS 원점 — 도면 공간 좌표에서 잰 거리를 모형 단위로).
      // 25차: 도면 공간의 지금 UCS는 도면 공간 UCS($PUCSORG — 도움말 UCS: 모형 공간과 도면 공간에 따로 저장)라 데이텀도 그 원점이다
      // (이전에는 어느 공간에서나 모형 공간 UCS 원점 $UCSORG). 도면 공간 UCS 원점을 모형 데이텀이 보이는 종이 자리에 두면 뷰포트 안 모형 객체의
      // 세로좌표가 모형 데이텀에서 잰 모형 단위 값이 된다(도움말 "About Creating Ordinate Dimensions" — 보통 UCS 원점을 데이텀에 맞춘 뒤 만든다)
      // 26차: X·Y 값과 지시선 축은 지금 공간 UCS의 방향(도움말 같은 곳 — UCS의 위치와 방향이 값을 정한다. DXF 51에 −UCS 각도)
      const f = await ctx.getPoint('피쳐 위치 지정:', { viewportSnaps: true });
      if (!('point' in f)) return;
      const fr = pointRef(app, f);
      const vx = f.snap?.viewport ? paperProjection(st, [{ p: f.point, viewport: f.snap.viewport }]) : null;
      const o: DimOpts = {};
      let xAxis: boolean | undefined;
      for (;;) {
        const make = (p: Pt) => {
          const d = withDimOpts(createOrdinateDimension(doc, v3(f.point), v3(p), { text: o.text, xAxis, datum: ucsOrigin(st), ucsAngle: currentUcs(st).angle }), o);
          return vx ? viewportScaled(doc, d, vx.k) : d;
        };
        const p = await ctx.getPoint('지시선 끝점을 지정 또는 [X데이텀(X)/Y데이텀(Y)/여러 줄 문자(M)/문자(T)/각도(A)]:', {
          base: f.point,
          keywords: [{ key: 'X', label: 'X데이텀' }, { key: 'Y', label: 'Y데이텀' }, { key: 'M', label: '여러 줄 문자' }, { key: 'T', label: '문자' }, { key: 'A', label: '각도' }],
          ghost: preview(app, make),
        });
        if ('point' in p) {
          addDimension(app, ctx, make(p.point), 'DIMORDINATE', [null, fr]);
          return;
        }
        if (!('keyword' in p)) return;
        if (p.keyword === 'X') xAxis = true;
        else if (p.keyword === 'Y') xAxis = false;
        else if (!(await textOption(ctx, p.keyword, o))) return;
      }
    },
  });
}
