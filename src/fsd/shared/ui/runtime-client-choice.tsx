"use client";

export type RuntimeClient = "claude" | "codex";

export function RuntimeClientChoice({ value, onChange }: { value: RuntimeClient; onChange: (client: RuntimeClient) => void }) {
  return (
    <fieldset className="flex gap-3 text-sm">
      <legend className="sr-only">Coding client</legend>
      {(["claude", "codex"] as const).map(client => (
        <label key={client} className="flex items-center gap-1.5">
          <input type="radio" checked={value === client} onChange={() => onChange(client)} />
          {client === "claude" ? "Claude Code" : "Codex"}
        </label>
      ))}
    </fieldset>
  );
}
