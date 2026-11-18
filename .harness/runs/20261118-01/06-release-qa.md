# 06. 출시 QA — 예약 신청 개선 (B·C·D·E)

## 1. 릴리스 정보
- 브랜치: `release/20261118-01` (커밋 `6e7c9bf` 하네스 도입, `8f457db` 예약 신청 개선) — main(`638ec98`) 기준
- push: 사람이 PC 에서 수행 (이 작업 환경은 git push 차단)
- Vercel 프리뷰 URL: https://chaeum-git-release-20261118-01-salee80-6049s-projects.vercel.app/ (Vercel 배포 보호 — 로그인 필요)

## 2. 스모크 테스트
- 로컬 `qa-smoke.json`: **PASS 11/11** (http 모드 — 페이지 200, robots·sitemap, `.harness`·`harness`·`CLAUDE.md` 비노출). 브라우저 단계는 이 환경에 Playwright 미설치로 생략
- 브라우저 E2E `e2e/e2e-booking.json`: **PASS 24/24** (Supabase 가짜 클라이언트) — 동의·마감·지난 시간·휴대번호·취소 규정·처리방침·관리자 안내 문자·공개달력 오류 제거·모바일 넘침 0
- 프리뷰 실제 확인: Vercel 보호로 에이전트 브라우저 접근 불가 → **승인권자가 직접 확인, "모두 오케이"** (2026-11-18 21:19)

## 3. 출시 체크리스트
- [x] 사람이 실행할 SQL: **없음** (insert 필드 변경 없음)
- [x] PC 스크린샷 확인 (e2e/booking-modal-desktop.png, admin-sms-approve.png)
- [x] 모바일 스크린샷 확인 (e2e/booking-modal-mobile.png, privacy-mobile.png)
- [x] 관리자 페이지 인증 가드 유지 (verify auth-guard 오류 0)
- [x] 공개 달력에 회원 개인정보 미노출 (조회 컬럼 변경 없음 — 시간 정보만)
- [x] AC 전체 PASS (05-verify-report.md)
- [x] Supabase 리전 ap-northeast-2(서울) → 국외 이전 고지 불필요
- [x] 프리뷰에서 실제 신청 테스트 금지 안내 (프리뷰도 운영 DB 사용)

## 4. 배포에 함께 나가는 변경 (알림)
- 하네스 도입 커밋 포함: `.vercelignore` 로 `harness/`, `.harness/`, `.claude/`, `.idea/`, `CLAUDE.md`, `supabase_setup.sql` 이 **운영 사이트에서 더 이상 공개되지 않음** (현재는 URL 로 열람 가능한 상태)
- `.gitignore` 에 `.claude/settings.local.json` 추가 (개인 권한 설정 비공개)

## 5. 롤백 계획
- 문제 발생 시: `git revert -m 1 <merge 커밋>` 후 `git push origin main` → Vercel 자동 재배포(1~2분). DB 변경이 없으므로 DB 롤백 불필요

## 6. 출시 권고
- **출시 가능** — 차단 결함 0, DB 선행 작업 없음
- 배포 후 사람 작업: CLAUDE.md 에 `privacy.html`, `js/booking-config.js` 문서화(하네스 보호 파일)
- 후속 권장(다음 실행): 동의 일시 DB 저장, 보유기간 문구 검토, A 요금·환불 공개(법적 의무), F anon 컬럼 축소
