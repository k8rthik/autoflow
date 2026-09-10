/** USD per token, from OpenRouter's public model list. */
export interface Price {
  readonly input: number;
  readonly output: number;
}

export type PriceTable = Readonly<Record<string, Price>>;

interface OpenRouterModel {
  readonly id: string;
  readonly pricing: { readonly prompt: string; readonly completion: string };
}

export const fetchOpenRouterPrices = async (): Promise<PriceTable> => {
  const response = await fetch("https://openrouter.ai/api/v1/models");
  if (!response.ok) throw new Error(`OpenRouter model list failed: HTTP ${response.status}`);
  const body = (await response.json()) as { data: OpenRouterModel[] };
  return Object.fromEntries(
    body.data.map((m) => [m.id, { input: Number(m.pricing.prompt), output: Number(m.pricing.completion) }]),
  );
};

export const costUsd = (prices: PriceTable, model: string, usage: { input_tokens: number; output_tokens: number }): number | null => {
  const price = prices[model];
  return price ? usage.input_tokens * price.input + usage.output_tokens * price.output : null;
};
