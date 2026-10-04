import type { ReactElement, ReactNode } from "react";
import { isTokenActive } from "@harness/core/token-validity.mjs";
import { Table, Td, Th, Tr } from "@/fsd/shared/ui/table";
import type { TokenRow } from "../model/token-row";
import { TokenUsage } from "./token-usage";
import { TokenStatus, TokenExpiry } from "./token-status";

type Props = {
  tokens: readonly TokenRow[];
  at: Date;
  reference: "token" | "owner" | "user";
  empty: string;
  headingLevel: 2 | 3;
  renderName: (row: TokenRow) => ReactNode;
  renderRevoke: (row: TokenRow) => ReactNode;
};

const day = (date: Date): string => date.toISOString().slice(0, 10);

// 표시만 공유한다. 이름 편집·폐기 Action은 서버 page가 만드는 slot에 남는다.
export function TokenTable({ tokens, at, reference, empty, headingLevel, renderName, renderRevoke }: Props): ReactElement {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return <div className="flex flex-col gap-4">
    {[true, false].map((active) => {
      const rows = tokens.filter((token) => isTokenActive(token, at) === active);
      return <section key={String(active)} className="flex flex-col gap-2">
        <Heading className="text-sm font-medium">{active ? "Active tokens" : "Ended tokens"}</Heading>
        <Table>
          <thead><tr><Th>Token name</Th><Th>Issued</Th><Th>Last used</Th><Th>Expires</Th><Th>Status</Th><Th>Reference</Th><Th /></tr></thead>
          <tbody>
            {rows.length === 0 ? <Tr><Td colSpan={7} className="text-quiet">{active ? tokens.length === 0 ? empty : "No active tokens." : "No ended tokens."}</Td></Tr> : null}
            {rows.map((token) => <Tr key={token.id} className={!active ? "text-quiet" : undefined}>
              <Td>{renderName(token)}</Td>
              <Td className="font-mono text-xs">{day(token.createdAt)}</Td>
              <Td><TokenUsage lastUsedAt={token.lastUsedAt} usageTrackingStartedAt={token.usageTrackingStartedAt} /></Td>
              <Td><TokenExpiry expiresAt={token.expiresAt} /></Td>
              <Td><TokenStatus revokedAt={token.revokedAt} expiresAt={token.expiresAt} at={at} />{token.revokedAt ? ` ${day(token.revokedAt)}` : null}</Td>
              <Td className="font-mono text-xs text-quiet">{reference}:{token.id}</Td>
              <Td className="text-right">{token.revokedAt ? null : renderRevoke(token)}</Td>
            </Tr>)}
          </tbody>
        </Table>
      </section>;
    })}
  </div>;
}
