-- ================================================
-- 채움 클래식 필라테스 - Supabase DB 설정 v4
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.
-- ================================================

-- 기존 테이블 삭제
DROP TABLE IF EXISTS reservations CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS members CASCADE;
DROP TABLE IF EXISTS classes CASCADE;
DROP TABLE IF EXISTS class_slots CASCADE;
DROP TABLE IF EXISTS site_settings CASCADE;

-- 1. 회원 테이블
CREATE TABLE members (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  name       varchar(100) NOT NULL,
  phone      varchar(20),
  memo       text,
  status     varchar(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz DEFAULT now()
);

-- 2. 예약 테이블 (수업 등록 = 예약 등록)
CREATE TABLE reservations (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id        uuid        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  class_name       varchar(100),
  start_time       time        NOT NULL,
  memo             text,
  status           varchar(20) DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  is_recurring     boolean     DEFAULT false,
  reservation_date date,
  day_of_week      smallint    CHECK (day_of_week BETWEEN 0 AND 6),
  recurring_from   date,
  recurring_until  date,
  created_at       timestamptz DEFAULT now()
);

-- 3. 결제 이력 테이블
CREATE TABLE payments (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id    uuid        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  payment_date date        NOT NULL DEFAULT CURRENT_DATE,
  amount       integer     NOT NULL,
  sessions     integer     NOT NULL,
  memo         text,
  created_at   timestamptz DEFAULT now()
);

-- 4. RLS 활성화
ALTER TABLE members      ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments     ENABLE ROW LEVEL SECURITY;

-- 5. RLS 정책
-- members: 관리자만 접근
CREATE POLICY "admin_all_members"
  ON members FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- reservations: 공개 읽기(달력 표시용), 관리자 전체
CREATE POLICY "public_read_reservations"
  ON reservations FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin_all_reservations"
  ON reservations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- payments: 관리자만 접근
CREATE POLICY "admin_all_payments"
  ON payments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6. 권한 부여
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON members TO authenticated;
GRANT SELECT ON reservations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON reservations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON payments TO authenticated;

-- ================================================
-- 방문자 통계 테이블 (별도 실행 — 기존 데이터 삭제 없음)
-- 위 DROP TABLE 구문들과 분리하여 이 블록만 따로 실행하세요.
-- ================================================

CREATE TABLE IF NOT EXISTS page_views (
  visitor_id uuid        NOT NULL,
  visited_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_insert_page_views"
  ON page_views FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "admin_select_page_views"
  ON page_views FOR SELECT TO authenticated USING (true);

GRANT INSERT ON page_views TO anon;
GRANT SELECT ON page_views TO authenticated;

-- ================================================
-- 수업 예약 요청 테이블 (사용자 → 관리자 승인)
-- 이 블록만 따로 실행하세요 (DROP 없음).
-- ================================================

CREATE TABLE IF NOT EXISTS reservation_requests (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  request_date date        NOT NULL,
  request_time time        NOT NULL,
  name         varchar(100) NOT NULL,
  phone        varchar(20)  NOT NULL,
  status       varchar(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE reservation_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_insert_requests"
  ON reservation_requests FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "admin_all_requests"
  ON reservation_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT INSERT ON reservation_requests TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON reservation_requests TO authenticated;

-- ================================================
-- 배너 테이블 (이 블록만 따로 실행하세요 — DROP 없음)
-- Supabase Storage: 대시보드 → Storage → New bucket
--   이름: banners / Public: ON  (이미지 업로드 기능 사용 시)
-- ================================================

CREATE TABLE IF NOT EXISTS banners (
  id         uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  sort_order integer      NOT NULL DEFAULT 0,
  image_url  text         NOT NULL,
  alt_text   varchar(200) DEFAULT '',
  subtitle   varchar(200) DEFAULT '',
  title      varchar(300) DEFAULT '',
  body       text         DEFAULT '',
  is_active  boolean      NOT NULL DEFAULT true,
  created_at timestamptz  DEFAULT now()
);

ALTER TABLE banners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_banners"
  ON banners FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin_all_banners"
  ON banners FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT ON banners TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON banners TO authenticated;

-- ================================================
-- Storage RLS 정책 (banners 버킷 — 이 블록만 따로 실행하세요)
-- 버킷을 먼저 생성한 후 실행하세요:
--   대시보드 → Storage → New bucket → 이름: banners / Public: ON
-- ================================================

CREATE POLICY "public read banners storage"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'banners');

CREATE POLICY "admin upload banners storage"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'banners');

CREATE POLICY "admin update banners storage"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'banners');

CREATE POLICY "admin delete banners storage"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'banners');

-- (선택) 기존 하드코딩 배너 초기 데이터 삽입
-- INSERT INTO banners (sort_order, image_url, alt_text, subtitle, title, body) VALUES
--   (1, 'images/open_banner2.png',    '채움 필라테스 오픈',   'open!',                     '채움 필라테스\n오픈',          '수업에 대해 궁금한 점은 전화, 문자, 카카오톡 채널\n또는 인스타그램 DM으로 편하게 문의해 주세요.'),
--   (2, 'images/banner2026111001.png','채움 필라테스',         '',                          '',                            ''),
--   (3, 'images/banner2026102503.png','클래식 필라테스',       'Classic Method Since 1926', '몸의 중심을\n바로 세우다',     '조셉 필라테스의 정통 메소드를 계승한\n채움 클래식 필라테스에 오신 것을 환영합니다.'),
--   (4, 'images/banner2026102501.png','리포머 필라테스',       'Apparatus',                 '클래식의 기준을 담은\nGRATZ 기구', 'Reformer · Cadillac · Ladder Barrel · Wunda Chair · High Chair · Baby Chair · Pedi Pole · Spine Corrector · Mini Barrel'),
--   (5, 'images/banner2026102502.png','채움 스튜디오',         'Our Studio',                '채움만의\n특별한 공간',         '정통 클래식 필라테스의 철학을 담아\n세심하게 설계된 채움의 스튜디오를 소개합니다.'),
--   (6, 'images/20261006.png',        '프라이빗 레슨',         'Private & Duet Sessions',   '나만을 위한\n맞춤 레슨',        '전문 강사와 1:1 또는 1:2 로\n체형과 목적에 맞는 개인 맞춤 수업.');
