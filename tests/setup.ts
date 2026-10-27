/**
 * 모든 시험 파일 공용 준비(vite.config.ts의 test.setupFiles): 시험이 끝날 때마다 이벤트 고리를 한 번 돌려준다
 * (까닭은 tests/event-loop.ts).
 */
import { afterEach } from 'vitest';
import { yieldToEventLoop } from './event-loop';

afterEach(yieldToEventLoop);
