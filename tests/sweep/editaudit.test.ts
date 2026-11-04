/**
 * 74차: 편집 명령 불변식 훑기 도구(scripts/sweep/editaudit.ts). 75차에 축척·클립보드·배열과 선택 기반 명령 13가지를, 76차에 배치(도면 공간) 훑기를,
 * 78차에 워커 문서 견주기를, 81차에 다시 하기 점검을 더했다. 공개 견본 도면으로 도구가 문제 없이 끝나는지와 인자 처리를 본다.
 * 실제 도면 훑기는 각자 로컬 목록으로 돌린다(`npm run edit-audit -- --list …`).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AUDIT_CASES, auditDoc, auditFile, chooseTarget, editAuditMain, pickable, workerDiff } from '../../scripts/sweep/editaudit';
import { MODEL_SPACE } from '../../src/core/model';
import { readDxf } from '../../src/io/dxf/reader';

const SAMPLE = 'public/samples/opencad-sample.dxf';

describe('편집 명령 불변식 훑기 도구', () => {
  it('견본 도면에서 명령 19가지가 문제 없이 끝난다(할 일이 없던 명령은 따로 센다)', async () => {
    const r = await auditFile(SAMPLE, new Uint8Array(readFileSync(SAMPLE)));
    expect([r.runs, AUDIT_CASES.length]).toEqual([19, 19]);
    expect(r.problems).toEqual([]);
    // 견본에는 중복 객체와 3D 객체가 없다
    expect(r.idle).toEqual(['-OVERKILL', 'FLATTEN']);
  });

  it('배치에서: 견본의 첫 배치에서 명령 19가지가 문제 없이 끝나고, 전체 용지 뷰포트는 고르지 않는다', async () => {
    const doc = readDxf(new Uint8Array(readFileSync(SAMPLE)));
    const t = chooseTarget(doc, 'paper')!;
    const lay = doc.layouts.find((l) => l.name === t.layout)!;
    expect(lay.blockName.toUpperCase()).toMatch(/^\*PAPER_SPACE/);
    const vps = doc.blocks.get(lay.blockName.toUpperCase())!.entities.filter((e) => e.type === 'VIEWPORT' && (e.id === 1 || e.handle === lay.viewport));
    expect(vps.length).toBeGreaterThan(0);
    expect(pickable(doc, t).filter((h) => vps.some((v) => v.handle === h))).toEqual([]);
    // auto는 모형 공간에 객체가 있으면 모형 공간
    expect(chooseTarget(doc, 'auto')).toEqual({ layout: null });
    const r = await auditFile(SAMPLE, new Uint8Array(readFileSync(SAMPLE)), AUDIT_CASES, 'paper');
    expect([r.layout, r.runs, r.problems]).toEqual([t.layout, 19, []]);
  });

  it('공간 고르기: 모형 공간이 비면 auto는 객체가 있는 첫 배치, model은 없음', () => {
    const doc = readDxf(new Uint8Array(readFileSync(SAMPLE)));
    doc.blocks.get(MODEL_SPACE)!.entities.length = 0;
    expect(chooseTarget(doc, 'model')).toBeNull();
    expect(chooseTarget(doc, 'auto')).toEqual(chooseTarget(doc, 'paper'));
    expect(chooseTarget(doc, 'auto')!.layout).not.toBeNull();
  });

  it('워커 문서 견주기(78차): 같으면 null, 차례·색인·바뀐 객체가 다르면 그 자리', () => {
    const a = readDxf(new Uint8Array(readFileSync(SAMPLE)));
    const b = readDxf(new Uint8Array(readFileSync(SAMPLE)));
    const ms = a.blocks.get(MODEL_SPACE)!.entities;
    expect(workerDiff(a, b, new Set(ms.map((e) => e.handle)))).toBeNull();
    const moved = { ...ms[0]!, layer: 'MOVED' };
    ms[0] = moved;
    a.entityIndex.set(moved.handle, moved);
    expect(workerDiff(a, b, new Set())).toBeNull();
    expect(workerDiff(a, b, new Set([moved.handle]))).toBe(`entity ${moved.handle}`);
    b.blocks.get(MODEL_SPACE)!.entities.pop();
    expect(workerDiff(a, b, new Set())).toMatch(/^\*MODEL_SPACE /);
  });

  it('문서 점검: 쓰이지 않는 익명 블록·블록 밖 색인·블록을 쓰는 객체', () => {
    const doc = readDxf(new Uint8Array(readFileSync(SAMPLE)));
    const a = auditDoc(doc);
    expect(a.stale).toBe(0);
    expect([...a.users.values()].every((k) => doc.blocks.has(k))).toBe(true);
    // 블록 밖에 남은 색인 항목이 있으면 센다
    doc.entityIndex.set('FFFFF', { type: 'LINE', handle: 'FFFFF' } as never);
    expect(auditDoc(doc).stale).toBe(1);
  });

  it('인자: 목록이 없으면 쓰는 법만, 모르는 인자는 2', async () => {
    const out: string[] = [];
    expect(await editAuditMain([], (s) => out.push(s))).toBe(0);
    expect(out.join('\n')).toContain('--list');
    expect(await editAuditMain(['--what'], () => undefined)).toBe(2);
    expect(await editAuditMain(['--space', 'layout'], () => undefined)).toBe(2);
  });
});
