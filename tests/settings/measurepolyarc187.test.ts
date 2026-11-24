/**
 * 187차: MEASUREGEOM 반지름(R)으로 폴리선의 호 세그먼트 재기.
 * Autodesk MEASUREGEOM 도움말의 반지름 옵션은 지정한 호·원·폴리선 호의 반지름과 지름을 잰다고 적는다.
 * 고치기 전에는 원·호만 받아 폴리선을 고르면 「호나 원이 아닙니다.」만 알리고 같은 프롬프트로 돌아갔다.
 * 이제 고른 점에 가장 가까운 세그먼트가 호면(182차 `polyArcOf` — DIMRADIUS와 같은 세그먼트 고르기, −Z 폴리선은 평면도 꼭짓점)
 * 그 반지름·지름을 원·호와 같은 글·결과 값으로 보인다. 직선 세그먼트·원·호·키워드는 전과 같다.
 * 188차: 맞춤·스플라인 맞춤이 아닌 POLYLINE 2D의 호 세그먼트도 같은 세그먼트 고르기로 잰다(전에는 경량 폴리선만 — 알림).
 * 곡선 맞춤 POLYLINE 2D는 전과 같은 알림이다(다른 치수 명령은 `tests/dim/dimpoly2d188.test.ts`).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CadDocument, Entity, PolylineEntity } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
import { registerCommands } from '../../src/app/commands';
import { entityPath } from '../../src/edit/geom/path';
import { flattenPath, pathSize } from '../../src/edit/geom/curve';
import { browserGlobals } from '../polish/fakes';
import { makeApp, settle } from '../polish/real-app';
import type { DirectCommandLine } from '../direct/fakes';
import { FakePicker } from '../direct/fakes';
import { NEG_Z, arc, circle, lw, poly2d } from '../edit/make';

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
const ev = () => ({ pointerType: 'mouse', shiftKey: false, ctrlKey: false, metaKey: false, clientX: 0, clientY: 0 }) as PointerEvent;

/** 작은 Picker의 경량 폴리선은 꼭짓점 사이 직선(볼록도·OCS를 보지 않음)이라, 이 시험은 실제 경로(볼록 호·−Z 평면도)를 잘게 꺾은선으로 고른다 */
class PathPicker extends FakePicker {
  constructor(private readonly d: CadDocument) {
    super(d);
  }
  override geometry(h: string) {
    const e = this.d.entityIndex.get(h);
    const p = e ? entityPath(e) : null;
    if (!p || !p.pieces.length) return super.geometry(h);
    const f = flattenPath(p, pathSize(p) * 1e-4);
    const segs: number[] = [];
    for (let i = 0; i + 1 < f.length; i++) segs.push(f[i]!.x, f[i]!.y, f[i + 1]!.x, f[i + 1]!.y);
    return { segs };
  }
}

function setup() {
  const h = makeApp();
  registerCommands(h.app);
  const pk = new PathPicker(h.doc);
  (h.app as unknown as { picker: () => unknown }).picker = () => pk;
  h.app.osnapOn = false;
  const cl = h.cmd as unknown as DirectCommandLine;
  const add = (e: Entity): Entity => {
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
  const at = async (p: Pt) => {
    h.view.events.move!(p, p, ev());
    h.view.events.click!(p, p, ev());
    await settle();
  };
  return { ...h, cl, add, type, at };
}
type H = ReturnType<typeof setup>;

const radiusLines = (h: H) => h.out().filter((t) => t.startsWith('반지름 = '));
const notArc = (h: H) => h.out().filter((t) => t === '호나 원이 아닙니다.');
const R = (r: string, d: string) => new RegExp(`^반지름 = ${r}(\\.0+)? mm\\n지름 = ${d}(\\.0+)? mm$`);

/** (0,0)→(10,0) 직선, (10,0)→(20,0) 볼록도 1(반시계 반원 — 중심 (15,0), 반지름 5, (15,−5)를 지난다) */
const polyline = (ext?: { x: number; y: number; z: number }) => lw([[0, 0], [10, 0, 1], [20, 0]], false, ext);

describe('MEASUREGEOM 반지름: 폴리선 호 세그먼트', () => {
  it('첫 프롬프트에서 반지름(R) → 폴리선 호를 고르면 반지름 5·지름 10, 알림 없음, 같은 프롬프트로 돌아가 종료(X)', async () => {
    const h = setup();
    h.add(polyline());
    void h.app.run('MEASUREGEOM');
    await settle();
    await h.type('R');
    expect(h.cmd.prompt).toBe('호 또는 원 선택 [거리(D)/각도(A)/면적(AR)/종료(X)]:');
    await h.at(P(15, -5));
    expect(radiusLines(h)).toHaveLength(1);
    expect(radiusLines(h)[0]).toMatch(R('5', '10'));
    expect(notArc(h)).toHaveLength(0);
    // 휴대폰 결과 카드 값도 원·호와 같은 꼴(radiusResult)
    expect(h.cmd.lines.find((l) => l.text.startsWith('반지름 = '))!.measure).toMatchObject({ kind: 'radius', label: '반지름' });
    expect(h.cmd.prompt).toBe('호 또는 원 선택 [거리(D)/각도(A)/면적(AR)/종료(X)]:');
    await h.type('X');
    expect(h.app.busyCommand).toBeFalsy();
  });

  it('호 세그먼트가 둘이면 고른 점에 가장 가까운 것: (20,−10) → 반지름 10, (5,−5) → 반지름 5', async () => {
    const h = setup();
    // (0,0)→(10,0) 볼록도 1(중심 (5,0), 반지름 5), (10,0)→(30,0) 볼록도 1(중심 (20,0), 반지름 10)
    h.add(lw([[0, 0, 1], [10, 0, 1], [30, 0]]));
    void h.app.run('MEASUREGEOM', 'R');
    await settle();
    await h.at(P(20, -10));
    await h.at(P(5, -5));
    await h.type('X');
    const out = radiusLines(h);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatch(R('10', '20'));
    expect(out[1]).toMatch(R('5', '10'));
    expect(notArc(h)).toHaveLength(0);
  });

  it('−Z 폴리선(OCS X = WCS −X)은 평면도 호 (−15,−5)를 골라도 반지름 5, MEASURERADIUS도 같은 갈래', async () => {
    const h = setup();
    h.add(polyline(NEG_Z));
    void h.app.run('MEASURERADIUS');
    await settle();
    await h.at(P(-15, -5));
    await h.type('X');
    expect(radiusLines(h)).toHaveLength(1);
    expect(radiusLines(h)[0]).toMatch(R('5', '10'));
    expect(notArc(h)).toHaveLength(0);
  });

  it('188차: 맞춤이 아닌 POLYLINE 2D의 호 세그먼트 (15, 35)도 반지름 5·지름 10, 알림 없음', async () => {
    const h = setup();
    h.add(poly2d([[0, 40], [10, 40, 1], [20, 40]]));
    void h.app.run('MEASUREGEOM', 'R');
    await settle();
    await h.at(P(15, 35));
    await h.type('X');
    expect(radiusLines(h)).toHaveLength(1);
    expect(radiusLines(h)[0]).toMatch(R('5', '10'));
    expect(notArc(h)).toHaveLength(0);
  });
});

describe('전과 같은 꼴', () => {
  it('직선 세그먼트·곡선 맞춤 POLYLINE 2D는 전과 같은 알림, 원·호는 전과 같은 값', async () => {
    const h = setup();
    h.add(polyline());
    // 곡선 맞춤 POLYLINE 2D(DXF POLYLINE 70 비트 2 — 맞춤이 만든 세그먼트는 188차에도 받지 않음)
    const fit = poly2d([[0, 40], [10, 40, 1], [20, 40]]) as PolylineEntity;
    fit.flags |= 2;
    h.add(fit);
    h.add(circle(100, 0, 12.5));
    h.add(arc(200, 0, 3, 0, 90));
    void h.app.run('MEASUREGEOM', 'R');
    await settle();
    // 폴리선의 직선 세그먼트(가장 가까운 세그먼트가 직선)
    await h.at(P(5, 0));
    // 곡선 맞춤 POLYLINE 2D의 호 세그먼트
    await h.at(P(15, 35));
    expect(notArc(h)).toHaveLength(2);
    expect(radiusLines(h)).toHaveLength(0);
    await h.at(P(112.5, 0));
    await h.at(P(203, 0));
    await h.type('X');
    const out = radiusLines(h);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatch(/^반지름 = 12\.50* mm\n지름 = 25(\.0+)? mm$/);
    expect(out[1]).toMatch(R('3', '6'));
    expect(h.app.busyCommand).toBeFalsy();
  });
});
