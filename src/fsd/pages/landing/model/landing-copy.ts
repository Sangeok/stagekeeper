// 랜딩 문구 중 화면 밖에서도 쓰는 것 — 브라우저 탭·검색 결과(제목·설명)와 공유 카드(헤드라인).
// 문구의 출처는 product-copy.md §16이고, 제목·설명은 copy-lock:landing-meta가 이 값에 묶는다.

// 둘째 줄만 --mine이다: 그 색은 사람 차례에만 쓴다.
export const HEADLINE = { agents: "Your agents build.", you: "You set the rules." } as const;

export const LANDING_TITLE = "Stagekeeper — Automate Claude Code with approval gates";

// 검색 설명과 본문은 각각의 잠금으로 유지한다. 메타데이터를 고쳐도 기존 본문은 바뀌지 않는다.
export const LANDING_DESCRIPTION =
  "Your Claude Code runs plan → verify → implement → accept. Gates are where you put them, and nothing passes without a record.";

export const LANDING_INTRO =
  "Your Claude Code runs plan → verify → implement → accept. Stagekeeper holds the state, the ledger, and the gates. Agents propose, plan, and report — they can't grant themselves permission.";
