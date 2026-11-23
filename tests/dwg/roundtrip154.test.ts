/**
 * 표 레코드의 표준 플래그 70(154차).
 * DXF 참조서 LTYPE·APPID·UCS·VPORT·DIMSTYLE: 하위 클래스 표지(AcDb…TableRecord)와 이름(2) 바로 뒤의 70이 표준 플래그다
 * (16 외부 참조 의존, 32 의존 외부 참조가 해결됨, 64 참조됨). DXF 쓰기는 이 자리에 70을 쓰는데, 리더의 표 레코드 공통 풀기는 하위 클래스 표지 앞의 70(R12 꼴)만 담아
 * R2000+ DXF에서는 이 다섯 표의 플래그를 잃었다(LAYER·STYLE·VIEW는 표마다 따로 읽음). 그래서 XATTACH가 만든 의존 선종류·치수 스타일(`참조|이름`, 48)이
 * DXF로 저장하고 다시 열면 0이 되고, 그 문서의 DWG 출력에서 외부 참조 의존 비트가 빠졌다(같은 파일의 의존 도면층·문자 스타일은 남음).
 * DIMSTYLE은 R2007+에서 뒤에 다른 뜻의 70(이 앱 쓰기·ezdxf 견본은 69 다음의 DIMTFILLCLR)이 더 있어, 표 고유 하위 클래스의 첫 태그인 70만 플래그로 본다.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CadDocument, Linetype, TableRecordBase } from '../../src/core/model';
import { tableKey } from '../../src/core/model';
import { createNewDocument } from '../../src/core/newdoc';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';

/** 의존(16)·해결됨(32) — XATTACH가 붙이는 값(edit/blkcmds/xref.ts) */
const DEP = 16 | 32;

function docWithDeps(): CadDocument {
  const doc = createNewDocument('metric');
  const el = (length: number) => ({ length, flags: 0, scale: 1, rotation: 0, offset: { x: 0, y: 0 } });
  const lt: Linetype = { name: 'X|DASHED', handle: '', flags: DEP, description: '__ __', patternLength: 1, elements: [el(0.5), el(-0.5)] };
  doc.linetypes.set(tableKey(lt.name), lt);
  const std = doc.dimStyles.get('STANDARD')!;
  doc.dimStyles.set(tableKey('X|ISO'), { name: 'X|ISO', handle: '', flags: DEP, vars: { ...std.vars, DIMTFILL: 2, DIMTFILLCLR: 5 } });
  doc.ucs.set(tableKey('X|FRONT'), { name: 'X|FRONT', handle: '', flags: DEP, origin: { x: 1, y: 2, z: 0 }, xAxis: { x: 1, y: 0, z: 0 }, yAxis: { x: 0, y: 0, z: 1 } });
  doc.appIds.set(tableKey('X|APP'), { name: 'X|APP', handle: '', flags: DEP });
  doc.vports.push({ ...doc.vports[0]!, name: 'X|TILE', handle: '', flags: DEP });
  return doc;
}

/** 다섯 표의 의존 레코드 플래그 */
function depFlags(doc: CadDocument): Record<string, number | undefined> {
  return {
    LTYPE: doc.linetypes.get('X|DASHED')?.flags,
    DIMSTYLE: doc.dimStyles.get('X|ISO')?.flags,
    UCS: doc.ucs.get('X|FRONT')?.flags,
    APPID: doc.appIds.get('X|APP')?.flags,
    VPORT: doc.vports.find((v) => v.name === 'X|TILE')?.flags,
  };
}
const all = (v: number) => ({ LTYPE: v, DIMSTYLE: v, UCS: v, APPID: v, VPORT: v });

const DXF = ['AC1009', 'AC1015', 'AC1018', 'AC1021', 'AC1024', 'AC1027', 'AC1032'] as const;

const SUB: Record<string, string> = { LTYPE: 'AcDbLinetypeTableRecord', DIMSTYLE: 'AcDbDimStyleTableRecord', UCS: 'AcDbUCSTableRecord', APPID: 'AcDbRegAppTableRecord', VPORT: 'AcDbViewportTableRecord' };
const NAME: Record<string, string> = { LTYPE: 'X\\|DASHED', DIMSTYLE: 'X\\|ISO', UCS: 'X\\|FRONT', APPID: 'X\\|APP', VPORT: 'X\\|TILE' };

describe('표 레코드의 표준 플래그 70(154차)', () => {
  it('DXF로 쓴 다섯 표의 70을 다시 읽는다(R12는 전에도 읽음, 쓰기 꼴은 전과 같음)', () => {
    for (const version of DXF) {
      const out = writeDxf(docWithDeps(), { version }).data;
      const text = new TextDecoder().decode(out);
      for (const t of Object.keys(SUB)) {
        // 쓰기: 이름 바로 뒤 70(R2000+는 하위 클래스 표지 뒤 — DXF 참조서 차례)
        const head = version === 'AC1009' ? `\\r\\n${t}\\r\\n(?:.*\\r\\n)*?` : `${SUB[t]}\\r\\n`;
        expect(text, `${version} ${t}`).toMatch(new RegExp(`${head}\\s*2\\r\\n${NAME[t]}\\r\\n\\s*70\\r\\n\\s*48\\r\\n`));
      }
      expect(depFlags(readDxf(out)), version).toEqual(all(DEP));
    }
  });

  it('DIMSTYLE의 둘째 70(R2007+ 69 다음)은 플래그로 보지 않는다', () => {
    const doc = docWithDeps();
    doc.dimStyles.set('PLAIN', { name: 'Plain', handle: '', flags: 0, vars: { ...doc.dimStyles.get('STANDARD')!.vars, DIMTFILL: 2, DIMTFILLCLR: 5 } });
    const out = writeDxf(doc, { version: 'AC1032' }).data;
    // 쓰기 꼴: 이름 뒤 70 플래그, 69 다음 70(DIMTFILLCLR)
    expect(new TextDecoder().decode(out)).toMatch(/AcDbDimStyleTableRecord\r\n\s*2\r\nX\|ISO\r\n\s*70\r\n\s*48\r\n(?:.*\r\n)*?\s*69\r\n\s*2\r\n\s*70\r\n\s*5\r\n/);
    const back = readDxf(out);
    expect(back.dimStyles.get('X|ISO')!.flags).toBe(DEP);
    expect(back.dimStyles.get('PLAIN')!.flags).toBe(0);
    expect(back.dimStyles.get('X|ISO')!.vars.DIMTFILL).toBe(2);

    // 다른 프로그램이 쓴 꼴(DXF 참조서 차례): 플래그 70이 없고 치수 변수 뒤에만 70이 있으면 플래그는 0, 선종류의 이름 뒤 70은 플래그
    const tags = [
      '0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1032', '0', 'ENDSEC',
      '0', 'SECTION', '2', 'TABLES',
      '0', 'TABLE', '2', 'LTYPE', '5', '5', '330', '0', '100', 'AcDbSymbolTable', '70', '1',
      '0', 'LTYPE', '5', '30', '330', '5', '100', 'AcDbSymbolTableRecord', '100', 'AcDbLinetypeTableRecord', '2', 'R|HIDDEN', '70', '48', '3', 'Hidden', '72', '65', '73', '0', '40', '0.0',
      '0', 'ENDTAB',
      '0', 'TABLE', '2', 'DIMSTYLE', '5', 'A', '330', '0', '100', 'AcDbSymbolTable', '70', '1', '100', 'AcDbDimStyleTable', '71', '1', '340', '31',
      '0', 'DIMSTYLE', '105', '31', '330', 'A', '100', 'AcDbSymbolTableRecord', '100', 'AcDbDimStyleTableRecord', '2', 'NOFLAG', '40', '1.0', '69', '2', '70', '5', '71', '0',
      '0', 'ENDTAB', '0', 'ENDSEC', '0', 'EOF', '',
    ];
    const hand = readDxf(new TextEncoder().encode(tags.join('\n')));
    expect(hand.linetypes.get('R|HIDDEN')!.flags).toBe(DEP);
    expect(hand.dimStyles.get('NOFLAG')!.flags).toBe(0);
    expect(hand.dimStyles.get('NOFLAG')!.vars.DIMTFILL).toBe(2);
  });

  it('DXF에서 연 의존 레코드를 DWG로 쓰면 의존 비트가 남고, DWG → DXF → DWG도 같다', () => {
    const x = readDxf(writeDxf(docWithDeps(), { version: 'AC1032' }).data);
    // DWG 공통 머리에는 의존 비트(16)만 있다(32는 없음)
    for (const version of ['AC1015', 'AC1018', 'AC1032'] as const) expect(depFlags(readDwg(writeDwg(x, { version }).data)), version).toEqual(all(16));
    const d1 = readDwg(writeDwg(docWithDeps(), { version: 'AC1032' }).data);
    expect(depFlags(d1)).toEqual(all(16));
    const x2 = readDxf(writeDxf(d1, { version: 'AC1032' }).data);
    expect(depFlags(x2)).toEqual(all(16));
    for (const version of ['AC1015', 'AC1032'] as const) expect(depFlags(readDwg(writeDwg(x2, { version }).data)), version).toEqual(all(16));
  });

  it('저장소 견본 DXF(R2018, 표 레코드 70이 모두 0)는 전과 같다', () => {
    const doc = readDxf(readFileSync(new URL('../../public/samples/opencad-sample.dxf', import.meta.url)));
    const recs: TableRecordBase[] = [...doc.linetypes.values(), ...doc.dimStyles.values(), ...doc.ucs.values(), ...doc.appIds.values(), ...doc.vports];
    expect(doc.dimStyles.size).toBeGreaterThan(1);
    expect(recs.filter((r) => r.flags !== 0).map((r) => r.name)).toEqual([]);
  });
});
