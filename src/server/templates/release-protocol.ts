import { z } from "zod";
import { TEMPLATE_PROTOCOL } from "@harness/core/templates/release-manifest.mjs";

export const templateInstallationSchema = z.object({
  releaseId: z.string().min(1), language: z.string().min(1),
  clientSurfaceHash: z.string().regex(/^[a-f0-9]{64}$/), protocol: z.literal(TEMPLATE_PROTOCOL),
}).strict();
