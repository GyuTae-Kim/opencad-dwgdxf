/** 도형이 아닌 객체(사전, 배치, 각종 스타일 등) */
import type {
  CadObject,
  DictionaryObject,
  GroupObject,
  ImageDefObject,
  MLeaderStyleObject,
  MLineStyleObject,
  PlotSettings,
  RawTag,
  ScaleObject,
  SortEntsTableObject,
  SpatialFilterObject,
  UnderlayDefObject,
  Vec2,
  Vec3,
  XRecordObject,
} from '../../../core/model';
import { defaultPlotSettings } from '../../../core/finalize';
import { type BitReader, DwgFormatError, codesToString } from '../bitstream';
import { decodeCadEscapes } from '../../../core/codepage';
import { cmcToCad } from '../color';
import { cadColorToRaw } from '../../../core/color';
import { R2000, R2004, R2007, R2010, R2013, R2018 } from '../version';
import type { ObjectReader } from './reader';

export const hex = (h: number): string => (h > 0 ? h.toString(16).toUpperCase() : '');

/** 바이트 → 대문자 16진 두 글자(127차 — 바이트마다 toString·padStart·끝에 toUpperCase 하던 것과 같은 글) */
const HEX_BYTE: readonly string[] = Array.from({ length: 256 }, (_, b) => b.toString(16).padStart(2, '0').toUpperCase());

/** 배치 객체 원본(블록 레코드 이름은 나중에 푼다) */
export interface LayoutRaw {
  handle: number;
  name: string;
  tabOrder: number;
  flags: number;
  limitsMin: Vec2;
  limitsMax: Vec2;
  insertionBase: Vec3;
  extMin: Vec3;
  extMax: Vec3;
  elevation: number;
  ucsOrigin: Vec3;
  ucsXAxis: Vec3;
  ucsYAxis: Vec3;
  plot: PlotSettings;
  blockRecord: number;
  viewport: number;
  owner: number;
  xdict: number;
  reactors: number[];
}

/** MLINESTYLE 원본(선종류 번호·핸들은 나중에 푼다) */
export interface MLineStyleRaw extends MLineStyleObject {
  ltRefs: { index: number; handle: number }[];
}

function base(or: ObjectReader, type: string) {
  const h = or.h;
  const o: { type: string; handle: string; owner?: string; xdict?: string; reactors?: string[] } = { type, handle: hex(h.handle) };
  if (h.owner) o.owner = hex(h.owner);
  if (h.xdict) o.xdict = hex(h.xdict);
  if (h.reactors.length) o.reactors = h.reactors.map(hex);
  return o;
}

export function readDictionary(or: ObjectReader, withDefault: boolean): DictionaryObject {
  or.commonObject();
  const r = or.dat;
  const ver = or.ver;
  // 항목마다 핸들 하나가 핸들 흐름에 있다. 이름은 R2007+에서 문자열 흐름에 있어 자료 흐름으로 세면 큰 사전을 버린다
  const n = or.hdl.checkCount(r.BL(), 8);
  let cloning = 0;
  let hardOwner = false;
  if (ver === 1014) r.RC();
  if (ver >= R2000) {
    cloning = r.BS();
    hardOwner = r.RC() !== 0;
  }
  const names: string[] = [];
  for (let i = 0; i < n; i++) names.push(r.TV());
  const hr = or.hdl;
  const entries = new Map<string, string>();
  for (let i = 0; i < n; i++) {
    const h = hr.H(or.h.handle);
    entries.set(names[i], hex(h));
  }
  const d: DictionaryObject = { ...base(or, withDefault ? 'ACDBDICTIONARYWDFLT' : 'DICTIONARY'), entries, hardOwner, cloning } as DictionaryObject;
  if (withDefault && hr.pos + 8 <= hr.end) d.defaultHandle = hex(hr.H(or.h.handle));
  return d;
}

/** 플롯 설정(LAYOUT 앞부분, PLOTSETTINGS) */
function readPlotSettings(r: BitReader, ver: number): PlotSettings {
  const p = defaultPlotSettings();
  p.pageSetupName = r.TV();
  p.printerName = r.TV();
  p.flags = r.BS();
  p.margins = [r.BD(), r.BD(), r.BD(), r.BD()];
  p.paperWidth = r.BD();
  p.paperHeight = r.BD();
  p.paperName = r.TV();
  p.plotOrigin = r.BD2();
  p.paperUnits = r.BS();
  p.rotation = r.BS();
  p.plotType = r.BS();
  p.windowMin = r.BD2();
  p.windowMax = r.BD2();
  if (ver < R2004) r.T(); // 플롯 뷰 이름
  p.scaleNumerator = r.BD();
  p.scaleDenominator = r.BD();
  p.styleSheet = r.TV();
  p.standardScaleType = r.BS();
  r.BD(); // 축척 계수
  r.BD2(); // 용지 이미지 원점
  if (ver >= R2004) {
    // 음영 플롯 방식·해상도 수준·사용자 DPI(DXF 76~78 — 221차)
    p.shadePlotMode = r.BS();
    p.shadePlotResolution = r.BS();
    p.shadePlotDpi = r.BS();
  }
  return p;
}

export function readLayout(or: ObjectReader): LayoutRaw {
  or.commonObject();
  const r = or.dat;
  const ver = or.ver;
  const plot = readPlotSettings(r, ver);
  const name = decodeCadEscapes(r.TV());
  const tabOrder = r.BL();
  const flags = r.BS();
  const ucsOrigin = r.BD3();
  const limitsMin = r.RD2();
  const limitsMax = r.RD2();
  const insertionBase = r.BD3();
  const ucsXAxis = r.BD3();
  const ucsYAxis = r.BD3();
  const elevation = r.BD();
  r.BS();
  const extMin = r.BD3();
  const extMax = r.BD3();
  if (ver >= R2004) r.BL(); // 뷰포트 수(사양은 RL, 실제는 BL)
  const hr = or.hdl;
  const hb = or.h.handle;
  if (ver >= R2004) hr.H(hb); // 플롯 뷰
  if (ver >= R2007) hr.H(hb); // 시각 스타일
  const blockRecord = hr.H(hb);
  const viewport = hr.H(hb);
  return {
    handle: hb,
    name,
    tabOrder,
    flags,
    limitsMin,
    limitsMax,
    insertionBase,
    extMin,
    extMax,
    elevation,
    ucsOrigin,
    ucsXAxis,
    ucsYAxis,
    plot,
    blockRecord,
    viewport,
    owner: or.h.owner,
    xdict: or.h.xdict,
    reactors: [...or.h.reactors],
  };
}

export function readPlotSettingsObject(or: ObjectReader): CadObject {
  or.commonObject();
  const plot = readPlotSettings(or.dat, or.ver);
  return { ...base(or, 'PLOTSETTINGS'), plot } as CadObject;
}

export function readMLineStyle(or: ObjectReader): MLineStyleRaw {
  or.commonObject();
  const r = or.dat;
  const ver = or.ver;
  const name = decodeCadEscapes(r.TV());
  const description = r.TV();
  const f = r.BS();
  // DWG 비트 → DXF 비트
  const map: [number, number][] = [
    [1, 2],
    [2, 1],
    [16, 16],
    [32, 64],
    [64, 32],
    [256, 256],
    [512, 1024],
    [1024, 512],
  ];
  let flags = 0;
  for (const [a, b] of map) if (f & a) flags |= b;
  const fillColor = cmcToCad(r.CMC());
  const startAngle = r.BD();
  const endAngle = r.BD();
  const n = r.RC();
  const elements: MLineStyleObject['elements'] = [];
  const ltRefs: { index: number; handle: number }[] = [];
  for (let i = 0; i < n; i++) {
    const offset = r.BD();
    const color = cmcToCad(r.CMC());
    let index = -1;
    let handle = 0;
    if (ver < R2018) index = r.BS();
    else handle = or.hdl.H(or.h.handle);
    elements.push({ offset, color, linetype: 'ByLayer' });
    ltRefs.push({ index, handle });
  }
  return { ...base(or, 'MLINESTYLE'), name, flags, description, fillColor, startAngle, endAngle, elements, ltRefs } as MLineStyleRaw;
}

export function readImageDef(or: ObjectReader): ImageDefObject {
  or.commonObject();
  const r = or.dat;
  r.BL();
  const imageSize = r.RD2();
  const fileName = r.TV();
  const loaded = r.B() === 1;
  const resolutionUnits = r.RC();
  const pixelSize = r.RD2();
  return { ...base(or, 'IMAGEDEF'), fileName, imageSize, pixelSize, loaded, resolutionUnits } as ImageDefObject;
}

export function readUnderlayDef(or: ObjectReader, type: UnderlayDefObject['type']): UnderlayDefObject {
  or.commonObject();
  const r = or.dat;
  const fileName = r.TV();
  const name = r.TV();
  return { ...base(or, type), fileName, name } as UnderlayDefObject;
}

export function readSortEnts(or: ObjectReader): SortEntsTableObject {
  or.commonObject();
  const r = or.dat;
  const n = r.checkCount(r.BL(), 8);
  const sorts: number[] = [];
  for (let i = 0; i < n; i++) sorts.push(r.H());
  const hr = or.hdl;
  const blockRecord = hex(hr.H(or.h.handle));
  const entries: SortEntsTableObject['entries'] = [];
  for (let i = 0; i < n; i++) entries.push({ entity: hex(hr.H(or.h.handle)), sort: hex(sorts[i]) });
  return { ...base(or, 'SORTENTSTABLE'), blockRecord, entries } as SortEntsTableObject;
}

export function readGroup(or: ObjectReader): GroupObject {
  or.commonObject();
  const r = or.dat;
  const description = r.TV();
  const unnamed = r.BS() !== 0;
  const selectable = r.BS() !== 0;
  const n = r.checkCount(r.BL(), 0);
  const hr = or.hdl;
  hr.checkCount(n, 8);
  const entities: string[] = [];
  for (let i = 0; i < n; i++) entities.push(hex(hr.H(or.h.handle)));
  return { ...base(or, 'GROUP'), description, unnamed, selectable, entities } as GroupObject;
}

export function readScale(or: ObjectReader): ScaleObject {
  or.commonObject();
  const r = or.dat;
  r.BS();
  const name = r.TV();
  const paperUnits = r.BD();
  const drawingUnits = r.BD();
  const unitScale = r.B() === 1;
  return { ...base(or, 'SCALE'), name, paperUnits, drawingUnits, unitScale } as ScaleObject;
}

export function readSpatialFilter(or: ObjectReader): SpatialFilterObject {
  or.commonObject();
  const r = or.dat;
  const n = r.checkCount(r.BS(), 128);
  const boundary: Vec2[] = [];
  for (let i = 0; i < n; i++) boundary.push(r.RD2());
  const normal = r.BD3();
  const origin = r.BD3();
  const displayBoundary = r.BS() !== 0;
  const o: SpatialFilterObject = {
    ...base(or, 'SPATIAL_FILTER'),
    boundary,
    normal,
    origin,
    displayBoundary,
    inverseBlockTransform: [],
    clipTransform: [],
  } as SpatialFilterObject;
  if (r.BS()) o.frontClip = r.BD();
  if (r.BS()) o.backClip = r.BD();
  for (let i = 0; i < 12; i++) o.inverseBlockTransform.push(r.BD());
  for (let i = 0; i < 12; i++) o.clipTransform.push(r.BD());
  return o;
}

/**
 * isNewFormat: R2010+ 또는 ACAD_MLEADERVER 확장 자료가 있을 때(사양 20.4.87).
 * 모델에 칸이 없는 값(DXF 참조서 MLEADERSTYLE의 171·172·90·40·41·291·300·174~178·292·297·46·94·47·49·140·293·141·294·177·295·296·143·271~273)은
 * DXF에서 연 스타일처럼 원본 태그(raw)로 둔다 — DWG 쓰기가 그 태그에서 읽어 쓰고, 앱은 주석(296)·끊기 간격(143)을 거기서 본다.
 * 전에는 읽고 버려 DWG에서 연 스타일을 DXF·다른 판 DWG로 쓰면 기본값이 됐다(157차). 태그 차례·판 조건은 DXF 쓰기의 모델 값 길(io/dxf/wobjects.ts)과 같다.
 */
export function readMLeaderStyle(or: ObjectReader, isNewFormat: boolean): MLeaderStyleObject {
  or.commonObject();
  const r = or.dat;
  const ver = or.ver;
  const hr = or.hdl;
  const hb = or.h.handle;
  const styleVersion = ver >= R2010 ? r.BS() : 2;
  const contentType = r.BS();
  const drawMLeaderOrder = r.BS();
  const drawLeaderOrder = r.BS();
  const maxPoints = r.BL();
  const firstAngle = r.BD();
  const secondAngle = r.BD();
  const leaderLineType = r.BS();
  const leaderLineColor = cmcToCad(r.CMC());
  const ltype = hr.H(hb); // 선종류
  // 1/100 mm 값 그대로다(-2 ByBlock). 30은 0.30 mm다
  const leaderLineWeight = r.BL();
  const landing = r.B() === 1;
  const landingGap = r.BD();
  const dogleg = r.B();
  const doglegLength = r.BD();
  const name = r.TV(); // 설명
  const arrow = hr.H(hb);
  const arrowSize = r.BD();
  const defaultText = r.TV(); // 기본 문자
  const textStyle = hr.H(hb);
  const leftAttachment = r.BS();
  const rightAttachment = r.BS();
  const angleType = isNewFormat ? r.BS() : 1; // 문자 각도 종류(없으면 DXF 쓰기의 기본값)
  const textAlignment = r.BS();
  const textColor = cmcToCad(r.CMC());
  const textHeight = r.BD();
  const frame = r.B();
  const alignLeft = isNewFormat ? r.B() : 0; // 항상 왼쪽 정렬
  const alignSpace = r.BD();
  const block = hr.H(hb);
  const blockColor = cmcToCad(r.CMC());
  const blockScale = r.BD3();
  const blockScaleOn = r.B();
  const blockRotation = r.BD();
  const blockRotationOn = r.B();
  const blockConnection = r.BS();
  const scale = r.BD();
  // 그 뒤(DWG 쓰기와 같은 차례): 재지정 B, 주석 B, 끊기 간격 BD, R2010+ 부착 방향·위·아래 BS, R2013+ 비트 하나
  const overwrite = r.B();
  const annotative = r.B();
  const breakGap = r.BD();
  let attachDirection = 0;
  let topAttachment = 9;
  let bottomAttachment = 9;
  if (ver >= R2010) {
    attachDirection = r.BS();
    topAttachment = r.BS();
    bottomAttachment = r.BS();
  }
  const lastBit = ver >= R2013 ? r.B() : 0;
  const o: MLeaderStyleObject = {
    ...base(or, 'MLEADERSTYLE'),
    name,
    contentType,
    leaderLineType,
    leaderLineColor,
    leaderLineWeight,
    landing,
    doglegLength,
    arrowSize,
    textHeight,
    textColor,
    landingGap,
    scale,
  } as MLeaderStyleObject;
  if (arrow) o.arrowHeadHandle = hex(arrow);
  if (textStyle) o.textStyleHandle = hex(textStyle);
  if (block) o.blockHandle = hex(block);
  // 본문이 짧아 끝까지 읽지 못하면 전처럼 원본 태그 없이 둔다(쓰기는 모델 값과 기본값)
  if (r.overflowed()) return o;
  const raw: RawTag[] = [{ code: 100, value: 'AcDbMLeaderStyle' }];
  const t = (code: number, value: string | number): void => {
    raw.push({ code, value });
  };
  if (ver >= R2010) t(179, styleVersion);
  t(170, contentType);
  t(171, drawMLeaderOrder);
  t(172, drawLeaderOrder);
  t(90, maxPoints);
  t(40, firstAngle);
  t(41, secondAngle);
  t(173, leaderLineType);
  t(91, cadColorToRaw(leaderLineColor));
  if (ltype) t(340, hex(ltype));
  t(92, leaderLineWeight);
  t(290, landing ? 1 : 0);
  t(42, landingGap);
  t(291, dogleg);
  t(43, doglegLength);
  t(3, name);
  if (arrow) t(341, hex(arrow));
  t(44, arrowSize);
  t(300, defaultText);
  if (textStyle) t(342, hex(textStyle));
  t(174, leftAttachment);
  t(178, rightAttachment);
  t(175, angleType);
  t(176, textAlignment);
  t(93, cadColorToRaw(textColor));
  t(45, textHeight);
  t(292, frame);
  t(297, alignLeft);
  t(46, alignSpace);
  if (block) t(343, hex(block));
  t(94, cadColorToRaw(blockColor));
  t(47, blockScale.x);
  t(49, blockScale.y);
  t(140, blockScale.z);
  t(293, blockScaleOn);
  t(141, blockRotation);
  t(294, blockRotationOn);
  t(177, blockConnection);
  t(142, scale);
  t(295, overwrite);
  t(296, annotative);
  t(143, breakGap);
  if (ver >= R2010) {
    t(271, attachDirection);
    t(272, bottomAttachment);
    t(273, topAttachment);
  }
  // DXF 쓰기는 298을 R2018 DXF에만 쓴다(AutoCAD 표본은 값 0)
  if (ver >= R2018) t(298, lastBit);
  o.raw = raw;
  return o;
}

/** XRECORD 자료: (RS 그룹 코드, 값) 쌍 */
export function readXRecord(or: ObjectReader): XRecordObject {
  or.commonObject();
  const r = or.dat;
  const ver = or.ver;
  const nbytes = r.BL();
  if (nbytes < 0 || nbytes * 8 > r.end - r.pos + 64) throw new DwgFormatError('XRECORD 크기가 잘못되었습니다');
  const end = r.pos + nbytes * 8;
  const data: RawTag[] = [];
  try {
    while (r.pos < end) {
      const code = r.RS();
      data.push({ code, value: readTagValue(r, code, ver) });
    }
  } catch {
    // 모르는 값 종류: 남은 자료는 버린다
  }
  r.pos = end;
  let cloning = 0;
  if (ver >= R2000) cloning = r.BS();
  return { ...base(or, 'XRECORD'), cloning, data } as XRecordObject;
}

/** DXF 그룹 코드 종류에 따라 값 읽기(XRECORD) */
function readTagValue(r: BitReader, code: number, ver: number): string | number {
  const strCode = (code >= 0 && code <= 9) || code === 100 || code === 102 || (code >= 300 && code <= 309) || (code >= 410 && code <= 419) || (code >= 430 && code <= 439) || (code >= 470 && code <= 479) || (code >= 999 && code <= 1009 && code !== 1004);
  if (strCode) {
    if (ver >= R2007) {
      const len = r.RSu();
      const codes: number[] = new Array(len);
      for (let i = 0; i < len; i++) codes[i] = r.RSu();
      return codesToString(codes, len);
    }
    const len = r.RSu();
    r.RC(); // 코드 페이지
    return r.bytesToString(len);
  }
  if ((code >= 10 && code <= 39) || (code >= 110 && code <= 139) || (code >= 210 && code <= 239) || (code >= 1010 && code <= 1039)) {
    // 점: X(그리고 Y·Z) — DWG는 10~18에 3RD를 둔다
    if ((code >= 10 && code <= 18) || (code >= 110 && code <= 112) || code === 210 || (code >= 1010 && code <= 1013)) {
      const x = r.RD();
      const y = r.RD();
      const z = r.RD();
      return `${x},${y},${z}`;
    }
    return r.RD();
  }
  if ((code >= 40 && code <= 59) || (code >= 140 && code <= 149) || (code >= 460 && code <= 469) || (code >= 1040 && code <= 1059)) return r.RD();
  if ((code >= 60 && code <= 79) || (code >= 170 && code <= 179) || (code >= 270 && code <= 279) || (code >= 370 && code <= 389) || (code >= 400 && code <= 409) || (code >= 1060 && code <= 1070)) return r.RS();
  // 280~289는 8비트 정수(DXF와 같다)
  if (code >= 280 && code <= 289) return r.RC();
  if ((code >= 90 && code <= 99) || (code >= 420 && code <= 429) || (code >= 440 && code <= 459) || code === 1071) return r.RL();
  if (code >= 160 && code <= 169) return r.RL() + r.RL() * 0x100000000;
  if (code >= 290 && code <= 299) return r.RC();
  if ((code >= 320 && code <= 369) || (code >= 390 && code <= 399) || (code >= 480 && code <= 481)) {
    // 핸들: 8바이트
    let v = 0;
    const bytes: number[] = [];
    for (let i = 0; i < 8; i++) bytes.push(r.RC());
    for (let i = 7; i >= 0; i--) v = v * 256 + bytes[i];
    return hex(v);
  }
  if ((code >= 310 && code <= 319) || code === 1004) {
    const len = r.RC();
    let s = '';
    for (let i = 0; i < len; i++) s += HEX_BYTE[r.RC()];
    return s;
  }
  throw new DwgFormatError(`XRECORD 그룹 코드 ${code}`);
}

/** 해석하지 않는 객체 */
export function readGenericObject(or: ObjectReader): CadObject {
  or.commonObject();
  return base(or, or.h.typeName) as CadObject;
}

