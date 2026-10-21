"use client";
import type { ReactElement } from "react";
import { TokenReveal } from "@/fsd/entities/project-token";
import type { ActionResult } from "@/fsd/shared/api/result";
import { TokenIssuanceForm } from "./token-issuance-form";

type Props = { issue: (label: string, expiresAt: string | null) => Promise<ActionResult<{ token: string }>>; mcpUrl: string };

export function NewTokenForm({ issue, mcpUrl }: Props): ReactElement {
  return <TokenIssuanceForm issue={issue} placeholder="personal laptop, CI" submitLabel="Issue token"
    renderIssued={token => <TokenReveal token={token} mcpUrl={mcpUrl} />} />;
}
