// @vitest-environment jsdom
/**
 * 블록 내용 다중 지시선의 속성 값(풍선 번호 등):
 * - 그리기: 블록의 ATTDEF 자리에 지시선이 가진 값을 그린다(전에는 빈 원만 그렸다)
 * - 만들기: 블록에 속성 정의가 있으면 INSERT처럼 값을 묻고(ATTDIA 0이면 명령행) 지시선에 둔다
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AttribEntity, BlockDef, CadDocument, Entity, MLeaderEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { buildSpace } from '../../src/render/build';
import { TextEngine } from '../../src/text/layout';
import { registerAnnotateCommands, mleaderSession, makeMLeader } from '../../src/app/annotate';
import { setBrowserSysvar } from '../../src/app/sysvars';
import { makeApp, settle } from '../polish/real-app';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../polish/fakes')).FakeCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));

HTMLCanvasElement.prototype.getContext = (() => null) as never;
afterEach(() => document.body.replaceChildren());

/** 원과 속성 정의(TAGNO)가 든 풍선 블록 */
function addTagBlock(doc: CadDocument, h: () => string): { def: BlockDef; attdef: AttribEntity } {
  const rec = h();
  const attdef = { ...entityDefaults(), handle: h(), type: 'ATTDEF', insert: { x: 0, y: 0, z: 0 }, alignPoint: { x: 0, y: 0, z: 0 }, height: 3, text: '?', rotation: 0, widthFactor: 1, oblique: 0, style: 'Standard', generation: 0, halign: 1, valign: 2, tag: 'TAGNO', prompt: '번호', attFlags: 0 } as unknown as AttribEntity;
  const def: BlockDef = { name: 'TAGBALL', handle: h(), recordHandle: rec, basePoint: { x: 0, y: 0, z: 0 }, flags: 2, entities: [{ ...entityDefaults(), handle: h(), type: 'CIRCLE', center: { x: 0, y: 0, z: 0 }, radius: 4 } as Entity, attdef], endHandle: h() };
  doc.blocks.set('TAGBALL', def);
  doc.blockRecords.set('TAGBALL', { name: 'TAGBALL', handle: rec, flags: 0, insertUnits: 0, explodable: true, scalable: true });
  return { def, attdef };
}

const glyphCount = (doc: CadDocument) => buildSpace(doc, MODEL_SPACE, { text: new TextEngine(null) }).list.glyphs.instanceCount;

describe('블록 내용 다중 지시선의 속성 값', () => {
  it('값이 있으면 그 글자를 그린다', () => {
    const h = makeApp();
    let seq = 0x5000;
    const hh = () => (seq++).toString(16).toUpperCase();
    const { attdef } = addTagBlock(h.doc, hh);
    const s = mleaderSession(h.doc);
    s.content = 'B';
    s.block = 'TAGBALL';
    const m = makeMLeader(h.app, { x: 0, y: 0 }, { x: 20, y: 10 }, '', 3, s, { block: 'TAGBALL' });
    m.handle = hh();
    h.doc.blocks.get(MODEL_SPACE)!.entities.push(m);
    h.doc.entityIndex.set(m.handle, m);
    const none = glyphCount(h.doc);
    m.blockAttributes = [{ attdefHandle: attdef.handle, index: 0, width: 0, text: '12' }];
    expect(glyphCount(h.doc)).toBe(none + 2);
    // 상수 속성은 블록 내용이 그리므로 값으로 또 그리지 않는다
    attdef.attFlags = 2;
    expect(glyphCount(h.doc)).toBe(none + 1);
  });

  it('MLEADER로 만들 때 속성 값을 묻는다(ATTDIA 0: 명령행)', async () => {
    const h = makeApp();
    let seq = 0x6000;
    const hh = () => (seq++).toString(16).toUpperCase();
    addTagBlock(h.doc, hh);
    registerAnnotateCommands(h.app);
    setBrowserSysvar('ATTDIA', 0);
    try {
      const s = mleaderSession(h.doc);
      s.content = 'B';
      s.block = 'TAGBALL';
      void h.app.run('MLEADER');
      await settle();
      for (const t of ['0,0', '20,10', '7']) {
        h.app.submitInput(t);
        await settle();
      }
      const m = [...h.doc.entityIndex.values()].find((x): x is MLeaderEntity => x.type === 'MULTILEADER')!;
      expect(m.contentType).toBe(1);
      expect(m.blockAttributes).toEqual([expect.objectContaining({ text: '7', index: 0 })]);
    } finally {
      setBrowserSysvar('ATTDIA', 1);
    }
  });
});
