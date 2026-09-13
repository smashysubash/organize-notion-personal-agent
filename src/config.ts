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

// Fixed IDs for this workspace's "Second Brain" structure — can be overridden via .env if needed.
export const ids = {
  hubPage: process.env.NOTION_HUB_PAGE_ID ?? "3cbb184a-1062-812a-93a2-f4884d9ec931",
  topics: process.env.NOTION_TOPICS_ID ?? "0b25b405-8ef9-4744-8730-4f0ea88c739c",
  areas: process.env.NOTION_AREAS_ID ?? "ce49db14-5982-4ba5-a05c-a5a2d2e14df1",
  projects: process.env.NOTION_PROJECTS_ID ?? "1622d4e5-b6d7-4c4e-9042-d9bb6d0ac7bb",
  resources: process.env.NOTION_RESOURCES_ID ?? "c420a4f4-f1c6-4131-b32d-24f7ec853057",
  ideasVault: process.env.NOTION_IDEAS_VAULT_ID ?? "650e6758-eb31-4a80-ad1a-56082d38548a",
  dailyJournal: process.env.NOTION_DAILY_JOURNAL_ID ?? "bce216b0-f607-449d-bc7e-4f08287e04af",
  inbox: process.env.NOTION_INBOX_ID ?? "e2fc67f9-0954-468c-bcf3-322f30b5d2d2",
  suggestions: process.env.NOTION_SUGGESTIONS_ID ?? "03428609-3106-46da-8454-b7dc6f39665b",
};
