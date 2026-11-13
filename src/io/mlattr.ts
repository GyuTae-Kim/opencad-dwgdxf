/**
 * R2018 이전 판의 여러 줄 속성(124차) — 읽기 쪽. 쓰기는 `mlattr-write.ts`.
 *
 * R2018 DXF·DWG는 여러 줄 속성(정의)의 MTEXT를 속성 안에 끼워 둔다(model의 `mtext`). 그 전 판(R2000~R2013)에는 그 칸이 없어
 * AutoCAD는 속성을 한 줄 속성으로 쓰고, 속성의 확장 사전에 두 XRECORD를 둔다(DXF 참조서 ATTRIB의 AcDbXrecord 절, AutoCAD 2015).
 * - ACAD_MLATT: 70 MText 플래그(2 여러 줄 속성, 4 여러 줄 속성 정의), 70 잠김, 70 보조 속성 수(340…), 40 지금 주석 축척, 2 태그,
 *   1 "Embedded Object" 다음에 MTEXT 자료(10 삽입점, 40 높이, 41 폭, 46 정한 높이, 71 부착점, 72 방향, 3…·1 글, 7, 210, 11·50, 73, 44)
 * - ACAD_XREC_ROUNDTRIP: 102 ACAD_MATT_HEIGHT, 140 높이
 * 근거: AutoCAD가 같은 도면을 R2018과 R2013·R2010·R2007·R2004·R2000·R14로 쓴 DWG·DXF(여러 줄 속성 정의 1·속성 1).
 * 같은 핸들의 R2018 객체는 태그가 XRECORD의 2이고 본문 글이 ""인데, 옛 판의 한 줄 속성은 태그 뒤에 "_001"이 붙고 본문 글이 값이었다.
 * 읽은 뒤 R2018과 같은 모양(`mtext`, XRECORD 태그, 본문 글 "")으로 바꾸고 두 기록은 지운다(쓸 때 판에 맞게 다시 만든다).
 */
import type { AttribEntity, CadColor, CadDocument, DictionaryObject, EntityBase, MTextEntity, RawTag, Vec3, XRecordObject } from '../core/model';

export const MLATT_KEY = 'ACAD_MLATT';
export const ROUNDTRIP_KEY = 'ACAD_XREC_ROUNDTRIP';
export const MATT_HEIGHT = 'ACAD_MATT_HEIGHT';
export const EMBEDDED_OBJECT = 'Embedded Object';

const DEG = Math.PI / 180;
const up = (h: string | undefined): string => (h ?? '').trim().toUpperCase();

function num(v: string | number | undefined): number {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v ?? '').trim());
  return Number.isFinite(n) ? n : 0;
}

const int = (v: string | number | undefined): number => Math.trunc(num(v));

/** 점 값: DWG XRECORD는 "x,y,z" 한 칸, DXF는 코드 + 10·+ 20 칸으로 나뉜다 */
function pointAt(data: readonly RawTag[], i: number): Vec3 {
  const t = data[i]!;
  if (typeof t.value === 'string' && t.value.includes(',')) {
    const p = t.value.split(',').map((s) => num(s));
    return { x: p[0] ?? 0, y: p[1] ?? 0, z: p[2] ?? 0 };
  }
  const p = { x: num(t.value), y: 0, z: 0 };
  for (let j = i + 1; j < data.length && j <= i + 2; j++) {
    const c = data[j]!.code;
    if (c === t.code + 10) p.y = num(data[j]!.value);
    else if (c === t.code + 20) p.z = num(data[j]!.value);
    else break;
  }
  return p;
}

/** ACAD_MLATT 자료 → 태그·MTEXT 칸(모양이 아니면 null). base는 MTEXT의 공통 자료 */
export function parseMlattRecord(data: readonly RawTag[], base: Omit<EntityBase, 'type'>, style: string): { tag: string; mtext: MTextEntity } | null {
  const flagAt = data.findIndex((t) => t.code === 70);
  const flag = flagAt >= 0 ? int(data[flagAt]!.value) : 0;
  if (flag !== 2 && flag !== 4) return null;
  const ei = data.findIndex((t) => t.code === 1 && String(t.value) === EMBEDDED_OBJECT);
  if (ei < 0) return null;
  let tag = '';
  for (let i = 0; i < ei; i++) if (data[i]!.code === 2) tag = String(data[i]!.value);
  const m: MTextEntity = {
    ...base,
    type: 'MTEXT',
    insert: { x: 0, y: 0, z: 0 },
    height: 0,
    width: 0,
    attachment: 1,
    drawingDirection: 5,
    text: '',
    style,
    rotation: 0,
    lineSpacingStyle: 1,
    lineSpacingFactor: 1,
    backgroundFlags: 0,
    backgroundScale: 1.5,
  };
  let bgAci: number | undefined;
  let bgRgb: number | undefined;
  for (let i = ei + 1; i < data.length; i++) {
    const { code, value: v } = data[i]!;
    switch (code) {
      case 1:
      case 3:
        m.text += String(v);
        break;
      case 10:
        m.insert = pointAt(data, i);
        break;
      case 11: {
        const d = pointAt(data, i);
        if (d.x !== 0 || d.y !== 0) m.direction = d;
        break;
      }
      case 210: {
        const x = pointAt(data, i);
        if (Math.abs(x.x) > 1e-12 || Math.abs(x.y) > 1e-12 || Math.abs(x.z - 1) > 1e-12) m.extrusion = x;
        break;
      }
      case 40:
        m.height = num(v);
        break;
      case 41:
        m.width = num(v);
        break;
      case 46:
        m.rectHeight = num(v);
        break;
      case 71:
        m.attachment = int(v) || 1;
        break;
      case 72:
        m.drawingDirection = int(v) || 1;
        break;
      case 7:
        if (String(v).trim()) m.style = String(v).trim();
        break;
      case 50:
        // MTEXT 객체의 DXF 50과 같게 도
        m.rotation = num(v) * DEG;
        break;
      case 73:
        m.lineSpacingStyle = int(v) || 1;
        break;
      case 44:
        m.lineSpacingFactor = num(v) || 1;
        break;
      case 90:
        m.backgroundFlags = int(v);
        break;
      case 63:
        bgAci = int(v);
        break;
      case 421:
        bgRgb = int(v) & 0xffffff;
        break;
      case 45:
        m.backgroundScale = num(v) || 1.5;
        break;
    }
  }
  if (m.backgroundFlags & 1) {
    const c: CadColor = { aci: bgAci ?? 1 };
    if (bgRgb !== undefined) c.rgb = bgRgb;
    m.backgroundColor = c;
  }
  return { tag, mtext: m };
}

function entryOf(d: DictionaryObject, key: string): [string, string] | undefined {
  for (const [n, h] of d.entries) if (n.toUpperCase() === key) return [n, h];
  return undefined;
}

/** ROUNDTRIP 자료에서 102 이름 절(다음 102 앞까지)을 뺀 것 */
export function withoutRoundtripSection(data: readonly RawTag[], name: string): RawTag[] {
  const out: RawTag[] = [];
  let skip = false;
  for (const t of data) {
    if (t.code === 102) skip = String(t.value).trim().toUpperCase() === name;
    if (!skip) out.push(t);
  }
  return out;
}

/**
 * 읽은 문서 정리(DXF·DWG 공통, 읽은 직후 한 번): 옛 판 여러 줄 속성(정의) → R2018 모양. 바꾼 개수를 돌려준다.
 * 끼운 MTEXT가 이미 있는 속성(R2018)은 그대로 둔다.
 */
export function restoreMultilineAttribs(doc: CadDocument): number {
  if (!doc.objects.size) return 0;
  let n = 0;
  const visit = (a: AttribEntity) => {
    if (a.mtext || !a.xdict) return;
    const d = doc.objects.get(up(a.xdict));
    if (!d || (d.type !== 'DICTIONARY' && d.type !== 'ACDBDICTIONARYWDFLT')) return;
    const dict = d as DictionaryObject;
    const ml = entryOf(dict, MLATT_KEY);
    if (!ml) return;
    const x = doc.objects.get(up(ml[1]));
    if (!x || x.type !== 'XRECORD') return;
    const base: Omit<EntityBase, 'type'> = {
      handle: a.handle,
      layer: a.layer,
      linetype: a.linetype,
      color: a.color,
      lineweight: a.lineweight,
      ltscale: a.ltscale,
      transparency: a.transparency,
    };
    if (a.invisible) base.invisible = true;
    if (a.paperSpace) base.paperSpace = true;
    // 7이 없으면 속성의 문자 스타일(여러 줄 속성은 스타일이 하나다)
    const r = parseMlattRecord((x as XRecordObject).data, base, a.style || 'Standard');
    if (!r) return;
    a.mtext = r.mtext;
    if (r.tag) a.tag = r.tag;
    a.text = '';
    // 기록 지우기(쓸 때 판에 맞게 다시 만든다)
    dict.entries.delete(ml[0]);
    doc.objects.delete(up(ml[1]));
    const rt = entryOf(dict, ROUNDTRIP_KEY);
    const ro = rt ? doc.objects.get(up(rt[1])) : undefined;
    if (rt && ro?.type === 'XRECORD') {
      const rest = withoutRoundtripSection((ro as XRecordObject).data, MATT_HEIGHT);
      if (!rest.length) {
        dict.entries.delete(rt[0]);
        doc.objects.delete(up(rt[1]));
      } else if (rest.length !== (ro as XRecordObject).data.length) {
        (ro as XRecordObject).data = rest;
        delete ro.dwgRaw;
      }
    }
    delete dict.dwgRaw;
    if (!dict.entries.size) {
      doc.objects.delete(up(a.xdict));
      delete a.xdict;
    }
    n++;
  };
  for (const b of doc.blocks.values()) {
    for (const e of b.entities) {
      if (e.type === 'ATTDEF') visit(e as AttribEntity);
      else if (e.type === 'INSERT') for (const a of e.attribs) visit(a);
    }
  }
  return n;
}
