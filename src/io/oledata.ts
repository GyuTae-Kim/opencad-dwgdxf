/**
 * OLE2FRAME 자료(DXF 310 = DWG 본문의 같은 바이트)의 머리: 2바이트 뒤에 네 모서리(왼쪽 위·오른쪽 위·오른쪽 아래·왼쪽 아래)가
 * 각각 x·y·z double로 있다. DXF의 10·11은 첫째·셋째 모서리다(73차 — 같은 도면을 AutoCAD가 쓴 DWG·DXF 짝 TS1로 확인).
 */
import type { Vec3 } from '../core/model';

const at = (dv: DataView, o: number): Vec3 => ({ x: dv.getFloat64(o, true), y: dv.getFloat64(o + 8, true), z: dv.getFloat64(o + 16, true) });

/** 왼쪽 위·오른쪽 아래 모서리. 자료가 짧거나 값이 이상하면 null */
export function oleCorners(data: Uint8Array): [Vec3, Vec3] | null {
  if (data.length < 98) return null;
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const a = at(dv, 2);
  const b = at(dv, 50);
  const ok = (v: Vec3) => [v.x, v.y, v.z].every((n) => Number.isFinite(n) && Math.abs(n) < 1e100);
  return ok(a) && ok(b) && (a.x !== b.x || a.y !== b.y) ? [a, b] : null;
}

/** 머리의 네 모서리를 지금 자리(옮기거나 늘인 틀 — 축에 나란하다)로 고친 자료. 같으면 그대로 */
export function oleDataAt(data: Uint8Array, a: Vec3, b: Vec3): Uint8Array {
  const c = oleCorners(data);
  const same = (p: Vec3, q: Vec3) => p.x === q.x && p.y === q.y && p.z === q.z;
  if (!c || (same(c[0], a) && same(c[1], b))) return data;
  const out = data.slice();
  const dv = new DataView(out.buffer);
  const put = (o: number, x: number, y: number, z: number) => {
    dv.setFloat64(o, x, true);
    dv.setFloat64(o + 8, y, true);
    dv.setFloat64(o + 16, z, true);
  };
  put(2, a.x, a.y, a.z);
  put(26, b.x, a.y, a.z);
  put(50, b.x, b.y, b.z);
  put(74, a.x, b.y, b.z);
  return out;
}
