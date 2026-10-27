// @vitest-environment jsdom
/** 해석 워커가 오류로 멈추면(스크립트를 못 받음·잡히지 않은 예외) 기다리던 요청을 실패로 끝내 "여는 중" 상자가 남지 않게 한다 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EngineClient, EngineError } from '../../src/app/engine';

class FakeWorker {
  static made: FakeWorker[] = [];
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  posted: unknown[] = [];
  terminated = false;
  constructor() {
    FakeWorker.made.push(this);
  }
  postMessage(m: unknown) {
    this.posted.push(m);
  }
  terminate() {
    this.terminated = true;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeWorker.made = [];
});

describe('해석 워커 오류', () => {
  it('워커 스크립트를 받지 못하면(오프라인 등) 기다리던 열기를 worker_load로 끝내고, 다음 요청은 새 워커로', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const c = new EngineClient('fonts/');
    const p = c.open('a.dxf', new ArrayBuffer(4));
    const w = FakeWorker.made[0]!;
    w.onerror!(new Event('error'));
    const e = await p.catch((x) => x);
    expect(e).toBeInstanceOf(EngineError);
    expect((e as EngineError).code).toBe('worker_load');
    expect(w.terminated).toBe(true);
    void c.open('b.dxf', new ArrayBuffer(4)).catch(() => {});
    expect(FakeWorker.made.length).toBe(2);
  });

  it('잡히지 않은 예외(ErrorEvent)는 기다리던 요청을 worker로 끝내되, 열린 도면이 있는 워커는 그대로 둔다', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const c = new EngineClient('fonts/');
    const p = c.open('a.dxf', new ArrayBuffer(4));
    const w = FakeWorker.made[0]!;
    w.onerror!(new ErrorEvent('error', { message: 'Uncaught RangeError: Array buffer allocation failed' }));
    const e = (await p.catch((x) => x)) as EngineError;
    expect(e.code).toBe('worker');
    expect(e.message).toContain('allocation failed');
    expect(w.terminated).toBe(false);
  });
});
