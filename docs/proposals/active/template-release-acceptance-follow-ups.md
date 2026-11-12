---
status: "pending"
stage: "blocked"
proposal-size: "standard"
created-at: "2026-11-11"
updated-at: "2026-11-11"
approved-by: null
approved-at: null
approval-scope: null
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/proposals/completed/2026-11-11-template-release-versioning.md"
  - "docs/architecture/template-releases.md"
  - "docs/test-reports/completed/2026-11-04-template-release-implementation.md"
  - "docs/test-reports/completed/2026-11-05-template-release-production-cutover.md"
  - "docs/test-reports/completed/2026-11-10-template-release-r1-activation.md"
  - "docs/test-reports/completed/2026-11-10-codex-macos-native-acceptance.md"
  - "docs/proposals/completed/2026-11-12-codex-dual-client-runtime-follow-ups.md"
---

# 템플릿 릴리스 복원·설치 조합 인수 후속

## Summary

[원 제안서](../completed/2026-11-11-template-release-versioning.md)의 Core 코드는 구현됐고,
R0 운영 전환과 R1 활성화·포인터 복구도 완료됐다. 이 문서는 남은 복원·설치 조합의
증거만 추적한다. REQ·INV·CON·Phase·VFY 정의는 원 문서에 유지한다.
2026-11-11 문서 정리 요청은 새 운영 쓰기·복원·설치를 승인하는 요청이 아니다.

## Goal

완료된 구현을 다시 작업하지 않고, 기존 인수가 다루지 않은 대상·복구 경계만 확인한다.

## Current State

- 관찰 기준: `origin/dev` `b64643f`, `origin/main` `1eddbc2`의 문서·코드·병합 이력.
- [Core 검증](../../test-reports/completed/2026-11-04-template-release-implementation.md): 불변 저장·실행 pin·설치 commit·CLI와 격리 DB 회귀 통과.
- [R0 인수](../../test-reports/completed/2026-11-05-template-release-production-cutover.md): Windows 0.6.1 설치·재init·전환 완료. C2의 전환 전 `pg_dump`와 임시 DB 복원은 이미 PASS다.
- [R1 인수](../../test-reports/completed/2026-11-10-template-release-r1-activation.md): macOS Claude 0.6.4에서 운영 R1 설치·선택·R0 포인터 복구·R1 재활성화와 기존 pin 보존 통과.
- [macOS Codex 인수](../../test-reports/completed/2026-11-10-codex-macos-native-acceptance.md): R1 원본을 사용한 0.6.10 설치·전체 역할·110분과 출시 25개 reader 보존을 확인했다. 격리 DB 결과이며 운영 Codex 전환의 증거와 구분한다.

## Scope

원 문서의 남은 VFY-TPL-05/06/08/09/10 인수 증거를 소유한다. 제품 코드 변경,
legacy mode로의 강등, 원본 템플릿 재작성과 runtime OS 지원 인증은 범위 밖이다.
실행 중 결함이 발견되면 별도 수정 범위와 회귀 검증을 정한다.

## Proposal

| 후속 | 원래 조건과 현재 증거 | 남은 확인·종료 조건 |
| --- | --- | --- |
| TPL-F01 | REQ-TPL-009/010, VFY-TPL-08/09, BLK-TPL-03. R0 DB dump 복원과 R1 포인터 복구는 각각 PASS | 별도 private 전체 application snapshot의 복구 절차·대상·원장 보존 증거를 확인한다. DB dump 복원과 동일한 요구를 충족한다면 근거와 범위를 명시해 중복 시험을 제거하고, 그렇지 않으면 승인된 격리 대상에서 미검증 부분만 인수한다. 운영 DB에 과거 데이터를 덮어쓰지 않는다 |
| TPL-F02 | REQ-TPL-006/007/013, VFY-TPL-05/06/09/10, BLK-TPL-01. Windows R0·macOS Claude 운영 R1·macOS Codex 격리 R1은 확인됨 | Windows PC 저장소의 R1 재init과 지원할 추가 client/기기 조합의 정확한 package·source·lock tuple을 고정한다. 수정 파일 보존·pending/ready·hook/bridge·MCP·기존 pin을 직접 확인하고 운영 Codex 경로와 격리 경로를 구분해 기록한다 |
| TPL-F03 | REQ-TPL-012, VFY-TPL-09/10, BLK-TPL-03/04. R0/R1 workflow와 main 포함은 확인됨 | 실제 배포 서버·설치물·검증 SHA의 대응, private 복구 자료의 현재 보관·정리 상태, 지원할 출시 reader 집합의 증거를 정리한다. 기존 25개 reader 시험을 재사용할 때는 해당 입력과 후보의 변경 여부를 먼저 대조한다 |

TPL0–TPL3 구현과 BLK-TPL-02의 격리 DB 인수는 완료 기록을 따른다. BLK-TPL-04는
R0·R1의 당시 승인 범위에서 해소됐으며 새로운 운영 실행에 무기한 적용하지 않는다.
원래 blocker ID는 완료 문서가 소유하고 이 표는 잔여 범위만 연결한다.

## Affected Files

- 현재 계약: `docs/architecture/template-releases.md`.
- 실행 근거: 위 완료 보고서와 후속 인수를 기록할 `docs/test-reports/`.
- 사용 도구: `scripts/templates/`의 기존 CLI와 `.github/workflows/template-release.yml`.
- 이번 정리의 제품 코드·DB 변경은 없다.

## Safety Analysis

운영 credential·private 본문·snapshot은 공개 문서나 artifact에 넣지 않는다.
인수 대상과 승인 범위가 없으면 운영 쓰기·설치에 들어가지 않는다. 복원은 승인된
격리 대상에서 검증하며 포인터 복구와 schema/mode 강등을 혼동하지 않는다.

## Approval

문서 정리와 후속 추적만 승인된 상태다. 대상·후보·복구 범위를 확정한 뒤 원래
운영·설치 승인 경계를 적용한다. 완료된 R0/R1의 승인을 다시 요청하는 문서는 아니다.

## Execution Plan

1. TPL-F01–03별 기존 증거의 적용 범위와 실제 남은 조합을 확정한다.
2. 새 실행이 필요한 항목만 대상·후보 hash·권한·복구 책임과 함께 구체화한다.
3. 승인된 항목을 실행하고 원래 VFY와 연결한 보고서를 남긴다.
4. 해소 또는 명시적인 지원 범위 결정을 기록한 후 이 문서를 완료 처리한다.

## Verification Plan

원 문서의 VFY-TPL-05/06/08/09/10을 기준으로 실제 파일·lock·MCP body·DB pin과 복구 결과를
관찰한다. 기존 `npm run test:template-release`, 격리 integration 시험은 구현 회귀이고,
실제 설치·운영 인수를 대신하지 않는다. 아직 후보가 정해지지 않아 새 실행 명령은 확정하지 않는다.

## Verification Results

이번에는 기존 소스·보고서·이력을 읽고 잔여 조건을 분리했다. 새 DB·설치·복구·모델 시험은 실행하지 않았다.

## Risks and Rollback

과거 PASS를 다른 payload나 운영 대상에 전용하면 실제 설치 불일치를 놓칠 수 있다.
쓰기 전 대상을 확인하고, 복구는 현재 architecture의 CAS 포인터 전환과 기존 pin 보존을 따른다.

## Completion or Closure Notes

TPL-F01–03의 적용 가능한 잔여 조건이 증거 또는 명시적인 범위 결정으로 해소될 때 완료한다.
원 제안서의 코드 구현 완료 상태를 되돌리거나 이미 통과한 인수를 미실행으로 바꾸지 않는다.
