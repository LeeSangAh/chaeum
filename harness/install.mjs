#!/usr/bin/env node
// harness/claude-config/ → .claude/ 설치 (에이전트 6종, 커맨드, 훅 설정)
//   node harness/install.mjs          # 없는 파일만 설치, 다른 내용이면 건너뜀
//   node harness/install.mjs --force  # 덮어쓰기 (.claude/settings.local.json 은 절대 건드리지 않음)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/state.mjs';

const SRC = path.join(ROOT, 'harness', 'claude-config');
const DST = path.join(ROOT, '.claude');
const force = process.argv.includes('--force');
let installed = 0, skipped = 0, same = 0;

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const s = path.join(dir, e.name);
    if (e.isDirectory()) { walk(s); continue; }
    const rel = path.relative(SRC, s);
    const d = path.join(DST, rel);
    const data = fs.readFileSync(s);
    if (fs.existsSync(d)) {
      if (fs.readFileSync(d).equals(data)) { same++; continue; }
      if (!force) { console.log(`· 건너뜀(내용 다름, --force 로 덮어쓰기): .claude/${rel}`); skipped++; continue; }
    }
    fs.mkdirSync(path.dirname(d), { recursive: true });
    fs.writeFileSync(d, data);
    console.log(`✔ .claude/${rel.split(path.sep).join('/')}`);
    installed++;
  }
}
walk(SRC);
fs.mkdirSync(path.join(ROOT, '.harness', 'runs'), { recursive: true });
console.log(`\n설치 ${installed} / 동일 ${same} / 건너뜀 ${skipped}`);
console.log('Claude Code 를 이 폴더에서 다시 시작하면 훅과 에이전트가 적용됩니다. (/hooks, /agents 로 확인)');
