// @vitest-environment jsdom
/**
 * 216차: Express BREAKLINE 끊기 기호 크기 × DIMSCALE. Autodesk BREAKLINE 도움말(Express Tools)은 현재 DIMSCALE이 끊기선 요소의 최종 크기를 정한다고 적고
 * 숫자 예로 기본 블록의 정의점 거리 1·크기 0.5·DIMSCALE 48이면 정의점 사이 거리가 1 × 0.5 × 48 = 24라고 적는다(표준 치수 축척과 같은 동작).
 * 전에는 기호 길이가 크기 옵션 값 그대로였다(DIMSCALE 무시). 이제 머리말 $DIMSCALE(시스템 변수 DIMSCALE)이 0보다 크면 기호 크기에 곱한다.
 * 0·음수·없음은 1이다(이 앱의 치수 그리기 dimVars와 같다 — DIMSCALE 도움말: 0은 모형 공간 뷰포트와 도면 공간 사이 축척, 도면 공간 기능을 쓰지 않으면 1).
 * 확장 거리는 도움말이 DIMSCALE을 곱한다고 적지 않아 그대로 두고, 크기 옵션에 저장되는 값도 사용자가 친 값 그대로다.
 * 새 문서(DIMSCALE 1)의 결과는 전과 같다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CadDocument, LwPolylineEntity } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
import { lwVertices } from '../../src/core/lwpoly';
import { registerExpressDrawCommands } from '../../src/app/express-draw';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { makeApp, settle } from '../polish/real-app';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../polish/fakes')).FakeCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));

afterEach(() => document.body.replaceChildren());

/** dimscale: 머리말 $DIMSCALE에 넣을 값(null이면 머리말에서 지운다, undefined면 새 문서 그대로 1) */
function setup(dimscale?: number | null) {
  const h = makeApp();
  registerExpressDrawCommands(h.app);
  if (dimscale === null) h.doc.header.delete('$DIMSCALE');
  else if (dimscale !== undefined) h.doc.header.set('$DIMSCALE', dimscale);
  return h;
}

type H = ReturnType<typeof setup>;

async function run(h: H, name: string, inputs: string[]): Promise<void> {
  void h.app.run(name);
  await settle();
  for (const t of inputs) {
    h.app.submitInput(t);
    await settle();
  }
}

const breaklines = (doc: CadDocument) => doc.blocks.get(MODEL_SPACE)!.entities.filter((e) => e.type === 'LWPOLYLINE') as LwPolylineEntity[];
const verts = (e: LwPolylineEntity) => lwVertices(e).map((v) => [+v.x.toFixed(9), +v.y.toFixed(9)]);
const SHORT = '두 점 사이가 끊기 기호보다 짧습니다';

/** 크기 0.5·DIMSCALE 48(도움말 숫자 예): 기호 길이 24, 위아래 12씩 — 확장 1은 그대로 */
const HELP_EXAMPLE = [
  [-1, 0],
  [38, 0],
  [44, 12],
  [56, -12],
  [62, 0],
  [101, 0],
];

/** 새 문서(DIMSCALE 1)의 기본 크기 1·확장 1, (0, 0)–(10, 0) — 전과 같은 값 */
const UNSCALED = [
  [-1, 0],
  [4.5, 0],
  [4.75, 0.5],
  [5.25, -0.5],
  [5.5, 0],
  [11, 0],
];

describe('BREAKLINE 기호 크기 × DIMSCALE(216차)', () => {
  it('DIMSCALE 48·크기 0.5면 기호 길이 24(도움말 숫자 예), 확장은 그대로 1, 다음 BREAKLINE도 같은 크기, 명령 취소 한 단계', async () => {
    const h = setup(48);
    await run(h, 'BREAKLINE', ['S', '0.5', '0,0', '100,0', '']);
    expect(breaklines(h.doc).map(verts)).toEqual([HELP_EXAMPLE]);
    // 크기 옵션에 남은 값은 친 값(0.5)이라 다시 그려도 24 — 24 × 48이 되지 않는다
    await run(h, 'BREAKLINE', ['0,0', '100,0', '']);
    expect(breaklines(h.doc).map(verts)).toEqual([HELP_EXAMPLE, HELP_EXAMPLE]);
    expect(h.out().filter((l) => l.includes(SHORT))).toEqual([]);
    expect(h.st.session.undoTop()?.label).toBe('BREAKLINE');
    h.st.session.undo();
    expect(breaklines(h.doc)).toHaveLength(1);
  });

  it('DIMSCALE 48이면 기본 크기 1의 기호(48)가 두 점 사이(10)보다 길어 만들지 않고 까닭을 알린다', async () => {
    const h = setup(48);
    await run(h, 'BREAKLINE', ['0,0', '10,0', '']);
    expect(breaklines(h.doc)).toHaveLength(0);
    expect(h.out().filter((l) => l.includes(SHORT))).toHaveLength(1);
  });

  it('전과 같은 값: DIMSCALE 1(새 문서)·0·음수·머리말 없음은 기호 크기를 곱하지 않는다', async () => {
    for (const ds of [undefined, 0, -2, null]) {
      const h = setup(ds);
      await run(h, 'BREAKLINE', ['0,0', '10,0', '']);
      expect(breaklines(h.doc).map(verts), `DIMSCALE ${ds}`).toEqual([UNSCALED]);
      document.body.replaceChildren();
    }
  });

  it('DWG·DXF로 쓰고 다시 읽어도 DIMSCALE 48의 끊기선 꼭짓점과 머리말 DIMSCALE이 같다', async () => {
    const h = setup(48);
    await run(h, 'BREAKLINE', ['S', '0.5', '0,0', '100,0', '']);
    const pick = (doc: CadDocument) => ({ dimscale: doc.header.get('$DIMSCALE'), lines: breaklines(doc).map(verts) });
    const want = { dimscale: 48, lines: [HELP_EXAMPLE] };
    expect(pick(h.doc)).toEqual(want);
    for (const version of ['AC1015', 'AC1032'] as const) {
      expect(pick(readDwg(writeDwg(h.doc, { version }).data)), `DWG ${version}`).toEqual(want);
      expect(pick(readDxf(writeDxf(h.doc, { version }).data)), `DXF ${version}`).toEqual(want);
    }
  });
});
