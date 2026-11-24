/**
 * 198차: UCS 뷰(V)의 원점.
 * Autodesk UCS 도움말(2026) 뷰 절은 UCS의 XY 평면을 보는 방향에 수직인 평면에 맞추되 원점은 그대로 두고 X·Y축을 화면의 가로·세로로 둔다고 적는다
 * (표준(W)은 WCS로 되돌린다). 고치기 전에는 뷰(V)가 표준·Enter와 같은 갈래라 원점을 0,0으로 옮겼다.
 * 이 앱의 화면은 돌지 않는다(모형·도면 공간 모두, 비틀린 뷰포트는 모형 공간으로 들어갈 수 없다) — 화면의 가로·세로는 WCS X·Y라 축은 각도 0이다.
 * 원점이 0,0인 UCS의 뷰(V), 표준(W)·Enter, 이전(P), 프롬프트 글은 전과 같다.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PAPER_SPACE, tableKey } from '../../src/core/model';
import { registerUcsCommands } from '../../src/app/ucs';
import { browserGlobals } from '../polish/fakes';
import { makeApp, settle } from '../polish/real-app';
import type { DirectCommandLine } from '../direct/fakes';

vi.mock('../../src/app/view', async (orig) => ({ ...(await orig<object>()), CadView: (await import('../polish/fakes')).FakeView }));
vi.mock('../../src/app/commandline', async (orig) => ({ ...(await orig<object>()), CommandLine: (await import('../direct/fakes')).DirectCommandLine }));
vi.mock('../../src/app/engine', async (orig) => ({ ...(await orig<object>()), EngineClient: (await import('../polish/fakes')).FakeEngine }));
vi.mock('../../src/text/fonts', async (orig) => ({ ...(await orig<object>()), OutlineLibrary: (await import('../polish/fakes')).FakeFonts }));

beforeAll(() => {
  const g = browserGlobals();
  vi.stubGlobal('window', g.window);
  vi.stubGlobal('document', g.document);
});
afterAll(() => vi.unstubAllGlobals());

const PROMPT = 'UCS의 원점 지정 또는 [이름(NA)/객체(OB)/이전(P)/뷰(V)/표준(W)/Z] <표준>:';
const r9 = (n: number) => Math.round(n * 1e9) / 1e9 + 0;

function setup() {
  const h = makeApp();
  registerUcsCommands(h.app);
  const cl = h.cmd as unknown as DirectCommandLine;
  const type = async (...ts: string[]) => {
    for (const t of ts) {
      cl.type(t);
      await settle();
    }
  };
  const ucs = async (...ts: string[]) => {
    void h.app.run('UCS');
    await settle();
    await type(...ts);
  };
  /** 지금 공간의 UCS를 머리말에 바로 둔다(원점·X축 각도) */
  const put = (ox: number, oy: number, deg: number, paper = false) => {
    const a = (deg * Math.PI) / 180;
    const p = paper ? '$PUCS' : '$UCS';
    h.doc.header.set(`${p}ORG`, { x: ox, y: oy, z: 0 });
    h.doc.header.set(`${p}XDIR`, { x: Math.cos(a), y: Math.sin(a), z: 0 });
    h.doc.header.set(`${p}YDIR`, { x: -Math.sin(a), y: Math.cos(a), z: 0 });
  };
  /** 머리말 점(−0·반올림 찌꺼기를 지운 값) */
  const hv = (name: string) => {
    const v = h.doc.header.get(name) as { x: number; y: number; z?: number };
    return { x: r9(v.x), y: r9(v.y), z: r9(v.z ?? 0) };
  };
  const names = () => h.out().filter((t) => t.startsWith('현재 UCS 이름:'));
  return { ...h, cl, type, ucs, put, hv, names };
}

const c30 = r9(Math.cos(Math.PI / 6));
const s30 = r9(Math.sin(Math.PI / 6));

describe('UCS 뷰(V): 원점은 그대로, 축은 화면의 가로·세로', () => {
  it('모형: 원점 (50,20)·X축 30°인 UCS에서 V → 원점 (50,20)·X축 0°(이름 없음), 이름 저장(NA S)은 그 값, 이전(P)은 V 앞의 UCS', async () => {
    const h = setup();
    h.put(50, 20, 30);
    void h.app.run('UCS');
    await settle();
    expect(h.cmd.prompt).toBe(PROMPT);
    await h.type('V');
    expect(h.hv('$UCSORG')).toEqual({ x: 50, y: 20, z: 0 });
    expect(h.hv('$UCSXDIR')).toEqual({ x: 1, y: 0, z: 0 });
    expect(h.hv('$UCSYDIR')).toEqual({ x: 0, y: 1, z: 0 });
    expect(h.doc.header.get('$UCSNAME')).toBe('');
    expect(h.app.busyCommand).toBeFalsy();
    // 다음 UCS: 원점이 있어 표준이 아니다 → 이름 저장은 V 결과
    await h.ucs('NA', 'S', 'A1');
    expect(h.names().at(-1)).toBe('현재 UCS 이름: *이름 없음*');
    const rec = h.doc.ucs.get(tableKey('A1'))!;
    expect({ x: r9(rec.origin.x), y: r9(rec.origin.y) }).toEqual({ x: 50, y: 20 });
    expect({ x: r9(rec.xAxis.x), y: r9(rec.xAxis.y) }).toEqual({ x: 1, y: 0 });
    // 이전(P): V 앞의 UCS(원점 (50,20)·X축 30°)
    await h.ucs('P');
    expect(h.hv('$UCSORG')).toEqual({ x: 50, y: 20, z: 0 });
    expect(h.hv('$UCSXDIR')).toEqual({ x: c30, y: s30, z: 0 });
    expect(h.app.busyCommand).toBeFalsy();
  });

  it('도면 공간: $PUCSORG (100,50)·X축 45°에서 V → 원점 그대로·X축 0°, 모형 공간 UCS는 그대로', async () => {
    const h = setup();
    h.put(50, 20, 30);
    h.put(100, 50, 45, true);
    h.st.space = PAPER_SPACE;
    await h.ucs('V');
    expect(h.hv('$PUCSORG')).toEqual({ x: 100, y: 50, z: 0 });
    expect(h.hv('$PUCSXDIR')).toEqual({ x: 1, y: 0, z: 0 });
    expect(h.hv('$UCSORG')).toEqual({ x: 50, y: 20, z: 0 });
    expect(h.hv('$UCSXDIR')).toEqual({ x: c30, y: s30, z: 0 });
    expect(h.app.busyCommand).toBeFalsy();
  });
});

describe('전과 같은 꼴', () => {
  it('원점이 0,0인 돌린 UCS의 V는 표준(*표준*), 원점이 있는 UCS의 표준(W)·Enter는 원점 0,0·X축 0°', async () => {
    const h = setup();
    h.put(0, 0, 30);
    await h.ucs('V');
    expect(h.hv('$UCSORG')).toEqual({ x: 0, y: 0, z: 0 });
    expect(h.hv('$UCSXDIR')).toEqual({ x: 1, y: 0, z: 0 });
    await h.ucs('NA', 'S', 'B1');
    expect(h.names().at(-1)).toBe('현재 UCS 이름: *표준*');
    expect(h.doc.ucs.get(tableKey('B1'))!.origin).toEqual({ x: 0, y: 0, z: 0 });
    h.put(50, 20, 30);
    await h.ucs('W');
    expect(h.hv('$UCSORG')).toEqual({ x: 0, y: 0, z: 0 });
    expect(h.hv('$UCSXDIR')).toEqual({ x: 1, y: 0, z: 0 });
    h.put(50, 20, 30);
    await h.ucs('');
    expect(h.hv('$UCSORG')).toEqual({ x: 0, y: 0, z: 0 });
    expect(h.hv('$UCSXDIR')).toEqual({ x: 1, y: 0, z: 0 });
    expect(h.app.busyCommand).toBeFalsy();
  });
});
