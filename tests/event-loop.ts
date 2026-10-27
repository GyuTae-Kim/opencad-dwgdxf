/**
 * 이벤트 고리 돌려주기(tests/setup.ts가 시험마다 부르고, 오래 걸리는 준비 단계도 부른다).
 *
 * vitest 워커는 시험 진행을 주 프로세스에 알리고(onTaskUpdate) 60초 안에 답을 받아야 하는데, 표본 도면을 동기로 읽고 쓰는
 * 시험이 이어지는 파일(DWG 쓰기 왕복 등)은 파일이 끝날 때까지 이벤트 고리를 돌려주지 않아 그 답을 처리하지 못한다.
 * 기계가 바쁘면 그 구간이 60초를 넘겨, 시험이 모두 통과해도 "Timeout calling onTaskUpdate" 처리되지 않은 오류로
 * 종료 코드가 1이 된다. 가짜 타이머(vi.useFakeTimers)를 켠 시험에서도 돌도록 이 파일을 불러올 때의 setTimeout을 쓴다.
 */
const realSetTimeout = globalThis.setTimeout;

/** 매크로 작업 한 번만큼 기다린다(그 사이에 쌓인 RPC 답·타이머가 처리된다) */
export const yieldToEventLoop = (): Promise<void> => new Promise((resolve) => void realSetTimeout(resolve, 0));
