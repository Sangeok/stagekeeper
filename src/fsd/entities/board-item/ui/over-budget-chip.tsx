import { Chip } from "@/fsd/shared/ui/chip";
import { FIELD_BUDGET } from "../model/text-budget";

export function OverBudgetChip() {
  return (
    <Chip tone="done" title={`This summary is over ${FIELD_BUDGET} characters. Move the details to docs/agents/.`}>
      Over {FIELD_BUDGET} characters
    </Chip>
  );
}
