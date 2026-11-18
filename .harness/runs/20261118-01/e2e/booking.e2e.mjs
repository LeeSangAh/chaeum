// E2E: 예약 신청 개선(B·C·D·E) — Supabase 를 가짜 클라이언트로 대체해 브라우저에서 동작 검증
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.argv[2];
const OUT = process.argv[3];
fs.mkdirSync(OUT, { recursive: true });

const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const now = new Date();
const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
const plus2 = new Date(now); plus2.setDate(now.getDate() + 2);
let sat = new Date(now); while (sat.getDay() !== 6 || sat <= now) sat.setDate(sat.getDate() + 1);

const FAKE = {
  reservations: [
    { start_time: '10:00:00', is_recurring: false, reservation_date: fmt(tomorrow), day_of_week: null, recurring_from: null, recurring_until: null },
    { start_time: '19:00:00', is_recurring: true, reservation_date: null, day_of_week: plus2.getDay(), recurring_from: fmt(now), recurring_until: fmt(new Date(now.getTime() + 30 * 864e5)) },
  ],
  reservation_requests: [
    { id: 'r1', request_date: fmt(tomorrow), request_time: '14:00:00', name: '홍길동', phone: '010-1234-5678', status: 'pending', created_at: new Date().toISOString() },
  ],
};

const STUB = `
window.__ops = [];
(function(){
  const FAKE = ${JSON.stringify(FAKE)};
  function q(table){
    const st = { table, op:'select', single:false, payload:null };
    const api = {
      select(){ return api; }, eq(){ return api; }, neq(){ return api; }, order(){ return api; }, limit(){ return api; },
      gte(){ return api; }, lte(){ return api; }, in(){ return api; }, range(){ return api; },
      single(){ st.single = true; return api; }, maybeSingle(){ st.single = true; return api; },
      insert(p){ st.op='insert'; st.payload=p; window.__ops.push({table, op:'insert', payload:p}); return api; },
      update(p){ st.op='update'; st.payload=p; window.__ops.push({table, op:'update', payload:p}); return api; },
      delete(){ st.op='delete'; return api; },
      then(res, rej){
        let data;
        if (st.op === 'select') data = (FAKE[table] || []).slice();
        else data = st.single ? { id: 'new-' + table } : null;
        if (st.single && Array.isArray(data)) data = data[0] || null;
        return Promise.resolve({ data, error: null, count: Array.isArray(data) ? data.length : 0 }).then(res, rej);
      }
    };
    return api;
  }
  window.supabase = { createClient(){ return {
    from: q,
    storage: { from(){ return { getPublicUrl(){ return { data:{ publicUrl:'' } }; }, upload: async()=>({data:{},error:null}) }; } },
    auth: { getSession: async()=>({ data:{ session:{ user:{ email:'admin@test' } } } }), signOut: async()=>({}), signInWithPassword: async()=>({data:{},error:null}) }
  }; } };
})();`;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.xml': 'application/xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const cands = p === '/' ? ['index.html'] : [p.slice(1), p.slice(1) + '.html'];
  const hit = cands.map((c) => path.join(ROOT, c)).find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
  if (!hit) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(hit)] ?? 'application/octet-stream' });
  fs.createReadStream(hit).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ' — ' + detail : ''}`); };

const browser = await chromium.launch();
async function newPage(viewport) {
  const ctx = await browser.newContext({ viewport, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    if (u.includes('supabase-js')) return route.fulfill({ status: 200, contentType: 'text/javascript', body: STUB });
    if (u.includes('roughmapLoader')) return route.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.daum={roughmap:{Lander:function(){return{render(){}}}}};' });
    return route.fulfill({ status: 200, body: '' });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { page, errors, ctx };
}

// ── 1. index: 페이지 오류 없음 (AC-12)
{
  const { page, errors } = await newPage({ width: 1366, height: 900 });
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForTimeout(800);
  const relevant = errors.filter((e) => !/plugins|jQuery|\$ is not|Swiper|chocolat/i.test(e));
  check('AC-12 index 로드 시 페이지 오류 없음', relevant.length === 0, relevant.join(' | ') || `전체 ${errors.length}건(템플릿 플러그인 제외)`);

  // 하단 개인정보처리방침 링크, FAQ 취소 규정
  check('AC-2 하단 개인정보처리방침 링크', await page.locator('#footer-bottom a[href="privacy"]').count() === 1);
  const faq = await page.locator('#flush-collapseSix [data-chaeum-policy] li').allTextContents();
  check('AC-8 FAQ 취소 규정 (설정 파일 기준 3줄)', faq.length === 3 && faq[1].includes('1회 차감'), faq.join(' / '));

  // ── 2. 예약 모달
  await page.evaluate(() => new bootstrap.Modal(document.getElementById('reservationRequestModal')).show());
  await page.waitForTimeout(600);
  const pol = await page.locator('#reservationRequestModal [data-chaeum-policy] li').count();
  check('AC-8 예약 창 취소 규정 표시', pol === 3);
  check('수업종류/요청사항 입력 없음 (G2 조건)', await page.locator('#reqLessonType, #reqNote, textarea#reqNote').count() === 0);

  const opts = async () => page.$$eval('#reqTime option', (os) => os.filter((o) => o.value).map((o) => ({ v: o.value, d: o.disabled, t: o.textContent })));
  // 오늘: 지난 시간 비활성
  let today = await opts();
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const pastOk = today.every((o) => { const [h, m] = o.v.split(':').map(Number); return (h * 60 + m <= nowMin) ? o.d : true; });
  check('AC-5 오늘 지난 시간 비활성', pastOk && today.length === 29, `옵션 ${today.length}개, 범위 ${today[0]?.v}~${today.at(-1)?.v}`);

  // 내일: 10:00 확정 → 09:30·10:00·10:30 마감, 09:00·11:00 가능
  await page.fill('#reqDate', fmt(tomorrow)); await page.dispatchEvent('#reqDate', 'change'); await page.waitForTimeout(300);
  let o = Object.fromEntries((await opts()).map((x) => [x.v, x]));
  check('AC-5 예약된 시간 50분 겹침 마감', o['09:30'].d && o['10:00'].d && o['10:30'].d && !o['09:00'].d && !o['11:00'].d && o['10:00'].t.includes('마감'),
    `09:00=${o['09:00'].d} 09:30=${o['09:30'].d} 10:00=${o['10:00'].d} 10:30=${o['10:30'].d} 11:00=${o['11:00'].d}`);
  // 모레: 반복 예약 19:00
  await page.fill('#reqDate', fmt(plus2)); await page.dispatchEvent('#reqDate', 'change'); await page.waitForTimeout(300);
  o = Object.fromEntries((await opts()).map((x) => [x.v, x]));
  check('AC-5 반복 예약도 마감 반영', o['19:00'].d && o['18:30'].d && !o['18:00'].d && !o['20:00'].d);
  // 토요일 선택 가능
  await page.fill('#reqDate', fmt(sat)); await page.dispatchEvent('#reqDate', 'change'); await page.waitForTimeout(300);
  const satOpts = await opts();
  check('토·일·공휴일 선택 가능 (G2 조건)', satOpts.filter((x) => !x.d).length >= 20, `${fmt(sat)} 가능 ${satOpts.filter((x) => !x.d).length}개`);

  // ── 3. 휴대번호 형식
  await page.click('#reqPhone'); await page.keyboard.type('01012345678');
  check('AC-6 휴대번호 자동 형식', (await page.inputValue('#reqPhone')) === '010-1234-5678', await page.inputValue('#reqPhone'));

  // ── 4. 동의 없이 신청 불가
  await page.selectOption('#reqTime', '11:00');
  await page.fill('#reqName', '테스트');
  await page.click('#reqSubmitBtn'); await page.waitForTimeout(300);
  const msg1 = await page.textContent('#reqMsg');
  let ops = await page.evaluate(() => window.__ops.filter((x) => x.table === 'reservation_requests'));
  check('AC-1 동의 없으면 신청 불가', msg1.includes('동의') && ops.length === 0, msg1);

  // 잘못된 번호
  await page.fill('#reqPhone', '02-123-4567');
  await page.check('#reqAgree');
  await page.click('#reqSubmitBtn'); await page.waitForTimeout(300);
  check('AC-6 휴대폰 형식 아니면 거부', (await page.textContent('#reqMsg')).includes('010-0000-0000'));

  // 정상 신청
  await page.fill('#reqPhone', '');
  await page.click('#reqPhone'); await page.keyboard.type('01098765432');
  await page.click('#reqAgreeToggle');
  check('B 동의 내용 보기 (보유기간 표기)', (await page.textContent('#reqAgreeDetail')).includes('파기 요청 시까지'));
  await page.screenshot({ path: path.join(OUT, 'booking-modal-desktop.png') });
  await page.click('#reqSubmitBtn'); await page.waitForTimeout(500);
  ops = await page.evaluate(() => window.__ops.filter((x) => x.table === 'reservation_requests'));
  const p = ops[0]?.payload ?? {};
  check('신청 저장 (기존 컬럼만, DB 변경 불필요)', ops.length === 1 && p.phone === '010-9876-5432' && p.request_time === '11:00:00' && Object.keys(p).sort().join(',') === 'name,phone,request_date,request_time', JSON.stringify(p));
  check('신청 완료 문구', (await page.textContent('#reqSuccess')).includes('문자 안내'));
}

// ── 5. 모바일 레이아웃
{
  const { page } = await newPage({ width: 390, height: 844 });
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.evaluate(() => new bootstrap.Modal(document.getElementById('reservationRequestModal')).show());
  await page.waitForTimeout(600);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('AC-11 모바일 가로 넘침 없음', overflow <= 2, `${overflow}px`);
  await page.screenshot({ path: path.join(OUT, 'booking-modal-mobile.png'), fullPage: false });
}

// ── 6. privacy 페이지
{
  const { page, errors } = await newPage({ width: 390, height: 844 });
  const r = await page.goto(BASE + '/privacy', { waitUntil: 'load' });
  const txt = await page.textContent('body');
  const need = ['수집', '목적', '보유', '파기', '위탁', '권리', '보호책임자', '적용'];
  check('AC-2 /privacy 페이지 내용', r.status() === 200 && need.every((k) => txt.includes(k)) && errors.length === 0, need.filter((k) => !txt.includes(k)).join(','));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('privacy 모바일 가로 넘침 없음', overflow <= 2, `${overflow}px`);
  await page.screenshot({ path: path.join(OUT, 'privacy-mobile.png'), fullPage: true });
}

// ── 7. admin 승인/거절 안내 문자 (E)
{
  const { page, errors } = await newPage({ width: 1366, height: 900 });
  page.on('dialog', (d) => d.accept());
  await page.goto(BASE + '/admin', { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  await page.evaluate(() => approveRequest('r1'));
  await page.waitForTimeout(800);
  const vis = await page.isVisible('#smsModal');
  const text = await page.inputValue('#smsText').catch(() => '');
  const href = await page.getAttribute('#smsSendLink', 'href').catch(() => '');
  const d = tomorrow; const dow = '일월화수목금토'[d.getDay()];
  check('AC-9 승인 후 안내 문자 창', vis && text.includes('홍길동') && text.includes(`${d.getMonth() + 1}월 ${d.getDate()}일(${dow})`) && text.includes('14:00') && text.includes('확정'), text);
  check('AC-9 문자 보내기 링크', href.startsWith('sms:01012345678?body='), href.slice(0, 40));
  await page.fill('#smsText', '수정한 문구');
  check('AC-9 문구 수정 시 링크 갱신', (await page.getAttribute('#smsSendLink', 'href')).endsWith(encodeURIComponent('수정한 문구')));
  await page.screenshot({ path: path.join(OUT, 'admin-sms-approve.png') });
  const ins = await page.evaluate(() => window.__ops.filter((x) => x.table === 'reservations' && x.op === 'insert').map((x) => x.payload));
  check('AC-10 승인 시 reservations 에 요청 정보 미복사', ins.length === 1 && !('memo' in ins[0]), JSON.stringify(ins[0]));
  await page.evaluate(() => bootstrap.Modal.getInstance(document.getElementById('smsModal')).hide());
  await page.waitForTimeout(500);
  await page.evaluate(() => { pendingRequests = [{ id: 'r1', request_date: '2026-12-01', request_time: '09:00:00', name: '김철수', phone: '010-5555-6666' }]; return rejectRequest('r1'); });
  await page.waitForTimeout(800);
  const rt = await page.inputValue('#smsText');
  check('AC-9 거절 안내 문자', rt.includes('김철수') && rt.includes('12월 1일(화)') && rt.includes('확정이 어렵습니다'), rt);
  check('admin 페이지 오류 없음', errors.length === 0, errors.join(' | '));
}

await browser.close();
server.close();
const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(OUT, 'e2e-booking.json'), JSON.stringify({ at: new Date().toISOString(), total: results.length, failed: failed.length, results }, null, 2));
console.log(`\nE2E: ${failed.length ? 'FAIL' : 'PASS'} — ${results.length - failed.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);
