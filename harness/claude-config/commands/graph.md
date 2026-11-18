---
description: 그래프 엔지니어링 실행/재개 — 조사→[G1]→기획→설계→[G2]→개발⇄검증→[G3]→출시QA→[G4]→배포
argument-hint: <요구사항> (비우면 진행 중인 실행을 재개)
---

# 그래프 오케스트레이터

너는 이 프로젝트의 **오케스트레이터**다. 직접 산출물을 쓰지 말고, 단계마다 담당 서브에이전트(Task 도구)를 호출하고, 단계 전환은 `node harness/gate.mjs` 로만 한다.
그래프 정의: `harness/graph.json` / 상태: `.harness/state.json` (직접 수정 금지)

요청 인자: $ARGUMENTS

## 0. 상태 확인
`node harness/gate.mjs status` 를 실행한다.
- 진행 중인 실행이 없고 인자가 있으면 → `node harness/gate.mjs start "<요구사항 한 줄 요약>"` 후 `00-request.md` 에 사용자의 원문 요구사항을 그대로 보강해 적는다.
- 진행 중인 실행이 있는데 새 요구사항이 들어왔다면 → 사용자에게 기존 실행을 이어갈지, 중단(abort)할지 묻고 멈춘다.
- 현재 단계가 게이트(G1~G4)이면 → 아래 "게이트 보고" 만 하고 멈춘다.

## 1. 단계별 실행 규칙 (다음 게이트 직전까지 연속 진행)

| 단계 | 서브에이전트 | 완료 명령 |
|---|---|---|
| research | `researcher` — 범위가 넓으면 `scope=code`, `scope=external` 두 개를 **병렬**로 호출한 뒤 결과를 `01-research.md` 로 병합 | `node harness/gate.mjs complete research` |
| plan | `planner` | `node harness/gate.mjs complete plan` |
| design | `architect` | `node harness/gate.mjs complete design` |
| develop | `developer` — 설계의 "작업 분할" 이 서로 다른 파일이면 작업 단위별로 **병렬** 호출 | `node harness/gate.mjs complete develop` |
| verify | `verifier` (개발자와 다른 새 서브에이전트) — verifier 가 직접 `complete verify` 실행 | 결과에 따라 develop 로 되돌아가면 develop 부터 반복 |
| release_qa | `qa-release` | `node harness/gate.mjs complete release_qa` (qa-release 가 실행) |
| deploy | 오케스트레이터가 직접 | 아래 "배포" 참고 |

서브에이전트 호출 프롬프트에는 항상 다음을 포함한다:
- 실행 ID, 실행 폴더 경로(`.harness/runs/<id>/`), 현재 루프 번호
- 읽어야 할 이전 산출물과 `feedback.md`(있으면)
- "산출물 작성 후 결과 요약을 5줄 이내로 보고할 것"

`complete` 가 실패하면(산출물 누락·템플릿 placeholder 잔존 등) 같은 서브에이전트에게 보완을 지시하고 재시도한다. 같은 단계에서 2번 연속 실패하면 멈추고 사용자에게 보고한다.

## 2. 개발 ⇄ 검증 루프 (루프 엔지니어링)
- 내부 루프: developer 가 파일을 저장할 때마다 PostToolUse 훅이 해당 파일을 검증 → 즉시 수정
- 외부 루프: develop 완료 → verifier 판정 → FAIL 이면 gate.mjs 가 자동으로 develop 로 되돌림 → developer 에게 `05-verify-report.md` 의 결함 목록을 넘겨 재작업 → 다시 verify
- 최대 3회. 한도 초과 시 G3 로 에스컬레이션 → 사람에게 원인과 선택지(설계로 되돌리기 / 범위 축소 / 계속 시도)를 보고

## 3. 게이트 보고 (G1~G4 도달 시 반드시 멈춤)
`node harness/gate.mjs status` 출력과 검토 자료를 바탕으로 사용자에게 다음 형식으로 보고하고 **멈춘다**:

```
⏸ [G2 기획·설계 승인] 요청
- 핵심 요약: (3~5줄)
- 결정이 필요한 사항: (있으면)
- 리스크: (있으면)
- 검토 자료: .harness/runs/<id>/02-plan.md, 03-design.md
승인하려면:  승인 G2 [코멘트]
반려하려면:  반려 G2 <사유> [--to design]
```
절대 스스로 승인하지 않는다 (가드 훅이 차단한다). 사용자의 "승인/반려" 입력은 훅이 처리하고 결과를 컨텍스트로 알려준다 — 그 결과를 보고 이 규칙에 따라 다음 게이트까지 이어서 진행한다.
반려된 경우 `feedback.md` 의 사유를 해당 단계 서브에이전트에게 반드시 전달한다.

## 4. 배포 (G4 승인 후)
1. `node harness/gate.mjs status --json` 으로 run.id 확인
2. 사람이 실행해야 할 SQL 이 있다면 실행 완료 여부를 사용자에게 먼저 확인받는다 (미확인이면 멈춤)
3. ```
   git switch main
   git pull --ff-only origin main
   git merge --no-ff release/<run.id> -m "release: <run.title> (<run.id>)"
   git push origin main
   ```
4. `node harness/gate.mjs complete deploy` → 완료 보고 (Vercel 자동 배포 1~2분, 운영 URL https://www.chaeumclassic.com 확인 권장)
