/**
 * PURGE·-PURGE: 다중 지시선·테이블·다중선 스타일, 빈 그룹, 등록된 응용프로그램, 0 길이 형상과 빈 문자 객체(대화상자).
 * MATCHPROP 설정(S): 고른 특성만 옮긴다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const { formAnswers } = vi.hoisted(() => ({ formAnswers: [] as (Record<string, boolean> | null)[] }));
vi.mock('../../src/app/ui/dom', async (orig) => ({
  ...(await orig<object>()),
  form: vi.fn(async () => formAnswers.shift() ?? null),
}));

import type { CadDocument, DictionaryObject, Entity, GroupObject } from '../../src/core/model';
import { MODEL_SPACE, normalizeHandle } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { namedDictionary } from '../../src/edit/layertools/clone';
import { purgeNamedOps, purgeableNamed, purgeableRegApps } from '../../src/edit/purge';
import { registerEditCommands, setMatchSettings, MATCH_SETTINGS } from '../../src/app/editcmds';
import { registerDashTableCommands } from '../../src/app/dashcmds-tables';
import { makeHarness } from '../cmds2/harness';
import { line, text } from './make';

/** 새 도면(루트 사전·Standard 스타일들) + 쓰지 않는 스타일·그룹·응용프로그램 */
function fill(doc: CadDocument): { used: string; extra: string; group: string; ml: string } {
  Object.assign(doc, createNewDocument('metric'));
  let n = 0x900;
  const H = () => (n++).toString(16).toUpperCase();
  const add = (dictName: string, name: string, obj: Record<string, unknown>) => {
    const d = namedDictionary(doc, dictName)!;
    const h = H();
    doc.objects.set(h, { ...obj, handle: h, owner: d.handle } as never);
    d.entries.set(name, h);
    return h;
  };
  const extra = add('ACAD_MLEADERSTYLE', 'Extra', { type: 'MLEADERSTYLE', name: 'Extra' });
  const used = add('ACAD_MLEADERSTYLE', 'Used', { type: 'MLEADERSTYLE', name: 'Used' });
  const ml = add('ACAD_MLINESTYLE', 'Double', { type: 'MLINESTYLE', name: 'Double' });
  add('ACAD_MLINESTYLE', 'Kept', { type: 'MLINESTYLE', name: 'Kept' });
  const group = add('ACAD_GROUP', 'EMPTY', { type: 'GROUP', description: '', unnamed: false, selectable: true, entities: ['DEAD'] });
  add('ACAD_GROUP', 'FULL', { type: 'GROUP', description: '', unnamed: false, selectable: true, entities: ['A10'] });
  const ms = doc.blocks.get(MODEL_SPACE)!;
  const l = { ...line(0, 0, 1, 0), handle: 'A10', xdata: [{ app: 'USEDAPP', items: [] }] } as Entity;
  const leader = { ...line(0, 0, 0, 1), type: 'MULTILEADER', handle: 'A11', styleHandle: used } as unknown as Entity;
  const mline = { ...line(0, 0, 0, 1), type: 'MLINE', handle: 'A12', styleName: 'Kept', vertices: [] } as unknown as Entity;
  for (const e of [l, leader, mline]) {
    ms.entities.push(e);
    doc.entityIndex.set(e.handle, e);
  }
  for (const nm of ['MYAPP', 'USEDAPP']) doc.appIds.set(nm, { name: nm, handle: H(), flags: 0 });
  return { used, extra, group, ml };
}

describe('소거 대상 찾기', () => {
  it('쓰지 않는 다중 지시선·다중선 스타일과 빈 그룹, 등록된 응용프로그램', () => {
    const doc = createNewDocument('metric');
    const ids = fill(doc);
    const found = purgeableNamed(doc);
    expect(found.mleaderStyles.map((x) => x.name)).toEqual(['Extra']);
    expect(found.mlineStyles.map((x) => x.name)).toEqual(['Double']);
    expect(found.groups.map((x) => x.name)).toEqual(['EMPTY']);
    expect(found.tableStyles).toEqual([]);
    const apps = purgeableRegApps(doc);
    expect(apps).toContain('MYAPP');
    expect(apps).not.toContain('USEDAPP');
    expect(apps).not.toContain('ACAD');
    // 지우면 객체와 사전 항목이 함께 빠진다
    const ops = purgeNamedOps(doc, found.mleaderStyles);
    expect(ops.map((o) => o.kind)).toEqual(['object', 'object']);
    expect(ops[0]).toMatchObject({ key: ids.extra, after: null });
    const dictAfter = (ops[1] as { after: DictionaryObject }).after;
    expect([...dictAfter.entries.keys()]).not.toContain('Extra');
    expect([...dictAfter.entries.keys()]).toContain('Used');
  });
});

function harness() {
  const h = makeHarness((doc) => void fill(doc));
  registerEditCommands(h.app);
  registerDashTableCommands(h.app);
  return h;
}

describe('-PURGE', () => {
  it('등록된 응용프로그램(R)', async () => {
    const h = harness();
    await h.run('-PURGE', ['R', '*', 'N']);
    expect(h.doc.appIds.has('MYAPP')).toBe(false);
    expect(h.doc.appIds.has('USEDAPP')).toBe(true);
    expect(h.printed).toContain('등록된 응용프로그램 "MYAPP"을(를) 삭제하는 중입니다.');
  });
  it('다중 지시선 스타일(MU)·다중선 스타일(M)·그룹(G)', async () => {
    const h = harness();
    const extra = namedDictionary(h.doc, 'ACAD_MLEADERSTYLE')!.entries.get('Extra')!;
    await h.run('-PURGE', ['MU', '*', 'N']);
    expect(h.doc.objects.has(normalizeHandle(extra))).toBe(false);
    expect(namedDictionary(h.doc, 'ACAD_MLEADERSTYLE')!.entries.has('Extra')).toBe(false);
    await h.run('-PURGE', ['M', '*', 'N']);
    expect(namedDictionary(h.doc, 'ACAD_MLINESTYLE')!.entries.has('Double')).toBe(false);
    expect(namedDictionary(h.doc, 'ACAD_MLINESTYLE')!.entries.has('Kept')).toBe(true);
    await h.run('-PURGE', ['G', '*', 'N']);
    expect(namedDictionary(h.doc, 'ACAD_GROUP')!.entries.has('EMPTY')).toBe(false);
    expect((h.doc.objects.get(namedDictionary(h.doc, 'ACAD_GROUP')!.entries.get('FULL')!) as GroupObject).type).toBe('GROUP');
  });
  it('모두(A)도 새 항목을 지운다', async () => {
    const h = harness();
    await h.run('-PURGE', ['A', '*', 'N']);
    expect(h.doc.appIds.has('MYAPP')).toBe(false);
    expect(namedDictionary(h.doc, 'ACAD_MLEADERSTYLE')!.entries.has('Extra')).toBe(false);
  });
  it('재료처럼 다루지 않는 항목은 알린다', async () => {
    const h = harness();
    await h.run('-PURGE', ['MA']);
    expect(h.printed.some((t) => t.includes('재료 소거는 이 웹 버전에서 지원하지 않습니다'))).toBe(true);
  });
});

describe('PURGE 대화상자', () => {
  it('새 항목과 0 길이 형상·빈 문자 객체(고르면)', async () => {
    const h = harness();
    const zero = h.add(line(5, 5, 5, 5));
    const empty = h.add(text(0, 0, '   '));
    formAnswers.push({ regApps: true, mleaderStyles: true, mlineStyles: false, groups: true, zeroEmpty: true });
    await h.run('PURGE', []);
    expect(h.doc.appIds.has('MYAPP')).toBe(false);
    expect(namedDictionary(h.doc, 'ACAD_MLEADERSTYLE')!.entries.has('Extra')).toBe(false);
    expect(namedDictionary(h.doc, 'ACAD_MLINESTYLE')!.entries.has('Double')).toBe(true);
    expect(namedDictionary(h.doc, 'ACAD_GROUP')!.entries.has('EMPTY')).toBe(false);
    expect(h.doc.entityIndex.has(zero.handle)).toBe(false);
    expect(h.doc.entityIndex.has(empty.handle)).toBe(false);
    expect(h.printed).toContain('0 길이 형상과 빈 문자 객체 2개를 지웠습니다.');
  });
  it('0 길이 형상·빈 문자는 기본으로 고르지 않는다', async () => {
    const h = harness();
    const zero = h.add(line(5, 5, 5, 5));
    formAnswers.push({ regApps: true });
    await h.run('PURGE', []);
    expect(h.doc.entityIndex.has(zero.handle)).toBe(true);
  });
});

describe('MATCHPROP 설정(S)', () => {
  afterEach(() => setMatchSettings(new Set(MATCH_SETTINGS.map((m) => m.key))));
  it('끈 특성은 옮기지 않고 설정을 기억한다', async () => {
    const h = harness();
    h.doc.layers.set('A', { ...h.doc.layers.get('0')!, name: 'A', handle: 'B01' });
    const src = h.add({ ...line(0, 0, 1, 0), layer: 'A', color: { aci: 1 } } as Entity);
    const dst = h.add(line(0, 1, 1, 1));
    formAnswers.push({ ...Object.fromEntries(MATCH_SETTINGS.map((m) => [m.key, true])), color: false });
    await h.run('MATCHPROP', [{ pick: src.handle, at: [0.5, 0] }, 'S', { sel: [dst.handle] }, '']);
    const out = h.doc.entityIndex.get(dst.handle)!;
    expect(out.layer).toBe('A');
    expect(out.color).toEqual({ aci: 256 });
    expect(h.printed.at(-1) ?? '').not.toContain('색상');
    // 다음 MATCHPROP도 같은 설정
    const dst2 = h.add(line(0, 2, 1, 2));
    await h.run('MATCHPROP', [{ pick: src.handle, at: [0.5, 0] }, { sel: [dst2.handle] }, '']);
    expect(h.doc.entityIndex.get(dst2.handle)!.color).toEqual({ aci: 256 });
    expect(h.printed.some((t) => t.startsWith('현재 활성 설정: 도면층 선종류'))).toBe(true);
  });
});

describe('PURGE 셀프 리뷰 수정', () => {
  /** 쓰이지 않는 블록 OLD 안에 0 길이 선·빈 문자·보통 선 */
  function withOldBlock() {
    const h = makeHarness((doc) => {
      fill(doc);
      const z = { ...line(1, 1, 1, 1), handle: 'B10', owner: 'B2' } as Entity;
      const t = { ...text(0, 0, '   '), handle: 'B11', owner: 'B2' } as Entity;
      const l = { ...line(0, 0, 5, 0), handle: 'B12', owner: 'B2' } as Entity;
      doc.blocks.set('OLD', { name: 'OLD', handle: 'B1', recordHandle: 'B2', basePoint: { x: 0, y: 0, z: 0 }, flags: 0, entities: [z, t, l], endHandle: 'B3' });
      doc.blockRecords.set('OLD', { name: 'OLD', handle: 'B2', flags: 0, insertUnits: 0, explodable: true, scalable: true });
      for (const e of [z, t, l]) doc.entityIndex.set(e.handle, e);
    });
    registerEditCommands(h.app);
    registerDashTableCommands(h.app);
    return h;
  }
  it('블록과 0 길이·빈 문자를 함께 소거해도 명령 취소(U)·다시 실행이 된다(블록 안 객체는 건드리지 않는다)', async () => {
    const h = withOldBlock();
    const zero = h.add(line(5, 5, 5, 5));
    formAnswers.push({ blocks: true, zeroEmpty: true });
    await h.run('PURGE', []);
    expect(h.doc.blocks.has('OLD')).toBe(false);
    expect(h.doc.entityIndex.has(zero.handle)).toBe(false);
    // 블록 안 0 길이 선·빈 문자는 지운 수에 들지 않는다(블록과 함께 사라질 뿐)
    expect(h.printed).toContain('0 길이 형상과 빈 문자 객체 1개를 지웠습니다.');
    const tx = h.st.session.undo();
    expect(tx?.label).toBe('PURGE');
    expect(h.doc.blocks.get('OLD')!.entities.map((e) => e.handle)).toEqual(['B10', 'B11', 'B12']);
    expect(h.doc.entityIndex.has(zero.handle)).toBe(true);
    expect(h.st.session.canRedo()).toBe(true);
    h.st.session.redo();
    expect(h.doc.blocks.has('OLD')).toBe(false);
    expect(h.doc.entityIndex.has(zero.handle)).toBe(false);
    h.st.session.undo();
    expect(h.doc.blocks.has('OLD')).toBe(true);
  });
  it('0 길이·빈 문자 소거는 모형·배치 공간만(블록 정의 안은 AutoCAD처럼 그대로)', async () => {
    const h = withOldBlock();
    formAnswers.push({ zeroEmpty: true });
    await h.run('PURGE', []);
    expect(h.doc.blocks.get('OLD')!.entities.map((e) => e.handle)).toEqual(['B10', 'B11', 'B12']);
  });
  it('되돌리기가 실패해도 명령 취소 목록과 문서가 어긋나지 않는다', () => {
    const h = withOldBlock();
    const s = h.st.session;
    // 없는 블록에 넣는 작업: 확정하면 실패하고 문서는 그대로
    const l = { ...line(0, 0, 1, 1), handle: 'C1' } as Entity;
    expect(() => s.commit({ label: 'X', ops: [{ kind: 'add', block: MODEL_SPACE, entity: l }, { kind: 'add', block: 'NOPE', entity: { ...l, handle: 'C2' } }] })).toThrow();
    expect(h.doc.entityIndex.has('C1')).toBe(false);
    expect(s.canUndo()).toBe(false);
    // 되돌릴 때 실패하는 항목(블록을 먼저 지운 뒤 그 안의 객체를 지운 순서)도 목록에 남고 문서는 그대로
    s.commit({ label: 'BAD', ops: [{ kind: 'blockDef', key: 'OLD', before: h.doc.blocks.get('OLD')!, after: null }, { kind: 'remove', block: 'OLD', entity: h.doc.entityIndex.get('B12')!, index: 2 }] });
    expect(() => s.undo()).toThrow();
    expect(h.doc.blocks.has('OLD')).toBe(false);
    expect(s.undoTop()?.label).toBe('BAD');
    expect(s.canRedo()).toBe(false);
  });
  it('부모 치수 스타일이 쓰이면 자식(부모$0~$7)도 쓰인다', async () => {
    const h = makeHarness((doc) => {
      fill(doc);
      const std = doc.dimStyles.get('STANDARD') ?? [...doc.dimStyles.values()][0]!;
      for (const nm of ['ISO-25', 'ISO-25$2', 'ISO-25$3', 'LONE', 'LONE$2', 'KID-ONLY', 'KID-ONLY$4'])
        doc.dimStyles.set(nm.toUpperCase(), { ...structuredClone(std), name: nm, handle: '' });
      const dim = { ...line(0, 0, 1, 0), type: 'DIMENSION', handle: 'D1', dimStyle: 'ISO-25' } as unknown as Entity;
      const kidDim = { ...line(0, 0, 1, 0), type: 'DIMENSION', handle: 'D2', dimStyle: 'KID-ONLY$4' } as unknown as Entity;
      for (const e of [dim, kidDim]) {
        doc.blocks.get(MODEL_SPACE)!.entities.push(e);
        doc.entityIndex.set(e.handle, e);
      }
    });
    const { purgeable } = await import('../../src/app/editcmds');
    const ds = purgeable(h.app).dimStyles;
    expect(ds).not.toContain('ISO-25$2');
    expect(ds).not.toContain('ISO-25$3');
    expect(ds).not.toContain('KID-ONLY');
    expect(ds).toEqual(expect.arrayContaining(['LONE', 'LONE$2']));
  });
  it('현재 다중 지시선·테이블 스타일은 변수 사전(CMLEADERSTYLE·CTABLESTYLE)도 본다', () => {
    const doc = createNewDocument('metric');
    fill(doc);
    let vars = namedDictionary(doc, 'AcDbVariableDictionary');
    if (!vars) {
      vars = { type: 'DICTIONARY', handle: '9EF', owner: doc.rootDictionary, entries: new Map() } as unknown as DictionaryObject;
      doc.objects.set('9EF', vars);
      (doc.objects.get(normalizeHandle(doc.rootDictionary!)) as DictionaryObject).entries.set('AcDbVariableDictionary', '9EF');
    }
    doc.objects.set('9F0', { type: 'DICTIONARYVAR', handle: '9F0', owner: vars.handle, raw: [{ code: 280, value: 0 }, { code: 1, value: 'Extra' }] } as never);
    vars.entries.set('CMLEADERSTYLE', '9F0');
    expect(purgeableNamed(doc).mleaderStyles.map((x) => x.name)).toEqual([]);
  });
  it('스타일을 지우면 그 확장 사전과 사전이 소유한 객체도 지운다(소유자 없는 객체로 남지 않게)', () => {
    const doc = createNewDocument('metric');
    const ids = fill(doc);
    const extra = doc.objects.get(ids.extra)!;
    doc.objects.set('9E0', { type: 'DICTIONARY', handle: '9E0', owner: ids.extra, entries: new Map([['ROUNDTRIP', '9E1']]) } as never);
    doc.objects.set('9E1', { type: 'XRECORD', handle: '9E1', owner: '9E0', data: [] } as never);
    extra.xdict = '9E0';
    const found = purgeableNamed(doc).mleaderStyles;
    const ops = purgeNamedOps(doc, found);
    expect(ops.filter((o) => o.kind === 'object' && !(o as { after: unknown }).after).map((o) => (o as { key: string }).key).sort()).toEqual([ids.extra, '9E0', '9E1'].sort());
  });
});
