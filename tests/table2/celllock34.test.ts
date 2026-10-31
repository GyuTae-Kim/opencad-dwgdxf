// @vitest-environment jsdom
/**
 * 34차: 셀 잠금(내용 잠금·서식 잠금 — 셀 메뉴 잠금 ▸, 확장 자료, DWG R2010+ 셀 상태)과 잠근 셀의 편집 막기.
 * 근거(우리말 요약):
 * - AutoCAD 도움말 "Table Cell Ribbon Contextual Tab": Cell Format 패널의 Cell Locking — 셀 내용과/또는 서식을 편집하지 못하게 잠그거나 푼다.
 * - "To Unlock Data Extraction Table Cells for Editing": 셀을 고르고 Cell Locking ▸ Unlocked로 편집할 수 있게 푼다.
 * - "About Linking a Table to External Data": 셀을 데이터 바꾸기·서식 바꾸기·둘 다에서 잠글 수 있다.
 * - ActiveX 참조 Table 객체 SetCellState·GetCellState, AcCellState(AutoCAD 2008 API): 내용 잠김 1, 내용 읽기 전용 2, 서식 잠김 4, 서식 읽기 전용 8, 연결 16.
 * - DXF 참조 TABLE에는 셀 잠금 코드가 없다(172 셀 플래그·92 확장 셀 플래그는 비트 뜻이 없다) — DXF 원본 태그로는 읽고 쓰지 않는다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TableEntity } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { CONTENT_LOCKED, FORMAT_LOCKED, editTableAt, editTableInPlace } from '../../src/app/tablecmds';
import { activeEditor } from '../../src/app/textedit/editor';
import { type FindKind, findTargets, replaceTargets } from '../../src/app/textedit/findreplace';
import { Palette } from '../../src/app/ui/palettes';
import {
  LOCK_CONTENT,
  LOCK_FORMAT,
  cellIndex,
  cellLock,
  clearOverrides,
  createTable,
  getText,
  mergeCells,
  rangeLock,
  rangeLockedFor,
  setAlign,
  setFill,
  setLock,
  setText,
  setTextStyle,
} from '../../src/edit/table/model';
import { defaultTableStyle } from '../../src/edit/table/style';
import { decodeTableXData, encodeTableXData, TABLE_APP, tableFromEntity } from '../../src/edit/table/entity';
import { newTableEntity } from '../../src/edit/table/build';
import { tableCellsOut } from '../../src/io/tablecells';
import { writeDxf } from '../../src/io/dxf/writer';
import { writeDwg } from '../../src/io/dwg/writer/index';
import { readCadFile } from '../../src/io/index';
import { settle } from '../polish/real-app';
import { box, key, setup } from './fixture28';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../polish/fakes')).FakeCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));

afterEach(() => {
  activeEditor()?.cancel();
  document.body.replaceChildren();
});

type H = ReturnType<typeof setup>;
type Pt = { x: number; y: number };

const mev = () => ({ clientX: 5, clientY: 5, shiftKey: false, ctrlKey: false, metaKey: false, button: 2 }) as MouseEvent;
const context = (h: H, p: Pt) => h.view.events.context!(p, p, mev());
const menuRows = () => {
  const m = document.querySelector('.menu');
  return m ? [...m.children].map((x) => (x.tagName === 'HR' ? '—' : `${(x.textContent ?? '').trim()}${(x as HTMLButtonElement).disabled ? '(꺼짐)' : ''}`)) : null;
};
const clickMenu = (label: string) => {
  const b = [...document.querySelectorAll<HTMLButtonElement>('.menu button')].find((x) => (x.textContent ?? '').trim().replace(/✓$/, '') === label);
  if (!b) throw new Error(`메뉴에 ${label}이 없습니다: ${JSON.stringify(menuRows())}`);
  b.click();
};
/** 셀 메뉴의 잠금 ▸에서 고른다 */
const lockVia = (h: H, at: Pt, label: string) => {
  context(h, at);
  clickMenu('잠금 ▸');
  clickMenu(label);
};
const locks = (h: H) => h.data().cells.map((c) => c.lock ?? 0);
const tableOf = (bytes: Uint8Array, name: string) => {
  const back = readCadFile(bytes, name);
  return { back, te: back.blocks.get(MODEL_SPACE)!.entities.find((e): e is TableEntity => e.type === 'ACAD_TABLE')! };
};
const fixHeader = (h: H) => {
  for (const k of ['$TDCREATE', '$TDUCREATE', '$TDUPDATE', '$TDUUPDATE']) h.doc.header.set(k, 2461345.5);
  h.doc.header.set('$FINGERPRINTGUID', '{00000000-0000-0000-0000-000000000001}');
  h.doc.header.set('$VERSIONGUID', '{00000000-0000-0000-0000-000000000002}');
};

describe('셀 잠금 자료', () => {
  it('setLock(내용 1·서식 4만 남긴다)·cellLock(병합 셀은 기준 셀)·rangeLock·rangeLockedFor, 셀 재지정 지우기는 잠금을 지우지 않는다', () => {
    const ts = defaultTableStyle(true);
    const t0 = createTable({ cols: 3, colWidth: 30, dataRows: 2, rowLines: 1, first: 'title', second: 'header' }, ts);
    const t1 = setLock(t0, 2, 0, 3, 1, 0xff);
    expect(t1.cells.map((c) => c.lock ?? 0)).toEqual([0, 0, 0, 0, 0, 0, 5, 5, 0, 5, 5, 0]);
    expect(t0.cells.every((c) => c.lock === undefined)).toBe(true);
    expect(setLock(t1, 2, 0, 2, 0, 0).cells[6]!.lock).toBeUndefined();
    expect(rangeLock(t1, 2, 0, 3, 1)).toBe(5);
    expect(rangeLock(t1, 2, 0, 2, 2)).toBeNull();
    expect(rangeLock(t0, 0, 0, 3, 2)).toBe(0);
    const t2 = setLock(t1, 2, 2, 2, 2, LOCK_FORMAT);
    expect(rangeLockedFor(t2, 2, 2, 2, 2, LOCK_CONTENT)).toBe(false);
    expect(rangeLockedFor(t2, 2, 2, 2, 2, LOCK_FORMAT)).toBe(true);
    // 병합 B3:C4 — 기준 셀 B3(5)을 본다(덮인 C4는 0이어도)
    const m = mergeCells(setLock(t0, 2, 1, 2, 1, LOCK_CONTENT), 2, 1, 3, 2)!;
    expect(cellLock(m, 3, 2)).toBe(LOCK_CONTENT);
    expect(rangeLockedFor(m, 3, 2, 3, 2, LOCK_CONTENT)).toBe(true);
    // 재지정 지우기는 잠금을 남긴다(잠금은 셀 재지정이 아니다)
    const c = clearOverrides(setFill(t1, 2, 0, 2, 0, { aci: 1 }), 0, 0, 3, 2)!;
    expect(c.cells.map((x) => x.lock ?? 0)).toEqual(t1.cells.map((x) => x.lock ?? 0));
    expect(c.cells[6]!.fill).toBeUndefined();
  });

  it('확장 자료: 문자 스타일 뒤 lock 묶음(시작·개수·비트), 잠금이 없으면 33차와 같은 확장 자료, 망가진 묶음은 버린다', () => {
    const ts = defaultTableStyle(true);
    const base = setTextStyle(setText(createTable({ cols: 3, colWidth: 30, dataRows: 3, rowLines: 1, first: 'title', second: 'header' }, ts), 2, 0, '가'), 2, 0, 2, 0, 'Bold');
    let t = setLock(base, 1, 0, 2, 2, LOCK_CONTENT | LOCK_FORMAT);
    t = setLock(t, 4, 1, 4, 1, LOCK_FORMAT);
    const x = encodeTableXData(t);
    const at = x.items.findIndex((i) => i.code === 1000 && i.value === 'lock');
    expect(x.items.filter((i) => i.code === 1000).map((i) => i.value).slice(-3)).toEqual(['tstyle', 'Bold', 'lock']);
    expect(x.items.slice(at + 1).map((i) => i.value)).toEqual([2, 3, 6, 5, 13, 1, 4]);
    // 33차까지의 읽기는 lock에서 멈춘다: 그 앞은 잠금이 없는 표의 확장 자료와 같다
    expect(x.items.slice(0, at)).toEqual(encodeTableXData(base).items);
    expect(encodeTableXData(base).items.some((i) => i.value === 'lock')).toBe(false);
    expect([...decodeTableXData(x)!.locks!]).toEqual([[3, 5], [4, 5], [5, 5], [6, 5], [7, 5], [8, 5], [13, 4]]);
    const doc = createNewDocument('metric');
    doc.textStyles.set('BOLD', { ...structuredClone(doc.textStyles.get('STANDARD')!), name: 'Bold', handle: 'B01' });
    expect(tableFromEntity(newTableEntity(t, { insert: { x: 0, y: 0, z: 0 }, blockName: '*T1' }), doc)!.data).toEqual(t);
    // 망가진 묶음: 잠금 없음(0)·표 밖 번호는 버리고, 다른 비트는 1·4만 남긴다
    const i = (v: number) => ({ code: 1071, value: v });
    const bad = { app: TABLE_APP, items: [...x.items.slice(0, at), { code: 1000, value: 'lock' }, i(3), i(0), i(2), i(0), i(14), i(5), i(0xff), i(-1), i(2), i(2)] };
    // (0, 2, 0)은 잠금 없음, (14, 5, 0xff)는 14만(1·4 → 5), (−1, 2, 2)는 2가 남길 비트가 아니라 버린다
    expect([...decodeTableXData(bad as never)!.locks!]).toEqual([[14, 5]]);
  });

  it('DWG R2010+에서 읽은 AutoCAD 표(확장 자료 없음)의 셀 상태 잠금은 객체의 셀에 남고, 표 정의·쓸 셀 배치가 그 잠금을 쓴다', () => {
    const doc = createNewDocument('metric');
    const ts = defaultTableStyle(true);
    const e = newTableEntity(createTable({ cols: 2, colWidth: 20, dataRows: 2, rowLines: 1, first: 'data', second: 'data' }, ts), { insert: { x: 0, y: 0, z: 0 }, blockName: '*T1' }) as TableEntity;
    e.xdata = undefined;
    e.cells = [{ text: 'a', lock: 1 }, { text: 'b' }, { text: 'c', lock: 0xff }, { text: 'd' }];
    const d = tableFromEntity(e, doc)!.data;
    expect(d.cells.map((c) => c.lock ?? 0)).toEqual([1, 0, 5, 0]);
    expect(tableCellsOut(e, doc).cells.map((c) => c.lock ?? 0)).toEqual([1, 0, 5, 0]);
  });
});

describe('셀 메뉴의 잠금', () => {
  const ITEMS = ['잠금 해제', '내용 잠금', '서식 잠금', '내용과 서식 잠금'];

  it('잠금 ▸ 아래 네 가지, 고른 범위가 모두 그 잠금이면 ✓, 고르면 범위(덮인 셀 포함)의 잠금(확정 한 번·같은 범위를 고른 채·명령 취소)', () => {
    const h = setup();
    h.click(h.center(2, 0));
    context(h, h.center(2, 0));
    expect(menuRows()!.slice(-3)).toEqual(['배경 채우기 ▸', '잠금 ▸', '특성 재지정 제거(꺼짐)']);
    clickMenu('잠금 ▸');
    expect(menuRows()).toEqual(['잠금', ...ITEMS.map((l) => (l === '잠금 해제' ? `${l}✓` : l))]);
    const t0 = h.data();
    // B3:C5(B4:C5 병합을 덮는다)
    h.click(h.center(2, 1));
    h.click(h.center(3, 1), { shiftKey: true });
    lockVia(h, h.center(2, 1), '내용과 서식 잠금');
    expect(locks(h)).toEqual([0, 0, 0, 0, 0, 0, 0, 5, 5, 0, 5, 5, 0, 5, 5]);
    expect(h.st.session.undoTop()?.label).toBe('셀 잠금');
    expect(h.out().at(-1)).toBe('셀 잠금: 표 5행 3열');
    expect(h.cur()).toEqual([2, 1, 4, 2]);
    context(h, h.center(2, 1));
    clickMenu('잠금 ▸');
    expect(menuRows()!.filter((x) => x.endsWith('✓'))).toEqual(['내용과 서식 잠금✓']);
    // 같은 잠금이면 단계가 늘지 않는다
    const top = h.st.session.undoTop();
    clickMenu('내용과 서식 잠금');
    expect(h.st.session.undoTop()).toBe(top);
    // A3:B3은 섞여 ✓ 없음, 서식이 잠겨도 잠금은 바꿀 수 있다(풀기)
    h.click(h.center(2, 0));
    h.click(h.center(2, 1), { shiftKey: true });
    context(h, h.center(2, 0));
    clickMenu('잠금 ▸');
    expect(menuRows()!.some((x) => x.endsWith('✓'))).toBe(false);
    clickMenu('잠금 해제');
    expect(locks(h).slice(6, 8)).toEqual([0, 0]);
    h.st.session.undo();
    h.st.session.undo();
    expect(h.data()).toEqual(t0);
  });

  it('내용 잠금: 바로 입력·셀 편집(두 번 누르기·TABLEDIT 길)은 편집기를 열지 않고 알린다, Tab으로 잠긴 셀에 가면 앞 셀은 확정하고 멈춘다, 서식은 바꿀 수 있다', async () => {
    const h = setup();
    h.click(h.center(2, 1));
    lockVia(h, h.center(2, 1), '내용 잠금');
    const t0 = h.data();
    // 고른 B3에 글자 → 편집기 없음, 알림, 셀은 고른 채
    h.press('Z');
    await settle();
    expect(box()).toBeNull();
    expect(h.out().at(-1)).toBe(CONTENT_LOCKED);
    expect(h.cur()).toEqual([2, 1, 2, 1]);
    await editTableInPlace(h.app, h.handle, { r: 2, c: 1 });
    expect(box()).toBeNull();
    expect(h.data()).toEqual(t0);
    // A3에서 고쳐 Tab → B3(잠김): A3은 확정되고 거기서 끝
    h.click(h.center(2, 0));
    h.press('Q');
    await settle();
    expect(box()?.getAttribute('aria-label')).toBe('테이블 셀 편집 — A3');
    key('Tab');
    await settle();
    expect(getText(h.data(), 2, 0)).toBe('Q');
    expect(box()).toBeNull();
    expect(h.out().at(-1)).toBe(CONTENT_LOCKED);
    // 서식(정렬)은 바꿀 수 있다
    h.click(h.center(2, 1));
    context(h, h.center(2, 1));
    clickMenu('정렬 ▸');
    clickMenu('중간 왼쪽');
    expect(h.data().cells[cellIndex(h.data(), 2, 1)]!.align).toBe(4);
  });

  it('표 전체 셀 대화상자: 내용이 잠긴 셀은 읽기만 하고 확인해도 그대로, 다른 셀은 바뀐다', async () => {
    const h = setup();
    h.click(h.center(2, 0));
    lockVia(h, h.center(2, 0), '내용 잠금');
    const p = editTableAt(h.app, h.handle, null);
    await settle();
    const dlg = document.querySelector('.dialog')!;
    const a3 = dlg.querySelector<HTMLTextAreaElement>('textarea[aria-label="셀 A3"]')!;
    const b3 = dlg.querySelector<HTMLTextAreaElement>('textarea[aria-label="셀 B3"]')!;
    expect([a3.readOnly, a3.title, b3.readOnly]).toEqual([true, CONTENT_LOCKED, false]);
    a3.value = '바꿈';
    b3.value = '새 글';
    dlg.querySelector<HTMLButtonElement>('footer .btn.primary')!.click();
    await p;
    expect([getText(h.data(), 2, 0), getText(h.data(), 2, 1)]).toEqual(['가', '새 글']);
  });

  it('서식 잠금: 셀 메뉴의 정렬·배경 채우기·특성 재지정 제거, 특성 팔레트의 서식, 표 메뉴의 모든 특성 재지정 제거는 알리고 바꾸지 않는다(내용은 고칠 수 있다)', async () => {
    const h = setup();
    // C3(정렬 9 재지정)과 A3을 서식 잠금
    h.click(h.center(2, 0));
    h.click(h.center(2, 2), { shiftKey: true });
    lockVia(h, h.center(2, 0), '서식 잠금');
    const t0 = h.data();
    const top = h.st.session.undoTop();
    context(h, h.center(2, 0));
    clickMenu('정렬 ▸');
    clickMenu('중간 왼쪽');
    expect(h.out().at(-1)).toBe(FORMAT_LOCKED);
    context(h, h.center(2, 0));
    clickMenu('배경 채우기 ▸');
    clickMenu('빨간색');
    context(h, h.center(2, 0));
    expect(menuRows()!.at(-1)).toBe('특성 재지정 제거');
    clickMenu('특성 재지정 제거');
    expect(h.out().at(-1)).toBe(FORMAT_LOCKED);
    expect(h.data()).toEqual(t0);
    expect(h.st.session.undoTop()).toBe(top);
    // 특성 팔레트: 문자 색상을 바꾸려 하면 알리고, 칸은 지금 값으로 돌아온다
    const host = document.createElement('div');
    document.body.append(host);
    const pal = new Palette(h.app, host);
    h.app.ui.refreshPalette = () => pal.refresh();
    pal.open('props');
    const field = (l: string) => pal.el.querySelector<HTMLSelectElement>(`.palette-body [aria-label="${l}"]`)!;
    field('문자 색상').value = 'aci:1';
    field('문자 색상').dispatchEvent(new Event('change'));
    expect(h.out().at(-1)).toBe(FORMAT_LOCKED);
    expect(field('문자 색상').value).toBe('aci:0');
    expect(h.data()).toEqual(t0);
    // 표 메뉴의 모든 특성 재지정 제거
    h.app.setSelection([h.handle]);
    context(h, { x: 500, y: 500 });
    clickMenu('모든 특성 재지정 제거');
    expect(h.out().at(-1)).toBe(FORMAT_LOCKED);
    expect(h.data()).toEqual(t0);
    // 내용은 고칠 수 있다
    h.app.clearSelection();
    h.click(h.center(2, 1));
    h.press('W');
    await settle();
    expect(box()?.getAttribute('aria-label')).toBe('테이블 셀 편집 — B3');
    key('Enter', { ctrlKey: true });
    await settle();
    expect(getText(h.data(), 2, 1)).toBe('W');
  });

  it('찾기·바꾸기(FIND)는 내용이 잠긴 셀을 바꾸지 않는다', () => {
    const h = setup();
    const q = { query: '가', scope: 'all' as const, kinds: new Set<FindKind>(['table']), matchCase: false, wholeWord: false };
    h.click(h.center(2, 0));
    lockVia(h, h.center(2, 0), '내용 잠금');
    replaceTargets(h.app, findTargets(h.app, q), q, '나');
    expect(getText(h.data(), 2, 0)).toBe('가');
    lockVia(h, h.center(2, 0), '잠금 해제');
    replaceTargets(h.app, findTargets(h.app, q), q, '나');
    expect(getText(h.data(), 2, 0)).toBe('나');
  });

  it('잠금은 DXF R2004~R2018·DWG R2000~R2018 왕복에서 확장 자료로 남고, DWG R2010+는 셀 상태로도 써서 확장 자료 없이 돌아온다(DXF는 참조에 코드가 없어 확장 자료뿐)', () => {
    const h = setup();
    h.click(h.center(2, 0));
    lockVia(h, h.center(2, 0), '내용과 서식 잠금');
    h.click(h.center(2, 1));
    lockVia(h, h.center(2, 1), '서식 잠금');
    const want = h.data();
    const files: [string, Uint8Array][] = [
      ...(['AC1018', 'AC1021', 'AC1024', 'AC1027', 'AC1032'] as const).map((v): [string, Uint8Array] => [`${v}.dxf`, writeDxf(h.doc, { version: v }).data]),
      ...(['AC1015', 'AC1018', 'AC1024', 'AC1027', 'AC1032'] as const).map((v): [string, Uint8Array] => [`${v}.dwg`, writeDwg(h.doc, { version: v }).data]),
    ];
    for (const [name, bytes] of files) {
      const { back, te } = tableOf(bytes, name);
      expect(tableFromEntity(te, back)!.data, name).toEqual(want);
      const noX: TableEntity = { ...te, xdata: te.xdata?.filter((x) => x.app.toUpperCase() !== TABLE_APP) };
      const d = tableFromEntity(noX, back)!.data;
      const r2010dwg = name.endsWith('.dwg') && !/AC1015|AC1018/.test(name);
      expect(d.cells.slice(6, 8).map((c) => c.lock ?? 0), name).toEqual(r2010dwg ? [5, 4] : [0, 0]);
    }
  });

  it('잠금을 걸었다 푼 표는 잠금 없이 같은 횟수로 고친 표와 DXF·DWG 저장 바이트가 같다', () => {
    const files = (h: H) => [writeDxf(h.doc, { version: 'AC1032' }).data, writeDxf(h.doc, { version: 'AC1018' }).data, writeDwg(h.doc, { version: 'AC1032' }).data, writeDwg(h.doc, { version: 'AC1015' }).data];
    const a = setup();
    a.click(a.center(2, 0));
    expect(a.cells.edit('TABLEDIT', (d) => setText(d, 2, 0, '가'))).toBe(true);
    expect(a.cells.edit('TABLEDIT', (d) => setText(d, 2, 0, '가'))).toBe(true);
    const b = setup();
    b.click(b.center(2, 0));
    expect(b.cells.edit('셀 잠금', (d, g) => setLock(d, g.r0, g.c0, g.r1, g.c1, 5))).toBe(true);
    expect(b.cells.edit('셀 잠금', (d, g) => setLock(d, g.r0, g.c0, g.r1, g.c1, 0))).toBe(true);
    expect(b.data()).toEqual(a.data());
    fixHeader(a);
    fixHeader(b);
    const fa = files(a);
    const fb = files(b);
    for (let i = 0; i < fa.length; i++) expect(Buffer.from(fb[i]!).equals(Buffer.from(fa[i]!)), String(i)).toBe(true);
    expect(new TextDecoder().decode(fa[0]!)).not.toMatch(/\nlock\r?\n/);
    // 잠금은 셀 재지정이 아니라 지우기 꺼짐 판정에 들지 않는다
    expect(setAlign(a.data(), 0, 0, 0, 0, 0).cells[0]!.lock).toBeUndefined();
  });
});
