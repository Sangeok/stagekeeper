# Core

웹·서버·플러그인이 공유하는 규칙과 프로토콜의 원본이다.

- `pipeline/`: 파이프라인·보드·백로그
- `templates/`: 템플릿 배포·검증·렌더링·설치
- `configuration/`: harness 설정·워크스페이스 검증
- `tokens/`: 토큰 생성·파싱·유효성
- `plans/`: 플랜 권한·프로젝트 선택·실행 사용량
- `execution/`: 클라이언트 실행 계약·runner·watch

루트의 QA·저장소 URL·프로젝트 slug·요청 제한은 독립 규칙이다.
구현·테스트·타입 선언을 함께 두며, 소비자는 필요한 모듈을 직접 import한다.
의존 방향과 배포·검증 계약은 [아키텍처 문서](../../docs/architecture/core.md)를 따른다.
