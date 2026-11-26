/** 화면 골격: 제목 막대, 리본, 파일 탭, 배치 탭, 상태 막대, 시작 화면 */
import type { App, UiHooks } from '../app';
import { beginOpen, showAnalyticsSettings } from 'opencad-site-kit/analytics';
import { isFramed } from 'opencad-site-kit/embed/app';
import { MODEL_SPACE, tableKey } from '../../core/model';
import { unitAbbr } from '../../core/units';
import { ALL_SNAPS, SNAP_NAMES } from '../snap';
import { Palette, colorToHeader, currentColor } from './palettes';
import type { CadColor, Entity } from '../../core/model';
import { aciToRgb, rgbToCss } from '../../core/color';
import { colorText } from '../inquiry';
import { type Field, GENERAL_FIELDS, applyField, commonValue } from '../propedit';
import { currentLayer, setCurrentLayer } from '../layers';
import { layerStateNames, newLayerState, restoreLayerStateNamed } from '../layerstate';
import { runScriptFile } from '../dashcmds';
import { loadLispFile } from '../lisp';
import { isoState, setIso } from '../viewtools-iso';
import { maximized, maximizedLabel } from '../viewtools-vpmax';
import { pickColor } from './colorpick';
import { type MenuItem, dialog, focusables, formatBytes, h, iconSpan, moveMenuOpener, refocusStuck, showMenu, tabKeyTarget, toast } from './dom';
import { icon } from './icons';
import { MobileView, isCoarse, readMobileMode, startInViewMode } from './mobileview';
import { RECENT_MAX_SIZE, RecentStore, recentTimeLabel } from '../recent';
import { openErrorInfo, type OpenErrorInfo } from '../openerror';
import { colorTheme, setColorTheme, THEME_EVENT } from '../theme';
import { type AnnoStatus, annoStatus } from '../annoscale-status';
import { DEGREE_UNITS, POLAR_COMMON_ANGLES, formatPolarAngle } from '../polar';
import { foldCount, layoutClasses, revealX, ribbonOverlay, statusHidden, watchViewport, wheelToHorizontal } from './layout';
import { ft } from '../filetext';

interface Btn {
  cmd?: string;
  label: string;
  icon: string;
  tip?: string;
  menu?: { label: string; cmd: string; icon?: string }[];
  noDoc?: boolean;
  run?: () => void;
}

interface Panel {
  title: string;
  large?: Btn[];
  cols?: Btn[][];
  /** 리본 안의 고르기 상자(현재 도면층, 색·선종류·선가중치) */
  custom?: 'layer' | 'props';
}

/** 리본 단추 풍선 도움말: 아직 없는 명령이면 "준비 중"을 붙인다(원문 한국어 — 화면 언어로는 번역 모듈이 바꾼다) */
export function ribbonTip(tip: string, known: boolean): string {
  return known ? tip : `${tip} — 준비 중`;
}

const RIBBON: { tab: string; panels: Panel[] }[] = [
  {
    tab: '홈',
    panels: [
      {
        title: '그리기',
        large: [
          { cmd: 'LINE', label: '선', icon: 'line', tip: '선 (L)' },
          { cmd: 'PLINE', label: '폴리선', icon: 'pline', tip: '폴리선 (PL)' },
          {
            cmd: 'CIRCLE',
            label: '원',
            icon: 'circle',
            tip: '원 (C)',
            menu: [
              { label: '중심, 반지름', cmd: 'CIRCLE', icon: 'circle' },
              { label: '2점', cmd: 'CIRCLE 2P', icon: 'circle' },
              { label: '3점', cmd: 'CIRCLE 3P', icon: 'circle' },
              { label: '접선, 접선, 반지름', cmd: 'CIRCLE T', icon: 'circle' },
              { label: '접선, 접선, 접선', cmd: 'CIRCLE TTT', icon: 'circle' },
            ],
          },
          {
            cmd: 'ARC',
            label: '호',
            icon: 'arc',
            tip: '호 (A)',
            menu: [
              // AutoCAD 리본의 호 방법 11가지: ARC에 미리 고른 응답(역슬래시 = 사용자 입력, ; = Enter)
              { label: '3점', cmd: 'ARC', icon: 'arc' },
              { label: '시작점, 중심점, 끝점', cmd: 'ARC \\ C', icon: 'arc' },
              { label: '시작점, 중심점, 각도', cmd: 'ARC \\ C \\ A', icon: 'arc' },
              { label: '시작점, 중심점, 길이', cmd: 'ARC \\ C \\ L', icon: 'arc' },
              { label: '시작점, 끝점, 각도', cmd: 'ARC \\ E \\ A', icon: 'arc' },
              { label: '시작점, 끝점, 방향', cmd: 'ARC \\ E \\ D', icon: 'arc' },
              { label: '시작점, 끝점, 반지름', cmd: 'ARC \\ E \\ R', icon: 'arc' },
              { label: '중심점, 시작점, 끝점', cmd: 'ARC C', icon: 'arc' },
              { label: '중심점, 시작점, 각도', cmd: 'ARC C \\ \\ A', icon: 'arc' },
              { label: '중심점, 시작점, 길이', cmd: 'ARC C \\ \\ L', icon: 'arc' },
              { label: '연속', cmd: 'ARC ;', icon: 'arc' },
            ],
          },
        ],
        cols: [
          [
            { cmd: 'RECTANG', label: '직사각형', icon: 'rect', tip: '직사각형 (REC)' },
            { cmd: 'POLYGON', label: '폴리곤', icon: 'polygon', tip: '정다각형 (POL)' },
            { cmd: 'ELLIPSE', label: '타원', icon: 'ellipse', tip: '타원 (EL)' },
          ],
          [
            { cmd: 'SPLINE', label: '스플라인', icon: 'spline', tip: '스플라인 (SPL)' },
            {
              cmd: 'HATCH',
              label: '해치',
              icon: 'hatch',
              tip: '해치 (H)',
              menu: [
                { label: '해치', cmd: 'HATCH', icon: 'hatch' },
                { label: '그라데이션', cmd: 'GRADIENT', icon: 'hatch' },
                { label: '해치 편집', cmd: 'HATCHEDIT', icon: 'hatch' },
                { label: '경계', cmd: 'BOUNDARY', icon: 'pline' },
              ],
            },
            {
              cmd: 'POINT',
              label: '점',
              icon: 'point',
              tip: '점 (PO)',
              menu: [
                { label: '여러 점', cmd: 'POINT', icon: 'point' },
                { label: '등분할', cmd: 'DIVIDE', icon: 'point' },
                { label: '길이 분할', cmd: 'MEASURE', icon: 'point' },
              ],
            },
          ],
          [
            { cmd: 'XLINE', label: '구성선', icon: 'xline', tip: '구성선 (XL)' },
            { cmd: 'RAY', label: '광선', icon: 'ray' },
            { cmd: 'DONUT', label: '도넛', icon: 'donut', tip: '도넛 (DO)' },
          ],
          [
            { cmd: 'HELIX', label: '나선', icon: 'spline', tip: '나선 (HELIX)' },
            { cmd: 'SKETCH', label: '스케치', icon: 'pline', tip: '마우스로 그리는 자유 곡선 (SKETCH)' },
            {
              cmd: '3DPOLY',
              label: '3D 폴리선',
              icon: 'pline',
              tip: '3D 폴리선 (3P)',
              menu: [
                { label: '3D 폴리선', cmd: '3DPOLY', icon: 'pline' },
                { label: '3D 면', cmd: '3DFACE', icon: 'polygon' },
                { label: '트레이스', cmd: 'TRACE', icon: 'pline' },
              ],
            },
          ],
          [
            { cmd: 'REVCLOUD', label: '구름형 수정 기호', icon: 'polygon', tip: '구름형 수정 기호 (REVCLOUD)' },
            { cmd: 'WIPEOUT', label: '가리기', icon: 'rect', tip: '뒤의 객체를 가리는 영역 (WIPEOUT)' },
            {
              cmd: 'MLINE',
              label: '여러 줄',
              icon: 'xline',
              tip: '여러 줄 (ML)',
              menu: [
                { label: '여러 줄', cmd: 'MLINE', icon: 'xline' },
                { label: '여러 줄 편집', cmd: 'MLEDIT', icon: 'xline' },
                { label: '여러 줄 스타일', cmd: 'MLSTYLE', icon: 'settings' },
              ],
            },
          ],
        ],
      },
      {
        title: '수정',
        cols: [
          [
            { cmd: 'MOVE', label: '이동', icon: 'move', tip: '이동 (M)' },
            {
              cmd: 'COPY',
              label: '복사',
              icon: 'copy',
              tip: '복사 (CO)',
              menu: [
                { label: '복사', cmd: 'COPY', icon: 'copy' },
                { label: '여러 번 복사', cmd: 'COPYM', icon: 'copy' },
                { label: '이동·복사·회전·축척', cmd: 'MOCORO', icon: 'move' },
              ],
            },
            { cmd: 'STRETCH', label: '신축', icon: 'stretch', tip: '신축 (S)' },
          ],
          [
            { cmd: 'ROTATE', label: '회전', icon: 'rotate', tip: '회전 (RO)' },
            { cmd: 'MIRROR', label: '대칭', icon: 'mirror', tip: '대칭 (MI)' },
            { cmd: 'SCALE', label: '축척', icon: 'scale', tip: '축척 (SC)' },
          ],
          [
            {
              cmd: 'TRIM',
              label: '자르기',
              icon: 'trim',
              tip: '자르기 (TR)',
              menu: [
                { label: '자르기', cmd: 'TRIM', icon: 'trim' },
                { label: '경계 한쪽 모두 자르기', cmd: 'EXTRIM', icon: 'trim' },
              ],
            },
            { cmd: 'EXTEND', label: '연장', icon: 'extend', tip: '연장 (EX)' },
            { cmd: 'OFFSET', label: '간격띄우기', icon: 'offset', tip: '간격띄우기 (O)' },
          ],
          [
            { cmd: 'FILLET', label: '모깎기', icon: 'fillet', tip: '모깎기 (F)' },
            { cmd: 'CHAMFER', label: '모따기', icon: 'chamfer', tip: '모따기 (CHA)' },
            {
              cmd: 'ARRAYRECT',
              label: '배열',
              icon: 'arrayRect',
              tip: '배열 (AR)',
              menu: [
                { label: '직사각형 배열', cmd: 'ARRAYRECT', icon: 'arrayRect' },
                { label: '원형 배열', cmd: 'ARRAYPOLAR', icon: 'arrayPolar' },
                { label: '경로 배열', cmd: 'ARRAYPATH', icon: 'spline' },
                { label: '배열 대화상자', cmd: 'ARRAYCLASSIC', icon: 'settings' },
                { label: '배열 편집', cmd: 'ARRAYEDIT', icon: 'arrayRect' },
                { label: '배열 원본 편집 저장', cmd: 'ARRAYCLOSE S', icon: 'save' },
                { label: '배열 원본 편집 취소', cmd: 'ARRAYCLOSE D', icon: 'close' },
              ],
            },
          ],
          [
            { cmd: 'ERASE', label: '지우기', icon: 'erase', tip: '지우기 (E, Delete)' },
            { cmd: 'EXPLODE', label: '분해', icon: 'explode', tip: '분해 (X)' },
            { cmd: 'JOIN', label: '결합', icon: 'join', tip: '결합 (J)' },
          ],
          [
            {
              cmd: 'PEDIT',
              label: '폴리선 편집',
              icon: 'pline',
              tip: '폴리선 편집 (PE)',
              menu: [
                { label: '폴리선 편집', cmd: 'PEDIT', icon: 'pline' },
                { label: '스플라인 편집', cmd: 'SPLINEDIT', icon: 'spline' },
                { label: '혼합 곡선', cmd: 'BLEND', icon: 'spline' },
                { label: '방향 반전', cmd: 'REVERSE', icon: 'redo' },
              ],
            },
            { cmd: 'ALIGN', label: '정렬', icon: 'move', tip: '정렬 (AL)' },
            { cmd: 'OVERKILL', label: '중복 정리', icon: 'erase', tip: '겹치거나 중복된 객체 정리 (OVERKILL)' },
          ],
        ],
      },
      {
        title: '주석',
        large: [{ cmd: 'MTEXT', label: '문자', icon: 'mtext', tip: '여러 줄 문자 (MT)' }],
        cols: [
          [
            { cmd: 'DIMLINEAR', label: '선형 치수', icon: 'dimLinear', tip: '선형 치수 (DLI)' },
            { cmd: 'MLEADER', label: '지시선', icon: 'leader', tip: '다중 지시선 (MLD)' },
            { cmd: 'TEXT', label: '단일 행', icon: 'text', tip: '단일 행 문자 (DT)' },
          ],
        ],
      },
      {
        title: '도면층',
        large: [{ cmd: 'LAYER', label: '도면층 특성', icon: 'layers', tip: '도면층 목록에서 켜기·동결·잠금·색을 바꿉니다 (LA)' }],
        custom: 'layer',
        cols: [
          [
            { cmd: 'LAYOFF', label: '끄기', icon: 'layerOff', tip: '고른 객체의 도면층을 끕니다' },
            { cmd: 'LAYFRZ', label: '동결', icon: 'snow', tip: '고른 객체의 도면층을 동결합니다' },
            { cmd: 'LAYISO', label: '격리', icon: 'layerIso', tip: '고른 객체의 도면층만 남깁니다' },
          ],
          [
            { cmd: 'LAYON', label: '모두 켜기', icon: 'layerAll' },
            { cmd: 'LAYTHW', label: '모두 동결 해제', icon: 'sun' },
            { cmd: 'LAYUNISO', label: '격리 해제', icon: 'layers' },
          ],
          [
            { cmd: 'LAYWALK', label: '도면층 탐색', icon: 'eye', tip: '고른 도면층만 잠시 보기 (LAYWALK)' },
            { cmd: 'COPYTOLAYER', label: '도면층에 복사', icon: 'copy', tip: '객체를 다른 도면층에 복사 (COPYTOLAYER)' },
            { cmd: 'LAYERP', label: '이전', icon: 'undo', tip: '도면층 설정을 한 단계 전으로 (LAYERP)' },
          ],
          [
            { cmd: 'LAYERSTATE', label: '도면층 상태', icon: 'layerAll', tip: '도면층 상태 저장·복원·가져오기 (LAS, Shift+Ctrl+L)' },
            { cmd: 'SETBYLAYER', label: 'ByLayer로', icon: 'matchprop', tip: '고른 객체의 색·선종류·선가중치·투명도를 ByLayer로 (SETBYLAYER)' },
          ],
        ],
      },
      {
        title: '특성',
        large: [{ cmd: 'MATCHPROP', label: '특성 일치', icon: 'matchprop', tip: '한 객체의 특성을 다른 객체에 복사합니다 (MA)' }],
        custom: 'props',
      },
      {
        title: '유틸리티',
        large: [
          {
            cmd: 'MEASUREGEOM',
            label: '측정',
            icon: 'ruler',
            tip: '거리·반지름·각도·면적 (MEA)',
            menu: [
              { label: '거리', cmd: 'DIST', icon: 'dist' },
              { label: '반지름', cmd: 'MEASURERADIUS', icon: 'radius' },
              { label: '각도', cmd: 'MEASUREANGLE', icon: 'angle' },
              { label: '면적', cmd: 'AREA', icon: 'area' },
            ],
          },
        ],
        cols: [
          [
            { cmd: 'ID', label: 'ID 점', icon: 'id', tip: '점의 좌표 (ID)' },
            { cmd: 'LIST', label: '리스트', icon: 'list', tip: '객체 정보를 명령행에 보입니다 (LI)' },
            { cmd: 'SELECTALL', label: '모두 선택', icon: 'selectAll', tip: 'Ctrl+A' },
          ],
          [
            {
              cmd: 'QSELECT',
              label: '신속 선택',
              icon: 'selectAll',
              tip: '종류·특성·값으로 고르기 (QSELECT)',
              menu: [
                { label: '신속 선택', cmd: 'QSELECT', icon: 'selectAll' },
                { label: '선택 필터', cmd: 'FILTER', icon: 'find' },
              ],
            },
            { cmd: 'SELECTSIMILAR', label: '유사 선택', icon: 'selectAll', tip: '같은 종류·도면층·이름의 객체 고르기' },
            { cmd: 'QUICKCALC', label: '계산기', icon: 'quick', tip: '계산기 (QC)' },
          ],
        ],
      },
      {
        title: '그룹',
        cols: [
          [
            { cmd: 'GROUP', label: '그룹', icon: 'blocks', tip: '그룹 만들기 (G)' },
            { cmd: 'UNGROUP', label: '그룹 해제', icon: 'explode' },
            { cmd: 'PICKSTYLE', label: '그룹 선택', icon: 'selectAll', tip: '그룹 단위 고르기 켜기·끄기 (Ctrl+Shift+A)' },
          ],
        ],
      },
    ],
  },
  {
    tab: '삽입',
    panels: [
      {
        title: '블록',
        large: [{ cmd: 'INSERT', label: '삽입', icon: 'insert', tip: '블록 삽입 (I)' }],
        cols: [
          [
            { cmd: 'BLOCK', label: '만들기', icon: 'block', tip: '블록 만들기 (B)' },
            { cmd: 'BEDIT', label: '편집', icon: 'block', tip: '블록 편집기 (BE)' },
            { cmd: 'WBLOCK', label: '블록 쓰기', icon: 'save', tip: '블록·객체를 새 도면 파일로 (W)' },
          ],
          [
            { cmd: 'BATTMAN', label: '속성 관리', icon: 'list', tip: '블록 속성 관리자' },
            { cmd: 'ATTSYNC', label: '속성 동기화', icon: 'redo' },
            { cmd: 'MINSERT', label: '다중 삽입', icon: 'arrayRect', tip: '행·열로 배열한 블록 참조' },
          ],
          [{ cmd: 'ATTIPEDIT', label: '속성 바로 편집', icon: 'insert', tip: '누른 속성 하나의 값 고치기 (ATTIPEDIT)' }],
          [
            { cmd: 'BCOUNT', label: '블록 개수', icon: 'list' },
            { cmd: 'BURST', label: '속성 남기고 분해', icon: 'explode' },
            { cmd: 'BLOCKREPLACE', label: '블록 대치', icon: 'insert' },
          ],
          [
            { cmd: 'ADCENTER', label: '디자인센터', icon: 'blocks', tip: '다른 도면의 블록·도면층·스타일 가져오기 (Ctrl+2)' },
            { cmd: 'BLOCKSPALETTE', label: '블록 팔레트', icon: 'blocks', tip: '현재 도면·최근·라이브러리 블록을 미리보기로 삽입 (BLOCKSPALETTE)' },
          ],
          [
            { cmd: 'ATTOUT', label: '속성 내보내기', icon: 'list', tip: '블록 속성을 탭 구분 파일로 (ATTOUT)' },
            { cmd: 'ATTIN', label: '속성 가져오기', icon: 'list', tip: '고친 속성 파일을 읽어 값 바꾸기 (ATTIN)' },
            { cmd: 'ATTEXT', label: '속성 추출', icon: 'table', tip: 'CDF·SDF·DXF로 속성 추출 (ATTEXT)' },
          ],
          [
            { cmd: 'DYNPROPS', label: '동적 특성', icon: 'props', tip: '동적 블록 참조의 매개변수 값' },
            { cmd: 'RESETBLOCK', label: '블록 재설정', icon: 'redo', tip: '동적 블록 참조를 정의 기본값으로' },
            { cmd: 'COUNT', label: '개수', icon: 'list', tip: '블록별 개수, 누르면 참조를 고르고 확대 (COUNT)' },
          ],
        ],
      },
      {
        title: '참조',
        large: [{ cmd: 'EXTERNALREFERENCES', label: '외부 참조', icon: 'folder', tip: '외부 참조·이미지·PDF 언더레이 (XR)' }],
        cols: [
          [
            // 끝의 U+2060: TRIM의 "자르기"와 사전 열쇠를 가른다(imageclip.ts의 CLIP 이름과 같다 — 116차)
            { cmd: 'CLIP', label: '자르기\u{2060}', icon: 'trim', tip: '블록·외부 참조·이미지·언더레이·뷰포트를 경계로 자르기 (CLIP)' },
            { cmd: 'IMAGECLIP', label: '이미지 자르기', icon: 'trim', tip: '래스터 이미지 자르기 (ICL)' },
            { cmd: 'PDFCLIP', label: 'PDF 자르기', icon: 'trim', tip: 'PDF 언더레이 자르기' },
          ],
          [
            { cmd: 'XATTACH', label: 'DWG 부착', icon: 'folder', tip: 'DWG·DXF를 외부 참조로 부착 (XA)' },
            { cmd: 'IMAGEATTACH', label: '이미지 부착', icon: 'sample', tip: '래스터 이미지 부착 (IAT)' },
            { cmd: 'PDFATTACH', label: 'PDF 부착', icon: 'exportPdf', tip: 'PDF 페이지를 언더레이로 부착' },
          ],
          [
            { cmd: 'XBIND', label: '기호 결합', icon: 'layers', tip: '외부 참조의 도면층·블록·스타일을 이 도면에 결합 (XB)' },
            { cmd: 'XOPEN', label: '참조 열기', icon: 'open', tip: '외부 참조를 새 탭으로 열기 (XOPEN)' },
          ],
          [
            { cmd: 'REFEDIT', label: '참조 편집', icon: 'block', tip: '블록·외부 참조를 제자리에서 고치기 (REFEDIT)' },
            { cmd: 'REFSET', label: '작업 세트', icon: 'selectAll', tip: '참조 편집 작업 세트에 객체 추가·제거' },
            { cmd: 'REFCLOSE', label: '참조 닫기', icon: 'close', tip: '참조 편집 변경 사항 저장·취소' },
          ],
        ],
      },
      {
        title: '데이터',
        cols: [
          [
            { cmd: 'FIELD', label: '필드', icon: 'text', tip: '날짜·파일 이름·객체 특성 등을 문자에 넣기' },
            { cmd: 'UPDATEFIELD', label: '필드 업데이트', icon: 'redo', tip: '고른 문자의 필드를 다시 계산' },
            { cmd: 'HYPERLINK', label: '하이퍼링크', icon: 'info', tip: '객체에 웹 주소·도면 안 위치 넣기(Ctrl+클릭으로 열기)' },
          ],
          [{ cmd: 'DATAEXTRACTION', label: '데이터 추출', icon: 'table', tip: '블록 개수·속성을 표나 CSV로 (DX)' }],
        ],
      },
    ],
  },
  {
    tab: '주석',
    panels: [
      {
        title: '문자',
        large: [{ cmd: 'MTEXT', label: '여러 줄 문자', icon: 'mtext', tip: '여러 줄 문자 (MT)' }],
        cols: [
          [
            { cmd: 'TEXT', label: '단일 행', icon: 'text', tip: '단일 행 문자 (DT)' },
            { cmd: 'FIND', label: '찾기 및 대치', icon: 'find', tip: '도면 안의 문자를 찾아 이동하거나 바꿉니다 (FIND)' },
            { cmd: 'STYLE', label: '문자 스타일', icon: 'text', tip: '문자 스타일 (ST)' },
          ],
          [
            { cmd: 'TXT2MTXT', label: '여러 줄로 변환', icon: 'mtext', tip: '한 줄 문자를 여러 줄 문자로 결합 (TXT2MTXT)' },
            { cmd: 'TEXTALIGN', label: '문자 정렬', icon: 'text', tip: '기준 문자에 맞춰 문자 줄 세우기 (TEXTALIGN)' },
            { cmd: 'ARCTEXT', label: '원호 정렬 문자', icon: 'arc', tip: '호를 따라 문자 놓기 (ARCTEXT)' },
          ],
          [
            { cmd: 'SCALETEXT', label: '문자 축척', icon: 'scale', tip: '문자 높이를 한 번에 바꾸기' },
            { cmd: 'JUSTIFYTEXT', label: '자리맞추기', icon: 'text', tip: '위치는 그대로 두고 자리맞추기만 바꾸기' },
          ],
        ],
      },
      {
        title: '치수',
        large: [
          { cmd: 'DIM', label: '치수', icon: 'dimLinear', tip: '객체에 맞는 치수를 자동으로 (DIM)' },
          { cmd: 'DIMLINEAR', label: '선형', icon: 'dimLinear', tip: '선형 치수 (DLI)' },
        ],
        cols: [
          [
            { cmd: 'DIMALIGNED', label: '정렬', icon: 'dimAligned', tip: '정렬 치수 (DAL)' },
            { cmd: 'DIMANGULAR', label: '각도', icon: 'dimAngular', tip: '각도 치수 (DAN)' },
            { cmd: 'DIMRADIUS', label: '반지름', icon: 'dimRadius', tip: '반지름 치수 (DRA)' },
          ],
          [
            { cmd: 'DIMDIAMETER', label: '지름', icon: 'dimDiameter', tip: '지름 치수 (DDI)' },
            { cmd: 'DIMSTYLE', label: '치수 스타일', icon: 'dimLinear', tip: '치수 스타일 (D)' },
            { cmd: 'DIMLIST', label: '치수 목록', icon: 'dimlist', tip: '도면의 치수와 실제 측정값을 비교합니다' },
          ],
          [
            { cmd: 'DIMJOGGED', label: '꺾기', icon: 'dimRadius', tip: '꺾기 반지름 치수 (DJO)' },
            { cmd: 'QDIM', label: '빠른 치수', icon: 'dimLinear', tip: '고른 객체에 연속·기준선·반지름 치수 한 번에' },
            { cmd: 'DIMSPACE', label: '간격 조정', icon: 'dimAligned', tip: '평행 치수 간격 맞추기' },
          ],
          [
            { cmd: 'DIMBREAK', label: '끊기', icon: 'break', tip: '치수·지시선을 교차하는 곳에서 끊기' },
            { cmd: 'DIMJOGLINE', label: '꺾어진 선형', icon: 'dimLinear', tip: '선형 치수에 꺾기선 (DJL)' },
            { cmd: 'DIMOVERRIDE', label: '재지정', icon: 'settings', tip: '치수 변수 재지정 (DOV)' },
          ],
          [
            { cmd: 'DIMEDIT', label: '치수 편집', icon: 'dimLinear', tip: '문자·기울기 (DED)' },
            { cmd: 'DIMTEDIT', label: '문자 위치', icon: 'text', tip: '치수 문자 옮기기·정렬' },
            { cmd: 'TOLERANCE', label: '공차', icon: 'rect', tip: '기하 공차 (TOL)' },
          ],
          [
            { cmd: 'DIMREASSOCIATE', label: '다시 연관', icon: 'dimLinear', tip: '치수를 객체에 다시 연관 (DRE)' },
            { cmd: 'DIMDISASSOCIATE', label: '연관 해제', icon: 'dimLinear', tip: '치수의 연관 끊기 (DDA)' },
            { cmd: 'DIMREGEN', label: '치수 재생성', icon: 'redo', tip: '연관 치수를 다시 맞추기' },
          ],
          [{ cmd: 'DIMINSPECT', label: '검사', icon: 'dimLinear', tip: '검사 치수(레이블·검사율 프레임)' }],
        ],
      },
      {
        title: '지시선',
        large: [{ cmd: 'MLEADER', label: '다중 지시선', icon: 'leader', tip: '다중 지시선 (MLD)' }],
        cols: [
          [
            { cmd: 'QLEADER', label: '빠른 지시선', icon: 'leader', tip: '지시선과 여러 줄 문자 (LE)' },
            { cmd: 'MLEADEREDIT', label: '추가·제거', icon: 'leader', tip: '다중 지시선에 지시선 추가·제거 (MLE)' },
            { cmd: 'MLEADERALIGN', label: '정렬', icon: 'leader', tip: '다중 지시선 정렬 (MLA)' },
          ],
          [
            { cmd: 'MLEADERCOLLECT', label: '수집', icon: 'blocks', tip: '블록 다중 지시선 모으기 (MLC)' },
            { cmd: 'MLEADERSTYLE', label: '지시선 스타일', icon: 'settings', tip: '다중 지시선 스타일 (MLS)' },
            { cmd: 'LEADER', label: '옛 지시선', icon: 'leader', tip: '지시선과 주석 (LEAD)' },
          ],
        ],
      },
      {
        title: '표',
        large: [{ cmd: 'TABLE', label: '테이블', icon: 'table', tip: '표 삽입 (TB)' }],
        cols: [
          [
            { cmd: 'TABLEDIT', label: '셀 문자', icon: 'text', tip: '표 셀 문자 편집(표를 두 번 눌러도 됨)' },
            { cmd: 'TABLECELL', label: '셀 편집', icon: 'table', tip: '행·열 삽입·삭제, 병합, 정렬 (TCELL)' },
            { cmd: 'TABLESTYLE', label: '테이블 스타일', icon: 'settings', tip: '테이블 스타일 (TS)' },
          ],
        ],
      },
      {
        title: '중심선',
        cols: [
          [
            { cmd: 'CENTERMARK', label: '중심 표식', icon: 'circle', tip: '원·호의 중심 표식 (CM)' },
            { cmd: 'CENTERLINE', label: '중심선', icon: 'xline', tip: '두 선 사이 중심선 (CL)' },
          ],
        ],
      },
      {
        title: '주석 축척',
        large: [{ cmd: 'SCALELISTEDIT', label: '축척 리스트', icon: 'scale', tip: '도면 축척 편집 (SCALELISTEDIT)' }],
        cols: [
          [
            { cmd: 'OBJECTSCALE', label: '축척 추가/삭제', icon: 'scale', tip: '주석 객체 축척 (OBJECTSCALE)' },
            { cmd: 'AIOBJECTSCALEADD', label: '현재 축척 추가', icon: 'plus', tip: '고른 주석 객체에 현재 주석 축척 추가' },
            { cmd: 'AIOBJECTSCALEREMOVE', label: '현재 축척 삭제', icon: 'erase', tip: '고른 주석 객체에서 현재 주석 축척 삭제' },
          ],
          [
            { cmd: 'ANNORESET', label: '위치 재설정', icon: 'move', tip: '모든 축척 표현의 위치를 현재 표현의 위치로 (ANNORESET)' },
            { cmd: 'ANNOUPDATE', label: '주석 업데이트', icon: 'text', tip: '문자를 문자 스타일의 주석 설정에 맞춤' },
          ],
        ],
      },
    ],
  },
  {
    tab: '파라메트릭',
    panels: [
      {
        title: '기하학적',
        large: [{ cmd: 'AUTOCONSTRAIN', label: '자동 구속', icon: 'lock', tip: '선택한 객체에 기하 구속 자동 적용' }],
        cols: [
          [
            { cmd: 'GCCOINCIDENT', label: '일치', icon: 'point' },
            { cmd: 'GCCOLLINEAR', label: '동일선상', icon: 'line' },
            { cmd: 'GCCONCENTRIC', label: '동심', icon: 'circle' },
          ],
          [
            { cmd: 'GCFIX', label: '고정', icon: 'lock' },
            { cmd: 'GCPARALLEL', label: '평행', icon: 'xline' },
            { cmd: 'GCPERPENDICULAR', label: '직교', icon: 'ortho' },
          ],
          [
            { cmd: 'GCHORIZONTAL', label: '수평', icon: 'dimLinear' },
            { cmd: 'GCVERTICAL', label: '수직', icon: 'dimLinear' },
            { cmd: 'GCTANGENT', label: '접선', icon: 'arc' },
          ],
          [
            { cmd: 'GCSMOOTH', label: '부드럽게', icon: 'spline' },
            { cmd: 'GCSYMMETRIC', label: '대칭', icon: 'mirror' },
            { cmd: 'GCEQUAL', label: '동일', icon: 'ruler' },
          ],
          [{ cmd: 'CONSTRAINTBAR', label: '구속 막대', icon: 'eye', tip: '구속 막대 표시·숨기기 (CBAR)' }],
        ],
      },
      {
        title: '치수',
        large: [{ cmd: 'DCLINEAR', label: '선형', icon: 'dimLinear', tip: '선형 치수 구속' }],
        cols: [
          [
            { cmd: 'DCALIGNED', label: '정렬', icon: 'dimAligned' },
            { cmd: 'DCANGULAR', label: '각도', icon: 'dimAngular' },
            { cmd: 'DCRADIUS', label: '반지름', icon: 'dimRadius' },
          ],
          [
            { cmd: 'DCDIAMETER', label: '지름', icon: 'dimDiameter' },
            { cmd: 'DCHORIZONTAL', label: '수평', icon: 'dimLinear' },
            { cmd: 'DCVERTICAL', label: '수직', icon: 'dimLinear' },
          ],
          [{ cmd: 'DCDISPLAY', label: '표시', icon: 'eye', tip: '동적 치수 구속 표시·숨기기' }],
        ],
      },
      {
        title: '관리',
        cols: [
          [
            { cmd: 'DELCONSTRAINT', label: '구속 삭제', icon: 'erase', tip: '선택한 객체의 구속 모두 지우기' },
            { cmd: 'PARAMETERS', label: '매개변수 관리자', icon: 'list', tip: '치수 구속·사용자 매개변수 (PAR)' },
          ],
        ],
      },
    ],
  },
  {
    tab: '뷰',
    panels: [
      {
        title: '탐색',
        large: [{ cmd: 'ZOOMEXTENTS', label: '범위', icon: 'extents' }],
        cols: [
          [
            { cmd: 'ZOOM W', label: '윈도우', icon: 'zoomWindow' },
            { cmd: 'ZOOMPREVIOUS', label: '이전', icon: 'zoomPrev' },
            { cmd: 'PAN', label: '초점이동', icon: 'pan' },
          ],
          [
            { cmd: 'ZOOMIN', label: '확대', icon: 'zoomIn' },
            { cmd: 'ZOOMOUT', label: '축소', icon: 'zoomOut' },
          ],
        ],
      },
      {
        title: '팔레트',
        cols: [
          [
            { cmd: 'PROPERTIES', label: '특성', icon: 'props' },
            { cmd: 'LAYER', label: '도면층', icon: 'layers' },
            { cmd: 'DIMLIST', label: '치수 목록', icon: 'dimlist' },
          ],
          [
            { cmd: 'FIND', label: '찾기 및 대치', icon: 'find' },
            { cmd: 'DWGINFO', label: '도면 정보', icon: 'info' },
            { cmd: 'UNITS', label: '도면 단위', icon: 'coord' },
          ],
        ],
      },
      {
        title: '뷰·좌표',
        cols: [
          [
            { cmd: 'VIEW', label: '뷰 관리자', icon: 'views', tip: '지금 화면을 이름 붙여 저장하고 다시 불러오기' },
            { cmd: 'VIEWLINK', label: '보기 링크', icon: 'link', tip: '지금 화면(가운데·배율·배치 탭)을 담은 주소 복사 — 파일은 담지 않습니다' },
            { cmd: 'UCS', label: 'UCS', icon: 'ucs', tip: '사용자 좌표계의 원점·방향 바꾸기' },
          ],
          [
            { cmd: 'UCSMAN', label: 'UCS 관리자', icon: 'coord' },
            { cmd: 'DSETTINGS', label: '제도 설정', icon: 'settings', tip: '스냅·격자, 극좌표 추적, 객체 스냅 설정' },
            { cmd: 'ISOLATEOBJECTS', label: '객체 격리', icon: 'isolate', tip: '고른 객체만 보이기(UNISOLATEOBJECTS로 끝)' },
          ],
          [{ cmd: 'UNISOLATEOBJECTS', label: '격리 끝', icon: 'eye' }],
        ],
      },
      {
        title: '모형 뷰포트',
        large: [
          {
            cmd: 'VPORTS',
            label: '뷰포트 구성',
            icon: 'viewport',
            tip: '모형 화면을 여러 타일 뷰포트로 나누기 (VPORTS)',
            menu: [
              { label: '하나', cmd: '-VPORTS SI', icon: 'viewport' },
              { label: '둘: 수직', cmd: '-VPORTS 2 V', icon: 'viewport' },
              { label: '둘: 수평', cmd: '-VPORTS 2 H', icon: 'viewport' },
              { label: '셋: 오른쪽', cmd: '-VPORTS 3 R', icon: 'viewport' },
              { label: '셋: 왼쪽', cmd: '-VPORTS 3 L', icon: 'viewport' },
              { label: '넷: 동일', cmd: '-VPORTS 4', icon: 'viewport' },
              { label: '결합', cmd: '-VPORTS J', icon: 'viewport' },
              { label: '뷰포트 대화상자…', cmd: 'VPORTS', icon: 'settings' },
            ],
          },
        ],
      },
      {
        title: '배치 뷰포트',
        cols: [
          [
            { cmd: 'MVIEW', label: '뷰포트 만들기', icon: 'viewport', tip: '배치에 뷰포트를 만들거나 켜기·끄기·잠그기' },
            { cmd: 'VPCLIP', label: '뷰포트 자르기', icon: 'polygon' },
            { cmd: 'VPLAYER', label: '뷰포트 도면층', icon: 'layers' },
          ],
          [
            { cmd: 'MSPACE', label: '모형 공간', icon: 'model', tip: '뷰포트 안으로 들어가 모형을 다루기(뷰포트 안을 두 번 눌러도 됨)' },
            { cmd: 'PSPACE', label: '종이 공간', icon: 'paper', tip: '뷰포트에서 나오기(뷰포트 밖을 두 번 눌러도 됨)' },
            { cmd: 'CHSPACE', label: '공간 변경', icon: 'move' },
          ],
          [
            { cmd: 'VPMAX', label: '최대화', icon: 'fullscreen', tip: '뷰포트를 화면 가득 모형 공간으로 (VPMAX, 복원은 VPMIN)' },
            { cmd: 'VPSYNC', label: '뷰포트 동기화', icon: 'viewport', tip: '기준 뷰포트의 축척·위치에 맞추기 (VPSYNC)' },
            { cmd: 'VPSCALE', label: '뷰포트 축척', icon: 'ruler', tip: '고른 뷰포트의 축척 보기 (VPSCALE)' },
          ],
        ],
      },
      {
        title: '표시',
        large: [
          { cmd: 'BACKGROUND', label: '배경색', icon: 'background', noDoc: true, tip: '검정·흰색 배경 전환' },
          { cmd: 'LWDISPLAY', label: '선가중치', icon: 'lineweight', noDoc: true, tip: '선가중치 표시 켜기·끄기' },
          { cmd: 'SHXFONTS', label: 'SHX 글꼴', icon: 'text', noDoc: true, tip: '이 컴퓨터의 SHX 글꼴을 불러와 도면 문자를 원래 글꼴로 그리기' },
          { cmd: 'FULLSCREEN', label: '전체 화면', icon: 'fullscreen', noDoc: true },
        ],
        cols: [
          [
            { cmd: 'FILL', label: '채우기', icon: 'hatch', tip: '해치·솔리드·폭 있는 폴리선 채우기 켜기·끄기 (FILL)' },
            { cmd: 'QTEXT', label: '빠른 문자', icon: 'text', tip: '문자를 테두리 사각형으로 (QTEXT)' },
            { cmd: 'ISODRAFT', label: '등각 제도', icon: 'polygon', tip: '등각투영 격자·스냅·직교 (ISODRAFT, F5로 평면 전환)' },
          ],
        ],
      },
    ],
  },
  {
    tab: '관리',
    panels: [
      {
        title: '정리',
        cols: [
          [
            { cmd: 'AUDIT', label: '감사', icon: 'info', tip: '도면 오류 찾기·고치기' },
            { cmd: 'DRAWINGRECOVERY', label: '도면 복구', icon: 'folder', tip: '자동 저장한 도면 열기 (DRM)', noDoc: true },
            { cmd: 'PURGE', label: '소거', icon: 'erase', tip: '쓰지 않는 블록·도면층·스타일 지우기' },
            { cmd: 'OVERKILL', label: '중복 정리', icon: 'erase' },
          ],
        ],
      },
      {
        title: '스크립트',
        large: [{ cmd: 'SCRIPT', label: '스크립트 실행', icon: 'open', noDoc: true, tip: '.scr 파일을 명령행에 차례로 넣기 (SCR, 파일을 끌어 놓아도 됨)' }],
        cols: [
          [
            { cmd: 'RESUME', label: '이어서', icon: 'redo', noDoc: true, tip: '멈춘 스크립트를 이어서 실행 (RESUME)' },
            { cmd: 'RSCRIPT', label: '처음부터', icon: 'undo', noDoc: true, tip: '스크립트를 처음부터 다시 (RSCRIPT)' },
          ],
          [{ cmd: 'APPLOAD', label: 'AutoLISP 로드', icon: 'folder', noDoc: true, tip: 'AutoLISP(.lsp) 파일 로드 (AP, 파일을 끌어 놓아도 됨)' }],
        ],
      },
      {
        title: 'CAD 표준',
        cols: [
          [
            { cmd: 'STANDARDS', label: '구성', icon: 'settings', tip: '표준 파일 연결 (STA)' },
            { cmd: 'CHECKSTANDARDS', label: '검사', icon: 'list', tip: '표준 위반 검사·수정 (CHK)' },
            { cmd: 'LAYTRANS', label: '도면층 변환기', icon: 'layers', tip: '다른 도면의 도면층으로 변환' },
          ],
        ],
      },
      {
        title: '도면',
        cols: [
          [
            { cmd: 'RENAME', label: '이름 바꾸기', icon: 'text', tip: '도면층·블록·스타일 등의 이름 (REN)' },
            { cmd: 'STATUS', label: '상태', icon: 'list' },
            { cmd: 'LIMITS', label: '도면 한계', icon: 'rect' },
          ],
          [
            { cmd: 'UNITS', label: '단위', icon: 'coord' },
            { cmd: 'DWGPROPS', label: '도면 특성', icon: 'props', tip: '제목·작성자·키워드·사용자 특성 (DWGPROPS)' },
            { cmd: 'DWGINFO', label: '도면 정보', icon: 'info' },
          ],
        ],
      },
      {
        title: '사용자화',
        cols: [
          [
            { cmd: 'OPTIONS', label: '옵션', icon: 'settings', noDoc: true, tip: '열기 및 저장·화면표시·선택·제도 설정 (OP)' },
            { cmd: 'SYSVDLG', label: '시스템 변수', icon: 'list', noDoc: true, tip: '시스템 변수 찾기·편집 (SYSVDLG)' },
            { cmd: 'ALIASEDIT', label: '별칭 편집', icon: 'text', noDoc: true, tip: '명령 별칭 추가·편집 (ALIASEDIT)' },
          ],
        ],
      },
    ],
  },
  {
    tab: '출력',
    panels: [
      {
        title: '플롯',
        large: [
          { cmd: 'PLOT', label: '플롯', icon: 'print', tip: '용지·축척·플롯 스타일을 골라 PDF로 출력 (Ctrl+P)' },
          { cmd: 'PUBLISH', label: '게시', icon: 'exportPdf', tip: '열린 도면의 배치를 PDF 하나로 (PUBLISH)' },
          { cmd: 'ETRANSMIT', label: '전자 전송', icon: 'folder', tip: '도면과 참조 파일을 zip 하나로' },
        ],
        cols: [
          [
            { cmd: 'PAGESETUP', label: '페이지 설정 관리자', icon: 'paper', tip: '명명된 페이지 설정 만들기·고치기·현재로 설정 (PAGESETUP)' },
            { cmd: 'PSETUPIN', label: '페이지 설정 가져오기', icon: 'paper', tip: '다른 도면의 페이지 설정 가져오기 (PSETUPIN)' },
            { cmd: 'PLOTSTAMP', label: '플롯 스탬프', icon: 'settings', tip: '출력에 도면 이름·날짜 등을 찍기 (PLOTSTAMP)' },
            { cmd: 'PLOTSTYLE', label: '플롯 스타일', icon: 'props', tip: '객체의 이름 있는 플롯 스타일 (PLOTSTYLE)' },
          ],
          [
            { cmd: 'CONVERTCTB', label: 'CTB→STB', icon: 'paper', tip: '색상 종속 플롯 스타일 표를 이름 있는 표로 (CONVERTCTB)' },
            { cmd: 'CONVERTPSTYLES', label: '스타일 모드 변환', icon: 'paper', tip: '도면을 색상 종속 ↔ 이름 있는 플롯 스타일로 (CONVERTPSTYLES)' },
          ],
        ],
      },
      {
        title: '내보내기',
        large: [
          { cmd: 'EXPORT', label: '내보내기', icon: 'save', tip: '형식을 골라 내보내기 (EXP)' },
          { cmd: 'PNGOUT', label: 'PNG', icon: 'exportPng', tip: '지금 화면을 이미지로 저장' },
          { cmd: 'SVGOUT', label: 'SVG', icon: 'exportSvg', tip: '지금 공간을 벡터 그림으로 저장' },
        ],
        cols: [
          [
            { cmd: 'JPGOUT', label: 'JPEG', icon: 'exportPng', tip: '지금 화면을 JPEG로 저장' },
            { cmd: 'BMPOUT', label: 'BMP', icon: 'exportPng', tip: '지금 화면을 비트맵으로 저장' },
            { cmd: 'WMFOUT', label: 'WMF', icon: 'exportSvg', tip: '고른 객체를 Windows 메타파일로 (WMFOUT)' },
          ],
        ],
      },
    ],
  },
  {
    tab: '공동 작업',
    panels: [
      {
        title: '비교',
        large: [{ cmd: 'COMPARE', label: '도면 비교', icon: 'layers', tip: '두 도면의 차이를 색과 구름형 리비전으로 (COMPARE)' }],
        cols: [
          [
            { cmd: 'COMPAREIMPORT', label: '객체 가져오기', icon: 'insert', tip: '비교 도면의 객체를 이 도면으로' },
            { cmd: 'COMPAREEXPORT', label: '스냅샷 내보내기', icon: 'save', tip: '비교 결과를 새 도면으로' },
            { cmd: 'COMPARECLOSE', label: '비교 닫기', icon: 'close', tip: '비교 표시를 끝냄' },
          ],
        ],
      },
      {
        title: '외부 참조 비교',
        large: [{ cmd: 'XCOMPARE', label: '외부 참조 비교', icon: 'layers', tip: '다시 불러온 외부 참조의 바뀐 곳을 색과 구름형 리비전으로 (XCOMPARE)' }],
        cols: [[{ cmd: 'XCOMPARECLOSE', label: '비교 닫기', icon: 'close', tip: '외부 참조 비교 끝내기' }]],
      },
    ],
  },
  {
    tab: 'Express Tools',
    panels: [
      {
        title: '문자',
        large: [{ cmd: 'TCASE', label: '대소문자', icon: 'text', tip: '문자의 대소문자 바꾸기 (TCASE)' }],
        cols: [
          [
            { cmd: 'TCOUNT', label: '번호 매기기', icon: 'list', tip: '고른 문자에 차례 번호 (TCOUNT)' },
            { cmd: 'TORIENT', label: '방향 맞추기', icon: 'rotate', tip: '문자를 읽기 쉬운 방향으로 (TORIENT)' },
            { cmd: 'TEXTFIT', label: '폭 맞춤', icon: 'scale', tip: '문자 폭을 끝점에 맞춤 (TEXTFIT)' },
          ],
          [
            { cmd: 'TEXTMASK', label: '문자 가리기', icon: 'background', tip: '문자 뒤에 가리개 (TEXTMASK)' },
            { cmd: 'TEXTUNMASK', label: '가리기 해제', icon: 'eyeOff', tip: '문자 가리개 지우기 (TEXTUNMASK)' },
            { cmd: 'TCIRCLE', label: '문자 둘레', icon: 'circle', tip: '문자 둘레에 원·슬롯·사각형 (TCIRCLE)' },
          ],
          [
            { cmd: 'TXTEXP', label: '문자 분해', icon: 'explode', tip: '문자를 폴리선 형상으로 (TXTEXP)' },
            { cmd: 'ARCTEXT', label: '원호 정렬 문자', icon: 'arc', tip: '호를 따라 놓인 문자 (ARCTEXT)' },
            { cmd: 'TXT2MTXT', label: '여러 줄로', icon: 'mtext', tip: '단일 행 문자를 여러 줄 문자로 (TXT2MTXT)' },
          ],
        ],
      },
      {
        title: '블록',
        cols: [
          [
            { cmd: 'GATTE', label: '전체 속성 편집', icon: 'insert', tip: '모든 블록 참조의 속성 값을 한 번에 (GATTE)' },
            { cmd: 'NCOPY', label: '중첩 복사', icon: 'copy', tip: '블록·외부 참조 안의 객체 복사 (NCOPY)' },
            { cmd: 'XLIST', label: '중첩 객체 정보', icon: 'info', tip: '블록·외부 참조 안 객체의 특성 (XLIST)' },
          ],
          [
            { cmd: 'BURST', label: '분해(속성 유지)', icon: 'explode', tip: '속성을 문자로 남기고 분해 (BURST)' },
            { cmd: 'BLOCKREPLACE', label: '블록 대체', icon: 'block', tip: '블록 참조를 다른 블록으로 (BLOCKREPLACE)' },
          ],
        ],
      },
      {
        title: '수정',
        cols: [
          [
            { cmd: 'MPEDIT', label: '다중 폴리선 편집', icon: 'pline', tip: '여러 객체를 한 번에 PEDIT (MPEDIT)' },
            { cmd: 'EXOFFSET', label: '확장 간격띄우기', icon: 'offset', tip: '도면층·간격 유형·결합 옵션 (EXOFFSET)' },
            { cmd: 'BREAKLINE', label: '끊기선', icon: 'break', tip: '끊기선 기호 그리기 (BREAKLINE)' },
          ],
          [
            { cmd: 'FLATTEN', label: '평면화', icon: 'model', tip: 'Z·고도·두께를 0으로 (FLATTEN)' },
            { cmd: 'EXTRIM', label: '경계로 자르기', icon: 'trim', tip: '닫힌 경계 안·밖을 자름 (EXTRIM)' },
            { cmd: 'OVERKILL', label: '중복 삭제', icon: 'erase', tip: '겹친 객체 지우기 (OVERKILL)' },
          ],
        ],
      },
      {
        title: '선택',
        cols: [
          [
            { cmd: 'SSX', label: '특성으로 선택', icon: 'selectAll', tip: '기준 객체와 같은 특성으로 선택 (SSX)' },
            { cmd: 'GETSEL', label: '도면층·유형 선택', icon: 'layers', tip: '도면층과 객체 유형으로 선택 (GETSEL)' },
          ],
        ],
      },
      {
        title: '도구',
        cols: [
          [
            { cmd: 'CDORDER', label: '색상 순서', icon: 'drawOrder', tip: '색상 순서로 그리기 순서 (CDORDER)' },
            { cmd: 'MKLTYPE', label: '선종류 만들기', icon: 'line', tip: '고른 형상으로 선종류 정의 (MKLTYPE)' },
            { cmd: 'SHOWURLS', label: 'URL 목록', icon: 'find', tip: '하이퍼링크 목록·편집 (SHOWURLS)' },
          ],
          [
            { cmd: 'REDIR', label: '경로 바꾸기', icon: 'folder', tip: '외부 참조·이미지·글꼴 경로 (REDIR)' },
            { cmd: 'XDLIST', label: '확장 데이터', icon: 'id', tip: '객체의 확장 데이터 보기 (XDLIST)' },
          ],
        ],
      },
    ],
  },
];

/** 이보다 큰 파일은 열기 전에 시간·메모리를 알린다 */
const BIG_FILE_BYTES = 100 * 1024 * 1024;

/**
 * from 다음의 Tab 차례 요소에 초점을 준다(283차 — 접힌 리본 패널 팝업 끝에서 Tab): 문서 차례로 from 뒤의 보이는 켜진 컨트롤(focusables) 가운데
 * tabindex -1(로빙 tabindex로 비운 탭·메뉴 항목)과 skip(팝업) 안을 뺀 첫 요소 — 조상이 숨어 초점을 받지 못하면 그다음으로(브라우저 Tab 차례와 같은 셈). 준 곳이 없으면 false
 */
function focusAfter(from: HTMLElement, skip: Element): boolean {
  const all = focusables(document).filter((el) => el.tabIndex >= 0 && !skip.contains(el));
  const i = all.indexOf(from);
  if (i < 0) return false;
  for (const el of all.slice(i + 1)) {
    el.focus();
    if (document.activeElement === el) return true;
  }
  return false;
}

export class Shell implements UiHooks {
  private readonly title: HTMLDivElement;
  private readonly ribbonTabs: HTMLDivElement;
  private readonly ribbon: HTMLDivElement;
  private readonly fileTabs: HTMLDivElement;
  readonly drawingHost: HTMLDivElement;
  private readonly start: HTMLDivElement;
  private readonly busy: HTMLDivElement;
  private readonly busyText: HTMLDivElement;
  private readonly busyBar: HTMLDivElement;
  private readonly layoutTabs: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly coords: HTMLSpanElement;
  private readonly fileInput: HTMLInputElement;
  private activeTab = 0;
  private app!: App;
  palette!: Palette;
  /** 휴대폰 보기 모드(보기 단추 줄·측정 띠·정보 카드) */
  mobile!: MobileView;
  readonly recent = new RecentStore();
  private readonly workspace: HTMLElement;
  private readonly guide: HTMLElement | null;
  private readonly root: HTMLElement;
  /** 리본을 작업 영역 위에 겹쳐 펼치는 배치(좁거나 낮은 화면) */
  private overlayMode = false;
  /** 넓은 화면에서 사용자가 리본을 접어 두었는지 */
  private wideCollapsed = false;

  constructor(root: HTMLElement) {
    this.root = root;
    // Keep the same useful guide for static crawlers and the running start screen.
    this.guide = root.querySelector<HTMLElement>('#viewer-guide');
    // 손가락 기기(휴대폰)는 확장자만 적은 accept를 시스템 형식으로 못 바꾸면 .dwg·.dxf를 흐리게 막는다(iOS) — 거르지 않고 연 뒤 알린다
    this.fileInput = h('input', { type: 'file', accept: isCoarse() ? undefined : '.dxf,.dwg,.scr,.lsp,.mnl,.DXF,.DWG,.SCR,.LSP,.MNL', multiple: true, hidden: true });
    this.title = h('div', { class: 'titlebar' });
    this.ribbonTabs = h('div', { class: 'ribbon-tabs', role: 'tablist' });
    this.ribbon = h('div', { class: 'ribbon', id: 'ribbon-panel', role: 'tabpanel' });
    this.fileTabs = h('div', { class: 'filetabs', role: 'group', 'aria-label': '열린 도면 목록' });
    this.workspace = h('main', { class: 'workspace' });
    this.drawingHost = h('div', { style: 'position:relative;display:flex;flex:1;min-width:0' });
    this.start = h('div', { class: 'start' });
    this.busyText = h('div');
    this.busyBar = h('div');
    this.busy = h('div', { class: 'busy', hidden: true }, h('div', { class: 'busy-box' }, this.busyText, h('div', { class: 'bar' }, this.busyBar)));
    this.drawingHost.append(this.start, this.busy);
    this.workspace.append(this.drawingHost);
    this.layoutTabs = h('div', { class: 'layouttabs' });
    // 도움말 "상태 막대의 좌표 표시 바꾸기": 점을 물을 때 좌표 표시를 누르면(또는 Ctrl+I) 표시 방식(COORDS)을 돌린다
    this.coords = h('span', { class: 'coords', title: '좌표 (Ctrl+I) · 점을 지정할 때 누르면 표시 방식(COORDS)을 바꿉니다' });
    this.coords.addEventListener('click', () => {
      if (this.app?.pendingInput?.kind === 'point') this.app.cycleCoords();
    });
    this.status = h('div', { class: 'statusbar' });
    root.replaceChildren(this.title, this.ribbonTabs, this.ribbon, this.fileTabs, this.workspace, this.layoutTabs, this.status, this.fileInput);
    this.fileInput.addEventListener('change', () => {
      const files = [...(this.fileInput.files ?? [])];
      this.fileInput.value = '';
      void this.openFiles(files);
    });
    // 끌어다 놓기(어디에나)
    window.addEventListener('dragover', (ev) => {
      ev.preventDefault();
      this.start.querySelector('.dropzone')?.classList.add('drag');
    });
    window.addEventListener('dragleave', () => this.start.querySelector('.dropzone')?.classList.remove('drag'));
    window.addEventListener('drop', (ev) => {
      ev.preventDefault();
      this.start.querySelector('.dropzone')?.classList.remove('drag');
      const files = [...(ev.dataTransfer?.files ?? [])];
      if (files.length) void this.openFiles(files);
    });
  }

  attach(app: App): void {
    this.app = app;
    // 좁거나 낮은 화면에서는 리본을 접어 두고, 탭을 누르면 작업 영역 위에 겹쳐 펼친다
    this.applyLayout();
    let rt = 0;
    window.addEventListener('resize', () => {
      this.applyLayout();
      clearTimeout(rt);
      rt = window.setTimeout(() => {
        this.buildRibbon();
        this.fitStatus();
      }, 150);
    });
    for (const el of [this.ribbonTabs, this.fileTabs, this.layoutTabs, this.status]) wheelToHorizontal(el);
    new ResizeObserver(() => this.scheduleFitStatus()).observe(this.status);
    watchViewport(this.workspace);
    this.palette = new Palette(app, this.workspace);
    this.mobile = new MobileView(
      app,
      {
        openPalette: (tab) => this.openPalette(tab),
        closePalette: () => this.palette.close(),
        modeChanged: () => {
          this.applyLayout();
          this.scheduleFitStatus();
        },
      },
      this.root,
    );
    this.root.insertBefore(this.mobile.bar, this.ribbonTabs);
    this.drawingHost.append(this.mobile.card);
    // 도면 위 측정 결과 글·커서 툴팁이 비킬 판: 측정 띠·정보 카드, 휴대폰의 특성 시트(넓은 화면 옆 창은 보기와 겹치지 않아 빠진다)
    app.coverEls.push(this.mobile.card, this.palette.el);
    this.mobile.apply(startInViewMode(readMobileMode(), isCoarse(), window.innerWidth, window.innerHeight));
    this.buildTitle();
    this.buildRibbon();
    this.buildStatus();
    this.buildStart();
    this.refreshTabs();
    this.refreshLayouts();
  }

  pickFiles(): void {
    this.fileInput.click();
  }

  async openFiles(files: File[]): Promise<void> {
    for (const f of files) {
      // 휴대폰 보기 모드는 보기만(250차): 스크립트·AutoLISP는 명령을 돌려 도면을 고칠 수 있어 돌리지 않고 알린다.
      // 끌어 놓기·파일 고르기·홈 화면 공유가 모두 이 길이다. 도면 파일(새 도면 탭)은 그대로 연다
      if (this.app.viewOnly && /\.(scr|lsp|mnl)$/i.test(f.name)) {
        toast('휴대폰 보기 모드에서는 스크립트·AutoLISP 파일을 실행하지 않습니다. 편집 화면(제목 막대의 연필 단추)에서 여십시오.', 'warn');
        continue;
      }
      // 스크립트 파일은 도면으로 열지 않고 명령행에 차례로 넣는다
      if (/\.scr$/i.test(f.name)) {
        await runScriptFile(this.app, f);
        continue;
      }
      // AutoLISP 파일은 읽어 평가한다(APPLOAD와 같다)
      if (/\.(lsp|mnl)$/i.test(f.name)) {
        await loadLispFile(this.app, f);
        continue;
      }
      // 크기로 막지 않고 기기가 잡을 수 있는 만큼 연다. 아주 큰 파일은 미리 알린다(휴대폰은 메모리가 모자라면 탭째 닫힐 수 있다)
      if (f.size > BIG_FILE_BYTES) toast(`큰 파일(${formatBytes(f.size)})이라 여는 데 시간이 걸리고 메모리를 많이 씁니다. 다른 탭을 닫아 두면 좋습니다.`, 'warn', 8000);
      const attempt = beginOpen('local', f.name.split('.').pop() ?? 'other');
      let buf: ArrayBuffer;
      try {
        buf = await f.arrayBuffer();
      } catch (e) {
        attempt.error('read_error');
        // 큰 파일을 못 읽는 것은 대개 메모리 때문이다. 파일이 없어졌으면 크기와 상관없이 위치를 확인하게 한다
        const gone = e instanceof DOMException && e.name === 'NotFoundError';
        this.app.reportOpenError(f.name, openErrorInfo(f.size > BIG_FILE_BYTES && !gone ? 'memory' : 'read'));
        continue;
      }
      // 작업자로 넘기면 buf가 비므로 최근 문서에 넣을 파일만 복사한다. 큰 파일까지 복사하면 메모리를 두 배로 쓴다
      const copy = buf.byteLength <= RECENT_MAX_SIZE ? buf.slice(0) : null;
      const st = await this.app.openFile(f.name, buf, 'local', attempt);
      if (st && copy) void this.recent.add(f.name, copy).then(() => this.refreshRecent());
    }
  }

  // -------------------------------------------------------------------------

  private buildTitle(): void {
    const app = this.app;
    // 메뉴를 연다고·열림 상태를 알린다(263차 — 253차 휴대폰 더 보기·254차 상태 막대 「⋯」 꼴, WCAG 4.1.2): 처음 false, 열면 true, 어떻게 닫히든 onClose로 false.
    // 리본 펼침 단추·객체 스냅 「▾」·주석 축척 단추도 같다
    const appBtn = h('button', { class: 'app-button', title: '응용프로그램 메뉴', 'aria-label': '응용프로그램 메뉴', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, 'A');
    appBtn.addEventListener('click', () => {
      const r = appBtn.getBoundingClientRect();
      // 메뉴 단추(이 단추·리본 펼침·상태 막대 「⋯」·「▾」·주석 축척·휴대폰 더 보기)는 연 단추를 넘긴다: 누르기로 연 메뉴도 첫 항목에 초점을 두고(ui/dom.ts showMenu),
      // 닫으면 이 단추로 — 누른 단추가 초점을 받지 않는 Safari·iOS에서도(262차)
      showMenu(r.left, r.bottom + 2, [
        { label: '새로 만들기', icon: 'new', kbd: 'Ctrl+N', run: () => void app.run('NEW') },
        { label: '열기…', icon: 'open', kbd: 'Ctrl+O', run: () => this.pickFiles() },
        { label: '예제 도면 열기', icon: 'sample', run: () => void this.openSample() },
        { separator: true },
        { label: '저장', icon: 'save', kbd: 'Ctrl+S', disabled: !app.active, run: () => void app.run('QSAVE') },
        { label: '다른 이름으로 저장…', icon: 'save', kbd: 'Ctrl+Shift+S', disabled: !app.active, run: () => void app.run('SAVEAS') },
        { label: '도면 복구 관리자…', icon: 'folder', run: () => void app.run('DRAWINGRECOVERY') },
        { label: '복구(파일 열고 검사)…', icon: 'open', run: () => void app.run('RECOVER') },
        { separator: true },
        { label: 'PNG로 내보내기', icon: 'exportPng', disabled: !app.active, run: () => void app.run('PNGOUT') },
        { label: 'SVG로 내보내기', icon: 'exportSvg', disabled: !app.active, run: () => void app.run('SVGOUT') },
        { label: '플롯(PDF)…', icon: 'print', kbd: 'Ctrl+P', disabled: !app.active, run: () => void app.run('PLOT') },
        { label: '게시(배치를 PDF로)…', icon: 'exportPdf', disabled: !app.active, run: () => void app.run('PUBLISH') },
        { separator: true },
        { label: '도면 특성…', icon: 'props', disabled: !app.active, run: () => void app.run('DWGPROPS') },
        { label: '도면 정보', icon: 'info', disabled: !app.active, run: () => void app.run('DWGINFO') },
        { label: '닫기', icon: 'close', disabled: !app.active, run: () => app.active && app.close(app.active) },
        { label: '모두 닫기', icon: 'close', disabled: !app.active, run: () => void app.run('CLOSEALL') },
        { label: '모두 저장', icon: 'save', disabled: !app.active, run: () => void app.run('SAVEALL') },
        { separator: true },
        { label: '옵션…', icon: 'settings', run: () => void app.run('OPTIONS') },
        // 좁은 휴대폰에서는 제목 막대의 테마 단추를 감추므로 여기서도 바꾼다
        colorTheme() === 1
          ? { label: '어두운 테마로 바꾸기', icon: 'moon', run: () => this.toggleTheme() }
          : { label: '밝은 테마로 바꾸기', icon: 'sun', run: () => this.toggleTheme() },
        { label: '단축키·도움말', icon: 'help', kbd: 'F1', run: () => void app.run('HELP') },
        // 다른 웹페이지에 넣은(iframe) 화면은 방문 통계를 켜지 않으므로 설정도 감춘다
        ...(isFramed() ? [] : [{ label: '방문 통계 설정', icon: 'settings', run: showAnalyticsSettings }]),
        { label: 'OpenCAD 정보', icon: 'info', run: () => void app.run('ABOUT') },
      ], { opener: appBtn, onClose: () => appBtn.setAttribute('aria-expanded', 'false') });
      // 연 뒤에 true(showMenu가 앞 메뉴를 닫으며 그 onClose를 먼저 부른다)
      appBtn.setAttribute('aria-expanded', 'true');
    });
    const qat = h(
      'div',
      { class: 'qat' },
      this.iconBtn('new', '새 도면 (Ctrl+N)', () => void app.run('NEW')),
      this.iconBtn('open', '열기 (Ctrl+O)', () => this.pickFiles()),
      this.iconBtn('save', '저장 (Ctrl+S)', () => void app.run('QSAVE')),
      this.iconBtn('undo', '명령 취소 (Ctrl+Z)', () => void app.run('U')),
      this.iconBtn('redo', '다시 실행 (Ctrl+Y)', () => void app.run('REDO')),
      this.iconBtn('print', 'PDF로 인쇄 (Ctrl+P)', () => void app.run('PLOT')),
    );
    const titleText = h('div', { class: 'title' }, h('b', {}, 'OpenCAD'), ' DWG·DXF');
    const right = h(
      'div',
      { class: 'title-right' },
      h('a', { class: 'portfolio-link', href: 'https://gyutae-kim.github.io/', title: '김규태 포트폴리오로 돌아가기' }, '← 포트폴리오'),
      // 손가락 기기: 휴대폰 보기 모드 ↔ 편집 화면
      h('button', { class: 'icon-btn mode-btn view-only', title: '편집 화면으로(리본·명령행)', 'aria-label': '편집 화면으로', html: icon('pencil'), onclick: () => this.mobile.setMode('edit') }),
      h('button', { class: 'icon-btn mode-btn edit-only', title: '휴대폰 보기 모드로(보기·치수 확인)', 'aria-label': '휴대폰 보기 모드로', html: icon('eye'), onclick: () => this.mobile.setMode('view') }),
      this.themeButton(),
      this.iconBtn('help', '도움말 (F1)', () => void app.run('HELP')),
      this.iconBtn('fullscreen', '전체 화면', () => void app.run('FULLSCREEN')),
    );
    // 전체 화면을 못 쓰는 브라우저(iPhone Safari)에서는 단추를 감춘다
    const fs = right.lastElementChild as HTMLElement;
    if (document.fullscreenEnabled === false || typeof document.documentElement.requestFullscreen !== 'function') fs.hidden = true;
    this.title.append(appBtn, qat, titleText, right);
  }

  /** 화면 테마 단추(COLORTHEME): 누르면 밝게 ↔ 어둡게, 이 브라우저에 기억한다. 도면 영역 색은 그대로 */
  private themeButton(): HTMLButtonElement {
    const b = h('button', { type: 'button', class: 'icon-btn theme-btn' });
    const paint = () => {
      const light = colorTheme() === 1;
      const label = light ? '어두운 테마로 바꾸기' : '밝은 테마로 바꾸기';
      b.innerHTML = icon(light ? 'moon' : 'sun');
      b.title = label;
      b.setAttribute('aria-label', label);
    };
    b.addEventListener('click', () => this.toggleTheme());
    window.addEventListener(THEME_EVENT, paint);
    paint();
    return b;
  }

  private toggleTheme(): void {
    setColorTheme(colorTheme() === 1 ? 0 : 1);
    this.app.view.requestOverlay();
  }

  private iconBtn(name: string, label: string, run: () => void): HTMLButtonElement {
    return h('button', { class: 'icon-btn', title: label, 'aria-label': label, html: icon(name), onclick: run });
  }

  /** 창 크기에 맞춰 배치 클래스를 붙이고, 겹침 리본으로 바뀌거나 돌아올 때 펼침 상태를 맞춘다 */
  private applyLayout(): void {
    const w = window.innerWidth;
    const hgt = window.innerHeight;
    const want = layoutClasses(w, hgt);
    for (const c of [...this.root.classList]) if ((c.startsWith('layout-') || c === 'ribbon-overlay') && !want.includes(c)) this.root.classList.remove(c);
    this.root.classList.add(...want);
    const overlay = ribbonOverlay(w, hgt);
    if (overlay === this.overlayMode) return;
    this.overlayMode = overlay;
    // 겹침 리본은 닫힌 채로 시작하고, 넓은 화면으로 돌아오면 사용자가 고른 상태로
    this.setRibbonOpen(overlay ? false : !this.wideCollapsed);
  }

  private ribbonOpen(): boolean {
    return !this.ribbon.classList.contains('collapsed');
  }

  private offRibbon: ((ev: Event) => void) | null = null;

  /** 리본 펼치기·접기. 겹침 리본은 바깥을 누르면 닫힌다 */
  private setRibbonOpen(open: boolean): void {
    this.ribbon.classList.toggle('collapsed', !open);
    if (!this.overlayMode) this.wideCollapsed = !open;
    if (this.offRibbon) {
      window.removeEventListener('pointerdown', this.offRibbon, true);
      window.removeEventListener('keydown', this.offRibbon, true);
      this.offRibbon = null;
    }
    if (open && this.overlayMode) {
      this.offRibbon = (ev: Event) => {
        if (ev.type === 'keydown') {
          if ((ev as KeyboardEvent).key === 'Escape' && !document.querySelector('.menu')) this.setRibbonOpen(false);
          return;
        }
        const t = ev.target as Element | null;
        if (t?.closest?.('.ribbon, .ribbon-tabs, .menu, .ribbon-pop, .dialog-back, .colorpick')) return;
        // 도면을 눌러 리본을 닫을 때는 그 누름으로 객체를 고르거나 점을 찍지 않는다
        if (t?.closest?.('.drawing')) ev.stopPropagation();
        this.setRibbonOpen(false);
      };
      window.addEventListener('pointerdown', this.offRibbon, true);
      window.addEventListener('keydown', this.offRibbon, true);
    }
  }

  /** 겹침 리본에서 명령을 고르면 리본을 닫아 도면을 보이게 한다 */
  private afterRibbonCommand(): void {
    if (this.overlayMode) this.setRibbonOpen(false);
  }

  private buildRibbon(): void {
    // 펼친 접힌 패널 팝업은 연 단추가 새로 바뀌므로 닫는다(282차 — 전에는 팝업과 바깥 누르기 지켜보기가 남았다). 초점이 그 팝업 안이었으면
    // 다시 그린 뒤 같은 패널의 새 접힌 단추로, 그 패널이 더는 접히지 않으면(창이 넓어짐) 고른 리본 탭으로
    const open = this.foldedPop;
    const back = open?.pop.contains(document.activeElement) ? open.panel : null;
    this.closeFoldedPop(false);
    // 탭을 다시 만들어도 키보드 초점은 같은 자리의 탭에 남긴다
    const focusedTab = [...this.ribbonTabs.children].indexOf(document.activeElement as Element);
    this.ribbonTabs.innerHTML = '';
    RIBBON.forEach((t, i) => {
      const on = i === this.activeTab;
      const b = h('button', { type: 'button', class: `ribbon-tab ${on ? 'active' : ''}`, role: 'tab', id: `ribbon-tab-${i}`, 'aria-selected': on ? 'true' : 'false', 'aria-controls': 'ribbon-panel', tabindex: on ? 0 : -1 }, t.tab);
      b.addEventListener('click', () => {
        this.setRibbonOpen(this.activeTab === i ? !this.ribbonOpen() : true);
        this.activeTab = i;
        this.buildRibbon();
      });
      // 왼쪽·오른쪽 화살표·Home·End로 탭을 옮겨 다니고 Enter·Space로 연다(탭 목록은 Tab 한 번이면 지나간다).
      // 수정 키(Alt·Ctrl·Meta·Shift)와 함께 누른 키는 넘긴다(259차 — tabKeyTarget, 브라우저·앱 단축키 그대로)
      b.addEventListener('keydown', (ev) => {
        const to = tabKeyTarget(ev as KeyboardEvent, i, RIBBON.length);
        if (to < 0) return;
        ev.preventDefault();
        ev.stopPropagation();
        (this.ribbonTabs.children[to] as HTMLElement | undefined)?.focus();
      });
      b.addEventListener('dblclick', () => {
        if (this.overlayMode) return;
        this.setRibbonOpen(!this.ribbonOpen());
        this.buildRibbon();
      });
      this.ribbonTabs.append(b);
    });
    if (focusedTab >= 0) (this.ribbonTabs.children[focusedTab] as HTMLElement | undefined)?.focus({ preventScroll: true });
    revealX(this.ribbonTabs, this.ribbonTabs.children[this.activeTab] as HTMLElement | undefined ?? null);
    this.ribbon.setAttribute('aria-labelledby', `ribbon-tab-${this.activeTab}`);
    this.ribbon.innerHTML = '';
    const tab = RIBBON[this.activeTab]!;
    this.combos = null;
    const els = tab.panels.map((p) => {
      const el = this.panelElement(p);
      this.ribbon.append(el);
      return el;
    });
    // 자리가 모자라면 오른쪽 패널부터 단추 하나로 접는다(겹침 리본은 줄을 바꿔 다 보인다)
    let folds: HTMLDivElement[] = [];
    if (!this.overlayMode && this.ribbonOpen() && this.ribbon.scrollWidth > this.ribbon.clientWidth + 1) {
      const cs = getComputedStyle(this.ribbon);
      const avail = this.ribbon.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const full = els.map((e) => e.getBoundingClientRect().width);
      folds = tab.panels.map((p) => this.foldedPanel(p));
      for (const f of folds) this.ribbon.append(f);
      const folded = folds.map((f) => f.getBoundingClientRect().width);
      const k = foldCount(full, folded, avail);
      tab.panels.forEach((p, i) => {
        if (i < tab.panels.length - k) {
          folds[i]!.remove();
          return;
        }
        els[i]!.replaceWith(folds[i]!);
        // 접힌 패널의 고르기 상자는 펼칠 때 다시 만든다
        const cb = this.combos as Shell['combos'];
        if (cb && p.custom === 'layer') {
          delete cb.layer;
          delete cb.layerState;
        }
        if (cb && p.custom === 'props') {
          delete cb.color;
          delete cb.linetype;
          delete cb.lineweight;
        }
      });
    }
    if (back) {
      const f = folds[tab.panels.indexOf(back)];
      ((f?.isConnected ? f.querySelector<HTMLElement>('button.folded') : null) ?? (this.ribbonTabs.children[this.activeTab] as HTMLElement | undefined))?.focus({ preventScroll: true });
    }
    this.refreshRibbonState();
  }

  private panelBody(p: Panel): HTMLDivElement {
    const body = h('div', { class: 'rpanel-body' });
    for (const b of p.large ?? []) body.append(this.ribbonButton(b, true));
    if (p.custom === 'layer') body.append(this.layerCombo());
    if (p.custom === 'props') body.append(this.propCombos());
    for (const col of p.cols ?? []) body.append(h('div', { class: 'rbtn-col' }, ...col.map((b) => this.ribbonButton(b, false))));
    return body;
  }

  private panelElement(p: Panel): HTMLDivElement {
    return h('div', { class: 'rpanel' }, this.panelBody(p), h('div', { class: 'rpanel-title' }, p.title));
  }

  /** 펼친 접힌 패널 팝업(282차): 연 단추·그 패널·바깥 누르기 지켜보기. 닫기는 closeFoldedPop 하나로 모은다 */
  private foldedPop: { pop: HTMLElement; btn: HTMLButtonElement; panel: Panel; off: (ev: Event) => void } | null = null;

  /**
   * 접힌 패널 팝업 닫기 — 닫는 길(Esc·팝업 안 리본 단추·연 단추 다시 누르기·바깥 누르기·다른 접힌 패널 열기·리본 다시 그리기)이 모두 여기로 온다(282차):
   * 팝업을 지우고 바깥 누르기 지켜보기를 풀고 연 단추를 aria-expanded="false"로 둔다. back이면 초점이 팝업 안이었을 때 연 단추로 돌려준다 — 키보드로 열었으면 늘,
   * 손가락·마우스로 열어도 열 때 초점을 팝업 안으로 옮겼으므로(255차 시트·262차 메뉴 꼴, 돌려주지 않으면 팝업과 함께 본문으로 빠진다).
   * 바깥 누르기·다른 접힌 패널 열기는 누른 곳이 초점을 받으므로 돌려주지 않는다(262차 메뉴 꼴)
   */
  private closeFoldedPop(back: boolean): void {
    const f = this.foldedPop;
    if (!f) return;
    this.foldedPop = null;
    const inside = f.pop.contains(document.activeElement);
    window.removeEventListener('pointerdown', f.off, true);
    window.removeEventListener('click', f.off, true);
    // 팝업 안 펼침 단추(▾)로 연 메뉴가 열려 있으면 그 메뉴를 닫을 때 이 단추로 돌려준다(283차 — 282차 보고 (1): 연 단추가 팝업과 함께 문서에서 빠져 본문으로 갔다)
    moveMenuOpener(f.pop, f.btn);
    f.pop.remove();
    f.btn.setAttribute('aria-expanded', 'false');
    if (back && inside && f.btn.isConnected) f.btn.focus({ preventScroll: true });
  }

  /**
   * 접힌 패널: 누르면 패널 내용을 아래 팝업(role=dialog — 단추·고르기 상자가 섞인 패널이라 메뉴가 아님)으로 펼치고, 열린 채 다시 누르면 닫는다
   * (282차 — 263차 보고 (1), W3C APG 공개 단추 꼴: aria-haspopup="dialog"·aria-expanded. 전에는 "true"(= 메뉴)에 열림 상태가 없고, 다시 누르면 다시 열었다).
   * 열면 초점을 팝업의 첫 켜진 컨트롤로(켜진 것이 없으면 팝업 자체 — 263차 메뉴 꼴) 옮긴다 — 손가락·마우스로 열어도(262차 메뉴·255차 시트 꼴, 보이는 표시는 :focus-visible 규칙대로).
   * 팝업 안 Esc는 닫고 연 단추로(앱 취소로 넘기지 않음 — 255차 시트 꼴). 리본을 다시 그리면 buildRibbon이 닫는다.
   * Tab 차례는 팝업 내용이 연 단추 바로 뒤에 있는 것처럼(283차): 끝에서 Tab이면 닫고 연 단추 다음 요소로, 처음에서 Shift+Tab이면 닫고 연 단추로
   */
  private foldedPanel(p: Panel): HTMLDivElement {
    const ic = p.large?.[0]?.icon ?? p.cols?.[0]?.[0]?.icon ?? 'menu';
    const btn = h('button', { class: 'rbtn-lg folded', 'data-i18n-ui-copy': '', title: `${p.title} 패널 펼치기`, 'aria-haspopup': 'dialog', 'aria-expanded': 'false' }, iconSpan(ic), h('span', {}, `${p.title} ▾`));
    btn.addEventListener('click', () => {
      if (this.foldedPop?.btn === btn) {
        this.closeFoldedPop(true);
        return;
      }
      this.closeFoldedPop(false);
      const pop = h('div', { class: 'ribbon-pop', role: 'dialog', 'aria-label': p.title }, this.panelBody(p), h('div', { class: 'rpanel-title' }, p.title));
      document.body.append(pop);
      const r = btn.getBoundingClientRect();
      const pr = pop.getBoundingClientRect();
      pop.style.left = `${Math.max(4, Math.min(r.left, window.innerWidth - pr.width - 4))}px`;
      pop.style.top = `${r.bottom + 2}px`;
      this.refreshRibbonState();
      // 바깥 누르기는 닫는다. 팝업 안은 닫지 않고, 안 리본 단추만 그 단추의 click이 명령을 돌린 뒤 닫는다 — 전에는 누르기(pointerdown)에서 지울 차례를 잡아
      // 손을 뗄 때 그 단추가 문서에 없었다(click은 누른 곳·뗀 곳의 공통 조상으로 가 단추에 닿지 않을 수 있음). 연 단추는 제 click이 닫는다(토글).
      // 연 click은 창 capture 단계를 이미 지났으므로 곧바로 지켜본다
      const off = (ev: Event) => {
        const t = ev.target as Node;
        if (btn.contains(t)) return;
        if (!pop.contains(t)) {
          this.closeFoldedPop(false);
          return;
        }
        if (ev.type === 'click' && (t as HTMLElement).closest?.('button.rbtn-lg, button.rbtn-sm'))
          setTimeout(() => {
            if (this.foldedPop?.pop === pop) this.closeFoldedPop(true);
          }, 0);
      };
      pop.addEventListener('keydown', (ev) => {
        if (ev.defaultPrevented) return;
        if (ev.key === 'Escape') {
          ev.preventDefault();
          ev.stopPropagation();
          this.closeFoldedPop(true);
          return;
        }
        // Tab 차례(283차 — 282차 보고 (3)): 팝업은 본문 끝에 붙어, 끝 컨트롤에서 Tab이면 문서 끝(브라우저 화면)으로, 첫 컨트롤에서 Shift+Tab이면 문서의 앞 요소로 빠졌다.
        // 팝업 내용이 연 단추 바로 뒤에 있는 차례로 옮긴다 — 끝(켜진 컨트롤이 없으면 팝업 자체)에서 Tab이면 닫고 연 단추 다음 요소로, 처음(또는 팝업 자체)에서 Shift+Tab이면
        // 닫고 연 단추로(열어 두면 연 단추에서 다시 Tab이 문서 차례로 팝업을 건너뛴다 — 팝업은 초점이 안에 있는 동안만 연다). 연 단추 뒤가 문서 끝이면 연 단추로 두고
        // 기본 동작을 막지 않아 브라우저가 거기서 이어 옮긴다. 가운데 컨트롤·수정 키(Ctrl+Tab 다음 도면 등)·입력기 조합 중은 넘긴다
        if (ev.key !== 'Tab' || ev.altKey || ev.ctrlKey || ev.metaKey || ev.isComposing) return;
        const list = focusables(pop);
        const at = document.activeElement;
        if (!(ev.shiftKey ? at === pop || at === list[0] : at === (list[list.length - 1] ?? pop))) return;
        ev.stopPropagation();
        if (!ev.shiftKey && focusAfter(btn, pop)) {
          ev.preventDefault();
          this.closeFoldedPop(false);
          return;
        }
        if (ev.shiftKey) ev.preventDefault();
        this.closeFoldedPop(true);
      });
      window.addEventListener('pointerdown', off, true);
      window.addEventListener('click', off, true);
      this.foldedPop = { pop, btn, panel: p, off };
      btn.setAttribute('aria-expanded', 'true');
      const first = focusables(pop)[0];
      if (first) first.focus({ preventScroll: true });
      else {
        pop.tabIndex = -1;
        pop.focus({ preventScroll: true });
      }
    });
    return h('div', { class: 'rpanel' }, h('div', { class: 'rpanel-body' }, btn), h('div', { class: 'rpanel-title' }, p.title));
  }

  /** 리본의 고르기 상자들 */
  combos: { layer?: HTMLSelectElement; layerState?: HTMLSelectElement; color?: HTMLButtonElement; linetype?: HTMLSelectElement; lineweight?: HTMLSelectElement } | null = null;

  private layerCombo(): HTMLElement {
    const sel = h('select', { 'aria-label': '도면층', title: '현재 도면층 (객체를 고르면 그 객체의 도면층)' }) as HTMLSelectElement;
    sel.addEventListener('change', () => {
      const app = this.app;
      const st = app.active;
      if (!st || !sel.value) return;
      if (st.selection.size) applyField(app, [...st.selection], GENERAL_FIELDS[0]!, sel.value);
      else setCurrentLayer(app, sel.value);
      this.refreshRibbonState();
    });
    // 도면층 상태: 고르면 복원, 끝의 두 항목은 새 상태·관리자
    const ls = h('select', { 'aria-label': '도면층 상태', title: '도면층 상태 (고르면 복원)' }) as HTMLSelectElement;
    ls.addEventListener('change', async () => {
      const app = this.app;
      const v = ls.value;
      ls.value = '';
      if (!app.active || !v) return;
      if (v === '\u0001new') await newLayerState(app);
      else if (v === '\u0001manage') await app.run('LAYERSTATE');
      else if (restoreLayerStateNamed(app, v)) app.cmd.print(`도면층 상태 "${v}"을(를) 복원했습니다.`);
      this.refreshRibbonState();
    });
    this.combos = { ...(this.combos ?? {}), layer: sel, layerState: ls };
    return h('div', { class: 'rprop-col' }, h('label', { class: 'rprop' }, iconSpan('layers'), sel), h('label', { class: 'rprop' }, iconSpan('layerAll'), ls));
  }

  private propCombos(): HTMLElement {
    const app = this.app;
    const color = h('button', { class: 'rprop-color', 'aria-label': '색', title: '색 (객체를 고르면 그 객체의 색)' }) as HTMLButtonElement;
    color.addEventListener('click', async () => {
      const st = app.active;
      if (!st) return;
      const sel = [...st.selection].map((x) => st.doc.entityIndex.get(x)).filter((e): e is Entity => !!e);
      const cur = sel.length ? commonValue(GENERAL_FIELDS[1]!, sel).value as CadColor | undefined : currentColor(st.doc);
      const c = await pickColor(cur ?? { aci: 256 }, { allowBy: true });
      if (!c) return;
      if (sel.length) applyField(app, sel.map((e) => e.handle), GENERAL_FIELDS[1]!, c);
      else this.setHeader('$CECOLOR', colorToHeader(c));
      this.refreshRibbonState();
    });
    const lt = h('select', { 'aria-label': '선종류', title: '선종류' }) as HTMLSelectElement;
    lt.addEventListener('change', () => {
      const st = app.active;
      if (!st || !lt.value) return;
      if (st.selection.size) applyField(app, [...st.selection], GENERAL_FIELDS[2]!, lt.value);
      else this.setHeader('$CELTYPE', lt.value);
    });
    const lw = h('select', { 'aria-label': '선가중치', title: '선가중치' }) as HTMLSelectElement;
    lw.addEventListener('change', () => {
      const st = app.active;
      if (!st || !lw.value) return;
      if (st.selection.size) applyField(app, [...st.selection], GENERAL_FIELDS[4]!, lw.value);
      else this.setHeader('$CELWEIGHT', Number(lw.value));
    });
    this.combos = { ...(this.combos ?? {}), color, linetype: lt, lineweight: lw };
    return h(
      'div',
      { class: 'rprop-col' },
      h('div', { class: 'rprop' }, iconSpan('background'), color),
      h('label', { class: 'rprop' }, iconSpan('dimlist'), lt),
      h('label', { class: 'rprop' }, iconSpan('lineweight'), lw),
    );
  }

  private setHeader(name: string, after: string | number): void {
    const st = this.app.active;
    if (!st) return;
    const before = st.doc.header.get(name);
    if (before === after) return;
    st.session.commit({ label: 'SETVAR', ops: [{ kind: 'header', name, before, after }] });
  }

  /** 리본 고르기 상자에 지금 값(고른 객체가 있으면 그 값)을 보인다 */
  private refreshCombos(): void {
    const c = this.combos;
    const st = this.app?.active;
    if (!c) return;
    const fill = (sel: HTMLSelectElement, opts: { value: string; label: string }[], value: string | undefined, varies: boolean) => {
      const key = JSON.stringify(opts) + String(varies);
      if (sel.dataset.key !== key) {
        sel.innerHTML = '';
        if (varies) sel.append(h('option', { value: '' }, '*여러 개*'));
        for (const o of opts) sel.append(h('option', { value: o.value }, o.label));
        sel.dataset.key = key;
      }
      const m = opts.find((o) => o.value.toUpperCase() === (value ?? '').toUpperCase());
      sel.value = varies ? '' : (m?.value ?? '');
    };
    for (const el of [c.layer, c.layerState, c.color, c.linetype, c.lineweight]) if (el) el.disabled = !st;
    if (c.layerState) {
      const names = st ? layerStateNames(this.app) : [];
      const opts = [{ value: '', label: names.length ? '도면층 상태 고르기' : '저장된 도면층 상태 없음' }, ...names.map((n) => ({ value: n, label: n })), { value: '\u0001new', label: '새 도면층 상태…' }, { value: '\u0001manage', label: '도면층 상태 관리…' }];
      fill(c.layerState, opts, '', false);
    }
    if (!st) {
      if (c.color) c.color.textContent = '';
      return;
    }
    const sel = [...st.selection].map((x) => st.doc.entityIndex.get(x)).filter((e): e is Entity => !!e);
    const pick = (f: Field, cur: unknown) => (sel.length ? commonValue(f, sel) : { value: cur, varies: false });
    const hdr = st.doc.header;
    if (c.layer) {
      const v = pick(GENERAL_FIELDS[0]!, currentLayer(this.app));
      fill(c.layer, GENERAL_FIELDS[0]!.options!(st.doc), v.value as string | undefined, v.varies);
    }
    if (c.color) {
      const v = pick(GENERAL_FIELDS[1]!, currentColor(st.doc));
      const col = v.value as CadColor | undefined;
      const rgb = col ? (col.rgb !== undefined && col.aci !== 0 && col.aci !== 256 ? col.rgb : col.aci > 0 && col.aci < 256 ? aciToRgb(col.aci, true) : null) : null;
      c.color.innerHTML = '';
      c.color.append(h('span', { class: 'swatch', style: rgb === null ? 'background:transparent' : `background:${rgbToCss(rgb)}` }), v.varies ? '*여러 개*' : col ? colorText(col) : '');
    }
    if (c.linetype) {
      const v = pick(GENERAL_FIELDS[2]!, String(hdr.get('$CELTYPE') ?? 'ByLayer'));
      fill(c.linetype, GENERAL_FIELDS[2]!.options!(st.doc), v.value as string | undefined, v.varies);
    }
    if (c.lineweight) {
      const v = pick(GENERAL_FIELDS[4]!, String(hdr.get('$CELWEIGHT') ?? -1));
      fill(c.lineweight, GENERAL_FIELDS[4]!.options!(st.doc), v.value as string | undefined, v.varies);
    }
  }

  private ribbonButton(b: Btn, large: boolean): HTMLButtonElement {
    // 펼침 메뉴가 있는 단추는 메뉴 단추(263차 — 응용프로그램 메뉴 A 꼴: aria-haspopup, 열림 상태 aria-expanded). 메뉴 없는 단추는 그대로
    const el = h(
      'button',
      {
        class: large ? 'rbtn-lg' : 'rbtn-sm',
        title: b.tip ?? b.label,
        'data-tip': b.tip ?? b.label,
        'data-cmd': b.cmd ?? '',
        'data-nodoc': b.noDoc ? '1' : '',
        'aria-haspopup': b.menu ? 'menu' : undefined,
        'aria-expanded': b.menu ? 'false' : undefined,
      },
      iconSpan(b.icon),
      large ? h('span', {}, b.label) : b.label,
    );
    el.addEventListener('click', () => {
      if (b.menu) {
        const r = el.getBoundingClientRect();
        const go = (cmd: string) => {
          this.afterRibbonCommand();
          void this.runCmd(cmd);
        };
        showMenu(r.left, r.bottom + 2, [
          ...b.menu.map((m) => ({ label: m.label, icon: m.icon, run: () => go(m.cmd) })),
          { separator: true },
          { label: `${b.label} (${b.cmd})`, icon: b.icon, run: () => go(b.cmd!) },
        ], { opener: el, onClose: () => el.setAttribute('aria-expanded', 'false') });
        el.setAttribute('aria-expanded', 'true');
        return;
      }
      this.afterRibbonCommand();
      if (b.run) b.run();
      else if (b.cmd) void this.runCmd(b.cmd);
    });
    return el;
  }

  private runCmd(s: string): Promise<void> {
    const [name, ...rest] = s.split(' ');
    return this.app.run(name!, rest.length ? rest.join(' ') : undefined);
  }

  private refreshRibbonState(): void {
    const has = !!this.app?.active;
    for (const el of document.querySelectorAll<HTMLButtonElement>('.ribbon button[data-cmd], .ribbon-pop button[data-cmd]')) {
      const c = el.dataset.cmd ?? '';
      const known = !c || !!this.app?.findCommand(c.split(' ')[0]!);
      el.disabled = (!has && !el.dataset.nodoc) || !known;
      // 명령이 아직 없으면 "준비 중"을 붙이고, 명령이 생기면(편집기 모듈을 늦게 불러온 뒤) 원래 풍선 도움말로 되돌린다
      // (번역된 화면에서는 title이 번역문이라 견주지 않고, 마지막으로 쓴 상태만 기억한다)
      const ready = known ? '1' : '0';
      if (el.dataset.ready !== ready) {
        el.dataset.ready = ready;
        el.title = ribbonTip(el.dataset.tip ?? el.title.replace(/ — 준비 중$/, ''), known);
      }
      if (c === 'LWDISPLAY') el.classList.toggle('on', this.app.view.lwDisplay);
    }
    this.refreshCombos();
  }

  // -------------------------------------------------------------------------
  // 탭
  // -------------------------------------------------------------------------

  refreshTabs(): void {
    const app = this.app;
    // 다시 만들어도 키보드 초점은 같은 자리의 탭(이름 단추·닫기 단추)에 남긴다
    const focusables = () => [...this.fileTabs.querySelectorAll<HTMLElement>('.filetab-open, .filetab .x')];
    const focusedAt = focusables().indexOf(document.activeElement as HTMLElement);
    this.fileTabs.innerHTML = '';
    // 탭 하나 = 여는 단추 + 닫기 단추(나란한 두 단추라 키보드·화면 읽기 프로그램에서 겹친 컨트롤이 되지 않는다). 지금 탭은 aria-current
    const tab = (label: Node, on: boolean, activate: () => void, title?: string, close?: HTMLButtonElement): HTMLDivElement => {
      const open = h('button', { type: 'button', class: 'filetab-open', title, 'aria-current': on ? 'true' : undefined }, label);
      open.addEventListener('click', activate);
      this.tabKeys(open, close ? () => close.click() : undefined);
      const t = h('div', { class: `filetab ${on ? 'active' : ''}` }, open, close ?? null);
      // 탭의 빈 곳을 눌러도 연다
      t.addEventListener('click', (ev) => {
        if (ev.target === t) activate();
      });
      return t;
    };
    this.fileTabs.append(tab(h('span', {}, '시작'), !app.active, () => app.activate(null)));
    for (const d of app.docs) {
      const x = h('button', { type: 'button', class: 'icon-btn x', title: '닫기', 'aria-label': `${ft(d.name)} 닫기`, html: icon('close2') });
      x.addEventListener('click', (ev) => {
        ev.stopPropagation();
        app.close(d);
      });
      const dirty = d.session?.dirty;
      const t = tab(h('span', { translate: 'no' }, `${d.saveName}${dirty ? ' *' : ''}`), app.active === d, () => app.activate(d), `${ft(d.saveName)}${d.size ? ` (${formatBytes(d.size)})` : ''}${dirty ? ' · 저장하지 않은 변경 있음' : ''}`, x);
      t.addEventListener('auxclick', (ev) => {
        if ((ev as MouseEvent).button === 1) app.close(d);
      });
      this.fileTabs.append(t);
    }
    const plus = h('button', { type: 'button', class: 'icon-btn', title: '열기', 'aria-label': '파일 열기', html: icon('plus') });
    plus.addEventListener('click', () => this.pickFiles());
    this.fileTabs.append(plus);
    if (focusedAt >= 0) {
      const list = focusables();
      list[Math.min(focusedAt, list.length - 1)]?.focus({ preventScroll: true });
    }
    revealX(this.fileTabs, this.fileTabs.querySelector<HTMLElement>('.filetab.active'));
    this.refreshRibbonState();
  }

  /**
   * 도면 탭 이름 단추 키보드: 왼쪽·오른쪽 화살표·Home·End로 탭을 옮기고, Delete로 닫는다(Enter·Space는 단추가 받는다).
   * 수정 키(Alt·Ctrl·Meta·Shift)와 함께 누른 화살표·Home·End는 넘긴다(259차 — tabKeyTarget, 브라우저·앱 단축키 그대로). Delete도 수정 키와 함께면 닫지 않고 넘긴다(260차)
   */
  private tabKeys(open: HTMLElement, close?: () => void): void {
    open.addEventListener('keydown', (ev) => {
      const k = ev as KeyboardEvent;
      const tabs = [...this.fileTabs.querySelectorAll<HTMLElement>('.filetab-open')];
      const to = tabKeyTarget(k, tabs.indexOf(open), tabs.length);
      if (to >= 0) tabs[to]!.focus();
      else if (k.key === 'Delete' && close && !(k.altKey || k.ctrlKey || k.metaKey || k.shiftKey)) close();
      else return;
      k.preventDefault();
      k.stopPropagation();
    });
  }

  refreshLayouts(): void {
    const app = this.app;
    const st = app.active;
    // 다시 그리기 전 초점이 배치 탭에 있었으면 그 배치(data-layout 열쇠)를 둔다 — 아래에서 같은 배치의 탭에 돌려준다(261차)
    const a = document.activeElement as HTMLElement | null;
    const focusKey = a && this.layoutTabs.contains(a) ? (a.dataset.layout ?? null) : null;
    this.layoutTabs.innerHTML = '';
    // 블록 편집기 줄(이름 글·동작 단추)은 탭 목록이 아니다
    this.layoutTabs.removeAttribute('role');
    if (!st) return;
    if (st.blockEdit) {
      const be = st.blockEdit;
      const close = h('button', { class: 'layouttab blockedit-close', title: '블록 편집기 닫기 (BCLOSE)' }, '블록 편집기 닫기');
      close.addEventListener('click', () => void app.run('BCLOSE'));
      const save = h('button', { class: 'layouttab', title: '블록 저장 (BSAVE)' }, '블록 저장');
      save.addEventListener('click', () => void app.run('BSAVE'));
      this.layoutTabs.append(h('span', { class: 'layouttab active blockedit-label' }, `블록 편집기: ${ft(be.name)}`), save, close);
      return;
    }
    // 보통 상태의 배치 탭 줄은 W3C APG 탭 꼴(261차 — 260차 보고 (1), 리본·팔레트 탭 꼴): tablist·tab·aria-selected, 고른 탭만 tabindex 0(Tab 한 자리 —
    // 고른 탭이 없으면 첫 탭). 왼쪽·오른쪽 화살표(끝에서 돌아감)·Home·End는 초점만 옮기고 Enter·Space(단추 누르기)로 고른다(수동 — 누르기는 지금처럼 공간 바꾸기).
    // 수정 키(Alt·Ctrl·Meta·Shift)와 함께 누른 화살표·Home·End는 넘긴다(tabKeyTarget — Alt+← 뒤로 같은 브라우저·앱 단축키 그대로).
    // 공간 바꾸기는 비동기라 끝난 뒤 이 줄을 다시 그린다 — 초점은 위 열쇠로 같은 배치의 탭(누른 탭 = 새 고른 탭)에, 없으면 고른 탭에 돌려준다(256차 restoreFocus 꼴)
    this.layoutTabs.setAttribute('role', 'tablist');
    const keys = st.layouts.map((l) => tableKey(l.blockName));
    const sel = Math.max(0, keys.indexOf(st.displaySpace));
    st.layouts.forEach((l, i) => {
      const key = keys[i]!;
      const label = key === MODEL_SPACE ? '모형' : l.name;
      const on = st.displaySpace === key;
      const b = h('button', { class: `layouttab ${on ? 'active' : ''}`, role: 'tab', 'aria-selected': on ? 'true' : 'false', tabindex: i === sel ? 0 : -1, 'data-layout': key, ...(key !== MODEL_SPACE ? { translate: 'no' } : {}) }, label);
      b.addEventListener('click', () => void app.setSpace(l.blockName));
      b.addEventListener('keydown', (ev) => {
        const to = tabKeyTarget(ev, i, keys.length);
        if (to < 0) return;
        ev.preventDefault();
        ev.stopPropagation();
        (this.layoutTabs.children[to] as HTMLElement | undefined)?.focus();
      });
      b.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        // 휴대폰 보기 모드는 메뉴를 열지 않는다(247차 — 도면 영역·도면층 시트 행 메뉴와 같은 규칙). 누르기(배치 바꾸기)는 그대로
        if (app.viewOnly) return;
        const paper = key !== MODEL_SPACE;
        const go = async (cmd: string, arg?: string) => {
          if (paper && st.displaySpace !== key) await app.setSpace(l.blockName);
          void app.run(cmd, arg);
        };
        showMenu(ev.clientX, ev.clientY - (paper ? 214 : 80), [
          { label: '새 배치', run: () => void app.run('LAYOUT', 'N') },
          ...(paper
            ? [
                { label: '배치 복사…', run: () => void go('LAYOUT', 'C') },
                { label: '이름 바꾸기…', run: () => void go('LAYOUT', 'R') },
                { label: '삭제', run: () => void go('LAYOUT', 'D') },
                { label: '다른 이름으로 저장…', run: () => void go('LAYOUT', 'SA') },
                { label: '이동 또는 복사…', run: () => void app.run('LAYOUTMOVE', label) },
              ]
            : []),
          { label: '템플릿에서…', run: () => void app.run('LAYOUT', 'T') },
          { label: '배치 마법사…', run: () => void app.run('LAYOUTWIZARD') },
          { separator: true },
          { label: '페이지 설정…', run: () => void go('PAGESETUP') },
          { label: '플롯…', run: () => void go('PLOT') },
        ]);
      });
      this.layoutTabs.append(b);
    });
    if (focusKey !== null) {
      const tabs = [...this.layoutTabs.children] as HTMLElement[];
      (tabs.find((t) => t.dataset.layout === focusKey) ?? tabs[sel])?.focus({ preventScroll: true });
    }
    revealX(this.layoutTabs, this.layoutTabs.querySelector<HTMLElement>('.layouttab.active'));
  }

  // -------------------------------------------------------------------------
  // 상태 막대
  // -------------------------------------------------------------------------

  private statusBtns: Record<string, HTMLButtonElement> = {};
  private spaceLabel = h('span', { class: 'status-text' });
  private unitLabel = h('span', { class: 'status-text' });
  private selLabel = h('span', { class: 'status-text' });
  /** 주석 축척 항목(annoscale-status.ts) */
  private annoItems: AnnoStatus | null = null;

  private buildStatus(): void {
    const app = this.app;
    const mk = (key: string, ic: string, label: string, run: () => void) => {
      const b = this.iconBtn(ic, label, run);
      this.statusBtns[key] = b;
      return b;
    };
    const osnap = mk('osnap', 'osnap', '객체 스냅 (F3) · 오른쪽 클릭으로 종류 선택', () => app.toggleOsnap());
    osnap.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      this.snapMenu(ev.clientX, ev.clientY);
    });
    const polar = mk('polar', 'polarTrack', '극좌표 추적 (F10) · 오른쪽 클릭으로 증분 각도 선택', () => app.togglePolar());
    polar.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      // 흔한 증분 각도(POLARANG — 이 브라우저). 목록에 없는 각도를 정해 두었으면 그것도 맨 앞에. 도면의 각도 단위(AUNITS·AUPREC)로 보인다
      const cur = app.settings.polarAng;
      const au = app.active?.units ?? DEGREE_UNITS;
      const angles = POLAR_COMMON_ANGLES.some((d) => Math.abs(d - cur) < 1e-9) ? POLAR_COMMON_ANGLES : [cur, ...POLAR_COMMON_ANGLES];
      showMenu(ev.clientX, ev.clientY - 250, [
        { heading: '극좌표 증분 각도' },
        ...angles.map((d) => ({
          label: `${Math.abs(cur - d) < 1e-9 ? '✓ ' : ' '}${formatPolarAngle(d, au)}${au.aunits === 0 ? '°' : ''}`,
          run: () => {
            app.polarInc = (d * Math.PI) / 180;
            if (!app.polarOn) app.togglePolar();
            this.refreshStatus();
          },
        })),
        { separator: true },
        { label: '추적 설정…', run: () => void app.run('DSETTINGS', 'P') },
      ]);
    });
    // 등각투영 제도: 누르면 켜기·끄기, 오른쪽 클릭으로 평면 고르기(F5·Ctrl+E로 평면 전환)
    const iso = mk('iso', 'polygon', '등각투영 제도 (ISODRAFT) · 오른쪽 클릭으로 평면 선택, F5로 평면 전환', () => {
      const st = app.active;
      if (!st) return;
      setIso(app, st, { style: isoState(st).style === 1 ? 0 : 1 });
    });
    iso.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      const st = app.active;
      if (!st) return;
      const cur = isoState(st);
      showMenu(ev.clientX, ev.clientY - 150, [
        { heading: '등각투영 제도' },
        ...(['왼쪽', '위', '오른쪽'] as const).map((name, i) => ({
          label: `${cur.style === 1 && cur.pair === i ? '✓ ' : ' '}등각평면 ${name}`,
          run: () => setIso(app, st, { style: 1, pair: i as 0 | 1 | 2 }),
        })),
        { label: `${cur.style === 0 ? '✓ ' : ' '}직교(끄기)`, run: () => setIso(app, st, { style: 0 }) },
      ]);
    });
    // 메뉴 단추(263차 — 응용프로그램 메뉴 A 꼴): 열림 상태는 snapMenu가 이 단추로 열 때만 맞춘다(객체 스냅 단추 오른쪽 클릭으로 연 같은 메뉴는 그대로)
    const caret = h('button', { class: 'icon-btn', title: '객체 스냅 종류', 'aria-label': '객체 스냅 종류', 'aria-haspopup': 'menu', 'aria-expanded': 'false', style: 'width:14px;padding:0', html: '▾' });
    caret.addEventListener('click', (ev) => this.snapMenu(ev.clientX, ev.clientY - 260, caret));
    const sep = () => h('span', { class: 'status-sep' });
    this.annoItems = annoStatus(app);
    // 주석 축척 항목: 동기화 경고, 축척 단추, 표시, 자동 추가 순서
    const annoPrio = [85, 65, 15, 15];
    // 열림 상태도 알린다(254차 — WCAG 4.1.2, 253차 휴대폰 더 보기 꼴): 처음 false, 메뉴가 열리면 true, 닫히면 false(statusMoreMenu)
    this.statusMore = h('button', { class: 'icon-btn status-more', title: '상태 막대의 나머지 항목', 'aria-label': '상태 막대의 나머지 항목', 'aria-haspopup': 'menu', 'aria-expanded': 'false', hidden: true }, '⋯');
    this.statusMore.addEventListener('click', () => this.statusMoreMenu());
    // 넘치면 prio가 낮은 것부터 "⋯" 메뉴로 옮긴다(데스크톱 폭에서는 다 들어간다)
    const items: [HTMLElement | undefined, number][] = [
      [this.coords, 20],
      [sep(), 0],
      [this.spaceLabel, 10],
      [sep(), 0],
      [osnap, 100],
      [caret, 45],
      [mk('grid', 'grid', '격자 표시 (F7)', () => app.toggleGrid()), 60],
      [mk('snap', 'gridSnap', '스냅 모드 (F9) · 격자 간격으로 점을 맞춥니다', () => app.toggleSnap()), 55],
      [mk('ortho', 'ortho', '직교 (F8)', () => app.toggleOrtho()), 95],
      [iso, 30],
      [polar, 90],
      [mk('otrack', 'otrack', '객체 스냅 추적 (F11) · 스냅점 위에 잠시 머물면 그 점에서 정렬선을 씁니다', () => app.toggleOtrack()), 50],
      [mk('dyn', 'dyn', '동적 입력 (F12) · 커서 옆에 프롬프트·거리·입력 중인 값', () => app.toggleDyn()), 40],
      [mk('lw', 'lineweight', '선가중치 표시', () => void app.run('LWDISPLAY')), 35],
      [mk('bg', 'background', '배경색 전환', () => void app.run('BACKGROUND')), 25],
      [sep(), 0],
      [this.selLabel, 70],
      [h('span', { class: 'status-spacer' }), 1000],
      ...this.annoItems.elements.map((el, i): [HTMLElement, number] => [el, annoPrio[i] ?? 15]),
      [sep(), 0],
      [this.unitLabel, 12],
      [mk('vpmax', 'viewport', '뷰포트 최대화·복원 (VPMAX·VPMIN) · 최대화 중 Ctrl+R로 다음 뷰포트', () => void app.run(maximized(app.active) ? 'VPMIN' : 'VPMAX')), 75],
      [mk('ext', 'extents', '전체 보기', () => void app.zoomToExtents()), 80],
      [mk('props', 'props', '특성 팔레트 (Ctrl+1)', () => this.openPalette('props')), 85],
    ];
    this.statusItems = items.filter((x): x is [HTMLElement, number] => !!x[0]).map(([el, prio]) => ({ el, prio }));
    this.status.append(...this.statusItems.map((x) => x.el), this.statusMore);
    this.refreshStatus();
  }

  private statusItems: { el: HTMLElement; prio: number }[] = [];
  private statusMore!: HTMLButtonElement;
  private fitRaf = 0;

  private scheduleFitStatus(): void {
    if (!this.fitRaf) this.fitRaf = requestAnimationFrame(() => this.fitStatus());
  }

  /** 상태 막대가 넘치면 덜 중요한 항목을 숨기고 "⋯" 단추로 모은다 */
  private fitStatus(): void {
    cancelAnimationFrame(this.fitRaf);
    this.fitRaf = 0;
    const bar = this.status;
    if (!bar.isConnected || !bar.clientWidth) return;
    // 넘치지 않고 숨긴 것도 없으면 그대로 둔다(넓은 화면)
    if (this.statusMore.hidden && bar.scrollWidth <= bar.clientWidth) return;
    for (const it of this.statusItems) it.el.classList.remove('st-hidden');
    this.statusMore.hidden = false;
    const moreRect = this.statusMore.getBoundingClientRect();
    this.statusMore.hidden = true;
    const cs = getComputedStyle(bar);
    const gap = parseFloat(cs.columnGap) || 0;
    const avail = bar.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const list = this.statusItems.map((it) => {
      if (it.el.classList.contains('status-spacer')) return { w: 0, prio: it.prio };
      const ics = getComputedStyle(it.el);
      if (ics.display === 'none') return { w: 0, prio: it.prio };
      // 구분선의 좌우 여백(margin)까지 센다
      const w = it.el.getBoundingClientRect().width + (parseFloat(ics.marginLeft) || 0) + (parseFloat(ics.marginRight) || 0);
      return { w: w + gap, prio: it.prio };
    });
    const moreW = moreRect.width + gap;
    const hidden = statusHidden(list, avail, moreW);
    // 숨긴 항목 양옆의 구분선이 겹치지 않게: 앞뒤에 보이는 내용이 없는 구분선도 숨긴다
    this.statusItems.forEach((it, i) => it.el.classList.toggle('st-hidden', hidden.has(i)));
    let prevContent = false;
    for (const it of this.statusItems) {
      if (it.el.classList.contains('st-hidden') || it.el.classList.contains('status-spacer')) continue;
      if (it.el.classList.contains('status-sep')) {
        if (!prevContent) it.el.classList.add('st-hidden');
        prevContent = false;
      } else if (it.el.getBoundingClientRect().width > 0) prevContent = true;
    }
    this.statusMore.hidden = hidden.size === 0;
  }

  /** "⋯" 메뉴: 숨긴 상태 막대 항목 */
  private statusMoreMenu(): void {
    const r = this.statusMore.getBoundingClientRect();
    const items: MenuItem[] = [];
    const texts: string[] = [];
    for (const it of this.statusItems) {
      const el = it.el;
      if (!el.classList.contains('st-hidden') || el.classList.contains('status-sep')) continue;
      if (el instanceof HTMLButtonElement) {
        if (el.hidden || el.style.display === 'none') continue;
        const title = (el.title || el.getAttribute('aria-label') || '').split(/ \(| · /)[0]!.trim();
        const text = el.classList.contains('icon-btn') ? '' : (el.textContent ?? '').replace(/▾/g, '').trim();
        const label = text ? `${title} ${text}` : title;
        items.push({
          label: `${el.classList.contains('on') ? '✓ ' : '\u2003'}${label}`,
          disabled: el.disabled,
          run: () => el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left, clientY: r.top })),
        });
      } else if (el.textContent?.trim()) texts.push(el.textContent.trim());
    }
    // 메뉴가 어떻게 닫히든(Esc·Tab·항목 고르기·바깥 누르기·다른 메뉴) onClose로 false
    showMenu(r.left, r.top, [...(texts.length ? [{ heading: texts.join(' · ') }] : []), ...items], {
      opener: this.statusMore,
      onClose: () => this.statusMore.setAttribute('aria-expanded', 'false'),
    });
    // 연 뒤에 true(showMenu가 앞 메뉴를 닫으며 그 onClose를 먼저 부른다)
    this.statusMore.setAttribute('aria-expanded', 'true');
    // 단추 바로 위에 붙인다(메뉴 높이는 손가락 입력에서 더 크다)
    const m = [...document.querySelectorAll<HTMLElement>('.menu')].pop();
    if (m) m.style.top = `${Math.max(4, r.top - m.getBoundingClientRect().height - 4)}px`;
  }

  /** 객체 스냅 메뉴(opener: 「▾」 단추로 열면 그 단추 — 닫으면 초점을 돌려주고, 열림 상태 aria-expanded를 맞춘다(263차)) */
  private snapMenu(x: number, y: number, opener?: HTMLElement): void {
    const app = this.app;
    showMenu(x, y, [
      { heading: '객체 스냅' },
      ...ALL_SNAPS.map((k) => ({
        label: `${app.snapModes.has(k) ? '✓ ' : ' '}${SNAP_NAMES[k]}`,
        run: () => {
          if (app.snapModes.has(k)) app.snapModes.delete(k);
          else app.snapModes.add(k);
          this.refreshStatus();
        },
      })),
      { separator: true },
      { label: '모두 켜기', run: () => (ALL_SNAPS.forEach((k) => app.snapModes.add(k)), this.refreshStatus()) },
      { label: '모두 끄기', run: () => (app.snapModes.clear(), this.refreshStatus()) },
    ], { opener, onClose: () => opener?.setAttribute('aria-expanded', 'false') });
    opener?.setAttribute('aria-expanded', 'true');
  }

  refreshStatus(): void {
    const app = this.app;
    if (!app) return;
    const st = app.active;
    this.statusBtns.osnap?.classList.toggle('on', app.osnapOn);
    this.statusBtns.ortho?.classList.toggle('on', app.orthoOn);
    this.statusBtns.grid?.classList.toggle('on', app.gridOn);
    this.statusBtns.snap?.classList.toggle('on', app.snapOn);
    this.statusBtns.polar?.classList.toggle('on', app.polarOn);
    this.statusBtns.otrack?.classList.toggle('on', app.otrackOn);
    this.statusBtns.dyn?.classList.toggle('on', app.dynOn);
    this.statusBtns.lw?.classList.toggle('on', app.view.lwDisplay);
    this.statusBtns.bg?.classList.toggle('on', app.view.modelBg === 0xffffff);
    this.statusBtns.iso?.classList.toggle('on', isoState(st).style === 1);
    const vpm = this.statusBtns.vpmax;
    if (vpm) {
      const label = maximizedLabel(app);
      vpm.classList.toggle('on', !!label);
      // 배치나 최대화 중일 때만 보인다
      vpm.style.display = st && (label || !st.isModel || st.msVp) ? '' : 'none';
      vpm.title = label ? `${label} · 누르면 복원 (VPMIN), Ctrl+R 다음 뷰포트` : '뷰포트 최대화 (VPMAX)';
    }
    // 블록·배치 이름은 도면 글(ft — 상태 줄 번역이 옮기지 않는다, 104차)
    this.spaceLabel.textContent = st
      ? st.blockEdit
        ? `블록 편집기: ${ft(st.blockEdit.name)}`
        : st.msVp
          ? `배치: ${ft(st.layoutFor(st.msVp.layout)?.name ?? '')} · 모형 공간(뷰포트)`
          : st.isModel
            ? '모형'
            : `배치: ${ft(st.layoutFor(st.space)?.name ?? '')}`
      : '';
    if (st) {
      const abbr = unitAbbr(st.units.insunits);
      this.unitLabel.textContent = abbr ? `단위: ${abbr}` : '단위 없음';
      this.selLabel.textContent = st.selection.size ? `선택 ${st.selection.size.toLocaleString()}개` : '';
    } else {
      this.unitLabel.textContent = '';
      this.selLabel.textContent = '';
      this.coords.textContent = '';
    }
    this.annoItems?.refresh();
    this.refreshRibbonState();
    this.scheduleFitStatus();
  }

  setCoords(text: string): void {
    this.coords.textContent = text;
  }

  refreshPalette(): void {
    this.palette?.refresh();
    this.mobile?.refresh();
  }

  openPalette(tab: string): void {
    this.palette.open(tab);
  }

  setBusy(text: string | null, fraction = 0): void {
    if (!text) {
      this.busy.hidden = true;
      this.busy.classList.remove('see-through');
      return;
    }
    this.busy.hidden = false;
    this.busyText.textContent = text;
    this.busyBar.style.width = `${Math.round(Math.max(0.03, Math.min(1, fraction)) * 100)}%`;
  }

  /** 진행 상자 뒤로 그림이 보이게(도면을 여는 동안의 미리 보기). 화면은 여전히 덮어 조작은 막는다 */
  setBusySeeThrough(on: boolean): void {
    this.busy.classList.toggle('see-through', on);
  }

  // -------------------------------------------------------------------------
  // 시작 화면
  // -------------------------------------------------------------------------

  private recentList = h('ul', { class: 'recent', 'aria-labelledby': 'start-recent-title' });
  private recentClear = h('button', { type: 'button', class: 'recent-clear', hidden: true, title: '최근 문서 목록을 모두 지웁니다(원래 파일은 그대로)' }, '모두 지우기');
  private recentSeq = 0;
  /** 시작 화면 위의 열기 실패 안내(닫거나 다른 파일을 열면 사라진다) */
  private startError = h('div', { class: 'start-error', role: 'alert', hidden: true });

  showStart(show: boolean): void {
    this.start.hidden = !show;
    if (show) void this.refreshRecent();
    else this.startError.hidden = true;
  }

  /** 시작 화면에 열기 실패 안내를 남긴다: 파일 이름, 무엇이 문제인지, 무엇을 하면 되는지 */
  showOpenError(name: string, info: OpenErrorInfo): void {
    const close = h('button', { type: 'button', class: 'icon-btn start-error-close', title: '안내 닫기', 'aria-label': '안내 닫기', html: icon('close2') });
    close.addEventListener('click', () => (this.startError.hidden = true));
    this.startError.replaceChildren(
      h('div', { class: 'start-error-body' }, h('strong', { class: 'start-error-name', translate: 'no' }, name), h('p', { class: 'start-error-msg' }, info.message), h('p', { class: 'start-error-hint' }, info.hint)),
      close,
    );
    this.startError.hidden = false;
    this.startError.scrollIntoView?.({ block: 'nearest' });
  }

  private buildStart(): void {
    const drop = h(
      'div',
      { class: 'dropzone', role: 'button', tabindex: 0, 'aria-label': '도면 파일 열기' },
      iconSpan('folder', 'big'),
      h('strong', { class: 'fine-only' }, 'DXF·DWG 파일을 여기에 끌어다 놓으십시오'),
      h('strong', { class: 'coarse-only' }, 'DXF·DWG 도면을 골라 여십시오'),
      h('span', { class: 'fine-only' }, '또는'),
      h('button', { class: 'btn primary', onclick: (ev: Event) => (ev.stopPropagation(), this.pickFiles()) }, iconSpan('open'), '파일 열기'),
    );
    drop.addEventListener('click', () => this.pickFiles());
    drop.addEventListener('keydown', (ev) => {
      if ((ev as KeyboardEvent).key === 'Enter') this.pickFiles();
    });
    const sample = h('button', { class: 'btn', onclick: () => void this.openSample() }, iconSpan('sample'), '예제 도면 열기');
    const newDrawing = h(
      'div',
      { class: 'start-new' },
      h('button', { class: 'btn primary', onclick: () => void this.app.run('NEW', 'metric') }, iconSpan('new'), '새 도면 (mm)'),
      h('button', { class: 'btn', title: 'acad 서식(영국식, 인치)', onclick: () => void this.app.run('NEW', 'imperial') }, '인치'),
    );
    this.start.append(
      h(
        'div',
        { class: 'start-inner' },
        h('h1', {}, 'OpenCAD 무료 DWG·DXF 캐드'),
        this.startError,
        // 소개와 지원 범위는 화면마다 둘: 편집 화면·데스크톱(그리기·편집·저장)과 휴대폰 보기 모드(보기·치수 확인). CSS가 #app.view-mode로 고른다
        h('p', { class: 'lead edit-copy' }, 'DWG·DXF 도면을 열거나 새로 만들어 그리고, 고치고, 저장하는 무료 2D 웹 캐드입니다. 설치나 회원가입 없이 브라우저에서 바로 사용하며, 도면 파일은 서버로 보내지 않고 이 컴퓨터에서 처리합니다.'),
        h('p', { class: 'lead view-copy' }, '휴대폰에서 DWG·DXF 도면을 열어 보고 치수를 확인하는 무료 2D 웹 캐드입니다. 설치나 회원가입 없이 브라우저에서 바로 쓰며, 도면 파일은 서버로 보내지 않고 이 기기에서 처리합니다.'),
        h(
          'div',
          { class: 'start-grid' },
          drop,
          h(
            'div',
            { class: 'start-side' },
            // 휴대폰 보기 모드에서는 새 도면(그리기)을 숨겨 예제 도면이 먼저 보이게 한다
            h('div', { class: 'card start-new-card' }, h('h3', {}, '새로 그리기'), h('div', { style: 'margin-bottom:8px;color:var(--text-dim)' }, '빈 도면을 만들어 바로 그리기를 시작합니다(Ctrl+N).'), newDrawing),
            h(
              'div',
              { class: 'card recent-card' },
              h('div', { class: 'recent-head' }, h('h3', { id: 'start-recent-title' }, '최근 문서'), this.recentClear),
              this.recentList,
              h('p', { class: 'recent-note' }, '최근 문서는 이 기기의 이 브라우저에만 저장하며 서버로 보내지 않습니다.'),
            ),
            h('div', { class: 'card' }, h('h3', {}, '처음이라면'), h('div', { style: 'margin-bottom:8px;color:var(--text-dim)' }, '예제 도면으로 기능을 둘러볼 수 있습니다.'), sample),
            h(
              'div',
              { class: 'card edit-copy' },
              h('h3', {}, '지원 범위'),
              h('ul', {}, h('li', {}, 'DXF R12~R2018(ASCII·이진) 열기·저장'), h('li', {}, 'DWG R2.6~R2018 열기, R2000~R2018 저장'), h('li', {}, '그리기·수정·그립, 치수·해치·문자·표, 블록·도면층·배치 편집'), h('li', {}, '측정, 객체 스냅, PNG·SVG·PDF 출력')),
            ),
            h(
              'div',
              { class: 'card view-copy' },
              h('h3', {}, '휴대폰에서 할 수 있는 것'),
              h(
                'ul',
                {},
                h('li', {}, 'DWG R2.6~R2018, DXF R12~R2018(ASCII·이진) 도면 열기'),
                h('li', {}, '전체 보기, 한 손가락으로 이동, 두 손가락으로 확대·축소'),
                h('li', {}, '거리·반지름·각도·면적 재기(길게 누르면 정밀 조준)'),
                h('li', {}, '객체를 눌러 길이·반지름·치수 값 보기, 도면층 켜고 끄기, 치수 목록'),
                h('li', {}, '그리기·고치기·저장은 제목 막대의 연필 단추(편집 화면)나 컴퓨터에서'),
              ),
            ),
          ),
        ),
        h(
          'div',
          { class: 'start-foot', html: '오픈소스 OpenCAD 프로젝트의 DWG·DXF 2D 캐드입니다(MIT). SKP·STEP·NC는 OpenCAD의 다른 도구로 엽니다. · <a href="https://gyutae-kim.github.io/opencad">OpenCAD 도구 목록</a> · <a href="https://gyutae-kim.github.io/">김규태 포트폴리오</a> · <a href="https://github.com/GyuTae-Kim/opencad-dwgdxf" target="_blank" rel="noopener">GitHub</a>' },
        ),
      ),
    );
    if (this.guide) this.start.querySelector('.start-inner')!.append(this.guide);
    this.recentClear.addEventListener('click', () => {
      // 다 지우면 이 단추가 숨는다 — 초점을 「아직 연 문서가 없습니다」 줄로(289차, 아래 줄 ✕의 마지막 줄 꼴 — 초점이 문서로 빠지지 않게)
      const held = document.activeElement;
      void this.recent
        .clear()
        .then(() => this.refreshRecent())
        .then(() => refocusStuck(held, [this.recentClear], [this.recentList.querySelector<HTMLElement>('.recent-empty')]));
    });
    // 날짜 표기(10월 27일 ↔ Oct 27)를 새 언어로
    this.root.addEventListener('languagechange', () => void this.refreshRecent());
  }

  private async refreshRecent(): Promise<void> {
    const seq = ++this.recentSeq;
    const list = await this.recent.list().catch(() => []);
    if (seq !== this.recentSeq) return;
    this.recentClear.hidden = !list.length;
    if (!list.length) {
      // 마지막 줄 ✕·「모두 지우기」 뒤 초점을 받는 줄(289차 — tabindex -1: 코드로만 받고 Tab 차례에는 들지 않는다. 전에는 li라 focus()가 듣지 않아 문서로 빠졌다)
      this.recentList.replaceChildren(h('li', { class: 'recent-empty', tabindex: -1 }, '아직 연 문서가 없습니다.'));
      return;
    }
    const now = Date.now();
    const locale = document.documentElement.lang || 'ko';
    this.recentList.replaceChildren(
      ...list.map((r) => {
        // 파일 이름과 날짜(지금 언어로 적는다)는 번역하지 않는다
        const open = h('button', { type: 'button', class: 'recent-open' }, h('span', { class: 'recent-name', translate: 'no' }, r.name), h('small', { translate: 'no' }, `${formatBytes(r.size)} · ${recentTimeLabel(r.time, now, locale)}`));
        open.addEventListener('click', () => void this.openRecent(r.id));
        const del = h('button', { type: 'button', class: 'icon-btn recent-del', title: '목록에서 지우기', 'aria-label': `최근 문서에서 지우기: ${ft(r.name)}`, html: icon('close2') });
        del.addEventListener('click', () => {
          // 지운 줄의 다음 줄(없으면 앞 줄)로 키보드 초점을 옮긴다
          const row = del.closest('li');
          const next = (row?.nextElementSibling ?? row?.previousElementSibling)?.querySelector<HTMLElement>('.recent-open');
          void this.recent.remove(r.id).then(async () => {
            await this.refreshRecent();
            const again = next && [...this.recentList.querySelectorAll<HTMLElement>('.recent-open')].find((b) => b.textContent === next.textContent);
            (again ?? this.recentList.querySelector<HTMLElement>('.recent-open, .recent-empty'))?.focus?.();
          });
        });
        return h('li', { class: 'recent-row' }, open, del);
      }),
    );
  }

  /**
   * 최근 문서 다시 열기(공유 받기·?recent=도 이것으로). 파일이 없으면 목록에서 지우고, 잠깐 못 읽었으면 남겨 다시 누를 수 있게 한다.
   * dropOnFail이면(공유로 받은 파일) 열지 못한 파일을 목록에 남기지 않는다
   */
  async openRecent(id: string, dropOnFail = false): Promise<boolean> {
    const got = await this.recent.read(id);
    if (got.kind === 'missing') {
      toast('저장해 둔 파일을 찾지 못해 목록에서 지웠습니다.', 'warn');
      await this.recent.remove(id);
      void this.refreshRecent();
      return false;
    }
    if (got.kind === 'error') {
      toast('저장해 둔 파일을 지금 읽지 못했습니다. 잠시 뒤 다시 눌러 보십시오.', 'warn');
      return false;
    }
    const st = await this.app.openFile(got.name, got.data, 'local', beginOpen('local', got.name.split('.').pop() ?? 'other'));
    if (!st && dropOnFail) await this.recent.remove(id);
    void this.refreshRecent();
    return !!st;
  }

  async openSample(): Promise<void> {
    const attempt = beginOpen('sample', 'dxf');
    try {
      const url = new URL('samples/opencad-sample.dxf', document.baseURI);
      const r = await fetch(url);
      if (!r.ok) throw new Error(String(r.status));
      await this.app.openFile('opencad-sample.dxf', await r.arrayBuffer(), 'sample', attempt);
    } catch {
      attempt.error('fetch_error');
      this.app.reportFetchError('예제 도면을 받지 못했습니다.');
    }
  }

  /** 주소의 ?open=으로 받은 도면을 연다(https나 같은 출처만). 받지 못하면 그 까닭을 알림과 명령행 기록에(281차) */
  async openUrl(openUrl: string): Promise<void> {
    const attempt = beginOpen('url', openUrl.split(/[?#]/)[0]!.split('.').pop() ?? 'other');
    try {
      const u = new URL(openUrl, document.baseURI);
      if (u.protocol !== 'https:' && u.origin !== location.origin) throw new Error('https 주소만 열 수 있습니다.');
      const r = await fetch(u);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const name = decodeURIComponent(u.pathname.split('/').pop() || 'drawing.dxf');
      await this.app.openFile(name, await r.arrayBuffer(), 'url', attempt);
    } catch (e) {
      attempt.error('fetch_error');
      this.app.reportFetchError(`파일을 받지 못했습니다: ${e instanceof Error ? e.message : String(e)}`, 7000);
    }
  }

  showInfo(): void {
    const st = this.app.active;
    if (!st) return;
    const d = st.doc;
    const counts = new Map<string, number>();
    for (const e of d.entityIndex.values()) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
    const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    dialog(
      '도면 정보',
      h(
        'div',
        {},
        h('div', { class: 'form-row' }, h('span', {}, '파일'), h('b', {}, `${ft(st.name)} (${formatBytes(st.size)})`)),
        h('div', { class: 'form-row' }, h('span', {}, '형식'), h('b', {}, `${d.format.toUpperCase()} ${d.version}${d.binary ? ' 이진' : ''}`)),
        h('div', { class: 'form-row' }, h('span', {}, '코드 페이지'), h('b', {}, d.codepage)),
        h('div', { class: 'form-row' }, h('span', {}, '도면층·블록'), h('b', {}, `${d.layers.size}개 · ${[...d.blocks.values()].filter((b) => !b.name.startsWith('*')).length}개`)),
        h('div', { class: 'form-row' }, h('span', {}, '배치'), h('b', {}, `${d.layouts.length - 1}개`)),
        h('div', { class: 'form-row' }, h('span', {}, '읽기 시간'), h('b', {}, `${Math.round(st.readMs)} ms`)),
        h('h4', { style: 'margin:12px 0 6px' }, '객체 종류'),
        h('table', { class: 'grid' }, h('tbody', {}, ...rows.map(([t, n]) => h('tr', {}, h('td', {}, t), h('td', { style: 'text-align:right' }, n.toLocaleString()))))),
        st.warnings.length ? h('h4', { style: 'margin:12px 0 6px' }, '참고') : null,
        ...st.warnings.map((w) => h('div', { style: 'color:var(--text-dim)' }, `· ${w.message}${w.count ? ` (${w.count})` : ''}`)),
      ),
    );
  }
}
