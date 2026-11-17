---
status: "active"
created-at: "2026-11-12"
completed-at: null
owners: []
related:
  - "docs/proposals/active/shared-modules-and-plugin-distribution.md"
primary-area: "scripts의 의존 관계, 리허설 실행 격리, 게이트 기록 산출물"
observed-environments:
  - "macOS 26.2, Node.js v26.4.0, 로컬 소스 정적 검토"
  - "저장소 밖 임시 사본과 간이 HTTP 서버 대역을 이용한 제한된 재현"
conclusion-summary: null
follow-up: []
---

# scripts 유지보수·확장성 및 결합도 조사

## Summary

`scripts`가 빌드·검증·패키징·운영 도구를 함께 소유하는 것 자체를 문제로 보지 않고,
변경 영향이 불필요하게 전파되는지와 실행 간 상태가 섞이는지를 조사했다.
현재 확인한 개선 사항은 다섯 가지다. 기존 프로젝트 규칙 위반 여부나 파일 길이를
선정 기준으로 삼지 않았으며, 실제 의존 관계·중복 지식·재현 결과를 근거로 판단했다.

이 문서는 조사 결과와 개선 방향을 기록한다. 코드 수정, 의존성 추가, CI 변경과
개선 후 인수는 수행하지 않았다. 후속 구현 범위와 담당자가 정해지지 않았으므로
`owners`와 `follow-up`은 빈 배열로 두고, 요청한 `active/`에 보존한다.

## Problem

- 증상: 버전 검사에 OS 런타임이 함께 로드되고, 여러 리허설에 빌드 정보 해석이
  분산돼 있다. 직접 사용하는 라이브러리가 간접 의존성으로 설치되며, 서버 포트와
  파일 산출물을 재사용할 때 실행 결과가 섞일 수 있다.
- 영향: 관계없는 변경으로 도구가 실패하거나, 기능 확장 때 여러 시험을 함께 고쳐야
  하고, 반복·병렬 실행에서 다른 실행의 상태를 현재 결과로 취급할 수 있다.
- 빈도: H1~H3의 의존 구조는 현재 소스에서 확인했다. H1·H4·H5의 실패는 아래의
  특정 재현 조건에서 관찰했다. 운영 환경의 발생 빈도는 조사하지 않았다.
- 심각도: 유지보수 우선순위는 H1~H4 `medium`, H5 `low`로 평가한다.
  실제 운영 장애가 발생했다는 분류는 아니다.

## Scope

관측 기준은 HEAD `eabd1381169a2692e9b29317c31047bbb4027c7d`의 로컬 작업 트리다.
조사 중 `scripts`, `package.json`, `package-lock.json`에는 변경이 없었다.
다른 작업의 문서 변경은 보존했다.

- 포함: 생산 TS/JS 계열 스크립트 65개의 정적·문자열 리터럴 동적 import 관계,
  관련 공통 helper와 소비자, 패키징·리허설·게이트 기록 코드, 직접/간접 npm 의존성,
  관련 테스트와 workflow 호출부.
- 제외: 제품 전체의 동작 감사, 새로운 폴더 아키텍처 설계, 실제 DB·모델·설치 번들
  인수, Windows 실기 실행, GitHub 이슈 작성과 운영 환경 변경.
- 이전 `packages`·`plugin/lib` 미사용 배포 사본 조사는 별도 주제다. 이 문서의
  다섯 항목에 포함하지 않는다.

## Evidence

### Known Facts

추적한 import 경로에서는 `scripts`를 포함하는 순환 의존이나 제품 실행 코드가
`scripts`를 import하는 역방향 의존을 발견하지 못했다. 공통 DB 검증 helper의 재사용과
운영 CLI가 서버 서비스를 호출하는 구조만으로는 개선이 필요하다고 판단하지 않았다.

### H1. 버전 검사가 Windows 패키징·런타임에 불필요하게 의존한다

**근거**

- [verify-plugin-version.mjs](../../../scripts/checks/verify-plugin-version.mjs) 4행은
  `isShippedPluginFile` 하나를 쓰려고 Windows 패키징 모듈을 import한다.
- [package-windows-plugin.mjs](../../../scripts/windows/package-windows-plugin.mjs)
  6~12행은 파일 필터와 함께 `installedWindowsRuntime` 및 `verifierPackage`를 불러온다.
- [role-commands.mjs](../../../plugin/runtime/role-commands.mjs) 12행은 모듈을
  로드할 때 `role-process.ps1`과 `RoleProcess.cs`를 읽는다.
- [macOS 패키징 모듈](../../../scripts/macos/package-plugin.mjs) 9행에는 같은
  출하 파일 필터가 별도로 정의돼 있다.

**영향과 재현**

버전 비교에는 Windows 실행 구현이 필요하지 않지만, 그 구현의 파일 배치나 로드 실패가
버전 검사까지 전파된다. 임시 사본에 검사기와 의존 모듈·보조 파일을 복사하고
`inspectPluginVersion`에 동일한 유효 입력을 전달했다.

| 임시 사본 상태 | 자식 종료 코드 | 관찰 결과 |
| --- | --- | --- |
| 보조 파일 존재 | 0 | 버전 비교 완료, `problems: []` |
| `RoleProcess.cs`만 제거 | 1 | import 단계에서 `ENOENT`, 비교 결과 없음 |
| 같은 파일 복원 | 0 | 동일 입력으로 다시 비교 성공 |

**개선 방향**

출하 파일 판정을 OS와 무관한 작은 모듈로 분리해 버전 검사와 양쪽 패키징이 공유한다.
OS별 패키징 구현 전체를 공통화할 필요는 없다. 출하 범위를 변경하는
[별도 제안](../../proposals/active/shared-modules-and-plugin-distribution.md)과 파일
선택 책임이 겹치므로 후속 구현 때 두 작업의 범위를 함께 확인한다.

### H2. Next 빌드 정보 해석이 여러 리허설에 분산돼 있다

**근거**

- [백로그 리허설](../../../scripts/rehearsals/rehearse-backlog-pipeline.ts) 33행의
  `readActionIds`는 manifest를 읽고 경로 정규화·유일성·worker 정보를 검사한다.
- [파이프라인 리허설](../../../scripts/rehearsals/rehearse-multiple-pipelines.ts)
  31행과 [계정·토큰 리허설](../../../scripts/rehearsals/rehearse-account-usage-and-tokens.ts)
  26행도 같은 manifest에서 Action을 별도로 찾는다. 선택·검증 방식은 서로 다르다.
- [연결 해제 리허설](../../../scripts/rehearsals/rehearse-repository-disconnection.ts)
  52~57행은 대상 파일의 Action 개수를 2개로 고정하고, 자동 생성 이름
  `$$RSC_SERVER_ACTION_0`과 `$$RSC_SERVER_ACTION_1`을 각각 해제·재연결로 취급한다.
- [기존 manifest helper](../../../tests/server/fixtures/action-manifest.ts)도 있지만,
  모든 리허설이 이를 통해 빌드 정보를 해석하는 구조는 아니다.

**영향과 확인 범위**

빌드 정보 형식·경로 표현이 바뀌면 여러 리허설의 해석 코드를 함께 점검해야 한다.
자동 생성 번호와 정확한 개수에 의존하는 선택은 Action 추가나 컴파일 출력 변경의
영향을 제품 시나리오까지 전달한다. 로컬 빌드 manifest에서 위 자동 생성 이름을
확인했으나, 함수 순서 변경이나 Next 업그레이드로 실패하는 실험은 수행하지 않았다.

**개선 방향**

빌드 정보 읽기·경로 정규화·Action 식별처럼 같은 이유로 바뀌는 지식을 작은 어댑터에
모은다. 자동 생성 번호를 기능의 고정 식별자로 취급하는 선택은 사용자 동작을 통한
실행 또는 의미를 확인할 수 있는 식별 방식으로 대체하는 방안을 검토한다.
제품별 기대 결과와 검증 시나리오는 각 시험이 계속 소유한다.

### H3. 직접 사용하는 라이브러리를 간접 의존성에 기대고 있다

**근거**

| 라이브러리 | 직접 사용하는 스크립트 | 현재 lockfile의 설치 경로 |
| --- | --- | --- |
| `esbuild` | [clean-code 리허설](../../../scripts/rehearsals/rehearse-src-clean-code.ts) 11행, [인수 실패 리허설](../../../scripts/rehearsals/rehearse-acceptance-failure.ts) 11행, [브라우저 리허설](../../../scripts/rehearsals/rehearse-multiple-pipelines-browser.mjs) 11행 | `tsx` → `esbuild` |
| `pg` | [DB 준비 도구](../../../scripts/rehearsals/prepare-codex-macos-database.mjs) 5행, [파이프라인 슬롯 리허설](../../../scripts/rehearsals/rehearse-pipeline-agent-slots.ts) 18행 | `@prisma/adapter-pg` → `pg` |

[package.json](../../../package.json)에는 두 라이브러리의 직접 의존성 선언이 없다.
[package-lock.json](../../../package-lock.json)의 관측 버전은 `esbuild` 0.28.2,
`pg` 8.23.0이다. 현재 설치된 라이브러리를 읽기 전용으로 대조한 결과다.

**영향과 확인 범위**

스크립트가 직접 사용하는 API의 설치·버전 선택이 다른 도구의 의존성에 달려 있다.
그 도구가 의존성을 제거하거나 설치 구조를 바꾸면 별개인 리허설도 영향을 받을 수 있다.
현재 설치에서 모듈을 찾지 못하는 장애를 관찰한 것은 아니며, 의존성을 제거하거나
패키지 매니저를 바꾸는 실험도 수행하지 않았다.

**개선 방향**

직접 사용하는 라이브러리는 실제 사용 범위에 맞는 직접 의존성으로 선언한다.
불필요한 버전 업그레이드를 함께 진행하지 않고 기존 실행과의 호환성을 확인한다.

### H4. 공통 서버 helper가 다른 실행의 서버를 준비 완료로 오인한다

**근거**

[rehearse-client-init-smoke.ts](../../../scripts/rehearsals/rehearse-client-init-smoke.ts)
17~18행은 포트 `45438`과 `ORIGIN`을 고정한다. 261행의 `startServer`는 자식을 띄운 뒤
그 주소의 `/login`이 HTTP 200을 반환하면 준비 완료로 반환한다.
[파이프라인 리허설](../../../scripts/rehearsals/rehearse-pipeline-smoke.ts) 13행과
[Codex macOS 리허설](../../../scripts/rehearsals/rehearse-codex-macos.mjs) 99행도
같은 helper와 주소를 사용한다.

**영향과 재현**

이전 실행의 서버가 남거나 같은 호스트에서 시험을 겹쳐 실행하면, 기존 서버의 응답을
새 서버의 준비 완료로 받아들일 수 있다. 이는 서로 독립적이어야 하는 실행 사이의
공유 포트·주소에 의한 결합이다.

원본 `startServer` 함수만 AST로 추출해 TypeScript를 변환하고, 저장소 경로·포트·주소를
임시 환경 값으로 주입했다. 자식은 실제 Next.js 대신 시작 지연 후 해당 포트에 bind하는
간이 HTTP 서버 대역을 사용했다. 실제 helper의 준비 판정 로직은 유지했다.

| 조건 | helper의 반환 | 자식 상태·추가 관찰 |
| --- | --- | --- |
| 비어 있는 임의 포트 | 성공 | 새 자식 서버가 응답, 기존 서버 처리 요청 0개 |
| 기존 서버가 `/login`에 200을 반환하는 포트 | 성공 | 기존 서버가 요청 1개 처리, 새 자식은 이후 종료 코드 1 및 `EADDRINUSE` |

재현은 로컬 임의 포트와 직접 만든 임시 자식만 사용했다. DB 연결, 실제 Next.js 시작,
실제 Claude/Codex 모델 실행 또는 운영 서버 요청은 하지 않았다.

**개선 방향**

실행별 서버 주소·포트를 명시적으로 전달하고, 자신이 시작한 서버의 준비 완료를 확인한다.
점유된 포트의 응답을 성공으로 받지 않도록 거부 또는 실행 식별 검증을 두며,
시작 실패 시 직접 만든 자식과 자원을 정리하는 책임도 같은 helper에서 명확히 한다.

### H5. 게이트 기록 산출물이 재실행 시 이전 결과와 섞인다

**근거**

[gate-record.mjs](../../../scripts/rehearsals/gate-record.mjs) 164~169행은 기존 출력
디렉터리를 허용한다. `comment.md`는 항상 덮어쓰지만, 실패 발견이 없을 때 이전
`finding-title.txt`·`finding-body.md`를 제거하지 않는다. 기존 이슈를 찾지 못한 경우에도
이전 `finding-number.txt`가 남는다.

[후속 Action](../../../.github/actions/gate-record/action.yml) 51~55행은 이 파일들의
존재로 이슈 생성 또는 기존 이슈 댓글 작성을 결정한다.

**영향과 재현**

실행 A가 남긴 파일을 실행 B의 결과로 소비할 수 있다. 실제 `main` 함수를 같은 임시
출력 디렉터리로 두 번 호출해 다음 결과를 확인했다. GitHub API나 이슈 작성은 실행하지 않았다.

| 순서 | 두 호출의 종료 코드 | 관찰 결과 |
| --- | --- | --- |
| 실패 결과 → 성공 결과 | 0, 0 | 새 `comment.md`는 `findings: []`, 이전 실패 제목·이슈 번호 파일은 존재 |
| 커밋 A의 기존 이슈 발견 → 커밋 B의 새 실패 | 0, 0 | 제목은 커밋 B로 갱신됐지만 예시 이슈 번호 `403`은 커밋 A의 값으로 잔존 |

Action의 파일 검사와 결합하면 오래된 실패를 다시 기록하거나 다른 이슈에 댓글을
붙일 수 있다. 현재 CI의 정상 경로에서 실제 오기록을 확인한 것은 아니다.
job별 임시 디렉터리를 사용하는 현재 호출보다 로컬 재실행·도구 재사용에서의 위험이
명확하므로 우선순위를 낮게 평가한다.

**개선 방향**

실행마다 새 출력 디렉터리를 강제하고 기존 디렉터리는 쓰기 전에 거부하는 방식이
가장 작은 개선이다. 같은 경로를 재사용해야 한다면 결과 파일 전체가 한 실행의 상태로
교체되는 계약을 별도로 설계한다. 임의의 기존 출력 폴더를 무조건 지우는 방식은 피한다.

### Unknowns

- H1·H4·H5의 실제 운영·CI 발생 빈도와 사용자 영향은 측정하지 않았다.
- H2의 Next 업그레이드·Action 재배치 실패, H3의 간접 의존성 변경 실패는 실행하지 않았다.
- 다섯 개선 방향의 구현 비용과 적용 후 양 OS 동작·설치 호환성은 검증하지 않았다.
- 임시 재현 결과는 각각의 원인을 뒷받침하며 제품 전체 인수의 성공을 뜻하지 않는다.

## Hypotheses

| ID | 원인 가설 | 확인 방법 | 현재 판단 |
| --- | --- | --- | --- |
| H1 | 공통 파일 필터의 소유 위치 때문에 버전 검사에 Windows 런타임 로드 의존이 생긴다 | import 경로 대조, 보조 파일 제거·복원 대조군 | confirmed |
| H2 | 반복된 manifest 해석과 생성 번호 의존이 변경 영향을 여러 리허설에 전파한다 | 각 reader와 로컬 빌드 metadata 대조 | confirmed — 구조 확인, 변경 후 실패는 미실행 |
| H3 | 직접 사용하는 라이브러리의 설치가 다른 도구의 간접 의존성에 달려 있다 | import·require, package.json, lockfile 대조 | confirmed — 의존 경로 확인, 설치 실패는 미실행 |
| H4 | 공통 주소의 응답을 새 자식 서버의 응답으로 취급한다 | 동일 helper와 서버 대역, 빈 포트·점유 포트 대조군 | confirmed — helper 수준 재현 |
| H5 | 현재 실행이 쓰지 않는 이전 결과 파일을 소비자가 계속 읽는다 | 동일 출력 폴더 연속 호출, Action 소비 조건 대조 | confirmed — 로컬 파일 재현 |

## Verification

| 확인 항목 | 관련 가설 | 실행·확인 결과 | 한계 |
| --- | --- | --- | --- |
| TS/JS 스크립트 65개의 import 관계와 소비자 추적 | H1~H3 | 완료. 스크립트 내부 순환·제품 실행 코드의 scripts import는 발견하지 못함 | 문자열로 계산되는 모든 경로·외부 소비자를 완전히 증명하는 분석은 아님 |
| 버전 검사기 임시 의존 사본에서 C# 파일 제거·복원 | H1 | 정상 0 → 누락 1/ENOENT → 복원 0 | 실제 패키징·출시를 실행하지 않음 |
| 여러 manifest reader와 로컬 생성 이름 대조 | H2 | 중복 해석·차이·번호 및 개수 고정 확인 | framework 변경 재현은 하지 않음 |
| 직접 사용 라이브러리와 설치 원인 대조 | H3 | esbuild는 tsx, pg는 adapter-pg를 통해 설치됨 | 설치 구조 변경 실험은 하지 않음 |
| 원본 서버 시작 helper와 간이 서버 대역 실행 | H4 | 점유 포트에서 성공 반환 후 새 자식 EADDRINUSE 확인 | 실제 Next·DB·모델 인수는 아님 |
| 실제 gate-record main의 같은 출력 경로 재실행 | H5 | 성공 뒤 실패 파일 잔존, 다른 커밋에 이전 이슈 번호 잔존 | GitHub 이슈 생성·댓글은 실행하지 않음 |

재현 도구와 사본은 저장소 밖 임시 디렉터리에 만들었다. 임시 파일의 영구 보존을
문서의 근거로 삼지 않고 재현 조건·대조군·관찰 결과를 위에 남겼다.
저장소 코드·테스트·의존성·workflow는 수정하지 않았으며, 전체 build와 실제 인수 시험을
새로 실행한 것으로 기록하지 않는다.

## Conclusion

현재 확인한 개선 사항은 H1~H5의 다섯 가지다. 이 검토에서 추가로 확정한 개선 사항은 없다.
`scripts`의 역할 종류나 폴더 전체를 재편성해야 한다는 결론은 얻지 못했다.
각 항목은 의존 경계를 좁히거나 실행별 상태를 분리하는 국소 개선으로 시작할 수 있다.

개선 필요성의 근거와 확인 범위는 확보했지만 구체적인 구현·후속 인수는 남아 있다.
이 문서의 작성은 코드 변경 또는 운영 실행의 완료를 의미하지 않는다.

## Follow-up Actions

1. 후속 구현 시 현재 소스와 관련 제안서의 변경을 다시 확인하고 적용 범위를 정한다.
2. H1은 OS 중립 필터를 분리한 뒤 버전 검사와 양쪽 패키징의 파일 선택이 일치하는지 확인한다.
3. H2는 공통화할 해석 책임을 좁히고, 경로 표현·중복 등록·Action 추가에 대한 검증을 설계한다.
4. H3은 직접 의존성을 선언한 깨끗한 설치에서 해당 스크립트의 모듈 해석·실행을 확인한다.
5. H4는 빈 포트·점유 포트·시작 실패·실행 겹침을 검증하고 실제 Next 환경에서도 확인한다.
6. H5는 같은 경로 재호출을 거부하거나 이전 파일이 섞이지 않는지 검증한다. GitHub 쓰기 없이도
   파일 소비 경계의 회귀를 확인할 수 있다.

이 다섯 항목을 구현하는 별도 proposal·issue·PR과 담당자는 아직 정하지 않았다.

## Review Checklist

- [x] 발견 사항을 다섯 개로 한정하고 기존 항목을 세분해 개수를 늘리지 않았다.
- [x] 코드로 확인한 구조, 제한된 실행 재현, 아직 확인하지 않은 영향을 구분했다.
- [x] 재현 조건·결과·개선 방향을 각 항목에 기록했다.
- [x] 포트 재현에 실제 Next 대신 서버 대역을 사용했음을 명시했다.
- [x] 게이트 파일 재현에서 GitHub 쓰기를 하지 않았음을 명시했다.
- [x] 현행 규칙 준수 여부와 독립적으로 유지보수·확장성을 판단했다.
- [x] 코드 수정·의존성 추가·CI 변경·실제 인수를 완료했다고 주장하지 않았다.
