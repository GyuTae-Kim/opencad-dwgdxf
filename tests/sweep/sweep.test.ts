/**
 * 실제 도면 훑기 도구(scripts/sweep) 자체 시험 — 직접 만든 작은 합성 도면만 쓴다(실제 파일 없음).
 * 표본 고르기(재귀·확장자·sha256 중복·판 거르기·짝 DXF), 파일 하나 확인(읽기·장면·쓰기·다시 읽기), 요약, 결과 비교, 명령 입구.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNewDocument } from '../../src/core/newdoc';
import { MODEL_SPACE, entityDefaults, type Entity } from '../../src/core/model';
import { writeDxf } from '../../src/io/dxf/writer';
import { writeDwg } from '../../src/io/dwg/index';
import { readCadFile } from '../../src/io/index';
import { collect, parseFilter, sniffVersion, walk } from '../../scripts/sweep/files';
import { checkFile, createContext, normalizeForRoundtrip, writeTargets } from '../../scripts/sweep/check';
import { buildSummary, classify, errorSignature, qualityFlags } from '../../scripts/sweep/summary';
import { compareMain, compareRuns } from '../../scripts/sweep/compare';
import { compareOracle, EzdxfOracle } from '../../scripts/sweep/oracle';
import { main, parseArgs } from '../../scripts/sweep/sweep';
import type { FileRecord } from '../../scripts/sweep/record';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
let dir: string;

/** 선 하나와 한글·기호 문자 하나가 든 새 도면 */
function sampleDoc() {
  const doc = createNewDocument('metric');
  const ms = doc.blocks.get(MODEL_SPACE)!;
  const base = { ...entityDefaults(), owner: ms.recordHandle };
  const line = { ...base, type: 'LINE', handle: 'A01', start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 5, z: 0 } } as Entity;
  const text = { ...base, type: 'TEXT', handle: 'A02', insert: { x: 1, y: 1, z: 0 }, height: 2.5, text: '지름 ∅20', rotation: 0, widthFactor: 1, oblique: 0, style: 'Standard', generation: 0, halign: 0, valign: 0 } as Entity;
  ms.entities.push(line, text);
  doc.entityIndex.set('A01', line);
  doc.entityIndex.set('A02', text);
  return doc;
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'sweep-test-'));
  const dxf = writeDxf(sampleDoc(), { version: 'AC1015' as never }).data;
  mkdirSync(join(dir, 'a/b'), { recursive: true });
  writeFileSync(join(dir, 'a/one.dxf'), dxf);
  // 같은 내용(다른 이름·대문자 확장자) — 하나로 센다
  writeFileSync(join(dir, 'a/b/copy.DXF'), dxf);
  // DWG R2004와 같은 이름의 DXF R2018(짝)
  const doc = readCadFile(dxf, 'one.dxf');
  writeFileSync(join(dir, 'a/b/pair.dwg'), writeDwg(doc, { version: 'AC1018' as never }).data);
  writeFileSync(join(dir, 'a/b/pair.dxf'), writeDxf(doc, { version: 'AC1032' as never }).data);
  // 앱이 열지 않는 확장자와 망가진 도면
  writeFileSync(join(dir, 'a/notes.txt'), 'not a drawing');
  writeFileSync(join(dir, 'a/broken.dxf'), 'hello');
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('표본 고르기', () => {
  it('재귀로 도면 확장자만 고르고 같은 내용(sha256)은 하나로 센다', () => {
    const paths = walk(dir);
    expect(paths.map((p) => p.slice(dir.length + 1)).sort()).toEqual(['a/b/copy.DXF', 'a/b/pair.dwg', 'a/b/pair.dxf', 'a/broken.dxf', 'a/one.dxf']);
    const r = collect(paths);
    expect(r.found).toBe(5);
    expect(r.unique).toBe(4);
    expect(r.duplicates).toBe(1);
    expect(r.files.every((f) => /^[0-9a-f]{64}$/.test(f.key))).toBe(true);
    // 내용 해시 순서(폴더가 섞인 표본)
    expect(r.files.map((f) => f.key)).toEqual([...r.files.map((f) => f.key)].sort());
    const dup = r.files.find((f) => f.dups === 1)!;
    expect(dup.path).toMatch(/copy\.DXF$|one\.dxf$/);
    // DWG는 같은 폴더의 같은 이름 DXF를 짝으로
    expect(r.files.find((f) => f.ext === 'dwg')?.twin).toMatch(/pair\.dxf$/);
  });

  it('판·확장자로 거르고 --limit만큼 자른다', () => {
    const paths = walk(dir);
    expect(collect(paths, parseFilter('dwg')).files.map((f) => f.sniff)).toEqual(['AC1018']);
    expect(collect(paths, parseFilter('R2018')).files.map((f) => f.ext)).toEqual(['dxf']);
    expect(collect(paths, parseFilter('dxf,AC1015')).files).toHaveLength(1);
    expect(collect(paths, parseFilter(''), 2).files).toHaveLength(2);
    expect(() => parseFilter('foo')).toThrow(/--filter/);
  });

  it('머리로 판 짐작: DWG 앞 6바이트, DXF $ACADVER, 없으면 R12', () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    expect(sniffVersion(enc('AC1032\0\0\0'))).toBe('AC1032');
    expect(sniffVersion(enc('  0\nSECTION\n  2\nHEADER\n  9\n$ACADVER\n  1\nAC1024\n'))).toBe('AC1024');
    expect(sniffVersion(enc('  0\nSECTION\n  2\nENTITIES\n'))).toBe('AC1009');
    expect(sniffVersion(enc('hello'))).toBe('');
  });
});

describe('파일 하나 확인', () => {
  const ctx = createContext(ROOT);
  const pick = (re: RegExp) => collect(walk(dir)).files.find((f) => re.test(f.path))!;

  it('읽기 → 장면 → DXF R2018·DWG R2018·R2000·같은 판 쓰기 → 다시 읽기, 왕복 차이가 없으면 ok', async () => {
    const r = await checkFile(pick(/(one|copy)\.dxf$/i), ctx);
    expect(r.read?.ok).toBe(true);
    expect(r.version).toBe('AC1015');
    expect(r.format).toBe('dxf');
    expect(r.counts).toEqual({ LINE: 1, TEXT: 1 });
    expect(Object.keys(r.writes!)).toEqual(['dxf-AC1032', 'dwg-AC1032', 'dwg-AC1015', 'dxf-AC1015']);
    for (const w of Object.values(r.writes!)) expect(w.reread?.ok).toBe(true);
    expect(r.scene?.spaces[0]).toMatchObject({ space: '*Model_Space', ok: true });
    expect(classify(r)).toBe('ok');
    expect(qualityFlags(r)).toEqual([]);
  });

  it('DWG R2004 원본은 같은 판(R2004)으로도 쓴다', async () => {
    const r = await checkFile(pick(/pair\.dwg$/), ctx);
    expect(r.format).toBe('dwg');
    expect(Object.keys(r.writes!)).toEqual(['dxf-AC1032', 'dwg-AC1032', 'dwg-AC1015', 'dwg-AC1018']);
    expect(classify(r)).toBe('ok');
  });

  it('망가진 파일은 읽기 실패로 남기고 예외를 코드와 함께 묶는다', async () => {
    const r = await checkFile(pick(/broken\.dxf$/), ctx);
    expect(classify(r)).toBe('read-fail');
    expect(r.read?.error?.code).toBe('file.unrecognized');
    expect(errorSignature('read', r.read!.error!)).toMatch(/^read: \[file\.unrecognized\] /);
  });

  it('쓰기 대상은 앱의 "같은 형식 저장" 규칙을 따른다', () => {
    const keys = (format: string, version: string, binary = false) => writeTargets({ format, version, binary } as never).map((t) => t.key);
    expect(keys('dwg', 'AC1021')).toEqual(['dxf-AC1032', 'dwg-AC1032', 'dwg-AC1015', 'dwg-AC1018']);
    expect(keys('dwg', 'AC1014')).toEqual(['dxf-AC1032', 'dwg-AC1032', 'dwg-AC1015']);
    expect(keys('dxf', 'AC1015', true)).toEqual(['dxf-AC1032', 'dwg-AC1032', 'dwg-AC1015', 'dxfb-AC1015']);
    expect(keys('dxf', 'AC1012')).toEqual(['dxf-AC1032', 'dwg-AC1032', 'dwg-AC1015']);
    expect(keys('dxf', 'AC1009')).toContain('dxf-AC1009');
  });

  it('왕복 비교는 \\U+ 이스케이프와 ByBlock 대소문자를 같은 것으로 본다', () => {
    expect(normalizeForRoundtrip({ text: '\\U+C9C0\\U+B984 \\U+220520', linetype: 'BYBLOCK' })).toEqual(normalizeForRoundtrip({ text: '지름 ∅20', linetype: 'ByBlock' }));
    expect(normalizeForRoundtrip({ linetype: 'Dashed' }).linetype).toBe('Dashed');
  });
});

/** 기록 하나(시험용) */
function rec(key: string, extra: Partial<FileRecord> = {}): FileRecord {
  return {
    key: key.padEnd(64, '0'),
    path: `/x/${key}.dxf`,
    ext: 'dxf',
    size: 10,
    dups: 0,
    sniff: 'AC1032',
    read: { ok: true, ms: 1 },
    version: 'AC1032',
    format: 'dxf',
    nEnt: 1,
    counts: { LINE: 1 },
    scene: { ms: 1, spaces: [{ space: '*Model_Space', ok: true, ms: 1 }] },
    writes: { 'dxf-AC1032': { ok: true, ms: 2, reread: { ok: true, ms: 1 } } },
    ms: 5,
    ...extra,
  };
}

describe('요약', () => {
  it('분류·판별 개수·예외·품질·시간을 모으고 done: true', () => {
    const s = buildSummary({
      records: [
        rec('a'),
        rec('b', { fatal: 'TIMEOUT 120s' }),
        rec('c', { writes: { 'dwg-AC1015': { ok: false, ms: 1, error: { err: 'Error: bad 12', at: 'w (src/io/x.ts:1:2)' } } } }),
        rec('d', { ext: 'dwg', format: 'dwg', version: 'AC1015', writes: { 'dxf-AC1032': { ok: true, ms: 1, warn: { 'entity.shape_dropped': 1 }, reread: { ok: true, ms: 1, layersLost: ['\\U+AC00'], countDelta: { SHAPE: -1 } } } } }),
      ],
      wallMs: 100,
    });
    expect(s.done).toBe(true);
    expect(s.classes).toMatchObject({ ok: 1, timeout: 1, 'write-fail': 1, 'roundtrip-diff': 1 });
    expect(s.byVersion).toEqual({ AC1015: { dwg: 1 }, AC1032: { dxf: 3 } });
    expect(Object.keys(s.exceptions as object)).toEqual(expect.arrayContaining(['worker: TIMEOUT #s', 'write dwg-AC1015: Error: bad # @ w (src/io/x.ts']));
    expect(s.quality).toMatchObject({ 'shape-dropped': 1, 'name-changed': 1, 'silent-count-loss': 0 });
    expect(s.roundtrip).toMatchObject({ 'count:SHAPE:-': 1, 'name:layer': 1 });
    expect((s.timeMs as { total: { n: number; max: number } }).total).toMatchObject({ n: 4, max: 5 });
  });
});

describe('결과 비교', () => {
  const before = [rec('a'), rec('b'), rec('c')];
  const after = [rec('a'), rec('b', { read: { ok: false, ms: 1, error: { err: 'CadReadError: x', code: 'dwg.corrupt' } } }), rec('d')];

  it('분류가 바뀐 파일, 새 예외, 한쪽에만 있는 파일을 센다', () => {
    const r = compareRuns(before, after);
    expect(r).toMatchObject({ matched: 2, onlyBefore: 1, onlyAfter: 1, classChanged: 1, metricChanged: 1 });
    expect(r.transitions).toEqual({ 'ok → read-fail': 1 });
    expect(Object.keys(r.newExceptions)).toEqual(['read: [dwg.corrupt] CadReadError: x']);
    expect(r.changed[0]!.key.startsWith('b')).toBe(true);
  });

  it('--fail-on-change면 바뀐 것이 있을 때 1, 같으면 0', () => {
    const d1 = join(dir, 'run1');
    const d2 = join(dir, 'run2');
    for (const [d, rs] of [[d1, before], [d2, after]] as const) {
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, 'records.jsonl'), rs.map((r) => JSON.stringify(r)).join('\n') + '\n');
    }
    const out: string[] = [];
    expect(compareMain([d1, d2, '--fail-on-change'], (s) => out.push(s))).toBe(1);
    expect(out.join('\n')).toContain('분류가 바뀐 파일 1개');
    expect(compareMain([d1, d2], () => {})).toBe(0);
    expect(compareMain([d1, d1, '--fail-on-change'], () => {})).toBe(0);
    expect(compareMain([d1, join(dir, 'none')], () => {})).toBe(2);
  });
});

describe('ezdxf 대조', () => {
  it('핸들로 맞춰 종류별 수·값·이름 차이를 센다(순수)', () => {
    const e = (h: string, extra = {}) => ({ type: 'TEXT', handle: h, text: 'A', ...extra });
    const d = compareOracle(
      { layers: [{ name: '0' }, { name: 'Defpoints' }], blocks: { '*MODEL_SPACE': [e('1'), e('2', { text: '\\U+AC00' })] } },
      { layers: [{ name: '0' }], blocks: { '*MODEL_SPACE': [e('1', { text: 'B' }), e('2', { text: '가' }), { type: 'LINE', handle: '3' }] } },
    );
    expect(d.fieldDiffs).toEqual({ 'TEXT.text': 1 });
    expect(d.countDelta).toEqual({ LINE: 1 });
    expect(d.onlyAct).toEqual({ LINE: 1 });
    expect(d.layersOnlyExp).toEqual(['Defpoints']);
  });

  const py = process.env.CAD_PYTHON;
  it.skipIf(!py || !existsSync(py))('CAD_PYTHON이 있으면 우리가 쓴 DXF를 ezdxf로 읽어 audit 오류가 없다', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'sweep-ez-'));
    const o = new EzdxfOracle(py!, join(ROOT, 'scripts/sweep'), tmp);
    try {
      const r = await o.dump(join(dir, 'a/b/pair.dxf'));
      expect(r.ok).toBe(true);
      expect(r.auditErrors ?? {}).toEqual({});
      expect(r.summary?.blocks['*MODEL_SPACE']?.map((x) => x.type)).toEqual(['LINE', 'TEXT']);
    } finally {
      o.close();
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('명령 입구', () => {
  it('폴더가 없으면 쓰는 법만 찍고 0으로 끝난다(CI)', async () => {
    const out: string[] = [];
    expect(await main([], {}, (s) => out.push(s))).toBe(0);
    expect(out.join('\n')).toContain('npm run sweep -- --dirs');
    expect(await main(['--bogus'], {}, () => {})).toBe(2);
  });

  it('인자와 환경 변수: --dirs 여러 개(쌍점), OPENCAD_SWEEP_DIRS, --jobs·--limit·--filter·--oracle', () => {
    expect(parseArgs(['--dirs', '/a:/b', '--dirs=/c', '--jobs', '3', '--limit', '7', '--filter', 'dwg', '--oracle']).dirs).toEqual(['/a', '/b', '/c']);
    expect(parseArgs([], { OPENCAD_SWEEP_DIRS: '/x:/y' }).dirs).toEqual(['/x', '/y']);
    expect(parseArgs(['--dirs', '/a'], { OPENCAD_SWEEP_DIRS: '/x' }).dirs).toEqual(['/a']);
    expect(parseArgs(['--jobs', '2', '--limit', '5'])).toMatchObject({ jobs: 2, limit: 5, oracle: false });
    expect(() => parseArgs(['--out'])).toThrow();
  });

  it('워커(vite-node)로 끝까지 돌려 records.jsonl·summary.json을 쓰고, 같은 결과 폴더는 덮어쓰지 않는다', async () => {
    const out = join(dir, 'out');
    const logs: string[] = [];
    const code = await main(['--out', out, '--jobs', '2'], { OPENCAD_SWEEP_DIRS: join(dir, 'a') }, (s) => logs.push(s));
    expect(code).toBe(0);
    const lines = readFileSync(join(out, 'records.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as FileRecord);
    expect(lines).toHaveLength(4);
    const s = JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8'));
    expect(s.done).toBe(true);
    expect(s.input).toMatchObject({ found: 5, unique: 4, duplicates: 1 });
    expect(s.classes).toMatchObject({ ok: 3, 'read-fail': 1 });
    expect(s.byVersion).toMatchObject({ AC1015: { dxf: 1 }, AC1018: { dwg: 1 }, AC1032: { dxf: 1 } });
    expect(existsSync(join(out, 'tmp'))).toBe(false);
    expect(await main(['--out', out], { OPENCAD_SWEEP_DIRS: join(dir, 'a') }, () => {})).toBe(2);
  }, 120_000);
});
