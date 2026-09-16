import { z } from "zod";

/** Shape the model must return. Kept minimal so structured output stays reliable. */
const EvidenceSchema = z.object({
  text: z.string().describe("One specific fact, number, quote or figure the memo gives in support of the claim, as a sentence."),
  excerpt: z.string().describe("A short verbatim excerpt from the memo, or \"Figure n\" if it comes from a figure."),
});

export const ClaimExtractionSchema = z.object({
  claims: z.array(
    z.object({
      topic: z.string().describe("The memo section the claim belongs to, as a short label such as Market, Product, Traction, Team, Competition."),
      text: z.string().describe("The claim, restated as one concrete, independently arguable sentence."),
      excerpt: z.string().describe("A short verbatim excerpt from the memo the claim was drawn from."),
      evidence: z.array(EvidenceSchema).describe("The memo's supporting points for this claim, in memo order. Empty if the memo asserts it without support."),
    }),
  ),
});

export type ClaimExtraction = z.infer<typeof ClaimExtractionSchema>;
