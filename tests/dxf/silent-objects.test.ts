/**
 * DXF 쓰기에서 객체가 빠질 때 경고 없이 빠지지 않는지(훑기 품질 지표 silent-object-loss):
 * - 연관 동작의 소유 나무에 DXF로 쓸 수 없는 객체(DWG 원본 비트뿐)가 있으면 동작을 통째로 빼고 object.assoc_dropped로 알린다.
 *   저장 전 확인(saveloss)에도 나온다.
 * - IMAGE가 없는(지운 뒤 남은) IMAGEDEF_REACTOR는 다시 만들지 않고 object.orphan_dropped로 알린다.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, DictionaryObject, GenericObject } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { imageAttachOps } from '../../src/edit/blkcmds/attach';
import { applyOps } from '../../src/edit/session';
import { setup } from '../util2/helpers';
import { createNewDocument } from '../../src/core/newdoc';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { ASSOC_DROPPED } from '../../src/io/dxf/wcontext';
import { saveLosses } from '../../src/app/saveloss';
import { ACTION_V2, DEPENDENCY } from '../assocnet/fixture';

const count = (doc: CadDocument, type: string) => [...doc.objects.values()].filter((o) => o.type === type).length;

function withAction(): CadDocument {
  const doc = createNewDocument('metric');
  const root = doc.objects.get(doc.rootDictionary!) as DictionaryObject;
  root.entries.set('TEST_ASSOC', '2A');
  doc.objects.set('2A', { type: 'ACDBASSOCACTION', handle: '2A', owner: doc.rootDictionary, raw: ACTION_V2 } as GenericObject);
  // 몸체: DWG에서 읽고 풀지 못한 객체(원본 태그 없음)
  doc.objects.set('2B', { type: 'ACDBASSOCARRAYACTIONBODY', handle: '2B', owner: '2A' } as GenericObject);
  doc.objects.set('2C', { type: 'ACDBASSOCDEPENDENCY', handle: '2C', owner: '2A', raw: DEPENDENCY } as GenericObject);
  return doc;
}

describe('DXF 쓰기: 알리지 않고 빠지는 객체', () => {
  it('쓸 수 없는 몸체가 있는 연관 동작은 동작·종속까지 빼고 알린다', () => {
    const r = writeDxf(withAction(), { version: 'AC1032' });
    const back = readDxf(r.data);
    expect(count(back, 'ACDBASSOCACTION')).toBe(0);
    expect(count(back, 'ACDBASSOCDEPENDENCY')).toBe(0);
    const w = r.warnings.find((x) => x.code === 'object.assoc_dropped')!;
    expect(w.message).toBe(ASSOC_DROPPED);
    expect(Object.keys((w.detail as { types: Record<string, number> }).types).sort()).toEqual(['ACDBASSOCACTION', 'ACDBASSOCDEPENDENCY']);
    // 몸체는 내용을 몰라 빠진다고 따로 알린다
    expect(r.warnings.some((x) => x.code === 'object.no_data')).toBe(true);
    const losses = saveLosses(r.warnings);
    expect(losses.find((l) => l.message === ASSOC_DROPPED)).toMatchObject({ count: 2, types: ['ACDBASSOCACTION', 'ACDBASSOCDEPENDENCY'], converted: false });
  });

  it('IMAGE가 없는 IMAGEDEF_REACTOR는 빠진다고 알리고, IMAGE에 이어진 반응자는 그대로 쓴다', () => {
    const t = setup();
    const { handle: _h, ...props } = entityDefaults();
    const r = imageAttachOps(t.doc, { fileName: 'pic.png', widthPx: 40, heightPx: 30, space: MODEL_SPACE, insert: { x: 0, y: 0, z: 0 }, width: 4, rotation: 0, props }, t.h);
    applyOps(t.doc, r.ops);
    const kept = writeDxf(t.doc, { version: 'AC1032' });
    expect(kept.warnings.some((w) => JSON.stringify(w.detail ?? '').includes('IMAGEDEF_REACTOR'))).toBe(false);
    expect(count(readDxf(kept.data), 'IMAGEDEF_REACTOR')).toBe(1);
    // IMAGE를 지우고 반응자만 남은 도면(실제 도면에서 본 꼴)
    applyOps(t.doc, [{ kind: 'remove', block: MODEL_SPACE, entity: r.image, index: -1 }]);
    expect(count(t.doc, 'IMAGEDEF_REACTOR')).toBe(1);
    const orphan = writeDxf(t.doc, { version: 'AC1032' });
    expect(orphan.warnings.find((w) => w.code === 'object.orphan_dropped')?.detail).toMatchObject({ types: { IMAGEDEF_REACTOR: 1 } });
    expect(count(readDxf(orphan.data), 'IMAGEDEF_REACTOR')).toBe(0);
  });
});
