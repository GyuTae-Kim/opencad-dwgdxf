/**
 * 143차: 옛 판(R12~R14) 뷰포트를 R2000+ DWG·DXF로 쓸 때의 90 플래그.
 * 옛 판 뷰포트는 보기 정보를 ACAD 확장 자료 "MVIEW"에서 읽어(applyMviewXData) 0x8000(DXF 참조서 VIEWPORT 90 "늘 켬")이 없고 빠른 확대(128)가 켜져 있을 수 있다.
 * AutoCAD는 같은 도면을 R2000+로 쓸 때 128을 빼고 0x8000을 더한다(같은 도면을 여러 판으로 쓴 공개 표본 두 무리 — 한 무리는 원본에 없는 격자 비트
 * 0x40000·0x80000을 더 켜는데 AutoCAD 설정에서 온 값이라 따라 하지 않는다). 전에는 이 앱이 모델 값 그대로 썼다. MVIEW 묶음이 없는 뷰포트(R2000+에서 읽은 것 —
 * 90이 없어 0인 것 포함, 이 앱이 만든 뷰포트)와 0x8000이 있는 것은 그대로이고, 모델 값과 R12 DXF 출력의 MVIEW(142차)는 바뀌지 않는다.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CadDocument, ViewportEntity, XData } from '../../src/core/model';
import { PAPER_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { viewportFlagsR2000 } from '../../src/io/mview';
import { FIXTURES } from '../oracle/ezdxf';

const acadItems = (xd: XData[] | undefined) => xd?.find((x) => x.app.toUpperCase() === 'ACAD')?.items;
const DWGV = ['AC1015', 'AC1018', 'AC1024', 'AC1027', 'AC1032'] as const;
const DXFV = ['AC1015', 'AC1018', 'AC1021', 'AC1024', 'AC1027', 'AC1032'] as const;

/** 핸들 3A 뷰포트 하나가 든 문서. r12면 R12 DXF로 쓰고 다시 읽는다(보기 정보는 MVIEW 묶음에서 모델로) */
function vpDoc(flags: number, r12: boolean): CadDocument {
  const doc = createNewDocument('metric');
  const vp = {
    ...entityDefaults(),
    handle: '3A',
    layer: '0',
    type: 'VIEWPORT',
    center: { x: 5, y: 5, z: 0 },
    width: 10,
    height: 8,
    status: 2,
    id: 2,
    viewCenter: { x: 30, y: 40 },
    snapBase: { x: 0, y: 0 },
    snapSpacing: { x: 1, y: 1 },
    gridSpacing: { x: 1, y: 1 },
    viewDirection: { x: 0, y: 0, z: 1 },
    viewTarget: { x: 0, y: 0, z: 0 },
    lensLength: 50,
    frontClip: 0,
    backClip: 0,
    viewHeight: 12,
    snapAngle: 0,
    twistAngle: 0,
    circleSides: 100,
    flags,
    frozenLayers: [],
    renderMode: 0,
    ucsPerViewport: false,
  } as ViewportEntity;
  doc.blocks.get(PAPER_SPACE)!.entities.push(vp);
  return r12 ? readDxf(writeDxf(doc, { version: 'AC1009' }).data) : doc;
}
// DWG는 배치의 뷰포트가 하나면 번호 1로 읽으므로 핸들로 찾는다
const vpOf = (doc: CadDocument) => doc.blocks.get(PAPER_SPACE)!.entities.find((e) => e.type === 'VIEWPORT' && e.handle.toUpperCase() === '3A') as ViewportEntity;
const outs = (doc: CadDocument): [string, CadDocument][] => [
  ...DWGV.map((v) => [`dwg ${v}`, readDwg(writeDwg(doc, { version: v }).data)] as [string, CadDocument]),
  ...DXFV.map((v) => [`dxf ${v}`, readDxf(writeDxf(doc, { version: v }).data)] as [string, CadDocument]),
];

describe('옛 판 뷰포트의 R2000+ 90 플래그(143차)', () => {
  it('MVIEW 묶음이 있고 0x8000이 없으면 빠른 확대 128을 빼고 0x8000을 더하고, 그 밖은 그대로', () => {
    const mv: XData[] = [
      {
        app: 'ACAD',
        items: [
          { code: 1000, value: 'MVIEW' },
          { code: 1002, value: '{' },
          { code: 1070, value: 16 },
          { code: 1002, value: '{' },
          { code: 1002, value: '}' },
          { code: 1002, value: '}' },
        ],
      },
    ];
    const vp = (flags: number, xdata?: XData[]) => ({ flags, xdata }) as ViewportEntity;
    expect(viewportFlagsR2000(vp(0, mv))).toBe(0x8000);
    expect(viewportFlagsR2000(vp(0xa0, mv))).toBe(0x8020);
    expect(viewportFlagsR2000(vp(0x2e0, mv))).toBe(0x8260);
    // 0x8000이 있으면 묶음이 있어도 그대로
    for (const f of [0x8060, 0x80e0]) expect(viewportFlagsR2000(vp(f, mv))).toBe(f);
    // 묶음이 없으면 그대로: R2000+에서 읽은 것(90이 없어 0인 것 포함)·이 앱이 만든 뷰포트(32864)·격자 비트가 있는 값
    for (const f of [0, 0xa0, 32864, 0xc8260, 0x18020]) expect(viewportFlagsR2000(vp(f))).toBe(f);
  });

  it('R12 DXF에서 읽은 뷰포트를 R2000+ DWG·DXF로 쓰면 128을 빼고 0x8000을 더한다 — 모델과 R12 출력은 그대로', () => {
    const src = vpDoc(32 | 512, true);
    // R12 MVIEW의 빠른 확대 칸(모델로 만든 묶음은 늘 1)이 128로 읽힌다
    expect(vpOf(src).flags).toBe(128 | 32 | 512);
    for (const [label, doc] of outs(src)) expect(vpOf(doc).flags, label).toBe(0x8000 | 32 | 512);
    expect(vpOf(src).flags).toBe(128 | 32 | 512);
    // R12 DXF는 90이 없고 MVIEW 묶음이 읽은 그대로
    const items = acadItems(vpOf(src).xdata);
    const r12 = vpOf(readDxf(writeDxf(src, { version: 'AC1009' }).data));
    expect(acadItems(r12.xdata)).toEqual(items);
    expect(r12.flags).toBe(128 | 32 | 512);
  });

  it('MVIEW 묶음이 없는 뷰포트(이 앱이 만든 것, R2000+에서 읽은 것 — 90이 없어 0인 것 포함)는 플래그가 그대로', () => {
    for (const flags of [0, 0xa0, 32864, 0x80e0, 0xc8260]) for (const [label, doc] of outs(vpDoc(flags, false))) expect(vpOf(doc).flags, `${flags} ${label}`).toBe(flags);
    // R2000+로 한 번 쓴 옛 판 뷰포트는 묶음이 빠지고 0x8000이 있어 그 뒤에도 그대로
    const once = readDxf(writeDxf(vpDoc(32, true), { version: 'AC1015' }).data);
    expect(vpOf(once).flags).toBe(0x8020);
    for (const [label, doc] of outs(once)) expect(vpOf(doc).flags, label).toBe(0x8020);
  });

  const LD = (n: string) => join(FIXTURES, '..', 'libredwg', 'test', 'test-data', n);
  const LX = (n: string) => join(FIXTURES, '..', 'libredwg-dxf', 'test', 'test-data', n);
  const S = (v: string) => join(FIXTURES, 'samples', `sample_${v}.dwg`);
  const SX = (v: string) => join(FIXTURES, '..', 'acadsharp-dxf', 'samples', `sample_${v}_ascii.dxf`);
  const EXV: Record<string, string> = { AC1015: '2000', AC1018: '2004', AC1021: '2007', AC1024: '2010', AC1027: '2013', AC1032: '2018' };
  const vps = (doc: CadDocument) => new Map([...doc.blocks.values()].flatMap((b) => b.entities.filter((e) => e.type === 'VIEWPORT').map((e) => [e.handle.toUpperCase(), e as ViewportEntity] as const)));
  const read = (p: string) => (p.endsWith('.dwg') ? readDwg : readDxf)(new Uint8Array(readFileSync(p)));
  /** 원본들을 R2000+ DWG·DXF로 써서 AutoCAD 같은 판(tgt)의 같은 핸들 뷰포트 플래그와 견준다. mask: AutoCAD 쪽에서 지울 비트 */
  function pairs(srcs: string[], tgt: (fmt: 'dwg' | 'dxf', v: string) => string, mask: number): number {
    let n = 0;
    for (const sp of srcs) {
      const src = read(sp);
      for (const [fmt, list] of [
        ['dwg', DWGV],
        ['dxf', DXFV],
      ] as const)
        for (const v of list) {
          const acad = vps(read(tgt(fmt, v)));
          const out = vps(fmt === 'dwg' ? readDwg(writeDwg(src, { version: v }).data) : readDxf(writeDxf(src, { version: v }).data));
          for (const [h, s] of vps(src)) {
            const a = acad.get(h)!;
            expect(a.flags & 0x8000, `${sp} ${h}`).toBe(0x8000);
            expect(out.get(h)!.flags, `${sp} → ${fmt} ${v} ${h}`).toBe(a.flags & ~mask);
            expect(out.get(h)!.flags).toBe(viewportFlagsR2000(s));
            n++;
          }
        }
    }
    return n;
  }
  const exSrc = [LD('example_r13.dwg'), LD('example_r14.dwg'), LX('example_r12.dxf'), LX('example_r13.dxf'), LX('example_r14.dxf')];
  const haveEx = exSrc.every(existsSync) && Object.values(EXV).every((y) => existsSync(LD(`example_${y}.dwg`)) && existsSync(LX(`example_${y}.dxf`)));
  it.skipIf(!haveEx)('표본(LibreDWG 예제): R12~R14 원본 뷰포트를 R2000+로 쓰면 플래그가 AutoCAD 같은 판과 같다', () => {
    expect(pairs(exSrc, (fmt, v) => (fmt === 'dwg' ? LD : LX)(`example_${EXV[v]}.${fmt}`), 0)).toBe(77);
  });

  const smSrc = [S('AC1014'), SX('AC1009')];
  const haveSm = smSrc.every(existsSync) && DWGV.every((v) => existsSync(S(v))) && DXFV.every((v) => existsSync(SX(v)));
  it.skipIf(!haveSm)('표본(ACadSharp): AutoCAD가 더 켠 격자 비트 0x40000·0x80000만 빼면 같다', () => {
    expect(pairs(smSrc, (fmt, v) => (fmt === 'dwg' ? S(v) : SX(v)), 0xc0000)).toBe(88);
    expect(vps(read(S('AC1015'))).get('26B')!.flags & 0xc0000).toBe(0xc0000);
  });
});
