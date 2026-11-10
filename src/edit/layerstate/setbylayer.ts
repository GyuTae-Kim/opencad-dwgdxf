/**
 * SETBYLAYER: 고른 객체의 색상·선종류·선가중치·투명도·재료·플롯 스타일을 ByLayer로 바꾼다.
 *
 * SETBYLAYERMODE(AutoCAD 시스템 변수, 기본 255) 비트: 1 색상, 2 선종류, 4 선가중치, 8 재료, 16 플롯 스타일,
 * 32 ByBlock도 ByLayer로, 64 블록 포함(블록 참조가 쓰는 블록 정의 안의 객체까지), 128 투명도.
 * ByBlock 값은 "ByBlock을 ByLayer로 변경" 답이 예일 때만 바꾼다. 잠긴 도면층의 객체는 바꾸지 않는다.
 * 블록 포함이면 블록 정의는 한 번씩만 고치고(중첩 포함), 외부 참조·배치·치수 블록은 건드리지 않는다.
 */
import type { AttribEntity, CadDocument, Entity, InsertEntity } from '../../core/model';
import { BYBLOCK, BYLAYER, LW_BYBLOCK, LW_BYLAYER, TRANSPARENCY_BYBLOCK, TRANSPARENCY_BYLAYER, normalizeHandle, tableKey } from '../../core/model';
import type { EditOp, ScanHint } from '../session';
import { dropRawCopy, hintOnce, isLayoutBlock, modifyOp } from '../session';

export const SBL_COLOR = 1;
export const SBL_LINETYPE = 2;
export const SBL_LINEWEIGHT = 4;
export const SBL_MATERIAL = 8;
export const SBL_PLOTSTYLE = 16;
export const SBL_BYBLOCK = 32;
export const SBL_BLOCKS = 64;
export const SBL_TRANSPARENCY = 128;
export const SBL_DEFAULT = 255;

/** 설정 대화상자·"현재 활성 설정" 순서 */
export const SBL_PROPS: readonly { bit: number; label: string }[] = [
  { bit: SBL_COLOR, label: '색상' },
  { bit: SBL_LINETYPE, label: '선종류' },
  { bit: SBL_LINEWEIGHT, label: '선가중치' },
  { bit: SBL_TRANSPARENCY, label: '투명도' },
  { bit: SBL_MATERIAL, label: '재료' },
  { bit: SBL_PLOTSTYLE, label: '플롯 스타일' },
];

/** `현재 활성 설정:` 뒤의 글 */
export function activeSettingsText(mode: number): string {
  const s = SBL_PROPS.filter((p) => mode & p.bit).map((p) => p.label);
  return s.length ? s.join(' ') : '없음';
}

export interface SetByLayerOptions {
  /** 바꿀 특성(SETBYLAYERMODE의 특성 비트) */
  mode: number;
  /** ByBlock도 ByLayer로 */
  byBlock: boolean;
  /** 블록 정의 안의 객체까지 */
  includeBlocks: boolean;
  /** 이 도면층의 객체는 건너뛴다(잠긴 도면층) */
  skipLayer?: (layer: string) => boolean;
  /** 블록 정의 안 객체의 바꾸기에 훑은 자리를 자리 짐작으로 단다(109차 — () => EditSession.scanHints(), 핸들이 하나씩인 문서만) */
  blockHints?: ScanHint;
}

/** 재질 핸들이 ByBlock 재질인지(재질 사전의 이름) */
function materialNames(doc: CadDocument): Map<string, string> {
  const out = new Map<string, string>();
  for (const o of doc.objects.values()) {
    if (o.type !== 'MATERIAL') continue;
    const raw = (o as { raw?: { code: number; value: string | number }[] }).raw;
    const n = raw?.find((t) => t.code === 1)?.value;
    if (typeof n === 'string') out.set(normalizeHandle(o.handle), n.toUpperCase());
  }
  return out;
}

/**
 * 객체 하나를 ByLayer로(바뀐 것이 없으면 null). 속성(INSERT의 attribs)도 함께.
 * 바뀌는 칸만 새 객체로 만든다(110차 — 전에는 고른 객체마다 깊이 복사한 뒤 바꿀 것이 있는지 보았다. 확정한 문서 객체는 제자리에서 고치지 않아
 * 나머지 칸은 원본과 함께 쓴다 — session.ts dropRawCopy). 바꾼 값·칸 차례는 깊은 복사를 고치던 때와 같다
 */
export function setByLayerEntity(e: Entity, o: SetByLayerOptions, isByBlockMaterial: (h: string) => boolean = () => false): Entity | null {
  let c = null as Entity | null;
  fix(e, o, isByBlockMaterial, () => (c ??= { ...e }));
  if (e.type === 'INSERT') {
    let list: AttribEntity[] | null = null;
    for (let i = 0; i < e.attribs.length; i++) {
      const a = e.attribs[i]!;
      if (o.skipLayer?.(a.layer)) continue;
      let y = null as AttribEntity | null;
      if (fix(a as Entity, o, isByBlockMaterial, () => (y ??= { ...a }) as Entity)) (list ??= e.attribs.slice())[i] = y!;
    }
    if (list) ((c ??= { ...e }) as InsertEntity).attribs = list;
  }
  if (!c) return null;
  dropRawCopy(c, e);
  return c;
}

/** 객체 x를 ByLayer로 바꿀 칸을 고친다. 읽기는 x에서, 쓰기는 처음 바꿀 때 만드는 사본(out())에. 바꾼 것이 있으면 참 */
function fix(x: Entity, o: SetByLayerOptions, isByBlockMaterial: (h: string) => boolean, out: () => Entity): boolean {
  let changed = false;
  const m = o.mode;
  if (m & SBL_COLOR && x.color.aci !== BYLAYER && (x.color.aci !== BYBLOCK || o.byBlock)) {
    out().color = { aci: BYLAYER };
    changed = true;
  }
  if (m & SBL_LINETYPE) {
    const k = tableKey(x.linetype || 'ByLayer');
    if (k !== 'BYLAYER' && (k !== 'BYBLOCK' || o.byBlock)) {
      out().linetype = 'ByLayer';
      changed = true;
    }
  }
  if (m & SBL_LINEWEIGHT && x.lineweight !== LW_BYLAYER && (x.lineweight !== LW_BYBLOCK || o.byBlock)) {
    out().lineweight = LW_BYLAYER;
    changed = true;
  }
  if (m & SBL_TRANSPARENCY && x.transparency !== TRANSPARENCY_BYLAYER && (x.transparency !== TRANSPARENCY_BYBLOCK || o.byBlock)) {
    out().transparency = TRANSPARENCY_BYLAYER;
    changed = true;
  }
  if (m & SBL_MATERIAL && x.material && (!isByBlockMaterial(x.material) || o.byBlock)) {
    delete out().material;
    changed = true;
  }
  if (m & SBL_PLOTSTYLE && x.plotStyle) {
    delete out().plotStyle;
    changed = true;
  }
  return changed;
}

/** 블록 정의를 고쳐도 되는지(외부 참조·배치·치수 블록은 안 된다) */
function editableBlock(doc: CadDocument, name: string): boolean {
  const k = tableKey(name);
  if (isLayoutBlock(k) || /^\*D\d*$/i.test(name)) return false;
  const b = doc.blocks.get(k);
  if (!b) return false;
  return !(b.flags & (4 | 8 | 16)) && !name.includes('|');
}

export interface SetByLayerResult {
  ops: EditOp[];
  /** 바뀐 고른 객체 수 */
  changed: number;
  /** 바뀐 블록 정의 안 객체 수 */
  nested: number;
  /** 고친 블록 정의 수 */
  blocks: number;
}

/**
 * 고른 객체(공간 블록 키와 함께)를 ByLayer로 바꾸는 작업. index는 그 객체의 자리 짐작(EditSession.slotHint — 108차)이고 바꾸기 변경에 그대로 단다
 */
export function setByLayerOps(doc: CadDocument, targets: readonly { block: string; entity: Entity; index?: number }[], o: SetByLayerOptions): SetByLayerResult {
  const mats = materialNames(doc);
  const isBB = (h: string) => mats.get(normalizeHandle(h)) === 'BYBLOCK';
  const res: SetByLayerResult = { ops: [], changed: 0, nested: 0, blocks: 0 };
  const doneBlocks = new Set<string>();
  const blockHint = hintOnce(o.blockHints ?? false);
  const visitBlock = (name: string) => {
    const k = tableKey(name);
    if (doneBlocks.has(k) || !editableBlock(doc, name)) return;
    doneBlocks.add(k);
    const b = doc.blocks.get(k)!;
    let any = false;
    const list = b.entities;
    for (let i = 0; i < list.length; i++) {
      const e = list[i]!;
      if (e.type === 'INSERT') visitBlock(e.block);
      if (o.skipLayer?.(e.layer)) continue;
      const c = setByLayerEntity(e, o, isBB);
      if (!c) continue;
      res.ops.push(modifyOp(k, e, c, blockHint() ? i : undefined));
      res.nested++;
      any = true;
    }
    if (any) res.blocks++;
  };
  for (const t of targets) {
    const e = t.entity;
    if (o.skipLayer?.(e.layer)) continue;
    const c = setByLayerEntity(e, o, isBB);
    if (c) {
      res.ops.push(modifyOp(t.block, e, c, t.index));
      res.changed++;
    }
    if (o.includeBlocks && e.type === 'INSERT') visitBlock(e.block);
  }
  return res;
}
