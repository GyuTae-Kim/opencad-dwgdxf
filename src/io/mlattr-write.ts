/**
 * R2018 이전 판의 여러 줄 속성(124차) — 쓰기 쪽(읽기·근거는 `mlattr.ts`).
 *
 * R2018 이전 판으로 쓸 때 여러 줄 속성(정의)을 AutoCAD가 그 판으로 쓴 꼴로 바꾼 문서를 만든다(원래 문서는 바꾸지 않는다):
 * - 한 줄 꼴 본문 글 = MTEXT 글의 평문(줄은 빈칸으로 잇는다 — 예전에는 DWG가 본문 글을 그대로 써서 R2018에서 읽은 속성의 값("")이 사라졌다).
 * - R2000 이상이면 확장 사전에 ACAD_MLATT·ACAD_XREC_ROUNDTRIP XRECORD(새 핸들 — 문서의 가장 큰 핸들 다음부터).
 *   이미 확장 사전이 있으면(주석 축척 등) 그 사전의 사본에 두 항목을 더한다.
 * AutoCAD는 한 줄 꼴 속성의 태그 뒤에 "_001"을 붙였지만(표본 하나) 언제 붙이는지 몰라 태그는 그대로 쓴다.
 */
import type { AttribEntity, CadDocument, DictionaryObject, Entity, InsertEntity, RawTag, XRecordObject } from '../core/model';
import { tableKey } from '../core/model';
import { EMBEDDED_OBJECT, MATT_HEIGHT, MLATT_KEY, ROUNDTRIP_KEY, withoutRoundtripSection } from './mlattr';
import { mtextPlainLines, textChunks } from './mtextplain';

function hexValue(h: string | undefined): number {
  if (!h) return 0;
  const t = h.trim();
  if (!t || t.length > 13 || !/^[0-9A-Fa-f]+$/.test(t)) return 0;
  return parseInt(t, 16);
}

/** 문서가 쓰는 가장 큰 핸들 + 1(과 $HANDSEED 가운데 큰 것) */
function nextHandle(doc: CadDocument): number {
  let max = 0;
  const see = (s: string | undefined) => {
    const h = hexValue(s);
    if (h > max) max = h;
  };
  for (const m of [doc.layers, doc.linetypes, doc.textStyles, doc.dimStyles, doc.views, doc.ucs, doc.appIds, doc.blockRecords]) for (const r of m.values()) see(r.handle);
  for (const v of doc.vports) see(v.handle);
  for (const b of doc.blocks.values()) {
    see(b.handle);
    see(b.recordHandle);
    see(b.endHandle);
    for (const e of b.entities) {
      see(e.handle);
      if (e.type === 'INSERT') for (const a of e.attribs) see(a.handle);
    }
  }
  for (const [k, o] of doc.objects) {
    see(k);
    see(o.handle);
  }
  for (const l of doc.layouts) see(l.handle);
  if (doc.tableHeads) for (const t of doc.tableHeads.values()) see(t.handle);
  see(doc.rootDictionary);
  const seed = doc.header.get('$HANDSEED');
  return Math.max(max + 1, typeof seed === 'string' ? hexValue(seed) : 0, 1);
}

const plainOneLine = (s: string): string => mtextPlainLines(s).join(' ');

/** ACAD_MLATT 자료(AutoCAD가 쓴 차례 — 7·210·11/50은 기본값이 아닐 때만) */
export function mlattRecordData(a: AttribEntity, version: string, styleExists: (name: string) => boolean): RawTag[] {
  const m = a.mtext!;
  const p = m.insert;
  const out: RawTag[] = [
    { code: 70, value: a.type === 'ATTDEF' ? 4 : 2 },
    { code: 70, value: 0 },
    { code: 70, value: 0 },
    { code: 40, value: 1 },
    { code: 2, value: a.tag || 'TAG' },
    { code: 1, value: EMBEDDED_OBJECT },
    { code: 10, value: `${p.x},${p.y},${p.z}` },
    { code: 40, value: Number.isFinite(m.height) && m.height > 0 ? m.height : a.height || 1 },
    { code: 41, value: Number.isFinite(m.width) ? m.width : 0 },
    { code: 46, value: Number.isFinite(m.rectHeight) ? m.rectHeight! : 0 },
    { code: 71, value: m.attachment >= 1 && m.attachment <= 9 ? m.attachment : 1 },
    { code: 72, value: m.drawingDirection || 5 },
  ];
  const chunks = textChunks(m.text ?? '', version >= 'AC1021');
  for (let i = 0; i < chunks.length - 1; i++) out.push({ code: 3, value: chunks[i]! });
  out.push({ code: 1, value: chunks[chunks.length - 1]! });
  if (m.style && tableKey(m.style) !== 'STANDARD' && styleExists(m.style)) out.push({ code: 7, value: m.style });
  const x = m.extrusion;
  if (x && (Math.abs(x.x) > 1e-12 || Math.abs(x.y) > 1e-12 || Math.abs(x.z - 1) > 1e-12)) out.push({ code: 210, value: `${x.x},${x.y},${x.z}` });
  // 회전이 없으면 쓰지 않는다(AutoCAD 표본에 11·50이 없다 — R2018 DWG에서 읽은 방향 (1, 0, 0)도)
  const d = m.direction;
  if (d && !(d.x > 0 && Math.abs(d.y) < 1e-12 && Math.abs(d.z) < 1e-12)) out.push({ code: 11, value: `${d.x},${d.y},${d.z}` });
  else if (!d && m.rotation) out.push({ code: 50, value: (m.rotation * 180) / Math.PI });
  out.push({ code: 73, value: m.lineSpacingStyle || 1 });
  out.push({ code: 44, value: m.lineSpacingFactor || 1 });
  return out;
}

const multilineDef = (e: Entity): e is AttribEntity => e.type === 'ATTDEF' && !!(e as AttribEntity).mtext;
const hasMultiline = (b: { entities: Entity[] }): boolean => b.entities.some((e) => multilineDef(e) || (e.type === 'INSERT' && e.attribs.some((a) => !!a.mtext)));

/**
 * 쓰기 전에 여러 줄 속성을 이 판에 맞게 바꾼 문서(R2018 이상이거나 여러 줄 속성이 없으면 원래 문서 그대로).
 * version은 실제로 쓰는 판(AC1009·AC1015 …).
 */
export function multilineAttribsForWrite(doc: CadDocument, version: string): CadDocument {
  if (version >= 'AC1032') return doc;
  let any = false;
  for (const b of doc.blocks.values()) {
    if (hasMultiline(b)) {
      any = true;
      break;
    }
  }
  if (!any) return doc;
  const records = version >= 'AC1015';
  const blocks = new Map(doc.blocks);
  const objects = records ? new Map(doc.objects) : doc.objects;
  const entityIndex = new Map(doc.entityIndex);
  const out: CadDocument = { ...doc, blocks, objects, entityIndex };
  let next = records ? nextHandle(doc) : 0;
  const newHandle = () => (next++).toString(16).toUpperCase();
  const styleExists = (name: string) => doc.textStyles.has(tableKey(name));

  const convert = (a: AttribEntity): AttribEntity => {
    const c: AttribEntity = { ...a, text: plainOneLine(a.mtext!.text ?? '') };
    if (!records || !a.handle) return c;
    const owner = a.handle;
    const old = a.xdict ? doc.objects.get(a.xdict.toUpperCase()) : undefined;
    let dict: DictionaryObject;
    if (old && (old.type === 'DICTIONARY' || old.type === 'ACDBDICTIONARYWDFLT')) {
      dict = { ...(old as DictionaryObject), entries: new Map((old as DictionaryObject).entries) };
      delete dict.dwgRaw;
    } else dict = { type: 'DICTIONARY', handle: newHandle(), owner, entries: new Map(), hardOwner: true, cloning: 1 };
    const dh = dict.handle.toUpperCase();
    const find = (key: string): [string, string] | undefined => {
      for (const [n, h] of dict.entries) if (n.toUpperCase() === key) return [n, h];
      return undefined;
    };
    // 지난 기록(있으면)은 새 기록으로 바꾼다
    const oldMl = find(MLATT_KEY);
    if (oldMl) {
      dict.entries.delete(oldMl[0]);
      objects.delete(oldMl[1].toUpperCase());
    }
    const height: RawTag[] = [
      { code: 102, value: MATT_HEIGHT },
      { code: 140, value: Number.isFinite(a.mtext!.height) && a.mtext!.height > 0 ? a.mtext!.height : a.height || 1 },
    ];
    const oldRt = find(ROUNDTRIP_KEY);
    const rtObj = oldRt ? doc.objects.get(oldRt[1].toUpperCase()) : undefined;
    let rt: XRecordObject;
    if (oldRt && rtObj?.type === 'XRECORD') {
      rt = { ...(rtObj as XRecordObject), data: [...withoutRoundtripSection((rtObj as XRecordObject).data, MATT_HEIGHT), ...height] };
      delete rt.dwgRaw;
    } else {
      if (oldRt) dict.entries.delete(oldRt[0]);
      rt = { type: 'XRECORD', handle: newHandle(), owner: dh, reactors: [dh], cloning: 1, data: height };
    }
    const ml: XRecordObject = { type: 'XRECORD', handle: newHandle(), owner: dh, reactors: [dh], cloning: 1, data: mlattRecordData(a, version, styleExists) };
    // AutoCAD가 쓴 차례: ACAD_MLATT, ACAD_XREC_ROUNDTRIP
    const rest = [...dict.entries].filter(([n]) => n.toUpperCase() !== ROUNDTRIP_KEY);
    dict.entries = new Map([...rest, [MLATT_KEY, ml.handle], [oldRt && rtObj?.type === 'XRECORD' ? oldRt[0] : ROUNDTRIP_KEY, rt.handle]]);
    objects.set(dh, dict);
    objects.set(rt.handle.toUpperCase(), rt);
    objects.set(ml.handle.toUpperCase(), ml);
    c.xdict = dict.handle;
    return c;
  };

  for (const [key, b] of doc.blocks) {
    if (!hasMultiline(b)) continue;
    const list: Entity[] = b.entities.map((e) => {
      if (multilineDef(e)) {
        const c = convert(e);
        if (c.handle) entityIndex.set(c.handle, c);
        return c;
      }
      if (e.type === 'INSERT' && e.attribs.some((a) => !!a.mtext)) {
        const attribs = e.attribs.map((a) => {
          if (!a.mtext) return a;
          const c = convert(a);
          if (c.handle) entityIndex.set(c.handle, c);
          return c;
        });
        const ins: InsertEntity = { ...e, attribs };
        if (ins.handle) entityIndex.set(ins.handle, ins);
        return ins;
      }
      return e;
    });
    blocks.set(key, { ...b, entities: list });
  }
  return out;
}
