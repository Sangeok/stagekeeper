export function deliverySurfaceHash(input: { templates: Record<string, string>; language: string; client: "claude" | "codex"; contractHash: string }): string;

export function canonicalJson(value: unknown): string;

export function manifestHash(value: unknown): string;
