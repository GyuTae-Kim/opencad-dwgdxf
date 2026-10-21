/** 시험용 SAT(판 4.0, 이 저장소에서 만든 것): 원·반원·넙스 원 영역, 구멍 있는 한 면 */
const HEAD = '400 0 1 0\n@7 OpenCAD 12 ACIS 7.0 NT 24 Thu Oct 22 00:00:00 2026\n1 9.9999999999999995e-07 1e-10\n';

/** 레코드 목록(번호는 차례) → SAT 글 */
function sat(recs: string[]): string {
  return HEAD + recs.map((r) => `${r} #`).join('\n') + '\nEnd-of-ACIS-data\n';
}

/** 면 하나에 원 고리 여럿(중심·반지름). 첫 원이 바깥, 나머지는 같은 면의 고리(구멍) */
export function circlesFaceSat(circles: [number, number, number][]): string {
  // 0 body, 1 lump, 2 shell, 3 face, 4 plane, 그다음 원마다 loop, coedge, edge, vertex, ellipse, point
  const recs = ['body $-1 $1 $-1 $-1', 'lump $-1 $-1 $2 $0', 'shell $-1 $-1 $-1 $3 $-1 $1', 'face $-1 $-1 $5 $2 $-1 $4 forward single out', 'plane-surface $-1 0 0 0 0 0 1 1 0 0 forward_v I I I I'];
  circles.forEach(([cx, cy, r], i) => {
    const b = 5 + i * 6;
    const next = i + 1 < circles.length ? `$${b + 6}` : '$-1';
    recs.push(`loop $-1 ${next} $${b + 1} $3`);
    recs.push(`coedge $-1 $${b + 1} $${b + 1} $-1 $${b + 2} ${i ? 'reversed' : 'forward'} $${b} $-1`);
    recs.push(`edge $-1 $${b + 3} $${b + 3} $${b + 1} $${b + 4} forward`);
    recs.push(`vertex $-1 $${b + 2} $${b + 5}`);
    recs.push(`ellipse-curve $-1 ${cx} ${cy} 0 0 0 1 ${r} 0 0 1 I I`);
    recs.push(`point $-1 ${cx + r} ${cy} 0`);
  });
  return sat(recs);
}

/** 왼쪽 반원(지름이 Y축 위 (0,−r)~(0,r)): 직선 모서리 + 타원 곡선 반쪽 */
export function halfDiscSat(r: number): string {
  return sat([
    'body $-1 $1 $-1 $-1',
    'lump $-1 $-1 $2 $0',
    'shell $-1 $-1 $-1 $3 $-1 $1',
    'face $-1 $-1 $5 $2 $-1 $4 forward single out',
    'plane-surface $-1 0 0 0 0 0 1 1 0 0 forward_v I I I I',
    'loop $-1 $-1 $6 $3',
    'coedge $-1 $7 $7 $-1 $8 forward $5 $-1',
    'coedge $-1 $6 $6 $-1 $9 forward $5 $-1',
    'edge $-1 $10 $11 $6 $12 forward',
    'edge $-1 $11 $10 $7 $13 forward',
    'vertex $-1 $8 $14',
    'vertex $-1 $8 $15',
    'straight-curve $-1 0 0 0 0 1 0 I I',
    'ellipse-curve $-1 0 0 0 0 0 1 ' + r + ' 0 0 1 I I',
    `point $-1 0 ${-r} 0`,
    `point $-1 0 ${r} 0`,
  ]);
}

/** 넙스(유리 2차, 조정점 9개)로 그린 원 영역 */
export function nurbsCircleSat(r: number): string {
  const s = Math.SQRT1_2;
  const pts = [
    [r, 0, 1],
    [r, r, s],
    [0, r, 1],
    [-r, r, s],
    [-r, 0, 1],
    [-r, -r, s],
    [0, -r, 1],
    [r, -r, s],
    [r, 0, 1],
  ];
  const ctrl = pts.map(([x, y, w]) => `${x} ${y} 0 ${w}`).join(' ');
  return sat([
    'body $-1 $1 $-1 $-1',
    'lump $-1 $-1 $2 $0',
    'shell $-1 $-1 $-1 $3 $-1 $1',
    'face $-1 $-1 $5 $2 $-1 $4 forward single out',
    'plane-surface $-1 0 0 0 0 0 1 1 0 0 forward_v I I I I',
    'loop $-1 $-1 $6 $3',
    'coedge $-1 $6 $6 $-1 $7 forward $5 $-1',
    'edge $-1 $8 $8 $6 $9 forward',
    'vertex $-1 $7 $10',
    `intcurve-curve $-1 forward { exactcur nurbs 2 open 5 0 2 0.25 2 0.5 2 0.75 2 1 2 ${ctrl} 0 }`,
    `point $-1 ${r} 0 0`,
  ]);
}
