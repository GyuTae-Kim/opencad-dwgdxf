# 로드맵

목표는 서버와 해석 엔진이 있어야 하던 웹 2D CAD의 일을 브라우저 안에서 모두 하는 것입니다.
서버가 하던 파일 해석·편집 계산·저장은 웹 워커가 맡습니다.

## 1단계: 보기와 측정 (완료)

- [x] DXF R12~R2018 리더(ASCII·이진, CP949·UTF-8)
- [x] DWG R13~R2018 리더(ODA 공개 명세로 새로 작성)
- [x] WebGL2 렌더러: 공간 격자 묶음, 그리기 순서 깊이, 선가중치, 투명도, 글리프 인스턴스
- [x] 블록 펼치기(도면층 0·ByBlock 상속, MINSERT, 중첩 16단계), 선종류(복합 선종류 문자), 해치(무늬·단색·그라데이션)
- [x] 문자: 단선 글꼴(SHX 대신), Noto Sans KR 조각 받기, TEXT 정렬, MTEXT 서식·줄바꿈·쌓기·열
- [x] 치수(치수 블록, 블록 없는 치수는 정의점으로), 지시선, 다중 지시선, 여러 줄, 표, 가리기
- [x] 모형·배치 탭, 뷰포트(축척·비틀기·뷰포트별 동결)
- [x] AutoCAD형 화면: 리본, 파일 탭, 명령행(별칭·키워드·점 입력), 상태 막대, 바로가기 메뉴
- [x] 선택(클릭·윈도우·걸침), 특성 팔레트, 도면층 팔레트, 치수 목록, 문자 찾기
- [x] 측정: DIST, MEASUREGEOM(거리·반지름·각도·면적), AREA, ID, LIST, 객체 스냅, 직교
- [x] 내보내기: PNG, SVG, PDF

## 2단계: 편집과 저장 (완료)

- [x] 그리기: LINE, PLINE, CIRCLE, ARC, RECTANG, POLYGON, ELLIPSE, SPLINE, POINT, XLINE, RAY, DONUT, TEXT, MTEXT
- [x] 수정: MOVE, COPY, ROTATE, SCALE, MIRROR, OFFSET, TRIM, EXTEND, FILLET, CHAMFER, BREAK, JOIN, EXPLODE, ERASE, STRETCH, LENGTHEN, ARRAY
- [x] 그립 편집, 명령 취소·복구(U, REDO), 특성 팔레트에서 값 바꾸기, MATCHPROP, 클립보드(Ctrl+C·X·V)
- [x] DXF 저장(R12~R2018, ASCII·이진, 모델이 해석하지 않는 자료는 원본 태그로), 새 도면(acadiso·acad)
- [x] 극좌표 추적, 객체 스냅 추적
- [x] 동적 입력(F12, 커서 옆 프롬프트·거리·입력 중인 값)
- [x] 수정 보강: ALIGN, BLEND, COPYM, EXTRIM, OVERKILL, REVERSE, DIVIDE, MEASURE, PEDIT, SPLINEDIT, BOUNDARY, REVCLOUD, WIPEOUT, SCALETEXT, JUSTIFYTEXT
- [x] 블록·그룹·선택: BATTMAN, ATTSYNC, BCOUNT, BURST, BLOCKREPLACE, MINSERT, WBLOCK, GROUP·UNGROUP(PICKSTYLE 그룹 선택), SELECT, QSELECT, SELECTSIMILAR, FILTER
- [x] 유틸리티: OOPS, RENAME, AUDIT, STATUS, QUICKCALC·CAL, LIMITS(한계 밖 점 거부), MULTIPLE, REDRAW

## 3단계: 주석·블록·출력

- [x] 치수 작성(DIMLINEAR·DIMALIGNED·DIMANGULAR·DIMRADIUS·DIMDIAMETER·DIMORDINATE·DIMARC) — 치수 스타일대로 치수 블록 생성
- [x] 해치 작성(무늬 66개, 경계 찾기, 섬, 틈 허용, 연관 해치)
- [x] 다중 지시선 작성(MLEADER)
- [x] 블록 삽입·정의, 속성 편집, 블록 편집기(BEDIT)
- [x] 페이지 설정, 배치 만들기·복사·이름 바꾸기·삭제, 흑백·회색조 플롯, 여러 배치를 한 PDF로
- [x] 치수 연속·기준선(DIMCONTINUE·DIMBASELINE)
- [x] 플롯 스타일 표(CTB) 파일 읽기(색·회색조·스크린·선가중치)
- [x] 플롯 미리보기(PREVIEW, 플롯 대화상자의 미리보기)
- [x] 치수 스타일 관리자(DIMSTYLE: 선·기호·문자·맞춤·단위·공차, 고치면 그 스타일의 치수를 다시 만듦)
- [x] 이름 있는 플롯 스타일 표(STB): 객체·도면층의 플롯 스타일 이름으로 펜을 고름
- [x] 치수·지시선 편집: DIMEDIT, DIMTEDIT, DIMSPACE, DIMBREAK, DIMJOGLINE, DIMJOGGED, DIMOVERRIDE, QDIM, QLEADER, MLEADEREDIT·ALIGN·COLLECT·STYLE
- [x] 기하 공차(TOLERANCE, 프레임·GDT 기호를 선으로), 중심 표식·중심선(CENTERMARK·CENTERLINE)
- [x] 표(TABLE·TABLEDIT·TABLECELL·TABLESTYLE), 필드(FIELD·UPDATEFIELD), 여러 줄(MLINE·MLSTYLE·MLEDIT)

## 3.5단계: 배치·뷰·제도 보조

- [x] 배치 뷰포트: MVIEW(구석·맞춤·켜기/끄기·잠금·객체·폴리곤·2/3/4), VPCLIP, VPLAYER, LAYVPI, CHSPACE
- [x] 뷰포트 안 모형 공간(MSPACE·PSPACE, 두 번 눌러 들어가고 나오기, 뷰포트 안 확대·이동이 뷰포트 뷰를 바꿈)
- [x] 명명된 뷰(VIEW 뷰 관리자, -VIEW)
- [x] 사용자 좌표계(UCS·UCSICON·UCSMAN, 2D 범위의 원점·회전)
- [x] 격자(F7)·스냅(F9), 제도 설정(DSETTINGS), 객체 스냅 설정(OSNAP·-OSNAP)
- [x] 객체 격리·숨기기(ISOLATEOBJECTS·HIDEOBJECTS·UNISOLATEOBJECTS)
- [x] 도면층 도구(LAYLCK·LAYULK·LAYMCUR·LAYMCH·LAYCUR·LAYDEL·LAYMRG)
- [x] 특성 변경(CHPROP·CHANGE·COLOR·DDPTYPE·ATTDISP), 2D 솔리드(SOLID), TIME
- [x] 모형 타일 뷰포트(VPORTS·-VPORTS: 나누기·결합·이름 있는 구성, 저장하면 같은 타일로 열림)
- [x] 선택 순환(SELECTIONCYCLING), 밝은 화면 테마(COLORTHEME)
- [x] 뷰포트 최대화(VPMAX·VPMIN, 최대화 중 편집·Ctrl+R), 뷰포트 동기화(VPSYNC), 뷰포트 축척(VPSCALE)
- [x] 채우기(FILL)·빠른 문자(QTEXT)·끌기 모드(DRAGMODE), 등각투영 제도(ISODRAFT·ISOPLANE, F5, 등각원)
- [x] 도면층 상태(LAYERSTATE·-LAYERSTATE, ACAD_LAYERSTATES·.las 읽기·쓰기), 도면층 이전(LAYERP), SETBYLAYER

## 4단계: 저장 형식과 참조

- [x] DWG 저장(R2000·R2004·R2010·R2013·R2018, 같은 버전이면 해석하지 않은 객체도 그대로)
- [x] 래스터 이미지: 외부 참조 창(XR)에서 고른 로컬 파일로 연결(화면·PDF·SVG, 자르기·밝기·대비·흐리기)
- [x] 외부 참조(DWG·DXF): 고른 로컬 파일을 별도 문서로 열어 인스턴스 변환·XCLIP대로 그림(화면·뷰포트·출력, 저장 파일에는 섞지 않음)
- [x] PDF 언더레이: 고른 PDF의 페이지를 pdf.js로 그려 붙임(자르기·반전, 단색, 흐리기, 배경 맞춤, 화면·PDF·SVG)
- [x] 중첩 외부 참조(덮어씌우기 제외, 순환 차단), 외부 참조 도면층 재지정(`참조|도면층`, VISRETAIN, 뷰포트 동결)
- [x] 연관 치수(DIMASSOC·DIMREASSOCIATE·DIMDISASSOCIATE·DIMREGEN), 검사 치수(DIMINSPECT)
- [x] 파라메트릭 기하·치수 구속(GEOMCONSTRAINT·DIMCONSTRAINT·AUTOCONSTRAIN·PARAMETERS, 이 앱의 구속 기록으로 저장)
- [x] 동적 블록 참조 편집(DYNPROPS·RESETBLOCK·동적 그립), DWG의 동적 블록 객체 9종 해독·쓰기
- [x] 동적 블록: DWG의 뒤집기·XY·회전·조회·점·기준점·정렬·극좌표 매개변수와 이동·신축·회전·뒤집기·배열·조회·극좌표 신축 동작(30종) 읽기·쓰기, 점·극좌표 편집
- [x] 동적 블록: 배열 동작 평가(AutoCAD 표현 블록과 같은 사본), 정렬 매개변수 그립, 구속 기반 정의 평가(구속 매개변수 값 바꾸기), 대리 노드 DWG 읽기·쓰기
- [ ] 동적 블록: XY·극좌표 값 목록과 극좌표 신축 점 묶음의 DXF 코드, 블록 속성 표·사용자 매개변수(DXF 짝 필요), 구속 매개변수의 DWG 배치
- [x] AutoCAD 파라메트릭 구속(ACAD_ASSOCNETWORK) 읽기·편집(DXF·DWG R2000~R2018): 기하 구속 11종, 거리·반지름·지름 치수 구속, 변수·사용자 매개변수, 고치면 원본 망을 같은 형식으로 갱신
- [x] 이 앱에서 만든 구속을 AutoCAD 2D 구속 그룹으로 저장(일치·평행·직교·동일선상·접선·동심·같은 길이·같은 반지름·수평·수직·고정, 거리·반지름·지름), 같은 반지름 구속 읽기·편집
- [ ] AutoCAD 구속: 각도·대칭·부드러움·타원·스플라인 구속(실물 없음), 다른 매개변수를 쓰는 식의 변수(DXF 배치 미확인)
- [x] 주석 축척(CANNOSCALE·SCALELISTEDIT·OBJECTSCALE·ANNOALLVISIBLE·ANNOAUTOSCALE, 뷰포트마다 주석 축척으로 그림)
- [x] 주석 축척: 치수·해치·다중 지시선의 AutoCAD 축척 레코드 읽기·쓰기(DXF·DWG R2000~R2018), DWG의 MTEXT·블록 참조·속성 레코드
- [x] 주석 축척: 공개 AutoCAD 도면(DWG·DXF 짝)으로 치수·MTEXT·해치·HATCHVIEW·LEADER 레코드 배치 확인, 치수 15비트·MTEXT 열 높이 읽기·쓰기, 해치 뷰포트별 표현(HATCHVIEW) 만들기
- [ ] 주석 축척: 치수 레코드 값(71·280 등)의 뜻, 해치 루프 290 = 0, 여러 줄 속성·다중 지시선·반지름·세로좌표 치수 레코드 실물, 공차(FCF) 레코드, AutoCAD에서 열어 확인
- [x] 도면 비교(COMPARE: 색·구름형 리비전·가져오기·스냅샷 내보내기)
- [x] 외부 참조 비교(XCOMPARE: 다시 불러온 외부 참조의 이전·지금 버전, 모형 공간 최상위 참조)
- [x] 참조 제자리 편집(REFEDIT·REFSET·REFCLOSE), 전자 전송(ETRANSMIT)
- [x] 도면층 탐색·복사·변환(LAYWALK·COPYTOLAYER·LAYTRANS), CAD 표준(STANDARDS·CHECKSTANDARDS), 디자인센터(ADCENTER)
- [x] CAD 표준 연결을 AutoCAD 형식(AcStStandard)으로 저장, LAYTRANS 매핑 불러오기·저장(DWS의 ACLAYTRANS)
- [x] 문자 도구(TXT2MTXT·TEXTALIGN·ATTIPEDIT), 원호 정렬 문자(ARCTEXT, 새로 만든 것은 이 앱 기록 블록으로 저장)
- [x] 스마트 치수(DIM), 옛 지시선(LEADER), 경로 배열(ARRAYPATH, 비연관), -LAYER·-WBLOCK
- [x] 연관 배열(ARRAYRECT·ARRAYPOLAR·ARRAYPATH 연관, ARRAYEDIT·ARRAYCLOSE, 배열 그립·특성, AutoCAD DXF 배열 읽기·편집)
- [x] 연관 배열: 새 배열을 AutoCAD 연관 객체로 쓰기(직사각형·원형·선 경로), DWG 안 AutoCAD 배열·구속의 연관 객체 해독·쓰기
- [x] 연관 배열: 곡선 경로(호·원·폴리선·스플라인) 배열의 AutoCAD 곡선 캐시 읽기·쓰기(DXF·DWG)
- [ ] 연관 배열: 타원 경로, 지운 항목 플래그(실물 없음)
- [x] Express Tools: TCASE·TCOUNT·TORIENT·TEXTFIT·TEXTMASK·TCIRCLE·TXTEXP·SSX·GETSEL·XLIST·XDLIST·NCOPY·GATTE·BREAKLINE·MPEDIT·EXOFFSET·FLATTEN·CDORDER·MKLTYPE·SHOWURLS·REDIR
- [x] 스크립트(SCRIPT·RSCRIPT·RESUME·DELAY, .scr 끌어 놓기)와 명령행 버전 명령(-INSERT·-ATTEDIT·-ARRAY·-HATCH·-BOUNDARY·-PURGE·-STYLE·-LINETYPE·-DIMSTYLE·-UNITS·-OVERKILL·-XREF·-IMAGE·-PLOT), PSETUPIN
- [x] 도면층 필터(특성 필터·그룹 필터, 필터 반전, FILTERS — 이 앱 기록으로 저장하고 AutoCAD의 ACLYDICTIONARY는 보존)
- [x] 도면층 필터를 AutoCAD 형식(ACLYDICTIONARY: AcLyLayerFilter 식·AcLyLayerGroup 핸들, 중첩)으로 읽고 쓰기, 바꿀 수 없는 식은 읽기 전용으로 보존
- [ ] 도면층 필터: 투명도·플롯 스타일·설명·트루컬러 열 이름과 중첩 필터 실물 확인, 지금 고른 필터(290·`<All`) 연동
- [x] AutoLISP 부분 집합(명령행·스크립트 평가, defun c:, command, get*, entget·entmod·entmake, ssget 필터, APPLOAD·.lsp 끌어 놓기)
- [x] 스크립트·AutoLISP: 객체 선택 방식 WP·CP·F, LAYOUT 템플릿(T)·다른 이름으로 저장(SA), 확장 데이터·사전·XRECORD 함수, nentsel·textbox·osnap·grdraw, 이번 세션에 연 파일 읽기
- [x] 좁은 화면·휴대폰·태블릿 배치(겹쳐 펼치는 리본, 아래쪽 팔레트 시트, 상태 막대 넘침 메뉴, 소프트 키보드)
- [x] 블록·참조 명령: ATTOUT·ATTIN·ATTEXT·ATTREDEF, XATTACH·IMAGEATTACH·PDFATTACH·XBIND·XOPEN·BLOCKTOXREF, UNDEFINE·REDEFINE·BASE·TINSERT·PASTESPEC, BLOCKSPALETTE, DIMEX·DIMIM
- [x] 편집·표시 명령: HATCHGENERATEBOUNDARY·HATCHSETBOUNDARY·HATCHSETORIGIN, IMAGEADJUST·IMAGEQUALITY·TRANSPARENCY·PDFADJUST·PDFLAYERS, DIMCENTER, TABLEEXPORT·MATCHCELL, QUICKPROPERTIES, DBLIST, GROUPEDIT, STRETCH의 걸침 폴리곤
- [x] 파일·출력 명령: CLOSEALL·SAVEALL·REVERT, PLOTSTAMP, PLOTSTYLE·CONVERTCTB·CONVERTPSTYLES, MVSETUP·LAYOUTWIZARD, WMFOUT, IMPORT
- [ ] 표 셀 블록(TINSERT를 셀에 담기), AutoCAD Express .dim 실물 형식, PDF 언더레이 대비 표시, IMAGEQUALITY·VIEWRES 화면 반영
- [ ] 스크립트·AutoLISP: (redraw 이름 모드) 강조, MINSERT 칸별 nentsel, 실제 휴대폰 기기 확인
- [x] 등각 설정(SNAPSTYL·SNAPISOPAIR)을 VPORT에 저장, 명령 시작 경합 수정과 앱 확장 지점(src/app/hooks.ts)
- [x] 표를 AutoCAD 표로 남기기: DXF의 셀 병합·셀 정렬·셀 서식, DWG의 ACAD_TABLE·TABLESTYLE 쓰기(R2000~R2018)
- [x] 필드 회색 배경 표시(FIELDDISPLAY)
- [x] AutoCAD FIELD 객체 읽기·쓰기(DXF·DWG)
- [x] PDF 가져오기(PDFIMPORT: 벡터 형상·솔리드 채우기·트루타입 문자)
- [x] 나선(HELIX: 기준·상단 반지름, 회전 수, 비틀기), 스케치(SKETCH), 그라데이션(GRADIENT), 블록 개수(COUNT)
- [x] 이미지·PDF 자르기(IMAGECLIP·PDFCLIP·CLIP), 블록으로·원래 좌표에 붙여넣기, EXPORT·JPGOUT·BMPOUT
- [x] 해치 편집(HATCHEDIT), 블록 자르기(XCLIP), 하이퍼링크(HYPERLINK), 데이터 추출(DATAEXTRACTION, 표·CSV)
- [x] 자동 저장과 도면 복구(SAVETIME·DRAWINGRECOVERY·RECOVER, 이 브라우저에만)
- [x] 배치를 모형으로 내보내기(EXPORTLAYOUT)

## 5단계: AutoCAD처럼 편집하기 (2026-10-16)

저장소 이름을 `2dcad-viewer`에서 `opencad-dwgdxf`로 바꾸고, 보기 전용 뷰어가 아니라 편집기로 쓰도록 손으로 고치는 흐름을 채웠습니다.
서버 기반 웹 2D CAD의 기능 목록과 영역별로 맞대어 빠진 것을 찾았습니다.

- [x] 시작 화면의 새 도면(mm·인치), 소개·제목·공유 이미지를 편집기 기준으로
- [x] 직접 조작: 선택한 객체 끌어 옮기기·복사, 올가미 선택, 창·올가미 미리 강조, 오른쪽 클릭 Enter·상황별 메뉴(SHORTCUTMENU), 두 번 눌러 고치기
- [x] 동적 입력(상대 좌표 기본, 거리·각도 칸 Tab 잠금), 객체 스냅 재지정 입력(END…·FROM·M2P·TT·점 필터), 접점·연장선·평행·가상 교차점·기하학적 중심 스냅, 기본 OSMODE 4133
- [x] Shift 임시 직교, Ctrl 제도 키, 객체 선택 옵션 G·M·AU·SI·U
- [x] 다기능 그립(폴리선 정점·호/선 변환, 길이 조정·반지름, 스플라인 맞춤점, 치수 문자·연속·기준선), 그립 편집 모드·Ctrl 복사·여러 핫 그립·동적 치수
- [x] RECTANG·CIRCLE Ttr·PLINE 호·XLINE·ELLIPSE 호·SPLINE 옵션, 명령행 ARRAYRECT·ARRAYPOLAR, UNDO 옵션, LENGTHEN 동적, PEDIT 정점 편집, TRIM·EXTEND 걸치기·울타리·Shift 전환, MOCORO, REVCLOUD 수정, 3DPOLY·3DFACE·TRACE, 고도·두께
- [x] 여러 줄 문자 제자리 편집기(서식·스택·목록·열·필드), TEXT 도면 위 입력, TEXTEDIT 확장(다중 지시선·공차·지시선 주석·치수 문자), 찾기 및 대치
- [x] 특성 팔레트의 치수·다중 지시선·공차·표 셀 편집, 한 창짜리 DIMSTYLE 관리자, STYLE 대화상자, MLEADER 옵션, 지시선 연관, FIELDEVAL
- [x] BLOCK 재정의·-BLOCK, ATTDEF·INSERT·EATTEDIT 보강, 다른 도면 붙여넣기의 익명 블록 충돌 수정, ADDSELECTED
- [x] 시스템 변수 바로 입력·SYSVDLG·ALIASEDIT·OPTIONS(화면에 바로 반영)·DWGPROPS(DWG 요약 정보 왕복), PAGESETUP 관리자, PLOT 배치에 적용·브라우저 인쇄
- [x] 스냅 표식 위 Tab 순환(겹친 스냅 점), LINE의 지연된 접점(점에서 원에 그은 접선, 두 원의 공통 접선)
- [x] 지연된 접점을 PLINE 시작점·XLINE 첫 점·CIRCLE 3P로, Ttr·TTT는 접점 스냅 점 요청, 폴리선 호 구간의 접점 스냅
- [x] AUTOSNAP 비트를 AutoCAD 도움말대로(2 AutoSnap 툴팁, 4 마그넷 — 전에는 둘을 바꿔 읽어 AutoCAD 값을 주면 다른 칸이 꺼졌다)
- [x] AUTOSNAP 마그넷(4 — 잡은 스냅점에 십자선을 붙인다)과 추적 비트(8·16 — F10·F11·상태 막대·DSETTINGS·OPTIONS·AUTOSNAP 값이 한 상태, 이 브라우저에 저장),
  OPTIONS의 AutoTrack 툴팁 표시(32), SETVAR로 머리말에 없는 이 브라우저·세션 변수 바꾸기(2026-10-28)
- [x] 오른쪽 버튼 끌어 놓기 메뉴(고른 객체를 오른쪽 버튼으로 끌어 놓은 자리에 여기로 이동·여기로 복사·블록으로 붙여넣기·취소 — 도움말 "About Copying Objects",
  각각 명령 취소 한 단계, Esc, 손가락은 길게 누르기가 정밀 조준이라 없음)(2026-10-29)
- [ ] 오른쪽 버튼으로 다른 도면·다른 앱으로 끌어 놓기(도움말 "About Copying Objects"는 열린 도면 사이와 다른 앱으로도 끌 수 있다고 적는다 — 이 앱은 한 화면에 도면 하나라 하지 않았다)
- [x] POLARMODE를 AutoCAD 뜻(1 마지막 선분 기준 각도, 2 객체 스냅 추적에 극좌표 각도, 4 추가 각도, 8 Shift로 획득)으로, 켜기·끄기는 AUTOSNAP 8만,
  POLARANG(증분 각도 — 목록 밖 각도도)·POLARADDANG(추가 각도)을 이 브라우저에 저장하고 제도 설정·OPTIONS·상태 막대에서 고르기, LINE 명령 취소(U) 뒤 시작점(2026-10-28)
- [ ] 지연된 접점이 첫 점일 때의 극좌표 추적 기준점(도움말에 없어 지금은 찍은 자리)
- [x] 제도 설정 추가 각도 목록의 새로 만들기·삭제 단추(10개까지, 같은 방향 거르기, 0~360 밖은 같은 방향으로 넣고 알림, 키보드·화면 읽기),
  POLARANG·POLARADDANG을 도면의 각도 단위(AUNITS·AUPREC)로 보이고 받기(저장값은 도, 명령행은 도에 단위 표시도)(2026-10-28)
- [ ] 상대 극좌표(POLARMODE 1)의 "고른 객체": 지금은 LINE·PLINE이 마지막으로 그린 선분만 기준으로 삼는다. 기준점을 기존 선의 끝점에 스냅했을 때 그 선을 기준으로 삼는지는
  공개 도움말(POLARMODE "selected objects", 제도 설정 "last segment drawn", 극좌표 각도 설정 절차 "last object you created")에 자세히 없어 하지 않았다
- [ ] 상대 극좌표일 때 동적 입력 각도 칸(지금은 절대 극좌표와 같은 도면 단위의 0 방향 기준). 제도 설정 동적 입력 탭·치수 입력 설정 도움말에는 그리는 중의 각도 기준이 없다
- [x] 극좌표 추적의 0 방향·방향을 ANGBASE·ANGDIR로(증분 각도의 배수·추가 각도·POLARMODE 2의 객체 스냅 추적), 추적 툴팁 각도를 AUNITS·AUPREC로,
  동적 입력 각도 칸과 명령행 극좌표(d<a·@d<a·원통·구)도 같은 기준(도움말 "About Polar Tracking and PolarSnap", "About Entering 2D Polar Coordinates")(2026-10-29)
- [x] ROTATE의 회전 각도 숫자는 ANGDIR 쪽으로(도움말 "About Rotating Objects"), 참조의 참조 각도·새 각도 숫자는 절대 각도(UCS X축 + ANGBASE에서 ANGDIR 쪽),
  DIST·MEASUREGEOM 거리의 X·Y 증분과 XY 평면 각도를 현재 UCS에서 재고 각도를 0 방향·방향으로(도움말 DIST, "Direction Control", "Advanced Setup")(2026-10-29)
- [ ] 그 밖의 각도 입력과 표시에 ANGBASE·ANGDIR — 명령별 도움말에 각도 기준이 없어 그대로 둔 것: 그립 회전·MOCORO 회전 각도, TEXT·MTEXT 회전 각도,
  INSERT·블록 회전 각도, LIST·특성 팔레트의 선 각도·호 시작/끝 각도, 그 밖의 getangle 밖 각도 프롬프트. ROTATE에서 점으로 준 회전 각도가 ANGBASE에서 재는지도 도움말에 없다
  (18차에 TEXT·LIST 도움말을 다시 찾아보았으나 각도 기준을 적은 곳이 없었다. 19차에 LIST의 위치는 도움말대로 현재 UCS로 바꿨다 — 델타·각도는 그대로).
  각도 숫자 입력이 AUNITS(그라드·라디안·방위)를 따르는지(지금 ROTATE는 도). SETVAR·명령행에서 방위(N 80d E)로 준 POLARADDANG은 아직 동쪽 0·반시계 기준으로 읽는다(제도 설정은 도면 기준)
- [x] 타원·타원호·스플라인의 접점 스냅(기준점에서 그은 접점, LINE·XLINE·PLINE·CIRCLE 3P·Ttr·TTT의 지연된 접점), 가상 교차점을 객체의 정확한 형상으로(호 → 원, 타원호 → 타원, 블록 안 객체)
- [x] CIRCLE Ttr·TTT·3P에서 원이 곡선에 한 점으로만 닿는 경계(이중근), 점에서 스플라인에 그은 접선의 표본 한 칸 안 두 접점
- [x] Ctrl 순환 다기능 그립(GRIPMULTIFUNCTIONAL — 초기값 3, 1 Ctrl 순환, 2 커서를 올리면 뜨는 메뉴), 회전·축척 그립의 참조(R)
- [ ] 화살표 반전 값
- [x] PLINE 호 Ctrl 방향 전환
- [x] 3DPOLY·3DFACE의 Z 입력(x,y,z·@ 상대·원통·구 좌표, 동적 입력, 점 필터, 객체 점에 붙인 스냅의 Z — OSNAPZ 0)
- [x] SPLINE 매듭 방식 보존(맞춤 방식은 DXF 70에 1024 + 매듭 비트, AutoCAD와 같은 보간)
- [ ] SPLINE 공차 근사, ARRAYPOLAR 회전축
- [x] LINE에 준 Z로 3D 선(@ 상대 좌표는 앞 점의 Z, Z축 방향 선, 닫기·명령 취소), CIRCLE 중심점에 준 Z로 원의 고도(도움말 ELEV — X·Y만 준 점이 고도)(2026-10-29)
- [x] LINE·CIRCLE 중심의 객체 스냅 Z(OSNAPZ 0 — 정의점·근처점·수직·접점은 객체 위 높이, 교차점은 3D에서도 만날 때만, 지연된 접점은 곡선 위),
  OSNAPZ 세션 변수(1이면 LINE·CIRCLE·3DPOLY·3DFACE의 스냅 점이 고도)와 OPTIONS 제도 탭의 "Z 값을 현재 고도로 대체"(도움말 OSNAPZ, "About Using Object Snaps in 3D")(2026-10-29)
- [ ] 다른 2D 명령(PLINE·ARC·ELLIPSE·RECTANG 등)에 준 Z와 스냅 점의 Z: PLINE·ARC 도움말과 ELEV 도움말에 2D 객체의 고도를 어느 점의 Z로 정하는지 없다.
  CIRCLE 3P·2P·Ttr·TTT의 Z. 평면도에서만 겹친 교차점(도움말은 3D에서 만나지 않는 두 객체의 보이는 교차점을 가상 교차점이라 한다 — 교차점 스냅이 그런 점에 잡히는지는 없어 그대로),
  가상 교차점·연장선·평행 스냅의 Z, 블록 참조 안 객체 위 근처점·교차점의 Z. UCS 원점의 Z, UCS를 WCS로 바꿀 때 고도를 0으로(도움말 ELEV)
- [x] DIST·MEASUREGEOM 거리의 3D(좌표의 Z·스냅 점의 Z·Z를 생략하면 고도, 3D 거리·Z 증분·XY 평면으로부터의 각도, 도면 공간은 2D — 도움말 DIST),
  ID의 UCS 좌표와 Z(도움말 ID), 상태 막대 좌표의 Z(스냅 점의 Z, 없으면 고도 — 도움말 상태 막대·COORDS)(2026-10-29)
- [x] LIST의 위치를 현재 UCS의 X·Y·Z로(OCS 점은 돌출 방향 반영), BYLAYER가 아닌 색상·선종류·선가중치·투명도, 0이 아닌 두께, Z축과 다른 돌출 방향(도움말 LIST)(2026-10-29)
- [x] DIST·MEASUREGEOM 거리의 다중 점(<다중 점>·M, 누적 거리와 툴팁, 호·길이·명령 취소·닫기 — 도움말 DIST·MEASUREGEOM)과 투명 사용('DIST — 도움말 DIST),
  상태 막대 좌표 COORDS 0(점을 지정할 때만)·2(상대 극좌표, Z는 절대)와 좌표 표시 누르기·Ctrl+I(도움말 COORDS, "상태 막대의 좌표 표시 바꾸기")(2026-10-29)
- [ ] LIST의 델타 X·Y와 각도, 특성 팔레트·DBLIST·휴대폰 정보 카드의 좌표를 UCS로: LIST·특성 팔레트·PROPERTIES·DBLIST 도움말에 증분·각도나 팔레트 좌표의 기준이 없어 그대로(저장된 좌표).
  특성 팔레트에서 고친 좌표도 그대로 WCS로 쓴다
- [ ] COORDS 3(지리 좌표 — 지리 위치가 있는 도면만), 상태 막대 사용자화 메뉴로 좌표 표시 켜고 끄기(도움말: 사용자화 단추의 "좌표"), COORDS 2의 기준점이 없는 첫 점과
  Ctrl+I로 돌리는 차례(도움말에 없어 첫 점은 절대 좌표, 차례는 0 → 1 → 2), 다중 점의 호 구간 높이(도움말에 없어 앞 점 높이의 평면 호)
- [x] 도면 공간 DIST의 투영 거리: 뷰포트에 보이는 모형 객체에 스냅하고(도움말 "To Set Dimension Scale for Creating Dimensions in a Layout"),
  두 점이 모두 같은 뷰포트 하나의 모형 스냅이면 화면과 나란한 평면에 투영한 모형 공간 거리(도움말 DIST). 다중 점은 모든 점이 그럴 때, 'DIST도 같다(2026-10-29)
- [ ] 도면 공간 DIST의 남은 조건: 한 점만 모형 스냅, 두 점의 뷰포트가 다름, 뷰포트가 겹친 자리, 다중 점에 길이·반지름을 친 구간이 낌(도움말에 없어 도면 공간 2D),
  투영할 때 증분·각도의 기준(도움말에 거리만 있어 화면 방향으로 정함). XY 평면으로부터의 각도가 아래로 기울 때
  음수 대신 270~360으로 보이는지는 도움말에 없다
- [ ] 도면 공간 MEASUREGEOM 거리의 투영: 도움말 MEASUREGEOM에는 도면 공간의 투영 이야기가 없고 "AREA·DIST·MASSPROP과 같은 계산을 많이 한다"는 한 문장뿐이라
  지금은 도면 공간 객체에만 스냅하고 도면 공간 거리(23차에 DIST와 같은 투영을 붙였다가 리뷰 뒤 되돌림 — 더 분명한 근거가 나오면)
- [ ] MEASUREGEOM 반지름·각도·면적과 휴대폰 보기 모드의 반지름·각도·면적 단추로 뷰포트 안 모형 객체 재기(도움말에 도면 공간의 모형 객체 이야기가 없다)
- [x] 뷰포트 안 모형 공간(MSPACE)의 ZOOM: 윈도우·범위·전체·객체·VIEW 복원이 창을 뷰포트 가운데·크기에 맞추고(이전에는 화면 가운데라 뷰포트 밖으로 밀렸다),
  nX는 뷰포트 가운데를 두고, nXP는 뷰포트 축척, 중심(C) 새로, 이전(P)은 뷰포트마다 10개, PAN 두 점은 축척 그대로. 화면표시가 잠긴 뷰포트는 배치 전체를 확대하고 nXP는 거절
  (도움말 ZOOM, "About Scaling Views in Layout Viewports", "To Lock the Scale of a Layout Viewport")(2026-10-30)
- [x] ZOOM 접미사 없는 숫자: 도면 한계에 대한 배율(도움말 ZOOM 축척 — 2면 한계로 줌했을 때 크기의 두 배), 뷰 가운데 그대로.
  모형 공간·뷰포트 안은 모형 한계, 도면 공간은 그 배치의 한계, 잠긴 뷰포트는 배치 전체를 그 배율로(2026-10-30)
- [x] ZOOM 전체(A): 객체 범위와 도면 한계(LIMITS)를 함께 담게(도움말 ZOOM 전체 — 보이는 객체와 격자 한계 같은 시각 보조, 범위와 한계 가운데 큰 쪽).
  모형 공간·뷰포트 안은 모형 한계, 도면 공간은 그 배치의 한계, 잠긴 뷰포트는 범위 줌과 같다(2026-10-30)
- [x] 다른 명령 안의 투명 ZOOM('ZOOM·점 프롬프트에 친 ZOOM)에서 전체(A)는 알리고 하지 않는다(도움말 ZOOM 전체 — 늘 재생성하므로 투명하게 쓸 수 없다).
  다른 옵션은 그대로 투명하게, 투명 명령이 끝나면 커서 옆 안내도 바깥 명령의 것으로(2026-10-30)
- [ ] ZOOM의 남은 옵션: 동적(D — 지금 도움말은 "뷰 상자로 이동·확대, 눌러 크기를 바꾸고 다시 눌러 정하고, 끌어 옮기고 Enter"까지만 말하고 상자를 고르는 동안
  무엇을 보이는지·크기를 어떻게 바꾸는지는 없어 상자 꼴을 그대로 재현할 근거가 모자라다), 뷰포트 밖에서 nXP의 뜻(도움말에 없어 nX처럼),
  ZOOM·PAN·VIEW 중이나 VPOINT·DVIEW 중의 투명 ZOOM을 막는 것(Mac판 도움말 ZOOM의 한 문장뿐 — 지금은 된다)
- [x] 도면 공간 선형·정렬 치수의 뷰포트 안 모형 스냅: 두 원점이 같은 뷰포트 하나의 모형 스냅이면 DIMLFAC 재지정(−|지금 DIMLFAC| ÷ 뷰포트 축척)으로 모형 공간 값
  (도움말 "To Set Dimension Scale for Creating Dimensions in a Layout", "About Setting the Scale for Dimensions", DIMLFAC)(2026-10-30)
- [x] 도면 공간의 다른 치수: 반지름·지름·호 길이·각도 치수와 선형·정렬 `<객체 선택>`이 단일 뷰포트에 보이는 모형 객체를 고르고, 각도 정점·끝점·세로좌표 피쳐·호 길이 부분 점이
  뷰포트 안 모형 객체에 스냅한다. 길이 값은 뷰포트 축척 재지정, 각도는 그대로(도움말 "To Set Dimension Scale…"의 객체를 바로 고르기, DIMLFAC — 좌표·반지름·지름 포함,
  각도에는 효과 없음). 모형 공간 치수의 음수 DIMLFAC는 1(도움말 DIMLFAC, .NET 안내서)(2026-10-30)
- [x] 도면 공간의 DIM(스마트 치수)·꺾기 반지름: 마우스 아래 객체·객체 고르기가 단일 뷰포트에 보이는 모형 객체, DIM의 두 점·세로좌표·각도(A) 점은 뷰포트 안 모형 스냅,
  길이 값은 뷰포트 축척 재지정, 각도는 그대로. 연속·기준선(DIMCONTINUE·DIMBASELINE·DIM의 C·B)의 두 번째 원점도 모형 스냅(값은 그대로)(2026-10-30)
- [ ] 도면 공간 치수의 남은 일: 공간을 넘는 연관(DIMASSOC 객체의 공간 넘김 플래그와 모형 객체·뷰포트 경로를 DXF·DWG에 어떻게 적는지 근거가 모자라 지금은 비연관 —
  모형 객체를 고치거나 뷰포트 축척을 바꾸면 따라가지 않는다), 연속·기준선이 앞 치수(모형 스냅 치수)의 뷰포트 축척 재지정을 잇는지와 앞 치수와 다른 뷰포트일 때
  (도움말 DIMCONTINUE·DIMCONTINUEMODE는 치수 스타일·도면층만 잇는다고 한다 — 지금은 도면 공간 값), QDIM의 뷰포트 안 모형 객체(도움말에 없고 선택 세트를 쓴다)
- [x] 도면 공간 세로좌표의 데이텀: DIMORDINATE·DIM 세로좌표·연속·기준선·QDIM 세로좌표가 지금 공간의 UCS 원점(도면 공간은 $PUCSORG — 전에는 어느 공간에서나
  모형 UCS 원점 $UCSORG)에서 잰다. 도면 공간 UCS 원점을 모형 데이텀의 종이 자리에 두면 뷰포트 안 모형 객체의 세로좌표가 모형 값(도움말 "About the Types of Dimensions",
  "About Creating Ordinate Dimensions", UCS, UCSORG)(2026-10-30)
- [x] 회전한 UCS에서 새로 만드는 세로좌표 치수(DIMORDINATE·DIM 세로좌표·연속·기준선)의 X·Y 값, X·Y 데이텀 자동 고르기, 지시선 축을 그 UCS 방향으로,
  DXF·DWG 치수 수평 방향(51)에 −UCS 각도(도움말 "About Creating Ordinate Dimensions", DIMORDINATE, DXF 참조 공통 치수 그룹 코드 51 — 표본 도면의 치수 10,331개에는
  51이 있는 것이 없어 ezdxf 다시 그리기와 맞췄다). 돌지 않은 UCS·이미 있는 치수는 그대로, STRETCH·DIM 정렬(G)도 51 축(2026-10-30)
- [x] 회전한 UCS에서 새로 만드는 선형 치수(DIMLINEAR 자동·H·V·R, DIM의 선형, DIMHORIZONTAL·DIMVERTICAL)의 수평·수직을 그 UCS 축으로:
  치수선 각도(50)에 UCS 각도(수직은 +90°, 회전 R은 UCS X축에서 잰 각도를 더해), 수평 방향(51)에 −UCS 각도(도움말 "About the Types of Dimensions" 회전한 보기,
  "About the User Coordinate System", DXF 참조 공통 치수 그룹 코드 51·선형 치수 50, ObjectARX 참조 AcDbRotatedDimension — 표본 선형 치수 5,484개에 51이 없어
  ezdxf가 UCS에서 만든 18개와 50·화살촉·보조선·문자 방향을 맞췄다). 선형 연속·기준선은 기준 치수의 50·51을 잇는다. 돌지 않은 UCS·이미 있는 치수는 그대로(2026-10-30)
- [ ] 세로좌표·선형의 남은 일: QDIM(선형·세로좌표 모두 WCS 축 — 도움말 QDIM에 UCS 이야기가 없다), 정렬·각도·반지름·지름 치수의 51(DIMTIH 수평 문자가 아직 WCS —
  DXF 참조의 51 설명은 선형 치수만 말한다), DIMLINEAR 회전(R)·문자 각도(A)의 ANGBASE·ANGDIR, AutoCAD가 회전한 UCS에서 쓴 선형·세로좌표 실물 짝으로
  51·치수 블록 확인, 도면 공간 UCS 원점을 고를 때 뷰포트 안 모형 객체에 스냅하는 것(UCS 명령 — 도움말의 도면 공간 모형 스냅은 치수 이야기뿐)
- [x] 도면 위 측정 결과 글·커서 툴팁이 화면 가장자리에서 잘리거나 명령행·휴대폰 측정 띠·시트에 가리면 비킨다(겹치지 않으면 예전 자리)(2026-10-30)
- [x] 정밀 조준 십자선이 측정 띠·명령행·시트 밑에 숨지 않게: 판에서 조준창 + 표식기 반지름 + 2(기본 18화소) 안이면 가장 가까운 변 바깥으로 비켜,
  조준창 안에서 잡힌 스냅 표식도 판 밖에 보인다(SketchUp 앱 25차 십자선 비키기와 같은 규칙 — 판 밑은 겨눌 수 없는 벽). 떼면 비킨 자리(2026-10-30)
- [x] 표 셀 제자리 편집: 셀 안을 두 번 누르기(빈 셀 안도)·TABLEDIT·TEXTEDIT로 그 셀 문자 자리(표 그림의 셀 MTEXT와 같은 부착점·폭·높이·방향)에 문자 편집기,
  Tab·Shift+Tab 다음·이전 셀, 같은 표의 다른 셀을 누르면 그 셀, 고친 셀은 바로 반영(행 높이 맞춤)하고 한 번의 편집은 명령 취소 한 단계, "모든 셀"은 표 전체 대화상자
  (도움말 "About Adding Text and Blocks to Tables" — 셀을 두 번 눌러 고치고 Tab으로 다음 셀, 셀 안 화살표는 커서, 줄이 늘면 행이 높아진다. TABLEDIT)(2026-10-30)
- [x] 표 셀 고르기: 명령 없이 셀 안을 누르면 그 셀(격자선 가까이는 표 객체), Shift+누르기로 범위(병합 셀까지 넓힘), 화살표·Tab·Shift+Tab으로 옮기기,
  Esc로 풀기, 고른 셀에서 글자를 치면 그 글자로 내용을 바꾸며 제자리 편집기. 실선 테두리 강조, 고르기는 도면·명령 취소 목록을 바꾸지 않는다
  (도움말 "About Modifying Tables", "About Adding Text and Blocks to Tables", "To Change the Appearance of Cell Borders")(2026-10-31)
- [x] TABLE로 표를 놓으면 첫 셀 제자리 편집기(도움말 "About Adding Text and Blocks to Tables" — 표를 만들면 첫 셀이 강조되어 바로 입력한다), 표 넣기와 입력은 명령 취소 한 단계(2026-10-31)
- [x] 휴대폰(폭 480px 이하) 셀 편집기: 셀 글자가 편집기 최소 글자(12px)보다 작게 보이면 그 크기까지 확대해 편집 상자 = 셀 문자 폭, 도구 모음은 도면 영역 위 끝,
  편집 셀·위 행·양옆 셀이 그 아래 보이게 옮기고 끝나면 예전 보기(편집 중 사용자가 보기를 바꿨으면 그대로). 넓은 화면은 그대로(2026-10-31)
- [x] 고른 셀의 바로 가기 메뉴(오른쪽 클릭, 안드로이드 길게 누르기): 위·아래에 행 삽입(화면 위·아래 — 위로 쌓는 표는 번호가 반대), 행 삭제, 왼쪽·오른쪽에 열 삽입,
  열 삭제, 셀 병합(모두·행별·열별), 셀 병합 해제. TABLECELL과 같은 계산, 명령 취소 한 단계, 끝나면 같은 셀(밀린 자리·지운 자리·병합 범위)
  (도움말 "About Modifying Tables" — 셀을 고르고 오른쪽 누르기로 열·행 넣기·지우기와 이웃 셀 합치기, "To Add Rows or Columns to a Table" — 행 ▸ 위에·아래에,
  열 ▸ 왼쪽에·오른쪽에, "Table Cell Ribbon Contextual Tab" — 행·열 삭제, 셀 병합 모두·행별·열별, 병합 해제)(2026-10-31)
- [x] 셀 그립: 고른 범위의 네 변 가운데, 끌면(누르고 놓을 점을 눌러도) 그 변 쪽 열 폭·행 높이만, 맞은편 변은 그대로(왼쪽·삽입점 쪽 변이면 표 삽입점이 옮겨진다).
  행은 문자보다 낮게 줄지 않고, 그립 변은 누른 자리에서 옮긴 만큼 간다(GRIPEDIT ** 신축 **, 명령 취소 한 단계). 그립은 격자선 가까이·표 밖·고른 범위 안 변 가까이에서 잡히고
  이웃 셀 안은 예전처럼 셀 누르기(도움말 "About Modifying Tables" — 셀을 고르면 테두리 가운데에 그립, 끌면 그 셀과 열·행이 커지거나 작아진다,
  "To Resize Rows or Columns in a Table" — 셀을 고르고 그립을 끌어 그 행·열 전체 크기)(2026-10-31)
- [x] 휴대폰 셀 편집기 도구 모음을 한 줄로(굵게·기울임꼴, 명령 취소·복구, 모든 셀, 확인·취소, 도구 더 보기 — 나머지는 더 보기를 누르면 그 아래 줄. 375px 142px → 42px).
  톡으로 연 편집기의 초점이 body로 빠지던 것(375px 헤드리스)을 상자로 되돌린다. 안드로이드 길게 누르기 메뉴는 손가락을 떼도 닫히지 않는다(2026-10-31)
- [x] 입력기(한글 등)의 첫 조합 키(Process·229)를 고른 셀에서 받으면 셀 편집기를 빈 내용으로 열고 초점을 옮겨 조합을 편집기에서 잇는다(헤드리스 Chrome의
  입력기 흉내로 확인 — 운영체제 입력기 실기기 확인은 남은 일)(2026-10-31)
- [x] 끌어서 여러 셀 고르기: 셀 안에서 마우스·펜으로 누른 채 끌면 창·올가미 대신 누른 셀에서 지금 셀까지의 사각 범위(병합 셀을 덮게, 표 밖이면 그쪽 끝 행·열,
  Shift면 지금 기준 셀에서). 격자선·표 밖·표 위 객체·셀 그립에서 시작한 끌기와 손가락 한 개 끌기(화면 이동)는 그대로
  (도움말 "About Modifying Tables" — 여러 셀은 셀 위를 누르고 끌어 고른다)(2026-10-31)
- [x] 셀 메뉴의 정렬 ▸ 아홉 가지(고른 범위의 셀 정렬 재지정, 지금 정렬에 ✓, DXF·DWG 셀 재지정으로 저장). 표를 고른 메뉴의 열 폭 같게·행 높이 같게(표의 폭·높이를 나눠)
  (도움말 "Table Cell Ribbon Contextual Tab"의 정렬, "To Resize Rows or Columns in a Table" — 표를 고르고 오른쪽 누르기 → 열·행 크기 같게, "Table Visor")(2026-10-31)
- [x] 휴대폰 셀 그립: 손가락의 위·아래 그립은 고른 범위 안 가운데 선까지(375px 5열 표의 8px 행에서 4.5px → 6.5px, 이웃 셀·먼 격자선은 그대로)(2026-10-31)
- [x] 셀마다의 배경 채우기: 표 자료·확장 자료(OPENCAD_TABLE 맨 끝 fill 묶음)·표 그림(격자선·문자 아래 SOLID), AutoCAD 표의 셀 재지정 63·283 읽기와
  DXF·DWG 쓰기(셀에서 재지정한 채우지 않음은 DXF 플래그 2와 283 1), AutoCAD 표를 고쳐도 셀 채우기가 남는다. 셀 메뉴의 배경 채우기 ▸(없음·일곱 색·색 선택...),
  MATCHCELL이 채우기도 옮긴다(도움말 "Table Cell Ribbon Contextual Tab"의 Table Cell Background Color, DXF 참조 TABLE 셀 재지정 63·283)(2026-10-31)
- [x] 고른 셀의 특성 팔레트: 표 셀 — 행 높이·열 폭·정렬·배경 채우기, 여러 셀이면 고른 범위 모두에 적용하고 값이 다르면 *여러 개*, 바꿀 때마다 명령 취소 한 단계
  (도움말 "To Change the Properties of Cells in a Table", "About Table Styles"의 셀·내용 묶음)(2026-10-31)
- [x] 셀마다의 문자 높이·문자 색: 표 자료·확장 자료(fill 뒤 theight·tcolor 묶음)·표 그림·행 높이 맞춤·셀 편집기, AutoCAD 표의 셀 재지정 140·64 읽기와
  DXF·DWG 쓰기, AutoCAD 표를 고쳐도 남는다. 고른 셀의 특성 팔레트 "내용" 묶음(문자 높이·문자 색상), MATCHCELL이 문자 높이·색도 옮긴다
  (DXF 참조 TABLE 셀 재지정 140·64, 도움말 "About Table Styles"의 셀·내용 묶음, ActiveX Table의 SetCellTextHeight·SetCellContentColor, MATCHCELL 도움말)(2026-11-01)
- [x] 셀 재지정 지우기: 셀 메뉴 "특성 재지정 제거"(고른 범위), 표를 고른 메뉴 "모든 특성 재지정 제거"(표 전체) — 정렬·배경 채우기·문자 스타일·문자 높이·문자 색,
  확장 자료를 지운 앱 표(모든 셀이 셀 스타일과 같은 재지정)도 정리된다(도움말 "To Change the Properties of Cells in a Table"의 Remove Property Overrides,
  "About Table Styles"(Mac)의 Remove All Property Overrides, ActiveX Table의 RemoveAllOverrides·ClearTableStyleOverrides)(2026-11-01)
- [x] 셀마다의 문자 스타일: 표 자료·확장 자료(tcolor 뒤 tstyle 묶음)·표 그림·행 높이 맞춤·셀 편집기, AutoCAD 표의 셀 재지정 7 읽기와 DXF·DWG 쓰기, MATCHCELL,
  특성 팔레트 내용 묶음의 문자 스타일. 스타일 참조: 소거가 셀 재지정·AutoCAD 표 원본 태그·테이블 스타일의 문자 스타일을 쓰이는 것으로 세고, 이름 바꾸기가 셀·원본 태그·테이블 스타일을
  따라 바꾸며, 다른 도면으로 복사할 때 셀이 가리키는 문자 스타일도 온다(없으면 Standard). 없는 스타일을 가리키는 셀은 셀 스타일로
  (DXF 참조 TABLE 셀 재지정 7, ActiveX Table의 SetCellTextStyle, 도움말 "About Table Styles"의 문자 특성)(2026-11-01)
- [ ] 셀 테두리 재지정(설계만 — 넣지 않았다):
  - 근거: 도움말 "Cell Border Properties Dialog Box"(선가중치·선종류·색, 이중선·간격, 모든·바깥·안쪽·없음과 위·아래·왼쪽·오른쪽·안쪽 가로·안쪽 세로 테두리에 적용,
    셀을 오른쪽 누르기 → Borders... 또는 특성 팔레트의 테두리 선가중치·색 값의 [...], ByBlock이면 표 스타일을 따른다), "Table Cell Ribbon Contextual Tab"의 Cell Borders,
    "About Table Styles"(Mac)의 셀 묶음 테두리. ActiveX Table의 SetCellGridColor·SetCellGridLineWeight·SetCellGridVisibility
  - 저장: DXF 셀 재지정 69·65·66·68(위·오른쪽·아래·왼쪽 테두리 색), 279·275·276·278(선가중치), 289·285·286·288(표시). 재지정 플래그 비트는 이 저장소의 DWG 표 코덱이
    쓰는 공개 DWG 명세 값(색 0x40·0x80·0x100·0x200, 선가중치 0x400·0x800·0x1000·0x2000, 표시 0x4000·0x8000·0x10000·0x20000 — 위·오른쪽·아래·왼쪽)으로,
    DXF 참조에는 비트가 없다. R2010+ DWG는 셀 스타일의 테두리 묶음(가장자리 비트·재지정 비트)이다. 확장 자료는 tstyle 뒤에 셀·변마다 값 묶음
  - 그림: 지금 격자선은 경계마다 행 종류의 테두리 색 하나로 이어 그린다. 셀마다 변을 나눠 이웃 셀이 함께 쓰는 변(DXF 178 가상 가장자리 — 한쪽이 진짜, 다른 쪽이 가리킨다)에서
    어느 셀의 값을 쓰는지 정해야 하는데, 도움말·참조에 그 규칙이 없어 AutoCAD가 쓴 표본(테두리를 바꾼 표)으로 확인해야 한다(지금 남은 표본에는 표가 없다). 선종류·이중선은 그 뒤
  - 화면: 셀 메뉴 "테두리..." 대화상자(적용 범위 단추 열 — 모든·바깥·안쪽·없음·위·아래·왼쪽·오른쪽·안쪽 가로·안쪽 세로, 색·선가중치), 특성 팔레트 셀 묶음의 테두리 색·선가중치
- [x] 셀 잠금: 셀 메뉴 잠금 ▸(잠금 해제·내용 잠금·서식 잠금·내용과 서식 잠금), 표 자료·확장 자료(tstyle 뒤 lock 묶음)·DWG R2010+ 셀 상태(1 내용·4 서식) 읽기와 쓰기.
  내용 잠금은 바로 입력·셀 편집기·전체 셀 대화상자·특성 팔레트 셀 문자·찾기 바꾸기를, 서식 잠금은 정렬·채우기·문자 스타일·높이·색·특성 재지정 제거·MATCHCELL 대상·행의 셀 스타일을
  막고 알린다(도움말 "Table Cell Ribbon Contextual Tab"의 Cell Locking, "To Unlock Data Extraction Table Cells for Editing", "About Linking a Table to External Data",
  ActiveX SetCellState·AcCellState)(2026-11-01)
- [ ] 표 셀의 남은 일: Shift+화살표로 넓히기(도움말에서 찾지 못했다), 마지막 셀에서 Tab이면 새 행(Autodesk 도움말에서 찾지 못했다 — 사용자 게시판 글뿐),
  Delete로 셀 내용 지우기·셀 메뉴의 내용 모두 지우기(리본·바로 가기 메뉴 도움말에 없다), 셀 스타일 재지정(셀마다 다른 셀 스타일 — 도움말 "Table Cell Ribbon Contextual Tab"의
  Table Cell Styles는 있지만 DXF 참조에 셀마다의 셀 스타일 코드가 없고, 표 자료·그림이 행 종류마다의 테두리로 그린다), 셀 데이터 형식(리본의 Data Format — DXF 참조는 값 묶음 코드의
  뜻을 적지 않는다), 특성 팔레트의 특성 재지정 제거·셀 잠금(도움말은 바로 가기 메뉴·리본만 적는다), 잠금을 DXF로 AutoCAD에 넘기기(DXF 참조에 코드가 없다),
  잠긴 셀이 든 행·열 넣기·지우기·병합을 막을지(도움말에 없다), AutoCAD DWG에서 읽은 표의 셀 "채우지 않음" 재지정을 원본 태그로 옮기기,
  표가 든 실제 도면으로 셀 채우기·문자 스타일·높이·색·잠금 확인, 셀 메뉴의 셀 스타일·테두리·데이터 형식·블록·필드·수식 삽입,
  고른 셀 범위만 열 폭·행 높이 같게(도움말은 표를 고른 메뉴뿐), Ctrl+Y로 셀 메뉴 동작 되풀이(앱은 Ctrl+Y가 명령 복구),
  손가락으로 끌어 여러 셀 고르기(한 손가락 끌기는 화면 이동), 휴대폰에서 아주 작게 보이는 셀(8px 행)의 위·아래 그립은 넓혀도 6.5px라 확대해서 쓰는 편이 낫다,
  한글 입력기 실기기 확인, 자동 쌓기·철자 검사·배경 마스크, QDIM·DIMJOGGED 머리말 재지정
- [ ] VIEW에 UCS 저장, 사용자 특성 10개 넘게, 배치 플롯 범위·윈도우, 브라우저마다 다른 contenteditable·시간에 민감한 오른쪽 클릭 실기기 확인

## 6단계: AutoCAD와 맞대어 찾은 빈틈 (2026-10-21)

AutoCAD 2D 제도 기능과 하나씩 맞대어 본 결과(틀린 도면·자료 손실을 먼저)를 고칩니다.

- [x] 외부 참조 블록 레코드: R2004+ DWG의 외부 참조·덧씌우기 블록에는 소유 객체 수가 없다(읽으면 외부 참조가 사라지고, 쓰면 AutoCAD와 배치가 달랐다)
- [x] 그리기 순서 표(ACAD_SORTENTS)가 있는 도면의 DRAWORDER·TEXTTOFRONT·HATCHTOBACK·CDORDER와 경계 뒤 해치(표를 같은 편집 단계에서 고친다)
- [x] 저장 전 확인(빠지거나 바뀌는 객체 목록), R2013+ 자료 저장소(AcDsPrototype_1b) 같은 버전 보존, 원본 자료가 없는 사용자 객체를 그 그림으로 쓰기
- [x] DXF OLE2FRAME 원본 자료 보존(옮긴 모서리 반영), DWG OLE는 위치를 몰라 그리지 않고 알림
- [x] 블록 내용 다중 지시선의 속성 값(풍선 번호) 그리기와 MLEADER에서 값 묻기
- [x] ELLIPSE 다른 축이 더 길 때 축 바꾸기, POLYGON 반지름 입력 시 아래 변 수평, OFFSET 지우기가 잠긴 도면층 원본을 지우던 문제
- [x] AREA·MEASUREGEOM 면적: 호·타원호(현으로 닫음)·닫힌 스플라인, 면적 추가(A)·빼기(S)
- [x] 플롯 축척을 AutoCAD 의미(용지 단위 = 도면 단위)와 용지 단위(mm·인치)로, 실제 축척 안내. 윈도우·범위 플롯 영역 밖 자르기, 배치 플롯이 대화상자 설정(용지·축척·대상·간격띄우기)을 따름, 도면 공간 먼저/나중, 선가중치 축척, 투명도 플롯
- [x] PDF: 투명도(ExtGState), 도면층(OCG), 검색·복사되는 숨은 문자(Type3·ToUnicode), 같은 스타일 채우기 한 경로, 자르기 경계에 걸친 글자, 한글 제목
- [x] 아주 촘촘한 해치(무늬 선 20만 넘음): 경계와 성긴 무늬로 그리고 확대하면 보이는 영역을 원래 간격으로(세부 장면). 만들기 상한은 AutoCAD HPMAXLINES(100만)
- [x] GDT 글꼴 기호(gdt.shx 없이), 세로 문자 스타일
- [x] 영역·3D 솔리드·바디(REGION·3DSOLID·BODY)의 모서리 선: SAT(판 1.06·4·7)·SAB(DWG 본문, R2013+ 자료 저장소, DXF ACDSDATA)에서 직선·원호·타원호·스플라인 모서리를 뽑아 그린다. DWG에서 읽은 SAT는 R2000~R2010 DXF에 ACIS 객체로 남긴다
- [x] MASSPROP(영역·닫힌 객체의 면적·둘레·도심·관성 모멘트·주 모멘트, .mpr 파일), 영역의 AREA. REGION·UNION·SUBTRACT·INTERSECT는 대신 쓸 명령을 알린다
- [ ] 영역 만들기·불리언(REGION·UNION·SUBTRACT·INTERSECT): ACIS 형상을 새로 써야 해서 AutoCAD로 열어 확인할 수 없는 지금은 하지 않는다
- [x] 치수 블록이 없는 치수: 치수 생성기로 치수 스타일(DIMLUNIT·DIMZIN·DIMPOST·공차·화살촉)대로 다시 만들어 그린다(파일에는 넣지 않는다)
- [x] 여러 줄 문자 문단: 탭 정지 여러 개와 가운데·오른쪽 탭, 줄 간격(배수·정확히), 문단 앞·뒤 간격, 양쪽 정렬, 단 높이가 없는 열의 단 나누기
- [x] 뷰포트별 도면층 재지정(VP 색·VP 선가중치·VP 투명도)을 화면·플롯·PDF에서 그 뷰포트에만
- [ ] VP 선종류 재지정, 최대화한 뷰포트(VPMAX)의 재지정 — 장면을 뷰포트마다 다시 만들어야 한다
- [ ] txt·isocp 등 SHX와 글자 폭이 같은 대체 글꼴, Calibri·Cambria 등과 폭이 같은 TTF(Carlito·Caladea) 동봉 — 재배포할 수 있는 글꼴 파일을 받아 와야 한다(SHXFONTS로 이 컴퓨터의 SHX를 쓰면 원래 폭)
- [ ] DWG R2007(AC1021) 쓰기: R2007 컨테이너는 리드-솔로몬 부호화·별도 문자열 흐름이 필요하고 AutoCAD로 열어 확인할 수 없어 아직 R2004로 쓴다(저장 전 확인이 빠지는 것을 알린다)
- [x] 다른 버전 DWG로 저장할 때 영역·3D 솔리드·바디: R2000에는 SAT(판 7 이하) 자료로 ACIS 객체를 쓰고, 그 밖의 버전은 빼지 않고 모서리 선을 3D 폴리선으로 남긴다(DXF 쓰기와 같게). DXF R2013+ ACDSDATA에는 지운 솔리드의 형상 레코드를 쓰지 않는다
- [ ] ACIS를 SAT↔SAB로 바꿔 R2004+ DWG·R2013+ DXF에 ACIS 객체로 쓰기, R2013+ DWG 자료 저장소(AcDsPrototype_1b)를 새로 만들기(같은 버전 DWG에서 지운 솔리드의 레코드 정리 포함) — 저장소의 색인·스키마·검색 구역을 새로 써야 하는데 AutoCAD로 열어 확인할 수 없다. OLE 자료 안의 위치와 OLE 내용(WMF·EMF 미리 보기) 그리기는 실물 표본이 없다
- [x] 휴대폰 보기 모드: 측정 띠의 객체 스냅 칩(끝점·중간점·중심·교차점·수직 발·근처점, 따로 기억), 더 보기(점 좌표 ID·문자 찾기·참조 파일 고르기), 빠진 외부 참조·이미지·PDF·SHX 글꼴 안내 카드
- [x] ARC 11가지 방법(이어 그리기, 시작·끝·방향, 시작·중심·각도·길이 등, Ctrl 방향 전환)과 리본 호 메뉴, CIRCLE 접선·접선·접선(리본)과 리본 인자, FILLET·CHAMFER Shift 구석
- [x] PEDIT 다중 결합 퍼지 거리·결합 유형(연장·추가·모두), JOIN 닫기(호 → 원, 타원형 호 → 타원), 문자를 TRIM·EXTEND 모서리로, 폴리선과 선·호 모깎기 결합
- [x] TRIM으로 해치 자르기(고른 칸을 빼고 섬 유지, 연관 끊음), 한 바퀴 원 경계의 경계 객체(볼록도 무한대) 수정
- [ ] TRIM·EXTEND로 다중선·치수 고치기 — AutoCAD의 요소별 끝(요소 매개변수)·정의점 이동 규칙을 AutoCAD로 확인하지 못했다. 지금은 MLEDIT·정의점 그립을 안내한다
- [x] PURGE: 다중 지시선·테이블·다중선 스타일, 빈 그룹, 등록된 응용프로그램, 0 길이 형상·빈 문자 객체(대화상자·-PURGE). MATCHPROP 설정(S) 대화상자
- [ ] PURGE 재료·플롯 스타일·형태·비주얼 스타일·고립된 데이터 — 이 앱이 만들거나 고치지 않는 자료라 알리기만 한다
- [x] DIMANGULAR 사분점(Q), DIMARC 지시선(L), 각도 치수 연속·기준선, 하위 치수 스타일(이름$0·$2·$3·$4·$6·$7: 그리기·만들기·스타일 관리자)
- [x] 용지: ISO B0~B5, JIS B4·B5, ARCH A~E1, 사용자 크기(mm). PUBLISH가 열린 도면들의 배치·모형을 한 PDF로
- [ ] PUBLISH 시트 목록 저장·불러오기(DSD)와 DWF·DWFx 출력 — DWF는 범위 밖, DSD는 열린 도면만 다루는 지금은 필요가 적다
- [ ] 동적 블록 작성(BPARAMETER·BACTION·BVSTATE·BVHIDE·BVSHOW·BTESTBLOCK 등): AutoCAD 평가 그래프(노드·연결·객체 표지·참조 표현)를 새로 써야 하는데 이 앱이 만든 그래프를 AutoCAD가 받아들이는지 확인할 수 없어 안내만 한다. 기존 동적 블록의 값 편집과 BEDIT 형상 편집은 된다
- [x] 보기 링크(VIEWLINK, `#view=`): 지금 화면의 가운데·배율·배치 탭을 주소로 공유하고, 그 주소로 열면 같은 범위를 맞춘다(파일은 담지 않는다 — STEP 앱과 같은 방식)

## 품질 과제

- [x] Arial·Times와 글자 폭이 같은 OFL 글꼴(Liberation)로 트루타입 문자 배치 맞추기
- [x] 사용자 컴퓨터의 SHX 글꼴 불러오기(SHXFONTS, 일반·큰 글꼴·유니코드, 복합 선종류 도형과 SHAPE 객체)
- [x] 다각형·원 뷰포트 자르기(화면 스텐실, PDF·SVG 자르기 경로)
- [x] XCLIP 블록 자르기(사각형·다각형·반전, 경계 틀)
- [x] 프록시 그림(사용자 객체, ODA 명세 29장의 선·원·호·다각형·메시·셸·문자·색·변환)
- [x] 아주 깊이 확대했을 때 곡선 다시 나누기(보이는 영역 세부 장면)
- [x] PSLTSCALE(뷰포트마다 점선 무늬를 종이 길이로 맞춤, 화면·PDF·SVG·플롯)
- [x] 이미지·가리기 자르기 경계 방향, 맞춤 폴리선의 호, 폭 0 세그먼트, IMAGEFRAME·WIPEOUTFRAME(변수 객체에 저장)
- [x] 아주 큰 도면(수백만 객체) 읽기·메모리 최적화(DXF 바이트 토큰화로 문자열 한계 없이, 장면 상자·글리프를 형식 배열로, 워커→메인 상자 전송; 합성 300만 객체 DXF·DWG를 4GB 힙에서 읽고 그림)
- [x] 큰 도면 점진 빌드(첫 화면에 보이는 객체부터 그려 보이고 나머지는 만드는 대로 이어 그림), 메인 문서 사본 줄이기(장면 뒤에 큰 블록 객체를 묶음으로 부호화해 보냄), 묶음 그리기 호출 줄이기(전체 보기에서 작은 묶음을 큰 칸 무리로 합침)
- [x] 큰 도면 정점 평탄 좌표(경량 폴리선·해치 폴리선 경계 정점을 수 배열로 — 100만 객체 문서 힙 670→555MB), 워커 쪽 문서 부호화 더 빠르게(모양별 쓰기 함수·수 배열 한꺼번에 — 0.9~1.0→0.68초)
- [x] 나머지 정점 평탄 좌표(2026-10-28): 2D·3D POLYLINE·다각형 메시·폴리페이스 정점, 해치 모서리(선·호·타원호·스플라인) 경계, MESH 정점·면·모서리, 지시선 정점을 수 배열로
  (합성 객체 하나 2D 폴리선 1,207→506B·3D 1,516→609B·모서리 해치 1,972→1,109B·지시선 743→393B, 정점 섞음 100만 객체 문서 힙 1,050→685MB)
- [x] 스플라인 조정점·맞춤점 평탄 좌표(2026-10-29): 조정점·맞춤점을 수 배열로(실제 도면의 스플라인 856개 하나 1,866→1,106B,
  합성 2만 개 조정점 스플라인 965→358B·맞춤점 스플라인 790→293B. 실제 도면 412개의 저장 바이트·장면 지문 그대로)
- [ ] 다중 지시선(MULTILEADER) 정점 평탄 좌표: 선 하나의 정점이 평균 1개라(다중 지시선 2,507개에 점 2,600개) 선 객체 184 → 120B로 작아 뒤로 미룬다
- [ ] 점 객체·공통 속성 줄이기: 실제 도면 2,770개를 재 보니(2026-10-29, Node 힙) 선 596,425개 하나 570B 중 점 객체 둘이 210B(37%),
  점(POINT) 20,738개 하나 362B 중 점 객체 105B(29%)·고유 색 32B다. 점 객체 둘을 수 배열 하나로 바꿔도 선 하나가 약 104B(18%) 줄고(같은 Node에서 잰 어림), 공통 속성은 ByLayer 색을 이미 함께 쓰며
  도면층·선종류·소유자 이름을 하나로 모아도 객체 하나 19B(2%)라 30%에 못 미쳐 뒤로 미룬다.
  26차에 다시 보니 `.start`·`.end`를 바로 읽는 줄이 소스 100개 파일 408줄(다른 모양 것도 섞임), LINE 종류를 가리키는 곳이 115곳이라
  스플라인처럼 쓰는 곳마다 풀어 쓰고 되담기에는 위험이 커서 하지 않았다(공개 객체 모양도 바뀐다)
- [x] 실제 도면 2,770개 훑기(읽기 → 장면 → DXF·DWG 쓰기 → 다시 읽기, ezdxf와 AutoCAD가 같은 도면을 쓴 DXF로 대조)에서 찾은 것:
  R2007 이전 DWG 이름의 \U+ 글자 풀기, DWG 문자 맞춤점 기본값 (0, 0)(가운데·오른쪽 맞춤 문자 위치), 호 길이·꺾기 반지름 치수 종류 값(AutoCAD 5·9),
  쉐이프 번호만 있는 SHAPE를 DXF에 번호(70)로 남기기, 없는 블록을 가리키는 블록 참조를 DWG에 빈 블록으로
- [x] 실제 도면 훑기 도구(`npm run sweep`, `sweep:compare`): 같은 표본으로 고치기 전·후를 견준다. 2,770개 한 바퀴가 4갈래로 약 1분(ezdxf 대조를 더하면 약 2분)
- [x] 훑기에 남은 왕복 차이(2026-10-27, 2,770개 — 같은 도면을 AutoCAD가 쓴 DWG·DXF 짝으로 옳은 값을 정함):
  DXF 문자열의 캐럿 표기(`^J`·`"^ "`)를 읽을 때 풀기(문자 차이 49 → 0개, DXF로 연 도면을 DWG로 저장하면 `^J` 글자가 들어가던 것),
  DWG R2013+ SPLINE의 첫 값·플래그·매듭 매개변수 ↔ DXF 70(1024·32·64·128, 닫힘 1) 맞추기(맞춤점 스플라인을 균일 매듭으로 쓰던 것),
  2D 폴리선 정점 Z를 고도로 덮어 쓰지 않기(정점 차이 88 → 0개). 비그래픽 객체가 빠지는 것은 설계대로임을 확인하고 훑기에서 따로 센다
  (같은 형식·판 저장은 원본 자료 그대로, 다른 형식·판은 옮길 자료가 없어 저장 전 확인에 알리고 뺀다 — 재질·비주얼 스타일은 AutoCAD가 다시 만든다)
- [x] 맞춤점 방식 스플라인의 DWG 저장(2026-10-28, 훑기 플래그 차이 42 → 2개·맞춤점 차이 23 → 1개): AutoCAD가 같은 도면을 쓴 DWG·DXF 짝으로
  AutoCAD의 보간을 정했다(3차, 조정점 = 맞춤점 + 2, 매듭 = 정규화하지 않은 맞춤점 매개변수, 끝 접선 = 그 끝의 도함수, 없으면 자연 끝 — 짝 22개에서 1e-12).
  다시 구한 곡선이 같을 때만 맞춤점 자료로 쓰고, 조정점만 남은 1024 스플라인은 맞춤점 자료를 되살린다. R2000~R2010은 현 길이만 맞춤점 자료(AutoCAD와 같다).
  DWG 맞춤점 자료를 읽으면 AutoCAD와 같은 조정점을 채우고(전에는 이 앱의 보간으로 그려 현 길이의 4~25% 달랐다), SPLINE·SPLINEDIT도 같은 보간
- [x] 로컬 대조 전체 시험의 스플라인 실패 15개(2026-10-28): 기준 DXF가 맞춤점 자료를 맞춤점만으로 쓰는 표현 차이(AutoCAD DXF와 DWG 리더에는 같은 조정점·매듭이 있다)를
  대조 비교에서 AutoCAD DXF 꼴로 맞추고, 그 근거를 AutoCAD가 쓴 표본 짝 시험으로 지킨다. 대조 자료를 모두 줄 때만 도는 `npm run test:oracle`로 큰 변경 전후에 확인한다
- [ ] 닫힌 맞춤점 스플라인과 맞춤 공차가 있는 스플라인의 AutoCAD 계산(주기 보간·근사): 실물 짝이 없어 DWG에는 조정점으로 쓰고 알린다.
  훑기에 남은 스플라인 차이 3개는 닫힌 곡선이다(AutoCAD DXF 70의 2048 비트 2개, 이 앱이 만든 닫힌 맞춤점 곡선 1개)
- [x] 알리지 않고 빠지던 비그래픽 객체(2026-10-27, 5개 파일 → 0): DXF로 옮길 수 없는 객체가 섞인 연관 동작을 통째로 뺄 때 저장 전 확인에 알리고,
  IMAGE를 지운 뒤 남은 그림 반응자도 빠진다고 알린다. 로컬 대조(쓴 DWG 31개·DWG 리더 8개·같은 핸들 3개)의 실패는 R2000~R2007 DXF가 동적 블록 정의를
  `*U<n>`으로 쓰는 기준 쪽 표현 차이(AutoCAD도 같다)라 대조 비교에서 맞췄다
- [ ] 연관 동작의 DWG 전용 객체(서수 치수 동작 몸체·점 참조 매개변수 등)를 DXF로 옮기기(AutoCAD가 같은 도면을 쓴 DWG·DXF 짝으로 배치를 정해야 한다)
- [ ] DWG 쓰기의 동적 블록 정의 익명 비트를 AutoCAD처럼 판에 맞추기(AutoCAD는 R2007 이하 DWG에 1, R2010 이상에 0 — AutoCAD에서 열어 확인 필요)
- [x] R2000~R2013 DXF·DWG의 여러 단 MTEXT(단마다 이어진 MTEXT 객체와 ACAD 확장 자료): 한 단을 골라도 모든 단을 함께 고른다(특성 팔레트·이동·지우기가 묶음 전체에),
  저장하면 단 객체와 확장 자료가 그대로 남는다. 복사본은 원본 단을 가리키지 않는 보통 MTEXT가 된다
- [ ] 여러 단 MTEXT: 묶음 하나의 그립(단 폭·간격·높이), 단 사이로 글이 흐르는 제자리 편집, R2018로 저장할 때 한 객체로 합치기, 복사본의 단 연결 유지

## 다른 형식

OpenCAD의 다음 뷰어로 SKP(SketchUp), STEP, NC(G-code·MPR 등)를 같은 방식(서버 없이 브라우저 안에서)으로 만듭니다.
2026-10-16부터 형식마다 별도 저장소에서 개발하며, 남은 일도 각 저장소 README에 있습니다.

- [opencad-viewer3d](https://github.com/GyuTae-Kim/opencad-viewer3d): 공용 3D 뷰어 코어(WebGL2)
- [opencad-nc](https://github.com/GyuTae-Kim/opencad-nc): G-code·Heidenhain 평문·woodWOP MPR
- [opencad-step](https://github.com/GyuTae-Kim/opencad-step): STEP(AP203·AP214·AP242)
- [opencad-skp](https://github.com/GyuTae-Kim/opencad-skp): SketchUp 2021~2026

이 저장소에서 3D 문서를 열던 탭·리본·패널 화면(`src/app/view3d/`)은 커밋 `d7c584a`에서 볼 수 있습니다.
