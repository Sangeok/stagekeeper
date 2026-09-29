import { Chip } from "@/fsd/shared/ui/chip";

// 검증 기록이 없다는 사실. 결재함 카드와 항목 페이지가 같은 칩을 쓴다 — 예전에는 두 화면이 각자
// risk 칩을 그렸다. 검증은 사용자가 파이프라인으로 고르는 것이라 부재는 위험이 아니다(design.md 규칙 2).
// 문구는 product-copy.md §6·§7·§11.
export function NotVerifiedChip({ verifyIsNext = false }: { verifyIsNext?: boolean }) {
  return (
    <Chip tone="done" title={verifyIsNext ? "The Verify step comes next." : "No independent validation is on record."}>
      Not verified
    </Chip>
  );
}
