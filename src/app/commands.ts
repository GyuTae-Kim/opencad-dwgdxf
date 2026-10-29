/** 1단계 명령: 보기·조회·도면층·파일 */
import { type Entity, tableKey } from '../core/model';
import { entityPath } from '../edit/geom/path';
import { flattenPiece, pathLength, pathSignedArea, pieceSize } from '../edit/geom/curve';
import { type MassProps, type RegionLoop, massPropsOfGroups, regionGroups, ringLoop, wiresToRings } from '../edit/geom/massprop';
import { baseName, download } from './export';
import { formatAngle, formatLength, unitAbbr } from '../core/units';
import { ccwSweep } from '../geom/curves';
import type { App, CommandContext, PointResult } from './app';
import { CancelError } from './app';
import { type LayerPatch, patchLayers } from './layers';
import { type ListFrame, entityLength, entityProperties, hatchArea, ringArea, ringPerimeter, typeName, zeroish } from './inquiry';
import type { Pt } from './view';
import { h } from './ui/dom';
import { type MeasureFormat, angleResult, areaResult, distance3d, distanceResult, pointResult, radiusResult } from './measure-result';
import { currentUcs, dirToUcs, toUcs } from './ucs';
import { displayDirection } from './polar';
import { type MultiHost, measureMultiple } from './distmulti';
import { polyPreview } from './draw';
import type { ViewportSnap } from './snap';
import type { ViewportXf } from './scene';
import { type PaperPick, paperProjection, projectedDelta } from './vpsnap';
import { parseZoomFactor } from './vpzoom';

function pointOf(r: PointResult): Pt | null {
  return 'point' in r ? r.point : null;
}

async function needPoint(ctx: CommandContext, prompt: string, base?: Pt | null): Promise<Pt> {
  for (;;) {
    const r = await ctx.getPoint(prompt, { base });
    if ('enter' in r) throw new CancelError();
    const p = pointOf(r);
    if (p) return p;
  }
}

/** 조회 명령(DIST·MEASUREGEOM 거리·ID)의 점: 평면 좌표와 그 Z */
type Pt3 = Pt & { z: number };

/**
 * 점 결과의 Z: 좌표에 준 Z(x,y,z·@ 상대 좌표·점 필터), 객체에 잡힌 스냅 점의 Z(snapZ — OSNAPZ 0, 1이면 고도), 아니면 지금 고도
 * (도움말 DIST: Z를 생략한 점은 지금 고도. ID: 3D 객체에 스냅하면 Z는 그 객체의 고른 지점의 Z)
 */
function point3(app: App, r: Extract<PointResult, { point: Pt }>): Pt3 {
  return { x: r.point.x, y: r.point.y, z: r.z !== undefined && Number.isFinite(r.z) ? r.z : app.elevation() };
}

/** 다음 점 요청의 기준점: 고도가 아닌 Z면 함께(@ 상대 좌표·동적 입력·직접 거리가 그 Z를 잇는다 — LINE과 같다) */
function base3(app: App, p: Pt3): Pt & { z?: number } {
  return p.z !== app.elevation() ? p : { x: p.x, y: p.y };
}

async function needPoint3(app: App, ctx: CommandContext, prompt: string, base?: Pt3): Promise<Pt3> {
  for (;;) {
    const r = await ctx.getPoint(prompt, { base: base ? base3(app, base) : null, snapZ: true });
    if ('enter' in r) throw new CancelError();
    if ('point' in r) return point3(app, r);
  }
}

/** DIST의 첫 점: 도면 공간에서는 뷰포트에 보이는 모형 객체에도 스냅하고 그 스냅(투영 거리)을 함께 */
async function needDistPoint(app: App, ctx: CommandContext, prompt: string): Promise<{ p: Pt3; vp: ViewportSnap | null }> {
  for (;;) {
    const r = await ctx.getPoint(prompt, { snapZ: true, viewportSnaps: true });
    if ('enter' in r) throw new CancelError();
    if ('point' in r) return { p: point3(app, r), vp: r.snap?.viewport ?? null };
  }
}

/**
 * 도면 공간 DIST의 투영 뷰포트(vpsnap.ts — 도움말 DIST: 단일 뷰포트에 보이는 모형 공간 객체에 객체 스냅을 쓰면 화면과 나란한 평면에
 * 투영한 2D 모형 공간 거리). 배치의 도면 공간이고 점이 모두 같은 뷰포트 하나의 모형 스냅일 때만, 아니면 null
 */
function distProjection(app: App, pts: readonly PaperPick[]): ViewportXf | null {
  return paperProjection(app.active!, pts);
}

const VP_LOCKED_MSG = '화면표시가 잠긴 뷰포트는 축척을 바꾸지 않습니다.';

/**
 * ZOOM 축척 입력(도움말 ZOOM 축척): nX는 현재 뷰에 대해(MSPACE면 뷰포트 가운데를 두고), nXP는 도면 공간 단위에 대해 — 뷰포트 안 모형
 * 공간이면 뷰포트 축척을 n으로(화면표시가 잠긴 뷰포트는 축척을 바꾸지 않는다), 뷰포트 밖이면 이전처럼 nX.
 * 접미사 없는 n(도면 한계에 대해)은 아직 nX처럼 다룬다
 */
function zoomByFactor(app: App, ctx: CommandContext, f: { n: number; unit: '' | 'x' | 'xp' }): void {
  if (f.unit === 'xp') {
    const r = app.view.zoomPaperScale(f.n);
    if (r === 'locked') ctx.print(VP_LOCKED_MSG, 'err');
    if (r !== 'none') return;
  }
  app.view.zoomCenter(f.n);
}

/** LIST가 일반 특성 가운데 보이는 것(도움말 LIST: BYLAYER가 아닐 때의 색상·선종류·선가중치·투명도, 0이 아닌 두께) */
const LIST_GENERAL = new Set(['색상', '선종류', '선가중치', '투명도', '두께']);

const L = (app: App, v: number) => formatLength(v, app.active!.units);
const area = (app: App, v: number) => {
  const u = app.active!.units;
  return formatLength(v, { lunits: u.lunits === 3 || u.lunits === 4 ? 2 : u.lunits, luprec: u.luprec });
};
const unitSuffix = (app: App) => {
  const a = unitAbbr(app.active!.units.insunits);
  return a ? ` ${a}` : '';
};
/** 측정 결과 값(휴대폰 보기 모드의 결과 카드)을 명령행 글과 같은 단위 형식으로 */
const measureFormat = (app: App): MeasureFormat => ({
  length: (v) => L(app, v),
  angle: (a) => formatAngle(a, app.active!.units),
  area: (v) => area(app, v),
  unit: unitSuffix(app),
});

export function registerCommands(app: App): void {
  // ------------------------------------------------------------- 화면
  app.register({
    name: 'ZOOM',
    aliases: ['Z'],
    title: '확대/축소',
    transparent: true,
    async run(ctx, arg) {
      const kws = [
        { key: 'A', label: '전체' },
        { key: 'C', label: '중심' },
        { key: 'E', label: '범위' },
        { key: 'P', label: '이전' },
        { key: 'W', label: '윈도우' },
        { key: 'O', label: '객체' },
        { key: 'S', label: '축척' },
      ];
      let r: PointResult = arg ? { keyword: arg.toUpperCase() } : await ctx.getPoint('윈도우 구석 지정, 축척 비율(nX 또는 nXP) 입력, 또는 [전체(A)/중심(C)/범위(E)/이전(P)/윈도우(W)/객체(O)/축척(S)] <실시간>:', { keywords: kws, allowText: true });
      if ('text' in r) {
        const f = parseZoomFactor(r.text);
        if (f) {
          zoomByFactor(app, ctx, f);
          return;
        }
        r = { keyword: r.text.toUpperCase() };
      }
      if ('enter' in r) {
        ctx.print('휠을 굴리거나 가운데 버튼으로 끌어 확대·이동하십시오.');
        return;
      }
      if ('point' in r) {
        const a = r.point;
        const b = await needPoint(ctx, '반대 구석 지정:', a);
        app.view.zoomRect(a.x, a.y, b.x, b.y);
        return;
      }
      const k = (r as { keyword: string }).keyword;
      if (k === 'A' || k === 'E') app.view.zoomExtents();
      else if (k === 'P') {
        if (!app.view.zoomPrevious()) ctx.print('이전 화면이 없습니다.');
      } else if (k === 'W') {
        const a = await needPoint(ctx, '첫 번째 구석 지정:');
        const b = await needPoint(ctx, '반대 구석 지정:', a);
        app.view.zoomRect(a.x, a.y, b.x, b.y);
      } else if (k === 'O') {
        const hs = await app.selectedOrPick(ctx);
        zoomToHandles(app, hs);
      } else if (k === 'C') {
        // 도움말 ZOOM 중심: 중심점과 배율 또는 높이(높이가 작을수록 크게). 배율은 축척과 같은 nX·nXP, Enter는 지금 높이
        const c = await needPoint(ctx, '중심점 지정:');
        const cur = app.view.viewHeight();
        for (;;) {
          const t = await ctx.getPoint(`배율 또는 높이 입력 <${L(app, cur)}>:`, { allowText: true });
          if ('enter' in t) {
            app.view.zoomCenterAt(c.x, c.y);
            return;
          }
          if (!('text' in t)) continue;
          const f = parseZoomFactor(t.text);
          if (!f) {
            ctx.print('0보다 큰 값을 입력하십시오.', 'err');
            continue;
          }
          let height = f.unit === 'x' ? cur / f.n : f.n;
          if (f.unit === 'xp') {
            const vp = app.view.msViewport();
            if (vp?.locked) {
              ctx.print(VP_LOCKED_MSG, 'err');
              return;
            }
            // 뷰포트 안이면 뷰포트 축척 n(뷰 높이 = 뷰포트 높이 ÷ n), 밖이면 이전처럼 nX
            height = vp ? vp.height / f.n : cur / f.n;
          }
          app.view.zoomCenterAt(c.x, c.y, height);
          return;
        }
      } else if (k === 'S') {
        const t = await ctx.getPoint('축척 비율 입력(nX 또는 nXP):', { allowText: true });
        if ('text' in t) {
          const f = parseZoomFactor(t.text);
          if (f) zoomByFactor(app, ctx, f);
        }
      }
    },
  });
  app.register({ name: 'ZOOMEXTENTS', aliases: ['ZE'], title: '범위 줌', transparent: true, run: () => app.view.zoomExtents() });
  app.register({ name: 'ZOOMPREVIOUS', aliases: ['ZP'], title: '이전 화면', transparent: true, run: () => void app.view.zoomPrevious() });
  app.register({ name: 'ZOOMIN', title: '확대', transparent: true, run: () => app.view.zoomCenter(2) });
  app.register({ name: 'ZOOMOUT', title: '축소', transparent: true, run: () => app.view.zoomCenter(0.5) });
  app.register({
    name: 'PAN',
    aliases: ['P'],
    title: '초점이동',
    transparent: true,
    async run(ctx) {
      ctx.print('가운데 버튼으로 끌거나, 두 점을 찍어 이동합니다.');
      const a = await needPoint(ctx, '기준점 지정:');
      const b = await needPoint(ctx, '두 번째 점 지정:', a);
      // 배율은 그대로(MSPACE면 그 뷰포트의 뷰를 옮긴다 — 이전에는 화면 크기 창을 뷰포트에 맞춰 축소했다)
      app.view.panWorld(b.x - a.x, b.y - a.y);
    },
  });
  app.register({
    name: 'REGEN',
    aliases: ['RE', 'REGENALL', 'REA'],
    title: '재생성',
    async run() {
      // FIELDEVAL 재생성 비트(fieldcmds는 app.ts와 순환하므로 동적으로)
      (await import('./fieldcmds')).updateFieldsOn(app, 'regen');
      app.active?.touchLayers();
      app.view.requestRender();
    },
  });

  // ------------------------------------------------------------- 조회
  app.register({
    name: 'DIST',
    aliases: ['DI'],
    title: '거리',
    // 도움말 DIST: 투명 사용('DIST) — 다른 명령의 프롬프트에서 재고 그 명령으로 돌아간다. 단추·메뉴로 시작하면 이전처럼 앞 명령을 끝낸다
    quotedTransparent: true,
    async run(ctx) {
      // 배치의 도면 공간에서는 뷰포트에 보이는 모형 객체에도 스냅하고, 두 점이 같은 뷰포트 하나의 모형 스냅이면 투영 거리(vpsnap.ts)
      const { p: a, vp: va } = await needDistPoint(app, ctx, '첫 번째 점 지정:');
      // <다중 점>은 기본값(Enter — 도움말 용어집: 꺾쇠 괄호 안 값은 Enter로 받는 기본값), M도 같다
      for (;;) {
        const r = await ctx.getPoint('두 번째 점 지정 또는 <다중 점>:', { base: base3(app, a), snapZ: true, viewportSnaps: true, keywords: [{ key: 'M', label: '다중 점' }] });
        if ('point' in r) {
          const b = point3(app, r);
          const vb = r.snap?.viewport ?? null;
          const vx = distProjection(app, [
            { p: a, viewport: va },
            { p: b, viewport: vb },
          ]);
          return reportDistance(app, ctx, a, b, vx && va && vb ? projectedDelta(vx, va.model, vb.model) : undefined);
        }
        if ('enter' in r || 'keyword' in r) return multiDistance(app, ctx, a, { vp: va });
      }
    },
  });
  app.register({
    name: 'MEASUREGEOM',
    aliases: ['MEA'],
    title: '측정',
    async run(ctx, arg) {
      const kws = [
        { key: 'D', label: '거리' },
        { key: 'R', label: '반지름' },
        { key: 'A', label: '각도' },
        { key: 'AR', label: '면적' },
        { key: 'X', label: '종료' },
      ];
      let mode = (arg ?? 'D').toUpperCase();
      for (;;) {
        if (mode === 'X') return;
        if (mode === 'D') {
          const r = await ctx.getPoint('첫 번째 점 지정 또는 [거리(D)/반지름(R)/각도(A)/면적(AR)/종료(X)] <거리>:', { keywords: kws, snapZ: true });
          if ('keyword' in r) {
            mode = r.keyword;
            continue;
          }
          if ('enter' in r) return;
          if (!('point' in r)) continue;
          const a = point3(app, r);
          // 도움말 MEASUREGEOM 거리: 다중 점은 이어지는 점 사이 거리의 누적 합계
          for (;;) {
            const r2 = await ctx.getPoint('두 번째 점 지정 또는 [다중 점(M)]:', { base: base3(app, a), snapZ: true, keywords: [{ key: 'M', label: '다중 점' }] });
            if ('enter' in r2) throw new CancelError();
            if ('point' in r2) reportDistance(app, ctx, a, point3(app, r2));
            else if ('keyword' in r2) await multiDistance(app, ctx, a);
            else continue;
            break;
          }
          continue;
        }
        if (mode === 'R') {
          const r = await ctx.getEntity('호 또는 원 선택 [거리(D)/각도(A)/면적(AR)/종료(X)]:', kws);
          if ('keyword' in r) {
            mode = r.keyword;
            continue;
          }
          if ('enter' in r) return;
          const e = app.entity(r.handle);
          const rad = e?.type === 'CIRCLE' || e?.type === 'ARC' ? e.radius : null;
          if (rad === null) ctx.print('호나 원이 아닙니다.', 'err');
          else ctx.print(`반지름 = ${L(app, rad)}${unitSuffix(app)}\n지름 = ${L(app, rad * 2)}${unitSuffix(app)}`, 'res', radiusResult(measureFormat(app), rad));
          continue;
        }
        if (mode === 'A') {
          await measureAngle(app, ctx);
          mode = 'D';
          continue;
        }
        if (mode === 'AR') {
          await measureArea(app, ctx);
          mode = 'D';
          continue;
        }
        mode = 'D';
      }
    },
  });
  app.register({
    name: 'MASSPROP',
    title: '질량 특성',
    async run(ctx) {
      const hs = await ctx.getSelection('객체 선택:');
      const { groups, skipped } = massGroups(hs.map((h) => app.entity(h)));
      if (skipped) ctx.print(`영역이나 닫힌 객체가 아닌 ${skipped}개는 뺐습니다(3D 솔리드는 2D에서 잴 수 없습니다).`);
      const mp = massPropsOfGroups(groups);
      if (!mp) {
        ctx.print('잴 영역이 없습니다. 영역(REGION)이나 닫힌 객체를 고르십시오.', 'err');
        return;
      }
      const lines = massPropLines(app, mp);
      for (const l of lines) ctx.print(l, 'res');
      const w = await ctx.getPoint('분석 결과를 파일에 쓰시겠습니까? [예(Y)/아니요(N)] <아니요>:', { keywords: [{ key: 'Y', label: '예' }, { key: 'N', label: '아니요' }] });
      if ('keyword' in w && w.keyword === 'Y') download(new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/plain' }), `${baseName(app.active!.saveName)}.mpr`);
    },
  });
  // ACIS 영역을 만드는 명령: 형상(ACIS 자료)을 새로 써야 해서 아직 하지 않는다 — 무엇을 대신 쓸지 알린다
  for (const name of ['REGION', 'UNION', 'SUBTRACT', 'INTERSECT']) {
    app.register({
      name,
      aliases: name === 'REGION' ? ['REG'] : name === 'UNION' ? ['UNI'] : name === 'SUBTRACT' ? ['SU'] : ['IN'],
      title: name === 'REGION' ? '영역' : name === 'UNION' ? '합집합' : name === 'SUBTRACT' ? '차집합' : '교집합',
      async run(ctx) {
        ctx.print(`${name}은(는) ACIS 형상(영역)을 새로 만들어야 해서 이 웹 버전에서는 아직 할 수 없습니다. 닫힌 경계는 BOUNDARY(폴리선)로 만들고, 면적·도심·관성 모멘트는 MASSPROP으로 구하십시오. 열린 도면의 영역은 모서리를 그리고 잴 수 있습니다.`, 'err');
      },
    });
  }
  app.register({
    name: 'AREA',
    aliases: ['AA'],
    title: '면적',
    run: (ctx) => measureArea(app, ctx),
  });
  app.register({
    name: 'MEASUREANGLE',
    aliases: ['ANG'],
    title: '각도 측정',
    run: (ctx) => measureAngle(app, ctx),
  });
  app.register({
    name: 'MEASURERADIUS',
    title: '반지름 측정',
    run: (ctx) => app.run('MEASUREGEOM', 'R').then(() => void ctx),
  });
  app.register({
    name: 'ID',
    title: '점 좌표',
    async run(ctx) {
      // AutoCAD 도움말 ID: 지정한 자리의 UCS 좌표 X·Y·Z를 보이고 그 점을 마지막 점으로 둔다. 3D 객체에 스냅하면 Z는 그 객체의 고른 지점의 Z.
      // 스냅이 없고 Z를 주지 않은 점은 지금 고도(ELEV). 이 앱의 UCS는 평면 안의 원점·회전뿐이라 Z는 WCS Z 그대로
      const p = await needPoint3(app, ctx, '점 지정:');
      const q = toUcs(currentUcs(app.active), p);
      const pu = { x: zeroish(q.x), y: zeroish(q.y) };
      ctx.print(`X = ${L(app, pu.x)}     Y = ${L(app, pu.y)}     Z = ${L(app, p.z)}`, 'res', pointResult(measureFormat(app), pu.x, pu.y, p.z));
      app.view.overlay.marks = [{ p: { x: p.x, y: p.y }, text: `${L(app, pu.x)}, ${L(app, pu.y)}` }];
      app.view.requestOverlay();
      // 명령이 끝나도 표시를 잠시 남긴다(DIST처럼 — 휴대폰 보기 모드에서 어디를 쟀는지 보이게)
      persistMarks(app);
    },
  });
  app.register({
    name: 'LIST',
    aliases: ['LI', 'LS'],
    title: '리스트',
    async run(ctx) {
      const hs = await app.selectedOrPick(ctx);
      const st = app.active!;
      // AutoCAD 도움말 LIST: 위치는 현재 UCS 기준 X·Y·Z, 색상·선종류·선가중치·투명도는 BYLAYER가 아닐 때, 두께는 0이 아닐 때,
      // 돌출 방향은 현재 UCS의 Z축과 다를 때 UCS 좌표로. 이 앱의 UCS는 평면 안의 원점·회전뿐이라 Z는 WCS Z 그대로(ID와 같다)
      const ucs = currentUcs(st);
      const frame: ListFrame = { point: (p) => ({ ...toUcs(ucs, p), z: p.z }), dir: (v) => ({ ...dirToUcs(ucs, v), z: v.z }) };
      let total = 0;
      let n = 0;
      for (const hd of hs.slice(0, 200)) {
        const e = app.entity(hd);
        if (!e) continue;
        ctx.print(`${typeName(e)}  도면층: "${e.layer}"  공간: ${st.isModel ? '모형 공간' : '도면 공간'}  핸들 = ${e.handle}`, 'res');
        const [general, ...groups] = entityProperties(st.doc, e, st.units, frame);
        for (const row of general!.rows) if (LIST_GENERAL.has(row.k) && !/^bylayer$/i.test(row.v)) ctx.print(`    ${row.k}: ${row.v}`);
        for (const g of groups) for (const row of g.rows) ctx.print(`    ${row.k}: ${row.v}`);
        const len = entityLength(e);
        if (len !== null) {
          total += len;
          n++;
        }
      }
      if (hs.length > 200) ctx.print(`… ${hs.length - 200}개는 생략`);
      if (n > 1) ctx.print(`길이 합계(${n}개) = ${L(app, total)}${unitSuffix(app)}`, 'res');
    },
  });
  app.register({
    name: 'PROPERTIES',
    aliases: ['PR', 'PROPS', 'CH', 'MO', 'DDMODIFY'],
    title: '특성',
    run: () => app.ui.openPalette('props'),
  });
  app.register({
    name: 'SELECTALL',
    aliases: ['AI_SELALL'],
    title: '모두 선택',
    run: () => {
      const st = app.active!;
      const scene = st.scenes.get(st.space);
      if (!scene) return;
      const visible = scene.entities.filter((b) => {
        const e = st.doc.entityIndex.get(b.handle);
        const l = e ? st.layers.get(tableKey(e.layer)) : undefined;
        return !l || (l.on && !l.frozen);
      });
      app.setSelection(visible.map((b) => b.handle));
      app.cmd.print(`${visible.length}개를 선택했습니다.`);
    },
  });
  app.register({
    name: 'FIND',
    title: '문자 찾기',
    run: () => app.ui.openPalette('find'),
  });
  app.register({
    name: 'DIMLIST',
    aliases: ['DIMLST'],
    title: '치수 목록',
    run: () => app.ui.openPalette('dims'),
  });
  // ------------------------------------------------------------- 도면층
  app.register({ name: 'LAYER', aliases: ['LA', 'DDLMODES'], title: '도면층 특성', run: () => app.ui.openPalette('layers') });
  app.register({
    name: 'LAYOFF',
    title: '도면층 끄기',
    async run(ctx) {
      for (;;) {
        const r = await ctx.getEntity('끌 도면층의 객체 선택:');
        if (!('handle' in r)) return;
        const e = app.entity(r.handle)!;
        setLayer(app, e.layer, { on: false });
        ctx.print(`도면층 "${e.layer}"을(를) 껐습니다.`);
      }
    },
  });
  app.register({
    name: 'LAYFRZ',
    title: '도면층 동결',
    async run(ctx) {
      for (;;) {
        const r = await ctx.getEntity('동결할 도면층의 객체 선택:');
        if (!('handle' in r)) return;
        const e = app.entity(r.handle)!;
        setLayer(app, e.layer, { frozen: true });
        ctx.print(`도면층 "${e.layer}"을(를) 동결했습니다.`);
      }
    },
  });
  app.register({
    name: 'LAYON',
    title: '모든 도면층 켜기',
    run: (ctx) => {
      patchLayers(app, 'LAYON', [...app.active!.doc.layers.values()].map((l) => [l.name, { off: false }]));
      ctx.print('모든 도면층을 켰습니다.');
    },
  });
  app.register({
    name: 'LAYTHW',
    title: '모든 도면층 동결 해제',
    run: (ctx) => {
      patchLayers(app, 'LAYTHW', [...app.active!.doc.layers.values()].map((l) => [l.name, { frozen: false }]));
      ctx.print('모든 도면층의 동결을 풀었습니다.');
    },
  });
  app.register({
    name: 'LAYISO',
    title: '도면층 격리',
    async run(ctx) {
      const hs = await app.selectedOrPick(ctx, '격리할 도면층의 객체 선택:');
      const keep = new Set(hs.map((x) => tableKey(app.entity(x)?.layer ?? '')));
      const st = app.active!;
      isoSaved.set(st.docId, new Map([...st.doc.layers].map(([k, l]) => [k, !l.off])));
      patchLayers(app, 'LAYISO', [...st.doc.layers].map(([k, l]) => [l.name, { off: !keep.has(k) }]));
      app.clearSelection();
      ctx.print(`도면층 ${keep.size}개만 남기고 껐습니다. LAYUNISO로 되돌립니다.`);
    },
  });
  app.register({
    name: 'LAYUNISO',
    title: '도면층 격리 해제',
    run: (ctx) => {
      const st = app.active!;
      const saved = isoSaved.get(st.docId);
      if (!saved) {
        ctx.print('격리한 도면층이 없습니다.');
        return;
      }
      patchLayers(app, 'LAYUNISO', [...saved].filter(([k]) => st.doc.layers.has(k)).map(([k, on]) => [st.doc.layers.get(k)!.name, { off: !on }]));
      isoSaved.delete(st.docId);
      ctx.print('도면층 격리를 풀었습니다.');
    },
  });

  // ------------------------------------------------------------- 표시
  app.register({
    name: 'LWDISPLAY',
    aliases: ['LWEIGHT', 'LW'],
    title: '선가중치 표시',
    transparent: true,
    noDoc: true,
    run: (ctx) => {
      app.view.lwDisplay = !app.view.lwDisplay;
      for (const d of app.docs) d.touchLayers();
      app.view.requestRender();
      app.ui.refreshStatus();
      ctx.print(`선가중치 표시 ${app.view.lwDisplay ? '켜기' : '끄기'}`);
    },
  });
  app.register({
    name: 'BACKGROUND',
    aliases: ['BG'],
    title: '배경색 전환',
    transparent: true,
    noDoc: true,
    run: () => {
      app.view.modelBg = app.view.modelBg === 0xffffff ? 0x212830 : 0xffffff;
      for (const d of app.docs) d.touchLayers();
      app.view.requestRender();
      app.ui.refreshStatus();
    },
  });
  app.register({ name: 'ORTHO', title: '직교 켜기/끄기', transparent: true, noDoc: true, run: () => app.toggleOrtho() });
  app.register({
    name: 'MODEL',
    aliases: ['TILEMODE'],
    title: '모형 탭',
    run: () => app.setSpace('*Model_Space'),
  });
}

const isoSaved = new Map<number, Map<string, boolean>>();

export function changedLayers(app: App): void {
  app.active?.touchLayers();
  app.view.requestRender();
  app.ui.refreshPalette();
}

export function setLayer(app: App, name: string, change: { on?: boolean; frozen?: boolean; locked?: boolean }): void {
  const patch: LayerPatch = {};
  if (change.on !== undefined) patch.off = !change.on;
  if (change.frozen !== undefined) patch.frozen = change.frozen;
  if (change.locked !== undefined) patch.locked = change.locked;
  patchLayers(app, 'LAYER', [[name, patch]]);
}

export function zoomToHandles(app: App, hs: string[]): void {
  const pk = app.picker();
  if (!pk || !hs.length) return;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const hd of hs) {
    const b = pk.box(hd);
    if (!b) continue;
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
  }
  if (!(minX <= maxX)) return;
  const pad = Math.max(maxX - minX, maxY - minY, 1e-6) * 0.15;
  app.view.zoomRect(minX - pad, minY - pad, maxX + pad, maxY + pad);
}

/**
 * DIST·MEASUREGEOM 거리의 결과 두 줄. AutoCAD 도움말 DIST: 모형 공간에서는 3D 거리이고 X·Y·Z 증분과 각도를 현재 UCS 기준으로 잰다.
 * Z를 생략한 점은 지금 고도(point3). 배치의 도면 공간에서는 2D 거리(도면 공간 단위)라 Z를 보지 않는다.
 * projected: 도면 공간에서 단일 뷰포트의 모형 객체 두 점을 화면과 나란한 평면에 투영한 증분(모형 단위, 화면 축 — vpsnap.ts projectedDelta).
 * 주면 그 값을 지금 UCS(도면 공간 UCS)로 돌려 거리·증분·각도로 쓴다(도움말에는 거리만 있어 증분·각도의 기준은 이 앱이 정했다)
 */
function reportDistance(app: App, ctx: CommandContext, a: Pt3, b: Pt3, projected?: Pt): void {
  const st = app.active!;
  // XY 평면에서의 각도는 도면 단위의 0 방향(ANGBASE)에서 양의 방향(ANGDIR)으로(측량 단위는 방위 — polar.ts displayDirection).
  // 이 앱의 UCS는 평면 안의 원점·회전뿐이라 UCS의 Z 증분은 WCS Z 증분과 같다
  const du = dirToUcs(currentUcs(st), projected ?? { x: b.x - a.x, y: b.y - a.y });
  // 투영 증분은 뷰 비틀기·UCS로 돌린 값이라 축과 나란한 선의 다른 증분이 계산 끝자리만큼 남는다 — 0으로
  const tiny = projected ? 1e-12 * Math.hypot(du.x, du.y) : 0;
  const dx = Math.abs(du.x) <= tiny ? 0 : du.x;
  const dy = Math.abs(du.y) <= tiny ? 0 : du.y;
  let dz = st.isModel ? b.z - a.z : 0;
  // 같은 높이로 보이는 두 점(스냅 Z의 계산 끝자리)은 0
  if (Math.abs(dz) <= 1e-12 * Math.max(1, Math.abs(a.z), Math.abs(b.z))) dz = 0;
  const { d, rise } = distance3d(dx, dy, dz);
  const u = st.units;
  const ang = displayDirection(Math.atan2(dy, dx), u);
  // XY 평면으로부터의 각도: 기운 각도라 측량 단위(방위)가 아니라 도/분/초로
  const riseText = formatAngle(rise, u.aunits === 4 ? { aunits: 1, auprec: u.auprec } : u);
  // 두 줄이 같은 값을 단다(결과 카드는 한 덩어리로 묶는다)
  const m = distanceResult(measureFormat(app), dx, dy, dz, ang);
  ctx.print(`거리 = ${L(app, d)}${unitSuffix(app)},  XY 평면에서의 각도 = ${formatAngle(ang, u)},  XY 평면으로부터의 각도 = ${riseText}`, 'res', m);
  ctx.print(`X 증분 = ${L(app, dx)},  Y 증분 = ${L(app, dy)},  Z 증분 = ${L(app, dz)}`, 'res', m);
  app.view.overlay.marks = [
    { p: a },
    { p: b, text: `${L(app, d)}${unitSuffix(app)}` },
  ];
  app.view.overlay.rubber = [{ pts: [a.x, a.y, b.x, b.y] }];
  persistMarks(app);
}

/**
 * DIST·MEASUREGEOM 거리의 다중 점(distmulti.ts): 끝나면 지나온 경로와 누적 거리를 잠시 남긴다.
 * dist를 주면 DIST(도면 공간에서 뷰포트 안 모형 객체 스냅과 투영 거리 — vp는 첫 점의 뷰포트 안 모형 스냅)
 */
async function multiDistance(app: App, ctx: CommandContext, first: Pt3, dist?: { vp: ViewportSnap | null }): Promise<void> {
  const flat = !app.active!.isModel;
  const host: MultiHost = { point3: (r) => point3(app, r), base: (p) => base3(app, p), length: (v) => L(app, v), unit: unitSuffix(app), flat };
  if (dist) host.projection = (pts) => distProjection(app, pts)?.k ?? null;
  const { vs, total } = await measureMultiple(ctx, first, host, dist?.vp ?? null);
  if (vs.length < 2) return;
  const end = vs[vs.length - 1]!;
  app.view.overlay.marks = [{ p: first }, { p: end, text: `${L(app, total)}${unitSuffix(app)}` }];
  app.view.overlay.rubber = [{ pts: polyPreview(vs, false) }];
  persistMarks(app);
}

/** 명령이 끝나도 결과 표시를 잠시 남긴다 */
function persistMarks(app: App): void {
  const o = app.view.overlay;
  const marks = o.marks;
  const rub = o.rubber;
  setTimeout(() => {
    if (!app.busyCommand) {
      o.marks = marks;
      o.rubber = rub;
      app.view.requestOverlay();
      setTimeout(() => {
        if (o.marks === marks && !app.busyCommand) {
          o.marks = [];
          o.rubber = [];
          app.view.requestOverlay();
        }
      }, 6000);
    }
  });
}

async function measureAngle(app: App, ctx: CommandContext): Promise<void> {
  const r = await ctx.getEntity('호, 원, 선을 선택하거나 <정점 지정>:');
  const u = app.active!.units;
  if ('handle' in r) {
    const e = app.entity(r.handle)!;
    if (e.type === 'ARC') {
      const sweep = ccwSweep(e.startAngle, e.endAngle);
      ctx.print(`각도 = ${formatAngle(sweep, u)}`, 'res', angleResult(measureFormat(app), sweep));
      return;
    }
    if (e.type === 'LINE') {
      const r2 = await ctx.getEntity('두 번째 선 선택:');
      if (!('handle' in r2)) return;
      const f = app.entity(r2.handle)!;
      if (f.type !== 'LINE') {
        ctx.print('선이 아닙니다.', 'err');
        return;
      }
      const a1 = Math.atan2(e.end.y - e.start.y, e.end.x - e.start.x);
      const a2 = Math.atan2(f.end.y - f.start.y, f.end.x - f.start.x);
      let d = Math.abs(a2 - a1) % Math.PI;
      if (d > Math.PI / 2) d = Math.PI - d;
      ctx.print(`각도 = ${formatAngle(d, u)}  (보각 ${formatAngle(Math.PI - d, u)})`, 'res', angleResult(measureFormat(app), d, true));
      return;
    }
    if (e.type === 'CIRCLE') {
      const c = e.center;
      const p1 = r.point;
      const p2 = await needPoint(ctx, '각도의 두 번째 끝점 지정:', c);
      const a0 = Math.abs(Math.atan2(p2.y - c.y, p2.x - c.x) - Math.atan2(p1.y - c.y, p1.x - c.x));
      const a = a0 > Math.PI ? Math.PI * 2 - a0 : a0;
      ctx.print(`각도 = ${formatAngle(a, u)}`, 'res', angleResult(measureFormat(app), a));
      return;
    }
    ctx.print('호, 원, 선을 선택하십시오.', 'err');
    return;
  }
  if ('keyword' in r) return;
  const v = await needPoint(ctx, '각도 정점 지정:');
  const p1 = await needPoint(ctx, '각도의 첫 번째 끝점 지정:', v);
  const p2 = await needPoint(ctx, '각도의 두 번째 끝점 지정:', v);
  let a = Math.abs(Math.atan2(p2.y - v.y, p2.x - v.x) - Math.atan2(p1.y - v.y, p1.x - v.x));
  if (a > Math.PI) a = Math.PI * 2 - a;
  ctx.print(`각도 = ${formatAngle(a, u)}`, 'res', angleResult(measureFormat(app), a));
}

/** 객체의 면적·둘레(열린 곡선은 현으로 닫은 면적과 곡선 길이, AutoCAD AREA와 같다). 잴 수 없으면 null */
export function objectArea(e: Entity): { a: number | null; per: number | null } | null {
  if (e.type === 'HATCH' || e.type === 'MPOLYGON') return { a: hatchArea(e), per: null };
  if (e.type === 'REGION') {
    const mp = massPropsOfGroups(regionGroups(e));
    return mp ? { a: Math.abs(mp.area), per: mp.perimeter } : null;
  }
  if (e.type === 'XLINE' || e.type === 'RAY') return null;
  const path = entityPath(e);
  if (!path || !path.pieces.length) return null;
  // 직선 하나(LINE 등)는 면적이 없다
  if (path.pieces.length === 1 && path.pieces[0]!.k === 'line' && !path.closed) return null;
  return { a: Math.abs(pathSignedArea(path)), per: pathLength(path) };
}

/**
 * MASSPROP이 재는 묶음: REGION은 하나씩(ACIS 모서리의 정확한 곡선, 같은 면의 안쪽 고리만 구멍 — 서로 다른 영역은 AutoCAD처럼 더한다),
 * 닫힌 객체(원·닫힌 폴리선·타원·닫힌 스플라인)는 함께 하나의 영역으로(안에 든 것은 구멍 — 영역을 만들지 못하는 이 앱의 대신 쓰는 방법)
 */
export function massGroups(ents: readonly (Entity | null | undefined)[]): { groups: RegionLoop[][]; skipped: number } {
  const groups: RegionLoop[][] = [];
  const curves: RegionLoop[] = [];
  let skipped = 0;
  for (const e of ents) {
    if (e?.type === 'REGION') {
      const g = regionGroups(e);
      if (g.length) groups.push(...g);
      else skipped++;
      continue;
    }
    const r = e ? entityRings(e) : null;
    if (r) curves.push(...r.map(ringLoop));
    else skipped++;
  }
  if (curves.length) groups.push(curves);
  return { groups, skipped };
}

/** MASSPROP·면적이 쓰는 닫힌 고리(REGION은 모서리 선을 이어서, 닫힌 곡선은 잘게 나눠서). 닫히지 않았으면 null */
export function entityRings(e: Entity): number[][] | null {
  if (e.type === 'REGION') {
    const r = wiresToRings(e.wires ?? []);
    return r.length ? r : null;
  }
  const path = entityPath(e);
  if (!path || !path.pieces.length || !path.closed) return null;
  let size = 0;
  for (const p of path.pieces) size = Math.max(size, pieceSize(p));
  // MASSPROP이 소수 넷째 자리까지 맞게(원 지름 10이면 면적 오차 약 2e-5)
  const tol = Math.max(size, 1e-9) * 1e-7;
  const ring: number[] = [];
  for (const p of path.pieces) {
    const f = flattenPiece(p, tol);
    for (let i = 0; i < f.length - 1; i++) ring.push(f[i]!.x, f[i]!.y);
  }
  return ring.length >= 6 ? [ring] : null;
}

/** MASSPROP 보고(AutoCAD 영역 형식) */
function massPropLines(app: App, mp: MassProps): string[] {
  const f = (v: number) => L(app, v);
  const ar = (v: number) => area(app, v);
  const n = (v: number) => (Math.abs(v) >= 1e6 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(4) : v.toFixed(4));
  return [
    '----------------   영역   ----------------',
    `면적:                    ${ar(Math.abs(mp.area))}`,
    `둘레:                    ${f(mp.perimeter)}`,
    `경계 상자:            X: ${f(mp.box[0])}  --  ${f(mp.box[2])}`,
    `                      Y: ${f(mp.box[1])}  --  ${f(mp.box[3])}`,
    `도심:                 X: ${f(mp.centroid[0])}`,
    `                      Y: ${f(mp.centroid[1])}`,
    `관성 모멘트:          X: ${n(Math.abs(mp.ix))}`,
    `                      Y: ${n(Math.abs(mp.iy))}`,
    `관성 곱:             XY: ${n(mp.ixy)}`,
    `회전 반경:            X: ${f(mp.rx)}`,
    `                      Y: ${f(mp.ry)}`,
    '도심 기준 주 모멘트와 X-Y 방향:',
    `                      I: ${n(Math.abs(mp.principal[0]!.i))} 방향 [${mp.principal[0]!.dir.map((v) => v.toFixed(4)).join(' ')}]`,
    `                      J: ${n(Math.abs(mp.principal[1]!.i))} 방향 [${mp.principal[1]!.dir.map((v) => v.toFixed(4)).join(' ')}]`,
  ];
}

async function measureArea(app: App, ctx: CommandContext): Promise<void> {
  // 더하기(A)·빼기(S) 모드: 잴 때마다 합계를 고친다. 첫 측정 전에는 객체(O) 하나를 재고 끝난다
  let mode: 'A' | 'S' | null = null;
  let total = 0;
  const fmt = measureFormat(app);
  const tally = (a: number) => {
    if (!mode) return;
    total += mode === 'A' ? a : -a;
    ctx.print(`총 면적 = ${area(app, total)}`, 'res', areaResult(fmt, total, null));
  };
  const report = (a: number | null, per: number | null) => {
    ctx.print(`면적 = ${a !== null ? area(app, a) : '-'},  둘레 = ${per !== null ? L(app, per) : '-'}`, 'res', areaResult(fmt, a, per));
    if (a !== null) tally(a);
  };
  for (;;) {
    const kws = mode
      ? [{ key: 'O', label: '객체' }, mode === 'A' ? { key: 'S', label: '면적 빼기' } : { key: 'A', label: '면적 추가' }, { key: 'X', label: '종료' }]
      : [
          { key: 'O', label: '객체' },
          { key: 'A', label: '면적 추가' },
          { key: 'S', label: '면적 빼기' },
        ];
    const prompt = mode
      ? `(${mode === 'A' ? '추가' : '빼기'} 모드) 첫 번째 구석점 지정 또는 [${kws.map((k) => `${k.label}(${k.key})`).join('/')}]:`
      : '첫 번째 구석점 지정 또는 [객체(O)/면적 추가(A)/면적 빼기(S)] <객체(O)>:';
    const r = await ctx.getPoint(prompt, { keywords: kws });
    if ('keyword' in r && (r.keyword === 'A' || r.keyword === 'S')) {
      mode = r.keyword;
      continue;
    }
    if (('keyword' in r && r.keyword === 'X') || ('enter' in r && mode)) {
      if (mode) ctx.print(`총 면적 = ${area(app, total)}`, 'res', areaResult(fmt, total, null));
      return;
    }
    if ('keyword' in r || 'enter' in r) {
      // 객체: 모드가 없으면 하나만, 더하기·빼기 모드면 Enter까지 이어서
      for (;;) {
        const er = await ctx.getEntity(mode ? `(${mode === 'A' ? '추가' : '빼기'} 모드) 객체 선택:` : '객체 선택:');
        if (!('handle' in er)) break;
        const e = app.entity(er.handle);
        const m = e ? objectArea(e) : null;
        if (!m) ctx.print('면적을 잴 수 없는 객체입니다.', 'err');
        else report(m.a, m.per);
        if (!mode) return;
      }
      if (!mode) return;
      continue;
    }
    const pts: number[] = [];
    let p: Pt | null = pointOf(r);
    while (p) {
      pts.push(p.x, p.y);
      const base = p;
      const r2 = await ctx.getPoint(pts.length >= 6 ? '다음 점 지정 <합계>:' : '다음 점 지정:', {
        base,
        rubber: (q) => [{ pts: [...pts, q.x, q.y], closed: true, fill: true }],
      });
      p = pointOf(r2);
    }
    if (pts.length < 6) {
      ctx.print('점이 3개 이상 필요합니다.', 'err');
      if (!mode) return;
      continue;
    }
    const a = Math.abs(ringArea(pts));
    const per = ringPerimeter(pts);
    report(a, per);
    app.view.overlay.rubber = [{ pts, closed: true, fill: true }];
    app.view.overlay.marks = [{ p: { x: pts[0]!, y: pts[1]! }, text: `면적 ${area(app, a)}` }];
    persistMarks(app);
    if (!mode) return;
  }
}

export { h };
