/**
 * 도면 자료 깊은 복사(97차 — core/clone.ts): 편집이 객체마다 부르는 cloneEntity가 structuredClone 대신 바로 복사한다.
 * 결과 값은 structuredClone과 같고(속성 차례·undefined 속성·-0·NaN·형식 배열 종류), 다루지 않는 값은 structuredClone 그대로다.
 */
import { describe, expect, it } from 'vitest';
import { cloneData } from '../../src/core/clone';
import { withF64Pool, newF64 } from '../../src/core/f64pool';
import { SHARED_BYLAYER_COLOR, SHARED_UNIT_SCALE } from '../../src/core/model';
import { cloneEntity } from '../../src/edit/session';
import { cloneEntity as cloneEntityGeom } from '../../src/edit/geom/path';

/** 값·속성 차례·원형·형식 배열 종류까지 같은지(toEqual은 속성 차례·-0·undefined 속성을 보지 않는다) */
function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return Object.is(a, b);
  if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) {
    if (!ArrayBuffer.isView(a) || !ArrayBuffer.isView(b) || a.constructor !== b.constructor) return false;
    const x = a as unknown as ArrayLike<unknown>;
    const y = b as unknown as ArrayLike<unknown>;
    return x.length === y.length && Array.from(x).every((v, i) => Object.is(v, y[i]));
  }
  if (Array.isArray(a) !== Array.isArray(b) || Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.join('\u0000') === kb.join('\u0000') && ka.every((k) => sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** v 안의 모든 객체 */
function objectsOf(v: unknown, out = new Set<unknown>()): Set<unknown> {
  if (typeof v !== 'object' || v === null || out.has(v)) return out;
  out.add(v);
  if (!ArrayBuffer.isView(v)) for (const k of Object.keys(v)) objectsOf((v as Record<string, unknown>)[k], out);
  return out;
}

const hatch = () => ({
  type: 'HATCH',
  handle: '2A',
  layer: '0',
  color: SHARED_BYLAYER_COLOR,
  lineweight: -1,
  ltscale: 1,
  transparency: -0,
  owner: undefined,
  patternName: 'ANSI31',
  solid: false,
  patternAngle: NaN,
  big: 12345678901234567890n,
  paths: [{ flags: 3, sources: ['1F', '20'], polyline: { closed: true, verts: new Float64Array([0, 0, 0, 10, 0, 0.5, 10, 10, 0]) } }],
  patternLines: [{ angle: 0.785, base: { x: 0, y: 0 }, offset: { x: -2.2, y: 2.2 }, dashes: [] as number[] }],
  seedPoints: [{ x: 1, y: 2 }],
  xdata: [{ app: 'ACAD', items: [{ code: 1000, value: 'x' }, { code: 1040, value: -0 }] }],
  raw: { data: new Uint8Array([1, 2, 3]), bits: 24, nested: [[1, [2, [3]]], null, undefined, true] },
  extra: Object.assign(Object.create(null) as Record<string, unknown>, { k: 1 }),
});

describe('cloneData', () => {
  it('structuredClone과 같은 값(속성 차례·undefined·-0·NaN·BigInt·형식 배열 종류)이고 원본과 객체를 함께 쓰지 않는다', () => {
    const e = hatch();
    const c = cloneData(e);
    expect(sameValue(c, structuredClone(e))).toBe(true);
    expect(Object.keys(c)).toEqual(Object.keys(e));
    expect('owner' in c).toBe(true);
    expect(Object.is(c.transparency, -0)).toBe(true);
    expect(c.paths[0]!.polyline.verts).toBeInstanceOf(Float64Array);
    expect(c.raw.data).toBeInstanceOf(Uint8Array);
    // 널 원형 객체도 일반 객체로(구조화 복제와 같다)
    expect(Object.getPrototypeOf(c.extra)).toBe(Object.prototype);
    const mine = objectsOf(c);
    for (const x of objectsOf(e)) expect(mine.has(x)).toBe(false);
    // 사본을 고쳐도 원본은 그대로
    c.paths[0]!.polyline.verts[0] = 99;
    c.patternLines[0]!.base.x = 5;
    expect(e.paths[0]!.polyline.verts[0]).toBe(0);
    expect(e.patternLines[0]!.base.x).toBe(0);
  });

  it('얼린 객체는 얼리지 않은 사본(고칠 수 있다)', () => {
    const c = cloneData({ color: SHARED_BYLAYER_COLOR, scale: SHARED_UNIT_SCALE });
    expect(Object.isFrozen(c.color)).toBe(false);
    expect(c.color).toEqual(SHARED_BYLAYER_COLOR);
    expect(c.color).not.toBe(SHARED_BYLAYER_COLOR);
    c.scale.x = 2;
    expect(SHARED_UNIT_SCALE.x).toBe(1);
  });

  it('읽을 때 떼어 준 덩어리 뷰는 보는 부분만 새 버퍼로(구조화 복제는 덩어리 전체를 복사한다)', () => {
    const e = withF64Pool(() => {
      const a = newF64(6);
      a.set([1, 2, 3, 4, 5, 6]);
      const b = newF64(3);
      b.set([7, 8, 9]);
      return { type: 'LWPOLYLINE', verts: a, widths: b };
    });
    expect(e.verts.buffer.byteLength).toBeGreaterThan(1000);
    const c = cloneData(e);
    expect(Array.from(c.verts)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(Array.from(c.widths)).toEqual([7, 8, 9]);
    expect([c.verts.byteOffset, c.verts.buffer.byteLength, c.widths.buffer.byteLength]).toEqual([0, 48, 24]);
    expect(structuredClone(e).verts.buffer.byteLength).toBe(e.verts.buffer.byteLength);
  });

  it('다루지 않는 값이 하나라도 있으면 값 전체를 structuredClone으로(같은 결과·같은 오류)', () => {
    const withMap = { a: { m: new Map([['k', { x: 1 }]]), s: new Set([1]), d: new Date(5) } };
    const c = cloneData(withMap);
    expect(c.a.m).toBeInstanceOf(Map);
    expect(c.a.m.get('k')).toEqual({ x: 1 });
    expect(c.a.s.has(1)).toBe(true);
    expect(c.a.d.getTime()).toBe(5);
    // 빈칸 있는 배열은 빈칸 그대로
    // eslint-disable-next-line no-sparse-arrays
    const sparse = { a: [1, , 3] };
    const cs = cloneData(sparse);
    expect(1 in cs.a).toBe(false);
    expect(cs.a.length).toBe(3);
    // 순환 참조
    const cyc: Record<string, unknown> = { x: 1 };
    cyc.self = { back: cyc };
    const cc = cloneData(cyc);
    expect((cc.self as { back: unknown }).back).toBe(cc);
    // 함수·기호는 structuredClone처럼 오류
    expect(() => cloneData({ f: () => 1 })).toThrow();
    expect(() => cloneData({ s: Symbol('x') })).toThrow();
    // 형식 배열의 하위 클래스(Node Buffer 등)는 structuredClone에 맡긴다
    class Sub extends Uint8Array {}
    const cb = cloneData({ b: new Sub([1, 2]) });
    expect(Array.from(cb.b)).toEqual([1, 2]);
    expect(cb.b).toBeInstanceOf(Uint8Array);
    // 원시 값
    expect(cloneData(3)).toBe(3);
    expect(cloneData(null)).toBe(null);
  });

  it('`__proto__` 이름의 자기 속성도 원형으로 바뀌지 않는다', () => {
    const o = JSON.parse('{"a":1,"__proto__":{"x":2}}') as Record<string, unknown>;
    const c = cloneData(o);
    expect(Object.getPrototypeOf(c)).toBe(Object.prototype);
    expect(Object.keys(c)).toEqual(['a', '__proto__']);
    expect(sameValue(c, structuredClone(o))).toBe(true);
  });

  it('cloneEntity(편집 세션·형상)가 쓴다', () => {
    const e = hatch();
    for (const f of [cloneEntity, cloneEntityGeom]) {
      const c = f(e as never) as ReturnType<typeof hatch>;
      expect(sameValue(c, structuredClone(e))).toBe(true);
      expect(c.paths).not.toBe(e.paths);
    }
  });
});
