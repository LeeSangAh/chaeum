#!/usr/bin/env node
// 정적 검증기 — 외부 의존성 없음 (Node 18+)
//
//   node harness/verify.mjs                     # 전체 검사
//   node harness/verify.mjs --files index.html  # 지정 파일만 (편집 직후 훅에서 사용)
//   node harness/verify.mjs --out <path.json>   # JSON 리포트 저장
//   --quiet  콘솔 출력 최소화
//
// 종료코드: 오류(error) 1건 이상이면 1, 아니면 0. 경고(warn)는 통과에 영향 없음.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT, GRAPH } from './lib/state.mjs';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const QUIET = args.includes('--quiet');
const OUT = opt('--out');
const ONLY = opt('--files')?.split(',').map((s) => s.trim().replace(/\\/g, '/')).filter(Boolean);

const P = GRAPH.project;
const IGNORE_DIRS = new Set(['.git', '.idea', '.claude', '.harness', 'harness', 'node_modules', '.vercel']);
const LARGE_IMAGE_BYTES = 1024 * 1024;
const findings = [];
const add = (level, check, file, line, message) => findings.push({ level, check, file, line: line ?? null, message });

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/^﻿/, '');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const lineAt = (text, idx) => text.slice(0, idx).split('\n').length;

function listFiles(dir = '', out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (e.isDirectory()) { if (!IGNORE_DIRS.has(e.name)) listFiles(path.posix.join(dir, e.name), out); }
    else out.push(path.posix.join(dir, e.name));
  }
  return out;
}

// HTML 주석 제거(줄 번호 유지)
const stripComments = (html) => html.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));

const ALL = listFiles();
const HTML = ALL.filter((f) => f.endsWith('.html') && !f.includes('/'));
const OWN_JS = ALL.filter((f) => f.startsWith('js/') && f.endsWith('.js') && !f.endsWith('.min.js') && f !== 'js/plugins.js' && f !== 'js/modernizr.js');
const targetHtml = ONLY ? HTML.filter((f) => ONLY.includes(f)) : HTML;
const targetJs = ONLY ? OWN_JS.filter((f) => ONLY.includes(f)) : OWN_JS;

// ───────────────────────── 스키마
let schemaText = '';
const tables = new Set();
const buckets = new Set();
if (exists(P.schemaFile)) {
  schemaText = read(P.schemaFile);
  for (const m of schemaText.matchAll(/create\s+(?:or\s+replace\s+)?(?:materialized\s+)?(?:table|view)\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?(\w+)"?/gi)) tables.add(m[1].toLowerCase());
  for (const m of schemaText.matchAll(/bucket_id\s*=\s*'([\w-]+)'/gi)) buckets.add(m[1]);
} else add('warn', 'schema', P.schemaFile, null, '스키마 파일이 없습니다');

// ───────────────────────── 참조 해석 (Vercel cleanUrls 반영)
function resolveRef(fromFile, ref) {
  let r = ref.split('#')[0].split('?')[0];
  if (!r) return { skip: true };
  try { r = decodeURI(r); } catch { /* keep */ }
  const base = r.startsWith('/') ? r.slice(1) : path.posix.join(path.posix.dirname(fromFile), r);
  const norm = path.posix.normalize(base).replace(/^\.\//, '');
  const candidates = norm === '' || norm === '.' ? ['index.html'] : [norm, `${norm}.html`, path.posix.join(norm, 'index.html')];
  const hit = candidates.find((c) => exists(c) && fs.statSync(path.join(ROOT, c)).isFile());
  return { path: hit ?? norm, ok: !!hit };
}
const isExternal = (ref) => /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref) || /\$\{|'\s*\+|"\s*\+|\{\{/.test(ref);

const referencedImages = new Map();

function checkRefs(file, text) {
  const re = /\b(?:[sS][rR][cC]|[hH][rR][eE][fF]|poster|data-src|content)\s*=\s*["']([^"']+)["']|(?<![\w.$])url\(\s*["']?([^"')]+)["']?\s*\)/g;
  for (const m of text.matchAll(re)) {
    const ref = (m[1] ?? m[2] ?? '').trim();
    if (!ref || isExternal(ref)) continue;
    // content= 는 경로처럼 보일 때만 (og:image 등)
    if (m[0].toLowerCase().startsWith('content') && !/\.(png|jpe?g|gif|svg|webp|ico)$/i.test(ref)) continue;
    const r = resolveRef(file, ref);
    if (r.skip) continue;
    const line = lineAt(text, m.index);
    if (!r.ok) add('error', 'broken-ref', file, line, `로컬 경로를 찾을 수 없음: ${ref}`);
    else if (/\.(png|jpe?g|gif|webp)$/i.test(r.path)) referencedImages.set(r.path, `${file}:${line}`);
  }
}

// ───────────────────────── 인라인 스크립트 문법
function checkScripts(file, text) {
  for (const m of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1];
    const code = m[2];
    if (/\bsrc\s*=/.test(attrs) || !code.trim()) continue;
    const type = (attrs.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1] ?? '').toLowerCase();
    const startLine = lineAt(text, m.index + m[0].indexOf('>') + 1);
    if (type.includes('json')) {
      try { JSON.parse(code); } catch (e) { add('error', 'jsonld', file, startLine, `JSON 파싱 오류: ${e.message}`); }
      continue;
    }
    if (type === 'module') { add('info', 'script', file, startLine, 'module 스크립트는 문법 검사 생략'); continue; }
    if (type && !type.includes('javascript')) continue;
    try { new vm.Script(code, { filename: file, lineOffset: startLine - 1 }); }
    catch (e) {
      const ln = (e.stack ?? '').match(new RegExp(`${file.replace('.', '\\.')}:(\\d+)`))?.[1];
      add('error', 'js-syntax', file, ln ? Number(ln) : startLine, `인라인 스크립트 문법 오류: ${e.message}`);
    }
  }
}

// ───────────────────────── Supabase 테이블/버킷 참조
function checkSupabase(file, text) {
  for (const m of text.matchAll(/(storage\s*\.\s*)?\.?from\(\s*['"]([\w-]+)['"]\s*\)/g)) {
    const name = m[2];
    const line = lineAt(text, m.index);
    if (m[1]) {
      if (!buckets.has(name)) add('warn', 'schema-drift', file, line, `Storage 버킷 '${name}' 이 ${P.schemaFile} 에 정의되어 있지 않음`);
    } else if (!tables.has(name.toLowerCase())) {
      add('warn', 'schema-drift', file, line, `테이블/뷰 '${name}' 가 ${P.schemaFile} 에 정의되어 있지 않음 (DB 에만 존재하면 스키마 파일에 추가 필요)`);
    }
  }
}

// ───────────────────────── 비밀키 노출
function checkSecrets(file, text) {
  if (/sb_secret_[A-Za-z0-9_-]+/.test(text)) add('error', 'secret', file, null, 'Supabase secret 키(sb_secret_...)가 클라이언트 코드에 포함됨');
  for (const m of text.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)) {
    try {
      const payload = JSON.parse(Buffer.from(m[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
      if (payload.role === 'service_role') add('error', 'secret', file, lineAt(text, m.index), 'service_role JWT 가 클라이언트 코드에 포함됨');
    } catch { /* not a jwt */ }
  }
}

// ───────────────────────── 관리자 페이지 보호
const robots = exists('robots.txt') ? read('robots.txt') : '';
const disallowed = [...robots.matchAll(/^\s*Disallow:\s*(\S+)/gim)].map((m) => m[1].replace(/\/$/, ''));
function checkAdmin(file, text) {
  if (P.authGuardedPages.includes(file) && !/auth\s*\.\s*(getSession|getUser)\s*\(/.test(text)) {
    add('error', 'auth-guard', file, null, '관리자 페이지에 인증 확인(auth.getSession/getUser)이 없음');
  }
  if (P.adminPages.includes(file)) {
    const clean = '/' + file.replace(/\.html$/, '');
    const noindex = /<meta[^>]+name=["']robots["'][^>]+noindex/i.test(text);
    const blocked = disallowed.some((d) => d && clean.startsWith(d));
    if (!noindex && !blocked) add('warn', 'seo-admin', file, null, `관리자 페이지가 검색엔진에 노출될 수 있음 (robots.txt Disallow 또는 <meta name="robots" content="noindex"> 필요)`);
  }
}

// ───────────────────────── 중복 id
function checkIds(file, text) {
  const seen = new Map();
  for (const m of text.matchAll(/\sid\s*=\s*["']([^"'${}]+)["']/g)) {
    const id = m[1];
    if (seen.has(id)) add('warn', 'dup-id', file, lineAt(text, m.index), `중복 id '${id}' (첫 등장 ${seen.get(id)}행)`);
    else seen.set(id, lineAt(text, m.index));
  }
}

// ───────────────────────── 실행
for (const f of targetHtml) {
  const text = stripComments(read(f));
  checkRefs(f, text);
  checkScripts(f, text);
  checkSupabase(f, text);
  checkSecrets(f, text);
  checkAdmin(f, text);
  checkIds(f, text);
}
for (const f of targetJs) {
  const text = read(f);
  try { new vm.Script(text, { filename: f }); } catch (e) { add('error', 'js-syntax', f, null, `문법 오류: ${e.message}`); }
  checkSupabase(f, text);
  checkSecrets(f, text);
}
if (!ONLY || ONLY.includes('css/style.css')) {
  if (exists('css/style.css')) checkRefs('css/style.css', read('css/style.css'));
}

if (!ONLY) {
  // 큰 이미지
  for (const [img, where] of referencedImages) {
    const size = fs.statSync(path.join(ROOT, img)).size;
    if (size > LARGE_IMAGE_BYTES) add('warn', 'large-image', img, null, `${(size / 1048576).toFixed(1)}MB — 로딩 지연 우려 (WebP/리사이즈 권장, 사용처 ${where})`);
  }
  // sitemap / robots
  if (exists('robots.txt') && !/^\s*Sitemap:/im.test(robots)) add('warn', 'seo', 'robots.txt', null, 'Sitemap 지시어 없음');
  if (exists('sitemap.xml')) {
    for (const m of read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const u = new URL(m[1]);
      if (!resolveRef('index.html', u.pathname).ok) add('error', 'seo', 'sitemap.xml', null, `sitemap 의 경로가 존재하지 않음: ${u.pathname}`);
    }
  }
  // CLAUDE.md 문서 드리프트
  if (exists('CLAUDE.md')) {
    const doc = read('CLAUDE.md');
    for (const t of tables) if (!doc.includes(t)) add('warn', 'doc-drift', 'CLAUDE.md', null, `스키마의 '${t}' 테이블이 CLAUDE.md 에 문서화되지 않음`);
    for (const h of HTML) if (!h.startsWith('naver') && !doc.includes(h)) add('warn', 'doc-drift', 'CLAUDE.md', null, `페이지 '${h}' 가 CLAUDE.md 에 문서화되지 않음`);
  }
}

// ───────────────────────── 리포트
const summary = {
  errors: findings.filter((f) => f.level === 'error').length,
  warnings: findings.filter((f) => f.level === 'warn').length,
  checkedFiles: [...targetHtml, ...targetJs],
};
const report = { tool: 'harness/verify.mjs', at: new Date().toISOString(), mode: ONLY ? 'files' : 'full', summary, findings };
if (OUT) {
  fs.mkdirSync(path.dirname(path.resolve(ROOT, OUT)), { recursive: true });
  fs.writeFileSync(path.resolve(ROOT, OUT), JSON.stringify(report, null, 2) + '\n', 'utf8');
}

if (!QUIET || summary.errors) {
  const icon = { error: '✖', warn: '⚠', info: 'ℹ' };
  for (const f of findings.filter((x) => x.level !== 'info' && (!QUIET || x.level === 'error'))) {
    console.log(`${icon[f.level]} [${f.check}] ${f.file}${f.line ? ':' + f.line : ''} — ${f.message}`);
  }
}
console.log(`verify: ${summary.errors ? 'FAIL' : 'PASS'} — 오류 ${summary.errors}, 경고 ${summary.warnings}, 대상 ${summary.checkedFiles.length}개 파일${OUT ? ` → ${OUT}` : ''}`);
process.exit(summary.errors ? 1 : 0);
