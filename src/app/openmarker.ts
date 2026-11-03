/**
 * 여는 중 표시: 도면을 여는 동안 메모리가 모자라 탭이 꺼지면 앱은 그 사실을 알 수 없다(브라우저가 페이지를 통째로 멈춘다).
 * 열기를 시작할 때 sessionStorage에 파일 이름·크기를 적고 끝나면 지운다. 같은 탭에서 앱이 다시 시작할 때 남아 있으면
 * 지난 열기가 끝나지 못한 것이라 알린다. sessionStorage는 탭마다 따로라 다른 탭의 열기와 섞이지 않고, 꺼진 탭을 새로 고쳐도 남는다.
 */

const KEY = 'opencad.opening';

export interface OpeningMark {
  name: string;
  size: number;
}

function read(): Record<string, OpeningMark> {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? '{}') as unknown;
    return v && typeof v === 'object' ? (v as Record<string, OpeningMark>) : {};
  } catch {
    return {};
  }
}

function write(m: Record<string, OpeningMark>): void {
  try {
    if (Object.keys(m).length) sessionStorage.setItem(KEY, JSON.stringify(m));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* 저장소를 못 쓰면 표시하지 않는다 */
  }
}

let serial = 0;

/** 열기를 시작한다. 돌려준 함수를 열기가 끝날 때(성공·실패 모두) 부른다 */
export function markOpening(name: string, size: number): () => void {
  const id = `${Date.now().toString(36)}-${(serial++).toString(36)}`;
  write({ ...read(), [id]: { name, size } });
  return () => {
    const m = read();
    delete m[id];
    write(m);
  };
}

/** 끝나지 못한 열기(앱이 시작할 때 한 번). 읽고 나면 지운다 */
export function takeInterruptedOpens(): OpeningMark[] {
  const m = read();
  write({});
  return Object.values(m).filter((x): x is OpeningMark => !!x && typeof x.name === 'string' && typeof x.size === 'number' && Number.isFinite(x.size));
}
