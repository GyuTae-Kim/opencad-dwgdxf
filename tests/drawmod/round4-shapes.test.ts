/**
 * 잘못 만들던 형상과 잠금 무시:
 * - ELLIPSE: 다른 축이 첫 축보다 길면 그 축이 장축(AutoCAD와 같게, 전에는 원이 됨)
 * - POLYGON: 반지름을 입력하면 아래 변이 수평(전에는 첫 꼭짓점이 0°라 사각형이 마름모)
 * - OFFSET 지우기(E): 잠긴 도면층의 원본은 지우지 않는다
 */
import { describe, expect, it } from 'vitest';
import type { Entity, EllipseEntity, LineEntity } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
import { registerDrawCommands } from '../../src/app/draw';
import { registerModifyCommands } from '../../src/app/modify';
import { lwPoints } from '../../src/core/lwpoly';
import { line as line0 } from '../edit/make';
import { makeHarness } from '../cmds2/harness';
import { perCommandGroups } from './groups';

function harness() {
  const h = perCommandGroups(makeHarness());
  registerDrawCommands(h.app);
  registerModifyCommands(h.app);
  return h;
}
const last = <T extends Entity>(h: ReturnType<typeof harness>) => h.doc.blocks.get(MODEL_SPACE)!.entities.at(-1) as T;
const close = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('ELLIPSE 다른 축', () => {
  it('글로 준 다른 축이 더 길면 장축이 된다', async () => {
    const h = harness();
    await h.run('ELLIPSE', ['0,0', '10,0', '20']);
    const e = last<EllipseEntity>(h);
    close(e.center.x, 5);
    close(Math.hypot(e.majorAxis.x, e.majorAxis.y), 20);
    close(e.majorAxis.x, 0);
    close(e.ratio, 0.25);
  });
  it('점으로 준 다른 축도 마찬가지, 짧으면 그대로', async () => {
    const h = harness();
    await h.run('ELLIPSE', ['0,0', '10,0', '5,12']);
    const e = last<EllipseEntity>(h);
    close(Math.hypot(e.majorAxis.x, e.majorAxis.y), 12);
    close(e.ratio, 5 / 12);
    const h2 = harness();
    await h2.run('ELLIPSE', ['0,0', '10,0', '2']);
    const e2 = last<EllipseEntity>(h2);
    close(Math.hypot(e2.majorAxis.x, e2.majorAxis.y), 5);
    close(e2.ratio, 0.4);
  });
});

describe('POLYGON 반지름 입력', () => {
  for (const n of [3, 4, 5, 6, 7, 8]) {
    for (const mode of ['I', 'C'] as const) {
      it(`${n}각형 ${mode === 'I' ? '내접' : '외접'}: 아래 변이 수평, 반지름이 맞다`, async () => {
        const h = harness();
        await h.run('POLYGON', [String(n), '0,0', mode, '10']);
        const pts = lwPoints(last(h) as never);
        expect(pts.length).toBe(n);
        const minY = Math.min(...pts.map((p) => p.y));
        expect(pts.filter((p) => Math.abs(p.y - minY) < 1e-9).length).toBe(2);
        const r = mode === 'I' ? 10 : 10 / Math.cos(Math.PI / n);
        for (const p of pts) close(Math.hypot(p.x, p.y), r);
      });
    }
  }
});

describe('OFFSET 지우기와 잠긴 도면층', () => {
  it('잠긴 도면층의 원본은 남고 간격띄운 객체만 생긴다', async () => {
    const h = harness();
    h.doc.layers.set('LK', { ...h.doc.layers.get('0')!, name: 'LK', handle: 'FF01', locked: true });
    const src = h.add({ ...line0(0, 0, 10, 0), handle: '', layer: 'LK' } as Entity);
    await h.run('OFFSET', ['E', 'Y', '5', { pick: src.handle, at: [5, 0] }, '5,3', '']);
    const lines = h.doc.blocks.get(MODEL_SPACE)!.entities as LineEntity[];
    expect(lines.map((l) => l.start.y).sort()).toEqual([0, 5]);
    expect(h.printed.some((t) => t.includes('잠긴 도면층'))).toBe(true);
  });
  it('잠기지 않았으면 원본을 지운다', async () => {
    const h = harness();
    const src = h.add({ ...line0(0, 0, 10, 0), handle: '' } as Entity);
    await h.run('OFFSET', ['E', 'Y', '5', { pick: src.handle, at: [5, 0] }, '5,3', '']);
    const lines = h.doc.blocks.get(MODEL_SPACE)!.entities as LineEntity[];
    expect(lines.map((l) => l.start.y)).toEqual([5]);
  });
});
