// @vitest-environment jsdom
/**
 * 208차: TABLE·TOLERANCE·REVCLOUD(직사각형·폴리곤·프리핸드)가 현재 고도(ELEVATION)를 쓰는지 — 205~207차(SOLID·TEXT·MTEXT·INSERT·-INSERT·MINSERT·ATTDEF)의 다음.
 * Autodesk ELEV 도움말: 현재 고도는 새 객체의 기본 Z이고 X·Y만 준 점에 쓰인다.
 * DXF 참조서: ACAD_TABLE의 10(블록 참조 부분)은 삽입점, TOLERANCE의 10은 삽입점(WCS)이고 따로 고도 칸이 없다.
 * LWPOLYLINE은 꼭짓점이 X·Y뿐이고 고도는 38 하나다(PLINE이 이미 현재 고도를 넣는 꼴).
 * 전에는 세 명령이 찍은 점의 Z(구름은 고도)를 늘 0으로 써서, 고도가 있는 도면에서 LINE·PLINE·TEXT·INSERT와 다른 높이에 놓였다.
 * 고도가 0인 도면, 프롬프트 흐름, 구름의 꼭짓점 X·Y·볼록은 전과 같다. REVCLOUD 객체(O)·수정(M)은 원본을 따르는 갈래라 이번에 바꾸지 않는다.
 * 입력이 Z를 준 점·UCS·−Z는 보지 않는다(205~207차와 같다).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CadDocument, Entity, LwPolylineEntity, ToleranceEntity } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
import { lwVertices } from '../../src/core/lwpoly';
import { registerAnnot2Misc } from '../../src/app/annot2-misc';
import { registerModify2Commands } from '../../src/app/modify2';
import { registerTableEditCommands } from '../../src/app/tablecmds';
import { registerTextCommands } from '../../src/app/textedit/commands';
import { activeEditor } from '../../src/app/textedit/editor';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { makeApp, settle } from '../polish/real-app';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../polish/fakes')).FakeCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));

afterEach(() => {
  activeEditor()?.cancel();
  document.body.replaceChildren();
});

function setup(elevation?: number) {
  const h = makeApp();
  registerTableEditCommands(h.app);
  registerTextCommands(h.app);
  registerAnnot2Misc(h.app);
  registerModify2Commands(h.app);
  // 시험의 가짜 글꼴로는 배치하지 못한다: 줄 수만 대략(표 첫 셀 편집기 — tests/table2/fixture28.ts와 같다)
  h.app.text.layoutMText = ((p: { height: number; text: string }) => {
    const lines = p.text.split('\\P').length;
    return { glyphs: [], lines: [], minX: 0, minY: -p.height - (lines - 1) * p.height * (5 / 3), maxX: p.text.length * p.height, maxY: 0 };
  }) as never;
  if (elevation !== undefined) h.doc.header.set('$ELEVATION', elevation);
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

const dlg = () => document.querySelector('.dialog') as HTMLElement | null;
const field = <T extends HTMLElement = HTMLInputElement>(aria: string) => dlg()!.querySelector(`[aria-label="${aria}"]`) as T;
const ok = () => (dlg()!.querySelector('footer .btn.primary') as HTMLButtonElement).click();
const box = () => document.querySelector('.te-box') as HTMLElement | null;

/** TABLE: 대화 상자(열 2·데이터 행 1, 삽입 동작) → 점들 → 첫 셀 편집기에서 바로 Esc(빈 표 그대로) */
async function table(h: H, mode: 'point' | 'window', points: string[]): Promise<void> {
  const done = h.app.run('TABLE');
  await vi.waitFor(() => expect(dlg()?.querySelector('[aria-label="삽입 동작"]')).not.toBeNull());
  field('열').value = '2';
  field('데이터 행').value = '1';
  field<HTMLSelectElement>('삽입 동작').value = mode;
  ok();
  await settle();
  for (const t of points) {
    h.app.submitInput(t);
    await settle();
  }
  expect(box()?.getAttribute('aria-label')).toBe('테이블 셀 편집 — A1');
  box()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await settle();
  await done;
}

/** TOLERANCE: 1행 기호 j(위치)·공차 1 값 0.1 → 확인 → 공차 위치 */
async function tolerance(h: H, at: string): Promise<void> {
  void h.app.run('TOLERANCE');
  await vi.waitFor(() => expect(dlg()?.getAttribute('aria-label') ?? dlg()?.textContent).toContain('기하학적 공차'));
  const sym = field<HTMLSelectElement>('1행 기호');
  sym.value = 'j';
  sym.dispatchEvent(new Event('change'));
  const v = field('1행 공차 1 값');
  v.value = '0.1';
  v.dispatchEvent(new Event('input'));
  ok();
  await settle();
  h.app.submitInput(at);
  await settle();
}

const model = <T extends Entity>(doc: CadDocument, ...types: string[]) => doc.blocks.get(MODEL_SPACE)!.entities.filter((e) => types.includes(e.type)) as T[];
const xyz = (p: { x: number; y: number; z: number } | undefined) => p && [+p.x.toFixed(6), +p.y.toFixed(6), p.z];
const tables = (doc: CadDocument) => model<Entity & { insert: { x: number; y: number; z: number } }>(doc, 'ACAD_TABLE', 'INSERT');
const clouds = (doc: CadDocument) => model<LwPolylineEntity>(doc, 'LWPOLYLINE');
const verts = (e: LwPolylineEntity) => lwVertices(e).map((v) => [+v.x.toFixed(9), +v.y.toFixed(9), +v.bulge.toFixed(9)]);

describe('TABLE·TOLERANCE·REVCLOUD의 현재 고도(208차)', () => {
  it('TABLE 삽입점 지정: 고도 6에서 표 삽입점 Z = 6(전에는 0), 명령 취소 한 번이면 없다', async () => {
    const h = setup(6);
    await table(h, 'point', ['10,20']);
    const [t] = tables(h.doc);
    expect(t!.type).toBe('ACAD_TABLE');
    expect(xyz(t!.insert)).toEqual([10, 20, 6]);
    expect(h.st.session.undoTop()?.label).toBe('TABLE');
    h.st.session.undo();
    expect(tables(h.doc)).toHaveLength(0);
  });

  it('TABLE 윈도우 지정: 고도 −2.5에서 두 구석 (0, 0)·(100, 50) → 삽입점 (0, 50, −2.5)(아래로 쌓는 표 — 왼쪽 위 구석)', async () => {
    const h = setup(-2.5);
    await table(h, 'window', ['0,0', '100,50']);
    const [t] = tables(h.doc);
    expect(xyz(t!.insert)).toEqual([0, 50, -2.5]);
  });

  it('TOLERANCE: 고도 −3에서 삽입점 Z = −3(전에는 0), 문자·방향은 그대로, 명령 취소 한 번이면 없다', async () => {
    const h = setup(-3);
    await tolerance(h, '10,20');
    const [t] = model<ToleranceEntity>(h.doc, 'TOLERANCE');
    expect(t!.text).toBe('{\\Fgdt;j}%%v0.1');
    expect(xyz(t!.insert)).toEqual([10, 20, -3]);
    expect(t!.direction).toEqual({ x: 1, y: 0, z: 0 });
    h.st.session.undo();
    expect(model(h.doc, 'TOLERANCE')).toHaveLength(0);
  });

  it('REVCLOUD 직사각형: 고도 3에서 구름 폴리선 고도 = 3(전에는 0), 꼭짓점 X·Y·볼록은 고도 없는 도면과 같고 명령 취소 한 번이면 없다', async () => {
    const h = setup(3);
    await run(h, 'REVCLOUD', ['0,0', '10,5']);
    const [c] = clouds(h.doc);
    expect(c!.closed).toBe(true);
    expect(c!.elevation).toBe(3);
    const g = setup();
    await run(g, 'REVCLOUD', ['0,0', '10,5']);
    const [c0] = clouds(g.doc);
    expect(c0!.elevation).toBe(0);
    expect(verts(c!)).toEqual(verts(c0!));
    // 호 개수: round(둘레 30 / 평균 호 15) = 2와 닫힌 구름의 최소 3 가운데 큰 값
    expect(verts(c!)).toHaveLength(3);
    h.st.session.undo();
    expect(clouds(h.doc)).toHaveLength(0);
  });

  it('REVCLOUD 폴리곤·프리핸드: 고도 −4의 닫힌 폴리곤 구름, 고도 1.5의 열린 프리핸드 구름 모두 그 고도', async () => {
    const h = setup(-4);
    await run(h, 'REVCLOUD', ['P', '0,0', '10,0', '10,10', '']);
    const [p] = clouds(h.doc);
    expect(p).toMatchObject({ closed: true, elevation: -4 });
    const f = setup(1.5);
    // 끝점 (100, 0)이 시작점에서 최대 호 길이의 두 배보다 멀어 열린 구름 — 방향 반전은 Enter(아니오)
    await run(f, 'REVCLOUD', ['F', '0,0', '50,0', '100,0', '', '']);
    const [o] = clouds(f.doc);
    expect(o).toMatchObject({ closed: false, elevation: 1.5 });
  });

  it('전과 같은 값: 고도가 없는 도면의 TABLE·TOLERANCE·REVCLOUD는 Z(고도) 0', async () => {
    const h = setup();
    await table(h, 'point', ['10,20']);
    await tolerance(h, '30,40');
    await run(h, 'REVCLOUD', ['P', '0,0', '10,0', '10,10', '']);
    expect(xyz(tables(h.doc)[0]!.insert)).toEqual([10, 20, 0]);
    expect(xyz(model<ToleranceEntity>(h.doc, 'TOLERANCE')[0]!.insert)).toEqual([30, 40, 0]);
    expect(clouds(h.doc)[0]!.elevation).toBe(0);
  });

  it('DWG·DXF로 쓰고 다시 읽어도 같은 Z(표 삽입점, 공차 삽입점, 구름 고도 38)', async () => {
    const h = setup(4);
    await table(h, 'point', ['10,20']);
    await tolerance(h, '30,40');
    await run(h, 'REVCLOUD', ['0,0', '10,5']);
    const pick = (doc: CadDocument) => {
      const [c] = clouds(doc);
      return {
        table: xyz(tables(doc)[0]?.insert),
        tolerance: xyz(model<ToleranceEntity>(doc, 'TOLERANCE')[0]?.insert),
        cloud: [c?.elevation, c?.closed, c ? lwVertices(c).length : 0],
      };
    };
    const n = lwVertices(clouds(h.doc)[0]!).length;
    const want = { table: [10, 20, 4], tolerance: [30, 40, 4], cloud: [4, true, n] };
    expect(pick(h.doc)).toEqual(want);
    for (const version of ['AC1015', 'AC1032'] as const) {
      expect(pick(readDwg(writeDwg(h.doc, { version }).data)), `DWG ${version}`).toEqual(want);
      expect(pick(readDxf(writeDxf(h.doc, { version }).data)), `DXF ${version}`).toEqual(want);
    }
  });
});
