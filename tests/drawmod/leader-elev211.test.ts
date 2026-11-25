// @vitest-environment jsdom
/**
 * 211차: LEADER·QLEADER·MLEADER가 화면에서 찍은 점에 현재 고도(ELEVATION)를 쓰는지 — 205~210차(SOLID·TEXT·MTEXT·INSERT·-INSERT·MINSERT·ATTDEF·
 * TABLE·TOLERANCE·REVCLOUD·BREAKLINE·COUNT 표·DATAEXTRACTION 표·WIPEOUT·XATTACH·IMAGEATTACH·PDFATTACH·FIELD)의 다음.
 * Autodesk ELEV 도움말: 현재 고도는 새 객체의 기본 Z이고 X·Y만 준 점에 쓰인다.
 * DXF 참조서 LEADER: 10/20/30은 꼭짓점마다의 X·Y·Z이고 따로 고도 칸(38)이 없다. MLeader 문맥 데이터: 10 내용 기준 위치·12 문자 위치·15 블록 내용 위치·
 * 110 평면 원점(111·112는 평면의 X·Y축)도 모두 3D 점이고 고도 칸이 없다. 지시선 선의 10도 꼭짓점 3D 점이다.
 * 전에는 세 명령이 꼭짓점(화살촉·꺾임·갈고리선)과 따로 만드는 주석(여러 줄 문자·공차·블록 참조), 다중 지시선 내용(문자·블록 자리·평면 원점)의
 * Z를 늘 0으로 써서, 고도가 있는 도면에서 LINE·TEXT·INSERT·TOLERANCE와 다른 높이에 놓였다. 이제 한 지시선의 점이 모두 같은 고도다
 * (다중 지시선 평면은 X·Y축이 그대로라 고도 위 XY와 나란하다).
 * 고도가 0인 도면, 프롬프트 흐름, 점의 X·Y는 전과 같다. LEADER 복사(C)는 원본을 X·Y만 옮기는 그대로다(찍은 점이 아님).
 * 입력이 Z를 준 점·UCS·−Z·편집 명령(MLEADEREDIT 등)은 보지 않는다(205~210차와 같다).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BlockDef, CadDocument, Entity, InsertEntity, LeaderEntity, MLeaderEntity, MTextEntity, ToleranceEntity, Vec3 } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults, tableKey } from '../../src/core/model';
import { leaderVertices } from '../../src/core/flat3';
import { registerLeaderCommand } from '../../src/app/leaderold';
import { registerAnnot2Leader } from '../../src/app/annot2-leader';
import { mleaderSession, registerAnnotateCommands } from '../../src/app/annotate';
import { activeEditor } from '../../src/app/textedit/editor';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { makeApp, settle } from '../polish/real-app';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../polish/fakes')).FakeCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));

// jsdom에는 캔버스 그리기가 없다(문자 편집기 미리보기는 그리지 않고 넘어간다)
HTMLCanvasElement.prototype.getContext = (() => null) as never;

afterEach(() => {
  activeEditor()?.cancel();
  document.body.replaceChildren();
});

/** 원 하나짜리 블록 TAG(속성 없음 — 블록 주석·블록 내용에서 값을 묻지 않는다) */
function addTagBlock(doc: CadDocument): void {
  const circle = { ...entityDefaults(), type: 'CIRCLE', handle: '9015', owner: '9013', center: { x: 0, y: 0, z: 0 }, radius: 2 } as Entity;
  const def: BlockDef = { name: 'TAG', handle: '9012', recordHandle: '9013', endHandle: '9014', basePoint: { x: 0, y: 0, z: 0 }, flags: 0, entities: [circle], layer: '0' };
  doc.blocks.set(tableKey('TAG'), def);
  doc.blockRecords.set(tableKey('TAG'), { name: 'TAG', handle: '9013', flags: 0, insertUnits: 0, explodable: true, scalable: true });
}

function setup(elevation?: number) {
  const h = makeApp(addTagBlock);
  h.app.text.layoutMText = ((p: { height: number; text: string }) => ({ glyphs: [], lines: [], minX: 0, minY: -p.height, maxX: p.text.length * p.height, maxY: 0 })) as never;
  registerLeaderCommand(h.app);
  registerAnnot2Leader(h.app);
  registerAnnotateCommands(h.app);
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

/** 떠 있는 제자리 문자 편집기에 글을 넣고 Ctrl+Enter */
async function typeEditor(text: string): Promise<void> {
  await vi.waitFor(() => expect(document.querySelector('.te-box')).not.toBeNull());
  const box = document.querySelector('.te-box') as HTMLElement;
  box.firstElementChild!.replaceChildren(document.createTextNode(text));
  box.dispatchEvent(new InputEvent('input', { bubbles: true }));
  box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
  await settle();
}

/** LEADER: 두 점 → Enter(주석) → 한 줄 'Hello' → Enter */
const leaderText = (h: H) => run(h, 'LEADER', ['0,0', '10,10', '', 'Hello', '']);
/** LEADER: 두 점 → Enter → 빈 첫 줄(옵션) → 블록(B) TAG → 삽입점 (15, 35) → 축척·회전 Enter */
const leaderBlock = (h: H) => run(h, 'LEADER', ['0,0', '10,10', '', '', 'B', 'TAG', '15,35', '', '', '']);

/** LEADER: 두 점 → Enter → 빈 첫 줄 → 공차(T) → 1행 기호 j·공차 1 값 0.1 → 확인 */
async function leaderTolerance(h: H): Promise<void> {
  await run(h, 'LEADER', ['0,0', '10,0', '', '', 'T']);
  await vi.waitFor(() => expect(dlg()?.getAttribute('aria-label') ?? dlg()?.textContent).toContain('기하학적 공차'));
  const sym = field<HTMLSelectElement>('1행 기호');
  sym.value = 'j';
  sym.dispatchEvent(new Event('change'));
  const v = field('1행 공차 1 값');
  v.value = '0.1';
  v.dispatchEvent(new Event('input'));
  ok();
  await settle();
}

/** QLEADER 기본 설정(여러 줄 문자·폭 묻기·점 3개): 두 점 → Enter → 폭 Enter → 한 줄 'Note' → Enter */
const qleaderText = (h: H) => run(h, 'QLEADER', ['0,0', '10,10', '', '', 'Note', '']);

/** QLEADER 설정(S)에서 주석 유형 블록 참조 → 두 점 → Enter → 블록 이름 TAG(마지막 점에 놓인다) */
async function qleaderBlock(h: H): Promise<void> {
  void h.app.run('QLEADER');
  await settle();
  h.app.submitInput('S');
  await vi.waitFor(() => expect(dlg()?.querySelector('[aria-label="주석 유형"]')).not.toBeNull());
  field<HTMLSelectElement>('주석 유형').value = 'B';
  ok();
  await settle();
  for (const t of ['0,0', '10,10', '', 'TAG']) {
    h.app.submitInput(t);
    await settle();
  }
}

/** MLEADER 화살촉 먼저(최대 점 2): 화살촉 (10, 20) → 연결선 (30, 25) → 편집기 'Note' */
async function mleaderText(h: H): Promise<void> {
  await run(h, 'MLEADER', ['10,20', '30,25']);
  await typeEditor('Note');
}

/** MLEADER 내용 먼저(C): 문자 상자 (40, 30)–(70, 20) → 편집기 'Note' → 화살촉 (10, 0) */
async function mleaderContentFirst(h: H): Promise<void> {
  await run(h, 'MLEADER', ['C', '40,30', '70,20']);
  await typeEditor('Note');
  h.app.submitInput('10,0');
  await settle();
}

/** MLEADER 블록 내용(TAG): 화살촉 (10, 20) → 연결선 (30, 25) */
async function mleaderBlock(h: H): Promise<void> {
  const s = mleaderSession(h.doc);
  s.content = 'B';
  s.block = 'TAG';
  await run(h, 'MLEADER', ['10,20', '30,25']);
}

const model = <T extends Entity>(doc: CadDocument, type: string) => doc.blocks.get(MODEL_SPACE)!.entities.filter((e) => e.type === type) as T[];
const leaders = (doc: CadDocument) => model<LeaderEntity>(doc, 'LEADER');
const mtexts = (doc: CadDocument) => model<MTextEntity>(doc, 'MTEXT');
const inserts = (doc: CadDocument) => model<InsertEntity>(doc, 'INSERT');
const tolerances = (doc: CadDocument) => model<ToleranceEntity>(doc, 'TOLERANCE');
const mleaders = (doc: CadDocument) => model<MLeaderEntity>(doc, 'MULTILEADER');
const r6 = (v: number) => +v.toFixed(6);
const xyz = (p: Vec3 | undefined) => p && [r6(p.x), r6(p.y), p.z];
const xyOf = (ps: Vec3[]) => ps.map((p) => [r6(p.x), r6(p.y)]);
const zOf = (ps: Vec3[]) => ps.map((p) => p.z);

/** 다중 지시선의 모든 점(이름, 점) — 내용 기준·평면 원점·문자·블록 자리·지시선 마지막 점·지시선 선 꼭짓점 */
function mlPoints(m: MLeaderEntity): [string, Vec3][] {
  const c = m.context;
  const out: [string, Vec3][] = [
    ['내용 기준 10', c.contentBase],
    ['평면 원점 110', c.basePoint],
  ];
  if (c.text) out.push(['문자 위치 12', c.text.location]);
  if (c.block) out.push(['블록 위치 15', c.block.location]);
  c.leaders.forEach((ld, i) => {
    if (ld.lastLeaderPoint) out.push([`지시선 ${i} 마지막 점`, ld.lastLeaderPoint]);
    ld.lines.forEach((ln, j) => ln.vertices.forEach((v, k) => out.push([`지시선 ${i} 선 ${j} 꼭짓점 ${k}`, v])));
  });
  return out;
}
const mlZ = (m: MLeaderEntity) => Object.fromEntries(mlPoints(m).map(([k, p]) => [k, p.z]));
const mlAllZ = (m: MLeaderEntity, z: number) => Object.fromEntries(mlPoints(m).map(([k]) => [k, z]));
const mlXY = (m: MLeaderEntity) => mlPoints(m).map(([k, p]) => [k, r6(p.x), r6(p.y)]);

describe('LEADER·QLEADER·MLEADER의 현재 고도(211차)', () => {
  it('LEADER 여러 줄 문자: 고도 3에서 꼭짓점(갈고리선 꼭짓점 포함)과 주석 삽입점의 Z = 3(전에는 0), X·Y는 고도 0과 같다, 명령 취소 한 번이면 둘 다 없다', async () => {
    const h0 = setup();
    await leaderText(h0);
    const h = setup(3);
    await leaderText(h);
    const [ld] = leaders(h.doc);
    const [mt] = mtexts(h.doc);
    expect(ld!.annotation).toBe(mt!.handle);
    expect(ld!.hookline).toBe(true);
    expect(zOf(leaderVertices(ld!))).toEqual([3, 3, 3]);
    expect(xyOf(leaderVertices(ld!))).toEqual(xyOf(leaderVertices(leaders(h0.doc)[0]!)));
    expect(xyOf(leaderVertices(ld!))[0]).toEqual([0, 0]);
    expect(xyOf(leaderVertices(ld!))[2]).toEqual([10, 10]);
    expect(mt!.insert.z).toBe(3);
    expect(xyOf([mt!.insert])).toEqual(xyOf([mtexts(h0.doc)[0]!.insert]));
    // 주석 자리와 마지막 꼭짓점이 같은 고도라 213(주석 자리에서의 차이)의 Z는 0 그대로
    expect(ld!.annotationOffset?.z).toBe(0);
    expect(h.st.session.undoTop()?.label).toBe('LEADER');
    h.st.session.undo();
    expect(leaders(h.doc)).toHaveLength(0);
    expect(mtexts(h.doc)).toHaveLength(0);
  });

  it('LEADER 블록(B)·공차(T): 고도 −2에서 찍은 블록 삽입점 (15, 35, −2)·공차 삽입점 (10, 0, −2)과 꼭짓점 Z = −2(전에는 0)', async () => {
    const h = setup(-2);
    await leaderBlock(h);
    await leaderTolerance(h);
    const [lb, lt] = leaders(h.doc);
    const [ins] = inserts(h.doc);
    const [tol] = tolerances(h.doc);
    expect(lb!.annotation).toBe(ins!.handle);
    expect(lb!.creation).toBe(2);
    expect(xyz(ins!.insert)).toEqual([15, 35, -2]);
    expect(zOf(leaderVertices(lb!))).toEqual([-2, -2]);
    expect(lt!.annotation).toBe(tol!.handle);
    expect(lt!.creation).toBe(1);
    expect(xyz(tol!.insert)).toEqual([10, 0, -2]);
    expect(zOf(leaderVertices(lt!))).toEqual([-2, -2]);
  });

  it('QLEADER 여러 줄 문자·블록 참조: 고도 4에서 꼭짓점·주석 삽입점·블록 삽입점(마지막 점 (10, 10, 4))의 Z = 4(전에는 0), 명령 취소 한 번이면 없다', async () => {
    const h0 = setup();
    await qleaderText(h0);
    const h = setup(4);
    await qleaderText(h);
    const [ld] = leaders(h.doc);
    const [mt] = mtexts(h.doc);
    expect(mt!.text).toBe('Note');
    expect(ld!.annotation).toBe(mt!.handle);
    expect(zOf(leaderVertices(ld!))).toEqual([4, 4, 4]);
    expect(xyOf(leaderVertices(ld!))).toEqual(xyOf(leaderVertices(leaders(h0.doc)[0]!)));
    expect(mt!.insert.z).toBe(4);
    expect(xyOf([mt!.insert])).toEqual(xyOf([mtexts(h0.doc)[0]!.insert]));
    expect(h.st.session.undoTop()?.label).toBe('QLEADER');
    h.st.session.undo();
    expect(leaders(h.doc)).toHaveLength(0);
    expect(mtexts(h.doc)).toHaveLength(0);
    await qleaderBlock(h);
    const [lb] = leaders(h.doc);
    const [ins] = inserts(h.doc);
    expect(lb!.annotation).toBe(ins!.handle);
    expect(xyz(ins!.insert)).toEqual([10, 10, 4]);
    expect(zOf(leaderVertices(lb!))).toEqual([4, 4]);
  });

  it('MLEADER 화살촉 먼저: 고도 5에서 내용 기준·평면 원점·문자 위치·지시선 점의 Z = 5(전에는 0), X·Y와 평면 축은 고도 0과 같다, 명령 취소 한 번이면 없다', async () => {
    const h0 = setup();
    await mleaderText(h0);
    const h = setup(5);
    await mleaderText(h);
    const [m] = mleaders(h.doc);
    const m0 = mleaders(h0.doc)[0]!;
    expect(m!.context.text!.text).toBe('Note');
    expect(mlZ(m!)).toEqual(mlAllZ(m!, 5));
    expect(mlXY(m!)).toEqual(mlXY(m0));
    expect(xyz(m!.context.leaders[0]!.lines[0]!.vertices[0])).toEqual([10, 20, 5]);
    expect(xyz(m!.context.leaders[0]!.lastLeaderPoint)).toEqual([30, 25, 5]);
    // 평면의 X·Y축과 법선은 그대로 — 평면이 고도 위 XY와 나란하다
    expect(m!.context.baseDirection).toEqual({ x: 1, y: 0, z: 0 });
    expect(m!.context.baseVertical).toEqual({ x: 0, y: 1, z: 0 });
    expect(m!.context.normal).toEqual({ x: 0, y: 0, z: 1 });
    expect(h.st.session.undoTop()?.label).toBe('MLEADER');
    h.st.session.undo();
    expect(mleaders(h.doc)).toHaveLength(0);
  });

  it('MLEADER 내용 먼저(C)·블록 내용: 고도 −1.5에서 모든 점의 Z = −1.5(전에는 0)', async () => {
    const hc = setup(-1.5);
    await mleaderContentFirst(hc);
    const [mc] = mleaders(hc.doc);
    expect(mc!.context.text!.text).toBe('Note');
    expect(mlZ(mc!)).toEqual(mlAllZ(mc!, -1.5));
    expect(xyz(mc!.context.leaders[0]!.lines[0]!.vertices[0])).toEqual([10, 0, -1.5]);
    const hb = setup(-1.5);
    await mleaderBlock(hb);
    const [mb] = mleaders(hb.doc);
    expect(mb!.contentType).toBe(1);
    expect(mb!.context.block).toBeDefined();
    expect(mlZ(mb!)).toEqual(mlAllZ(mb!, -1.5));
  });

  it('전과 같은 값: 고도가 없는 도면의 LEADER·QLEADER·MLEADER는 모든 점의 Z가 0', async () => {
    const h = setup();
    await leaderText(h);
    await qleaderText(h);
    await mleaderText(h);
    const [l1, l2] = leaders(h.doc);
    expect(zOf(leaderVertices(l1!))).toEqual([0, 0, 0]);
    expect(zOf(leaderVertices(l2!))).toEqual([0, 0, 0]);
    expect(mtexts(h.doc).map((m) => m.insert.z)).toEqual([0, 0]);
    const [m] = mleaders(h.doc);
    expect(mlZ(m!)).toEqual(mlAllZ(m!, 0));
    expect(xyz(m!.context.leaders[0]!.lastLeaderPoint)).toEqual([30, 25, 0]);
  });

  it('DWG·DXF로 쓰고 다시 읽어도 같은 Z(LEADER 10·MTEXT 10 — AC1015·AC1032, MULTILEADER 문맥 데이터 — AC1032)', async () => {
    const h = setup(4);
    await leaderText(h);
    await qleaderText(h);
    const pick = (doc: CadDocument) => ({
      leader: leaders(doc).map((l) => zOf(leaderVertices(l))),
      mtext: mtexts(doc).map((m) => m.insert.z),
    });
    const want = { leader: [[4, 4, 4], [4, 4, 4]], mtext: [4, 4] };
    expect(pick(h.doc)).toEqual(want);
    for (const version of ['AC1015', 'AC1032'] as const) {
      expect(pick(readDwg(writeDwg(h.doc, { version }).data)), `DWG ${version}`).toEqual(want);
      expect(pick(readDxf(writeDxf(h.doc, { version }).data)), `DXF ${version}`).toEqual(want);
    }
    const hm = setup(4);
    await mleaderText(hm);
    await mleaderBlock(hm);
    const pickMl = (doc: CadDocument) => mleaders(doc).map((m) => ({ content: m.contentType, z: mlZ(m) }));
    const wantMl = mleaders(hm.doc).map((m) => ({ content: m.contentType, z: mlAllZ(m, 4) }));
    expect(wantMl.map((x) => x.content)).toEqual([2, 1]);
    expect(pickMl(hm.doc)).toEqual(wantMl);
    expect(pickMl(readDwg(writeDwg(hm.doc, { version: 'AC1032' }).data)), 'DWG AC1032').toEqual(wantMl);
    expect(pickMl(readDxf(writeDxf(hm.doc, { version: 'AC1032' }).data)), 'DXF AC1032').toEqual(wantMl);
  });
});
