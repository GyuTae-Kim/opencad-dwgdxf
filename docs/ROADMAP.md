# 로드맵

목표는 서버와 해석 엔진이 있어야 하던 웹 2D CAD의 일을 브라우저 안에서 모두 하는 것입니다.
서버가 하던 파일 해석·편집 계산·저장은 웹 워커가 맡습니다.

## 1단계: 보기와 측정 (완료)

- [x] DXF R12~R2018 리더(ASCII·이진, CP949·UTF-8)
- [x] DWG R13~R2018 리더(ODA 공개 명세로 새로 작성), R12 리더(공개 형식 설명으로 새로 작성, 49차)
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
- [x] 주석 축척: 해치 레코드 루프의 경계(290 = 0 — 해치 본문 경계 경로 꼴) 읽기·쓰기, 만드는 해치 레코드의 루프 종류를 경로 플래그 그대로, 만드는 HATCHVIEW 루프는 경계 없이(122차 — 실제 DWG 20개의 레코드 67개 비트 같음)
- [ ] 주석 축척: 치수 레코드 값(71·280 등)의 뜻, 여러 줄 속성·다중 지시선·반지름·세로좌표 치수 레코드 실물, 공차(FCF) 레코드, AutoCAD에서 열어 확인
  (123차에 잰 치수 레코드 5,951개의 (71, 280): (1, 31) 3,389·(0, 0) 2,318·(1, 16) 230·(0, 16) 9·(1, 17)·(0, 1)·(0, 31) 몇 개 — 280은 비트 묶음으로 보이지만 뜻을 가를 근거가 없어 새 레코드는 그대로 0)
  (해치 루프 경계는 122차에 DWG만 실물로 맞췄다: DXF 태그는 짝이 없어 HATCH 경계 경로 그룹 코드 차례로 두었고, 호·타원호·스플라인 루프는 실물이 없다(폴리선 80·선 모서리 35만 봤다).
  290 = 0 루프 플래그는 모두 512 비트가 있지만 512 비트 루프에도 290 = 1이 있어 AutoCAD가 언제 경계를 적는지는 모른다 — 적은 점은 모두 해치 본문 루프와 같았다.
  해치 레코드의 패턴 선이 기본 레코드와 같은 것(축척 배율 비와 맞지 않는 것)이 새로 읽은 비기본 레코드 36개 중 34개, 전부터 읽던 48개 중 12개다. 이 앱은 레코드 선을 그대로 그린다 —
  AutoCAD 뷰 레코드(HATCHVIEW)도 그 뷰포트 축척과 같은 것 120개 중 116개가 같은 축척 레코드 선이지만, AutoCAD가 그 축척으로 볼 때 다시 계산하는지는 AutoCAD에서 열어 봐야 안다.
  HATCHVIEW 모음: 실물은 뷰가 축척 레코드보다 많은 해치가 67개 중 59개, 뷰 239개 중 141개가 뷰포트 핸들(330)을 가리키는데, 이 앱은 편집 뒤 축척 레코드마다 하나(330 = 0)로 다시 만든다)
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
- [x] 치수 화살표 반전 값 읽고 쓰기(130차, Autodesk "To Flip the Direction of an Arrowhead"): R2007+ DWG의 비트와 DXF 74·75를 읽고 저장에 옮긴다
  (전에는 버리고 0으로 써서 AutoCAD가 다시 그리면 반전이 풀렸다 — 실제 도면 3개의 치수 3개)
- [x] 치수 화살표 반전 그림과 명령(131차): 이 앱이 회전 선형 치수의 그림 블록을 다시 만들 때 닫고 채운 화살촉의 반전을 그린다. 도움말에는 그림 규칙이 없어
  AutoCAD가 그린 반전 블록이 든 실제 도면 3개의 치수 3개(바깥 화살촉 하나·둘을 안으로, 안쪽 둘을 밖으로)에서 읽었다 — 반전하지 않은 그림은 그대로, 반전한 화살촉마다
  몸통을 반대로, 몸통 밑동 너머 화살촉 길이 선, 발에서 원래 화살촉 자리만큼 선. 화살표 반전 `AIDIMFLIPARROW`(고른 점에 가까운 화살표, 바로 가기 메뉴,
  치수선 끝 그립 메뉴), 명령 취소, R2007+ DWG·DXF 저장
- [x] 정렬 치수의 화살표 반전 그림과 명령(150차): 반전 실물은 회전 치수뿐이지만(실제 도면 840개의 반전 치수 3개) 반전 깃발은 치수 공통 자료이고(130차),
  132차 맞춤 규칙이 정렬 치수에도 그대로 맞아(블록 같음 정렬 125 → 134) AutoCAD가 두 종류를 같은 배치로 그린다고 보고, 131차 꼴(치수선 좌표)을 정렬 치수의 닫고 채운 화살촉에도 그린다.
  화살표 반전 명령·바로 가기 메뉴·그립 메뉴도 정렬 치수를 받는다. 정렬 치수와 같은 방향 회전 치수의 그림이 반전까지 같음을 시험으로 지킨다. 실제 도면에 반전한 정렬 치수가 없어 앞 차수 결과에서 바뀌는 치수는 없다
- [ ] 치수 화살표 반전의 남은 일: 각도·반지름·지름·세로좌표·호 길이·꺾기 반지름 치수와 블록·눈금 화살촉의 반전 그림(AutoCAD 반전 블록 실물이 없어
  반전 없이 그리고, 반전 명령은 알리고 그대로 둔다 — 호·지시선 꼴이라 선형 규칙을 옮길 근거가 없다). 그립 메뉴는 둘째 화살표만(이 앱에는 첫 치수선 끝 그립이 없다).
  R2004 이하로 저장하면 깃발을 담을 자리가 없다
- [x] 선형 치수의 맞춤 판단(화살촉 안쪽·바깥, 132차): 실제 도면 840개의 AutoCAD 치수 블록과 견주어 가른 규칙 — 화살촉만 안에 둘 때도 화살촉 두 개 + 2·DIMGAP
  (DIMGAP 도움말의 치수선 조각 최소 길이, 경계 (보조선 사이 − 2·DIMASZ)/DIMGAP 1.998 바깥·2.18 안), 제자리 문자가 치수선 위·아래(DIMTAD≠0)면 문자와 화살촉이 저마다 들어가면 둘 다 안,
  옮긴 문자(사용자 위치 + DIMTMOVE 1, DIMTMOVE 2 + DIMATFIT 3이 아닌 것)는 문자 폭을 세지 않고 DIMATFIT 0·1에서 문자 중간점이 보조선 밖이면 화살촉도 밖.
  화살촉 둘이 보이는 선형 치수 6,246개의 배치 차이 916 → 129개(같던 것이 달라진 치수 0), 블록 비교가 같은 치수 1,003 → 1,096개.
  131차에 잰 반전 치수 도면 3개의 반전 없는 선형 치수 100개 가운데 다른 것 12 → 1개
- [x] 문자 없는 선형 치수의 화살촉 맞춤(143차): 숨긴 문자(' ') 치수는 둘 다 들어감을 문자 자리 0 + 화살촉 둘로 세어 위 규칙의 2·DIMGAP이 빠졌다. 실제 도면의
  문자 없는 선형 치수 132개에서 AutoCAD는 (보조선 사이 − 2·DIMASZ)/DIMGAP이 1.981 이하면 모두 바깥(22개), 2.143 이상이면 모두 안쪽(59개)으로 문자 있는 치수의 경계와 같다 —
  배치 차이 129 → 119개, 블록 비교가 같은 치수 1,379 → 1,389개(바뀐 10개 모두 같아짐, 같던 것이 달라진 치수 0). 눈금 화살촉의 문자 없는 치수는 실물이 없어 같은 셈을 따른다
- [x] 건축 단위 치수의 분수 앞 정수 인치 0(144차): 0 피트를 생략해 피트를 보이지 않으면 1인치 미만 분수를 분수만 쓴다(`0 3/4"` → `3/4"`), 피트를 보이면 `4'-0 3/4"`처럼 남긴다.
  실제 도면의 건축 단위 치수 5,279개에서 AutoCAD가 피트 없이 "0 분수"를 쓴 블록은 0개, 피트 뒤 "-0 분수"는 33개(Autodesk 치수 스타일 관리자 1차 단위 탭의 0 피트 예
  `0'-6 1/2"` → `6 1/2"`). 블록 비교가 같은 치수 1,389 → 1,440개(바뀐 324개 모두 문자 다름이 풀림, 같던 것이 달라진 치수 0)
- [ ] 치수 문자의 남은 차이(144차에 잼 — 블록 비교에서 문자 내용이 다른 치수 79개): 공개 표본 두 무리의 R13·R14 파일 5개에서 소수점 쉼표 37개(R14에는 DIMDSEP 칸이 없고
  파일 어디에도 쉼표 근거가 없다 — 145차: 단위도 옛 DIMUNIT 8 "Windows 바탕화면"이 아닌 소수), 호 길이 기호 14개(아래 항목), 저장 블록이 스타일과 맞지 않는 것 15개(같은 치수가 든 도면 8개의 소수 스타일 ↔ AutoCAD 블록 건축 꼴,
  측정값이 다른 분수 5개, DIMZIN 0인데 `1'-0"` 2개). 한 도면에서만 본 것: 주 단위가 건축이고 DIMDSEP이 쉼표일 때 AutoCAD 대체 단위 소수점은 마침표(4개),
  DIMALT가 꺼져 있으면 DIMPOST의 `\X`를 쓰지 않음(8개 — 같은 도면 DXF·DWG), 각도 치수 문자에 DIMPOST 접미(`60°'` — 사용자 문자 `<>` 하나). 표본이 한 도면이라 규칙을 세우지 않았다.
  148차: 쉼표 DIMDSEP 치수는 소수 주 단위에서 AutoCAD 블록도 쉼표로 이미 같고, 공학·과학 주 단위 + 쉼표 실물은 없어 대체 단위 마침표 갈래도 그대로
- [ ] 선형 치수 맞춤의 남은 배치 차이(132차에 잼, 129개 — 143차에 문자 없는 10개를 고쳐 119개): 이 앱의 문자 폭 짐작을 ±30% 바꾸면 맞는 57개(글꼴 없이 가를 수 없음), 그 밖 62개 —
  사용자 위치 DIMTMOVE 0·DIMATFIT 1에서 AutoCAD가 안쪽인 45개(치수선 위 문자 규칙을 넣으면 15개가 더 맞지만 같던 12개가 달라진다. 사용자 위치 DIMTMOVE 0·DIMTAD≠0
  치수 645개 가운데 227개는 AutoCAD가 문자를 치수선 위가 아니라 치수선에 놓았다 — 언제 그러는지 모른다), DIMTMOVE 2 + DIMATFIT 3(지금 셈인 문자 폭과 폭 0이 맞는 치수가 섞임).
  다른 종류는 실물이 적어 맞춤 규칙을 세우지 않았다 — 화살촉(SOLID) 위치·개수가 AutoCAD 블록과 다른 치수(133차에 잼): 두 선 각도 5/111, 세 점 각도 2/20, 반지름 2/40,
  지름 3/21, 호 길이 6/14
- [x] DIMTMOVE 1(지시선) 치수의 문자 자리와 지시선(133차): 치수선 가운데에서 시작하는 선만 지시선으로 세면 문자가 있는 사용자 위치 DIMTMOVE 1 선형 치수 3,494개
  (기울인 보조선 빼고) 가운데 AutoCAD 지시선은 35개(132차의 94개에는 기울인 보조선·꺾은 치수선이 섞였다). 문자가 치수선과 나란하면 문자 중간점이 문자 밑 자리이고
  (문자 가운데 = 중간점 + DIMTAD 쪽 DIMGAP + 높이/2), 중간점이 치수선에서 DIMGAP + 1.1 × 문자 높이 밖일 때만 치수선 가운데에서 (중간점 − DIMGAP)까지 지시선과
  문자 폭 + 2·DIMGAP 밑줄을 긋고 문자를 치수선 가운데의 반대쪽으로 뻗는다(지시선 없는 2,787개·지시선 31개 모두 맞음, 한 줄 문자의 경계 1.595~1.695 DIMASZ).
  블록 비교가 같은 치수 1,096 → 1,379개, 같던 것이 달라진 치수 0
- [ ] DIMTMOVE 1의 남은 일(133차에 잼): 문자가 치수선과 나란하지 않은 85개(문자 회전·DIMTOH 수평 — 회전 문자는 문자를 중간점 옆으로 비켜 놓는 등 꼴을 아직 못 가름),
  DIMTAD 1인데 지시선 없이 문자 가운데를 중간점에 둔 블록 254개(도면 87개, 79개는 같은 도면에 위 꼴과 섞여 가를 값이 없다), 경계의 1.1(자료가 정하는 범위 1.044~1.154 —
  표준 한 줄 문자 몇 개로만 정해짐), 지시선 31개의 문자 폭과 지시선 없는 문자의 높이(글꼴 몫 — 한 줄 문자 가운데의 치수선 거리 1.174 대 이 앱 1.099 DIMASZ 단위 등),
  반지름·두 선 각도 치수의 사용자 위치 DIMTMOVE 1 문자(블록 비교가 반지름 12개 모두, 두 선 각도 21개 가운데 13개 다름 — 실물이 적어 견주지 않음 — 148·149차에 갈래 일부를 고침)
- [ ] 치수 끊기(DIMBREAK)의 AutoCAD 기록(134차에 잼): 실제 도면에서 확장 사전에 ACAD_BREAKDATA가 있는 치수 204개(회전 189·정렬 11·두 선 각도 4, BREAKDATA 객체 417개·도면 117개)
  가운데 블록 비교가 같은 것은 7개(선 개수 다름 175). 이 앱은 자기 기록(OPENCAD_DIMBREAK)만 읽어 이 치수를 다시 만들면 끊긴 틈이 사라진다. AutoCAD 기록은 DWG 비트로만 있고
  (표본 DXF에는 없음 — 핸들은 치수와 끊는 객체들) 그리기 규칙(끊기 크기 — DIMSCALE 24·16인 두 도면의 두 선 각도 치수 틈이 모두 0.893)도 맞춰야 한다.
  135차: 실제 DXF 96개 어디에도 BREAKDATA가 없어 DXF 짝으로 비트를 대조할 수 없었다(새 표본 없이는 그대로)
- [ ] 호 길이 치수의 호 기호(134차에 잼): AutoCAD는 기호를 문자에 넣지 않고 반지름 0.373 × DIMTXT인 반원 ARC로 그린다(이 앱은 문자 앞 ∩).
  실물이 한 표본 도면의 같은 치수(판 14개)뿐이라 자리 규칙을 세우지 않았다
- [x] 각도 치수의 옮긴 문자가 치수 호를 끊기(148차): 사용자 위치 DIMTMOVE 1 문자가 치수 호 위에 놓이면 AutoCAD는 보조선 사이 호를 문자 상자(문자 폭 + 2·DIMGAP)에서
  끊는다 — 실제 도면의 그런 두 선·세 점 각도 치수 7개(도면 7개) 모두. 이제 옮긴 문자가 그 자리 접선과 나란하면 끊는다(바깥 꼬리 호는 그대로 — 여러 줄 문자가 꼬리에 걸친
  실물 1개에서 AutoCAD도 그대로). 기준 판 자료 위 흉내로 바뀐 7개 모두 호 개수가 AutoCAD와 같아지고 같던 것이 달라진 치수 0(새 판은 표본이 없어 실제 도면으로 다시 돌리지 못함)
- [ ] 각도 치수 옮긴 문자의 남은 일(148차에 잼 — 사용자 위치 DIMTMOVE 1 두 선·세 점 각도 치수 22개): MTEXT 자리(삽입점·방향)가 AutoCAD와 다른 것 8개(도면 7),
  DIMTMOVE 1 지시선(호 가운데 → 꺾는 점 → 문자, 실물 1개), 화살촉이 바깥이고 DIMTOFL 0인데 문자를 멀리 옮긴 치수에서 AutoCAD가 보조선 사이 호를 긋는 것(실물 1개),
  세 점 각도 치수의 짧은 보조선(실물 1개). 바뀐 7개의 틈 끝 차이는 문자 폭 짐작(긴 문자 0.519 DIMASZ)과 블록 문자 높이(DIMTXT와 다른 것 1개). DIMTMOVE 2·회전한 문자·호 길이 치수는
  호에 걸친 실물이 없다. 반지름 치수의 사용자 위치 DIMTMOVE 1 문자 12개(도면 6)는 149차에 갈라 MTEXT 자리를 고쳤다(아래)
- [x] 반지름 치수의 옮긴 문자가 지시선 위일 때의 자리(149차): 사용자 위치 DIMTMOVE 1 문자의 중간점이 지시선 위면 AutoCAD는 133차 선형 치수처럼 중간점을 문자 밑 자리로 보고
  문자를 DIMTAD 쪽으로 DIMGAP + 높이/2 비켜 놓는다 — 실제 도면의 그런 반지름 치수 12개(도면 6개, 모두 DIMTAD 1·문자 정렬, 원 안 11·밖 1)에서 선 방향 자리 12/12가 중간점,
  선에서 1.095~1.357 DIMASZ(이 앱 셈 1.090~1.448). 이 앱은 문자 가운데를 중간점에 두어 지시선이 문자 한가운데를 지났다. 148차 기준 판 자료 위 흉내로 MTEXT 거리
  1.095~1.357 → 0.000~0.091 DIMASZ, 같던 것이 달라진 치수 0(새 판은 표본이 없어 실제 도면으로 다시 돌리지 못함). 지시선은 둘 다 문자 먼 끝 + DIMGAP까지라 그대로
- [ ] 반지름·지름 옮긴 문자의 남은 일(149차에 잼): 위 12개의 지시선 끝 차이 0.033~0.811 DIMASZ는 문자 폭 짐작(AutoCAD 폭 ÷ 이 앱 폭 0.98~1.41)이고 남은 문자 자리 차이
  (최대 0.091)는 문자 높이(글꼴 몫)라 블록 비교는 여전히 다르다. 지름 치수의 사용자 위치 DIMTMOVE 1(실물 0개)·DIMTMOVE 2(1개), 지시선에서 떨어진 중간점, 수평 문자는
  실물이 없어 전처럼 중간점을 문자 가운데로 둔다. 사용자 위치 DIMTMOVE 0 반지름 3개(한 표본 무리의 판들 — AutoCAD는 꺾은 선)와 사용자 위치가 아닌 DIMTMOVE 1 반지름 5개
  (도면 4 — 이 앱이 셈한 문자 자리가 0.095~0.707 DIMASZ 다름)는 그대로
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
- [x] DXF OLE2FRAME 원본 자료 보존(옮긴 모서리 반영). DWG(R2000+) OLE2FRAME의 자료·위치 읽기(자료 머리의 네 모서리)와 DXF·다른 판 DWG로 쓰기(73차 — 같은 도면의 AutoCAD DWG·DXF 짝으로 확인)
- [ ] DXF에서 읽은 OLE2FRAME을 DWG로 쓰기: DWG의 flags BS가 DXF 70·71 가운데 어느 것인지 표본(모두 2)으로 가를 수 없다. R2000 이전 DWG OLE2FRAME·OLEFRAME 위치
- [x] 호 길이 치수의 지시선 깃발(134차): DXF 71(지시선 있음)이 0이면 16·17이 있어도 지시선이 없다(AutoCAD는 지시선이 없어도 16·17에 두 보조선 끝을 적는다 —
  같은 도면의 AutoCAD DWG·DXF 짝 여섯 판). 전에는 다시 만들 때 지시선을 더 그리고 저장하면 지시선 있음으로 썼다
- [x] DWG에서 읽은 확장 자료 1003(도면층 — DWG는 핸들, DXF는 이름)을 DXF에 도면층 이름으로 쓰기(134차, 짝 여섯 판). 전에는 핸들 16진을 이름 자리에 썼다
- [x] DWG 도형 선가중치 번호 28(번호 표에 없음)을 ByLayer로 읽기(135차): 같은 도면의 AutoCAD DXF에 370이 없다(짝 두 도면 도형 31개). 전에는 기본값으로 읽었다.
  실제 DWG 742개 중 474개 도면에 332,605개(대부분 옛 해치 블록 *X의 선). 도면층 표의 번호 28은 근거가 없어 그대로
- [x] DWG 공차 주석(creation 1) 지시선의 걸이선(135차, 짝 R2010 한 판 — 글 주석과 같은 15°·DIMASZ 규칙). 블록 주석(creation 2)은 실물이 없다
- [x] 다중 지시선 원시 트루컬러(0xC2)의 ACI를 가장 가까운 색으로(135차 — DWG 리더·AutoCAD R2000 DWG와 같게). 전에는 256이라 검은 트루컬러를 도면층 색으로 그렸다
- [x] R13·R14 DWG 치수의 실제 측정값(136차): R2000 전 DWG에는 칸이 없어(같은 도면의 AutoCAD R13·R14 DXF에도 42가 없다) 0이 아니라 없음(NaN)으로 읽는다.
  측정값이 없으면 특성 창·정보 카드·치수 문자 편집·AutoLISP 42·R2000+ DWG 저장이 정의점으로 잰 값을 쓴다(셈 하나 — 실제 도면의 AutoCAD 저장 값과 견줌:
  두 선 각도는 교점에서 호 자리가 든 부채꼴 89/89, 세 점 각도 10/10, 세로좌표 34/34 등, 같은 도면 R13·R14 ↔ R2000+ 짝의 치수 49/49). 전에는 측정값·표시 문자가 0이었다
- [x] 옛 판 DWG의 AutoCAD 왕복 확장 자료(137차): AutoCAD는 그 판에 칸이 없는 도형 속성을 ACAD 확장 자료의 "RT…" 묶음으로 남긴다(새 판 DWG에는 제 칸에, AutoCAD DXF에는 없다).
  R13·R14의 선가중치 "RTLwPs"(1070 = 0x80 | 선가중치 번호)와 R2000 이하의 트루컬러·색상표 이름 "RTTcAl"(1070 = R2004+ 도형 색 낱말, 1071 = 0xC2RRGGBB, 이름 또는 `$$NoName$$`)을 읽는다.
  같은 도면을 AutoCAD가 여러 판으로 쓴 공개 표본 세 무리에서 새 판 값과 선가중치 1,176/1,176·색 220/220 같음. 전에는 ByLayer 선가중치·ACI 색으로 읽었다
- [x] R2000 DWG로 쓸 때 트루컬러·색상표 색을 RTTcAl로 남기기(138차): 1070 = 0x8000 | 색상표 0x4000 | 투명도가 ByLayer가 아니면 0x2000 | ACI, 1071 = 0xC2RRGGBB,
  1000 = 색상표 이름 또는 `$$NoName$$`. 트루컬러 도형만(PDF 언더레이 무리 빼고), ACAD 자료 끝·여러 줄 문자 묶음 앞, ACAD 자료가 없으면 다른 앱 뒤. 같은 색인 묶음은 그대로,
  색을 바꾼 도형은 새로, 낡은 묶음은 지우고, 제 칸과 같은 RTLwPs는 뺀다. AutoCAD가 같은 도면을 여러 판으로 쓴 표본 7판 → R2000: AutoCAD R2000 판과 묶음 같음 36 → 154/154.
  전에는 ACI만 남아 다시 열면 트루컬러를 잃었다(실제 도면 24개의 트루컬러 도형 104,258개)
- [x] 새 판(R2004+ DWG·DXF)으로 쓸 때 옛 판 왕복 묶음 RTLwPs·RTTcAl 빼기(139차): AutoCAD가 같은 도면을 여러 판으로 쓴 표본 세 무리에서 AutoCAD는 R2004+ DWG와
  DXF(R12~R2018)에 이 묶음을 남기지 않는다(RTLwPs 0/2,582쌍·RTTcAl 0/528쌍 — 묶음만 있던 도형은 ACAD 자료째 없음). 꼴이 맞는 묶음만 빼고 나머지 ACAD 자료는 그대로 —
  표본 옛 판 5개를 R2004+ DWG·DXF로 쓴 RT 객체의 확장 자료가 AutoCAD 판과 같음 4 → 2,491/2,547. 전에는 그대로 옮겨 써서 제 칸 값과 겹쳤고 R12 DXF에서는 RTTcAl이 1040으로 망가졌다
- [x] 옛 판 MTEXT의 여러 줄 문자 저장 묶음(140차): AutoCAD는 R14·R2000 DWG와 R2000 DXF의 모든 MTEXT에 MTEXTBEGIN(73 줄 간격 방식·44 배수·74 0 — 값은 제 칸과 같다)을,
  배경이 있으면 ACAD_MTEXT_BBRT(91 플래그·46 배율·64 0xC2RRGGBB)를 두고, R13 DWG·R12~R14 DXF·R2004+ DWG·DXF에는 쓰지 않는다. 이것으로 R14 이하 DWG의 줄 간격과
  R2000 이하 DWG·DXF의 배경을 읽고(표본 옛 판 MTEXT ↔ AutoCAD R2004+ 판 같은 핸들 줄 간격·배경 같음 676 → 704/704), R2004+ DWG·R2000이 아닌 DXF에는 꼴이 맞는 묶음을 빼고,
  R2000 DWG·DXF에는 모든 MTEXT에 MTEXTBEGIN을, 표본 꼴 배경(배경 색·트루컬러·이름 없음)에 BBRT를 둔다. 표본 원본(R13~R2018)을 쓴 MTEXT가 AutoCAD 같은 판과 확장 자료
  같음 DWG 498 → 1,256/1,258·DXF 734 → 1,650/1,650. 전에는 R14 줄 간격을 1로, 옛 판 배경을 없음으로 읽었고 묶음을 새 판에도 옮겨 쓰고 R13·새 판에서 온 MTEXT의 R2000 출력에는 없었다
- [x] 새 판으로 쓸 때 끊긴 재질 핸들과 옛 판 뷰포트의 보기 정보 묶음 빼기(141차): AutoCAD는 R2004 이하 DWG 도형의 재질 "RTMaterial"(1005)을 R2000·R2004 DWG에만 남기고
  (26쌍) R2007+ DWG(57쌍 — 재질 칸으로)·DXF(133쌍)에는 쓰지 않으며, R12~R14 VIEWPORT의 보기 정보 "MVIEW"를 R2000+ DWG(65쌍)·DXF(78쌍)에 쓰지 않는다(같은 도면을 여러 판으로
  쓴 표본 두 무리). 이 앱은 MATERIAL 객체를 같은 판으로 쓸 때만 옮겨 R2007+ DWG·DXF 출력의 RTMaterial이 가리킬 객체가 없었고, MVIEW는 읽을 때 제 칸으로 옮기면서도
  R2000+ 출력에 옮겨 썼다. 이제 쓰지 않는 객체를 가리키는 RTMaterial(R2007+ DWG·DXF)과 MVIEW(R2000+ DWG·DXF)를 뺀다 — 표본 원본을 쓴 확장 자료가 AutoCAD 같은 판과 같음
  RTMaterial R2007+ DWG 0 → 57/57·DXF 0 → 129/133(남은 4는 R12 DXF의 재질 매퍼 묶음), MVIEW R2000+ DWG 0 → 65/65·DXF 0 → 78/78. R2000·R2004 DWG의 RTMaterial과 R12 DXF의 MVIEW는 그대로
- [x] R12 DXF로 쓰는 뷰포트의 보기 정보 묶음 MVIEW(142차): 읽은 묶음이 있으면 그대로 써서 앱에서 바꾼 보기(중심·높이·플래그·동결 도면층)를 R12 출력에서 잃었고,
  묶음이 없는 뷰포트(R2000+에서 읽거나 앱에서 만든 것)는 플래그 칸을 고정 값(UCS 아이콘 1·격자 0 등)으로 썼다. AutoCAD가 같은 도면을 R12 DXF로 쓴 표본 두 무리에서
  UCS 아이콘(3)·격자(1)는 모델 90 플래그를 따르고 빠른 확대는 모델과 무관하게 늘 1이다. 이제 모델로 만드는 묶음은 플래그 칸을 90 플래그에서(읽기의 거꾸로, 빠른 확대만 1),
  읽은 묶음은 다시 읽은 값이 모델과 다른 칸만 고친다 — R2000+ 원본 → R12 뷰포트 MVIEW가 AutoCAD R12 판과 같음 24 → 36/36, 옛 판 원본 4/6 그대로,
  바꾼 보기가 R12 출력에 남음 0 → 9/9(실제 도면 0 → 12/12), 묶음 있는 실제 도면 9개의 R12 출력 바이트 그대로
- [x] 옛 판 뷰포트를 R2000+ DWG·DXF로 쓸 때의 90 플래그(143차): MVIEW 묶음에서 읽은 R12~R14 뷰포트는 0x8000(DXF 참조서 "늘 켬")이 없고 빠른 확대 128이 켜져 있을 수 있는데
  그대로 썼다. AutoCAD는 같은 도면을 R2000+로 쓸 때 128을 빼고 0x8000을 더한다 — 이제 묶음이 있고 0x8000이 없는 뷰포트만 그렇게 쓴다(모델 값·R12 DXF의 MVIEW·R2000+에서 읽은
  뷰포트는 그대로). 표본 옛 판 원본 7개 → R2000+ 뷰포트 90 플래그가 AutoCAD 판과 같음 LibreDWG 예제 0 → 77/77, ACadSharp는 격자 비트를 빼면 0 → 88/88.
  실제 도면 R2000+ 출력에서 바뀐 것은 옛 판 뷰포트 20개(도면 9개)뿐이다(나머지 529도면의 DWG R2018 출력 바이트 그대로)
- [x] R2000 DWG로 쓸 때 앱에서 색을 바꾼 도형의 낡은 RTTcAl 빼기(151차): 모델에 트루컬러가 없어도 색 번호가 같은 RTTcAl은 두어서, R2000 DWG에서 연 트루컬러 도형을
  그 번호의 ACI로 바꿔 R2000으로 저장하면 다시 열 때(이 앱·AutoCAD 모두) 바꾸기 전 트루컬러가 돌아왔다. R13~R2000 DWG는 읽을 때 꼴·번호가 맞는 RTTcAl을 늘 트루컬러로
  옮기므로(137차) 그런 문서에서 트루컬러가 없는 도형에 남은 묶음은 편집으로 낡은 자료다 — 이제 뺀다(AutoCAD R2000 판의 ACI 색 도형처럼, 138차 짝). 읽을 때 옮기지 않는
  원본(DXF·R2004+ DWG·새 도면)은 그대로 둔다. 편집하지 않은 문서는 바뀌지 않아 앞 차수 대조에서 달라지는 것이 없다
- [x] DXF MTEXT 배경의 색상표 색 이름(152차): 쓰기는 R2004+에서 63·421·431(DXF 참조서 MTEXT 430~439 — 색 이름)로 쓰는데 리더가 431을 읽지 않아 DXF로 저장하고
  다시 열면 이름이 빠지고 그 문서의 DWG 출력이 트루컬러였다 — 이제 읽는다. 그러면 R2000 BBRT(이름 있는 배경은 만들지 않음)가 빠져 DXF 원본 색상표 배경이 R2000에서
  사라지므로, 색상표 배경도 같은 RGB의 표본 꼴 BBRT(65·66 빈칸 — 이름만 빠짐)로 두고 견줄 때 이름은 보지 않는다(DWG 원본은 전에는 R2000에서 배경째 잃었다)
- [x] 명명된 뷰의 종이 공간 플래그(153차): 배치에서 저장한 뷰(DXF 참조서 VIEW 70 비트 1 "paper space view")를 DXF는 70, DWG는 VIEW 본문의 종이 공간 비트로 쓰는데
  DXF 리더가 R2000+ 꼴의 70(하위 클래스 표지 뒤)을, DWG 리더가 비틀림 뒤를 읽지 않아 다시 열면 모형 뷰였다(복원이 모형 공간으로 감) — 이제 읽는다
  (DWG는 VPORT와 같은 머리 뒤의 B — 쓰기와 같은 배치)
- [x] 표 레코드의 외부 참조 의존 플래그(154차): LTYPE·APPID·UCS·VPORT·DIMSTYLE의 70(DXF 참조서 — 하위 클래스 표지·이름 바로 뒤의 표준 플래그 16·32·64)을
  R2000+ DXF에서 읽지 않아(표 레코드 공통 풀기는 하위 클래스 표지 앞의 70만 담는다) XATTACH가 만든 의존 선종류·치수 스타일이 DXF로 저장하고 다시 열면 0이 되고
  그 문서의 DXF·DWG 출력에서 의존 비트가 빠졌다 — 이제 표 고유 하위 클래스의 첫 태그가 70이면 플래그로 읽는다(DIMSTYLE의 R2007+ 둘째 70은 69 다음이라 빠진다)
- [x] MPOLYGON의 70·71(155차): DXF 참조서 HATCH 그룹 코드는 MPOLYGON의 70을 판, 71을 채우기 플래그로 적고 DXF 쓰기도 그렇게 쓰는데, 리더가 HATCH 뜻(70 채우기, 71 연관)으로 읽어
  70 = 1인 MPOLYGON이 모두 채우기가 됐다 — 무늬 MPOLYGON을 DXF로 다시 저장하면 무늬가 빠지고 DWG에는 채우기 해치로 갔다. 이제 71을 채우기로 읽는다(연관은 거짓)
- [x] MESH의 세분 단계 91(156차): DXF 참조서 MESH 그룹 코드는 91을 72 다음의 세분 단계로, 모서리 주름 값(140) 뒤 재지정 묶음에서 다시 하위 객체 표지로 적는다.
  DXF 리더가 91마다 세분 단계를 덮어 써 하위 객체를 재지정한 MESH는 표지 값이 세분 단계가 됐고 저장하면 그 값을 썼다 — 이제 첫 91만 읽는다(DWG 리더처럼 맨 앞 값)
- [x] DWG에서 연 다중 지시선 스타일의 모델 밖 칸(157차): DXF 참조서 MLEADERSTYLE의 296(주석)·143(끊기 간격)·174·178(문자 부착)·46·47·49·140 등을 DXF 리더는 원본 태그로 지니고
  DWG 쓰기는 그 태그에서 읽어 쓰는데, DWG 리더는 읽고 버려 DWG에서 연 스타일이 DXF·다른 판 DWG로 저장하면 기본값이 되고 앱에서도 주석 스타일·끊기 간격을 못 봤다 —
  이제 DWG 리더가 DXF 쓰기와 같은 차례의 원본 태그로 둔다(DWG 쓰기의 끊기 간격 기본값도 DXF 쓰기처럼 $MEASUREMENT를 따름)
- [ ] 157차에 보고 두 것(실물 표본 없이는 근거가 서지 않는 항목):
  MLEADERSTYLE 94(블록 색)·340(지시선 선종류)는 DWG 쓰기가 원본 태그를 보지 않고 늘 ByBlock으로 써 DXF → DWG에서 빠진다(이 앱이 만드는 스타일은 둘 다 ByBlock — ByBlock이 아닌 실물 값이 필요).
  MLEADERSTYLE 3은 참조서가 "Mleader Style Description"인데 두 리더·두 쓰기 모두 스타일 이름으로 다룬다(AutoCAD가 이름을 사전 열쇠에만 두는지 실물 필요).
  폴리페이스 면 기록의 끝 0을 DXF 리더는 모두, DWG 리더는 셋까지만 다듬어 두 형식 모델이 다르다(DWG 출력은 같고 DXF 출력에 73 0이 붙는다 — AutoCAD가 어느 꼴을 쓰는지 근거 없음).
  플롯 설정의 셰이드 플롯(76~78)·표준 축척 계수(147)·용지 이미지 원점(148·149)은 모델에 칸이 없어 두 리더가 읽지 않고 두 쓰기가 상수로 쓴다
- [x] DWG에서 연 꺾기 반지름 치수의 꺾기 각도(158차): ObjectARX AcDbRadialDimensionLarge의 실수는 꺾기 각도(jogAngle) 하나이고 DXF에서는 40이다(AutoCAD 꼴 견본 0.785).
  DXF 리더는 40을 모델로 읽고 DXF·DWG 쓰기는 40과 DWG 본문의 중심·현 점 다음 BD로 쓰는데, DWG 리더는 그 BD를 읽고 버려 DWG에서 연 치수를 DXF·다른 판 DWG로 저장하면 0이 됐다 —
  이제 DWG 리더가 그 BD를 모델로 읽는다
- [ ] 158차에 보고 두 것(실물 표본 없이는 근거가 서지 않는 항목):
  이 앱이 만드는 꺾기 반지름 치수(DIMJOGGED·DIM)는 꺾기 각도 칸(DXF 40·DWG BD)에 0을 쓰고, 치수 블록을 다시 만들 때는 치수마다의 꺾기 각도가 아니라 DIMJOGANG을 쓴다
  (만들 때 DIMJOGANG을 넣으면 새 도면의 출력이 바뀌므로 AutoCAD가 0을 어떻게 다루는지 실물로 본 뒤 고친다).
  LEADER 75(걸이선)는 DXF 리더가 읽고 DXF 쓰기가 쓰지만 DWG 쓰기는 걸이선 점을 빼고 74(걸이선 방향)만 쓰고 DWG 리더는 늘 거짓으로 둔다(DWG 본문 끝 BS·B·B가 무엇인지 공개 HTML 근거 없음).
  VIEWPORT 61·74·79·146·170·292·282·141·142·63, HATCH 그라데이션 451·463, MULTILEADER 지시선 선 재지정(170·340·171·40·341·93)은 모델에 칸이 없어 두 리더가 읽지 않고 두 쓰기가 상수로 쓴다
- [x] DWG에서 연 IMAGE의 반응자(159차): DXF 참조서 IMAGE 360 "Hard reference to imagedef_reactor object"·IMAGEDEF_REACTOR 330 "Object ID for associated image object".
  DXF 리더는 360을 읽고 DWG 쓰기는 IMAGE 핸들 흐름에 반응자를 쓰는데 DWG 리더가 비워 두어, DWG에서 연 이미지를 DWG로 저장하면 반응자 참조가 0이 되고
  DXF로 저장하면 원본 반응자를 버리고 새 핸들로 다시 만들었다 — 이제 소유자가 IMAGE인 IMAGEDEF_REACTOR로 잇는다(IMAGE 핸들 흐름의 둘째 핸들은 여전히 읽지 않는다)
- [x] 복사한 이미지의 반응자(159차): 새 핸들을 받는 복사 경로(`freshEntity`·`prepareNew`·블록 정의 유지·배치 복사·연관 배열·동적 블록 표현 블록·다른 도면에서 가져오기)가
  IMAGE의 반응자 핸들을 지우지 않아 복사본도 원본 반응자를 가리켰다(DWG 쓰기는 두 IMAGE가 한 반응자를, DXF 쓰기는 핸들 겹침 경고) — 이제 복사본은 반응자 없이 간다
- [ ] 159차에 보고 두 것(실물 표본 없이는 근거가 서지 않는 항목):
  DWG 쓰기는 반응자 없는 IMAGE(복사본 등)에 반응자를 만들지 않고 0을 쓴다(DXF 쓰기는 새로 만든다 — DWG에서도 만들려면 AutoCAD가 그 DWG를 받아들이는지 실물로 봐야 한다).
  MLINE 71의 4·8(마구리 생략)은 DWG의 열림·닫힘 칸(BS)에 그대로 쓰고 읽는다(그 비트의 DWG 자리에 공개 HTML 근거 없음).
  SHAPE는 DWG가 번호·스타일, DXF가 이름(2)을 지녀 DXF에서 이름만 읽은 쉐이프는 DWG에 번호 0으로 간다(이름 ↔ 번호는 SHX 파일이 있어야 바꾼다).
  도형 재질(347)은 DXF 리더가 버리고 DXF 쓰기가 쓰지 않는다(MATERIAL 객체를 다른 판으로 옮기는 일이 먼저 — 아래 왕복 확장 자료 항목의 RTMaterial)
- [x] 복사한 지시선의 주석(160차): Autodesk "About Leader Associativity"(ActiveX)·"Leader Associativity"(.NET) — 지시선과 주석을 한 번에 함께 복사하면 새 복사본도 연관,
  따로 복사하면 연관이 아니다. 새 핸들을 받는 복사가 지시선의 주석 핸들(340)을 그대로 두어 복사본 지시선이 원본 주석을 가리켰다(함께 복사해도 복사본 주석을 옮기면
  따라가지 않고, 문자 편집이 원본 주석을 열었다) — 이제 편집 명령 확정에서 같은 변환으로 만든 복사본끼리 잇고, 주석 없이 복사한 지시선은 연결을 뗀다
  (157~159차가 보지 않은 GROUP·SORTENTSTABLE·SPATIAL_FILTER·LAYOUT·INSERT·호 길이 치수·AcDbAttribute·PDF 언더레이의 쓰기·읽기 짝은 맞았다)
- [ ] 160차에 보고 두 것(실물 표본·공개 근거 없이는 정하지 못한 항목):
  연관 해치를 복사하면 복사본도 원본 경계 핸들(330)과 연관 표시(71)를 지닌다(원본 경계의 반응자에는 없어 경계를 고쳐도 따라가지 않는다) — 다른 도면으로 옮기는
  정의 복사는 경계를 모두 함께 복사했을 때만 새 핸들로 잇고 아니면 비연관으로 두지만, AutoCAD가 COPY에서 해치 연관을 어떻게 다루는지 공개 도움말을 찾지 못했다.
  지시선만 복사하면 AutoCAD는 걸이선도 없앤다(같은 도움말 — 정점을 어떻게 바꾸는지 근거가 없고 값을 잃는 변경이라 두었다).
  편집 명령 확정을 거치지 않는 복사의 지시선 주석은 161차에 블록 정의로 복사하는 세 경로를 고쳤고, 나머지는 아래 161차 항목으로 옮겼다
- [x] 블록 정의로 복사한 지시선의 주석(161차): 같은 도움말 — 블록으로 붙여넣기(PASTEBLOCK·끌어 놓기)·BLOCK의 유지·연관 배열의 원본 블록(만들기·원본 편집·대체)은
  편집 명령 확정을 거치지 않아 복사본 지시선이 원본 주석(연관 배열을 만들면 지운 객체)을 가리켰다 — 이제 새 핸들을 다 준 뒤 160차 `edit/util/leadercopy.ts`로
  함께 복사한 복사본끼리 잇고, 지시선만이면 연결을 뗀다
- [x] 161차에 보고 두 것(이번에 고르지 않은 복사 경로 — 배치 복사·연관 배열의 고유화 복제 블록·동적 블록 표현 블록·정의 복사와 다른 도면에서 붙여넣기):
  정의 복사와 다른 도면에서 붙여넣기는 162차에 고쳤고, 남은 경로는 아래 162차 항목으로 옮겼다
- [x] 다른 도면에서 붙여 넣거나 가져온 지시선의 주석(162차): 같은 도움말 — 정의 복사(디자인센터의 블록·배치, 파일을 블록으로 넣기, 배치 가져오기)는
  지시선 340을 새 핸들로 이으면서 모든 반응자를 지워 복사본 주석의 반응자가 비었고(가져온 배치의 주석을 옮겨도 지시선이 따라가지 않음),
  다른 도면에서 붙여 넣으면(PASTECLIP·PASTEORIG·PASTEBLOCK) 같은 까닭으로 함께 붙여 넣어도 주석 연결이 떼어졌다 — 이제 정의 복사는 relink 뒤
  복사본 주석의 반응자에 지시선을 넣고, 다른 도면 붙여넣기는 함께 넣는 주석의 반응자를 남겨 붙여넣기 명령이 160차 흐름으로 잇는다
- [ ] 162차에 보고 두 것(실물 표본·공개 근거 없이는 정하지 못한 경로):
  동적 블록 표현 블록은 반응자를 새 핸들로 옮기면서 지시선 340만 정의 블록의 주석으로 둔다. 원본 항목은 같은 표(map)로 340만 옮기면 되지만,
  배열 동작의 사본은 사본끼리 짝을 지을 근거(AutoCAD가 동적 블록 배열 사본의 지시선 연관을 어떻게 두는지)가 없고, 표현 블록 안 지시선은 사용자가 직접 옮기지 않아
  보이는 동작이 없다(저장의 340만 다르다).
  배치 복사(`createLayoutOps`)와 연관 배열의 고유화 복제 블록(공유 배열 블록의 다른 참조용)은 새 핸들을 고리 안에서 바로 주어 "다 받은 뒤" 자리가 없다
  (배치 복사는 여러 단 MTEXT의 새 단 잇기도 없다) — 같은 규칙을 넣으려면 그 자리를 먼저 만든다
- [ ] MPOLYGON의 남은 일(155차에 봄): 63(참조서 "pattern fill color as the ACI")을 참조서 표는 70과 71 사이에 적는데 이 앱 쓰기는 무늬 선 뒤(R2004+, 색이 없으면 256)에 써
  리더(머리만 읽음)가 이 앱이 쓴 63을 되읽지 못한다 — 무늬 뒤 63도 읽으면 쓰기가 채운 256이 채우기 색이 되어 채우기 아닌 MPOLYGON에 면이 생기므로 AutoCAD 실물의 차례가 있어야 고친다.
  장면은 채우기 아닌 MPOLYGON을 테두리(+ 63이 있으면 그 색 면)로 그리고 무늬 선은 그리지 않는다(63이 면 색인지 무늬 색인지 실물 없이 못 가름).
  DWG 리더는 IMAGE·WIPEOUT의 둘째 핸들(IMAGEDEF_REACTOR — 이 앱 DWG 쓰기는 정의 다음에 씀)을 읽지 않는다(DWG 배치의 공개 HTML 근거가 없다 —
  159차부터 반응자 객체의 소유자로 IMAGE의 반응자를 잇는다)
- [ ] 156차에 보고 두 것(실물 표본 없이는 근거가 서지 않는 항목):
  MESH 재지정 묶음(하위 객체 표지·특성 종류 뒤의 값)은 모델에 칸이 없어 리더가 읽지 않고, 모델 값으로 쓸 때는 재지정 없이(DXF 90 0·DWG BL 0) 쓴다
  (같은 판 DWG의 원본 본문만 그대로 남음) — 참조서와 ezdxf 문서 모두 특성 값의 차례를 적지 않아
  AutoCAD 실물이 있어야 옮길 수 있다. XRECORD 자료 안의 100(참조서 "1-369 (except 5 and 105)" — 자료로 쓸 수 있다)은 DXF 리더가 하위 클래스 표지로 보고 버리고
  DWG 리더·DXF 쓰기·DWG 쓰기는 자료로 다룬다 — AutoCAD가 자료에 100을 두는 객체를 앞 차수 결과에서 본 적이 없어 두었다. (DWG 꺾기 반지름 치수의 정의점 둘 다음 BD는 158차에 고침)
- [ ] 표 레코드 70의 남은 일(153·154차에 봄): DXF 참조서 그룹 코드 표에 없어 근거가 모자란 것 — DIMSTYLE 69·70(DIMTFILL·DIMTFILLCLR — 이 앱과 ezdxf 견본은 R2007+에서
  69 다음 70으로 쓰고 리더는 69만 읽는다), MLINESTYLE 채우기·요소의 420 트루컬러(리더는 읽고 쓰기는 62만 — DWG는 CMC로 트루컬러·색상표 이름을 읽고 써서
  DWG → DXF에서 ACI만 남는다). VPORT 참조서가 언 도면층(331·441) 뒤에 적은 둘째 70("Bit flags and perspective mode")은 이 앱 쓰기·견본에 없어 읽지 않는다.
  DWG 표 레코드 공통 머리에는 의존 비트(16)만 있어 DWG에서 연 의존 레코드의 DXF 출력은 16이다(참조서의 해결됨 32를 DWG에서 무엇으로 정하는지 근거가 없다).
  AutoCAD가 같은 도면을 쓴 DXF 실물이 있어야 쓸 수 있다
- [ ] 왕복 확장 자료의 남은 일(137~143차에 잼): RTTcAl의 투명도 플래그 0x2000(값 항목이 없다 — 표본 14객체는 새 판에서 모두 ByBlock이라 값 투명도를 어떻게 남기는지 모름).
  RTMaterial(R2004 이하의 재질 핸들 1005 — 실제 DWG 16개 도면 524객체, 2D 그림에 쓰이지 않음): AutoCAD는 R2007+ DWG에서 재질 칸으로 옮기는데
  (같은 핸들 6객체 중 5 — 남은 POINT 하나는 재질이 없어진다. 가리키는 MATERIAL의 이름을 이 앱이 읽지 않아 못 가름), 이 앱은 MATERIAL 객체를 같은 판으로 쓸 때만 옮겨
  다른 판 출력에는 가리킬 재질이 없다 — 141차부터 R2007+ DWG·DXF에서는 묶음을 빼고, 다른 판 R2000·R2004 DWG에는 AutoCAD처럼 남기지만 핸들이 끊긴다.
  재질을 지키려면 MATERIAL 객체를 다른 판으로 옮기는 일부터 해야 한다. 도면층 표 레코드에는 RT 묶음이 없었다. R2000으로 쓸 때 모델에 트루컬러가 없어도 색 번호가 ACI와 같은 RTTcAl은
  읽을 때 그 묶음을 옮기지 않는 원본(DXF·R2004+ DWG·새 도면 — 예전 판 이 앱이 옮겨 쓴 자료를 살리려고)에서만 둔다(151차) — 그런 원본에서 트루컬러를 그 ACI로 바꾼 도형은
  아직 다시 열면 트루컬러가 돌아온다(옮겨진 자료인지 편집으로 낡은 자료인지 가를 기록이 없다).
  여러 줄 문자 저장 묶음(140차)의 남은 것: R2000으로 쓸 때 도면 창 색(플래그 2)·ACI 배경의 BBRT는 AutoCAD 실물이 없어 만들지 않고(R2000 출력에서 배경을 잃는다 —
  151차: 읽기는 원시 색 방식 바이트로 ACI(0xC3)도 읽지만 AutoCAD가 그런 배경에 쓰는 91 플래그·64 값·65·66 이름을 본 적이 없어 그대로), 색상표 배경은 같은 RGB로 두지만
  이름(65·66에 적는 꼴을 모름)은 빠진다(152차),
  MTEXTBEGIN 74가 0이 아닌 묶음·이름 65·66이 있는 BBRT는 뜻을 몰라 새 판에도 남긴다(실제 도면 841개에는 없다). 표본 원본을 쓴 MTEXT 가운데 AutoCAD 판과 확장 자료가
  다른 것은 DXF 원본 → R2000 DWG의 트루컬러 MTEXT 2개뿐이다(DXF R2000에 트루컬러가 없어 RTTcAl을 만들 수 없다).
  뷰포트 MVIEW의 남은 것(142차): R13 원본의 빠른 확대 0은 AutoCAD R12 판이 1이지만 바꾸지 않은 뷰포트의 R12 출력을 그대로 두려고 읽은 값대로 쓴다(표본 2쌍).
  모델로 만드는 묶음의 보기 모드·스냅·스냅 방식·등각 쌍·숨은선 출력(AutoCAD 표본은 모두 0)과 UCS 아이콘 0·2(표본은 1·3뿐)는 읽기의 거꾸로와 DXF 참조서 90 플래그 뜻으로 쓴다
  (실제 도면 R12 출력에서 바뀐 뷰포트 653개 가운데 UCS 아이콘 1 → 3이 581개). 옛 판 뷰포트를 R2000+로 쓸 때 AutoCAD가 ACadSharp 무리에서만 더 켜는 격자 비트
  0x40000·0x80000(원본에 없는 값 — AutoCAD 설정으로 봄)은 따라 하지 않는다(143차).
  R14 꼴 DSTYLE(블록 이름 5·6·7 → AutoCAD 새 판은 341·343·344 핸들, DIMUNIT 270·각도 치수의 271은 빠짐 — 표본 객체 6개)은 그대로 쓴다
- [ ] 머리말 각도 변수의 단위(152차에 봄): R12 DWG 리더는 `$ANGBASE`·`$SNAPANG`을 파일의 라디안에서 도로 바꿔 머리말에 두는데, R13+ DWG 리더(BD 그대로)·DXF 리더(값 그대로)와
  UNITS·ROTATE·극좌표 등 앱은 머리말 `$ANGBASE`를 라디안으로 다루고(`-ARRAY`의 `$SNAPANG`도) DXF 쓰기도 그대로 쓴다 — 같은 도면을 R12 DWG와 다른 판으로 열면 값이 다르다.
  DXF 참조서 HEADER에는 "Angle 0 direction"뿐이라 DXF `$ANGBASE`의 단위가 없고 저장소 안 DXF·앞 차수 결과의 값은 모두 0이어서 어느 쪽을 고칠지 가를 수 없다
  (0이 아닌 ANGBASE·SNAPANG를 AutoCAD가 R12 DWG와 DXF로 쓴 짝 필요). 스냅 회전 각도(VPORT 50)는 모델에 칸이 없어 DIVIDE·MEASURE의 원 시작점(Autodesk MEASURE 도움말 —
  중심에서 지금 스냅 회전 각도 방향)도 늘 0°다
- [ ] 같은 도면의 AutoCAD DWG·DXF 짝 49쌍을 이 앱으로 읽어 같은 핸들 객체 51,562개를 견준 남은 차이(134차에 잼, 135차에 갈라 다른 칸이 있는 객체 874 → 837개, 136·137차 821개 —
  대부분 형식 차이: MTEXT 방향 벡터는 DWG에만 355, 맞춤점 스플라인의 조정점은 DXF에만 8, 치수 블록 이름 34, DXF에 없는 확장 자료 등 — 그 가운데 선 124·MTEXT 17·원 9 등은
  옛 판 DWG의 AutoCAD 왕복 자료 "RT…"이고, 137차부터 그 객체들의 선가중치·트루컬러도 칸이 없는 같은 판 DXF와 다르다). 135차에 가른 것(고치지 않음):
  - 다중 지시선 선마다 색(50): DWG(R2010+)는 ByBlock이고 선마다 재지정 플래그가 0이라 쓰이지 않는 값, AutoCAD DXF는 92를 빼거나(13쌍) ByBlock으로 쓴다(1쌍) — 뜻 같음
  - R13·R14 문자 스타일 이름 대소문자(51): DXF 도형에 7이 없으면(DXF 참조서 기본 STANDARD) 이 앱은 'Standard', DWG는 표 이름 'STANDARD' — 기호 표 이름은 대소문자를 가리지 않아 같은 레코드
  - 지시선 갈고리 방향(1): 주석·걸이선이 없는 지시선이라 뜻 없음(AutoCAD DXF는 73~75를 쓰지 않음). 공차 지시선의 글 상자 크기 40·41(1)은 공차 틀 크기를 계산하지 않아 남음
  - 치수 문자 " " ↔ ""(2): DWG ' '(문자 숨김)이 AutoCAD 치수 블록(문자 없음)과 맞다. 그 DXF 파일에는 줄 끝 공백이 하나도 없어 공개 저장소에서 지워진 것으로 본다
- [ ] 스플라인 확장 자료 ACAD_SPLINE_DATA(135차에 잼): R2000~R2010 DWG의 맞춤점 방식 스플라인을 AutoCAD는 조정점 스플라인 + 1070 쌍(100·101·102)으로 낮춰 쓰고,
  같은 도면의 AutoCAD DXF에는 70 = 1160(맞춤점 방식·균일 매듭)으로 되살려 쓴다(짝 네 판, 확장 자료 없음). 102 = 매듭 매개변수(2 균일)로 보이나 100·101은 한 표본(모두 0)뿐이라
  뜻을 못 정해 DWG 리더는 깃발 8과 확장 자료를 그대로 둔다. 136차: 실제 도면 838개(DWG 742·DXF 96)에서 이 확장 자료는 그 한 객체(R14~R2010 다섯 판)뿐이고,
  조정점 4개(한 구간)라 매듭 매개변수 0·1·2가 모두 같은 곡선이어서 곡선으로도 102를 가를 수 없었다. 균일 매듭 맞춤점 스플라인도 이 표본뿐
- [x] 늘이기·그립이 다시 재는 각도 치수 측정값(137차): 편집 커널(edit/geom/stretch.ts)이 두 선·세 점 각도를 136차 셈(dimmeasure.ts)으로 잰다.
  전에는 두 선 각도를 두 방향 사이 각으로 다시 재서 실제 도면의 AutoCAD 값과 DWG 53/89·DXF 8/14만 같았다(이제 89/89·14/14 — 앱 명령은 치수 생성기 값으로 덮어 생성기가 못 다루는 치수만 보였다)
- [x] 측정값이 없는 치수의 R2000+ DXF 42(138차): DWG 쓰기(136차)와 같은 셈으로 정의점에서 잰 값을 쓴다(잴 수 없으면 뺀다). 전에는 42를 뺐다 — AutoCAD는 R2000+ DXF에
  늘 적고, 같은 도면을 AutoCAD가 R13·R14와 R2000~R2018 DXF로 쓴 짝에서 이 앱 출력 42가 AutoCAD 42와 444/444 같다
- [x] 치수 실제 측정값(42)의 DIMLFAC(145차): 136차에 낡은 값으로 본 회전·정렬 치수의 저장 값은 DIMLFAC를 곱한 값이었다 — 실제 도면에서 DIMLFAC가 1이 아닌 치수
  278개(도면 9개, DIMLFAC 19가지, DWG·DXF) 모두 AutoCAD 42 = 정의점으로 잰 값 × DIMLFAC(모형 공간 양수 270개)·× |DIMLFAC|(도면 공간 음수 8개)이고 잰 값 그대로인 것은 0개.
  이제 42를 치수 문자의 DIMLFAC 몫(각도 1, 음수는 도면 공간에서만 — 도움말 DIMLFAC)을 곱한 값으로 다룬다: 치수 생성기·42가 없는 옛 판 치수의 셈·DWG·DXF 저장·편집 커널이
  그 값을 쓰고, 특성·정보 카드·치수 목록·문자 편집·명령행 안내는 다시 곱하지 않는다(전에는 블록 문자 `4'`인 치수를 `3'-6"`로 보였다).
  R2000+ DWG의 정의점 셈 ↔ AutoCAD 42: 회전 5,793 → 6,052/6,065, 정렬 488 → 503/503(다른 프로그램이 쓴 −1 빼고)
- [ ] 치수 측정값의 남은 관찰(136차에 잼, 145차에 다시 잼): R2000+ DWG 회전 치수 13개(매개변수 구속 치수 — 사용자 문자 `이름=식`)와 지름 1개는 AutoCAD 42가 정의점과
  맞지 않고, 블록 정의 안 치수 60개는 다른 프로그램이 쓴 −1이다. 반지름·지름·세로좌표·호 길이 치수의 DIMLFAC 몫은 실물이 없어 도움말과 치수 문자 셈을 따른다.
  이전 판의 이 앱이 저장한 DIMLFAC ≠ 1 치수(42가 곱하기 전 값)는 그 치수를 다시 만들 때까지 곱하기 전 값을 보인다
- [x] 치수 표시 문자를 블록이 그리는 문자로(146차): 특성 "표시 문자"·정보 카드·치수 목록은 도면 단위 표시 꼴로 만들어 DIMZIN 0 생략·도분초·공차·대체 단위가 블록 문자와
  달랐다(블록 `4'`·`11"`·`10°` ↔ 표시 `4'-0"`·`0'-11"`·`10d`). 이제 측정값을 보이는 치수는 블록의 MTEXT(하나일 때 — 이 앱이 화면에 그리는 것)를, 블록 문자가 없으면
  치수 생성기 셈을 보이고 쌓은 분수는 숫자 뒤에 빈칸을 둔다. 실제 도면에서 사용자 문자 없는 치수의 표시 = AutoCAD 블록 MTEXT 1,264 → 3,114/3,128(DIMLFAC 1·≠ 1 합),
  `<>` 사용자 문자 38 → 144/144, 같던 것이 달라진 치수 0. 생성기 셈만 쓰면 블록 정의 안의 낡은 블록 2개(DIMZIN 0인데 `1'-0"`)가 달라져 그려진 문자를 읽는다
- [ ] 치수 표시의 남은 일(146차에 잼): 주 단위와 대체 단위를 MTEXT 둘로 쓴 블록(치수 14개, 한 도면)과 R12 TEXT 블록(19개 가운데 6개 — 옛 글꼴 기호 `%%nnn`·`?` 5개,
  측정값이 다른 분수 1개)은 생성기 셈으로 보여 블록과 다르다. 측정값 숫자 문자(formatted — 치수 목록의 재지정 값 판정과 편집 커널의 블록 숫자 바꾸기가 읽음)는 도면 단위 꼴 그대로다 —
  생성기 셈으로 바꾸면 재지정 판정이 건축·공학 단위 치수 391개에서 바뀐다(숫자 읽기가 `[^\d.-]`를 지워 분수·피트를 못 읽음: `0'-1/4"` → 0, `1/4"` → 14)
  150차: 사용자 문자의 `\X`(DXF 참조서 MTEXT 서식 — 치수선에서 문단 나눔)도 AutoCAD는 제자리 문자면 MTEXT 둘로 쓴다(148차 결과의 회전 치수 4개·도면 2 — 이 앱은 하나,
  사용자 위치 DIMTMOVE 2 1개는 둘 다 하나로 같음). 그 결과에 선형 치수의 MTEXT 자리가 없어 위·아래 자리 규칙을 세우지 못했다(실물 표본 필요)
- [x] 편집 커널의 치수 블록 숫자 바꾸기(147차 — edit/geom/xannot `updateDimNumber`, 앱에서는 치수 생성기가 못 다룬 치수에만 남는 근사 그림): 숫자 정규식이 건축 단위의 피트만 바꿔
  (`2'-2"` → 2배 축척 `4'-2"`, 분수 그대로) 블록이 새 측정값과 달랐다. 이제 블록 문자에서 치수 생성기의 측정 문자(피트·인치·쌓은 분수째)를 찾아 새 측정값의 그 문자로 바꾸고,
  숫자 찾기는 MTEXT 서식 코드 밖에서만, 같은 값 숫자 찾기는 측정값에 DIMLFAC를 다시 곱하지 않는다(145차 뒤 두 번 곱함). 실제 도면 치수의 바뀐 블록 = 새 생성기 문자:
  2배 축척 1,309 → 2,828/2,828, 늘이기 471 → 2,600/2,600, 같던 것이 달라진 치수 0. 서식 코드·DIMLFAC 고침은 이 표본에서 닿지 않아 시험으로만 보인다
- [ ] 편집 커널 숫자 바꾸기의 남은 일(147차에 잼): 블록 문자가 생성기 문자와 다른 치수(2배 축척 395·늘이기 355 — 대부분 건축 단위)는 전과 같은 숫자 찾기로 바뀌어,
  바뀐 블록이 맞는지 가를 기준(AutoCAD가 같은 편집으로 다시 쓴 블록)이 없다
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
- [ ] ACIS를 SAT↔SAB로 바꿔 R2004+ DWG·R2013+ DXF에 ACIS 객체로 쓰기, R2013+ DWG 자료 저장소(AcDsPrototype_1b)를 새로 만들기(같은 버전 DWG에서 지운 솔리드의 레코드 정리 포함) — 저장소의 색인·스키마·검색 구역을 새로 써야 하는데 AutoCAD로 열어 확인할 수 없다. OLE 내용(WMF·EMF 미리 보기) 그리기는 실물 표본이 없다
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
- [x] SCALETEXT의 주석 문자(118차, Autodesk SCALETEXT 도움말): 새 모형 높이는 주석이 아닌 객체에만, 도면 높이(P)는 주석 객체에만(용지 높이 × 보이는 축척 배율), 객체 일치는 같은 꼴에만 —
  예전에는 모든 문자에 같은 모형 높이를 주어 1:50 주석 문자에 도면 높이 2.5를 주면 125가 아니라 2.5가 됐다(실제 도면 315개에 주석 문자 9,498개, 축척 배율이 1이 아닌 것 3,345개).
  주석 속성 정의(ATTDEF)도 119차부터 자기 표지·축척 레코드로 주석 객체로 다룬다
- [x] 주석 속성(119차, Autodesk 도움말 — 속성 정의는 블록과 따로 주석일 수 있고 주석이 아닌 블록에서는 속성 문자가 용지 높이로 보인다): 블록을 넣거나 속성을 동기화할 때
  새 속성이 속성 정의의 확장 사전·반응자(필드·주석 축척 레코드)를 함께 가리키던 것을 끊고(동기화로 지킨 속성은 자기 사전), 주석이 아닌 블록의 주석 속성 정의는
  높이 = 용지 높이 × 그 공간의 주석 축척 × |Y 축척|과 그 축척의 레코드를 준다(편집 고리 — 복사본 포함, 블록 참조 편집은 레코드가 따라감). 실제 도면 70개에 확장 사전이 있는 속성 정의 348개,
  30개에 주석이 아닌 블록의 주석 속성 정의 83개, AutoCAD가 쓴 그런 블록 참조의 주석 속성 60개(편집된 1개를 뺀 59개의 높이가 같은 식)
- [ ] 주석이 아닌 블록 참조의 주석 속성을 다른 축척 뷰포트에서 그 축척 표현으로 그리기(지금은 객체 데이터 그대로 — 실제 도면 60개 모두 레코드가 하나라 ANNOALLVISIBLE 0에서 숨기는 것만 다르다)
- [x] ANNOUPDATE가 주석으로 바꾸는 문자의 크기(119차, Autodesk ANNOUPDATE 도움말): 스타일 고정 용지 높이가 있으면 그 높이 × 축척 배율, 0이면 크기 그대로 —
  예전에는 늘 지금 크기를 용지 크기로 보아 축척 배율만큼 키웠다(실제 도면 45개에 스타일은 주석인데 객체는 주석이 아닌 문자 326개, 그중 스타일 높이 0이 325개)
- [x] MATCHPROP의 주석 특성(120차, Autodesk 특성 설정 대화 상자: 문자·치수·다중 지시선은 스타일과 주석 특성을 옮긴다): 원본과 대상의 주석 여부가 다르면 대상을 그 공간 축척의 주석 객체로
  (문자는 ANNOUPDATE와 같은 크기, 치수는 DIMSCALE = 축척 배율, 다중 지시선은 전체 축척 = 축척 배율) 또는 용지 크기의 주석 아닌 객체로 바꾼다. 한 공간에 섞인 실제 도면은 문자 174개·치수 4개·다중 지시선 1개
- [x] MATCHPROP 해치 칸의 주석 특성(121차, 도움말은 해치 특성과 함께 주석 특성을 옮긴다고 적는다): 주석 여부가 다르면 대상을 그 공간 축척 하나의 주석 해치(무늬 선 = 원본 용지 무늬 × 축척 배율)
  또는 레코드·뷰포트별 모음을 지운 주석 아닌 해치로. 한 공간에 섞인 실제 도면 9개(주석 9·주석 아님 81), 그중 원본이 공간 축척과 다른 축척을 보이는 2개는 전에 선 간격도 틀렸다
- [ ] MATCHPROP 주석 객체끼리의 크기(121차에 잼): 원본과 대상이 모두 주석이면 matchProps가 모형 크기(문자 높이·해치 선)를 그대로 옮겨, 두 객체가 보이는 축척이 다르면 대상의 용지 크기가 그 비만큼 틀린다.
  실제 도면 101개에 주석 문자끼리 보이는 축척(연 도면 맞추기 뒤)이 다른 공간이 있다. 도움말에 주석끼리의 크기·축척 목록 규칙이 없어 그대로 둔다
- [x] MATCHPROP 폴리선 칸(164차, Autodesk 특성 설정 대화 상자: 폴리선은 폭과 선종류 생성을 옮기고, 원본이 폭이 바뀌는 폴리선이면 폭은 옮기지 않으며, 맞춤·고도는 옮기지 않는다):
  원본의 전역 폭 칸(폭이 바뀌는 폴리선은 0)을 대상 정점 폭에 덮어 대상의 폭을 지우던 것과 선종류 생성을 옮기지 않던 것 — 이제 선종류 생성을 옮기고,
  원본의 그리는 세그먼트 폭이 모두 같을 때만 그 폭을 옮긴다(폭이 바뀌면 대상 폭 그대로)
- [ ] 164차에 보고 두 것(고르지 않은 것과 실물 표본·공개 근거 없이는 정하지 못한 것): POLYLINE 2D(무거운 폴리선)가 낀 MATCHPROP 폴리선 칸(지금은 경량 폴리선끼리만 옮긴다).
  MATCHPROP 선종류·선종류 축척은 도움말이 속성·해치·여러 줄 문자·점·뷰포트를 빼고, 두께는 호·속성·원·선·점·2D 폴리선·영역·문자에만 쓴다고 적는데 이 앱은 모든 객체에 옮긴다
  (대부분 보이지 않는 저장 값 — 뷰포트 테두리 선종류는 보인다). FILLET·CHAMFER는 도움말상 두 객체가 같은 도면층이면 그 도면층, 아니면 현재 도면층에 호·선을 만드는데
  이 앱은 첫 객체 특성을 잇는다 — 현재 도면층으로 둘 때 첫 객체의 객체별 색·선종류·선가중치를 어떻게 두는지 도움말에 없어 실물이 필요하다.
  정점 폭이 모두 같고 전역 폭 칸이 0인 폴리선을 AutoCAD가 MATCHPROP에서 "폭이 바뀌는" 폴리선으로 보는지(164차는 보이는 폭이 하나인 것을 기준으로 옮긴다)
- [x] STRETCH로 하나씩 고른 객체(165차, Autodesk STRETCH 도움말: 걸침 창에 일부만 든 객체는 늘이고, 창 안에 다 든 객체나 하나씩 고른 객체는 늘이지 않고 옮긴다):
  찍어 고른 객체를 마지막 걸침 영역으로 늘이거나(영역에 정의점이 없으면 그대로) 찍기만 하면 신축을 거부하던 것 — 이제 찍어 고른 객체는 통째로 옮긴다
- [ ] 165차에 보고 두 것(고르지 않은 것과 실물 표본 없이는 근거가 서지 않는 것): MIRRTEXT 1의 MTEXT — MIRRTEXT 도움말·About Mirroring Objects는 MIRRTEXT가
  TEXT·ATTDEF·MTEXT로 만든 문자와 속성 정의·변하는 속성에 닿는다고 적는데, 이 앱은 MTEXT와 여러 줄 속성의 MTEXT를 MIRRTEXT 1에서도 읽을 수 있게 둔다
  (113차 시험 `mtextcols-mirror`가 지금 동작으로 고정, 기본값 0에서는 같다 — 다음 후보). 스플라인 맞춤 2D 폴리선의 STRETCH — 도움말은 "맞춤 정보를 바꾸지 않는다"고만 적어,
  틀 정점을 옮긴 뒤 맞춤 정점을 다시 구하는지 실물이 필요하다(지금은 틀 정점과 맞춤 정점을 따로 영역으로 판정). STRETCH에서 같은 객체를 걸침 창과 찍기로 겹쳐 고를 때
  처음 고른 방식을 따르는 것(선택 세트가 중복을 버린다는 판단)과 마지막이 아닌 걸침 창으로 고른 객체를 마지막 영역으로 늘이는 것(도움말에 없다)은 실물로 확인하지 않았다
- [x] 클래식 원형 배열을 돌리지 않을 때의 기준점(166차, Autodesk Array 대화 상자 도움말의 "객체 기본값으로 설정" 표 — 호·원·타원 중심, 선·폴리선·3D 폴리선·광선·스플라인 시작점,
  블록·여러 줄 문자·한 줄 문자 삽입점, 구성선 중간점 — 과 "여러 객체는 마지막으로 고른 객체의 기준점", -ARRAY 도움말 "선택 세트의 마지막 객체의 기준점을 모든 객체에"):
  -ARRAY·ARRAYCLASSIC(연관 아니오) 원형에서 항목을 돌리지 않으면 늘 선택 범위의 가운데를 원을 따라 옮겨 선·블록 참조·문자 항목의 자리가 달랐다 — 이제 마지막 객체의 기준점
- [ ] 166차에 보고 두 것(고르지 않은 것과 실물 표본·공개 근거 없이는 정하지 못한 것): 기본 기준점 표에 없는 종류(해치·치수·솔리드·점·속성 정의 등)와 영역("그립점" —
  어느 그립인지 없다)은 전처럼 선택 범위 가운데를 쓴다. 맞춘 한 줄 문자의 "삽입점"은 삽입점 스냅과 같은 맞춤점으로 두었다(-ARRAY 도움말 옛 판은 "문자 시작점"이라 적어 실물이 필요하다).
  새 ARRAYPOLAR(연관·비연관)에서 항목을 돌리지 않을 때의 기본 기준점은 ARRAYPOLAR 도움말에 규칙이 없어 그대로 둔다. 라이브러리 `arrayPolar`의 기본값(범위 중심)도 그대로다.
  MIRRTEXT 1의 MTEXT는 MTEXT에 거울상 플래그가 없어 AutoCAD가 무엇으로 나타내는지(돌출 방향 등) 실물 없이 못 정해 이번에도 고르지 않았다.
  BREAK의 −Z 원은 도움말의 "반시계"가 어느 좌표계인지 없어 고르지 않았다
- [x] CHANGE 변경점의 블록 참조와 속성(167차, Autodesk CHANGE 도움말: 블록은 위치나 회전을 바꾸고 새 위치를 주면 옮긴다 — 속성은 블록 참조에 딸려
  함께 옮기고 돈다, 속성 정의 대화 상자 "위치 잠금 — 블록 참조 안에서 속성의 위치를 잠근다"): 속성의 삽입점만 옮겨 맞춘 속성(맞춤점)·여러 줄 속성(MTEXT 삽입점)이
  제자리에 남고, 회전 각도를 바꿔도 속성이 돌지 않았으며, 찍은 점을 OCS 삽입점에 그대로 넣어 −Z 블록은 거울상 자리로 갔다 — 이제 블록이 움직인 만큼 속성도 옮기고 돌린다
- [ ] 167차에 보고 두 것(고르지 않은 것과 실물 표본·공개 근거 없이는 정하지 못한 것): CHANGE 변경점의 −Z 원은 찍은 점(WCS)과 OCS 중심으로 반지름을 재어 원이 그 점을 지나지 않고,
  −Z 한 줄 문자는 찍은 점을 OCS 삽입점에 그대로 넣어 거울상 자리로 간다(같은 함수의 다른 갈래 — 168차가 고침). CHANGE 도움말은 문자에 "새 문자 삽입점 지정"을 따로 묻는데
  이 앱은 변경점을 그대로 삽입점으로 쓰고 문자 스타일을 묻지 않으며, 맞춘 문자의 "삽입점"을 맞춤점이 아닌 첫 정렬점(10)으로 본다(블록의 새 위치를 따로 묻는지는 도움말이 적지 않는다 — 실물 필요).
  돌린 UCS에서 BLOCK을 만들 때 블록 정의를 UCS 기준으로 두는지는 공개 HTML 문장을 찾지 못했다(지금은 WCS). 특성 팔레트의 블록 위치·회전(`retransformInsert`)은
  여러 줄 속성의 MTEXT 삽입점(WCS)을 블록 OCS로 옮기고 방향을 지워, −Z 블록의 여러 줄 속성·방향 벡터만 있는 MTEXT에서 어긋날 수 있다(실물 없음 — 이번 CHANGE는 WCS로 옮긴다)
- [x] CHANGE 변경점의 −Z 한 줄 문자·속성 정의와 −Z 원(168차, Autodesk CHANGE 도움말: 문자는 새 문자 삽입점으로 옮기고 원은 반지름을 바꾼다,
  두께 0인 선 말고는 고른 객체가 현재 UCS와 평행해야 한다 — −Z 객체도 평행하다): 찍은 점(WCS 평면도)을 OCS 좌표에 그대로 넣어 −Z 문자·속성 정의(맞춤점 포함)는
  거울상 X 자리로 가고 −Z 원은 OCS 중심과 찍은 점 사이로 반지름을 재었다 — 이제 찍은 점을 객체 OCS로 옮겨 쓴다(+Z 객체는 전과 같은 값)
- [ ] 168차에 보고 두 것(고르지 않은 것과 실물 표본·공개 근거 없이는 정하지 못한 것): CHANGE 선의 직교 모드 — 도움말은 직교가 켜져 있으면 선을 X·Y축과 평행하게 바꾸고
  끝점을 지정 좌표로 옮기지 않는다고 적는데, 이 앱은 직교를 보지 않고 가까운 끝점을 찍은 점으로 옮긴다(어느 축·어느 좌표에 맞추는지, 길이를 지키는지 도움말에 없어 실물 필요).
  블록 밖 여러 줄 속성 정의는 CHANGE가 삽입점·맞춤점만 옮기고 그리기 기준인 MTEXT 삽입점을 그대로 둔다(AutoCAD가 CHANGE로 여러 줄 정의를 어떻게 묻고 옮기는지 도움말에 없음).
  −Z 문자의 새 회전 각도는 OCS 각도로 묻고 넣는다(167차 블록과 같음 — AutoCAD가 UCS 각도로 묻는지 실물 필요). 도움말상 현재 UCS와 평행하지 않은 기운 원·문자는
  AutoCAD가 바꾸지 않을 수 있는데 이 앱은 평면도 사상으로 바꾼다(돌출 방향이 XY 평면 안이면 그대로 — 안내 문구는 실물 필요).
  원의 새 반지름을 찍은 점까지의 거리로 두는 것은 이 앱의 규칙이다(지금 도움말 HTML은 "반지름을 바꾼다"만 적고, 옛 AutoCAD LT 도움말은 새 반지름 프롬프트를 적는다 —
  변경점 대신 Enter를 눌렀을 때 객체마다 묻는 흐름은 167차가 남긴 프롬프트 흐름과 함께 남는다)
- [x] TXT2MTXT의 −Z 문자(169차, Autodesk TXT2MTXT 도움말: 고른 문자 객체를 여러 줄 문자로 바꾼다 — DXF 참조서상 TEXT의 점은 OCS이고 MTEXT 삽입점은 OCS 목록에 없다,
  이 앱 모델·그리기도 MTEXT 삽입점은 WCS): −Z 한 줄 문자의 글자 틀 원점(OCS)을 그대로 여러 줄 문자 삽입점(WCS)에 넣어 결과가 X 거울상 자리로 가고,
  첫 줄이 −Z 여러 줄 문자면 돌출 방향을 버린 +Z 여러 줄 문자(180° 돈 글자)가 됐다 — 이제 줄을 WCS 평면도에서 재고 첫 줄의 돌출 방향·OCS 회전 각도를 잇는다(+Z 문자는 전과 같은 값)
- [ ] 169차에 보고 두 것(고르지 않은 것과 실물 표본·공개 근거 없이는 정하지 못한 것): TEXTALIGN 간격 설정(S)의 문자 범위(`textools/textalign.ts` `textCorners`)는
  −Z 한 줄 문자의 모서리를 OCS 좌표 그대로 써 간격이 틀린다(맞추는 점은 WCS로 옳다 — 같은 꼴의 다음 후보, 170차가 고침). 기운(돌출 방향이 Z축과 평행하지 않은) 한 줄 문자의 TXT2MTXT는
  전처럼 OCS 좌표 그대로다(평면도로 옮기면 높이를 잃는다 — AutoCAD가 기운 문자를 어떻게 바꾸는지 도움말에 없음). 서로 다른 평면(+Z·−Z)의 문자를 섞어 결합하면 첫 줄 평면의
  위 방향으로 줄을 세운다(도움말에 섞인 평면 규칙 없음). JUSTIFYTEXT 도움말(2021 HTML)은 한 줄 문자의 정렬(A)·맞춤(F)·왼쪽(L)이 여러 줄 문자의 맨 아래 왼쪽(BL)
  부착점과 같다고 적는데, 이 앱은 여러 줄 문자에 왼쪽을 맨 위 왼쪽(TL)으로 두고 정렬·맞춤은 바꾸지 않는다(`geom/textjust.ts` `MTEXT_ATTACH` — 다음 후보,
  가운데·오른쪽·중간의 여러 줄 문자 짝은 도움말에 없고 왼쪽을 바꾸면 지금 결과가 달라진다). JUSTIFYTEXT로 문자 자리를 지키는 계산(한 줄 문자 OCS 안, 여러 줄 문자 상자 차이),
  BLOCK의 유지·블록으로 변환·삭제, MIRROR의 속성 MIRRTEXT는 코드를 읽어 도움말과 어긋난 갈래를 찾지 못했다
- [x] TEXTALIGN 간격 설정의 −Z 문자 범위(170차, Autodesk TEXTALIGN 도움말: 간격 설정은 문자 객체의 범위 사이 간격을 정한다 — DXF 참조서상 TEXT의 점은 OCS,
  그리기·TRIM 모서리는 여러 줄 문자의 위 방향을 돌출 방향 × 글줄 방향으로 둔다): 문자 범위(`textools/textalign.ts` `textCorners`)가 −Z 한 줄 문자의 OCS 모서리를
  그대로(X 거울상 자리) 쓰고 −Z 여러 줄 문자의 상자를 삽입점 반대쪽에 두어, 맞추는 점(WCS)과 어긋나 간격이 틀렸다(같은 범위를 쓰는 ATTIPEDIT 속성 고르기,
  Express Tools 문자 상자의 −Z 여러 줄 문자도) — 이제 평면도에 보이는 글자 상자로 잰다(자연 +Z 문자는 전과 같은 값)
- [ ] 170차에 보고 두 것(고르지 않은 것과 실물 표본·공개 근거 없이는 정하지 못한 것): 문자 범위(`textCorners`)는 한 줄 문자의 기울기(oblique)와
  거꾸로·뒤집기 글자(생성 플래그 2·4)를 넣지 않는다(TRIM 모서리 `textOutline`은 넣는다 — 넣으면 지금 +Z 결과가 바뀌어 다음 후보, −Z도 같은 식으로 두었다 — 171차가 고침).
  Express Tools 문자 상자(`express/textbox.ts`)는 기운(돌출 방향이 Z축과 평행하지 않은) 한 줄 문자를 평면도로 옮길 때 고도 몫을 넣지 않는다
  (맞추는 점·`textOutline`은 넣는다 — 기운 문자를 어떻게 다루는지 도움말에 없어 실물 필요). TEXTALIGN 도움말은 "문자 객체"라고만 적어
  속성 정의·여러 줄 문자가 대상인지는 적지 않는다(이 앱은 한 줄·여러 줄 문자와 속성 정의를 줄 세운다 — 그대로)
- [x] 문자 범위의 거꾸로·뒤집기·기운 한 줄 문자(171차, DXF 참조서 TEXT 71 생성 플래그 2 = X 거울·4 = Y 거울, 51 기울기, Autodesk TEXTALIGN 도움말:
  간격 설정은 문자 객체 범위 사이 간격을 정한다 — 그리기·`textOutline`·맞추는 점은 같은 글자 틀에 거울과 기울기 밀기를 넣는다): 범위(`textCornersOcs`)가
  플래그·기울기를 넣지 않아 거꾸로 글자는 원점 반대쪽, 뒤집기 글자는 기준선 반대쪽에서 재고 기운 글자는 기울지 않은 직사각형이어서 TEXTALIGN 간격 설정이
  그린 글자와 어긋났다(거꾸로 "R"–"AAA" 간격 1 → 그린 글자 사이 −3.048, ATTIPEDIT 거꾸로 속성 고르기, Express 문자 상자의 거울 글자도) —
  이제 그린 글자 상자로 잰다(기운 글자는 평행사변형 꼭짓점 넷의 범위, 플래그·기울기 없는 문자는 전과 같은 값)
- [ ] 171차에 보고 두 것(고르지 않은 것과 실물 표본·공개 근거 없이는 정하지 못한 것): Express Tools 문자 상자(TCIRCLE·TEXTMASK·TORIENT·TCOUNT)는
  기운 글자에 전처럼 기울지 않은 직사각형을 쓴다(TCIRCLE은 직사각형으로 둘러싸 평행사변형으로 바꾸지 않았다 — 기운 글자를 다 감싸는 더 큰 직사각형으로 할지는
  도움말에 없어 실물 필요). 세로 문자 스타일(STYLE 70 비트 4, SHX)의 한 줄 문자는 그리기가 글자를 진행 방향으로 쌓는데 글자 틀(`textFrame` — 범위·TRIM 모서리·
  자리맞추기 점)은 가로 글자로 잰다(같은 앱 안에서 어긋남 — 자리맞추기 점까지 닿아 SCALETEXT·JUSTIFYTEXT·TEXTALIGN 결과가 바뀌는 다음 후보 — 172차가 범위·TRIM 모서리만 고침).
  트루타입 기울임꼴(글꼴 스타일 플래그)은 그리기만 더 밀고 범위·TRIM 모서리는 넣지 않는다(AutoCAD가 글꼴 기울임을 범위에 넣는지 실물 필요)
- [x] 세로 문자 스타일의 한 줄 문자 범위·TRIM 모서리(172차, Autodesk 문자 스타일 대화 상자 도움말: 세로는 글자를 세로로 줄지어 보이고 트루타입 글꼴에는 없다,
  DXF 참조서 STYLE 70 비트 4 — 그리기와 객체 범위는 글자를 바로 세워 진행 방향으로 쌓은 배치의 범위): 범위(`textCornersOcs`)·TRIM·EXTEND 모서리(`textOutline`)가
  가로 글자 틀로 재어 글줄 한쪽에 높이만큼 놓인 상자여서 TEXTALIGN 간격 설정·ATTIPEDIT 속성 고르기·Express 문자 상자·TRIM이 그린 글자와 어긋났다
  (높이 2·270° "ABC" — 범위 x 5~7, 그린 글자 x 3.952~6.048, 간격 1 → 그린 글자 사이 0.333) — 이제 그린 글자 상자(`verticalTextCorners`, 객체 범위와 같은 값)로 잰다
  (세로 스타일이 아닌 문자는 전과 같은 값, 쓰기 코드 그대로)
- [ ] 172차에 보고 두 것(고르지 않은 것과 실물 표본·공개 근거 없이는 정하지 못한 것): 세로 문자의 자리맞추기 점(TEXTALIGN 맞추는 점·SCALETEXT 기준점·JUSTIFYTEXT)은
  전처럼 가로 글자 틀로 잰다 — Autodesk TEXT 도움말은 맞춤(F)과 TL~BR을 가로 문자에만 쓴다고 적을 뿐 세로 문자의 가운데·오른쪽·중간·정렬 점이 어디인지 적지 않고,
  그리기는 자리맞추기와 상관없이 삽입점(10)에서 쌓는다(AutoCAD가 세로 문자의 10을 어떻게 셈하는지 실물 필요). 같은 도움말대로라면 세로 스타일에서는 맞춤·TL~BR을
  고를 수 없는데 이 앱의 TEXT·JUSTIFYTEXT는 막지 않는다(막으면 할 수 있던 일이 줄고, 이미 그렇게 저장된 문자를 어떻게 그리는지는 실물 필요).
  세로 문자 범위는 그리기의 범위처럼 글자 기울기 밀기와 하강을 넣지 않고, 실제 SHX 글자 폭 대신 편집 계산용 단선 글꼴 폭으로 잰다(가로 글자 틀과 같은 근사)
- [x] −Z 블록 참조의 속성 다시 만들기(173차, DXF 참조서: INSERT 10과 ATTRIB 10·11은 각자의 210 OCS 좌표, Autodesk ATTSYNC 도움말: 정의의 새·바뀐 속성으로 참조를 갱신하고
  기존 값은 바꾸지 않는다, 같은 앱 EXPLODE는 정의의 속성 정의를 평면 사상을 넣은 참조 변환으로 보인다): `edit/util/blockutil.ts` `buildAttribs`(ATTSYNC·BATTMAN 동기화·
  ATTREDEF·BLOCKREPLACE·동적 블록 되돌리기)가 삽입점·맞춤점을 참조 OCS로 셈하면서 속성 돌출 방향은 정의의 +Z를 두어, −Z 참조의 속성이 X 거울상 자리로 갔다
  (정의를 바꾸지 않은 ATTSYNC도 WCS (1,2) → (−1,2), 여러 줄 속성의 MTEXT 삽입점도) — 이제 속성을 참조의 돌출 방향에 두고 MTEXT 삽입점은 WCS로 옮긴다(자연 +Z 참조는 전과 같은 값)
- [ ] 173차에 보고 두 것(고르지 않은 것과 실물 표본·공개 근거 없이는 정하지 못한 것): 문자 도구 밖에서 OCS 좌표를 평면 사상 없이 쓰는 곳 —
  QDIM(`edit/annot/qdim.ts` `qdimGeometry` — −Z 원·호·폴리선·블록의 치수 점·반지름·지름 치수가 거울상 X 자리에 생기고 연관·편집(E)도 그 자리를 본다, 다음 후보),
  DIMCENTER(`app/editcmds2-dim.ts` — 중심 표식 선이 거울상 자리)·DIMRADIUS·DIMDIAMETER·DIMARC(`app/dimcmds.ts` `circleOf` — 객체 스냅의 같은 이름 함수는 사상한다 — 174차가 고침),
  고도가 0이 아닌 −Z 폴리선의 OVERKILL 겹친 호(`geom/overkill.ts` — 폴리선 호 세그먼트 Z에 OCS 고도를 써 그 위의 호를 지우지 않는다)와
  PEDIT 다중 결합 퍼지의 잇는 선 Z(`geom/fuzzjoin.ts` — 부호가 반대, 평면도에는 보이지 않는다). XCLIP의 −Z 참조 역변환은 "평면 안의 근사"로 적어 두었고
  공간 필터 자체의 법선이 있어 실물이 필요하다. QSELECT 위치 X·Y는 OCS 값을 견준다(특성 팔레트가 무엇을 보이는지와 함께 실물 필요).
  블록 정의 안에 자연 +Z가 아닌 속성 정의가 있으면 속성 다시 만들기는 전처럼 그 OCS 값을 블록 좌표로 쓴다(AutoCAD 표본 필요). 편집 기하 커널(간격 띄우기·끊기·결합·
  모깎기·신축·그립·변환)·ALIGN·DIVIDE·MEASURE·치수 연관은 평면 사상을 거쳐 −Z에서 맞고, DIM은 −Z 객체를 받지 않는다(제한)
- [x] −Z 원·호의 반지름·지름·호 길이 치수와 중심 표식(174차, DXF 참조서: CIRCLE·ARC의 중심 10과 각도 50·51은 OCS, Autodesk DIMRADIUS·DIMDIAMETER·DIMARC·
  DIMCENTER 도움말: 고른 원·호에 치수·중심 표식을 만든다): 치수 명령의 `circleOf`(`app/dimcmds.ts`)와 DIMCENTER가 OCS 중심·각도를 평면도 자리로 그대로 써
  −Z 원·호의 치수·중심 표식이 X 거울상 자리에 생겼다(연관 참조는 진짜 원을 보아 지름 치수의 커서 쪽 점이 진짜 원 반대쪽으로 가고, 호 길이 치수는 연관 없음) —
  이제 편집 기하 커널과 같은 평면 사상으로 중심·평면 Z·호 각도(뒤집히면 시작·끝을 바꿈)를 옮긴다(자연 +Z와 기운 돌출 방향은 전과 같은 값)
- [ ] 174차에 보고 두 것(고르지 않은 것과 실물 표본·공개 근거 없이는 정하지 못한 것): DIMANGULAR의 호·원 갈래(`app/dimcmds.ts` — 호 끝점·중심을
  OCS 값 그대로 써 −Z 호·원의 각도 치수가 거울상 자리에 생긴다(코드 읽기), `circleOf`를 쓰지 않는 다른 함수라 두었다 — 175차가 고침)와 CENTERMARK(`app/annot2-misc.ts`
  `roundOf` — 연관 중심 표식도 같은 꼴, 코드 읽기 — 175차가 고침), QDIM(173차에 보고 둔 것 그대로). 돌출 방향이 Z축과 평행하지 않은 원·호(평면도에서 타원)의 반지름·지름·호 길이 치수와
  중심 표식은 전처럼 OCS 값을 쓴다(평면도에 투영한 타원에 원 치수를 어떻게 다는지 도움말에 없어 실물 필요)
- [x] −Z 원·호의 각도 치수와 CENTERMARK 중심 표식(175차, DXF 참조서: CIRCLE·ARC의 중심 10과 각도 50·51, LWPOLYLINE의 꼭짓점 10과 고도 38은 OCS,
  Autodesk DIMANGULAR 도움말: 호를 고르면 호의 중심이 꼭짓점·호의 끝점이 각도 끝점, 원을 고르면 고른 점이 첫 끝점·중심이 꼭짓점, CENTERMARK 도움말: 고른 원·호의 중심에
  중심 표식): DIMANGULAR의 호·원 갈래와 CENTERMARK(`roundOf`)가 OCS 중심·각도(폴리선 호 세그먼트는 OCS 꼭짓점)를 평면도 자리로 그대로 써 −Z 원·호의 각도 치수와
  중심 표식이 X 거울상 자리에 생겼다(각도 치수의 끝점·중심 연관은 붙지 않았고, 원 갈래는 고른 점만 진짜 원 위라 각도 값도 틀렸고, 중심 표식은 Z 부호도 반대) —
  이제 174차 `circleOf`(폴리선은 같은 평면 사상과 뒤집힌 평면의 볼록도 부호)로 옮긴다. 각도 치수는 연관이 붙어 호·원을 옮기면 따라간다(자연 +Z와 기운 돌출 방향은 전과 같은 값)
- [ ] 175차에 보고 두 것(고르지 않은 것과 실물 표본·공개 근거 없이는 정하지 못한 것): 치수 명령 <객체 선택>의 `originsFromEntity`(`app/dimcmds.ts` —
  DIMLINEAR·DIMALIGNED·DIMHORIZONTAL·DIMVERTICAL)는 호의 끝점과 폴리선 세그먼트를 OCS 값 그대로 써 −Z 호·폴리선의 치수보조선 원점이 거울상 자리에 생긴다(코드 읽기,
  같은 꼴 — 176차가 고침), CENTERLINE의 `straightOf`(`app/annot2-misc.ts`)도 −Z 폴리선 직선 세그먼트를 OCS 꼭짓점으로 쓴다(코드 읽기 — 176차가 고침). QDIM은 173차에 보고 둔 그대로.
  이 앱의 CENTERMARK는 익명 블록 참조 하나로 만들고 연관(원·호를 옮기면 따라가기)을 붙이지 않는다 — AutoCAD의 연관 중심 표식(CENTERREASSOCIATE·CENTERDISASSOCIATE)은 없다
- [x] −Z 호·폴리선의 선형 치수 <객체 선택> 원점과 CENTERLINE 중심선(176차, DXF 참조서: ARC의 중심 10과 각도 50·51, LWPOLYLINE의 꼭짓점 10과 고도 38은 OCS,
  LINE의 끝점은 WCS, Autodesk DIMLINEAR·DIMALIGNED 도움말 <객체 선택>: 고른 선·호의 끝점이 치수보조선 원점이고 폴리선은 고른 세그먼트, CENTERLINE 도움말: 고른 두 선·
  직선 폴리선 세그먼트의 중심선): `originsFromEntity`(DIMLINEAR·DIMALIGNED·DIMHORIZONTAL·DIMVERTICAL)와 CENTERLINE의 `straightOf`가 호 끝점·폴리선 꼭짓점의
  OCS 값을 평면도 자리로 그대로 써 −Z 호의 원점이 X 거울상 자리에 생기고(연관도 붙지 않았다), 폴리선은 고른 점과 OCS 세그먼트를 견줘 다른 세그먼트를 재기도 했고,
  중심선은 거울상 선 쪽으로 생겼다 — 이제 폴리선 평면도 꼭짓점 도우미 `lwPlanVertices`(175차 CENTERMARK 폴리선 갈래와 같은 식 — `roundOf`도 이것을 쓴다)와
  같은 평면 사상으로 호 끝점을 옮긴다. 원점이 연관되어 호·폴리선을 옮기면 따라간다(선과 자연 +Z·기운 돌출 방향은 전과 같은 값)
- [ ] 176차에 보고 두 것(고르지 않은 것과 실물 표본·공개 근거 없이는 정하지 못한 것): QDIM(`edit/annot/qdim.ts` `qdimGeometry` — 173차에 보고 둔 그대로, 다음 후보).
  DIMLINEAR·DIMALIGNED <객체 선택>으로 원을 고르면 도움말은 지름 끝점을 원점으로 쓴다고(고른 점이 첫 원점, 고른 점에 가까운 사분점에 따라 수평·수직) 적지만
  이 앱은 원을 받지 않는다(없는 기능이라 이번 범위 밖). CENTERLINE은 고른 선의 Z와 무관하게
  Z 0에 놓는다(+Z 선에서도 같다 — 도움말에 Z 규칙이 없어 그대로)
- [x] MATCHPROP·특성 팔레트로 치수를 주석으로 바꾸면 축척 배율로 다시 그린 새 `*D` 블록을 쓰고 원래 그림 블록이 쓰이지 않은 채 남던 것(120차 — 다른 치수·레코드가 쓰지 않으면 같은 명령 취소 단계에서 지운다)
- [x] EXPLODE한 주석 객체(120차, Autodesk EXPLODE 도움말: 지금 축척 표현만 분해하고 결과는 주석이 아니다): 분해 결과가 편집 고리에서 다시 주석이 되거나(주석 MTEXT의 TEXT 6,559개 원본)
  주석 스타일 문자로 보여 축척 배율만큼 커지던 것(주석 치수 4,231·다중 지시선 3,661개 등)을 막고, EXPLODE·BURST는 그 공간 주석 축척의 표현을 분해한다
- [ ] 주석이 아닌 블록 안의 주석 객체를 분해하면 지금 축척 레코드 하나만 얻는다(블록 정의 안 객체의 다른 축척 레코드는 옮기지 않는다 — 실제 도면 블록 참조 68개). 주석 블록 참조를 담은 블록·다중 지시선의 블록 내용을 분해한 참조는 블록 정의가 주석이라 편집 고리가 새 주석 참조로 본다(실제 도면에서 주석이 아닌 블록 안의 주석 블록 참조는 0개).
  123차에 다시 잼: 최상위의 주석이 아닌 블록 참조 71개(도면 15) 안의 주석 MTEXT(참조마다 셈) 363개 가운데 레코드가 둘 이상인 것은 38개(나머지는 하나), 주석 속성 정의 61개는 모두 하나다.
  EXPLODE가 이제 속성 정의를 옮기므로(아래) 주석 속성 정의는 표지만 남고 레코드는 옮기지 않는다(확정 고리는 속성 정의에 레코드를 만들지 않는다 — 다시 블록으로 만들어 넣으면 정의 높이를 용지 높이로 본다)
- [x] EXPLODE한 블록의 속성(123차, Autodesk EXPLODE 도움말: 속성이 든 블록을 분해하면 속성 값을 지우고 속성 정의를 다시 보인다): 예전에는 BURST처럼 값 문자를 남기고 상수가 아닌 정의를 버렸다.
  이제 EXPLODE와 분해해 넣기(INSERT 대화 상자의 분해, `-INSERT *이름`)는 블록 정의의 속성 정의를 참조 변환으로 옮기고 속성은 버린다. BURST와 범위·모서리 조회는 값 문자 그대로.
  실제 도면 143개의 최상위 참조 689개: 속성 정의 0 → 3,606개(분해 금지 블록 참조 1개의 16개를 뺀 모두). 참조의 속성 3,692개 가운데 값이 정의 기본값과 다른 것은 1,263개다(값을 남기려면 BURST)
- [ ] MINSERT로 넣은 블록의 EXPLODE: Autodesk EXPLODE 도움말은 MINSERT로 넣은 블록은 분해할 수 없다고 적지만 이 앱은 칸마다 펼친다(123차에 잼 — 실제 도면의 최상위 다중 삽입 1개. 막으면 할 수 있던 일이 줄어 그대로 둔다)
- [ ] 블록 밖의 여러 줄 속성 정의는 기본값(여러 줄 문자)을 그린다(한 줄 정의는 태그). AutoCAD가 무엇을 보이는지 도움말에서 찾지 못했다 — EXPLODE로 나올 수 있는 실제 도면의 여러 줄 정의는 25개
  (124차에 다시 잼: 실제 도면 841개의 최상위 여러 줄 속성 정의는 0개)
- [x] 블록 분해에서 옮길 수 없는 블록 내용(163차, Autodesk EXPLODE 도움말: 블록은 한 단계씩 분해하고, 비균등 축척 블록에서 분해할 수 없는 바디·3D 솔리드·영역은
  "*E" 익명 블록으로 모아 참조하며 모두 그러면 참조를 분해하지 않는다): 원본 ACIS 자료가 있는 영역·3D 솔리드·바디·곡면, 모르는 객체, 고르지 않게 축척한
  원호 정렬 문자를 EXPLODE·BURST·분해해 넣기가 버렸다(내용이 모두 그런 블록은 참조만 지웠다). 이제 분해하지 않고 원본을 남기며 변환 함수의 까닭을 알린다
- [ ] 163차에 보고 두 것(실물 표본·공개 근거 없이는 정하지 못한 것): AutoCAD처럼 옮길 수 있는 내용은 분해하고 옮길 수 없는 것만 "*E" 블록으로 모으기 —
  ACIS 객체를 새 핸들로 복사하면 원본 본문(dwgRaw)이 빠져 R2004+ DWG에는 모서리 3D 폴리선으로 쓰이고 R2013+ 자료 저장소 몫도 핸들에 묶여 값을 잃는다
  (균일 축척에서 AutoCAD는 솔리드를 옮겨 꺼내는데 이 앱은 ACIS 형상을 옮기지 못한다). 모르는 객체(프록시)를 AutoCAD가 분해에서 어떻게 다루는지는 공개 도움말에 없다.
  치수·표 블록 그림의 분해와 범위·모서리 조회는 옮길 수 있는 내용만 쓴다(그런 객체가 든 치수·표 블록 실물을 본 적이 없다)
- [x] R2018 이전 판의 여러 줄 속성(124차, DXF 참조서 ATTRIB의 AcDbXrecord 절과 AutoCAD가 같은 도면을 R2018~R14로 쓴 DWG·DXF 표본): 옛 판은 한 줄 속성 +
  확장 사전의 ACAD_MLATT(MText 플래그·태그·끼운 MTEXT 자료)·ACAD_XREC_ROUNDTRIP(ACAD_MATT_HEIGHT) XRECORD다. 읽은 뒤 R2018 모양(끼운 MTEXT, XRECORD 태그, 본문 글 "")으로 바꾸고
  (예전에는 한 줄 문자와 AutoCAD가 한 줄 꼴에 붙인 태그 `_001`), R2018 아래로 쓸 때 한 줄 꼴 글 = MTEXT 평문과 두 기록을 쓴다(예전에는 DWG가 R2018에서 읽은 속성의 값을 잃고 DXF는 한 줄).
  실제 도면 841개: R2018 꼴 32개(도면 7), 옛 꼴 22개(같은 표본 11판). 여러 줄 속성 도면 18개를 DWG·DXF AC1027·AC1015로 쓰고 다시 읽으면 모두 같다
- [ ] R2018 이전 판 여러 줄 속성의 남은 것(124차): 한 줄 꼴 속성 태그의 `_001`(AutoCAD 표본은 속성에만 붙였다 — 표본 하나라 규칙을 몰라 붙이지 않는다),
  ACAD_MLATT의 잠김(70)·보조 속성(70·340)·맞춤점(10)·주석 축척(40 — 표본은 모두 0·0·없음·1이라 그대로 쓴다)과 주석 여러 줄 속성의 옛 판 레코드, 배경 칸(참조서에는 있고 표본에는 없다),
  여러 문단 값을 한 줄 꼴로 바꾸는 규칙(표본 값은 한 줄 — 지금은 줄을 빈칸으로 잇는다). 실물은 표본 도면 하나(판 11개)뿐이다

## 품질 과제

- [x] 망가진 파일에 대한 견고성(35차): 파일에서 읽은 수가 할당과 반복 수를 정하는 자리를 DWG 컨테이너·객체, 자료 저장소, 표, 블록 펼침, 해치, 스플라인에서 막았다. 한도는 `src/core/limits.ts`, 합성 손상 파일 시험은 `tests/robust`
- [x] 명령을 골라야 닿는 블록 재귀에도 펼침 몫 두기(59차): 객체 범위·모서리·곡선 묶기는 부를 때마다 25만 + 도면 객체 수, 스냅은 커서 자리마다 20만.
  객체 범위는 몫이나 깊이 한도를 넘는 참조를 블록 상자로 낸다(깊이 9 블록 폭탄이 약 2시간에서 1.1초)
- [x] 모서리의 깊이 한도 4, 몫을 넘어 모서리·해치 경계를 펼치지 않았을 때 명령줄 안내(64차): 깊이를 16으로 올리고(일은 59차 몫이 묶는다),
  TRIM·EXTEND는 대상 하나에 모서리 모두가 몫 하나를 함께 쓴다. 몫을 넘으면 TRIM·EXTEND는 명령마다 한 번, HATCH·-HATCH·BOUNDARY·-BOUNDARY는 내부 점마다 알린다
- [x] COUNT가 다중 삽입의 칸을 펼치지 않고 세기(58차): 칸마다 핸들을 쌓지 않고 행 × 열로 더한다. 30000 × 30000 다중 삽입 100개가 1.07초·힙 +1,815MiB에서 0.4ms로
- [x] 최상위 해치의 고리 수 제곱과 무늬 선 수 × 변 수, 다중 지시선이 선종류 표를 훑는 일(61차): 고리 포함 관계를 상자 격자로 거르고(결과는 같다),
  구멍이 512개 넘는 바깥 고리는 구멍 사이 틈에서 칸으로 잘라 채운다(구멍 4만 개 271초 → 0.16초). 채우기 일이 해치 크기에 비례하는 한도를 넘으면 경계만(동심 고리 수천 개).
  무늬 선마다 변을 계수 정렬하고(4.7 → 1.6초) 해치 하나가 장면에 남은 일 + 꼬리를 넘으면 무늬를 멈춘다. 다중 지시선은 선종류를 핸들 표로 찾는다(2.3 → 0.03초)
- [x] 구멍이 많은데 어느 축에도 구멍 사이 틈이 없는 채우기 해치(91차): 영역을 축에 나란한 직선으로 반씩 잘라(가로지른 구멍은 칸 경계 고리에 잇는다)
  정점 256개 이하 칸마다 earcut을 부르고, 자른 칸의 정점 수를 일로 센다. 서로 감싼 ㄱ자 구멍 1,800개 136초 → 0.3초, 돌린 타공판·육각 원 구멍 1만 개는 경계만 → 채움
- [x] 구멍 상자가 서로 겹쳐 덮는 꼴의 고리 포함 관계(92차): 상자 격자가 품지 않는 고리를 견준 일이 고리·정점 수에 비례하는 문턱을 넘고 절반을 넘으면
  변 훑기로 갈아탄다(점을 y 순으로 훑고, 고리 왼쪽 x ~ 변의 큰 x 직사각형이 점을 품는 변만 최댓값 나무로 꺼낸다 — 결과는 같다).
  서로 감싼 ㄱ자 구멍 2,400개·4,800개·2만 개가 경계만 → 채움(포함 관계 일 4,609만 → 98만, 2만 개 32억 → 878만). 정상 꼴과 실제 도면은 갈아타지 않아 일까지 같다
- [x] 구멍이 512개 이하인데 earcut이 모양 탓에 느린 꼴(92차): 구멍이 64개 넘고 구멍 상자가 평균 4겹 넘게 서로 덮으면 칸 자르기로 채운다
  (서로 감싼 ㄱ자 구멍 500개 1.3~1.4초 → 0.02~0.04초). 덮는 정도는 그런 꼴이 24~333, 격자·타공판·육각 원 구멍·별꼴이 0.8 아래, 실제 도면은 구멍 17개까지라 닿지 않는다
- [x] 기운 막대 4,000개(93차): 변 훑기가 점 차례를 띠 32개로 나눠 기운 변을 띠마다 조각으로 자르고, 조각의 큰 x를 그 조각에 든 점의 y에서 잰 변의 x로 좁힌다
  (세로 변은 자르지 않는다 — 결과는 같다). 포함 관계 일 1,620만 → 130만이라 경계만 → 채움(채우기 일 2,381만 / 한도 3,458만), 기운 막대 2,000개 759만 → 65만
- [x] earcut 3.2.4가 돌린 타공판·육각 구멍에서 구멍을 덮는 일(93차): 구멍 변과 다리가 거의 한 줄에 놓여 방향 판정이 반올림에 흔들리면 고리가 스스로 겹쳐
  구멍 일부를 덮는다(92차에는 30도 22 × 22를 "5.7% 빠뜨린다"로 적었으나 실제로는 5.7% 많다). earcut마다 삼각형 넓이와 홀짝 넓이(신발끈 식)를 견주고
  넓이의 100만분의 1을 넘게 다르면 칸으로 잘라 다시 채워 넓이가 맞을 때만 바꾼다. 돌린 타공판·육각 구멍 7,326가지 가운데 어긋난 583가지(최대 +45%)가 모두 맞고,
  실제 도면 841개의 해치는 삼각형까지 같다
- [x] 고리가 변을 함께 쓰는 채우기 해치(94차): 판정 점(첫 변 중점)이 이웃 고리의 변 위라 맞붙은 사각형 12개 가운데 6개가 이웃의 구멍이 되던 꼴.
  판정 점이 다른 고리의 변에서 여유 안인 쌍만 찾아 "넓이가 크고 안쪽 점(가로 주사선의 가장 넓은 안 구간 가운데)을 품으면 품는다"로 다시 판정한다
  (DXF 75 = 0은 odd parity 영역이고 그런 경로는 92 깃발이 External·Outermost라 둘 다 채운다). 같은 고리를 두 번 적은 쌍과 진짜로 엇갈린 쌍은 예전 판정.
  실제 도면 841개에서 바뀐 earcut 호출 90번(도면 11개)이 모두 맞닿은 고리이고 넓이·점 표본이 맞으며, 나머지 도면은 삼각형까지 같다
- [ ] 고리가 서로·스스로 엇갈리는 채우기 해치(93차에 잼, 94차에 남은 것): 실제 도면 6개에서 earcut 19번이 넓이 검사에 걸린다(홀짝 넓이 대비 -78% ~ +49%).
  신발끈 식이 홀짝 넓이가 아니라 다시 채워도 맞지 않아 예전 삼각형 그대로다. 고리를 교점에서 나눠 홀짝 영역을 먼저 구하면 채울 수 있으나,
  AutoCAD가 엇갈린 경계를 그렇게 그리는지 공식 근거를 먼저 찾는다(DXF 참조는 75 = 0을 odd parity라고만 적는다).
  109차에 찾은 것: ObjectARX 참조 AcDbHatch 설명은 고리가 단순·닫힘·연속이고 끝점에서만 스스로 만나야 하며, 여러 고리는 떨어져 있거나 안팎으로 들어 있어야 하고,
  어기면 결과가 예측할 수 없고 일반 해치와 솔리드 채우기 사이에도 다를 수 있다고 적는다(AutoCAD의 경계 검사는 제한적). 엇갈린 고리를 채우는 규칙은 공식 문서에 없어
  고치지 않았다. 고친다면 실물(AutoCAD가 저장한 엇갈린 경계 해치의 그림·넓이)을 근거로 삼아야 한다
- [x] 칸 조각 안의 고리 포함 관계(94차에 남은 것, 95차): 칸 자르기가 늘 [바깥 고리, 그 구멍…]을 받으므로 통째로 남은 구멍은 깊이 1, 직선이 지나 이은 조각은 깊이 0을
  물려받고 구멍마다 품는 조각만 찾는다(판정 점이 조각 변 위면 안쪽 점으로). 바깥 변에 닿은 기운 막대 70개·변을 함께 쓰는 막대 쌍의 돌린 꼴이 넓이 0.4~21% 많던 것이 맞고,
  맞닿지 않은 합성 꼴 51가지는 삼각형이 같으며 일은 줄었다(기운 막대 4,000개 2,424만 → 928만). 실제 도면은 바뀐 호출 0
- [x] 해치 섬 감지 스타일 바깥만(Outer, 75 = 1)·무시(Ignore, 75 = 2)(94차에 남은 것, 95차): 고리 깊이로 바깥만은 깊이 1 이하, 무시는 깊이 0만 남겨 홀짝으로 채운다
  (DXF 참조 "outermost area only"·"through entire area", -HATCH "only the outermost level of the structure"). 경로 깃발은 객체를 골라 만든 해치에서 깊이와 맞지 않아 쓰지 않는다.
  실제 도면 841개에서 섬 안의 섬을 채우던 바깥만 해치 31개(도면 23개)가 바뀌고 넓이·점 표본이 맞으며, 나머지 823개 도면은 버퍼까지 같다
- [x] 바깥 고리와 변 일부를 함께 쓰는 구멍을 돌린 꼴(94·95차에 남은 것, 112차): `earcut`이 구멍을 덮어 넓이가 늘던 꼴(막대 하나 +17%, 네모 구멍 최대 +60%).
  넓이 검사에 걸리고 칸 다시 채우기도 실패한 입력에서 바깥 고리를 반시계·구멍을 시계로 놓고 반대 방향으로 겹치는 변을 지운 뒤 남은 변을 다시 잇는다(`mergeShared` — 구멍이 바깥 고리의 오목한 자리가 된다).
  가로지르는 변이 있으면 지우지 않고, 넓이 검사를 다시 지나야 바꾼다. 합성 5꼴 × 16각도에서 틀린 꼴 25 → 0. 실제 도면 841개 호출 37,901번 가운데 바뀐 호출 1번(자기 변을 되짚는 고리 — 넓이 +0.34% → 홀짝 넓이)
- [ ] 엇갈린 섬의 바깥만 채우기(95차에 남은 것): 깊이 2 고리가 첫 겹 섬 밖으로 나온 해치는 그 띠(고리 둘에 든 곳)도 채운다(실제 도면 해치 하나, 무늬 점 0.18%).
  공식 뜻("고리 하나에만 든 곳")대로 하려면 고리끼리 불리언 연산이 필요하다
- [x] 합법 DWG를 압축 비율로 거부하지 않기(36차): 한도를 형식의 상한 255:1 + 1MiB로 바꾸고 파일에서 푸는 크기의 합으로 묶었다
- [x] 축척 곱이 객체마다 선종류 무늬를 복사하는 일, 자르기 사전 캐시의 큰 사전 공유 줄이기(60차): 무늬는 그리면서 축척을 곱하고(요소 10만 개 선종류의 선 2만 개 22초 → 0.04초), 필터 사전의 SPATIAL 항목은 사전마다 한 번만 찾는다(6.0 → 0.03초)
- [x] 그리기 밖 호출자(객체 스냅 등)의 맞춤점 재계산 줄이기(41차): 스냅·길이·경로·경계가 풀어 둔 곡선을 다시 쓰고, 닫힌 스플라인은 스냅에 곡선을 풀지 않는다
- [x] `finish()` 단계 할당 실패를 장면 전체 실패가 아니게 하기(40차): 버퍼를 못 줄이면 남는 자리째 넘기고, 글리프를 못 묶으면 글자만 뺀다
- [x] 실제 AutoCAD 표로 표 예산 재기(48차): 공개 도면의 표 136개 가운데 가장 큰 표가 399행 × 2열(798칸)이라 문서 예산(100만 칸 이상)에 닿지 않는다
- [ ] 메모리가 적은 기기에서 표 예산 재기
- [x] 표마다 빈 칸 1,024개를 쌓는 입력의 힙 줄이기, 문서 표 칸 예산이 풀지 않은 표도 세는 일(`or.tableCells`) 고치기(63차): 문서 하나의 빈 칸 합을 65,536칸으로 묶어
  표 1,000개(DWG 24KB)가 7.1초·힙 +881MiB에서 0.39초·+58MiB로. 문서 칸 예산에는 푸는 표만 더한다
- [x] 객체 구역이 512MiB를 넘는 DWG를 끝까지 읽기(36차): 비트 위치가 2^32를 넘으면 `>>> 3`이 윗자리를 잃어 구역 앞쪽을 읽었다
- [x] 쓴 DWG가 0 구역 때문에 다시 열리지 않는 일 막기(37차): 건너뛰는 0 페이지의 합을 512KiB로 묶었다
- [x] 다른 프로그램이 0 페이지를 건너뛴 DWG 받기(38차): 형식이 정한 동작이라 파일 한도에 64MiB를 더 받는다
- [x] 파일 용량으로 도면을 막지 않기(39차): 512MB 열기 제한, DXF 300만 객체, DWG 섹션 크기 한도를 없앴다. 이제 막는 값은 브라우저가 잡을 수 있는 버퍼 크기다
- [x] 실제 AutoCAD 파일의 0 페이지 재기(48차): 0 페이지로 빠진 바이트는 파일당 최대 178,176바이트(자료 저장소, Template)라 쓰기의 `ZERO_PAGE_SKIP`(512KiB) 안쪽이다
- [x] 페이지가 3분의 1도 차지 않는 섹션이 있는지 실제 파일로 재기(48차): 663개 파일에서 일은 한도의 33% 이하였고, 그런 섹션은 없었다
- [x] 공개된 실제 도면으로 찾은 DWG 결함(48차): R2007+ 큰 사전을 버림, R2000·R2004로 저장한 4바이트 핸들 객체가 깨짐, 선가중치 0.30mm가 ByBlock이 됨, 페이지 지도가 32KiB를 넘는 도면을 열지 못함
- [x] R12(AC1009) DWG 읽기(49차): 에스토니아 국토청 전국 건물(224MB, 폴리선 92만 개)이 브라우저에서 읽기 5.8초·그리기 1.1초에 열린다. R12 DXF 뷰포트의 MVIEW 보기 정보도 읽는다
- [x] R10(AC1006) DWG 읽기(82차): 공개 형식 설명(dwg_ac1006.ksy, CC0)과 AutoCAD R10 객체별 표본 32개로 R12 리더를 넓혔다. JUMP 객체를 따라 읽는다
- [x] R9(AC1004) DWG 읽기(83차): 공개 형식 설명(dwg_ac1004.ksy, CC0)과 LibreDWG 시험 도면·짝 DXF로 R10 길을 넓혔다(핸들 없음, 선·점 2D, 점마다 Z 플래그, 2D 치수).
  옛 AutoCAD가 쓴 DXF의 `3DLINE`과 EOF 뒤 DOS 파일 끝 표시(Ctrl-Z)도 읽는다
- [x] R2.6(AC1003) DWG 읽기(84차): 공개 형식 설명(dwg_ac1003.ksy, CC0)과 LibreDWG 시험 도면 2개·짝 DXF로 확인하니 객체 배치가 R9와 같다. 머리 끝과 추가 구역만 다르다
- [x] R2.10(AC2.10) DWG 읽기와 R2.x `REPEAT`…`ENDREP`(85차): 배치가 R2.6과 같다. 되풀이 객체는 DWG·DXF 모두 익명 블록 + 배열 블록 참조로 접는다
- [ ] R2.5(AC1002)·R1.x(`AC1.40` 등) DWG: R2.5는 형식 설명만 있고 표본이 없으며, R1.x는 배치가 다르고 LibreDWG 시험 도면 1개뿐이다(지금은 지원하지 않는 판으로 알린다)
- [x] 메인 스레드의 객체 상자를 묶은 형식으로 두기(50차): 상자를 객체로 풀지 않고 고르기 격자도 형식 배열로. 그리스 우수관망(객체 42만 개) 메인 힙 539 → 405MB
- [x] 브라우저에서 569MB 킬시 지도(R2007, 객체 290만 개) 열기(51차): 경량 폴리선·해치 폴리선 경계의 정점을 `Float64Array`로 바꿔 JS 힙 밖에 둔다.
  메인 문서 힙 2,316 → 1,268MiB(경량 폴리선 하나 2,573 → 407B)로 줄어 약 33초에 열리고, 고르기·MOVE·U가 된다
- [x] 객체가 아주 많은 도면의 그리기 일 한도를 객체 수에 맞춰 늘리기(52차): 장면 일 한도를 6천만 고정에서 객체당 50(객체 120만 개 위로)으로.
  킬 지도가 블록 펼침·장면 조각 경고 없이 다 그려진다(조각 6,202만, 표시 목록 1,707MiB)
- [x] 블록 참조 축척 1·여러 줄 문자 방향 X를 얼린 점 하나로 함께 쓰기(96차): 객체 모양을 다시 재니 종류마다 숨은 클래스는 1~2개이고 사전 모드 객체는 없었다.
  객체마다 새로 만드는 작은 객체 가운데 가장 큰 몫이 블록 참조 축척 (1, 1, 1)(킬 지도 86만 개 가운데 99.98%)이었다. 킬 지도 메인 문서 힙 1,272 → 1,152MiB(블록 참조 하나 462 → 334B)
- [x] 묶음을 풀 때 정수는 정수로 돌려주기(96차): 실수 배열에서 읽은 -1이 최적화 단계에 따라 상자 든 실수가 되어 선가중치·투명도 칸이 실수 칸으로 바뀌고,
  그 모양의 모든 객체가 칸마다 실수 상자를 더 들었다(어느 종류가 걸리는지는 JIT 시점에 따름). 킬 지도 1,152 → 1,124MiB, 포르투갈 111.6 → 104.7MiB, 에스토니아 537 → 509MiB
- [ ] 킬 지도 메인 힙의 남은 큰 몫(96차에 다시 잼, 메인 문서 힙 1,124MiB): 선 360MiB(하나당 327B, 그중 점 둘이 약 190B), 블록 참조 275MiB(334B),
  경량 폴리선 178MiB(375B), 핸들 색인 112MiB, 여러 줄 문자 110MiB(407B), 해치 84MiB(922B). 킬 지도는 이제 열리므로(51~53차) 급하지 않다.
  줄이려면 모델 표현을 바꿔야 한다: 선의 두 점을 수 배열 6칸으로 두면 하나당 약 100B 줄지만(`Float64Array`는 작은 배열마다 드는 고정 비용 때문에 오히려 는다),
  `.start`·`.end`를 읽는 줄이 소스 103개 파일 435줄이고 `.insert`·`.scale`까지 194개 파일 1,119줄이다(96차에 잼, 다른 객체의 같은 이름 포함).
  핸들 색인(`Map`)을 작은 표로 바꾸면 문서를 구조화 복제할 때(워커와 주고받기, `structuredClone`) 메서드가 사라져 복제하는 자리를 모두 고쳐야 한다
- [x] POLYLINE·SPLINE·MESH·지시선의 평탄 좌표도 `Float64Array`로(54차): 포르투갈 지도 메인 문서 힙 169 → 106MiB. 정점이 적은 에스토니아 R12는 518 → 534MiB(형식 배열의 고정 비용)
- [x] 큰 폴리선 도면 읽기의 큰 GC 줄이기(53차): 읽는 동안 정점 배열을 두 배씩 키우는 덩어리에서 떼어 주고, 구조화 복제로 보내는 블록만 제 버퍼로 바꾼다.
  킬 지도 읽기 19.2~19.6 → 16.4~17.7초(Node), 큰 GC 3.3~3.7 → 1.0~2.0초
- [x] 메인이 다 푼 문서 묶음의 버퍼를 바로 놓아 주기(96차): 받는 동안의 큰 GC는 모두 바깥 메모리 압박으로 시작했다(킬 지도 19번).
  받은 버퍼를 `ArrayBuffer.transfer(0)`로 떼어 내 17~18번(에스토니아 건물 3 → 2번)
- [ ] 메인이 문서 묶음을 받을 때의 남은 큰 GC: 문서 자신의 형식 배열(킬 지도 59만 개, 약 1.1GiB)이 바깥 메모리를 늘려 시작한다.
  덩어리 뷰로 두면 줄지만 메인 객체는 복제(구조화 복제, 소스 168곳)되므로 덩어리 전체가 복사돼 남겼다(97차부터 편집 객체 복사 `cloneEntity`는 보는 부분만 옮긴다 — 나머지 자리가 남았다).
  125차에 다시 잼(Node): 킬 지도 받기 5.74초 가운데 큰 GC 17번 2,787ms(묶음 하나 최대 990ms). 17번은 형식 배열 약 1.1GiB를 V8이 큰 GC를 앞당기는 바깥 메모리 걸음(64MiB)으로
  나눈 수와 맞아, 같은 바이트를 작은 버퍼 여럿으로 잡는 한 횟수는 줄지 않는다(64MiB보다 큰 덩어리로 잡아야 준다). 지금 `structuredClone`이 src 66개 파일 175곳이라 그대로 두었다
- [ ] POLYLINE의 빈 칸(`bulges`·`widths`·`vflags`·`tangents`·`faceRecs` 다섯 가운데 에스토니아 건물은 넷이 비어 92만 7천 개에 Node 28MiB — 브라우저는 포인터 압축으로 절반쯤):
  DWG `readPolyline`과 DXF `polylineHead`의 객체 리터럴이 모양을 하나로 두려고 undefined로 만든다(경량 폴리선 `widths`는 `core/lwpoly.ts`).
  빼면 있는 칸 조합마다 모양이 갈리고 메인으로 보낼 때 모양도 따라 바뀌어, 형식별 칸 묶음 같은 모델 변경과 함께 봐야 한다(97차에 자리만 찾았다)
- [x] 메모리가 모자라 탭이 꺼질 때 안내(55차): 열기를 시작할 때 sessionStorage에 이름·크기를 적고 끝나면 지운다. 같은 탭에서 앱이 다시 시작할 때 남아 있으면
  시작 화면에 "지난번에 이 도면을 여는 동안 페이지가 닫혔습니다"와 할 일을 띄운다. 꺼지기 전에 미리 알리는 일은 남은 메모리를 볼 수단이 브라우저에 없어 하지 않는다
- [x] 큰 선택과 큰 객체에서 터지던 펼침 호출 없애기(42차): `push(...)`의 인자 한도는 메인 스레드 약 12만 개, 작업자 약 6.3만 개다
- [x] 도면 크기를 따르는 펼침 호출 훑기(110차): src의 호출 인자 펼침 451곳 가운데 길이가 객체·참조·등록된 응용프로그램·고른 객체·파일 자료·문자 내용·정점 수를 따르는
  펼침 인자 42개를 고침 — PURGE·-PURGE, ATTREDEF·BATTMAN 동기화, XBIND, 특성 팔레트, CDORDER, 연관 치수, DXF 쓰기 ACDSDATA, DWG R2007+ 필드·표 글자,
  LISP `entget`, PDF 채운 삼각형·숨은 글자, 제자리 문자 편집기, 데이터 추출 열 폭, TCOUNT, COMPARE 서명, NURBS 잇기(`unshiftAll`·`insertAll`·`charsOf`·`codePointsOf` 더함)
- [x] 110차 펼침 고친 곳의 시험과 남은 펼침(111차): 고친 인자 42개 가운데 시험이 없던 23개 중 22개에 20만 개 꼴 시험을 더함(`tests/robust/large-arrays111.test.ts` — 나머지 하나는 PDF 선 경로로 2만 개마다 비워 한도에 닿지 않음).
  ACIS 영역 펼치기의 곡선 조정점 z 모으기와 쌓기 원문 풀기(`decodeStack`)의 펼침을 고치고, -PURGE 이름 있는 객체가 항목마다 목록을 훑던 제곱도 없앰
- [ ] 펼침 호출에 남은 것(111차): DOM 목록 짓기(`h(...)`·`replaceChildren(...)` 약 100곳 — 도면층·블록 수. 표 기록이 12만 개를 넘는 도면은 못 봄).
  113차에 실제 도면 841개를 재니 블록 최대 21,655개(대부분 익명)·도면층 686개 — 한도의 약 18%라 고칠 근거가 아직 없다
- [x] 큰 스플라인의 베지어 분해 `toBezier`(112차): 매듭 무리를 왼쪽부터 한 번 훑어 조각마다 조정점을 깎는 꼴(The NURBS Book A5.6)로 바꿨다. 조각 2,000개 약 230 → 1~4ms, 2만 개 약 37초 → 약 10ms, 20만 개 약 100ms(예전 끝나지 않음).
  겹침이 차수보다 많은 매듭·순서가 틀린 매듭·정의역 끝과 거의 같은 매듭은 예전처럼 매듭마다 넣어 제곱이 남는다(뜻이 애매해 결과를 같게 두었다. 113차에 실제 도면 841개의 스플라인 1,698개를 재니 이런 매듭은 0개다).
  1e-12 안으로 거의 같은 안쪽 매듭은 예전 식이 곡선 밖으로 나갔다(거리 1.18) — 이제 곡선 위다
- [x] 전체 선택한 큰 도면의 편집이 멈추지 않게 하기(43차): 선 20만 개의 COPY·MOVE·ERASE·U가 끝까지 돈다(MOVE 7초, ERASE 4.5초)
- [x] 많은 객체를 숨길 때 GPU 버퍼를 한 번에 올리기(44차): 선 20만 개의 MOVE가 7초에서 1.4초로
- [x] 치수가 많은 큰 선택이 멈추지 않게 하기(47차): 치수 2만 개 + 해치 2만 개의 MOVE가 38초 넘게에서 1.4초로
- [x] 선 20만 개의 ERASE 2.6초 내역 재기(65차): 약 2.3초가 OOPS가 ERASE를 감싸 지운 객체마다 블록을 indexOf로 훑는 일(객체 수의 제곱)이었다.
  세션이 기억한 자리로 바꾸고 워커에는 지운 객체의 핸들만 보내, 배포 빌드에서 ERASE 2,993 → 470ms, MOVE 2,017 → 1,799ms
- [x] 연관 해치, 무늬 해치, 연관 치수가 많은 도면의 큰 선택 재기(66차): 연관 해치 1만(SOLID·ANSI31 반반)·연관 치수 1만·경계 1만을 모두 골라 MOVE 3.96 → 2.36초,
  ERASE 0.81 → 0.21초(연관 따라가기가 같은 편집의 객체 변경 목록을 키마다 훑던 제곱, 워커에 보내는 치수 블록·사전의 바꾸기 전 값)
- [x] 치수를 옮기거나 복사할 때 남던 블록·색인(69차): 변환이 만든 치수 블록을 다시 만든 뒤에도 넣어, MOVE마다 쓰이지 않는 `*D`가 치수 수만큼 남고
  COPY는 같은 이름을 두 번 넣어 블록 밖 색인이 남았다. 다시 만든 치수의 변환 블록은 넣지 않아 3만 개 MOVE 2.18 → 1.48초, COPY 2.20 → 1.45초
- [x] 다시 만들 치수 블록의 내용을 변환에서 옮기지 않기(70차): 생성기가 못 다룬 치수만 채운다. 3만 개 MOVE 1.51 → 1.04초, COPY 1.49 → 1.07초
- [x] 큰 선택의 치수 다시 만들기와 핸들 주기(77차): 치수 스타일 값을 편집 하나 동안 스타일마다 한 번만 풀고(치수 1만 개 그림 199 → 36ms), `newHandle`이 `$HANDSEED`를 다시 풀지 않는다.
  시험 하네스 COPY 921 → 670ms, MOVE 1,099 → 992ms
- [x] 속성 없는 블록 참조를 바꾸면 워커 문서가 어긋나던 결함(78차, 65차 회귀): 워커로 보내는 바꾸기 전 블록 참조에 빈 속성 배열을 둔다. 편집 훑기가 워커 문서도 견준다
- [x] 편집 훑기에 다시 하기 점검(81차): 다시 한 문서가 명령 직후와 같고 워커 문서도 같은지
- [x] 워커가 편집을 적용하지 못하면 알리고 메인 문서로 다시 맞추기(80차): 전에는 워커 오류를 버려 78차 결함이 65~77차 동안 조용히 지나갔다
- [x] 큰 편집을 워커에 묶음 부호화로 보내기(79차): 작업 256개 이상이면 codec.ts로 묶어 버퍼를 옮긴다. 3만 개 MOVE 메인 직렬화 306 → 185ms, 워커 역직렬화 약 460 → 61ms(Node)
- [x] 연관 도면 MOVE의 문서 적용(핸들 색인)과 연관 배열 따라가기 고리(86차): 다시 만든 치수 블록 객체가 옛 핸들을 물려받아 MOVE 한 번에 색인 작업 18만 번과
  `$HANDSEED` 9만 증가가 없어졌고, 배열이 없는 도면은 확정마다 바뀐 객체를 모으지 않는다(Node, 66차 도면 전체 MOVE 적용 96 → 80ms, 앱 고리를 단 확정 202 → 159ms)
- [x] 연관 도면 MOVE의 확정 고리(87차): 구속 그룹이 없는 도면은 그룹 캐시 반영을 건너뛰고, 반응자가 그대로인 바꾸기는 반응자 비교를 건너뛰며, 같은 핸들의 바꾸기는
  소유 블록을 다시 기억하지 않고, 정규화한 핸들은 `normalizeHandle`이 그대로 돌려준다(Node, 66차 도면 전체 MOVE 확정 158 → 136ms)
- [x] 객체 하나씩 그리는 고르기 형상의 고정비(88차): 표시 목록 빌더를 작게 시작해 3만 개 선택의 명령 미리보기 약 1.9 → 0.32초, COPY 뒤 선택 강조 215 → 43ms(Node)
- [x] 워커 전송 부호화의 모양 찾기(89차): 속성 자리·배열 안의 객체는 그 자리에서 지난번에 쓴 모양부터 맞춰 보고(맞으면 모양 찾기를 건너뛴다),
  자리 문자열은 바로 앞과 같으면 표를 찾지 않는다. 결과는 바이트까지 같고 66차 도면 전체 MOVE의 부호화가 약 9% 준다(Node CPU 시간 가운데 값 181 → 167ms)
- [x] 편집 객체 복사를 구조화 복제 대신 바로(97차): 앱처럼 받은 문서로 연관 도면 MOVE를 다시 재니 명령 단계(변환·연관 따라가기·치수 블록 다시 만들기·확정)가
  가장 컸고 그 안에서 한 줄로 가장 큰 몫이 `cloneEntity`의 `structuredClone`(약 20%)이었다. 일반 객체·배열·형식 배열만 바로 복사하고(원본 숨은 클래스를 이어받는 펼치기),
  그 밖의 값이 있으면 값 전체를 예전처럼 복사한다. 66차 도면 전체 MOVE 명령 628 → 512ms, COPY 556 → 417ms(Node CPU)
- [x] 워커 전송 부호화의 짐작 맞춤(97차): 짐작한 모양이 맞으면 이름을 모으지 않고, 수 태그는 한 번에 쓴다. 바이트 그대로, MOVE 부호화 약 6%·문서 보내기 약 7% 준다
- [x] 워커도 묶음 부호화한 편집을 다 풀면 받은 버퍼를 바로 놓아 주기(97차, 96차 메인 받기와 같은 방식)
- [x] 연관 도면 MOVE·COPY 명령 단계의 다음 몫(98차): 새 핸들은 지난번에 적은 씨앗 글자를 그대로 쓰고(16진 바꾸기 세 번 → 한 번), 연관 따라가기는 변환을 알 때
  편집 전 스냅 점을 만들지 않고 DIMASSOC 기록을 한 번만 풀며, 해치·치수 변환은 곧 새로 쓰는 칸(경계·무늬 선·정의점)을 복사하지 않는다. 편집 결과 지문 그대로,
  66차 도면 전체 MOVE 명령 500 → 479ms·COPY 433 → 382ms(Node CPU, 가장 작은 값), MOVE의 객체 변환 64 → 39ms
- [x] 편집 명령의 구조화 복제 가운데 시간이 보인 곳(98차): 큰 실제 도면 8개에서 편집 훑기 명령 19가지를 프로필해 보인 두 곳(FLATTEN 객체 복사 약 26%,
  EXPLODE 조각의 확장 자료 복사 약 11%)만 `cloneData`로. 나머지 자리는 그 명령들에서 시간이 보이지 않아 그대로 두었다
- [ ] 연관 도면의 COPY·MOVE에 남은 몫(Node, 98차에 다시 잼): 명령 단계 MOVE 약 480ms·COPY 약 390ms(COPY의 새 핸들 겹침 확인 약 16%는 100차에 없앴다 —
  아래 새 핸들 항목), 세션 첫 편집과 명령 취소·다시 하기 뒤의
  소유 블록 표 만들기(약 8% — 블록 정의 안 객체까지 모두 훑는다), 연관 따라가기 약 18%, 치수 블록 다시 만들기 약 14%, GC 약 7%, 덧그림의 객체 그리기(약 200ms — 89차 프로필로는
  표시 목록 마감 약 12%, 해치 무늬·삼각분할 약 7%, 객체마다 새로 잡는 단위 행렬 약 4%, 주석 축척 표 찾기 약 4%), MOVE의 워커 전송(부호화 약 155ms — 바이트를 지키며
  줄일 몫은 거의 남지 않았다. 배열 안 핸들 문자열 4만 개와 자리 문자열 21만 번의 문자열 표 찾기, 객체마다 얼림·원형 확인. 더 줄이려면 형식을 바꿔야 한다,
  `packOps` 약 20ms, 보내기의 문자열 표 복제 약 22ms), 미리보기에 남은 호출마다의 마감(버퍼 잘라 내기, 약 0.3초 가운데 절반),
  문서 적용(핸들 색인, 약 70~100ms), 확정 고리의 주석 축척(약 14ms)·반응자 비교(약 9.5ms)·경로 배열 후보 찾기(약 8ms)·지시선 연관(약 6ms).
  125차에 다시 잼(같은 하네스, 반복 3): 명령 MOVE 451ms·COPY 299ms(가장 작은 값), MOVE 덧그림 204ms·부호화 157ms·확정 64ms. 프로필이 고르게 퍼져
  (계획 자기 시간 9.4%, GC 8.4%, 연관 따라가기 7%, 핸들 색인 넣기 4.4%, 치수 블록 4%) 한 곳을 고쳐 얻을 몫이 작아 고르지 않았다
- [ ] 편집이 쓰는 다른 `structuredClone`(소스 약 164곳 — 치수 옮기기·동적 블록·표 등)도 `cloneData`로 바꿀 수 있다. 98차 프로필(편집 훑기 명령 19가지)에서는
  시간이 보이지 않았다. 다른 명령에서 보이면 자리마다 넘기는 값(Map 등)과 같은 객체 공유에 기대는지 보고 바꾼다
- [x] 큰 도면 EXPLODE·명령 취소(99차): 확정이 지우기마다 `splice`해 블록 길이 × 지운 수만큼 옮겼다(객체 42만 개 도면에서 명령의 87.7%). 같은 블록에 이어진
  지우기·넣기를 한 번 훑어 함께 하고(하나씩 한 것과 같은 결과, 워커 적용도 같은 길), 새 핸들의 다음 씨앗은 글자로 하나 늘린다.
  그리스 우수관망 EXPLODE 명령 약 31초 → 3.2~3.8초, 명령 취소 약 28초 → 약 1초, 다시 하기 약 29초 → 0.6~0.7초, 같은 편집의 워커 적용 86~93초 → 약 3초(Node).
  블록 펼치기는 0.4%뿐이라 펼침 다시 쓰기는 하지 않았다
- [x] `-OVERKILL` 중복 찾기(99차): 첫 수가 같은 묶음(폴리선의 첫 볼록도 0)에서 객체 쌍을 모두 견주던 것을, 값이 가장 여러 가지인 수 자리로 줄 세운 후보만 견준다
  (같은 쌍을 같은 차례로). 객체 7,483개 실제 도면 1.8~1.9초 → 약 70ms, 실제 도면 40개를 제자리·공차 안·공차 밖으로 COPY한 뒤의 -OVERKILL 합 26.0 → 2.2초
- [x] 새 핸들의 겹침 확인(100차): 받은 문서의 핸들 색인·사전 객체 색인(`HandleIndex`)이 넣은 열쇠 가운데 (길이, 글자 차례)로 가장 큰 것을 기억해,
  씨앗이 그보다 크면 이미 쓰인 핸들인지 찾지 않는다(세션 밖에서 넣어도 `set`을 지나 기억이 따라간다 — 98차가 멈춘 까닭). 같은 핸들·같은 `$HANDSEED`를 낸다.
  색인 42만 개 문서에서 새 핸들 124만 번 518 → 65ms(같은 프로세스), 연관 도면 COPY 명령 약 345~416 → 309~371ms
- [x] 큰 확정 뒤 소유 블록 찾기(103차): 확정이 넣은 객체마다 소유 블록을 적지 않고 넣은 블록만 미뤄 두며, 블록마다 "줄어드는 차례의 지우기 → 끝에 넣기"면
  지운 옛 자리·끝에 넣은 범위를 남겨 다음 명령이 밀린 자리를 옮겨 찾는다(못 찾으면 그 블록의 자리 표, 전체 표는 다시 만들지 않는다. 답은 늘 블록에서 확인).
  표를 만들 때 핸들이 겹친 문서는 102차 방법 그대로. 객체 42만 개 도면 EXPLODE + ERASE 2,000개 약 3.4~3.5 → 2.3~2.4초(ERASE 0.7~0.76초 → 약 20ms)
- [x] 큰 도면 EXPLODE의 폴리선 분해 조각(106차): 조각(LINE·ARC) 124만 개를 스프레드(`{ type, ...inherit(src), … }`) 대신 같은 속성 차례로 글자 그대로 만들고
  (`lineFrom`·`arcFrom`), LWPOLYLINE 정점을 객체로 풀지 않음. 확정 계획은 연관 기록이 없거나 사용자가 바꾼 객체가 없으면 지운 핸들 표 둘을 만들지 않고,
  잠긴 도면층 빼기는 도면층마다 한 번만 찾음. 객체 42만 개 도면 EXPLODE의 CPU 시간이 같은 프로세스 번갈아 19쌍 모두 줄고 쌍마다 비 가운데 0.84(약 −16%)
- [ ] 큰 도면 EXPLODE에 남은 몫(106차): 적용·확정 계획의 객체마다 일, GC, 블록 참조 펼치기.
  화면 덧그림·다시 그리기도 재 볼 것(명령 첫 소유 블록 표는 108차에 줄임).
  125차에 다시 잼(객체 42만 개 도면, 한 쌍): EXPLODE CPU 1,838·1,769ms, 다음 MOVE 2,000개 19ms. 프로필은 핸들 색인 넣기 21.2%(아래 항목 — 바꾸지 않기로 한 것),
  GC 11%, 확정 계획 자기 시간 8.8%, 적용의 넣기 8.2%, 새 객체 준비 4.9%이고, 같은 핸들을 명령·잠긴 도면층 빼기·확정 계획이 세 번 찾는 몫이 약 130ms다
- [ ] 핸들 색인 넣기(111차에 재고 바꾸지 않음): 객체 42만 개 도면 EXPLODE(새 열쇠 123만 5,850개)에서 명령 CPU 1,877ms 가운데 `HandleIndex.set` 자기 시간이 400ms(21.3%)로 한 함수로는 가장 크다.
  실제 열쇠로 번갈아 9번 잰 넣기 중앙값: `HandleIndex` 370ms, 일반 `Map` 306ms, 수 열쇠 `Map` 236ms, 수 열쇠 열린 주소 표 85ms(미리 크기)·110ms(넣은 차례 보존·두 배씩 키우기). 찾기는 90·91·113·97·83ms, 메모리(Node)는 `Map` 꼴 56MiB, 표 48·39MiB.
  슈퍼 호출은 비용이 없고 `top` 기억이 약 60ms다. `top`을 수로 기억하면 글자 풀기 때문에 오히려 느렸다(부하 낮은 판 410~445 → 434~526ms). `Map`에는 미리 크기를 잡는 길이 없다.
  표로 바꾸면 EXPLODE 약 14%·색인 메모리 약 30%를 줄일 수 있지만 `Map`의 내용을 쓰지 않게 되어 구조화 복제가 빈 `Map`이 되므로 문서 복제 자리·전체 훑기 21곳·찾기 430곳·워커 받기를 모두 확인해야 한다. 객체 수십만 개를 한 번에 넣는 편집에서만 보여 하지 않았다
  112차 설계(넣지 않음): 표를 `Map`의 자식이 아니라 `Map` 모양을 구현한 클래스(`implements Map`)로 두면 타입과 찾기·넣기·훑기 호출을 고치지 않아도 되고, 구조화 복제에 잘못 들어가면 메서드가 없어 곧 오류가 나서 빈 색인이 조용히 쓰이지 않는다.
  되살릴 자리는 문서 전체 복제(저장 `save.ts`·배치 템플릿 `layoutcmds-file.ts` — `structuredClone(문서)` 2곳)와 워커 받기(`doctransfer.ts`의 `ownIndexes`) 3곳이다. 다만 도면 크기 훑기(`entityIndex`·`objects`의 전체 훑기 약 70곳)는 Map의 산 반복기(돌다 지우거나 넣어도 이어지는) 뜻을 지켜야 하므로
  표의 항목 배열을 훑는 중에 압축하지 않고(지워도 묘비만 남기고, 크기 키울 때도 항목 배열 차례 유지), 열쇠 수 42만 + 넣기 123만 EXPLODE에서 넣는 쪽만 줄어 전체 효과는 14%다 — 큰 도면 전용 이득이라 위험과 견주어 넣지 않았다. 넣게 되면 시험은 빈 색인(복제 뒤)·지우며 돌기·넣으며 돌기·정규형이 아닌 핸들 차례·워커 왕복을 묶는다
- [x] 명령 첫 소유 블록 표(108차): 소유 블록 찾기 빠른 길의 기억을 Map 둘에서 수로 바꾼 핸들의 형식 배열 표 하나(`OwnerMemo` — 정규형이 아닌 핸들만 Map)로 바꾸고,
  명령 취소·다시 뒤에도 버리지 않고 고친다(옛 길은 전처럼). 객체 42만 개 도면에서 표 만들기 CPU 158~171 → 52~59ms,
  첫 명령 MOVE 2,000개 170~220 → 68~109ms, ERASE 2,000개 CPU 154~173 → 68~83ms, MOVE 뒤 명령 취소하고 다시 MOVE 2,000개 132~179 → 10~13ms,
  EXPLODE 뒤 명령 취소하고 MOVE 2,000개 134~144 → 13~17ms(같은 프로세스 번갈아). 남은 몫은 핸들 글자 읽기(약 25~30ms — 객체마다 핸들 문자열을 한 번 읽는다)
- [x] 큰 블록에서 바꾸기 확정의 자리 표(107차): 확정 계획이 소유 블록을 찾으며 확인한 자리를 바꾸기 변경에 짐작(`index`)으로 달고, 적용은 그 자리의 핸들이
  같으면 블록 전체의 핸들 표(`EntityFinder`)를 만들지 않는다(되돌리기·워커도 같은 자리). 객체 42만 개 도면 EXPLODE 뒤 MOVE 2,000개 433~530 → 17~26ms,
  EXPLODE 없이 MOVE 2,000개 244~323 → 172~224ms(같은 프로세스 번갈아 — 남은 몫은 명령 첫 소유 블록 표). ERASE·COPY는 그대로.
  106차 조각 뒤 이 MOVE가 약 6% 느렸던 까닭은 V8의 할당 자리 미리 옛 세대 두기(pretenuring)에 따른 조각 객체의 메모리 배치였다
  (숨은 꼴 수는 같고, 끄면 두 판의 핸들 훑기가 같아짐). 이제 MOVE는 그 표를 만들지 않는다
- [x] 다른 바꾸기 길의 자리 짐작(108차): CHPROP·CHANGE(특성·점)·특성 팔레트·MATCHPROP·FIND 바꾸기·SETBYLAYER도 `ownerOf`가 확인한 자리를 바꾸기 변경에 단다
  (`EditSession.hinted`). 객체 42만 개 도면에서 CHPROP 색 2,000개 148~167 → 63~74ms(107차 판과는 196~233 → 56~63ms), 전체 871~948 → 765~774ms,
  특성 팔레트 색 2,000개 159~202 → 75~88ms, 전체 2,949~3,026 → 2,728~2,902ms(같은 프로세스 번갈아, 문서·명령 취소·워커 같음)
- [x] 블록을 훑으며 바꾸는 길의 자리 짐작(108차에 남은 것, 109차): 이름 바꾸기(다섯 종류)·도면층 관리자·LAYMRG·LAYMCH·LAYCUR·도면층 변환기·SETBYLAYER 블록 정의 안·
  문자/치수 스타일 대화 상자·치수 다시 만들기·CONVERTPSTYLES가 훑은 자리를 단다(`EditSession.scanHints` — 핸들이 겹친 문서는 짐작 없이, 판정은 바꿀 객체가 있을 때만).
  객체 42만 개 도면에서 도면층 관리자 이름 바꾸기(객체 15만 9,265개) 458~596 → 368~557ms·명령 취소 297~455 → 170~188ms, LAYMRG 352~373 → 273~286ms,
  도면층 변환기 1,031~1,109 → 926~973ms, LAYCUR 2,000개의 명령 취소 106~141 → 2~86ms(같은 프로세스 번갈아, 문서·명령 취소·워커 같음).
  -RENAME이 바꿀 객체 약 12만 개를 넘으면 스택 넘침으로 죽던 것도 고침(`pushAll`)
- [x] 이름 바꾸기 변경의 깊은 복사(109차에 남은 것, 110차): RENAME·-RENAME(다섯 종류)·도면층 관리자·문자/치수 스타일 대화 상자 이름 바꾸기·도면층 변환기·SETBYLAYER가
  원본에서 먼저 보고 바꿀 객체만 얕은 사본(바뀌는 칸만 새 객체, 원본 본문은 `dropRawCopy`로 전처럼 뺌)으로 만든다. 객체 42만 개 도면에서
  -RENAME 도면층 513~571 → 285~352ms(변경 만들기 CPU 291~314 → 82~92ms), 도면층 관리자 361~420 → 309~342ms, 도면층 변환기 904~956 → 371~402ms,
  쓰지 않는 문자 스타일의 대화 상자 이름 바꾸기 1,321~1,410 → 21~25ms, SETBYLAYER 모형 공간 전체 608~624 → 371~514ms(같은 프로세스 번갈아, 문서·명령 취소·워커 같음)
- [ ] 첫 명령이 작은 이름 바꾸기면 소유 블록 표(객체 42만 개 약 50~70ms)를 앞당겨 만든다(109차 — 다음 편집 명령은 그 표를 쓴다).
  표 만들기 몫(110차에 다시 잼): 핸들 읽기만 11ms, 수 열쇠 만들기까지 29ms, 전체 72ms — 표의 세 배열을 하나로 엮어도 67ms라 남은 몫은 흩어진 메모리 접근이다
- [ ] 명령 밖의 워커 전송 부호화(100차에 다시 잼, 큰 도면 EXPLODE 변경 138만 개 — 객체 602만 개, 바이트 약 1억 6,850만, 약 0.75~0.8초): 99차 프로필의 "칸 값 쓰기 74%"는
  되부르기를 포함한 시간이었고, 자기 시간은 객체 하나 약 120ns로 고르게 퍼져 있다(모양별 쓰기 함수 약 32%, 객체 기록 약 25%, 자리 문자열 약 14%, 마감 복사 약 7%).
  쓰기 함수 안에서 객체 칸을 바로 보내는 판은 빨라지지 않았다. 더 줄이려면 형식을 바꿔야 한다(점 {x, y, z} 231만 개를 수 배열로 등 — 워커 풀기도 함께)
- [x] 지우거나 분해한 치수의 `*D` 블록(114차): 문서에는 명령 취소·OOPS를 위해 남기고, 저장할 때 이 세션에서 지운 치수의 블록 가운데 객체도 주석 축척 치수 레코드(DXF 2)도 쓰지 않는 것만 뺀다.
  표본 치수 8개를 모두 지운 저장의 `*D` 8 → 0, DXF 97,895 → 85,173바이트, DWG 16,940 → 14,188바이트
- [ ] 파일에서 온 쓰이지 않는 `*D`는 그대로 쓴다(114차에 실제 도면 840개를 잼): `*D` 8,361개 가운데 치수 레코드만 쓰는 것 1,253개(71차에 짐작만 했던 몫), 어디서도 쓰지 않는 것 98개(8개 도면).
  98개를 어느 프로그램이 왜 남겼는지 알 수 없어 이름만 보고 빼지 않는다
- [x] 지운 치수의 확장 사전·주석 축척 레코드와 블록 정의 안 치수의 `*D`(115차): 저장할 때 아직 지워진 채인 치수가 소유한 객체를 빼고 그 레코드만 쓰던 `*D`도 뺀다(DXF 쓰기만 빼고 DWG 쓰기는 소유자 없는 사전·레코드를 그대로 썼다).
  실제 도면 476개에서 치수 3,441개를 지운 저장: 빠지는 `*D` 1,124 → 3,418개(후보 전부), DWG의 치수 레코드 5,951 → 3,067개(DXF와 같은 수). 소거할 블록에 치수가 든 도면 29개: 빠지는 `*D` 169 → 412개. 끊긴 참조·다른 블록 차이 0
- [x] 객체를 뺐는데 DWG가 커지는 파일(116차에 잼 — 형식상 정상, 고치지 않음): 115차 저장 비교에서 객체를 더 뺀 쪽이 커진 DWG 54개(476개 가운데 — 115차 53개, 헤더에 저장 시각이 없는 파일은 쓸 때마다 시각이 달라 32바이트 경계 파일 하나가 오간다)를
  섹션·객체마다 견줬다. 커진 것은 AcDbObjects의 압축 쪽뿐이다(합 +77,600바이트, Handles −3,264, 나머지 섹션·쪽 지도 합 −256). 풀린 객체 자료는 54개 모두 줄었고(합 −220,625바이트, 뺀 객체 3,537개),
  남은 객체는 바이트가 같거나 작아졌다(바뀐 206개 합 −1,324 — 지운 DIMASSOC를 가리키던 반응자). R2004 이후 형식은 객체 자료를 0x7400바이트 쪽마다 따로 압축하는데,
  객체를 빼면 뒤 내용이 모두 앞으로 밀려 쪽마다 압축 결과가 달라진다. 나눠 재면 같은 정렬에서 뺀 효과는 54개 모두 줄어듦(합 −101,206, 중앙값 −1,669)이고 쪽 경계가 밀린 효과가 합 +179,147(중앙값 +3,243, 최대 +10,205)이다.
  같은 54개를 쪽 나누기 없이 한 덩어리로 압축하면 모두 작아진다(합 −111,452). 객체 자료 앞에 0을 32~12,345바이트 붙여 경계만 밀어 보면 차이가 −11,562 ~ +7,144바이트(표준 편차 2,478)라,
  몇 KB만 빠지는 파일에서는 이 흔들림이 이득보다 크다. 쪽 크기는 형식이 정하고(섹션 지도의 최대 크기 0x7400) 압축은 쪽마다 처음부터 시작하므로 쓰기 쪽에서 피할 길이 없다
  (압축기 — 3바이트 해시 하나로 바로 앞 자리만 찾는 탐욕 방식 — 를 바꾸는 것은 재지 않았다)
- [x] 큰 도면의 DWG 저장 시간(125차): 실제 도면 841개 훑기에서 DWG R2018 저장 합이 읽기의 3배(210.5 ↔ 70.1초)였고, 객체 92만 개 도면의 R2018 저장은 GC가 55%였다.
  R2004 이상은 객체 자료를 0x7400바이트 쪽마다 압축하는데 압축기가 부를 때마다 해시 표·출력 버퍼·(길이, 거리) 객체 목록을 새로 만들고 쓰기가 쪽마다 사본을 만들어
  바깥 메모리가 오가는 만큼 V8이 큰 GC를 앞당겼다. 압축기 버퍼를 다시 쓰고 찾는 대로 내보내며, 가득 찬 쪽은 뷰로, 쓴 객체는 `Map` 대신 넣은 차례의 두 배열(`ObjectStore`)에,
  객체 자료·R2000 파일 버퍼는 크기를 미리 잡는다. 쓰는 바이트는 그대로(841개 × DWG 다섯 판 4,200개 sha256 같음). 같은 프로세스 번갈아 CPU:
  92만 개 도면 R2018 40.1 → 14.2초(큰 GC 39 → 7번)·R2000 19.5 → 11.6초, 841개 합 R2018 131.3 → 84.2초·R2000 71.8 → 50.0초, 최대 RSS 6.2 → 4.7GiB
- [x] DWG 저장의 쓰기 계획·정점마다 이름 찾기, DXF 저장의 새 핸들(126차): 객체 696만 개 도면의 DWG R2018 저장(15.6초)에서 계획의 핸들 `Set` 줄과 저장 끝 묻기 줄이
  18.5%, 정점마다 이름을 대문자로 바꿔 찾기가 5.7%(그 87%가 정점·SEQEND), 같은 도면 DXF R2018 저장에서 새 핸들을 `BigInt`·16진 문자열 `Set`으로 세기가 20.6%였다.
  쓴 핸들·쓸 객체는 비트 표 핸들 값 모음(`src/core/handleset.ts`)에, 정점·SEQEND 공통 자료는 폴리선마다 한 번, 쓴 객체는 조밀하면 자리 표로 꺼내고,
  DXF는 정규 꼴 13자 이하 핸들을 값으로, 2^52 위 새 핸들은 기준과의 차로 센다. 쓰는 바이트·경고는 그대로(841개 × DWG 다섯 판 4,200개, DXF 네 판·R2018 이진 4,200개 sha256·경고 같음).
  같은 프로세스 번갈아 CPU: 에스토니아 건물 DWG R2018 15.4 → 11.3초·R2000 12.0 → 7.5초·DXF R2018 16.6 → 13.0초, 841개 합 DWG R2018 82.5 → 70.1초·DXF R2018 66.9 → 58.0초
- [ ] DWG·DXF 저장에 남은 몫(126차 프로필): DWG(에스토니아 건물 R2018 10.9초) GC 24.6%, 압축 18.5%(자기 시간), 객체 하나 마치기 11.3%(객체마다 바이트 배열 사본 —
  없애려면 객체를 한 버퍼에 바로 쓰도록 쓰기 틀을 바꿔야 하고 R2000 다시 쓰기와 얽힌다), 객체 지도 3.6%.
  DXF(같은 도면 R2018 13.9초) 실수 표기(`String(v)`) 14.4%, 조각 잇기(`join`) 13.3%, GC 11.9%, UTF-8 바꾸기 7.3%, 2^52 위 16진 만들기 4.8% — 앞의 셋은 바이트를 그대로 두고 줄일 길이 작다
- [x] DWG 도면 열기(읽기) 시간(127차): 워커의 여는 차례를 나눠 재니 큰 도면은 첫 조각까지의 대부분이 읽기였다(객체 92만 7천 개 R12 도면 읽기 9.0초 · 첫 조각 12.8초,
  객체 지도 302만 개 R2013 도면 7.3초 · 8.3초). 객체 CRC를 8바이트씩 표로, R2004 계열 압축 풀기를 닫힘 없이, 객체 지도·종류·읽은 도형을 핸들 자리 표(`src/core/handlemap.ts`)에,
  원본 본문 지문은 바꾸개가 바꿀 값이 없으면 바꾸개 없이, R12는 태그를 레코드마다가 아니라 묶어 넘기고 머리 읽기의 닫힘을 없앴다. 읽은 문서는 그대로(841개 깊은 지문 같음).
  같은 프로세스 번갈아 읽기 CPU: 92만 7천 개 R12 도면 8,294 → 4,260ms, 302만 개 R2013 도면 6,339 → 4,270ms, 42만 개 R2007 도면 1,546 → 1,199ms,
  10MB 아래 실제 도면 820개 합 28.1 → 20.4초, R12 46개 합 16.9 → 11.2초(킬 지도 R2007은 2~5%). 첫 조각까지 12.8 → 5.4초·8.3 → 6.6초
- [x] DXF 리더(R12 DWG도 같은 길)와 ASCII DXF 토큰화(128차): 실제 도면 841개를 워커의 여는 차례로 판마다·단계마다 나눠 재니 첫 조각까지의 83%가 읽기였다
  (127차 병합 판 CPU 합 — 읽기 42.2초·장면 12.0초·보내기 16.4초·받기 17.7초, R12 46개 읽기 13.8초). R12 DWG와 DXF가 지나는 DXF 리더의 공통 속성을
  `{ type, ...entityDefaults() }` 펼치기 대신 같은 차례의 객체 글로 만들고, 정점은 공통 속성 객체·태그 배열 없이 한 번 훑어 읽으며,
  ASCII DXF 토큰화기는 흔한 그룹 코드 줄·실수 줄을 줄 끝 찾기와 함께 푼다. 읽은 문서는 그대로(841개·DXF 사본 184개 깊은 지문 같음).
  같은 프로세스 번갈아 읽기 CPU: 92만 7천 개 R12 도면 4,132 → 2,382ms, R12 46개 합 10.8 → 8.8초, 큰 DXF 사본 2개 3,062 → 2,622ms, DXF 사본 182개 합 3,402 → 3,108ms
- [x] 문서 보내기·받기의 비도형 객체(129차): R2018 표본 51개의 문서 껍데기 구조화 복제 1,497ms 가운데 비도형 객체(토목 프로그램 사용자 객체와 원본 본문 — 바이트 배열 94만 개)가
  1,210ms였다. 비도형 객체가 1,000개 이상이면 `codec`으로 부호화해 껍데기와 같은 메시지로 보내고 메인이 같은 차례로 되살린다. 배치 객체(`layout`이 `doc.layouts`와 같은 객체)는
  껍데기에 남기고, 부호화할 객체가 문서의 다른 곳이나 다른 비도형 객체와 같은 객체를 함께 쓰면 구조화 복제로 보낸다(메인 코드는 그대로 — 받은 문서 840개 깊은 지문 같음, NaN 부호 비트만 워커와 같게).
  같은 프로세스 번갈아(실제 도면 840개, 보내기 / 받기 CPU 합): 부호화한 411개 11,978 / 11,142 → 14,239 / 7,028ms, 840개 합 38,254 → 37,111ms(130차에 하한을 4,000개로 — 아래)
- [x] 비도형 객체 4천 개 아래 도면은 구조화 복제로(130차): 129차 하한 1,000개로는 1천~4천 개 도면 25개의 보내기·받기 합이 늘었다. 하한을 4,000개로 —
  그 25개 보내기 / 받기 CPU 합 734 / 411 → 514 / 477ms(다섯 쌍, 같은 코드 대조 25개 926 / 456 · 903 / 455ms), 받은 문서·저장 바이트·편집 지문 같음
- [ ] 문서 보내기의 비도형 객체 부호화가 V8 직렬화보다 무겁다(129차, 130차에 다시 잼): 부호화의 거의 절반이 같은 객체 지키기(`seen` `Set`에 넣기)다
  (실제 도면 36개 부호화 합 833ms, 지키기 없이 439ms). `Set`이 커질수록 넣기가 비싸(비도형 객체 4만 7천 개 도면 부호화 96 → 지키기 없이 33ms) 큰 도면에서 더 크다.
  결과를 바꾸지 않는 줄이기 — `has` 뒤 `add` 대신 `add` 한 번과 크기 비교, 껍데기 나머지를 `Set` 대신 배열로 모아 끝에 `has`로 견주기 — 는 잡음 안이었고
  (뒤엣것은 같은 객체를 겹쳐 세어 4개가 부호화를 물렀다), 지키기를 빼면(36개 보내기 1,703 → 1,186ms, 128차 판 1,268ms) 비도형 객체끼리 함께 쓰는 객체를 놓친다
  (리더는 만들지 않지만 메인에서 만든 문서를 워커가 돌려줄 때는 있을 수 있음). 129차의 모양별 함수 다시 쓰기·맨 위 짐작·바이트 배열 지름길도 빨라지지 않았다.
  남은 길은 지키기를 워커가 메시지를 보낸 뒤 메인 풀기와 겹쳐 하는 것(같은 객체가 나오면 고쳐 보내기 — 주고받기 바꿈)이다
- [ ] DWG·DXF 열기에 남은 몫(127·128차 프로필): 작은 도면 820개(127차 바꾼 뒤 읽기 20.8초) R2004 계열 풀기 13.5%, GC 10.6%, 원본 본문 사본 8.4%, 지문 8.4%, `crc8` 5.3%.
  R12 큰 도면(128차 바꾼 뒤 2.5초)은 R12 바이트 풀기 25.3%·레코드 잇기 14.0%·GC 11.8%·핸들 색인 넣기 9.8%, DXF 사본(2.9초)은 토큰화기 25.8%·짧은 글 만들기 24.8%.
  R2007 컨테이너 읽기(그리스 우수관망 391ms — RS 블록 풀기 53%·압축 풀기 40%)는 닫힘 없애기·자리 더하기로 줄지 않았다(128차 시도).
  장면은 글자 배치(그리스 33.8%)·그리기 순서 정렬(14.3% — `BigInt`를 수로 바꿔도 15%만 줄고 문자열 `Map`이 남는다)·묶음 버퍼(에스토니아 9.1%)·블록 참조 행렬(체코 19%),
  문서 보내기·받기는 129차에 비도형 객체를 묶음 부호화로 바꿨다(위). 큰 도형 도면은 큰 블록 묶음의 부호화·풀기가 그대로 남는다(128차에 잰 R12 46개 보내기 4.9초·받기 5.8초)
- [x] MATCHPROP으로 치수 스타일·재지정 옮기기(71차): 치수 블록을 다시 그리고 DSTYLE 확장 자료도 맞춘다(전에는 옛 그림이 남고 DWG에 옛 재지정이 되살아났다)
- [x] MATCHPROP으로 표 스타일 옮기기(72차): 표 그림 블록(`*T`)을 새 스타일로 다시 만든다(전에는 옛 그림이 남았다)
- [x] 편집 직후의 ZOOM 범위·전체가 옛 장면 범위를 쓰지 않게 하기(45차): 미뤄 둔 다시 그리기를 먼저 끝낸다
- [x] 편집 직후의 모두 선택과 메뉴·단추의 전체 보기(46차): 지우고 되돌린 직후 0개를 고르던 결함을 고쳤다
- [x] 가운데 버튼 두 번 누르기의 전체 보기도 다시 그리기를 기다리기(57차): 뷰가 앱의 전체 보기(`zoomToExtents`)를 불러 미뤄 둔 다시 그리기를 먼저 끝낸다
- [x] 파일 크기의 제곱으로 느려지는 자리: 해치 고리 수의 제곱과 무늬 선 수 × 변 수(61차), DWG 블록 목록이 같은 도형을 되풀이해 가리키는 파일(62차 — 처음 한 번만 넣고 알린다.
  정점 6,000개 폴리선을 6,000번 가리킨 DWG 95KB가 읽기 1.7초·장면 2.9초·선분 3,599만 개에서 0.04초·객체 1개로)
- [x] 무늬 선마다 모든 변의 선 번호 범위를 구하는 일(무늬 선 수 × 변 수) — 86차에 재 보니 고칠 만큼 크지 않아 그대로 둔다: 실제 도면 50개의 무늬 해치 1,655개 무늬 자르기가 모두 합쳐 151ms,
  가장 무거운 해치가 4.5ms(GRAVEL 무늬 선 41개 × 변 851개)다. 합성 경계(변 5만 개)에서도 시간은 만드는 선분 수(약 60만 개)에 비례하고,
  무늬 선 하나의 준비(선 번호 범위 + 계수 정렬)는 변 5만 개에 약 0.9ms다. 기본 무늬는 무늬 선이 많아야 25개(GRAVEL, 방향 19개)라 같은 방향끼리 나눠 쓸 몫도 작다
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
- [x] 편집 명령 불변식 훑기 도구(`npm run edit-audit`, 74차): 실제 도면마다 MOVE·COPY·ROTATE·MIRROR·EXPLODE·ERASE+OOPS 뒤 쓰이지 않는 익명 블록·블록 밖 색인·
  왕복 손실·명령 취소를 본다(69·71·72차 결함을 찾은 점검). 실제 도면 40개에서 찾은 표 대칭 뒤 남던 *T 블록도 고쳤다
- [x] 편집 훑기를 명령 19가지와 핸들 중복·소유자·색인 점검으로 넓히기(75차): 연관 배열이 복사한 치수 블록에 핸들·블록 레코드가 없던 것을 고쳤다
- [x] 배치(도면 공간)에서도 편집 훑기(76차, `--space`): 실제 도면 22개 배치에서 명령 418회 문제 0
- [x] 훑기 도구로 569MB 킬 지도 훑기(67차): 원본 요약(객체 290만 개)이 힙 5.2GiB였다. 요약을 V8 직렬화 덩어리(힙 밖 1.9GiB)에 두고 다시 읽은 문서는 요약을 쌓지 않고 견주어,
  힙이 가장 많을 때 2.8GiB로 끝까지 훑는다(22.6분). DXF R2018·DWG R2018·R2004 왕복은 필드 차이 없음, R2000 DWG는 트루컬러 3개(형식에 자리가 없다 — 56차에도 18개 파일)
- [x] 도면 841개 ezdxf 대조 훑기(68차): 숨긴 사용자 객체(시애틀 도면 틀의 숨긴 RTEXT, 276개 파일)를 그림으로 옮겨 쓸 때 조각이 보이던 것을 숨긴 채로.
  남은 대조 차이는 설계대로(그림 조각과 그 색, ACIS → 모서리 선, 블록 없는 치수의 `*D` 블록, 그림 없는 사용자 객체·DWG OLE 빼고 알리기)이거나
  비교·ezdxf 쪽 표현(소수 6자리 반올림의 반 값, LEADER 법선, ACAD_TABLE 선종류, 캐럿 표기, R12 MVIEW 뷰 높이, 핸들 없는 R11)이다
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
  저장하면 단 객체와 확장 자료가 그대로 남는다
- [x] 여러 단 MTEXT 묶음 마무리(2026-11-06, 90차): 복사·붙여넣기·배열·회전·축척 복사·분해한 사본도 새 단끼리 이은 묶음(단 위치가 첫 단에서 단 폭 + 간격씩일 때),
  R2018로 저장하면 첫 단 자리의 한 객체로 합치고 R2013 이하로 저장하면 단 정보 확장 자료와 단 객체로 나눈다(AutoCAD가 같은 도면을 R2018·R2007로 쓴 짝 24개 객체와 같다),
  묶음 그립(위치·단 폭·간격·높이, 수동 높이는 단마다)과 묶음 전체의 제자리 편집(글이 단 사이로 흐른다), 화면에서 단을 단 폭으로 줄 바꾸기
- [x] 글자를 읽을 수 있게 두는 대칭을 묶음 전체 상자로(113차): 묶음의 모든 단을 고르고 배치가 맞으면 단 폭으로 잰 묶음 전체 상자를 거울상 자리에 둔다 — 단 차례가 그대로이고,
  다른 단이 묶음 상자 밖으로 나가지 않고, R2018로 합친 자리가 객체 하나를 대칭한 자리와 같으며(예전에는 첫 단 41이 전체 폭이 아닐 때 어긋났다), 대칭 복사본도 새 단끼리 이어진다(MIRROR·그립 대칭·ALIGN). 일부만 고른 묶음과 배치가 어긋난 묶음은 예전처럼 제 상자.
  실제 도면 841개에는 R2000~R2013 꼴 묶음이 없고 R2018 꼴 단 자료 1,714개도 모두 단 수 1 이하라 합성으로만 확인했다
- [ ] 여러 단 MTEXT 남은 것: 흐름 거꾸로·왼쪽 위가 아닌 부착점의 단 배치(근거가 없어 R2013 이하로는 단 정보를 빼고 쓴다), 묶음 { } 안이나 묶음 밖 서식 뒤의 문단을 단 객체로 나누기(AutoCAD가 어떻게 나누는지 근거 필요),
  R2013 이하 꼴 묶음을 화면에서 AutoCAD 2010+처럼 한 객체로 흘려 그리기(단 사이로 넘어가는 문단), 자동 높이 동적 단의 단 수를 화면 글꼴로 세기
- [x] 언어 사전의 오역(101차): STEP 56차 금지 낱말 짝 후보 389줄 판정(맞음 167·오역 205·용어 17)과 같은 꼴을 사전 전체에서 더 찾아 고침 —
  배치(layout)를 batch·placement·deployment로, 문자(text)를 character로, 치수·배열·축척·플롯·지시선·블록·해치의 동음이의, 이웃 줄로 밀린 번역, 바뀐 옵션 글자·명령 이름.
  바뀐 번역 영어 323·독일어 488·일본어 68·중국어 528개, 막는 시험(100차 사전 961곳 → 0곳)
- [x] 언어 사전의 부정·조건과 남은 용어(102차): 부정이 빠졌을 수 있는 줄 235 판정(맞음 193·다른 오역 함께 고침 37·뒤집힘 3·빠짐 2)과 같은 꼴을 사전 전체에서 더 찾아 고침 —
  끼어든 부정·"~이 아닙니다"를 "~일 수 없다"로 옮긴 것, 저장 경고의 쓰다(write)를 use로, 빠진 고를 글자, 플롯 안 함·현재 제외의 뒤집힘, 이웃 줄을 삼키거나 낱말을 잃은 번역,
  독일어 도면층 Ebene → Layer(성·격을 줄마다), 일본어 画層·중국어 图层 통일, 문자(TEXT)를 글자로 옮긴 곳, 중국어 치수 标注·尺寸线·尺寸界线, 1인칭.
  바뀐 번역 영어 166·독일어 496·일본어 118·중국어 410개, 막는 시험(101차 사전 1,139곳 → 0곳)
- [x] 프롬프트 괄호 짝과 중국어 옵션·용어(113차): 명령행이 읽는 [ ]·< > 짝이 깨진 번역 중국어 18줄·독일어 10줄, 영어로 남은 중국어 옵션 이름("Smelt(M)" 등), 플롯 绘图 → 打印, 도면 공간 → 图纸空间,
  솔리드 纯色 → 实体, 그대로 나오던 번역 틀 글. 바뀐 줄 중국어 93·독일어 10, 네 언어 괄호 짝과 중국어 옵션 영어 낱말·용어를 막는 시험(`tests/i18n-prompts.test.ts`)
- [x] 동음이의 자르기와 명령 취소(115차): 자르기를 TRIM(Trim·Stutzen·トリム·修剪)·CLIP(Clip·Zuschneiden·クリップ·反向剪裁)·CUTCLIP(Cut·Ausschneiden·切り取り·剪切)·다중선 절단(MLEDIT 도구 이름)으로 나누고,
  EXTRIM 메뉴가 "양쪽"으로 뒤집혀 있던 것을 고치고, 명령 취소를 Cancel·Abbrechen으로 옮긴 영어 24줄·독일어 21줄을 UNDO로 고침(Autodesk 언어별 도움말). 바뀐 번역 줄 영어 48·독일어 40·일본어 27·중국어 14개
- [x] CLIP의 자르기와 쓰다(사용·씀)(116차): CLIP 리본 단추·명령 이름은 한국어판에서 TRIM과 같은 "자르기"라 사전 열쇠가 같았다. CLIP 쪽 원문 끝에 보이지 않는 U+2060을 붙여 열쇠를 가르고
  (한국어 화면 글은 그대로, 첫 화면 조각의 번역층은 그대로 — 도면 글 표시 `ft()`의 U+2068·U+2069와 같은 길) Clip·Zuschneiden·クリップ·剪裁로 옮김(Autodesk CLIP·XCLIP 도움말의 명령 이름).
  쓰다가 든 열쇠 164개 가운데 네 언어가 write·use로 갈린 29줄을 소스의 쓰임으로 가려, 이름·명령·옵션을 쓰는(사용) 줄을 write로 옮긴 것과 저장 경고를 use로 옮긴 것을 고침
  (같은 줄의 3D 면 Gesicht·脸部, 와이어 电线, REFEDIT 작업 세트 개수, 단독 "작업 세트"는 REFSET 도움말 낱말로, 선택 순환 Select Cycle·Wählen Sie Zyklus는 SELECTIONCYCLING 도움말 낱말로). 바뀐 번역 줄 영어 11·독일어 13·일본어 10·중국어 9개
- [x] TEXTMASK 가리기와 기본값을 붙인 프롬프트(117차): TEXTMASK의 가리기 유형 "가리기(W)"와 WIPEOUT 이름을 숨기기(Hide·Ausblenden·隠す·隐藏)에서
  Wipeout·Abdeckung·ワイプアウト·区域覆盖로(Autodesk TEXTMASK·TEXTUNMASK·WIPEOUT·WIPEOUTFRAME 언어별 도움말), 유형 이름을 끼운 줄에 남던 한국어는 열쇠 8개로 막음.
  도우미가 " <기본값>:"을 붙인 프롬프트(소스에서 글 그대로 넘긴 96개 중 명령행 79개)가 일반 틀에 걸리거나 통째로 네 언어 모두 한국어로 보이던 것을
  화면 번역 고리(`fileguard.ts` translateTail — 본문만 옮기고 기본값·친 입력은 그대로)로 고치고, 이로써 처음 보이게 된 본문 오역(스플라인 차수를 주문으로, 맞춤 공차를 custom으로,
  도넛 甜甜圈, 단 간격 排水沟 등)을 SPLINE·SPLINEDIT·POLYGON·DONUT·단 설정 도움말 낱말로 고침. 프롬프트 앞 조각이 "(…[)"로 깨진 독일어·중국어 줄, DIMPOST·DIMAPOST의
  머리말·꼬리말(header/footer → prefix/suffix), 쓰다 줄 156개를 읽어 쓰기 경로 경고를 use로 옮긴 14열쇠도 고침. 바뀐 번역 줄 영어 28·독일어 55·일본어 33·중국어 44개, 더한 열쇠 8개
- [x] 기본값이 옵션 이름인 프롬프트와 SCALETEXT·치수 단위 탭·GRID 주(118차): 도우미가 "[예(Y)/아니오(N)] <예>:"·"<켜기>"처럼 옵션 이름을 기본값으로 끼운 줄을
  화면 번역 고리(`fileguard.ts` defaultWord — 그 옵션의 번역에서 고를 글자를 뗀 낱말, 명령행은 프롬프트 요소의 옵션 목록 `data-kw`)로 옮김. 117차 소스의 끼운 앱 글 템플릿 118개에서 한국어가 남은 명령행 템플릿 115 → 62(11개는 통째 글로).
  SCALETEXT 도면 높이(P)·객체 일치·축척 비율(Paper height·Papierhöhe·用紙上の高さ·图纸高度 — "Scale Scale (S)"·"尺度尺度(S)"이던 것), 치수 스타일 1차·대체 단위 탭
  (Primary·Alternate Units, Primär·Sekundäreinheiten, 基本·変換単位, 主·换算单位), GRID 주(M)를 Note·Hinweis·注記·注释(주석)로 옮긴 것(Major·Haupt·主軸·主)과 중국어 주 뷰포트·주 도면·주 격자선,
  가리기 프레임 줄·F키 켜기·끄기 줄(`<객체 스냅 켜기>` 등 8가지)·선가중치 표시 줄·F5 등각평면 줄(끼운 켜기·끄기·왼쪽 대신 통째 열쇠), 등각평면을 Conformal·Konforme·共形(등각 사상)으로 옮긴 것(ISOPLANE 도움말 Isoplane·isometrische Ebene·アイソメ平面·等轴测平面),
  AutoLISP 선택 세트(所选套装 → 选择集), 여러 줄 문자 단 설정의 열(列 → 栏·段組み, 단 설정·-MTEXT 도움말)과 거터(Dachrinne·排水沟·ガーター → Bundsteg·栏间距·段の間隔),
  맞춤(fit)·맞춤점을 Custom·Benutzerdefiniert·配合·Ausrichten·对齐로 옮긴 줄(SPLINE·SPLINEDIT 도움말 Fit·Anpassen·拟合), 치수 스타일 기호 및 화살표 탭을 고침. 바뀐 번역 줄 영어 28·독일어 46·일본어 40·중국어 58개, 더한 열쇠 32개
- [x] 열쇠 가르기(119차, 116차 CLIP "자르기"와 같은 U+2060 — 한국어 화면 글은 그대로): 치수 스타일 맞춤 탭(Fit·Anpassen·フィット·调整 — 맞춤 탭 도움말)과
  단 설정 대화 상자의 열 폭(Column width·Spaltenbreite·段の幅·栏宽 — 단 설정 대화 상자 도움말), 독일어 맞춤 옵션 Einpassungsoption. 더한 열쇠 2개(8,402 → 8,404).
  같은 차수에 주석 축척·주석 객체 낱말(Kommentarskala·评论评分·コメントオブジェクト 등 → Beschriftungsmaßstab·注释比例·異尺度対応オブジェクト, OBJECTSCALE 대화 상자 도움말)과
  맞춤 탭 칸 이름(전체 축척 사용을 Vollbildmodus·使用全屏(전체 화면)으로 옮긴 것 등 → Globaler Skalierfaktor·使用全局比例)도 고침. 바뀐 번역 줄 영어 9·독일어 19·일본어 10·중국어 15개
- [ ] 언어 사전에 남은 것(102차 점검, 119차 갱신): 길이 비로 찾는 밀림은 언어마다 상위 30~45줄만 읽음(그 아래는 판정 안 함).
  앱 글을 끼운 줄 가운데 설정 줄("연관 = 예"·"결합 = 예"·"섬 = 일반" 등 17)·옵션이 아닌 기본값(3)·문장 속에 끼운 앱 글(42)과 상태 막대 등각평면 메뉴("{0}등각평면 {1}")는 끼운 값이 한국어로 남는다
  (틀 {0}은 도면 자료일 수 있어 옮기지 않는다 — 줄마다 통째 열쇠로 쓰거나 값이 옵션인지 알 수 있는 자리에서만 옮긴다). 여러 줄 문자의 단(column — 한국어 열쇠는 "열")은
  118차에 여러 줄 문자에만 쓰는 열쇠를 栏·段組み로 고쳤고, 119차에 단 설정 대화 상자의 "열 폭"(段の幅·栏宽)과 치수 스타일 맞춤 탭(调整)을 U+2060으로 갈랐다(대화 상자 글).
  명령행 옵션 이름으로 쓰는 "맞춤"은 120차에 MVIEW를, 121차에 COPY 배열·TEXT 자리맞추기를 맞춤 탭과 같은 열쇠로(도움말 Fit·Anpassen·フィット·调整), -PLOT 축척 맞춤을 새 열쇠(U+2060 둘 —
  Fit·Einpassen·フィット·布满)로 갈랐다(옵션 이름 일치는 U+2060을 빼고 견준다). JUSTIFYTEXT 맞춤(도움말 拟合, 독일어 도움말은 영어 Fit)과 속성 정의 대화 상자의 자리맞추기 목록은 그대로다.
  121차에 LEADER 주석(A)를 새 열쇠(Annotation·Maßtext·注釈·注释)로 가르고 지시선 주석 줄의 독일어 Kommentar를 LEADER Maßtext·QLEADER Beschriftung으로, 중국어 격자 29줄을 栅格으로 고쳤다.
  "주석" 한 열쇠를 주석 특성(Annotative — Beschriftung·異尺度対応·注释性)·주석 탭(Annotate)·DWGPROPS 주석(Comments)이 함께 써 영어가 모두 Annotation이다.
  "주석"이 든 열쇠 77개 가운데 119차에는 주석 축척·주석 객체 줄을, 121차에는 지시선 주석 줄을 고쳤다. 주석 특성 옵션(텍스트 높이·-BLOCK의 "주석(A)" — 일본어 注釈·중국어 注释, -HATCH 주석(AN) — 영어 Annotation,
  "{0} 또는 [주석(A)]" 틀 — 영어 Comment)은 그대로다. GRID 주(M)는 主로 두었다(도움말 제목은 主栅格线). 중국어 눈금(tick) 두 줄이 网格인 것도 그대로다.
  -HATCH 솔리드와 함께 쓰는 "솔리드(S)"의 독일어 Vollflächig는 TEXTMASK 도움말(Volumenkörper)과 다르지만 -SCHRAFF 도움말을 확인하지 못해 그대로.
  풀다·받다는 사전을 읽어 보니 뜻이 틀린 줄을 찾지 못했다. 명령 취소의 일본어(取り消し 19줄)·중국어(撤销 59줄)는 뜻이 맞아 공식어(元に戻す·放弃)로 바꾸지 않았다. 중국어 도면(drawing) 绘图·图形 섞임(AutoCAD 도움말은 图形 — 114차에 문서를 뜻하는 68줄을 고치고, 도면을 绘图로 둔 17줄은 그대로: 도면 영역은 공식어 绘图区域이고, 높이·방향·번호·틀·범위·한계·머리말·폴더·요소는 공식어를 확인하지 못했다).
  원어민 감수는 여전히 필요
- [x] 도면에서 온 글은 번역하지 않기(104차): 사전 열쇠·다른 언어 번역 글과 같은 이름, 나눔 글이 든 이름이 화면 번역층에서 바뀌던 것을 막음 —
  번역층 고리(`fileGuard`)와 편집기 쪽 지킴(`ft()` 자리 표시, 값=글 고르기 항목, 명령행·알림의 이름 표), 팔레트·대화 상자·명령행 길 50여 곳.
  하네스(합성 DXF, 83걸음)에서 도면 이름이 바뀐 번역 쓰기 영어·독일어·일본어·중국어 각 711 → 0, 영어 → 한국어로 바꾸기 1,286 → 0
  (세어진 2·4번은 앱 글). 문자 스타일 대화 상자의 글꼴 이름("굴림" → "Roll")도 옮기지 않게 함
- [x] 명령행 출력·프롬프트의 도면 글(105차): 출력 길 1,418곳을 소스로 훑어 도면 글을 끼우는 444곳(94파일)과 문제 글 함수를 `ft()`로 감쌈 —
  문자 내용·속성 값·프롬프트·도면층 설명·하이퍼링크·외부 참조 경로·파일 이름·그룹·UCS·뷰·도면층 상태 이름, 친 입력의 되풀이, AutoLISP 출력·프롬프트.
  하네스(합성 DXF에 이름 표 밖 도면 글을 더함) 명령행 걸음에서 도면 글이 바뀐 번역 쓰기 영어·독일어·일본어·중국어 각 5 → 0, 영어 → 한국어로 바꾸기 10 → 2(앱 글).
  값(AutoLISP 오류 글·도면 변수·저장 DXF·키워드 값·기록 복사)에는 표시가 섞이지 않음(LISP 오류 글이 값이 되던 곳은 고침)
- [x] 휴대폰 보기 카드의 도면 글(106차): 명령행이 지켜보는 쪽에 도면 글 표시를 둔 글을 주고(`shownPrompt`), 카드는 결과 줄·프롬프트·키워드와
  `<기본값>` 단추에 표시를 그대로 그린다(값 — 명령 이름·키워드·단추 견주기 — 에서만 뺌). 하네스에서 고치기 전 바뀌던 `<기본값>` 단추("표준" → "Standard")와
  BCOUNT 줄의 블록 이름("표" → "Table")이 그대로
- [x] 간접 출력의 파일 글(107차): 스크립트 실행기가 다시 찍는 줄(구석·폴리곤 점 되풀이, "…에 객체가 없습니다", 멈춘 까닭의 명령 오류 글 — 명령행 출력 고리가
  표시를 둔 글도 함께 줌)과 파일 읽기 오류·알림(ATTEXT 템플릿·추출 알림, ATTIN 핸들, 치수 스타일 파일, 치수 스타일 가져오기 알림)의 파일 글을 `ft()`로 감쌈
- [x] 대화 상자 알림 글의 파일·도면 이름(108차): 확인(`ask`)·양식 안내(`note`)·검사 오류·알림 줄·대화 상자 제목에 끼우는 도면·파일 이름을 `ft()`로 감쌈 —
  페이지 설정·도면층 상태·도면층 필터 관리자, 플롯 스타일 선택, PLOTSTAMP 미리보기, 배치 내보내기·작성, 전송 요약, 이름 바꾸기, 매개변수 관리자,
  여러 줄 스타일, SHX 글꼴 목록, 속성 편집, 치수 스타일 삭제, MKLTYPE 등
- [x] 대화 상자 목록·표·고르기 항목의 도면 이름(109차): 값이 블록 키·핸들·번호라 고르기 항목 지킴(값 = 글)이 못 알아보던 고르기 항목과 표시 없이 넣던 칸 —
  LAYOUTMOVE, 다중 지시선·여러 줄·테이블 스타일 대화 상자의 스타일 고르기, TABLE 삽입, 특성 팔레트 다중 지시선 스타일, 사용자 화살촉 블록, SCALELISTEDIT·객체 축척 목록,
  블록 팔레트 라이브러리 파일, CAD 표준 파일 이름·비교 값 칸, 치수 스타일 비교 표, PUBLISH 시트 줄, 그룹 필터 메뉴(네 언어 시험)
- [ ] 도면 글 번역에 남은 것(105차·107차·108차·109차): 앱 글이 도면 이름과 우연히 같으면 그 줄·조각은 한국어로 남는다. 고르기 항목 지킴(값 = 글)·`listBox`처럼
  글이 값과 같다는 것으로 도면 글을 알아보는 곳은, 값을 따로 둔 새 대화 상자에서 다시 빠질 수 있다(새 대화 상자는 `ft`·`translate="no"`를 직접 쓴다).
  전송 보고서처럼 파일로 쓰는 글에는 표시를 넣지 않는다
- [x] EXPLODE 뒤 소유 블록 기억(101차 점검): 103차 "큰 확정 뒤 소유 블록 찾기"로 끝남(확정이 넣은 객체마다 적지 않고 밀린 자리를 옮겨 찾아, 다음 명령이 표 전체를 다시 만들지 않음)

## 다른 형식

OpenCAD의 다음 뷰어로 SKP(SketchUp), STEP, NC(G-code·MPR 등)를 같은 방식(서버 없이 브라우저 안에서)으로 만듭니다.
2026-10-16부터 형식마다 별도 저장소에서 개발하며, 남은 일도 각 저장소 README에 있습니다.

- [opencad-viewer3d](https://github.com/GyuTae-Kim/opencad-viewer3d): 공용 3D 뷰어 코어(WebGL2)
- [opencad-nc](https://github.com/GyuTae-Kim/opencad-nc): G-code·Heidenhain 평문·woodWOP MPR
- [opencad-step](https://github.com/GyuTae-Kim/opencad-step): STEP(AP203·AP214·AP242)
- [opencad-skp](https://github.com/GyuTae-Kim/opencad-skp): SketchUp 2021~2026

이 저장소에서 3D 문서를 열던 탭·리본·패널 화면(`src/app/view3d/`)은 커밋 `d7c584a`에서 볼 수 있습니다.
