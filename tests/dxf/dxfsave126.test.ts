/**
 * 126차: DXF 쓰기를 빠르게 고친 뒤에도 쓴 바이트와 경고가 125차 판과 같은지(sha256 앞 16자·경고 JSON 앞 8자 — 시각 고정, 임의 GUID 0 바이트).
 * 보통 핸들·앞에 0이 붙은 핸들·겹친 핸들·핸들 없는 도형·폴리선 정점(새 핸들), 2^53을 넘는 16자리 핸들 뒤의 새 핸들을 ASCII·이진, 네 판으로 쓴다.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { CadDocument, Entity, LineEntity, PolylineEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { writeDxf } from '../../src/io/dxf/writer';
import { WriteContext } from '../../src/io/dxf/wcontext';
import { readDxf } from '../../src/io/dxf/reader';

const P = (x: number, y: number, z = 0) => ({ x, y, z });

function polyline(handle: string, kind: '2d' | '3d', x: number, props: Partial<Entity>): PolylineEntity {
  return {
    ...entityDefaults(),
    ...props,
    type: 'POLYLINE',
    handle,
    kind,
    flags: kind === '3d' ? 8 : 0,
    verts: new Float64Array([x, 0, 0, x + 1, 0, 1, x + 1, 1, 2, x, 2, 3]),
    elevation: 0,
    defaultStartWidth: 0,
    defaultEndWidth: 0,
    mCount: 0,
    nCount: 0,
    mDensity: 0,
    nDensity: 0,
    smoothType: 0,
    thickness: 0,
    extrusion: { x: 0, y: 0, z: 1 },
  } as unknown as PolylineEntity;
}

const line = (handle: string, x: number): LineEntity => ({ ...entityDefaults(), type: 'LINE', handle, start: P(x, 0), end: P(x + 1, 1) }) as LineEntity;

/** 보통 핸들·앞에 0이 붙은 핸들·겹친 핸들·핸들 없는 도형과 폴리선 */
function docA(): CadDocument {
  const doc = createNewDocument('metric');
  const ents: Entity[] = [
    polyline('B01', '2d', 0, { layer: '0' }),
    line('00B02', 2),
    line('B02', 3),
    line('B02', 4),
    line('', 5),
    polyline('', '3d', 6, {}),
    polyline('B03', '2d', 8, { linetype: 'NOSUCH126' }),
  ];
  doc.blocks.get(MODEL_SPACE)!.entities.push(...ents);
  return doc;
}

/** 2^53을 넘는 16자리 핸들 뒤에서 새 핸들을 준다 */
function docB(): CadDocument {
  const doc = createNewDocument('metric');
  doc.blocks.get(MODEL_SPACE)!.entities.push(line('FFFFFFFFFFFFFF00', 0), polyline('C01', '2d', 2, {}), line('', 4));
  return doc;
}

/** 125차 판(4da6b21)으로 쓴 값: 바이트 sha256 앞 16자 : 경고 JSON sha256 앞 8자 */
const GOLDEN: Record<string, string> = {
  'A-AC1032': 'bf8f6bcbf2565a96:6eae6d2d',
  'A-AC1032b': '658cc46de52de1f3:6eae6d2d',
  'A-AC1018': 'b6277091a2d0bfe0:caec6a75',
  'A-AC1018b': '86735f50b97d137f:caec6a75',
  'A-AC1015': '8db83a9005170637:fa5b51db',
  'A-AC1015b': '675f7baaf8852bfc:fa5b51db',
  'A-AC1009': 'a5782e3132f202ac:6eae6d2d',
  'A-AC1009b': 'a43c77fba3b754ca:6eae6d2d',
  'B-AC1032': 'e4aefe7d7f1ad17a:4f53cda1',
  'B-AC1032b': 'f598ad5d56d310e0:4f53cda1',
  'B-AC1018': 'db83a24d2164064a:3f311732',
  'B-AC1018b': 'd8a4f3ec5766819a:3f311732',
  'B-AC1015': 'eb00f263cea37441:564da3c5',
  'B-AC1015b': '390d58c4cc075fb4:564da3c5',
  'B-AC1009': 'a84dacb38220bc97:4f53cda1',
  'B-AC1009b': '27fe900d9ea8caeb:4f53cda1',
};

const sha = (d: Uint8Array | string, n: number): string => createHash('sha256').update(d).digest('hex').slice(0, n);

/** 125차까지의 새 핸들·핸들 정하기(쓴 핸들을 모두 문자열 Set에, 다음 핸들은 BigInt) — 시작 씨앗 위에서만 견준다 */
class RefAlloc {
  next: bigint;
  readonly taken = new Set<string>();
  constructor(seedHex: string) {
    this.next = BigInt('0x' + seedHex);
  }
  alloc(): string {
    let h = this.next.toString(16).toUpperCase();
    while (this.taken.has(h)) {
      this.next++;
      h = this.next.toString(16).toUpperCase();
    }
    this.next++;
    this.taken.add(h);
    return h;
  }
  claim(preferred: string | undefined): string {
    const p = preferred?.toUpperCase();
    if (!!p && p !== '0' && p.length <= 16 && /^[0-9A-F]+$/.test(p) && !this.taken.has(p)) {
      this.taken.add(p);
      return p;
    }
    return this.alloc();
  }
}

let seed = 2126;
const rand = (): number => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 0x100000000;

describe('DXF 새 핸들·핸들 정하기(정규 꼴 13자 이하는 값으로, 나머지는 문자열로)', () => {
  for (const [title, top] of [
    ['보통 도면', ''],
    ['2^52(16진 14자)를 넘어가는 도면', 'FFFFFFFFFFFF0'],
  ] as const) {
    it(`${title}: 무작위 정하기·새 핸들이 예전 길과 같다(앞 0·소문자·14~16자·겹침·잘못된 값)`, () => {
      const doc = createNewDocument('metric');
      if (top) doc.blocks.get(MODEL_SPACE)!.entities.push(line(top, 0));
      const ctx = new WriteContext(doc, { version: 'AC1032' });
      const seed0 = BigInt('0x' + ctx.handseed);
      const ref = new RefAlloc(ctx.handseed);
      const hex = (v: bigint) => v.toString(16).toUpperCase();
      for (let i = 0; i < 4000; i++) {
        const r = rand();
        const v = seed0 + BigInt(Math.floor(rand() * 200));
        let p: string | undefined;
        if (r < 0.3) p = undefined;
        else if (r < 0.55) p = hex(v);
        else if (r < 0.65) p = '0' + hex(v);
        else if (r < 0.72) p = '00' + hex(v).toLowerCase();
        else if (r < 0.8) p = hex(v).toLowerCase();
        else if (r < 0.86) p = hex(BigInt(2) ** BigInt(52) + BigInt(Math.floor(rand() * 40)));
        else if (r < 0.9) p = 'F' + hex(v).padStart(15, '0');
        else if (r < 0.94) p = ['0', '', ' 1F', 'G1', '1'.repeat(17), '+20'][Math.floor(rand() * 6)];
        else p = 'ZZ';
        const want = p === 'ZZ' ? ref.alloc() : ref.claim(p);
        const got = p === 'ZZ' ? ctx.alloc() : ctx.claim({}, p);
        expect(got).toBe(want);
      }
      expect(ctx.handseed).toBe(hex(ref.next));
    });
  }
});

describe('DXF 쓰기 바이트·경고가 125차 판과 같다', () => {
  for (const [name, mk] of [
    ['A', docA],
    ['B', docB],
  ] as const) {
    for (const version of ['AC1032', 'AC1018', 'AC1015', 'AC1009'] as const) {
      for (const binary of [false, true]) {
        const key = `${name}-${version}${binary ? 'b' : ''}`;
        it(key, () => {
          vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
          vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(((a: unknown) => a) as never);
          vi.spyOn(Math, 'random').mockReturnValue(0.25);
          try {
            const r = writeDxf(mk(), { version, binary });
            expect(`${sha(r.data, 16)}:${sha(JSON.stringify(r.warnings), 8)}`).toBe(GOLDEN[key]);
          } finally {
            vi.restoreAllMocks();
          }
        });
      }
    }
  }

  it('다시 읽으면 폴리선 정점과 겹친 핸들의 새 핸들이 그대로(R2018 ASCII)', () => {
    const back = readDxf(writeDxf(docA(), { version: 'AC1032' }).data);
    const ents = back.blocks.get(MODEL_SPACE)!.entities;
    expect(ents.map((e) => e.type)).toEqual(['POLYLINE', 'LINE', 'LINE', 'LINE', 'LINE', 'POLYLINE', 'POLYLINE']);
    const hs = ents.map((e) => e.handle);
    expect([hs[0], hs[2]]).toEqual(['B01', 'B02']);
    expect(hs[3]).not.toBe('B02');
    expect(Array.from((ents[5] as PolylineEntity).verts)).toEqual([6, 0, 0, 7, 0, 1, 7, 1, 2, 6, 2, 3]);
  });
});
