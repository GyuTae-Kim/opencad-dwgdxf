/**
 * 24차: commitResults로 더하는 새 치수는 놓일 자리(소유 블록·도면 공간 표지)를 치수 그림보다 먼저 정한다.
 * 23차 규칙(edit/dim/vars.ts measureVars — 도움말 DIMLFAC: 음수는 도면 공간에만 쓴다)에서 자리 없는 치수는 모형 공간으로 보아
 * 음수 DIMLFAC를 1로 쓰므로, 도면 공간 QDIM의 그린 문자가 LIST·특성 값(그 크기)과 달랐다.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DimensionEntity, Entity, LineEntity, MTextEntity, Vec3 } from '../../src/core/model';
import { MODEL_SPACE, PAPER_SPACE, entityDefaults, tableKey } from '../../src/core/model';
import { registerAnnot2Commands } from '../../src/app/annot2';
import { dimDisplayText } from '../../src/app/inquiry';
import { browserGlobals } from '../polish/fakes';
import { makeApp, settle } from '../polish/real-app';
import type { DirectCommandLine } from '../direct/fakes';

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

const V = (x: number, y: number, z = 0): Vec3 => ({ x, y, z });
const line3 = (a: Vec3, b: Vec3) => ({ ...entityDefaults(), type: 'LINE', handle: '', start: a, end: b }) as LineEntity;

function setup(space: string) {
  const h = makeApp();
  registerAnnot2Commands(h.app);
  h.app.osnapOn = false;
  h.app.polarOn = false;
  h.app.dynOn = false;
  // 지금 치수 스타일(새 미터 도면은 ISO-25)의 DIMLFAC −10
  h.doc.dimStyles.get(tableKey(String(h.doc.header.get('$DIMSTYLE'))))!.vars.DIMLFAC = -10;
  const cl = h.cmd as unknown as DirectCommandLine;
  const type = async (...ts: string[]) => {
    for (const t of ts) {
      cl.type(t);
      await settle();
    }
  };
  const add = <T extends Entity>(e: T): T => {
    e.handle = h.st.session.newHandle();
    e.owner = h.doc.blocks.get(space)!.recordHandle;
    h.st.session.commit({ label: 'T', ops: [{ kind: 'add', block: space, entity: e }] });
    return e;
  };
  h.st.space = space;
  const dims = () => h.doc.blocks.get(space)!.entities.filter((e): e is DimensionEntity => e.type === 'DIMENSION');
  const drawn = (d: DimensionEntity) => (h.doc.blocks.get(d.block.toUpperCase())!.entities.find((e): e is MTextEntity => e.type === 'MTEXT')?.text ?? '').replace(/^\\A1;/, '');
  return { ...h, type, add, dims, drawn };
}

describe('commitResults로 더한 새 치수의 자리(진짜 App QDIM)', () => {
  it('도면 공간: 그린 문자가 LIST 값과 같은 600(DIMLFAC −10의 크기)', async () => {
    const h = setup(PAPER_SPACE);
    const ln = h.add(line3(V(100, 260), V(160, 260)));
    h.st.selection.add(ln.handle);
    void h.app.run('QDIM');
    await settle();
    await h.type('130,280');
    const ds = h.dims();
    expect(ds.length).toBeGreaterThan(0);
    for (const d of ds) {
      expect(d.paperSpace).toBe(true);
      expect(h.drawn(d)).toBe(dimDisplayText(h.doc, d).formatted);
    }
    expect(h.drawn(ds[0]!)).toMatch(/^600([.,]0+)?$/);
  });

  it('모형 공간은 그대로 1(값 60)', async () => {
    const h = setup(MODEL_SPACE);
    const ln = h.add(line3(V(100, 260), V(160, 260)));
    h.st.selection.add(ln.handle);
    void h.app.run('QDIM');
    await settle();
    await h.type('130,280');
    const [d] = h.dims();
    expect(d!.paperSpace).toBeUndefined();
    expect(h.drawn(d!)).toMatch(/^60([.,]0+)?$/);
    expect(dimDisplayText(h.doc, d!).formatted).toMatch(/^60([.,]0+)?$/);
  });
});
