import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

type LLMProviderKind = "anthropic" | "openai" | "nvidia" | "groq";

const llmProvider = (process.env.LLM_PROVIDER?.toLowerCase() ?? "anthropic") as LLMProviderKind;

function llmConfig() {
  if (llmProvider === "anthropic") {
    return {
      provider: "anthropic" as const,
      apiKey: process.env.LLM_API_KEY ?? required("ANTHROPIC_API_KEY"),
      model: process.env.LLM_MODEL ?? "claude-sonnet-5",
      baseUrl: "",
    };
  }
  if (llmProvider === "nvidia") {
    return {
      provider: "openai" as const,
      apiKey: process.env.LLM_API_KEY ?? required("NVIDIA_API_KEY"),
      model: process.env.LLM_MODEL ?? "nvidia/nemotron-3-ultra",
      baseUrl: "https://integrate.api.nvidia.com/v1",
    };
  }
  if (llmProvider === "groq") {
    return {
      provider: "openai" as const,
      apiKey: process.env.LLM_API_KEY ?? required("GROQ_API_KEY"),
      model: process.env.LLM_MODEL ?? "llama-3.1-70b-versatile",
      baseUrl: "https://api.groq.com/openai/v1",
    };
  }
  if (llmProvider === "openai") {
    return {
      provider: "openai" as const,
      apiKey: process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY ?? "",
      model: process.env.LLM_MODEL ?? "gpt-4o-mini",
      baseUrl: process.env.LLM_BASE_URL ?? "https://api.openai.com/v1",
    };
  }
  throw new Error(`Unknown LLM_PROVIDER: "${llmProvider}" (expected "anthropic", "openai", "nvidia", or "groq")`);
}

export const config = {
  notionApiKey: required("NOTION_API_KEY"),
  llm: llmConfig(),
  port: Number(process.env.PORT ?? 4173),
  cron: {
    digest: process.env.DIGEST_CRON ?? "0 8 * * 1",
    hygiene: process.env.HYGIENE_CRON ?? "0 9 * * 1",
    linkedin: process.env.LINKEDIN_CRON ?? "0 10 * * 1",
  },
};

// Fixed IDs for this workspace's "Second Brain" structure — created once,
// not secrets, so they live in code rather than .env.
export const ids = {
  hubPage: "3cbb184a-1062-812a-93a2-f4884d9ec931",
  topics: "75c182b4-e834-485f-9c2d-d716833f09b9",
  areas: "5b45c22f-3696-4b26-a4bc-84e151e98c30",
  projects: "80938e70-8571-41ff-8572-5e7703527391",
  resources: "86879b72-c593-4588-8bec-db3a9c15ba1a",
  ideasVault: "f69286cd-f0de-4e6a-ba77-c6fc2964675f",
  dailyJournal: "edf7a341-cae6-44d2-8f22-8edbc264d165",
  inbox: "ed109753-0b87-4a3d-b3e5-c2ff00ec246b",
  suggestions: "5b4ade7d-857c-482c-9d0c-516a4b4a7a84",
};
