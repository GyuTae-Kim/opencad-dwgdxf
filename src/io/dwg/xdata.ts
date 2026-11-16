/** 확장 자료 해석 도우미 */
import type { CadColor, XData, XDataItem } from '../../core/model';
import { entityLineweightFromIndex } from './lineweight';
import { R14, R2000 } from './version';
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
 * 이미 있는 RTTcAl은 다시 읽어 같은 색이 되면 그대로 둔다(AutoCAD가 쓴 옛 판 자료 — 모델에 트루컬러가 없어도 색 번호가 같으면 둔다).
 * 색이 다르면(앱에서 색을 바꾼 도형) 지우고 새로 만든다. RTLwPs는 그 값이 제 칸의 선가중치와 같을 때 뺀다.
 * @param aci 도형 공통 자료에 쓸 ACI(트루컬러면 가장 가까운 색 — common.ts wcolor)
 * @returns 바뀌지 않으면 받은 배열 그대로
 */
export function roundTripXDataForR2000(
  xdata: XData[] | undefined,
  e: { type: string; color: CadColor; lineweight: number; transparency?: number },
  aci: number,
): XData[] | undefined {
  const want = e.color.rgb !== undefined && !NO_RT_COLOR.has(e.type) ? e.color : undefined;
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
        if (!kept && col && (!want || (col.rgb === (want.rgb! & 0xffffff) && col.name === (want.name || undefined)))) {
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
 * RTMaterial은 이 앱이 재질 칸으로 옮기지 않아 남긴다(AutoCAD는 R2007+ DWG에서 재질 칸으로 옮기고 DXF에는 쓰지 않는다).
 * @returns 바뀌지 않으면 받은 배열 그대로
 */
export function withoutRoundTripXData(xdata: XData[] | undefined): XData[] | undefined {
  const ai = xdata ? xdata.findIndex((d) => d.app.toUpperCase() === 'ACAD') : -1;
  if (ai < 0) return xdata;
  const items = xdata![ai]!.items;
  let out: XDataItem[] | undefined;
  for (let i = 0; i < items.length; ) {
    const it = items[i]!;
    const n =
      it.code !== 1000 ? 0 : it.value === 'RTLwPs' ? (rtLwPsIndex(items, i) >= 0 ? 2 : 0) : it.value === 'RTTcAl' ? rtTcAlLength(items, i) : 0;
    if (n) {
      out ??= items.slice(0, i);
      i += n;
      continue;
    }
    out?.push(it);
    i++;
  }
  if (!out) return xdata;
  const list = [...xdata!];
  if (out.length) list[ai] = { app: xdata![ai]!.app, items: out };
  else list.splice(ai, 1);
  return list.length ? list : undefined;
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
