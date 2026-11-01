/**
 * AcDb:AcDsPrototype_1b(자료 저장소, ODA 명세 24장): R2013+ DWG가 ACIS 객체(REGION·3DSOLID)의 SAB를 담는 곳.
 * 파일 머리 → 구역 색인(segidx) → 자료 색인(datidx) → 자료 구역(_data_)의 레코드 머리(핸들)와 자료(또는 blob01 쪽들).
 * 읽기만 한다(같은 버전으로 저장할 때는 구역 바이트를 그대로 쓴다 — writer/index.ts).
 */

const SEG_HEADER = 48;

/** 핸들(대문자 16진) → 자료 바이트. 풀 수 없으면 빈 지도 */
export function acdsRecords(data: Uint8Array): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  try {
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const i32 = (p: number) => dv.getInt32(p, true);
    const u32 = (p: number) => dv.getUint32(p, true);
    const u64 = (p: number) => u32(p) + u32(p + 4) * 0x100000000;
    // 파일 머리
    const segIdxOffset = i32(24);
    const segCount = i32(32);
    const dataIdxSeg = i32(40);
    if (!(segIdxOffset > 0 && segIdxOffset < data.length && segCount > 0 && segCount < 1000000)) return out;
    // 구역 색인: (오프셋 UInt64, 크기 UInt32)
    const segs: { off: number; size: number }[] = [];
    for (let i = 0; i < segCount; i++) {
      const p = segIdxOffset + SEG_HEADER + i * 12;
      if (p + 12 > data.length) break;
      segs.push({ off: u64(p), size: u32(p + 8) });
    }
    const seg = (i: number) => (i > 0 && i < segs.length ? segs[i]! : null);
    const nameAt = (off: number) => (off + 8 <= data.length ? String.fromCharCode(...data.subarray(off + 2, off + 8)) : '');
    // 자료 색인이 가리키는 자료 구역(지금 것)을 먼저, 그다음 나머지 자료 구역(R2018은 객체마다 다른 구역에 남기기도 한다 — 색인에 없는 구역의 레코드도 읽는다)
    const order = new Set<number>();
    const di = seg(dataIdxSeg);
    if (di && nameAt(di.off) === 'datidx') {
      const n = i32(di.off + SEG_HEADER);
      for (let i = 0; i < n && i < 1000000; i++) {
        const p = di.off + SEG_HEADER + 8 + i * 12;
        if (p + 12 > data.length) break;
        const s = u32(p);
        if (seg(s)) order.add(s);
      }
    }
    for (let i = segs.length - 1; i > 0; i--) if (segs[i]!.off && nameAt(segs[i]!.off) === '_data_') order.add(i);
    // 레코드 머리·자료는 저장소 안에 한 번씩 있다. 색인이 같은 자리를 되풀이해 가리켜도 저장소 크기에 비례한 일만 한다(모자라면 읽은 데까지)
    const budget = data.length * 2;
    let spent = 0;
    for (const si of order) {
      if (spent > budget) break;
      const s = seg(si);
      if (!s || nameAt(s.off) !== '_data_') continue;
      // 레코드 머리(항목 크기 20, 1, 핸들 UInt64, 자료 시작 기준 위치)가 구역 머리 다음에 이어지고, 자료는 16바이트 경계(빈자리는 'b')에서 시작한다
      const heads: { handle: number; rel: number }[] = [];
      let p = s.off + SEG_HEADER;
      const segEnd = Math.min(data.length, s.off + (s.size || data.length));
      while (p + 20 <= segEnd && u32(p) === 20 && u32(p + 4) === 1) {
        heads.push({ handle: u64(p + 8), rel: u32(p + 16) });
        p += 20;
      }
      spent += heads.length * 20;
      if (!heads.length) continue;
      const marker = s.off + Math.ceil((p - s.off) / 16) * 16;
      for (const h of heads) {
        if (spent > budget) break;
        const key = h.handle.toString(16).toUpperCase();
        if (out.has(key)) continue;
        const at = marker + h.rel;
        if (at + 4 > data.length) continue;
        const size = u32(at);
        let bytes: Uint8Array | null = null;
        if (size === 0xbb106bb1) {
          // 큰 자료: blob01 쪽들
          const total = u64(at + 4);
          const pages = u32(at + 12);
          const parts: Uint8Array[] = [];
          let sum = 0;
          for (let k = 0; k < pages; k++) {
            const pp = at + 4 + 32 + k * 8;
            const bs = seg(u32(pp));
            if (!bs) break;
            const b0 = bs.off + SEG_HEADER;
            const len = u64(b0 + 24);
            const part = data.subarray(b0 + 32, b0 + 32 + len);
            // 쪽들의 합은 저장소보다 클 수 없다(같은 쪽을 되풀이해 가리키면 파일의 수천 배를 잡게 된다)
            if (sum + part.length > data.length) break;
            parts.push(part);
            sum += part.length;
          }
          const all = new Uint8Array(Math.min(total, sum));
          spent += parts.length * 8 + all.length;
          let o = 0;
          for (const part of parts) {
            all.set(part.subarray(0, all.length - o), o);
            o += part.length;
            if (o >= all.length) break;
          }
          bytes = all;
        } else if (size > 0 && at + 4 + size <= data.length) {
          bytes = data.subarray(at + 4, at + 4 + size);
          spent += size;
        }
        if (bytes) out.set(key, bytes);
      }
    }
  } catch {
    /* 망가진 저장소는 건너뛴다 */
  }
  return out;
}
