/**
 * R2.x의 REPEAT…ENDREP(85차): 사이 객체를 열·행으로 되풀이하는 배열이다. ENDREP의 70은 열 수, 71은 행 수, 40은 열(X) 간격, 41은 행(Y) 간격이다
 * (공개 형식 설명 dwg_ac2_10.ksy, CC0 — 블록 참조 배열의 70·71과 같은 차례). LibreDWG R2.10 시험 도면은 점 (1,7) 하나를 "endrep 3 2 1 1"로
 * 되풀이했고, 그 도면의 범위 $EXTMAX의 Y가 8이라 행이 2개(Y 방향)다.
 * R2.10 뒤 판에는 이 객체가 없으므로 사이 객체를 익명 블록(*U)에 넣고 그 블록을 같은 열·행으로 배열한 블록 참조(MINSERT)로 바꾼다.
 */
import type { BlockDef, CadDocument, Entity, InsertEntity, UnknownEntity } from '../../core/model';
import { tableKey } from '../../core/model';

const isMarker = (e: Entity, t: string): e is UnknownEntity => e.type === 'UNKNOWN' && (e as UnknownEntity).originalType.toUpperCase() === t;

/** 원본 태그의 수 값(없거나 수가 아니면 def) */
function tagNum(e: UnknownEntity, code: number, def: number): number {
  const t = e.raw?.find((r) => r.code === code);
  const v = t === undefined ? NaN : Number(typeof t.value === 'string' ? t.value.trim() : t.value);
  return Number.isFinite(v) ? v : def;
}

/** 문서의 REPEAT…ENDREP을 배열 블록 참조로 바꾼다. 접은 표시는 unsupported(표시하지 않는 종류 수)에서 뺀다 */
export function foldRepeats(doc: CadDocument, unsupported: Map<string, number>): void {
  let next = 0;
  const anonName = () => {
    while (doc.blocks.has(tableKey(`*U${next}`))) next++;
    return `*U${next++}`;
  };
  const uncount = (t: string) => {
    const n = (unsupported.get(t) ?? 0) - 1;
    if (n > 0) unsupported.set(t, n);
    else unsupported.delete(t);
  };
  for (const b of [...doc.blocks.values()]) {
    const list = b.entities;
    if (!list.some((e) => isMarker(e, 'REPEAT'))) continue;
    const out: Entity[] = [];
    for (let i = 0; i < list.length; i++) {
      const rep = list[i]!;
      // 짝이 맞는 ENDREP(사이에 다른 REPEAT가 없다)이 있을 때만 접는다. 짝이 없으면 그대로 둔다
      let j = -1;
      if (isMarker(rep, 'REPEAT')) {
        for (let k = i + 1; k < list.length; k++) {
          if (isMarker(list[k]!, 'REPEAT')) break;
          if (isMarker(list[k]!, 'ENDREP')) {
            j = k;
            break;
          }
        }
      }
      if (j < 0) {
        out.push(rep);
        continue;
      }
      const end = list[j] as UnknownEntity;
      const name = anonName();
      const def: BlockDef = { name, handle: '', recordHandle: '', basePoint: { x: 0, y: 0, z: 0 }, flags: 1, entities: list.slice(i + 1, j) };
      doc.blocks.set(tableKey(name), def);
      const { originalType: _t, raw: _r, graphics: _g, ...base } = rep as UnknownEntity;
      const ins: InsertEntity = {
        ...base,
        type: 'INSERT',
        block: name,
        insert: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        rotation: 0,
        columnCount: Math.max(1, Math.round(tagNum(end, 70, 1))),
        rowCount: Math.max(1, Math.round(tagNum(end, 71, 1))),
        columnSpacing: tagNum(end, 40, 0),
        rowSpacing: tagNum(end, 41, 0),
        attribs: [],
      };
      out.push(ins);
      uncount('REPEAT');
      uncount('ENDREP');
      i = j;
    }
    b.entities = out;
  }
}
