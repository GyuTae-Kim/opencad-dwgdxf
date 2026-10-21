/** 리본 단추 풍선 도움말: 명령이 아직 없을 때만 "준비 중"(편집기 모듈을 늦게 불러온 뒤에는 원래대로) */
import { describe, expect, it } from 'vitest';
import { ribbonTip } from '../../src/app/ui/shell';

describe('리본 풍선 도움말', () => {
  it('없는 명령은 준비 중, 생기면 원래 도움말(전에는 준비 중이 남았다)', () => {
    expect(ribbonTip('선 (L)', false)).toBe('선 (L) — 준비 중');
    expect(ribbonTip('선 (L)', true)).toBe('선 (L)');
  });
});
