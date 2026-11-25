/**
 * 228차: 배치 뷰포트의 음영 플롯 방식(VIEWPORT 170). Autodesk DXF 참조서 VIEWPORT는 170을 음영 플롯 방식(0 화면표시대로·1 와이어프레임·2 숨김·3 렌더)으로 적고,
 * DWG(R2004+)에서는 UCS 직교 유형 다음 BS다(이 앱 리더·쓰기가 이미 지나가는 자리). 전에는 모델에 칸이 없어 DXF 리더가 읽지 않고 DWG 리더가 BS를 읽고 버렸으며
 * 두 쓰기가 0을 상수로 써서, 숨김으로 플롯하게 둔 뷰포트를 이 앱으로 다시 저장하면 화면표시대로가 됐다(ROADMAP 158차·221차 보고 — 221차 PLOTSETTINGS 76과 같은 꼴).
 * 이제 두 리더가 1~3을 뷰포트에 두고 두 쓰기가 그 값을 쓴다. 0·범위 밖 값(4·5는 333·348 핸들과 함께여야 뜻이 섬)·값이 없는 뷰포트·R2000·R12(그 칸이 없는 판)는 전과 같다.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, ViewportEntity } from '../../src/core/model';
import { PAPER_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';

const dec = (d: Uint8Array): string => new TextDecoder().decode(d);
const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

/** 새 도면 + 배치의 뷰포트 하나(핸들 3A — 143차 시험과 같은 꼴, 이 앱이 만든 뷰포트처럼 음영 플롯 칸 없음) */
function vpDoc(): CadDocument {
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
    flags: 32864,
    frozenLayers: [],
    renderMode: 0,
    ucsPerViewport: false,
  } as ViewportEntity;
  doc.blocks.get(PAPER_SPACE)!.entities.push(vp);
  return doc;
}

// DWG는 배치의 뷰포트가 하나면 번호 1로 읽으므로 핸들로 찾는다
const vpOf = (doc: CadDocument) => doc.blocks.get(PAPER_SPACE)!.entities.find((e) => e.type === 'VIEWPORT' && e.handle.toUpperCase() === '3A') as ViewportEntity;
const modeOf = (doc: CadDocument): unknown => (vpOf(doc) as { shadePlotMode?: unknown }).shadePlotMode;

/** DXF 글의 VIEWPORT마다(핸들) 170 값들. set을 주면 그 값으로 바꾼 글도 돌려준다 */
function vpTags(text: string, set?: number): { map: Record<string, number[]>; text: string } {
  const lines = text.split('\r\n');
  const map: Record<string, number[]> = {};
  let inVp = false;
  let cur: number[] | null = null;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i]!.trim());
    const v = lines[i + 1]!;
    if (code === 0) {
      inVp = v === 'VIEWPORT';
      cur = null;
      continue;
    }
    if (inVp && code === 5) cur = map[v.trim().toUpperCase()] = [];
    if (cur && code === 170) {
      if (set !== undefined) lines[i + 1] = String(set);
      cur.push(Number(lines[i + 1]));
    }
  }
  return { map, text: lines.join('\r\n') };
}

/** AutoCAD가 그 음영 플롯 방식으로 둔 것처럼 170을 바꾼 R2018 DXF */
function autocadLike(mode: number): Uint8Array {
  const out = vpTags(dec(writeDxf(vpDoc(), { version: 'AC1032' }).data), mode);
  // 바꾼 자리가 뷰포트 하나의 170 하나인지 — 시험 도면이 맞는지
  expect(out.map).toEqual({ '3A': [mode] });
  return enc(out.text);
}

describe('뷰포트 음영 플롯 방식 170(228차)', () => {
  it('DXF 리더가 170(1 와이어프레임·2 숨김·3 렌더)을 읽고, DXF(R2004·R2018)로 다시 쓰고 읽어도 같은 값이다', () => {
    for (const mode of [1, 2, 3]) {
      const src = readDxf(autocadLike(mode));
      // 전에는 읽지 않아 undefined
      expect(modeOf(src), `${mode}`).toBe(mode);
      for (const version of ['AC1018', 'AC1032'] as const) {
        const text = dec(writeDxf(src, { version }).data);
        // 전에는 0 상수
        expect(vpTags(text).map['3A'], `${mode} ${version}`).toEqual([mode]);
        expect(modeOf(readDxf(enc(text))), `${mode} ${version}`).toBe(mode);
      }
    }
  });

  it('DWG(R2004·R2010·R2018)로 쓰고 읽어도 같은 값이고, 그 DWG를 다시 DXF로 써도 남는다', () => {
    const src = readDxf(autocadLike(2));
    for (const version of ['AC1018', 'AC1024', 'AC1032'] as const) {
      const back = readDwg(writeDwg(src, { version }).data);
      // 전에는 DWG 리더가 BS를 버리고 쓰기가 0
      expect(modeOf(back), version).toBe(2);
      expect(vpTags(dec(writeDxf(back, { version: 'AC1018' }).data)).map['3A'], version).toEqual([2]);
    }
  });

  it('참조서 범위 밖 값(4·5 — 핸들과 함께여야 뜻이 섬, 9·−1)은 칸을 두지 않고 전처럼 0으로 쓴다', () => {
    for (const mode of [4, 5, 9, -1]) {
      const src = readDxf(autocadLike(mode));
      expect(modeOf(src), `${mode}`).toBeUndefined();
      expect(vpTags(dec(writeDxf(src, { version: 'AC1032' }).data)).map['3A'], `${mode}`).toEqual([0]);
      const back = readDwg(writeDwg(src, { version: 'AC1032' }).data);
      expect(modeOf(back), `${mode}`).toBeUndefined();
      expect(vpTags(dec(writeDxf(back, { version: 'AC1032' }).data)).map['3A'], `${mode}`).toEqual([0]);
    }
  });

  it('값이 없는(만든) 뷰포트·0은 전과 같이 170 0이고 칸이 생기지 않으며, R2000·R12(그 칸이 없는 판)에는 쓰지 않는다', () => {
    const doc = vpDoc();
    for (const version of ['AC1018', 'AC1032'] as const) expect(vpTags(dec(writeDxf(doc, { version }).data)).map['3A'], version).toEqual([0]);
    for (const version of ['AC1018', 'AC1032'] as const) {
      // 0을 읽어도 칸이 생기지 않는다(만든 뷰포트와 다시 읽은 뷰포트의 모델이 같음)
      expect('shadePlotMode' in vpOf(readDwg(writeDwg(doc, { version }).data)), version).toBe(false);
      expect('shadePlotMode' in vpOf(readDxf(writeDxf(doc, { version }).data)), version).toBe(false);
    }
    const src = readDxf(autocadLike(2));
    expect(vpTags(dec(writeDxf(src, { version: 'AC1015' }).data)).map['3A']).toEqual([]);
    expect(vpTags(dec(writeDxf(src, { version: 'AC1009' }).data)).map['3A']).toEqual([]);
    const r2000 = readDwg(writeDwg(src, { version: 'AC1015' }).data);
    expect(modeOf(r2000)).toBeUndefined();
    expect(vpTags(dec(writeDxf(r2000, { version: 'AC1032' }).data)).map['3A']).toEqual([0]);
  });
});
