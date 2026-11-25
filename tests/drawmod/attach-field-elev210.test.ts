// @vitest-environment jsdom
/**
 * 210차: XATTACH·IMAGEATTACH·PDFATTACH·FIELD(새 여러 줄 문자)가 화면에서 찍은 삽입점에 현재 고도(ELEVATION)를 쓰는지 —
 * 205~209차(SOLID·TEXT·MTEXT·INSERT·-INSERT·MINSERT·ATTDEF·TABLE·TOLERANCE·REVCLOUD·BREAKLINE·COUNT 표·DATAEXTRACTION 표·WIPEOUT)의 다음.
 * Autodesk ELEV 도움말: 현재 고도는 새 객체의 기본 Z이고 X·Y만 준 점에 쓰인다.
 * 외부 참조·이미지·PDF 언더레이 부착 대화 상자 도움말: 삽입점 「화면상에 지정」은 명령행이나 화면에서 점을 주고, 끄면 X·Y·Z 칸에 넣는다
 * (이미지 도움말: 기본 삽입점은 0,0,0). 이 앱의 세 대화 상자에는 삽입점 칸이 없고 늘 화면에서 찍는다.
 * DXF 참조서: INSERT 10(OCS)·IMAGE 10(WCS)·UNDERLAY 10(OCS)·MTEXT 10은 따로 고도 칸(38)이 없어 Z는 삽입점의 30뿐이다.
 * 전에는 네 명령이 찍은 삽입점의 Z를 늘 0으로 써서, 고도가 있는 도면에서 INSERT·MTEXT(206차)와 다른 높이에 놓였다.
 * 고도가 0인 도면, 프롬프트 흐름, 축척·회전·U·V 벡터는 전과 같다. IMAGEATTACH의 「삽입점 지정 <0,0>」 Enter는 도움말의 기본 삽입점
 * 0,0,0(Z까지 준 값)이라 그대로 Z 0이다. 같은 함수를 쓰는 PASTESPEC 그림 붙여넣기는 이번에 보지 않아 그대로다.
 * 파일 고르기·외부 참조 열기·이미지 연결·PDF 읽기는 가짜로 바꿔 끼운다(삽입점 계산은 진짜 명령 코드).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CadDocument, Entity, ImageEntity, InsertEntity, MTextEntity, UnderlayEntity } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { registerBlkXrefCommands } from '../../src/app/blkcmds-xref';
import { registerFieldCommands } from '../../src/app/fieldcmds';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { makeApp, settle } from '../polish/real-app';

/** 다음 파일 고르기가 돌려줄 파일과, 외부 참조로 열 도면 */
const picked = vi.hoisted(() => ({ file: null as File | null, xdoc: null as CadDocument | null }));

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../polish/fakes')).FakeCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));
vi.mock('../../src/app/blkcmds-io', async (orig) => ({ ...(await orig<object>()), pickOneFile: async () => picked.file }));
vi.mock('../../src/app/refs', async (orig) => {
  const o = await orig<typeof import('../../src/app/refs')>();
  return {
    ...o,
    linkXrefFiles: async (_app: unknown, files: File[]) => files.map((f) => f.name),
    // XATTACH는 연결한 파일을 블록 이름 '?'의 시험 문서로 찾는다(blkcmds-xref linkedXref)
    xrefOfDoc: (doc: CadDocument, key: string) => (key === '?' ? { name: picked.file?.name ?? '', docId: 0, doc: picked.xdoc, scene: { bounds: null }, layers: [] } : o.xrefOfDoc(doc, key)),
    expandXrefBounds: () => {},
    linkImageFiles: async (_app: unknown, files: File[]) => ({ linked: files.map((f) => f.name), unsupported: [] }),
    linkPdfFiles: async (_app: unknown, files: File[]) => ({ linked: files.map((f) => f.name), failed: [] }),
    renderPdfPages: async () => ({ rendered: 0, failed: [] }),
  };
});
// 한 쪽짜리 레터 용지(612 × 792 pt = 8.5 × 11인치)
vi.mock('../../src/app/pdfraster', () => ({
  openPdf: async () => ({ pdf: { numPages: 1, getPage: async () => ({ getViewport: () => ({ width: 612, height: 792 }) }) }, close: async () => {} }),
  rasterPage: async () => null,
}));

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function setup(elevation?: number) {
  // 400 × 300 화소 그림(jsdom에는 createImageBitmap이 없다)
  vi.stubGlobal('createImageBitmap', async () => ({ width: 400, height: 300, close() {} }));
  const h = makeApp();
  h.app.text.layoutMText = ((p: { height: number; text: string }) => ({ glyphs: [], lines: [], minX: 0, minY: -p.height, maxX: p.text.length * p.height, maxY: 0 })) as never;
  registerBlkXrefCommands(h.app);
  registerFieldCommands(h.app);
  if (elevation !== undefined) h.doc.header.set('$ELEVATION', elevation);
  return h;
}

type H = ReturnType<typeof setup>;

const fakeFile = (name: string) => ({ name, arrayBuffer: async () => new ArrayBuffer(8) }) as unknown as File;
const dlg = () => document.querySelector('.dialog') as HTMLElement | null;

/** 떠 있는 대화 상자를 기본값 그대로 확인 */
async function ok(): Promise<void> {
  await vi.waitFor(() => expect(dlg()?.querySelector('footer .btn.primary')).not.toBeNull());
  (dlg()!.querySelector('footer .btn.primary') as HTMLButtonElement).click();
  await settle();
}

async function type(h: H, inputs: string[]): Promise<void> {
  for (const t of inputs) {
    h.app.submitInput(t);
    await settle();
  }
}

/** XATTACH: 같은 단위(밀리미터) 도면 site.dxf, 대화 상자 기본값(부착·축척 1·회전 0) → 삽입점 */
async function xattach(h: H, at: string): Promise<void> {
  picked.file = fakeFile('site.dxf');
  picked.xdoc = createNewDocument('metric');
  void h.app.run('XATTACH');
  await settle();
  await ok();
  await type(h, [at]);
}

/** IMAGEATTACH: 대화 상자 기본값(축척 1·회전 0·축척을 화면에서 지정) → 삽입점 → 축척 Enter(1) */
async function imageattach(h: H, at: string): Promise<void> {
  picked.file = fakeFile('photo.png');
  void h.app.run('IMAGEATTACH');
  await settle();
  await ok();
  await type(h, [at, '']);
}

/** PDFATTACH: 대화 상자 기본값(1쪽·축척 1·회전 0) → 삽입점 */
async function pdfattach(h: H, at: string): Promise<void> {
  picked.file = fakeFile('plan.pdf');
  void h.app.run('PDFATTACH');
  await settle();
  await ok();
  await type(h, [at]);
}

/** FIELD: 필드 이름 「작성자」 → 확인 → 시작점(새 여러 줄 문자) */
async function field(h: H, at: string): Promise<void> {
  void h.app.run('FIELD');
  await settle();
  await vi.waitFor(() => expect(dlg()?.querySelector('select[aria-label="필드 이름"]')).not.toBeNull());
  const names = dlg()!.querySelector('select[aria-label="필드 이름"]') as HTMLSelectElement;
  names.value = 'Author';
  names.dispatchEvent(new Event('change'));
  await ok();
  await type(h, [at]);
}

const model = <T extends Entity>(doc: CadDocument, type: string) => doc.blocks.get(MODEL_SPACE)!.entities.filter((e) => e.type === type) as T[];
const xyz = (p: { x: number; y: number; z: number } | undefined) => p && [+p.x.toFixed(6), +p.y.toFixed(6), p.z];
const xrefs = (doc: CadDocument) => model<InsertEntity>(doc, 'INSERT');
const images = (doc: CadDocument) => model<ImageEntity>(doc, 'IMAGE');
const underlays = (doc: CadDocument) => model<UnderlayEntity>(doc, 'PDFUNDERLAY');
const mtexts = (doc: CadDocument) => model<MTextEntity>(doc, 'MTEXT');

describe('XATTACH·IMAGEATTACH·PDFATTACH·FIELD의 현재 고도(210차)', () => {
  it('XATTACH: 고도 3에서 외부 참조 삽입점 (10, 20, 3)(전에는 Z 0), 축척·회전은 그대로, 명령 취소 한 번이면 없다', async () => {
    const h = setup(3);
    await xattach(h, '10,20');
    const [x] = xrefs(h.doc);
    expect(x!.block).toBe('site');
    expect(xyz(x!.insert)).toEqual([10, 20, 3]);
    expect(x!.scale).toEqual({ x: 1, y: 1, z: 1 });
    expect(x!.rotation).toBe(0);
    expect(h.st.session.undoTop()?.label).toBe('XATTACH');
    h.st.session.undo();
    expect(xrefs(h.doc)).toHaveLength(0);
  });

  it('IMAGEATTACH: 고도 −2에서 찍은 이미지 삽입점 (10, 20, −2)(전에는 Z 0), U·V 벡터는 그대로, 명령 취소 한 번이면 없다', async () => {
    const h = setup(-2);
    await imageattach(h, '10,20');
    const [img] = images(h.doc);
    expect(xyz(img!.insert)).toEqual([10, 20, -2]);
    // 폭 1(축척 1) ÷ 400화소 = 화소 하나 0.0025
    expect(xyz(img!.uVector)).toEqual([0.0025, 0, 0]);
    expect(xyz(img!.vVector)).toEqual([0, 0.0025, 0]);
    expect(h.st.session.undoTop()?.label).toBe('IMAGEATTACH');
    h.st.session.undo();
    expect(images(h.doc)).toHaveLength(0);
  });

  it('IMAGEATTACH: 「삽입점 지정 <0,0>」 Enter는 도움말의 기본 삽입점 0,0,0 그대로(고도 5에서도 Z 0)', async () => {
    const h = setup(5);
    await imageattach(h, '');
    expect(xyz(images(h.doc)[0]!.insert)).toEqual([0, 0, 0]);
  });

  it('PDFATTACH: 고도 1.5에서 언더레이 삽입점 (10, 20, 1.5)(전에는 Z 0), 축척(밀리미터 도면 1인치 = 25.4)은 그대로, 명령 취소 한 번이면 없다', async () => {
    const h = setup(1.5);
    await pdfattach(h, '10,20');
    const [u] = underlays(h.doc);
    expect(xyz(u!.insert)).toEqual([10, 20, 1.5]);
    expect(u!.scale.x).toBeCloseTo(25.4, 9);
    expect(h.st.session.undoTop()?.label).toBe('PDFATTACH');
    h.st.session.undo();
    expect(underlays(h.doc)).toHaveLength(0);
  });

  it('FIELD: 고도 −4에서 새 여러 줄 문자 삽입점 (10, 20, −4)(전에는 Z 0), 명령 취소 한 번이면 없다', async () => {
    const h = setup(-4);
    await field(h, '10,20');
    const [m] = mtexts(h.doc);
    expect(xyz(m!.insert)).toEqual([10, 20, -4]);
    expect(h.st.session.undoTop()?.label).toBe('FIELD');
    h.st.session.undo();
    expect(mtexts(h.doc)).toHaveLength(0);
  });

  it('전과 같은 값: 고도가 없는 도면의 XATTACH·IMAGEATTACH·PDFATTACH·FIELD 삽입점은 Z 0', async () => {
    const h = setup();
    await xattach(h, '10,20');
    await imageattach(h, '30,40');
    await pdfattach(h, '50,60');
    await field(h, '70,80');
    expect(xyz(xrefs(h.doc)[0]!.insert)).toEqual([10, 20, 0]);
    expect(xyz(images(h.doc)[0]!.insert)).toEqual([30, 40, 0]);
    expect(xyz(underlays(h.doc)[0]!.insert)).toEqual([50, 60, 0]);
    expect(xyz(mtexts(h.doc)[0]!.insert)).toEqual([70, 80, 0]);
  });

  it('DWG·DXF로 쓰고 다시 읽어도 같은 Z(INSERT·IMAGE·MTEXT 10 — AC1015·AC1032, PDF 언더레이는 AC1024 이상에만 쓰임 — AC1032)', async () => {
    const h = setup(4);
    await xattach(h, '10,20');
    await imageattach(h, '30,40');
    await pdfattach(h, '50,60');
    await field(h, '70,80');
    const pick = (doc: CadDocument) => ({
      xref: xyz(xrefs(doc)[0]?.insert),
      image: xyz(images(doc)[0]?.insert),
      mtext: xyz(mtexts(doc)[0]?.insert),
    });
    const want = { xref: [10, 20, 4], image: [30, 40, 4], mtext: [70, 80, 4] };
    expect(pick(h.doc)).toEqual(want);
    expect(xyz(underlays(h.doc)[0]?.insert)).toEqual([50, 60, 4]);
    for (const version of ['AC1015', 'AC1032'] as const) {
      expect(pick(readDwg(writeDwg(h.doc, { version }).data)), `DWG ${version}`).toEqual(want);
      expect(pick(readDxf(writeDxf(h.doc, { version }).data)), `DXF ${version}`).toEqual(want);
    }
    expect(xyz(underlays(readDwg(writeDwg(h.doc, { version: 'AC1032' }).data))[0]?.insert), 'DWG AC1032 언더레이').toEqual([50, 60, 4]);
    expect(xyz(underlays(readDxf(writeDxf(h.doc, { version: 'AC1032' }).data))[0]?.insert), 'DXF AC1032 언더레이').toEqual([50, 60, 4]);
  });
});
