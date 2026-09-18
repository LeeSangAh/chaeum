# 채움 클래식 필라테스 — Claude Code 컨텍스트

## 프로젝트 개요
필라테스 스튜디오 웹사이트. 공개 달력 페이지와 관리자 예약·회원 관리 대시보드로 구성.

- **GitHub**: https://github.com/LeeSangAh/chaeum (branch: `main`)
- **배포**: Vercel (GitHub main 브랜치 자동 배포)
- **DB**: Supabase (PostgreSQL)

---

## 기술 스택
- **프론트엔드**: 순수 HTML/CSS/JS (프레임워크 없음), Bootstrap 5
- **폰트**: Noto Sans KR (Google Fonts) — 전 페이지 통일
- **DB**: Supabase JS SDK v2
- **인증**: Supabase Auth (이메일/패스워드)
- **배포**: Vercel (static hosting)

---

## 파일 구조

```
chaeum-main/
├── index.html          # 공개 사이트 (달력 포함)
├── admin.html          # 관리자 예약 관리
├── members.html        # 관리자 회원 관리
├── login.html          # 관리자 로그인
├── style.css           # 공통 스타일
├── supabase_setup.sql  # DB 스키마 (Supabase SQL Editor에서 실행)
├── js/
│   └── supabase-client.js  # Supabase 클라이언트 초기화
├── css/
│   ├── bootstrap.min.css
│   └── vendor.css
└── vercel.json         # {"cleanUrls":true,"trailingSlash":false}
```

---

## Supabase 설정

**`js/supabase-client.js`**
```js
const SUPABASE_URL = 'https://yvxzxzjimsqlmmmnjqcv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_1kDsnK-WlXWQSQdyRd_KjA_qFX0R8-M';
const _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

---

## DB 스키마 (supabase_setup.sql v4)

### members 테이블
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | gen_random_uuid() |
| name | varchar(100) NOT NULL | 회원 이름 |
| phone | varchar(20) | 연락처 |
| memo | text | 특이사항 |
| status | varchar(20) | 'active' \| 'inactive' |
| created_at | timestamptz | |

### reservations 테이블
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| member_id | uuid FK → members(id) ON DELETE CASCADE | |
| class_name | varchar(100) | nullable (UI에서 미사용) |
| start_time | time NOT NULL | 수업 시작 시간 |
| memo | text | |
| status | varchar(20) | 'confirmed' \| 'cancelled' |
| is_recurring | boolean | 매주 반복 여부 |
| reservation_date | date | 단일 예약 날짜 (is_recurring=false) |
| day_of_week | smallint | 0=일 ~ 6=토 (is_recurring=true) |
| recurring_from | date | 반복 시작일 |
| recurring_until | date | 반복 종료일 |
| created_at | timestamptz | |

### RLS 정책
- `members`: authenticated만 전체 접근
- `reservations`: anon은 SELECT만, authenticated는 전체
- `anon` role에 `GRANT SELECT ON reservations` 부여 (공개 달력용)

---

## 핵심 아키텍처 결정사항

### 수업등록 = 예약등록
수업과 예약은 동일 개념. 별도 테이블 없이 `reservations` 단일 테이블로 관리.

### 단일 예약 vs 반복 예약
- `is_recurring = false` → `reservation_date`로 날짜 지정
- `is_recurring = true` → `day_of_week` + `recurring_from` + `recurring_until`로 기간 내 매주 반복

### 공개 달력 (index.html)
- anon role로 reservations 조회 (member name 미노출)
- **시간만 표시** (class_name, member name 표시 안 함)
- 최대 3개 표시, 초과 시 `+N개 더보기` 클릭 → 모달 팝업으로 전체 시간 표시
- 달력 셀: PC 고정 105px, 모바일 min-height 78px (CSS grid로 행 높이 자동 통일)
- 시간 뱃지: 가운데 정렬

### 관리자 달력 (admin.html)
- 회원 드롭다운 (active 회원만), 시간 선택 (30분 간격 06:00~22:00)
- 예약 카드: 시간 + 회원명/연락처 + 메모 표시
- 매주 반복 체크박스 → 기간 입력

---

## 페이지별 주요 JS 패턴

### 날짜 필터링 (index.html & admin.html 공통)
```js
function getReservationsForDate(dateStr) {
  const dow = new Date(dateStr + 'T00:00:00').getDay();
  return allReservations.filter(r => {
    if (!r.is_recurring) return r.reservation_date === dateStr;
    return r.day_of_week === dow &&
           r.recurring_from <= dateStr &&
           r.recurring_until >= dateStr;
  }).sort((a, b) => a.start_time.localeCompare(b.start_time));
}
```

### Supabase 조회 (admin.html — member join 포함)
```js
const { data } = await _supabase
  .from('reservations')
  .select('*, members(name, phone)')
  .eq('status', 'confirmed');
```

### 공개 달력 조회 (index.html — anon)
```js
const { data } = await _supabase
  .from('reservations')
  .select('start_time, is_recurring, reservation_date, day_of_week, recurring_from, recurring_until')
  .eq('status', 'confirmed');
```

---

## 관리자 탭 구조
- **예약 관리** → `admin.html`
- **회원 관리** → `members.html`
- 로그인 → `login.html` (Supabase Auth)
- 로그아웃 후 → `login.html`으로 리다이렉트

---

## 주의사항
- `day_of_week`: 0=일요일, 6=토요일 (JS getDay() 기준)
- 달력 요일 헤더 순서: 일 월 화 수 목 금 토
- Supabase SQL 재실행 시 `DROP TABLE IF EXISTS ... CASCADE` 포함되어 있으므로 데이터 전부 삭제됨 — 주의
- Windows 환경 개발 (LF↔CRLF 경고는 무시해도 됨)
- git push 후 Vercel 자동 배포까지 약 1~2분 소요
