/**
 * RENAME(UI 없음): 명명된 객체의 이름을 바꾸고 그 이름을 적어 둔 모든 곳(객체·표·치수 스타일·헤더 변수)을 함께 바꾼다.
 * 종류: 블록, 치수 스타일, 도면층, 선종류, 문자 스타일, 배치.
 * (뷰·UCS는 편집 세션에 그 표를 바꾸는 작업이 없어 아직 바꿀 수 없다.)
 */
import type { AttribEntity, CadDocument, DictionaryObject, DimStyle, Entity, GenericObject, HeaderValue, InsertEntity, Layer, Layout, MLineStyleObject, ViewportEntity } from '../../core/model';
import { MODEL_SPACE, tableKey } from '../../core/model';
import { pushAll } from '../../core/arrays';
import type { EditOp, ScanHint } from '../session';
import { dropRawCopy, hintOnce, isLayoutBlock, modifyOp } from '../session';
import { mapTableTextStyles } from '../table/entity';

export type RenameKind = 'block' | 'dimStyle' | 'layer' | 'linetype' | 'textStyle' | 'layout';

export const RENAME_KINDS: readonly { kind: RenameKind; label: string; key: string }[] = [
  { kind: 'block', label: '블록', key: 'B' },
  { kind: 'dimStyle', label: '치수 스타일', key: 'D' },
  { kind: 'layer', label: '도면층', key: 'LA' },
  { kind: 'linetype', label: '선종류', key: 'LT' },
  { kind: 'textStyle', label: '문자 스타일', key: 'S' },
  { kind: 'layout', label: '배치', key: 'L' },
];

const BAD = /[<>/\\":;?*|,=`]/;

/** 새 이름으로 쓸 수 없으면 까닭 */
export function nameProblem(name: string): string | null {
  if (!name) return '이름을 입력하십시오.';
  if (name !== name.trim()) return '이름 앞뒤에 공백을 둘 수 없습니다.';
  if (name.length > 255) return '이름은 255자 이내여야 합니다.';
  if (/[\u0000-\u001f]/.test(name)) return '이름에 제어 문자를 쓸 수 없습니다.';
  if (BAD.test(name)) return '이름에 < > / \\ " : ; ? * | , = ` 문자는 쓸 수 없습니다.';
  return null;
}

/** 종류의 모든 이름(표 철자) */
export function namesOf(doc: CadDocument, kind: RenameKind): string[] {
  switch (kind) {
    case 'block':
      return [...doc.blocks.values()].map((b) => b.name);
    case 'dimStyle':
      return [...doc.dimStyles.values()].map((d) => d.name);
    case 'layer':
      return [...doc.layers.values()].map((l) => l.name);
    case 'linetype':
      return [...doc.linetypes.values()].map((l) => l.name);
    case 'textStyle':
      return [...doc.textStyles.values()].filter((s) => s.name && !(s.flags & 1)).map((s) => s.name);
    case 'layout':
      return doc.layouts.map((l) => l.name);
  }
}

/** 이 이름을 바꿀 수 없으면 까닭(바꿀 수 있으면 null) */
export function lockedReason(doc: CadDocument, kind: RenameKind, name: string): string | null {
  const k = tableKey(name);
  if (name.includes('|')) return '외부 참조에 종속된 이름은 바꿀 수 없습니다.';
  switch (kind) {
    case 'block': {
      const b = doc.blocks.get(k);
      if (!b) return '없는 블록입니다.';
      if (name.startsWith('*') || isLayoutBlock(k)) return '익명 블록과 배치 블록은 이름을 바꿀 수 없습니다.';
      if (b.flags & (4 | 16)) return '외부 참조 블록은 이름을 바꿀 수 없습니다.';
      return null;
    }
    case 'dimStyle': {
      const d = doc.dimStyles.get(k);
      if (!d) return '없는 치수 스타일입니다.';
      if (k === 'STANDARD') return 'Standard 치수 스타일은 이름을 바꿀 수 없습니다.';
      if (/\$\d$/.test(name)) return '하위 치수 스타일은 상위 스타일과 함께 바뀝니다.';
      if (d.flags & 16) return '외부 참조 치수 스타일은 이름을 바꿀 수 없습니다.';
      return null;
    }
    case 'layer': {
      const l = doc.layers.get(k);
      if (!l) return '없는 도면층입니다.';
      if (k === '0' || k === 'DEFPOINTS') return `도면층 ${l.name}의 이름은 바꿀 수 없습니다.`;
      if (l.flags & 16) return '외부 참조 도면층은 이름을 바꿀 수 없습니다.';
      return null;
    }
    case 'linetype': {
      const l = doc.linetypes.get(k);
      if (!l) return '없는 선종류입니다.';
      if (k === 'BYLAYER' || k === 'BYBLOCK' || k === 'CONTINUOUS') return `선종류 ${l.name}의 이름은 바꿀 수 없습니다.`;
      if (l.flags & 16) return '외부 참조 선종류는 이름을 바꿀 수 없습니다.';
      return null;
    }
    case 'textStyle': {
      const s = doc.textStyles.get(k);
      if (!s) return '없는 문자 스타일입니다.';
      if (k === 'STANDARD') return 'Standard 문자 스타일은 이름을 바꿀 수 없습니다.';
      if (s.flags & 16) return '외부 참조 문자 스타일은 이름을 바꿀 수 없습니다.';
      return null;
    }
    case 'layout': {
      const l = doc.layouts.find((x) => tableKey(x.name) === k);
      if (!l) return '없는 배치입니다.';
      if (tableKey(l.blockName) === MODEL_SPACE) return '모형 배치는 이름을 바꿀 수 없습니다.';
      return null;
    }
  }
}

/** 바꿀 수 있는 이름(정렬) */
export function renamableNames(doc: CadDocument, kind: RenameKind): string[] {
  return namesOf(doc, kind)
    .filter((n) => !lockedReason(doc, kind, n))
    .sort((a, b) => a.localeCompare(b, 'ko'));
}

/** 이름 바꾸기를 할 수 없으면 까닭. taken: 이 묶음에서 이미 쓰인(또는 비워질) 이름(대문자) */
export function renameProblem(doc: CadDocument, kind: RenameKind, oldName: string, newName: string, taken: ReadonlySet<string> = new Set()): string | null {
  const lock = lockedReason(doc, kind, oldName);
  if (lock) return lock;
  const bad = nameProblem(newName);
  if (bad) return bad;
  const nk = tableKey(newName);
  if (nk === tableKey(oldName)) return null; // 대소문자만 바꾸기
  if (namesOf(doc, kind).some((n) => tableKey(n) === nk) || taken.has(nk)) return `${newName}은(는) 이미 있는 이름입니다.`;
  if (kind === 'block' && newName.startsWith('*')) return '블록 이름은 *로 시작할 수 없습니다.';
  return null;
}

const same = (a: string | undefined, k: string) => typeof a === 'string' && tableKey(a) === k;

/**
 * 객체 하나의 이름 고치기: 바꿀 것이 없으면 null, 있으면 고친 사본. 사본은 바뀌는 칸만 새 객체이고 나머지 칸은 원본과 함께 쓴다(110차 —
 * session.ts dropRawCopy). 전에는 모든 객체를 깊이 복사(cloneEntity)한 뒤 고칠 것이 있는지 보아, 객체 42만 개 도면의 -RENAME 도면층에서
 * 변경 만들기 CPU 약 300ms 가운데 240~251ms가 그 복사였다. 고친 값과 칸 차례는 깊은 복사를 고치던 때와 같다(워커 묶음·지문·되돌리기가 같다)
 */
type Fix = (e: Entity) => Entity | null;

/**
 * 블록마다 객체를 고쳐 modify 작업을 만든다(fix가 null이면 그대로). hint면 훑은 자리를 자리 짐작으로 단다
 * (109차 — EditSession.scanHints: 핸들이 하나씩인 문서만. 적용이 큰 블록의 자리 표를 만들지 않게)
 */
function entityOps(doc: CadDocument, fix: Fix, hint: ScanHint): EditOp[] {
  const ops: EditOp[] = [];
  const useHint = hintOnce(hint);
  for (const [bk, b] of doc.blocks) {
    const list = b.entities;
    for (let i = 0; i < list.length; i++) {
      const e = list[i]!;
      const c = fix(e);
      if (!c) continue;
      dropRawCopy(c, e);
      ops.push(modifyOp(bk, e, c, useHint() ? i : undefined));
    }
  }
  return ops;
}

/** 블록 참조의 속성 가운데 fix가 고친 것(얕은 사본)만 바꾼 새 목록. 고친 것이 없으면 null */
function mapAttribs(e: Entity, fix: (a: AttribEntity) => AttribEntity | null): AttribEntity[] | null {
  if (e.type !== 'INSERT') return null;
  const from = e.attribs;
  let out: AttribEntity[] | null = null;
  for (let i = 0; i < from.length; i++) {
    const x = fix(from[i]!);
    if (!x) continue;
    out ??= from.slice();
    out[i] = x;
  }
  return out;
}

function headerOps(doc: CadDocument, names: string[], k: string, newName: string): EditOp[] {
  const ops: EditOp[] = [];
  for (const n of names) {
    const v: HeaderValue | undefined = doc.header.get(n);
    if (typeof v === 'string' && tableKey(v) === k) ops.push({ kind: 'header', name: n, before: v, after: newName });
  }
  return ops;
}

function dimStyleVarOps(doc: CadDocument, vars: string[], k: string, newName: string, skip?: Set<string>): EditOp[] {
  const ops: EditOp[] = [];
  for (const [dk, d] of doc.dimStyles) {
    if (skip?.has(dk)) continue;
    let hit = false;
    const after: DimStyle = { ...d, vars: { ...d.vars } };
    for (const v of vars)
      if (same(after.vars[v] as string | undefined, k)) {
        after.vars[v] = newName;
        hit = true;
      }
    if (hit) ops.push({ kind: 'dimStyle', key: dk, before: d, after });
  }
  return ops;
}

/**
 * 이름 바꾸기 작업. 순서대로 한 트랜잭션으로 적용한다(앞 작업이 옛 이름의 표 키를 쓴다).
 * 바꿀 수 없으면 빈 배열. hint면 객체 바꾸기에 훑은 자리를 자리 짐작으로 단다(() => EditSession.scanHints() — 109차, 바꿀 객체가 있을 때만 묻는다)
 */
export function renameOps(doc: CadDocument, kind: RenameKind, oldName: string, newName: string, hint: ScanHint = false): EditOp[] {
  if (renameProblem(doc, kind, oldName, newName)) return [];
  const k = tableKey(oldName);
  const nk = tableKey(newName);
  const ops: EditOp[] = [];
  switch (kind) {
    case 'layer': {
      const before = doc.layers.get(k)!;
      const after: Layer = { ...structuredClone(before), name: newName };
      delete (after as { dwgRaw?: unknown }).dwgRaw;
      pushAll(
        ops,
        entityOps(doc, (e) => {
          let c: Entity | null = null;
          if (same(e.layer, k)) (c = { ...e }).layer = newName;
          const at = mapAttribs(e, (a) => (same(a.layer, k) ? { ...a, layer: newName } : null));
          if (at) ((c ??= { ...e }) as InsertEntity).attribs = at;
          if (e.type === 'VIEWPORT' && e.frozenLayers.some((l) => same(l, k))) ((c ??= { ...e }) as ViewportEntity).frozenLayers = e.frozenLayers.map((l) => (same(l, k) ? newName : l));
          return c;
        }, hint),
      );
      for (const [bk, b] of doc.blocks) if (same(b.layer, k)) ops.push({ kind: 'blockDef', key: bk, before: b, after: { ...b, layer: newName } });
      if (nk === k) ops.push({ kind: 'layer', key: k, before, after });
      else ops.push({ kind: 'layer', key: k, before, after: null }, { kind: 'layer', key: nk, before: null, after });
      ops.push(...headerOps(doc, ['$CLAYER'], k, newName));
      break;
    }
    case 'linetype': {
      const before = doc.linetypes.get(k)!;
      pushAll(
        ops,
        entityOps(doc, (e) => {
          let c: Entity | null = null;
          if (same(e.linetype, k)) (c = { ...e }).linetype = newName;
          const at = mapAttribs(e, (a) => (same(a.linetype, k) ? { ...a, linetype: newName } : null));
          if (at) ((c ??= { ...e }) as InsertEntity).attribs = at;
          return c;
        }, hint),
      );
      for (const [lk, l] of doc.layers) if (same(l.linetype, k)) ops.push({ kind: 'layer', key: lk, before: l, after: { ...l, linetype: newName } });
      ops.push(...dimStyleVarOps(doc, ['DIMLTYPE', 'DIMLTEX1', 'DIMLTEX2'], k, newName));
      for (const o of doc.objects.values()) {
        if (o.type !== 'MLINESTYLE') continue;
        const m = o as MLineStyleObject;
        if (!m.elements.some((x) => same(x.linetype, k))) continue;
        ops.push({ kind: 'object', key: m.handle, before: m, after: { ...m, elements: m.elements.map((x) => (same(x.linetype, k) ? { ...x, linetype: newName } : x)) } });
      }
      const after = { ...structuredClone(before), name: newName };
      if (nk === k) ops.push({ kind: 'linetype', key: k, before, after });
      else ops.push({ kind: 'linetype', key: k, before, after: null }, { kind: 'linetype', key: nk, before: null, after });
      ops.push(...headerOps(doc, ['$CELTYPE', '$DIMLTYPE', '$DIMLTEX1', '$DIMLTEX2'], k, newName));
      break;
    }
    case 'textStyle': {
      const before = doc.textStyles.get(k)!;
      pushAll(
        ops,
        entityOps(doc, (e) => {
          let c: Entity | null = null;
          type Styled = { style?: string; mtext?: { style: string } };
          if ((e.type === 'TEXT' || e.type === 'MTEXT' || e.type === 'ATTRIB' || e.type === 'ATTDEF') && same((e as Styled).style, k)) ((c = { ...e }) as Styled).style = newName;
          const am = (e as Styled).mtext;
          if ((e.type === 'ATTRIB' || e.type === 'ATTDEF') && am && same(am.style, k)) ((c ??= { ...e }) as Styled).mtext = { ...am, style: newName };
          const at = mapAttribs(e, (a) => {
            const s = same(a.style, k);
            const m = !!a.mtext && same(a.mtext.style, k);
            if (!s && !m) return null;
            const x = { ...a };
            if (s) x.style = newName;
            if (m) x.mtext = { ...a.mtext!, style: newName };
            return x;
          });
          if (at) ((c ??= { ...e }) as InsertEntity).attribs = at;
          // 33차: 표 셀의 문자 스타일 재지정(확장 자료)과 AutoCAD 표 원본 태그의 문자 스타일(7). 확장 자료·원본 태그만 읽고 새 값을 만든다
          const tm = mapTableTextStyles(e, (n) => (same(n, k) ? newName : n));
          if (tm) {
            const x = (c ??= { ...e });
            x.xdata = tm.xdata;
            if (x.type === 'ACAD_TABLE' && tm.type === 'ACAD_TABLE') x.raw = tm.raw;
          }
          return c;
        }, hint),
      );
      ops.push(...dimStyleVarOps(doc, ['DIMTXSTY'], k, newName));
      // 33차: 테이블 스타일(원본 태그의 7 — 셀 스타일마다의 문자 스타일 이름)
      for (const o of doc.objects.values()) {
        if (o.type !== 'TABLESTYLE') continue;
        const g = o as GenericObject;
        const hit7 = (t: { code: number; value: unknown }) => t.code === 7 && same(String(t.value ?? ''), k);
        if (!g.raw?.some(hit7)) continue;
        ops.push({ kind: 'object', key: g.handle, before: g, after: { ...g, raw: g.raw.map((t) => (hit7(t) ? { ...t, value: newName } : t)) } });
      }
      const after = { ...structuredClone(before), name: newName };
      if (nk === k) ops.push({ kind: 'textStyle', key: k, before, after });
      else ops.push({ kind: 'textStyle', key: k, before, after: null }, { kind: 'textStyle', key: nk, before: null, after });
      ops.push(...headerOps(doc, ['$TEXTSTYLE', '$DIMTXSTY'], k, newName));
      break;
    }
    case 'dimStyle': {
      // 하위 스타일(이름$0 …)도 함께
      const family: [string, string][] = [[k, newName]];
      for (const d of doc.dimStyles.values()) {
        const m = /^(.*)\$(\d)$/.exec(d.name);
        if (m && tableKey(m[1]!) === k) family.push([tableKey(d.name), `${newName}$${m[2]}`]);
      }
      const map = new Map(family);
      pushAll(
        ops,
        entityOps(doc, (e) => ((e.type === 'DIMENSION' || e.type === 'LEADER' || e.type === 'TOLERANCE') && map.has(tableKey(e.dimStyle)) ? { ...e, dimStyle: map.get(tableKey(e.dimStyle))! } : null), hint),
      );
      for (const [ok, nn] of family) {
        const before = doc.dimStyles.get(ok)!;
        const after = { ...structuredClone(before), name: nn };
        const nkey = tableKey(nn);
        if (nkey === ok) ops.push({ kind: 'dimStyle', key: ok, before, after });
        else ops.push({ kind: 'dimStyle', key: ok, before, after: null }, { kind: 'dimStyle', key: nkey, before: null, after });
      }
      ops.push(...headerOps(doc, ['$DIMSTYLE'], k, newName));
      break;
    }
    case 'block': {
      const def = doc.blocks.get(k)!;
      pushAll(
        ops,
        entityOps(doc, (e) => (e.type === 'INSERT' && same(e.block, k) ? { ...e, block: newName } : null), hint).filter((o) => !(o.kind === 'modify' && o.block === k)),
      );
      ops.push(...dimStyleVarOps(doc, ['DIMBLK', 'DIMBLK1', 'DIMBLK2', 'DIMLDRBLK'], k, newName));
      const rec = doc.blockRecords.get(k);
      const def2 = { ...def, name: newName };
      if (nk === k) {
        ops.push({ kind: 'blockDef', key: k, before: def, after: def2 });
        if (rec) ops.push({ kind: 'blockRecord', key: k, before: rec, after: { ...rec, name: newName } });
      } else {
        ops.push({ kind: 'blockDef', key: k, before: def, after: null }, { kind: 'blockDef', key: nk, before: null, after: def2 });
        if (rec) ops.push({ kind: 'blockRecord', key: k, before: rec, after: null }, { kind: 'blockRecord', key: nk, before: null, after: { ...rec, name: newName } });
      }
      ops.push(...headerOps(doc, ['$DIMBLK', '$DIMBLK1', '$DIMBLK2', '$DIMLDRBLK'], k, newName));
      break;
    }
    case 'layout': {
      const l = doc.layouts.find((x) => tableKey(x.name) === k)!;
      const after: Layout = { ...l, name: newName };
      ops.push({ kind: 'layout', key: tableKey(l.blockName), before: l, after });
      for (const o of doc.objects.values()) {
        if (o.type !== 'DICTIONARY' && o.type !== 'ACDBDICTIONARYWDFLT') continue;
        const d = o as DictionaryObject;
        const hit = [...d.entries].find(([, h]) => h === l.handle);
        if (!hit) continue;
        const entries = new Map<string, string>();
        for (const [name, h] of d.entries) entries.set(h === l.handle ? newName : name, h);
        ops.push({ kind: 'object', key: d.handle, before: d, after: { ...d, entries } });
      }
      break;
    }
  }
  return ops;
}
