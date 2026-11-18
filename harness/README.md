# 채움 개발 하네스 — 그래프 엔지니어링 + 검증 루프

```
 ┌────────┐   ┌──────┐   ┌──────┐  ┌──────┐   ┌──────┐   ┌──────┐ ⇄ ┌──────┐   ┌──────┐   ┌────────┐   ┌──────┐   ┌──────┐
 │ 조사   │──▶│  G1  │──▶│ 기획 │─▶│ 설계 │──▶│  G2  │──▶│ 개발 │   │ 검증 │──▶│  G3  │──▶│ 출시QA │──▶│  G4  │──▶│ 배포 │
 │researcher│ │ 사람 │   │planner│ │architect│ │ 사람 │   │developer│ │verifier│ │ 사람 │   │qa-release│ │ 사람 │   │main push│
 └────────┘   └──────┘   └──────┘  └──────┘   └──────┘   └──────┘   └──────┘   └──────┘   └────────┘   └──────┘   └──────┘
      ▲  반려      │          ▲   반려(--to plan|design) │        ▲  fail(최대3회)  │   반려 → 개발/설계          반려 → 개발/출시QA/설계
```

## 처음 한 번
1. Node.js 18 이상 설치 확인: `node -v`
2. 에이전트·커맨드·훅 설치: 프로젝트 폴더에서 `node harness/install.mjs` (→ `.claude/agents`, `.claude/commands`, `.claude/settings.json` 생성. `settings.local.json` 은 그대로 둠)
3. (선택) 브라우저 QA 활성화: `cd harness && npm install && npx playwright install chromium`
4. Claude Code 를 이 폴더에서 다시 시작 → SessionStart 훅이 현재 실행 상태를 알려줌

## 사용법 (Claude Code 채팅)
| 하고 싶은 것 | 입력 |
|---|---|
| 새 작업 시작 | `/graph 회원이 예약 요청 시 카카오 알림 보내기` |
| 상태 확인 | `/graph-status` |
| 게이트 승인 | `승인 G1` 또는 `승인 G2 AC-3 은 다음에 해도 됨` |
| 게이트 반려 | `반려 G2 모바일 화면 설계 빠짐 --to design` |
| 중단 | "이번 실행 중단해줘" → Claude 가 `gate.mjs abort` |
| 긴급 수정(가드 해제) | `bypass on` → 작업 → `bypass off` |

승인/반려는 **사람이 입력한 채팅 메시지**만 훅이 처리합니다. Claude 가 스스로 승인 명령을 실행하면 가드 훅이 차단합니다.

## 구성 파일
| 파일 | 역할 |
|---|---|
| `harness/graph.json` | 그래프 정의 (단계·게이트·엣지·루프 한도·관리자 페이지 목록) |
| `harness/gate.mjs` | 상태머신 CLI. 산출물 존재 확인 후에만 단계 전환 |
| `harness/verify.mjs` | 정적 검증기 (외부 의존성 없음) |
| `harness/qa-smoke.mjs` | 출시 QA 스모크 (HTTP + Playwright, 스크린샷) |
| `harness/hooks/guard.mjs` | PreToolUse — 단계별 수정/푸시 권한 통제 |
| `harness/hooks/post-edit-verify.mjs` | PostToolUse — 편집 즉시 검증 (내부 루프) |
| `harness/hooks/prompt-gate.mjs` | UserPromptSubmit — 사람의 승인/반려/bypass 처리 |
| `harness/templates/` | 단계별 산출물 템플릿 |
| `harness/install.mjs` | `harness/claude-config/` → `.claude/` 설치 |
| `.claude/agents/*.md` | 서브에이전트 6종 (원본: `harness/claude-config/`) |
| `.claude/commands/graph.md` | 오케스트레이터 (/graph) |
| `.harness/state.json` | 실행 상태 (gate.mjs 만 수정) |
| `.harness/runs/<id>/` | 실행별 산출물 — 이력으로 git 에 커밋됨 |

## 터미널에서 직접
```
node harness/gate.mjs status
node harness/verify.mjs                 # 전체 검증
node harness/qa-smoke.mjs --out-dir .harness/qa
node harness/gate.mjs approve G1 "코멘트"   # 사람이 터미널에서 직접 승인해도 됨
```

## 한계
- 가드는 Edit/Write 도구와 git push 를 통제합니다. Bash 의 `sed -i` 같은 셸 편집까지 막지는 않으므로 에이전트 지침으로 보완합니다.
- 운영 Supabase DB 변경(SQL)은 자동화하지 않습니다. 설계·개발·QA 문서에 "사람이 실행할 SQL" 로 표시되고, 배포 전에 실행 여부를 확인받습니다.
