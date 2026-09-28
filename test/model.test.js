import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalHash,
  chooseWinner,
  googlePayload,
  normalizeGoogle,
  normalizeOutlook,
  outlookPayload,
  stableId
} from "../src/model.js";

test("stable IDs are deterministic and Google-safe", () => {
  assert.equal(stableId("ac", "same"), stableId("ac", "same"));
  assert.match(stableId("ac", "same"), /^[a-f0-9]+$/);
});

test("provider normalizers produce matching canonical events", () => {
  const google = normalizeGoogle({
    id: "g1",
    summary: "Dentist",
    description: "Checkup",
    location: "Main St",
    start: { dateTime: "2026-09-28T14:00:00Z" },
    end: { dateTime: "2026-09-28T15:00:00Z" },
    updated: "2026-09-01T00:00:00Z"
  });
  const outlook = normalizeOutlook({
    id: "o1",
    subject: "Dentist",
    body: { contentType: "text", content: "Checkup" },
    location: { displayName: "Main St" },
    start: { dateTime: "2026-09-28T14:00:00", timeZone: "UTC" },
    end: { dateTime: "2026-09-28T15:00:00", timeZone: "UTC" },
    showAs: "busy",
    sensitivity: "normal",
    lastModifiedDateTime: "2026-09-01T00:00:00Z"
  });
  assert.equal(canonicalHash(google), canonicalHash(outlook));
});

test("all-day payloads preserve exclusive end dates", () => {
  const event = {
    id: "source",
    title: "Away",
    description: "",
    location: "",
    allDay: true,
    start: "2026-10-01",
    end: "2026-10-03",
    availability: "free",
    visibility: "default"
  };
  assert.deepEqual(googlePayload(event, "o1").end, { date: "2026-10-03" });
  assert.equal(outlookPayload(event, "g1", "America/New_York").end.dateTime, "2026-10-03T00:00:00");
});

test("latest modified side wins a conflict", () => {
  assert.equal(
    chooseWinner(
      { updatedAt: "2026-09-28T12:00:00Z" },
      { updatedAt: "2026-09-28T12:01:00Z" }
    ),
    "google"
  );
});
