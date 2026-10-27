/**
 * 훑기 워커(sweep.ts가 vite-node로 띄운다): IPC로 파일을 하나씩 받아 확인하고 기록을 돌려준다.
 * 받는 것 {type:'file', file}, 보내는 것 {type:'ready'} · {type:'record', record}.
 * ezdxf 대조는 SWEEP_ORACLE_PYTHON이 있을 때만(대조 임시 파일은 SWEEP_TMP).
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkFile, createContext, stepError } from './check';
import type { FileRecord } from './record';
import type { SweepFile } from './files';
import { EzdxfOracle } from './oracle';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const python = process.env.SWEEP_ORACLE_PYTHON;
const tmpDir = process.env.SWEEP_TMP;
const oracle = python && tmpDir ? new EzdxfOracle(python, here, tmpDir) : null;
const ctx = createContext(root, { oracle, tmpDir });

const send = (m: unknown) => process.send?.(m);

let queue: Promise<void> = Promise.resolve();
process.on('message', (m: { type: string; file?: SweepFile }) => {
  if (m.type === 'exit') {
    oracle?.close();
    process.exit(0);
  }
  if (m.type !== 'file' || !m.file) return;
  const f = m.file;
  queue = queue.then(async () => {
    let record: FileRecord;
    try {
      record = await checkFile(f, ctx);
    } catch (e) {
      record = { key: f.key, path: f.path, ext: f.ext, size: f.size, dups: f.dups, sniff: f.sniff, fatal: `ERROR ${stepError(e).err}`, ms: 0 };
    }
    send({ type: 'record', record });
  });
});
process.on('disconnect', () => {
  oracle?.close();
  process.exit(0);
});
send({ type: 'ready' });
// IPC가 열려 있는 동안 살아 있는다
setInterval(() => {}, 1 << 30);
