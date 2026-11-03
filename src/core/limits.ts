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

/** 표 크기가 한도 안인지. 곱만 보면 행이나 열이 0일 때 다른 쪽이 얼마든 지나간다(쓰기는 행 수만큼 돈다) */
export function tableSizeOk(rows: number, cols: number): boolean {
  const r = Math.abs(rows);
  const c = Math.abs(cols);
  return r <= TABLE_CELL_LIMIT && c <= TABLE_CELL_LIMIT && r * c <= TABLE_CELL_LIMIT;
}

/**
 * DWG R2010+ 표에서 셀 자료 없이 행·열 목록만으로 만드는 칸 수. 칸마다 객체와 태그를 만들므로(칸 하나 약 1.5KB)
 * 파일에 셀이 없는 칸이 이보다 많으면 표로 풀지 않는다. 행·열 목록은 칸 수의 제곱근만큼의 바이트라 7KB로 힙이 넘쳤다.
 * AutoCAD 표는 행마다 열 수만큼 셀이 있어 빈 칸이 없다
 */
export const TABLE_EMPTY_CELLS = 1024;

/** 표 병합의 넓이 합이 칸 수의 이 배수(+ 빈 칸 수)를 넘으면 망가진 표다. 병합은 겹치지 않으므로 정상 표는 1배 안쪽이다 */
export const TABLE_MERGE_RATIO = 4;

/** DWG 문서 하나에서 표로 푸는 칸 수 합의 상한. 칸 하나가 약 1.1KB의 힙을 쓰므로 힙이 넘치기 전에 멈춘다 */
export const TABLE_CELLS_MAX = 3_000_000;

/**
 * DWG 문서 하나에서 표로 푸는 칸 수의 합. 셀 하나는 압축된 파일에서 1바이트 안쪽일 수 있어, 표마다 한도 안이어도 표를 늘리면
 * 힙이 넘친다. 옛 형식(R2007까지)의 셀은 객체 구역에서 약 10바이트이므로 8바이트로 나누면 정상 도면은 상한 안에서 닿지 않는다
 */
export function tableCellBudget(objectBytes: number): number {
  return Math.min(TABLE_CELLS_MAX, TABLE_CELL_LIMIT + Math.floor(objectBytes / 8));
}

/**
 * 다중 삽입(MINSERT) 하나에서 펼치는 칸 수. DXF 70·71과 DWG BS는 16비트라 형식 한도는 32767 × 32767(약 10억)이다.
 * 도면 값은 그대로 두고(다시 저장해도 같다) 그리기·분해·경계 찾기·모서리만 이 칸 수까지 펼친다. COUNT는 펼치지 않고 행 × 열로 센다(minsertCells)
 */
export const MINSERT_LIMIT = 1_000_000;

/** MINSERT의 행·열(0·음수·수가 아닌 값은 1) */
function minsertSize(e: { rowCount: number; columnCount: number }): { rows: number; cols: number } {
  return { rows: Math.max(1, Math.trunc(e.rowCount) || 1), cols: Math.max(1, Math.trunc(e.columnCount) || 1) };
}

/** MINSERT의 칸 수(행 × 열, 한도로 줄이지 않는다) */
export function minsertCells(e: { rowCount: number; columnCount: number }): number {
  const { rows, cols } = minsertSize(e);
  return rows * cols;
}

/** MINSERT에서 펼칠 행·열. 한도를 넘으면 비율을 지켜 줄인다 */
export function minsertGrid(e: { rowCount: number; columnCount: number }): { rows: number; cols: number; cut: boolean } {
  const { rows, cols } = minsertSize(e);
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
/** 블록 펼침 한도의 윗값. 객체가 200만 개를 넘는 도면은 장면 일 한도처럼 객체당 SCENE_WORK_PER_ENTITY로 늘어난다(sceneWorkLimit) */
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
  return Math.min(Math.max(BLOCK_WORK_MAX, SCENE_WORK_PER_ENTITY * entities), BLOCK_WORK_BASE + BLOCK_WORK_PER_ENTITY * entities);
}

/**
 * 명령이 블록을 펼치는 일의 몫(59차): 펼쳐 만들거나 찾아가는 블록 안 객체 수. 객체 범위·모서리·곡선 묶기가 한 번 부를 때마다
 * 기본 + 도면 객체 수만큼 쓴다. 깊이 한도만 있으면 블록 안에 블록을 넣은 작은 파일(깊이 6에 10개씩, DXF 2KB)로 객체 범위가 8초 걸리고
 * 깊이 한도 8까지는 몇 시간이 걸렸다. 정상 도면의 블록 참조 하나는 대개 도면 객체 수보다 적게 펼친다
 */
export const COMMAND_EXPAND_BASE = 250_000;
/** 객체 스냅은 커서를 움직일 때마다 후보 객체들을 펼치므로 한 번에 이만큼만 쓴다(블록 객체 200개씩 세 겹이면 800만 점에 1.5초였다) */
export const SNAP_EXPAND_LIMIT = 200_000;

export interface ExpandBudget {
  left: number;
  /** 몫이 모자라 펼치지 않은 것이 있다 */
  cut: boolean;
}

/** 객체 수가 entities인 도면에서 명령 한 번이 쓰는 펼침 몫 */
export function expandBudget(entities: number, base = COMMAND_EXPAND_BASE): ExpandBudget {
  return { left: base + entities, cut: false };
}

/** n개를 펼칠 몫이 있으면 쓰고 true, 없으면 잘렸다고 적고 false */
export function spendExpand(b: ExpandBudget, n: number): boolean {
  if (n > b.left) {
    b.cut = true;
    return false;
  }
  b.left -= n;
  return true;
}

/**
 * 장면 하나의 일 한도. 일은 메모리 공식(PEAK_BYTES_PER_WORK)과 같은 단위라 글리프는 조각 3개 몫이다.
 * 늘어나는 그림은 이 값과 블록 일 한도(blockWorkLimit) 가운데 작은 쪽에서 낮춘다: 남은 해치는 경계만, 남은 선종류는 실선으로.
 * 객체 하나가 작은 파일 조각에서 대시 수만 개·무늬 선 수십만 개로 늘어나기 때문이다. 낮출 때 그 객체는 빠지지 않고 경고가 나오며, 해치는 확대하면 보이는 곳의 세부로 돌아온다.
 * 블록과 치수는 그 뒤로 SCENE_BLOCK_TAIL까지만 그리고, 넘으면 경고와 함께 빠진다. 블록을 끊는 일도 이 값을 넘지 않는다.
 * 객체 수가 적고 조각이 2,400만을 넘는 도면만 닿는다. 작은 파일의 일은 2,800만 + 객체당 2,000 안쪽이고, 낮춤을 일부러 늦추면 꼬리를 한 번 더 써 3,200만 + 객체당 2,000 안쪽이다.
 * 객체가 120만 개를 넘는 도면은 객체당 SCENE_WORK_PER_ENTITY로 늘어난다(sceneWorkLimit)
 */
export const SCENE_PIECE_LIMIT = 60_000_000;
/**
 * 객체가 아주 많은 도면의 장면 일: 객체 하나당 이만큼. 정상 도면은 객체 수에 비례해 커지는데 고정 한도 하나로는 큰 실제 도면이 잘린다.
 * 569MB 킬 시 지도(객체 290만 개)는 다 그리는 데 객체당 약 21(블록 일 3,300만, 조각 6,200만, 표시 목록 최대 2.7GiB)을 쓴다
 */
export const SCENE_WORK_PER_ENTITY = 50;

/** 객체 수가 entities인 도면의 장면 일 한도 */
export function sceneWorkLimit(entities: number): number {
  return Math.max(SCENE_PIECE_LIMIT, SCENE_WORK_PER_ENTITY * entities);
}

/**
 * 무늬를 낮춘 뒤에도 블록과 치수를 그리는 꼬리(장면 일). 합법 해치 뒤의 참조와 치수가 통째로 빠지지 않을 만큼만 남긴다.
 * 낮춘 때의 일 위로 세므로 마지막 해치가 넘친 몫을 깎지 않고, 아직 낮추지 않았으면 낮춤 한도 위로 세므로 대시 일을 한도 바로 아래로 맞춰도 묶인다
 */
export const SCENE_BLOCK_TAIL = 4_000_000;

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
/**
 * 객체 하나에서 복합 선종류 문자를 배치하는 글자 수(반복 × 글자). 긴 문자(HOT WATER SUPPLY 등)가 일찍 실선이 되지 않게
 * 요소와 따로 묶는다. 반복 한도까지 32자를 넘지 않는 값이고, 넘으면 실선으로 그린다
 */
export const DASH_TEXT_LIMIT = DASH_REPEAT_LIMIT * 32;

/**
 * 압축 자료 한 바이트가 풀리는 최대 배수. 어림값이 아니라 압축 형식에서 나온 상한이다.
 * R2004 계열 압축(사양 4.7)에서 가장 많이 늘리는 명령은 긴 길이의 되돌아 복사이고 길이 바이트 하나가 0xFF만큼 늘린다.
 * 명령 바이트와 거리 2바이트가 더 들므로 어떤 명령도 읽은 바이트의 255배를 풀지 못한다(손으로 짠 최악 스트림이 254.8배).
 * R2007 압축은 명령 하나가 더 늘리지만 페이지마다 RS 블록 255바이트를 차지해 0x7400바이트 페이지에서 116.5배 안쪽이다.
 * 이 값은 페이지마다 잡는 임시 버퍼와 시스템 페이지 크기를 정한다. 합법 파일을 거부하지 않는 값이고 섹션 크기는 묶지 않는다.
 * 도면은 사용자 기기에서만 처리하므로 섹션 크기는 파일에 적힌 대로 잡는다. 형식은 0만 있는 페이지를 파일에 쓰지 않으므로
 * 섹션 크기는 파일 크기로 정해지지 않고, 크기만 크게 적은 파일과 0이 긴 합법 파일은 구별되지 않는다.
 * 새로 잡은 버퍼는 쓰기 전까지 물리 메모리를 거의 쓰지 않는다(앞서 큰 버퍼를 놓은 프로세스는 할당기가 지우느라 쓸 수 있다). 기기가 잡지 못하면 메모리 부족으로 알린다(io/dwg/index.ts)
 */
export const DECOMPRESS_RATIO = 255;

/** 시스템 페이지(페이지 지도·섹션 지도)의 푼 크기 한도. 지도는 파일 안에 있는 압축 자료라 형식의 상한을 넘으면 손상이다 */
export function decompressLimit(fileBytes: number): number {
  return fileBytes * DECOMPRESS_RATIO + 0x100000;
}

/**
 * 쓰기가 건너뛰는 0 페이지의 파일 합. 0만 있는 페이지는 쓰지 않아도 0으로 읽히지만(RevHistory가 늘 그렇다) 파일에 흔적이 없다.
 * 이 값이 38차까지의 읽기 한도 여유(1 MiB) 안쪽이라 쓴 파일은 그 판에서도 열리고, 넘는 0 페이지는 그대로 쓴다(페이지당 160바이트).
 * 읽기에는 이제 합 한도가 없지만 다른 프로그램이 0 페이지를 얼마나 받는지 재지 못해 값을 그대로 둔다
 */
export const ZERO_PAGE_SKIP = 0x80000;

/** 시스템 페이지의 푼 크기가 파일 크기에 비해 말이 되는지 */
export function decompressedSizeOk(size: number, fileBytes: number): boolean {
  return Number.isFinite(size) && size >= 0 && size <= decompressLimit(fileBytes);
}

/**
 * 섹션 하나를 읽을 때 페이지를 따라가며 하는 일(체크섬·복호·압축 풀기 바이트)의 한도. sectionBytes는 섹션의 푼 크기 + 페이지 임시 버퍼다.
 * 정상 파일은 페이지를 한 번씩만 읽으므로 파일 크기 + sectionBytes 안쪽이다. 페이지 지도가 같은 페이지를 수백만 번 가리키면 여기서 멈춘다.
 * 파일 크기의 배수로 잡으면 허용 비율이 곧 되풀이할 수 있는 일이 되므로, 할당을 치르고 적은 크기를 기준으로 삼는다
 */
export function sectionWorkLimit(fileBytes: number, sectionBytes: number): number {
  return (fileBytes + sectionBytes + 0x100000) * 3;
}
