import { Composio } from "@composio/core";
import {
  GRAPH_SOURCE_ID,
  googlePayload,
  outlookPayload,
  stableId
} from "./model.js";

function unwrap(result) {
  if (result?.status && result.status >= 400) {
    throw new Error(`Provider returned HTTP ${result.status}: ${JSON.stringify(result.data)}`);
  }
  return result?.data ?? result;
}

function parameter(name, value, location = "query") {
  return { name, value: String(value), in: location };
}

export class Providers {
  constructor(config) {
    this.config = config;
    this.composio = new Composio({ apiKey: config.composioApiKey });
  }

  async proxy(connectedAccountId, request) {
    const result = await this.composio.tools.proxyExecute({
      connectedAccountId,
      ...request
    });
    return unwrap(result);
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
      const data = await this.proxy(this.config.googleAccountId, {
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
    if (this.config.outlookCalendarId === "primary") {
      return "https://graph.microsoft.com/v1.0/me/calendarView";
    }
    return `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(this.config.outlookCalendarId)}/calendarView`;
  }

  async listOutlook(start, end) {
    const items = [];
    let endpoint = this.outlookCalendarViewPath();
    let parameters = [
      parameter("startDateTime", start),
      parameter("endDateTime", end),
      parameter("$top", 999),
      parameter(
        "$select",
        "id,subject,body,bodyPreview,start,end,location,isAllDay,isCancelled,lastModifiedDateTime,createdDateTime,iCalUId,showAs,sensitivity,type,seriesMasterId"
      ),
      parameter(
        "$expand",
        `singleValueExtendedProperties($filter=id eq '${GRAPH_SOURCE_ID}')`
      ),
      parameter("Prefer", 'outlook.timezone="UTC"', "header")
    ];
    while (endpoint) {
      const data = await this.proxy(this.config.outlookAccountId, {
        endpoint,
        method: "GET",
        parameters
      });
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
      const data = await this.proxy(this.config.googleAccountId, {
        endpoint,
        method: "POST",
        parameters: [parameter("sendUpdates", "none")],
        body: { id, ...googlePayload(event, event.id) }
      });
      return data.id;
    } catch (error) {
      if (!String(error).includes("409")) throw error;
      await this.proxy(this.config.googleAccountId, {
        endpoint: `${endpoint}/${encodeURIComponent(id)}`,
        method: "GET"
      });
      return id;
    }
  }

  async updateGoogle(googleId, event, outlookId) {
    await this.proxy(this.config.googleAccountId, {
      endpoint: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.config.googleCalendarId)}/events/${encodeURIComponent(googleId)}`,
      method: "PATCH",
      parameters: [parameter("sendUpdates", "none")],
      body: googlePayload(event, outlookId)
    });
  }

  async deleteGoogle(googleId) {
    await this.proxy(this.config.googleAccountId, {
      endpoint: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.config.googleCalendarId)}/events/${encodeURIComponent(googleId)}`,
      method: "DELETE",
      parameters: [parameter("sendUpdates", "none")]
    });
  }

  async createOutlook(event) {
    const body = outlookPayload(event, event.id, this.config.timezone);
    body.transactionId = stableId("", `google:${event.id}`, 32);
    const data = await this.proxy(this.config.outlookAccountId, {
      endpoint: this.outlookCalendarPath("/events"),
      method: "POST",
      body
    });
    return data.id;
  }

  async updateOutlook(outlookId, event, googleId) {
    await this.proxy(this.config.outlookAccountId, {
      endpoint: `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(outlookId)}`,
      method: "PATCH",
      body: outlookPayload(event, googleId, this.config.timezone)
    });
  }

  async deleteOutlook(outlookId) {
    await this.proxy(this.config.outlookAccountId, {
      endpoint: `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(outlookId)}`,
      method: "DELETE"
    });
  }

  async getGoogle(googleId) {
    try {
      return await this.proxy(this.config.googleAccountId, {
        endpoint: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.config.googleCalendarId)}/events/${encodeURIComponent(googleId)}`,
        method: "GET"
      });
    } catch (error) {
      if (/HTTP (404|410)/.test(String(error))) return null;
      throw error;
    }
  }

  async getOutlook(outlookId) {
    try {
      return await this.proxy(this.config.outlookAccountId, {
        endpoint: `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(outlookId)}`,
        method: "GET",
        parameters: [
          parameter(
            "$expand",
            `singleValueExtendedProperties($filter=id eq '${GRAPH_SOURCE_ID}')`
          ),
          parameter("Prefer", 'outlook.timezone="UTC"', "header")
        ]
      });
    } catch (error) {
      if (/HTTP (404|410)/.test(String(error))) return null;
      throw error;
    }
  }
}
