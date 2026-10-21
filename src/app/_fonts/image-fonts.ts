import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function imageFonts() {
  const semiBold = await readFile(join(process.cwd(), "src/app/_fonts/schibsted-grotesk-semibold.ttf"));
  return [{ name: "Schibsted Grotesk", data: semiBold, style: "normal" as const, weight: 600 as const }];
}
