import { execFile } from "node:child_process";
import {
  GRAPH_SOURCE_ID,
  googlePayload,
  outlookPayload,
  stableId
} from "./model.js";

function execFileAsync(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
    // Composio treats an open pipe as potentially interactive input. Closing it
    // makes service execution behave like a non-interactive shell invocation.
    child.stdin.end();
  });
}

class ProviderError extends Error {
  constructor(status, data) {
    super(`Provider returned HTTP ${status}: ${JSON.stringify(data)}`);
    this.status = status;
    this.data = data;
  }
}

function unwrap(result) {
  const status = Number(result?.error?.code ?? result?.status ?? 0);
  if (status >= 400) throw new ProviderError(status, result);
  return result?.data ?? result;
}

function parameter(name, value, location = "query") {
  return { name, value: String(value), in: location };
}

function requestUrl(endpoint, parameters = []) {
  const url = new URL(endpoint);
  for (const item of parameters.filter((entry) => entry.in !== "header")) {
    url.searchParams.set(item.name, item.value);
  }
  return url.toString();
}

export class Providers {
  constructor(config, run = execFileAsync) {
    this.config = config;
    this.run = run;
    // The For You CLI maintains shared local session/cache state. Keep proxy
    // processes serialized so concurrent provider reads cannot contend on it.
    this.queue = Promise.resolve();
  }

  proxy(toolkit, account, request) {
    const result = this.queue.then(
      () => this.proxyDirect(toolkit, account, request),
      () => this.proxyDirect(toolkit, account, request)
    );
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  async proxyDirect(toolkit, account, request) {
    const args = [
      "proxy",
      requestUrl(request.endpoint, request.parameters),
      "--toolkit",
      toolkit,
      "--account",
      account,
      "--skip-connection-check",
      "-X",
      request.method ?? "GET"
    ];
    for (const item of (request.parameters ?? []).filter((entry) => entry.in === "header")) {
      args.push("-H", `${item.name}: ${item.value}`);
    }
    if (request.body !== undefined) {
      args.push("-H", "content-type: application/json", "-d", JSON.stringify(request.body));
    }

    let stdout;
    try {
      ({ stdout } = await this.run(this.config.composioBin, args, {
        maxBuffer: 32 * 1024 * 1024,
        timeout: this.config.providerTimeoutMs
      }));
    } catch (error) {
      const detail = String(error.stderr || error.stdout || error.message).trim();
      throw new Error(`Composio CLI request failed: ${detail}`);
    }
    const text = String(stdout ?? "").trim();
    if (!text) return null;
    try {
      return unwrap(JSON.parse(text));
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new Error(`Composio CLI returned invalid JSON: ${text.slice(0, 500)}`);
    }
  }

  google(request) {
    return this.proxy("googlecalendar", this.config.googleAccount, request);
  }

  outlook(request) {
    return this.proxy("outlook", this.config.outlookAccount, request);
  }

  async verifyIdentities() {
    const [google, outlook] = await Promise.all([
      this.google({
        endpoint: "https://www.googleapis.com/calendar/v3/users/me/calendarList",
        method: "GET",
        parameters: [parameter("maxResults", 250)]
      }),
      this.outlook({
        endpoint: "https://graph.microsoft.com/v1.0/me",
        method: "GET",
        parameters: [parameter("$select", "mail,userPrincipalName")]
      })
    ]);
    const googleEmail = google.items?.find((calendar) => calendar.primary)?.id?.toLowerCase();
    const outlookEmail = (outlook.mail || outlook.userPrincipalName || "").toLowerCase();
    if (googleEmail !== this.config.expectedGoogleEmail.toLowerCase()) {
      throw new Error(`Google identity mismatch: expected ${this.config.expectedGoogleEmail}, got ${googleEmail || "unknown"}`);
    }
    if (outlookEmail !== this.config.expectedOutlookEmail.toLowerCase()) {
      throw new Error(`Outlook identity mismatch: expected ${this.config.expectedOutlookEmail}, got ${outlookEmail || "unknown"}`);
    }
    return { googleEmail, outlookEmail };
  }

  async listGoogle(start, end) {
    const items = [];
    let pageToken = null;
    do {
      const parameters = [
        parameter("timeMin", start),
        parameter("timeMax", end),
        parameter("singleEvents", true),
        parameter("showDeleted", true),
        parameter("maxResults", 2500)
      ];
      if (pageToken) parameters.push(parameter("pageToken", pageToken));
      const data = await this.google({
        endpoint: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.config.googleCalendarId)}/events`,
        method: "GET",
        parameters
      });
      items.push(...(data.items ?? []));
      pageToken = data.nextPageToken ?? null;
    } while (pageToken);
    return items;
  }

  outlookCalendarPath(suffix = "") {
    if (this.config.outlookCalendarId === "primary") return `https://graph.microsoft.com/v1.0/me/calendar${suffix}`;
    return `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(this.config.outlookCalendarId)}${suffix}`;
  }

  outlookCalendarViewPath() {
    if (this.config.outlookCalendarId === "primary") return "https://graph.microsoft.com/v1.0/me/calendarView";
    return `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(this.config.outlookCalendarId)}/calendarView`;
  }

  async listOutlook(start, end) {
    const items = [];
    let endpoint = this.outlookCalendarViewPath();
    let parameters = [
      parameter("startDateTime", start),
      parameter("endDateTime", end),
      parameter("$top", 999),
      parameter("$select", "id,subject,body,bodyPreview,start,end,location,isAllDay,isCancelled,lastModifiedDateTime,createdDateTime,iCalUId,showAs,sensitivity,type,seriesMasterId"),
      parameter("$expand", `singleValueExtendedProperties($filter=id eq '${GRAPH_SOURCE_ID}')`),
      parameter("Prefer", 'outlook.timezone="UTC"', "header")
    ];
    while (endpoint) {
      const data = await this.outlook({ endpoint, method: "GET", parameters });
      items.push(...(data.value ?? []));
      endpoint = data["@odata.nextLink"] ?? null;
      parameters = [parameter("Prefer", 'outlook.timezone="UTC"', "header")];
    }
    return items;
  }

  async createGoogle(event) {
    const id = stableId("ac", `outlook:${event.id}`, 40);
    const endpoint = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.config.googleCalendarId)}/events`;
    try {
      const data = await this.google({ endpoint, method: "POST", parameters: [parameter("sendUpdates", "none")], body: { id, ...googlePayload(event, event.id) } });
      return data.id;
    } catch (error) {
      if (error.status !== 409) throw error;
      await this.google({ endpoint: `${endpoint}/${encodeURIComponent(id)}`, method: "GET" });
      return id;
    }
  }

  async updateGoogle(googleId, event, outlookId) {
    await this.google({
      endpoint: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.config.googleCalendarId)}/events/${encodeURIComponent(googleId)}`,
      method: "PATCH",
      parameters: [parameter("sendUpdates", "none")],
      body: googlePayload(event, outlookId)
    });
  }

  async deleteGoogle(googleId) {
    await this.google({
      endpoint: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.config.googleCalendarId)}/events/${encodeURIComponent(googleId)}`,
      method: "DELETE",
      parameters: [parameter("sendUpdates", "none")]
    });
  }

  async createOutlook(event) {
    const body = outlookPayload(event, event.id, this.config.timezone);
    body.transactionId = stableId("", `google:${event.id}`, 32);
    const data = await this.outlook({ endpoint: this.outlookCalendarPath("/events"), method: "POST", body });
    return data.id;
  }

  async updateOutlook(outlookId, event, googleId) {
    await this.outlook({
      endpoint: `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(outlookId)}`,
      method: "PATCH",
      body: outlookPayload(event, googleId, this.config.timezone)
    });
  }

  async deleteOutlook(outlookId) {
    await this.outlook({ endpoint: `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(outlookId)}`, method: "DELETE" });
  }

  async getGoogle(googleId) {
    try {
      return await this.google({
        endpoint: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.config.googleCalendarId)}/events/${encodeURIComponent(googleId)}`,
        method: "GET"
      });
    } catch (error) {
      if ([404, 410].includes(error.status)) return null;
      throw error;
    }
  }

  async getOutlook(outlookId) {
    try {
      return await this.outlook({
        endpoint: `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(outlookId)}`,
        method: "GET",
        parameters: [
          parameter("$expand", `singleValueExtendedProperties($filter=id eq '${GRAPH_SOURCE_ID}')`),
          parameter("Prefer", 'outlook.timezone="UTC"', "header")
        ]
      });
    } catch (error) {
      if ([404, 410].includes(error.status)) return null;
      throw error;
    }
  }
}
