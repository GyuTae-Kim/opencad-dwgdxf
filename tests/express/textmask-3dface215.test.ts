// @vitest-environment jsdom
/**
 * 215차: TEXTMASK 가리기 유형 3D 면(3). Autodesk TEXTMASK 도움말(Express Tools)은 가리기 유형으로 가리기(Wipeout)·3D 면(3dface)·솔리드를 적고,
 * 3D 면은 모서리를 모두 숨긴 3D 면이라 숨기기로 플롯할 때 가리고 화면에서는 가려 보이지 않는다고 적는다.
 * 전에는 가리기 유형에서 3을 치면 「3D 면 가리기는 숨기기(HIDE) 표시가 필요해 이 웹 버전에서 쓸 수 없습니다. …」를 알리고 유형을 바꾸지 않았다.
 * 이제 가리기·솔리드와 같은 가리개 사각형(문자 상자 + 간격띄우기 비율 × 높이, 문자 평면의 Z)으로 3DFACE(숨긴 모서리 70 = 15, 색 ByLayer —
 * 도움말이 색을 적지 않아 가리기와 같은 바탕)를 만들고, 문자 바로 뒤에 두고 문자와 그룹으로 묶는다(짝 기록 종류 3dface).
 * 가리기(W)·솔리드(S)는 전과 같은 값이다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CadDocument, Entity, FaceEntity, TextEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults, normalizeHandle } from '../../src/core/model';
import { registerExpressTextCommands } from '../../src/app/express-text';
import { maskPolygon, readMaskLink } from '../../src/edit/express/textmask';
import { textBox } from '../../src/edit/express/textbox';
import { groupsContaining } from '../../src/edit/util/groups';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { translate } from '../../site/i18n.mjs';
import { makeApp, settle } from '../polish/real-app';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../polish/fakes')).FakeCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));

afterEach(() => document.body.replaceChildren());

const TYPE_PROMPT = '가리기에 사용할 객체 유형 지정 [가리기(W)/3D 면(3)/솔리드(S)]';
const REFUSED = '3D 면 가리기는';

/** 고도 3의 문자 하나(높이 2, (10, 20, 3))를 모형 공간에 둔다 */
function setup() {
  const h = makeApp();
  registerExpressTextCommands(h.app);
  const s = h.st.session;
  const text: TextEntity = {
    ...entityDefaults(),
    type: 'TEXT',
    handle: s.newHandle(),
    owner: h.doc.blocks.get(MODEL_SPACE)?.recordHandle,
    insert: { x: 10, y: 20, z: 3 },
    height: 2,
    text: 'ABC',
    rotation: 0,
    widthFactor: 1,
    oblique: 0,
    style: 'Standard',
    generation: 0,
    halign: 0,
    valign: 0,
  };
  s.commit({ label: 'seed', ops: [{ kind: 'add', block: h.st.space, entity: text }] });
  // 객체 선택은 이전(P)으로 고른다 — 가짜 화면에는 장면이 없어 전체(ALL)가 아무것도 찾지 못한다. 명령이 Enter로 고르기를 끝내면 이전 선택이 그 선택이 된다
  h.app.lastSelection = [text.handle];
  // 물은 프롬프트(Enter로 답한 것도 남는다)
  const asked: string[] = [];
  h.cmd.watchers.add({ prompt: (t: string) => asked.push(t.replace(/[⁨⁩]/g, '')) });
  return { ...h, text, asked };
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
const faces = (doc: CadDocument) => model<FaceEntity>(doc, '3DFACE');
const textOf = (doc: CadDocument) => model<TextEntity>(doc, 'TEXT')[0]!;
const r6 = (v: number) => +v.toFixed(6);
const pts = (f: FaceEntity) => f.points.map((p) => [r6(p.x), r6(p.y), r6(p.z)]);
const refused = (h: H) => h.out().filter((l) => l.includes(REFUSED));

describe('TEXTMASK 가리기 유형 3D 면(215차)', () => {
  it('3이면 모서리를 모두 숨긴 3D 면(70 = 15)을 가리개 사각형·문자 평면 Z 3에 만들어 문자 뒤에 두고 그룹으로 묶으며, 명령 취소 한 번이면 없다', async () => {
    const h = setup();
    // 가리기 유형(M) → 3, 이전 선택(문자), Enter
    await run(h, 'TEXTMASK', ['M', '3', 'P', '']);
    expect(refused(h)).toEqual([]);
    expect(h.out()).toContain('현재 설정: 간격띄우기 비율 = 0.35, 가리기 유형 = 3D 면');
    expect(h.out()).toContain('문자 1개를 3D 면(으)로 가렸습니다.');
    const list = faces(h.doc);
    expect(list).toHaveLength(1);
    const f = list[0]!;
    // 문자 상자를 0.35 × 높이 2 = 0.7만큼 넓힌 사각형(회전 0 — 왼쪽 아래부터 반시계, 3DFACE는 둘레 차례)
    const b = textBox(h.text, h.doc)!;
    expect(pts(f)).toEqual([
      [r6(b.o.x - 0.7), r6(b.o.y - 0.7), 3],
      [r6(b.o.x + b.w + 0.7), r6(b.o.y - 0.7), 3],
      [r6(b.o.x + b.w + 0.7), r6(b.o.y + b.h + 0.7), 3],
      [r6(b.o.x - 0.7), r6(b.o.y + b.h + 0.7), 3],
    ]);
    expect(pts(f)).toEqual(maskPolygon(h.text, 0.35, h.doc)!.map((p) => [r6(p.x), r6(p.y), 3]));
    expect(f).toMatchObject({ invisibleEdges: 15, layer: '0', color: { aci: 256 } });
    // 그리기 순서: 가리개가 문자 바로 앞(문자 뒤에 그려짐)
    const ents = h.doc.blocks.get(MODEL_SPACE)!.entities;
    expect(ents.indexOf(f)).toBe(ents.findIndex((e) => e.handle === h.text.handle) - 1);
    expect(readMaskLink(textOf(h.doc))).toMatchObject({ type: '3dface', offset: 0.35, mask: normalizeHandle(f.handle) });
    expect(groupsContaining(h.doc, f.handle).map((g) => g.group.entities.map(normalizeHandle).sort())).toEqual([
      [normalizeHandle(f.handle), normalizeHandle(h.text.handle)].sort(),
    ]);
    expect(h.st.session.undoTop()?.label).toBe('TEXTMASK');
    h.st.session.undo();
    expect(faces(h.doc)).toHaveLength(0);
    expect(readMaskLink(textOf(h.doc))).toBeNull();
    expect(groupsContaining(h.doc, h.text.handle)).toEqual([]);
  });

  it('고른 3D 면은 다음 가리기 유형 프롬프트의 기본값(<3D 면>)이고, 다시 가리면 옛 3D 면을 지우고 새로 만들며, TEXTUNMASK가 지운다', async () => {
    const h = setup();
    await run(h, 'TEXTMASK', ['M', '3', 'P', '']);
    const first = faces(h.doc)[0]?.handle;
    expect(first).toBeDefined();
    // 가리기 유형에서 Enter = 지금 유형(3D 면). 고른 것에 가리개(3DFACE)가 섞여도 가리개는 대상이 아니다
    await run(h, 'TEXTMASK', ['M', '', 'P', '']);
    expect(h.asked).toContain(`${TYPE_PROMPT} <3D 면>:`);
    expect(refused(h)).toEqual([]);
    const now = faces(h.doc);
    expect(now).toHaveLength(1);
    expect(now[0]!.handle).not.toBe(first);
    expect(readMaskLink(textOf(h.doc))).toMatchObject({ type: '3dface', mask: normalizeHandle(now[0]!.handle) });
    await run(h, 'TEXTUNMASK', ['P', '']);
    expect(faces(h.doc)).toHaveLength(0);
    expect(readMaskLink(textOf(h.doc))).toBeNull();
    expect(groupsContaining(h.doc, h.text.handle)).toEqual([]);
  });

  it('전과 같은 값: 가리기(W)는 WIPEOUT, 솔리드(S)는 색 8의 SOLID(점 차례 1·2·4·3)로 같은 사각형이고 3D 면은 없다', async () => {
    const h = setup();
    const poly = maskPolygon(h.text, 0.35, h.doc)!;
    await run(h, 'TEXTMASK', ['M', 'W', 'P', '']);
    const [w] = model<Entity & { insert: { x: number; y: number; z: number } }>(h.doc, 'WIPEOUT');
    expect(w).toBeDefined();
    expect([r6(w!.insert.x), r6(w!.insert.y), w!.insert.z]).toEqual([r6(poly[0]!.x), r6(poly[0]!.y), 3]);
    expect(readMaskLink(textOf(h.doc))).toMatchObject({ type: 'wipeout', mask: normalizeHandle(w!.handle) });
    // 솔리드(S), 배경 색상 번호 Enter(<8>)
    await run(h, 'TEXTMASK', ['M', 'S', '', 'P', '']);
    expect(model(h.doc, 'WIPEOUT')).toHaveLength(0);
    const [s] = model<FaceEntity>(h.doc, 'SOLID');
    expect(s!.color.aci).toBe(8);
    expect(pts(s!)).toEqual([poly[0]!, poly[1]!, poly[3]!, poly[2]!].map((p) => [r6(p.x), r6(p.y), 3]));
    expect(readMaskLink(textOf(h.doc))).toMatchObject({ type: 'solid', mask: normalizeHandle(s!.handle) });
    expect(faces(h.doc)).toHaveLength(0);
    expect(refused(h)).toEqual([]);
  });

  it('DWG·DXF로 쓰고 다시 읽어도 3D 면 가리개의 네 점·숨긴 모서리 15·도면층과 문자의 짝 기록(3dface, 0.35, 그 3D 면)이 같다', async () => {
    const h = setup();
    await run(h, 'TEXTMASK', ['M', '3', 'P', '']);
    const pick = (doc: CadDocument) => {
      const f = faces(doc)[0];
      const l = readMaskLink(textOf(doc));
      return {
        points: f && pts(f),
        edges: f?.invisibleEdges,
        layer: f?.layer,
        link: l && { type: l.type, offset: l.offset, same: !!f && l.mask === normalizeHandle(f.handle) },
      };
    };
    const want = pick(h.doc);
    expect(want).toMatchObject({ edges: 15, layer: '0', link: { type: '3dface', offset: 0.35, same: true } });
    expect(want.points).toHaveLength(4);
    for (const version of ['AC1015', 'AC1032'] as const) {
      expect(pick(readDwg(writeDwg(h.doc, { version }).data)), `DWG ${version}`).toEqual(want);
      expect(pick(readDxf(writeDxf(h.doc, { version }).data)), `DXF ${version}`).toEqual(want);
    }
  });

  it('3D 면이 든 명령행 글이 네 언어 사전에 있다(현재 설정·유형 프롬프트와 그 조각·결과 글)', () => {
    const lines = [
      '현재 설정: 간격띄우기 비율 = 0.35, 가리기 유형 = 3D 면',
      `${TYPE_PROMPT} <3D 면>:`,
      '] <3D 면>:',
      '문자 3개를 3D 면(으)로 가렸습니다.',
    ];
    const left = ['en', 'de', 'ja', 'zh-CN'].flatMap((l) => lines.map((s) => `${l}: ${translate(s, l)}`)).filter((s) => /[가-힣]/.test(s));
    expect(left).toEqual([]);
    expect(translate(`${TYPE_PROMPT} <3D 면>:`, 'en')).toBe('Specify object type to use for masking [Wipeout (W)/3D Face (3)/Solid (S)] <3D Face>:');
    expect(translate('문자 3개를 3D 면(으)로 가렸습니다.', 'en')).toBe('Masked 3 text objects with 3D faces.');
    // 3D 면 낱말은 TEXTMASK 도움말 언어별 이름(3D-Fläche·三维面 — 117차와 같다)
    expect(translate('문자 3개를 3D 면(으)로 가렸습니다.', 'de')).toContain('3D-Flächen');
    expect(translate('현재 설정: 간격띄우기 비율 = 0.35, 가리기 유형 = 3D 면', 'zh-CN')).toContain('三维面');
  });
});
