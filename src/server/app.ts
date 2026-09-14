import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ids } from "../config.js";
import { queryDataSource, retrieveBlockChildren } from "../notion/client.js";
import { plainText } from "../notion/props.js";
import { approveSuggestion, dismissSuggestion } from "../jobs/actions.js";
import { runTriage } from "../jobs/triage.js";
import { runDigest } from "../jobs/digest.js";
import { runHygienePass } from "../jobs/hygiene.js";
import { runPortfolioDrafting } from "../jobs/portfolio.js";
import { runLinkedInDrafts } from "../jobs/linkedin.js";
import { reframeAndOrganize } from "../jobs/organize.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function bodyText(pageId: string): Promise<string> {
  const blocks = await retrieveBlockChildren(pageId);
  return blocks
    .map((b: any) => (b[b.type]?.rich_text ?? []).map((t: any) => t.plain_text).join(""))
    .join("\n")
    .trim();
}

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, "public")));

  app.get("/api/suggestions", async (req, res) => {
    try {
      const status = (req.query.status as string) ?? "Pending";
      const rows = await queryDataSource(ids.suggestions, {
        filter: { property: "Status", select: { equals: status } },
        sorts: [{ property: "Created At", direction: "descending" }],
      });
      const withBody = await Promise.all(
        rows.map(async (r) => ({
          id: r.id,
          url: r.url,
          title: plainText(r.properties.Title),
          type: r.properties.Type?.select?.name,
          status: r.properties.Status?.select?.name,
          body: await bodyText(r.id),
        }))
      );
      res.json(withBody);
    } catch (err) {
      console.error("[api] GET /api/suggestions error:", (err as Error).message);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/suggestions/:id/approve", async (req, res) => {
    try {
      await approveSuggestion(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      console.error(`[api] POST /api/suggestions/${req.params.id}/approve error:`, (err as Error).message);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/suggestions/:id/dismiss", async (req, res) => {
    try {
      await dismissSuggestion(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      console.error(`[api] POST /api/suggestions/${req.params.id}/dismiss error:`, (err as Error).message);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  const jobs: Record<string, () => Promise<unknown>> = {
    triage: runTriage,
    digest: runDigest,
    hygiene: runHygienePass,
    portfolio: runPortfolioDrafting,
    linkedin: runLinkedInDrafts,
  };

  app.post("/api/jobs/:name/run", async (req, res) => {
    const job = jobs[req.params.name];
    if (!job) return res.status(404).json({ error: "unknown job" });
    try {
      const result = await job();
      res.json({ ok: true, result });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/organize", async (req, res) => {
    try {
      const text = req.body?.text;
      if (typeof text !== "string" || !text.trim()) {
        return res.status(400).json({ error: "Text input is required." });
      }
      if (text.length > 50000) {
        return res.status(400).json({ error: "Text input exceeds maximum limit of 50,000 characters." });
      }

      const result = await reframeAndOrganize(text.trim());
      res.json(result);
    } catch (err) {
      console.error("[api] POST /api/organize error:", (err as Error).message);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return app;
}
