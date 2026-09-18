-- ================================================
-- 채움 클래식 필라테스 - Supabase DB 설정
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.
-- ================================================

-- 0. 사이트 설정 테이블 (시간표 직접 입력용)
CREATE TABLE site_settings (
  key   text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT 'null'
);
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_site_settings"
  ON site_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin_write_site_settings"
  ON site_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 기본 시간표 데이터
INSERT INTO site_settings (key, value) VALUES ('schedule', '{
  "rows": [
    {"time": "07:00", "cells": ["매트 기초", "", "매트 기초", "", "매트 기초", ""]},
    {"time": "09:00", "cells": ["리포머 그룹", "클래식 매트", "리포머 그룹", "클래식 매트", "리포머 그룹", "클래식 매트"]},
    {"time": "10:00", "cells": ["클래식 매트", "리포머 그룹", "클래식 매트", "리포머 그룹", "클래식 매트", "리포머 그룹"]},
    {"time": "11:00", "cells": ["", "재활 특강", "", "재활 특강", "", "전신 기구"]},
    {"time": "18:00", "cells": ["전신 기구", "리포머 그룹", "전신 기구", "리포머 그룹", "전신 기구", ""]},
    {"time": "19:00", "cells": ["클래식 매트", "클래식 매트", "클래식 매트", "클래식 매트", "클래식 매트", ""]},
    {"time": "20:00", "cells": ["리포머 그룹", "", "리포머 그룹", "", "", ""]}
  ]
}');

-- 1. 수업 슬롯 테이블 (주간 반복 시간표)
CREATE TABLE class_slots (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  day_of_week   smallint    NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  -- 0=월요일, 1=화요일, 2=수요일, 3=목요일, 4=금요일, 5=토요일, 6=일요일
  start_time    time        NOT NULL,
  class_name    varchar(100) NOT NULL,
  capacity      smallint    DEFAULT 10,
  is_active     boolean     DEFAULT true,
  created_at    timestamptz DEFAULT now()
);

-- 2. 고객 예약 테이블
CREATE TABLE reservations (
  id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  class_slot_id     uuid        NOT NULL REFERENCES class_slots(id) ON DELETE CASCADE,
  reservation_date  date        NOT NULL,
  customer_name     varchar(100) NOT NULL,
  customer_phone    varchar(20),
  memo              text,
  status            varchar(20) DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  created_at        timestamptz DEFAULT now()
);

-- 3. Row Level Security 활성화
ALTER TABLE class_slots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

-- 4. RLS 정책
-- class_slots: 누구나 읽기 가능, 로그인한 관리자만 쓰기 가능
CREATE POLICY "public_read_class_slots"
  ON class_slots FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "admin_insert_class_slots"
  ON class_slots FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "admin_update_class_slots"
  ON class_slots FOR UPDATE TO authenticated USING (true);

CREATE POLICY "admin_delete_class_slots"
  ON class_slots FOR DELETE TO authenticated USING (true);

-- reservations: 로그인한 관리자만 모든 작업 가능
CREATE POLICY "admin_all_reservations"
  ON reservations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ================================================
-- 5. 기존 시간표 샘플 데이터 (현재 사이트 하드코딩 내용)
-- ================================================
INSERT INTO class_slots (day_of_week, start_time, class_name, capacity) VALUES
-- 07:00
(0, '07:00', '매트 기초',10),
(2, '07:00', '매트 기초',10),
(4, '07:00', '매트 기초',10),
-- 09:00
(0, '09:00', '리포머 그룹',8),
(1, '09:00', '클래식 매트',10),
(2, '09:00', '리포머 그룹',8),
(3, '09:00', '클래식 매트',10),
(4, '09:00', '리포머 그룹',8),
(5, '09:00', '클래식 매트',10),
-- 10:00
(0, '10:00', '클래식 매트',10),
(1, '10:00', '리포머 그룹',8),
(2, '10:00', '클래식 매트',10),
(3, '10:00', '리포머 그룹',8),
(4, '10:00', '클래식 매트',10),
(5, '10:00', '리포머 그룹',8),
-- 11:00
(1, '11:00', '재활 특강',6),
(3, '11:00', '재활 특강',6),
(5, '11:00', '전신 기구',8),
-- 18:00
(0, '18:00', '전신 기구',8),
(1, '18:00', '리포머 그룹',8),
(2, '18:00', '전신 기구',8),
(3, '18:00', '리포머 그룹',8),
(4, '18:00', '전신 기구',8),
-- 19:00
(0, '19:00', '클래식 매트',10),
(1, '19:00', '클래식 매트',10),
(2, '19:00', '클래식 매트',10),
(3, '19:00', '클래식 매트',10),
(4, '19:00', '클래식 매트',10),
-- 20:00
(0, '20:00', '리포머 그룹',8),
(2, '20:00', '리포머 그룹',8);
