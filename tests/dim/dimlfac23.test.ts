/**
 * 23차: 모형 공간 치수의 음수 DIMLFAC는 1로 쓴다.
 * 도움말 DIMLFAC(양수는 모형 공간과 도면 공간 치수 모두에, 음수는 도면 공간에만), .NET 개발 안내서 "Dimension in Model Space and
 * Paper Space"(모형 공간에서 치수를 기입하면 DIMLFAC가 0보다 작아도 1.0, 도면 공간에서는 잰 거리에 그 절댓값을 곱한다).
 * 치수 그림의 문자·LIST·특성의 측정값·명령행 안내가 같은 규칙이고, 저장하는 DIMLFAC 값은 그대로다.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DimensionEntity, MTextEntity, Vec3 } from '../../src/core/model';
import { MODEL_SPACE, PAPER_SPACE } from '../../src/core/model';
import { createLinearDimension, generateDimensionGeometry, measureVars, placeIn } from '../../src/edit/dim';
import { dimSpace, linearFactor } from '../../src/edit/dim/vars';
import { dimDisplayText } from '../../src/app/inquiry';
import { registerDimCommands } from '../../src/app/dimcmds';
import { createNewDocument } from '../../src/core/newdoc';
import { writeDxf } from '../../src/io/dxf/writer';
import { writeDwg } from '../../src/io/dwg/writer/index';
import { readCadFile } from '../../src/io/index';
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

/** 길이 100 선형 치수를 공간 space에 두고(소유자·표지) DIMLFAC 재지정 lfac */
function dimIn(doc: ReturnType<typeof createNewDocument>, space: string | null, lfac: number): DimensionEntity {
  const d = createLinearDimension(doc, V(0, 0), V(100, 0), V(50, 20));
  d.overrides = { 144: lfac };
  if (space) d.owner = doc.blocks.get(space)!.recordHandle;
  if (space === PAPER_SPACE) d.paperSpace = true;
  return d;
}

/** 치수 그림의 문자(서식 \A1; 뺀 것) */
function drawnText(doc: ReturnType<typeof createNewDocument>, d: DimensionEntity): string {
  const g = generateDimensionGeometry(doc, d);
  const t = g.entities.find((e): e is MTextEntity => e.type === 'MTEXT');
  return (t?.text ?? '').replace(/^\\A1;/, '');
}

describe('치수가 놓인 공간과 측정에 쓰는 DIMLFAC', () => {
  const doc = createNewDocument('metric');

  it('공간: 도면 공간 표지·배치 블록이면 도면 공간, 모형 공간 블록이나 소유자 없음(DWG의 모형 공간 객체)이면 모형 공간, 다른 블록은 모른다', () => {
    const ms = doc.blocks.get(MODEL_SPACE)!.recordHandle;
    const ps = doc.blocks.get(PAPER_SPACE)!.recordHandle;
    expect(dimSpace(doc, { owner: ms })).toBe('model');
    expect(dimSpace(doc, { owner: ps })).toBe('paper');
    expect(dimSpace(doc, { owner: ms, paperSpace: true })).toBe('paper');
    expect(dimSpace(doc, {})).toBe('model');
    expect(dimSpace(doc, { paperSpace: true })).toBe('paper');
    expect(dimSpace(doc, { owner: 'FFFF' })).toBeNull();
    // 새 치수의 자리: 지금 공간의 블록 레코드와 도면 공간 표지
    const d: { owner?: string; paperSpace?: boolean } = {};
    placeIn(doc, PAPER_SPACE, d);
    expect(d).toEqual({ owner: ps, paperSpace: true });
    placeIn(doc, MODEL_SPACE, d);
    expect(d.owner).toBe(ms);
    expect(d.paperSpace).toBeUndefined();
  });

  it('음수 DIMLFAC: 모형 공간 치수는 1, 도면 공간·다른 블록 안은 그 크기(이전과 같다). 양수는 어디서나 그대로', () => {
    expect(measureVars(doc, dimIn(doc, MODEL_SPACE, -10)).DIMLFAC).toBe(1);
    expect(measureVars(doc, dimIn(doc, PAPER_SPACE, -10)).DIMLFAC).toBe(-10);
    expect(measureVars(doc, dimIn(doc, null, -10)).DIMLFAC).toBe(1);
    expect(measureVars(doc, { ...dimIn(doc, null, -10), owner: 'FFFF' }).DIMLFAC).toBe(-10);
    expect(measureVars(doc, dimIn(doc, MODEL_SPACE, 2)).DIMLFAC).toBe(2);
    expect(linearFactor(doc, -10, { owner: doc.blocks.get(MODEL_SPACE)!.recordHandle })).toBe(1);
    expect(linearFactor(doc, -10, { paperSpace: true })).toBe(10);
    expect(linearFactor(doc, -10, { owner: 'FFFF' })).toBe(10);
    expect(linearFactor(doc, 2, { owner: doc.blocks.get(MODEL_SPACE)!.recordHandle })).toBe(2);
    expect(linearFactor(doc, undefined, {})).toBe(1);
  });

  it('치수 그림의 문자와 LIST·특성 측정값: 모형 공간 100, 도면 공간 1000(재지정 −10). 저장된 재지정은 그대로', () => {
    const m = dimIn(doc, MODEL_SPACE, -10);
    const p = dimIn(doc, PAPER_SPACE, -10);
    expect(drawnText(doc, m)).toMatch(/^100([.,]0+)?$/);
    expect(drawnText(doc, p)).toMatch(/^1000([.,]0+)?$/);
    expect(dimDisplayText(doc, { ...m, measurement: 100 }).formatted).toMatch(/^100([.,]0+)?$/);
    expect(dimDisplayText(doc, { ...p, measurement: 100 }).formatted).toMatch(/^1000([.,]0+)?$/);
    expect(m.overrides?.[144]).toBe(-10);
  });
});

describe('모형 공간 DIMLINEAR와 음수 DIMLFAC(진짜 App)', () => {
  function setup() {
    const h = makeApp();
    registerDimCommands(h.app);
    h.app.osnapOn = false;
    h.app.polarOn = false;
    h.app.dynOn = false;
    const cl = h.cmd as unknown as DirectCommandLine;
    const type = async (...ts: string[]) => {
      for (const t of ts) {
        cl.type(t);
        await settle();
      }
    };
    return { ...h, type };
  }

  it('지금 DIMLFAC −10: 모형 공간 치수는 1로(값 100), 재지정 −10은 그대로 남아 저장된다', async () => {
    const h = setup();
    h.doc.header.set('$DIMLFAC', -10);
    void h.app.run('DIMLINEAR');
    await settle();
    await h.type('0,0', '100,0', '50,20');
    const d = h.doc.blocks.get(MODEL_SPACE)!.entities.find((e): e is DimensionEntity => e.type === 'DIMENSION')!;
    expect(d.overrides?.[144]).toBe(-10);
    expect(h.out().filter((t) => t.startsWith('치수 문자 ='))).toEqual([expect.stringMatching(/^치수 문자 = 100([.,]0+)?$/)]);
    const blk = h.doc.blocks.get(d.block.toUpperCase())!;
    const t = blk.entities.find((e): e is MTextEntity => e.type === 'MTEXT')!;
    expect(t.text.replace(/^\\A1;/, '')).toMatch(/^100([.,]0+)?$/);
    expect(dimDisplayText(h.doc, d).formatted).toMatch(/^100([.,]0+)?$/);
    for (const [name, data] of [
      ['x.dxf', writeDxf(h.doc, { version: 'AC1032' }).data],
      ['x.dwg', writeDwg(h.doc, { version: 'AC1032' }).data],
    ] as const) {
      const back = readCadFile(data, name);
      const b = back.blocks.get(MODEL_SPACE)!.entities.find((e): e is DimensionEntity => e.type === 'DIMENSION')!;
      expect(b.overrides?.[144], name).toBeCloseTo(-10, 12);
      // 다시 읽은 치수도 모형 공간이라 측정값은 1로
      expect(dimDisplayText(back, b).formatted, name).toMatch(/^100([.,]0+)?$/);
    }
  });

  it('도면 공간 DIMLINEAR는 이전처럼 그 크기(값 1000)', async () => {
    const h = setup();
    h.doc.header.set('$DIMLFAC', -10);
    h.st.space = PAPER_SPACE;
    void h.app.run('DIMLINEAR');
    await settle();
    await h.type('0,0', '100,0', '50,20');
    expect(h.out().filter((t) => t.startsWith('치수 문자 ='))).toEqual([expect.stringMatching(/^치수 문자 = 1000([.,]0+)?$/)]);
  });
});
