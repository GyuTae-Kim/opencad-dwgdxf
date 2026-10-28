/**
 * 9차 후속(진짜 App): 3DPOLY의 Z 입력이 명령행·동적 입력(상대 좌표 기본·칸 잠금)·점 필터·UCS를 거쳐 정점에 닿는다.
 * 2D 명령의 점 결과는 전과 같다(평면 좌표 입력에는 z가 없다).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { LineEntity, PolylineEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import type { PointResult } from '../../src/app/app';
import { registerDrawCommands } from '../../src/app/draw';
import { browserGlobals } from '../polish/fakes';
import { type RealApp, makeApp, settle } from '../polish/real-app';
import { type DirectCommandLine, FakePicker } from './fakes';
import { polyVertices } from '../../src/core/polyverts';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('./fakes')).DirectCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));

beforeAll(() => {
  const g = browserGlobals();
  vi.stubGlobal('window', g.window);
  vi.stubGlobal('document', g.document);
});
afterAll(() => vi.unstubAllGlobals());

type Pt = { x: number; y: number };
const ev = () => ({ pointerType: 'mouse', shiftKey: false, ctrlKey: false, metaKey: false, clientX: 0, clientY: 0 }) as PointerEvent;

function setup() {
  const h = makeApp();
  registerDrawCommands(h.app);
  const pk = new FakePicker(h.doc);
  (h.app as unknown as { picker: () => unknown }).picker = () => pk;
  return { ...h, cl: h.cmd as unknown as DirectCommandLine, move: (p: Pt) => h.view.events.move!(p, p, ev()), click: (p: Pt) => h.view.events.click!(p, p, ev()) };
}

const verts = (h: RealApp) => {
  const p = [...h.doc.entityIndex.values()].find((e): e is PolylineEntity => e.type === 'POLYLINE')!;
  return polyVertices(p).map((v) => [v.location.x, v.location.y, v.location.z].map((n) => Math.round(n * 1e9) / 1e9));
};

describe('3DPOLY의 Z(진짜 App)', () => {
  it('명령행 x,y,z, 동적 입력의 상대 좌표(앞 점의 Z), 클릭은 고도, 점 필터 .XY의 Z 숫자', async () => {
    const h = setup();
    h.doc.header.set('$ELEVATION', 1);
    void h.app.run('3DPOLY');
    await settle();
    h.cl.type('0,0,4');
    await settle();
    // 동적 입력이 켜져 있으면 두 번째 점부터 상대: 10,0 → @10,0(Z 4 그대로), 0,0,-4 → @0,0,-4(세로)
    h.cl.type('10,0');
    await settle();
    h.cl.type('0,0,-4');
    await settle();
    // 클릭은 고도
    h.app.osnapOn = false;
    h.move({ x: 10, y: 10 });
    h.click({ x: 10, y: 10 });
    await settle();
    // 점 필터: .XY로 (0,10)을 고르고 Z는 숫자 7
    for (const t of ['.XY', '#0,10', '7']) {
      h.cl.type(t);
      await settle();
    }
    h.cl.type('');
    await settle();
    expect(verts(h)).toEqual([
      [0, 0, 4],
      [10, 0, 4],
      [10, 0, 0],
      [10, 10, 1],
      [0, 10, 7],
    ]);
  });

  it('동적 입력 칸 잠금(거리·각도)은 앞 점의 Z, UCS를 돌려도 Z는 그대로(* 는 WCS)', async () => {
    const h = setup();
    void h.app.run('3DPOLY');
    await settle();
    h.cl.type('0,0,3');
    await settle();
    h.move({ x: 0, y: 5 });
    h.cl.input.value = '5';
    expect(h.cl.intercept!({ key: 'Tab', shiftKey: false, ctrlKey: false, metaKey: false } as KeyboardEvent)).toBe(true);
    h.cl.type('0');
    await settle();
    h.app.cancel();
    await settle();
    expect(verts(h)).toEqual([
      [0, 0, 3],
      [5, 0, 3],
    ]);
    // UCS: 원점 (100,0), 90° 회전 — X·Y는 바뀌고 Z는 그대로
    const h2 = setup();
    h2.doc.header.set('$UCSORG', { x: 100, y: 0, z: 0 });
    h2.doc.header.set('$UCSXDIR', { x: 0, y: 1, z: 0 });
    h2.doc.header.set('$UCSYDIR', { x: -1, y: 0, z: 0 });
    h2.app.dynOn = false;
    void h2.app.run('3DPOLY');
    await settle();
    h2.cl.type('10,0,2');
    await settle();
    h2.cl.type('*0,0,5');
    await settle();
    h2.cl.type('');
    await settle();
    expect(verts(h2)).toEqual([
      [100, 10, 2],
      [0, 0, 5],
    ]);
  });

  it('객체 정의점에 잡힌 스냅은 그 Z(OSNAPZ 0): 3D 선의 끝점·중간점, 2D 명령의 클릭 결과에는 z가 없다', async () => {
    const h = setup();
    const e = { ...entityDefaults(), type: 'LINE', handle: h.st.session.newHandle(), start: { x: 0, y: 0, z: 6 }, end: { x: 10, y: 0, z: 2 } } as LineEntity;
    e.owner = h.doc.blocks.get(MODEL_SPACE)!.recordHandle;
    h.st.session.commit({ label: 'T', ops: [{ kind: 'add', block: MODEL_SPACE, entity: e }] });
    h.app.snapModes.clear();
    h.app.snapModes.add('end');
    h.app.snapModes.add('mid');
    void h.app.run('3DPOLY');
    await settle();
    h.move({ x: 0.2, y: 0.1 });
    h.click({ x: 0.2, y: 0.1 });
    await settle();
    h.move({ x: 5.1, y: 0.1 });
    h.click({ x: 5.1, y: 0.1 });
    await settle();
    // 빈 곳은 고도(0)
    h.move({ x: 5, y: 20 });
    h.click({ x: 5, y: 20 });
    await settle();
    h.cl.type('');
    await settle();
    expect(verts(h)).toEqual([
      [0, 0, 6],
      [5, 0, 4],
      [5, 20, 0],
    ]);
    const got: PointResult[] = [];
    h.app.register({
      name: 'PT',
      title: 'PT',
      async run(ctx) {
        got.push(await ctx.getPoint('점:'));
      },
    });
    void h.app.run('PT');
    await settle();
    h.move({ x: 9.9, y: 0.1 });
    h.click({ x: 9.9, y: 0.1 });
    await settle();
    expect(got[0]).toEqual({ point: { x: 10, y: 0 }, snap: { kind: 'end', handle: e.handle, handle2: undefined } });
  });

  it('2D 점 요청의 결과는 그대로: 평면 좌표 입력에는 z가 없다', async () => {
    const h = setup();
    const got: PointResult[] = [];
    h.app.register({
      name: 'PT',
      title: 'PT',
      async run(ctx) {
        got.push(await ctx.getPoint('점:', { base: { x: 1, y: 1 } }));
      },
    });
    for (const t of ['5,5', '@1,0', '2,3,4']) {
      void h.app.run('PT');
      await settle();
      h.app.submitInput(t);
      await settle();
    }
    expect(got).toEqual([
      { point: { x: 5, y: 5 }, snap: null },
      { point: { x: 2, y: 1 }, snap: null },
      { point: { x: 2, y: 3 }, z: 4, snap: null },
    ]);
  });
});
