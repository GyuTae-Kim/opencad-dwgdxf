/**
 * 229차: 플롯 설정의 플롯 뷰 이름(6). Autodesk DXF 참조서 PLOTSETTINGS(배치 LAYOUT도 같은 AcDbPlotSettings 하위 클래스를 지님)는 6을 플롯 뷰 이름으로,
 * 74(플롯 영역)의 3을 「6이 적은 뷰」로 적는다. DWG는 R2000이 창 구석 다음 글(T), R2004+가 핸들 흐름의 VIEW 레코드 핸들이다. 전에는 모델에 칸이 없어
 * DXF 리더가 읽지 않고 DWG 리더가 R2000 글·R2004+ 배치 핸들을 읽고 버렸으며(PLOTSETTINGS 객체는 핸들을 읽지도 않음) 두 쓰기가 ''·핸들 0을 써서,
 * 뷰를 플롯하게 둔 배치·이름 있는 페이지 설정을 이 앱으로 다시 저장하면 뷰 이름을 잃었다(ROADMAP 221·228차 보고).
 * 이제 두 리더가 이름(R2004+ DWG는 핸들을 푼 VIEW 레코드 이름)을 두고, 두 쓰기가 쓰는 VIEW 표에 그 이름이 있을 때만 그 이름·핸들을 쓴다.
 * VIEW 표에 없는 이름·지운 뷰·이름 없는 새 도면은 전과 같은 ''·핸들 0이다. 6은 74가 고르는 칸이라(창 구석 48·49·140·141처럼) 74가 3이 아니어도 지킨다.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, PlotSettings, PlotSettingsObject, ViewRecord } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { EditSession, applyOps } from '../../src/edit/session';
import { importPageSetupOps } from '../../src/edit/script/pagesetup';

/** [6 플롯 뷰 이름, 74 플롯 영역] */
type Pv = [view: string, type: number];

/** 새 도면(모형·배치 둘) + 이름 있는 모형 페이지 설정 하나(플롯 설정 셋) + VIEW 레코드 Front */
function baseDoc(): CadDocument {
  const doc = createNewDocument('metric');
  const s = new EditSession(doc, () => {});
  const plot: PlotSettings = { ...structuredClone(doc.layouts[0]!.plot), pageSetupName: 'Views' };
  applyOps(doc, importPageSetupOps(doc, [{ name: 'Views', plot, model: true }], new Set(), () => s.newHandle())!.ops);
  const view: ViewRecord = {
    name: 'Front',
    handle: s.newHandle(),
    flags: 0,
    center: { x: 50, y: 25 },
    width: 100,
    height: 50,
    viewDirection: { x: 0, y: 0, z: 1 },
    viewTarget: { x: 0, y: 0, z: 0 },
    twist: 0,
  };
  doc.views.set('FRONT', view);
  return doc;
}

const dec = (d: Uint8Array): string => new TextDecoder().decode(d);
const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

/** DXF 글의 AcDbPlotSettings 묶음마다 [6, 74]. set을 주면 그 값으로 바꾼 글도 돌려준다 */
function plotTags(text: string, set?: Pv): { blocks: Pv[]; text: string } {
  const lines = text.split('\r\n');
  const blocks: Pv[] = [];
  let cur: Pv | null = null;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i]!.trim());
    if (code === 0 || code === 100) {
      cur = code === 100 && lines[i + 1] === 'AcDbPlotSettings' ? ['?', -1] : null;
      if (cur) blocks.push(cur);
      continue;
    }
    if (!cur) continue;
    if (code === 6) {
      if (set) lines[i + 1] = set[0];
      cur[0] = lines[i + 1]!;
    } else if (code === 74) {
      if (set) lines[i + 1] = String(set[1]);
      cur[1] = Number(lines[i + 1]);
    }
  }
  return { blocks, text: lines.join('\r\n') };
}

/** 문서의 플롯 설정 셋(모형·배치·이름 있는 페이지 설정)의 플롯 뷰 이름 */
function names(doc: CadDocument): unknown[] {
  const plots: PlotSettings[] = [...doc.layouts.map((l) => l.plot), ...[...doc.objects.values()].filter((o) => o.type === 'PLOTSETTINGS').map((o) => (o as PlotSettingsObject).plot)];
  return plots.map((p) => (p as { plotViewName?: unknown }).plotViewName);
}

/** AutoCAD가 플롯 영역을 뷰로 둔 것처럼 6·74를 바꾼 R2018 DXF */
function autocadLike(pv: Pv): Uint8Array {
  const base = dec(writeDxf(baseDoc(), { version: 'AC1032' }).data);
  const out = plotTags(base, pv);
  // 바꾼 자리가 셋(모형·배치·페이지 설정) × 두 코드인지 — 시험 도면이 맞는지
  expect(out.blocks).toEqual([pv, pv, pv]);
  return enc(out.text);
}

const FRONT: Pv = ['Front', 3];
const THREE = ['Front', 'Front', 'Front'];
const NONE = [undefined, undefined, undefined];

describe('플롯 설정의 플롯 뷰 이름 6(229차)', () => {
  it('DXF 리더가 6을 읽고, DXF(R2000·R2004·R2018)로 다시 쓰고 읽어도 같은 이름이다', () => {
    const src = readDxf(autocadLike(FRONT));
    // 전에는 읽지 않아 셋 모두 undefined
    expect(names(src)).toEqual(THREE);
    for (const version of ['AC1015', 'AC1018', 'AC1032'] as const) {
      const text = dec(writeDxf(src, { version }).data);
      // 전에는 '' 상수
      expect(plotTags(text).blocks, version).toEqual([FRONT, FRONT, FRONT]);
      expect(names(readDxf(enc(text))), version).toEqual(THREE);
    }
  });

  it('DWG(R2000 글·R2004·R2018 VIEW 핸들)로 쓰고 읽어도 같은 이름이고, 그 DWG를 다시 DXF로 써도 남는다', () => {
    const src = readDxf(autocadLike(FRONT));
    for (const version of ['AC1015', 'AC1018', 'AC1032'] as const) {
      const back = readDwg(writeDwg(src, { version }).data);
      // 전에는 DWG 쓰기가 ''·핸들 0이고 리더가 글·핸들을 버림
      expect(names(back), version).toEqual(THREE);
      expect(plotTags(dec(writeDxf(back, { version: 'AC1032' }).data)).blocks, version).toEqual([FRONT, FRONT, FRONT]);
    }
  });

  it('VIEW 표에 없는 이름과 읽은 뒤 지운 뷰는 전처럼 빈 이름·핸들 0으로 쓴다', () => {
    const gone = readDxf(autocadLike(['Gone', 3]));
    expect(plotTags(dec(writeDxf(gone, { version: 'AC1032' }).data)).blocks).toEqual([['', 3], ['', 3], ['', 3]]);
    for (const version of ['AC1015', 'AC1018', 'AC1032'] as const) expect(names(readDwg(writeDwg(gone, { version }).data)), version).toEqual(NONE);
    const del = readDxf(autocadLike(FRONT));
    del.views.delete('FRONT');
    expect(plotTags(dec(writeDxf(del, { version: 'AC1018' }).data)).blocks).toEqual([['', 3], ['', 3], ['', 3]]);
    expect(names(readDwg(writeDwg(del, { version: 'AC1018' }).data))).toEqual(NONE);
  });

  it('74가 3이 아니어도 이름을 지키고, 대소문자가 다른 이름은 VIEW 레코드 이름으로 쓴다', () => {
    const src = readDxf(autocadLike(['front', 5]));
    const want: Pv = ['Front', 5];
    expect(plotTags(dec(writeDxf(src, { version: 'AC1032' }).data)).blocks).toEqual([want, want, want]);
    const back = readDwg(writeDwg(src, { version: 'AC1018' }).data);
    expect(names(back)).toEqual(THREE);
    expect(plotTags(dec(writeDxf(back, { version: 'AC1018' }).data)).blocks).toEqual([want, want, want]);
  });

  it('이름 없는 새 도면은 전과 같은 빈 6이고, DWG를 거쳐도 칸이 생기지 않는다', () => {
    const doc = baseDoc();
    for (const version of ['AC1015', 'AC1018', 'AC1032'] as const) {
      expect(plotTags(dec(writeDxf(doc, { version }).data)).blocks.map((b) => b[0]), version).toEqual(['', '', '']);
      expect(names(readDxf(writeDxf(doc, { version }).data)), version).toEqual(NONE);
      expect(names(readDwg(writeDwg(doc, { version }).data)), version).toEqual(NONE);
    }
  });
});
