/**
 * 플롯 용지(DWG To PDF.pc3의 전체 용지 크기와 같은 이름·크기): ISO A·B, JIS B, ANSI, ARCH, 그리고 사용자 크기.
 * 크기는 mm, 세로 방향(폭 ≤ 높이). 사용자 크기는 열쇠 USER_<폭>x<높이>로 나타낸다(목록에 없어도 된다).
 */

export interface Paper {
  key: string;
  label: string;
  w: number;
  h: number;
}

const IN = 25.4;

export const PAPERS: Paper[] = [
  { key: 'A4', label: 'ISO A4 (210 × 297 mm)', w: 210, h: 297 },
  { key: 'A3', label: 'ISO A3 (297 × 420 mm)', w: 297, h: 420 },
  { key: 'A2', label: 'ISO A2 (420 × 594 mm)', w: 420, h: 594 },
  { key: 'A1', label: 'ISO A1 (594 × 841 mm)', w: 594, h: 841 },
  { key: 'A0', label: 'ISO A0 (841 × 1189 mm)', w: 841, h: 1189 },
  { key: 'ISOB5', label: 'ISO B5 (176 × 250 mm)', w: 176, h: 250 },
  { key: 'ISOB4', label: 'ISO B4 (250 × 353 mm)', w: 250, h: 353 },
  { key: 'ISOB3', label: 'ISO B3 (353 × 500 mm)', w: 353, h: 500 },
  { key: 'ISOB2', label: 'ISO B2 (500 × 707 mm)', w: 500, h: 707 },
  { key: 'ISOB1', label: 'ISO B1 (707 × 1000 mm)', w: 707, h: 1000 },
  { key: 'ISOB0', label: 'ISO B0 (1000 × 1414 mm)', w: 1000, h: 1414 },
  { key: 'JISB5', label: 'JIS B5 (182 × 257 mm)', w: 182, h: 257 },
  { key: 'JISB4', label: 'JIS B4 (257 × 364 mm)', w: 257, h: 364 },
  { key: 'LETTER', label: 'Letter (8.5 × 11 in)', w: 8.5 * IN, h: 11 * IN },
  { key: 'LEGAL', label: 'Legal (8.5 × 14 in)', w: 8.5 * IN, h: 14 * IN },
  { key: 'TABLOID', label: 'Tabloid / ANSI B (11 × 17 in)', w: 11 * IN, h: 17 * IN },
  { key: 'ANSIC', label: 'ANSI C (17 × 22 in)', w: 17 * IN, h: 22 * IN },
  { key: 'ANSID', label: 'ANSI D (22 × 34 in)', w: 22 * IN, h: 34 * IN },
  { key: 'ANSIE', label: 'ANSI E (34 × 44 in)', w: 34 * IN, h: 44 * IN },
  { key: 'ARCHA', label: 'ARCH A (9 × 12 in)', w: 9 * IN, h: 12 * IN },
  { key: 'ARCHB', label: 'ARCH B (12 × 18 in)', w: 12 * IN, h: 18 * IN },
  { key: 'ARCHC', label: 'ARCH C (18 × 24 in)', w: 18 * IN, h: 24 * IN },
  { key: 'ARCHD', label: 'ARCH D (24 × 36 in)', w: 24 * IN, h: 36 * IN },
  { key: 'ARCHE1', label: 'ARCH E1 (30 × 42 in)', w: 30 * IN, h: 42 * IN },
  { key: 'ARCHE', label: 'ARCH E (36 × 48 in)', w: 36 * IN, h: 48 * IN },
];

const USER_RE = /^USER_(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/;
const fmt = (v: number) => String(+v.toFixed(2));

/** 사용자 크기 용지 열쇠(mm, 짧은 변이 폭). 크기가 맞지 않으면 null */
export function userPaperKey(w: number, h: number): string | null {
  if (!(w > 0 && h > 0 && w <= 20000 && h <= 20000)) return null;
  const a = Math.min(w, h);
  const b = Math.max(w, h);
  return `USER_${fmt(a)}x${fmt(b)}`;
}

/** 열쇠 → 용지(목록 또는 사용자 크기). 모르면 null */
export function paperOf(key: string | undefined): Paper | null {
  if (!key) return null;
  const p = PAPERS.find((x) => x.key === key);
  if (p) return p;
  const m = USER_RE.exec(key);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  return { key, label: `사용자 크기 (${fmt(w)} × ${fmt(h)} mm)`, w, h };
}

/** 크기(mm, 방향 무관)에 맞는 목록 용지 열쇠(없으면 null) */
export function paperKeyOfSize(w: number, h: number): string | null {
  const a = Math.min(w, h);
  const b = Math.max(w, h);
  return PAPERS.find((x) => Math.abs(x.w - a) < 1 && Math.abs(x.h - b) < 1)?.key ?? null;
}

/**
 * 인치 용지의 매체 이름. Letter는 DWG To PDF.pc3의 정식 이름 ANSI_A(AutoCAD Imperial 견본 도면의 페이지 설정 50개가 이 이름,
 * "Letter_(…)"는 시스템 프린터식 이름이라 PC3 이름으로 둔다)
 */
const INCH_NAMES: Record<string, string> = { LETTER: 'ANSI_A', LEGAL: 'Legal', TABLOID: 'ANSI_B', ANSIC: 'ANSI_C', ANSID: 'ANSI_D', ANSIE: 'ANSI_E' };

/** AutoCAD식 용지 이름(DWG To PDF.pc3, w·h는 놓인 방향 그대로) */
export function mediaName(key: string, w: number, h: number): string {
  const mm = `(${w.toFixed(2)}_x_${h.toFixed(2)}_MM)`;
  const inch = `(${(w / IN).toFixed(2)}_x_${(h / IN).toFixed(2)}_Inches)`;
  if (/^A\d$/.test(key)) return `ISO_full_bleed_${key}_${mm}`;
  if (/^ISOB\d$/.test(key)) return `ISO_full_bleed_${key.slice(3)}_${mm}`;
  if (/^JISB\d$/.test(key)) return `JIS_${key.slice(3)}_${mm}`;
  if (/^ARCH/.test(key)) return `ARCH_full_bleed_${key.slice(4)}_${inch}`;
  if (USER_RE.test(key)) return `UserDefinedMetric_${mm}`;
  return `${INCH_NAMES[key] ?? key}_${inch}`;
}
