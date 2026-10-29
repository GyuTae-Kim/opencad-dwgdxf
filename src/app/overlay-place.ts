/**
 * 도면 위 글(측정 결과 표시·커서 툴팁)이 보기 위에 떠 있는 판(명령행·휴대폰 보기 모드의 측정 띠·특성 시트)에 가리거나
 * 보기 가장자리에서 잘리지 않게 자리를 고른다(24차).
 * 375px 휴대폰에서 헤드리스로 재현한 것: 거리 결과 글(점 오른쪽 위, 폭 약 80px)이 오른쪽 가장자리 점에서 66px 잘리고,
 * 위 가장자리 점에서 10px 잘리며, 편집 화면 명령행 아래 점의 글은 명령행 밑에 숨었다(1,033px²).
 * 규칙: 겹치지도 잘리지도 않는 기본 자리는 그대로 두고, 그럴 때만 정해진 차례의 다른 자리로 옮긴다
 * (같은 밤 NC·STEP·SketchUp 앱이 측정 글을 뷰 큐브·측정 띠에서 비킨 것과 같은 방식 — 겹칠 때만 옮긴다).
 */

/** 보기(캔버스) 좌표의 상자 */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const overlaps = (a: Box, b: Box) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.5 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 0.5;
const inside = (a: Box, w: number, h: number) => a.x0 >= -0.5 && a.y0 >= -0.5 && a.x1 <= w + 0.5 && a.y1 <= h + 0.5;
const free = (a: Box, w: number, h: number, covers: readonly Box[]) => inside(a, w, h) && !covers.some((c) => overlaps(a, c));

/**
 * 점 q에 붙이는 한 줄 글(폭 tw, 기준선 위 asc·아래 desc)의 기준선 자리.
 * 기본은 점 오른쪽 위(x + 7, y − 6 — 예전 자리). 보기 밖으로 나가거나 덮개와 겹치면 왼쪽 위 → 오른쪽 아래 → 왼쪽 아래 차례의
 * 첫 빈자리, 없으면 보기 안으로 당긴 기본 자리를 덮개 위(모자라면 아래)로 옮긴다. 점이 보기 밖이면 기본 자리 그대로
 * (보이지 않는 점의 글을 가장자리에 붙여 두지 않는다)
 */
export function placeLabel(q: { x: number; y: number }, tw: number, asc: number, desc: number, w: number, h: number, covers: readonly Box[]): { x: number; y: number; box: Box } {
  const at = (x: number, y: number) => ({ x, y, box: { x0: x, y0: y - asc, x1: x + tw, y1: y + desc } });
  const def = at(q.x + 7, q.y - 6);
  if (q.x < 0 || q.y < 0 || q.x > w || q.y > h) return def;
  if (free(def.box, w, h, covers)) return def;
  const cands = [at(q.x - 7 - tw, q.y - 6), at(q.x + 7, q.y + 6 + asc), at(q.x - 7 - tw, q.y + 6 + asc)];
  for (const c of cands) if (free(c.box, w, h, covers)) return c;
  // 보기 안으로 당기고(가로·세로), 덮개와 겹치면 그 위로(위에 자리가 없으면 아래로)
  let x = Math.min(Math.max(def.x, 2), Math.max(2, w - tw - 2));
  let y = Math.min(Math.max(def.y, asc + 2), Math.max(asc + 2, h - desc - 2));
  for (let i = 0; i < 4; i++) {
    const hit = covers.find((c) => overlaps(at(x, y).box, c));
    if (!hit) break;
    const up = hit.y0 - desc - 2;
    const down = hit.y1 + asc + 2;
    if (up - asc >= 0) y = up;
    else if (down + desc <= h) y = down;
    else break;
    x = Math.min(Math.max(x, 2), Math.max(2, w - tw - 2));
  }
  return at(x, y);
}

/**
 * 커서 툴팁(동적 입력 상자 포함 — 폭 bw, 높이 bh)의 왼쪽 위 자리. 기본은 커서 오른쪽 아래(정밀 조준이면 커서 위 — 손가락이 아래),
 * 보기 오른쪽·아래 끝에서는 안으로 당긴다(예전 자리). 덮개와 겹칠 때만 위아래 → 좌우 → 둘 다 뒤집은 첫 빈자리로 옮긴다
 */
export function placeTip(c: { x: number; y: number }, bw: number, bh: number, aim: boolean, w: number, h: number, covers: readonly Box[], rightPad = 14): { x: number; y: number; box: Box } {
  const at = (x: number, y: number) => ({ x, y, box: { x0: x, y0: y, x1: x + bw, y1: y + bh } });
  const below = Math.min(c.y + 22, h - bh - 4);
  const above = Math.max(4, c.y - 26 - bh);
  const right = Math.min(c.x + 18, w - bw - rightPad);
  const left = Math.max(4, c.x - 18 - bw);
  const def = at(right, aim ? above : below);
  if (!covers.some((k) => overlaps(def.box, k))) return def;
  for (const cand of [at(right, aim ? below : above), at(left, aim ? above : below), at(left, aim ? below : above)]) if (free(cand.box, w, h, covers)) return cand;
  return def;
}

/** 보기 위에 떠 있는 판들의 보기 기준 상자(숨었거나 보기와 겹치지 않는 것은 뺀다) */
export function coverBoxes(view: Element, els: readonly (Element | null | undefined)[]): Box[] {
  const r = view.getBoundingClientRect();
  const out: Box[] = [];
  for (const el of els) {
    if (!el || !el.isConnected || (el as HTMLElement).hidden || !el.getClientRects().length) continue;
    if (typeof getComputedStyle === 'function' && getComputedStyle(el).visibility === 'hidden') continue;
    const b = el.getBoundingClientRect();
    const box = { x0: b.left - r.left, y0: b.top - r.top, x1: b.right - r.left, y1: b.bottom - r.top };
    if (box.x1 <= 0 || box.y1 <= 0 || box.x0 >= r.width || box.y0 >= r.height || box.x1 - box.x0 < 1 || box.y1 - box.y0 < 1) continue;
    out.push(box);
  }
  return out;
}
