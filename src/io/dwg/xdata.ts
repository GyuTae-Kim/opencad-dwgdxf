/** 확장 자료 해석 도우미 */
import type { CadColor, XData } from '../../core/model';
import { entityLineweightFromIndex } from './lineweight';
import { R14, R2000 } from './version';

/**
 * 옛 판 DWG의 왕복 확장 자료(137차). AutoCAD는 그 판에 칸이 없는 도형 속성을 ACAD 앱 확장 자료의 "RT…" 묶음으로 남기고,
 * 같은 도면을 새 판으로 쓴 파일에는 그 묶음 없이 속성을 제 칸에 쓴다(AutoCAD가 쓴 DXF에는 어느 판이든 이 묶음이 없다).
 * 같은 도면을 AutoCAD가 여러 판으로 쓴 공개 표본 세 무리(R13·R14·R2000 ↔ R2000~R2018 새 판의 같은 핸들)에서 가른 꼴:
 * - R13·R14 "RTLwPs", 1070 = 0x80 | 선가중치 번호(도형 공통 자료의 번호 — 30은 ByBlock): 1,176/1,176 같음
 * - R2000 이하 "RTTcAl", 1070 = R2004+ 도형 색(ENC)의 플래그·색 번호 낱말(0x8000 트루컬러, 0x4000 색상표, 0x2000 투명도),
 *   1071 = 방식·RGB 낱말(0xC2RRGGBB), 다음 1000 = 색상표 이름("책$이름") 또는 "$$NoName$$": 220/220 같음
 * 확장 자료는 그대로 둔다(이 앱은 RT 묶음을 새로 만들지 않고, 읽은 묶음은 전처럼 다시 쓴다). 투명도(0x2000)는 값 항목이 없어 쓰지 않는다.
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
      const v = items[i + 1];
      if (v?.code === 1070 && typeof v.value === 'number' && (v.value & 0xe0) === 0x80) e.lineweight = entityLineweightFromIndex(v.value & 0x1f);
    } else if (it.value === 'RTTcAl') {
      const w = items[i + 1];
      const c = items[i + 2];
      if (w?.code !== 1070 || c?.code !== 1071 || typeof w.value !== 'number' || typeof c.value !== 'number') continue;
      const flags = w.value & 0xff00;
      const rgb = c.value >>> 0;
      if (!(flags & 0x8000) || (w.value & 0xff) !== e.color.aci || rgb >>> 24 !== 0xc2) continue;
      const col: CadColor = { aci: e.color.aci, rgb: rgb & 0xffffff };
      const nm = items[i + 3];
      if (flags & 0x4000 && nm?.code === 1000 && typeof nm.value === 'string' && nm.value && nm.value !== '$$NoName$$') col.name = nm.value;
      e.color = col;
    }
  }
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
