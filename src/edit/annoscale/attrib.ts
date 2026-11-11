/**
 * 주석 속성(119차): 주석 속성 정의(ATTDEF)·속성(ATTRIB)의 상태와, 주석 속성 정의로 속성을 만들 때의 높이.
 *
 * - Autodesk 도움말(ATTDEF 대화 상자 "주석", 주석 블록과 속성 만들기): 속성 정의는 블록과 따로 주석일 수 있다. 주석이 아닌 블록에 쓰면
 *   블록 도형은 뷰포트 축척대로, 속성 문자는 속성의 용지 높이로 보인다(삽입 때 현재 주석 축척을 지원).
 * - AutoCAD가 쓴 도면(공개 실도면 841개 중 주석이 아닌 블록 참조의 주석 속성 60개, 5개 도면): 속성마다 자기 확장 사전에 축척 레코드
 *   (ACDB_MTEXTATTRIBUTEOBJECTCONTEXTDATA_CLASS)가 있고, 높이 = 정의 높이 ÷ 정의의 보이는 축척 배율 × 속성의 보이는 축척 배율 × |Y 축척|.
 * - 표지는 TEXT와 같은 AcadAnnotative(1이면 주석). 표지가 없어도 레코드가 있으면 주석으로 본다(표지 0이면 주석 아님).
 * - 주석 블록의 참조에 든 속성은 블록 참조를 따른다(represent.ts·edit.ts) — 여기서 다루지 않는다.
 */
import type { AttribEntity, BlockDef, CadDocument, Entity } from '../../core/model';
import { tableKey } from '../../core/model';
import { type ContextRecord, contextRecords } from './context';
import type { ScaleIndex } from './represent';
import { factorOf, unitScale } from './scales';
import { currentScale } from './vars';
import { annotativeFlag, blockAnnotative } from './xdata';

/** 공간(블록 이름)의 주석 축척 배율: 모형 = CANNOSCALE, 배치 = 1:1, 다른 블록은 모름(undefined). 앱은 모형 뷰포트의 축척을 따로 고른다 */
export function spaceAnnoFactor(doc: CadDocument, space: string, idx: ScaleIndex): number | undefined {
  const k = tableKey(space);
  const s = k === '*MODEL_SPACE' ? currentScale(doc, idx.list) : /^\*PAPER_SPACE/.test(k) ? (unitScale(idx.list) ?? { paper: 1, drawing: 1 }) : undefined;
  return s ? factorOf(s) : undefined;
}

export type AttAnno = { annotative: false } | { annotative: true; records: ContextRecord[]; factor: number | null };

/** 속성 정의·속성(자기 표지·레코드)의 주석 상태. 보이는 축척은 기본 레코드(없으면 첫 레코드), 읽을 수 없으면 factor null */
export function attAnno(doc: CadDocument, e: Entity, idx: ScaleIndex): AttAnno {
  if (e.type !== 'ATTDEF' && e.type !== 'ATTRIB') return { annotative: false };
  const flag = annotativeFlag(e.xdata);
  if (flag === false) return { annotative: false };
  const records = e.xdict ? contextRecords(doc, e) : [];
  if (flag !== true && !records.length) return { annotative: false };
  const r = records.find((x) => x.isDefault) ?? records[0];
  const s = r ? idx.handle(r.scale) : undefined;
  const f = s ? idx.factor(s.name) : NaN;
  return { annotative: true, records, factor: f > 0 && Number.isFinite(f) ? f : null };
}

/**
 * 주석 속성 정의로 속성을 만들 때 높이에 곱할 배율(정의 높이 × |Y 축척| 위에). 주석 블록이거나 주석이 아닌 정의는 1.
 * 목표 축척: 같은 태그의 지금 속성(동기화)이 자기 레코드를 가지면 그 보이는 축척, 아니면 넣는 공간의 주석 축척 배율(spaceFactor),
 * 그것도 모르면 정의의 축척(배율 1 — 예전과 같다). 정의의 축척 배율을 모르면(레코드 없음) 1로 본다.
 */
export function attribHeightK(doc: CadDocument, def: BlockDef, idx: ScaleIndex, spaceFactor?: number): (d: AttribEntity, old?: AttribEntity) => number {
  if (blockAnnotative(doc, def.name)) return () => 1;
  return (d, old) => {
    // 여러 줄 속성은 레코드를 다루지 않는다(context.ts) — 크기도 예전대로
    if (d.mtext) return 1;
    const a = attAnno(doc, d, idx);
    if (!a.annotative) return 1;
    const fd = a.factor ?? 1;
    const o = old ? attAnno(doc, old, idx) : null;
    const f = o?.annotative && o.factor !== null && o.records.length ? o.factor : (spaceFactor ?? fd);
    return f > 0 && Number.isFinite(f) ? f / fd : 1;
  };
}
