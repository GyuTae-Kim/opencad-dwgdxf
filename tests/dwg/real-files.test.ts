/**
 * 공개된 실제 AutoCAD 도면(시청·카운티·Autodesk 예제 700개)을 훑어 찾은 DWG 결함. 자료는 모두 직접 만든 합성 문서다.
 * - R2007+ 사전의 항목 수를 자료 흐름의 남은 비트로 검사해, 항목이 수십 개를 넘는 사전을 통째로 버렸다(이름은 문자열 흐름, 핸들은 핸들 흐름에 있다)
 * - R2000·R2004 쓰기가 객체 크기(RL)를 고쳐 쓰며 뒤 바이트의 남은 비트를 지웠다. 핸들이 4바이트(0x1000000 이상)면 객체 머리 핸들이 깨져 다시 읽지 못했다
 * - 선가중치 0.30 mm(값 30)를 DWG 번호 30(ByBlock)과 섞어, 저장하면 도형·도면층이 ByBlock이 되고 치수 스타일·다중 지시선은 읽을 때 ByBlock이 되었다
 * - R2004 압축 명령 0x18~0x1F를 긴 길이로 읽었다. 비트 3은 거리에 0x4000을 더한다. 32KiB가 넘는 페이지 지도(107MB 지도)가 풀리지 않아 열지 못했다
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, Entity, GroupObject, LineEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { namedDictionary } from '../../src/edit/layertools/clone';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { decompressR18 } from '../../src/io/dwg/lz77';
import { BitWriter } from '../../src/io/dwg/writer/bitwriter';
import { encoderFor } from '../../src/io/dwg/writer/codepage';
import { R2000 } from '../../src/io/dwg/version';

const skipped = (d: CadDocument) => (d.warnings ?? []).filter((w) => w.code === 'dwg.object_skipped');
const lineAt = (handle: string, y: number): LineEntity =>
  ({ ...entityDefaults(), handle, layer: '0', type: 'LINE', start: { x: 0, y, z: 0 }, end: { x: 10, y, z: 0 } }) as LineEntity;

describe('큰 사전', () => {
  /** 그룹 n개 — ACAD_GROUP 사전에 항목이 n개다 */
  function groups(n: number): CadDocument {
    const doc = createNewDocument('metric');
    const ms = doc.blocks.get(MODEL_SPACE)!.entities;
    const dict = namedDictionary(doc, 'ACAD_GROUP')!;
    for (let i = 0; i < n; i++) {
      const e = lineAt((0x2000 + i).toString(16).toUpperCase(), i);
      ms.push(e as Entity);
      doc.entityIndex.set(e.handle, e as Entity);
      const gh = (0x4000 + i).toString(16).toUpperCase();
      const g: GroupObject = { type: 'GROUP', handle: gh, owner: dict.handle, reactors: [dict.handle], description: '', unnamed: false, selectable: true, entities: [e.handle] };
      doc.objects.set(gh, g);
      dict.entries.set(`G${i}`, gh);
    }
    return doc;
  }

  for (const v of ['AC1018', 'AC1032'] as const) {
    it(`${v}: 항목 300개 사전을 버리지 않는다`, () => {
      const back = readDwg(writeDwg(groups(300), { version: v }).data);
      expect(skipped(back)).toEqual([]);
      const dict = namedDictionary(back, 'ACAD_GROUP')!;
      expect(dict.entries.size).toBe(300);
      expect([...back.objects.values()].filter((o) => o.type === 'GROUP')).toHaveLength(300);
    });
  }
});

describe('4바이트 핸들', () => {
  for (const v of ['AC1015', 'AC1018', 'AC1032'] as const) {
    it(`${v}: 핸들이 0x1000000 이상인 객체를 저장하고 다시 읽는다`, () => {
      const doc = createNewDocument('metric');
      const ms = doc.blocks.get(MODEL_SPACE)!.entities;
      const handles = ['1000000', '101BDE8', 'FFFFFFF', '7FFFFFFF'];
      handles.forEach((h, i) => {
        const e = lineAt(h, i) as Entity;
        ms.push(e);
        doc.entityIndex.set(h, e);
      });
      const back = readDwg(writeDwg(doc, { version: v }).data);
      expect(skipped(back)).toEqual([]);
      const lines = back.blocks.get(MODEL_SPACE)!.entities.filter((e) => e.type === 'LINE') as LineEntity[];
      expect(lines.map((l) => l.handle).sort()).toEqual([...handles].sort());
      expect(lines.map((l) => l.start.y).sort()).toEqual([0, 1, 2, 3]);
    });
  }

  it('RL을 고쳐 써도 뒤에 쓴 비트가 남는다', () => {
    const w = new BitWriter(R2000, encoderFor('ANSI_1252'), 16);
    w.bits(3, 0b101);
    const at = w.pos;
    w.RL(0);
    w.RC(0xa5);
    w.bits(5, 0b11011);
    w.patchRL(at, 0x12345678);
    const r = new BitWriter(R2000, encoderFor('ANSI_1252'), 16);
    r.bits(3, 0b101);
    r.RL(0x12345678);
    r.RC(0xa5);
    r.bits(5, 0b11011);
    expect([...w.bytes()]).toEqual([...r.bytes()]);
  });
});

describe('선가중치 0.30 mm', () => {
  for (const v of ['AC1015', 'AC1018', 'AC1032'] as const) {
    it(`${v}: 도형·도면층·치수 스타일·헤더의 30은 0.30 mm로 남는다(ByBlock은 -2)`, () => {
      const doc = createNewDocument('metric');
      const ms = doc.blocks.get(MODEL_SPACE)!.entities;
      ms.push({ ...lineAt('2A0', 0), lineweight: 30 } as Entity, { ...lineAt('2A1', 1), lineweight: -2 } as Entity);
      doc.layers.get('0')!.lineweight = 30;
      const ds = [...doc.dimStyles.values()][0]!;
      ds.vars.DIMLWD = 30;
      ds.vars.DIMLWE = -2;
      doc.header.set('$DIMLWD', 30);
      const back = readDwg(writeDwg(doc, { version: v }).data);
      const lw = new Map(back.blocks.get(MODEL_SPACE)!.entities.map((e) => [e.handle, e.lineweight]));
      expect(lw.get('2A0')).toBe(30);
      expect(lw.get('2A1')).toBe(-2);
      expect(back.layers.get('0')!.lineweight).toBe(30);
      const bds = back.dimStyles.get(ds.name.toUpperCase())!;
      expect(bds.vars.DIMLWD).toBe(30);
      expect(bds.vars.DIMLWE).toBe(-2);
      expect(back.header.get('$DIMLWD')).toBe(30);
    });
  }
});

describe('R2004 압축의 먼 거리 명령', () => {
  /** 글자 n개(앞 묶음) + 명령 + 끝. 글자 길이는 0x00 확장 형식 */
  function stream(n: number, op: number[]): { src: Uint8Array; data: Uint8Array } {
    const data = new Uint8Array(n);
    for (let i = 0; i < n; i++) data[i] = (i * 131 + (i >> 8) * 7) & 0xff;
    const out: number[] = [0];
    let rem = n - 3 - 0x0f;
    while (rem > 0xff) {
      out.push(0);
      rem -= 0xff;
    }
    out.push(rem);
    return { src: new Uint8Array([...out, ...data, ...op, 0x11, 0, 0]), data };
  }

  it('0x1A: 길이 4, 거리 0x4000 + 0x3FFF + 두 바이트 값 + 1', () => {
    // 0xA000바이트 뒤에서 맨 앞 4바이트를 복사한다: 거리 0xA000 = 0x2000 + 0x3FFF + 0x4000 + 1
    const { src, data } = stream(0xa000, [0x1a, (0x2000 & 0x3f) << 2, 0x2000 >> 6]);
    const out = decompressR18(src, 0, src.length, 0xa004);
    expect([...out.subarray(0, 0xa000)]).toEqual([...data]);
    expect([...out.subarray(0xa000)]).toEqual([...data.subarray(0, 4)]);
  });

  it('0x18: 긴 길이 + 9, 거리에 0x4000', () => {
    const { src, data } = stream(0xa000, [0x18, 3, (0x2000 & 0x3f) << 2, 0x2000 >> 6]);
    const out = decompressR18(src, 0, src.length, 0xa000 + 12);
    expect([...out.subarray(0xa000)]).toEqual([...data.subarray(0, 12)]);
  });

  it('0x12~0x17과 0x10은 전과 같다(거리 0x3FFF + 값 + 1)', () => {
    const { src, data } = stream(0x5000, [0x15, (0x100 & 0x3f) << 2, 0x100 >> 6]);
    const out = decompressR18(src, 0, src.length, 0x5000 + 7);
    const from = 0x5000 - (0x100 + 0x3fff + 1);
    expect([...out.subarray(0x5000)]).toEqual([...data.subarray(from, from + 7)]);
  });
});
