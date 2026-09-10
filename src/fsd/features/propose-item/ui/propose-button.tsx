"use client";
import { useState } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/fsd/shared/api/result";
export type ProposeAction = (input: { key: string; agent: string; reason: string }) => Promise<ActionResult<void>>;
export function ProposeButton({ itemKey, roster, propose }: { itemKey: string; roster: string[]; propose: ProposeAction }) {
  const [agent, setAgent] = useState(roster[0] ?? "");
  return <button onClick={async () => { const r = await propose({ key: itemKey, agent, reason: "owner" }); toast(r.success ? `Put on the board · ${itemKey}` : r.error); setAgent(agent); }}>Put on the board</button>;
}
