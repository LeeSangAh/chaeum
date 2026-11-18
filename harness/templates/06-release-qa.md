# 06. 출시 QA — <실행 제목>
<!-- TEMPLATE-PLACEHOLDER -->

## 1. 릴리스 정보
- 브랜치: release/<run-id>   커밋: <sha>
- Vercel 프리뷰 URL: (확인 못했으면 '미확인')

## 2. 스모크 테스트 (qa-smoke.json)
- 모드: http / browser   결과: 통과 n / 실패 n
- 실패 항목과 판단(외부 CDN 일시 오류 등 환경 요인인지, 실제 결함인지):

## 3. 출시 체크리스트
- [ ] 사람이 실행할 SQL: 없음 / 있음 → 내용, 실행 순서
- [ ] PC 스크린샷 확인 (screenshots/*-desktop.png)
- [ ] 모바일 스크린샷 확인 (screenshots/*-mobile.png)
- [ ] 관리자 페이지 비로그인 → login 리다이렉트
- [ ] 공개 달력에 회원 개인정보 미노출
- [ ] AC 전체 PASS (05-verify-report.md)

## 4. 롤백 계획
-

## 5. 출시 권고
- 출시 가능 / 조건부 / 보류 — 사유:
