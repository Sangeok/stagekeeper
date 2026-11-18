import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const repositoryRoot = realpathSync(fileURLToPath(new URL("../../../", import.meta.url)));
