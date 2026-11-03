/**
 * 73차: DWG의 OLE2FRAME 자료와 위치.
 * DWG는 OLE 틀의 위치를 자료(DXF 310과 같은 바이트) 머리에만 둔다: 2바이트 뒤에 네 모서리(왼쪽 위·오른쪽 위·오른쪽 아래·왼쪽 아래 x·y·z).
 * 전에는 위치를 읽지 않아 DWG의 OLE 틀이 그려지지 않았고, DXF나 다른 판의 DWG로 저장하면(또는 옮긴 뒤 저장하면) OLE 객체가 빠졌다.
 * 근거는 같은 도면을 AutoCAD가 쓴 DWG·DXF 짝(LibreDWG 시험 도면 TS1, R2000) — 로컬에 있을 때만 아래 마지막 시험이 돈다.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MODEL_SPACE, entityDefaults, type Ole2FrameEntity, type Vec3 } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { oleCorners, oleDataAt } from '../../src/io/oledata';
import { transformEntity } from '../../src/edit/geom';
import { affTranslate } from '../../src/edit/geom/math';

const V = (x: number, y: number, z = 0): Vec3 => ({ x, y, z });

/** OLE 자료: 머리 2바이트(80 55) + 네 모서리 + 내용 200바이트 */
function oleData(a: Vec3, b: Vec3): Uint8Array {
  const out = new Uint8Array(2 + 96 + 200);
  out[0] = 0x80;
  out[1] = 0x55;
  const dv = new DataView(out.buffer);
  [a, V(b.x, a.y, a.z), b, V(a.x, b.y, b.z)].forEach((p, i) => [p.x, p.y, p.z].forEach((v, k) => dv.setFloat64(2 + i * 24 + k * 8, v, true)));
  for (let i = 98; i < out.length; i++) out[i] = (i * 7) & 255;
  return out;
}

function docWithOle() {
  const doc = createNewDocument('metric');
  const ms = doc.blocks.get(MODEL_SPACE)!;
  const a = V(30, -19);
  const b = V(35, -22);
  const e = { ...entityDefaults(), type: 'OLE2FRAME', handle: '7B0', owner: ms.recordHandle, upperLeft: a, lowerRight: b, ole: { flags: 2, mode: 0, tail: 1, data: oleData(a, b) } } as Ole2FrameEntity;
  ms.entities.push(e);
  doc.entityIndex.set(e.handle, e);
  return { doc, e };
}

const olesOf = (doc: ReturnType<typeof readDxf>) => doc.blocks.get(MODEL_SPACE)!.entities.filter((x): x is Ole2FrameEntity => x.type === 'OLE2FRAME');
const hexOf = (b: Uint8Array) => Buffer.from(b).toString('hex').toUpperCase();
const dxfData = (o: Ole2FrameEntity) => (o.raw ?? []).filter((t) => t.code === 310).map((t) => String(t.value)).join('');

describe('DWG OLE2FRAME 자료', () => {
  it('자료 머리에서 왼쪽 위·오른쪽 아래를 읽고, 옮긴 자리로 네 모서리를 고친다', () => {
    const d = oleData(V(1, 2, 3), V(4, -5, 3));
    expect(oleCorners(d)).toEqual([V(1, 2, 3), V(4, -5, 3)]);
    expect(oleDataAt(d, V(1, 2, 3), V(4, -5, 3))).toBe(d);
    const m = oleDataAt(d, V(11, 7, 0), V(14, 0, 0));
    expect(m).toEqual(oleData(V(11, 7, 0), V(14, 0, 0)).map((v, i) => (i < 98 ? v : d[i]!)));
    expect(oleCorners(new Uint8Array(40))).toBeNull();
  });

  it('DWG(R2018·R2000)로 쓰고 다시 읽으면 위치·값·자료가 같다', () => {
    const { doc, e } = docWithOle();
    for (const version of ['AC1032', 'AC1015'] as const) {
      const out = writeDwg(doc, { version });
      expect(out.warnings.map((w) => w.code)).not.toContain('dwg.write_entity_dropped');
      const [o] = olesOf(readDwg(out.data));
      expect([o!.upperLeft, o!.lowerRight, o!.ole!.flags, o!.ole!.mode, o!.ole!.tail]).toEqual([e.upperLeft, e.lowerRight, 2, 0, 1]);
      expect(hexOf(o!.ole!.data)).toBe(hexOf(e.ole!.data));
    }
  });

  it('DXF로 쓰면 AutoCAD와 같은 OLE2FRAME 태그(70·3·10·11·71·72·73·90·310·1)로 남는다(전에는 빠졌다)', () => {
    const { doc, e } = docWithOle();
    const out = writeDxf(doc, { version: 'AC1032' });
    expect(out.warnings.map((w) => w.code)).not.toContain('entity.ole_dropped');
    const [o] = olesOf(readDxf(out.data));
    expect([o!.upperLeft, o!.lowerRight]).toEqual([e.upperLeft, e.lowerRight]);
    const tags = o!.raw!.filter((t) => t.code !== 310).map((t) => `${t.code}=${String(t.value).trim()}`);
    expect(tags.filter((t) => /^(70|3|71|72|73|90|1)=/.test(t))).toEqual(['70=2', '3=OLE', '71=2', '72=0', '73=1', `90=${e.ole!.data.length}`, '1=OLE']);
    expect(dxfData(o!)).toBe(hexOf(e.ole!.data));
  });

  it('옮긴 OLE 틀은 DXF·DWG 모두 새 자리로 쓰고 자료 머리의 모서리도 고친다', () => {
    const { doc, e } = docWithOle();
    const moved = transformEntity(e, affTranslate(10, 5), doc).replace![0] as Ole2FrameEntity;
    doc.blocks.get(MODEL_SPACE)!.entities[doc.blocks.get(MODEL_SPACE)!.entities.indexOf(e)] = moved;
    doc.entityIndex.set(moved.handle, moved);
    const want = [V(40, -14), V(45, -17)];
    const [x] = olesOf(readDxf(writeDxf(doc, { version: 'AC1032' }).data));
    expect([x!.upperLeft, x!.lowerRight]).toEqual(want);
    expect(oleCorners(Buffer.from(dxfData(x!), 'hex'))).toEqual(want);
    const [y] = olesOf(readDwg(writeDwg(doc, { version: 'AC1032' }).data));
    expect([y!.upperLeft, y!.lowerRight]).toEqual(want);
    expect(oleCorners(y!.ole!.data)).toEqual(want);
  });

  const DWG = '.runtime/real-dwg/libredwg/test/test-data/2000/TS1.dwg';
  const DXF = '.runtime/real-dwg/libredwg-dxf/test/test-data/2000/TS1.dxf';
  it.skipIf(!existsSync(DWG) || !existsSync(DXF))('같은 도면의 AutoCAD DWG·DXF 짝(TS1): 위치·자료가 같고, DWG를 DXF로 쓰면 같은 태그다', () => {
    const dwg = readDwg(new Uint8Array(readFileSync(DWG)));
    const ref = readDxf(new Uint8Array(readFileSync(DXF))).entityIndex.get('255') as Ole2FrameEntity;
    const a = dwg.entityIndex.get('255') as Ole2FrameEntity;
    // AutoCAD DXF는 좌표를 16자리로 써서 이진 double과 끝자리가 다를 수 있다
    const close = (p: Vec3, q: Vec3) => [p.x - q.x, p.y - q.y, p.z - q.z].every((d) => Math.abs(d) < 1e-12);
    expect(close(a.upperLeft, ref.upperLeft) && close(a.lowerRight, ref.lowerRight)).toBe(true);
    expect(hexOf(a.ole!.data)).toBe(dxfData(ref));
    const o = readDxf(writeDxf(dwg, { version: 'AC1015' }).data).entityIndex.get('255') as Ole2FrameEntity;
    const norm = (x: Ole2FrameEntity) => x.raw!.filter((t) => t.code !== 310).map((t) => `${t.code}=${Number.isFinite(Number(t.value)) ? Number(Number(t.value).toPrecision(12)) : String(t.value).trim()}`);
    expect(norm(o)).toEqual(norm(ref));
    expect(dxfData(o)).toBe(dxfData(ref));
  });
});
