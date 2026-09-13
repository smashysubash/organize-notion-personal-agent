import { config } from "./config.js";
import { createApp } from "./server/app.js";
import { startScheduler } from "./scheduler.js";

const app = createApp();
app.listen(config.port, () => {
  console.log(`Second Brain console running at http://localhost:${config.port}`);
});

startScheduler();
