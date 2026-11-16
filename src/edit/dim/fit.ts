/**
 * 맞춤(DIMATFIT·DIMTIX·DIMSOXD): 치수보조선 사이에 문자와 화살촉을 넣을지 정한다.
 * available = 보조선 사이 길이, textSpace = 문자 폭 + 2·DIMGAP, arrowSpace = 화살촉 두 개 길이.
 * 도움말("Fit Tab"): 둘 다 들어가지 않으면 0 둘 다 밖, 1 화살촉 먼저 밖(문자가 들어가면 안), 2 문자 먼저 밖(화살촉이 들어가면 안),
 * 3 문자가 들어가면 문자 안·화살촉 밖, 아니면 화살촉이 들어가면 화살촉 안
 */
import type { Out } from './builder';

export interface Fit {
  textInside: boolean;
  arrowsInside: boolean;
  /** DIMSOXD로 화살촉을 그리지 않음 */
  arrowsSuppressed: boolean;
}

/**
 * 선형 치수의 맞춤 자리 셈(132차 — 실제 도면 840개의 AutoCAD 치수 블록과 견주어 정함, 각도 치수는 그대로):
 * - arrowGap: 화살촉만 안에 둘 때도 화살촉 두 개 길이에 2·DIMGAP이 더 있어야 한다(보조선 사이/DIMASZ가 2 + 2·DIMGAP/DIMASZ 아래인 치수는
 *   문자가 들어가지 않아도 AutoCAD가 화살촉을 밖에 둔다 — 문자가 치수선을 끊지 않는 치수의 경계도 같다).
 * - textOffLine: 문자가 치수선 위·아래(DIMTAD)에 놓여 치수선 자리를 차지하지 않는다 — 둘 다 들어감 = 문자와 화살촉이 저마다 들어감
 */
export interface FitSpace {
  arrowGap?: boolean;
  textOffLine?: boolean;
}

export function decideFit(o: Out, available: number, textSpace: number, arrowSpace: number, space: FitSpace = {}): Fit {
  const v = o.v;
  const eps = 1e-9 * Math.max(1, available);
  const textFits = available + eps >= textSpace;
  const arrowsFit = available + eps >= arrowSpace + (space.arrowGap ? 2 * v.gap : 0);
  const both = space.textOffLine ? textFits && arrowsFit : available + eps >= textSpace + arrowSpace;
  let textInside: boolean;
  let arrowsInside: boolean;
  if (v.tix) {
    textInside = true;
    arrowsInside = both;
  } else if (both) {
    textInside = true;
    arrowsInside = true;
  } else {
    switch (v.atfit) {
      case 0:
        textInside = false;
        arrowsInside = false;
        break;
      case 1:
        textInside = textFits;
        arrowsInside = false;
        break;
      case 2:
        textInside = false;
        arrowsInside = arrowsFit;
        break;
      default:
        if (textFits) {
          textInside = true;
          arrowsInside = false;
        } else {
          textInside = false;
          arrowsInside = arrowsFit;
        }
    }
  }
  const arrowsSuppressed = !arrowsInside && v.soxd && textInside && v.tix;
  return { textInside, arrowsInside, arrowsSuppressed };
}
