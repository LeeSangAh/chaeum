-- ================================================
-- 채움 클래식 필라테스 - Supabase DB 설정 v2
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.
-- ================================================

-- 1. 수업 테이블 (단일 수업 + 주간 반복 수업 통합)
CREATE TABLE classes (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  start_time      time        NOT NULL,
  class_name      varchar(100) NOT NULL,
  capacity        smallint    DEFAULT 10,
  is_recurring    boolean     DEFAULT false,

  -- 단일 수업 (is_recurring = false)
  class_date      date,

  -- 주간 반복 수업 (is_recurring = true)
  day_of_week     smallint    CHECK (day_of_week BETWEEN 0 AND 6),
  -- 0=일요일, 1=월요일, 2=화요일, 3=수요일, 4=목요일, 5=금요일, 6=토요일
  recurring_from  date,
  recurring_until date,

  is_active       boolean     DEFAULT true,
  created_at      timestamptz DEFAULT now()
);

-- 2. 예약 테이블
CREATE TABLE reservations (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id         uuid        NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  reservation_date date        NOT NULL,
  customer_name    varchar(100) NOT NULL,
  customer_phone   varchar(20),
  memo             text,
  status           varchar(20) DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  created_at       timestamptz DEFAULT now()
);

-- 3. Row Level Security 활성화
ALTER TABLE classes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

-- 4. RLS 정책
-- classes: 누구나 읽기, 로그인한 관리자만 쓰기
CREATE POLICY "public_read_classes"
  ON classes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin_insert_classes"
  ON classes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "admin_update_classes"
  ON classes FOR UPDATE TO authenticated USING (true);
CREATE POLICY "admin_delete_classes"
  ON classes FOR DELETE TO authenticated USING (true);

-- reservations: 로그인한 관리자만 모든 작업 가능
CREATE POLICY "admin_all_reservations"
  ON reservations FOR ALL TO authenticated USING (true) WITH CHECK (true);
