/**
 * 9차 후속(진짜 App·스냅): 접점 스냅이 타원·타원호·스플라인에도 잡힌다.
 * - 기준점에서 그은 접점(LINE 둘째 점): 타원은 해석적 접점, 스플라인은 근 찾기의 접점
 * - 지연된 접점(LINE 첫 점의 TAN 재지정): 타원·스플라인 위 가장 가까운 점, 다음 점을 받으면 접선
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Entity, LineEntity } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
import type { OverlayState } from '../../src/app/view';
import type { Picker } from '../../src/app/pick';
import { findSnaps } from '../../src/app/snap';
import { registerDrawCommands } from '../../src/app/draw';
import { pieceAt, pieceD1 } from '../../src/edit/geom/curve';
import { entityPath } from '../../src/edit/geom/path';
import { ellipse, newDoc, spline } from '../edit/make';
import { browserGlobals } from '../polish/fakes';
import { type RealApp, makeApp, settle } from '../polish/real-app';
import { type DirectCommandLine, FakePicker } from './fakes';

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
const P = (x: number, y: number): Pt => ({ x, y });
const near = (a: Pt, b: Pt, eps = 1e-9) => Math.hypot(a.x - b.x, a.y - b.y) < eps;
const cross = (a: Pt, b: Pt) => a.x * b.y - a.y * b.x;
const TAN = new Set(['tan'] as const);

describe('접점 스냅 후보(findSnaps)', () => {
  const setupDoc = (...es: Entity[]) => {
    const doc = newDoc();
    es.forEach((e, i) => {
      e.handle = `E${i}`;
      doc.blocks.get(MODEL_SPACE)!.entities.push(e);
      doc.entityIndex.set(e.handle, e);
    });
    const pk = { candidates: () => [...doc.entityIndex.keys()].map((handle) => ({ handle })), entity: (h: string) => doc.entityIndex.get(h), distance: () => 0, segmentsNear: () => [] } as unknown as Picker;
    return { doc, pk };
  };

  it('타원: 기준점 (8, 0)에서 그은 접점 (2, ±√3), 타원호 범위 밖은 없다', () => {
    const { doc, pk } = setupDoc(ellipse(0, 0, 4, 0, 0.5));
    const s = findSnaps(doc, pk, P(2.1, 1.8), 0.5, TAN, P(8, 0))[0]!;
    expect(s).toMatchObject({ kind: 'tan', handle: 'E0' });
    expect(near(s, P(2, Math.sqrt(3)), 1e-12)).toBe(true);
    const half = setupDoc(ellipse(0, 0, 4, 0, 0.5, 0, Math.PI));
    expect(findSnaps(half.doc, half.pk, P(2.1, -1.8), 0.5, TAN, P(8, 0))).toEqual([]);
  });

  it('스플라인: 기준점에서 그은 접점(접선 방향 = 도함수), 지연된 접점은 곡선 위 가장 가까운 점', () => {
    const sp = spline([[0, 0], [5, 10], [10, -6], [15, 8], [20, 0]]);
    const { doc, pk } = setupDoc(sp);
    const pc = entityPath(sp)!.pieces[0]!;
    // 먼저 접점 하나를 근 찾기 없이 촘촘한 표본으로 대략 찾고, 그 근처에 커서를 둔다
    const q = P(10, 20);
    let rough = P(0, 0);
    let prev = NaN;
    for (let i = 0; i <= 4000; i++) {
      const p = pieceAt(pc, i / 4000);
      const f = cross(pieceD1(pc, i / 4000), { x: p.x - q.x, y: p.y - q.y });
      if (i && Math.sign(f) !== Math.sign(prev)) {
        rough = p;
        break;
      }
      prev = f;
    }
    const s = findSnaps(doc, pk, rough, 0.3, TAN, q)[0]!;
    expect(s).toMatchObject({ kind: 'tan', handle: 'E0' });
    expect(Math.hypot(s.x - rough.x, s.y - rough.y)).toBeLessThan(0.05);
    // 지연된 접점
    const at = pieceAt(pc, 0.3);
    const d = findSnaps(doc, pk, { x: at.x + 0.05, y: at.y + 0.05 }, 0.5, TAN, null, { deferTan: true })[0]!;
    expect(d).toMatchObject({ kind: 'tan', handle: 'E0', deferred: true });
    expect(Math.hypot(d.x - at.x, d.y - at.y)).toBeLessThan(0.1);
  });
});

function setup() {
  const h = makeApp();
  registerDrawCommands(h.app);
  const pk = new FakePicker(h.doc);
  (h.app as unknown as { picker: () => unknown }).picker = () => pk;
  (h.app as unknown as { settings: { aperture: number } }).settings.aperture = 1;
  const add = (e: Entity) => {
    e.handle = h.st.session.newHandle();
    e.owner = h.doc.blocks.get(MODEL_SPACE)!.recordHandle;
    h.st.session.commit({ label: 'T', ops: [{ kind: 'add', block: MODEL_SPACE, entity: e }] });
    return e;
  };
  const ev = () => ({ pointerType: 'mouse', shiftKey: false, ctrlKey: false, metaKey: false, clientX: 0, clientY: 0 }) as PointerEvent;
  return { ...h, add, cl: h.cmd as unknown as DirectCommandLine, move: (p: Pt) => h.view.events.move!(p, p, ev()), click: (p: Pt) => h.view.events.click!(p, p, ev()) };
}
const ov = (h: RealApp) => h.view.overlay as unknown as OverlayState;

describe('LINE에서 타원 접점(진짜 App)', () => {
  it('기준점에서 그은 접점 표식을 찍으면 타원에 접하는 선', async () => {
    const h = setup();
    h.add(ellipse(0, 0, 4, 0, 0.5));
    h.app.snapModes.clear();
    h.app.snapModes.add('tan');
    h.app.dynOn = false;
    void h.app.run('LINE');
    await settle();
    h.app.submitInput('8,0');
    await settle();
    h.move(P(2.3, 1.6));
    expect(ov(h).snap).toMatchObject({ kind: 'tan' });
    expect(near(ov(h).snap!.p, P(2, Math.sqrt(3)), 1e-12)).toBe(true);
    h.click(P(2.3, 1.6));
    await settle();
    h.app.cancel();
    await settle();
    const l = [...h.doc.entityIndex.values()].find((e): e is LineEntity => e.type === 'LINE')!;
    expect(l.end.x).toBeCloseTo(2, 12);
    expect(l.end.y).toBeCloseTo(Math.sqrt(3), 12);
  });

  it('TAN 재지정으로 타원 위에 지연된 접점, 다음 점에서 그은 접선', async () => {
    const h = setup();
    h.add(ellipse(0, 0, 4, 0, 0.5));
    h.app.osnapOn = false;
    h.app.dynOn = false;
    void h.app.run('LINE');
    await settle();
    h.app.submitInput('TAN');
    h.move(P(0.2, 2.2));
    expect(ov(h).snap).toMatchObject({ kind: 'tan', deferred: true });
    expect(ov(h).tip).toBe('지연된 접점');
    h.click(P(0.2, 2.2));
    await settle();
    h.app.submitInput('8,0');
    await settle();
    h.app.cancel();
    await settle();
    const l = [...h.doc.entityIndex.values()].find((e): e is LineEntity => e.type === 'LINE')!;
    expect(l.start.x).toBeCloseTo(2, 9);
    expect(l.start.y).toBeCloseTo(Math.sqrt(3), 9);
    expect(l.end).toMatchObject({ x: 8, y: 0 });
  });
});
