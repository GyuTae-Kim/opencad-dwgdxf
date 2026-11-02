/**
 * 44차: 객체마다 GPU 버퍼를 고치던 숨기기가 선 20만 개에 5초가 걸리던 결함. 묶음마다 한 번만 올린다.
 * GL을 메모리로 흉내 내어 객체마다 고친 결과와 바이트까지 같은지 본다(무리 버퍼의 자리 포함).
 */
import { describe, expect, it } from 'vitest';
import { type ChunkGroup, type ChunkKind, mergeGroup } from '../../src/render/chunkgroups';
import { type DisplayList, DisplayListBuilder, SEG_STRIDE } from '../../src/render/displaylist';
import { GLRenderer, type GpuScene } from '../../src/render/webgl';

const HIDDEN = 77;
const OPAQUE = 1;
const CLEAR = 3;
const glyphKey = { ch: 'A', advance: 1 };
const glyphData = new Float32Array([0, 0, 1, 0, 0, 1]);
const UNIT = [1, 0, 0, 1, 0, 0];

/** 선·투명 선·삼각형·글리프가 섞인 객체 n개. 멀리 떨어뜨려 묶음이 여럿 생긴다 */
function displayList(n: number): DisplayList {
  const b = new DisplayListBuilder((s) => s === CLEAR);
  for (let i = 0; i < n; i++) {
    const x = i * 3000;
    b.segment(x, 0, x + 1, 1, OPAQUE);
    if (i % 2) b.segment(x, 2, x + 1, 3, CLEAR);
    if (i % 3 === 0) b.triangle(x, 4, x + 1, 4, x, 5, OPAQUE);
    if (i % 5 === 0) b.triangle(x, 6, x + 1, 6, x, 7, CLEAR);
    if (i % 4 === 0) b.glyph(glyphKey, 0, glyphData, UNIT, [0, 0, 1, 1], OPAQUE);
    if (i === 5) b.xline(0, 0, 1, 0, false, OPAQUE);
    b.endEntity(`E${i}`);
  }
  return b.finish();
}

/** GL 버퍼를 바이트 배열로 흉내 낸다 */
class FakeGl {
  readonly ARRAY_BUFFER = 1;
  bound: Uint8Array | null = null;
  writes = 0;
  bindBuffer(_t: number, b: Uint8Array): void {
    this.bound = b;
  }
  bufferSubData(_t: number, offset: number, data: ArrayBuffer | ArrayBufferView): void {
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    this.bound!.set(bytes, offset);
    this.writes++;
  }
}

const BUFS = [
  ['segs', 'segBuf'],
  ['tsegs', 'tsegBuf'],
  ['tris', 'triBuf'],
  ['ttris', 'ttriBuf'],
] as const;

function sceneOf(dl: DisplayList, groups: boolean): GpuScene {
  const copy = (b: ArrayBuffer) => new Uint8Array(b.slice(0));
  // 앞 묶음들만 무리에 넣는다. 묶음 하나는 자기 버퍼 없이 무리에만 있다(나중에 올리는 묶음)
  const info: ChunkGroup = { ox: 100, oy: 50, minX: 0, minY: 0, maxX: 1, maxY: 1, members: dl.chunks.map((_, i) => i).filter((i) => i % 2 === 0) };
  const group: Record<string, unknown> = { info, ox: info.ox, oy: info.oy, at: {} };
  if (groups) {
    for (const [kind, buf] of BUFS) {
      const m = mergeGroup(dl.chunks, info, kind as ChunkKind);
      (group.at as Record<string, Int32Array>)[kind] = m.at;
      group[buf] = m.count ? copy(m.data) : null;
    }
  }
  const chunks = dl.chunks.map((c, i) => {
    const grouped = groups && i % 2 === 0;
    const lazy = grouped && i % 4 === 0;
    return {
      group: grouped ? 0 : -1,
      segBuf: lazy || !c.segCount ? null : copy(c.segs),
      tsegBuf: lazy || !c.tsegCount ? null : copy(c.tsegs),
      triBuf: lazy || !c.triCount ? null : copy(c.tris),
      ttriBuf: lazy || !c.ttriCount ? null : copy(c.ttris),
    };
  });
  return { chunks, groups: groups ? [group] : [], images: [{ handle: 'E7', hidden: false }, { handle: 'NONE', hidden: false }], xlines: Float32Array.from(dl.xlines), instBuf: copy(dl.glyphs.instances) } as unknown as GpuScene;
}

function hideWith(batch: boolean, groups: boolean, pick: (i: number) => boolean) {
  const dl = displayList(300);
  const scene = sceneOf(dl, groups);
  const gl = new FakeGl();
  const self = { gl, hideEntity: GLRenderer.prototype.hideEntity } as unknown as GLRenderer;
  const boxes = dl.entities.filter((_, i) => pick(i));
  if (batch) GLRenderer.prototype.hideEntities.call(self, scene, dl, boxes, HIDDEN);
  else for (const b of boxes) GLRenderer.prototype.hideEntity.call(self, scene, dl, b, HIDDEN);
  return { dl, scene, gl, boxes };
}

/** 표시 목록과 GPU 버퍼의 모든 바이트 */
function bytes(r: ReturnType<typeof hideWith>): number[][] {
  const out: number[][] = [];
  const s = r.scene as unknown as { chunks: Record<string, Uint8Array | null>[]; groups: Record<string, Uint8Array | null>[]; instBuf: Uint8Array };
  for (const c of r.dl.chunks) for (const [kind] of BUFS) out.push([...new Uint8Array(c[kind])]);
  for (const g of [...s.chunks, ...s.groups]) for (const [, buf] of BUFS) out.push([...(g[buf] ?? [])]);
  out.push([...s.instBuf], [...new Uint8Array(r.dl.glyphs.instances)]);
  return out;
}

describe('일괄 숨기기', () => {
  it.each([
    ['무리 없음', false],
    ['무리 있음', true],
  ])('객체마다 숨긴 결과와 바이트까지 같다(%s)', (_name, groups) => {
    const pick = (i: number) => i % 7 !== 3;
    expect(bytes(hideWith(true, groups, pick))).toEqual(bytes(hideWith(false, groups, pick)));
  });

  it('고른 객체만 숨긴다', () => {
    const r = hideWith(true, false, (i) => i !== 0);
    const style = new Uint32Array(r.dl.chunks[0]!.segs);
    const first = r.dl.entities[0]!;
    expect(style[first.seg![0] * SEG_STRIDE + 5]).not.toBe(HIDDEN);
    expect(r.boxes.length).toBe(299);
  });

  it('이미지와 구성선도 숨긴다', () => {
    const r = hideWith(true, false, () => true);
    const s = r.scene as unknown as { images: { hidden: boolean }[]; xlines: Float32Array };
    expect(s.images.map((im) => im.hidden)).toEqual([true, false]);
    expect(r.dl.xlineHandles).toEqual(['E5']);
    expect(s.xlines[6]).toBe(HIDDEN);
  });

  it('묶음마다 한 번씩만 올린다', () => {
    const batch = hideWith(true, false, () => true);
    const each = hideWith(false, false, () => true);
    const buffers = batch.dl.chunks.reduce((a, c) => a + [c.segCount, c.tsegCount, c.triCount, c.ttriCount].filter(Boolean).length, 0);
    expect(batch.gl.writes).toBe(buffers + 1);
    expect(batch.gl.writes).toBeLessThan(each.gl.writes);
  });

  it('객체가 적으면 고친 자리만 올린다', () => {
    const r = hideWith(true, false, (i) => i < 3);
    expect(r.boxes.length).toBe(3);
    expect(r.gl.writes).toBeLessThanOrEqual(3 * 5);
  });
});
