import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { BaseSequencer, type TestSpecification } from 'vitest/node';

/**
 * CI 2차(시험 조각 고르게): `vitest run --shard=i/n`의 기본 나눔은 파일 경로 해시로 같은 수씩이라 무거운 시험 파일이 한 조각에 몰렸다
 * (2026-11-28 CI — 조각 1·2·3의 시험 시간 합 84·180·137초, 걸린 시간 80·120·106초: draw-limits 52초·hatch-fill 25초·large-arrays111 21초가 조각 2).
 * 앞 CI 실행에서 잰 파일 시간(`tests/shard-weights.json`, ms)에 파일마다 여는 비용(PER_FILE_MS — transform·import 어림)을 더해,
 * 무거운 파일부터 지금 가장 가벼운 조각에 넣는다. 모든 조각이 같은 표·같은 파일 목록으로 같은 나눔을 셈하므로 겹치거나 빠지는 파일이 없다.
 * 표에 없는 새 파일은 표의 가운데 값으로 본다. 조각을 쓰지 않는 실행(`npx vitest run`)에는 닿지 않는다.
 * 표를 새로 만들 때: CI 시험 조각 기록의 「✓ tests/… (N tests) Xms」 줄에서 파일·ms를 모은다.
 */
const PER_FILE_MS = 600;

export class WeightedSequencer extends BaseSequencer {
  override async shard(files: TestSpecification[]): Promise<TestSpecification[]> {
    const shard = this.ctx.config.shard;
    if (!shard) return files;
    const root = this.ctx.config.root;
    const weights = JSON.parse(readFileSync(join(root, 'tests', 'shard-weights.json'), 'utf8')) as Record<string, number>;
    const known = Object.values(weights).sort((a, b) => a - b);
    const fallback = known.length ? known[Math.floor(known.length / 2)]! : 0;
    const items = files
      .map((spec) => {
        const key = relative(root, spec.moduleId).split('\\').join('/');
        return { spec, key, w: (weights[key] ?? fallback) + PER_FILE_MS };
      })
      .sort((a, b) => b.w - a.w || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const load = new Array<number>(shard.count).fill(0);
    const out: TestSpecification[] = [];
    for (const item of items) {
      let k = 0;
      for (let i = 1; i < load.length; i++) if (load[i]! < load[k]!) k = i;
      load[k] = load[k]! + item.w;
      if (k === shard.index - 1) out.push(item.spec);
    }
    return out;
  }
}
