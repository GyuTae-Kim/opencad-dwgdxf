/**
 * 옛 판 DWG의 AutoCAD 왕복 확장 자료(137차): AutoCAD는 R13·R14에 칸이 없는 선가중치를 ACAD 확장 자료 "RTLwPs"로,
 * R2000 이하에 칸이 없는 트루컬러·색상표 이름을 "RTTcAl"로 남긴다. 같은 도면을 AutoCAD가 여러 판으로 쓴 공개 표본에서
 * 새 판(R2000~R2018)의 같은 핸들 도형 값과 견주어 꼴을 갈랐다(선가중치 1,176/1,176, 색 220/220 같음).
 * 전에는 이 자료를 두기만 해서 R13·R14 도형은 모두 ByLayer 선가중치, R2000 이하 트루컬러 도형은 ACI 색으로 읽었다.
 * 이 앱은 R13·R14 DWG를 쓰지 못해 RTLwPs 읽기는 표본 도면(CAD_FIXTURES)으로 본다.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CadColor, CadDocument, Entity, LineEntity, XData } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { R13, R14, R2000, R2004 } from '../../src/io/dwg/version';
import { applyRoundTripXData } from '../../src/io/dwg/xdata';
import { FIXTURES } from '../oracle/ezdxf';

const lwPs = (v: number): XData[] => [{ app: 'ACAD', items: [{ code: 1000, value: 'RTLwPs' }, { code: 1070, value: v }] }];
/** AutoCAD R2000 표본의 꼴: 1070은 부호 있는 16비트, 1071은 부호 있는 32비트로 읽힌다 */
const tcAl = (word: number, rgbWord: number, name = '$$NoName$$', extra: XData['items'] = []): XData[] => [
  {
    app: 'ACAD',
    items: [{ code: 1000, value: 'RTTcAl' }, { code: 1070, value: (word << 16) >> 16 }, { code: 1071, value: rgbWord | 0 }, { code: 1000, value: name }, ...extra],
  },
];
const run = (xd: XData[], ver: number, color: CadColor = { aci: 256 }, lineweight = -1) => {
  const e = { color, lineweight };
  applyRoundTripXData(e, xd, ver);
  return e;
};

describe('옛 판 DWG의 왕복 확장 자료(137차)', () => {
  it('RTLwPs: R13·R14는 0x80 | 선가중치 번호, 다른 판·다른 꼴은 그대로', () => {
    expect(run(lwPs(128), R14).lineweight).toBe(0);
    expect(run(lwPs(129), R13).lineweight).toBe(5);
    expect(run(lwPs(131), R14).lineweight).toBe(13);
    expect(run(lwPs(138), R14).lineweight).toBe(40);
    expect(run(lwPs(158), R14).lineweight).toBe(-2);
    // R2000은 선가중치 칸이 있다(이 묶음을 쓰지 않는다)
    expect(run(lwPs(138), R2000).lineweight).toBe(-1);
    // 본 적 없는 꼴(0x80 없음, 0x20·0x40 비트)
    expect(run(lwPs(10), R14).lineweight).toBe(-1);
    expect(run(lwPs(0xa0 | 10), R14).lineweight).toBe(-1);
    expect(run([{ app: 'OTHER', items: lwPs(138)[0]!.items }], R14).lineweight).toBe(-1);
  });

  it('RTTcAl: R2000 이하의 트루컬러·색상표 이름, 색 번호가 도형 ACI와 다르거나 R2004+면 그대로', () => {
    expect(run(tcAl(0xa0b7, 0xc2803dc2), R2000, { aci: 183 }).color).toEqual({ aci: 183, rgb: 0x803dc2 });
    expect(run(tcAl(0x80c1, 0xc29b42ec), R14, { aci: 193 }).color).toEqual({ aci: 193, rgb: 0x9b42ec });
    expect(run(tcAl(0xc02a, 0xc2e29000, 'RAL CLASSIC$RAL 1006'), R2000, { aci: 42 }).color).toEqual({ aci: 42, rgb: 0xe29000, name: 'RAL CLASSIC$RAL 1006' });
    // 색상표 플래그(0x4000)가 없으면 이름을 쓰지 않는다
    expect(run(tcAl(0x802a, 0xc2e29000, 'RAL CLASSIC$RAL 1006'), R2000, { aci: 42 }).color).toEqual({ aci: 42, rgb: 0xe29000 });
    // 옛 판에서 색을 바꾼 도형(낡은 자료), 트루컬러 플래그·방식 바이트가 다른 꼴, R2004+
    expect(run(tcAl(0xa0b7, 0xc2803dc2), R2000, { aci: 1 }).color).toEqual({ aci: 1 });
    expect(run(tcAl(0x20b7, 0xc2803dc2), R2000, { aci: 183 }).color).toEqual({ aci: 183 });
    expect(run(tcAl(0xa0b7, 0xc3000005), R2000, { aci: 183 }).color).toEqual({ aci: 183 });
    expect(run(tcAl(0xa0b7, 0xc2803dc2), R2004, { aci: 183 }).color).toEqual({ aci: 183 });
    // 같은 ACAD 자료의 다른 묶음(MTEXTBEGIN 등)은 그대로 지나간다
    const mt = tcAl(0xa097, 0xc250b3ff, '$$NoName$$', [
      { code: 1000, value: 'MTEXTBEGIN' },
      { code: 1070, value: 73 },
      { code: 1070, value: 1 },
      { code: 1000, value: 'MTEXTEND' },
    ]);
    expect(run(mt, R2000, { aci: 151 }).color).toEqual({ aci: 151, rgb: 0x50b3ff });
    // 선가중치와 색이 한 자료에 함께 있는 R14 도형
    const both: XData[] = [{ app: 'ACAD', items: [...lwPs(138)[0]!.items, ...tcAl(0x8052, 0xc234c918)[0]!.items] }];
    expect(run(both, R14, { aci: 82 })).toEqual({ color: { aci: 82, rgb: 0x34c918 }, lineweight: 40 });
  });

  function lineDoc(xdata: XData[], aci: number): CadDocument {
    const doc = createNewDocument('metric');
    const e = { ...entityDefaults(), type: 'LINE', handle: 'A1', layer: '0', color: { aci }, xdata, start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 0, z: 0 } } as LineEntity;
    doc.blocks.get(MODEL_SPACE)!.entities.push(e as Entity);
    doc.entityIndex.set('A1', e as Entity);
    return doc;
  }

  it('R2000 DWG로 쓴 RTTcAl 도형을 읽으면 트루컬러, R2004+ DWG는 제 칸의 색 그대로(자료는 남는다)', () => {
    const doc = lineDoc(tcAl(0xa0b7, 0xc2803dc2), 183);
    const r2000 = readDwg(writeDwg(doc, { version: 'AC1015' }).data).entityIndex.get('A1')!;
    expect(r2000.color).toEqual({ aci: 183, rgb: 0x803dc2 });
    expect(r2000.xdata?.find((x) => x.app === 'ACAD')?.items[0]).toEqual({ code: 1000, value: 'RTTcAl' });
    const r2004 = readDwg(writeDwg(doc, { version: 'AC1018' }).data).entityIndex.get('A1')!;
    expect(r2004.color).toEqual({ aci: 183 });
    // 읽은 트루컬러는 R2004+로 쓰면 제 칸에 남는다
    const again = readDwg(writeDwg(readDwg(writeDwg(doc, { version: 'AC1015' }).data), { version: 'AC1032' }).data).entityIndex.get('A1')!;
    expect(again.color).toEqual({ aci: 183, rgb: 0x803dc2 });
  });

  const S = (v: string) => join(FIXTURES, 'samples', `sample_${v}.dwg`);
  const ents = (doc: CadDocument) => new Map([...doc.blocks.values()].flatMap((b) => b.entities.map((e) => [e.handle, e] as const)));
  const hasRt = (e: Entity, tag: string) => !!e.xdata?.some((x) => x.app === 'ACAD' && x.items.some((i) => i.code === 1000 && i.value === tag));
  it.skipIf(!existsSync(S('AC1014')) || !existsSync(S('AC1015')) || !existsSync(S('AC1018')))(
    '표본: R14·R2000 DWG의 선가중치·트루컬러가 AutoCAD가 같은 도면을 새 판으로 쓴 값과 같다',
    () => {
      const rd = (v: string) => ents(readDwg(new Uint8Array(readFileSync(S(v)))));
      const r14 = rd('AC1014');
      const r2000 = rd('AC1015');
      const r2004 = rd('AC1018');
      let lw = 0;
      let col = 0;
      for (const [h, e] of r14)
        if (hasRt(e, 'RTLwPs') && r2000.has(h)) {
          expect(e.lineweight, h).toBe(r2000.get(h)!.lineweight);
          lw++;
        }
      for (const src of [r14, r2000])
        for (const [h, e] of src)
          if (hasRt(e, 'RTTcAl')) {
            expect(e.color, h).toEqual(r2004.get(h)!.color);
            col++;
          }
      expect(lw).toBe(75);
      expect(col).toBe(44);
    },
  );
});
