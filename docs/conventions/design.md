# 디자인 규약 — Stagekeeper 화면의 토큰·서체·규칙

2026-08-30 승인(mock v4 → 구현). 이 문서는 `src/app/globals.css`의 토큰과 `src/fsd/shared/ui/*`
프리미티브가 **왜 그렇게 생겼는지**를 적는다. 값이 바뀌면 여기부터 고친다. 문구는
[product-copy.md](./product-copy.md)가 맡는다.

## 한 문장

**색은 사람 차례에만 준다.** 채도색은 `--mine`(지금 만질 수 있는 것)과 `--risk`(되돌릴 수 없음 /
증거 없음) 둘뿐이고, 에이전트 차례·완료·보류는 무채다. 화면에서 파란 것은 전부 "당신이 누를 수
있는 것"이다.

## 토큰 (계산값, paper 대비 대비비)

| 토큰 | 라이트 | 다크 | 쓰임 |
| --- | --- | --- | --- |
| `--ground` | `#fbfaf8` | `#0f0d0b` | 페이지 바탕 |
| `--paper` | `#ffffff` | `#181513` | 카드·표·목록 |
| `--field` | `#f3f1ef` | `#211f1c` | 기록 영역(계획서 줄)·코드 블록 |
| `--ink` | `#1d1a17` 17.3:1 | `#edebe8` 15.2:1 | 본문 |
| `--quiet` | `#666260` 6.0:1 | `#a19e9b` 6.8:1 | 보조 글·힌트·시각 |
| `--edge` | `#898583` 3.65:1 | `#74716e` 3.7:1 | 입력칸·윤곽 버튼·결정 카드 테두리(비텍스트 3:1) |
| `--rule` | `#e0dddb` | `#302d2b` | 헤어라인 전용 — 컴포넌트 경계로 쓰지 않는다 |
| `--mine` | `#1a51bd` 7.1:1 | `#73b6fa` 8.5:1 | 내 차례. 채움 버튼·헤드라인·배지·turn bar |
| `--mine-soft` | `#e8eefb` | `#1b2a45` | 내 차례 스트립·Next 상자 바탕 |
| `--risk` | `#a92227` 7.2:1 | `#f47b74` 6.8:1 | Discard·No validation yet·미검증 승인 힌트 |

층은 그림자가 아니라 톤으로 만든다: ground 위에 paper 카드, 그 안에 field 기록 영역. 다크는
라이트와 같은 hue의 따뜻한 근흑이라 두 테마가 한 팔레트다. 다크는 `prefers-color-scheme`를
따른다(토글은 후속). Tailwind 기본 팔레트는 `@theme`에서 비웠다 — `zinc-*` 같은 클래스는 아무
스타일도 만들지 않으므로 새로 들어올 수 없다.

## 서체

- **Schibsted Grotesk**(가변): 사람이 읽는 모든 글. 본문 14px/20px. 디스플레이(`.type-display`)는
  `clamp(28px, 2vw + 20px, 40px)`, 600, `-0.025em` — **턴 헤드라인·랜딩 논지·첫 방문 제목** 세
  곳에만 쓴다.
- **Fragment Mono**(400뿐): 기계가 만든 것 — 키·경로·해시·시각·핸들·명령. 12px 이하로 내리지
  않는다(굵기가 하나라 작으면 흐려진다).

## 규칙

1. **결정 카드의 순서**: 머리(키·영역 / 제목 / 상태 한 줄) → 읽을 것(계획서 줄 또는 증거) →
   결정 블록(버튼 줄 + 그 아래 결과 문장, 왼쪽 정렬 전체 폭) → 보조 동작 → 도움말. 상태 칩을
   띄우지 않는다 — 상태는 "상태 · 누가 · 언제" 한 줄이 말한다.
2. **검증 반전**: 기록이 있으면 조용한 칩(Verified), 없으면 `--risk`(No validation yet). 없는데
   승인하려 하면 채움 버튼이 윤곽으로 물러서고 힌트가 빨개진다.
3. **버튼 네 벌**: `mine`(기다리는 결정) · `mine-outline`(할 수는 있지만 재촉하지 않음: Resume,
   미검증 Approve) · `quiet`(보조) · `risk`(되돌릴 수 없음). 안내는 placeholder가 아니라 도움말에.
4. **모션은 하나**: "Agents are working" 앞의 점(`animate-breathe`, 2.4s). `prefers-reduced-motion`
   이면 정지. 호버 리프트·스크롤 리빌·그라디언트 없음.
5. **턴 배너**: Board·Inbox는 크게, 나머지 탭은 한 줄 스트립. 뷰포트 맨 위 2px turn bar가 같은
   차례를 색으로 말한다(디테일이지 시그니처는 아니다 — 시그니처는 헤드라인 문장과 색 규율).
6. **활성 탭은 ink** 밑줄. 배지만 `--mine`. Team 줄은 mono 핸들 + 상태, 아바타 없음.
7. **경계는 `--edge`, 장식은 `--rule`**. 1.35:1짜리 헤어라인을 입력칸 테두리로 쓰지 않는다.

## 어디에 사는가

- 토큰·베이스·`.type-display`: `src/app/globals.css`
- 서체 로딩: `src/app/layout.tsx`(`next/font/google`)
- 프리미티브: `src/fsd/shared/ui/{button,chip,field,card,code,table,section-label,copy-button}.tsx`
- 턴 배너·bar·Next 상자: `src/fsd/widgets/turn-banner/`
- 셸 머리·탭: `src/fsd/widgets/app-header/`
- 공개 랜딩(`/`): `src/fsd/pages/landing/` — 맨 위 bar는 헤어라인(차례가 없다), 파란 것은 논지 둘째 줄·CTA·데모 안쪽뿐
- 검토 mock(승인판): 대화 아티팩트 "Stagekeeper Design Mock" v4-approved
