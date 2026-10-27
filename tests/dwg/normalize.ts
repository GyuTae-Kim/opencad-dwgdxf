/**
 * DWG 리더 요약과 기준(엔진 → DXF → ezdxf 요약) 사이의 알려진 차이를 걷어 낸다.
 * 기준 쪽이 틀린 것으로 확인한 항목만 여기서 맞추고, 나머지는 그대로 비교한다.
 *
 * 1. AC1014: 기준 DXF는 R2000으로 저장되어 version이 AC1015다.
 * 2. 기준 도구가 새 문서에 넣는 기본 항목(도면층 Defpoints, 치수 스타일 Standard, R14의 화살촉 블록)은
 *    DWG에 없으면 비교에서 뺀다.
 * 3. R2004+ 기준은 REGION·3DSOLID·BODY를 잃는다(AutoCAD DXF에는 있다). DWG 쪽에만 있으면 허용한다.
 * 4. 기준은 MESH를 ACAD_PROXY_ENTITY로 낸다(AutoCAD DXF는 MESH). 종류만 맞춘다.
 * 5. R2013+ SPLINE 플래그: AutoCAD DXF는 1160처럼 높은 비트를 쓰고 기준은 24를 낸다. 128 이상 비트가 있으면 비교하지 않는다.
 * 6. 트루컬러 도면층의 ACI: 기준은 근사 팔레트로 고른다(AutoCAD DXF와 다름). RGB가 있는 도면층은 ACI를 비교하지 않는다.
 * 7. 색상표 색(DBCOLOR) 도형: 기준은 RGB를 쓰지 않는다(AutoCAD DXF는 씀). 기준에 RGB가 없으면 지운다.
 * 8. 문자: 기준(ezdxf)은 \U+XXXX를 풀고 캐럿 표기(^J, "^ ")는 그대로 둔다. 양쪽을 글자로 푼다.
 * 9. TEXT·ATTRIB·ATTDEF 맞춤점: DWG 문자 자료 플래그 0x02는 "맞춤점 = (0, 0)"인데(AutoCAD가 같은 도면을 쓴 DXF의 11이 (0, 0)),
 *    기준은 맞춤점을 빼고 쓴다. 기준에 맞춤점이 없고 DWG 쪽이 (0, 0)이면 맞춤점을 지운다.
 * 10. 동적 블록 정의의 이름: R2000·R2004·R2007 DXF는 동적 블록 정의를 익명 블록 `*U<n>`으로 쓴다. AutoCAD도 같다
 *    (같은 도면을 AutoCAD가 R2000~R2007 DXF로 저장하면 `*U1`…, R2010+ DXF와 모든 판의 DWG는 본래 이름).
 *    DWG에는 본래 이름이 있어(기준 도구가 읽은 문서도 본래 이름) 기준 → DXF 단계에서만 이름이 바뀐다.
 *    DWG 쪽 블록 레코드에 AcDbDynamicBlockGUID 확장 자료가 있고, 블록 안 도형이나 그 블록을 가리키는 INSERT의
 *    핸들이 같을 때만 기준의 `*U<n>`을 본래 이름으로 되돌린다(dynamicBlockRenames).
 */
import type { CadDocument } from '../../src/core/model';
import { tableKey } from '../../src/core/model';
import { decodeCadEscapes } from '../../src/core/codepage';
import { decodeCaret } from '../../src/io/dxf/records';

type Obj = Record<string, unknown>;
type Ent = Obj & { type: string; handle: string; color?: { aci: number; rgb?: number } };

const ORACLE_DEFAULT_BLOCKS = /^_(CLOSEDFILLED|SMALL|DATUMFILLED|DOT|ORIGIN|OPEN30|OPEN|OBLIQUE|OPEN90|DOTBLANK|ORIGIN2|BOXFILLED|CLOSED|DATUMBLANK|NONE|DOTSMALL|INTEGRAL|ARCHTICK|BOXBLANK|CLOSEDBLANK)$/;
const ACIS = new Set(['REGION', '3DSOLID', 'BODY']);

const normText = (s: unknown): unknown => (typeof s === 'string' ? decodeCaret(decodeCadEscapes(s)) : s);

/** 이 판의 DXF가 동적 블록 정의를 `*U<n>`으로 쓰는지(R2000·R2004·R2007) */
export const DXF_RENAMES_DYNAMIC_BLOCKS = (version: unknown): boolean => version === 'AC1015' || version === 'AC1018' || version === 'AC1021';

/** 블록 하나: 열쇠(tableKey)와 그 안 도형 핸들 */
export interface BlockHandles {
  key: string;
  handles: string[];
}

/**
 * 10번: 기준 DXF의 `*U<n>` 블록 → DWG 쪽 동적 블록 정의 열쇠. 블록 안 도형 핸들이 같거나, 같은 핸들의 INSERT·DIMENSION이
 * 두 블록을 가리킬 때만 짝짓는다. 기준 쪽 이름은 DWG 쪽에 없고, DWG 쪽 이름은 기준 쪽에 없어야 한다.
 * @param expRefs·actRefs 참조 도형 핸들 → 가리키는 블록 이름
 */
export function dynamicBlockRenames(exp: BlockHandles[], act: BlockHandles[], expRefs: Map<string, string>, actRefs: Map<string, string>, isDynamic: (key: string) => boolean): Map<string, string> {
  const expKeys = new Set(exp.map((b) => b.key));
  const actKeys = new Set(act.map((b) => b.key));
  const owner = new Map<string, string>();
  for (const b of act) if (!expKeys.has(b.key) && isDynamic(b.key)) for (const h of b.handles) owner.set(h, b.key);
  const out = new Map<string, string>();
  const used = new Set<string>();
  const take = (from: string, to: string | undefined): void => {
    if (!to || out.has(from) || used.has(to)) return;
    out.set(from, to);
    used.add(to);
  };
  const candidate = (k: string) => /^\*U\d+$/.test(k) && !actKeys.has(k);
  for (const b of exp) if (candidate(b.key)) for (const h of b.handles) take(b.key, owner.get(h));
  for (const [h, name] of expRefs) {
    const k = tableKey(name);
    const to = actRefs.get(h);
    if (candidate(k) && to !== undefined && !expKeys.has(tableKey(to)) && isDynamic(tableKey(to))) take(k, tableKey(to));
  }
  return out;
}

/** 블록 레코드에 동적 블록 표지(AcDbDynamicBlockGUID 확장 자료)가 있는지 */
export function isDynamicBlock(doc: CadDocument, key: string): boolean {
  return (doc.blockRecords.get(key)?.xdata ?? []).some((x) => x.app.toUpperCase() === 'ACDBDYNAMICBLOCKGUID');
}

/** 요약에서 참조 도형 핸들 → 블록 이름 */
function refsOf(blocks: Record<string, Ent[]>): Map<string, string> {
  const out = new Map<string, string>();
  for (const list of Object.values(blocks)) for (const e of list) if (typeof e.block === 'string') out.set(e.handle, e.block);
  return out;
}

export function normalizePair(expected: Obj, actual: Obj, doc: CadDocument): void {
  const refVersion = expected.version;
  // 1
  expected.version = actual.version;
  // 2
  const actLayers = new Set((actual.layers as Obj[]).map((l) => String(l.name).toUpperCase()));
  expected.layers = (expected.layers as Obj[]).filter((l) => actLayers.has(String(l.name).toUpperCase()) || String(l.name) !== 'Defpoints');
  const actDim = new Set(actual.dimStyles as string[]);
  expected.dimStyles = (expected.dimStyles as string[]).filter((n) => actDim.has(n) || n !== 'Standard');
  const eb = expected.blocks as Record<string, Ent[]>;
  const ab = actual.blocks as Record<string, Ent[]>;
  for (const k of Object.keys(eb)) if (!(k in ab) && ORACLE_DEFAULT_BLOCKS.test(k)) delete eb[k];
  // 10
  if (DXF_RENAMES_DYNAMIC_BLOCKS(refVersion)) {
    const handles = (b: Record<string, Ent[]>) => Object.entries(b).map(([key, list]) => ({ key, handles: list.map((e) => e.handle) }));
    const renames = dynamicBlockRenames(handles(eb), handles(ab), refsOf(eb), refsOf(ab), (k) => isDynamicBlock(doc, k));
    for (const [from, to] of renames) {
      eb[to] = eb[from]!;
      delete eb[from];
    }
    for (const list of Object.values(eb))
      for (const e of list) {
        const to = typeof e.block === 'string' ? renames.get(tableKey(e.block)) : undefined;
        if (to) e.block = doc.blocks.get(to)?.name ?? to;
      }
  }
  // 6
  const rgbLayers = new Set([...doc.layers.values()].filter((l) => l.color.rgb !== undefined).map((l) => l.name));
  for (const l of expected.layers as Obj[]) if (rgbLayers.has(String(l.name))) l.color = null;
  for (const [k, list] of Object.entries(eb)) {
    const act = ab[k];
    if (!act) continue;
    const expHandles = new Set(list.map((e) => e.handle));
    // 3
    ab[k] = act.filter((e) => !(ACIS.has(e.type) && !expHandles.has(e.handle)));
    const am = new Map(ab[k].map((e) => [e.handle, e]));
    for (const e of list) {
      const a = am.get(e.handle);
      if (!a) continue;
      // 4
      if (e.type === 'ACAD_PROXY_ENTITY' && a.type === 'MESH') a.type = e.type;
      // 5
      if (e.type === 'SPLINE' && typeof a.flags === 'number' && a.flags >= 128) e.flags = null;
      // 7
      if (a.color && a.color.rgb !== undefined && e.color && e.color.rgb === undefined) {
        const de = doc.entityIndex.get(a.handle);
        if (de?.color.name) delete a.color.rgb;
      }
      // 9
      const ap = a.alignPoint as number[] | undefined;
      if (!('alignPoint' in e) && ap && ap[0] === 0 && ap[1] === 0) delete a.alignPoint;
      // 8
      if ('text' in e) {
        e.text = normText(e.text);
        a.text = normText(a.text);
      }
    }
  }
}
