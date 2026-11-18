// 하네스 공용 모듈: 그래프 정의 / 실행 상태(state) 로드·저장
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const HARNESS_DIR = path.join(ROOT, 'harness');
export const STATE_DIR = path.join(ROOT, '.harness');
export const STATE_FILE = path.join(STATE_DIR, 'state.json');
export const RUNS_DIR = path.join(STATE_DIR, 'runs');

export const GRAPH = JSON.parse(fs.readFileSync(path.join(HARNESS_DIR, 'graph.json'), 'utf8'));

export function isGate(node) {
  return Object.prototype.hasOwnProperty.call(GRAPH.gates, node);
}

export function labelOf(node) {
  if (isGate(node)) return `${node} ${GRAPH.gates[node].label}`;
  return GRAPH.phases[node]?.label ?? node;
}

export function nowKST() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.toISOString().replace('Z', '+09:00');
}

export function loadState() {
  if (!fs.existsSync(STATE_FILE)) return { activeRun: null, bypass: false, runs: {} };
  const raw = fs.readFileSync(STATE_FILE, 'utf8').replace(/^﻿/, '');
  return JSON.parse(raw);
}

export function saveState(state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const tmp = STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, STATE_FILE);
}

export function activeRun(state) {
  if (!state.activeRun) return null;
  return state.runs[state.activeRun] ?? null;
}

export function runDir(runId) {
  return path.join(RUNS_DIR, runId);
}

/** 그래프 엣지 조회. on 이 없는 엣지는 에이전트가 진행하는 자동 엣지 */
export function findEdge(from, on) {
  return GRAPH.edges.find((e) => e.from === from && (e.on ?? null) === (on ?? null)) ?? null;
}

/** 프로젝트 루트 기준 상대경로(슬래시 통일). 루트 밖이면 null */
export function toRel(p) {
  if (!p) return null;
  const abs = path.isAbsolute(p) ? p : path.join(ROOT, p);
  const rel = path.relative(ROOT, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join('/');
}
