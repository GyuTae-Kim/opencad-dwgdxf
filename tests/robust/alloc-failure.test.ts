/**
 * 35차: 표시 목록을 만드는 동안 메모리를 못 잡을 때. 모든 할당 자리에 차례로 실패를 넣어
 * 실패한 객체만 통째로 빠지고 나머지는 그대로이며, 깨진 값이나 주인 없는 조각이 남지 않는지 본다.
 * 고치기 전에는 버퍼 하나만 옮긴 뒤 실패하면 좌표가 NaN이 되었고, 묶음 갈아 끼우기 실패는 finish()가 TypeError로 죽었으며,
 * 선분만 옮기고 멈춘 객체가 주인 없는 조각으로 남고, 꺾은선은 경고 없이 일부만 남으면서 조각마다 다시 할당을 시도했다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MODEL_SPACE } from '../../src/core/model';
import { readDxf } from '../../src/io/dxf/reader';
import { SceneBuilder, buildSpace } from '../../src/render/build';
import { DisplayListBuilder } from '../../src/render/displaylist';
import { TextEngine } from '../../src/text/layout';
import { bytesOf, dxfText } from './corrupt35';

interface Want {
  segs: number;
  tsegs: number;
  tris: number;
  ttris: number;
  glyphs: number;
  images: number;
  xrefs: number;
  xlines: number;
}
const none: Want = { segs: 0, tsegs: 0, tris: 0, ttris: 0, glyphs: 0, images: 0, xrefs: 0, xlines: 0 };

interface Obj {
  handle: string;
  draw(b: DisplayListBuilder): void;
  want: Want;
}

/** 스타일 3과 301은 투명 */
const transparent = (s: number) => s === 3 || s === 301;
const OPAQUE = 1;
const CLEAR = 3;
const glyphKey = { ch: 'A', advance: 1 };
const glyphData = new Float32Array([0, 0, 1, 0, 0, 1]);
const UNIT = [1, 0, 0, 1, 0, 0];
const BIG = (1 << 20) + 50_000;

/** 임시 그림·쪽·묶음 갈아 끼우기·상자·글리프·스타일 표가 모두 늘어나는 객체들 */
function objects(): Obj[] {
  const out: Obj[] = [];
  out.push({ handle: 'FIRST', want: { ...none, segs: 1 }, draw: (b) => b.segment(0, 0, 1, 1, OPAQUE) });
  out.push({
    handle: 'SMALLGROW',
    want: { ...none, segs: 300, tris: 100, tsegs: 300, ttris: 100 },
    draw(b) {
      for (let i = 0; i < 300; i++) {
        b.segment(i, 0, i + 1, 0, OPAQUE);
        b.segment(i, 1, i + 1, 1, CLEAR);
      }
      for (let i = 0; i < 100; i++) {
        b.triangle(i, 0, i + 1, 0, i, 1, OPAQUE);
        b.triangle(i, 2, i + 1, 2, i, 3, CLEAR);
      }
    },
  });
  // 쪽 경계를 넘고 묶음을 채운다(같은 크기 단계의 다음 객체가 묶음을 갈아 끼운다)
  out.push({
    handle: 'BIG',
    want: { ...none, segs: BIG, tris: 70 },
    draw(b) {
      for (let i = 0; i < BIG; i++) b.segment(0, 0, 1, 1, OPAQUE);
      for (let i = 0; i < 70; i++) b.triangle(0, 0, 1, 0, 0, 1, OPAQUE);
    },
  });
  out.push({ handle: 'NEXTCHUNK', want: { ...none, segs: 1 }, draw: (b) => b.segment(0, 0, 1, 1, OPAQUE) });
  // 선분은 들어가고 삼각형 자리만 못 잡는 꼴: 빈 묶음에서 시작한다
  out.push({
    handle: 'SEGTRI',
    want: { ...none, segs: 500, tris: 1000 },
    draw(b) {
      for (let i = 0; i < 500; i++) b.segment(9000 + i, 0, 9001 + i, 0, OPAQUE);
      for (let i = 0; i < 1000; i++) b.triangle(9000 + i, 0, 9001 + i, 0, 9000 + i, 1, OPAQUE);
    },
  });
  // 글리프 버퍼가 늘 때 앞 객체의 글리프가 살아 있어야 한다
  out.push({
    handle: 'GLYPH0',
    want: { ...none, segs: 1, glyphs: 3 },
    draw(b) {
      b.segment(0, 0, 1, 1, OPAQUE);
      for (let i = 0; i < 3; i++) b.glyph(glyphKey, 0, glyphData, UNIT, [0, 0, 1, 1], OPAQUE);
    },
  });
  out.push({
    handle: 'GLYPHS',
    want: { ...none, segs: 1, glyphs: 1100 },
    draw(b) {
      b.segment(0, 0, 1, 1, OPAQUE);
      for (let i = 0; i < 1100; i++) b.glyph(glyphKey, 0, glyphData, UNIT, [0, 0, 1, 1], i % 2 ? CLEAR : OPAQUE);
    },
  });
  out.push({
    handle: 'OTHERS',
    want: { ...none, segs: 1, images: 1, xrefs: 1, xlines: 1 },
    draw(b) {
      // 처음 쓰는 칸: 이미지·외부 참조·구성선을 넣은 뒤 마감에서 묶음을 잡는다
      b.segment(5000, 5000, 5001, 5001, OPAQUE);
      b.image('a.png', [0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1], OPAQUE, { brightness: 50, contrast: 50, fade: 0, transparent: false });
      b.xref('X', [1, 0, 0, 1, 0, 0], OPAQUE);
      b.xline(0, 0, 1, 0, false, OPAQUE);
    },
  });
  out.push({ handle: 'STYLES', want: { ...none, segs: 1, tsegs: 1 }, draw: (b) => (b.segment(0, 0, 1, 1, 300), b.segment(0, 0, 1, 1, 301)) });
  // 상자 표가 늘어난다
  for (let i = 0; i < 1100; i++) out.push({ handle: `E${i}`, want: { ...none, segs: 1 }, draw: (b) => b.segment(i, 7, i + 1, 7, OPAQUE) });
  return out;
}

interface Fault {
  /** 지금까지 세어 본 할당 수 */
  count: number;
  /** 실패시킨 수 */
  thrown: number;
  armed: boolean;
}

const proto = ArrayBuffer.prototype as unknown as { transfer(n?: number): ArrayBuffer };

/** 형식 배열·ArrayBuffer 만들기와 transfer를 하나씩 세어 k번째부터(persist면 계속, 아니면 그 한 번만) 실패시킨다 */
function injectFaults(k: number, persist: boolean): Fault {
  const f: Fault = { count: 0, thrown: 0, armed: false };
  const tick = () => {
    if (!f.armed) return;
    f.count++;
    if (f.count === k || (persist && f.count > k)) {
      f.thrown++;
      throw new RangeError('Array buffer allocation failed');
    }
  };
  const realTransfer = proto.transfer;
  vi.spyOn(proto, 'transfer').mockImplementation(function (this: ArrayBuffer, n?: number) {
    tick();
    return realTransfer.call(this, n);
  });
  for (const name of ['ArrayBuffer', 'Float64Array', 'Float32Array', 'Int32Array', 'Uint32Array', 'Uint8Array'] as const) {
    const Real = globalThis[name] as unknown as new (...a: unknown[]) => object;
    vi.stubGlobal(
      name,
      new Proxy(Real, {
        construct(t, a, nt) {
          // 있는 버퍼 위에 만드는 뷰는 메모리를 잡지 않는다
          if (typeof a[0] === 'number') tick();
          return Reflect.construct(t, a, nt);
        },
      }),
    );
  }
  return f;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function run(k: number, persist: boolean) {
  const objs = objects();
  const f = injectFaults(k, persist);
  const b = new DisplayListBuilder(transparent);
  const dropped = new Set<string>();
  /** 객체 하나가 실패한 할당 수의 최댓값(다시 시도하지 않는지) */
  let worst = 0;
  f.armed = true;
  for (const o of objs) {
    const before = f.thrown;
    o.draw(b);
    if (!b.endEntity(o.handle)) dropped.add(o.handle);
    worst = Math.max(worst, f.thrown - before);
  }
  f.armed = false;
  const dl = b.finish();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  return { objs, dl, dropped, worst, f };
}

/** 들어간 객체는 전부, 빠진 객체는 하나도 표시 목록에 없다 */
function check({ objs, dl, dropped }: ReturnType<typeof run>): void {
  const sum: Want = { ...none };
  const boxes = new Map(dl.entities.map((e) => [e.handle, e]));
  for (const o of objs) {
    const box = boxes.get(o.handle);
    if (dropped.has(o.handle)) {
      expect(box, o.handle).toBeUndefined();
      continue;
    }
    expect(box, o.handle).toBeDefined();
    const w = o.want;
    expect([box!.seg?.[1] ?? 0, box!.tseg?.[1] ?? 0, box!.tri?.[1] ?? 0, box!.ttri?.[1] ?? 0, box!.glyphs?.length ?? 0], o.handle).toEqual([w.segs, w.tsegs, w.tris, w.ttris, w.glyphs]);
    for (const k of Object.keys(sum) as (keyof Want)[]) sum[k] += w[k];
  }
  let nan = 0;
  const totals = [0, 0, 0, 0];
  for (const c of dl.chunks) {
    expect(c.segCount + c.tsegCount + c.triCount + c.ttriCount).toBeGreaterThan(0);
    totals[0]! += c.segCount;
    totals[1]! += c.tsegCount;
    totals[2]! += c.triCount;
    totals[3]! += c.ttriCount;
    for (const buf of [c.segs, c.tsegs, c.tris, c.ttris]) {
      const v = new Float32Array(buf);
      for (let i = 0; i < v.length; i++) if (Number.isNaN(v[i])) nan++;
    }
  }
  expect(nan).toBe(0);
  // 상자가 없는 조각(주인 없는 조각)이 없다
  expect(totals).toEqual([sum.segs, sum.tsegs, sum.tris, sum.ttris]);
  expect(dl.glyphs.instanceCount).toBe(sum.glyphs);
  const inst = new Float32Array(dl.glyphs.instances);
  for (let i = 0; i < inst.length; i++) if (Number.isNaN(inst[i])) nan++;
  expect(nan).toBe(0);
  expect(dl.images?.length ?? 0).toBe(sum.images);
  expect(dl.xrefs?.length ?? 0).toBe(sum.xrefs);
  expect(dl.xlines.length).toBe(sum.xlines * 7);
  expect(dl.xlineHandles.length).toBe(sum.xlines);
  for (const im of dl.images ?? []) expect(im.handle).toBe('OTHERS');
  for (const x of dl.xrefs ?? []) expect(x.handle).toBe('OTHERS');
}

describe('할당 순서마다 실패', () => {
  // 세 보는 실행은 k가 어떤 할당에도 닿지 않는다
  const total = run(Number.MAX_SAFE_INTEGER, false).f.count;

  it('실패 없이는 모든 객체가 들어간다', () => {
    const r = run(Number.MAX_SAFE_INTEGER, false);
    expect(r.dropped.size).toBe(0);
    check(r);
    // 할당 자리: 임시 그림 두 벌 + 쪽 + 묶음 + 상자 + 글리프 + 스타일 표
    expect(total).toBeGreaterThan(60);
  });

  it('어느 할당이 실패해도 그 객체만 빠진다', () => {
    let droppedSomething = 0;
    for (let k = 1; k <= total; k++) {
      const r = run(k, false);
      expect(r.f.thrown, `할당 ${k}`).toBe(1);
      // 스타일 표는 값을 못 기억할 뿐이고 객체를 비울 작은 버퍼는 다시 쓰면 그만이라 객체가 빠지지 않아도 된다
      expect(r.dropped.size, `할당 ${k}`).toBeLessThanOrEqual(1);
      droppedSomething += r.dropped.size;
      check(r);
    }
    expect(droppedSomething).toBeGreaterThan(total * 0.8);
  });

  it('메모리가 계속 모자라도 끝까지 간다: 같은 객체에서 다시 잡으려 하지 않는다', () => {
    for (let k = 1; k <= total; k += 3) {
      const r = run(k, true);
      expect(r.worst, `할당 ${k}`).toBeLessThanOrEqual(6);
      check(r);
    }
  });
});

describe('장면', () => {
  const polyline = (n: number, h: string, y: number): string[] => {
    const p = ['0', 'LWPOLYLINE', '5', h, '8', '0', '100', 'AcDbEntity', '100', 'AcDbPolyline', '90', String(n), '70', '0'];
    for (let k = 0; k < n; k++) p.push('10', String(k), '20', String(y + (k % 2)));
    return p;
  };
  const segs = (s: ReturnType<typeof buildSpace>) => s.list.chunks.reduce((a, c) => a + c.segCount, 0);
  const codes = (s: ReturnType<typeof buildSpace>) => s.warnings.map((w) => w.code);

  it('최상위 꺾은선을 그리다 메모리가 모자라면 경고하고 그 객체만 빠지며 조각마다 다시 잡지 않는다', () => {
    const doc = readDxf(bytesOf(dxfText([polyline(30000, '1F', 0), polyline(3, '2F', 100000)])));
    let failed = 0;
    const real = proto.transfer;
    vi.spyOn(proto, 'transfer').mockImplementation(function (this: ArrayBuffer, n?: number) {
      if ((n ?? 0) > 200000 && (n ?? 0) < 40 * 1048576) {
        failed++;
        throw new RangeError('Array buffer allocation failed');
      }
      return real.call(this, n);
    });
    const s = buildSpace(doc, MODEL_SPACE, { text: new TextEngine(null) });
    expect(codes(s)).toContain('entity.memory_dropped');
    expect(failed).toBe(1);
    expect(segs(s)).toBe(2);
    expect(s.list.entities.map((e) => e.handle)).toEqual(['2F']);
  });

  it('블록을 펼치다 메모리가 모자라도 그 객체만 빠지고 뒤 블록은 그린다', () => {
    const body = polyline(30000, '', 0).filter((_, i) => i !== 2 && i !== 3);
    const B = ['0', 'BLOCK', '8', '0', '2', 'B', '70', '0', '10', '0', '20', '0', '30', '0', '3', 'B', ...Array.from({ length: 20 }, () => body).flat(), '0', 'ENDBLK', '8', '0'];
    const S = ['0', 'BLOCK', '8', '0', '2', 'S', '70', '0', '10', '0', '20', '0', '30', '0', '3', 'S', '0', 'LINE', '8', '0', '10', '0', '20', '0', '30', '0', '11', '1', '21', '0', '31', '0', '0', 'ENDBLK', '8', '0'];
    const ins = (block: string, h: string) => ['0', 'INSERT', '5', h, '8', '0', '2', block, '10', '0', '20', '0', '30', '0'];
    const doc = readDxf(bytesOf(dxfText([ins('B', '1F'), ins('S', '2F')], [B, S])));
    const real = proto.transfer;
    vi.spyOn(proto, 'transfer').mockImplementation(function (this: ArrayBuffer, n?: number) {
      if ((n ?? 0) > 200000 && (n ?? 0) < 40 * 1048576) throw new RangeError('Array buffer allocation failed');
      return real.call(this, n);
    });
    const s = buildSpace(doc, MODEL_SPACE, { text: new TextEngine(null) });
    expect(codes(s)).toContain('entity.memory_dropped');
    expect(codes(s)).not.toContain('block.expansion_limit');
    expect(s.list.entities.map((e) => e.handle)).toEqual(['2F']);
    expect(segs(s)).toBe(1);
    // 첫 꺾은선에서 멈춘다(꺾은선 20개를 다 그리면 일이 60만이다)
    expect(s.stats.blockWork).toBeLessThan(35000);
  });

  it('미리 보기 조각을 만들 메모리가 없으면 그 조각만 건너뛴다', () => {
    const doc = readDxf(bytesOf(dxfText([polyline(3, '1F', 0)])));
    vi.spyOn(DisplayListBuilder.prototype, 'snapshot').mockImplementation(() => {
      throw new RangeError('Array buffer allocation failed');
    });
    const parts: unknown[] = [];
    const b = new SceneBuilder(doc, { text: new TextEngine(null), onPartial: (p) => parts.push(p), partialInterval: 0 });
    const s = b.build(MODEL_SPACE);
    expect(parts.length).toBe(0);
    expect(segs(s)).toBe(2);
  });
});
