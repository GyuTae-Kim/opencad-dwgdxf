/**
 * DWG에서 연 IMAGE의 IMAGEDEF_REACTOR(159차).
 * DXF 참조서: IMAGE 360 "Hard reference to imagedef_reactor object", IMAGEDEF_REACTOR 330 "Object ID for associated image object",
 * IMAGEDEF의 반응자 330은 이미지마다 하나. DXF 리더는 360을 imageDefReactor로 읽고 DWG 쓰기는 IMAGE 본문의 핸들 흐름에 그 반응자를 쓰는데,
 * DWG 리더는 비워 두어 DWG에서 연 이미지를 DWG로 다시 쓰면 반응자 참조가 0이 되고, DXF로 쓰면 원본 반응자를 버리고 새 핸들로 다시 만들었다.
 * DWG 리더는 반응자 객체의 소유자(공통 객체 머리)가 그 IMAGE인 것으로 잇는다(IMAGE 핸들 흐름의 배치에 기대지 않는다).
 */
import { describe, expect, it } from 'vitest';
import type { CadDocument, ImageDefObject, ImageEntity } from '../../src/core/model';
import { MODEL_SPACE, entityDefaults } from '../../src/core/model';
import { imageAttachOps } from '../../src/edit/blkcmds/attach';
import { copyEntity } from '../../src/edit/geom/query';
import { affTranslate } from '../../src/edit/geom/math';
import { applyOps } from '../../src/edit/session';
import { readDwg, writeDwg } from '../../src/io/dwg';
import { readDxf } from '../../src/io/dxf/reader';
import { writeDxf } from '../../src/io/dxf/writer';
import { setup } from '../util2/helpers';

type Ver = 'AC1018' | 'AC1024' | 'AC1027' | 'AC1032';

/** 같은 파일을 두 번 부착한 새 도면(정의 하나, 이미지·반응자 둘) */
function attached(): { doc: CadDocument; images: { h: string; reactor: string }[]; h: () => string } {
  const t = setup();
  const { handle: _h, ...props } = entityDefaults();
  const images: { h: string; reactor: string }[] = [];
  for (const x of [0, 50]) {
    const r = imageAttachOps(t.doc, { fileName: 'pic.png', widthPx: 40, heightPx: 30, space: MODEL_SPACE, insert: { x, y: 0, z: 0 }, width: 4, rotation: 0, props }, t.h);
    applyOps(t.doc, r.ops);
    images.push({ h: r.image.handle, reactor: r.image.imageDefReactor! });
  }
  return { doc: t.doc, images, h: t.h };
}

const img = (doc: CadDocument, h: string) => doc.entityIndex.get(h) as ImageEntity;

/** DXF 출력의 레코드(0 기준)를 [종류, 태그] 목록으로 */
function records(out: Uint8Array): { type: string; tags: [number, string][] }[] {
  const lines = new TextDecoder().decode(out).split(/\r?\n/);
  const recs: { type: string; tags: [number, string][] }[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i]!.trim());
    const value = lines[i + 1]!;
    if (code === 0) recs.push({ type: value, tags: [] });
    else recs.at(-1)?.tags.push([code, value]);
  }
  return recs;
}

const tag = (r: { tags: [number, string][] }, code: number) => r.tags.find((t) => t[0] === code)?.[1];

/** IMAGE 핸들 → 360, 반응자 핸들 → 소유자(첫 330) */
function links(out: Uint8Array): { image360: Map<string, string>; reactorOwner: Map<string, string> } {
  const image360 = new Map<string, string>();
  const reactorOwner = new Map<string, string>();
  for (const r of records(out)) {
    if (r.type === 'IMAGE') image360.set(tag(r, 5)!, tag(r, 360)!);
    else if (r.type === 'IMAGEDEF_REACTOR') reactorOwner.set(tag(r, 5)!, tag(r, 330)!);
  }
  return { image360, reactorOwner };
}

describe('DWG에서 연 IMAGE의 IMAGEDEF_REACTOR(159차)', () => {
  it('DWG로 쓰고 다시 열면 IMAGE가 제 반응자를 가리킨다', () => {
    const { doc, images } = attached();
    for (const version of ['AC1018', 'AC1024', 'AC1027', 'AC1032'] as Ver[]) {
      const back = readDwg(writeDwg(doc, { version }).data);
      for (const { h, reactor } of images) {
        // 전에는 DWG 리더가 비워 두었다(undefined)
        expect(img(back, h).imageDefReactor, version).toBe(reactor);
        const o = back.objects.get(reactor)!;
        expect(o.type, version).toBe('IMAGEDEF_REACTOR');
        expect(o.owner, version).toBe(h);
        expect((back.objects.get(img(back, h).imageDef!) as ImageDefObject).reactors, version).toContain(reactor);
      }
    }
  });

  it('DWG R2018에서 연 이미지를 DXF·다른 판 DWG로 저장해도 원본 반응자에 이어진다', () => {
    const { doc, images } = attached();
    const d18 = readDwg(writeDwg(doc, { version: 'AC1032' }).data);
    for (const version of ['AC1018', 'AC1032'] as Ver[]) {
      const r = writeDxf(d18, { version });
      expect(r.warnings.map((w) => w.code), version).not.toContain('handle.duplicate');
      expect(r.warnings.map((w) => w.code), version).not.toContain('object.orphan_dropped');
      const { image360, reactorOwner } = links(r.data);
      expect(reactorOwner.size, version).toBe(2);
      for (const { h, reactor } of images) {
        // 전에는 원본 반응자를 버리고 새 핸들로 다시 만들었다
        expect(image360.get(h), version).toBe(reactor);
        expect(reactorOwner.get(reactor), version).toBe(h);
        expect(img(readDxf(r.data), h).imageDefReactor, version).toBe(reactor);
      }
    }
    for (const version of ['AC1018', 'AC1024'] as Ver[]) {
      const back = readDwg(writeDwg(d18, { version }).data);
      for (const { h, reactor } of images) expect(img(back, h).imageDefReactor, version).toBe(reactor);
    }
  });

  it('복사한 IMAGE는 원본 반응자 핸들을 지니지 않고, DWG·DXF로 쓰면 반응자가 IMAGE마다 다르거나 없다', () => {
    const { doc, images, h } = attached();
    const src = img(doc, images[0]!.h);
    const r = copyEntity(src, affTranslate(0, 100), doc);
    const copy = r.add![0] as ImageEntity;
    // 전에는 복사본이 원본 반응자 핸들을 그대로 지녔다(반응자 객체의 소유자는 원본 IMAGE 하나)
    expect(copy.imageDefReactor).toBeUndefined();
    expect(src.imageDefReactor).toBe(images[0]!.reactor);
    copy.handle = h();
    applyOps(doc, [{ kind: 'add', block: MODEL_SPACE, entity: copy }]);
    const all = [...images.map((x) => x.h), copy.handle];
    const distinct = (list: (string | undefined)[]) => {
      const set = list.filter((x): x is string => !!x);
      expect(new Set(set).size).toBe(set.length);
    };
    for (const version of ['AC1024', 'AC1032'] as Ver[]) {
      const back = readDwg(writeDwg(doc, { version }).data);
      distinct(all.map((x) => img(back, x).imageDefReactor));
      expect(img(back, images[0]!.h).imageDefReactor, version).toBe(images[0]!.reactor);
      expect(img(back, copy.handle).imageDefReactor, version).toBeUndefined();
    }
    for (const version of ['AC1018', 'AC1032'] as Ver[]) {
      const w = writeDxf(doc, { version });
      // 전에는 두 IMAGE가 같은 반응자 핸들을 지녀 핸들 겹침을 알렸다
      expect(w.warnings.map((x) => x.code), version).not.toContain('handle.duplicate');
      const { image360, reactorOwner } = links(w.data);
      distinct(all.map((x) => image360.get(x)));
      expect(image360.get(images[0]!.h), version).toBe(images[0]!.reactor);
      // DXF 쓰기는 반응자 없는 IMAGE에 새 반응자를 만든다
      expect(reactorOwner.get(image360.get(copy.handle)!), version).toBe(copy.handle);
    }
  });

  it('반응자가 없는 IMAGE와 WIPEOUT은 DWG를 거쳐도 반응자를 갖지 않는다(전후 같음)', () => {
    const { doc, images, h } = attached();
    // 첫 이미지의 반응자를 지운 도면(정의의 반응자 목록에서도 뺀다)
    const first = img(doc, images[0]!.h);
    const def = doc.objects.get(first.imageDef!) as ImageDefObject;
    def.reactors = def.reactors!.filter((x) => x !== images[0]!.reactor);
    doc.objects.delete(images[0]!.reactor);
    delete first.imageDefReactor;
    const wh = h();
    const wipe: ImageEntity = {
      ...entityDefaults(),
      type: 'WIPEOUT',
      handle: wh,
      insert: { x: 100, y: 0, z: 0 },
      uVector: { x: 10, y: 0, z: 0 },
      vVector: { x: 0, y: 10, z: 0 },
      imageSize: { x: 1, y: 1 },
      displayFlags: 7,
      clipping: true,
      brightness: 50,
      contrast: 50,
      fade: 0,
      clipBoundaryType: 1,
      clipBoundary: [
        { x: -0.5, y: -0.5 },
        { x: 0.5, y: 0.5 },
      ],
    };
    doc.blocks.get(MODEL_SPACE)!.entities.push(wipe);
    doc.entityIndex.set(wh, wipe);
    for (const version of ['AC1024', 'AC1032'] as Ver[]) {
      const back = readDwg(writeDwg(doc, { version }).data);
      expect(img(back, images[0]!.h).imageDefReactor, version).toBeUndefined();
      expect(img(back, wh).type, version).toBe('WIPEOUT');
      expect(img(back, wh).imageDefReactor, version).toBeUndefined();
      expect([...back.objects.values()].filter((o) => o.type === 'IMAGEDEF_REACTOR').length, version).toBe(1);
    }
  });
});
