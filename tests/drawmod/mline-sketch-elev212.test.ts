// @vitest-environment jsdom
/**
 * 212차: MLINE·SKETCH가 화면에서 찍은 점에 현재 고도(ELEVATION)를 쓰는지 — 205~211차(SOLID·TEXT·MTEXT·INSERT·-INSERT·MINSERT·ATTDEF·
 * TABLE·TOLERANCE·REVCLOUD·BREAKLINE·COUNT 표·DATAEXTRACTION 표·WIPEOUT·XATTACH·IMAGEATTACH·PDFATTACH·FIELD·LEADER·QLEADER·MLEADER)의 마지막 둘.
 * Autodesk ELEV 도움말: 현재 고도는 새 객체의 기본 Z이고 X·Y만 준 점에 쓰인다.
 * DXF 참조서 MLINE: 10/20/30 시작점(WCS)과 11/21/31 정점 좌표(정점마다)는 고도 칸(38) 없는 3D 점이다.
 * SKETCH가 만드는 객체(SKPOLY): LINE 10·11은 3D 점, LWPOLYLINE은 꼭짓점이 X·Y뿐이고 고도 38 하나, SPLINE 10 조정점·11 맞춤점은 WCS 3D 점이다.
 * 전에는 두 명령이 모든 점의 Z(폴리선은 고도)를 늘 0으로 써서, 고도가 있는 도면에서 LINE·PLINE·SPLINE(같은 고도)과 다른 높이에 놓였다.
 * 이제 한 객체의 점이 모두 같은 고도다(MLINE 방향·마이터 벡터와 요소 매개변수는 그대로, 스플라인 조정점 Z도 고도 값 그대로).
 * 고도가 0인 도면, 프롬프트 흐름, 점의 X·Y는 전과 같다. MLINE은 구간마다 고치는 커밋·명령 취소(U)·닫기(C)가 모두 같은 고도다.
 * 입력이 Z를 준 점·UCS·−Z·편집 명령(MLEDIT 등)은 보지 않는다(205~211차와 같다).
 */
import { describe, expect, it, vi } from 'vitest';
import type { CadDocument, Entity, LineEntity, LwPolylineEntity, MLineEntity, SplineEntity, Vec3 } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { unpack3 } from '../../src/core/flat3';
import { lwPoints } from '../../src/core/lwpoly';
import { registerMLineCommands } from '../../src/app/mlinecmds';
import { registerSketchCommands } from '../../src/app/sketch';
import { sketchEntities } from '../../src/edit/sketch';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { makeApp, settle } from '../polish/real-app';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../polish/fakes')).FakeCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));

function setup(elevation?: number) {
  const h = makeApp();
  registerMLineCommands(h.app);
  registerSketchCommands(h.app);
  if (elevation !== undefined) h.doc.header.set('$ELEVATION', elevation);
  return h;
}

type H = ReturnType<typeof setup>;

async function run(h: H, name: string, inputs: string[]): Promise<void> {
  void h.app.run(name);
  await settle();
  for (const t of inputs) await input(h, t);
}

async function input(h: H, t: string): Promise<void> {
  h.app.submitInput(t);
  await settle();
}

/** MLINE: (0, 0) → (10, 0) → (10, 10) → Enter */
const mline3 = (h: H) => run(h, 'MLINE', ['0,0', '10,0', '10,10', '']);
/** SKETCH: 획 둘(찍은 두 점마다 펜 내림·올림) (0, 0)–(10, 0), (10, 10)–(20, 15) → Enter. 유형은 SKPOLY(0 선·1 폴리선·2 스플라인) */
async function sketch2(h: H, skpoly: number): Promise<void> {
  h.doc.header.set('$SKPOLY', skpoly);
  await run(h, 'SKETCH', ['0,0', '10,0', '10,10', '20,15', '']);
}
/** SKETCH 스플라인 획 하나 (0, 0)–(10, 5) → Enter */
async function sketchSpline(h: H): Promise<void> {
  h.doc.header.set('$SKPOLY', 2);
  await run(h, 'SKETCH', ['0,0', '10,5', '']);
}

const model = <T extends Entity>(doc: CadDocument, type: string) => doc.blocks.get(MODEL_SPACE)!.entities.filter((e) => e.type === type) as T[];
const mlines = (doc: CadDocument) => model<MLineEntity>(doc, 'MLINE');
const lines = (doc: CadDocument) => model<LineEntity>(doc, 'LINE');
const lwps = (doc: CadDocument) => model<LwPolylineEntity>(doc, 'LWPOLYLINE');
const splines = (doc: CadDocument) => model<SplineEntity>(doc, 'SPLINE');
const r6 = (v: number) => +v.toFixed(6);
const xyOf = (ps: Vec3[]) => ps.map((p) => [r6(p.x), r6(p.y)]);
/** 여러 줄의 시작점 10과 정점 11의 Z */
const mlZ = (m: MLineEntity) => [m.startPoint.z, ...m.vertices.map((v) => v.position.z)];
/** 여러 줄에서 Z를 뺀 모든 값(정점 X·Y, 방향·마이터 벡터, 요소 매개변수) — 고도 0 실행과 같아야 한다 */
const mlRest = (m: MLineEntity) => ({
  start: [m.startPoint.x, m.startPoint.y],
  flags: m.flags,
  normal: m.normal,
  vertices: m.vertices.map((v) => ({ xy: [v.position.x, v.position.y], direction: v.direction, miter: v.miter, elements: v.elements })),
});
/** 스플라인 조정점 10·맞춤점 11에 나오는 Z 값(겹친 것은 하나로) */
const splZ = (s: SplineEntity) => [...new Set([...unpack3(s.controlVerts), ...unpack3(s.fitVerts ?? [])].map((p) => p.z))];

describe('MLINE·SKETCH의 현재 고도(212차)', () => {
  it('MLINE: 고도 3에서 시작점 10·정점 11의 Z = 3(전에는 0), X·Y·방향·마이터·요소 매개변수는 고도 0과 같다, 명령 취소 한 번이면 없다', async () => {
    const h0 = setup();
    await mline3(h0);
    const h = setup(3);
    await mline3(h);
    const [m] = mlines(h.doc);
    expect(m!.vertices).toHaveLength(3);
    expect(mlZ(m!)).toEqual([3, 3, 3, 3]);
    expect(mlRest(m!)).toEqual(mlRest(mlines(h0.doc)[0]!));
    expect(xyOf(m!.vertices.map((v) => v.position))).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
    ]);
    // 방향·마이터는 벡터라 Z 0 그대로(고도 위 XY와 나란한 평면)
    expect(m!.vertices.map((v) => [v.direction.z, v.miter.z])).toEqual([
      [0, 0],
      [0, 0],
      [0, 0],
    ]);
    expect(h.st.session.undoTop()?.label).toBe('MLINE');
    h.st.session.undo();
    expect(mlines(h.doc)).toHaveLength(0);
  });

  it('MLINE 명령 취소(U)·닫기(C): 고도 −2에서 구간마다 고치는 커밋·U 뒤·닫은 뒤 모두 시작점과 정점의 Z = −2(전에는 0)', async () => {
    const h = setup(-2);
    await run(h, 'MLINE', ['0,0', '10,0', '10,10', 'U']);
    // U: 셋째 점을 빼고 같은 객체를 정점 둘로 고친다
    expect(mlines(h.doc)).toHaveLength(1);
    expect(mlZ(mlines(h.doc)[0]!)).toEqual([-2, -2, -2]);
    await input(h, '20,5');
    await input(h, '20,20');
    await input(h, 'C');
    const [m] = mlines(h.doc);
    expect(m!.flags & 2).toBe(2);
    expect(xyOf(m!.vertices.map((v) => v.position))).toEqual([
      [0, 0],
      [10, 0],
      [20, 5],
      [20, 20],
    ]);
    expect(mlZ(m!)).toEqual([-2, -2, -2, -2, -2]);
    // 점이 하나만 남는 U는 만든 객체를 지우고(명령 안의 한 단계), 다음 점에서 다시 만든다
    const h2 = setup(-2);
    await run(h2, 'MLINE', ['0,0', '10,0', 'U']);
    expect(mlines(h2.doc)).toHaveLength(0);
    await input(h2, '5,5');
    await input(h2, '');
    const [m2] = mlines(h2.doc);
    expect(xyOf(m2!.vertices.map((v) => v.position))).toEqual([
      [0, 0],
      [5, 5],
    ]);
    expect(mlZ(m2!)).toEqual([-2, -2, -2]);
    expect(h2.st.session.undoTop()?.label).toBe('MLINE');
    h2.st.session.undo();
    expect(mlines(h2.doc)).toHaveLength(0);
  });

  it('SKETCH 선·폴리선(SKPOLY 0·1): 고도 2.5에서 선 끝점 10·11의 Z와 폴리선 고도 38 = 2.5(전에는 0), X·Y는 고도 0과 같다, 명령 취소 한 번이면 없다', async () => {
    const h0 = setup();
    await sketch2(h0, 0);
    await sketch2(h0, 1);
    const h = setup(2.5);
    await sketch2(h, 0);
    const ls = lines(h.doc);
    expect(ls).toHaveLength(2);
    expect(ls.map((l) => [l.start.z, l.end.z])).toEqual([
      [2.5, 2.5],
      [2.5, 2.5],
    ]);
    expect(ls.map((l) => xyOf([l.start, l.end]))).toEqual(lines(h0.doc).map((l) => xyOf([l.start, l.end])));
    expect(xyOf([ls[1]!.start, ls[1]!.end])).toEqual([
      [10, 10],
      [20, 15],
    ]);
    expect(h.st.session.undoTop()?.label).toBe('SKETCH');
    h.st.session.undo();
    expect(lines(h.doc)).toHaveLength(0);
    await sketch2(h, 1);
    const ps = lwps(h.doc);
    expect(ps).toHaveLength(2);
    expect(ps.map((p) => p.elevation)).toEqual([2.5, 2.5]);
    expect(ps.map((p) => lwPoints(p))).toEqual(lwps(h0.doc).map((p) => lwPoints(p)));
  });

  it('SKETCH 스플라인(SKPOLY 2): 고도 −1.25에서 맞춤점 11·조정점 10의 Z가 모두 −1.25(전에는 0), X·Y는 고도 0과 같다', async () => {
    const h0 = setup();
    await sketchSpline(h0);
    const h = setup(-1.25);
    await sketchSpline(h);
    const [s] = splines(h.doc);
    const s0 = splines(h0.doc)[0]!;
    expect(unpack3(s!.fitVerts)).toHaveLength(2);
    expect(unpack3(s!.controlVerts)).toHaveLength(4);
    expect(splZ(s!)).toEqual([-1.25]);
    expect(xyOf(unpack3(s!.controlVerts))).toEqual(xyOf(unpack3(s0.controlVerts)));
    expect(xyOf(unpack3(s!.fitVerts))).toEqual([
      [0, 0],
      [10, 5],
    ]);
    expect(s!.knots).toEqual(s0.knots);
  });

  it('sketchEntities(점 넷 획, 공차 0): 고도 1.7이면 조정점 여섯·맞춤점 넷의 Z가 모두 정확히 1.7이고 조정점 X·Y는 고도 0과 같다, 선·폴리선도 그 고도', () => {
    const stroke = [
      { x: 0, y: 0 },
      { x: 3, y: 1 },
      { x: 6, y: 0 },
      { x: 9, y: 2 },
    ];
    const props = entityDefaults();
    const [a] = sketchEntities([stroke], 'spline', props, 0, 1.7) as SplineEntity[];
    const [b] = sketchEntities([stroke], 'spline', props, 0) as SplineEntity[];
    expect(unpack3(a!.controlVerts)).toHaveLength(6);
    expect(unpack3(a!.controlVerts).map((p) => p.z)).toEqual([1.7, 1.7, 1.7, 1.7, 1.7, 1.7]);
    expect(unpack3(a!.fitVerts).map((p) => p.z)).toEqual([1.7, 1.7, 1.7, 1.7]);
    expect(unpack3(a!.controlVerts).map((p) => [p.x, p.y])).toEqual(unpack3(b!.controlVerts).map((p) => [p.x, p.y]));
    expect(unpack3(b!.controlVerts).map((p) => p.z)).toEqual([0, 0, 0, 0, 0, 0]);
    const ls = sketchEntities([stroke], 'line', props, 0, 1.7) as LineEntity[];
    expect(ls.map((l) => [l.start.z, l.end.z])).toEqual([
      [1.7, 1.7],
      [1.7, 1.7],
      [1.7, 1.7],
    ]);
    const [p] = sketchEntities([stroke], 'polyline', props, 0, 1.7) as LwPolylineEntity[];
    expect(p!.elevation).toBe(1.7);
  });

  it('전과 같은 값: 고도가 없는 도면의 MLINE·SKETCH는 모든 점의 Z(폴리선 고도)가 0', async () => {
    const h = setup();
    await mline3(h);
    await sketch2(h, 0);
    await sketch2(h, 1);
    await sketchSpline(h);
    expect(mlZ(mlines(h.doc)[0]!)).toEqual([0, 0, 0, 0]);
    expect(lines(h.doc).map((l) => [l.start.z, l.end.z])).toEqual([
      [0, 0],
      [0, 0],
    ]);
    expect(lwps(h.doc).map((p) => p.elevation)).toEqual([0, 0]);
    expect(splZ(splines(h.doc)[0]!)).toEqual([0]);
  });

  it('DWG·DXF로 쓰고 다시 읽어도 같은 Z(MLINE 10·11, LINE 10·11, LWPOLYLINE 38, SPLINE 10·11 — AC1015·AC1032)', async () => {
    const h = setup(4);
    await mline3(h);
    await sketch2(h, 0);
    await sketch2(h, 1);
    await sketchSpline(h);
    const pick = (doc: CadDocument) => ({
      mline: mlines(doc).map(mlZ),
      line: lines(doc).map((l) => [l.start.z, l.end.z]),
      lw: lwps(doc).map((p) => p.elevation),
      spline: splines(doc).map(splZ),
    });
    const want = {
      mline: [[4, 4, 4, 4]],
      line: [
        [4, 4],
        [4, 4],
      ],
      lw: [4, 4],
      spline: [[4]],
    };
    expect(pick(h.doc)).toEqual(want);
    for (const version of ['AC1015', 'AC1032'] as const) {
      expect(pick(readDwg(writeDwg(h.doc, { version }).data)), `DWG ${version}`).toEqual(want);
      expect(pick(readDxf(writeDxf(h.doc, { version }).data)), `DXF ${version}`).toEqual(want);
    }
  });
});
