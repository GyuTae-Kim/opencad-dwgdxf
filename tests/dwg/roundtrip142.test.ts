/**
 * 142차: R12 DXF로 쓰는 뷰포트의 보기 정보 묶음(ACAD 확장 자료 "MVIEW").
 * 모델로 만드는 묶음(읽은 묶음이 없는 R2000+·앱에서 만든 뷰포트)은 플래그 칸을 90 플래그에서 쓰고 빠른 확대만 늘 1이다 — AutoCAD가 같은 도면을 R12 DXF로 쓴
 * 공개 표본 짝에서 UCS 아이콘·격자는 모델 플래그를 따르고 빠른 확대는 모델과 무관하게 1이다(전에는 UCS 아이콘 1·격자 0 등으로 고정해 써서 표본 뷰포트 하나가 달랐다).
 * 읽은 묶음이 있으면(R12~R14) 모델과 뜻이 달라진 칸만 고친다 — 바꾸지 않은 뷰포트는 묶음이 그대로이고, 앱에서 바꾼 보기는 R12 출력에 남는다(전에는 잃었다).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CadDocument, Entity, ViewportEntity, XData, XDataItem } from '../../src/core/model';
import { PAPER_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { readDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { applyMviewXData, mviewItems, r12ViewportXData } from '../../src/io/mview';
import { FIXTURES } from '../oracle/ezdxf';

const acadItems = (xd: XData[] | undefined) => xd?.find((x) => x.app.toUpperCase() === 'ACAD')?.items;
const same = (v: string) => v;

function viewport(over: Partial<ViewportEntity> = {}): ViewportEntity {
  return {
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
    flags: 0,
    frozenLayers: [],
    renderMode: 0,
    ucsPerViewport: false,
    ...over,
  } as ViewportEntity;
}

/** R13 원본 꼴 묶음: 렌즈 0·빠른 확대 0·스냅 간격 0 — 모델로 다시 만들면 50·1·0.5가 되는 값 */
function r13Group(frozen: string[] = []): XDataItem[] {
  const n = (code: number, value: number): XDataItem => ({ code, value });
  return [
    { code: 1000, value: 'MVIEW' },
    { code: 1002, value: '{' },
    n(1070, 16),
    { code: 1010, value: { x: 0, y: 0, z: 0 } },
    { code: 1010, value: { x: 0, y: 0, z: 1 } },
    ...[0, 228.4, 133.3, 101.6, 0, 0, 0].map((v) => n(1040, v)),
    ...[0, 1000, 0, 1, 0, 0, 0, 0].map((v) => n(1070, v)),
    ...[0, 0, 0, 0, 0, 10, 10].map((v) => n(1040, v)),
    n(1070, 0),
    { code: 1002, value: '{' },
    ...frozen.map((l) => ({ code: 1003, value: l })),
    { code: 1002, value: '}' },
    { code: 1002, value: '}' },
  ];
}
const dstyle: XDataItem[] = [{ code: 1000, value: 'DSTYLE' }, { code: 1002, value: '{' }, { code: 1070, value: 40 }, { code: 1040, value: 2 }, { code: 1002, value: '}' }];

/** 읽은 뷰포트(묶음을 모델로 옮긴 것) */
function readVp(xdata: XData[]): ViewportEntity {
  const e = viewport({ xdata, frozenLayers: [] });
  applyMviewXData(e, same);
  return e;
}

describe('모델로 만드는 MVIEW 묶음(142차)', () => {
  it('플래그 칸은 90 플래그에서(읽을 때의 거꾸로), 빠른 확대는 늘 1', () => {
    const vals = (e: ViewportEntity) => mviewItems(e).map((t) => t.value);
    // 보기 모드 9(원근·UCS 따라감), UCS 아이콘 3, 스냅·격자·등각 스냅, 등각 쌍 위, 숨은선 출력
    const all = vals(viewport({ flags: 1 | 8 | 32 | 64 | 256 | 512 | 1024 | 0x1000 | 2048 | 0x8000 | 0x4000 }));
    expect(all.slice(12, 20)).toEqual([9, 100, 1, 3, 1, 1, 1, 1]);
    expect(all[27]).toBe(1);
    const none = vals(viewport({ flags: 0 }));
    expect(none.slice(12, 20)).toEqual([0, 100, 1, 0, 0, 0, 0, 0]);
    expect(none[27]).toBe(0);
    // 등각 쌍: 8192만 = 오른쪽(2), 둘 다 = 왼쪽(0)
    expect(vals(viewport({ flags: 0x2000 }))[19]).toBe(2);
    expect(vals(viewport({ flags: 0x3000 }))[19]).toBe(0);
    // UCS 아이콘: 보임만 1, 원점만 2
    expect(vals(viewport({ flags: 32 }))[15]).toBe(1);
    expect(vals(viewport({ flags: 64 }))[15]).toBe(2);
  });

  it('만든 묶음을 다시 읽으면 플래그 칸의 비트가 그대로 돌아온다(빠른 확대 128은 늘 켜짐)', () => {
    for (const flags of [0, 32 | 64, 512, 256 | 1024 | 0x2000, 1 | 2 | 4 | 16 | 2048, 0x1000 | 32]) {
      const back = readVp([{ app: 'ACAD', items: mviewItems(viewport({ flags })) }]);
      expect(back.flags, String(flags)).toBe(flags | 128);
    }
  });

  it('묶음이 없으면 모델로 만들어 ACAD 자료로 더한다(다른 앱 자료는 그대로)', () => {
    const vp = viewport({ flags: 32 | 64 | 512 });
    const other: XData = { app: 'MY_APP', items: [{ code: 1000, value: 'x' }] };
    const got = r12ViewportXData([other], vp, same)!;
    expect(got[0]).toBe(other);
    expect(got[1]).toEqual({ app: 'ACAD', items: mviewItems(vp) });
    expect(r12ViewportXData(undefined, vp, same)).toEqual([{ app: 'ACAD', items: mviewItems(vp) }]);
  });
});

describe('읽은 MVIEW 묶음 고쳐 쓰기(142차)', () => {
  it('바꾸지 않은 뷰포트는 받은 배열 그대로(모델로 다시 만들면 달라지는 렌즈 0·빠른 확대 0·스냅 간격 0 포함)', () => {
    const xdata: XData[] = [{ app: 'ACAD', items: [...dstyle, ...r13Group(['HIDDEN', 'DIM'])] }];
    const vp = readVp(xdata);
    expect(vp.lensLength).toBe(50);
    expect(vp.flags & 128).toBe(0);
    expect(vp.frozenLayers).toEqual(['HIDDEN', 'DIM']);
    expect(r12ViewportXData(xdata, vp, same)).toBe(xdata);
    // 모델로 다시 만든 묶음은 그 세 칸이 다르다
    const built = mviewItems(vp);
    expect([built[9]!.value, built[14]!.value, built[23]!.value]).toEqual([50, 1, 0.5]);
  });

  it('보기·플래그·동결 도면층을 바꾼 칸만 모델 값으로 고치고 나머지 칸과 앞뒤 묶음은 그대로', () => {
    const group = r13Group(['HIDDEN']);
    const xdata: XData[] = [{ app: 'MY_APP', items: [{ code: 1000, value: 'x' }] }, { app: 'ACAD', items: [...dstyle, ...group, { code: 1000, value: 'TAIL' }] }];
    const vp = readVp(xdata);
    vp.viewCenter = { x: 140, y: 110 };
    vp.viewHeight = 456.8;
    vp.flags |= 512 | 32 | 64;
    vp.frozenLayers = ['HIDDEN', 'DIM'];
    const got = r12ViewportXData(xdata, vp, same)!;
    expect(got).not.toBe(xdata);
    expect(got[0]).toBe(xdata[0]);
    const items = got[1]!.items;
    expect(items.slice(0, dstyle.length)).toEqual(dstyle);
    expect(items[items.length - 1]).toEqual({ code: 1000, value: 'TAIL' });
    const out = items.slice(dstyle.length, -1);
    const changed = out.map((t, i) => (i < 28 && t !== group[i] ? i : -1)).filter((i) => i >= 0);
    // 높이(6)·중심 x·y(7·8)·UCS 아이콘(15)·격자(17)만 새 값, 렌즈 0·빠른 확대 0·스냅 간격 0은 그대로
    expect(changed).toEqual([6, 7, 8, 15, 17]);
    expect(out.slice(6, 9).map((t) => t.value)).toEqual([456.8, 140, 110]);
    expect([out[15]!.value, out[17]!.value]).toEqual([3, 1]);
    expect([out[9]!.value, out[14]!.value, out[23]!.value]).toEqual([0, 0, 0]);
    expect(out.slice(28)).toEqual([
      { code: 1002, value: '{' },
      { code: 1003, value: 'HIDDEN' },
      { code: 1003, value: 'DIM' },
      { code: 1002, value: '}' },
      { code: 1002, value: '}' },
    ]);
    // 다시 읽으면 바꾼 값
    const back = readVp([{ app: 'ACAD', items: out }]);
    expect(back.viewCenter).toEqual({ x: 140, y: 110 });
    expect(back.viewHeight).toBe(456.8);
    expect(back.flags & (512 | 96)).toBe(512 | 96);
    expect(back.frozenLayers).toEqual(['HIDDEN', 'DIM']);
  });

  it('1003은 읽을 때처럼 풀어 견준다(R13·R14 DWG는 핸들 — 못 찾는 핸들은 모델에도 없다)', () => {
    const names = new Map([['2F', 'HIDDEN']]);
    const lay = (v: string) => names.get(v);
    const xdata: XData[] = [{ app: 'ACAD', items: r13Group(['2F', '99']) }];
    const vp = viewport({ xdata, frozenLayers: [] });
    applyMviewXData(vp, lay);
    expect(vp.frozenLayers).toEqual(['HIDDEN']);
    expect(r12ViewportXData(xdata, vp, lay)).toBe(xdata);
  });

  it('꼴이 다른 묶음(값이 모자라거나 그룹 코드가 다른 것)은 그대로 둔다', () => {
    const vp = viewport({ viewHeight: 99 });
    const short: XData[] = [{ app: 'ACAD', items: [{ code: 1000, value: 'MVIEW' }, { code: 1002, value: '{' }, { code: 1070, value: 16 }, { code: 1002, value: '}' }] }];
    expect(r12ViewportXData(short, vp, same)).toBe(short);
    const g = r13Group();
    g[6] = { code: 1070, value: 12 };
    const odd: XData[] = [{ app: 'ACAD', items: g }];
    expect(r12ViewportXData(odd, vp, same)).toBe(odd);
    const open: XData[] = [{ app: 'ACAD', items: r13Group().slice(0, -1) }];
    expect(r12ViewportXData(open, vp, same)).toBe(open);
  });
});

describe('R12 DXF 왕복(142차)', () => {
  /** R12 DXF로 한 번 쓰고 다시 읽은 문서(뷰포트 3A — 확장 자료에 읽은 MVIEW 묶음) */
  function r12Doc(flags = 0): CadDocument {
    const doc = createNewDocument('metric');
    doc.layers.set('HIDDEN', { ...doc.layers.get('0')!, name: 'HIDDEN', handle: '' });
    doc.blocks.get(PAPER_SPACE)!.entities.push(viewport({ flags, frozenLayers: ['HIDDEN'] }));
    return readDxf(writeDxf(doc, { version: 'AC1009' }).data);
  }
  const vpOf = (doc: CadDocument) => doc.blocks.get(PAPER_SPACE)!.entities.find((e) => e.type === 'VIEWPORT' && e.handle.toUpperCase() === '3A') as ViewportEntity;
  const write = (doc: CadDocument) => vpOf(readDxf(writeDxf(doc, { version: 'AC1009' }).data));

  it('모델로 만든 묶음은 UCS 아이콘·격자 플래그를 남긴다(전에는 UCS 아이콘 1·격자 0으로 고정)', () => {
    const vp = vpOf(r12Doc(32 | 64 | 512));
    expect(vp.flags & (96 | 512)).toBe(96 | 512);
    expect(acadItems(vp.xdata)!.slice(14, 18).map((t) => t.value)).toEqual([1, 3, 0, 1]);
  });

  it('바꾸지 않으면 다시 쓴 묶음이 읽은 묶음 그대로, 보기·플래그·동결 도면층을 바꾸면 R12 출력에 남는다', () => {
    const src = r12Doc();
    const read = acadItems(vpOf(src).xdata)!;
    expect(acadItems(write(src).xdata)).toEqual(read);
    const vp = vpOf(src);
    vp.viewCenter = { x: 143.35, y: 106.6 };
    vp.viewHeight = 456.844;
    vp.flags |= 256;
    vp.frozenLayers = [];
    const got = write(src);
    expect(got.viewCenter).toEqual({ x: 143.35, y: 106.6 });
    expect(got.viewHeight).toBe(456.844);
    expect(got.flags & 256).toBe(256);
    expect(got.frozenLayers).toEqual([]);
    // 바꾸지 않은 칸은 그대로(동결 도면층 하나가 빠져 묶음이 한 칸 짧다)
    const items = acadItems(got.xdata)!;
    expect(items.length).toBe(read.length - 1);
    const diff = items.map((t, i) => (JSON.stringify(t) !== JSON.stringify(read[i]) ? i : -1)).filter((i) => i >= 0);
    expect(diff).toEqual([6, 7, 8, 16, 29]);
  });

  const S = (v: string) => join(FIXTURES, 'samples', `sample_${v}.dwg`);
  const SX = (v: string) => join(FIXTURES, '..', 'acadsharp-dxf', 'samples', `sample_${v}_ascii.dxf`);
  const DWGV = ['AC1015', 'AC1018', 'AC1021', 'AC1024', 'AC1027', 'AC1032'] as const;
  const DXFV = ['AC1015', 'AC1018', 'AC1021', 'AC1024', 'AC1027', 'AC1032'] as const;
  const vps = (doc: CadDocument) => new Map([...doc.blocks.values()].flatMap((b) => b.entities.filter((e) => e.type === 'VIEWPORT').map((e) => [e.handle.toUpperCase(), e as ViewportEntity] as const)));
  const norm = (e: Entity | undefined) =>
    JSON.stringify(
      (acadItems(e?.xdata) ?? []).map((t) => [t.code, typeof t.value === 'number' ? Number(t.value.toPrecision(12)) : typeof t.value === 'object' && !(t.value instanceof Uint8Array) ? [t.value.x, t.value.y, t.value.z] : t.value]),
    );
  const have = existsSync(SX('AC1009')) && existsSync(S('AC1014')) && DWGV.every((v) => existsSync(S(v))) && DXFV.every((v) => existsSync(SX(v)));

  it.skipIf(!have)('표본: AutoCAD R2000+ 판의 뷰포트를 R12 DXF로 쓰면 MVIEW가 AutoCAD R12 판과 같다', () => {
    const acad = vps(readDxf(new Uint8Array(readFileSync(SX('AC1009')))));
    expect([...acad.keys()]).toEqual(['267', '26B']);
    let n = 0;
    const check = (src: CadDocument, label: string) => {
      const out = vps(readDxf(writeDxf(src, { version: 'AC1009' }).data));
      for (const [h, a] of acad) {
        expect(norm(out.get(h)), `${label} ${h}`).toBe(norm(a));
        n++;
      }
    };
    for (const v of DWGV) check(readDwg(new Uint8Array(readFileSync(S(v)))), `dwg ${v}`);
    for (const v of DXFV) check(readDxf(new Uint8Array(readFileSync(SX(v)))), `dxf ${v}`);
    expect(n).toBe(24);
  });

  it.skipIf(!have)('표본: R14 판 뷰포트는 바꾸지 않으면 R12 출력이 AutoCAD R12 판과 같고, 보기를 바꾸면 그 값이 남는다', () => {
    const acad = vps(readDxf(new Uint8Array(readFileSync(SX('AC1009')))));
    const src = readDwg(new Uint8Array(readFileSync(S('AC1014'))));
    const out = vps(readDxf(writeDxf(src, { version: 'AC1009' }).data));
    for (const h of ['267', '26B']) expect(norm(out.get(h)), h).toBe(norm(acad.get(h)));
    const vp = vps(src).get('26B')!;
    vp.viewCenter = { x: vp.viewCenter.x + 10, y: vp.viewCenter.y + 5 };
    vp.viewHeight *= 2;
    vp.flags &= ~512;
    const after = vps(readDxf(writeDxf(src, { version: 'AC1009' }).data));
    const got = after.get('26B')!;
    expect(got.viewCenter.x).toBeCloseTo(vp.viewCenter.x, 9);
    expect(got.viewCenter.y).toBeCloseTo(vp.viewCenter.y, 9);
    expect(got.viewHeight).toBeCloseTo(vp.viewHeight, 9);
    expect(got.flags & 512).toBe(0);
    expect(norm(after.get('267'))).toBe(norm(acad.get('267')));
  });
});
