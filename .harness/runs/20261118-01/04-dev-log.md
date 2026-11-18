# 04. 개발 로그 — 예약 신청 개선 (B·C·D·E)

## 루프 1 (2026-11-18 21:10)
기준: 03-design.md §8 "G2 승인 조건 반영 (최종)"

- 변경 파일
  - `js/booking-config.js` (신규) — `window.CHAEUM_BOOKING`: 연락처, 예약 가능 시간(07:00~21:00, 30분 간격, 수업 50분), 취소 규정 3줄, 보유기간("정보주체의 파기 요청 시까지"), 승인/거절 문자 템플릿
  - `index.html`
    - 예약 모달: 휴대번호 입력 `inputmode=numeric`, **예약·취소 안내 박스**, **[필수] 개인정보 수집·이용 동의** + 내용 보기 + /privacy 링크, 완료 문구 "확인 후 입력하신 번호로 문자 안내드립니다."
    - 예약 스크립트 전면 교체: 창 열 때마다 확정 예약 조회 → 07:00~21:00 슬롯 중 **확정 예약과 50분 이내 겹침 '(마감)'**, **오늘 지난 시간 '(지난 시간)'** 비활성 / 단일+반복 예약 모두 반영 / 제출 직전 재조회로 동시 신청 방지 / 휴대번호 010-0000-0000 자동 형식·검증 / 동의 필수 / 조회 실패 시 안내 후 신청 허용
    - **토·일·공휴일 선택 가능** (G2 조건), 수업 종류·요청사항 입력 없음 (G2 조건)
    - FAQ "예약 변경·취소는 어떻게 하나요?" 추가 — 모달·FAQ 규정은 `[data-chaeum-policy]` 로 설정 파일에서 렌더링(정적 기본 문구 포함)
    - 하단 바에 '개인정보처리방침' 링크
    - **공개 달력 null 가드** — 주석 처리된 '이달의 일정' 섹션 때문에 나던 `Cannot set properties of null` 페이지 오류 제거
    - `<script src="js/booking-config.js">` 추가
  - `privacy.html` (신규) — 수집 항목·목적·보유(파기 요청 시까지)·파기·제3자 제공 없음·처리위탁(Supabase Inc., Vercel Inc.)·권리·안전조치·보호책임자(이상희 원장)·적용일 2026-11-18
  - `admin.html` — 승인/거절 직후 **안내 문자 모달**(템플릿 자동 채움·수정 가능, `sms:` 링크, 문구 복사), `booking-config.js` 로드
  - `sitemap.xml` — `/privacy` 추가
- AC 대응: AC-1 동의 체크 / AC-2 privacy.html·링크 / AC-5 슬롯 비활성 / AC-6 휴대번호 / AC-8 규정 표시 / AC-9 문자 모달 / AC-10 reservations 에 요청 정보 미복사(변경 없음) / AC-11·12 오류·모바일
- 이전 검증 지적 해결: 해당 없음 (첫 루프)
- **DB 변경: 없음** — insert 필드는 기존 4개(request_date, request_time, name, phone) 그대로. 지금 상태로 배포해도 동작함
- 사람이 해야 할 일
  1. (선택·권장) 동의 일시 저장 + 휴대번호 DB 검증 SQL — 승인 시 별도 단계로 진행 (G3 보고 참조)
  2. Supabase 리전 확인 → 해외면 privacy.html 에 '국외 이전' 항목 추가 필요 (G4 전)
  3. 배포 후 CLAUDE.md 에 `privacy.html`, `js/booking-config.js` 문서화 (하네스 보호 파일 — 사람이 bypass 후 수정)
  4. 공휴일은 이제 예약 차단에 쓰지 않으므로 매년 갱신 작업 없음
- 설계 이슈: 없음
- 셀프체크
  - `node harness/verify.mjs` → PASS (오류 0, 경고 10 — 신규 1건은 CLAUDE.md 문서 드리프트 'privacy.html')
  - E2E (`e2e/booking.e2e.mjs`, Supabase 가짜 클라이언트 + Playwright) → **24/24 PASS** (`e2e/e2e-booking.json`, 스크린샷 3장)
