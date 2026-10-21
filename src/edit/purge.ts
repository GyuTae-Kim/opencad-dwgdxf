/**
 * PURGE가 지울 수 있는 이름 있는 객체와 등록된 응용프로그램(AutoCAD PURGE의 다중 지시선·테이블·다중선 스타일, 그룹, 등록된 응용프로그램).
 * 표 항목(도면층·선종류·문자·치수 스타일)과 블록은 app/editcmds.ts의 purgeable이 맡는다.
 *
 * - 스타일: 루트 사전의 ACAD_MLEADERSTYLE·ACAD_TABLESTYLE·ACAD_MLINESTYLE 항목 중 어떤 객체(블록 안 포함)도, 현재 스타일 머리말도 쓰지 않는 것.
 *   Standard는 지우지 않는다(AutoCAD와 같다).
 * - 그룹: 남은 객체가 하나도 없는 그룹.
 * - 등록된 응용프로그램: 어떤 객체·표 항목·사전 객체의 확장 데이터도 쓰지 않는 것. ACAD는 지우지 않는다.
 */
import type { CadDocument, DictionaryObject, Entity, GroupObject, XData } from '../core/model';
import { normalizeHandle, tableKey } from '../core/model';
import { type EditOp, isLayoutBlock } from './session';
import { namedDictionary } from './layertools/clone';
import { readDictVar } from './annoscale/vars';
import { lwCount, lwPoint, lwPoints } from '../core/lwpoly';

export type NamedKind = 'mleaderStyles' | 'tableStyles' | 'mlineStyles' | 'groups';

export interface NamedItem {
  kind: NamedKind;
  name: string;
  handle: string;
  /** 항목을 담은 사전 핸들 */
  dict: string;
}

const DICTS: [NamedKind, string, string][] = [
  ['mleaderStyles', 'ACAD_MLEADERSTYLE', '$CMLEADERSTYLE'],
  ['tableStyles', 'ACAD_TABLESTYLE', '$CTABLESTYLE'],
  ['mlineStyles', 'ACAD_MLINESTYLE', '$CMLSTYLE'],
  ['groups', 'ACAD_GROUP', ''],
];

function walkEntities(doc: CadDocument, f: (e: Entity) => void): void {
  for (const b of doc.blocks.values())
    for (const e of b.entities) {
      f(e);
      if (e.type === 'INSERT') for (const a of e.attribs) f(a);
    }
}

/** 지울 수 있는 다중 지시선·테이블·다중선 스타일과 빈 그룹 */
export function purgeableNamed(doc: CadDocument): Record<NamedKind, NamedItem[]> {
  const usedH = new Set<string>();
  const usedMline = new Set<string>();
  const H = (h: string | undefined) => (h ? normalizeHandle(h) : '');
  walkEntities(doc, (e) => {
    const a = e as Entity & { styleHandle?: string; tableStyle?: string; styleName?: string };
    if (e.type === 'MULTILEADER' && a.styleHandle) usedH.add(H(a.styleHandle));
    if (e.type === 'ACAD_TABLE' && a.tableStyle) usedH.add(H(a.tableStyle));
    if (e.type === 'MLINE') {
      if (a.styleHandle) usedH.add(H(a.styleHandle));
      if (a.styleName) usedMline.add(tableKey(a.styleName));
    }
  });
  const out: Record<NamedKind, NamedItem[]> = { mleaderStyles: [], tableStyles: [], mlineStyles: [], groups: [] };
  for (const [kind, dictName, header] of DICTS) {
    const d = namedDictionary(doc, dictName);
    if (!d) continue;
    const cur = header ? tableKey(String(doc.header.get(header) ?? 'Standard')) : '';
    for (const [name, h0] of d.entries) {
      const h = H(h0);
      const o = doc.objects.get(h);
      if (!o) continue;
      if (kind === 'groups') {
        const g = o as GroupObject;
        if (g.type === 'GROUP' && !(g.entities ?? []).some((x) => doc.entityIndex.has(normalizeHandle(x)))) out.groups.push({ kind, name, handle: h, dict: d.handle });
        continue;
      }
      const k = tableKey(name);
      if (k === 'STANDARD' || k === cur || usedH.has(h)) continue;
      if (kind === 'mlineStyles' && usedMline.has(k)) continue;
      out[kind].push({ kind, name, handle: h, dict: d.handle });
    }
  }
  return out;
}

/** 이름 있는 객체 지우기: 객체와 그 사전 항목 */
export function purgeNamedOps(doc: CadDocument, items: readonly NamedItem[]): EditOp[] {
  const ops: EditOp[] = [];
  const byDict = new Map<string, NamedItem[]>();
  for (const it of items) {
    const o = doc.objects.get(it.handle);
    if (!o) continue;
    ops.push({ kind: 'object', key: it.handle, before: o, after: null });
    const list = byDict.get(it.dict) ?? [];
    list.push(it);
    byDict.set(it.dict, list);
  }
  for (const [dh, list] of byDict) {
    const d = doc.objects.get(dh) as DictionaryObject | undefined;
    if (!d?.entries) continue;
    const entries = new Map(d.entries);
    for (const it of list) entries.delete(it.name);
    ops.push({ kind: 'object', key: dh, before: d, after: { ...d, entries } });
  }
  return ops;
}

/** 쓰지 않는 등록된 응용프로그램(appIds 열쇠) */
export function purgeableRegApps(doc: CadDocument): string[] {
  const used = new Set<string>(['ACAD']);
  const take = (xs: readonly XData[] | undefined) => {
    for (const x of xs ?? []) used.add(tableKey(x.app));
  };
  walkEntities(doc, (e) => take(e.xdata));
  for (const o of doc.objects.values()) take(o.xdata);
  for (const m of [doc.layers, doc.linetypes, doc.textStyles, doc.dimStyles, doc.views, doc.ucs, doc.blockRecords] as Map<string, { xdata?: XData[] }>[]) for (const r of m.values()) take(r.xdata);
  for (const v of doc.vports) take((v as { xdata?: XData[] }).xdata);
  // 도면층 투명도·설명은 저장할 때 AcCmTransparency·AcAecLayerStandard 확장 데이터가 된다
  for (const l of doc.layers.values()) {
    if (l.transparency !== 255 && l.transparency >= 0) used.add('ACCMTRANSPARENCY');
    if (l.description) used.add('ACAECLAYERSTANDARD');
  }
  return [...doc.appIds.keys()].filter((k) => !used.has(k));
}

export function purgeRegAppOps(doc: CadDocument, keys: readonly string[]): EditOp[] {
  const ops: EditOp[] = [];
  for (const k of keys) {
    const r = doc.appIds.get(k);
    if (r) ops.push({ kind: 'appId', key: k, before: r, after: null });
  }
  return ops;
}

/** 길이가 0인 형상인가(선·호·원·폴리선) */
export function zeroLength(e: Entity): boolean {
  const near = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-10;
  switch (e.type) {
    case 'LINE':
      return near(e.start, e.end);
    case 'CIRCLE':
      return e.radius < 1e-10;
    case 'ARC':
      return e.radius < 1e-10 || Math.abs(e.endAngle - e.startAngle) < 1e-12;
    case 'LWPOLYLINE':
      return lwCount(e) > 0 && lwPoints(e).every((v) => near(v, lwPoint(e, 0)));
    default:
      return false;
  }
}

/** 빈 문자 객체인가(공백만 있는 문자·여러 줄 문자) */
export function emptyText(e: Entity): boolean {
  if (e.type === 'TEXT') return !e.text.trim();
  if (e.type === 'MTEXT') return !e.text.replace(/\\P|\\~|\{|\}/g, '').trim();
  return false;
}

/**
 * 0 길이 형상·빈 문자 객체 지우기(잠긴 도면층 제외). 모형·배치 공간만 — AutoCAD처럼 블록 정의(동적 블록·*D·*T 포함) 안은 건드리지 않는다
 * (동적 블록의 매개변수가 가리키는 0 길이 선을 지우면 원본 그대로 쓰는 동적 블록 객체에 끊긴 참조가 남는다)
 */
export function removeWhereOps(doc: CadDocument, test: (e: Entity) => boolean): EditOp[] {
  const ops: EditOp[] = [];
  for (const [bk, b] of doc.blocks) {
    if (!isLayoutBlock(bk)) continue;
    b.entities.forEach((e, i) => {
      if (test(e) && !doc.layers.get(tableKey(e.layer))?.locked) ops.push({ kind: 'remove', block: bk, entity: e, index: i });
    });
  }
  return ops.reverse();
}
