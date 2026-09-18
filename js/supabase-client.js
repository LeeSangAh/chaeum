// ================================================
// Supabase 연결 설정
// 아래 두 값을 Supabase 대시보드 > Settings > API 에서 복사하세요.
// ================================================
const SUPABASE_URL = 'https://yvxzxzjimsqlmmmnjqcv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_1kDsnK-WlXWQSQdyRd_KjA_qFX0R8-M';

const _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
