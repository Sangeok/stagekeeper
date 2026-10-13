// 랜딩 문구 중 화면 밖에서도 쓰는 것 — 브라우저 탭·검색 결과(제목·설명)와 공유 카드(헤드라인).
// 문구의 출처는 product-copy.md §16이고, 제목·설명은 copy-lock:landing-meta가 이 값에 묶는다.

// 둘째 줄만 --mine이다: 그 색은 사람 차례에만 쓴다.
export const HEADLINE = { agents: "Your agents build.", you: "You set the rules." } as const;

export const LANDING_TITLE = "Stagekeeper — Approval gates for your coding agents";

// 랜딩 본문 첫 문단의 앞 두 문장 그대로. 검색 결과에서 잘리지 않는 길이다.
export const LANDING_DESCRIPTION =
  "Your Claude Code runs plan → verify → implement → accept. Stagekeeper holds the state, the ledger, and the gates.";
