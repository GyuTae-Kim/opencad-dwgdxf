import { describe, expect, it } from 'vitest';
import { MODEL_SPACE, entityDefaults, type MeshEntity } from '../../src/core/model';
import { meshEdgeCount, meshEdges, meshFaceCount, meshFaces, meshVertexCount, meshVertices, packMesh } from '../../src/core/meshdata';
import { createNewDocument } from '../../src/core/newdoc';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { readDwg, writeDwg } from '../../src/io/dwg/index';

const P = (x: number, y: number, z = 0) => ({ x, y, z });

describe('MESH 평탄 자료', () => {
  const vertices = [P(0, 0), P(1, 0, -0), P(1, 1, 2), P(0, 1), P(0.5, 0.5, 1)];
  const faces = [[0, 1, 4], [1, 2, 3, 4], [], [3, 0, 4]];
  const edges: [number, number][] = [
    [0, 1],
    [1, 4],
  ];

  it('정점·면(빈 면 포함)·모서리가 그대로 돌아온다', () => {
    const m = packMesh(vertices, faces, edges);
    expect(m.faceData).toEqual([3, 0, 1, 4, 4, 1, 2, 3, 4, 0, 3, 3, 0, 4]);
    expect(m.edgePairs).toEqual([0, 1, 1, 4]);
    expect(meshVertices(m)).toEqual(vertices);
    expect(Object.is(meshVertices(m)[1]!.z, -0)).toBe(true);
    expect(meshFaces(m)).toEqual(faces);
    expect(meshEdges(m)).toEqual(edges);
    expect(meshVertexCount(m)).toBe(5);
    expect(meshFaceCount(m)).toBe(4);
    expect(meshEdgeCount(m)).toBe(2);
  });

  it('DXF R2018·DWG R2018 왕복에서 같다(R2000 DXF는 폴리페이스로 바꿔 쓴다)', () => {
    const doc = createNewDocument('metric');
    const blk = doc.blocks.get(MODEL_SPACE)!;
    const e: MeshEntity = { ...entityDefaults(), type: 'MESH', handle: '1B0', layer: '0', owner: blk.recordHandle, ...packMesh([P(0, 0), P(1, 0), P(1, 1, 2), P(0, 1), P(0.5, 0.5, 1)], faces.filter((f) => f.length), edges), subdivision: 1 };
    blk.entities.push(e);
    doc.entityIndex.set(e.handle, e);
    for (const back of [readDxf(writeDxf(doc, { version: 'AC1032' }).data), readDwg(writeDwg(doc, { version: 'AC1032' }).data)]) {
      const m = [...back.entityIndex.values()].find((x): x is MeshEntity => x.type === 'MESH')!;
      expect(meshVertices(m)).toEqual(meshVertices(e));
      expect(meshFaces(m)).toEqual(meshFaces(e));
      expect(meshEdges(m)).toEqual(meshEdges(e));
      expect(m.subdivision).toBe(1);
    }
    const r15 = readDxf(writeDxf(doc, { version: 'AC1015' }).data);
    expect([...r15.entityIndex.values()].some((x) => x.type === 'POLYLINE' && x.kind === 'polyface')).toBe(true);
  });
});
