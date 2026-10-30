/**
 * 22차: 도면 공간의 선형·정렬 치수가 뷰포트 안 모형 점에 스냅하고, 두 원점이 같은 뷰포트 하나의 모형 스냅이면 측정값이 모형 공간 거리.
 * 도움말 "To Set Dimension Scale for Creating Dimensions in a Layout"(도면 공간에서 모형 공간 점에 객체 스냅으로 잡아 모형 공간 값의 치수),
 * "About Setting the Scale for Dimensions"(연관 치수는 뷰포트 축척 맞춤이 DIMLFAC와 합쳐진 스타일 재지정, 비연관 치수는 DIMLFAC를 뷰포트마다),
 * DIMLFAC(음수는 도면 공간에서만, 뷰포트 옵션은 모형 → 종이 축척의 음수). 공간을 넘는 연관은 아직 만들지 않는다(비연관).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DimensionEntity, Entity, LineEntity, Vec3, ViewportEntity } from '../../src/core/model';
import { MODEL_SPACE, PAPER_SPACE, entityDefaults } from '../../src/core/model';
import { registerDimCommands, viewportScaled } from '../../src/app/dimcmds';
import { dimDisplayText } from '../../src/app/inquiry';
import { newViewport } from '../../src/edit/filecmds/layoutgeom';
import { createLinearDimension } from '../../src/edit/dim';
import { createNewDocument } from '../../src/core/newdoc';
import { writeDxf } from '../../src/io/dxf/writer';
import { writeDwg } from '../../src/io/dwg/writer/index';
import { readCadFile } from '../../src/io/index';
import { browserGlobals } from '../polish/fakes';
import { makeApp, settle } from '../polish/real-app';
import type { DirectCommandLine } from '../direct/fakes';
import { FakePicker } from '../direct/fakes';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../direct/fakes')).DirectCommandLine }));
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
const V = (x: number, y: number, z = 0): Vec3 => ({ x, y, z });
const ev = () => ({ pointerType: 'mouse', shiftKey: false, ctrlKey: false, metaKey: false, clientX: 0, clientY: 0 }) as PointerEvent;
const line3 = (a: Vec3, b: Vec3) => ({ ...entityDefaults(), type: 'LINE', handle: '', start: a, end: b }) as LineEntity;

function vpAt(id: number, r: [number, number, number, number], k: number, c: Pt, extra: Partial<ViewportEntity> = {}): ViewportEntity {
  return { ...newViewport(r, { handle: '', id, scale: k, bounds: { minX: c.x, minY: c.y, maxX: c.x, maxY: c.y } }), ...extra };
}

function setup() {
  const h = makeApp();
  registerDimCommands(h.app);
  const model = new FakePicker(h.doc);
  const paper = new FakePicker(h.doc);
  Object.defineProperty(paper, 'ents', { get: () => h.doc.blocks.get(PAPER_SPACE)!.entities.filter((e) => e.type !== 'VIEWPORT' && e.type !== 'DIMENSION') });
  (h.app as unknown as { picker: () => unknown }).picker = () => (h.st.space === MODEL_SPACE ? model : paper);
  (h.app as unknown as { pickerFor: (st: unknown, sp: string) => unknown }).pickerFor = (_st, sp) => (sp === MODEL_SPACE ? model : paper);
  h.app.polarOn = false;
  h.app.otrackOn = false;
  h.app.dynOn = false;
  h.app.osnapOn = true;
  h.app.snapModes.clear();
  h.app.snapModes.add('end');
  const cl = h.cmd as unknown as DirectCommandLine;
  const addTo = <T extends Entity>(block: string, e: T): T => {
    e.handle = h.st.session.newHandle();
    e.owner = h.doc.blocks.get(block)!.recordHandle;
    h.st.session.commit({ label: 'T', ops: [{ kind: 'add', block, entity: e }] });
    return e;
  };
  addTo(PAPER_SPACE, vpAt(1, [0, 0, 420, 297], 1, P(0, 0), { status: 1 }));
  const type = async (...ts: string[]) => {
    for (const t of ts) {
      cl.type(t);
      await settle();
    }
  };
  const at = async (p: Pt) => {
    h.view.events.move!(p, p, ev());
    h.view.events.click!(p, p, ev());
    await settle();
  };
  const dims = (space = PAPER_SPACE) => h.doc.blocks.get(space)!.entities.filter((e): e is DimensionEntity => e.type === 'DIMENSION');
  h.st.space = PAPER_SPACE;
  return {
    ...h,
    type,
    at,
    dims,
    add: <T extends Entity>(e: T) => addTo(MODEL_SPACE, e),
    viewport: (r: [number, number, number, number], k: number, c: Pt, extra: Partial<ViewportEntity> = {}) => addTo(PAPER_SPACE, vpAt(2, r, k, c, extra)),
  };
}

describe('도면 공간 선형·정렬 치수의 뷰포트 안 모형 스냅(진짜 App)', () => {
  it('DIMLINEAR: 1:10 뷰포트의 모형 선 두 끝점 → 도면 공간 치수, 값은 모형 거리 1000(DIMLFAC 재지정 −10), 연관 없음', async () => {
    const h = setup();
    h.viewport([50, 50, 350, 250], 0.1, P(500, 300));
    const ln = h.add(line3(V(0, 0), V(1000, 0)));
    void h.app.run('DIMLINEAR');
    await settle();
    // 모형 (0,0)은 종이 (150,120), (1000,0)은 (250,120)
    await h.at(P(150.4, 120.3));
    await h.at(P(249.7, 119.6));
    await h.type('200,100');
    const [d] = h.dims();
    expect(d).toBeDefined();
    expect(d!.paperSpace).toBe(true);
    expect(d!.defPoint2.x).toBeCloseTo(150, 9);
    expect(d!.defPoint3.x).toBeCloseTo(250, 9);
    expect(d!.measurement).toBeCloseTo(100, 9);
    expect(d!.overrides?.[144]).toBeCloseTo(-10, 12);
    expect(dimDisplayText(h.doc, d!).value).toBeCloseTo(100, 9);
    expect(dimDisplayText(h.doc, d!).formatted).toMatch(/^1000([.,]0+)?$/);
    expect(h.out().some((t) => /^치수 문자 = 1000([.,]0+)?$/.test(t))).toBe(true);
    // 비연관: 확장 사전도, 모형 선의 반응자도 없다
    expect(d!.xdict).toBeUndefined();
    expect((h.doc.entityIndex.get(ln.handle) as LineEntity).reactors ?? []).toEqual([]);
    expect(h.dims(MODEL_SPACE)).toEqual([]);
  });

  it('DIMALIGNED도 같다, 지금 DIMLFAC(2)와 합친다(−2 ÷ 0.1)', async () => {
    const h = setup();
    h.viewport([50, 50, 350, 250], 0.1, P(500, 300));
    h.add(line3(V(0, 0), V(600, 800)));
    h.doc.header.set('$DIMLFAC', 2);
    void h.app.run('DIMALIGNED');
    await settle();
    // 모형 (600,800)은 종이 (210,200)
    await h.at(P(150.2, 120.2));
    await h.at(P(209.8, 199.7));
    await h.type('150,180');
    const [d] = h.dims();
    expect(d!.measurement).toBeCloseTo(100, 9);
    expect(d!.overrides?.[144]).toBeCloseTo(-20, 12);
    expect(h.out().some((t) => /^치수 문자 = 2000([.,]0+)?$/.test(t))).toBe(true);
  });

  it('한 점만 모형 스냅이거나 뷰포트가 다르면 도면 공간 값(재지정 없음)', async () => {
    const h = setup();
    h.viewport([50, 50, 350, 250], 0.1, P(500, 300));
    h.add(line3(V(0, 0), V(1000, 0)));
    void h.app.run('DIMLINEAR');
    await settle();
    await h.at(P(150.4, 120.3));
    await h.type('150,130', '200,100');
    const [d] = h.dims();
    expect(d!.measurement).toBeCloseTo(10, 9);
    expect(d!.overrides?.[144]).toBeUndefined();
    expect(h.out().some((t) => /^치수 문자 = 10([.,]0+)?$/.test(t))).toBe(true);
  });

  it('모형 공간 DIMLINEAR는 그대로(재지정 없음, 연관)', async () => {
    const h = setup();
    h.add(line3(V(0, 0), V(1000, 0)));
    h.st.space = MODEL_SPACE;
    void h.app.run('DIMLINEAR');
    await settle();
    await h.at(P(0.3, 0.2));
    await h.at(P(999.8, -0.2));
    await h.type('500,-100');
    const [d] = h.dims(MODEL_SPACE);
    expect(d!.measurement).toBeCloseTo(1000, 9);
    expect(d!.overrides?.[144]).toBeUndefined();
    // 모형 공간에서는 객체 스냅으로 선에 연관한다(이전과 같다)
    expect(d!.xdict).toBeDefined();
  });
});

describe('viewportScaled와 저장', () => {
  it('지금 DIMLFAC가 음수여도 크기만 합치고, 축척이 이상하면 그대로', () => {
    const doc = createNewDocument('metric');
    const d = createLinearDimension(doc, V(0, 0), V(10, 0), V(5, 5));
    expect(viewportScaled(doc, d, 0)).toBe(d);
    expect(viewportScaled(doc, d, NaN)).toBe(d);
    const neg = viewportScaled(doc, { ...d, overrides: { 144: -4 } }, 0.5);
    expect(neg.overrides?.[144]).toBe(-8);
  });

  it('DXF·DWG로 써서 다시 읽어도 DIMLFAC 재지정(−10)이 남는다', () => {
    const doc = createNewDocument('metric');
    const d0 = viewportScaled(doc, createLinearDimension(doc, V(150, 120), V(250, 120), V(200, 100)), 0.1);
    d0.handle = 'A0';
    d0.paperSpace = true;
    d0.owner = doc.blocks.get(PAPER_SPACE)!.recordHandle;
    doc.blocks.get(PAPER_SPACE)!.entities.push(d0);
    doc.entityIndex.set('A0', d0);
    for (const [name, data] of [
      ['x.dxf', writeDxf(doc, { version: 'AC1032' }).data],
      ['x.dwg', writeDwg(doc, { version: 'AC1032' }).data],
    ] as const) {
      const back = readCadFile(data, name);
      const d = back.blocks.get(PAPER_SPACE)!.entities.find((e): e is DimensionEntity => e.type === 'DIMENSION');
      expect(d, name).toBeDefined();
      expect(d!.overrides?.[144], name).toBeCloseTo(-10, 12);
      expect(dimDisplayText(back, d!).formatted, name).toMatch(/^1000([.,]0+)?$/);
    }
  });
});
