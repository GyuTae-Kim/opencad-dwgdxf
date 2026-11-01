/**
 * 리더가 채운 문서를 뷰어가 바로 쓸 수 있게 마무리한다.
 * DXF·DWG 리더가 모두 마지막에 부른다.
 * - 빠진 기본 표 항목(도면층 0, 선종류 ByLayer·ByBlock·Continuous, 문자 스타일 Standard)을 채운다.
 * - 모형 공간 블록과 모형 배치를 보장하고, 배치를 탭 순서로 정렬한다(모형이 처음).
 * - entityIndex(핸들 → 객체)를 만든다.
 * - 행 × 열이 한도를 넘거나 문서의 파일에 없는 칸 합이 한도를 넘는 표는 셀 없는 표로 둔다(표 그림 블록은 그대로 그린다 — 35차).
 */
import { TABLE_CELL_LIMIT, tableSizeOk } from './limits';
import {
  type BlockDef,
  type CadDocument,
  type Entity,
  type Layout,
  type PlotSettings,
  type XData,
  MODEL_SPACE,
  PAPER_SPACE,
  tableKey,
  v2,
  v3,
} from './model';

/** 앱 표 자료(edit/table/entity.ts TABLE_APP) */
const tableXData = (e: Entity): XData | undefined => e.xdata?.find((q) => q.app.toUpperCase() === 'OPENCAD_TABLE');

/** 표 자료가 적은 칸 수. size 묶음을 찾기만 하고 셀 묶음은 펼치지 않는다. 같은 글자가 여럿이면 가장 큰 값으로 본다 */
function xdataTableCells(x: XData): number {
  let cells = 0;
  const items = x.items;
  for (let i = 0; i + 2 < items.length; i++) {
    if (items[i]!.code !== 1000 || items[i]!.value !== 'size') continue;
    const n = Math.abs(Number(items[i + 1]!.value) * Number(items[i + 2]!.value));
    if (n > cells) cells = n;
  }
  return cells;
}

export function defaultPlotSettings(): PlotSettings {
  return {
    pageSetupName: '',
    printerName: '',
    paperName: '',
    paperWidth: 297,
    paperHeight: 210,
    margins: [0, 0, 0, 0],
    plotOrigin: v2(),
    windowMin: v2(),
    windowMax: v2(),
    scaleNumerator: 1,
    scaleDenominator: 1,
    flags: 0,
    paperUnits: 1,
    rotation: 0,
    plotType: 5,
    styleSheet: '',
    standardScaleType: 16,
  };
}

export function defaultLayout(name: string, blockName: string, tabOrder: number): Layout {
  return {
    name,
    handle: '',
    tabOrder,
    blockRecord: '',
    blockName,
    flags: 0,
    limitsMin: v2(),
    limitsMax: v2(420, 297),
    insertionBase: v3(),
    extMin: v3(1e20, 1e20, 1e20),
    extMax: v3(-1e20, -1e20, -1e20),
    elevation: 0,
    ucsOrigin: v3(),
    ucsXAxis: v3(1, 0, 0),
    ucsYAxis: v3(0, 1, 0),
    plot: defaultPlotSettings(),
  };
}

function ensureBlock(doc: CadDocument, name: string): BlockDef {
  const key = tableKey(name);
  let b = doc.blocks.get(key);
  if (!b) {
    b = { name, handle: '', recordHandle: '', basePoint: v3(), flags: 0, entities: [] };
    doc.blocks.set(key, b);
  }
  return b;
}

function indexEntity(index: Map<string, Entity>, e: Entity): void {
  if (e.handle) index.set(e.handle, e);
  if (e.type === 'INSERT') for (const a of e.attribs) if (a.handle) index.set(a.handle, a);
}

export function finalizeDocument(doc: CadDocument): CadDocument {
  if (!doc.layers.has('0')) {
    doc.layers.set('0', {
      name: '0',
      handle: '',
      flags: 0,
      color: { aci: 7 },
      off: false,
      frozen: false,
      locked: false,
      linetype: 'Continuous',
      lineweight: -3,
      plot: true,
      transparency: 255,
    });
  }
  for (const name of ['ByBlock', 'ByLayer', 'Continuous']) {
    if (!doc.linetypes.has(tableKey(name))) {
      doc.linetypes.set(tableKey(name), {
        name,
        handle: '',
        flags: 0,
        description: name === 'Continuous' ? 'Solid line' : '',
        patternLength: 0,
        elements: [],
      });
    }
  }
  if (!doc.textStyles.has('STANDARD')) {
    doc.textStyles.set('STANDARD', {
      name: 'Standard',
      handle: '',
      flags: 0,
      height: 0,
      widthFactor: 1,
      oblique: 0,
      generation: 0,
      lastHeight: 2.5,
      font: 'txt',
      bigFont: '',
    });
  }

  ensureBlock(doc, '*Model_Space');

  // 배치: 모형이 없으면 만들고, 블록 이름을 대문자 키와 맞춘다.
  const layouts = doc.layouts;
  if (!layouts.some((l) => tableKey(l.blockName) === MODEL_SPACE)) {
    layouts.push(defaultLayout('Model', '*Model_Space', 0));
  }
  if (!layouts.some((l) => tableKey(l.blockName) !== MODEL_SPACE)) {
    const ps = [...doc.blocks.values()].find((b) => tableKey(b.name) === PAPER_SPACE);
    if (ps) layouts.push(defaultLayout('Layout1', ps.name, 1));
  }
  layouts.sort((a, b) => {
    const am = tableKey(a.blockName) === MODEL_SPACE ? 0 : 1;
    const bm = tableKey(b.blockName) === MODEL_SPACE ? 0 : 1;
    return am - bm || a.tabOrder - b.tabOrder;
  });

  const index = doc.entityIndex;
  index.clear();
  let bigTables = 0;
  // 파일에 없는 칸의 합. 크기 값 몇 바이트로 표를 고르거나 저장할 때 칸마다 객체를 만들게 하므로 문서 하나로 묶는다
  let missing = 0;
  const overBudget = (cells: number, inFile: number): boolean => {
    const empty = cells - inFile;
    if (empty <= 0) return false;
    if (missing + empty > TABLE_CELL_LIMIT) return true;
    missing += empty;
    return false;
  };
  for (const b of doc.blocks.values()) {
    for (const e of b.entities) {
      indexEntity(index, e);
      if (e.type === 'ACAD_TABLE') {
        // 행·열은 파일에서 읽은 수이고 편집·저장이 셀마다 객체를 만든다
        if (tableSizeOk(e.rows, e.columns) && !overBudget(e.rows * e.columns, Math.max(e.cells?.length ?? 0, tableXData(e)?.items.length ?? 0))) continue;
        bigTables++;
        e.rows = 0;
        e.columns = 0;
        e.rowHeights = [];
        e.columnWidths = [];
        delete e.cells;
      } else if (e.type === 'INSERT' && e.xdata) {
        const x = tableXData(e);
        if (x && overBudget(xdataTableCells(x), x.items.length)) {
          bigTables++;
          e.tableTooLarge = true;
        }
      }
    }
  }
  if (bigTables) doc.warnings.push({ code: 'table.too_large', message: '행과 열이 너무 많은 표는 표로 고칠 수 없게 하고 그림만 보여 줍니다.', count: bigTables });
  return doc;
}
