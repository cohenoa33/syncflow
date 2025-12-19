import OpenAI from "openai";

let _openai: OpenAI | null = null;

export function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is missing. Set it in packages/dashboard-web/.env.local (dev) or Render env vars (prod)."
    );
  }

  if (!_openai) _openai = new OpenAI({ apiKey });
  return _openai;
}
