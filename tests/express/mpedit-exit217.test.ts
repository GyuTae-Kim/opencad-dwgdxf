// @vitest-environment jsdom
/**
 * 217차: MPEDIT 종료(X). Autodesk MPEDIT 도움말(Express Tools)은 옵션 프롬프트 끝에 종료(eXit)를 두고 기본값을 <종료>로 적는다.
 * 전에는 MPEDIT(PEDIT 다중(M)과 같은 함수 `peditMulti`)이 종료를 몰라 X를 「점이 올바르지 않습니다.」로 거절하고 같은 프롬프트를 다시 물었다
 * (X는 EXPLODE 별칭이지만 투명 명령이 아니다). Enter가 이미 같은 일(끝)을 했다.
 * 이제 MPEDIT의 옵션 프롬프트는 「… /명령 취소(U)/종료(X)] <종료>:」이고 X면 Enter처럼 끝난다. 다른 옵션·Enter·PEDIT 다중(M)은 전과 같다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CadDocument, Entity, LwPolylineEntity } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
import { lwPoints } from '../../src/core/lwpoly';
import { registerExpressDrawCommands } from '../../src/app/express-draw';
import { registerPeditCommands } from '../../src/app/modify2-pedit';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { translate } from '../../site/i18n.mjs';
import { line, lw } from '../edit/make';
import { makeApp, settle } from '../polish/real-app';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../polish/fakes')).FakeCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));

afterEach(() => document.body.replaceChildren());

const OPTIONS = '닫기(C)/열기(O)/결합(J)/폭(W)/맞춤(F)/스플라인(S)/비곡선화(D)/선종류생성(L)/반전(R)/명령 취소(U)';
/** MPEDIT의 새 옵션 프롬프트 */
const PROMPT = `옵션 입력 [${OPTIONS}/종료(X)] <종료>:`;
/** PEDIT 다중(M)의 옵션 프롬프트(그대로) */
const OLD_PROMPT = `옵션 입력 [${OPTIONS}]:`;

/** 모형 공간에 객체를 넣고(명령 취소 목록 맨 아래 'seed') 이전 선택으로 둔다 */
function setup(make: () => Entity[]) {
  const h = makeApp();
  registerExpressDrawCommands(h.app);
  registerPeditCommands(h.app);
  const s = h.st.session;
  const owner = h.doc.blocks.get(MODEL_SPACE)?.recordHandle;
  const ents = make().map((e) => ({ ...e, handle: s.newHandle(), owner }) as Entity);
  s.commit({ label: 'seed', ops: ents.map((entity) => ({ kind: 'add' as const, block: h.st.space, entity })) });
  // 객체 선택은 이전(P)으로 고른다 — 가짜 화면에는 장면이 없어 전체(ALL)가 아무것도 찾지 못한다
  h.app.lastSelection = ents.map((e) => e.handle);
  // 물은 프롬프트(Enter로 답한 것도 남는다)
  const asked: string[] = [];
  h.cmd.watchers.add({ prompt: (t: string) => asked.push(t.replace(/[⁨⁩]/g, '')) });
  return { ...h, ents, asked };
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

const model = <T extends Entity>(doc: CadDocument, type: string) => doc.blocks.get(MODEL_SPACE)!.entities.filter((e) => e.type === type) as T[];
const polys = (doc: CadDocument) => model<LwPolylineEntity>(doc, 'LWPOLYLINE');
const pts = (e: LwPolylineEntity) => lwPoints(e).map((p) => [+p.x.toFixed(6), +p.y.toFixed(6)]);
const rejected = (h: H) => h.out().filter((l) => l.includes('점이 올바르지 않습니다'));
const times = (h: H, prompt: string) => h.asked.filter((p) => p === prompt).length;
const twoOpen = () => [lw([[0, 0], [10, 0], [10, 5]]), lw([[20, 0], [30, 0], [30, 5]])];

describe('MPEDIT 종료(X)(217차)', () => {
  it('두 열린 폴리선에 닫기(C) 뒤 X면 거절 없이 끝나고(프롬프트 <종료>), 명령 취소 한 번이면 둘 다 다시 열린다', async () => {
    const h = setup(twoOpen);
    // 객체 선택 P·Enter, 닫기, 종료
    await run(h, 'MPEDIT', ['P', '', 'C', 'X']);
    expect(rejected(h)).toEqual([]);
    expect(h.out()).toContain(`${PROMPT} X`);
    expect(times(h, PROMPT)).toBe(2);
    expect(times(h, OLD_PROMPT)).toBe(0);
    expect(h.app.busyCommand).toBeNull();
    expect(polys(h.doc).map((e) => [e.closed, pts(e)])).toEqual([
      [true, [[0, 0], [10, 0], [10, 5]]],
      [true, [[20, 0], [30, 0], [30, 5]]],
    ]);
    expect(h.st.session.undoTop()?.label).toBe('MPEDIT');
    h.st.session.undo();
    expect(polys(h.doc).map((e) => e.closed)).toEqual([false, false]);
    expect(h.st.session.undoTop()?.label).toBe('seed');
  });

  it('선 하나를 폴리선으로 바꾼(변환 Enter = 예) 뒤 곧바로 소문자 x면 끝나고, 명령 취소 한 번이면 선이 돌아온다', async () => {
    const h = setup(() => [line(0, 0, 10, 0)]);
    await run(h, 'MPEDIT', ['P', '', '', 'x']);
    expect(rejected(h)).toEqual([]);
    expect(times(h, PROMPT)).toBe(1);
    expect(h.app.busyCommand).toBeNull();
    expect(model(h.doc, 'LINE')).toHaveLength(0);
    expect(polys(h.doc).map((e) => [e.closed, pts(e)])).toEqual([[false, [[0, 0], [10, 0]]]]);
    expect(h.st.session.undoTop()?.label).toBe('MPEDIT');
    h.st.session.undo();
    expect(model(h.doc, 'LINE')).toHaveLength(1);
    expect(polys(h.doc)).toHaveLength(0);
  });

  it('전과 같은 값: MPEDIT 폭(W) 2 뒤 Enter로 끝나고, PEDIT 다중(M)의 프롬프트에는 종료가 없어 X는 전처럼 거절된다', async () => {
    const h = setup(twoOpen);
    await run(h, 'MPEDIT', ['P', '', 'W', '2', '']);
    expect(h.app.busyCommand).toBeNull();
    expect(polys(h.doc).map((e) => [e.closed, e.constantWidth])).toEqual([
      [false, 2],
      [false, 2],
    ]);
    expect(rejected(h)).toEqual([]);
    h.app.lastSelection = h.ents.map((e) => e.handle);
    const from = h.asked.length;
    // 폴리선 선택 또는 [다중(M)] → M, 객체 선택 P·Enter, X(거절 — 프롬프트는 다시 찍지 않고 그대로 기다림), 닫기, Enter
    await run(h, 'PEDIT', ['M', 'P', '', 'X', 'C', '']);
    expect(rejected(h)).toHaveLength(1);
    const asked = h.asked.slice(from);
    expect(asked.filter((p) => p === OLD_PROMPT)).toHaveLength(2);
    expect(asked).not.toContain(PROMPT);
    expect(h.app.busyCommand).toBeNull();
    expect(polys(h.doc).map((e) => [e.closed, e.constantWidth])).toEqual([
      [true, 2],
      [true, 2],
    ]);
  });

  it('DWG·DXF로 쓰고 다시 읽어도 MPEDIT(닫기·폭 0.5 뒤 X)으로 바꾼 폴리선의 닫힘·전역 폭·꼭짓점이 같다', async () => {
    const h = setup(twoOpen);
    await run(h, 'MPEDIT', ['P', '', 'C', 'W', '0.5', 'X']);
    const pick = (doc: CadDocument) => polys(doc).map((e) => [e.closed, e.constantWidth, pts(e)]);
    const want = [
      [true, 0.5, [[0, 0], [10, 0], [10, 5]]],
      [true, 0.5, [[20, 0], [30, 0], [30, 5]]],
    ];
    expect(pick(h.doc)).toEqual(want);
    for (const version of ['AC1015', 'AC1032'] as const) {
      expect(pick(readDwg(writeDwg(h.doc, { version }).data)), `DWG ${version}`).toEqual(want);
      expect(pick(readDxf(writeDxf(h.doc, { version }).data)), `DXF ${version}`).toEqual(want);
    }
  });

  it('새 프롬프트 글이 네 언어 사전에 있다', () => {
    expect(translate(PROMPT, 'en')).toBe('Enter option [Close (C)/Open (O)/Join (J)/Width (W)/Fit (F)/Spline (S)/Decurve (D)/Ltype gen (L)/Reverse (R)/Undo (U)/Exit (X)] <Exit>:');
    for (const l of ['de', 'ja', 'zh-CN']) expect(translate(PROMPT, l), l).not.toMatch(/[가-힣]/);
  });
});
