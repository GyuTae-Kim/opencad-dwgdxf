/**
 * 2D 보기 링크(순수, DOM 없음): 지금 화면의 가운데·보이는 크기·배치 탭만 주소 조각(#)에 담는다 — 파일 내용은 담지 않는다.
 * 받는 사람이 같은 파일을 열면(또는 ?sample, ?open=주소와 함께) 그 화면을 맞춘다.
 *
 * #view=c:cx,cy;s:w,h;lay:<배치 이름(URI 부호화)>
 *  - c: 화면 가운데(도면 좌표), s: 보이는 폭·높이(도면 단위) — 받는 화면 크기가 달라도 같은 범위가 들어오게 맞춘다
 *  - lay: 배치 탭 이름(모형이면 없음)
 */

export interface ViewLink {
  center: [number, number];
  /** 보이는 폭·높이(도면 단위, 0보다 크다) */
  size: [number, number];
  /** 배치 탭 이름(모형이면 없음) */
  layout?: string;
}

/** 가운데는 큰 좌표에서도 확대한 화면이 어긋나지 않게 12자리, 크기는 7자리 */
const c12 = (v: number) => String(Number(v.toPrecision(12)));
const n7 = (v: number) => String(Number(v.toPrecision(7)));

/** 보기 → 해시 글(앞의 # 없이). 값이 잘못됐으면 빈 글 */
export function encodeViewLink(v: ViewLink): string {
  const [cx, cy] = v.center;
  const [w, h] = v.size;
  if (![cx, cy, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return '';
  const parts = [`c:${c12(cx)},${c12(cy)}`, `s:${n7(w)},${n7(h)}`];
  if (v.layout) parts.push(`lay:${encodeURIComponent(v.layout)}`);
  return `view=${parts.join(';')}`;
}

/** 해시 글(# 있어도 됨) → 보기, 아니면 null */
export function decodeViewLink(hash: string): ViewLink | null {
  const h = hash.replace(/^#/, '');
  const m = /(?:^|&)view=([^&]*)/.exec(h);
  if (!m) return null;
  let center: [number, number] | null = null;
  let size: [number, number] | null = null;
  let layout: string | undefined;
  // 배치 이름 안의 ; , : 는 부호화되어 있으니(브라우저는 해시의 ; , : 를 바꾸지 않는다) 나눈 뒤에 푼다
  for (const part of m[1]!.split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const key = part.slice(0, i);
    const val = part.slice(i + 1);
    if (key === 'c' || key === 's') {
      const nums = val.split(',').map(Number);
      if (nums.length !== 2 || !nums.every(Number.isFinite)) continue;
      if (key === 'c') center = [nums[0]!, nums[1]!];
      else if (nums[0]! > 0 && nums[1]! > 0) size = [nums[0]!, nums[1]!];
    } else if (key === 'lay') {
      try {
        const name = decodeURIComponent(val).trim();
        if (name && name.length <= 255) layout = name;
      } catch {
        /* 잘못된 부호화는 버린다 */
      }
    }
  }
  if (!center || !size) return null;
  return layout ? { center, size, layout } : { center, size };
}

/** 지금 주소에 보기 해시를 붙인 공유 주소(다른 해시 인자는 남기고 view만 바꾼다) */
export function viewUrl(href: string, v: ViewLink): string {
  const u = new URL(href);
  const rest = u.hash
    .replace(/^#/, '')
    .split('&')
    .filter((p) => p && !p.startsWith('view='));
  const enc = encodeViewLink(v);
  u.hash = [...rest, ...(enc ? [enc] : [])].join('&');
  return u.href;
}

/** 보이는 사각형 [x0, y0, x1, y1] ↔ 보기 */
export function viewFromRect(r: readonly [number, number, number, number], layout?: string): ViewLink {
  const v: ViewLink = { center: [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2], size: [Math.abs(r[2] - r[0]), Math.abs(r[3] - r[1])] };
  if (layout) v.layout = layout;
  return v;
}

export function rectOf(v: ViewLink): [number, number, number, number] {
  const [cx, cy] = v.center;
  const [w, h] = v.size;
  return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
}
