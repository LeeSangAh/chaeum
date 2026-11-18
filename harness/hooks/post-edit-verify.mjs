#!/usr/bin/env node
// PostToolUse 훅 — 소스 편집 직후 해당 파일만 빠르게 검증 (내부 루프)
// 오류가 있으면 exit 2 → stderr 가 Claude 에게 즉시 피드백됨
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ROOT, toRel } from '../lib/state.mjs';

const input = await new Promise((resolve) => {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { buf += c; });
  process.stdin.on('end', () => { try { resolve(JSON.parse(buf || '{}')); } catch { resolve({}); } });
});

const rel = toRel(input.tool_input?.file_path);
if (!rel || rel.startsWith('.harness/') || rel.startsWith('harness/')) process.exit(0);
if (!/\.(html|js|css)$/i.test(rel) || /\.min\.js$/.test(rel)) process.exit(0);

const r = spawnSync(process.execPath, [path.join(ROOT, 'harness', 'verify.mjs'), '--files', rel, '--quiet'], { cwd: ROOT, encoding: 'utf8' });
if (r.status !== 0) {
  process.stderr.write(`[harness verify] ${rel} 편집 결과 검증 실패 — 바로 수정하세요:\n${r.stdout}${r.stderr}`);
  process.exit(2);
}
process.exit(0);
