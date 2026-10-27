/**
 * 훑기 표본 고르기(개발 도구): 폴더를 재귀로 훑어 앱이 여는 도면 파일만 고르고, 내용 sha256으로 중복을 뺀다.
 * 판(AC1009~AC1032)은 머리만 읽어 짐작한다(--filter용 — 실제 판은 읽은 뒤 기록에 남긴다).
 */
import { createHash } from 'node:crypto';
import { closeSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { OPEN_MAX_BYTES } from '../../src/app/openerror';

/** 앱이 도면으로 여는 확장자(.dwt는 DWG 서식 — 내용으로 형식을 고른다) */
export const DRAWING_EXT = /\.(dxf|dwg|dwt)$/i;

/** 릴리스 이름 → 판 코드(--filter에 R2000처럼 써도 된다) */
const RELEASES: Record<string, string> = {
  R12: 'AC1009',
  R13: 'AC1012',
  R14: 'AC1014',
  R2000: 'AC1015',
  R2004: 'AC1018',
  R2007: 'AC1021',
  R2010: 'AC1024',
  R2013: 'AC1027',
  R2018: 'AC1032',
};

export interface SweepFile {
  /** 내용 sha256(16진) — 기록의 열쇠 */
  key: string;
  /** 처음 찾은 경로(로컬 결과에만 남긴다) */
  path: string;
  ext: string;
  size: number;
  /** 같은 내용의 다른 경로 수 */
  dups: number;
  /** 머리로 짐작한 판(못 알아내면 '') */
  sniff: string;
  /** 같은 폴더의 같은 이름 DXF(DWG일 때만, ezdxf 대조용 짝) */
  twin?: string;
}

export interface Filter {
  exts: Set<string>;
  versions: Set<string>;
}

/** --filter "dwg,AC1015,R2018" → 확장자와 판 조건(같은 종류끼리는 또는, 종류 사이는 그리고) */
export function parseFilter(text: string | undefined): Filter {
  const f: Filter = { exts: new Set(), versions: new Set() };
  for (const raw of (text ?? '').split(/[,\s]+/)) {
    const t = raw.trim().toUpperCase();
    if (!t) continue;
    if (/^\.?(DXF|DWG|DWT)$/.test(t)) f.exts.add(t.replace('.', '').toLowerCase());
    else if (/^AC10\d\d$/.test(t)) f.versions.add(t);
    else if (RELEASES[t]) f.versions.add(RELEASES[t]);
    else throw new Error(`--filter를 알아볼 수 없습니다: ${raw} (dxf·dwg·dwt, AC1015, R2000처럼)`);
  }
  return f;
}

export function matchFilter(f: Filter, ext: string, version: string): boolean {
  if (f.exts.size && !f.exts.has(ext)) return false;
  if (f.versions.size && !f.versions.has(version)) return false;
  return true;
}

/** 파일 머리로 판 짐작: DWG는 앞 6바이트, DXF는 $ACADVER(없으면 R12) */
export function sniffVersion(head: Uint8Array): string {
  const ascii = Buffer.from(head.buffer, head.byteOffset, head.byteLength).toString('latin1');
  if (/^AC10\d\d/.test(ascii)) return ascii.slice(0, 6);
  if (/^MC0\.0/.test(ascii)) return 'MC0.0';
  const binary = ascii.startsWith('AutoCAD Binary DXF');
  const m = /\$ACADVER[\s\S]{1,40}?(AC10\d\d)/.exec(ascii);
  if (m) return m[1]!;
  // 머리 구역이 있는데 $ACADVER가 없으면 R12 이하로 본다(AutoCAD도 그렇게 읽는다)
  if (binary || /(^|\n)\s*0\s*\r?\n\s*SECTION/.test(ascii)) return 'AC1009';
  return '';
}

function readHead(path: string, n = 64 * 1024): Uint8Array {
  const fd = openSync(path, 'r');
  try {
    const buf = Buffer.alloc(n);
    const got = readSync(fd, buf, 0, n, 0);
    return buf.subarray(0, got);
  } finally {
    closeSync(fd);
  }
}

/** 폴더를 재귀로 훑는다(.git·node_modules만 건너뛴다). 경로는 정렬해 돌려준다 */
export function walk(dir: string, out: string[] = []): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const n of names.sort()) {
    if (n === 'node_modules' || n === '.git') continue;
    const p = join(dir, n);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p, out);
    else if (st.isFile() && DRAWING_EXT.test(n)) out.push(p);
  }
  return out;
}

export interface CollectResult {
  files: SweepFile[];
  found: number;
  /** 중복을 뺀 수(--limit 전) */
  unique: number;
  duplicates: number;
  tooBig: number;
  filteredOut: number;
  unreadable: number;
}

/**
 * 경로 목록 → 중복을 뺀 표본(내용 해시 순서: 폴더가 섞인 고른 표본이 되어 --limit이 한 폴더에 몰리지 않는다).
 * 크기가 앱 한도(OPEN_MAX_BYTES)를 넘는 파일은 앱처럼 열지 않는다.
 */
export function collect(paths: string[], filter: Filter = parseFilter(''), limit = Infinity, maxBytes = OPEN_MAX_BYTES): CollectResult {
  const byKey = new Map<string, SweepFile>();
  const lower = new Map(paths.map((p) => [p.toLowerCase(), p]));
  let duplicates = 0;
  let tooBig = 0;
  let filteredOut = 0;
  let unreadable = 0;
  for (const p of paths) {
    let size: number;
    try {
      size = statSync(p).size;
    } catch {
      unreadable++;
      continue;
    }
    if (size > maxBytes) {
      tooBig++;
      continue;
    }
    const ext = p.split('.').pop()!.toLowerCase();
    let head: Uint8Array;
    try {
      head = readHead(p);
    } catch {
      unreadable++;
      continue;
    }
    const sniff = sniffVersion(head);
    if (!matchFilter(filter, ext, sniff)) {
      filteredOut++;
      continue;
    }
    let key: string;
    try {
      key = createHash('sha256').update(readFileSync(p)).digest('hex');
    } catch {
      unreadable++;
      continue;
    }
    const prev = byKey.get(key);
    if (prev) {
      prev.dups++;
      duplicates++;
      continue;
    }
    const f: SweepFile = { key, path: p, ext, size, dups: 0, sniff };
    if (ext !== 'dxf') {
      const twin = lower.get(p.replace(/\.(dwg|dwt)$/i, '.dxf').toLowerCase());
      if (twin) f.twin = twin;
    }
    byKey.set(key, f);
  }
  const files = [...byKey.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { files: files.slice(0, Math.max(0, limit)), found: paths.length, unique: files.length, duplicates, tooBig, filteredOut, unreadable };
}
