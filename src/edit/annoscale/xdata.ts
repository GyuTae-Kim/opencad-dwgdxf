/**
 * 주석 표지와 자체 기록.
 *
 * - AutoCAD: `1001 AcadAnnotative`, `1000 AnnotativeData`, `1002 {`, `1070 1`(판), `1070 주석(1/0)`, `1002 }`.
 *   R14 DWG·R12 DXF는 앱 이름이 대문자다. 문자·치수 스타일, 주석 블록의 BLOCK_RECORD, TEXT·MTEXT·치수 등에 붙는다.
 * - 다중 지시선 스타일은 XDATA가 아니라 MLEADERSTYLE 296이다.
 * - 예전 빌드의 자체 기록 `1001 OPENCAD_ANNOSCALE`: 치수·해치·다중 지시선의 축척 목록이었다(지금은 이 종류도 AutoCAD
 *   레코드로 쓴다 — edit.ts). `1070 1`(판), `1000 보이는 축척 이름`, `1002 {`, 축척마다 `1000 이름`, `1002 }`.
 *   읽기는 계속하고, 그 객체를 편집하거나 앱이 도면을 열 때(upgradeOwnRecords) AutoCAD 레코드로 바꾼다.
 */
import type { CadDocument, Entity, MLeaderStyleObject, XData } from '../../core/model';
import { tableKey } from '../../core/model';
import type { EditOp } from '../session';
import { upper } from './scales';

export const ANNO_APP = 'AcadAnnotative';
export const OWN_APP = 'OPENCAD_ANNOSCALE';

/** AcadAnnotative 표지: 1 = 주석, 0 = 주석 아님, undefined = 표지 없음 */
export function annotativeFlag(xdata: readonly XData[] | undefined): boolean | undefined {
  const x = xdata?.find((d) => d.app.toUpperCase() === 'ACADANNOTATIVE');
  if (!x) return undefined;
  const ints = x.items.filter((i) => i.code === 1070).map((i) => Number(i.value));
  if (ints.length < 2) return undefined;
  return ints[1] === 1;
}

/** AcadAnnotative 표지를 바꾼 XDATA(다른 앱은 그대로) */
export function withAnnotativeFlag(xdata: readonly XData[] | undefined, on: boolean): XData[] {
  const rest = (xdata ?? []).filter((d) => d.app.toUpperCase() !== 'ACADANNOTATIVE');
  const app = xdata?.find((d) => d.app.toUpperCase() === 'ACADANNOTATIVE')?.app ?? ANNO_APP;
  return [
    {
      app,
      items: [
        { code: 1000, value: 'AnnotativeData' },
        { code: 1002, value: '{' },
        { code: 1070, value: 1 },
        { code: 1070, value: on ? 1 : 0 },
        { code: 1002, value: '}' },
      ],
    },
    ...rest,
  ];
}

/** AcadAnnotative 표지를 뺀 XDATA(없으면 undefined) */
export function withoutApp(xdata: readonly XData[] | undefined, app: string): XData[] | undefined {
  const k = app.toUpperCase();
  const rest = (xdata ?? []).filter((d) => d.app.toUpperCase() !== k);
  return rest.length ? rest : undefined;
}

export interface OwnRecord {
  /** 보이는 축척 이름 */
  current: string;
  /** 지원 축척 이름(현재 포함) */
  scales: string[];
}

/** 자체 기록 읽기 */
export function ownRecord(xdata: readonly XData[] | undefined): OwnRecord | null {
  const x = xdata?.find((d) => d.app.toUpperCase() === OWN_APP);
  if (!x) return null;
  let current = '';
  const scales: string[] = [];
  let depth = 0;
  for (const it of x.items) {
    if (it.code === 1002) {
      depth += String(it.value).trim() === '{' ? 1 : -1;
      continue;
    }
    if (it.code !== 1000) continue;
    if (depth > 0) scales.push(String(it.value));
    else if (!current) current = String(it.value);
  }
  if (!scales.length) return null;
  if (!current || !scales.some((s) => s.toUpperCase() === current.toUpperCase())) current = scales[0]!;
  return { current, scales };
}

/** 자체 기록을 바꾼 XDATA(rec가 null이면 지운다) */
export function withOwnRecord(xdata: readonly XData[] | undefined, rec: OwnRecord | null): XData[] | undefined {
  const rest = (xdata ?? []).filter((d) => d.app.toUpperCase() !== OWN_APP);
  if (rec && rec.scales.length)
    rest.push({
      app: OWN_APP,
      items: [{ code: 1070, value: 1 }, { code: 1000, value: rec.current }, { code: 1002, value: '{' }, ...rec.scales.map((s) => ({ code: 1000, value: s })), { code: 1002, value: '}' }],
    });
  return rest.length ? rest : undefined;
}

/** 문자 스타일이 주석 스타일인지 */
export function textStyleAnnotative(doc: CadDocument, name: string | undefined): boolean {
  if (!name) return false;
  return annotativeFlag(doc.textStyles.get(tableKey(name))?.xdata) === true;
}

/** 치수 스타일이 주석 스타일인지 */
export function dimStyleAnnotative(doc: CadDocument, name: string | undefined): boolean {
  if (!name) return false;
  return annotativeFlag(doc.dimStyles.get(tableKey(name))?.xdata) === true;
}

/** 다중 지시선 스타일(핸들)이 주석 스타일인지(296) */
export function mleaderStyleAnnotative(doc: CadDocument, handle: string | undefined): boolean {
  if (!handle) return false;
  const o = doc.objects.get(upper(handle));
  if (!o || o.type !== 'MLEADERSTYLE') return false;
  const t = (o as MLeaderStyleObject).raw?.find((r) => r.code === 296);
  return !!t && Number(t.value) === 1;
}

/** 블록이 주석 블록인지(BLOCK_RECORD의 AcadAnnotative) */
export function blockAnnotative(doc: CadDocument, name: string | undefined): boolean {
  if (!name) return false;
  return annotativeFlag(doc.blockRecords.get(tableKey(name))?.xdata) === true;
}

/**
 * 분해(EXPLODE·BURST·분해해 넣기)할 객체가 주석 객체인지 — 값싼 표지 검사(레코드는 읽지 않는다): 주석 블록의 참조,
 * 다중 지시선은 AcadAnnotative가 없으면 293, 그 밖에는 AcadAnnotative 1
 */
export function annotativeSource(doc: CadDocument, e: Entity): boolean {
  if (e.type === 'INSERT') return blockAnnotative(doc, e.block) || annotativeFlag(e.xdata) === true;
  const f = annotativeFlag(e.xdata);
  if (e.type === 'MULTILEADER' && f === undefined) return Number(e.props?.[293]) === 1;
  return f === true;
}

/**
 * 분해 결과를 주석이 아닌 객체로 남긴다(120차, Autodesk EXPLODE 도움말 — 주석 객체는 지금 축척 표현을 분해하고 그 결과는
 * 주석이 아니다). 결과는 확정 고리가 새 객체로 보므로, 주석 문자 스타일의 문자는 표지가 없으면 주석 문자로, 원본에서
 * 이어받은 표지 1은 지금 축척 레코드를 붙여 주석으로 남겼다(실도면 841개: 주석 MTEXT 7,011, 그림 문자가 주석 스타일이고
 * 표지가 없는 주석 치수 4,364, 주석 문자 스타일의 주석 다중 지시선 3,831 — 치수·다중 지시선의 문자는 축척 배율만큼 커졌다).
 * - TEXT·MTEXT: 표지 없이 주석 문자 스타일이면 `{1, 0}`(주석 아님 — makeNonAnnotative와 같은 꼴. AutoCAD가 쓴 주석 스타일의
 *   주석 아닌 문자는 표지 0과 표지 없음이 둘 다 있다 — TEXT 51·153, MTEXT 16·106). 원본이 주석이면 표지 1도 `{1, 0}`.
 * - 원본이 주석이면 다른 객체도 이어받은 표지를 끈다: 치수·해치는 `{1, 0}`, 다중 지시선은 293 = 0, 나머지는 AcadAnnotative를 뺀다.
 *   주석 블록의 참조는 블록 정의가 정하므로 그대로 둔다. 주석이 아닌 블록 안의 주석 객체(표지 1)는 주석으로 남긴다(전과 같다).
 * 객체를 제자리에서 고친다(분해가 막 만든 새 객체).
 */
export function plainExplodedParts(doc: CadDocument, parts: readonly Entity[], fromAnno: boolean): void {
  for (const p of parts) {
    if (!p.xdata && !fromAnno && p.type !== 'TEXT' && p.type !== 'MTEXT') continue;
    const f = annotativeFlag(p.xdata);
    switch (p.type) {
      case 'TEXT':
      case 'MTEXT':
        if ((fromAnno && f === true) || (f === undefined && textStyleAnnotative(doc, p.style))) p.xdata = withAnnotativeFlag(p.xdata, false);
        break;
      case 'DIMENSION':
      case 'HATCH':
        if (fromAnno && f === true) p.xdata = withAnnotativeFlag(p.xdata, false);
        break;
      case 'MULTILEADER':
        if (fromAnno && f === true) p.xdata = withAnnotativeFlag(p.xdata, false);
        if (fromAnno && Number(p.props?.[293]) === 1) p.props = { ...p.props, 293: 0 };
        break;
      case 'INSERT':
        break;
      default:
        if (fromAnno && p.xdata?.some((d) => d.app.toUpperCase() === 'ACADANNOTATIVE')) {
          const x = withoutApp(p.xdata, ANNO_APP);
          if (x) p.xdata = x;
          else delete p.xdata;
        }
    }
  }
}

/** 블록 방향을 배치에 일치(AcadAnnoPO) */
export function blockMatchesLayout(doc: CadDocument, name: string | undefined): boolean {
  if (!name) return false;
  const x = doc.blockRecords.get(tableKey(name))?.xdata?.find((d) => d.app.toUpperCase() === 'ACADANNOPO');
  return !!x?.items.some((i) => i.code === 1070 && Number(i.value) === 1);
}

// ---------------------------------------------------------------------------
// 스타일·블록 정의의 "주석" 설정(스타일 대화상자·BLOCK이 부른다)
// ---------------------------------------------------------------------------

/** 문자 스타일의 주석 설정. 끄면 실물처럼 `{1, 0}`으로 남긴다 */
export function textStyleAnnotativeOps(doc: CadDocument, name: string, on: boolean): EditOp[] {
  const key = tableKey(name);
  const s = doc.textStyles.get(key);
  if (!s || (annotativeFlag(s.xdata) ?? false) === on) return [];
  return [{ kind: 'textStyle', key, before: s, after: { ...s, xdata: withAnnotativeFlag(s.xdata, on) } }];
}

/** 치수 스타일의 주석 설정 */
export function dimStyleAnnotativeOps(doc: CadDocument, name: string, on: boolean): EditOp[] {
  const key = tableKey(name);
  const s = doc.dimStyles.get(key);
  if (!s || (annotativeFlag(s.xdata) ?? false) === on) return [];
  return [{ kind: 'dimStyle', key, before: s, after: { ...s, xdata: withAnnotativeFlag(s.xdata, on) } }];
}

/**
 * 다중 지시선 스타일의 주석 설정(296). 원본 태그가 없는 스타일(새 도면의 Standard)은 쓰기가 296 = 0을 쓰므로 바꿀 수 없다 → 빈 배열.
 */
export function mleaderStyleAnnotativeOps(doc: CadDocument, handle: string, on: boolean): EditOp[] {
  const o = doc.objects.get(upper(handle));
  if (!o || o.type !== 'MLEADERSTYLE') return [];
  const m = o as MLeaderStyleObject;
  if (!m.raw?.some((t) => t.code === 296) || mleaderStyleAnnotative(doc, handle) === on) return [];
  const after: MLeaderStyleObject = { ...m, raw: m.raw.map((t) => (t.code === 296 ? { code: 296, value: on ? 1 : 0 } : t)) };
  delete after.dwgRaw;
  return [{ kind: 'object', key: upper(m.handle), before: m, after }];
}

/** 블록 정의의 주석 설정(BLOCK_RECORD `AcadAnnotative`, 방향 일치는 `AcadAnnoPO 1070 1`) */
export function blockAnnotativeOps(doc: CadDocument, name: string, on: boolean, matchLayout = false): EditOp[] {
  const key = tableKey(name);
  const r = doc.blockRecords.get(key);
  if (!r) return [];
  let xdata = withAnnotativeFlag(r.xdata, on).filter((d) => d.app.toUpperCase() !== 'ACADANNOPO');
  if (on && matchLayout) xdata = [...xdata, { app: 'AcadAnnoPO', items: [{ code: 1070, value: 1 }] }];
  return [{ kind: 'blockRecord', key, before: r, after: { ...r, xdata } }];
}
