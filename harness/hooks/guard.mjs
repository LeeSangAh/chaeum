#!/usr/bin/env node
// PreToolUse 훅 — 그래프 단계에 따라 파일 수정 / git push / 승인 명령을 통제
// exit 0 = 허용, exit 2 = 차단(stderr 가 Claude 에게 전달됨)
import { GRAPH, loadState, activeRun, toRel, labelOf, isGate } from '../lib/state.mjs';

const input = await new Promise((resolve) => {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { buf += c; });
  process.stdin.on('end', () => { try { resolve(JSON.parse(buf || '{}')); } catch { resolve({}); } });
});

const block = (msg) => { process.stderr.write(`[harness guard] ${msg}\n`); process.exit(2); };
const allow = () => process.exit(0);

const state = loadState();
const run = activeRun(state);
const phase = run && run.phase !== 'released' ? run.phase : null;
const where = phase ? `현재 단계: ${labelOf(phase)}` : '진행 중인 그래프 실행 없음';
const tool = input.tool_name ?? '';
const ti = input.tool_input ?? {};

// ── Bash
if (tool === 'Bash') {
  const cmd = String(ti.command ?? '');

  // 1) 승인/반려/bypass 는 사람만 (사용자 프롬프트 훅이 대신 실행)
  if (/gate\.mjs[\s\S]*\b(approve|reject|bypass)\b/.test(cmd)) {
    block('게이트 승인·반려·bypass 는 사람만 할 수 있습니다. 사용자에게 "승인 G1 …" 또는 "반려 G1 <사유>" 를 입력해 달라고 요청하세요.');
  }
  // 2) 상태 파일 직접 조작 금지
  if (/\.harness[\\/]+state\.json/.test(cmd) && !/^\s*(cat|type|less|more|head|tail|jq)\b/.test(cmd)) {
    block('.harness/state.json 은 harness/gate.mjs 로만 변경할 수 있습니다.');
  }
  if (state.bypass) allow();

  // 3) git push 통제 — main push = Vercel 운영 배포
  if (/\bgit\s+push\b/.test(cmd)) {
    if (/(\s--force\b|\s-f\b|--force-with-lease)/.test(cmd)) block('force push 는 금지되어 있습니다.');
    const prod = GRAPH.project.productionBranch;
    const relPrefix = GRAPH.project.releaseBranchPrefix;
    const afterPush = (cmd.split(/\bgit\s+push\b/)[1] ?? '').split(/[;&|\n]/)[0];
    const tokens = afterPush.trim().split(/\s+/).filter((t) => t && !t.startsWith('-'));
    const refspecs = tokens.slice(1); // tokens[0] = remote
    const targetsProd = refspecs.length === 0 || refspecs.some((r) => r === prod || r.endsWith(`:${prod}`) || r === 'HEAD' || r.endsWith(`:refs/heads/${prod}`));
    if (targetsProd) {
      if (phase !== 'deploy') block(`'${prod}' 브랜치 push 는 Vercel 운영 배포입니다. G4(출시QA) 승인 후 '배포' 단계에서만 가능합니다. (${where}) — 브랜치를 명시하지 않은 push 도 운영 배포로 간주합니다.`);
    } else if (refspecs.every((r) => r.replace(/^.*:/, '').startsWith(relPrefix))) {
      if (!['release_qa', 'deploy'].includes(phase)) block(`${relPrefix}* 브랜치 push(Vercel 프리뷰)는 '출시QA' 단계에서만 허용됩니다. (${where})`);
    } else if (!['develop', 'verify', 'release_qa', 'deploy'].includes(phase)) {
      block(`작업 브랜치 push 는 개발 단계 이후에만 허용됩니다. (${where})`);
    }
  }
  allow();
}

// ── 파일 편집 도구
if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
  const rel = toRel(ti.file_path ?? ti.notebook_path);
  if (rel === null) allow(); // 프로젝트 밖 (예: 임시파일)

  if (rel === '.harness/state.json') block('.harness/state.json 은 harness/gate.mjs 로만 변경할 수 있습니다.');
  if (rel.startsWith('.harness/')) {
    if (!run) block('진행 중인 실행이 없습니다. 먼저 `node harness/gate.mjs start "<제목>"` 으로 실행을 시작하세요.');
    allow(); // 단계별 산출물·노트는 항상 허용
  }
  if (state.bypass) allow();

  if (GRAPH.project.protectedPaths.some((p) => rel === p || rel.startsWith(p))) {
    block(`하네스/에이전트 설정 파일(${rel})은 에이전트가 수정할 수 없습니다. 변경이 필요하면 사용자에게 요청하세요 (사람이 "bypass on" 후 직접 수정).`);
  }
  if (!phase) block(`소스 수정은 그래프 실행 안에서만 가능합니다. /graph <요구사항> 으로 시작하세요. (${rel})`);
  if (isGate(phase)) block(`${labelOf(phase)} 승인 대기 중에는 소스를 수정할 수 없습니다. (${rel})`);
  if (!GRAPH.phases[phase]?.sourceWrite) {
    block(`'${labelOf(phase)}' 단계에서는 소스 수정이 금지됩니다. 소스는 G2 승인 후 '개발' 단계에서만 수정합니다. 산출물은 .harness/runs/${run.id}/ 에 작성하세요. (${rel})`);
  }
  allow();
}

allow();
