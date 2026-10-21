/**
 * 뷰포트별 도면층 재지정(VP 색·VP 선가중치·VP 투명도): AutoCAD가 만든 도면(뷰포트 2D2에 도면층 색 ACI 6, 선가중치 0.70, 투명도 60%)에서
 * 읽어 그 뷰포트의 도면층 상태에 입힌다. 전에는 무시하고 도면층 원래 값으로 그렸다.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CadDocument } from '../../src/core/model';
import { MODEL_SPACE, tableKey } from '../../src/core/model';
import { ACI_RGB } from '../../src/core/color';
import { applyLayerOverride, viewportOverrideTable, viewportOverrides } from '../../src/core/vpoverrides';
import { readDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { buildSpace } from '../../src/render/build';
import { TextEngine } from '../../src/text/layout';
import { DocState } from '../../src/app/docstate';
import { EditSession } from '../../src/edit/session';
import { viewportModel } from '../../src/app/psltscale';
import { layoutViewports, viewportXf } from '../../src/app/scene';
import { FIXTURES } from '../oracle/ezdxf';

const base = { rgb: 0xffffff, aci: 7, hasRgb: false, lineweight: -3, transparency: 255, name: 'X' };

describe('applyLayerOverride', () => {
  it('ACI·트루컬러·선가중치·투명도를 바꾼 사본(원본은 그대로)', () => {
    const a = applyLayerOverride(base, { aci: 1, lineweight: 50, transparency: 0x80 });
    expect(a).toEqual({ ...base, aci: 1, rgb: ACI_RGB[1], hasRgb: false, lineweight: 50, transparency: 0x80 });
    expect(base.aci).toBe(7);
    const b = applyLayerOverride(base, { rgb: 0x123456 });
    expect(b.rgb).toBe(0x123456);
    expect(b.hasRgb).toBe(true);
    expect(applyLayerOverride(base, {})).toEqual(base);
  });
});

const F = (p: string) => join(FIXTURES, 'accore/made', p);
const files = ['viewport_layer_overrides.r2018.dxf', 'viewport_layer_overrides.r2018.dwg', 'viewport_layer_overrides.r2000.dwg'];
const load = (f: string): CadDocument => (f.endsWith('.dxf') ? readDxf(new Uint8Array(readFileSync(F(f)))) : readDwg(new Uint8Array(readFileSync(F(f)))));

describe.skipIf(!existsSync(F(files[0]!)))('AutoCAD 도면의 재지정', () => {
  it.each(files)('%s: 뷰포트 2D2에서 A2RED는 색 ACI 6·선종류, A2BLUE는 선가중치 0.70·투명도 0x66', (f) => {
    if (!existsSync(F(f))) return;
    const doc = load(f);
    const table = viewportOverrideTable(doc);
    expect([...table.keys()]).toEqual(['2D2']);
    const ov = viewportOverrides(doc, '2d2')!;
    expect([...ov.keys()].sort()).toEqual(['A2BLUE', 'A2RED']);
    const red = ov.get('A2RED')!;
    expect(red.aci).toBe(6);
    expect(red.linetype).toBeTruthy();
    expect(red.lineweight).toBeUndefined();
    expect(ov.get('A2BLUE')).toEqual({ lineweight: 70, transparency: 0x66 });
    expect(viewportOverrides(doc, 'FFFF')).toBeNull();
  });
  it('그 뷰포트의 모형 도면층 상태에 입히고, 다른 뷰포트는 그대로', () => {
    const doc = load(files[0]!);
    const st = new DocState(1, doc, 't.dxf', 0, 0);
    st.session = new EditSession(doc, () => {});
    const s = buildSpace(doc, MODEL_SPACE, { text: new TextEngine(null) });
    st.addScene({ upload: () => ({}), dispose: () => {} } as never, { list: s.list, styles: s.styles.specs, layers: s.layers, layerIndex: [...s.layerIndex], warnings: s.warnings, ms: 0 }, MODEL_SPACE);
    let seen = 0;
    for (const lay of doc.layouts.values()) {
      if (tableKey(lay.blockName ?? '') === MODEL_SPACE) continue;
      for (const vp of layoutViewports(doc, lay)) {
        const vm = viewportModel(null, st, viewportXf(doc, vp))!;
        const red = vm.layers[vm.index.get('A2RED')!]!;
        const blue = vm.layers[vm.index.get('A2BLUE')!]!;
        if (vp.handle.toUpperCase() === '2D2') {
          seen++;
          expect(vm.ovKey).toBe(vp.handle);
          expect(red.aci).toBe(6);
          expect(red.rgb).toBe(ACI_RGB[6]);
          expect(red.lineweight).toBe(st.layers.get('A2RED')!.lineweight);
          expect(blue.lineweight).toBe(70);
          expect(blue.transparency).toBe(0x66);
          expect(blue.aci).toBe(st.layers.get('A2BLUE')!.aci);
        } else {
          expect(vm.ovKey).toBeUndefined();
          expect(red).toBe(st.layers.get('A2RED'));
          expect(blue).toBe(st.layers.get('A2BLUE'));
        }
      }
    }
    expect(seen).toBe(1);
  });
});
