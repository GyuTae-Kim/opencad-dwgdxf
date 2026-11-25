/**
 * 221차: 플롯 설정의 음영 플롯(76~78). Autodesk DXF 참조서 PLOTSETTINGS(배치 LAYOUT도 같은 AcDbPlotSettings 하위 클래스를 지님)는
 * 76 음영 플롯 방식(0 화면표시대로·1 와이어프레임·2 숨김·3 렌더), 77 음영 플롯 해상도 수준(0 초안·1 미리 보기·2 보통·3 프레젠테이션·4 최대·5 사용자),
 * 78 사용자 DPI(100~32767 — 해상도 수준이 5일 때만 씀)를 적는다. 전에는 모델에 칸이 없어 DXF 리더가 읽지 않고 DWG(R2004+) 리더가 BS 셋을 읽고 버렸으며
 * 두 쓰기가 0·2·300을 상수로 써서, 숨김·사용자 DPI로 둔 배치·이름 있는 페이지 설정을 이 앱으로 다시 저장하면 화면표시대로·보통이 됐다(ROADMAP 157차 보고).
 * 이제 두 리더가 그 값을 플롯 설정에 두고 두 쓰기가 참조서 범위 안의 값을 쓴다. 범위 밖 값·값이 없는 문서·R2000(그 칸이 없는 판)은 전과 같다.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, PlotSettings, PlotSettingsObject } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { EditSession, applyOps } from '../../src/edit/session';
import { importPageSetupOps } from '../../src/edit/script/pagesetup';

type Shade = [number, number, number];

/** 새 도면(모형·배치 둘) + 이름 있는 모형 페이지 설정 하나 — 플롯 설정 셋 */
function baseDoc(): CadDocument {
  const doc = createNewDocument('metric');
  const s = new EditSession(doc, () => {});
  const plot: PlotSettings = { ...structuredClone(doc.layouts[0]!.plot), pageSetupName: 'Shade' };
  applyOps(doc, importPageSetupOps(doc, [{ name: 'Shade', plot, model: true }], new Set(), () => s.newHandle())!.ops);
  return doc;
}

const dec = (d: Uint8Array): string => new TextDecoder().decode(d);
const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

/** DXF 글의 AcDbPlotSettings 묶음마다 76·77·78 값(없는 코드는 빠짐). set을 주면 그 값으로 바꾼 글도 돌려준다 */
function plotTags(text: string, set?: Shade): { blocks: number[][]; text: string } {
  const lines = text.split('\r\n');
  const blocks: number[][] = [];
  let cur: number[] | null = null;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i]!.trim());
    const v = lines[i + 1]!;
    if (code === 0 || code === 100) {
      cur = code === 100 && v === 'AcDbPlotSettings' ? [] : null;
      if (cur) blocks.push(cur);
      continue;
    }
    if (cur && code >= 76 && code <= 78) {
      if (set) lines[i + 1] = String(set[code - 76]);
      cur.push(Number(lines[i + 1]));
    }
  }
  return { blocks, text: lines.join('\r\n') };
}

/** 문서의 플롯 설정 셋(모형·배치·이름 있는 페이지 설정)의 음영 플롯 값 */
function shades(doc: CadDocument): unknown[][] {
  const plots: PlotSettings[] = [...doc.layouts.map((l) => l.plot), ...[...doc.objects.values()].filter((o) => o.type === 'PLOTSETTINGS').map((o) => (o as PlotSettingsObject).plot)];
  return plots.map((p) => [p.shadePlotMode, p.shadePlotResolution, p.shadePlotDpi]);
}

/** AutoCAD가 숨김·사용자 600 DPI로 둔 것처럼 76~78을 바꾼 R2018 DXF */
function autocadLike(shade: Shade): Uint8Array {
  const base = dec(writeDxf(baseDoc(), { version: 'AC1032' }).data);
  const out = plotTags(base, shade);
  // 바꾼 자리가 셋(모형·배치·페이지 설정) × 세 코드인지 — 시험 도면이 맞는지
  expect(out.blocks).toEqual([shade, shade, shade]);
  return enc(out.text);
}

const HIDDEN: Shade = [2, 5, 600];
const DEFAULT: Shade = [0, 2, 300];

describe('플롯 설정의 음영 플롯 76~78(221차)', () => {
  it('DXF 리더가 76~78을 읽고, DXF(R2004·R2018)로 다시 쓰고 읽어도 같은 값이다', () => {
    const src = readDxf(autocadLike(HIDDEN));
    // 전에는 읽지 않아 셋 모두 undefined
    expect(shades(src)).toEqual([HIDDEN, HIDDEN, HIDDEN]);
    for (const version of ['AC1018', 'AC1032'] as const) {
      const text = dec(writeDxf(src, { version }).data);
      // 전에는 0·2·300 상수
      expect(plotTags(text).blocks, version).toEqual([HIDDEN, HIDDEN, HIDDEN]);
      expect(shades(readDxf(enc(text))), version).toEqual([HIDDEN, HIDDEN, HIDDEN]);
    }
  });

  it('DWG(R2004·R2018)로 쓰고 읽어도 같은 값이고, 그 DWG를 다시 DXF로 써도 남는다', () => {
    const src = readDxf(autocadLike(HIDDEN));
    for (const version of ['AC1018', 'AC1032'] as const) {
      const back = readDwg(writeDwg(src, { version }).data);
      // 전에는 DWG 리더가 BS 셋을 버리고 쓰기가 0·2·300
      expect(shades(back), version).toEqual([HIDDEN, HIDDEN, HIDDEN]);
      expect(plotTags(dec(writeDxf(back, { version: 'AC1018' }).data)).blocks, version).toEqual([HIDDEN, HIDDEN, HIDDEN]);
    }
  });

  it('참조서 범위 밖 값(76 = 4, 77 = 9, 78 = 50)은 전처럼 0·2·300으로 쓴다', () => {
    const src = readDxf(autocadLike([4, 9, 50]));
    expect(plotTags(dec(writeDxf(src, { version: 'AC1032' }).data)).blocks).toEqual([DEFAULT, DEFAULT, DEFAULT]);
    const back = readDwg(writeDwg(src, { version: 'AC1032' }).data);
    expect(plotTags(dec(writeDxf(back, { version: 'AC1032' }).data)).blocks).toEqual([DEFAULT, DEFAULT, DEFAULT]);
  });

  it('값이 없는 새 도면은 전과 같은 76 0·77 2·78 300이고, R2000(그 칸이 없는 판)에는 쓰지 않는다', () => {
    const doc = baseDoc();
    expect(plotTags(dec(writeDxf(doc, { version: 'AC1032' }).data)).blocks).toEqual([DEFAULT, DEFAULT, DEFAULT]);
    expect(plotTags(dec(writeDxf(doc, { version: 'AC1018' }).data)).blocks).toEqual([DEFAULT, DEFAULT, DEFAULT]);
    const src = readDxf(autocadLike(HIDDEN));
    expect(plotTags(dec(writeDxf(src, { version: 'AC1015' }).data)).blocks).toEqual([[], [], []]);
    expect(plotTags(dec(writeDxf(readDwg(writeDwg(src, { version: 'AC1015' }).data), { version: 'AC1032' }).data)).blocks).toEqual([DEFAULT, DEFAULT, DEFAULT]);
  });
});
