import { z } from "zod";

/** Shape the model must return. Kept minimal so structured output stays reliable. */
export const ClaimExtractionSchema = z.object({
  claims: z.array(
    z.object({
      text: z.string().describe("The claim, restated as one concrete, independently arguable sentence."),
      excerpt: z.string().describe("A short verbatim excerpt from the memo the claim was drawn from."),
    }),
  ),
});

export type ClaimExtraction = z.infer<typeof ClaimExtractionSchema>;
