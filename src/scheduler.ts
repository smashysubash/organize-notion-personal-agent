import cron from "node-cron";
import { config } from "./config.js";
import { runDigest } from "./jobs/digest.js";
import { runHygienePass } from "./jobs/hygiene.js";
import { runPortfolioDrafting } from "./jobs/portfolio.js";
import { runLinkedInDrafts } from "./jobs/linkedin.js";

function safeRun(name: string, fn: () => Promise<unknown>) {
  return async () => {
    try {
      console.log(`[scheduler] running ${name}...`);
      await fn();
      console.log(`[scheduler] ${name} done.`);
    } catch (err) {
      console.error(`[scheduler] ${name} failed:`, err);
    }
  };
}

export function startScheduler(): void {
  cron.schedule(config.cron.digest, safeRun("digest", runDigest));
  cron.schedule(config.cron.hygiene, safeRun("hygiene", runHygienePass));
  cron.schedule(config.cron.hygiene, safeRun("portfolio", runPortfolioDrafting)); // sweep alongside hygiene
  cron.schedule(config.cron.linkedin, safeRun("linkedin", runLinkedInDrafts));
  console.log("[scheduler] jobs scheduled:", config.cron);
}
