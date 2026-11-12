import { z } from "zod";

const params = z
  .object({
    kind: z.enum([
      "scaffold-smoke",
      "reference-search-smoke",
      "plan",
      "generate",
    ]),
    jobId: z.uuid().optional(),
  })
  .strict()
  .refine((value) => value.kind === "scaffold-smoke" || Boolean(value.jobId));

// REST instance creation can deliver its JSON-encoded params as a string;
// Worker bindings deliver the object. Both must obey the same contract.
export function parseWorkflowParams(value: unknown) {
  return params.parse(typeof value === "string" ? JSON.parse(value) : value);
}
