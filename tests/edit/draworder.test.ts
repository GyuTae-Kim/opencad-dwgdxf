/**
 * 그리기 순서 표(ACAD_SORTENTS)가 있는 블록에서 DRAWORDER·해치 넣기가 화면 순서를 바꾼다(전에는 목록만 바꿔 효과가 없었다).
 * 표는 같은 편집 단계에서 고치고(명령 취소 한 번에 돌아온다), 렌더러의 순서(SceneBuilder.ordered)와 drawOrder가 같다.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CadDocument, DictionaryObject, Entity, SortEntsTableObject } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
import { readDwg } from '../../src/io/dwg';
import { SceneBuilder } from '../../src/render/build';
import { TextEngine } from '../../src/text/layout';
import { DocState } from '../../src/app/docstate';
import { EditSession } from '../../src/edit/session';
import { reorder } from '../../src/app/editcmds';
import { drawOrder, sortentsInsertOp, sortentsTable } from '../../src/edit/draworder';
import { FIXTURES } from '../oracle/ezdxf';
import { line, newDoc } from './make';

function rendered(doc: CadDocument, key: string): string[] {
  const b = doc.blocks.get(key)!;
  return ((new SceneBuilder(doc, { text: new TextEngine(null) }) as unknown as { ordered(b: unknown): Entity[] }).ordered(b)).map((e) => e.handle);
}

/** 모형 공간에 선 넷과, 표로 순서를 뒤집어 둔 그리기 순서 표 */
function docWithTable() {
  const doc = newDoc();
  const ms = doc.blocks.get(MODEL_SPACE)!;
  const ents = [0, 1, 2, 3].map((i) => {
    const e = line(0, i, 10, i);
    e.handle = (0x100 + i).toString(16).toUpperCase();
    return e;
  });
  ms.entities.push(...ents);
  for (const e of ents) doc.entityIndex.set(e.handle, e);
  // 101(선 1)을 맨 앞으로 보낸 표: 101 → 정렬 키 104
  const dict: DictionaryObject = { type: 'DICTIONARY', handle: 'D1', entries: new Map([['ACAD_SORTENTS', 'D2']]), hardOwner: false, cloning: 1 };
  const table: SortEntsTableObject = { type: 'SORTENTSTABLE', handle: 'D2', owner: 'D1', blockRecord: ms.recordHandle, entries: [{ entity: '101', sort: '104' }] };
  doc.objects.set('D1', dict);
  doc.objects.set('D2', table);
  doc.blockRecords.set(MODEL_SPACE, { name: '*Model_Space', handle: ms.recordHandle, flags: 0, insertUnits: 0, explodable: true, scalable: true, xdict: 'D1' });
  const st = new DocState(1, doc, 't.dwg', 0, 0);
  st.session = new EditSession(doc, () => {});
  const app = { active: st, cmd: { print() {} } } as never;
  return { doc, st, app, ents };
}

describe('그리기 순서 표', () => {
  it('표가 있으면 표 순서로 그린다(렌더러와 drawOrder가 같다)', () => {
    const { doc } = docWithTable();
    expect(drawOrder(doc, MODEL_SPACE).map((e) => e.handle)).toEqual(['100', '102', '103', '101']);
    expect(rendered(doc, MODEL_SPACE)).toEqual(['100', '102', '103', '101']);
  });
  it('DRAWORDER 맨 뒤로: 화면 맨 앞이던 객체가 맨 뒤로, 명령 취소 한 번에 돌아온다', () => {
    const { doc, st, app } = docWithTable();
    expect(reorder(app, ['101'], 'B', [])).toBe(1);
    expect(rendered(doc, MODEL_SPACE)).toEqual(['101', '100', '102', '103']);
    st.session.undo();
    expect(rendered(doc, MODEL_SPACE)).toEqual(['100', '102', '103', '101']);
    expect(sortentsTable(doc, MODEL_SPACE)!.entries).toEqual([{ entity: '101', sort: '104' }]);
  });
  it('맨 앞(F)·참조 아래(U)는 화면 순서 기준', () => {
    const { doc, app } = docWithTable();
    reorder(app, ['100'], 'F', []);
    expect(rendered(doc, MODEL_SPACE)).toEqual(['102', '103', '101', '100']);
    reorder(app, ['103'], 'U', ['102']);
    expect(rendered(doc, MODEL_SPACE)).toEqual(['103', '102', '101', '100']);
  });
  it('새 객체를 화면 순서의 자리에 넣는 표 바꾸기(해치를 경계 뒤로)', () => {
    const { doc, st } = docWithTable();
    const hatch = line(0, 0, 1, 1);
    hatch.handle = '200';
    const op = sortentsInsertOp(doc, MODEL_SPACE, hatch, 0)!;
    st.session.commit({ label: 'T', ops: [{ kind: 'add', block: MODEL_SPACE, entity: hatch }, op] });
    expect(rendered(doc, MODEL_SPACE)[0]).toBe('200');
  });
  it('표가 없으면 목록 순서만 바꾼다', () => {
    const doc = newDoc();
    const ms = doc.blocks.get(MODEL_SPACE)!;
    const ents = [line(0, 0, 1, 0), line(0, 1, 1, 1)];
    ms.entities.push(...ents);
    for (const e of ents) doc.entityIndex.set(e.handle, e);
    const st = new DocState(1, doc, 't.dxf', 0, 0);
    st.session = new EditSession(doc, () => {});
    reorder({ active: st, cmd: { print() {} } } as never, [ents[1]!.handle], 'B', []);
    expect(rendered(doc, MODEL_SPACE)).toEqual([ents[1]!.handle, ents[0]!.handle]);
    expect(sortentsTable(doc, MODEL_SPACE)).toBeNull();
  });
});

const ARCH = join(FIXTURES, 'all-samples/Architectural - Metric.dwg');
describe.skipIf(!existsSync(ARCH))('AutoCAD 도면의 그리기 순서 표', () => {
  it('표가 있는 블록에서 맨 뒤로 보낸 선이 실제로 맨 뒤에 그려진다', () => {
    const doc = readDwg(new Uint8Array(readFileSync(ARCH)));
    let key = '';
    for (const [k, b] of doc.blocks) if (b.entities.length > 3 && sortentsTable(doc, k)?.entries.length) key ||= k;
    expect(key).not.toBe('');
    const st = new DocState(1, doc, 'a.dwg', 0, 0);
    st.session = new EditSession(doc, () => {});
    const before = rendered(doc, key);
    const target = before.at(-1)!;
    // 블록 안 객체도 소유 블록을 찾는다
    expect(reorder({ active: st, cmd: { print() {} } } as never, [target], 'B', [])).toBe(1);
    expect(rendered(doc, key)[0]).toBe(target);
    expect(rendered(doc, key).slice(1)).toEqual(before.slice(0, -1));
  });
});
