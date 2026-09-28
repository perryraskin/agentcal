import { createHash } from "node:crypto";

export const GRAPH_SOURCE_ID =
  "String {66f5a359-4659-4830-9070-00040ec6ac6e} Name agentcalSourceId";

export function stableId(prefix, value, length = 40) {
  const digest = createHash("sha256").update(String(value)).digest("hex");
  return `${prefix}${digest}`.slice(0, length);
}

export function canonicalHash(event) {
  const stable = {
    title: event.title ?? "",
    description: event.description ?? "",
    location: event.location ?? "",
    allDay: Boolean(event.allDay),
    start: event.start,
    end: event.end,
    availability: event.availability ?? "busy",
    visibility: event.visibility ?? "default"
  };
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

export function fingerprint(event) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        title: (event.title ?? "").trim().toLocaleLowerCase(),
        location: (event.location ?? "").trim().toLocaleLowerCase(),
        allDay: Boolean(event.allDay),
        start: event.start,
        end: event.end
      })
    )
    .digest("hex");
}

function utcIso(value, timeZone = "UTC") {
  if (!value) return "";
  if (/Z$|[+-]\d\d:\d\d$/.test(value)) return new Date(value).toISOString();
  if (timeZone === "UTC") return new Date(`${value}Z`).toISOString();
  // Graph is requested with Prefer: outlook.timezone="UTC". This fallback keeps
  // an unexpected provider timezone explicit instead of silently using host time.
  return `${value}[${timeZone}]`;
}

export function normalizeGoogle(raw) {
  const allDay = Boolean(raw.start?.date);
  return {
    provider: "google",
    id: raw.id,
    iCalUid: raw.iCalUID ?? null,
    title: raw.summary ?? "",
    description: raw.description ?? "",
    location: raw.location ?? "",
    allDay,
    start: allDay ? raw.start.date : utcIso(raw.start?.dateTime),
    end: allDay ? raw.end?.date : utcIso(raw.end?.dateTime),
    availability: raw.transparency === "transparent" ? "free" : "busy",
    visibility: raw.visibility ?? "default",
    updatedAt: raw.updated ?? raw.created ?? new Date(0).toISOString(),
    cancelled: raw.status === "cancelled",
    sourceId: raw.extendedProperties?.private?.agentcalSourceId ?? null,
    raw
  };
}

export function normalizeOutlook(raw) {
  const allDay = Boolean(raw.isAllDay);
  const sourceProperty = raw.singleValueExtendedProperties?.find(
    (property) => property.id === GRAPH_SOURCE_ID
  );
  const description =
    raw.body?.contentType?.toLowerCase() === "text"
      ? raw.body.content ?? ""
      : raw.bodyPreview ?? "";
  return {
    provider: "outlook",
    id: raw.id,
    iCalUid: raw.iCalUId ?? null,
    title: raw.subject ?? "",
    description,
    location: raw.location?.displayName ?? "",
    allDay,
    start: allDay
      ? raw.start?.dateTime?.slice(0, 10)
      : utcIso(raw.start?.dateTime, raw.start?.timeZone),
    end: allDay
      ? raw.end?.dateTime?.slice(0, 10)
      : utcIso(raw.end?.dateTime, raw.end?.timeZone),
    availability: raw.showAs === "free" ? "free" : "busy",
    visibility: raw.sensitivity === "normal" ? "default" : raw.sensitivity ?? "default",
    updatedAt: raw.lastModifiedDateTime ?? raw.createdDateTime ?? new Date(0).toISOString(),
    cancelled: Boolean(raw.isCancelled),
    sourceId: sourceProperty?.value ?? null,
    raw
  };
}

export function chooseWinner(outlook, google) {
  return Date.parse(outlook.updatedAt) >= Date.parse(google.updatedAt)
    ? "outlook"
    : "google";
}

export function googlePayload(event, outlookId) {
  const payload = {
    summary: event.title,
    description: event.description,
    location: event.location,
    start: event.allDay ? { date: event.start } : { dateTime: event.start },
    end: event.allDay ? { date: event.end } : { dateTime: event.end },
    transparency: event.availability === "free" ? "transparent" : "opaque",
    visibility:
      event.visibility === "private" || event.visibility === "confidential"
        ? "private"
        : "default",
    extendedProperties: {
      private: {
        agentcalSource: "outlook",
        agentcalSourceId: outlookId
      }
    }
  };
  return payload;
}

export function outlookPayload(event, googleId, timezone) {
  const timed = (iso) => ({ dateTime: iso.replace(/Z$/, ""), timeZone: "UTC" });
  const allDay = (date) => ({ dateTime: `${date}T00:00:00`, timeZone: timezone });
  return {
    subject: event.title,
    body: { contentType: "text", content: event.description },
    location: { displayName: event.location },
    isAllDay: event.allDay,
    start: event.allDay ? allDay(event.start) : timed(event.start),
    end: event.allDay ? allDay(event.end) : timed(event.end),
    showAs: event.availability === "free" ? "free" : "busy",
    sensitivity:
      event.visibility === "private" || event.visibility === "confidential"
        ? "private"
        : "normal",
    singleValueExtendedProperties: [
      { id: GRAPH_SOURCE_ID, value: googleId }
    ]
  };
}
