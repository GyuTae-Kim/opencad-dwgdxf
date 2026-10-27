/**
 * 훑기 명령 입구(vite-node로 돈다): package.json의 "sweep"·"sweep:compare"가 부른다.
 *   vite-node scripts/sweep/cli.ts sweep [인자…]   — 훑기(sweep.ts)
 *   vite-node scripts/sweep/cli.ts compare [인자…] — 결과 비교(compare.ts)
 */
import { compareMain } from './compare';
import { main } from './sweep';

const [cmd, ...rest] = process.argv.slice(2);
const run = async () => (cmd === 'compare' ? compareMain(rest) : main(cmd === 'sweep' ? rest : process.argv.slice(2)));
run().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
