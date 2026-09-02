// 검증 판정은 entities/board-item 하나에서 온다 — 배너·카드·스테퍼가 같은 답을 쓰게(journey.test.mjs로 덮인다).
// 보드 status(+검증 판정)로 "파이프라인 여정 7단계 중 지금 어디인지"를 결정적으로 매핑한다.
// 진행 중(proposed·planning·in_review·implementing)만 여정 위치가 있다 — done(종결)·on_hold(중단)·null은
// 여정 밖이라 매핑이 없다(null 반환). 보드 데이터만으로는 done의 "인수됨"(메인 루프 몫)도, on_hold의
// "어느 단계에서 멈췄나"도 결정할 수 없어(결과 줄은 산문이라 구조가 아니다) 여정 밖으로 뺀다.
import { isPlanVerified } from "./verification";

export type StageState = "done" | "current" | "upcoming";
export type JourneyActor = "pm" | "user" | "agent" | "verifier" | "loop";

export type JourneyStage = {
  key: string;
  label: string;
  actor: JourneyActor;
  state: StageState;
};

export type JourneyView = {
  currentIndex: number; // 0..6, 현재(진행 중) 단계의 인덱스
  currentLabel: string; // stages[currentIndex].label
  waitingActor: JourneyActor; // 현재 단계를 미는 주체 = 지금 기다리는 대상
  waitingLabel: string; // "Your turn" | "Verifying" | "In progress" …(화면 낱말)
  nextLabel: string | null; // 다음 단계 라벨(마지막이면 null)
  stages: JourneyStage[]; // 7단계 전부, 각 state 부여
};

// 여정 7단계(고정 순서). actor = 그 단계를 미는 주체(누구를 기다리는지의 원천). 라벨은 product-copy.md §6.
const JOURNEY_STAGES: readonly {
  key: string;
  label: string;
  actor: JourneyActor;
}[] = [
  { key: "select", label: "Proposed", actor: "pm" },
  { key: "gate1", label: "Plan requested", actor: "user" },
  { key: "plan", label: "Plan", actor: "agent" },
  { key: "verify", label: "Verified", actor: "verifier" },
  { key: "gate2", label: "Approved", actor: "user" },
  { key: "build", label: "Implemented", actor: "agent" },
  { key: "accept", label: "Accepted", actor: "loop" },
];

// 현재 단계 주체 → "지금 누구를 기다리는지" 낱말. user 게이트는 "Your turn".
const WAITING_LABEL: Record<JourneyActor, string> = {
  pm: "Selecting",
  user: "Your turn",
  agent: "In progress",
  verifier: "Verifying",
  loop: "Accepting",
};

// status(+검증 판정) → 현재 단계 인덱스. 진행 중 넷만 매핑되고 나머지는 null.
// in_review 이분: 검증 기록이 있으면 검증 통과 → 게이트②(당신 대기), 없으면 검증 중.
function currentIndexFor(
  status: string | null,
  validation: string | null,
): number | null {
  switch (status) {
    case "proposed":
      return 1; // 게이트① — 사용자 대기
    case "planning":
      return 2; // 계획서 — 담당 dev 작업
    case "in_review":
      return isPlanVerified(status, validation) ? 4 : 3; // 검증 통과→게이트② : 검증 중
    case "implementing":
      return 5; // 구현 — 담당 dev 작업
    default:
      return null; // done·on_hold·null·기타 → 여정 밖(스테퍼 없음)
  }
}

export function deriveJourney(
  status: string | null,
  validation: string | null,
): JourneyView | null {
  const idx = currentIndexFor(status, validation);
  if (idx === null) return null;

  const stages: JourneyStage[] = JOURNEY_STAGES.map((s, i) => ({
    key: s.key,
    label: s.label,
    actor: s.actor,
    state: i < idx ? "done" : i === idx ? "current" : "upcoming",
  }));

  const current = stages[idx]; // 방어적: idx는 1..5라 stages에 항상 존재한다
  if (current === undefined) return null;
  const next = stages[idx + 1]; // JourneyStage | undefined(마지막이면 없음)

  return {
    currentIndex: idx,
    currentLabel: current.label,
    waitingActor: current.actor,
    waitingLabel: WAITING_LABEL[current.actor],
    nextLabel: next === undefined ? null : next.label,
    stages,
  };
}
