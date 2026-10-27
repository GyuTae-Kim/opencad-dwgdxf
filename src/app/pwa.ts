/**
 * 홈 화면 앱(PWA) 연결. 서비스 워커 등록과 "새 버전" 알림, 첫 방문 파일 담기 알림, 데스크톱 파일 열기(launchQueue),
 * 공유 받기 시작 인자(?recent=·?share-error=)는 공용 사이트 도구(opencad-site-kit/pwa/client)의 것을 그대로 내보낸다.
 * 서비스 워커 원본은 tools/sw-template.js(빌드 설정은 tools/site.mjs). 이 앱에만 있는 것은 공유 받기 실패 안내다.
 */
export * from 'opencad-site-kit/pwa/client';

/** 공유 받기 실패 안내 */
export function shareErrorMessage(code: string): string {
  if (code === 'too-big') return '공유한 파일이 60MB보다 커서 받지 못했습니다. 파일 열기로 여십시오.';
  if (code === 'no-file') return '공유한 내용에 도면 파일이 없습니다. DWG·DXF 파일을 공유하십시오.';
  return '공유한 파일을 이 브라우저에 저장하지 못했습니다. 파일 열기로 여십시오.';
}
