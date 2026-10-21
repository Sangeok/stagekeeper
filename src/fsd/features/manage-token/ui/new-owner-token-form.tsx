"use client";
import type { ReactElement } from "react";
import { OwnerTokenReveal } from "@/fsd/entities/project-token";
import type { ActionResult } from "@/fsd/shared/api/result";
import { TokenIssuanceForm } from "./token-issuance-form";

type Props = { issue: (label: string, expiresAt: string | null) => Promise<ActionResult<{ token: string }>>; ownerMcpUrl: string };

export function NewOwnerTokenForm({ issue, ownerMcpUrl }: Props): ReactElement {
  return <TokenIssuanceForm issue={issue} placeholder="my laptop session" submitLabel="Issue owner token"
    renderIssued={token => <OwnerTokenReveal token={token} ownerMcpUrl={ownerMcpUrl} />} />;
}
