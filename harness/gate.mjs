#!/usr/bin/env node
// 그래프 엔지니어링 상태머신 CLI
//
//   node harness/gate.mjs status [--json|--brief]
//   node harness/gate.mjs start "<작업 제목>"
//   node harness/gate.mjs complete <phase> [--result fail] [--note "..."]
//   node harness/gate.mjs history
//   node harness/gate.mjs abort "<사유>"
//
// 사람 전용 (에이전트의 Bash 호출은 guard 훅이 차단, 사용자 프롬프트 훅이 대신 실행):
//   node harness/gate.mjs approve <G1..G4> [코멘트]
//   node harness/gate.mjs reject  <G1..G4> <사유> [--to <phase>]
//   node harness/gate.mjs bypass on|off
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  ROOT, GRAPH, RUNS_DIR, loadState, saveState, activeRun, runDir,
  findEdge, isGate, labelOf, nowKST,
} from './lib/state.mjs';

const PLACEHOLDER = 'TEMPLATE-PLACEHOLDER';
const MIN_ARTIFACT_BYTES = 200;

function die(msg, code = 1) {
  console.error(`✖ ${msg}`);
  process.exit(code);
}

function parseFlags(args) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('--')) { flags[key] = next; i++; }
      else flags[key] = true;
    } else rest.push(a);
  }
  return { flags, rest };
}

function rel(p) { return path.relative(ROOT, p).split(path.sep).join('/'); }

function pushHistory(run, entry) {
  run.history.push({ at: nowKST(), ...entry });
}

function requireRun(state) {
  const run = activeRun(state);
  if (!run) die('진행 중인 그래프 실행이 없습니다. 먼저 `node harness/gate.mjs start "<제목>"` 으로 시작하세요.');
  return run;
}

function checkArtifact(run, file) {
  const p = path.join(runDir(run.id), file);
  if (!fs.existsSync(p)) return `산출물 없음: ${rel(p)}`;
  const text = fs.readFileSync(p, 'utf8');
  if (Buffer.byteLength(text) < MIN_ARTIFACT_BYTES) return `산출물이 너무 짧음(<${MIN_ARTIFACT_BYTES}B): ${rel(p)}`;
  if (text.includes(PLACEHOLDER)) return `템플릿 placeholder 가 남아 있음: ${rel(p)}`;
  return null;
}

function nextHint(run) {
  const node = run.phase;
  if (isGate(node)) {
    const g = GRAPH.gates[node];
    const dir = rel(runDir(run.id));
    const files = g.review.map((f) => `   - ${dir}/${f}`).join('\n');
    const rejectEdge = findEdge(node, 'reject');
    const alts = [rejectEdge?.to, ...(rejectEdge?.alternatives ?? [])].filter(Boolean).join(' | ');
    return [
      `⏸  [${node} ${g.label}] 사람 승인 대기`,
      `   검토 자료:`,
      files,
      `   승인:  승인 ${node} [코멘트]`,
      `   반려:  반려 ${node} <사유> [--to ${alts}]`,
    ].join('\n');
  }
  const ph = GRAPH.phases[node];
  if (node === 'deploy') {
    return `▶ 배포 단계: release 브랜치를 ${GRAPH.project.productionBranch} 에 병합 후 push → 완료 후 \`node harness/gate.mjs complete deploy\``;
  }
  if (node === 'released') return '✔ 실행 완료. 새 작업은 `/graph <요구사항>` 으로 시작하세요.';
  const art = ph.artifact ? `${rel(runDir(run.id))}/${ph.artifact}` : '-';
  let loop = '';
  if (node === 'develop' || node === 'verify') loop = ` (개발⇄검증 루프 ${run.devLoop + 1}/${GRAPH.maxDevLoops})`;
  return `▶ 현재 단계: ${ph.label}${loop} — 담당 에이전트: ${ph.agent} — 산출물: ${art}\n  완료 시: node harness/gate.mjs complete ${node}`;
}

function moveTo(run, to, reason) {
  const from = run.phase;
  run.phase = to;
  if (isGate(to)) {
    run.gates[to] = { status: 'pending', requestedAt: nowKST(), ...(run.gates[to]?.rounds ? { rounds: run.gates[to].rounds } : {}) };
  }
  pushHistory(run, { event: 'transition', from, to, reason });
}

// ───────────────────────────── commands
function cmdStatus(flags) {
  const state = loadState();
  const run = activeRun(state);
  if (flags.json) {
    console.log(JSON.stringify({
      bypass: !!state.bypass,
      run: run ? { ...run, dir: rel(runDir(run.id)) } : null,
    }, null, 2));
    return;
  }
  if (flags.brief) {
    if (!run) { console.log(`[harness] 진행 중인 실행 없음${state.bypass ? ' (⚠ bypass ON)' : ''}. 코드 변경은 /graph 로 시작하세요.`); return; }
    console.log(`[harness] 실행 ${run.id} "${run.title}" — 현재: ${labelOf(run.phase)}${state.bypass ? ' (⚠ bypass ON)' : ''}\n${nextHint(run)}`);
    return;
  }
  console.log(`bypass: ${state.bypass ? 'ON ⚠ (가드 해제됨)' : 'off'}`);
  if (!run) { console.log('진행 중인 실행 없음'); return; }
  console.log(`실행: ${run.id}  "${run.title}"`);
  console.log(`폴더: ${rel(runDir(run.id))}`);
  const order = ['research', 'G1', 'plan', 'design', 'G2', 'develop', 'verify', 'G3', 'release_qa', 'G4', 'deploy', 'released'];
  const idx = order.indexOf(run.phase);
  console.log(order.map((n, i) => {
    const mark = i < idx ? '✔' : i === idx ? '▶' : '·';
    const g = isGate(n) && run.gates[n]?.status ? `(${run.gates[n].status})` : '';
    return `${mark} ${labelOf(n)}${g}`;
  }).join('  →  '));
  console.log('');
  console.log(nextHint(run));
}

function cmdStart(rest, flags) {
  const title = rest.join(' ').trim();
  if (!title) die('작업 제목이 필요합니다: start "<제목>"');
  const state = loadState();
  const cur = activeRun(state);
  if (cur && cur.phase !== 'released' && !flags.force) {
    die(`이미 진행 중인 실행이 있습니다: ${cur.id} (${labelOf(cur.phase)}). 중단하려면 abort 를 사용하세요.`);
  }
  const d = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, '');
  const sameDay = Object.keys(state.runs).filter((k) => k.startsWith(d)).length;
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
  const id = `${d}-${String(sameDay + 1).padStart(2, '0')}${slug ? '-' + slug : ''}`;
  fs.mkdirSync(runDir(id), { recursive: true });
  const run = {
    id, title, phase: 'research', createdAt: nowKST(), devLoop: 0,
    gates: {}, history: [],
  };
  pushHistory(run, { event: 'start', to: 'research' });
  state.runs[id] = run;
  state.activeRun = id;
  saveState(state);
  fs.writeFileSync(path.join(runDir(id), '00-request.md'), `# 요구사항\n\n${title}\n\n- 시작: ${run.createdAt}\n`, 'utf8');
  console.log(`✔ 실행 시작: ${id}`);
  console.log(nextHint(run));
}

function runVerify(run) {
  const out = path.join(runDir(run.id), 'verify.json');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'harness', 'verify.mjs'), '--out', out, '--quiet'], {
    cwd: ROOT, encoding: 'utf8',
  });
  let summary = null;
  try { summary = JSON.parse(fs.readFileSync(out, 'utf8')).summary; } catch { /* ignore */ }
  return { pass: r.status === 0, summary, stdout: r.stdout, stderr: r.stderr };
}

function cmdComplete(rest, flags) {
  const state = loadState();
  const run = requireRun(state);
  const phase = rest[0];
  if (!phase) die('완료할 단계를 지정하세요: complete <phase>');
  if (isGate(run.phase)) die(`현재 ${labelOf(run.phase)} 게이트에서 사람 승인 대기 중입니다. 에이전트는 진행할 수 없습니다.`);
  if (phase !== run.phase) die(`현재 단계는 '${run.phase}' 입니다. '${phase}' 를 완료할 수 없습니다.`);

  const ph = GRAPH.phases[phase];
  if (ph.artifact) {
    const err = checkArtifact(run, ph.artifact);
    if (err) die(err);
  }

  if (phase === 'verify') {
    const v = runVerify(run);
    const forcedFail = flags.result === 'fail';
    const pass = v.pass && !forcedFail;
    const s = v.summary ? `오류 ${v.summary.errors} / 경고 ${v.summary.warnings}` : '요약 없음';
    run.verifications = run.verifications ?? [];
    run.verifications.push({ at: nowKST(), loop: run.devLoop + 1, automated: v.pass ? 'pass' : 'fail', reviewer: forcedFail ? 'fail' : 'pass', summary: v.summary, note: flags.note ?? null });
    if (pass) {
      moveTo(run, findEdge('verify', 'pass').to, `검증 통과 (${s})`);
      saveState(state);
      console.log(`✔ 검증 통과 (${s})`);
    } else {
      run.devLoop += 1;
      const why = forcedFail ? `검증자 판정 fail${flags.note ? ': ' + flags.note : ''}` : `자동 검증 실패 (${s})`;
      if (run.devLoop >= GRAPH.maxDevLoops) {
        moveTo(run, 'G3', `루프 한도(${GRAPH.maxDevLoops}) 도달 — 사람 판단 필요: ${why}`);
        run.gates.G3.escalated = true;
        saveState(state);
        console.log(`⚠ 개발⇄검증 루프 ${GRAPH.maxDevLoops}회 실패 → G3 에스컬레이션 (사람 판단 필요)`);
      } else {
        moveTo(run, findEdge('verify', 'fail').to, why);
        saveState(state);
        console.log(`↺ ${why} → 개발로 되돌림 (루프 ${run.devLoop + 1}/${GRAPH.maxDevLoops})`);
        console.log(`  검증 결과: ${path.relative(ROOT, path.join(runDir(run.id), 'verify.json'))}`);
      }
    }
    console.log(nextHint(run));
    return;
  }

  if (phase === 'release_qa') {
    const qa = path.join(runDir(run.id), 'qa-smoke.json');
    if (!fs.existsSync(qa)) die(`QA 스모크 결과가 없습니다: ${rel(qa)} (node harness/qa-smoke.mjs --out-dir ${rel(runDir(run.id))})`);
  }

  if (phase === 'deploy') {
    const prod = GRAPH.project.productionBranch;
    const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
    const remote = spawnSync('git', ['rev-parse', `origin/${prod}`], { cwd: ROOT, encoding: 'utf8' });
    if (head.status === 0 && remote.status === 0 && head.stdout.trim() !== remote.stdout.trim() && !flags.confirm) {
      die(`HEAD(${head.stdout.trim().slice(0, 7)}) 가 origin/${prod}(${remote.stdout.trim().slice(0, 7)}) 와 다릅니다. push 가 끝났는지 확인하세요. (확실하면 --confirm)`);
    }
    run.releasedAt = nowKST();
    run.releasedCommit = head.status === 0 ? head.stdout.trim() : null;
  }

  const edge = findEdge(phase, null);
  if (!edge) die(`'${phase}' 에서 나가는 자동 엣지가 없습니다.`);
  moveTo(run, edge.to, flags.note ?? `${ph.label} 완료`);
  saveState(state);
  console.log(`✔ ${ph.label} 완료 → ${labelOf(edge.to)}`);
  console.log(nextHint(run));
}

function cmdDecide(kind, rest, flags) {
  const state = loadState();
  const run = requireRun(state);
  const gate = (rest[0] ?? '').toUpperCase();
  if (!isGate(gate)) die(`게이트를 지정하세요 (G1~G4). 입력: '${rest[0] ?? ''}'`);
  if (run.phase !== gate) die(`현재 승인 대기 게이트는 ${isGate(run.phase) ? run.phase : '없음'} 입니다 (현재 단계: ${labelOf(run.phase)}).`);
  const comment = rest.slice(1).join(' ').trim();
  const g = run.gates[gate];
  g.rounds = (g.rounds ?? 0) + 1;

  if (kind === 'approve') {
    Object.assign(g, { status: 'approved', decidedAt: nowKST(), comment: comment || null, actor: flags.actor ?? 'cli' });
    const to = findEdge(gate, 'approve').to;
    if (to === 'develop' || to === 'release_qa') run.devLoop = run.devLoop ?? 0;
    moveTo(run, to, `${gate} 승인${comment ? ': ' + comment : ''}`);
    saveState(state);
    console.log(`✔ ${gate} ${GRAPH.gates[gate].label} — 승인됨`);
  } else {
    if (!comment) die('반려 사유가 필요합니다: 반려 G2 <사유>');
    const edge = findEdge(gate, 'reject');
    let to = edge.to;
    if (flags.to) {
      const allowed = [edge.to, ...(edge.alternatives ?? [])];
      if (!allowed.includes(flags.to)) die(`--to 는 ${allowed.join(', ')} 중 하나여야 합니다.`);
      to = flags.to;
    }
    Object.assign(g, { status: 'rejected', decidedAt: nowKST(), comment, actor: flags.actor ?? 'cli' });
    if (to === 'develop') run.devLoop = 0;
    run.feedback = run.feedback ?? [];
    run.feedback.push({ gate, at: nowKST(), to, comment });
    fs.appendFileSync(path.join(runDir(run.id), 'feedback.md'), `\n## ${gate} 반려 (${nowKST()}) → ${to}\n\n${comment}\n`, 'utf8');
    moveTo(run, to, `${gate} 반려: ${comment}`);
    saveState(state);
    console.log(`↺ ${gate} 반려 → ${labelOf(to)} 로 되돌림. 사유는 ${rel(runDir(run.id))}/feedback.md 에 기록됨`);
  }
  console.log(nextHint(run));
}

function cmdAbort(rest) {
  const state = loadState();
  const run = requireRun(state);
  const reason = rest.join(' ').trim() || '사유 없음';
  pushHistory(run, { event: 'abort', from: run.phase, reason });
  run.phase = 'released';
  run.aborted = true;
  saveState(state);
  console.log(`✔ 실행 ${run.id} 중단됨: ${reason}`);
}

function cmdBypass(rest) {
  const v = (rest[0] ?? '').toLowerCase();
  if (!['on', 'off'].includes(v)) die('bypass on|off');
  const state = loadState();
  state.bypass = v === 'on';
  saveState(state);
  console.log(state.bypass ? '⚠ 가드 bypass ON — 게이트 없이 파일 수정/푸시가 허용됩니다. 작업 후 반드시 off 하세요.' : '✔ 가드 bypass OFF');
}

function cmdHistory() {
  const state = loadState();
  const run = requireRun(state);
  for (const h of run.history) {
    console.log(`${h.at}  ${h.event.padEnd(10)} ${h.from ? labelOf(h.from) + ' → ' : ''}${h.to ? labelOf(h.to) : ''}  ${h.reason ?? ''}`);
  }
}

// ───────────────────────────── main
const [, , cmd, ...args] = process.argv;
const { flags, rest } = parseFlags(args);
fs.mkdirSync(RUNS_DIR, { recursive: true });
switch (cmd) {
  case 'status': cmdStatus(flags); break;
  case 'start': cmdStart(rest, flags); break;
  case 'complete': cmdComplete(rest, flags); break;
  case 'approve': cmdDecide('approve', rest, flags); break;
  case 'reject': cmdDecide('reject', rest, flags); break;
  case 'abort': cmdAbort(rest); break;
  case 'bypass': cmdBypass(rest); break;
  case 'history': cmdHistory(); break;
  default:
    console.log('usage: node harness/gate.mjs <status|start|complete|history|abort>  (사람 전용: approve|reject|bypass)');
    process.exit(cmd ? 1 : 0);
}
