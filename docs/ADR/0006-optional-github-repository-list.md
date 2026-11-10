---
status: accepted
date: "2026-10-23"
applies-to: ["src/server/github", "src/fsd/features/create-project"]
decision-makers: ["user:Sangeok"]
consulted: []
informed: []
supersedes: []
superseded-by: null
---

# 선택형 GitHub 저장소 목록과 자격 증명 수명주기

## Context and Problem Statement

인증 없는 Public 목록은 Private 저장소의 반복 입력을 돕지 못한다. 기본 로그인에 repo scope를 추가하면 코드 권한까지 넓어진다.
사용자는 선택형 GitHub App 방식의 구현과 dev PR 제출을 요청했다. 운영 App 등록·비밀 공급·실제 조직 인수는 별도다.

## Decision Drivers

기존 로그인·Public/URL 등록 보존, 사용자와 App의 접근권한 교집합, 외부 토큰 비노출, 여러 인스턴스에서의 철회·갱신 일관성을 우선한다.

## Considered Options

- 기본 OAuth에 repo scope 추가: 요구 범위보다 큰 코드 권한을 요청하므로 제외한다.
- URL 등록만 유지: 반복 입력 문제를 해결하지 못한다.
- 별도 metadata-only GitHub App: 현재 로그인과 프로젝트 권한을 유지하면서 선택형 목록을 제공하므로 채택한다.

## Decision Outcome

`src/server/github.ts`를 `src/server/github/public-repositories.ts`로 옮기고 `api.server.ts`만 runtime 공개 진입점으로 사용한다.
새 github 모듈은 다른 기능 모듈에 의존하지 않는다. 인증·사용량 제한은 Next 진입점에서 조합한다.
UI와 adapter는 기존 create-project slice에 둔다. 일반 loader에 use-server를 붙이지 않는다.

자격 증명은 별도 versioned 32-byte keyring의 AES-256-GCM으로 봉인하며 사용자·용도·record ID를 AAD로 사용한다.
키는 운영 비밀 공급 경로로 주입한다. 새 키를 active로 추가한 뒤 maintenance 회전과 구 키 참조 부재를 확인하고 이전 키를 제거한다.
AUTH_SECRET을 재사용하지 않는다. 실제 key는 문서·로그·PR에 넣지 않는다.

시도·초안은 10분 후 읽기 불가이며 consume/cancel/supersede/disconnect 시 비밀을 즉시 지운다. 만료 row는 maintenance에서 물리 삭제한다.
webhook delivery ID만 24시간 보관하고 raw payload는 저장하지 않는다. maintenance는 최소 10분마다 실행한다.
2026-11-10 운영 전환 결정으로 수동 feature/operations-ready boolean을 제거한다.
App·webhook·vault 설정이 모두 유효하면 목록을 자동 제공하며, 설정이 불완전해도 disconnect/webhook/maintenance는 독립적으로 유지한다.
Vercel Pro Production의 Cron이 10분마다 정리 route를 호출한다. 별도 CRON_SECRET으로 요청을 인증하고,
누락·짧은 비밀키·잘못된 인증은 작업 없이 거부한다. 정기 작업은 key rotation을 수행하지 않으며 회전은 명시적 CLI 명령으로 유지한다.
connection revision과 tokenVersion을 분리하고, refresh lease를 획득한 토큰은 불확실한 결과나 process 중단 후 재사용하지 않는다.

public/private visibility를 지원하고 archived는 선택에서 제외한다. 미지원/archived 개수를 숨기지 않는다. URL 등록은 기존 계약을 유지한다.

## Consequences

별도 migration·keyring·정리 작업이 필요하다. 설정이 없으면 기능은 비활성이며 유효한 설정을 공급하는 배포에서 자동 활성화된다.
운영자는 전체 설정 공급 전에 migration·Cron 실행·키 복구와 실제 App의 public 설정·Metadata read·callback·조직/SSO 인수를 확인한다.
개별 토큰 폐기가 실패하면 로컬 중지는 유지하고 외부 폐기는 미확인으로 보고한다. 공유 installation이나 전체 grant는 제거하지 않는다.

## Confirmation

경계 검사, provider/상태/암호화 부정 시험, 실제 DB 경쟁 시험, Web Action·route binding, 브라우저 fixture, fresh Next build를 확인한다.
실제 GitHub·운영 key 회전·배포 복구 인수는 별도 증거로 기록한다.
