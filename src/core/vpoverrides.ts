/**
 * 뷰포트별 도면층 재지정(AutoCAD 2008+ "VP 색상·VP 선가중치·VP 투명도"): 도면층 확장 사전의 XRECORD
 * ADSK_XREC_LAYER_COLOR_OVR(420)·ADSK_XREC_LAYER_LINEWT_OVR(91)·ADSK_XREC_LAYER_ALPHA_OVR(440)·ADSK_XREC_LAYER_LINETYPE_OVR(343)에
 * {뷰포트 핸들 335, 값} 쌍으로 들어 있다(형식은 ezdxf 문서로 확인).
 * 색·선가중치·투명도는 그 뷰포트의 도면층 상태로 바꿔 그린다. 선종류 재지정은 장면을 다시 만들어야 해서 아직 쓰지 않는다.
 */
import type { CadDocument, DictionaryObject, XRecordObject } from './model';
import { ACI_RGB } from './color';

export interface LayerOverride {
  /** 트루컬러(0xRRGGBB) 또는 ACI */
  rgb?: number;
  aci?: number;
  /** 1/100 mm */
  lineweight?: number;
  /** 0..255 불투명도 */
  transparency?: number;
  /** 선종류 레코드 핸들(쓰지 않고 남겨 둔다) */
  linetype?: string;
}

const KEYS: [string, number, keyof LayerOverride][] = [
  ['ADSK_XREC_LAYER_COLOR_OVR', 420, 'rgb'],
  ['ADSK_XREC_LAYER_LINEWT_OVR', 91, 'lineweight'],
  ['ADSK_XREC_LAYER_ALPHA_OVR', 440, 'transparency'],
  ['ADSK_XREC_LAYER_LINETYPE_OVR', 343, 'linetype'],
];

type Table = Map<string, Map<string, LayerOverride>>;
const cache = new WeakMap<CadDocument, { sig: string; table: Table }>();

/** 문서 전체: 뷰포트 핸들(대문자) → 도면층 키(대문자) → 재지정 */
export function viewportOverrideTable(doc: CadDocument): Table {
  const sig = `${doc.objects.size}|${doc.layers.size}`;
  const c = cache.get(doc);
  if (c && c.sig === sig) return c.table;
  const table: Table = new Map();
  for (const [key, layer] of doc.layers) {
    const xd = layer.xdict ? (doc.objects.get(layer.xdict) as DictionaryObject | undefined) : undefined;
    if (!xd?.entries) continue;
    for (const [name, code, field] of KEYS) {
      const h = xd.entries.get(name);
      const xr = h ? (doc.objects.get(h) as XRecordObject | undefined) : undefined;
      if (!xr || xr.type !== 'XRECORD') continue;
      let vp: string | null = null;
      for (const t of xr.data) {
        if (t.code === 335) vp = String(t.value).toUpperCase();
        else if (t.code === code && vp) {
          let per = table.get(vp);
          if (!per) table.set(vp, (per = new Map()));
          const o = per.get(key) ?? {};
          if (field === 'rgb') {
            const v = Number(t.value) >>> 0;
            const kind = (v >>> 24) & 0xff;
            if (kind === 0xc2) o.rgb = v & 0xffffff;
            else if (kind === 0xc3) o.aci = v & 0xff;
          } else if (field === 'lineweight') o.lineweight = Number(t.value);
          else if (field === 'transparency') o.transparency = Number(t.value) & 0xff;
          else o.linetype = String(t.value);
          per.set(key, o);
          vp = null;
        }
      }
    }
  }
  cache.set(doc, { sig, table });
  return table;
}

/** 뷰포트 하나의 재지정(없으면 null) */
export function viewportOverrides(doc: CadDocument, vpHandle: string | undefined): Map<string, LayerOverride> | null {
  if (!vpHandle) return null;
  return viewportOverrideTable(doc).get(vpHandle.toUpperCase()) ?? null;
}

/** 도면층 상태(이름·색·선가중치·투명도)에 재지정을 입힌 사본 */
export function applyLayerOverride<T extends { rgb: number; aci: number; hasRgb: boolean; lineweight: number; transparency: number }>(s: T, o: LayerOverride): T {
  const out = { ...s };
  if (o.rgb !== undefined) {
    out.rgb = o.rgb;
    out.hasRgb = true;
  } else if (o.aci !== undefined) {
    out.aci = o.aci;
    out.rgb = ACI_RGB[o.aci & 255] ?? out.rgb;
    out.hasRgb = false;
  }
  if (o.lineweight !== undefined) out.lineweight = o.lineweight;
  if (o.transparency !== undefined) out.transparency = o.transparency;
  return out;
}
