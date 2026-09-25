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
