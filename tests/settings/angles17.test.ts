/**
 * 17차: ROTATE의 각도 입력과 DIST의 각도 표시에 도면 단위의 0 방향·방향(ANGBASE·ANGDIR).
 * - signedAngle: 회전 각도(크기)는 ANGDIR 1이면 시계 방향(도움말 "About Rotating Objects")
 * - displayDirection: 방향 각도는 0 방향(ANGBASE)에서 ANGDIR 쪽으로, 측량 단위는 방위 그대로
 * - 진짜 App: ROTATE 숫자 회전 각도·참조의 새 각도(절대 각도), DIST의 XY 평면 각도·증분(UCS 기준)
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { LineEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { displayDirection, signedAngle } from '../../src/app/polar';
import { registerModifyCommands } from '../../src/app/modify';
import { registerCommands } from '../../src/app/commands';
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

const D = Math.PI / 180;
const r6 = (n: number) => Math.round(n * 1e6) / 1e6 + 0;

describe('각도 크기의 부호와 방향 각도의 표시 값', () => {
  it('signedAngle: ANGDIR 1이면 부호를 뒤집고(두 번이면 제자리), ANGBASE는 보지 않는다', () => {
    expect(signedAngle(30 * D, {})).toBeCloseTo(30 * D, 12);
    expect(signedAngle(30 * D, { angdir: 1, angbase: 90 * D })).toBeCloseTo(-30 * D, 12);
    expect(signedAngle(signedAngle(30 * D, { angdir: 1 }), { angdir: 1 })).toBeCloseTo(30 * D, 12);
  });

  it('displayDirection: 0 방향에서 ANGDIR 쪽으로(0 ≤ θ < 2π), 측량 단위는 절대 방향', () => {
    expect(displayDirection(0, {})).toBe(0);
    expect(displayDirection(-90 * D, {})).toBeCloseTo(270 * D, 12);
    // 북쪽 0·시계 방향(방위각): 동쪽은 90, 북쪽은 0, 서쪽은 270
    const az = { angbase: 90 * D, angdir: 1 };
    expect(displayDirection(0, az)).toBeCloseTo(90 * D, 12);
    expect(displayDirection(90 * D, az)).toBeCloseTo(0, 12);
    expect(displayDirection(180 * D, az)).toBeCloseTo(270 * D, 12);
    expect(displayDirection(30 * D, { ...az, aunits: 4 })).toBeCloseTo(30 * D, 12);
  });
});

function setup(units: { angbase?: number; angdir?: number; aunits?: number }) {
  const h = makeApp((d) => {
    if (units.angbase !== undefined) d.header.set('$ANGBASE', units.angbase);
    if (units.angdir !== undefined) d.header.set('$ANGDIR', units.angdir);
    if (units.aunits !== undefined) d.header.set('$AUNITS', units.aunits);
  });
  registerModifyCommands(h.app);
  registerCommands(h.app);
  const pk = new FakePicker(h.doc);
  (h.app as unknown as { picker: () => unknown }).picker = () => pk;
  h.app.osnapOn = false;
  h.app.polarOn = false;
  h.app.otrackOn = false;
  const cl = h.cmd as unknown as DirectCommandLine;
  const ln = { ...entityDefaults(), type: 'LINE', handle: h.st.session.newHandle(), start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 } } as LineEntity;
  ln.owner = h.doc.blocks.get(MODEL_SPACE)!.recordHandle;
  h.st.session.commit({ label: 'T', ops: [{ kind: 'add', block: MODEL_SPACE, entity: ln }] });
  const end = () => {
    const e = h.doc.entityIndex.get(ln.handle) as LineEntity;
    return [r6(e.end.x), r6(e.end.y)];
  };
  const type = async (...ts: string[]) => {
    for (const t of ts) {
      cl.type(t);
      await settle();
    }
  };
  return { ...h, ln, end, type };
}

describe('ROTATE의 각도 입력(진짜 App)', () => {
  it('회전 각도 숫자는 ANGDIR 1이면 시계 방향, ANGBASE와는 상관없다', async () => {
    for (const [units, want] of [
      [{}, [r6(10 * Math.cos(30 * D)), r6(10 * Math.sin(30 * D))]],
      [{ angdir: 1 }, [r6(10 * Math.cos(30 * D)), r6(-10 * Math.sin(30 * D))]],
      [{ angbase: 90 * D }, [r6(10 * Math.cos(30 * D)), r6(10 * Math.sin(30 * D))]],
    ] as const) {
      const h = setup(units);
      h.st.selection.add(h.ln.handle);
      void h.app.run('ROTATE');
      await settle();
      expect(h.out().some((t) => t.startsWith('UCS에서 현재 양의 각도:'))).toBe(true);
      await h.type('0,0', '30');
      expect(h.end()).toEqual(want);
      // 기본값은 같은 꼴로 보인다(시계 방향 도면은 −30이 아니라 30)
      h.st.selection.add(h.ln.handle);
      void h.app.run('ROTATE');
      await settle();
      await h.type('0,0');
      expect(h.cmd.prompt).toContain('<30>');
      h.app.cancel();
      await settle();
    }
  });

  it('참조(R)의 새 각도 숫자는 절대 각도: 0 방향(ANGBASE)에서 ANGDIR 쪽으로', async () => {
    // 북쪽 0·시계 방향: 새 각도 180은 남쪽 → 동쪽(참조, 두 점)을 남쪽으로 돌린다
    const h = setup({ angbase: 90 * D, angdir: 1 });
    h.st.selection.add(h.ln.handle);
    void h.app.run('ROTATE');
    await settle();
    await h.type('0,0', 'R', '0,0', '10,0');
    expect(h.cmd.prompt).toContain('새 각도 지정');
    expect(h.cmd.prompt).toContain('<0>');
    await h.type('180');
    expect(h.end()).toEqual([0, -10]);
    // 참조 각도를 숫자로: 0(북쪽)에서 새 각도 90(동쪽) — 시계 방향으로 90
    const h2 = setup({ angbase: 90 * D, angdir: 1 });
    h2.st.selection.add(h2.ln.handle);
    void h2.app.run('ROTATE');
    await settle();
    await h2.type('0,0', 'R', '0', '90');
    expect(h2.end()).toEqual([0, -10]);
  });
});

describe('DIST의 각도 표시(진짜 App)', () => {
  const dist = async (units: Parameters<typeof setup>[0], a: string, b: string, ucs?: () => void) => {
    const h = setup(units);
    ucs?.call(null);
    h.app.dynOn = false;
    void h.app.run('DIST');
    await settle();
    await h.type(a, b);
    return h.out().filter((t) => /^(거리|X 증분) =/.test(t));
  };

  it('XY 평면에서의 각도는 0 방향(ANGBASE)에서 ANGDIR 쪽으로', async () => {
    expect((await dist({}, '0,0', '0,10'))[0]).toMatch(/XY 평면에서의 각도 = 90(\.0+)?°?, /);
    // 북쪽 0·시계 방향: 동쪽은 90, 북쪽은 0
    expect((await dist({ angbase: 90 * D, angdir: 1 }, '0,0', '10,0'))[0]).toMatch(/XY 평면에서의 각도 = 90(\.0+)?°?, /);
    expect((await dist({ angbase: 90 * D, angdir: 1 }, '0,0', '0,10'))[0]).toMatch(/XY 평면에서의 각도 = 0(\.0+)?°?, /);
    // 측량 단위는 방위 그대로
    expect((await dist({ angbase: 90 * D, angdir: 1, aunits: 4 }, '0,0', '10,10'))[0]).toMatch(/XY 평면에서의 각도 = N 45(\.0+)?d E/);
  });

  it('증분·각도는 지금 UCS 기준(UCS를 90° 돌리면 WCS의 북쪽이 X)', async () => {
    const h = setup({});
    h.doc.header.set('$UCSORG', { x: 0, y: 0, z: 0 });
    h.doc.header.set('$UCSXDIR', { x: 0, y: 1, z: 0 });
    h.doc.header.set('$UCSYDIR', { x: -1, y: 0, z: 0 });
    h.app.dynOn = false;
    void h.app.run('DIST');
    await settle();
    // * 는 WCS 좌표
    await h.type('*0,0', '*0,10');
    const out = h.out().filter((t) => /^(거리|X 증분) =/.test(t));
    expect(out[0]).toMatch(/XY 평면에서의 각도 = 0(\.0+)?°?, /);
    expect(out[1]).toMatch(/^X 증분 = 10(\.0+)?, {2}Y 증분 = 0(\.0+)?,/);
  });
});
