/** 확장 자료 해석 도우미 */
import type { CadColor, CadDocument, MTextEntity, XData, XDataItem } from '../../core/model';
import { rawColorToCad } from '../../core/color';
import { entityLineweightFromIndex } from './lineweight';
import { R13, R14, R2000, versionNumber } from './version';
import { lwIndex } from './writer/util';

/**
 * 옛 판 DWG의 왕복 확장 자료(137차). AutoCAD는 그 판에 칸이 없는 도형 속성을 ACAD 앱 확장 자료의 "RT…" 묶음으로 남기고,
 * 같은 도면을 새 판으로 쓴 파일에는 그 묶음 없이 속성을 제 칸에 쓴다(AutoCAD가 쓴 DXF에는 어느 판이든 이 묶음이 없다).
 * 같은 도면을 AutoCAD가 여러 판으로 쓴 공개 표본 세 무리(R13·R14·R2000 ↔ R2000~R2018 새 판의 같은 핸들)에서 가른 꼴:
 * - R13·R14 "RTLwPs", 1070 = 0x80 | 선가중치 번호(도형 공통 자료의 번호 — 30은 ByBlock): 1,176/1,176 같음
 * - R2000 이하 "RTTcAl", 1070 = R2004+ 도형 색(ENC)의 플래그·색 번호 낱말(0x8000 트루컬러, 0x4000 색상표, 0x2000 투명도),
 *   1071 = 방식·RGB 낱말(0xC2RRGGBB), 다음 1000 = 색상표 이름("책$이름") 또는 "$$NoName$$": 220/220 같음
 * 읽은 확장 자료는 그대로 둔다(R2000으로 쓸 때의 정리는 roundTripXDataForR2000, R2004+ DWG·DXF로 쓸 때는 withoutRoundTripXData).
 * 투명도(0x2000)는 값 항목이 없어 쓰지 않는다.
 * 색은 낱말의 색 번호가 도형 ACI와 같을 때만 쓴다(옛 판에서 색을 바꾸면 이 자료는 그대로 남아 낡는다).
 */
export function applyRoundTripXData(e: { color: CadColor; lineweight: number }, xdata: XData[] | undefined, ver: number): void {
  const x = ver <= R2000 ? xdata?.find((d) => d.app.toUpperCase() === 'ACAD') : undefined;
  if (!x) return;
  const items = x.items;
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    if (it.code !== 1000) continue;
    if (it.value === 'RTLwPs' && ver <= R14) {
      const v = rtLwPsIndex(items, i);
      if (v >= 0) e.lineweight = entityLineweightFromIndex(v);
    } else if (it.value === 'RTTcAl') {
      const col = rtTcAlColor(items, i, e.color.aci);
      if (col) e.color = col;
    }
  }
}

/**
 * 문서가 읽을 때 RTTcAl을 트루컬러로 옮긴 판(R13~R2000 DWG — applyRoundTripXData)에서 왔는지(151차). 그런 문서에서 트루컬러가 없는 도형에 남은
 * 꼴·색 번호가 맞는 RTTcAl은 앱 편집(색 바꾸기 — 편집은 확장 자료를 그대로 둔다)으로 낡은 자료다(roundTripXDataForR2000의 applied).
 * DXF(AutoCAD는 RTTcAl을 쓰지 않는다 — 139차)·R2004+ DWG·새 도면·R12 DWG는 읽을 때 옮기지 않는다
 */
export function roundTripColorApplied(doc: Pick<CadDocument, 'format' | 'version'>): boolean {
  const v = doc.format === 'dwg' ? versionNumber(doc.version) : 0;
  return v >= R13 && v <= R2000;
}

/** items[i]가 1000 "RTLwPs"일 때 뒤 1070의 선가중치 번호(0x80 | 번호 꼴이 아니면 -1) */
function rtLwPsIndex(items: readonly XDataItem[], i: number): number {
  const v = items[i + 1];
  return v?.code === 1070 && typeof v.value === 'number' && (v.value & 0xe0) === 0x80 ? v.value & 0x1f : -1;
}

/** items[i]가 1000 "RTTcAl"일 때 색 번호가 aci인 도형에 주는 트루컬러(트루컬러 꼴이 아니거나 색 번호가 다르면 undefined) */
function rtTcAlColor(items: readonly XDataItem[], i: number, aci: number): CadColor | undefined {
  const w = items[i + 1];
  const c = items[i + 2];
  if (w?.code !== 1070 || c?.code !== 1071 || typeof w.value !== 'number' || typeof c.value !== 'number') return undefined;
  const flags = w.value & 0xff00;
  const rgb = c.value >>> 0;
  if (!(flags & 0x8000) || (w.value & 0xff) !== aci || rgb >>> 24 !== 0xc2) return undefined;
  const col: CadColor = { aci, rgb: rgb & 0xffffff };
  const nm = items[i + 3];
  if (flags & 0x4000 && nm?.code === 1000 && typeof nm.value === 'string' && nm.value && nm.value !== '$$NoName$$') col.name = nm.value;
  return col;
}

/** items[i]의 1000 "RTTcAl" 묶음 항목 수(1070·1071이 뒤따르지 않으면 0). 넷째 1000은 "$$NoName$$"이거나 색상표 플래그(0x4000)일 때의 이름 */
function rtTcAlLength(items: readonly XDataItem[], i: number): number {
  const w = items[i + 1];
  const c = items[i + 2];
  if (w?.code !== 1070 || c?.code !== 1071 || typeof w.value !== 'number') return 0;
  const nm = items[i + 3];
  return nm?.code === 1000 && (nm.value === '$$NoName$$' || (w.value & 0x4000) !== 0) ? 4 : 3;
}

/** items[i]가 꼴이 맞는 RTLwPs·RTTcAl 묶음이면 항목 수, 아니면 0 */
function rtGroupLength(items: readonly XDataItem[], i: number): number {
  const v = items[i]!.value;
  return v === 'RTLwPs' ? (rtLwPsIndex(items, i) >= 0 ? 2 : 0) : v === 'RTTcAl' ? rtTcAlLength(items, i) : 0;
}

/** AutoCAD는 PDF 언더레이에 RTTcAl을 남기지 않는다(같은 도면 R2004 판의 트루컬러 도형 23개 가운데 R2000 판에 없는 하나). 같은 언더레이 무리도 함께 뺀다 */
const NO_RT_COLOR = new Set(['PDFUNDERLAY', 'DWFUNDERLAY', 'DGNUNDERLAY']);

/** AutoCAD가 옛 판으로 저장할 때 ACAD 확장 자료에 만드는 여러 줄 문자 묶음(RT 묶음은 이 앞에 온다) */
const isMTextGroup = (it: XDataItem): boolean => it.code === 1000 && typeof it.value === 'string' && (it.value === 'MTEXTBEGIN' || it.value.startsWith('ACAD_MTEXT_'));

/**
 * R2000 DWG로 쓸 도형의 ACAD 왕복 확장 자료(138차). R2000 도형 색 칸은 ACI뿐이라 AutoCAD는 트루컬러·색상표 색을 "RTTcAl" 묶음으로 남기고,
 * 선가중치는 제 칸에 쓴다(RTLwPs 없음). AutoCAD가 같은 도면을 R2004와 R2000으로 쓴 짝(트루컬러 도형 22개)에서 가른 꼴:
 * - 1070 = 0x8000 | 색상표면 0x4000 | 투명도가 ByLayer가 아니면 0x2000 | 도형 ACI(R2004 ENC 낱말과 같다), 1071 = 0xC2RRGGBB,
 *   1000 = 색상표 이름 또는 "$$NoName$$". ACI 색 도형(투명도만 있는 것 포함)과 PDF 언더레이에는 없다
 * - ACAD 자료가 이미 있으면 그 끝(DSTYLE·HATCH 같은 묶음 뒤, RTLwPs 뒤)에 붙고 저장 때 만드는 MTEXTBEGIN·ACAD_MTEXT_… 묶음 앞에 온다.
 *   ACAD 자료가 없으면 다른 앱 자료 뒤에 ACAD를 더한다(R13~R2004 표본의 RT 묶음 도형 차례)
 * 이미 있는 RTTcAl은 다시 읽어 같은 색이 되면 그대로 둔다(AutoCAD가 쓴 옛 판 자료). 모델에 트루컬러가 없어도 색 번호가 같으면 두는 것은
 * 읽을 때 RTTcAl을 옮기지 않는 원본(DXF·R2004+ DWG·새 도면 — 예전 판 이 앱이 옮겨 쓴 자료를 살리려고)에서만이다(151차 — applied).
 * 색이 다르면(앱에서 색을 바꾼 도형) 지우고 새로 만든다. RTLwPs는 그 값이 제 칸의 선가중치와 같을 때 뺀다.
 * @param aci 도형 공통 자료에 쓸 ACI(트루컬러면 가장 가까운 색 — common.ts wcolor)
 * @param applied 문서를 읽을 때 RTTcAl을 트루컬러로 옮긴 판(R13~R2000 DWG — roundTripColorApplied)에서 읽었다: 트루컬러가 없는 도형에 남은
 *   색 번호가 같은 묶음은 앱에서 그 번호의 ACI로 바꾼 낡은 자료라 뺀다(AutoCAD R2000 판의 ACI 색 도형처럼 — 전에는 다시 열면 바꾸기 전 트루컬러가 돌아왔다)
 * @returns 바뀌지 않으면 받은 배열 그대로
 */
export function roundTripXDataForR2000(
  xdata: XData[] | undefined,
  e: { type: string; color: CadColor; lineweight: number; transparency?: number },
  aci: number,
  applied = false,
): XData[] | undefined {
  const want = e.color.rgb !== undefined && !NO_RT_COLOR.has(e.type) ? e.color : undefined;
  // 읽을 때 옮겼다면 트루컬러가 없는 도형의 묶음은 편집으로 낡은 것(PDF 언더레이처럼 트루컬러가 있는데 묶음을 만들지 않는 도형은 그대로 둔다)
  const stale = applied && e.color.rgb === undefined;
  const ai = xdata ? xdata.findIndex((d) => d.app.toUpperCase() === 'ACAD') : -1;
  if (ai < 0 && !want) return xdata;
  const items = ai >= 0 ? xdata![ai]!.items : [];
  const lw = entityLineweightFromIndex(lwIndex(e.lineweight));
  const out: XDataItem[] = [];
  let changed = false;
  let kept = false;
  let at = -1;
  for (let i = 0; i < items.length; ) {
    const it = items[i]!;
    if (it.code === 1000 && it.value === 'RTTcAl') {
      const n = rtTcAlLength(items, i);
      if (n) {
        const col = rtTcAlColor(items, i, aci);
        if (!kept && col && (want ? col.rgb === (want.rgb! & 0xffffff) && col.name === (want.name || undefined) : !stale)) {
          kept = true;
          for (let k = 0; k < n; k++) out.push(items[i + k]!);
        } else {
          changed = true;
          if (at < 0) at = out.length;
        }
        i += n;
        continue;
      }
    } else if (it.code === 1000 && it.value === 'RTLwPs') {
      const v = rtLwPsIndex(items, i);
      if (v >= 0 && entityLineweightFromIndex(v) === lw) {
        changed = true;
        i += 2;
        continue;
      }
    }
    out.push(it);
    i++;
  }
  if (want && !kept) {
    const word = 0x8000 | (want.name ? 0x4000 : 0) | ((e.transparency ?? -1) !== -1 ? 0x2000 : 0) | (aci & 0xff);
    const group: XDataItem[] = [
      { code: 1000, value: 'RTTcAl' },
      { code: 1070, value: (word << 16) >> 16 },
      { code: 1071, value: (0xc2000000 | (want.rgb! & 0xffffff)) | 0 },
      { code: 1000, value: want.name || '$$NoName$$' },
    ];
    if (at < 0) at = out.findIndex(isMTextGroup);
    out.splice(at < 0 ? out.length : at, 0, ...group);
    changed = true;
  }
  if (!changed) return xdata;
  const list = xdata ? [...xdata] : [];
  if (ai < 0) list.push({ app: 'ACAD', items: out });
  else if (out.length) list[ai] = { app: xdata![ai]!.app, items: out };
  else list.splice(ai, 1);
  return list.length ? list : undefined;
}

/**
 * R2004+ DWG·DXF(모든 판)로 쓸 도형의 ACAD 확장 자료에서 왕복 묶음 "RTLwPs"·"RTTcAl"을 뺀다(139차). 이 앱은 R13·R14 RTLwPs를 선가중치로,
 * R2000 이하 RTTcAl을 트루컬러로 읽어 제 칸에 두고, AutoCAD는 같은 도면을 R2004+ DWG나 DXF로 쓸 때 이 묶음을 남기지 않는다.
 * AutoCAD가 같은 도면을 여러 판으로 쓴 세 무리(LibreDWG example·Leader, ACadSharp sample)에서 옛 판 RT 객체 ↔ 같은 핸들 새 판 객체:
 * RTLwPs는 R2004+ DWG 980쌍·DXF(R12~R2018) 1,602쌍, RTTcAl은 R2004+ DWG 220쌍·DXF 308쌍 모두 없다. 묶음만 있던 도형은 ACAD 자료째 없다.
 * 꼴이 맞는 묶음만 뺀다(1070이 0x80 | 번호가 아닌 RTLwPs, 1070·1071이 뒤따르지 않는 RTTcAl은 그대로). 나머지 ACAD 자료는 그대로 둔다.
 * RTMaterial(1005 재질 핸들)은 written이 있을 때만 본다(141차 — droppableRtMaterial).
 * @param mtext MTEXT를 R2004+ DWG나 R2000이 아닌 DXF로 쓴다: 여러 줄 문자 저장 묶음(MTEXTBEGIN·ACAD_MTEXT_BBRT)도 뺀다(140차 — droppableMTextSave)
 * @param written R2007+ DWG나 DXF로 쓴다: 그 핸들의 객체를 출력에 쓰는지. 쓰지 않는 재질을 가리키는 RTMaterial을 뺀다
 * @returns 바뀌지 않으면 받은 배열 그대로
 */
export function withoutRoundTripXData(xdata: XData[] | undefined, mtext = false, written?: (handle: string) => boolean): XData[] | undefined {
  const ai = xdata ? xdata.findIndex((d) => d.app.toUpperCase() === 'ACAD') : -1;
  if (ai < 0) return xdata;
  const items = xdata![ai]!.items;
  let out: XDataItem[] | undefined;
  for (let i = 0; i < items.length; ) {
    const it = items[i]!;
    const n =
      it.code !== 1000 ? 0 : rtGroupLength(items, i) || (mtext ? droppableMTextSave(items, i) : 0) || (written ? droppableRtMaterial(items, i, written) : 0);
    if (n) {
      out ??= items.slice(0, i);
      i += n;
      continue;
    }
    out?.push(it);
    i++;
  }
  return withAcadItems(xdata!, ai, out);
}

/** ACAD 자료(ai번째)의 항목을 out으로 바꾼 목록(out이 없으면 받은 그대로, 비면 ACAD 자료째 빼고, 다 비면 undefined) */
function withAcadItems(xdata: XData[], ai: number, out: XDataItem[] | undefined): XData[] | undefined {
  if (!out) return xdata;
  const list = [...xdata];
  if (out.length) list[ai] = { app: xdata[ai]!.app, items: out };
  else list.splice(ai, 1);
  return list.length ? list : undefined;
}

/**
 * items[i]가 쓰지 않는 객체를 가리키는 "RTMaterial"(1000 이름, 1005 재질 핸들)이면 2, 아니면 0(141차).
 * AutoCAD는 R2004 이하 DWG에 칸이 없는 도형 재질을 이 묶음으로 남기고, 같은 도면을 R2007+ DWG로 쓸 때는 재질 칸으로 옮기며
 * DXF에는 어느 판이든 쓰지 않는다(같은 도면을 여러 판으로 쓴 두 무리 — 옛 판 RTMaterial 도형 ↔ 같은 핸들: R2007+ DWG 57쌍·DXF 133쌍 모두 없음,
 * R2000·R2004 DWG 26쌍은 모두 남음). 이 앱은 가리키는 MATERIAL 객체를 같은 판으로 쓸 때만 옮기므로 R2007+ DWG·DXF 출력에서 이 핸들은 늘 끊긴다 —
 * 그런 묶음만 뺀다(가리키는 객체를 쓰면 그대로 둔다)
 */
function droppableRtMaterial(items: readonly XDataItem[], i: number, written: (handle: string) => boolean): number {
  if (items[i]!.value !== 'RTMaterial') return 0;
  const h = items[i + 1];
  return h?.code === 1005 && typeof h.value === 'string' && !written(h.value) ? 2 : 0;
}

// ---------------------------------------------------------------------------
// 여러 줄 문자 저장 묶음(140차)
// ---------------------------------------------------------------------------

/**
 * AutoCAD가 MTEXT를 옛 판으로 저장할 때 ACAD 확장 자료에 남기는 여러 줄 문자 저장 묶음(시작 이름 → 끝 이름). 사이는 (1070 DXF 코드, 값) 짝이다.
 * 같은 도면을 AutoCAD가 여러 판으로 쓴 세 무리(LibreDWG example·Leader, ACadSharp sample)와 실제 도면 841개에서 가른 꼴:
 * - MTEXTBEGIN: (73, 1070 줄 간격 방식)(44, 1040 줄 간격 배수)(74, 1070 0). AutoCAD R2000 DWG·DXF는 모든 MTEXT에 두고(65/65·64/64) 값이 제 칸 73·44와 같다.
 *   R14 DWG에도 있다(1,552개) — 줄 간격 칸이 없는 판이라 이것이 그 값이다(73 = 2인 표본 MTEXT는 AutoCAD R2000+ 판에서 줄 간격 방식 2)
 * - ACAD_MTEXT_BBRT…ACAD_MTEXT_BERT: (91, 1071 배경 플래그)(46, 1040 배경 배율)(64, 1071 배경 색 원시 정수 0xC2RRGGBB)(65, 1000 "")(66, 1000 "")(442, 1071 0).
 *   배경 칸이 없는 R2000 이하 DWG·R2000 DXF의 배경 채우기다(표본 MTEXT 두 개 × R14·R2000 DWG·R2000 DXF — AutoCAD R2004+ 판 같은 핸들은 배경 플래그 1·배율 1.25·같은 RGB).
 *   코드는 R2004+ DXF의 배경 칸(90 플래그·45 배율·441 투명도)보다 하나 크다
 * AutoCAD는 R13 DWG·R12~R14 DXF·R2004+ DWG·DXF에는 두 묶음을 쓰지 않는다(R2004+는 제 칸에).
 */
const MTEXT_SAVE = new Map([
  ['MTEXTBEGIN', 'MTEXTEND'],
  ['ACAD_MTEXT_BBRT', 'ACAD_MTEXT_BERT'],
]);

interface MTextSave {
  name: string;
  /** 항목 수(시작·끝 이름 포함) */
  len: number;
  /** DXF 코드 → 값 항목 */
  kv: Map<number, XDataItem>;
}

/** items[i]가 꼴이 맞는 저장 묶음(1000 시작 이름, (1070 코드, 값)…, 1000 끝 이름 — 코드는 겹치지 않는다)이면 그 내용 */
function mtextSaveAt(items: readonly XDataItem[], i: number): MTextSave | undefined {
  const it = items[i];
  const name = it?.code === 1000 && typeof it.value === 'string' ? it.value : '';
  const end = MTEXT_SAVE.get(name);
  if (!end) return undefined;
  const kv = new Map<number, XDataItem>();
  for (let j = i + 1; j < items.length; j += 2) {
    const k = items[j]!;
    if (k.code === 1000 && k.value === end) return { name, len: j - i + 1, kv };
    const v = items[j + 1];
    if (k.code !== 1070 || typeof k.value !== 'number' || !v || kv.has(k.value)) return undefined;
    kv.set(k.value, v);
  }
  return undefined;
}

/** 값 항목이 그 코드의 유한한 수이면 그 수 */
function numOf(it: XDataItem | undefined, code: number): number | undefined {
  return it?.code === code && typeof it.value === 'number' && Number.isFinite(it.value) ? it.value : undefined;
}

/** MTEXTBEGIN의 줄 간격(방식 1 최소·2 정확하게, 배수 양수 — 둘 다 맞아야) */
function mtbLineSpacing(g: MTextSave): { style: number; factor: number } | undefined {
  const style = numOf(g.kv.get(73), 1070);
  const factor = numOf(g.kv.get(44), 1040);
  return (style === 1 || style === 2) && factor !== undefined && factor > 0 ? { style, factor } : undefined;
}

/** BBRT의 배경(플래그 1 배경 색·2 도면 창 색·16 문자 틀 밖 비트가 있거나, 배경 색(1)인데 색이 없으면 undefined) */
function bbrtBackground(g: MTextSave): { flags: number; scale?: number; color?: CadColor } | undefined {
  const flags = numOf(g.kv.get(91), 1071);
  if (flags === undefined || flags & ~0x13) return undefined;
  const raw = numOf(g.kv.get(64), 1071);
  if (flags & 1 && raw === undefined) return undefined;
  const scale = numOf(g.kv.get(46), 1040);
  return { flags, scale: scale !== undefined && scale > 0 ? scale : undefined, color: flags & 1 ? rawColorToCad(raw!) : undefined };
}

/**
 * 옛 판 MTEXT의 저장 묶음을 모델 칸으로 읽는다(140차). 확장 자료는 그대로 둔다(R2000으로 쓸 때 AutoCAD처럼 남긴다 — mtextSaveXDataForR2000).
 * 전에는 R14 DWG의 줄 간격 방식·배수를 기본값(1·1)으로, R2000 이하의 배경 채우기를 없음으로 읽었다.
 * @param lineSpacing 줄 간격 칸이 없는 판(R13·R14 DWG): MTEXTBEGIN 73·44(둘 다 맞을 때)
 * @param background 배경 칸이 없는 판(R2000 이하 DWG·DXF): BBRT 91·46·64. 배경이 이미 있으면(다른 프로그램이 쓴 DXF의 90) 두지 않는다
 */
export function applyMTextSaveXData(e: MTextEntity, lineSpacing: boolean, background: boolean): void {
  const items = e.xdata?.find((d) => d.app.toUpperCase() === 'ACAD')?.items;
  if (!items) return;
  for (let i = 0; i < items.length; i++) {
    const g = mtextSaveAt(items, i);
    if (!g) continue;
    if (g.name === 'MTEXTBEGIN') {
      const ls = lineSpacing ? mtbLineSpacing(g) : undefined;
      if (ls) {
        e.lineSpacingStyle = ls.style;
        e.lineSpacingFactor = ls.factor;
      }
    } else if (background && !e.backgroundFlags) {
      const bg = bbrtBackground(g);
      if (bg) {
        e.backgroundFlags = bg.flags;
        if (bg.scale !== undefined) e.backgroundScale = bg.scale;
        if (bg.color) e.backgroundColor = bg.color;
      }
    }
    i += g.len - 1;
  }
}

/**
 * items[i]가 MTEXT를 R2004+ DWG·R2000이 아닌 DXF로 쓸 때 뺄 저장 묶음이면 항목 수(아니면 0). AutoCAD는 그 판에 두 묶음을 쓰지 않고 값은 제 칸(줄 간격 73·44,
 * 배경 90·45·63)에 쓴다 — 이 앱도 옛 판에서 모델 칸으로 읽었다(applyMTextSaveXData). 모델에 없는 값이 든 묶음은 남긴다(값을 잃지 않게):
 * MTEXTBEGIN은 꼴이 맞는 73·44와 74 = 0만, BBRT는 읽을 수 있고 이름 65·66이 비며 442(배경 투명도 — 쓰기는 늘 0)가 0일 때만 뺀다.
 */
function droppableMTextSave(items: readonly XDataItem[], i: number): number {
  const g = mtextSaveAt(items, i);
  if (!g) return 0;
  if (g.name === 'MTEXTBEGIN') {
    if (!mtbLineSpacing(g)) return 0;
    for (const [k, v] of g.kv) if (k !== 73 && k !== 44 && !(k === 74 && numOf(v, 1070) === 0)) return 0;
    return g.len;
  }
  if (!bbrtBackground(g)) return 0;
  for (const [k, v] of g.kv) {
    if (k === 65 || k === 66) {
      if (v.code !== 1000 || v.value !== '') return 0;
    } else if (k === 442) {
      if (numOf(v, 1071) !== 0) return 0;
    } else if (k !== 91 && k !== 46 && k !== 64) return 0;
  }
  return g.len;
}

type MTextSaveFields = Pick<MTextEntity, 'lineSpacingStyle' | 'lineSpacingFactor' | 'backgroundFlags' | 'backgroundScale' | 'backgroundColor'>;

/** AutoCAD R2000 꼴의 MTEXTBEGIN 묶음 */
function mtbItems(style: number, factor: number): XDataItem[] {
  return [
    { code: 1000, value: 'MTEXTBEGIN' },
    { code: 1070, value: 73 },
    { code: 1070, value: style },
    { code: 1070, value: 44 },
    { code: 1040, value: factor },
    { code: 1070, value: 74 },
    { code: 1070, value: 0 },
    { code: 1000, value: 'MTEXTEND' },
  ];
}

/** 표본 꼴(배경 색 1·트루컬러·이름 없음)의 BBRT 묶음. 그 밖의 배경(도면 창 색 2, ACI·색상표 색)은 AutoCAD 실물이 없어 만들지 않는다 */
function bbrtItems(e: MTextSaveFields): XDataItem[] | undefined {
  const c = e.backgroundColor;
  if (e.backgroundFlags !== 1 || c?.rgb === undefined || c.name) return undefined;
  return [
    { code: 1000, value: 'ACAD_MTEXT_BBRT' },
    { code: 1070, value: 91 },
    { code: 1071, value: 1 },
    { code: 1070, value: 46 },
    { code: 1040, value: e.backgroundScale || 1.5 },
    { code: 1070, value: 64 },
    { code: 1071, value: (0xc2000000 | (c.rgb & 0xffffff)) | 0 },
    { code: 1070, value: 65 },
    { code: 1000, value: '' },
    { code: 1070, value: 66 },
    { code: 1000, value: '' },
    { code: 1070, value: 442 },
    { code: 1071, value: 0 },
    { code: 1000, value: 'ACAD_MTEXT_BERT' },
  ];
}

/**
 * R2000 DWG·DXF로 쓸 MTEXT의 저장 묶음(140차). AutoCAD는 R2000 판의 모든 MTEXT에 MTEXTBEGIN을 두고(실제 도면 R2000 DWG 65/65·DXF 64/64, 값은 제 칸 73·44와 같다)
 * 배경이 있으면 그 뒤에 BBRT를 둔다. 그래서:
 * - MTEXTBEGIN이 없으면 제 칸 줄 간격으로 만든다(자리: BBRT·ACAD_MTEXT_DEFINED_HEIGHT 앞, 없으면 ACAD 자료 끝 — 단 정보 ACAD_MTEXT_COLUMN_INFO·RT 묶음은
 *   앞에 온다. ACAD 자료가 없으면 다른 앱 뒤에 더한다). 표준 꼴의 MTEXTBEGIN이 제 칸과 다르면(앱에서 줄 간격을 바꾼 MTEXT) 제 칸 값으로 고친다
 * - BBRT가 모델 배경과 다르면 뺀다(앱에서 배경을 바꾸거나 지운 MTEXT — R2000에는 배경 칸이 없어 남기면 다시 열 때 낡은 배경이 살아난다).
 *   모델 배경이 표본 꼴(배경 색·트루컬러·이름 없음)이고 BBRT가 없으면 MTEXTBEGIN 바로 뒤에 만든다(전에는 R2000으로 쓰면 배경을 잃었다)
 * 읽지 못한 꼴의 묶음은 그대로 둔다.
 * @returns 바뀌지 않으면 받은 배열 그대로
 */
export function mtextSaveXDataForR2000(xdata: XData[] | undefined, e: MTextSaveFields): XData[] | undefined {
  const ai = xdata ? xdata.findIndex((d) => d.app.toUpperCase() === 'ACAD') : -1;
  const items = ai >= 0 ? xdata![ai]!.items : [];
  const style = e.lineSpacingStyle || 1;
  const factor = e.lineSpacingFactor || 1;
  const out: XDataItem[] = [];
  let changed = false;
  let mtbEnd = -1;
  let hasBbrt = false;
  for (let i = 0; i < items.length; ) {
    const g = mtextSaveAt(items, i);
    if (!g) {
      out.push(items[i++]!);
      continue;
    }
    if (g.name === 'ACAD_MTEXT_BBRT') {
      if (!sameBackground(g, e)) {
        changed = true;
        i += g.len;
        continue;
      }
      hasBbrt = true;
    } else if (mtbEnd < 0) {
      // 표준 꼴(73·44·74 = 0)인데 제 칸과 다르면 제 칸 값으로
      const ls = mtbLineSpacing(g);
      if (ls && g.kv.size === 3 && numOf(g.kv.get(74), 1070) === 0 && (ls.style !== style || ls.factor !== factor)) {
        out.push(...mtbItems(style, factor));
        mtbEnd = out.length;
        changed = true;
        i += g.len;
        continue;
      }
      mtbEnd = out.length + g.len;
    }
    for (let k = 0; k < g.len; k++) out.push(items[i + k]!);
    i += g.len;
  }
  if (mtbEnd < 0) {
    let at = out.findIndex((it) => it.code === 1000 && (it.value === 'ACAD_MTEXT_BBRT' || it.value === 'ACAD_MTEXT_DEFINED_HEIGHT_BEGIN'));
    if (at < 0) at = out.length;
    out.splice(at, 0, ...mtbItems(style, factor));
    mtbEnd = at + 8;
    changed = true;
  }
  const bb = hasBbrt ? undefined : bbrtItems(e);
  if (bb) {
    out.splice(mtbEnd, 0, ...bb);
    changed = true;
  }
  if (!changed) return xdata;
  if (ai >= 0) return withAcadItems(xdata!, ai, out);
  return [...(xdata ?? []), { app: 'ACAD', items: out }];
}

/** BBRT가 모델 배경(플래그·배율·색)과 같은지(읽지 못하는 꼴이면 같다고 본다 — 그대로 둔다) */
function sameBackground(g: MTextSave, e: Pick<MTextEntity, 'backgroundFlags' | 'backgroundScale' | 'backgroundColor'>): boolean {
  const bg = bbrtBackground(g);
  if (!bg) return true;
  if (bg.flags !== (e.backgroundFlags ?? 0)) return false;
  if (bg.scale !== undefined && bg.scale !== e.backgroundScale) return false;
  const c = e.backgroundColor;
  return !bg.color || (!!c && c.aci === bg.color.aci && c.rgb === bg.color.rgb && !c.name);
}

/**
 * ACAD 앱의 DSTYLE 재지정: 1000 "DSTYLE", 1002 "{", (1070 그룹 코드, 값)… 1002 "}"
 * 그룹 코드 → 값
 */
export function parseDimOverrides(xdata: XData[] | undefined): Record<number, string | number> | undefined {
  const x = xdata?.find((d) => d.app.toUpperCase() === 'ACAD');
  if (!x) return undefined;
  const items = x.items;
  let i = items.findIndex((it) => it.code === 1000 && typeof it.value === 'string' && it.value.toUpperCase() === 'DSTYLE');
  if (i < 0) return undefined;
  i++;
  if (items[i]?.code === 1002) i++;
  const out: Record<number, string | number> = {};
  for (; i + 1 < items.length; i += 2) {
    const k = items[i];
    if (k.code !== 1070) break;
    const v = items[i + 1].value;
    out[Number(k.value)] = typeof v === 'number' || typeof v === 'string' ? v : String(v);
  }
  return out;
}
