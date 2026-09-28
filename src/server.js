import http from "node:http";
import process from "node:process";
import { Providers } from "./providers.js";
import { StateStore } from "./state.js";
import { CalendarSync } from "./sync.js";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

const config = {
  composioApiKey: required("COMPOSIO_API_KEY"),
  googleAccountId: required("GOOGLE_CONNECTED_ACCOUNT_ID"),
  outlookAccountId: required("OUTLOOK_CONNECTED_ACCOUNT_ID"),
  googleCalendarId: process.env.GOOGLE_CALENDAR_ID || "primary",
  outlookCalendarId: process.env.OUTLOOK_CALENDAR_ID || "primary",
  timezone: process.env.SYNC_TIMEZONE || "America/New_York",
  intervalSeconds: Number(process.env.SYNC_INTERVAL_SECONDS || 120),
  pastDays: Number(process.env.SYNC_PAST_DAYS || 30),
  futureDays: Number(process.env.SYNC_FUTURE_DAYS || 365),
  port: Number(process.env.PORT || 8080),
  dataDir: process.env.DATA_DIR || "./data"
};

const store = new StateStore(config.dataDir);
await store.load();
const sync = new CalendarSync({ providers: new Providers(config), store, config });
let running = false;
let lastError = null;

async function runSync() {
  if (running) return;
  running = true;
  try {
    await sync.run();
    lastError = null;
  } catch (error) {
    lastError = { message: error.message, at: new Date().toISOString() };
    console.error(JSON.stringify({ event: "sync_failed", ...lastError }));
  } finally {
    running = false;
  }
}

if (process.argv.includes("--once")) {
  await runSync();
  process.exitCode = lastError ? 1 : 0;
} else {
  const server = http.createServer((request, response) => {
    if (request.url !== "/healthz") {
      response.writeHead(404).end("not found\n");
      return;
    }
    const completed = store.state.stats?.completedAt
      ? Date.parse(store.state.stats.completedAt)
      : 0;
    const staleAfter = config.intervalSeconds * 3 * 1000;
    const healthy = !lastError && completed > 0 && Date.now() - completed < staleAfter;
    response.writeHead(healthy ? 200 : 503, { "content-type": "application/json" });
    response.end(
      `${JSON.stringify({
        status: healthy ? "ok" : running ? "starting" : "degraded",
        running,
        lastError,
        lastSync: store.state.stats ?? null
      })}\n`
    );
  });
  server.listen(config.port, "0.0.0.0", () => {
    console.log(JSON.stringify({ event: "server_listening", port: config.port }));
  });
  await runSync();
  setInterval(runSync, config.intervalSeconds * 1000).unref();
}
