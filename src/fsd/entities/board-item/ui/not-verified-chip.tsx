import { Chip } from "@/fsd/shared/ui/chip";

export function NotVerifiedChip({ verifyIsNext = false }: { verifyIsNext?: boolean }) {
  return (
    <Chip tone="done" title={verifyIsNext ? "The Verify step comes next." : "No independent validation is on record."}>
      Not verified
    </Chip>
  );
}
