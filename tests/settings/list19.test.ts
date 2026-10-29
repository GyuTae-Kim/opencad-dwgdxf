/**
 * 19차: LIST의 위치. 도움말 LIST(위치는 현재 UCS 기준 X·Y·Z, 색상·선종류·선가중치·투명도는 BYLAYER가 아닐 때, 두께는 0이 아닐 때,
 * 돌출 방향은 현재 UCS의 Z축과 다를 때 UCS 좌표로). 특성 팔레트·DBLIST는 도움말에 근거가 없어 저장된 좌표 그대로
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CircleEntity, Entity, LineEntity, LwPolylineEntity, Vec3 } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { packLwPoints } from '../../src/core/lwpoly';
import { registerCommands } from '../../src/app/commands';
import { registerEditCmds2Query } from '../../src/app/editcmds2-query';
import { applyField, geometryFields } from '../../src/app/propedit';
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
const line3 = (a: Vec3, b: Vec3, o: Partial<LineEntity> = {}) => ({ ...entityDefaults(), type: 'LINE', handle: '', start: a, end: b, ...o }) as LineEntity;

function setup() {
  const h = makeApp();
  registerCommands(h.app);
  const pk = new FakePicker(h.doc);
  (h.app as unknown as { picker: () => unknown }).picker = () => pk;
  h.app.polarOn = false;
  h.app.otrackOn = false;
  h.app.dynOn = false;
  h.app.osnapOn = true;
  h.app.snapModes.clear();
  h.app.snapModes.add('end');
  const cl = h.cmd as unknown as DirectCommandLine;
  const add = <T extends Entity>(e: T): T => {
    e.handle = h.st.session.newHandle();
    e.owner = h.doc.blocks.get(MODEL_SPACE)!.recordHandle;
    h.st.session.commit({ label: 'T', ops: [{ kind: 'add', block: MODEL_SPACE, entity: e }] });
    return e;
  };
  const type = async (...ts: string[]) => {
    for (const t of ts) {
      cl.type(t);
      await settle();
    }
  };
  /** UCS를 원점 (ox, oy)에서 90° 돌린다(UCS X축 = WCS Y축) */
  const ucs90 = (ox = 0, oy = 0) => {
    h.doc.header.set('$UCSORG', { x: ox, y: oy, z: 0 });
    h.doc.header.set('$UCSXDIR', { x: 0, y: 1, z: 0 });
    h.doc.header.set('$UCSYDIR', { x: -1, y: 0, z: 0 });
  };
  const list = async (e: Entity) => {
    const n = h.out().length;
    h.app.setSelection([e.handle]);
    void h.app.run('LIST');
    await settle();
    return h.out().slice(n + 1);
  };
  return { ...h, cl, add, type, ucs90, list };
}

describe('LIST 위치는 현재 UCS 기준 X·Y·Z(도움말 LIST)', () => {
  it('WCS: 평면 객체도 Z까지 보인다', async () => {
    const h = setup();
    const l = h.add(line3(V(10, 0), V(10, 20, 5)));
    const out = await h.list(l);
    expect(out[0]).toBe(`선  도면층: "0"  공간: 모형 공간  핸들 = ${l.handle}`);
    expect(out).toContain('    시작점: 10.0000, 0.0000, 0.0000');
    expect(out).toContain('    끝점: 10.0000, 20.0000, 5.0000');
  });

  it('돌린 UCS: 위치는 UCS 좌표(Z는 그대로), 델타·각도는 이전처럼(도움말에 기준이 없다)', async () => {
    const h = setup();
    h.ucs90(5, 0);
    const l = h.add(line3(V(10, 0), V(10, 20, 5)));
    const out = await h.list(l);
    // WCS (10,0,0) → UCS (0,−5,0), (10,20,5) → (20,−5,5)
    expect(out).toContain('    시작점: 0.0000, -5.0000, 0.0000');
    expect(out).toContain('    끝점: 20.0000, -5.0000, 5.0000');
    expect(out).toContain('    델타 X: 0.0000');
    expect(out).toContain('    델타 Y: 20.0000');
  });

  it('돌린 UCS의 계산 끝자리로 0이 "-0.0000"이 되지 않는다(LIST·ID)', async () => {
    const h = setup();
    h.ucs90(50, 0);
    const l = h.add(line3(V(0, 0, 30), V(200, 0, 10)));
    const out = await h.list(l);
    // cos 90° ≈ 6e-17: (0 − 50) × cos 90° = −3e-15
    expect(out).toContain('    시작점: 0.0000, 50.0000, 30.0000');
    expect(out).toContain('    끝점: 0.0000, -150.0000, 10.0000');
    h.app.clearSelection();
    void h.app.run('ID');
    await settle();
    await h.type('*0,0,0');
    expect(h.out().filter((t) => /^X = /.test(t))).toEqual(['X = 0.0000     Y = 50.0000     Z = 0.0000']);
  });

  it('OCS 객체(돌출 방향 0,0,−1인 원): 중심은 WCS로 바꾼 뒤 UCS로, 돌출 방향 줄', async () => {
    const h = setup();
    const c = h.add({ ...entityDefaults(), type: 'CIRCLE', handle: '', center: V(10, 5, 3), radius: 2, extrusion: V(0, 0, -1) } as CircleEntity);
    let out = await h.list(c);
    // 임의 축 알고리즘: (0,0,−1)이면 WCS X = −OCS X, Z = −OCS Z
    expect(out).toContain('    중심: -10.0000, 5.0000, -3.0000');
    expect(out).toContain('    돌출 방향: 0.0000, 0.0000, -1.0000');
    // 기울어진 돌출 방향(WCS X축)은 돌린 UCS에서 (0, −1, 0)
    const d = h.add({ ...entityDefaults(), type: 'CIRCLE', handle: '', center: V(0, 0, 0), radius: 1, extrusion: V(1, 0, 0) } as CircleEntity);
    h.ucs90();
    out = await h.list(d);
    expect(out).toContain('    돌출 방향: 0.0000, -1.0000, 0.0000');
    // 돌출 방향이 Z축이면 줄이 없다
    const e = h.add({ ...entityDefaults(), type: 'CIRCLE', handle: '', center: V(0, 0, 0), radius: 1 } as CircleEntity);
    expect((await h.list(e)).some((t) => t.includes('돌출 방향'))).toBe(false);
  });

  it('BYLAYER가 아닌 색상·선종류·선가중치·투명도와 0이 아닌 두께만', async () => {
    const h = setup();
    const a = h.add(line3(V(0, 0), V(1, 0), { color: { aci: 1 }, linetype: 'DASHED', lineweight: 30, transparency: 127, thickness: 2 }));
    const out = await h.list(a);
    expect(out.slice(1, 6)).toEqual(['    색상: 빨간색', '    선종류: DASHED', '    선가중치: 0.30 mm', '    투명도: 50', '    두께: 2.0000']);
    const b = h.add(line3(V(0, 0), V(1, 0), { linetype: 'BYLAYER' }));
    const out2 = await h.list(b);
    expect(out2.some((t) => /^ {4}(색상|선종류|선가중치|투명도|두께):/.test(t))).toBe(false);
  });

  it('폴리선 첫 정점은 OCS 고도를 Z로', async () => {
    const h = setup();
    const p = h.add({ ...entityDefaults(), type: 'LWPOLYLINE', handle: '', ...packLwPoints([P(1, 2), P(5, 2)]), closed: false, plinegen: false, constantWidth: 0, elevation: 7 } as LwPolylineEntity);
    expect(await h.list(p)).toContain('    첫 정점: 1.0000, 2.0000, 7.0000');
  });

  it('특성 팔레트·DBLIST는 이전처럼 저장된 WCS 좌표(고친 값도 WCS로 쓴다)', async () => {
    const h = setup();
    registerEditCmds2Query(h.app);
    h.ucs90(5, 0);
    const l = h.add(line3(V(10, 0), V(10, 20, 5)));
    const startX = geometryFields('LINE').find((f) => f.label === '시작 X')!;
    expect(startX.get(l)).toBe(10);
    expect(applyField(h.app, [l.handle], startX, 3)).toBe(1);
    expect((h.doc.entityIndex.get(l.handle) as LineEntity).start).toEqual({ x: 3, y: 0, z: 0 });
    void h.app.run('DBLIST');
    await settle();
    expect(h.out()).toContain('    시작점: 3.0000, 0.0000');
  });
});
