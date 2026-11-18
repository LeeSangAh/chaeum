# 채움 클래식 필라테스 — Claude Code 컨텍스트

## ⚙️ 개발 프로세스: 그래프 엔지니어링 하네스 (필수)

이 저장소의 모든 코드 변경은 **그래프 실행** 안에서만 이뤄진다. `harness/graph.json` 에 정의된 순서를 따른다.

```
조사 ─▶ [G1 조사 승인] ─▶ 기획 ─▶ 설계 ─▶ [G2 기획·설계 승인] ─▶ 개발 ⇄ 검증 (최대 3회 루프)
   ─▶ [G3 개발·검증 승인] ─▶ 출시QA(release 브랜치 + Vercel 프리뷰) ─▶ [G4 출시 승인] ─▶ 배포(main push)
```

- 시작/재개: `/graph <요구사항>` · 상태: `/graph-status` 또는 `node harness/gate.mjs status`
- **승인·반려는 사람만** — 사용자가 채팅에 `승인 G1 [코멘트]`, `반려 G2 <사유> [--to design]` 을 입력하면 UserPromptSubmit 훅이 처리한다. Claude 는 절대 승인/반려 명령을 실행하지 않는다 (가드 훅이 차단).
- 게이트(G1~G4)에 도달하면 요약·검토 자료·결정 사항을 보고하고 **멈춘다**.
- 단계별 서브에이전트: `researcher` → `planner` → `architect` → `developer` ⇄ `verifier` → `qa-release` (`.claude/agents/`)
- 산출물 위치: `.harness/runs/<실행ID>/` (00-request, 01-research, 02-plan, 03-design, 04-dev-log, 05-verify-report, verify.json, 06-release-qa, qa-smoke.json, feedback.md)
- 단계 전환은 `node harness/gate.mjs complete <단계>` 로만 한다. `.harness/state.json` 직접 수정 금지.

### 가드 훅이 강제하는 규칙 (harness/hooks/guard.mjs)
| 행위 | 허용 조건 |
|---|---|
| 소스 파일 수정 (html/js/css/sql 등) | '개발' 단계에서만 |
| `.harness/` 산출물 작성 | 실행이 진행 중이면 언제나 |
| `harness/`, `.claude/`, `CLAUDE.md`, `.vercelignore` 수정 | 에이전트 금지 (사람이 `bypass on` 후) |
| `git push origin release/*` (Vercel 프리뷰) | 출시QA 단계 이후 |
| `git push origin main` (= Vercel 운영 배포) | G4 승인 후 '배포' 단계에서만 |
| force push, `git reset --hard` | 항상 금지 |

### 검증 루프 (루프 엔지니어링)
- **내부 루프**: 소스 파일을 저장할 때마다 PostToolUse 훅이 `node harness/verify.mjs --files <파일>` 실행 → 오류면 즉시 피드백
- **외부 루프**: `verifier` 판정 → `gate.mjs complete verify` 가 verify.mjs 를 재실행해 객관적으로 판정 → 실패 시 개발로 자동 회귀, 3회 초과 시 G3 에스컬레이션
- **출시 QA**: `node harness/qa-smoke.mjs` (HTTP + Playwright 브라우저 스모크, PC/모바일 스크린샷, 관리자 페이지 인증 리다이렉트 확인)
- verify.mjs 검사 항목: 로컬 경로 깨짐, 인라인 JS 문법, JSON-LD, Supabase 테이블/버킷이 스키마 파일에 있는지, 비밀키 노출, 관리자 페이지 인증 가드·noindex, 중복 id, 1MB 초과 이미지, sitemap, CLAUDE.md 문서 드리프트

### 긴급 수정 (그래프 우회)
사람이 채팅에 `bypass on` 입력 → 가드 해제 → 작업 후 반드시 `bypass off`.

---

## 프로젝트 개요
필라테스 스튜디오 웹사이트. 공개 페이지(달력·예약 요청)와 관리자 대시보드(예약·회원·결제·배너 관리)로 구성.

- **GitHub**: https://github.com/LeeSangAh/chaeum (branch: `main`)
- **배포**: Vercel (GitHub main 브랜치 자동 배포, 그 외 브랜치는 Preview 배포) — 운영 도메인 https://www.chaeumclassic.com
- **DB**: Supabase (PostgreSQL)

---

## 기술 스택
- **프론트엔드**: 순수 HTML/CSS/JS (프레임워크 없음), Bootstrap 5, jQuery(index 템플릿)
- **폰트**: Noto Sans KR (Google Fonts) — 전 페이지 통일
- **DB**: Supabase JS SDK v2 (CDN)
- **인증**: Supabase Auth (이메일/패스워드)
- **지도**: 카카오맵 약도(roughmap)
- **배포**: Vercel (static hosting)
- **하네스**: Node 18+ (`harness/`, 의존성 없음 · Playwright 는 선택)

---

## 파일 구조

```
chaeum-main/
├── index.html                 # 공개 사이트 (배너, 달력, 예약 요청, FAQ, 지도)
├── login.html                 # 관리자 로그인
├── admin.html                 # 관리자 예약 관리 + 예약 요청 승인 + 방문자 통계
├── members.html               # 관리자 회원 관리
├── member-reservations.html   # 관리자 회원별 예약·결제(payments) 관리
├── banners.html               # 관리자 메인 배너 관리 (Storage 업로드)
├── supabase_setup.sql         # DB 스키마 (Supabase SQL Editor 에서 블록별 실행)
├── js/supabase-client.js      # Supabase 클라이언트 초기화 (_supabase)
├── js/script.js               # index 템플릿 스크립트
├── css/style.css, vendor.css, bootstrap.min.css
├── images/                    # 정적 이미지
├── robots.txt, sitemap.xml, naver*.html (네이버 사이트 인증)
├── vercel.json                # {"cleanUrls":true,"trailingSlash":false}
├── .vercelignore              # 하네스/에이전트 파일 배포 제외
├── harness/                   # 그래프·게이트·검증 도구 (graph.json, gate.mjs, verify.mjs, qa-smoke.mjs, hooks/, templates/)
├── .claude/                   # settings.json(훅), agents/(서브에이전트 6종), commands/(/graph, /graph-status)
│                              #   원본은 harness/claude-config/ — `node harness/install.mjs` 로 설치
└── .harness/                  # 그래프 실행 상태와 단계별 산출물 (state.json, runs/)
```

---

## Supabase 설정

**`js/supabase-client.js`** — publishable(anon) 키만 사용. service_role / sb_secret_ 키는 절대 클라이언트에 두지 않는다.
```js
const SUPABASE_URL = 'https://yvxzxzjimsqlmmmnjqcv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_1kDsnK-WlXWQSQdyRd_KjA_qFX0R8-M';
const _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

---

## DB 스키마 (supabase_setup.sql)

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

### payments 테이블 (회원 결제 이력)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| member_id | uuid FK → members(id) ON DELETE CASCADE | |
| payment_date | date NOT NULL | 결제일 |
| amount | integer NOT NULL | 금액 |
| sessions | integer NOT NULL | 횟수 |
| memo | text | |
| created_at | timestamptz | |

### page_views 테이블 (방문자 통계)
`visitor_id uuid`, `visited_at timestamptz` — anon INSERT, authenticated SELECT.
※ admin.html 이 조회하는 `visitor_stats` 는 스키마 파일에 정의가 없음 (DB 에만 있는 뷰로 추정 — 확인 후 스키마 파일에 추가 필요)

### reservation_requests 테이블 (방문자 예약 요청 → 관리자 승인)
`request_date date`, `request_time time`, `name`, `phone`, `status`('pending'|'approved'|'rejected') — anon INSERT, authenticated 전체.
승인된 요청만 reservations 로 등록되어 index 달력에 나타난다.

### banners 테이블 + Storage `banners` 버킷 (메인 배너)
`sort_order`, `image_url`, `alt_text`, `subtitle`, `title`, `body`, `is_active` — anon SELECT, authenticated 전체. 이미지는 Storage `banners` 버킷(Public).

### RLS 정책 요약
- `members`, `payments`: authenticated 만 전체 접근
- `reservations`: anon SELECT(공개 달력용), authenticated 전체
- `page_views`, `reservation_requests`: anon INSERT 만
- `banners`: anon SELECT, authenticated 전체

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
- **회원별 예약·결제** → `member-reservations.html`
- **배너 관리** → `banners.html`
- 로그인 → `login.html` (Supabase Auth), 로그아웃 후 → `login.html` 리다이렉트
- 관리자 페이지는 모두 `auth.getSession()` 으로 인증 확인 (verify.mjs 가 검사)

---

## 주의사항
- `day_of_week`: 0=일요일, 6=토요일 (JS getDay() 기준)
- 달력 요일 헤더 순서: 일 월 화 수 목 금 토
- Supabase SQL 상단 블록에는 `DROP TABLE IF EXISTS ... CASCADE` 가 있어 재실행 시 데이터 전부 삭제됨 — 스키마 변경은 항상 DROP 없는 별도 블록으로 추가하고, 운영 DB 반영은 사람이 SQL Editor 에서 실행
- Windows 환경 개발 (LF↔CRLF 경고는 무시해도 됨)
- `main` push = 운영 배포 (Vercel 자동 배포 1~2분). 그 외 브랜치 push = Preview 배포
