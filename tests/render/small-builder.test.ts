/**
 * 88차: 객체 몇 개만 그리는 표시 목록은 작게 시작한다(DisplayListBuilder small). 처음 자리만 다르고 늘리는 길은 같으므로
 * 상자·글리프·임시 그림·묶음 버퍼가 처음 자리를 넘도록 그려도 결과가 보통 빌더와 바이트까지 같아야 한다.
 */
import { describe, expect, it } from 'vitest';
import { DisplayListBuilder } from '../../src/render/displaylist';

/** 표시 목록을 비교할 값으로(버퍼·형식 배열은 바이트 배열로) */
function plain(v: unknown): unknown {
  if (v instanceof ArrayBuffer) return Array.from(new Uint8Array(v));
  if (ArrayBuffer.isView(v)) return Array.from(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
  if (Array.isArray(v)) return v.map(plain);
  if (v instanceof Map) return [...v].map(([k, x]) => [k, plain(x)]);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) out[k] = plain((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

function draw(small: boolean) {
  const b = new DisplayListBuilder((s) => s === 3, small);
  const glyph = new Float32Array([0, 0, 1, 0, 1, 1]);
  let seed = 11;
  const r = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  // 객체 40개(상자 16개 넘게), 객체마다 선분 수백 개(임시 그림 64개·묶음 256개 넘게), 삼각형, 글리프 30개(글리프 16개 넘게)
  for (let i = 0; i < 40; i++) {
    b.setDepth(1 - i / 50);
    const ox = (i % 7) * 1000 + r() * 10;
    const oy = Math.floor(i / 7) * 1000 + r() * 10;
    const n = 50 + Math.floor(r() * 400);
    for (let k = 0; k < n; k++) b.segment(ox + r() * 50, oy + r() * 50, ox + r() * 50, oy + r() * 50, k % 5);
    for (let k = 0; k < 20; k++) b.triangle(ox, oy, ox + r() * 9, oy, ox, oy + r() * 9, k % 4);
    if (i % 4 === 0) for (let g = 0; g < 30; g++) b.glyph(glyph, 0, glyph, [1, 0, 0, 1, ox + g, oy], [0, 0, 1, 1], 1);
    expect(b.endEntity(`E${i}`)).toBe(true);
  }
  return b.finish();
}

describe('작게 시작하는 표시 목록', () => {
  it('처음 자리를 넘도록 그려도 보통 빌더와 결과가 같다', () => {
    expect(plain(draw(true))).toEqual(plain(draw(false)));
  });
});
