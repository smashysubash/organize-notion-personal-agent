import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const playbookPath = path.resolve(__dirname, "../../SECOND_BRAIN_PLAYBOOK.md");
const playbook = fs.readFileSync(playbookPath, "utf-8");

interface LLMProvider {
  complete(userPrompt: string, maxTokens: number): Promise<string>;
}

/** Native Anthropic SDK path — kept separate (rather than folded into the
 * OpenAI-compatible path) so the Playbook system prompt can be marked
 * `cache_control: ephemeral` for Anthropic's prompt cache. */
class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  constructor(apiKey: string, private model: string) {
    this.client = new Anthropic({ apiKey });
  }

  async complete(userPrompt: string, maxTokens: number): Promise<string> {
    // cache_control is a valid Anthropic API field for prompt caching that
    // predates this SDK version's TypeScript types — cast to bypass that gap.
    const system = [
      { type: "text", text: playbook, cache_control: { type: "ephemeral" } },
    ] as unknown as Anthropic.Messages.MessageCreateParamsNonStreaming["system"];

    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userPrompt }],
    });
    const block = res.content.find((b) => b.type === "text");
    return block?.type === "text" ? block.text : "";
  }
}

/** Any backend that speaks OpenAI's `/chat/completions` wire format: OpenAI
 * itself, Ollama, Groq, OpenRouter, Together, LM Studio, vLLM, Azure OpenAI,
 * etc. Swapping providers is a `.env` change (LLM_BASE_URL/LLM_MODEL/LLM_API_KEY),
 * not a code change. */
class OpenAICompatibleProvider implements LLMProvider {
  constructor(private baseUrl: string, private apiKey: string, private model: string) {}

  async complete(userPrompt: string, maxTokens: number): Promise<string> {
    const res = await fetch(`${this.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: playbook },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(`LLM request failed (${res.status}): ${await res.text()}`);
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content ?? "";
  }
}

function buildProvider(): LLMProvider {
  const { provider, apiKey, model, baseUrl } = config.llm;
  return provider === "anthropic"
    ? new AnthropicProvider(apiKey, model)
    : new OpenAICompatibleProvider(baseUrl, apiKey, model);
}

const provider = buildProvider();

/** Calls the configured LLM with the Playbook as its system prompt. */
export async function askLLM(userPrompt: string, maxTokens = 1024): Promise<string> {
  return provider.complete(userPrompt, maxTokens);
}

/** Strips a ```json ... ``` (or bare ```) fence some models wrap JSON in
 * despite being told not to — not every model follows that instruction as
 * reliably as Claude does. */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

/** Same as askLLM but parses the reply as JSON, per the caller's schema instructions. */
export async function askLLMJSON<T>(userPrompt: string, maxTokens = 1024): Promise<T> {
  const text = await askLLM(
    `${userPrompt}\n\nRespond with ONLY valid JSON, no prose, no markdown fences.`,
    maxTokens
  );
  return JSON.parse(stripCodeFence(text)) as T;
}
