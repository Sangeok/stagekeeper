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
webhook delivery ID만 24시간 보관하고 raw payload는 저장하지 않는다. 운영자는 maintenance를 최소 10분마다 실행한다.
명시적 운영 준비 확인 설정 없이는 기능을 활성화하지 않는다. 기능 OFF에서도 disconnect/webhook/maintenance는 유지한다.
connection revision과 tokenVersion을 분리하고, refresh lease를 획득한 토큰은 불확실한 결과나 process 중단 후 재사용하지 않는다.

public/private visibility를 지원하고 archived는 선택에서 제외한다. 미지원/archived 개수를 숨기지 않는다. URL 등록은 기존 계약을 유지한다.

## Consequences

별도 migration·keyring·정리 작업이 필요하다. 기능은 기본 OFF이며 실제 App의 public 설정·Metadata read·callback·조직/SSO 인수와 운영 준비 전에는 켜지 않는다.
개별 토큰 폐기가 실패하면 로컬 중지는 유지하고 외부 폐기는 미확인으로 보고한다. 공유 installation이나 전체 grant는 제거하지 않는다.

## Confirmation

경계 검사, provider/상태/암호화 부정 시험, 실제 DB 경쟁 시험, Web Action·route binding, 브라우저 fixture, fresh Next build를 확인한다.
실제 GitHub·운영 key 회전·배포 복구 인수는 별도 증거로 기록한다.
