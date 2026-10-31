// @vitest-environment jsdom
/**
 * 33차: 셀마다의 문자 스타일 재지정(표 자료·확장 자료·DXF/DWG 셀 재지정 7·표 그림·셀 편집기·MATCHCELL·특성 팔레트·셀 재지정 지우기)과
 * 문자 스타일 참조(소거·이름 바꾸기·다른 도면으로 복사, 없어진 스타일).
 * 근거(우리말 요약):
 * - DXF 참조 TABLE: 7 셀 수준 문자 스타일 이름 재지정, 재지정 플래그(R2007+ 91 / 그 전 177 — 0x10 문자 스타일).
 * - AutoCAD 도움말 "About Table Styles"(Mac): 셀 스타일의 문자 특성은 문자 스타일·높이·색, 셀마다 재지정할 수 있고 셀을 고르면 특성 창의 내용 묶음에서 문자 서식을 바꾼다.
 * - ActiveX 참조 Table 객체: SetCellTextStyle·GetCellTextStyle.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MTextEntity, RawTag, TableEntity, TextStyle } from '../../src/core/model';
import { MODEL_SPACE, tableKey } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { purgeable } from '../../src/app/editcmds';
import { rangeTextStyle } from '../../src/app/tablecell';
import { cellTextPlace } from '../../src/app/tablecmds';
import { activeEditor } from '../../src/app/textedit/editor';
import { Palette } from '../../src/app/ui/palettes';
import { cellIndex, cellTextStyle, clearOverrides, createTable, fitRowHeights, mergeCells, setText, setTextColor, setTextStyle } from '../../src/edit/table/model';
import { cloneTableStyle, defaultTableStyle, listTableStyles } from '../../src/edit/table/style';
import { tableBlockEntities } from '../../src/edit/table/geometry';
import { decodeTableXData, encodeTableXData, mapTableTextStyles, rawTableCells, TABLE_APP, tableFromEntity, tableTextStyleRefs } from '../../src/edit/table/entity';
import { newTableEntity } from '../../src/edit/table/build';
import { saveTableStyleOps } from '../../src/edit/table/ops';
import { effectiveText, matchCellText } from '../../src/edit/editcmds2/table';
import { renameOps } from '../../src/edit/util/rename';
import { DefinitionCopier } from '../../src/edit/layertools/clone';
import { rawCellOverrides } from '../../src/io/tablecells';
import { writeDxf } from '../../src/io/dxf/writer';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDwg } from '../../src/io/dwg/writer/index';
import { readCadFile } from '../../src/io/index';
import { setup } from './fixture28';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../polish/fakes')).FakeCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));

afterEach(() => {
  activeEditor()?.cancel();
  document.body.replaceChildren();
});

type H = ReturnType<typeof setup>;

/** 도면에 문자 스타일을 더한다(Standard를 본뜬, 글꼴만 다른 것) */
const addStyle = (h: H, name: string, font = 'romans.shx') => {
  const std = h.doc.textStyles.get('STANDARD')!;
  const s: TextStyle = { ...structuredClone(std), name, handle: h.st.session.newHandle(), font };
  h.st.session.commit({ label: 'STYLE', ops: [{ kind: 'textStyle', key: tableKey(name), before: null, after: s }] });
  return s;
};
/** 표 그림 블록의 셀 문자(MTEXT): 글, 문자 스타일 */
const blockStyles = (h: H): [string, string][] => {
  const b = h.doc.blocks.get(tableKey(h.table().block))!;
  return b.entities.filter((e): e is MTextEntity => e.type === 'MTEXT').map((e) => [e.text, e.style]);
};
const styles = (h: H) => h.data().cells.map((c) => c.textStyle ?? '-');
const tableOf = (bytes: Uint8Array, name: string) => {
  const back = readCadFile(bytes, name);
  return { back, te: back.blocks.get(MODEL_SPACE)!.entities.find((e): e is TableEntity => e.type === 'ACAD_TABLE')! };
};
/** 셀마다 원본 태그(171부터 다음 171 전까지, 값 묶음 밖의 첫 값) */
function rawCells(raw: readonly RawTag[]): Map<number, string | number>[] {
  const start = raw.findIndex((t) => t.code === 100 && t.value === 'AcDbTable');
  const out: Map<number, string | number>[] = [];
  let inValue = false;
  for (let k = start + 1; k < raw.length; k++) {
    const t = raw[k]!;
    if (t.code === 100) break;
    if (t.code === 171) {
      out.push(new Map());
      inValue = false;
      continue;
    }
    if (t.code === 301) inValue = true;
    if (t.code === 304) inValue = false;
    if (out.length && !inValue && !out[out.length - 1]!.has(t.code)) out[out.length - 1]!.set(t.code, t.code === 7 ? String(t.value) : Number(t.value));
  }
  return out;
}
/** 진짜 특성 팔레트(특성 탭)를 열고 앱의 refreshPalette에 잇는다(cellpalette31.test와 같다) */
function withPalette() {
  const h = setup();
  const host = document.createElement('div');
  document.body.append(host);
  const pal = new Palette(h.app, host);
  h.app.ui.refreshPalette = () => pal.refresh();
  pal.open('props');
  const body = () => pal.el.querySelector('.palette-body')!;
  const field = <T extends HTMLElement>(label: string) => body().querySelector<T>(`[aria-label="${label}"]`)!;
  const set = (label: string, v: string) => {
    const el = field<HTMLInputElement | HTMLSelectElement>(label);
    el.value = v;
    el.dispatchEvent(new Event('change'));
  };
  const options = (label: string) => [...field<HTMLSelectElement>(label).options].map((o) => o.textContent);
  return { ...h, pal, body, field, set, options };
}

describe('셀 문자 스타일 자료', () => {
  it('setTextStyle·cellTextStyle(재지정이 없으면 셀 스타일, 그것도 비었으면 Standard), 범위 값, 셀 재지정 지우기에 문자 스타일도', () => {
    const ts = defaultTableStyle(true);
    ts.cells.title.textStyle = '';
    const t0 = createTable({ cols: 3, colWidth: 30, dataRows: 2, rowLines: 1, first: 'title', second: 'header' }, ts);
    expect([cellTextStyle(t0, ts, 0, 0), cellTextStyle(t0, ts, 2, 0)]).toEqual(['Standard', 'Standard']);
    const t1 = setTextStyle(t0, 2, 0, 3, 1, 'Bold');
    expect(t1.cells.map((c) => c.textStyle ?? '-')).toEqual(['-', '-', '-', '-', '-', '-', 'Bold', 'Bold', '-', 'Bold', 'Bold', '-']);
    expect(t0.cells.every((c) => c.textStyle === undefined)).toBe(true);
    expect(setTextStyle(t1, 2, 0, 2, 0, '').cells[6]!.textStyle).toBeUndefined();
    expect(rangeTextStyle(t1, ts, { r0: 2, c0: 0, r1: 3, c1: 1 })).toBe('Bold');
    // 대소문자만 다르면 같은 스타일
    expect(rangeTextStyle(setTextStyle(t1, 2, 0, 2, 0, 'BOLD'), ts, { r0: 2, c0: 0, r1: 2, c1: 1 })).toBe('BOLD');
    expect(rangeTextStyle(t1, ts, { r0: 2, c0: 0, r1: 2, c1: 2 })).toBeNull();
    // 병합 B3:C4는 기준 셀 B3만
    expect(rangeTextStyle(mergeCells(t1, 2, 1, 3, 2)!, ts, { r0: 2, c0: 1, r1: 3, c1: 2 })).toBe('Bold');
    expect(clearOverrides(setTextColor(t1, 0, 0, 0, 0, { aci: 1 }), 0, 0, 3, 2)).toEqual(t0);
  });

  it('확장 자료: 문자 색 뒤 tstyle(시작·개수·이름 조각) 묶음, 재지정이 없으면 32차와 같은 확장 자료, 긴 이름은 조각, 망가진 묶음은 버린다', () => {
    const ts = defaultTableStyle(true);
    const base = setTextColor(setText(createTable({ cols: 3, colWidth: 30, dataRows: 3, rowLines: 1, first: 'title', second: 'header' }, ts), 2, 0, '가'), 2, 0, 2, 0, { aci: 1 });
    const long = '긴'.repeat(100);
    let t = setTextStyle(base, 1, 0, 2, 2, 'Bold');
    t = setTextStyle(t, 4, 2, 4, 2, long);
    const x = encodeTableXData(t);
    const strs = x.items.filter((i) => i.code === 1000).map((i) => i.value);
    expect(strs.slice(-5)).toEqual(['tcolor', 'tstyle', 'Bold', '긴'.repeat(80), '긴'.repeat(20)]);
    const at = x.items.findIndex((i) => i.code === 1000 && i.value === 'tstyle');
    expect(x.items.slice(at + 1).map((i) => i.value)).toEqual([2, 3, 6, 1, 'Bold', 14, 1, 2, '긴'.repeat(80), '긴'.repeat(20)]);
    // 32차까지의 읽기는 tstyle에서 멈춘다: 그 앞은 문자 스타일 재지정이 없는 표의 확장 자료와 같다
    expect(x.items.slice(0, at)).toEqual(encodeTableXData(base).items);
    expect(encodeTableXData(base).items.some((i) => i.value === 'tstyle')).toBe(false);
    const d = decodeTableXData(x)!;
    expect([...d.textStyles!]).toEqual([[3, 'Bold'], [4, 'Bold'], [5, 'Bold'], [6, 'Bold'], [7, 'Bold'], [8, 'Bold'], [14, long]]);
    expect(d.colors?.get(6)).toEqual({ aci: 1 });
    // 망가진 묶음: 빈 이름·표 밖 번호는 버린다
    const i = (v: number) => ({ code: 1071, value: v });
    const bad = { app: TABLE_APP, items: [...x.items.slice(0, at), { code: 1000, value: 'tstyle' }, i(3), i(0), i(1), i(1), { code: 1000, value: '' }, i(14), i(9), i(1), { code: 1000, value: 'A' }, i(-2), i(3), i(1), { code: 1000, value: 'B' }] };
    expect([...decodeTableXData(bad as never)!.textStyles!]).toEqual([[14, 'A'], [0, 'B']]);
  });

  it('AutoCAD 원본 태그: 플래그 0x10과 7은 문자 스타일, 플래그 없는 7·빈 이름·값 묶음 안은 보지 않는다(쓰기 쪽 판정과 같다)', () => {
    const cell = (...tags: [number, string | number][]) => [{ code: 171, value: 1 }, ...tags.map(([code, value]) => ({ code, value }))];
    const raw: RawTag[] = [
      { code: 100, value: 'AcDbTable' },
      { code: 91, value: 2 },
      { code: 92, value: 2 },
      ...cell([91, 0x10], [7, 'Bold']),
      ...cell([91, 0x01], [170, 5], [7, 'Bold']),
      ...cell([91, 0x10], [7, '']),
      ...cell([91, 0], [301, 'CELL_VALUE'], [91, 0x10], [7, 'Bold'], [304, 'ACVALUE_END']),
    ];
    const r = rawTableCells(raw);
    expect([...r.textStyles]).toEqual([[0, 'Bold']]);
    // 쓰기 쪽은 빈 이름을 쓰지 않는다(acdbTableTags·tableCellsOut이 빈 값을 거른다)
    expect(rawCellOverrides(raw).map((o) => o.textStyle || undefined)).toEqual(['Bold', undefined, undefined, undefined]);
    const old = rawTableCells([{ code: 100, value: 'AcDbTable' }, { code: 92, value: 1 }, ...cell([177, 0x10], [1, 'x'], [7, 'Bold'])]);
    expect([...old.textStyles]).toEqual([[0, 'Bold']]);
  });

  it('표 객체 → 표 정의: 도면에 없는 문자 스타일(망가진 자료)은 버려 셀 스타일을 따르고, 이름은 도면의 철자로', () => {
    const doc = createNewDocument('metric');
    const std = doc.textStyles.get('STANDARD')!;
    doc.textStyles.set('BOLD', { ...structuredClone(std), name: 'Bold', handle: 'B01' });
    const ts = defaultTableStyle(true);
    let t = createTable({ cols: 2, colWidth: 20, dataRows: 2, rowLines: 1, first: 'data', second: 'data' }, ts);
    t = setTextStyle(setTextStyle(t, 0, 0, 0, 0, 'bold'), 0, 1, 0, 1, 'Nope');
    const e = newTableEntity(t, { insert: { x: 0, y: 0, z: 0 }, blockName: '*T1' });
    const d = tableFromEntity(e, doc)!.data;
    expect(d.cells.map((c) => c.textStyle ?? '-')).toEqual(['Bold', '-', '-', '-']);
  });

  it('표 그림·행 높이 맞춤·셀 편집기 자리: 셀(병합 셀은 기준 셀)의 문자 스타일, 재지정이 없으면 셀 스타일 값 그대로', () => {
    const ts = defaultTableStyle(true);
    let t = createTable({ cols: 3, colWidth: 30, dataRows: 2, rowLines: 1, first: 'title', second: 'header' }, ts);
    t = setText(setText(setText(t, 0, 0, '제목'), 2, 0, '가'), 3, 2, '나');
    t = mergeCells(t, 2, 0, 3, 1)!;
    t = setTextStyle(t, 2, 0, 2, 0, 'Bold');
    t = setTextStyle(t, 3, 1, 3, 1, 'Covered');
    const mt = tableBlockEntities(t, ts).filter((x): x is MTextEntity => x.type === 'MTEXT');
    expect(mt.map((m) => [m.text, m.style])).toEqual([
      ['제목', 'Standard'],
      ['가', 'Bold'],
      ['나', 'Standard'],
    ]);
    const seen: string[] = [];
    fitRowHeights(t, ts, (text, height, _w, style) => (seen.push(`${text}:${style}`), height));
    expect(seen).toEqual(['제목:Standard', '가:Bold', '나:Standard']);
    const e = newTableEntity(t, { insert: { x: 0, y: 0, z: 0 }, blockName: '*T1' }) as TableEntity;
    expect(cellTextPlace(e, t, ts, 2, 0).textStyle).toBe('Bold');
    expect(cellTextPlace(e, t, ts, 3, 2).textStyle).toBe('Standard');
  });

  it('셀 일치(MATCHCELL)의 문자 스타일: 원본의 실제 스타일을 옮기고, 대상 행 셀 스타일과 같으면(대소문자 무시) 재지정을 지운다', () => {
    const ts = defaultTableStyle(true);
    let t = createTable({ cols: 3, colWidth: 30, dataRows: 2, rowLines: 1, first: 'title', second: 'header' }, ts);
    t = setTextStyle(t, 2, 0, 2, 0, 'Bold');
    const src = effectiveText(t, ts, 2, 0);
    expect(src.textStyle).toBe('Bold');
    const a = matchCellText(t, ts, { r: 2, c: 1 }, src)!;
    expect(a.cells[cellIndex(a, 2, 1)]!.textStyle).toBe('Bold');
    expect(matchCellText(a, ts, { r: 2, c: 1 }, { ...src, textStyle: 'BOLD' })).toBeNull();
    const b = matchCellText(a, ts, { r: 2, c: 1 }, effectiveText(a, ts, 2, 2))!;
    expect(b.cells[cellIndex(b, 2, 1)]!.textStyle).toBeUndefined();
  });
});

describe('셀 문자 스타일 — 앱', () => {
  it('특성 팔레트 내용 묶음의 문자 스타일: 도면의 문자 스타일 목록, 범위 재지정·표 그림·명령 취소, 다르면 *여러 개*, 셀 재지정 지우기로 셀 스타일로', () => {
    const h = withPalette();
    addStyle(h, 'Bold');
    h.click(h.center(2, 0));
    expect(h.field<HTMLSelectElement>('문자 스타일').value).toBe('Standard');
    expect(h.options('문자 스타일')).toEqual(expect.arrayContaining(['Standard', 'Bold']));
    expect([...h.field<HTMLSelectElement>('문자 스타일').options].filter((o) => o.value).every((o) => o.getAttribute('translate') === 'no')).toBe(true);
    h.click(h.center(2, 2), { shiftKey: true });
    h.set('문자 스타일', 'Bold');
    expect(styles(h)).toEqual(['-', '-', '-', '-', '-', '-', 'Bold', 'Bold', 'Bold', '-', '-', '-', '-', '-', '-']);
    expect(blockStyles(h).find((x) => x[0] === '가')).toEqual(['가', 'Bold']);
    expect(h.st.session.undoTop()?.label).toBe('셀 문자 스타일');
    expect(h.out().at(-1)).toBe('셀 문자 스타일: 표 5행 3열');
    expect(h.cur()).toEqual([2, 0, 2, 2]);
    const top = h.st.session.undoTop();
    h.set('문자 스타일', 'Bold');
    expect(h.st.session.undoTop()).toBe(top);
    // A3:A4 — 스타일이 달라 *여러 개*
    h.click(h.center(2, 0));
    h.click(h.center(3, 0), { shiftKey: true });
    expect(h.field<HTMLSelectElement>('문자 스타일').value).toBe('');
    expect(h.options('문자 스타일')[0]).toBe('*여러 개*');
    h.st.session.undo();
    expect(styles(h).every((x) => x === '-')).toBe(true);
    expect(blockStyles(h).find((x) => x[0] === '가')).toEqual(['가', 'Standard']);
  });

  it('바꾼 문자 스타일은 DXF R2004~R2018·DWG R2000~R2018 왕복에서 남고, 확장 자료를 지워도 셀 재지정 7로 돌아온다(DXF 태그 0x10·7)', () => {
    const h = setup();
    addStyle(h, 'Bold');
    h.click(h.center(2, 0));
    expect(h.cells.edit('셀 문자 스타일', (d, g) => setTextStyle(d, g.r0, g.c0, g.r1, g.c1, 'Bold'))).toBe(true);
    const want = h.data();
    const targets: [string, Uint8Array][] = [
      ...(['AC1018', 'AC1021', 'AC1024', 'AC1027', 'AC1032'] as const).map((v): [string, Uint8Array] => [`${v}.dxf`, writeDxf(h.doc, { version: v }).data]),
      ...(['AC1015', 'AC1018', 'AC1024', 'AC1027', 'AC1032'] as const).map((v): [string, Uint8Array] => [`${v}.dwg`, writeDwg(h.doc, { version: v }).data]),
    ];
    for (const [name, bytes] of targets) {
      const { back, te } = tableOf(bytes, name);
      expect(tableFromEntity(te, back)!.data, name).toEqual(want);
      const noX: TableEntity = { ...te, xdata: te.xdata?.filter((x) => x.app.toUpperCase() !== TABLE_APP) };
      const d = tableFromEntity(noX, back)!.data;
      expect(d.cells[6]!.textStyle, name).toBe('Bold');
      expect(tableBlockEntities(d, tableFromEntity(noX, back)!.style).filter((x): x is MTextEntity => x.type === 'MTEXT').find((m) => m.text === '가')!.style, name).toBe('Bold');
    }
    const raw = readDxf(writeDxf(h.doc, { version: 'AC1032' }).data).blocks.get(MODEL_SPACE)!.entities.find((e): e is TableEntity => e.type === 'ACAD_TABLE')!.raw!;
    const cells = rawCells(raw);
    expect([Number(cells[6]!.get(91)) & 0x10, cells[6]!.get(7)]).toEqual([0x10, 'Bold']);
    expect(cells[7]!.get(7)).toBe('Standard');
  });

  it('재지정을 넣었다 지운 표는 재지정 없이 같은 횟수로 고친 표와 DXF·DWG 저장 바이트가 같다', () => {
    const fix = (h: H) => {
      for (const k of ['$TDCREATE', '$TDUCREATE', '$TDUPDATE', '$TDUUPDATE']) h.doc.header.set(k, 2461345.5);
      h.doc.header.set('$FINGERPRINTGUID', '{00000000-0000-0000-0000-000000000001}');
      h.doc.header.set('$VERSIONGUID', '{00000000-0000-0000-0000-000000000002}');
    };
    const files = (h: H) => [writeDxf(h.doc, { version: 'AC1032' }).data, writeDxf(h.doc, { version: 'AC1018' }).data, writeDwg(h.doc, { version: 'AC1032' }).data, writeDwg(h.doc, { version: 'AC1015' }).data];
    const a = setup();
    addStyle(a, 'Bold');
    a.click(a.center(2, 0));
    expect(a.cells.edit('TABLEDIT', (d) => setText(d, 2, 0, '가'))).toBe(true);
    expect(a.cells.edit('TABLEDIT', (d) => setText(d, 2, 0, '가'))).toBe(true);
    const b = setup();
    addStyle(b, 'Bold');
    b.click(b.center(2, 0));
    expect(b.cells.edit('셀 문자 스타일', (d, g) => setTextStyle(d, g.r0, g.c0, g.r1, g.c1, 'Bold'))).toBe(true);
    expect(b.cells.edit('셀 문자 스타일', (d, g) => setTextStyle(d, g.r0, g.c0, g.r1, g.c1, undefined))).toBe(true);
    fix(a);
    fix(b);
    const fa = files(a);
    const fb = files(b);
    for (let i = 0; i < fa.length; i++) expect(Buffer.from(fb[i]!).equals(Buffer.from(fa[i]!)), String(i)).toBe(true);
    expect(new TextDecoder().decode(fa[0]!)).not.toMatch(/tstyle/);
  });
});

describe('문자 스타일 참조', () => {
  /** A4(문자 없음 — 표 그림에 문자 객체가 없다)에 Bold 재지정 */
  const withBold = () => {
    const h = setup();
    addStyle(h, 'Bold');
    h.click(h.center(3, 0));
    expect(h.cells.edit('셀 문자 스타일', (d, g) => setTextStyle(d, g.r0, g.c0, g.r1, g.c1, 'Bold'))).toBe(true);
    expect(blockStyles(h).some((x) => x[1] === 'Bold')).toBe(false);
    return h;
  };

  it('소거(PURGE): 셀 재지정이 가리키는 문자 스타일과 테이블 스타일이 쓰는 문자 스타일은 쓰이는 것으로 센다(재지정을 지우면 소거 대상)', () => {
    const h = withBold();
    addStyle(h, 'Spare');
    addStyle(h, 'ForStyle');
    let found = purgeable(h.app).textStyles;
    expect(found).toContain('SPARE');
    expect(found).not.toContain('BOLD');
    // 테이블 스타일의 데이터 셀 스타일이 쓰는 문자 스타일
    expect(found).toContain('FORSTYLE');
    const ts2 = cloneTableStyle(tableFromEntity(h.table(), h.doc)!.style);
    ts2.name = '보조';
    ts2.cells.data.textStyle = 'ForStyle';
    h.st.session.commit({ label: 'TABLESTYLE', ops: saveTableStyleOps(h.doc, () => h.st.session.newHandle(), ts2).ops });
    found = purgeable(h.app).textStyles;
    expect(found).not.toContain('FORSTYLE');
    // 셀 재지정을 지우면 Bold는 소거 대상
    h.click(h.center(3, 0));
    expect(h.cells.edit('특성 재지정 제거', (d, g) => clearOverrides(d, g.r0, g.c0, g.r1, g.c1))).toBe(true);
    expect(purgeable(h.app).textStyles).toContain('BOLD');
    // AutoCAD 표 원본 태그의 7도 센다
    expect(tableTextStyleRefs({ ...h.table(), xdata: undefined, raw: [{ code: 100, value: 'AcDbTable' }, { code: 171, value: 1 }, { code: 91, value: 0x10 }, { code: 7, value: 'Spare' }] } as TableEntity)).toEqual(['Spare']);
  });

  it('이름 바꾸기(RENAME): 셀 재지정·AutoCAD 표 원본 태그의 7·테이블 스타일이 새 이름을 따라가고, 명령 취소로 돌아간다', () => {
    const h = withBold();
    const ts2 = cloneTableStyle(tableFromEntity(h.table(), h.doc)!.style);
    ts2.name = '보조';
    ts2.cells.header.textStyle = 'Bold';
    h.st.session.commit({ label: 'TABLESTYLE', ops: saveTableStyleOps(h.doc, () => h.st.session.newHandle(), ts2).ops });
    h.st.session.commit({ label: 'RENAME', ops: renameOps(h.doc, 'textStyle', 'Bold', '굵게') });
    expect(h.doc.textStyles.has('BOLD')).toBe(false);
    expect(h.data().cells[cellIndex(h.data(), 3, 0)]!.textStyle).toBe('굵게');
    expect(listTableStyles(h.doc).find((s) => s.name === '보조')!.style.cells.header.textStyle).toBe('굵게');
    h.st.session.undo();
    expect(h.data().cells[cellIndex(h.data(), 3, 0)]!.textStyle).toBe('Bold');
    expect(listTableStyles(h.doc).find((s) => s.name === '보조')!.style.cells.header.textStyle).toBe('Bold');
    // AutoCAD 표(확장 자료 없이 원본 태그의 셀 재지정 7)
    const raw = readDxf(writeDxf(h.doc, { version: 'AC1032' }).data).blocks.get(MODEL_SPACE)!.entities.find((e): e is TableEntity => e.type === 'ACAD_TABLE')!.raw!;
    const before = h.table();
    const after: TableEntity = { ...before, raw, xdata: before.xdata?.filter((x) => x.app.toUpperCase() !== TABLE_APP) };
    h.st.session.commit({ label: 'X', ops: [{ kind: 'modify', block: tableKey(MODEL_SPACE), before, after }] });
    expect(h.data().cells[cellIndex(h.data(), 3, 0)]!.textStyle).toBe('Bold');
    h.st.session.commit({ label: 'RENAME', ops: renameOps(h.doc, 'textStyle', 'Bold', '굵게') });
    expect(h.data().cells[cellIndex(h.data(), 3, 0)]!.textStyle).toBe('굵게');
    expect(rawCells(h.table().raw!)[9]!.get(7)).toBe('굵게');
  });

  it('다른 도면으로 복사(붙여 넣기·디자인센터의 복사기): 셀 재지정이 가리키는 문자 스타일도 함께 오고, 원본에도 없는 이름은 Standard로', () => {
    const h = withBold();
    const dst = createNewDocument('metric');
    let n = 0x7000;
    const copier = new DefinitionCopier(h.doc, dst, () => (n++).toString(16).toUpperCase());
    const c = copier.entity(h.table(), dst.blocks.get(MODEL_SPACE)!.recordHandle) as TableEntity;
    const ops = copier.finish();
    expect(ops.some((o) => o.kind === 'textStyle' && o.key === 'BOLD')).toBe(true);
    expect(decodeTableXData(c.xdata!.find((x) => x.app === TABLE_APP))!.textStyles!.get(9)).toBe('Bold');
    // 원본 도면에도 없는 이름(망가진 자료)은 이 도면의 Standard로
    const broken = mapTableTextStyles(h.table(), (x) => (x === 'Bold' ? 'Gone' : x))!;
    const copier2 = new DefinitionCopier(h.doc, createNewDocument('metric'), () => (n++).toString(16).toUpperCase());
    const c2 = copier2.entity(broken, '1F') as TableEntity;
    expect(decodeTableXData(c2.xdata!.find((x) => x.app === TABLE_APP))!.textStyles!.get(9)).toBe('Standard');
  });
});
