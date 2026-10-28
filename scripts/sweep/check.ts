/**
 * 훑기에서 파일 하나 확인하기(앱 워커와 같은 길):
 * readCadFile → 글꼴 준비 → 모형·모든 배치 장면(buildSpace) → DXF R2018·DWG R2018·DWG R2000·원본과 같은 판(앱의 "같은 형식 저장")으로 쓰기
 * → 다시 읽어 종류별 개수와 핸들별 값(치수 측정값·문자·속성 값·도면층·블록)을 원본과 견준다.
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { readCadFile } from '../../src/io/index';
import { buildSpace } from '../../src/render/build';
import { OutlineLibrary } from '../../src/text/fonts';
import { TextEngine } from '../../src/text/layout';
import { collectTextUsage } from '../../src/text/collect';
import { writeDxf } from '../../src/io/dxf/writer';
import { writeDwg } from '../../src/io/dwg/index';
import type { CadDocument, Entity } from '../../src/core/model';
import { decodeCadEscapes } from '../../src/core/codepage';
import { summarizeDocument, summarizeEntity } from '../../tests/oracle/summarize';
import { compareSummaries } from '../../tests/oracle/compare';
import type { SweepFile } from './files';
import { clip, compareOracle, prune, type EzdxfOracle, type OracleSummary } from './oracle';
import type { FileRecord, RereadRecord, SpaceRecord, StepError, Tally, WriteRecord } from './record';

const inc = (t: Tally, k: string, n = 1) => {
  t[k] = (t[k] ?? 0) + n;
};

export interface CheckContext {
  text: TextEngine;
  lib: OutlineLibrary;
  /** ezdxf 대조(없으면 하지 않는다) */
  oracle?: EzdxfOracle | null;
  /** 대조용 임시 파일 폴더 */
  tmpDir?: string;
}

/** 저장소 뿌리(public/fonts)의 글꼴로 글자 엔진을 만든다(앱 워커의 init과 같다) */
export function createContext(root: string, extra: Partial<CheckContext> = {}): CheckContext {
  const fontDir = resolve(root, 'public/fonts/noto-sans-kr') + '/';
  const lib = new OutlineLibrary(fontDir, async (url) => {
    const b = readFileSync(url);
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  });
  return { text: new TextEngine(lib), lib, ...extra };
}

/** 예외 → 짧은 기록(첫 호출 위치는 src/… 상대 경로로) */
export function stepError(e: unknown): StepError {
  if (!(e instanceof Error)) return { err: String(e).slice(0, 300) };
  const out: StepError = { err: `${e.name}: ${e.message}`.slice(0, 300) };
  const frame = (e.stack ?? '').split('\n').find((l) => /^\s+at /.test(l));
  if (frame) out.at = frame.trim().replace(/^at /, '').replace(/\(?(?:file:\/\/)?\/[^()]*?\/((?:src|tests|scripts|node_modules)\/)/, '($1').slice(0, 160);
  const code = (e as { code?: unknown }).code;
  if (typeof code === 'string') out.code = code;
  return out;
}

const warnTally = (ws: readonly { code: string; count?: number }[]): Tally | undefined => {
  if (!ws.length) return undefined;
  const t: Tally = {};
  for (const w of ws) inc(t, w.code, w.count ?? 1);
  return t;
};

const tname = (e: Entity) => (e.type === 'UNKNOWN' ? `UNKNOWN:${(e as { originalType?: string }).originalType}` : e.type);

/** 원본 요약 + 왕복에서 더 볼 값(치수 측정값·속성 값) */
function summarize(e: Entity): Record<string, unknown> {
  const d = summarizeEntity(e) as Record<string, unknown>;
  if (e.type === 'DIMENSION') d.measurement = Number.isFinite(e.measurement) ? Math.round(e.measurement * 1e6) / 1e6 : null;
  if (e.type === 'INSERT') d.attvals = e.attribs.map((a) => `${a.tag}=${a.text}`);
  return d;
}

interface Digest {
  counts: Tally;
  objCounts: Tally;
  layers: string[];
  blocks: string[];
  /** 블록 열쇠 → 핸들 → 요약 */
  ents: Map<string, Map<string, Record<string, unknown>>>;
  nEnt: number;
}

function digest(doc: CadDocument): Digest {
  const counts: Tally = {};
  const ents = new Map<string, Map<string, Record<string, unknown>>>();
  let nEnt = 0;
  for (const [k, b] of doc.blocks) {
    const m = new Map<string, Record<string, unknown>>();
    for (const e of b.entities) {
      inc(counts, tname(e));
      nEnt++;
      try {
        m.set(e.handle, summarize(e));
      } catch (err) {
        m.set(e.handle, { type: tname(e), summarizeError: stepError(err).err });
      }
    }
    ents.set(k, m);
  }
  const objCounts: Tally = {};
  for (const o of doc.objects.values()) inc(objCounts, (o as { type: string }).type);
  return { counts, objCounts, layers: [...doc.layers.values()].map((l) => l.name).sort(), blocks: [...doc.blocks.keys()].sort(), ents, nEnt };
}

function delta(a: Tally, b: Tally): Tally {
  const d: Tally = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = (b[k] ?? 0) - (a[k] ?? 0);
    if (x) d[k] = x;
  }
  return d;
}

/**
 * 왕복 비교 전에 뜻이 같은 표기를 맞춘다: 문자·속성 값의 \U+XXXX·\M+ 이스케이프(R2000 DWG처럼 코드 페이지 판에 쓰면 생긴다 — 그릴 때 같은 글자),
 * 선종류 ByBlock·ByLayer의 대소문자(CAD에서 같은 이름).
 */
export function normalizeForRoundtrip(d: Record<string, unknown>): Record<string, unknown> {
  const o = { ...d };
  if (typeof o.text === 'string') o.text = decodeCadEscapes(o.text);
  if (Array.isArray(o.attvals)) o.attvals = o.attvals.map((x) => (typeof x === 'string' ? decodeCadEscapes(x) : x));
  if (typeof o.linetype === 'string' && /^by(block|layer)$/i.test(o.linetype)) o.linetype = o.linetype.toUpperCase();
  return o;
}

/**
 * 쓰는 형식에 자리가 없는 값을 맞춘다: DWG에는 SPLINE의 평면·직선 비트(DXF 70의 8·16)가 없고(리더가 점들로 다시 정한다 — AutoCAD도
 * DXF를 읽을 때 이 비트를 쓰지 않는다), R2013 전 DWG에는 맞춤점 방식·매듭 매개변수(32 이상)가 없다.
 */
export function normalizeForTarget(d: Record<string, unknown>, target: Pick<WriteTarget, 'fmt' | 'version'>): Record<string, unknown> {
  if (target.fmt !== 'dwg' || (d.type !== 'SPLINE' && d.type !== 'HELIX') || typeof d.flags !== 'number') return d;
  let f = d.flags & ~24;
  if (Number(target.version.slice(2)) < 1027) f &= 7;
  return { ...d, flags: f };
}

/**
 * 맞춤점 스플라인을 DWG로 쓰면 DWG에는 맞춤점 자료와 조정점 자료 중 하나만 남는다(AutoCAD가 같은 도면을 쓴 DWG·DXF 짝과 같다).
 * 형식 차이로 생기는 수만 견주지 않는다(플래그와 나머지 수는 그대로 견준다):
 * - 맞춤점만 있던 스플라인: DWG 맞춤점 자료를 읽으면 AutoCAD가 만드는 조정점·매듭을 채운다 → 조정점·매듭 수.
 * - 조정점만 남은 맞춤점 방식(70에 1024, 맞춤점 0개 — AutoCAD가 균일 매듭 맞춤점 스플라인을 DXF로 쓸 때 맞춤점을 뺀다):
 *   DWG에는 맞춤점 자료를 되살려 쓴다 → 맞춤점 수.
 * - R2000~R2010 DWG의 제곱근·균일 매듭 맞춤점 스플라인: 그 판에 매듭 매개변수 자리가 없어 조정점으로 쓴다
 *   (AutoCAD도 같고, 쓰기 경고로 알린다) → 맞춤점 수.
 */
export function normalizeSplinePair(src: Record<string, unknown>, a: Record<string, unknown>, b: Record<string, unknown>, target: Pick<WriteTarget, 'fmt' | 'version'>): void {
  if (target.fmt !== 'dwg' || src.type !== 'SPLINE' || typeof src.flags !== 'number') return;
  const num = (v: unknown) => (typeof v === 'number' ? v : -1);
  const drop = (...keys: string[]) => {
    for (const k of keys) {
      delete a[k];
      delete b[k];
    }
  };
  if (num(src.controlPoints) === 0 && num(src.fitPoints) >= 2 && num(b.controlPoints) > 0) drop('controlPoints', 'knots');
  if (src.flags & 1024 && num(src.fitPoints) === 0 && num(b.fitPoints) > 0) drop('fitPoints');
  if (Number(target.version.slice(2)) < 1027 && src.flags & (64 | 128) && num(src.fitPoints) > 0 && num(b.fitPoints) === 0) drop('fitPoints');
}

/** 원본 → 다시 읽은 것: 종류별 수 차이, 핸들로 맞춘 값 차이(종류.속성별 수), 사라진 도면층·블록 이름 */
function compareDigest(src: Digest, out: Digest, target: Pick<WriteTarget, 'fmt' | 'version'>): Partial<RereadRecord> {
  const fieldDiffs: Tally = {};
  const samples: Record<string, unknown> = {};
  let missing = 0;
  let extra = 0;
  for (const [k, sm] of src.ents) {
    const om = out.ents.get(k);
    if (!om) {
      missing += sm.size;
      continue;
    }
    for (const [h, se] of sm) {
      const oe = om.get(h);
      if (!oe) {
        missing++;
        continue;
      }
      const a = normalizeForTarget(normalizeForRoundtrip(se), target);
      const b = normalizeForTarget(normalizeForRoundtrip(oe), target);
      normalizeSplinePair(se, a, b, target);
      for (const d of compareSummaries({ ...a, handle: null }, b, 1e-6, '', [], 20)) {
        const f = `${se.type}${d.path.replace(/\[\d+\]/g, '[]').replace(/\.length$/, '#')}`;
        inc(fieldDiffs, f);
        if (!samples[f]) samples[f] = clip({ block: k, handle: h, exp: d.expected, act: d.actual });
      }
    }
    for (const h of om.keys()) if (!sm.has(h)) extra++;
  }
  for (const [k, om] of out.ents) if (!src.ents.has(k)) extra += om.size;
  const ol = new Set(out.layers);
  const ob = new Set(out.blocks);
  return prune({
    countDelta: delta(src.counts, out.counts),
    objDelta: delta(src.objCounts, out.objCounts),
    missing: missing || undefined,
    extra: extra || undefined,
    fieldDiffs,
    samples,
    layersLost: src.layers.filter((l) => !ol.has(l)).slice(0, 10),
    blocksLost: src.blocks.filter((b) => !ob.has(b)).slice(0, 10),
  });
}

/** 쓰기·장면이 문서를 바꾸는지 보는 지문(요약 기준) */
function docHash(doc: CadDocument): string {
  const h = createHash('sha1');
  for (const [k, b] of doc.blocks) {
    h.update(k);
    for (const e of b.entities) {
      try {
        h.update(JSON.stringify(summarize(e)));
      } catch {
        h.update(e.handle);
      }
    }
  }
  h.update(String(doc.layers.size));
  h.update(String(doc.objects.size));
  return h.digest('hex').slice(0, 16);
}

function sceneStats(doc: CadDocument, text: TextEngine): SpaceRecord[] {
  const spaces = ['*Model_Space', ...doc.layouts.map((l) => l.blockName).filter((n) => n && n.toUpperCase() !== '*MODEL_SPACE')];
  const res: SpaceRecord[] = [];
  for (const sp of [...new Set(spaces)]) {
    if (!doc.blocks.has(sp.toUpperCase())) {
      res.push({ space: sp, ms: 0, ok: false, error: { err: 'no block' } });
      continue;
    }
    const t0 = performance.now();
    try {
      const s = buildSpace(doc, sp, { text });
      let segs = 0;
      let tris = 0;
      let nan = 0;
      for (const c of s.list.chunks) {
        segs += c.segCount + c.tsegCount;
        tris += c.triCount + c.ttriCount;
        for (const buf of [c.segs, c.tris, c.tsegs, c.ttris]) {
          const f = new Float32Array(buf);
          for (let i = 0; i < f.length; i++) if (!Number.isFinite(f[i]!)) nan++;
        }
      }
      res.push(prune({ space: sp, ok: true, ms: Math.round(performance.now() - t0), segs, tris, nan: nan || undefined, warn: warnTally(s.warnings) }));
    } catch (e) {
      res.push({ space: sp, ok: false, ms: Math.round(performance.now() - t0), error: stepError(e) });
    }
  }
  return res;
}

export interface WriteTarget {
  key: string;
  fmt: 'dxf' | 'dwg';
  version: string;
  binary: boolean;
}

const DWG_SAVE = ['AC1032', 'AC1027', 'AC1024', 'AC1018', 'AC1015'];
const DXF_SAVE = ['AC1032', 'AC1027', 'AC1024', 'AC1021', 'AC1018', 'AC1015', 'AC1009'];

/**
 * 쓰기 대상: DXF R2018, DWG R2018, DWG R2000, 그리고 원본과 같은 판 — 앱의 "같은 형식으로 저장"(src/app/save.ts sameFormat)과 같은 규칙:
 * DWG R2007은 R2004로, R13·R14는 R2000으로, 쓸 수 없는 판은 R2018로, 이진 DXF는 이진으로.
 */
export function writeTargets(doc: Pick<CadDocument, 'format' | 'version' | 'binary'>): WriteTarget[] {
  const list: WriteTarget[] = [
    { key: 'dxf-AC1032', fmt: 'dxf', version: 'AC1032', binary: false },
    { key: 'dwg-AC1032', fmt: 'dwg', version: 'AC1032', binary: false },
    { key: 'dwg-AC1015', fmt: 'dwg', version: 'AC1015', binary: false },
  ];
  let same: WriteTarget | null = null;
  const v = doc.version;
  if (doc.format === 'dwg') {
    const w = v === 'AC1021' ? 'AC1018' : v === 'AC1012' || v === 'AC1014' ? 'AC1015' : v;
    const ver = DWG_SAVE.includes(w) ? w : 'AC1032';
    same = { key: `dwg-${ver}`, fmt: 'dwg', version: ver, binary: false };
  } else if (doc.format === 'dxf') {
    const ver = DXF_SAVE.includes(v) ? v : 'AC1032';
    const bin = !!doc.binary;
    same = { key: `${bin ? 'dxfb' : 'dxf'}-${ver}`, fmt: 'dxf', version: ver, binary: bin };
  }
  if (same && !list.some((t) => t.key === same.key)) list.push(same);
  return list;
}

/** 우리 문서 요약(ezdxf 대조용 — ezdxf_batch.py와 같은 꼴) */
function oursSummary(doc: CadDocument): OracleSummary {
  const sum = summarizeDocument(doc) as unknown as OracleSummary;
  const blocks: OracleSummary['blocks'] = {};
  for (const [k, b] of doc.blocks) blocks[k] = b.entities.map(summarize) as OracleSummary['blocks'][string];
  sum.blocks = blocks;
  return sum;
}

/** ezdxf 대조에 넘기는 DXF 크기 한도(ezdxf가 아주 큰 파일에서 오래 걸린다) */
export const ORACLE_MAX_BYTES = 12e6;

/** 파일 하나 확인 */
export async function checkFile(f: SweepFile, ctx: CheckContext): Promise<FileRecord> {
  const t00 = performance.now();
  const rec: FileRecord = { key: f.key, path: f.path, ext: f.ext, size: f.size, dups: f.dups, sniff: f.sniff, ms: 0 };
  const done = () => {
    rec.ms = Math.round(performance.now() - t00);
    return rec;
  };
  const data = new Uint8Array(readFileSync(f.path));
  const t0 = performance.now();
  let doc: CadDocument;
  try {
    doc = readCadFile(data, f.path.split('/').pop() ?? `x.${f.ext}`);
  } catch (e) {
    rec.read = { ok: false, ms: Math.round(performance.now() - t0), error: stepError(e) };
    return done();
  }
  rec.read = prune({ ok: true, ms: Math.round(performance.now() - t0), warn: warnTally(doc.warnings) });
  rec.version = doc.version;
  rec.format = doc.format === 'dxf' && doc.binary ? 'dxf-binary' : doc.format;
  const src = digest(doc);
  rec.counts = src.counts;
  rec.nEnt = src.nEnt;
  rec.nLayers = doc.layers.size;
  rec.nBlocks = doc.blocks.size;
  rec.nLayouts = doc.layouts.length;
  const ours = ctx.oracle ? oursSummary(doc) : null;
  const h0 = docHash(doc);
  const mutated: string[] = [];
  // 장면(앱과 같은 길: 글꼴 준비 → buildSpace)
  const ts = performance.now();
  try {
    const usage = collectTextUsage(doc);
    if (usage.needsOutline) await Promise.all([ctx.lib.require(usage.codes), ctx.lib.requireLatin(usage.latin)]);
    const spaces = sceneStats(doc, ctx.text);
    rec.scene = { ms: Math.round(performance.now() - ts), spaces };
  } catch (e) {
    rec.scene = { ms: Math.round(performance.now() - ts), spaces: [], error: stepError(e) };
  }
  const h1 = docHash(doc);
  if (h1 !== h0) mutated.push('scene');
  // 쓰기 → 다시 읽기
  const writes: Record<string, WriteRecord> = {};
  let dxfOut: Uint8Array | null = null;
  for (const t of writeTargets(doc)) {
    const tw = performance.now();
    let out: Uint8Array;
    let w: WriteRecord;
    try {
      const r = t.fmt === 'dxf' ? writeDxf(doc, { version: t.version as never, binary: t.binary }) : writeDwg(doc, { version: t.version as never });
      out = r.data;
      const detail: Record<string, unknown> = {};
      for (const x of r.warnings) if ((x as { detail?: unknown }).detail && !detail[x.code]) detail[x.code] = (x as { detail?: unknown }).detail;
      w = prune({ ok: true, ms: Math.round(performance.now() - tw), size: out.length, warn: warnTally(r.warnings), detail: Object.keys(detail).length ? clip(detail) : undefined });
    } catch (e) {
      writes[t.key] = { ok: false, ms: Math.round(performance.now() - tw), error: stepError(e) };
      continue;
    }
    writes[t.key] = w;
    if (t.key === 'dxf-AC1032') dxfOut = out;
    const tr = performance.now();
    try {
      const back = readCadFile(out, `x.${t.fmt}`);
      w.reread = prune({ ok: true, ms: Math.round(performance.now() - tr), version: back.version, warn: warnTally(back.warnings), ...compareDigest(src, digest(back), t) });
    } catch (e) {
      w.reread = { ok: false, ms: Math.round(performance.now() - tr), error: stepError(e) };
    }
  }
  rec.writes = writes;
  if (docHash(doc) !== h1) mutated.push('write');
  if (mutated.length) rec.mutated = mutated;
  // ezdxf 대조(선택)
  if (ctx.oracle && ours) {
    const o = ctx.oracle;
    const oracle: NonNullable<FileRecord['oracle']> = {};
    const against = async (path: string, withAudit: boolean) => {
      const ez = await o.dump(path);
      if (!ez.ok || !ez.summary) return { error: ez.error ?? 'no summary' };
      const d = compareOracle(ez.summary, ours);
      if (ez.loadError) d.loadError = ez.loadError;
      if (withAudit && ez.auditErrors && Object.keys(ez.auditErrors).length) {
        d.auditErrors = ez.auditErrors;
        d.auditFirst = ez.auditFirst?.slice(0, 3);
      }
      return d;
    };
    if (rec.format?.startsWith('dxf') && f.size < ORACLE_MAX_BYTES) oracle.A = await against(f.path, false);
    if (f.twin) oracle.B = await against(f.twin, false);
    if (dxfOut && dxfOut.length < ORACLE_MAX_BYTES && ctx.tmpDir) {
      const p = join(ctx.tmpDir, `out-${process.pid}.dxf`);
      writeFileSync(p, dxfOut);
      try {
        oracle.C = await against(p, true);
      } finally {
        rmSync(p, { force: true });
      }
    }
    rec.oracle = oracle;
  }
  return done();
}
