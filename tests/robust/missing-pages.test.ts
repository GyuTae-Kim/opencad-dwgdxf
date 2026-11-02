/**
 * 38차: 형식은 0만 있는 페이지를 파일에 쓰지 않는다. 다른 프로그램과 이전 판이 그렇게 쓴 파일을 손상으로 거부하던 결함.
 * 이 파일은 쓰기가 0 페이지를 모두 건너뛰게 바꿔(ZERO_PAGE_SKIP) 그런 파일을 만든다. 39차부터 파일에 없는 몫을 묶지 않는다.
 */
import { describe, expect, it, vi } from 'vitest';
import { decompressLimit } from '../../src/core/limits';
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

describe('파일에 없는 0 페이지', () => {
  it.each([8, 128])('원본 본문에 0이 %dMiB 이어진 OLE 객체를 0 페이지 없이 쓴 파일을 연다', (mib) => {
    const doc = createNewDocument('metric');
    const s = new EditSession(doc, () => {});
    const e: Ole2FrameEntity = { ...entityDefaults(), type: 'OLE2FRAME', handle: s.newHandle(), upperLeft: { x: 0, y: 0, z: 0 }, lowerRight: { x: 0, y: 0, z: 0 } };
    const body = new Uint8Array(mib * MiB);
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

  it('작은 파일도 섹션 크기로 막지 않는다', () => {
    const objects = new Uint8Array(256 * MiB);
    objects[objects.length - 1] = 7;
    const data = write(objects);
    expect(data.length).toBeLessThan(MiB);
    const sec = readR2004Container(data, R2004);
    expect(sec.warnings).toEqual([]);
    expect(sec.objects.length).toBe(objects.length);
    expect(sec.objects[objects.length - 1]).toBe(7);
  });

  it('없는 몫의 합도 막지 않는다', () => {
    const half = new Uint8Array(40 * MiB);
    const sec = readR2004Container(write(half, [section('AcDb:Classes', half)]), R2004);
    expect([sec.objects.length, sec.classes?.length]).toEqual([half.length, half.length]);
  });

  it('큰 선택 섹션도 읽고 뒤 섹션을 이어 읽는다', () => {
    const data = write(new Uint8Array(16), [section('AcDb:Template', new Uint8Array(128 * MiB)), section('AcDb:SummaryInfo', new Uint8Array(16).fill(3))]);
    const sec = readR2004Container(data, R2004);
    expect(sec.template?.length).toBe(128 * MiB);
    expect(sec.summaryInfo?.length).toBe(16);
  });

  it('R2007도 섹션 크기를 막지 않는다', () => {
    const sec = readR2007Container(r2007Pages(1, 512, 512, [128 * MiB, 40 * MiB, 16]), R2007);
    expect([sec.header.length, sec.handles.length]).toEqual([128 * MiB, 40 * MiB]);
  });
});
