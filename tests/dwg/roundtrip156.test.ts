/**
 * MESH의 세분 단계 91(156차).
 * DXF 참조서 MESH 그룹 코드: 91은 72 다음의 "Number of subdivision level"이고, 모서리 주름 값(140) 뒤 재지정 묶음에서 "Sub-entity marker"로 다시 나온다
 * (92도 "Vertex count of level 0"과 "Count of property was overridden" 두 뜻). DXF 리더는 레코드 끝까지 91마다 세분 단계를 덮어 써서
 * 하위 객체(면 등)의 특성을 재지정한 MESH는 마지막 하위 객체 표지가 세분 단계가 됐고, 그 문서를 DXF·DWG로 저장하면 그 값을 세분 단계로 썼다.
 * DWG 리더는 세분 단계를 본문 맨 앞(판·접힘 혼합 다음)에서 읽고 모서리 뒤는 읽지 않는다. DXF 쓰기는 재지정 없이(90 0) 쓴다.
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, MeshEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { bytesOf, dxfText } from '../robust/corrupt35';

/** 사각형 면 하나(정점 4·면 1·모서리 4) */
const VERTS = [0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0];
const FACES = [4, 0, 1, 2, 3];
const EDGES = [0, 1, 1, 2, 2, 3, 3, 0];

/**
 * DXF 참조서 차례로 손으로 쓴 MESH(세분 단계 level). marker가 있으면 주름 값 뒤에 재지정 묶음 하나
 * (90 재지정한 하위 객체 수 1, 91 하위 객체 표지, 92 재지정한 특성 수 1, 90 특성 종류 0 = 색)
 */
const handDxf = (level: number, marker?: number): string[] => {
  const t = ['0', 'MESH', '5', '4D', '100', 'AcDbEntity', '8', '0', '100', 'AcDbSubDMesh', '71', '2', '72', '0', '91', String(level), '92', '4'];
  for (let i = 0; i < 4; i++) t.push('10', String(VERTS[i * 3]), '20', String(VERTS[i * 3 + 1]), '30', String(VERTS[i * 3 + 2]));
  t.push('93', String(FACES.length), ...FACES.flatMap((x) => ['90', String(x)]));
  t.push('94', '4', ...EDGES.flatMap((x) => ['90', String(x)]));
  t.push('95', '4', '140', '0', '140', '0', '140', '0', '140', '0');
  if (marker === undefined) t.push('90', '0');
  else t.push('90', '1', '91', String(marker), '92', '1', '90', '0');
  return t;
};

const meshOf = (doc: CadDocument): MeshEntity => [...doc.entityIndex.values()].find((e) => e.type === 'MESH') as MeshEntity;
const shape = (m: MeshEntity) => ({ subdivision: m.subdivision, verts: [...m.verts], faces: m.faceData, edges: m.edgePairs });

function appDoc(subdivision: number): CadDocument {
  const doc = createNewDocument('metric');
  const m = { ...entityDefaults(), type: 'MESH', handle: 'A1', verts: new Float64Array(VERTS), faceData: [...FACES], edgePairs: [...EDGES], subdivision } as MeshEntity;
  doc.blocks.get(MODEL_SPACE)!.entities.push(m);
  doc.entityIndex.set(m.handle, m);
  return doc;
}

describe('MESH의 세분 단계(91)와 재지정 묶음의 하위 객체 표지(156차)', () => {
  it('DXF 참조서 차례로 쓴 MESH: 재지정 묶음의 91(하위 객체 표지)은 세분 단계가 아니다', () => {
    // 전에는 세분 단계가 마지막 91(하위 객체 표지 7)이었다
    expect(shape(meshOf(readDxf(bytesOf(dxfText([handDxf(2, 7)])))))).toEqual({ subdivision: 2, verts: VERTS, faces: FACES, edges: EDGES });
    // 재지정 없는 MESH는 전과 같다
    expect(shape(meshOf(readDxf(bytesOf(dxfText([handDxf(2)])))))).toEqual({ subdivision: 2, verts: VERTS, faces: FACES, edges: EDGES });
  });

  it('재지정한 MESH를 DXF·DWG로 다시 저장해도 세분 단계가 그대로다', () => {
    const doc = readDxf(bytesOf(dxfText([handDxf(2, 7)])));
    for (const version of ['AC1024', 'AC1027', 'AC1032'] as const) {
      const out = writeDxf(doc, { version }).data;
      // 전에는 91에 하위 객체 표지(7)를 썼다
      expect(new TextDecoder().decode(out), version).toMatch(/AcDbSubDMesh\r\n\s*71\r\n\s*2\r\n\s*72\r\n\s*0\r\n\s*91\r\n\s*2\r\n/);
      expect(meshOf(readDxf(out)).subdivision, version).toBe(2);
      expect(meshOf(readDwg(writeDwg(doc, { version }).data)).subdivision, version).toBe(2);
    }
  });

  it('이 앱이 쓴 MESH(재지정 없음 — 90 0)는 쓰기 꼴과 다시 읽은 값이 전과 같다', () => {
    for (const version of ['AC1024', 'AC1032'] as const) {
      const out = writeDxf(appDoc(3), { version }).data;
      expect(new TextDecoder().decode(out), version).toMatch(/\s*95\r\n\s*4\r\n(?:\s*140\r\n\s*0\.0\r\n){4}\s*90\r\n\s*0\r\n/);
      expect(shape(meshOf(readDxf(out))), version).toEqual({ subdivision: 3, verts: VERTS, faces: FACES, edges: EDGES });
      expect(meshOf(readDwg(writeDwg(appDoc(3), { version }).data)).subdivision, version).toBe(3);
    }
  });
});
