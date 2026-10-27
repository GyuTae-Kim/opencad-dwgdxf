/**
 * 훑기 기록 → 분류·품질 지표·요약(순수 함수, 비교 도구와 같이 쓴다).
 */
import type { FileRecord, StepError, Tally, WriteRecord } from './record';

const inc = (t: Tally, k: string, n = 1) => {
  t[k] = (t[k] ?? 0) + n;
};

/**
 * 파일 분류(나쁜 것부터 하나): 시간 넘김·워커 죽음·읽기·장면·쓰기·다시 읽기 실패, 왕복 차이, 정상.
 * 왕복 차이는 객체(그림 요소)의 수·값이나 도면층·블록 이름이 달라진 것만 — 비그래픽 객체(MATERIAL 등)가 빠지는 것은 종류별로만 센다.
 */
export type FileClass = 'timeout' | 'crash' | 'read-fail' | 'scene-fail' | 'write-fail' | 'reread-fail' | 'roundtrip-diff' | 'ok';
export const CLASS_ORDER: FileClass[] = ['timeout', 'crash', 'read-fail', 'scene-fail', 'write-fail', 'reread-fail', 'roundtrip-diff', 'ok'];

const writes = (r: FileRecord): [string, WriteRecord][] => Object.entries(r.writes ?? {});

/** 장면 실패(배치 블록이 없는 것은 실패로 보지 않는다) */
const sceneFailed = (r: FileRecord) => !!r.scene?.error || (r.scene?.spaces ?? []).some((s) => !s.ok && s.error?.err !== 'no block');

/** 왕복 차이 종류(대상 하나): count:종류:+/-, field:종류.속성, name:layer|block, object:종류:- */
export function rereadKinds(w: WriteRecord): string[] {
  const rr = w.reread;
  if (!rr?.ok) return [];
  const out: string[] = [];
  for (const [t, d] of Object.entries(rr.countDelta ?? {})) out.push(`count:${t}:${d > 0 ? '+' : '-'}`);
  for (const f of Object.keys(rr.fieldDiffs ?? {})) out.push(`field:${f}`);
  if (rr.layersLost?.length) out.push('name:layer');
  if (rr.blocksLost?.length) out.push('name:block');
  for (const [t, d] of Object.entries(rr.objDelta ?? {})) if (d < 0) out.push(`object:${t}:-`);
  return out;
}

export function classify(r: FileRecord): FileClass {
  if (r.fatal) return r.fatal.startsWith('TIMEOUT') ? 'timeout' : 'crash';
  if (!r.read?.ok) return 'read-fail';
  if (sceneFailed(r)) return 'scene-fail';
  if (writes(r).some(([, w]) => !w.ok)) return 'write-fail';
  if (writes(r).some(([, w]) => w.reread && !w.reread.ok)) return 'reread-fail';
  if (writes(r).some(([, w]) => rereadKinds(w).some((k) => !k.startsWith('object:')))) return 'roundtrip-diff';
  return 'ok';
}

/**
 * 품질 지표(파일마다 참·거짓) — 5차 훑기의 고치기 전·후 표와 같은 정의.
 * 이름이 바뀜: 왕복에서 도면층·블록 이름이 사라짐(DWG ↔ DXF의 \U+ 바꿈 등)
 */
export const QUALITY: Record<string, (r: FileRecord) => boolean> = {
  'scene-nan': (r) => (r.scene?.spaces ?? []).some((s) => !!s.nan),
  mutated: (r) => !!r.mutated?.length,
  'name-changed': (r) => writes(r).some(([, w]) => !!(w.reread?.layersLost?.length || w.reread?.blocksLost?.length)),
  'align-point': (r) => writes(r).some(([, w]) => Object.keys(w.reread?.fieldDiffs ?? {}).some((f) => /alignPoint/.test(f))),
  'dim-type': (r) => writes(r).some(([, w]) => Object.keys(w.reread?.fieldDiffs ?? {}).some((f) => /DIMENSION\.dimType/.test(f))),
  'dim-measurement': (r) => writes(r).some(([, w]) => Object.keys(w.reread?.fieldDiffs ?? {}).some((f) => /DIMENSION\.measurement/.test(f))),
  'text-value': (r) => writes(r).some(([, w]) => Object.keys(w.reread?.fieldDiffs ?? {}).some((f) => /\.(text|attvals\[\])$/.test(f))),
  'shape-dropped': (r) => writes(r).some(([, w]) => !!w.warn?.['entity.shape_dropped']),
  'empty-block-handle': (r) => writes(r).some(([, w]) => !!w.warn?.['dwg.write_missing_block']),
  'acis-dropped': (r) =>
    writes(r).some(([, w]) => {
      const types = (w.detail?.['dwg.write_entity_dropped'] as { types?: Record<string, number> } | undefined)?.types;
      return !!types && Object.keys(types).some((t) => /3DSOLID|REGION|BODY/.test(t));
    }),
  'acis-as-wires': (r) => writes(r).some(([k, w]) => k.startsWith('dwg') && !!w.warn?.['entity.acis_as_wires']),
  'silent-count-loss': (r) =>
    writes(r).some(([, w]) => {
      const lost = Object.values(w.reread?.countDelta ?? {}).some((n) => n < 0);
      return lost && !Object.keys(w.warn ?? {}).length;
    }),
};

/** ezdxf 대조 지표(--oracle일 때만) */
export const ORACLE_QUALITY: Record<string, (r: FileRecord) => boolean> = {
  'C-audit-error': (r) => !!r.oracle?.C && Object.keys(r.oracle.C.auditErrors ?? {}).length > 0,
  'C-unreadable': (r) => !!r.oracle?.C && !!(r.oracle.C.error || r.oracle.C.loadError),
  'B-align-point': (r) => Object.keys(r.oracle?.B?.fieldDiffs ?? {}).some((f) => /alignPoint/.test(f)),
  'C-align-point': (r) => Object.keys(r.oracle?.C?.fieldDiffs ?? {}).some((f) => /alignPoint/.test(f)),
  'B-dim-type': (r) => Object.keys(r.oracle?.B?.fieldDiffs ?? {}).some((f) => /dimType/.test(f)),
  'C-dim-type': (r) => Object.keys(r.oracle?.C?.fieldDiffs ?? {}).some((f) => /dimType/.test(f)),
  'C-shape-missing': (r) => (r.oracle?.C?.onlyAct?.SHAPE ?? 0) > 0,
};

/** 파일의 품질 지표(oracle이 거짓이면 ezdxf 대조 지표는 빼고 — 대조하지 않은 결과와 견줄 때) */
export function qualityFlags(r: FileRecord, oracle = true): string[] {
  const out: string[] = [];
  for (const [k, f] of Object.entries(QUALITY)) if (f(r)) out.push(k);
  if (oracle) for (const [k, f] of Object.entries(ORACLE_QUALITY)) if (f(r)) out.push(k);
  return out;
}

/** 예외 묶음 열쇠: 단계 + 이름과 글(숫자는 #) + 첫 호출 위치(줄 번호 없이) */
export function errorSignature(stage: string, e: StepError): string {
  const msg = e.err.replace(/\d+(\.\d+)?/g, '#').replace(/\s+/g, ' ').slice(0, 160);
  const at = e.at ? ' @ ' + e.at.replace(/:\d+(:\d+)?\)?$/, '').replace(/\)$/, '') : '';
  return `${stage}: ${e.code ? `[${e.code}] ` : ''}${msg}${at}`;
}

/** 파일의 예외 열쇠들(단계 순서) */
export function fileErrors(r: FileRecord): string[] {
  const out: string[] = [];
  if (r.fatal) out.push(`worker: ${r.fatal.replace(/\d+/g, '#').slice(0, 160)}`);
  if (r.read?.error) out.push(errorSignature('read', r.read.error));
  if (r.scene?.error) out.push(errorSignature('scene', r.scene.error));
  for (const s of r.scene?.spaces ?? []) if (s.error && s.error.err !== 'no block') out.push(errorSignature('scene', s.error));
  for (const [k, w] of writes(r)) {
    if (w.error) out.push(errorSignature(`write ${k}`, w.error));
    if (w.reread?.error) out.push(errorSignature(`reread ${k}`, w.reread.error));
  }
  return [...new Set(out)];
}

function percentiles(xs: number[]): { n: number; p50: number; p90: number; p99: number; max: number; sum: number } {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  const at = (q: number) => (s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))]! : 0);
  return { n: s.length, p50: at(0.5), p90: at(0.9), p99: at(0.99), max: s.length ? s[s.length - 1]! : 0, sum: s.reduce((a, b) => a + b, 0) };
}

/** 묶음 → 개수 순으로 정렬한 객체 */
function sorted(t: Tally, limit = Infinity): Tally {
  return Object.fromEntries(
    Object.entries(t)
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, limit),
  );
}

export interface SweepSummary {
  done: boolean;
  [k: string]: unknown;
}

export interface SummaryInput {
  records: FileRecord[];
  /** 표본 고르기 결과(찾은 수·중복 등) */
  input?: Record<string, unknown>;
  options?: Record<string, unknown>;
  wallMs?: number;
  startedAt?: string;
  finishedAt?: string;
}

/** 기록 → summary.json */
export function buildSummary({ records, input, options, wallMs, startedAt, finishedAt }: SummaryInput): SweepSummary {
  const classes: Tally = {};
  for (const c of CLASS_ORDER) classes[c] = 0;
  const byExt: Tally = {};
  const byVersion: Record<string, Tally> = {};
  const exceptions: Tally = {};
  const exceptionFiles: Record<string, string[]> = {};
  const readWarn: Tally = {};
  const sceneWarn: Tally = {};
  const writeWarn: Record<string, Tally> = {};
  const rereadWarn: Tally = {};
  const roundtrip: Tally = {};
  const roundtripByTarget: Record<string, Tally> = {};
  const quality: Tally = {};
  for (const k of Object.keys(QUALITY)) quality[k] = 0;
  const oracleUsed = records.some((r) => r.oracle);
  const oracle: Tally = {};
  if (oracleUsed) for (const k of Object.keys(ORACLE_QUALITY)) oracle[k] = 0;
  const oracleKinds: Record<string, Tally> = {};
  const t = { read: [] as number[], scene: [] as number[], write: [] as number[], reread: [] as number[], total: [] as number[] };
  for (const r of records) {
    inc(classes, classify(r));
    inc(byExt, r.ext);
    const ver = r.version ?? (r.sniff || '?');
    const fmt = r.format ?? (r.ext === 'dxf' ? 'dxf' : 'dwg');
    byVersion[ver] ??= {};
    inc(byVersion[ver]!, fmt);
    for (const sig of fileErrors(r)) {
      inc(exceptions, sig);
      const l = (exceptionFiles[sig] ??= []);
      if (l.length < 3) l.push(r.key.slice(0, 12));
    }
    for (const code of Object.keys(r.read?.warn ?? {})) inc(readWarn, code);
    const sw = new Set<string>();
    for (const s of r.scene?.spaces ?? []) for (const code of Object.keys(s.warn ?? {})) sw.add(code);
    for (const code of sw) inc(sceneWarn, code);
    const kinds = new Set<string>();
    const rw = new Set<string>();
    let wms = 0;
    let rms = 0;
    for (const [k, w] of writes(r)) {
      wms += w.ms;
      rms += w.reread?.ms ?? 0;
      for (const code of Object.keys(w.warn ?? {})) inc((writeWarn[k] ??= {}), code);
      for (const code of Object.keys(w.reread?.warn ?? {})) rw.add(code);
      const ks = rereadKinds(w);
      for (const kind of ks) {
        kinds.add(kind);
        inc((roundtripByTarget[k] ??= {}), kind);
      }
    }
    for (const code of rw) inc(rereadWarn, code);
    for (const kind of kinds) inc(roundtrip, kind);
    for (const [k, f] of Object.entries(QUALITY)) if (f(r)) inc(quality, k);
    if (oracleUsed) {
      for (const [k, f] of Object.entries(ORACLE_QUALITY)) if (f(r)) inc(oracle, k);
      for (const side of ['A', 'B', 'C'] as const) {
        const d = r.oracle?.[side];
        if (!d) continue;
        const ok = (oracleKinds[side] ??= {});
        inc(ok, 'files');
        if (d.error) inc(ok, 'error');
        for (const [ty, n] of Object.entries(d.countDelta ?? {})) inc(ok, `count:${ty}:${n > 0 ? '+' : '-'}`);
        for (const f of Object.keys(d.fieldDiffs ?? {})) inc(ok, `field:${f}`);
        if (d.layersOnlyExp?.length || d.layersOnlyAct?.length) inc(ok, 'name:layer');
        if (d.blocksOnlyExp?.length || d.blocksOnlyAct?.length) inc(ok, 'name:block');
        for (const code of Object.keys(d.auditErrors ?? {})) inc(ok, `audit:${code}`);
      }
    }
    if (r.read?.ok) t.read.push(r.read.ms);
    if (r.scene) t.scene.push(r.scene.ms);
    if (r.writes) {
      t.write.push(wms);
      t.reread.push(rms);
    }
    t.total.push(r.ms);
  }
  const verOrder = Object.keys(byVersion).sort();
  const summary: SweepSummary = {
    done: true,
    tool: 'opencad-dwgdxf sweep',
    startedAt,
    finishedAt,
    options,
    input,
    files: records.length,
    classes,
    byExt: sorted(byExt),
    byVersion: Object.fromEntries(verOrder.map((v) => [v, byVersion[v]])),
    exceptions: Object.fromEntries(Object.entries(sorted(exceptions, 100)).map(([k, n]) => [k, { files: n, e: exceptionFiles[k] }])),
    quality,
    roundtrip: sorted(roundtrip, 200),
    roundtripByTarget: Object.fromEntries(Object.entries(roundtripByTarget).map(([k, v]) => [k, sorted(v, 60)])),
    warnings: { read: sorted(readWarn), scene: sorted(sceneWarn), write: Object.fromEntries(Object.entries(writeWarn).map(([k, v]) => [k, sorted(v)])), reread: sorted(rereadWarn) },
    timeMs: { wall: wallMs, read: percentiles(t.read), scene: percentiles(t.scene), write: percentiles(t.write), reread: percentiles(t.reread), total: percentiles(t.total) },
  };
  if (oracleUsed) summary.oracle = { quality: oracle, kinds: Object.fromEntries(Object.entries(oracleKinds).map(([k, v]) => [k, sorted(v, 80)])) };
  return summary;
}

/** 사람이 읽는 짧은 요약(터미널) */
export function summaryText(s: SweepSummary): string {
  const lines: string[] = [];
  const classes = s.classes as Tally;
  lines.push(`파일 ${s.files}개 — ` + Object.entries(classes).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(', '));
  const bv = s.byVersion as Record<string, Tally>;
  lines.push('판별: ' + Object.entries(bv).map(([v, t]) => `${v} ${Object.entries(t).map(([f, n]) => `${f} ${n}`).join('/')}`).join(', '));
  const q = s.quality as Tally;
  lines.push('품질: ' + Object.entries(q).map(([k, n]) => `${k} ${n}`).join(', '));
  if (s.oracle) lines.push('ezdxf 대조: ' + Object.entries((s.oracle as { quality: Tally }).quality).map(([k, n]) => `${k} ${n}`).join(', '));
  const ex = Object.entries(s.exceptions as Record<string, { files: number }>);
  lines.push(`예외 ${ex.length}가지` + (ex.length ? ':' : ''));
  for (const [k, v] of ex.slice(0, 10)) lines.push(`  ${String(v.files).padStart(5)}  ${k}`);
  const tm = s.timeMs as Record<string, { p50: number; p90: number; max: number } | number | undefined>;
  const tt = tm.total as { p50: number; p90: number; max: number };
  lines.push(`시간: 전체 ${Math.round(Number(tm.wall ?? 0) / 1000)}초, 파일당 중앙 ${tt.p50}ms · 90% ${tt.p90}ms · 최대 ${tt.max}ms`);
  return lines.join('\n');
}
