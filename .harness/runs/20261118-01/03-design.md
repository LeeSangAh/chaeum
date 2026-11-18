# 03. 설계 — 예약 신청 개선 (B·C·D·E)

- 실행 ID: 20261118-01 / 작성: architect / 입력: 01-research.md, 02-plan.md, CLAUDE.md

## 0. 코드 조사 결과 (설계 근거)
- 예약 모달 HTML: `index.html` 1467~1515행 (`#reservationRequestModal`, 필드 `reqDate/reqTime/reqName/reqPhone`)
- 예약 스크립트: `index.html` 1690~1790행 (시간 옵션 06:00~22:00 생성, `submitReservationRequest()` → `reservation_requests.insert`)
- 운영 시간 표기: `index.html` 1327~1329행 "평일 07:00 – 22:00 / 토요일 · 일요일 · 공휴일 휴무" → **폼(06:00~22:00, 주말 허용)과 불일치**
- 공개 달력 스크립트 `index.html` 1600행~: `#pub-calendar` 섹션이 주석 처리됐는데 `loadClasses()→render()` 가 `#pubCalTitle` 에 접근 → **매 페이지 로드마다 `Cannot set properties of null` 페이지 오류** (QA 스모크에서 확인). 이번 작업에서 예약 데이터 로딩을 재사용하므로 null 가드 추가 (범위 소폭 추가 — G2 확인 사항)
- 관리자: `admin.html` 1128~1238행 (`loadRequests/renderRequests/approveRequest/rejectRequest`), 승인 시 members 조회/생성 → reservations insert
- FAQ 아코디언: `index.html` 1232~1290행, 하단 바: `#footer-bottom` (1428행 부근)

## 1. 변경 파일
| 파일 | 변경 내용 | 이유 |
|---|---|---|
| `js/booking-config.js` (신규) | 예약 운영 설정 전역 객체 `CHAEUM_BOOKING` — 운영시간·슬롯·수업시간·휴무요일·공휴일·수업종류·취소규정·보유기간·연락처·문자 템플릿 | 원장님이 한 파일만 고치면 되도록 (AC-4,5,8,9) |
| `index.html` | 예약 모달 개편(수업 종류, 요청사항, 규정 박스, 동의), 날짜·시간 로직, 휴대번호 정규화, insert 필드 추가, FAQ 1개 추가, 하단 '개인정보처리방침' 링크, 공개달력 null 가드 | AC-1,3~8,11 |
| `privacy.html` (신규) | 개인정보처리방침 (기존 페이지 톤: Noto Sans KR, #2c2c2c/#8b7355) | AC-2 |
| `admin.html` | 요청 카드에 수업 종류·요청사항 표시, 승인 시 `class_name` 기록, 승인/거절 후 안내 문자 모달 | AC-7,9,10 |
| `supabase_setup.sql` | 하단에 DROP 없는 "v5 예약 요청 확장" 블록 추가 | 스키마 문서화 (운영 반영은 사람) |
| `sitemap.xml` | `/privacy` 추가 | SEO |
| `CLAUDE.md` | (하네스 보호 파일 — 에이전트 수정 금지) → 배포 후 사람이 반영할 문서 변경 내용을 dev-log 에 기재 | 문서 드리프트 방지 |

## 2. 데이터 설계
```sql
-- ================================================
-- v5: 예약 요청 확장 (수업 종류·요청사항·개인정보 동의) — DROP 없음
-- [1단계] 코드 배포 전에 실행
-- ================================================
ALTER TABLE reservation_requests
  ADD COLUMN IF NOT EXISTS lesson_type       varchar(20),
  ADD COLUMN IF NOT EXISTS request_note      varchar(200),
  ADD COLUMN IF NOT EXISTS privacy_agreed_at timestamptz;

ALTER TABLE reservation_requests DROP CONSTRAINT IF EXISTS reservation_requests_lesson_type_chk;
ALTER TABLE reservation_requests
  ADD CONSTRAINT reservation_requests_lesson_type_chk
  CHECK (lesson_type IS NULL OR lesson_type IN ('trial1','trial3','private','duet','consult'));

-- ================================================
-- [3단계] 새 코드 배포 확인 후 실행 — 이후 신규 신청은 동의·휴대폰 형식 필수 (기존 행은 검사 안 함)
-- ================================================
ALTER TABLE reservation_requests DROP CONSTRAINT IF EXISTS reservation_requests_consent_chk;
ALTER TABLE reservation_requests
  ADD CONSTRAINT reservation_requests_consent_chk
  CHECK (privacy_agreed_at IS NOT NULL) NOT VALID;

ALTER TABLE reservation_requests DROP CONSTRAINT IF EXISTS reservation_requests_phone_chk;
ALTER TABLE reservation_requests
  ADD CONSTRAINT reservation_requests_phone_chk
  CHECK (phone ~ '^01[016789]-[0-9]{3,4}-[0-9]{4}$') NOT VALID;

-- ================================================
-- [운영] 보유기간(1년) 지난 처리 완료 신청 파기 — 연 1회 이상 실행
-- ================================================
-- DELETE FROM reservation_requests
--  WHERE status IN ('approved','rejected') AND created_at < now() - interval '1 year';
```
- `DROP CONSTRAINT IF EXISTS` 는 제약조건만 제거(재실행 안전용)이며 데이터는 삭제하지 않음.
- **적용 순서 (3단계)**: ① 1단계 SQL → ② 코드 배포(main push) → ③ 3단계 SQL. ①을 빼고 배포하면 새 컬럼이 없어 신청이 모두 실패, ③을 먼저 하면 구 코드의 신청이 실패.
- anon 노출: reservation_requests 는 anon INSERT 만 (SELECT 불가) — 변경 없음. reservations 의 anon SELECT 는 그대로(F 제외)이므로 **고객 요청사항은 reservations 로 복사하지 않는다** (AC-10). `class_name` 에는 수업 종류 라벨만 기록.

## 3. UI·로직 설계

### 3-1. `js/booking-config.js`
```js
window.CHAEUM_BOOKING = {
  phone: '010-2899-5015',
  openTime: '07:00', lastStartTime: '21:00', slotMinutes: 30, classMinutes: 50,
  closedWeekdays: [0, 6],                      // 일, 토
  holidays: [ /* 'YYYY-MM-DD' 평일 공휴일·대체공휴일, 매년 갱신 */
    '2026-12-25',
    '2027-01-01','2027-02-08','2027-02-09','2027-03-01','2027-05-03','2027-05-05','2027-05-13',
    '2027-07-19','2027-08-16','2027-09-14','2027-09-15','2027-09-16','2027-10-04','2027-10-11','2027-12-27'
  ],
  lessonTypes: [
    { value: 'trial1',  label: '체험 레슨 1회' },
    { value: 'trial3',  label: '체험 레슨 3회' },
    { value: 'private', label: '개인 레슨 (1:1)' },
    { value: 'duet',    label: '듀엣 레슨 (1:2)' },
    { value: 'consult', label: '상담만 원해요' }
  ],
  cancelPolicy: [                               // ⚠ 원장님 확인 필요 (G2 질문 1)
    '예약 변경·취소는 수업 24시간 전까지 연락 주세요.',
    '수업 24시간 이내 취소 및 노쇼 시 1회 차감됩니다.',
    '체험 레슨은 처음 등록하시는 분에 한해 1회 이용 가능합니다.'
  ],
  privacyRetention: '처리 완료 후 1년',            // ⚠ G2 질문 3
  sms: {
    approve: '[채움 클래식 필라테스] {name}님, {date} {time} {lesson} 예약이 확정되었습니다. 변경·취소는 수업 24시간 전까지 연락 부탁드립니다. 문의 {phone}',
    reject:  '[채움 클래식 필라테스] {name}님, 요청하신 {date} {time} 예약은 확정이 어렵습니다. 가능한 시간은 {phone} 로 문의해 주시면 안내드리겠습니다.'
  }
};
```
2027 공휴일 출처: 우주항공청 2027년 월력요항(2026-06-29 관보) 기준 정리 자료 — 노동절(5/1 토→5/3 대체), 제헌절(7/17 토→7/19 대체) 포함. 부처님오신날 5/13 은 배포 전 재확인.

### 3-2. 예약 모달 (index.html)
필드 순서: **수업 종류(select)** → 날짜 → 시간 → 이름 → 휴대번호 → 요청사항(textarea, 200자 카운터) → **예약·취소 안내 박스**(`cancelPolicy` 렌더링, 배경 #f7f3ee) → **[필수] 개인정보 수집·이용 동의** 체크박스 + '내용 보기' 토글(목적: 예약 확인 및 안내 연락 / 항목: 이름·휴대번호·수업종류·요청사항 / 보유: `privacyRetention` / 거부 시 온라인 예약 불가, 전화 예약 가능) + `/privacy` 링크.
- 기존 인라인 스타일(라벨 0.78rem #8b7355, border-radius 0) 재사용. 모바일은 modal 기본 폭, 가로 넘침 없음.

### 3-3. 예약 로직 (index.html 스크립트, 기존 IIFE 교체)
- `isClosedDay(dateStr)`: `closedWeekdays` 또는 `holidays` 포함 여부.
- `buildTimeOptions(dateStr)`:
  1. 휴무일 → 옵션 비우고 select disabled, `showReqMsg('토·일·공휴일은 휴무입니다. 다른 날짜를 선택해주세요.')`
  2. `openTime`~`lastStartTime`, `slotMinutes` 간격 생성
  3. 해당 날짜 확정 예약 시작시간 목록(단일 + 반복 규칙, 기존 `getReservationsForDate` 와 동일 규칙)과 `|slot - start| < classMinutes` 이면 `disabled` + 라벨 `HH:MM (마감)`
  4. 오늘이면 현재 시각 이전 슬롯 `disabled`
  5. 가능한 슬롯이 0개면 "선택한 날짜는 예약이 마감되었습니다" 안내
- 예약 데이터: 모달 최초 오픈 시 1회 `reservations` 조회 (공개 달력과 동일 select 컬럼) 후 캐시. 실패 시 마감 표시 없이 전체 슬롯 + 안내 문구.
- 휴대번호: 입력 시 숫자만 추출 → 10/11자리면 `010-1234-5678` 형태로 포맷, 검증 정규식 `/^01[016789]-\d{3,4}-\d{4}$/`.
- `submitReservationRequest()`: 검증 순서 수업종류 → 날짜(휴무 재검사) → 시간(disabled 재검사) → 이름 → 휴대번호 → 동의. insert 에 `lesson_type`, `request_note`(trim, 빈 문자열이면 null), `privacy_agreed_at: new Date().toISOString()` 추가.
- 완료 문구: "예약 신청이 완료되었습니다 / 확인 후 입력하신 번호로 문자 안내드립니다."
- 모달 닫힘 시 신규 필드까지 초기화.

### 3-4. 공개 달력 null 가드
`render()` 시작에 `const titleEl = document.getElementById('pubCalTitle'); if (!titleEl) return;` — 섹션이 주석 처리된 현재 상태에서 페이지 오류 제거. 섹션 복원 시 그대로 동작.

### 3-5. FAQ (D)
기존 아코디언 마지막에 항목 추가: "예약 변경·취소는 어떻게 하나요?" — 본문은 `cancelPolicy` 와 동일 문구 + 전화/카카오채널 안내 (정적 HTML, id `flush-collapseSix`).

### 3-6. privacy.html (B)
섹션: 1.수집 항목·방법 2.이용 목적 3.보유·이용 기간 및 파기 4.제3자 제공(없음) 5.처리 위탁 및 국외 이전(Supabase Inc. — 데이터베이스 호스팅 / Vercel Inc. — 웹사이트 호스팅, ⚠ 저장 국가는 원장님 확인) 6.정보주체의 권리와 행사 방법 7.안전성 확보 조치 8.개인정보 보호책임자(이상희 원장, 010-2899-5015) 9.시행일(배포일). `<link rel="canonical" href="https://www.chaeumclassic.com/privacy">`, 상단에 홈 링크.

### 3-7. admin.html (E, AC-7·10)
- `renderRequests()`: `lesson_type` 라벨 뱃지(`CHAEUM_BOOKING.lessonTypes`), `request_note` 있으면 회색 한 줄(escHtml). 기존 데이터(null)는 미표시.
- `approveRequest()`: reservations insert 에 `class_name: lessonLabel || null` 추가. memo 에는 요청사항 넣지 않음.
- 승인/거절 성공 후 `openSmsModal(req, 'approve'|'reject')`:
  - 템플릿 치환: `{name}`, `{date}`=`M월 D일(요일)`, `{time}`=`HH:MM`, `{lesson}`, `{phone}`
  - 모달: 받는 번호, textarea(수정 가능), [문자 보내기] = `<a href="sms:{phone}?body={encodeURIComponent(text)}">` (textarea 변경 시 href 갱신), [문구 복사] = `navigator.clipboard.writeText` 실패 시 textarea select 안내, [닫기]
  - Bootstrap modal 은 admin.html 에서 이미 bootstrap.bundle 로드됨
- `<script src="js/booking-config.js">` 를 supabase-client.js 다음에 추가.

## 4. AC 추적표
| AC | 구현 위치 | 검증 방법 |
|---|---|---|
| AC-1 | index 동의 체크 + submit 검증, DB consent_chk | 수동(미체크 신청 시도) + 코드 리뷰 |
| AC-2 | privacy.html, index footer·모달 링크 | verify(broken-ref) + qa-smoke HTTP 200 |
| AC-3 | lessonType select + submit 검증 + DB check | 수동 + 코드 리뷰 |
| AC-4 | isClosedDay | 수동(토/일/2026-12-25 선택) |
| AC-5 | buildTimeOptions | 수동(확정 예약 있는 날짜 선택) |
| AC-6 | 휴대번호 포맷/검증 + DB phone_chk | 수동(01012345678, 0212345678 입력) |
| AC-7 | insert request_note, admin 카드 | 수동 |
| AC-8 | 모달 규정 박스, FAQ | 수동 + qa 스크린샷 |
| AC-9 | openSmsModal | 수동(admin 승인/거절) |
| AC-10 | approveRequest class_name, memo 미사용 | 코드 리뷰(git diff) |
| AC-11 | 전체 | verify.mjs 오류 0, qa-smoke runtime 오류(외부 CDN 제외) 0, 모바일 overflow 0 |

## 5. 리스크와 롤백
- **배포 순서 실수** → 신청 실패: 출시QA 체크리스트에 1단계 SQL 실행 확인을 G4 전 필수 항목으로.
- **공휴일 목록 노후화**: 2027-12-27 이후 비어 있음 → `booking-config.js` 주석과 dev-log 에 매년 갱신 안내.
- **50분 겹침 규칙**: 듀엣 합류(같은 시간 2번째 회원)는 "마감"으로 보임 → 요청사항/전화로 안내 (현재 규모에서 허용).
- **롤백**: `git revert <merge-commit>` 후 push. DB는 새 컬럼이 남아도 구 코드와 호환(3단계 제약조건만 `ALTER TABLE reservation_requests DROP CONSTRAINT reservation_requests_consent_chk, DROP CONSTRAINT reservation_requests_phone_chk;` 로 해제).

## 6. 작업 분할 (병렬 개발 단위)
- 단위 1 (공개): `js/booking-config.js`, `index.html`, `privacy.html`, `sitemap.xml`
- 단위 2 (관리자): `admin.html` — 단위 1의 config 인터페이스(3-1)만 의존
- 단위 3 (스키마): `supabase_setup.sql` 블록 추가

## 7. G2 승인 시 확인할 사항
1. **취소 규정 문구**(3-1 cancelPolicy) — 24시간 전/당일 1회 차감이 맞나요?
2. **수업 시간 50분**, 마지막 시작 21:00 이 맞나요?
3. **개인정보 보유기간 '처리 완료 후 1년'** 으로 할까요?
4. Supabase 프로젝트 **리전**(대시보드 Settings → General)이 서울(ap-northeast-2)인가요, 해외인가요? → 처리방침 국외 이전 항목
5. 범위 추가: 공개 달력 **페이지 오류 null 가드**(3-4) 포함해도 될까요?

---

## 8. G2 승인 조건 반영 (최종 — 개발은 이 절을 우선한다)
승인 코멘트(2026-11-18 20:53)에 따라 위 설계를 다음과 같이 **변경**한다.

| 항목 | 최종 결정 |
|---|---|
| C 수업 종류·요청사항 | **입력받지 않음** → `lesson_type`, `request_note` 관련 UI·DB·admin 표시·`class_name` 기록 **모두 제거** (AC-3, AC-7, AC-10 삭제) |
| C 날짜 | **토·일·공휴일도 선택 가능** → `closedWeekdays`/`holidays`/`isClosedDay` 제거 (AC-4 삭제). 과거 날짜만 선택 불가 |
| C 시간 | 07:00~21:00, 30분 단위. **이미 예약된 시간(50분 겹침)·오늘 지난 시간은 비활성** (AC-5 유지) |
| C 휴대번호 | 010-0000-0000 형식 자동 정규화·검증 (AC-6 유지) |
| B 동의 | 진행. 보유기간 = **"정보주체의 파기 요청 시까지"** |
| B 국외 이전 | Supabase 리전 미확인 → privacy.html 에 처리위탁(Supabase Inc., Vercel Inc.) 명시, **저장 위치 문구는 출시QA(G4) 전까지 확정 필요** |
| D 취소 규정 | 확정: 24시간 전 변경·취소 / 24시간 이내 취소·노쇼 1회 차감 / 체험 1회 한정 |
| 수업 시간 | 확정: 50분, 마지막 시작 21:00 |
| E 안내 문자 | 진행. 템플릿에서 `{lesson}` 제거 |
| 설정 파일 | 진행 (`js/booking-config.js`) |
| DB 변경 | **이번 코드는 DB 변경 없이 동작하도록 구현**(insert 필드 변경 없음). 동의 일시 저장·휴대번호 DB 검증 SQL 은 **권장 사항으로 사람에게 별도 보고**하고 적용 여부를 결정받는다 |
| 공개달력 오류 | null 가드 포함 (3-4) |

최종 AC: AC-1(동의 없으면 신청 불가 — DB 저장은 SQL 적용 시), AC-2, AC-5, AC-6, AC-8, AC-9, AC-11 + **AC-12 공개 페이지 로드 시 `pubCalTitle` null 페이지 오류 없음**
