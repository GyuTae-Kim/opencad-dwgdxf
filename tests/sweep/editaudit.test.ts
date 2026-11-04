/**
 * 74차: 편집 명령 불변식 훑기 도구(scripts/sweep/editaudit.ts). 75차에 축척·클립보드·배열과 선택 기반 명령 13가지를 더했다. 공개 견본 도면으로 도구가 문제 없이 끝나는지와 인자 처리를 본다.
 * 실제 도면 훑기는 각자 로컬 목록으로 돌린다(`npm run edit-audit -- --list …`).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AUDIT_CASES, auditDoc, auditFile, editAuditMain } from '../../scripts/sweep/editaudit';
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
  });
});
