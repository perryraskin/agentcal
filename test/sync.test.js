import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { StateStore } from "../src/state.js";
import { CalendarSync } from "../src/sync.js";

const googleEvent = {
  id: "google-1",
  iCalUID: "shared-uid",
  summary: "Old title",
  start: { dateTime: "2026-10-01T14:00:00Z" },
  end: { dateTime: "2026-10-01T15:00:00Z" },
  updated: "2026-09-28T12:00:00Z"
};

const outlookEvent = {
  id: "outlook-1",
  iCalUId: "shared-uid",
  subject: "New title",
  body: { contentType: "text", content: "" },
  location: { displayName: "" },
  start: { dateTime: "2026-10-01T14:00:00", timeZone: "UTC" },
  end: { dateTime: "2026-10-01T15:00:00", timeZone: "UTC" },
  showAs: "busy",
  sensitivity: "normal",
  lastModifiedDateTime: "2026-09-28T12:01:00Z"
};

test("initial UID pairing updates rather than creating a duplicate", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "agentcal-test-"));
  const store = new StateStore(directory);
  await store.load();
  const calls = [];
  const providers = {
    listOutlook: async () => [outlookEvent],
    listGoogle: async () => [googleEvent],
    getOutlook: async () => null,
    getGoogle: async () => null,
    updateGoogle: async (...args) => calls.push(["updateGoogle", ...args]),
    updateOutlook: async (...args) => calls.push(["updateOutlook", ...args]),
    createGoogle: async () => {
      throw new Error("unexpected createGoogle");
    },
    createOutlook: async () => {
      throw new Error("unexpected createOutlook");
    },
    deleteGoogle: async () => {
      throw new Error("unexpected deleteGoogle");
    },
    deleteOutlook: async () => {
      throw new Error("unexpected deleteOutlook");
    }
  };
  const sync = new CalendarSync({
    providers,
    store,
    config: { pastDays: 30, futureDays: 365 },
    logger: { log() {} }
  });
  const stats = await sync.run();
  assert.equal(stats.paired, 1);
  assert.equal(stats.createdGoogle, 0);
  assert.equal(stats.createdOutlook, 0);
  assert.equal(stats.updatedGoogle, 1);
  assert.deepEqual(calls.map(([name]) => name), ["updateGoogle"]);
  assert.equal(Object.keys(store.state.pairs).length, 1);
});

test("cancelled events fetched by ID follow two-snapshot deletion confirmation", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "agentcal-test-"));
  const store = new StateStore(directory); await store.load();
  store.state.pairs["outlook-1::google-1"] = { outlookId: "outlook-1", googleId: "google-1" };
  const calls = [];
  const providers = {
    listOutlook: async () => [], listGoogle: async () => [googleEvent],
    getOutlook: async () => ({ ...outlookEvent, isCancelled: true }),
    deleteGoogle: async id => calls.push(id),
    updateGoogle: async () => { throw new Error("must not update cancelled event"); },
    createOutlook: async () => { throw new Error("must not recreate cancelled event"); }
  };
  const sync = new CalendarSync({ providers, store, config: { pastDays: 30, futureDays: 365 }, logger: { log() {} } });
  await sync.run(); assert.deepEqual(calls, []);
  await sync.run(); assert.deepEqual(calls, ["google-1"]);
});
