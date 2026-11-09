/**
 * 106차: 폴리선 EXPLODE 조각을 스프레드 없이 만든다(lineFrom·arcFrom, 정점을 객체로 풀지 않음). 105차의 만들기(아래 OLD — 그대로 옮김)와
 * 무작위 폴리선(볼록도·길이 0 조각·NaN·OCS·고도·닫힘, 원본 특성 — 소유자·확장 데이터·종이 공간·숨김·두께·출력 스타일·투명도 없음)으로 견주어
 * 값·속성 차례(undefined 값 속성 포함)가 같은지, 조각마다 색 객체가 따로인지 본다.
 */
import { describe, expect, it } from 'vitest';
import type { Entity, PolylineEntity, Vec3 } from '../../src/core/model';
import { entityDefaults } from '../../src/core/model';
import { packLw, lwCount } from '../../src/core/lwpoly';
import { packPoly } from '../../src/core/polyverts';
import { explodeEntity } from '../../src/edit/geom/explode';
import { arcFrom, inherit, lineFrom, lwVerts, polyVerts } from '../../src/edit/geom/path';
import { bulgeArc } from '../../src/geom/curves';
import { normAngle } from '../../src/edit/geom/math';
import { isPlanarExt, ocsToWcs } from '../../src/edit/geom/ocs';
import { newDoc } from './make';
import { unlockedOnly } from '../../src/app/layers';
import { unmark } from '../../src/app/filetext';

// --- 105차 만들기(src/edit/geom/explode.ts e3ccdee) ---
function oldBulges(src: Entity, vs: { x: number; y: number; bulge: number }[], closed: boolean, elev: number): Entity[] {
  const out: Entity[] = [];
  const ext = src.extrusion;
  const natural = !ext || (isPlanarExt(ext) && ext.z > 0);
  const n = vs.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = vs[i]!;
    const b = vs[(i + 1) % n]!;
    const arc = Math.abs(a.bulge) > 1e-12 ? bulgeArc(a.x, a.y, b.x, b.y, a.bulge) : null;
    if (arc) {
      const lo = arc.sweep > 0 ? arc.a0 : arc.a0 + arc.sweep;
      out.push({
        type: 'ARC',
        ...inherit(src),
        center: { x: arc.cx, y: arc.cy, z: elev },
        radius: arc.r,
        startAngle: normAngle(lo),
        endAngle: normAngle(lo + Math.abs(arc.sweep)),
        extrusion: natural ? undefined : { ...ext! },
      });
    } else {
      if (Math.hypot(b.x - a.x, b.y - a.y) <= 0) continue;
      const pa = natural ? { x: a.x, y: a.y, z: elev } : ocsToWcs({ x: a.x, y: a.y, z: elev }, ext);
      const pb = natural ? { x: b.x, y: b.y, z: elev } : ocsToWcs({ x: b.x, y: b.y, z: elev }, ext);
      out.push({ type: 'LINE', ...inherit(src), start: pa, end: pb });
    }
  }
  return out;
}
function oldExplode(e: Entity): Entity[] {
  if (e.type === 'LWPOLYLINE') return oldBulges(e, lwVerts(e), e.closed, e.elevation);
  const p = e as PolylineEntity;
  const closed = (p.flags & 1) !== 0;
  if (p.kind === '2d') return oldBulges(p, polyVerts(p).map((v) => ({ x: v.location.x, y: v.location.y, bulge: v.bulge })), closed, p.elevation);
  const vs = polyVerts(p);
  const out: Entity[] = [];
  for (let i = 0; i < (closed ? vs.length : vs.length - 1); i++) out.push({ type: 'LINE', ...inherit(p), start: { ...vs[i]!.location }, end: { ...vs[(i + 1) % vs.length]!.location } });
  return out;
}

/** 값·속성 차례를 모두 담은 글(undefined·-0·NaN도 구별) */
function canon(v: unknown): string {
  if (v === undefined) return 'u';
  if (typeof v === 'number') return Object.is(v, -0) ? 'N-0' : `N${v}`;
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (ArrayBuffer.isView(v)) return `V[${Array.from(v as Float64Array).map(canon).join(',')}]`;
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  return `{${Object.keys(v)
    .map((k) => `${k}:${canon((v as Record<string, unknown>)[k])}`)
    .join(',')}}`;
}

/** 씨앗 있는 난수(mulberry32) */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EXTS: (Vec3 | undefined)[] = [undefined, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, { x: 0.6, y: 0, z: 0.8 }, { x: 0, y: 0, z: 0 }];

function randomPoly(r: () => number, seed: number): Entity {
  const n = Math.floor(r() * 9);
  const pts: { x: number; y: number; bulge: number }[] = [];
  for (let i = 0; i < n; i++) {
    const dup = i > 0 && r() < 0.2;
    const x = dup ? pts[i - 1]!.x : r() < 0.02 ? Infinity : Math.round(r() * 200 - 100) / 4;
    const y = dup ? pts[i - 1]!.y : r() < 0.05 ? NaN : Math.round(r() * 200 - 100) / 4;
    const k = r();
    const bulge = k < 0.5 ? 0 : k < 0.6 ? 1e-13 : k < 0.65 ? -0 : (r() * 4 - 2) * (r() < 0.5 ? 1 : 0.01);
    pts.push({ x, y, bulge });
  }
  const base: Record<string, unknown> = { ...entityDefaults(), handle: (0x100 + seed).toString(16).toUpperCase() };
  if (r() < 0.6) base.owner = '1F';
  if (r() < 0.2) base.xdata = [{ app: 'ACAD', items: [{ code: 1000, value: 'x' }] }];
  if (r() < 0.1) base.paperSpace = true;
  if (r() < 0.1) base.invisible = true;
  if (r() < 0.1) base.thickness = 2.5;
  if (r() < 0.1) base.plotStyle = 'A0';
  if (r() < 0.2) base.transparency = undefined;
  if (r() < 0.2) base.color = { aci: 3, rgb: 0x112233 };
  const ext = EXTS[Math.floor(r() * EXTS.length)];
  const closed = r() < 0.5;
  const kind = r();
  if (kind < 0.6)
    return { type: 'LWPOLYLINE', ...base, ...packLw(pts.map((p) => ({ ...p, startWidth: 0, endWidth: 0 }))), closed, plinegen: false, constantWidth: 0, elevation: r() < 0.5 ? 0 : 3, extrusion: ext } as Entity;
  return {
    type: 'POLYLINE',
    ...base,
    kind: kind < 0.85 ? '2d' : '3d',
    flags: closed ? 1 : 0,
    ...packPoly(pts.map((p, i) => ({ location: { x: p.x, y: p.y, z: kind < 0.85 ? 0 : i }, bulge: p.bulge, startWidth: 0, endWidth: 0, flags: 0 }))),
    elevation: r() < 0.5 ? 0 : 3,
    defaultStartWidth: 0,
    defaultEndWidth: 0,
    mCount: 0,
    nCount: 0,
    mDensity: 0,
    nDensity: 0,
    smoothType: 0,
    extrusion: ext,
  } as Entity;
}

describe('106차 폴리선 EXPLODE 조각(스프레드 없이)', () => {
  it('lineFrom·arcFrom은 { type, ...inherit(src), … }와 값·속성 차례가 같다(특성이 더 있는 원본은 그 길로)', () => {
    const srcs: Entity[] = [
      { type: 'LINE', ...entityDefaults(), start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 0, z: 0 } },
      { type: 'LINE', ...entityDefaults(), owner: 'AB', start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 0, z: 0 } },
      { type: 'LINE', ...entityDefaults(), owner: 'AB', xdata: [{ app: 'A', items: [{ code: 1000, value: 'y' }] }], thickness: 1, plotStyle: 'P', paperSpace: true, invisible: true, start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 0, z: 0 } } as Entity,
    ];
    for (const s of srcs) {
      const a = { x: 1, y: 2, z: 3 };
      const b = { x: 4, y: 5, z: 6 };
      expect(canon(lineFrom(s, a, b))).toBe(canon({ type: 'LINE', ...inherit(s), start: a, end: b }));
      for (const ext of [undefined, { x: 0, y: 0, z: -1 }])
        expect(canon(arcFrom(s, a, 2, 0.5, 1.5, ext))).toBe(canon({ type: 'ARC', ...inherit(s), center: a, radius: 2, startAngle: 0.5, endAngle: 1.5, extrusion: ext }));
      const l = lineFrom(s, a, b);
      expect(l.color).not.toBe(s.color);
      if (s.xdata) expect(l.xdata).not.toBe(s.xdata);
    }
  });

  it('무작위 폴리선 600개: 조각이 105차 만들기와 같고 색 객체는 조각마다 따로다', () => {
    const doc = newDoc();
    let pieces = 0;
    for (let seed = 1; seed <= 600; seed++) {
      const r = rng(seed);
      const e = randomPoly(r, seed);
      const want = oldExplode(e);
      const got = explodeEntity(e, doc);
      if (!want.length) {
        expect(got.add ?? []).toEqual([]);
        continue;
      }
      expect(got.remove).toEqual([e.handle]);
      expect((got.add ?? []).map(canon)).toEqual(want.map(canon));
      const colors = new Set((got.add ?? []).map((x) => x.color));
      expect(colors.size).toBe(got.add!.length);
      expect(colors.has(e.color)).toBe(false);
      pieces += got.add!.length;
    }
    // 무작위가 고르게 섞였는지(조각이 충분히 나왔는지)
    expect(pieces).toBeGreaterThan(1500);
  });

  it('잠긴 도면층 빼기(unlockedOnly)는 도면층 이름마다 한 번 찾아도 답이 같다(대소문자 다른 이름·없는 핸들·차례)', () => {
    const doc = newDoc();
    const lay = (name: string, locked: boolean) => doc.layers.set(name.toUpperCase(), { name, handle: 'L' + name, flags: 0, color: { aci: 7 }, off: false, frozen: false, locked, linetype: 'Continuous', lineweight: -3, plot: true, transparency: 255 });
    lay('잠금', true);
    lay('B', false);
    const hs: string[] = [];
    const layers = ['잠금', 'B', 'b', '없는층', '잠금', 'B'];
    layers.forEach((l, i) => {
      const h = (0x500 + i).toString(16).toUpperCase();
      doc.entityIndex.set(h, { type: 'LINE', ...entityDefaults(), handle: h, layer: l, start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 0, z: 0 } } as Entity);
      hs.push(h);
    });
    const printed: string[] = [];
    const app = { active: { doc }, cmd: { print: (t: string) => void printed.push(t) } } as unknown as Parameters<typeof unlockedOnly>[0];
    expect(unlockedOnly(app, [...hs.slice(0, 3), 'FFFF', ...hs.slice(3)])).toEqual([hs[1], hs[2], hs[3], hs[5]]);
    expect(printed.map(unmark)).toEqual(['잠긴 도면층의 객체 2개는 뺐습니다.']);
  });

  it('LWPOLYLINE 정점 수는 verts 길이로(lwCount) — 정점 0·1개는 조각 없음', () => {
    const doc = newDoc();
    for (const pts of [[], [{ x: 1, y: 1, bulge: 0.5 }]]) {
      const e = { type: 'LWPOLYLINE', ...entityDefaults(), handle: 'A1', ...packLw(pts.map((p) => ({ ...p, startWidth: 0, endWidth: 0 }))), closed: true, plinegen: false, constantWidth: 0, elevation: 0 } as Entity;
      expect(lwCount(e as Extract<Entity, { type: 'LWPOLYLINE' }>)).toBe(pts.length);
      expect(explodeEntity(e, doc).add ?? []).toEqual([]);
    }
  });
});
