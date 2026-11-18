# 05. 검증 리포트 — 예약 신청 개선 (B·C·D·E)

## 검증 루프 1 (2026-11-18 21:15)
- 자동 검증: `node harness/verify.mjs` → **PASS** (오류 0, 경고 10)
  - 경고 = 기존 9건(visitor_stats 스키마 드리프트, banners·member-reservations 검색 노출, 1MB 초과 이미지 6) + 신규 1건(CLAUDE.md 에 privacy.html 미기재 — 하네스 보호 파일, 배포 후 사람이 반영)
- E2E: `e2e/booking.e2e.mjs` (Playwright + Supabase 가짜 클라이언트) → **24/24 PASS**
- 변경 검토: `git diff` (index.html, admin.html, sitemap.xml) + 신규 `privacy.html`, `js/booking-config.js` 를 03-design.md §8 과 대조 — 설계 외 변경 없음, 누락 없음
  - 예약 창은 `data-bs-toggle="modal"` 로 열리므로 `show.bs.modal` 에서 시간 목록 갱신이 매번 실행됨 (834·1388행)
  - insert 필드 변경 없음 → DB 변경 없이 배포 가능 확인
  - 회귀 확인: `getReservationsForDate` 규칙(단일/반복, day_of_week 0=일)을 예약 창에서 동일하게 사용, 공개 달력 코드는 가드 1줄만 추가

### AC 판정표
| AC | 결과 | 근거 |
|---|---|---|
| AC-1 동의 없으면 신청 불가 | PASS | index.html submitReservationRequest 동의 검사, E2E "동의 없으면 신청 불가" (DB 동의 일시 저장은 선택 SQL 적용 시) |
| AC-2 /privacy | PASS | privacy.html 신규, 하단·예약 창 링크, verify broken-ref 0, E2E 내용 8개 항목 |
| AC-5 마감·지난 시간 비활성 | PASS | E2E 단일 10:00 → 09:30/10:00/10:30 마감, 반복 19:00 반영, 오늘 지난 시간 |
| AC-6 휴대번호 형식 | PASS | E2E 01012345678 → 010-1234-5678, 02-123-4567 거부 |
| AC-8 취소 규정 표시 | PASS | 예약 창·FAQ, 설정 파일 렌더링 |
| AC-9 안내 문자 | PASS | E2E 승인·거절 문구, sms: 링크, 수정 시 링크 갱신, 스크린샷 admin-sms-approve.png |
| AC-10 요청 정보 미복사 | PASS | reservations insert payload 에 memo 없음 |
| AC-11 오류 0·모바일 | PASS | verify 오류 0, 모바일 가로 넘침 0px |
| AC-12 공개달력 페이지 오류 | PASS | E2E index 로드 pageerror 0건 |
| G2 조건(토·일·공휴일 선택 가능, 수업종류·요청사항 없음) | PASS | E2E |

### 결함 목록
- 없음 (차단 결함 0)

### 참고 사항 (G3 에서 사람 판단)
- [중] **동의 기록 미저장**: 동의 체크는 화면에서만 강제됨. 분쟁 시 동의 사실 입증용으로 `privacy_agreed_at` 컬럼 저장 권장 → 선택 SQL (DB 변경)
- [중] **보유기간 '파기 요청 시까지'**: 개인정보보호법은 목적 달성 시 지체 없이 파기를 원칙으로 함 — 무기한 보관으로 해석될 여지. 예: "예약 처리 완료 후 1년 또는 파기 요청 시" 검토 권장 (법률 자문 아님)
- [하] 대기 중인(pending) 신청은 공개 조회가 불가해 같은 시간에 신청이 중복될 수 있음 — 관리자 승인 단계에서 조정 (현 규모 허용)
- [하] 이 검증은 개발과 같은 세션에서 수행됨 (독립 검증 에이전트 아님)

- 판정: **PASS**

## 확인 사항 (2026-11-18 21:07, 사람 제공)
- Supabase 리전: **ap-northeast-2 (서울)** → 개인정보 국외 이전 항목 불필요. privacy.html 의 TODO 주석(화면 비노출)은 정리 대상
