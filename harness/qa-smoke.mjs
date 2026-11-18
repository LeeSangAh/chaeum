#!/usr/bin/env node
// 출시 QA 스모크 테스트
//
//   node harness/qa-smoke.mjs --out-dir .harness/runs/<id>            # 로컬 정적 서버로 테스트
//   node harness/qa-smoke.mjs --out-dir ... --base-url https://<vercel-preview-url>
//
// 1단계(HTTP): 모든 페이지 200 응답 확인 (cleanUrls 경로 포함)
// 2단계(브라우저, 선택): harness/ 에서 `npm install && npx playwright install chromium` 을 했다면
//   데스크톱/모바일 뷰포트로 각 페이지 로드 → 콘솔 오류·페이지 오류·실패 요청 수집, 스크린샷 저장,
//   관리자 페이지는 비로그인 상태에서 login 으로 리다이렉트되는지(인증 가드) 확인
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, GRAPH } from './lib/state.mjs';

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const OUT_DIR = path.resolve(ROOT, opt('--out-dir') ?? '.harness/qa');
let BASE = opt('--base-url')?.replace(/\/$/, '');
fs.mkdirSync(OUT_DIR, { recursive: true });

const P = GRAPH.project;
const pages = [...P.publicPages, ...P.adminPages];
const results = { at: new Date().toISOString(), baseUrl: null, mode: 'http', checks: [], summary: {} };
const fail = (page, check, detail) => results.checks.push({ page, check, ok: false, detail });
const pass = (page, check, detail) => results.checks.push({ page, check, ok: true, detail });

// ── 로컬 정적 서버 (Vercel cleanUrls 흉내, 배포 제외 경로 차단)
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.webp': 'image/webp', '.ico': 'image/x-icon' };
const DENY = /^\/(\.git|\.harness|harness|\.claude|\.idea|CLAUDE\.md)/;
let server = null;
if (!BASE) {
  server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (DENY.test(p)) { res.writeHead(404); return res.end(); }
    if (p.endsWith('.html')) { res.writeHead(308, { Location: p.replace(/\.html$/, '').replace(/\/index$/, '/') }); return res.end(); }
    const cands = p === '/' ? ['index.html'] : [p.slice(1), `${p.slice(1)}.html`, path.posix.join(p.slice(1), 'index.html')];
    const hit = cands.map((c) => path.join(ROOT, c)).find((f) => f.startsWith(ROOT) && fs.existsSync(f) && fs.statSync(f).isFile());
    if (!hit) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(hit).toLowerCase()] ?? 'application/octet-stream' });
    fs.createReadStream(hit).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
}
results.baseUrl = BASE;
const urlOf = (page) => `${BASE}/${page === 'index.html' ? '' : page.replace(/\.html$/, '')}`;

// ── 1단계: HTTP
for (const page of pages) {
  try {
    const r = await fetch(urlOf(page), { redirect: 'follow' });
    (r.ok ? pass : fail)(page, 'http', `${r.status} ${urlOf(page)}`);
  } catch (e) { fail(page, 'http', String(e)); }
}
for (const p of ['/robots.txt', '/sitemap.xml']) {
  try { const r = await fetch(BASE + p); (r.ok ? pass : fail)(p, 'http', String(r.status)); } catch (e) { fail(p, 'http', String(e)); }
}
for (const p of ['/.harness/state.json', '/harness/graph.json', '/CLAUDE.md']) {
  try { const r = await fetch(BASE + p); (r.status === 404 ? pass : fail)(p, 'not-exposed', `${r.status} (404 이어야 함)`); } catch { /* ignore */ }
}

// ── 2단계: 브라우저
let chromium = null;
try { chromium = createRequire(path.join(ROOT, 'harness', 'package.json'))('playwright').chromium; } catch { /* not installed */ }
if (chromium) {
  results.mode = 'browser';
  const shots = path.join(OUT_DIR, 'screenshots');
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch();
  const viewports = { desktop: { width: 1366, height: 900 }, mobile: { width: 390, height: 844 } };
  for (const [vp, size] of Object.entries(viewports)) {
    const ctx = await browser.newContext({ viewport: size, locale: 'ko-KR' });
    for (const page of pages) {
      const pg = await ctx.newPage();
      const errors = [];
      pg.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
      pg.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      pg.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ''}`));
      pg.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('favicon')) errors.push(`http ${r.status()}: ${r.url()}`); });
      try {
        await pg.goto(urlOf(page), { waitUntil: 'networkidle', timeout: 20000 });
        await pg.waitForTimeout(800);
        if (P.authGuardedPages.includes(page)) {
          const ok = /\/login/.test(pg.url());
          (ok ? pass : fail)(page, `auth-redirect:${vp}`, `비로그인 접근 → ${pg.url()}`);
        }
        await pg.screenshot({ path: path.join(shots, `${page.replace('.html', '')}-${vp}.png`), fullPage: true });
        if (vp === 'mobile') {
          const overflow = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          (overflow > 2 ? fail : pass)(page, 'mobile-overflow', `가로 넘침 ${overflow}px`);
        }
      } catch (e) { errors.push(`goto: ${e.message}`); }
      (errors.length ? fail : pass)(page, `runtime:${vp}`, errors.length ? errors.slice(0, 20) : '오류 없음');
      await pg.close();
    }
    await ctx.close();
  }
  await browser.close();
} else {
  results.note = '브라우저 단계 생략 — harness 폴더에서 `npm install && npx playwright install chromium` 실행 시 활성화';
}

server?.close();
const failed = results.checks.filter((c) => !c.ok);
results.summary = { total: results.checks.length, failed: failed.length, mode: results.mode };
fs.writeFileSync(path.join(OUT_DIR, 'qa-smoke.json'), JSON.stringify(results, null, 2) + '\n', 'utf8');
for (const c of failed) console.log(`✖ [${c.check}] ${c.page} — ${Array.isArray(c.detail) ? c.detail.join('\n    ') : c.detail}`);
if (results.note) console.log(`ℹ ${results.note}`);
console.log(`qa-smoke: ${failed.length ? 'FAIL' : 'PASS'} — ${results.checks.length}건 중 실패 ${failed.length} (${results.mode}) → ${path.relative(ROOT, path.join(OUT_DIR, 'qa-smoke.json'))}`);
process.exit(failed.length ? 1 : 0);
