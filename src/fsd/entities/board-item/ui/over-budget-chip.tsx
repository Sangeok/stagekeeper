import { Chip } from "@/fsd/shared/ui/chip";
import { FIELD_BUDGET } from "../model/text-budget";

// 보드와 결재함이 같은 사실을 같은 문구로 말하게 한다 — 예전에는 두 화면에 마크업이
// 복제돼 있었고, 재는 기준까지 서로 달랐다. 문구는 product-copy.md.
export function OverBudgetChip() {
  return (
    <Chip tone="done" title={`This summary is over ${FIELD_BUDGET} characters. Move the details to docs/agents/.`}>
      Over {FIELD_BUDGET} characters
    </Chip>
  );
}
