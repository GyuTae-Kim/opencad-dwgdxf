/**
 * 여러 단 MTEXT 시험 자료(직접 만든 합성 자료): AutoCAD가 R2007로 쓴 배치를 따른다 — 첫 단은 단 정보·단 목록·정한 높이,
 * 다른 단은 정한 높이만, 단 삽입점은 단 폭 + 간격씩 오른쪽, 41은 전체 폭, 글은 문단 끝(\P)에서 나뉜다.
 */
import type { CadDocument, Entity, MTextEntity, XData } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { finalizeDocument } from '../../src/core/finalize';

/** 자동 높이 동적 3단(폭 20, 간격 5)의 단 정보 */
export const INFO: XData['items'] = [
  { code: 1000, value: 'ACAD_MTEXT_COLUMN_INFO_BEGIN' },
  { code: 1070, value: 75 },
  { code: 1070, value: 2 },
  { code: 1070, value: 79 },
  { code: 1070, value: 1 },
  { code: 1070, value: 76 },
  { code: 1070, value: 3 },
  { code: 1070, value: 78 },
  { code: 1070, value: 0 },
  { code: 1070, value: 48 },
  { code: 1040, value: 20 },
  { code: 1070, value: 49 },
  { code: 1040, value: 5 },
  { code: 1000, value: 'ACAD_MTEXT_COLUMN_INFO_END' },
];

/** 정한 높이 12 */
export const DH: XData['items'] = [
  { code: 1000, value: 'ACAD_MTEXT_DEFINED_HEIGHT_BEGIN' },
  { code: 1070, value: 46 },
  { code: 1040, value: 12 },
  { code: 1000, value: 'ACAD_MTEXT_DEFINED_HEIGHT_END' },
];

/** 단 목록(첫 단 포함 단 객체 수와 다른 단 핸들) */
export const links = (...hs: string[]): XData['items'] => [
  { code: 1000, value: 'ACAD_MTEXT_COLUMNS_BEGIN' },
  { code: 1070, value: 47 },
  { code: 1070, value: hs.length + 1 },
  ...hs.map((h) => ({ code: 1005, value: h })),
  { code: 1000, value: 'ACAD_MTEXT_COLUMNS_END' },
];

export function mtext(handle: string, x: number, text: string, xdata?: XData[], y = 0): MTextEntity {
  return {
    ...entityDefaults(),
    handle,
    layer: '0',
    type: 'MTEXT',
    insert: { x, y, z: 0 },
    height: 2.5,
    width: 70,
    rectHeight: 12,
    attachment: 1,
    drawingDirection: 5,
    text,
    style: 'Standard',
    rotation: 0,
    lineSpacingStyle: 1,
    lineSpacingFactor: 1,
    backgroundFlags: 0,
    backgroundScale: 1.5,
    ...(xdata ? { xdata } : {}),
  };
}

/** 세 단 묶음(첫 단 h0, 다른 단 h1·h2 — 단 폭 + 간격 = 25씩) */
export function columnGroup(h0 = 'A0', h1 = 'A1', h2 = 'A2', x = 0, y = 0): MTextEntity[] {
  return [
    mtext(h0, x, 'Line 1\\PLine 2\\PLine 3\\P', [{ app: 'ACAD', items: [...INFO, ...links(h1, h2), ...DH] }], y),
    mtext(h1, x + 25, 'Line 4\\PLine 5\\PLine 6\\P', [{ app: 'ACAD', items: DH }], y),
    mtext(h2, x + 50, 'Line 7\\PLine 8\\PLine 9', [{ app: 'ACAD', items: DH }], y),
  ];
}

/** 세 단 MTEXT(A0 첫 단, A1·A2 다음 단)와 선 하나 */
export function columnDoc(): CadDocument {
  const doc = createNewDocument('metric');
  const ms = doc.blocks.get(MODEL_SPACE)!.entities;
  ms.push(...columnGroup(), { ...entityDefaults(), handle: 'A3', layer: '0', type: 'LINE', start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 1, z: 0 } } as Entity);
  return finalizeDocument(doc);
}
