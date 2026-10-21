export type BacklogFormState = { status: "idle" } | { status: "saved" } | { status: "error"; error: string };

export const IDLE: BacklogFormState = { status: "idle" };

export type BacklogFormAction = (prev: BacklogFormState, form: FormData) => Promise<BacklogFormState>;
export type RemoveBacklogAction = (key: string) => Promise<BacklogFormState>;

export const SOURCE_HELP = "What you want and why. Leave the code to the agents.";
