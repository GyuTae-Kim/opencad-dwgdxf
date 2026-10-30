/**
 * 25차: 도면 공간 세로좌표 치수의 데이텀.
 * 도움말 "About the Types of Dimensions"(세로좌표 치수의 데이텀은 지금 UCS 원점의 위치로 정해진다), UCS 명령(UCS 설정은 모형 공간과
 * 도면 공간에 따로 저장된다), UCSORG(지금 공간의 지금 뷰포트에 대한 현재 UCS 원점), "About Creating Ordinate Dimensions"(보통 UCS 원점을
 * 데이텀에 맞춘 뒤 만든다). 그래서 배치의 도면 공간에서 만드는 세로좌표의 데이텀은 도면 공간 UCS 원점($PUCSORG)이다(이전에는 어느 공간에서나
 * 모형 공간 UCS 원점 $UCSORG). 모형 공간·뷰포트 안 모형 공간·블록 편집기와 두 원점이 같은 도면(새 도면)의 값은 그대로다.
 * - 진짜 App: DIMORDINATE(모형·배치 객체·뷰포트 안 모형 객체 — 도면 공간 UCS 원점을 모형 데이텀의 종이 자리에 두면 모형 단위 좌표),
 *   DIMCONTINUE·DIMBASELINE의 세로좌표, 스마트 치수 DIM 세로좌표(O), QDIM 세로좌표(O — 데이텀 점(P)이 있으면 그 점)
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DimensionEntity, Entity, LineEntity, Vec3, ViewportEntity } from '../../src/core/model';
import { MODEL_SPACE, PAPER_SPACE, entityDefaults } from '../../src/core/model';
import { registerDimCommands } from '../../src/app/dimcmds';
import { registerDimSmartCommand } from '../../src/app/dimsmart';
import { registerAnnot2Commands } from '../../src/app/annot2';
import { registerUcsCommands, ucsOrigin } from '../../src/app/ucs';
import { createOrdinateDimension } from '../../src/edit/dim';
import { newViewport } from '../../src/edit/filecmds/layoutgeom';
import { createNewDocument } from '../../src/core/newdoc';
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

/** 모형 UCS 원점 (50, 0), 도면 공간 UCS 원점 pucs(없으면 (0, 0) — 새 도면처럼) */
function setup(space: string, pucs: Pt | null = null) {
  const h = makeApp();
  registerDimCommands(h.app);
  registerDimSmartCommand(h.app);
  registerAnnot2Commands(h.app);
  registerUcsCommands(h.app);
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
  h.doc.header.set('$UCSORG', V(50, 0));
  h.doc.header.set('$PUCSORG', pucs ? V(pucs.x, pucs.y) : V(0, 0));
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
  const dims = (sp = space) => h.doc.blocks.get(sp)!.entities.filter((e): e is DimensionEntity => e.type === 'DIMENSION');
  const shown = () => h.out().filter((t) => t.startsWith('치수 문자 ='));
  h.st.space = space;
  return {
    ...h,
    type,
    at,
    dims,
    shown,
    add: <T extends Entity>(e: T) => addTo(MODEL_SPACE, e),
    addPaper: <T extends Entity>(e: T) => addTo(PAPER_SPACE, e),
    viewport: (r: [number, number, number, number], k: number, c: Pt) => addTo(PAPER_SPACE, vpAt(2, r, k, c)),
  };
}

// 1:10 뷰포트(종이 50,50–350,250, 가운데 200,150)에 모형 (500,300)이 가운데: 모형 (x, y) → 종이 (200 + (x−500)/10, 150 + (y−300)/10)
const VP: [number, number, number, number] = [50, 50, 350, 250];
const C = P(500, 300);
const datumOf = (d: DimensionEntity) => [d.defPoint.x, d.defPoint.y];

describe('세로좌표 데이텀(순수 함수·공간별 UCS 원점)', () => {
  it('createOrdinateDimension: datum을 주면 그 점에서, 없으면 이전처럼 모형 공간 UCS 원점($UCSORG)에서 잰다', () => {
    const doc = createNewDocument('metric');
    doc.header.set('$UCSORG', V(50, 0, 7));
    const old = createOrdinateDimension(doc, V(300, 100), V(300, 140));
    expect(old.defPoint).toEqual(V(50, 0, 7));
    expect(old.measurement).toBeCloseTo(250, 12);
    const d = createOrdinateDimension(doc, V(300, 100), V(340, 100), { datum: V(200, 150) });
    expect(d.dimType & 64).toBe(0);
    expect(d.defPoint).toEqual(V(200, 150));
    // Y 데이텀: |100 − 150|
    expect(d.measurement).toBeCloseTo(50, 12);
  });

  it('ucsOrigin: 도면 공간은 $PUCSORG, 모형 공간·뷰포트 안 모형 공간·블록 편집기는 $UCSORG(Z 그대로)', () => {
    const h = setup(MODEL_SPACE, P(200, 150));
    h.doc.header.set('$UCSORG', V(50, 0, 3));
    expect(ucsOrigin(h.st)).toEqual(V(50, 0, 3));
    h.st.space = PAPER_SPACE;
    expect(ucsOrigin(h.st)).toEqual(V(200, 150));
    h.st.space = MODEL_SPACE;
    h.st.msVp = { layout: PAPER_SPACE, handle: 'X' };
    expect(ucsOrigin(h.st)).toEqual(V(50, 0, 3));
    h.st.msVp = null;
    h.st.blockEdit = { name: 'B', key: 'B', back: MODEL_SPACE, depth: 1 };
    expect(ucsOrigin(h.st)).toEqual(V(50, 0, 3));
    h.st.blockEdit = null;
    h.doc.header.delete('$PUCSORG');
    h.st.space = PAPER_SPACE;
    expect(ucsOrigin(h.st)).toEqual(V(0, 0, 0));
  });
});

describe('DIMORDINATE의 데이텀(진짜 App)', () => {
  it('모형 공간은 그대로 모형 UCS 원점(50,0)에서: X 데이텀 250', async () => {
    const h = setup(MODEL_SPACE, P(200, 150));
    void h.app.run('DIMORDINATE');
    await settle();
    await h.type('*300,100', '*300,140');
    const [d] = h.dims();
    expect(datumOf(d!)).toEqual([50, 0]);
    expect(d!.measurement).toBeCloseTo(250, 9);
    expect(h.shown()[0]).toMatch(/^치수 문자 = 250([.,]0+)?$/);
  });

  it('도면 공간의 배치 객체: 도면 공간 UCS 원점(200,150)에서 — X 40, Y 30(이전에는 모형 UCS 원점에서 190·130)', async () => {
    const h = setup(PAPER_SPACE, P(200, 150));
    void h.app.run('DIMORDINATE');
    await settle();
    await h.type('*240,180', '*240,220');
    void h.app.run('DIMORDINATE');
    await settle();
    await h.type('*240,180', 'Y', '*280,180');
    const [x, y] = h.dims();
    expect(datumOf(x!)).toEqual([200, 150]);
    expect(x!.measurement).toBeCloseTo(40, 9);
    expect(datumOf(y!)).toEqual([200, 150]);
    expect(y!.dimType & 64).toBe(0);
    expect(y!.measurement).toBeCloseTo(30, 9);
    expect(h.shown()).toEqual([expect.stringMatching(/^치수 문자 = 40([.,]0+)?$/), expect.stringMatching(/^치수 문자 = 30([.,]0+)?$/)]);
  });

  it('두 UCS 원점이 같은 새 도면(0,0)의 도면 공간 값은 그대로(23차 값 240)', async () => {
    const h = setup(PAPER_SPACE);
    h.doc.header.set('$UCSORG', V(0, 0));
    void h.app.run('DIMORDINATE');
    await settle();
    await h.type('240,150', '240,190');
    const [d] = h.dims();
    expect(datumOf(d!)).toEqual([0, 0]);
    expect(d!.measurement).toBeCloseTo(240, 9);
  });

  it('도면 공간 UCS 원점을 모형 데이텀(500,300)의 종이 자리에 두면(UCS 명령) 뷰포트 안 모형 객체의 세로좌표는 모형 데이텀에서 잰 모형 단위', async () => {
    const h = setup(PAPER_SPACE);
    h.viewport(VP, 0.1, C);
    h.add(line3(V(500, 300), V(900, 700)));
    void h.app.run('UCS');
    await settle();
    await h.type('200,150', '');
    expect(h.doc.header.get('$PUCSORG')).toEqual(V(200, 150));
    // 모형 UCS는 그대로
    expect(h.doc.header.get('$UCSORG')).toEqual(V(50, 0));
    // 모형 (900,700) → 종이 (240,190): X 데이텀 (900 − 500) = 400, Y 데이텀 (700 − 300) = 400
    void h.app.run('DIMORDINATE');
    await settle();
    await h.at(P(240.3, 190.2));
    await h.type('*240,230');
    void h.app.run('DIMORDINATE');
    await settle();
    await h.at(P(239.8, 189.7));
    await h.type('*290,190');
    const [x, y] = h.dims();
    for (const d of [x!, y!]) {
      expect(datumOf(d)).toEqual([200, 150]);
      expect(d.defPoint2.x).toBeCloseTo(240, 9);
      expect(d.defPoint2.y).toBeCloseTo(190, 9);
      expect(d.overrides?.[144]).toBeCloseTo(-10, 12);
      expect(d.measurement).toBeCloseTo(40, 9);
    }
    expect(x!.dimType & 64).toBe(64);
    expect(y!.dimType & 64).toBe(0);
    expect(h.shown()).toEqual([expect.stringMatching(/^치수 문자 = 400([.,]0+)?$/), expect.stringMatching(/^치수 문자 = 400([.,]0+)?$/)]);
  });
});

describe('다른 세로좌표 명령의 데이텀(진짜 App)', () => {
  it('DIMCONTINUE·DIMBASELINE의 세로좌표도 도면 공간 UCS 원점에서', async () => {
    const h = setup(PAPER_SPACE, P(200, 150));
    void h.app.run('DIMORDINATE');
    await settle();
    await h.type('*240,180', '*240,220');
    h.app.lastCreated.push(h.dims()[0]!.handle);
    void h.app.run('DIMCONTINUE');
    await settle();
    await h.type('*260,180', '', '');
    void h.app.run('DIMBASELINE');
    await settle();
    await h.type('*290,180', '', '');
    const ds = h.dims();
    expect(ds).toHaveLength(3);
    expect(ds.map(datumOf)).toEqual([
      [200, 150],
      [200, 150],
      [200, 150],
    ]);
    expect(ds.map((d) => Math.round(d.measurement * 1e9) / 1e9)).toEqual([40, 60, 90]);
    expect(h.app.busyCommand).toBeFalsy();
  });

  it('스마트 치수 DIM 세로좌표(O): 도면 공간 UCS 원점에서, 모형 공간은 그대로', async () => {
    const h = setup(PAPER_SPACE, P(200, 150));
    void h.app.run('DIM');
    await settle();
    await h.type('O', '*240,180', '*240,220', '', '');
    const m = setup(MODEL_SPACE, P(200, 150));
    void m.app.run('DIM');
    await settle();
    await m.type('O', '*240,180', '*240,220', '', '');
    const [d] = h.dims();
    const [md] = m.dims();
    expect(datumOf(d!)).toEqual([200, 150]);
    expect(d!.measurement).toBeCloseTo(40, 9);
    expect(datumOf(md!)).toEqual([50, 0]);
    expect(md!.measurement).toBeCloseTo(190, 9);
    expect(h.app.busyCommand).toBeFalsy();
    expect(m.app.busyCommand).toBeFalsy();
  });

  it('QDIM 세로좌표(O): 데이텀 점이 없으면 도면 공간 UCS 원점, 데이텀 점(P)을 정하면 그 점', async () => {
    const h = setup(PAPER_SPACE, P(200, 150));
    const ln = h.addPaper(line3(V(100, 260), V(160, 260)));
    h.st.selection.add(ln.handle);
    void h.app.run('QDIM');
    await settle();
    await h.type('O', '*130,280');
    const ucs = h.dims();
    expect(ucs.map(datumOf)).toEqual([
      [200, 150],
      [200, 150],
    ]);
    expect(ucs.map((d) => Math.round(d.measurement * 1e9) / 1e9)).toEqual([100, 40]);
    const p = setup(PAPER_SPACE, P(200, 150));
    const ln2 = p.addPaper(line3(V(100, 260), V(160, 260)));
    p.st.selection.add(ln2.handle);
    void p.app.run('QDIM');
    await settle();
    await p.type('O', 'P', '*90,0', '*130,280');
    expect(p.dims().map(datumOf)).toEqual([
      [90, 0],
      [90, 0],
    ]);
  });
});
