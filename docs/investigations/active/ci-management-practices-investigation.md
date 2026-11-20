---
status: "active"
created-at: "2026-11-19"
completed-at: null
owners: []
related:
  - "https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue"
  - "https://docs.github.com/en/actions/reference/limits"
primary-area: "CI 운영 방식: 검사 단계 구성, 필수 체크, 실모델 게이트, 승격 절차"
observed-environments:
  - "공개 저장소 37곳의 기본 브랜치 HEAD(2026-11-19), gh api로 워크플로·룰셋·실행 기록 확인"
  - "이 저장소의 최근 7일 워크플로 실행 400건과 최근 병합 PR 150건(2026-10-27~2026-11-19)"
  - "이 저장소 origin/dev b16de4c의 워크플로 8개·룰셋·Environment, 워크플로 실행 600건(2026-11-10~2026-11-19), 병합 후 실패 실행 14건의 로그"
conclusion-summary: null
follow-up: []
---

# 인기 오픈소스의 CI 운영 방식 조사와 이 프로젝트 적용 방향

## Summary

GitHub 스타가 많은 프로젝트 37곳이 CI를 어떻게 운영하는지 워크플로 원본으로
확인하고, 그 결과를 이 프로젝트의 조건에 맞춰 정리했다. 공통 패턴은 여덟 가지로
모였고, 그중 이 프로젝트에 맞는 것을 4단계 검사 구조와 도입 순서로 묶었다.

조사는 세 단계로 진행했다. 1차는 이 저장소의 현재 워크플로,
`docs/architecture/verification.md`, CI 관련 제안서를 읽지 않고 다른 프로젝트의
패턴만 정리했다. 2차는 같은 날 현재 CI를 읽어 패턴 여덟 가지와 대조하고, 병합 후
실패 14건의 로그를 분류했다. Known Facts 1~8과 "이 프로젝트의 조건"은 1차 결과이고,
"현재 CI와의 대조"와 "병합 후 OS 스위트 실패 분류"는 2차 결과다. 3차는
2026-11-20까지 병합 기록 374건, 승격 기록 60번, 시험 저장소의 룰셋 동작으로 적용
방향을 다시 확인했다. 그 결과가 나머지 Evidence 절이다.

대조 결과 검사 내용은 이미 충분하고, 부족한 것은 세 가지다. GitHub이 강제하는
병합 조건이 없고, 병합 후 실패를 추적하는 장치가 없으며, 검사 규칙이 세 곳에 따로
적혀 있다. 이 저장소의 병합 기록을 보면 셋의 무게가 다르다. 병합 조건은 강제하지
않아도 지켜지고 있고(374건 중 1건 예외), 실제로 반복된 문제는 병합 후 실패다.
그래서 도입 순서는 병합 후 관리를 앞에 두고, 필수 체크는 그 뒤에 두며, 변경 감지
잡은 넣지 않는다. 코드와 워크플로는 바꾸지 않았다. 저장소 룰셋은 2026-11-20에
소유자가 바꿨다(Follow-up Actions).

## Problem

- 증상: CI를 어떤 원칙으로 운영할지 기준이 정해지지 않아 고민이 크다. 최근 병합
  PR 150건 중 22%가 `.github/`를, 35%가 `scripts/`를 변경했다.
- 영향: 사람은 한 명이고 작성자는 대부분 에이전트라서 CI가 사실상 유일한
  리뷰어다. CI가 느리거나 불안정하면 병합 속도와 통합 브랜치의 신뢰가 함께
  떨어진다.
- 빈도: 주 25~60건, 많을 때 하루 15건이 병합된다.
- 심각도: `medium`. 운영 장애가 아니라 유지보수 비용과 판단 기준의 문제다.
- 재현 조건: 해당 없음. 버그 조사가 아니라 운영 방식 비교 조사다.
- 환경 메모: 저장소는 공개이고 개인 계정 소유다. 이 조건이 선택지를 좌우한다.

## Scope

- In scope: 다른 프로젝트의 PR 검사 구성, 필수 체크, 변경 감지, OS 매트릭스,
  실모델 테스트 위치, 불안정 테스트 처리, 릴리스 승격, 워크플로 위생. 이
  프로젝트의 스택·산출물·실측 수치에 근거한 적용 방향. 현재 CI 구성과 패턴
  여덟 가지의 대조, 병합 후 OS 스위트 실패의 원인 분류.
- Out of scope: 구현, 비용 견적. 진행 중인 CI 검증 관련 작업
  (`ci-verification-code-organization`, `dual-client-ci-parity` 제안서와 `cvo2`,
  `cvo3` 계열)의 내용 평가. 두 제안서는 요약만 읽어 겹치는 범위를 확인했다.

## Evidence

### 조사 대상

저장소 이름은 2026-11-19 기준 현재 이름이다. 괄호는 스타 수와 읽은 커밋이다.

| 묶음 | 저장소 |
| --- | --- |
| JS/TS 프레임워크 | vercel/next.js (144k, `5395cf44`), react/react (253k, `63d9c806`), vitejs/vite (84k, `ef295d54`), microsoft/vscode (196k, `22d53a1f`), withastro/astro (64k, `6fb274ee`), microsoft/TypeScript (112k, `9c4ad5cb`) |
| DB·배포가 있는 TS 제품 | calcom/cal.diy (50k, `ae027bb7`, 구 cal.com), n8n-io/n8n (211k, `71370107`), langgenius/dify (161k, `fb8053a3`), supabase/supabase (115k, `5b0c50a2`), twentyhq/twenty (61k, `51cff3a1`), prisma/orm (48k, `4188e153`, 구 prisma/prisma) |
| 크로스 플랫폼 툴체인 | astral-sh/uv (92k, `469fe65`), astral-sh/ruff (51k, `3e94fa7`), denoland/deno (109k, `d8c551b`), python/cpython (78k, `6c9f2b6`), microsoft/playwright (101k, `28c4b2e`) |
| 대규모 운영 규칙 | rust-lang/rust (122k), kubernetes/kubernetes (129k), flutter/flutter (181k), pytorch/pytorch (106k), nodejs/node (124k), apache/airflow (48k) |
| AI 코딩 에이전트 | openai/codex (136k, `14302d5`), google-gemini/gemini-cli (109k, `615d6bc`), zed-industries/zed (95k, `4a4c815`), OpenHands/OpenHands (94k, `e1b8b60`), cline/cline (72k, `eff43e1`), continuedev/continue (37k, `5522c6f`), anomalyco/opencode (228k, `c4df872`), aaif-goose/goose (57k, `e196781`) |
| LLM 라이브러리 | langchain-ai/langchain (150k, `46af7cb3`), huggingface/transformers (169k, `90cbc670`), pydantic/pydantic-ai (21k, `d176ffa0`), vercel/ai (28k, `04a8f383`), promptfoo/promptfoo (27k, `0d4978ba`), openai/openai-agents-python (31k, `91fb508a`) |

oven-sh/bun은 주 CI가 Buildkite라서 제외했다.

### Known Facts

#### 1. 필수 체크는 집계 잡 하나만 건다

- next.js(`thank you, next`), vscode(`PR Gate`), TypeScript(`required`),
  codex(`CI required`), zed(`tests_pass`), uv(`all required jobs passed`),
  cpython(`All required checks pass`), airflow(`CI passed`), n8n(`Required Checks`),
  langchain(`CI Success`)이 이 방식이다. 집계 잡은 `if: always()`로 항상 실행되고
  `toJSON(needs)`를 읽어 실패나 취소가 있으면 실패한다.
- codex는 이유를 주석으로 남겼다. `always()`가 없으면 의존 잡이 실패했을 때
  GitHub이 이 잡을 건너뛰고, 필수 체크가 성공한 것처럼 보인다
  (`.github/workflows/blocking-ci.yml`).
- 구멍 사례:
  - vite의 필수 잡은 테스트 실패 시 건너뜀이 되고, GitHub은 조건으로 건너뛴
    잡을 성공으로 처리한다. 실패한 실행 44520081596에서 확인했다.
  - next.js는 집계 잡의 `needs`에서 `build-native-windows`를 포함한 9개 잡이
    빠져 있다.
  - ruff는 Windows/macOS 테스트 잡(`cargo-test-other`)이 빠져 있어 실패해도
    병합된다. cpython은 android가 빠져 있다.
  - promptfoo는 필수 체크에 `continue-on-error`를 걸어 실패할 수 없다.
- 가장 엄격한 형태는 cpython과 pydantic-ai다. 변경 감지가 불필요하다고 판단한
  잡만 건너뜀을 허용하고, 그 외 건너뜀은 실패로 본다.
- vscode는 규칙을 주석으로 명시한다. "이 워크플로의 모든 잡은 needs에 있어야 한다."

#### 2. 변경 감지는 잡 단위로 하고, 애매하면 전부 실행한다

- 워크플로를 `paths:`로 통째로 건너뛰면 필수 체크가 보고되지 않아 PR이 막힌다.
  supabase PR #48681과 twenty의 큐 워크플로 주석에 실제 사고가 기록돼 있다.
  prisma는 문서에 "보고되지 않는 필수 체크는 병합을 막는다. 필수 잡은 잡 단위로
  건너뛸 수 없다"고 적었다(`docs/oss/ci-pipeline.md`).
- 전체 실행을 강제하는 조건은 공통이다. 통합 브랜치 푸시, CI 파일 변경, diff
  계산 실패.
  - uv는 `git diff` 실패가 잡 실패로 이어지게 해 필수 잡이 조용히 건너뛰어지지
    않게 한다(`.github/workflows/plan.yml`).
  - deno와 vscode는 감지 실패 시 전체 실행으로 넘어간다.
  - airflow는 원칙을 문서화했다. "의심스러우면 보수적으로. 속도를 위해 정확성을
    버리지 않는다. 건너뛰기는 무관함을 증명할 수 있을 때만"
    (`dev/breeze/doc/ci/04_selective_checks.md`).

#### 3. PR 검사는 작은 부분집합이고, 전체는 그 뒤에 돈다

- rust는 "PR 검사는 병합 검사의 부분집합"을 도구(`citool`)로 강제한다. PR에서만
  도는 검사는 무관한 후속 PR을 전부 깨뜨릴 수 있기 때문이다.
- vscode는 PR에서 Linux만 돌리고, Windows는 머지 큐, macOS는 병합 후로 옮겼다.
  PR #346383의 근거: 테스트가 실패한 PR은 거의 전부 Linux에서도 실패했고,
  macOS에서만 잡힌 것은 대부분 불안정 테스트였다.
- OS별 전체 스위트는 줄이되 설치·스모크는 매 PR에 유지하는 곳이 많다.
  - uv: macOS 전체 스위트는 main이나 `test:macos` 라벨에서만, 바이너리 스모크는
    매 PR에 macOS와 Windows에서.
  - playwright: 설치 테스트를 매 PR에 3개 OS에서.
  - promptfoo, openai-agents-python: 빌드한 패키지를 매 PR에 Windows(와 macOS)에
    설치.
  - OpenHands: 사용자 설치 경로 그대로 Windows에 설치하고 가짜 모델로 실행.
- opencode는 PR에서 Linux만 돌리고 Windows는 푸시·야간·릴리스 게이트에서 돌린다.

#### 4. 통합 브랜치는 병합 결과 검증 또는 마지막 녹색 포인터로 지킨다

- 병합 결과 검증: rust(bors), kubernetes(Tide), flutter·vscode·prisma·n8n·dify·
  twenty·gemini-cli·zed(GitHub 머지 큐).
- 마지막 녹색 포인터: pytorch는 30분마다 `viable/strict`를 pull·trunk·lint가 모두
  녹색인 최신 main 커밋으로 옮긴다. airflow는 야간 전체 실행이 통과해야만
  의존성 고정 파일을 갱신한다.
- 큐에 무엇을 넣을지는 번복이 잦다.
  - n8n PR #43158: 큐 실행 1,931건 중 315건이 실패했고 그중 167건은 무관한 PR
    3개 이상에서 같은 테스트가 실패했다. 테스트를 큐에서 뺐다가, 이틀 뒤 #43551로
    영향받는 테스트만 재시도 2회와 함께 되돌렸다.
  - twenty는 6월에 큐를 없앴다가 7월에 되살렸다.
  - prisma PR #30618: 통합 테스트가 빨간 채로 병합된 사고 뒤 통합 테스트를 큐
    전용으로 옮겼다.
- 병합 후 빨간 상태는 흔하다. 최근 main 실행 15건 기준 uv는 9건 실패, deno는
  1건만 성공, playwright는 15건 모두 실패였다.
- 되돌리기 우선 원칙을 글로 둔 곳: flutter("사후 테스트 실패를 앞으로 고치려
  하지 말라", `revert` 라벨은 병합 후 24시간 이내 동작), rust("의심스러우면
  되돌려라").

#### 5. 실제 모델을 부르는 테스트는 PR 필수 경로에 두지 않는다

- LLM 라이브러리 6곳은 전부 일반 PR CI에서 실모델을 부르지 않는다. AI 코딩
  에이전트 8곳 중 4곳(codex, zed, cline, opencode)은 Actions에서 실모델을 아예
  부르지 않는다. n8n, supabase, twenty의 LLM 평가는 모두 병합을 막지 않는다.
- PR에서 쓰는 대체물:
  - 스크립트된 가짜 모델 서버: OpenHands(`mock-llm-server.py`), cline.
  - 녹화 응답 재생: pydantic-ai와 langchain(VCR 카세트), gemini-cli(골든 응답
    파일), vercel/ai(픽스처).
  - 스크립트 모델: openai-agents-python(`ScriptedModel`), pydantic-ai(`TestModel`).
- 실수로 실모델을 부르지 못하게 하는 장치:
  - pydantic-ai: `ALLOW_MODEL_REQUESTS = False` 전역 설정.
  - langchain: 소켓 차단과 `--record-mode=none`.
  - promptfoo: 접두사로 실제 키를 지우고 가짜 키 주입.
  - openai-agents-python: `OPENAI_API_KEY_SOURCE=service-account`가 아니면 실행
    거부.
- 녹화가 낡는 것을 잡는 장치: pydantic-ai는 카세트가 끝까지 재생되지 않으면
  테스트를 실패시키고 쓰이지 않는 카세트를 검사한다. langchain은 키 없이
  재생만 하는 잡을 둔다. 재녹화는 6곳 모두 수동이다.
- 예외는 gemini-cli다. 실모델 통합 테스트가 매 PR 필수이고, 대신 규칙을
  `evals/README.md`에 글로 정했다.
  - 새 평가는 야간 비차단(`USUALLY_PASSES`)으로 시작한다.
  - 야간 7회 이상 100%면 차단(`ALWAYS_PASSES`)으로 승격한다.
  - PR에서는 최대 4회 중 2회 성공이면 통과다.
  - 실패하면 main에서 다시 돌려 거기서도 실패하면 "기존 문제"로 표시한다.
  - API 500/503은 3회 재시도 후 건너뛰고 별도 파일에 기록한다.
- 실모델 실행 위치: 프롬프트·LLM 경로가 바뀔 때만(gemini-cli, continue), 라벨이나
  승인 환경으로(OpenHands `run-eval-1/50/200/500`, gemini-cli `eval-gate`,
  supabase `run-evals`), 야간(gemini-cli, goose), 릴리스 후보에서(OpenHands SDK,
  langchain은 빌드한 패키지에 대해).
- n8n은 LLM 검사를 매 푸시가 아니라 PR 열림·준비 전환 때만 돌린다. 이유는 "PR
  CI에서 가장 비싼 잡이고 매 푸시 실행은 비용을 감당할 수 없다"이다.
- 공유 구독 직렬화:
  - pydantic-ai는 에이전트 실행을 전역 큐 하나로 줄 세우고, 모델 시작 전에
    할당량과 장애를 확인하며, PR head가 바뀐 실행은 모델을 부르기 전에 끝낸다.
  - langchain은 자격 증명마다 동시 실행 그룹을 두고 실행 중인 잡을 취소하지
    않는다.
- 동시 실행 그룹의 함정:
  - `cancel-in-progress: false`여도 같은 그룹에서 대기 중인 실행은 새 실행이
    오면 취소된다(OpenHands live E2E에서 관찰).
  - 승인 대기 중인 실행이 그룹을 붙잡는다. cline은 이 때문에 야간 실행 20회를
    연속으로 잃었다고 주석에 적었다.
- 예약 실행은 방치하면 빨간 상태로 굳는다. 최근 실행 기준 langchain 12/12,
  transformers 8/9, pydantic-ai 게이트웨이 점검 5/5, goose 15/15가 실패였다.
  gemini-cli의 야간 평가는 `continue-on-error`라서 실패할 수 없다.
- 예약 실패를 관리하는 방식:
  - pydantic-ai: 담당자가 지정된 중복 없는 이슈 하나를 열고, 야간 실행이
    통과하면 닫는다.
  - transformers: 직전 실행과 실패를 비교하고, 새 실패만 이분 탐색하며, 테스트를
    4회 재실행해 불안정 여부를 표시하고, PR 작성자를 지목한다.
  - uv: 실패한 실행마다 LLM 에이전트가 불안정/결정적으로 분류하고, 불안정이면
    최대 3회 재실행, 아니면 중복 없는 이슈를 연다.

#### 6. 새 검사와 불안정한 검사는 비차단에서 시작하고 숫자로 승격·강등한다

| 프로젝트 | 규칙 |
| --- | --- |
| flutter | 새 대상은 `bringup: true`(비차단). 불안정 없이 50회 연속 통과하면 봇이 승격 PR을 연다. 15일간 불안정 비율 2% 이상이면 P0 이슈를 열고 자동으로 비차단으로 되돌린다 |
| pytorch | 7일 실패율 10% 미만이면 차단 집합에 추가, 15% 초과면 제거. 새 잡은 `unstable.yml`에서 시작. 잡 소유자가 책임 |
| kubernetes | 릴리스 차단 잡은 같은 커밋에서 3회 연속 통과, 주간 75% 통과, 소요 시간 상한, 담당 SIG와 알림 설정이 필요. 먼저 informing 대시보드에 추가 |
| rust | `optional-` 접두사 잡으로 일정 기간 비차단 시험 |
| opencode | 격리한 테스트는 14일 안에 고치거나 삭제. 자기 변경으로 깨진 테스트는 격리 금지 |
| node | 한 달 이상 불안정하고 아무도 고치지 않을 때만 불안정으로 표시 |

- 재시도 정책은 갈린다. kubernetes는 자동 재시도 금지, flutter는 기본 1회 시도,
  pytorch는 2회 재실행, next.js는 파일당 2회 재시도다.
- next.js는 새로 추가되거나 바뀐 테스트를 3회 반복 실행해 불안정 테스트가
  들어오는 것을 막는다.

#### 7. 릴리스는 검증된 그 커밋을 승격하고, 사람이 한 번 승인한다

- 검증된 커밋·산출물 승격:
  - react: 특정 커밋의 CI 산출물을 받아 배포한다
    (`runtime_release_from_ci.yml`).
  - OpenHands: 릴리스 커밋의 필수 체크가 통과할 때까지 기다린 뒤 태그한다.
  - cline: 테스트된 main 커밋에 태그한다.
  - deno: 카나리 커밋 해시를 rc/lts로 승격한다.
  - gemini-cli: nightly → preview → stable을 매주 승격하며 이전 태그의 SHA를
    다시 테스트한다.
- 승인은 GitHub Environment로 받는다. next.js는 stable을 두 번 승인하고 실행한
  사람은 승인할 수 없다. react, uv, ruff, cline, vite도 환경 승인을 쓴다.
- 비밀 분리: opencode는 빌드 잡을 환경·비밀 없이 돌리고, 서명·배포 잡만 비밀을
  본다.
- 단계적 공개: playwright는 npm에 `-pending` 태그로 먼저 올리고 전부 올라간 뒤
  실제 태그를 옮긴다.
- 수동으로 띄운 비싼 검사는 요청 이후 head가 바뀌었으면 거부한다(vite,
  TypeScript, transformers). openai-agents-python은 사람 승인 문구에 현재 SHA가
  들어 있어야 필수 체크가 통과한다.
- 마이그레이션:
  - cal: `prisma migrate diff --exit-code`로 스키마와 마이그레이션의 차이를 검사.
  - twenty: 마이그레이션을 생성해 보고 `git diff`가 있으면 실패. 지원하는 가장
    오래된 버전에서 업그레이드하는 테스트도 있다.
  - prisma 텔레메트리 백엔드: 마이그레이션 적용 후 배포하고, 취소되지 않게
    직렬화한다. PR #30728은 배포 스크립트 자체를 빈 DB에 돌리는 CI 테스트를
    추가했다.

#### 8. 워크플로 자체도 검사 대상이다

- 액션 SHA 고정은 대부분이 한다. 예외는 react, cal, continue, cline, OpenHands다.
  cpython은 `actions.lock` 파일과 `gh actions-lock --verify`로 검증한다.
- zizmor: uv, ruff, cpython, zed, vite, astro, supabase, pydantic-ai.
  actionlint: ruff, cpython, zed, gemini-cli, promptfoo.
- 의존성 업데이트 대기 기간: uv 30일, cpython 14일, vscode·playwright·codex·
  supabase 7일.
- prisma는 `pull_request_target`을 린트로 금지한다. 2026년 5월 TanStack 침해 뒤
  도입했다.
- 워크플로 생성과 드리프트 검사: deno(TypeScript 생성기), zed(Rust `xtask`).
  vscode는 룰셋을 파일로 관리하고 매일 실제 설정과 비교한다.
- "왜"를 적은 문서: n8n(`.github/WORKFLOWS.md`, 1,349줄),
  prisma(`docs/oss/ci-pipeline.md`), airflow(`dev/breeze/doc/ci/`), codex
  (`.github/workflows/README.md`). next.js는 `.github/AGENTS.md`에 에이전트용
  워크플로 규칙을 둔다.
- PR 폭주와 에이전트 PR 대응:
  - next.js: 쌓인 PR 묶음의 CI를 순차로 푼다(`pr_stack_optimizer.yml`).
  - twenty: `.github/`, `.claude/`, `CLAUDE.md` 변경에 관리자 승인을 요구한다.
  - uv: AI 라벨러가 CI 범위를 바꾸는 `test:`/`build:` 라벨을 붙일 수 없다.
  - pytorch: AI 자동 승인은 신뢰된 작성자, 정확한 커밋, 2,000줄·200파일 이하일
    때만 하고, 되돌려진 변경은 다시 승인하지 않는다.
  - OpenHands: PR 설명에 사람 영역과 에이전트 영역을 나누고, 테스트 증거를
    스크립트로 검사한다.
  - 열린 PR 수 제한: flutter 2개, airflow 5개, gemini-cli 8개(쓰기 권한 없는
    기여자 대상).

#### 이 프로젝트의 조건

| 항목 | 값 | 출처 |
| --- | --- | --- |
| 저장소 | 공개, 개인 계정(`User`) 소유 | `gh repo view`, `gh api users/Sangeok` |
| 머지 큐 | 사용 불가. 조직 소유 공개 저장소에서만 제공 | github/docs `data/reusables/gated-features/merge-queue.md` |
| 룰셋, 승인자가 있는 Environment | 사용 가능 | github/docs `repo-rules.md`, `environments.md` |
| 러너 | 표준 러너 무료, 동시 실행 20개, macOS 5개 | GitHub Actions limits 문서 |
| 처리량 | 주 25~60건 병합, 최대 하루 15건 | `git log --merges --first-parent` |
| PR 소요 | 열림→병합 중앙값 21분, p75 91분, p90 254분 | 최근 병합 PR 150건 |
| PR 크기 | 변경 줄 수 중앙값 113, 파일 수 중앙값 5 | 같은 표본 |
| PR 성격 | 문서만 변경 31%, 배포 코드(웹·서버·플러그인·패키지·prisma) 미변경 56% | 같은 표본 |
| CI 자체 변경 | `.github/` 22%, `scripts/` 35% | 같은 표본 |
| 기본 검사 시간 | PR 중앙값 7.5분, p90 9.3분 | 최근 7일 실행 400건 |
| OS 스위트 시간 | Windows 중앙값 15분, macOS 13분 | 같은 표본 |
| 실모델 게이트 시간 | 약 19분 | 같은 표본 |
| 병합 후 실패 | 기본 검사 61회 중 1회, OS 스위트 121회 중 9회 | 같은 표본, dev 푸시 |
| 실모델 게이트 실패 | 수동 11회 중 3회, 예약 2회 중 1회 | 같은 표본 |
| 테스트 | 테스트 파일 317개, `node --test` 기반 | `git ls-files`, `package.json` |

#### 현재 CI와의 대조

`origin/dev` `b16de4c`의 `.github/workflows/` 8개, `.github/actions/` 2개, 저장소
룰셋과 Environment 설정, `docs/architecture/verification.md`를 읽었다.

| # | 패턴 | 현재 상태 | 판정 |
| --- | --- | --- | --- |
| 1 | 집계 잡 하나를 필수로 | 2026-11-19 기준으로 룰셋 `Keep dev and main`은 두 브랜치의 삭제만 막았다. 필수 상태 체크, PR 강제, 강제 푸시 차단이 없었고 구식 브랜치 보호도 없다. 병합 조건을 강제하는 장치는 없고, 병합하는 쪽이 지킨다. 저장소 소유자는 GitHub 화면의 병합 버튼으로 병합하거나 에이전트에게 맡기고(2026-11-20 확인), 에이전트는 `AGENTS.md`의 규칙을 따른다. 작업 마무리 스크립트(`scripts/pr/`, 2026-11-18 `70b182a`)의 `complete`로 병합할 때는 스크립트가 `check.yml`의 최신 PR 실행이 성공인지와 PR의 `mergeStateStatus`가 `CLEAN`인지 확인한다 | 빠짐 |
| 2 | 잡 단위 변경 감지 | `windows-role-runtime`, `macos-runtime-contracts`, `client-init-smoke`, `shared-distribution-acceptance`가 워크플로 단위 `paths:`로 건너뛴다. 앞의 두 워크플로는 60줄짜리 경로 목록이 거의 같다. `check.yml`은 경로 조건이 없어 문서 전용 PR에서도 Windows·macOS 잡까지 전부 돈다 | 다름 |
| 3 | PR은 부분집합, 전체는 뒤에 | PR은 Linux 중심이고 OS 전체 스위트는 `dev` 푸시마다 경로 제한 없이 돈다 | 이미 함 |
| 4 | 통합 브랜치 보호 | 병합 후 실패를 기록하고 추적하는 장치가 없다. 게이트 기록(`gate-record`)은 수동·예약 게이트에만 붙는다. 전부 통과한 커밋을 가리키는 표시가 없다 | 빠짐 |
| 5 | 실모델은 PR 경로 밖 | `agent-eval`과 `pipeline-smoke`는 주간 예약과 수동 실행뿐이다. PR에는 모델 없이 실제 클라이언트를 설치하는 `client-init-smoke`가 있다. 게이트 실행은 이슈 #319에 기록되고 실패 시 이슈가 자동으로 열린다 | 이미 함, 빈틈 있음 |
| 6 | 비차단 시작, 숫자로 승격·강등 | 규칙이 없다. 재시도와 `continue-on-error`는 쓰지 않는다 | 빠짐 |
| 7 | 검증된 커밋을 승격, 승인 1회 | 커밋 지정 fast-forward와 게이트 기록은 있다. 절차는 `AGENTS.md`의 10여 단계 수동 런북이다. `template-release`만 워크플로와 승인 Environment(`template-production`)를 쓴다 | 일부 |
| 8 | 워크플로도 검사 대상 | `verify:ci-coverage`가 워크플로와 OS 범위 표를 대조하고, 경로 목록을 실제 소비 범위와 대조하는 시험이 있다. 액션은 태그 고정(`@v5`, `@v4`)이고 워크플로 린트와 의존성 자동 갱신 설정이 없다. `pull_request_target`은 쓰지 않는다 | 일부 |

패턴 5의 빈틈과 그 밖에 확인한 것:

- `agent-eval`과 `pipeline-smoke`는 같은 구독을 쓰는데 동시 실행 그룹이 다르다.
  순서는 `AGENTS.md`의 규칙으로 사람이 지킨다. `agent-eval`과 `client-init-smoke`는
  `cancel-in-progress: true`라서 새 실행이 진행 중인 실행을 취소한다.
- 파이프라인 경로를 모델 없이 끝까지 돌리는 PR 단계 검사가 없다.
- 게이트는 Claude Code를 설치 스크립트로 받아 매번 최신 버전을 쓴다.
- 스키마와 마이그레이션 파일의 차이를 잡는 검사(`prisma migrate diff`)가 없다.
- `check.yml`의 `check`, `server-integration` 잡에 `permissions`가 없다.
- 어떤 변경에 어떤 검사가 필요한지가 세 곳에 따로 적혀 있다. 워크플로의
  `paths:`, `verification.md`의 OS 범위 표, `AGENTS.md`의 `pipeline-smoke` 경로 목록.

실행 600건(2026-11-10~2026-11-19) 기준 수치:

| 워크플로 | 이벤트 | 실행 | 중앙값(분) | p90(분) | 실패 |
| --- | --- | --- | --- | --- | --- |
| `check` | PR | 128 | 3.0 | 8.9 | 14 |
| `check` | 푸시 | 92 | 6.1 | 9.3 | 1 |
| `windows-role-runtime` | PR | 43 | 13.7 | 16.0 | 2 |
| `windows-role-runtime` | 푸시 | 86 | 14.4 | 23.9 | 3 |
| `macos-runtime-contracts` | PR | 44 | 10.8 | 13.6 | 4 |
| `macos-runtime-contracts` | 푸시 | 86 | 12.0 | 20.1 | 11 |
| `shared-distribution-acceptance` | PR | 20 | 10.2 | 12.8 | 0 |
| `client-init-smoke` | PR | 42 | 2.7 | 7.8 | 0 |
| `pipeline-smoke` | 수동 | 10 | 14.3 | 21.9 | 1 |
| `agent-eval` | 수동 | 13 | 2.6 | 3.3 | 3 |

`check`의 PR 실행 시간은 2026-11-16에 달라졌다. 그 전에는 성공한 실행의 중앙값이
약 2.5분이었다. Windows와 macOS에서 작업 정리 도구를 시험하는 `task-worktrees`
잡이 `check.yml`에 들어간 뒤(`95ae5ff`)로는 날짜별 중앙값이 7.5~9.3분이다. 최근
성공 실행 8건에서 이 잡의 Windows 쪽이 7.7~10분 걸렸고, 나머지 잡은 1분 안팎이다.
위 표의 3.0분은 두 기간이 섞인 값이다. 이 잡은 경로 조건 없이 모든 PR에서 돈다.

#### 병합 후 OS 스위트 실패 분류

위 표본의 `dev` 푸시 실패 14건(macOS 11, Windows 3)의 실패 로그를 읽었다. 병합된
변경이 원인인 것은 없었다.

| 원인 | 건수 | 근거 |
| --- | --- | --- |
| macOS Intel에서 오프라인 빌드 리허설 시간 초과 | 5 | `rehearse-project-build.mjs`가 `'timeout' !== 'exited'`로 실패. 2026-11-10~11-12에 발생. 역할 명령 한도를 300초로 올린 변경(`4009b9c`, 2026-11-14 병합) 뒤로는 발생하지 않았다 |
| macOS Intel에서 `plugin/bin/harness-watch.test.mjs`의 시간 의존 시험 실패 | 5 | 같은 파일의 서로 다른 시험 4개가 `'idle' !== 'work'` 같은 상태 단정에서 실패. 실패한 커밋 5개 모두 이 파일과 `plugin/runtime`을 건드리지 않았다 |
| GitHub이 macOS arm64 러너를 배정하지 못함 | 1 | "The job was not acquired by Runner". 시험 실패가 아니다 |
| Windows에서 `plugin/bin/harness-background.test.mjs` 시험 실패 | 2 | 재시도 횟수 단정(`2 !== 3`)과 실행 중 러너 해제 거부 시험. 커밋이 `plugin/`과 `packages/`를 건드리지 않았다 |
| Windows에서 임시 파일 삭제 `EBUSY` | 1 | `windows-role-readlink.test.mjs`의 정리 단계. 커밋이 `plugin/`과 `packages/`를 건드리지 않았다 |

- macOS 테스트 실패 10건은 모두 `macos-15-intel` 잡이고, 같은 커밋의 `macos-15`
  잡은 통과했다.
- Intel 러너는 느리다. 통과한 실행 하나에서 제품 시험 단계가 Intel 788초, arm64
  243초였고 빌드 리허설이 Intel 209초, arm64 90초였다.
- 빌드 시간 초과 5건은 불안정 테스트가 아니라 제품 한도가 느린 기기에 맞지 않던
  문제다. `role-command-time-limit` 제안서가 이미 다뤘고 고쳐졌다.
- 한도 변경 병합(2026-11-14) 뒤 macOS 푸시 실행 53건 중 실패는 3건이다.
  `harness-watch` 시험 2건과 러너 미배정 1건이다.

#### 필수 상태 체크와 fast-forward 승격

개인 계정 소유의 시험 저장소에서 확인했다. 워크플로는 `dev` 푸시와 `dev` 대상
PR에서 `required` 잡 하나를 돌리고, `main` 룰셋은 그 체크를 필수로 요구한다.

| 시도 | 결과 |
| --- | --- |
| 체크가 돈 적 없는 커밋을 `main`에 푸시 | 거부. `Required status check "required" is expected` |
| `dev`에 올린 직후, 체크가 끝나기 전에 그 커밋을 `main`에 푸시 | 거부. 같은 메시지 |
| 체크가 녹색인 `dev` 커밋을 `main`에 푸시 | 통과 |
| 체크가 실패한 커밋을 `main`에 푸시 | 거부. `Required status check "required" is failing` |
| 실패한 커밋 위에 올린 녹색 커밋을 `main`에 푸시 | 통과 |
| 커밋 두 개를 한 번에 `dev`에 올려 끝 커밋만 체크가 있는 상태에서 끝 커밋을 푸시 | 통과 |
| `main`에 강제 푸시 | 거부. `Cannot force-push to this branch` |

- 룰셋은 푸시되는 끝 커밋의 체크만 본다. 사이에 있는 커밋의 체크 유무와 결과는
  보지 않는다.
- 무료 플랜에서는 비공개 저장소에 룰셋을 만들 수 없다. 공개 저장소에서만 된다.

같은 저장소에서 `dev` 쪽도 확인했다. 워크플로를 변경 감지 잡(`plan`), 검사 잡(`test`,
변경 감지 잡이 건너뛸 수 있음), 집계 잡(`required`, `if: always()`)으로 바꾸고, `dev`
룰셋에 PR 강제(승인 0명), 필수 체크 `required`, 강제 푸시 차단, 삭제 금지를 걸었다.

| 시도 | 결과 |
| --- | --- |
| `dev`에 직접 푸시 | 거부. `Changes must be made through a pull request` |
| PR을 연 직후, 체크가 끝나기 전에 병합 | 거부. `the base branch policy prohibits the merge` |
| 문서 전용 PR. 변경 감지 잡이 `test`를 건너뜀 | `test`는 `SKIPPED`, `required`는 `SUCCESS`, 병합 상태 `CLEAN`, 병합됨 |
| 검사가 실패한 PR | `required`가 `FAILURE`, 병합 상태 `BLOCKED`, 병합 거부 |
| 검사가 통과한 PR | 병합 상태 `CLEAN`, 병합됨 |

- 작업 마무리 스크립트가 쓰는 것과 같은 GraphQL 조회(`mergeStateStatus`,
  `isRequired(pullRequestNumber:)`)에서 `required`만 필수로 표시됐고, 통과한 PR은
  스크립트가 요구하는 `CLEAN`으로 나왔다. 스크립트 자체를 시험 저장소에서 돌리지는 않았다.
- 잡 단위로 건너뛴 검사는 필수 체크 보고를 막지 않았다. Known Facts 2의
  "보고되지 않는 필수 체크" 문제는 집계 잡이 항상 실행되면 생기지 않는다.

이어서 병합 후에만 도는 잡(`integration`, `dev` 푸시에서만 실행)을 추가하고
`main` 룰셋이 `required`와 `integration`을 함께 요구하게 했다.

| 시도 | 결과 |
| --- | --- |
| 병합 후 잡이 실패한 병합 커밋을 `main`에 푸시 | 거부. `Required status check "integration" is failing` |
| 병합 후 잡이 실행 중인 병합 커밋을 푸시 | 거부. `Required status check "integration" is in progress` |
| 병합 후 잡이 통과한 병합 커밋을 푸시 | 통과 |
| PR 병합 직후, 병합 커밋에 체크가 하나도 생기기 전에 푸시 | 통과. 세 번 시도해 세 번 모두 통과했다 |

- 마지막 행은 빈틈이다. PR 병합으로 생긴 커밋은 GitHub이 체크를 만들기 전 몇 초
  동안 필수 체크 없이 `main`에 들어갔다. 체크가 대기나 실행 상태로 생긴 뒤에는
  거부됐다. 어느 브랜치에도 없던 새 커밋은 같은 조건에서 거부됐으므로 PR 병합
  커밋에만 해당하는 것으로 보이지만, 원인은 확인하지 못했다.
- 따라서 `main` 룰셋만으로는 "병합 후 검사가 통과한 커밋만 승격된다"를 보장할 수
  없다. 승격 워크플로가 대상 커밋의 체크 결과를 직접 확인해야 한다.
- 수동·예약 실행이 만든 체크를 필수로 거는 경우는 시험하지 않았다.

#### 병합 전 규칙 준수 기록

GitHub이 강제하지 않는 지금의 병합 조건이 실제로 지켜졌는지 확인했다. 대상은
2026-09-02부터 2026-11-19까지 `dev`에 병합된 PR 374건이다.

| 확인한 것 | 방법 | 결과 |
| --- | --- | --- |
| 병합 시점 마지막 커밋의 전체 체크 상태 | GraphQL `statusCheckRollup` | 통과 373건, 실패 1건 |
| 기본 검사(`check`)가 실패한 채 병합된 PR | 같은 조회 | 0건 |
| 그 밖의 체크가 실패한 채 병합된 PR | 같은 조회 | 1건. PR #117(2026-10-05), `windows-role-runtime` 실패 |
| PR 단계에서 OS·설치 검사가 실패했던 PR의 최종 상태 | 실패 실행 23건의 PR 14개 추적 | 13개는 후속 커밋에서 통과한 뒤 병합. PR #363은 첫 커밋에서 Windows·macOS 검사가 실패했고 이후 커밋에서는 그 검사가 돌지 않은 채 병합 |
| PR 없이 `dev`에 들어간 커밋 | `git log --first-parent --no-merges` | 0건. 병합 커밋이 아닌 1건은 PR #222의 스쿼시 병합 |
| `dev`에 없는 `main` 커밋 | `git rev-list origin/main --not origin/dev` | 0건 |

- PR #363에서 이후 커밋에 Windows·macOS 검사가 돌지 않은 원인은 확인하지
  못했다. 마지막 커밋 기준 조회에서는 통과로 집계된다. 작업 마무리 스크립트의 `CLEAN` 조건도
  마지막 커밋만 보므로 이런 경우는 스크립트로도 걸러지지 않는다.
- 실패한 체크가 있을 때 `mergeStateStatus`가 `CLEAN`이 아닌 값으로 나오는 것은
  GitHub 문서의 정의에 근거한다. 필수 체크가 없는 이 저장소에서 직접 시험하지는
  않았다.
- 강제 수단이 없어도 병합 조건은 지켜지고 있다. GitHub이 강제하는 규칙은 사고를
  막는 장치라기보다 보험이다.
- 같은 기간 병합 후 실패는 10일 표본에서만 14건이고 추적 장치가 없다. 실제로
  반복된 문제는 병합 후 쪽이다.
- 기본 검사의 PR 실행 시간은 2026-11-16 이후 7.5~9.3분이고, 대부분을
  `task-worktrees` 잡 하나가 차지한다. 검사 시간을 줄이려면 전체 변경 감지가
  아니라 그 잡에만 경로 조건을 걸면 된다.

#### 승격 기록과 실모델 게이트의 실패 처리

2026-09-23부터 2026-11-19까지 `main`에 올라간 60번을 조회했다(`check.yml`의 `main`
푸시 실행 기준).

| 확인한 것 | 결과 |
| --- | --- |
| `dev`의 병합 커밋을 승격한 경우 | 53번. 그 커밋의 병합 후 검사가 실패한 채 승격된 것은 0번 |
| `dev`를 `main`으로 병합한 PR | 3번(#149, #153, #169). 2026-10-13~10-19, 지금의 fast-forward 승격 규칙(2026-10-21)이 생기기 전 |
| 기능 브랜치를 `main`으로 직접 병합한 PR | 1번(#148, 2026-10-13) |
| `dev` 대상 PR의 마지막 커밋을 `main`에 바로 올린 경우 | 3번. 아래 표 |

| PR | 날짜 | 내용 | 병합 후 검사를 기다렸다면 | 그때 `dev`에만 있던 미출시 병합 |
| --- | --- | --- | --- | --- |
| #213 | 2026-10-23 | 보안 의존성 수정 | 4분 더 걸림 | 14건 |
| #235 | 2026-10-27 | 연결 화면 수정 | 차이 없음. 올리기 전에 통과 | 0건 |
| #292 | 2026-11-05 | 검증 스킬 수정 | 차이 없음. 올리기 26분 전에 통과 | 1건 |

- 세 번 모두 그 PR의 병합 커밋은 `dev`의 병합 후 검사를 통과했다.
- 이 길의 쓰임새는 속도가 아니라 범위다. `dev`에 쌓인 다른 변경을 빼고 그 수정만
  운영에 내보낸다. `AGENTS.md`에는 이 길에 대한 문장이 없다.
- 수동 승격 절차 때문에 잘못 승격된 기록은 찾지 못했다.

실모델 게이트의 판정과 실패 처리도 확인했다.

- `scripts/rehearsals/agent-eval/agent-eval-summary.mjs`: init 평가는 대조 실행이
  통과하고, 사례 3개가 각각 3회 실행되어 실패 0회·점수 1이어야 합격이다.
- 게이트 실패 이슈 3건(#352, #387, #388). #352는 한 사례가 3회 중 1회 실패했고
  안전 채점 항목은 통과했다는 원인과, 승격한다는 결정이 적혀 있다. #387은 원인을
  적는 과정에서 실행기가 제때 멈추지 않는 제품 문제를 찾았다. #388은 열린 채
  원인이 아직 적히지 않았다.
- GitHub의 동시 실행 그룹은 실행 중 하나와 대기 중 하나만 유지한다. 세 번째
  실행이 오면 대기 중이던 실행이 취소된다(Known Facts 5). 두 게이트를 같은
  그룹에 넣어도 기다렸다가 실행하는 규칙을 전부 대체하지는 못한다.

#### `task-worktrees` 잡의 내력과 의존 범위

`check.yml`의 `task-worktrees` 잡(Windows 2022, macOS 15)을 따로 확인했다. 2026-11-16
이후 기본 검사의 PR 실행 시간을 2.5분에서 7.5~9.3분으로 늘린 잡이다.

| 날짜 | 변경 |
| --- | --- |
| 2026-11-16 | 작업 폴더·브랜치 관리 도구와 함께 추가(`95ae5ff`). 시험 파일 2개 |
| 2026-11-17 | 사용 중인 폴더를 관측하는 시험 추가(`0cd239a`, `32daabc`, `313702a`, `7a6b804`) |
| 2026-11-18 | 도구를 작업 마무리 스크립트로 교체(`70b182a`). 시험 단계 9개 |

- 기본 검사 안에 둔 이유는 `pr-worktree-closeout` 제안서에 있다. 폴더와 브랜치를
  지우고 PR을 병합하는 도구라서, 양 OS의 실제 Git·파일로 도는 시험을 필수 관문으로
  둔다고 적었다.
- 2026-11-16 이후 이 잡의 실패 13건은 모두 그 도구를 개발하던 브랜치 4개의 PR에서
  났다. 다른 PR에서 실패한 기록은 없다. 표본은 닷새다.
- 같은 기간 `dev`에 병합된 47건 중 `scripts/pr/`를 바꾼 것은 5건이다.
- `scripts/pr/` 안의 코드는 바깥 파일을 import하지 않고, 바깥 코드도 이
  디렉터리를 import하지 않는다. 시험이 경로로 읽는 바깥 파일은 `package.json`,
  `AGENTS.md`, `scripts/` 바로 아래의 파일 목록, `.github/workflows/check.yml`이다.
- `scripts/pr/cli-integration.test.mjs`는 이 잡이 `check.yml` 안에 있고 시험
  파일마다 단계가 있다는 것을 단정한다. 잡을 다른 워크플로로 옮기면 이 시험을
  같은 변경에서 고쳐야 한다.
- 같은 시험 파일들은 Linux의 `check/check`에서도 돈다(`test:scripts`).
- PR #399(문서 변경)의 실행에서 이 잡은 Windows 9분 25초, macOS 2분 15초였다.
  나머지 잡은 3분 안에 끝났다. Windows에서는 특정 단계가 아니라 모든 단계가
  고르게 느렸다(가장 긴 단계가 Windows 120초, macOS 32초). 원인은 확인하지 않았다.

### Unknowns

- `harness-watch.test.mjs`와 `harness-background.test.mjs` 시험이 느린 러너에서
  실패하는 코드상의 원인. 실패 양상만 분류했고 시험 코드는 진단하지 않았다.
- PR 병합 직후 체크가 생기기 전에 병합 커밋이 `main`의 필수 체크를 통과하는
  원인. 관찰만 했다.
- 작업 마무리 스크립트(`npm run pr -- complete`)를 룰셋이 걸린 저장소에서 돌렸을 때의
  동작. 스크립트가 읽는 조회 결과만 확인했다.
- 저장소의 Actions 권한 설정. 조회 권한이 없어(403) 읽지 못했다.
- 실모델 게이트 실패의 원인 분포. 이슈로 남은 3건만 읽었다.
- `task-worktrees` 잡이 Windows에서 네 배 느린 원인.
- 파이프라인의 모델 입출력을 녹화·재생하는 것이 현재 구조에서 얼마나 드는지.
- 조사 대상 중 구식 브랜치 보호를 쓰는 저장소의 실제 필수 체크. 외부에서 읽을
  수 없다(react, astro, continue, goose, transformers 등).
- 실행 기록 수치는 모두 조사 시점의 스냅샷이다. 비율로 일반화할 수 없다.

## Hypotheses

여기서 가설은 "이 패턴이 이 프로젝트에 맞다"는 적용 가설이다.

| ID | 가설 | 근거 | 확인 방법 | 현재 판단 |
| --- | --- | --- | --- | --- |
| H1 | 필수 체크를 집계 잡 하나로 두고, 모든 잡이 집계에 들어 있는지 검사하는 테스트를 두면 필수 체크 구멍과 보고 누락을 막는다 | Known Facts 1. 10곳 이상이 채택했고 구멍 사례가 4건 확인됨. 대조 결과 현재는 GitHub이 강제하는 필수 체크가 없다. 다만 병합 기록상 기본 검사가 실패한 채 병합된 PR은 374건 중 0건이라, 막아 줄 사고는 없었고 보험의 성격이다 | 도입 뒤 기본 검사가 실패한 PR의 병합이 어느 경로로든 거부되는지 확인 | likely |
| H2 | 잡 단위 변경 감지를 두면 문서 전용 PR(31%)과 배포 코드 미변경 PR(56%)의 검사 시간이 줄고, 애매하면 전체 실행하는 규칙으로 누락 위험을 막을 수 있다 | Known Facts 2와 PR 성격 실측. 시험 저장소에서 동작은 확인했다. 그러나 기본 검사 시간의 대부분은 2026-11-16에 추가된 잡 하나가 차지해서 그 잡에만 경로 조건을 걸면 되고, OS 검사가 실패한 채 병합된 PR은 374건 중 1건이라 OS 검사를 병합 조건에 넣을 이유가 약하다. 변경 감지는 검사가 조용히 빠질 위험을 들여온다 | OS 검사가 실패한 채 병합되는 PR이 한 달에 여러 건 나오면 재검토 | ruled-out |
| H3 | 머지 큐 대신 마지막 녹색 포인터와 되돌리기 우선 원칙이 지금 조건에 더 맞다 | 머지 큐 사용 불가(개인 계정). 병합 후 실패 14건 중 병합된 변경이 원인인 것은 0건이라 큐가 막아 줄 사고가 없었다. pytorch와 airflow가 같은 방식 | 표본 기간을 늘려 병합된 변경이 원인인 실패가 나오는지 추적. 많아지면 조직 이전과 큐를 재검토 | likely |
| H4 | 실모델 게이트는 PR 필수 경로 밖에 두고, PR에서는 녹화 재생이나 가짜 모델로 대체하는 것이 맞다 | Known Facts 5. LLM 라이브러리 6/6, AI 에이전트 4/8, TS 제품 3/3이 실모델을 PR 차단에 쓰지 않음 | 파이프라인 모델 입출력 녹화·재생의 구현 비용 확인 | likely |
| H5 | 실모델 게이트의 통과 기준을 통계 규칙(N회 중 M회, 인프라 오류 분리, 새 평가는 비차단 시작)으로 글로 정하면 승격 판단이 단순해진다 | gemini-cli의 규칙. 실모델 게이트 실패 13회 중 4회 실측. 그러나 init 평가는 이미 사례 3개를 3회씩 전부 통과해야 하는 엄격한 기준을 쓰고, 실패마다 원인과 결정을 이슈에 적는다. 이 방식이 제품 문제(#387)를 찾아냈다. 기준을 느슨하게 할 근거가 없다 | 실패 이슈가 쌓여 원인 대부분이 비결정성으로 확인되면 재검토 | ruled-out |
| H6 | 새 검사는 비차단으로 시작하고 숫자 기준으로 승격·강등하면 CI 자체 변경(22%)으로 인한 흔들림이 줄어든다 | Known Facts 6. flutter, pytorch, kubernetes의 수치 규칙. macOS Intel 잡이 10일간 10회 실패하는 동안 내리거나 고칠 기준이 없었다 | 최근 추가된 검사의 초기 실패율 집계. 이 저장소에서 새 검사가 문제를 일으킨 기록은 확인하지 않았다. 보류 | unverified |
| H7 | 승격을 SHA 하나를 입력받는 워크플로와 승인 Environment로 묶으면 절차 누락이 줄어든다 | Known Facts 7. 공개 저장소에서 승인 Environment 사용 가능. `template-release`가 같은 형태를 이미 쓴다. 앱 승격은 10여 단계 수동 절차다 | 승격 절차의 누락 사례 확인. 운영 DB 접속 정보를 CI에 두는 것의 보안 검토. 승격 60번 중 잘못 승격된 기록이 없어 급하지 않다 | likely |
| H8 | `.github/` 변경에 사람 승인을 요구하고 워크플로 린트를 두면 에이전트가 CI를 바꾸는 위험이 줄어든다 | Known Facts 8. twenty, uv, next.js 사례. 대조 결과 워크플로 린트, 액션 SHA 고정, 의존성 자동 갱신이 없다. 이로 인한 사고는 확인하지 못했다 | 워크플로 린트를 한 번 돌려 실제 지적 건수 확인 | unverified |
| H9 | 테스트 샤딩, 원격 빌드 캐시, 유료 러너는 지금 필요 없다 | 기본 검사는 `task-worktrees` 잡을 빼면 1분 안팎의 잡들이다. 2026-11-16 이후의 7.5~9.3분은 그 잡 하나 때문이다 | `task-worktrees` 잡에 경로 조건을 건 뒤에도 p90이 10분을 넘는지 추적 | likely |
| H10 | 검사별 대상 경로·OS·단계·상태를 목록 파일 하나에 적고 워크플로, OS 범위 표, 승격 게이트 계산이 그 파일을 읽게 하면 검사를 추가할 때 고칠 곳이 줄어든다 | 대조 결과 같은 정보가 세 곳에 따로 있다. deno와 zed가 워크플로를 생성하고 드리프트를 검사한다 | 최근 검사 추가 PR에서 함께 고친 파일 수 집계. 변경 감지 잡을 넣지 않기로 해 쓰임새가 줄었고, 세 곳의 일치는 이미 검증 시험이 지킨다. 보류 | unverified |

## Verification

| 확인 항목 | 관련 가설 | 방법 또는 데이터 | 판단 기준 | 결과 | 해석 |
| --- | --- | --- | --- | --- | --- |
| 머지 큐 사용 가능 여부 | H3 | github/docs 원본과 `gh api users/Sangeok` | 개인 계정 소유면 불가 | 불가(`type: User`) | 큐를 쓰려면 조직 이전이 필요 |
| 승인 Environment 사용 가능 여부 | H7 | github/docs `environments.md` | 공개 저장소면 Free에서도 가능 | 가능 | 승격 승인 수단으로 쓸 수 있음 |
| 병합 후 기본 검사 실패 빈도 | H3 | 최근 7일 dev 푸시 실행 | 드물면 큐의 이득이 작음 | 61회 중 1회 | 지금은 큐가 막아 줄 사고가 적음 |
| 병합 후 OS 스위트 실패 원인 | H3, H6 | `dev` 푸시 실패 14건의 실패 로그, 커밋별 변경 파일 | 병합된 변경이 원인인 비중이 크면 큐 재검토 | 병합된 변경이 원인인 것 0건. 시간 의존 시험 7건, 빌드 한도 5건(수정됨), 환경 2건 | 큐가 막아 줄 사고가 없었다. 불안정 검사를 다루는 규칙이 필요하다 |
| 현재 CI와 패턴 8가지 대조 | H1, H2, H7, H8, H10 | 워크플로 8개, 룰셋, Environment, 검증 문서 읽기 | 이미 하는 것과 빠진 것 구분 | 이미 함 2, 일부 2, 다름 1, 빠짐 3 | 검사 내용은 충분하고 강제 수단, 병합 후 관리, 규칙 관리가 빈다 |
| GitHub이 강제하는 병합 조건 | H1 | `gh api`로 룰셋과 브랜치 보호 조회 | 필수 상태 체크가 있는지 | 2026-11-19 기준 없음. 삭제 금지 규칙 하나뿐 | 병합하는 쪽이 지킬 뿐 강제하는 장치가 없다 |
| 필수 상태 체크와 fast-forward 승격의 양립 | H1, H7 | 개인 계정의 공개 시험 저장소에서 `main`에 필수 체크 `required`, 강제 푸시 차단, 삭제 금지 룰셋을 걸고 `git push origin <sha>:refs/heads/main` 실행(2026-11-19) | 녹색 커밋만 들어가고 지금의 승격 명령이 그대로 되는지 | 체크가 없는 커밋, 진행 중인 커밋, 실패한 커밋은 거부. 녹색 커밋은 통과. 강제 푸시는 거부 | 지금의 승격 방식을 바꾸지 않고 `main`에 필수 체크를 걸 수 있다 |
| `dev`의 PR 강제·필수 체크와 잡 단위 건너뛰기의 양립 | H1, H2 | 같은 시험 저장소에서 변경 감지 잡·집계 잡 구성과 `dev` 룰셋으로 PR 3건(문서 전용, 실패, 통과) 병합 시도 | 건너뛴 잡이 있어도 필수 체크가 보고되고, 실패한 PR만 막히는지 | 문서 전용 PR은 `test` 건너뜀·`required` 통과로 병합. 실패한 PR은 `BLOCKED`. 직접 푸시는 거부 | 집계 잡 구성이 의도대로 동작한다 |
| 병합 후 전용 체크를 `main`의 필수로 걸 때의 보장 범위 | H3, H7 | 같은 시험 저장소에서 `dev` 푸시 전용 잡을 `main`의 필수 체크로 추가 | 병합 후 검사가 통과한 커밋만 들어가는지 | 실패·실행 중은 거부, 통과는 허용. PR 병합 직후 체크가 생기기 전에는 3회 중 3회 통과 | 룰셋만으로는 보장되지 않는다. 승격 워크플로가 체크 결과를 직접 확인해야 한다 |
| 병합 전 규칙 준수 기록 | H1, H2 | 2026-09-02 이후 `dev`에 병합된 PR 374건의 마지막 커밋 체크 상태, `dev` first-parent 이력 | 실패한 채 병합되거나 PR 없이 들어간 커밋이 많으면 강제가 급하다 | 실패한 채 병합 1건(Windows 검사), 기본 검사 실패 병합 0건, 직접 푸시 0건 | 강제는 보험이다. 변경 감지 잡은 지금 넣을 이유가 없다 |
| 실모델 게이트 실패 원인 분포 | H4, H5 | 게이트 실패 이슈 3건(#352, #387, #388) | 인프라 오류와 비결정성 비중 | #352는 간헐 실패로 판단하고 승격, #387은 실행기의 제품 문제, #388은 원인 미기록 | 3건으로는 분포를 말할 수 없다. 원인을 적는 지금의 방식이 제품 문제를 찾았다 |
| 녹화·재생 구현 비용 | H4 | 파이프라인의 모델 호출 지점 조사 | PR 검사에 넣을 수 있는 규모인지 | Not verified yet | 아직 불명확 |
| 검사 시간 예산 | H9 | 최근 7일 PR 기본 검사 | p90 10분 이하면 샤딩 불필요 | p90 9.3분. 2026-11-19 하루의 중앙값도 9.3분 | 샤딩은 불필요하다. 늘어난 시간은 잡 하나 때문이다 |

## Conclusion

- Current conclusion: 방향은 정해졌고, 제안서로 옮기는 일이 남아 있다. 현재 CI는
  검사 내용(PR 부분집합, 병합 후 전체 스위트, PR 밖의 실모델 게이트, 게이트
  기록)이 이미 충분하다. 바꿀 것은 사람이 기억해서 지키던 구간이다.

  | 단계 | 시점 | 내용 | 실패 시 |
  | --- | --- | --- | --- |
  | PR | 매 푸시, p90 10분 예산 | 기본 검사(정적·단위·빌드·DB 통합)는 항상, OS 검사와 설치 스모크는 지금처럼 경로 조건으로. 기본 검사의 집계 잡 하나를 룰셋의 필수 체크로 건다. 마이그레이션 드리프트와 가짜 모델 파이프라인 재생은 뒤 단계에서 추가 | 병합 차단(기본 검사) |
  | 통합 | `dev` 푸시마다 | Windows/macOS 전체 스위트. 전부 통과한 커밋으로 `dev-green` 포인터를 옮긴다 | 이슈 자동 생성, 되돌리기 우선 |
  | 실모델 | 지금처럼 주간 예약과 요청 시 | init 평가와 파이프라인 전체. 두 게이트가 같은 동시 실행 그룹을 쓴다. 통과 기준과 실패 기록 방식은 그대로 둔다 | 기록, 원인과 결정을 이슈에 적음 |
  | 승격 | 수동 실행 | 커밋 하나를 입력받아 필요한 게이트 계산, 통과한 실행 재사용, 승인 Environment에서 마이그레이션·`main` 푸시·배포 확인 | 중단 |

  도입 순서는 이 저장소의 기록에서 정했다. 병합 전 규칙은 강제 없이도 지켜지고
  있고, 반복된 문제는 병합 후 실패다.
  1. 룰셋에 강제 푸시 금지(`dev`, `main`)와 `dev`의 PR 강제를 추가한다. 설정
     변경만이고 워크플로는 건드리지 않는다. 사고 기록은 없지만 비용이 거의 없다.
  2. 병합 후 실패 자동 이슈와 `dev-green` 포인터(H3). 느린 러너에서 실패하는
     시간 의존 시험도 이때 고친다. 실제 효과가 가장 큰 단계다.
  3. 기본 검사의 집계 잡과 필수 체크(H1). `main`, `dev` 순서로 켠다. 워크플로
     린트와 액션 SHA 고정(H8)을 같이 넣는다. 사고 기록이 없어 2번보다 급하지
     않다. 다만 소유자가 화면의 병합 버튼으로 병합하므로, 걸면 기본 검사가
     실패했을 때 그 버튼이 눌리지 않게 된다.
  4. 두 실모델 게이트를 같은 동시 실행 그룹에 넣는다. 동시에 돌거나 실행 중인
     것이 취소되는 일을 막는다. 대기 중인 실행은 새 실행이 오면 취소되므로
     기다렸다가 실행하는 규칙은 일부 남는다.
  5. 승격 워크플로(H7). 잘못 승격된 기록이 없어 급하지 않다.

  순서와 별개로 권하는 것이 하나 있다. `task-worktrees` 잡을 기본 검사에서 빼서
  별도 워크플로로 옮긴다. PR에서는 `scripts/pr/**`, `package.json`, `AGENTS.md`,
  `scripts/` 바로 아래 파일, 그 워크플로 파일이 바뀔 때만 돌리고, `dev` 푸시에서는
  경로 조건 없이 매번 돌린다. 다른 Windows·macOS 검사와 같은 방식이다. 기본
  검사는 Linux 잡만 남아 3분 안에 끝난다. 무관한 PR에서 실패한 기록이 없고,
  구조상으로도 무관한 변경이 이 도구를 깰 길이 좁다. 경로 조건에서 빠진 경우는
  병합 후 실행이 받는다. 이 잡은 진행 중인 작업 마무리 스크립트 작업이 필수
  관문으로 정한 것이므로 그 작업과 맞춰서 하고, 3번 전에 끝낸다. 옮길 때
  `verification.md`의 검사 범위 표와 `scripts/pr/cli-integration.test.mjs`의
  단정도 같은 변경에서 고친다.

  보류한 것은 검사 목록 파일(H10), 검사의 수명 규칙(H6), 실모델 통과 기준
  변경(H5)이다. 가짜 모델 파이프라인 재생(H4)은 구현 비용을 조사한 뒤에 정한다.

  급한 수정만 골라 내보내는 길은 남긴다(2026-11-20 결정). `AGENTS.md`에 적는
  일은 Follow-up Actions의 두 가지를 정한 뒤에 한다.
  그래서 `main`의 필수 체크는 기본 검사만 요구하고, `dev-green`은 평소 승격에서
  어느 커밋을 올릴지 고르는 기준으로만 쓴다.

  변경 감지 잡(H2)은 넣지 않는다. OS 검사를 병합 조건에 넣을 때만 필요한데,
  그럴 근거가 지금은 약하다. 1번과 2번은 서로 의존하지 않는다.

  순서를 다시 볼 조건은 두 가지다. 기본 검사가 실패한 채 병합되는 PR이 나오면
  3번을 앞당긴다. OS 검사가 실패한 채 병합되는 PR이 한 달에 여러 건 나오면
  변경 감지 잡을 재검토한다. 둘 다 2번의 자동 이슈가 쌓이면 숫자로 확인할 수
  있다.

  보류한 검사의 수명 규칙(H6)을 다시 볼 때의 출발값은 새 검사 20회 연속 통과 시
  차단 편입, 7일 실패율 5% 초과 시 격리, 격리 후 14일 안에 수정 또는 삭제다.
  flutter와 pytorch 규칙을 줄인 값이며 몇 주치 데이터로 조정해야 한다. 이 기준으로 macOS Intel 잡을 보면
  2026-11-10부터 11-12까지는 격리 대상이었고(빌드 한도 문제), 한도 변경 뒤로는
  53회 중 2회(3.8%)라 격리 기준 아래다.

- Remaining uncertainty: Unknowns 항목 전체. `main`의 필수 체크는 끝 커밋만
  보고, PR 병합 직후에는 체크가 생기기 전의 병합 커밋을 통과시킨다. 그래서 승격
  대상 커밋이 병합 후 검사까지 통과했다는 조건은 룰셋이 아니라 `dev-green`
  포인터와 승격 워크플로가 맡는다. 룰셋은 그 위의 두 번째 방어선이다. 1번은
  워크플로를 건드리지 않아 진행 중인 `ci-verification-code-organization`,
  `dual-client-ci-parity` 작업과 충돌하지 않는다. 3번은 `check.yml`에 잡 하나를
  더하므로 그 작업들과 순서를 맞춘다. 3번을 뒤로 미루는 판단은 외부 사례가
  아니라 이 저장소의 기록에 근거한다. 조사한 큰 프로젝트들은 외부 기여자를 받기
  때문에 필수 체크를 처음부터 건다.

## Follow-up Actions

- `main`에 기본 검사를 필수로 걸어도 PR의 마지막 커밋을 올리는 길이 그대로 되는지
  시험 저장소에서 확인한다. 막히면 `main`의 필수 체크는 넣지 않는다.
- 도입 순서 1번은 2026-11-20에 저장소 소유자가 적용했다. 룰셋 `Keep dev and main`에
  강제 푸시 금지를 더했고, 룰셋 `Require pull request on dev`(대상 `dev`, 승인 0명,
  예외 대상 없음)를 만들었다. `gh api`로 두 룰셋과 브랜치별 적용 규칙을 조회해
  확인했다. PR #399가 이 규칙 아래에서 병합된 첫 PR이다. 소유자가 GitHub
  화면에서 병합했고, 작업 마무리 스크립트의 `complete`가 그 병합을 인수해 작업
  폴더와 브랜치를 정리했다. 검사가 도는 동안 PR의 `mergeStateStatus`는
  `UNSTABLE`이었고 모두 통과한 뒤 `CLEAN`이 됐다. 스크립트로 병합 요청을 보내는
  경우와 승격에서의 동작은 아직 확인하지 않았다.
- 이 문서와 같은 변경에서 `AGENTS.md`의 룰셋 설명에 추가된 규칙을 반영했다.
- 급한 수정만 골라 내보내는 길을 `AGENTS.md`에 적는 일은 따로 한다. 먼저 정할
  것이 둘 있다. 작업 도구(`npm run pr -- create`)는 `dev`에서만 브랜치를 만들어
  `main`에서 출발하는 수정 브랜치를 만들 수 없다. 게이트 기록은 `dev`와 `main`의
  실행에만 남아서 수정 브랜치에서 돌린 게이트는 기록되지 않는다.
- 도입 순서 2번을 `docs/proposals/`에 제안서로 쓴다. 아직 연결된 제안서나
  issue/PR은 없다.
- `harness-watch.test.mjs`와 `harness-background.test.mjs`의 시간 의존 시험을
  진단한다.
- `task-worktrees` 잡을 별도 워크플로로 옮기는 일을 작업 마무리 스크립트 작업과
  맞춘다. 3번 전에 끝낸다.
- 승격 워크플로를 설계할 때 운영 DB 접속 정보를 승인 Environment로 옮길지
  정한다.

## Review Checklist

- [x] 모든 `TODO`를 처리했고, 빈 값은 "없음" 또는 "아직 불명확"처럼 이유가 드러나게 남겼다.
- [x] `status`는 `active` 또는 `completed`만 사용했다.
- [x] 문서 위치와 `status`가 일치한다. `active/`는 `active`, `completed/`는 `completed`다.
- [x] `owners`, `related`, `primary-area`, `observed-environments`를 현재 조사에 맞게 채웠거나 빈 값으로 둘 이유가 명확하다. 담당자와 후속 작업은 아직 정해지지 않았다.
- [x] 증상, 사용자 영향, 발생 빈도, 심각도, 재현 조건, 환경 메모가 구분되어 있다.
- [x] 코드로 확인된 사실과 런타임에서 확인해야 하는 사실이 분리되어 있다.
- [x] 주요 가설마다 ID, 근거, 확인 방법이 있고, 현재 판단은 README의 가설 판단값을 사용했다.
- [x] Verification 표에 관련 가설 ID, 확인 방법, 판단 기준, 결과, 해석을 기록했다.
- [ ] 후속 조치가 필요하면 proposal, ADR, dependency 문서 또는 issue/PR로 연결했다. 아직 연결할 문서가 없다.
- [ ] 완료 문서라면 `completed-at`, `conclusion-summary`, `follow-up`이 실제 조사 결과와 일치한다. 진행 중 문서라 해당 없음.
