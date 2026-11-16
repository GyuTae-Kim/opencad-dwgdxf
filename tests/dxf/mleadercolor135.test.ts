/**
 * 다중 지시선의 원시 색(DXF 91·92·93 등, 상위 바이트 0xC2 = RGB)의 ACI(135차): 가장 가까운 ACI로 둔다(DWG 리더의 CMC와 같게).
 * 전에는 256(ByLayer)이라 검은 트루컬러(rgb 0)를 도면층 색으로 그렸다.
 * 근거: 같은 도면을 AutoCAD가 쓴 짝 — DXF 배경 색 0xC2C8C8C8은 R2000 DWG에 ACI 9로 남는다(가까운 ACI도 9).
 */
import { describe, expect, it } from 'vitest';
import type { Entity, MLeaderEntity } from '../../src/core/model';
import { MODEL_SPACE } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { nearestAci, rawColorToCad } from '../../src/core/color';
import { EditSession } from '../../src/edit/session';
import { writeDxf } from '../../src/io/dxf/writer';
import { writeDwg } from '../../src/io/dwg/writer/index';
import { readCadFile } from '../../src/io/index';
import { makeMLeader } from '../../src/app/annotate';
import type { App } from '../../src/app/app';

const P = (x: number, y: number) => ({ x, y, z: 0 });

describe('다중 지시선 원시 트루컬러의 ACI', () => {
  it('0xC2 RGB는 가장 가까운 ACI와 함께, 나머지 방식은 그대로', () => {
    expect(rawColorToCad(0xc2c8c8c8 | 0)).toEqual({ aci: 9, rgb: 0xc8c8c8 });
    const black = rawColorToCad(0xc2000000 | 0);
    expect(black.rgb).toBe(0);
    expect(black.aci).toBe(nearestAci(0));
    expect(black.aci).toBeGreaterThanOrEqual(1);
    expect(black.aci).toBeLessThanOrEqual(255);
    expect(rawColorToCad(0xc0000000 | 0)).toEqual({ aci: 256 });
    expect(rawColorToCad(0xc1000000 | 0)).toEqual({ aci: 0 });
    expect(rawColorToCad(0xc3000005 | 0)).toEqual({ aci: 5 });
    expect(rawColorToCad(0xc8000000 | 0)).toEqual({ aci: 257 });
  });

  it('DXF에서 읽은 문자 색·배경 색·지시선 색의 ACI가 DWG에서 읽은 것과 같다', () => {
    const doc = createNewDocument('metric');
    const s = new EditSession(doc, () => {});
    const fake = { active: { doc }, text: { layoutMText: () => ({ minY: -2.5, maxY: 0 }) } } as unknown as App;
    const ml = makeMLeader(fake, P(0, 0), P(20, 10), 'x', 2.5, { lineType: 1, landing: true, doglegLength: 4 }, { text: 'x', width: 30 }) as MLeaderEntity;
    ml.handle = s.newHandle();
    ml.textColor = { aci: 9, rgb: 0xc8c8c8 };
    ml.leaderLineColor = { aci: 250, rgb: 0 };
    ml.context.text!.color = { aci: 250, rgb: 0 };
    ml.context.text!.backgroundFill = true;
    ml.context.text!.backgroundColor = { aci: 9, rgb: 0xc8c8c8 };
    s.commit({ label: 'ADD', ops: [{ kind: 'add', block: MODEL_SPACE, entity: ml as Entity }] });
    for (const version of ['AC1024', 'AC1032'] as const) {
      const fromDxf = readCadFile(writeDxf(doc, { version }).data, 'x.dxf').entityIndex.get(ml.handle) as MLeaderEntity;
      const fromDwg = readCadFile(writeDwg(doc, { version }).data, 'x.dwg').entityIndex.get(ml.handle) as MLeaderEntity;
      for (const m of [fromDxf, fromDwg]) {
        expect(m.textColor).toEqual({ aci: 9, rgb: 0xc8c8c8 });
        expect(m.leaderLineColor).toEqual({ aci: nearestAci(0), rgb: 0 });
        expect(m.context.text!.color).toEqual({ aci: nearestAci(0), rgb: 0 });
        expect(m.context.text!.backgroundColor).toEqual({ aci: 9, rgb: 0xc8c8c8 });
      }
    }
  });
});
