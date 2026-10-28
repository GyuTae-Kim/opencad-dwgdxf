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
- [ ] 오른쪽 버튼 끌어 놓기 메뉴, AUTOSNAP 마그넷·추적 비트
- [x] 타원·타원호·스플라인의 접점 스냅(기준점에서 그은 접점, LINE·XLINE·PLINE·CIRCLE 3P·Ttr·TTT의 지연된 접점), 가상 교차점을 객체의 정확한 형상으로(호 → 원, 타원호 → 타원, 블록 안 객체)
- [x] CIRCLE Ttr·TTT·3P에서 원이 곡선에 한 점으로만 닿는 경계(이중근), 점에서 스플라인에 그은 접선의 표본 한 칸 안 두 접점
- [x] Ctrl 순환 다기능 그립(GRIPMULTIFUNCTIONAL — 초기값 3, 1 Ctrl 순환, 2 커서를 올리면 뜨는 메뉴), 회전·축척 그립의 참조(R)
- [ ] 화살표 반전 값
- [x] PLINE 호 Ctrl 방향 전환
- [x] 3DPOLY·3DFACE의 Z 입력(x,y,z·@ 상대·원통·구 좌표, 동적 입력, 점 필터, 객체 점에 붙인 스냅의 Z — OSNAPZ 0)
- [x] SPLINE 매듭 방식 보존(맞춤 방식은 DXF 70에 1024 + 매듭 비트, AutoCAD와 같은 보간)
- [ ] SPLINE 공차 근사, ARRAYPOLAR 회전축
- [ ] 2D 명령에 준 Z(AutoCAD는 LINE에 준 Z로 3D 선을, CIRCLE 중심의 Z로 고도를 정한다 — 지금은 고도에 평면으로), OSNAPZ 1·교차점·근처점의 Z, UCS 원점의 Z
- [ ] 표 셀 제자리 편집, 자동 쌓기·철자 검사·배경 마스크, QDIM·DIMJOGGED 머리말 재지정
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
- [ ] 스플라인 조정점·맞춤점과 다중 지시선(MULTILEADER) 정점 평탄 좌표(실제 도면 2,770개에 스플라인 856개·점 7,110개, 다중 지시선 점 2,600개 — 남은 정점 객체 중 가장 많다)
- [ ] 점 객체(선 하나 약 390B)·공통 속성 줄이기
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
