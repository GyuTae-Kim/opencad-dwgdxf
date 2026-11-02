/**
 * 46차: 다시 그리기가 도는 중에 flush가 그냥 돌아와 전체 보기와 모두 선택이 옛 장면을 읽던 결함.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from '../../src/app/app';
import type { DocState } from '../../src/app/docstate';
import { EditManager } from '../../src/app/edits';

const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.stubGlobal('window', { setTimeout: (f: () => void, ms: number) => setTimeout(f, ms) });
});
afterEach(() => vi.unstubAllGlobals());

/** 다시 그리기가 build에서 멈춰 있게 하는 문서 */
function setup() {
  let finish = (): void => {};
  const build = vi.fn(() => new Promise<never>((_, reject) => (finish = () => reject(new Error('끝')))));
  const m = new EditManager({ engine: { build }, docs: [] } as unknown as App);
  const st = { edits: new Map([['K', { live: new Map([['A', 1]]), hidden: new Set<string>() }]]), scenes: new Map() } as unknown as DocState;
  const schedule = (delay: number) => (m as unknown as { schedule(s: DocState, all: boolean, d: number): void }).schedule(st, false, delay);
  return { m, st, build, schedule, finish: () => finish() };
}

describe('다시 그리기 기다리기', () => {
  it('돌고 있는 다시 그리기가 끝날 때까지 기다린다', async () => {
    const h = setup();
    h.schedule(0);
    await tick();
    expect(h.build).toHaveBeenCalledTimes(1);
    let done = false;
    void h.m.flush(h.st).then(() => (done = true));
    await tick();
    expect(done).toBe(false);
    h.finish();
    await tick();
    expect(done).toBe(true);
  });

  it('미뤄 둔 다시 그리기는 바로 시작하고 끝날 때까지 기다린다', async () => {
    const h = setup();
    h.schedule(100_000);
    let done = false;
    void h.m.flush(h.st).then(() => (done = true));
    await tick();
    expect(h.build).toHaveBeenCalledTimes(1);
    expect(done).toBe(false);
    h.finish();
    await tick();
    expect(done).toBe(true);
  });

  it('할 일이 없으면 바로 돌아온다', async () => {
    const h = setup();
    await h.m.flush(h.st);
    expect(h.build).not.toHaveBeenCalled();
  });

  it('끝난 다시 그리기는 기다리지 않는다', async () => {
    const h = setup();
    h.schedule(0);
    await tick();
    h.finish();
    await tick();
    await h.m.flush(h.st);
    expect(h.build).toHaveBeenCalledTimes(1);
  });
});
