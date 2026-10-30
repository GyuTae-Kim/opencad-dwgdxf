/**
 * 26차: 회전한 UCS에서 새로 만드는 세로좌표 치수의 X·Y 값과 지시선 축.
 * 근거: 도움말 "About Creating Ordinate Dimensions"(지금 UCS의 위치와 방향이 세로좌표 값을 정한다), DIMORDINATE(Y 좌표 차이가 더 크면
 * X 좌표를 잰다), DXF 참조 공통 치수 그룹 코드 51(모든 치수에 있는 수평 방향 — OCS X축과 UCS X축 사이 각도의 음수),
 * 세로좌표 치수 그룹 코드(10은 만들 때 지금 UCS의 원점). 로컬 대조: ezdxf도 51을 세로좌표의 UCS X축으로 읽어 다시 그린다(아래 대조 시험).
 * 돌지 않은 UCS와 이미 있는 치수의 값은 그대로다(모형 탭·도면 공간 모두).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DimensionEntity, LineEntity, Vec3 } from '../../src/core/model';
import { MODEL_SPACE, PAPER_SPACE } from '../../src/core/model';
import { registerDimCommands } from '../../src/app/dimcmds';
import { registerDimSmartCommand } from '../../src/app/dimsmart';
import { registerUcsCommands } from '../../src/app/ucs';
import { createOrdinateDimension, generateDimensionGeometry, ordinateChainEnd, ordinateHorizontalDirection } from '../../src/edit/dim';
import { alignDimensions } from '../../src/edit/dim/smart';
import { moveDimPoint } from '../../src/edit/geom/stretch';
import { createNewDocument } from '../../src/core/newdoc';
import { writeDxf } from '../../src/io/dxf/writer';
import { writeDwg } from '../../src/io/dwg/writer/index';
import { readCadFile } from '../../src/io/index';
import { browserGlobals } from '../polish/fakes';
import { makeApp, settle } from '../polish/real-app';
import type { DirectCommandLine } from '../direct/fakes';
import { FakePicker } from '../direct/fakes';
import { PYTHON, hasPython } from '../oracle/ezdxf';

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
/** WCS 점의 정확한 입력 글(* 절대 WCS) */
const wcs = (p: Pt) => `*${p.x},${p.y}`;
const lines = (d: DimensionEntity) => generateDimensionGeometry(createNewDocument('metric'), d).entities.filter((e): e is LineEntity => e.type === 'LINE');

describe('세로좌표의 수평 방향(51)과 연속 지시선 끝(순수 함수)', () => {
  it('51 = −UCS 각도를 (−π, π]로, 0이면 0', () => {
    expect(ordinateHorizontalDirection(undefined)).toBe(0);
    expect(ordinateHorizontalDirection(0)).toBe(0);
    expect(ordinateHorizontalDirection(30 * DEG)).toBeCloseTo(-30 * DEG, 15);
    expect(ordinateHorizontalDirection(-90 * DEG)).toBeCloseTo(90 * DEG, 15);
    expect(ordinateHorizontalDirection(Math.PI)).toBeCloseTo(Math.PI, 15);
    expect(ordinateHorizontalDirection(210 * DEG)).toBeCloseTo(150 * DEG, 12);
    expect(ordinateHorizontalDirection(2 * Math.PI)).toBe(0);
  });

  it('연속 지시선 끝: 돌지 않은 UCS는 예전 WCS 값 그대로, 30° UCS는 지시선 축 위 앞 끝과 같은 높이', () => {
    expect(ordinateChainEnd(V(260, 180), V(240, 220), true)).toEqual(V(260, 220));
    expect(ordinateChainEnd(V(260, 180), V(240, 220), false, 0)).toEqual(V(240, 180));
    const a = 30 * DEG;
    const o = { x: 0, y: 0 };
    const e = ordinateChainEnd(at(o, a, 70, 10), at(o, a, 40, 55), true, a);
    // UCS 좌표로: X는 새 피쳐(70), Y는 앞 끝(55)
    expect(e.x * Math.cos(a) + e.y * Math.sin(a)).toBeCloseTo(70, 9);
    expect(-e.x * Math.sin(a) + e.y * Math.cos(a)).toBeCloseTo(55, 9);
  });
});

describe('createOrdinateDimension의 UCS 방향', () => {
  it('ucsAngle이 없거나 0이면 예전과 같은 치수(값·51·종류)', () => {
    const doc = createNewDocument('metric');
    const a = createOrdinateDimension(doc, V(300, 100), V(300, 140), { datum: V(50, 0) });
    const b = createOrdinateDimension(doc, V(300, 100), V(300, 140), { datum: V(50, 0), ucsAngle: 0 });
    expect(b).toEqual(a);
    expect(a.horizontalDirection).toBe(0);
    expect(a.measurement).toBeCloseTo(250, 12);
  });

  it('30° UCS: X·Y 값은 UCS 축으로, 51은 −30°, 지시선은 UCS 축 방향', () => {
    const doc = createNewDocument('metric');
    const o = { x: 10, y: 5 };
    const a = 30 * DEG;
    const f = at(o, a, 40, 25);
    const x = createOrdinateDimension(doc, f, at(o, a, 40, 60), { datum: V(10, 5), ucsAngle: a });
    expect(x.dimType & 64).toBe(64);
    expect(x.horizontalDirection).toBeCloseTo(-a, 15);
    expect(x.measurement).toBeCloseTo(40, 9);
    const y = createOrdinateDimension(doc, f, at(o, a, 75, 25), { datum: V(10, 5), ucsAngle: a });
    expect(y.dimType & 64).toBe(0);
    expect(y.measurement).toBeCloseTo(25, 9);
    // 지시선 첫 토막은 피쳐에서 UCS Y축(X 데이텀)·UCS X축(Y 데이텀) 방향
    const first = (d: DimensionEntity, u: Pt) =>
      lines(d).some((l) => {
        const dx = l.end.x - l.start.x;
        const dy = l.end.y - l.start.y;
        const len = Math.hypot(dx, dy);
        return len > 1e-6 && Math.abs((dx * u.x + dy * u.y) / len - 1) < 1e-9 && Math.hypot(l.start.x - f.x, l.start.y - f.y) < 1;
      });
    expect(first(x, { x: -Math.sin(a), y: Math.cos(a) })).toBe(true);
    expect(first(y, { x: Math.cos(a), y: Math.sin(a) })).toBe(true);
  });

  it('X·Y 자동 고르기도 UCS 축으로 견준다(도움말 DIMORDINATE: Y 좌표 차이가 크면 X 좌표)', () => {
    const doc = createNewDocument('metric');
    const a = 60 * DEG;
    const f = at({ x: 0, y: 0 }, a, 30, 10);
    // UCS Y 방향(150°)으로 뺀 지시선: WCS로는 |dx| > |dy|라 예전 규칙이면 Y 데이텀
    const e = at({ x: 0, y: 0 }, a, 30, 50);
    expect(Math.abs(e.x - f.x)).toBeGreaterThan(Math.abs(e.y - f.y));
    const d = createOrdinateDimension(doc, f, e, { datum: V(0, 0), ucsAngle: a });
    expect(d.dimType & 64).toBe(64);
    expect(d.measurement).toBeCloseTo(30, 9);
  });

  it('DXF·DWG로 써서 다시 읽어도 51과 다시 그린 값이 같다', () => {
    const doc = createNewDocument('metric');
    const a = 30 * DEG;
    const d0 = createOrdinateDimension(doc, at({ x: 0, y: 0 }, a, 40, 25), at({ x: 0, y: 0 }, a, 40, 60), { datum: V(0, 0), ucsAngle: a });
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
      expect(d!.horizontalDirection, name).toBeCloseTo(-a, 9);
      expect(generateDimensionGeometry(back, d!).measurement, name).toBeCloseTo(40, 9);
    }
  });
});

describe('STRETCH·DIM 정렬(G)의 세로좌표도 51 축으로', () => {
  it('피쳐를 옮기면 UCS X로 다시 재고, 돌지 않은 치수는 예전 식', () => {
    const doc = createNewDocument('metric');
    const a = 30 * DEG;
    const d = createOrdinateDimension(doc, at({ x: 0, y: 0 }, a, 40, 25), at({ x: 0, y: 0 }, a, 40, 60), { datum: V(0, 0), ucsAngle: a });
    const m = moveDimPoint(d, 'defPoint2', { x: 10 * Math.cos(a), y: 10 * Math.sin(a) });
    expect(m.measurement).toBeCloseTo(50, 9);
    expect(m.measurement).toBeCloseTo(generateDimensionGeometry(doc, m).measurement, 9);
    const w = createOrdinateDimension(doc, V(300, 100), V(300, 140), { datum: V(50, 0) });
    expect(moveDimPoint(w, 'defPoint2', { x: 7, y: 3 }).measurement).toBe(257);
  });

  it('정렬: 같은 축의 X 데이텀은 지시선 끝의 UCS Y를 맞추고, 축이 다르면 건너뛴다', () => {
    const doc = createNewDocument('metric');
    const a = 30 * DEG;
    const o = { x: 0, y: 0 };
    const base = createOrdinateDimension(doc, at(o, a, 40, 25), at(o, a, 40, 60), { datum: V(0, 0), ucsAngle: a });
    base.handle = 'B';
    const d = createOrdinateDimension(doc, at(o, a, 70, 10), at(o, a, 70, 45), { datum: V(0, 0), ucsAngle: a });
    d.handle = 'D';
    const w = createOrdinateDimension(doc, V(70, 10), V(70, 45), { datum: V(0, 0) });
    w.handle = 'W';
    const r = alignDimensions(base, [d, w]);
    expect(r.changed).toHaveLength(1);
    const e = r.changed[0]!.defPoint3;
    expect(-e.x * Math.sin(a) + e.y * Math.cos(a)).toBeCloseTo(60, 9);
    expect(e.x * Math.cos(a) + e.y * Math.sin(a)).toBeCloseTo(70, 9);
    expect(r.skipped.map((s) => s.handle)).toEqual(['W']);
  });
});

/** 모형 UCS 원점 (50, 0), X축 각도 ma; 도면 공간 UCS 원점 (200, 150), X축 각도 pa */
function setup(space: string, ma: number, pa: number) {
  const h = makeApp();
  registerDimCommands(h.app);
  registerDimSmartCommand(h.app);
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
  return { ...h, type, dims, shown };
}

describe('진짜 App: 회전한 UCS의 세로좌표 명령', () => {
  const MO = { x: 50, y: 0 };
  const PO = { x: 200, y: 150 };

  it('모형 탭 30° UCS의 DIMORDINATE: UCS X 40·Y 25, 51 −30°', async () => {
    const a = 30 * DEG;
    const h = setup(MODEL_SPACE, a, 0);
    const f = at(MO, a, 40, 25);
    void h.app.run('DIMORDINATE');
    await settle();
    await h.type(wcs(f), wcs(at(MO, a, 40, 70)));
    void h.app.run('DIMORDINATE');
    await settle();
    await h.type(wcs(f), wcs(at(MO, a, 90, 25)));
    const [x, y] = h.dims();
    expect(x!.dimType & 64).toBe(64);
    expect(y!.dimType & 64).toBe(0);
    for (const d of [x!, y!]) {
      expect([d.defPoint.x, d.defPoint.y]).toEqual([50, 0]);
      expect(d.horizontalDirection).toBeCloseTo(-a, 12);
    }
    expect(x!.measurement).toBeCloseTo(40, 9);
    expect(y!.measurement).toBeCloseTo(25, 9);
    expect(h.shown()).toEqual([expect.stringMatching(/^치수 문자 = 40([.,]0+)?$/), expect.stringMatching(/^치수 문자 = 25([.,]0+)?$/)]);
  });

  it('도면 공간 90° UCS($PUCSXDIR)의 DIMORDINATE: 지시선을 UCS Y(WCS −X)로 빼면 X 데이텀 40', async () => {
    const a = 90 * DEG;
    const h = setup(PAPER_SPACE, 0, a);
    const f = at(PO, a, 40, 30);
    void h.app.run('DIMORDINATE');
    await settle();
    await h.type(wcs(f), wcs(at(PO, a, 40, 70)));
    const [d] = h.dims();
    expect(d!.dimType & 64).toBe(64);
    expect([d!.defPoint.x, d!.defPoint.y]).toEqual([200, 150]);
    expect(d!.horizontalDirection).toBeCloseTo(-a, 12);
    expect(d!.measurement).toBeCloseTo(40, 9);
  });

  it('돌지 않은 UCS(모형·도면 공간)는 예전 값 그대로(51 = 0)', async () => {
    const m = setup(MODEL_SPACE, 0, 30 * DEG);
    void m.app.run('DIMORDINATE');
    await settle();
    await m.type('*300,100', '*300,140');
    const p = setup(PAPER_SPACE, 30 * DEG, 0);
    void p.app.run('DIMORDINATE');
    await settle();
    await p.type('*240,180', '*240,220');
    const [md] = m.dims();
    const [pd] = p.dims();
    expect(md!.horizontalDirection).toBe(0);
    expect(md!.measurement).toBeCloseTo(250, 9);
    expect(pd!.horizontalDirection).toBe(0);
    expect(pd!.measurement).toBeCloseTo(40, 9);
  });

  it('DIMCONTINUE·DIMBASELINE과 DIM 세로좌표(O)도 UCS 방향, 연속 지시선 끝은 같은 UCS Y', async () => {
    const a = 30 * DEG;
    const h = setup(MODEL_SPACE, a, 0);
    void h.app.run('DIMORDINATE');
    await settle();
    await h.type(wcs(at(MO, a, 40, 25)), wcs(at(MO, a, 40, 70)));
    h.app.lastCreated.push(h.dims()[0]!.handle);
    void h.app.run('DIMCONTINUE');
    await settle();
    await h.type(wcs(at(MO, a, 60, 10)), '', '');
    void h.app.run('DIMBASELINE');
    await settle();
    await h.type(wcs(at(MO, a, 90, 5)), '', '');
    void h.app.run('DIM');
    await settle();
    await h.type('O', wcs(at(MO, a, 120, 15)), wcs(at(MO, a, 120, 50)), '', '');
    const ds = h.dims();
    expect(ds).toHaveLength(4);
    expect(ds.map((d) => Math.round(d.measurement * 1e9) / 1e9)).toEqual([40, 60, 90, 120]);
    for (const d of ds) {
      expect(d.dimType & 64).toBe(64);
      expect(d.horizontalDirection).toBeCloseTo(-a, 12);
    }
    const uy = (q: Vec3) => -(q.x - MO.x) * Math.sin(a) + (q.y - MO.y) * Math.cos(a);
    expect(uy(ds[1]!.defPoint3)).toBeCloseTo(70, 9);
    expect(uy(ds[2]!.defPoint3)).toBeCloseTo(70, 9);
    expect(h.app.busyCommand).toBeFalsy();
  });
});

describe.skipIf(!hasPython)('로컬 대조: ezdxf가 이 앱이 쓴 회전 UCS 세로좌표를 다시 그린 값', () => {
  it('ezdxf가 51을 UCS X축으로 읽어 다시 그린 문자 = 이 앱의 측정값(51을 0으로 바꾸면 WCS 값)', () => {
    const doc = createNewDocument('metric');
    const add = (d: DimensionEntity, handle: string) => {
      d.handle = handle;
      d.owner = doc.blocks.get(MODEL_SPACE)!.recordHandle;
      doc.blocks.get(MODEL_SPACE)!.entities.push(d);
      doc.entityIndex.set(handle, d);
      return d;
    };
    const o = { x: 100, y: 50 };
    const cases: DimensionEntity[] = [];
    for (const [k, deg] of [30, 90, 135].entries()) {
      const a = deg * DEG;
      cases.push(add(createOrdinateDimension(doc, at(o, a, 40, 25), at(o, a, 40, 70), { datum: V(o.x, o.y), ucsAngle: a }), `C${k}0`));
      cases.push(add(createOrdinateDimension(doc, at(o, a, 40, 25), at(o, a, 85, 25), { datum: V(o.x, o.y), ucsAngle: a }), `C${k}1`));
    }
    const dir = join(ROOT, '.runtime/dim');
    mkdirSync(dir, { recursive: true });
    const path = join(dir, 'ordrot26.dxf');
    writeFileSync(path, writeDxf(doc, { version: 'AC1032' }).data);
    const code = [
      'import sys, json, ezdxf',
      'doc = ezdxf.readfile(sys.argv[1])',
      'out = {}',
      "for e in doc.modelspace().query('DIMENSION'):",
      '    row = []',
      '    for hd in (None, 0.0):',
      '        if hd is not None: e.dxf.horizontal_direction = hd',
      '        e.override().render()',
      "        row.append([t.plain_text() if t.dxftype() == 'MTEXT' else t.dxf.text for t in doc.blocks.get(e.dxf.geometry) if t.dxftype() in ('MTEXT', 'TEXT')])",
      '    out[e.dxf.handle] = row',
      'print(json.dumps(out))',
    ].join('\n');
    const got = JSON.parse(execFileSync(PYTHON, ['-I', '-c', code, path], { encoding: 'utf8', timeout: 120_000 })) as Record<string, [string[], string[]]>;
    // ezdxf는 이 도면의 문자를 정수로 반올림해 보인다(소수 자리 표기는 견주지 않는다 — 값만, 반올림 0.5 안)
    const num = (t: string[] | undefined) => Number((t?.[0] ?? '').replace(',', '.'));
    for (const d of cases) {
      const [asIs, flat] = got[d.handle]!;
      expect(num(asIs), d.handle).toBeCloseTo(d.measurement, 0);
      // 51을 0으로 바꾸면 ezdxf도 WCS 축으로 재 값이 달라진다(51이 실제로 쓰였다는 표시)
      const f = d.defPoint2;
      const wcsValue = Math.abs(d.dimType & 64 ? f.x - d.defPoint.x : f.y - d.defPoint.y);
      expect(num(flat), d.handle).toBeCloseTo(wcsValue, 0);
      expect(Math.abs(d.measurement - wcsValue), d.handle).toBeGreaterThan(1.5);
    }
  });
});
