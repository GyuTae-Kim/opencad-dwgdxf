/**
 * 75차: 연관 배열이 원본의 치수를 복사하며 만드는 딸린 치수 블록(*D)에 핸들·블록 레코드를 준다.
 * 전에는 블록 정의만 넣어 블록 안 객체의 핸들이 모두 ''(핸들 색인 한 칸에 겹침)이고 블록 레코드가 없었다(편집 불변식 훑기에서 찾음).
 * 저장할 때는 쓰기가 핸들·레코드를 메워 파일은 같았다.
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { MODEL_SPACE, tableKey, type CadDocument } from '../../src/core/model';
import { setArrayAssociativity } from '../../src/app/assocarray';
import { registerDrawCommands } from '../../src/app/draw';
import { registerModifyCommands } from '../../src/app/modify';
import { readDxf } from '../../src/io/dxf/reader';
import { makeHarness } from '../cmds2/harness';
import { runWith } from '../drawmod/ctx';
import { perCommandGroups } from '../drawmod/groups';

const SAMPLE = readFileSync(new URL('../../public/samples/opencad-sample.dxf', import.meta.url));

function harness() {
  const h = perCommandGroups(makeHarness((doc) => void Object.assign(doc, readDxf(new Uint8Array(SAMPLE)))));
  registerDrawCommands(h.app);
  registerModifyCommands(h.app);
  return h;
}

/** 두 자리에 든 핸들·빈 핸들, 핸들 색인이 블록 안의 그 객체가 아닌 것, 레코드가 없는 블록 */
function audit(doc: CadDocument) {
  const seen = new Set<string>();
  let dup = 0;
  let empty = 0;
  let mismatch = 0;
  for (const b of doc.blocks.values())
    for (const e of b.entities) {
      if (!e.handle) empty++;
      if (seen.has(e.handle)) dup++;
      seen.add(e.handle);
      if (doc.entityIndex.get(e.handle) !== e) mismatch++;
    }
  const noRecord = [...doc.blocks.keys()].filter((k) => !doc.blockRecords.has(k));
  return { dup, empty, mismatch, noRecord, blocks: doc.blocks.size, index: doc.entityIndex.size };
}

afterEach(() => setArrayAssociativity(true));

describe('연관 배열의 딸린 치수 블록', () => {
  it('ARRAYRECT: 치수 블록 객체에 핸들·소유자, 블록 레코드가 생기고 명령 취소로 돌아온다', async () => {
    setArrayAssociativity(true);
    const h = harness();
    const before = audit(h.doc);
    expect(before).toMatchObject({ dup: 0, empty: 0, mismatch: 0, noRecord: [] });
    const dims0 = [...h.doc.blocks.keys()].filter((k) => /^\*D\d+$/.test(k));
    const mark = h.st.session.undoTop();
    await runWith(h, 'ARRAYRECT', [{ sel: h.doc.blocks.get(MODEL_SPACE)!.entities.map((e) => e.handle) }, '']);
    const made = [...h.doc.blocks.keys()].filter((k) => /^\*D\d+$/.test(k) && !dims0.includes(k));
    // 견본의 치수 8개를 배열 원본 블록에 복사했다
    expect(made.length).toBe(8);
    expect(audit(h.doc)).toMatchObject({ dup: 0, empty: 0, mismatch: 0, noRecord: [] });
    for (const k of made) {
      const def = h.doc.blocks.get(k)!;
      const rec = h.doc.blockRecords.get(tableKey(def.name))!;
      expect([!!def.handle, def.recordHandle, def.entities.every((e) => e.owner === rec.handle)]).toEqual([true, rec.handle, true]);
    }
    while (h.st.session.undoTop() !== mark) h.st.session.undo();
    expect(audit(h.doc)).toEqual(before);
  });
});
