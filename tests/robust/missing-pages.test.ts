/**
 * 38차: 형식은 0만 있는 페이지를 파일에 쓰지 않는다. 다른 프로그램과 이전 판이 그렇게 쓴 파일을 손상으로 거부하던 결함.
 * 이 파일은 쓰기가 0 페이지를 모두 건너뛰게 바꿔(ZERO_PAGE_SKIP) 그런 파일을 만든다. 파일에 없는 몫은 비율 대신 절대 값으로 묶는다.
 */
import { describe, expect, it, vi } from 'vitest';
import { CadReadError } from '../../src/core/errors';
import { MISSING_PAGE_BYTES, decompressLimit } from '../../src/core/limits';
import type { CadDocument, Entity, Ole2FrameEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { EditSession } from '../../src/edit/session';
import { writeDwg } from '../../src/io/dwg';
import { readR2004Container } from '../../src/io/dwg/container/r2004';
import { readR2007Container } from '../../src/io/dwg/container/r2007';
import { fingerprint } from '../../src/io/dwg/rawbody';
import { R2004, R2007 } from '../../src/io/dwg/version';
import { writeR2004 } from '../../src/io/dwg/writer/container';
import { readCadFile } from '../../src/io/index';
import { r2007Pages } from './corrupt35';

vi.mock('../../src/core/limits', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../src/core/limits')>()), ZERO_PAGE_SKIP: Number.MAX_SAFE_INTEGER }));

const MiB = 1048576;
const PAGE = 0x7400;
const modelOf = (doc: CadDocument): Entity[] => doc.blocks.get(MODEL_SPACE)!.entities;
const section = (name: string, data: Uint8Array) => ({ name, data, compressed: true, pageSize: PAGE });
const write = (objects: Uint8Array, extra: ReturnType<typeof section>[] = []) => {
  const sections = [section('AcDb:Header', new Uint8Array(32).fill(1)), section('AcDb:Handles', new Uint8Array(32).fill(2)), section('AcDb:AcDbObjects', objects), ...extra];
  return writeR2004(1018, 0, 30, sections, sections.map((s) => s.name));
};
const reasonOf = (f: () => unknown): string | undefined => {
  try {
    f();
  } catch (e) {
    expect(e).toBeInstanceOf(CadReadError);
    return (e as CadReadError).detail?.reason as string | undefined;
  }
  return undefined;
};

describe('파일에 없는 0 페이지', () => {
  it('원본 본문에 0이 8MiB 이어진 OLE 객체를 0 페이지 없이 쓴 파일을 연다', () => {
    const doc = createNewDocument('metric');
    const s = new EditSession(doc, () => {});
    const e: Ole2FrameEntity = { ...entityDefaults(), type: 'OLE2FRAME', handle: s.newHandle(), upperLeft: { x: 0, y: 0, z: 0 }, lowerRight: { x: 0, y: 0, z: 0 } };
    const body = new Uint8Array(8 * MiB);
    body[0] = 0xff;
    body[body.length - 1] = 0x81;
    e.dwgRaw = { version: 'AC1032', typeName: 'OLE2FRAME', typeNum: 74, data: body, dataBits: body.length * 8, handles: new Uint8Array(8), handleBits: 0, fingerprint: fingerprint(e) };
    modelOf(doc).push(e);
    const { data } = writeDwg(doc, { version: 'AC1032' });
    // 페이지가 뒷받침하는 몫만으로는 이 파일을 설명하지 못한다
    expect(body.length).toBeGreaterThan(decompressLimit(data.length));
    const back = readCadFile(data, 'x.dwg');
    expect(back.warnings).toEqual([]);
    expect(Buffer.compare(modelOf(back).find((x) => x.type === 'OLE2FRAME')!.dwgRaw!.data, body)).toBe(0);
  });

  it('없는 페이지 앞뒤의 자료가 제자리에 남는다', () => {
    const objects = new Uint8Array(32 * MiB);
    for (let i = 0; i < 4096; i++) objects[i] = (i * 31) & 0xff;
    objects.set([1, 2, 3], objects.length - 3);
    objects.set([4, 5, 6], 16 * MiB);
    const sec = readR2004Container(write(objects), R2004);
    expect(sec.warnings).toEqual([]);
    expect(Buffer.compare(sec.objects, objects)).toBe(0);
  });

  it('큰 파일은 없는 몫이 64MiB를 넘어도 파일 한도 안이면 받는다', () => {
    const objects = new Uint8Array(102 * MiB);
    let seed = 1;
    for (let i = 0; i < 2 * MiB; i++) {
      seed = (Math.imul(seed, 1103515245) + 12345) | 0;
      objects[i] = seed >>> 24;
    }
    objects[objects.length - 1] = 7;
    const data = write(objects);
    expect(objects.length).toBeLessThan(decompressLimit(data.length));
    const sec = readR2004Container(data, R2004);
    expect(sec.warnings).toEqual([]);
    expect(Buffer.compare(sec.objects, objects)).toBe(0);
  });

  it('더 받는 몫은 작은 파일이 잡아도 되는 값이다(시스템 페이지 상한과 같다)', () => {
    expect(MISSING_PAGE_BYTES).toBeLessThanOrEqual(64 * MiB);
  });

  it('파일 한도에 더 받는 몫을 더한 크기는 받고 1바이트 넘으면 할당 전에 막는다', () => {
    // 크기가 바뀌어도 압축된 지도의 길이가 같은지 보고 만든다
    const small = write(new Uint8Array(MISSING_PAGE_BYTES));
    const limit = decompressLimit(small.length) + MISSING_PAGE_BYTES - 64;
    const fits = write(new Uint8Array(limit));
    expect(fits.length).toBe(small.length);
    expect(readR2004Container(fits, R2004).objects.length).toBe(limit);
    const over = write(new Uint8Array(limit + 1));
    expect(over.length).toBe(small.length);
    const before = process.memoryUsage().arrayBuffers;
    expect(reasonOf(() => readR2004Container(over, R2004))).toBe('section size');
    expect(process.memoryUsage().arrayBuffers - before).toBeLessThan(MiB);
  });

  it('더 받는 몫은 섹션마다가 아니라 파일 전체다', () => {
    const half = new Uint8Array(40 * MiB);
    const data = write(half, [section('AcDb:Classes', half)]);
    expect(reasonOf(() => readR2004Container(data, R2004))).toBe('section size');
  });

  it('선택 섹션이 넘겨도 없는 몫을 쓰지 않아 뒤 섹션을 읽는다', () => {
    const data = write(new Uint8Array(16), [section('AcDb:Template', new Uint8Array(2 * MISSING_PAGE_BYTES)), section('AcDb:SummaryInfo', new Uint8Array(16).fill(3))]);
    const sec = readR2004Container(data, R2004);
    expect(sec.template).toBeNull();
    expect(sec.summaryInfo?.length).toBe(16);
  });

  it('R2007도 같은 한도를 본다', () => {
    const size = (n: number) => r2007Pages(1, 512, 512, [n, 16, 16]);
    expect(readR2007Container(size(16 * MiB), R2007).header.length).toBe(16 * MiB);
    expect(reasonOf(() => readR2007Container(size(2 * MISSING_PAGE_BYTES), R2007))).toBe('section size');
    expect(reasonOf(() => readR2007Container(r2007Pages(1, 512, 512, [40 * MiB, 40 * MiB, 16]), R2007))).toBe('section size');
    // 큰 파일은 없는 몫이 64MiB를 넘어도 파일 한도 안이면 받는다
    const large = r2007Pages(1, 2 * MiB, 2 * MiB, [70 * MiB, 16, 16]);
    expect(70 * MiB).toBeLessThan(decompressLimit(large.length));
    expect(readR2007Container(large, R2007).header.length).toBe(70 * MiB);
  });

  it('R2007의 뒷받침은 페이지마다 푸는 크기로 센다(섹션 최대 크기 칸은 읽기에 쓰지 않는다)', () => {
    const big = r2007Pages(3000, 300_000, PAGE, [70 * MiB, 16, 16], [3000], 0);
    expect(70 * MiB).toBeLessThan(decompressLimit(big.length));
    expect(readR2007Container(big, R2007).header.length).toBe(70 * MiB);
    // 푼 크기를 부풀려도 뒷받침 몫이 커질 뿐이라 비율 한도를 피하지 못한다
    const inflated = r2007Pages(1, 512, 64 * MiB, [8 * MiB, 16, 16]);
    expect(reasonOf(() => readR2007Container(inflated, R2007))).toBe('section size');
  });
});
