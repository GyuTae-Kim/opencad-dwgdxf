/**
 * ACIS(REGION·3DSOLID·BODY·SURFACE 형상) 자료에서 모서리 선(와이어)만 뽑는다 — 2D 캐드에서 보이는 모양(AutoCAD의 와이어프레임 표시).
 *
 * - SAT(문자, DXF R2000~R2010의 1·3 코드, DWG R2000~R2010 객체 본문의 판 1 자료): 레코드는 `이름 … #`, 포인터 `$n`,
 *   문자열 `@길이 글`. AutoCAD는 글자를 감춰 적는다(32보다 큰 글자 c → 159 − c, DXF에서는 "^ "가 "A").
 * - SAB(이진, DXF R2013+ ACDSDATA·DWG R2013+ 자료 저장소): 꼬리표 바이트 + 값(ezdxf 문서·코드(MIT)로 확인한 꼬리표 표).
 *
 * 형상은 모서리(edge)마다 시작·끝 꼭짓점(vertex → point)과 곡선(직선·타원·넙스)으로 그린다. 몸체(body)의 변환(transform)을 적용한다.
 * 해석하지 못하는 곡선(교차 곡선 등)은 두 꼭짓점을 잇는 선으로 그린다.
 */
import type { Vec3 } from '../core/model';

type Tok = { k: 'ptr'; v: number } | { k: 'num'; v: number; int: boolean } | { k: 'str'; v: string } | { k: 'bool'; v: boolean } | { k: 'sub'; v: '{' | '}' };

interface Rec {
  name: string;
  toks: Tok[];
  /** 속성 포인터 다음에 객체 번호(정수)가 있는가(SAT 판 7.0 이상, SAB는 꼬리표로 안다) */
  ids: boolean;
}

// ---------------------------------------------------------------------------
// SAT
// ---------------------------------------------------------------------------

/** AutoCAD가 감춘 SAT 한 줄을 푼다(dxf: DXF 1·3 코드 — "^ "는 "A") */
export function decodeSatLine(s: string, dxf = false): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c <= 0x20) out += s[i];
    else {
      out += String.fromCharCode(159 - c);
      // DXF는 ^(0x5E, 풀면 'A')를 제어 문자로 쓰지 않으려 뒤에 공백을 둔다
      if (dxf && c === 0x5e && s[i + 1] === ' ') i++;
    }
  }
  return out;
}

/** 이진 판 1 자료(DWG: 바이트마다 감춤) → 글 */
export function decodeSatBytes(b: Uint8Array): string {
  let out = '';
  for (const c of b) out += c <= 0x20 ? String.fromCharCode(c) : String.fromCharCode(159 - c);
  return out;
}

function satRecords(text: string): Rec[] {
  // 머리말: 버전 줄, 제품 줄, 단위 줄(판 1.x — R13·R14 — 는 버전 줄뿐). 그다음 레코드들(# 로 끝남)
  const n0 = text.indexOf('\n');
  let p = n0 < 0 ? text.length : n0 + 1;
  // 머리말 첫 줄의 판(106, 400, 700, 21200 …). 판 7.0부터 객체마다 번호가 붙는다
  const version = Number(text.slice(0, p).trim().split(/\s+/)[0]);
  for (let i = 0; i < 2 && p < text.length; i++) {
    // 판 2 이상은 두 줄 더, 판 1.x는 숫자·@로 시작하는 줄만(레코드는 이름 글자로 시작한다)
    if (version < 200 && !/^[ \t\r]*[0-9@]/.test(text.slice(p, p + 16))) break;
    const n = text.indexOf('\n', p);
    p = n < 0 ? text.length : n + 1;
  }
  const ids = version >= 700;
  const recs: Rec[] = [];
  let toks: Tok[] = [];
  let name: string | null = null;
  const n = text.length;
  while (p < n) {
    const c = text[p]!;
    if (c === ' ' || c === '\n' || c === '\r' || c === '\t') {
      p++;
      continue;
    }
    // 토큰 하나
    let e = p;
    while (e < n) {
      const cc = text.charCodeAt(e);
      if (cc === 32 || cc === 10 || cc === 13 || cc === 9) break;
      e++;
    }
    const t = text.slice(p, e);
    p = e;
    if (t === '#') {
      if (name !== null) recs.push({ name, toks, ids });
      name = null;
      toks = [];
      continue;
    }
    if (name === null) {
      if (/^-\d+$/.test(t)) continue; // 레코드 번호(판 7 이상에서 붙기도 한다)
      if (/^End-of-(ACIS|ASM)-data$/.test(t) || t === 'Begin-of-ACIS-History-data') break;
      name = t;
      continue;
    }
    if (t.startsWith('$')) toks.push({ k: 'ptr', v: Number(t.slice(1)) });
    else if (t.startsWith('@')) {
      // 길이 붙은 문자열: "@7 unknown"
      const len = Number(t.slice(1));
      p++; // 공백 하나
      toks.push({ k: 'str', v: text.slice(p, p + len) });
      p += len;
    } else if (t === '{' || t === '}') toks.push({ k: 'sub', v: t });
    else if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) toks.push({ k: 'num', v: Number(t), int: /^[-+]?\d+$/.test(t) });
    else if (t === 'forward' || t === 'forward_v' || t === 'single') toks.push({ k: 'bool', v: false });
    else if (t === 'reversed' || t === 'reversed_v' || t === 'double') toks.push({ k: 'bool', v: true });
    else toks.push({ k: 'str', v: t });
  }
  return recs;
}

// ---------------------------------------------------------------------------
// SAB
// ---------------------------------------------------------------------------

function sabRecords(b: Uint8Array): Rec[] | null {
  const sigs = ['ACIS BinaryFile', 'ASM BinaryFile4'];
  const head = String.fromCharCode(...b.subarray(0, 15));
  if (!sigs.includes(head)) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = 15;
  const int = () => {
    const v = dv.getInt32(p, true);
    p += 4;
    return v;
  };
  const dbl = () => {
    const v = dv.getFloat64(p, true);
    p += 8;
    return v;
  };
  const str = (len: number) => {
    let s = '';
    for (let i = 0; i < len; i++) s += String.fromCharCode(b[p + i]!);
    p += len;
    return s;
  };
  // 머리말: 버전·레코드 수·객체 수·플래그, 제품·ACIS 버전·날짜 문자열, 단위·허용 오차 셋
  int();
  int();
  int();
  int();
  for (let i = 0; i < 3; i++) {
    if (b[p++] !== 0x07) return null;
    str(b[p++]!);
  }
  for (let i = 0; i < 3; i++) {
    if (b[p++] !== 0x06) return null;
    dbl();
  }
  const recs: Rec[] = [];
  let toks: Tok[] = [];
  let parts: string[] = [];
  let name: string | null = null;
  while (p < b.length) {
    const tag = b[p++]!;
    switch (tag) {
      case 0x04:
        toks.push({ k: 'num', v: int(), int: true });
        break;
      case 0x06:
      case 0x17:
        toks.push({ k: 'num', v: dbl(), int: false });
        break;
      case 0x07:
        toks.push({ k: 'str', v: str(b[p++]!) });
        break;
      case 0x12:
        toks.push({ k: 'str', v: str(int()) });
        break;
      case 0x0c:
        toks.push({ k: 'ptr', v: int() });
        break;
      case 0x0a:
        toks.push({ k: 'bool', v: true });
        break;
      case 0x0b:
        toks.push({ k: 'bool', v: false });
        break;
      case 0x0e:
        parts.push(str(b[p++]!));
        break;
      case 0x0d: {
        parts.push(str(b[p++]!));
        const nm = parts.join('-');
        parts = [];
        if (name === null) name = nm;
        else toks.push({ k: 'str', v: nm });
        break;
      }
      case 0x13:
      case 0x14:
        for (let i = 0; i < 3; i++) toks.push({ k: 'num', v: dbl(), int: false });
        break;
      case 0x15:
        toks.push({ k: 'num', v: int(), int: true });
        break;
      case 0x0f:
        toks.push({ k: 'sub', v: '{' });
        break;
      case 0x10:
        toks.push({ k: 'sub', v: '}' });
        break;
      case 0x11:
        if (name !== null) {
          if (/^End-of-(ACIS|ASM)-data$/.test(name)) return recs;
          recs.push({ name, toks, ids: toks[0]?.k === 'ptr' && toks[1]?.k === 'num' && toks[1].int });
        }
        name = null;
        toks = [];
        break;
      default:
        // 모르는 꼬리표: 여기까지 읽은 것만
        return recs;
    }
    if (name && /^(End-of|Begin-of-ACIS-History)/.test(name)) return recs;
  }
  return recs;
}

// ---------------------------------------------------------------------------
// 해석
// ---------------------------------------------------------------------------

/** 공통 머리(속성 포인터, 판 7 이상이면 번호 정수 + 역사 포인터)를 뺀 자료 토큰 */
function fields(r: Rec): Tok[] {
  const t = r.toks;
  if (r.ids && t[0]?.k === 'ptr' && t[1]?.k === 'num' && t[1].int) {
    // 판 7 이상(또는 SAB): 속성, 번호, 역사 포인터(변환 레코드에는 역사 포인터가 없다)
    return r.name !== 'transform' && t[2]?.k === 'ptr' ? t.slice(3) : t.slice(2);
  }
  if (t[0]?.k === 'ptr') return t.slice(1);
  return t;
}

function nums(t: Tok[]): number[] {
  const out: number[] = [];
  for (const x of t) if (x.k === 'num') out.push(x.v);
  return out;
}

type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V) => Math.hypot(a[0], a[1], a[2]);

/** 넙스(곡선 레코드의 { … nubs|nurbs 차수 열림/닫힘 매듭수 (매듭 겹침)… 조정점 … }) */
function bsCurve(t: Tok[]): { degree: number; knots: number[]; ctrl: V[]; weights: number[] | null } | null {
  for (let i = 0; i < t.length; i++) {
    const x = t[i]!;
    if (x.k !== 'str' || (x.v !== 'nubs' && x.v !== 'nurbs')) continue;
    const rational = x.v === 'nurbs';
    const n = (j: number) => {
      const y = t[j];
      return y?.k === 'num' ? y.v : NaN;
    };
    let j = i + 1;
    const degree = n(j++);
    if (t[j]?.k === 'str') j++; // open | closed | periodic
    const kc = n(j++);
    if (!(degree >= 1 && kc >= 2)) return null;
    const knots: number[] = [];
    for (let k = 0; k < kc; k++) {
      const kv = n(j++);
      const m = n(j++);
      if (!Number.isFinite(kv) || !(m >= 1)) return null;
      for (let q = 0; q < m; q++) knots.push(kv);
    }
    // 조정점 수 = 매듭 수 − 차수 − 1(ACIS는 양 끝 매듭을 하나 덜 적는다: 겹침 차수 → 표준 매듭은 앞뒤에 하나씩 더)
    const full = [knots[0]!, ...knots, knots[knots.length - 1]!];
    const count = full.length - degree - 1;
    const ctrl: V[] = [];
    const weights: number[] = [];
    for (let k = 0; k < count; k++) {
      const p: V = [n(j), n(j + 1), n(j + 2)];
      j += 3;
      if (rational) weights.push(n(j++));
      if (!p.every(Number.isFinite)) return null;
      ctrl.push(p);
    }
    return { degree, knots: full, ctrl, weights: rational ? weights : null };
  }
  return null;
}

function deBoor(c: { degree: number; knots: number[]; ctrl: V[]; weights: number[] | null }, u: number): V {
  const p = c.degree;
  const U = c.knots;
  const n = c.ctrl.length - 1;
  let k = p;
  while (k < n && u >= U[k + 1]!) k++;
  const d: [number, number, number, number][] = [];
  for (let j = 0; j <= p; j++) {
    const P = c.ctrl[k - p + j]!;
    const w = c.weights ? c.weights[k - p + j]! : 1;
    d.push([P[0] * w, P[1] * w, P[2] * w, w]);
  }
  for (let r = 1; r <= p; r++)
    for (let j = p; j >= r; j--) {
      const i = k - p + j;
      const den = U[i + p - r + 1]! - U[i]!;
      const a = den === 0 ? 0 : (u - U[i]!) / den;
      for (let q = 0; q < 4; q++) d[j]![q] = (1 - a) * d[j - 1]![q]! + a * d[j]![q]!;
    }
  const r = d[p]!;
  return [r[0] / r[3], r[1] / r[3], r[2] / r[3]];
}

/** 레코드들 → 모서리 선(평면도 3D 점 목록) */
function edgesOf(recs: Rec[]): Vec3[][] {
  const at = (i: number | undefined): Rec | undefined => (i === undefined || i < 0 ? undefined : recs[i]);
  const pointOf = (vi: number | undefined): V | null => {
    const v = at(vi);
    if (!v || v.name !== 'vertex') return null;
    for (const t of fields(v)) {
      if (t.k !== 'ptr') continue;
      const p = at(t.v);
      if (p?.name === 'point') {
        const xs = nums(fields(p));
        if (xs.length >= 3) return [xs[0]!, xs[1]!, xs[2]!];
      }
    }
    return null;
  };
  // 몸체 변환(행 벡터: p' = x·r0 + y·r1 + z·r2 + t, 축척)
  let xf: ((p: V) => V) | null = null;
  for (const r of recs) {
    if (r.name !== 'body') continue;
    for (const t of fields(r)) {
      if (t.k !== 'ptr') continue;
      const tr = at(t.v);
      if (tr?.name !== 'transform') continue;
      const m = nums(fields(tr));
      if (m.length >= 12) {
        const s = m.length >= 13 && m[12]! > 0 ? m[12]! : 1;
        xf = (p) => [
          (p[0] * m[0]! + p[1] * m[3]! + p[2] * m[6]!) * s + m[9]!,
          (p[0] * m[1]! + p[1] * m[4]! + p[2] * m[7]!) * s + m[10]!,
          (p[0] * m[2]! + p[1] * m[5]! + p[2] * m[8]!) * s + m[11]!,
        ];
      }
      break;
    }
    if (xf) break;
  }
  const out: Vec3[][] = [];
  const emit = (pts: V[]) => {
    if (pts.length < 2) return;
    out.push(pts.map((p) => (xf ? xf(p) : p)).map(([x, y, z]) => ({ x, y, z })));
  };
  for (const r of recs) {
    if (r.name !== 'edge') continue;
    const f = fields(r);
    const vs: number[] = [];
    let curve: Rec | undefined;
    let reversed = false;
    let afterCurve = false;
    for (const t of f) {
      if (t.k === 'ptr') {
        const tr = at(t.v);
        if (tr?.name === 'vertex' && vs.length < 2) vs.push(t.v);
        else if (tr && /-curve$/.test(tr.name) && !curve) {
          curve = tr;
          afterCurve = true;
        }
      } else if (afterCurve && t.k === 'bool') {
        reversed = t.v;
        afterCurve = false;
      } else if (afterCurve && t.k === 'num' && t.int) {
        // 판 1.x는 방향을 0·1로 쓴다
        reversed = t.v === 1;
        afterCurve = false;
      }
    }
    const a = pointOf(vs[0]);
    const b = pointOf(vs[1] ?? vs[0]);
    if (!a || !b) continue;
    const closed = (vs[1] ?? vs[0]) === vs[0] || len(sub(a, b)) < 1e-9;
    if (curve?.name === 'ellipse-curve') {
      const x = nums(fields(curve));
      if (x.length >= 10) {
        const c: V = [x[0]!, x[1]!, x[2]!];
        const nn: V = [x[3]!, x[4]!, x[5]!];
        const U: V = [x[6]!, x[7]!, x[8]!];
        const ratio = x[9]! || 1;
        const nl = len(nn) || 1;
        const N: V = [nn[0] / nl, nn[1] / nl, nn[2] / nl];
        const W = cross(N, U);
        const V2: V = [W[0] * ratio, W[1] * ratio, W[2] * ratio];
        const uu = dot(U, U);
        const vv = dot(V2, V2);
        if (uu > 0 && vv > 0) {
          const param = (p: V) => Math.atan2(dot(sub(p, c), V2) / vv, dot(sub(p, c), U) / uu);
          let t0 = param(a);
          let t1 = param(b);
          // 정방향이면 곡선 매개변수 증가 방향(법선 둘레 반시계)으로 시작 → 끝, 역방향이면 끝 → 시작
          if (reversed) [t0, t1] = [t1, t0];
          let sw = t1 - t0;
          while (sw <= 1e-12) sw += Math.PI * 2;
          if (closed) sw = Math.PI * 2;
          const n = Math.max(8, Math.ceil((sw / (Math.PI * 2)) * 96));
          const pts: V[] = [];
          for (let i = 0; i <= n; i++) {
            const t = t0 + (sw * i) / n;
            const ct = Math.cos(t);
            const st = Math.sin(t);
            pts.push([c[0] + U[0] * ct + V2[0] * st, c[1] + U[1] * ct + V2[1] * st, c[2] + U[2] * ct + V2[2] * st]);
          }
          emit(pts);
          continue;
        }
      }
    } else if (curve && curve.name !== 'straight-curve') {
      // 넙스 곡선(정확한 곡선 자료가 있으면): 두 꼭짓점에 가까운 매개변수 사이를 그린다
      const bs = bsCurve(fields(curve));
      if (bs) {
        const u0 = bs.knots[bs.degree]!;
        const u1 = bs.knots[bs.knots.length - bs.degree - 1]!;
        const samples: { u: number; p: V }[] = [];
        const N = 64;
        for (let i = 0; i <= N; i++) {
          const u = u0 + ((u1 - u0) * i) / N;
          samples.push({ u, p: deBoor(bs, Math.min(u, u1 - 1e-12 * Math.abs(u1 || 1))) });
        }
        const near = (q: V) => samples.reduce((best, s, i) => (len(sub(s.p, q)) < len(sub(samples[best]!.p, q)) ? i : best), 0);
        let i0 = near(a);
        let i1 = closed ? (i0 === 0 ? N : 0) : near(b);
        if (i0 > i1) [i0, i1] = [i1, i0];
        if (i1 - i0 >= 1) {
          const pts = samples.slice(i0, i1 + 1).map((s) => s.p);
          pts[0] = i0 === near(a) ? a : b;
          pts[pts.length - 1] = pts[0] === a ? b : a;
          emit(pts);
          continue;
        }
      }
    }
    if (!closed) emit([a, b]);
  }
  return out;
}

/** SAT 글(이미 푼 것) → 모서리 선 */
export function satWires(text: string): Vec3[][] {
  try {
    return edgesOf(satRecords(text));
  } catch {
    return [];
  }
}

/** SAB 이진 → 모서리 선(SAB가 아니면 null) */
export function sabWires(b: Uint8Array): Vec3[][] | null {
  try {
    const recs = sabRecords(b);
    return recs ? edgesOf(recs) : null;
  } catch {
    return null;
  }
}

/** DXF ACIS 객체의 원본 태그(1·3 SAT 줄)에서 모서리 선 */
export function dxfSatWires(raw: readonly { code: number; value: string | number }[]): Vec3[][] {
  const lines: string[] = [];
  for (const t of raw) {
    if (t.code === 1) lines.push(String(t.value));
    else if (t.code === 3 && lines.length) lines[lines.length - 1] += String(t.value);
  }
  if (!lines.length) return [];
  return satWires(lines.map((l) => decodeSatLine(l, true)).join('\n'));
}

const ACIS_KINDS = new Set(['REGION', '3DSOLID', 'BODY', 'SURFACE', 'PLANESURFACE', 'EXTRUDEDSURFACE', 'LOFTEDSURFACE', 'REVOLVEDSURFACE', 'SWEPTSURFACE', 'NURBSURFACE']);

/** DXF ACDSDATA 구역(원본 태그)에서 객체 핸들 → SAB 바이트(ASM_Data 레코드) */
export function dxfAcdsData(tags: readonly { code: number; value: string | number }[]): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  let handle: string | null = null;
  let asm = false;
  let hex: string[] = [];
  const flush = () => {
    if (handle && asm && hex.length) {
      const h = hex.join('');
      const b = new Uint8Array(h.length >> 1);
      for (let i = 0; i < b.length; i++) b[i] = parseInt(h.substr(i * 2, 2), 16);
      out.set(handle.toUpperCase(), b);
    }
    handle = null;
    asm = false;
    hex = [];
  };
  for (const t of tags) {
    if (t.code === 0) flush();
    else if (t.code === 320) handle = String(t.value).trim();
    else if (t.code === 2) asm = String(t.value) === 'ASM_Data';
    else if (t.code === 310 && asm) hex.push(String(t.value).trim());
  }
  flush();
  return out;
}

/**
 * 문서의 ACIS 객체에 모서리 선을 붙인다: DXF R2000~R2010은 원본 태그의 SAT, R2013+는 ACDSDATA의 SAB,
 * DWG R2013+는 자료 저장소의 SAB(sab: 핸들 → 바이트). 이미 선이 있으면 그대로
 */
export function attachAcisWires(doc: { blocks: Map<string, { entities: { type: string; handle: string; raw?: unknown; wires?: Vec3[][] }[] }>; rawSections?: { name: string; tags: { code: number; value: string | number }[] }[] }, sab?: Map<string, Uint8Array>): void {
  let store = sab ?? null;
  for (const b of doc.blocks.values())
    for (const e of b.entities) {
      if (!ACIS_KINDS.has(e.type) || e.wires?.length) continue;
      let w: Vec3[][] | null = null;
      if (Array.isArray(e.raw)) w = dxfSatWires(e.raw as { code: number; value: string | number }[]);
      if (!w?.length) {
        if (!store) {
          const sec = doc.rawSections?.find((x) => x.name === 'ACDSDATA');
          store = sec ? dxfAcdsData(sec.tags) : new Map();
        }
        const bytes = store.get(e.handle.toUpperCase());
        if (bytes) w = sabWires(bytes);
      }
      if (w?.length) e.wires = w;
    }
}

/** SAT 글 한 줄을 DXF 1·3 코드 글로 감춘다(풀기의 반대: 32보다 큰 글자 c → 159 − c, 'A'는 "^ ") */
export function encodeSatLine(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c <= 0x20) out += s[i];
    else {
      const e = String.fromCharCode(159 - c);
      out += e === '^' ? '^ ' : e;
    }
  }
  return out;
}

/** SAT 글 → DXF 원본 태그(AcDbModelerGeometry 70 1, 줄마다 1, 255자 넘으면 3으로 이어서) */
export function satDxfTags(sat: string, type: string): { code: number; value: string | number }[] {
  const tags: { code: number; value: string | number }[] = [{ code: 100, value: 'AcDbModelerGeometry' }, { code: 70, value: 1 }];
  for (const line of sat.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const enc = encodeSatLine(line);
    tags.push({ code: 1, value: enc.slice(0, 255) });
    for (let i = 255; i < enc.length; i += 255) tags.push({ code: 3, value: enc.slice(i, i + 255) });
  }
  if (type === '3DSOLID') tags.push({ code: 100, value: 'AcDb3dSolid' });
  return tags;
}
