/**
 * 27차: 회전한 UCS에서 새로 만드는 선형 치수(수평·수직·회전)의 치수선 각도(DXF 50)와 수평 방향(51).
 * 근거: 도움말 "About the Types of Dimensions"(회전한 보기 — 치수 구성 요소는 만들 때의 UCS 축에서 수평·수직 방향을 정한다),
 * "About the User Coordinate System (UCS)"(UCS는 치수 객체의 정렬·각도와 절대 기준 각도의 방향을 정한다),
 * DXF 참조 공통 치수 그룹 코드 51(수평·수직·회전 선형 치수의 문자와 선 방향을 정하는 수평 방향 — OCS X축과 UCS X축 사이 각도의 음수),
 * ObjectARX 참조 AcDbRotatedDimension("수평" 치수의 각도 = OCS X축과 UCS X축 사이 각도, "수직"은 그보다 90°, 회전 각도는 OCS X축에서).
 * 로컬 대조: ezdxf가 UCS에서 만든 선형 치수(50·정의점·화살촉·보조선·문자 방향)와 같다(아래 대조 시험).
 * 돌지 않은 UCS와 이미 있는 치수는 예전 값 그대로다(모형 탭·도면 공간 모두).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DimensionEntity, Entity, MTextEntity, Vec3 } from '../../src/core/model';
import { MODEL_SPACE, PAPER_SPACE } from '../../src/core/model';
import { registerDimCommands } from '../../src/app/dimcmds';
import { registerDimSmartCommand } from '../../src/app/dimsmart';
import { registerEditCmds2Dim } from '../../src/app/editcmds2-dim';
import { registerUcsCommands } from '../../src/app/ucs';
import { createLinearDimension, generateDimensionGeometry, toUcsAxes, ucsHorizontalDirection, ucsLinearRotation } from '../../src/edit/dim';
import { linearChoice } from '../../src/edit/dim/smart';
import { createNewDocument } from '../../src/core/newdoc';
import { writeDxf } from '../../src/io/dxf/writer';
import { writeDwg } from '../../src/io/dwg/writer/index';
import { readCadFile } from '../../src/io/index';
import { browserGlobals } from '../polish/fakes';
import { makeApp, settle } from '../polish/real-app';
import type { DirectCommandLine } from '../direct/fakes';
import { FakePicker } from '../direct/fakes';
import { PYTHON, hasPython } from '../oracle/ezdxf';
import { makeDoc } from './doc';

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

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
type Pt = { x: number; y: number };
const V = (x: number, y: number, z = 0): Vec3 => ({ x, y, z });
const DEG = Math.PI / 180;
/** UCS(원점 o, X축 각도 a)의 (u, v) → WCS */
const at = (o: Pt, a: number, u: number, v: number): Vec3 => V(o.x + u * Math.cos(a) - v * Math.sin(a), o.y + u * Math.sin(a) + v * Math.cos(a));
/** WCS 점 → UCS(원점 o, X축 각도 a) 좌표 */
const inUcs = (o: Pt, a: number, q: Pt): Pt => ({ x: (q.x - o.x) * Math.cos(a) + (q.y - o.y) * Math.sin(a), y: -(q.x - o.x) * Math.sin(a) + (q.y - o.y) * Math.cos(a) });
/** WCS 점의 정확한 입력 글(* 절대 WCS) */
const wcs = (p: Pt) => `*${p.x},${p.y}`;
/** 두 각도가 2π 차이 안에서 같은지(차이 라디안) */
const angDiff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const mtexts = (doc: Parameters<typeof generateDimensionGeometry>[0], d: DimensionEntity) =>
  generateDimensionGeometry(doc, d).entities.filter((e): e is MTextEntity => e.type === 'MTEXT');

describe('UCS 기준 치수선 각도와 수평 방향(순수 함수)', () => {
  it('ucsLinearRotation: UCS가 돌지 않으면 그대로, 돌면 UCS 각도를 더해 (−π, π]로', () => {
    expect(ucsLinearRotation(0)).toBe(0);
    expect(ucsLinearRotation(Math.PI / 2, 0)).toBe(Math.PI / 2);
    expect(ucsLinearRotation(270 * DEG, 0)).toBe(270 * DEG);
    expect(ucsLinearRotation(0, 30 * DEG)).toBeCloseTo(30 * DEG, 15);
    expect(ucsLinearRotation(Math.PI / 2, 30 * DEG)).toBeCloseTo(120 * DEG, 15);
    expect(ucsLinearRotation(Math.PI / 2, -60 * DEG)).toBeCloseTo(30 * DEG, 15);
    expect(ucsLinearRotation(Math.PI / 2, 135 * DEG)).toBeCloseTo(-135 * DEG, 14);
    expect(ucsLinearRotation(0, Math.PI)).toBeCloseTo(Math.PI, 15);
    expect(ucsLinearRotation(20 * DEG, 30 * DEG)).toBeCloseTo(50 * DEG, 15);
    expect(ucsLinearRotation(0, 2 * Math.PI)).toBe(0);
    expect(ucsHorizontalDirection(30 * DEG)).toBeCloseTo(-30 * DEG, 15);
  });

  it('toUcsAxes: UCS 방향으로 돌린 좌표, 0이면 같은 객체', () => {
    const q = { x: 3, y: 4 };
    expect(toUcsAxes(q)).toBe(q);
    const r = toUcsAxes(at({ x: 0, y: 0 }, 30 * DEG, 7, -2), 30 * DEG);
    expect(r.x).toBeCloseTo(7, 12);
    expect(r.y).toBeCloseTo(-2, 12);
  });
});

describe('createLinearDimension의 UCS 방향', () => {
  it('ucsAngle이 없거나 0이면 예전과 같은 치수(자동 수평·수직, H·V·회전)', () => {
    const doc = createNewDocument('metric');
    for (const q of [V(40, 60), V(90, 10), V(-30, -30), V(120, 80)]) {
      const a = createLinearDimension(doc, V(10, 5), V(60, 25), q);
      expect(createLinearDimension(doc, V(10, 5), V(60, 25), q, { ucsAngle: 0 })).toEqual(a);
      expect(a.horizontalDirection).toBe(0);
      expect([0, Math.PI / 2]).toContain(a.rotation);
    }
    for (const rotation of [0, Math.PI / 2, 20 * DEG]) {
      const a = createLinearDimension(doc, V(10, 5), V(60, 25), V(40, 60), { rotation });
      expect(createLinearDimension(doc, V(10, 5), V(60, 25), V(40, 60), { rotation: ucsLinearRotation(rotation, 0), ucsAngle: 0 })).toEqual(a);
    }
  });

  it('30° UCS: 자동 수평·수직을 UCS 축으로, 50 = 30°·120°, 51 = −30°, 값은 UCS X·Y 거리', () => {
    const doc = createNewDocument('metric');
    const o = { x: 100, y: 50 };
    const a = 30 * DEG;
    const p1 = at(o, a, 10, 5);
    const p2 = at(o, a, 60, 25);
    const h = createLinearDimension(doc, p1, p2, at(o, a, 30, 40), { ucsAngle: a });
    expect(h.rotation).toBeCloseTo(a, 14);
    expect(h.horizontalDirection).toBeCloseTo(-a, 15);
    expect(h.measurement).toBeCloseTo(50, 9);
    // 10은 둘째 보조선과 치수선이 만나는 점: UCS (60, 40)
    const q = inUcs(o, a, h.defPoint);
    expect(q.x).toBeCloseTo(60, 9);
    expect(q.y).toBeCloseTo(40, 9);
    const v = createLinearDimension(doc, p1, p2, at(o, a, 80, 15), { ucsAngle: a });
    expect(v.rotation).toBeCloseTo(120 * DEG, 14);
    expect(v.horizontalDirection).toBeCloseTo(-a, 15);
    expect(v.measurement).toBeCloseTo(20, 9);
  });

  it('UCS 축으로 견주면 WCS 축과 다른 쪽을 고른다(UCS 위 → UCS 수평)', () => {
    const doc = createNewDocument('metric');
    const o = { x: 0, y: 0 };
    const a = 60 * DEG;
    const p1 = at(o, a, 0, 0);
    const p2 = at(o, a, 40, 10);
    const q = at(o, a, 20, 30);
    // WCS 축으로는 q가 두 점의 X 범위 밖으로 더 벗어나 수직이었다
    expect(createLinearDimension(doc, p1, p2, q).rotation).toBe(Math.PI / 2);
    const d = createLinearDimension(doc, p1, p2, q, { ucsAngle: a });
    expect(d.rotation).toBeCloseTo(a, 14);
    expect(d.measurement).toBeCloseTo(40, 9);
  });

  it('문자 방향: 51의 UCS X축이 읽는 방향과 DIMTIH 수평의 기준(51이 0이면 WCS 기준으로 뒤집히거나 WCS 수평)', () => {
    const doc = makeDoc();
    const o = { x: 0, y: 0 };
    // ISO-25(DIMTIH 0): 135° UCS의 수직 치수는 UCS Y(225°)로 읽는다. 51을 빼면 WCS 기준으로 뒤집혀 45°
    const a = 135 * DEG;
    const v = createLinearDimension(doc, at(o, a, 10, 5), at(o, a, 60, 25), at(o, a, 80, 15), { ucsAngle: a, style: 'ISO-25' });
    expect(v.rotation).toBeCloseTo(-135 * DEG, 14);
    expect(angDiff(mtexts(doc, v)[0]!.rotation, 225 * DEG)).toBeLessThan(1e-9);
    expect(angDiff(mtexts(doc, { ...v, horizontalDirection: 0 })[0]!.rotation, 45 * DEG)).toBeLessThan(1e-9);
    // Standard(DIMTIH 1): 30° UCS의 수직 치수 문자는 UCS 수평(30°). 51을 빼면 WCS 수평(0°)
    const b = 30 * DEG;
    const w = createLinearDimension(doc, at(o, b, 10, 5), at(o, b, 60, 25), at(o, b, 80, 15), { ucsAngle: b, style: 'Standard' });
    expect(angDiff(mtexts(doc, w)[0]!.rotation, b)).toBeLessThan(1e-9);
    expect(angDiff(mtexts(doc, { ...w, horizontalDirection: 0 })[0]!.rotation, 0)).toBeLessThan(1e-9);
  });

  it('DXF·DWG로 써서 다시 읽어도 50·51과 다시 그린 값이 같다', () => {
    const doc = createNewDocument('metric');
    const a = 30 * DEG;
    const o = { x: 0, y: 0 };
    const d0 = createLinearDimension(doc, at(o, a, 10, 5), at(o, a, 60, 25), at(o, a, 80, 15), { ucsAngle: a });
    d0.handle = 'A0';
    d0.owner = doc.blocks.get(MODEL_SPACE)!.recordHandle;
    doc.blocks.get(MODEL_SPACE)!.entities.push(d0);
    doc.entityIndex.set('A0', d0);
    for (const [name, data] of [
      ['x.dxf', writeDxf(doc, { version: 'AC1032' }).data],
      ['x12.dxf', writeDxf(doc, { version: 'AC1009' }).data],
      ['x.dwg', writeDwg(doc, { version: 'AC1032' }).data],
      ['x2000.dwg', writeDwg(doc, { version: 'AC1015' }).data],
    ] as const) {
      const back = readCadFile(data, name);
      const d = back.blocks.get(MODEL_SPACE)!.entities.find((e): e is DimensionEntity => e.type === 'DIMENSION');
      expect(d, name).toBeDefined();
      expect(angDiff(d!.rotation, 120 * DEG), name).toBeLessThan(1e-9);
      expect(d!.horizontalDirection, name).toBeCloseTo(-a, 9);
      expect(generateDimensionGeometry(back, d!).measurement, name).toBeCloseTo(20, 9);
    }
  });
});

describe('DIM의 선형·정렬 고르기(linearChoice)도 UCS 축으로', () => {
  it('UCS가 돌지 않으면 예전과 같다', () => {
    const cases: [Pt, Pt, Pt][] = [
      [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 30, y: 4 }],
      [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 2, y: 8 }],
      [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 5 }],
    ];
    for (const [p, q, c] of cases) expect(linearChoice(p, q, c, 0)).toEqual(linearChoice(p, q, c));
  });

  it('30° UCS: UCS X·Y와 나란한 선분은 늘 UCS 수평·수직, 기울어진 선분은 띠 안이면 정렬, 밖이면 UCS 자동', () => {
    const a = 30 * DEG;
    const o = { x: 5, y: -3 };
    const c1 = linearChoice(at(o, a, 0, 0), at(o, a, 10, 0), at(o, a, 30, 4), a);
    expect(c1.aligned).toBe(false);
    expect(!c1.aligned && c1.rotation).toBeCloseTo(a, 14);
    const c2 = linearChoice(at(o, a, 0, 0), at(o, a, 0, 10), at(o, a, 4, 30), a);
    expect(!c2.aligned && c2.rotation).toBeCloseTo(120 * DEG, 14);
    expect(linearChoice(at(o, a, 0, 0), at(o, a, 10, 10), at(o, a, 2, 8), a)).toEqual({ aligned: true });
    const c4 = linearChoice(at(o, a, 0, 0), at(o, a, 10, 10), at(o, a, 5, 20), a);
    expect(!c4.aligned && c4.rotation).toBeCloseTo(a, 14);
    // WCS 수평인 선분은 30° UCS에서는 기울어진 선분: 띠 안이면 정렬
    expect(linearChoice({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 3 }, a)).toEqual({ aligned: true });
  });
});

/** 모형 UCS 원점 (50, 0), X축 각도 ma; 도면 공간 UCS 원점 (200, 150), X축 각도 pa */
function setup(space: string, ma: number, pa: number) {
  const h = makeApp();
  registerDimCommands(h.app);
  registerDimSmartCommand(h.app);
  registerEditCmds2Dim(h.app);
  registerUcsCommands(h.app);
  const pk = new FakePicker(h.doc);
  (h.app as unknown as { picker: () => unknown }).picker = () => pk;
  h.app.polarOn = false;
  h.app.otrackOn = false;
  h.app.dynOn = false;
  h.app.osnapOn = false;
  const dirs = (a: number) => [V(Math.cos(a), Math.sin(a)), V(-Math.sin(a), Math.cos(a))] as const;
  h.doc.header.set('$UCSORG', V(50, 0));
  h.doc.header.set('$UCSXDIR', dirs(ma)[0]);
  h.doc.header.set('$UCSYDIR', dirs(ma)[1]);
  h.doc.header.set('$PUCSORG', V(200, 150));
  h.doc.header.set('$PUCSXDIR', dirs(pa)[0]);
  h.doc.header.set('$PUCSYDIR', dirs(pa)[1]);
  const cl = h.cmd as unknown as DirectCommandLine;
  const type = async (...ts: string[]) => {
    for (const t of ts) {
      cl.type(t);
      await settle();
    }
  };
  h.st.space = space;
  const dims = () => h.doc.blocks.get(space)!.entities.filter((e): e is DimensionEntity => e.type === 'DIMENSION');
  const shown = () => h.out().filter((t) => t.startsWith('치수 문자 ='));
  const run = async (name: string, ...ts: string[]) => {
    void h.app.run(name);
    await settle();
    await type(...ts);
  };
  return { ...h, type, dims, shown, run };
}

describe('진짜 App: 회전한 UCS의 선형 치수 명령', () => {
  const MO = { x: 50, y: 0 };
  const PO = { x: 200, y: 150 };

  it('모형 탭 30° UCS의 DIMLINEAR: 자동 수평·수직(V)·회전(R 20 → UCS X에서 20°), 51 −30°', async () => {
    const a = 30 * DEG;
    const h = setup(MODEL_SPACE, a, 0);
    const p1 = wcs(at(MO, a, 10, 5));
    const p2 = wcs(at(MO, a, 60, 25));
    await h.run('DIMLINEAR', p1, p2, wcs(at(MO, a, 30, 40)));
    await h.run('DIMLINEAR', p1, p2, 'V', wcs(at(MO, a, 30, 40)));
    await h.run('DIMLINEAR', p1, p2, 'R', '20', wcs(at(MO, a, 30, 40)));
    const [x, y, r] = h.dims();
    expect(x!.rotation).toBeCloseTo(a, 12);
    expect(y!.rotation).toBeCloseTo(120 * DEG, 12);
    expect(r!.rotation).toBeCloseTo(50 * DEG, 12);
    for (const d of [x!, y!, r!]) {
      expect(d.dimType & 7).toBe(0);
      expect(d.horizontalDirection).toBeCloseTo(-a, 12);
    }
    expect(x!.measurement).toBeCloseTo(50, 9);
    expect(y!.measurement).toBeCloseTo(20, 9);
    expect(r!.measurement).toBeCloseTo(50 * Math.cos(20 * DEG) + 20 * Math.sin(20 * DEG), 9);
    expect(h.shown().slice(0, 2)).toEqual([expect.stringMatching(/^치수 문자 = 50([.,]0+)?$/), expect.stringMatching(/^치수 문자 = 20([.,]0+)?$/)]);
  });

  it('도면 공간 90° UCS($PUCSXDIR)의 DIMLINEAR 자동 수평: 50 = 90°, 51 = −90°, UCS X 거리', async () => {
    const a = 90 * DEG;
    const h = setup(PAPER_SPACE, 0, a);
    await h.run('DIMLINEAR', wcs(at(PO, a, 10, 5)), wcs(at(PO, a, 60, 25)), wcs(at(PO, a, 30, 40)));
    const [d] = h.dims();
    expect(d!.rotation).toBeCloseTo(a, 12);
    expect(d!.horizontalDirection).toBeCloseTo(-a, 12);
    expect(d!.measurement).toBeCloseTo(50, 9);
  });

  it('돌지 않은 UCS(모형·도면 공간)는 예전 값 그대로(50 = 0·90°, 51 = 0)', async () => {
    const m = setup(MODEL_SPACE, 0, 30 * DEG);
    await m.run('DIMLINEAR', '*10,5', '*60,25', '*30,40');
    await m.run('DIMLINEAR', '*10,5', '*60,25', 'R', '20', '*30,40');
    const p = setup(PAPER_SPACE, 30 * DEG, 0);
    await p.run('DIMLINEAR', '*210,155', '*260,175', '*280,165');
    const [mh, mr] = m.dims();
    const [pv] = p.dims();
    expect(mh!.rotation).toBe(0);
    expect(mh!.horizontalDirection).toBe(0);
    expect(mh!.measurement).toBeCloseTo(50, 9);
    expect(mr!.rotation).toBe(20 * DEG);
    expect(mr!.horizontalDirection).toBe(0);
    expect(pv!.rotation).toBe(Math.PI / 2);
    expect(pv!.horizontalDirection).toBe(0);
    expect(pv!.measurement).toBeCloseTo(20, 9);
  });

  it('DIM(두 점)·DIMHORIZONTAL·DIMVERTICAL도 UCS 축', async () => {
    const a = 30 * DEG;
    const h = setup(MODEL_SPACE, a, 0);
    const p1 = wcs(at(MO, a, 10, 5));
    const p2 = wcs(at(MO, a, 60, 25));
    await h.run('DIM', p1, p2, wcs(at(MO, a, 80, 15)), '');
    await h.run('DIMHORIZONTAL', p1, p2, wcs(at(MO, a, 80, 15)));
    await h.run('DIMVERTICAL', p1, p2, wcs(at(MO, a, 30, 40)));
    const [s, hz, vt] = h.dims();
    expect(s!.dimType & 7).toBe(0);
    expect(s!.rotation).toBeCloseTo(120 * DEG, 12);
    expect(s!.measurement).toBeCloseTo(20, 9);
    expect(hz!.rotation).toBeCloseTo(a, 12);
    expect(hz!.measurement).toBeCloseTo(50, 9);
    expect(vt!.rotation).toBeCloseTo(120 * DEG, 12);
    expect(vt!.measurement).toBeCloseTo(20, 9);
    for (const d of [s!, hz!, vt!]) expect(d.horizontalDirection).toBeCloseTo(-a, 12);
    expect(h.app.busyCommand).toBeFalsy();
  });

  it('DIMCONTINUE·DIMBASELINE·DIM의 C·B는 기준 치수의 50·51을 잇는다', async () => {
    const a = 30 * DEG;
    const h = setup(MODEL_SPACE, a, 0);
    await h.run('DIMLINEAR', wcs(at(MO, a, 10, 5)), wcs(at(MO, a, 60, 25)), wcs(at(MO, a, 30, 40)));
    h.app.lastCreated.push(h.dims()[0]!.handle);
    await h.run('DIMCONTINUE', wcs(at(MO, a, 90, 0)), '', '');
    await h.run('DIMBASELINE', wcs(at(MO, a, 120, 10)), '', '');
    await h.run('DIM', 'C', '', wcs(at(MO, a, 140, 10)), '', '');
    await h.run('DIM', 'B', '', wcs(at(MO, a, 150, 10)), '', '');
    const ds = h.dims();
    expect(ds).toHaveLength(5);
    // 기준: DIMCONTINUE는 첫 치수의 둘째 원점(UCS X 60)에서, DIMBASELINE·DIM B는 첫 원점(10)에서, DIM C(Enter — 마지막으로 고른 첫 치수)는 60에서
    expect(ds.map((d) => Math.round(d.measurement * 1e9) / 1e9)).toEqual([50, 30, 110, 80, 140]);
    for (const d of ds) {
      expect(d.dimType & 7).toBe(0);
      expect(d.rotation).toBeCloseTo(a, 12);
      expect(d.horizontalDirection).toBeCloseTo(-a, 12);
    }
    expect(h.app.busyCommand).toBeFalsy();
  });

  it('51이 없는 예전 치수를 회전한 UCS에서 이어도 예전과 같다(50 = 0, 51 = 0)', async () => {
    const h = setup(MODEL_SPACE, 30 * DEG, 0);
    const old = createLinearDimension(h.doc, V(10, 5), V(60, 25), V(30, 40));
    expect(old.horizontalDirection).toBe(0);
    old.handle = 'OLD';
    old.owner = h.doc.blocks.get(MODEL_SPACE)!.recordHandle;
    h.doc.blocks.get(MODEL_SPACE)!.entities.push(old);
    h.doc.entityIndex.set('OLD', old);
    h.app.lastCreated.push('OLD');
    await h.run('DIMCONTINUE', '*90,0', '', '');
    const [, d] = h.dims();
    expect(d!.rotation).toBe(0);
    expect(d!.horizontalDirection).toBe(0);
    expect(d!.measurement).toBeCloseTo(30, 9);
  });
});

describe.skipIf(!hasPython)('로컬 대조: ezdxf가 회전한 UCS에서 만든 선형 치수', () => {
  it('50·정의점·화살촉·보조선과 문자 방향이 이 앱이 같은 UCS에서 만든 치수와 같다(51을 0으로 두면 문자 방향이 어긋난다)', () => {
    const dir = join(ROOT, '.runtime/dim');
    mkdirSync(dir, { recursive: true });
    const path = join(dir, 'linrot27.dxf');
    const code = [
      'import sys, json, math, ezdxf',
      'from ezdxf.math import UCS',
      "doc = ezdxf.new('R2018', setup=True)",
      'msp = doc.modelspace()',
      "base = dict(dimasz=2.5, dimexo=0.625, dimexe=1.25, dimgap=0.625, dimtxt=2.5, dimtad=1, dimtih=0, dimtoh=0, dimdec=2, dimzin=8, dimtofl=1, dimblk='', dimblk1='', dimblk2='', dimsah=0, dimlunit=2, dimscale=1, dimtsz=0, dimdle=0, dimtix=0, dimsoxd=0, dimatfit=3, dimjust=0, dimlfac=1, dimtmove=0)",
      "for name, kw in (('ISO', base), ('TIH', {**base, 'dimtad': 0, 'dimtih': 1, 'dimtoh': 1})):",
      "    s = doc.dimstyles.duplicate_entry('EZDXF', name)",
      '    for k, v in kw.items(): s.set_dxf_attrib(k, v)',
      'out = {}',
      'for rot in (30.0, -60.0, 135.0):',
      '    a = math.radians(rot)',
      '    ucs = UCS(origin=(100, 50, 0), ux=(math.cos(a), math.sin(a), 0), uy=(-math.sin(a), math.cos(a), 0))',
      "    for style in ('ISO', 'TIH'):",
      '        for ang in (0.0, 90.0, 20.0):',
      '            d = msp.add_linear_dim(base=(30, 40), p1=(10, 5), p2=(60, 25), angle=ang, dimstyle=style)',
      '            d.render(ucs=ucs)',
      '            e = d.dimension',
      "            out[e.dxf.handle] = [rot, ang, style]",
      'doc.saveas(sys.argv[1])',
      'print(json.dumps(out))',
    ].join('\n');
    const meta = JSON.parse(execFileSync(PYTHON, ['-I', '-c', code, path], { encoding: 'utf8', timeout: 120_000 })) as Record<string, [number, number, string]>;
    const doc = readCadFile(new Uint8Array(readFileSync(path)), path);
    type P2 = { x: number; y: number };
    const near = (p: P2, q: P2) => Math.hypot(p.x - q.x, p.y - q.y) <= 1e-6;
    const tips = (es: Entity[]): P2[] => es.flatMap((e) => (e.type === 'SOLID' ? [e.points[2]] : e.type === 'INSERT' ? [e.insert] : []));
    const lines = (es: Entity[]) => es.flatMap((e) => (e.type === 'LINE' ? [[e.start, e.end] as const] : []));
    let checked = 0;
    let flipped = 0;
    for (const ref of doc.blocks.get(MODEL_SPACE)!.entities) {
      if (ref.type !== 'DIMENSION') continue;
      const [rot, ang, style] = meta[ref.handle]!;
      const ua = rot * DEG;
      const label = `${rot}° UCS ${ang}° ${style}`;
      // 이 앱이 같은 UCS에서 같은 두 점·치수선 점으로 만든 치수
      const mine = createLinearDimension(doc, ref.defPoint2, ref.defPoint3, ref.defPoint, { rotation: ucsLinearRotation(ang * DEG, ua), ucsAngle: ua, style });
      expect(angDiff(mine.rotation, ref.rotation), label).toBeLessThan(1e-9);
      // 10은 둘 다 치수선 위(이 앱은 둘째 보조선과 만나는 점, ezdxf는 첫 보조선 쪽): 같은 치수선인지만 본다
      const n = { x: -Math.sin(ref.rotation), y: Math.cos(ref.rotation) };
      expect(Math.abs((mine.defPoint.x - ref.defPoint.x) * n.x + (mine.defPoint.y - ref.defPoint.y) * n.y), label).toBeLessThan(1e-6);
      const want = doc.blocks.get(ref.block.toUpperCase())!.entities;
      const got = generateDimensionGeometry(doc, mine).entities;
      const tw = tips(want);
      const tg = tips(got);
      expect(tw.length, label).toBe(2);
      expect(tw.every((p) => tg.some((q) => near(p, q))), label).toBe(true);
      // 보조선: 두 원점에서 DIMEXO 떨어져 시작하는 선
      for (const o of [ref.defPoint2, ref.defPoint3]) {
        const w = lines(want).find(([s]) => Math.abs(Math.hypot(s.x - o.x, s.y - o.y) - 0.625) < 1e-6);
        expect(w, label).toBeDefined();
        expect(lines(got).some(([s, e]) => near(s, w![0]) && near(e, w![1])), label).toBe(true);
      }
      // 문자 방향(ezdxf는 UCS에서 정한 각도를 OCS로 바꿔 둔다)
      const tWant = want.find((e): e is MTextEntity => e.type === 'MTEXT')!;
      const tGot = got.find((e): e is MTextEntity => e.type === 'MTEXT')!;
      expect(angDiff(tGot.rotation, tWant.rotation), label).toBeLessThan(1e-9);
      const flat = mtexts(doc, { ...mine, horizontalDirection: 0 })[0]!;
      if (angDiff(flat.rotation, tWant.rotation) > 1e-6) flipped++;
      checked++;
    }
    console.log(`[치수] 회전한 UCS 선형 치수 ezdxf 대조 ${checked}개, 51이 0이면 문자 방향이 어긋나는 것 ${flipped}개`);
    expect(checked).toBe(18);
    // 51이 0이면 135° UCS의 수평·회전, −60° UCS·30° UCS의 TIH 문자 등이 ezdxf와 어긋난다(51이 실제로 쓰였다는 표시)
    expect(flipped).toBeGreaterThan(4);
  });
});
