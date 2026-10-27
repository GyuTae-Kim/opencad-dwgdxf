/** 9차: PLINE 호 그리기의 Ctrl 방향 바꾸기(프롬프트의 "방향 전환은 Ctrl 키") */
import { describe, expect, it } from 'vitest';
import type { LwPolylineEntity } from '../../src/core/model';
import { lwVertices } from '../../src/core/lwpoly';
import { registerDrawCommands } from '../../src/app/draw';
import { type Harness, makeHarness, modelEntities } from '../cmds2/harness';

function draw(): Harness {
  const h = makeHarness();
  registerDrawCommands(h.app);
  return h;
}

describe('PLINE 호의 Ctrl 방향 바꾸기', () => {
  const bulges = async (inputs: Parameters<Harness['run']>[1]) => {
    const h = draw();
    await h.run('PLINE', inputs);
    return lwVertices(modelEntities(h.doc, 'LWPOLYLINE')[0] as LwPolylineEntity).map((v) => v.bulge);
  };

  it('접선 이어 그리기 호: Ctrl이면 같은 원의 나머지 호(볼록 −1/b)', async () => {
    const b = Math.tan(Math.PI / 8);
    expect((await bulges(['0,0', '10,0', 'A', { click: [20, 10] }, '']))[1]).toBeCloseTo(b, 9);
    expect((await bulges(['0,0', '10,0', 'A', { click: [20, 10], ctrl: true }, '']))[1]).toBeCloseTo(-1 / b, 9);
  });

  it('중심(CE)·각도(A)·방향(D)·반지름(R) 옵션의 끝점도 Ctrl이면 반대로', async () => {
    expect((await bulges(['0,0', 'A', 'CE', '5,0', { click: [10, 0] }, '']))[0]).toBeCloseTo(1, 9);
    expect((await bulges(['0,0', 'A', 'CE', '5,0', { click: [10, 0], ctrl: true }, '']))[0]).toBeCloseTo(-1, 9);
    expect((await bulges(['0,0', 'A', 'A', '90', { click: [10, 0] }, '']))[0]).toBeCloseTo(Math.tan(Math.PI / 8), 9);
    expect((await bulges(['0,0', 'A', 'A', '90', { click: [10, 0], ctrl: true }, '']))[0]).toBeCloseTo(-Math.tan(Math.PI / 8), 9);
    expect((await bulges(['0,0', 'A', 'D', '90', { click: [10, 0] }, '']))[0]).toBeCloseTo(-1, 9);
    expect((await bulges(['0,0', 'A', 'D', '90', { click: [10, 0], ctrl: true }, '']))[0]).toBeCloseTo(1, 9);
    const r = (await bulges(['0,0', 'A', 'R', '8', { click: [10, 0] }, '']))[0]!;
    expect(Math.abs(r)).toBeGreaterThan(0);
    expect((await bulges(['0,0', 'A', 'R', '8', { click: [10, 0], ctrl: true }, '']))[0]).toBeCloseTo(-r, 9);
  });
});

