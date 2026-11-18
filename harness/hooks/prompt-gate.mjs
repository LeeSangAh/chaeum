#!/usr/bin/env node
// UserPromptSubmit 훅 — 사람이 직접 입력한 승인/반려/bypass 명령을 처리
//   승인 G1 [코멘트]            (또는 /approve G1 ...)
//   반려 G2 <사유> [--to design] (또는 /reject G2 ...)
//   bypass on | bypass off
// 처리 결과는 stdout 으로 출력되어 Claude 의 컨텍스트에 추가된다.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ROOT } from '../lib/state.mjs';

const input = await new Promise((resolve) => {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { buf += c; });
  process.stdin.on('end', () => { try { resolve(JSON.parse(buf || '{}')); } catch { resolve({}); } });
});

const prompt = String(input.prompt ?? '').trim();
let cmd = null;
let m;
if ((m = prompt.match(/^(?:\/approve|승인)\s+(G[1-4])\b\s*([\s\S]*)$/i))) cmd = ['approve', m[1].toUpperCase(), ...splitArgs(m[2])];
else if ((m = prompt.match(/^(?:\/reject|반려)\s+(G[1-4])\b\s*([\s\S]*)$/i))) cmd = ['reject', m[1].toUpperCase(), ...splitArgs(m[2])];
else if ((m = prompt.match(/^(?:\/harness-)?bypass\s+(on|off)\s*$/i))) cmd = ['bypass', m[1].toLowerCase()];
if (!cmd) process.exit(0);

function splitArgs(s) {
  const out = [];
  const to = s.match(/\s*--to\s+(\w+)\s*$/);
  const body = to ? s.slice(0, to.index) : s;
  if (body.trim()) out.push(body.trim());
  if (to) out.push('--to', to[1]);
  return out;
}

const r = spawnSync(process.execPath, [path.join(ROOT, 'harness', 'gate.mjs'), ...cmd, '--actor', 'human'], { cwd: ROOT, encoding: 'utf8' });
const ok = r.status === 0;
console.log(`[harness] 사용자 명령 처리: ${cmd.slice(0, 2).join(' ')} → ${ok ? '성공' : '실패'}`);
console.log((r.stdout + r.stderr).trim());
if (ok && cmd[0] !== 'bypass') {
  console.log('\n지시: 위 결과에 따라 그래프 오케스트레이션 규칙(.claude/commands/graph.md)을 따라 다음 승인 게이트 직전까지 진행하세요.');
} else if (!ok) {
  console.log('\n지시: 처리 실패 이유를 사용자에게 알리고 진행하지 마세요.');
}
process.exit(0);
