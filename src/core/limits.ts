/**
 * 파일에서 읽은 수가 반복 수·배열 크기를 정하는 자리의 한도(35차 — 손상되었거나 일부러 만든 파일이 화면을 멈추거나 메모리를 다 쓰지 않게).
 * 형식이 허용하는 값이 브라우저에서 그릴 수 있는 양을 훨씬 넘는 자리는 실제 도면이 닿지 않는 값으로 잡았다.
 * 한도를 넘으면 자르거나 읽지 않고 경고한다.
 */

/**
 * 표 하나의 셀 수(행 × 열). DXF 91·92는 32비트 정수라 형식 한도는 사실상 없다. 셀마다 객체를 만들므로 이보다 크면
 * 표로 다루지 않는다(표 그림 블록은 그대로 그린다). 1000행 × 1000열이다
 */
export const TABLE_CELL_LIMIT = 1_000_000;

/**
 * 다중 삽입(MINSERT) 하나에서 펼치는 칸 수. DXF 70·71과 DWG BS는 16비트라 형식 한도는 32767 × 32767(약 10억)이다.
 * 도면 값은 그대로 두고(다시 저장해도 같다) 그리기·분해·세기만 이 칸 수까지 펼친다
 */
export const MINSERT_LIMIT = 1_000_000;

/** MINSERT에서 펼칠 행·열. 한도를 넘으면 비율을 지켜 줄인다 */
export function minsertGrid(e: { rowCount: number; columnCount: number }): { rows: number; cols: number; cut: boolean } {
  const rows = Math.max(1, Math.trunc(e.rowCount) || 1);
  const cols = Math.max(1, Math.trunc(e.columnCount) || 1);
  if (rows * cols <= MINSERT_LIMIT) return { rows, cols, cut: false };
  const k = Math.sqrt(MINSERT_LIMIT / (rows * cols));
  const r = Math.max(1, Math.floor(rows * k));
  return { rows: r, cols: Math.min(Math.max(1, Math.floor(cols * k)), Math.floor(MINSERT_LIMIT / r)), cut: true };
}

/**
 * 블록을 펼쳐 그리는 일의 한도: 기본 + 도면 객체 하나당. 일 = 블록 안 객체를 찾아간 수 + 거기서 나온 조각(선분·삼각형·글리프) 수.
 * 블록 안에 블록을 넣으면 일이 곱으로 늘어(깊이 16에 10개씩이면 10^16) 작은 파일 하나로 화면이 멈춘다.
 * 정상 도면은 객체 수에 비례해 커지므로 객체 하나당 몫을 넉넉히 준다.
 * 기본 값은 객체가 적은 도면의 큰 다중 삽입이 잘리지 않게 잡았다: MINSERT_LIMIT 100만 칸 × 블록 객체 10개의 일은
 * 칸 1 + 객체 방문 10 + 조각 10 = 2,100만이다. 객체 500개 블록(객체당 선분 50개)을 500번 넣으면 1,275만이고 장면 한도 6천만 안쪽이다.
 * 조각 없이 시간이나 메모리를 쓰는 것도 일로 센다: 자르기로 빠진 조각, 문자 배치, 해치 계산, 프록시 해석, 치수 변수, 글리프(조각 3개 몫).
 * 그래서 어떤 객체든 일 하나가 조각 하나 그리는 시간(로컬 약 0.2µs)의 몇 배 안쪽이다. 그림을 내는 정상 객체는 그 조각 수만큼만 센다
 */
export const BLOCK_WORK_BASE = 24_000_000;
export const BLOCK_WORK_PER_ENTITY = 2_000;
/** 도면이 아무리 커도 블록 펼침은 이만큼까지. 그 안에서도 조각은 SCENE_PIECE_LIMIT에서 멈춘다 */
export const BLOCK_WORK_MAX = 100_000_000;

/**
 * 표시 목록을 만드는 동안 잡는 메모리 ≤ PEAK_BYTES_PER_WORK × 일 + PEAK_BYTES_BASE.
 * 선분 하나가 임시 그림 44바이트 + 묶음 24바이트이고, 쪽으로 늘려 옛 버퍼나 남는 자리가 쌓이지 않는다.
 * 삼각형·글리프는 바이트가 더 크지만 그만큼 일을 더 세므로 일당 바이트는 선분보다 크지 않다(합성 폭탄으로 잰 값 일당 17~68바이트)
 */
export const PEAK_BYTES_PER_WORK = 80;
/** 임시 그림 쪽 하나와 처음 잡는 버퍼들 */
export const PEAK_BYTES_BASE = 64 * 1048576;

/** 객체 수가 entities인 도면의 블록 펼침 한도 */
export function blockWorkLimit(entities: number): number {
  return Math.min(BLOCK_WORK_MAX, BLOCK_WORK_BASE + BLOCK_WORK_PER_ENTITY * entities);
}

/**
 * 장면 하나의 조각 수가 이만큼을 넘으면 늘어나는 그림을 더 펼치지 않는다: 해치는 경계만, 선종류는 실선으로.
 * 객체 하나가 작은 파일 조각에서 대시 수만 개·무늬 선 수십만 개로 늘어나기 때문이다(객체 자체는 그대로 그린다)
 */
export const SCENE_PIECE_LIMIT = 60_000_000;

/**
 * NURBS 스플라인 차수. AutoCAD SPLINEDIT의 "차수 올리기"(Elevate Order) 최댓값 26이 계수(order)라 차수로는 25다.
 * DXF 71에는 범위가 없고 계산량이 차수의 제곱에 비례하므로 더 큰 차수는 이 값으로 계산한다
 */
export const SPLINE_MAX_DEGREE = 25;

/** 맞춤점 전역 보간은 점 수의 제곱 크기 행렬을 푼다. 이보다 많으면 점을 잇는 꺾은선으로 그린다 */
export const FIT_INTERPOLATE_LIMIT = 2048;

/** 맞춤점 n개 전역 보간의 일(조각 단위). 로컬에서 잰 시간: 50개 0.13ms, 200개 1.3ms, 1000개 132ms, 2048개 856ms */
export function fitSolveWork(n: number): number {
  return Math.floor((n * n) / 8 + (n * n * n) / 2000);
}

/** 객체 하나에 입히는 선종류 무늬의 최대 반복 수. 넘으면 실선으로 그린다 */
export const DASH_REPEAT_LIMIT = 20_000;
/**
 * 선종류 정의 하나의 요소 수. AutoCAD 선종류 파일(.lin)은 정의 하나에 대시 길이를 12개까지 쓴다.
 * DXF 73과 DWG에는 범위가 없어 값 자체는 그대로 읽고 저장하고, 그리는 일만 이 값으로 잡는다
 */
export const LINETYPE_ELEMENTS = 12;
/**
 * 객체 하나에서 무늬 요소를 밟는 수(반복 × 요소). 틈은 조각을 내지 않아 조각 한도가 못 본다.
 * 형식 안의 선종류는 반복 한도까지 닿아도 넘지 않는 값이고, 넘으면 실선으로 그린다
 */
export const DASH_STEP_LIMIT = DASH_REPEAT_LIMIT * LINETYPE_ELEMENTS;

/** 압축을 푼 섹션·페이지 크기는 파일 크기의 이 배수(+ 1 MiB)를 넘지 않는다(R2004·R2007 섹션 크기 검사의 기준) */
export const DECOMPRESS_RATIO = 32;

/** 파일 크기로 정해지는 압축 해제 크기 한도 */
export function decompressLimit(fileBytes: number): number {
  return fileBytes * DECOMPRESS_RATIO + 0x100000;
}

/** 압축을 푼 크기가 파일 크기에 비해 말이 되는지 */
export function decompressedSizeOk(size: number, fileBytes: number): boolean {
  return Number.isFinite(size) && size >= 0 && size <= decompressLimit(fileBytes);
}

/**
 * 섹션 하나를 읽을 때 페이지를 따라가며 하는 일(체크섬·복호·압축 풀기 바이트)의 한도.
 * 정상 파일은 페이지를 한 번씩만 읽으므로 파일 크기 + 섹션 크기 안쪽이다. 페이지 지도가 같은 페이지를 수백만 번 가리키면 여기서 멈춘다
 */
export function sectionWorkLimit(fileBytes: number): number {
  return decompressLimit(fileBytes) * 3;
}
