/**
 * 확장 자료 1003(도면층)을 DXF로 쓸 때(134차): DXF의 1003은 도면층 이름이고 R13 이후 DWG는 도면층 핸들로 적는다.
 * DWG 리더는 핸들을 그대로 두므로(DWG 쓰기는 이름·핸들을 모두 받는다) DWG에서 읽은 문서를 DXF로 쓰면 그 핸들의 도면층 이름으로 쓴다.
 * 근거: 같은 도면을 AutoCAD가 쓴 DWG·DXF 짝(공개 표본 R2000~R2018) — DWG의 1003 핸들이 가리키는 도면층 이름이 DXF의 1003 값이다.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, Entity, TextEntity, XData } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { readDwg, writeDwg } from '../../src/io/dwg';

/** 도면층 app_layer와 그 이름을 1003으로 단 문자(DXF에서 읽은 것처럼 이름) */
function nameDoc(layerName = 'app_layer'): CadDocument {
  const doc = createNewDocument('metric');
  const l0 = doc.layers.get('0')!;
  doc.layers.set(layerName.toUpperCase(), { ...l0, name: layerName, handle: '' });
  doc.appIds.set('LAYER_APP', { name: 'LAYER_APP', handle: '', flags: 0 });
  const t = {
    ...entityDefaults(),
    type: 'TEXT',
    handle: '91B',
    text: 'x',
    insert: { x: 0, y: 0, z: 0 },
    height: 1,
    rotation: 0,
    widthFactor: 1,
    oblique: 0,
    style: 'Standard',
    generation: 0,
    halign: 0,
    valign: 0,
    xdata: [{ app: 'LAYER_APP', items: [{ code: 1002, value: '{' }, { code: 1003, value: layerName }, { code: 1002, value: '}' }] }],
  } as unknown as TextEntity;
  doc.blocks.get(MODEL_SPACE)!.entities.push(t as Entity);
  doc.entityIndex.set(t.handle, t as Entity);
  return doc;
}

const layer1003 = (doc: CadDocument) => {
  const x = (doc.entityIndex.get('91B') as { xdata?: XData[] }).xdata!.find((a) => a.app.toUpperCase() === 'LAYER_APP')!;
  return String(x.items.find((it) => it.code === 1003)!.value);
};

describe('확장 자료 1003(도면층)을 DXF로', () => {
  for (const version of ['AC1015', 'AC1032'] as const) {
    it(`${version} DWG에서 읽은 핸들을 그 도면층 이름으로 쓴다`, () => {
      const dwg = readDwg(writeDwg(nameDoc(), { version }).data);
      // DWG 리더는 1003을 도면층 핸들로 둔다
      const h = layer1003(dwg);
      expect(h).toBe(dwg.layers.get('APP_LAYER')!.handle);
      for (const dv of ['AC1009', 'AC1015', 'AC1032'] as const) {
        const back = readDxf(writeDxf(dwg, { version: dv }).data);
        expect(layer1003(back)).toBe('app_layer');
      }
      // DWG로 다시 쓰면 그대로 같은 도면층 핸들
      const again = readDwg(writeDwg(dwg, { version }).data);
      expect(again.layers.get('APP_LAYER')!.handle).toBe(layer1003(again));
    });
  }

  it('DXF에서 읽은 문서(이름)와 도면층이 없는 핸들은 그대로', () => {
    // 16진처럼 보이는 이름(ABC)도 DXF 문서에서는 이름 그대로
    const dxfDoc = readDxf(writeDxf(nameDoc('ABC'), { version: 'AC1032' }).data);
    expect(layer1003(readDxf(writeDxf(dxfDoc, { version: 'AC1032' }).data))).toBe('ABC');
    // DWG 문서라도 어느 도면층의 핸들도 아니면 값 그대로
    const dwg = readDwg(writeDwg(nameDoc(), { version: 'AC1032' }).data);
    const x = (dwg.entityIndex.get('91B') as { xdata?: XData[] }).xdata!.find((a) => a.app.toUpperCase() === 'LAYER_APP')!;
    x.items = x.items.map((it) => (it.code === 1003 ? { code: 1003, value: 'not_a_handle' } : it));
    expect(layer1003(readDxf(writeDxf(dwg, { version: 'AC1032' }).data))).toBe('not_a_handle');
  });
});
