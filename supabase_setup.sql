-- ================================================
-- 채움 클래식 필라테스 - Supabase DB 설정 v3
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.
-- ================================================

-- 기존 테이블 삭제 (있는 경우)
DROP TABLE IF EXISTS reservations CASCADE;
DROP TABLE IF EXISTS classes CASCADE;
DROP TABLE IF EXISTS class_slots CASCADE;
DROP TABLE IF EXISTS site_settings CASCADE;

-- 예약 테이블 (수업 등록 = 예약 등록)
CREATE TABLE reservations (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_name    varchar(100) NOT NULL,
  customer_phone   varchar(20),
  class_name       varchar(100) NOT NULL,
  start_time       time        NOT NULL,
  memo             text,
  status           varchar(20) DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),

  -- 단일 예약
  is_recurring     boolean     DEFAULT false,
  reservation_date date,

  -- 매주 반복 예약
  day_of_week      smallint    CHECK (day_of_week BETWEEN 0 AND 6),
  -- 0=일요일, 1=월요일, 2=화요일, 3=수요일, 4=목요일, 5=금요일, 6=토요일
  recurring_from   date,
  recurring_until  date,

  created_at       timestamptz DEFAULT now()
);

-- RLS 활성화
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

-- 공개: 수업명/시간 조회 가능 (메인 달력 표시용)
CREATE POLICY "public_read_reservations"
  ON reservations FOR SELECT TO anon, authenticated USING (true);

-- 관리자: 모든 작업 가능
CREATE POLICY "admin_all_reservations"
  ON reservations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 권한 부여
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON reservations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON reservations TO authenticated;
