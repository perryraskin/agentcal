import {
  canonicalHash,
  chooseWinner,
  fingerprint,
  normalizeGoogle,
  normalizeOutlook
} from "./model.js";

function uniqueIndex(events, keyFn) {
  const grouped = new Map();
  for (const event of events) {
    const key = keyFn(event);
    if (!key) continue;
    const values = grouped.get(key) ?? [];
    values.push(event);
    grouped.set(key, values);
  }
  return new Map([...grouped].filter(([, values]) => values.length === 1).map(([key, values]) => [key, values[0]]));
}

export class CalendarSync {
  constructor({ providers, store, config, logger = console }) {
    this.providers = providers;
    this.store = store;
    this.config = config;
    this.logger = logger;
  }

  window() {
    const now = Date.now();
    return {
      start: new Date(now - this.config.pastDays * 86400000).toISOString(),
      end: new Date(now + this.config.futureDays * 86400000).toISOString()
    };
  }

  pairKey(outlookId, googleId) {
    return `${outlookId}::${googleId}`;
  }

  recordPair(outlook, google) {
    this.store.state.pairs[this.pairKey(outlook.id, google.id)] = {
      outlookId: outlook.id,
      googleId: google.id,
      // A recovered/new pair is reconciled immediately. Null baselines make both
      // sides "changed", invoking the normal last-modified conflict rule.
      outlookHash: null,
      googleHash: null,
      missingOutlook: 0,
      missingGoogle: 0
    };
  }

  async run() {
    const startedAt = new Date().toISOString();
    const { start, end } = this.window();
    const [outlookRaw, googleRaw] = await Promise.all([
      this.providers.listOutlook(start, end),
      this.providers.listGoogle(start, end)
    ]);
    const outlook = outlookRaw.map(normalizeOutlook).filter((event) => !event.cancelled);
    const google = googleRaw.map(normalizeGoogle).filter((event) => !event.cancelled);
    const outlookById = new Map(outlook.map((event) => [event.id, event]));
    const googleById = new Map(google.map((event) => [event.id, event]));
    const claimedOutlook = new Set();
    const claimedGoogle = new Set();
    const stats = { paired: 0, createdGoogle: 0, createdOutlook: 0, updatedGoogle: 0, updatedOutlook: 0, deletedGoogle: 0, deletedOutlook: 0 };

    // Existing mappings always win, including mappings recovered from embedded IDs.
    for (const pair of Object.values(this.store.state.pairs)) {
      claimedOutlook.add(pair.outlookId);
      claimedGoogle.add(pair.googleId);
    }
    for (const event of google) {
      if (event.sourceId && outlookById.has(event.sourceId)) {
        const peer = outlookById.get(event.sourceId);
        const key = this.pairKey(peer.id, event.id);
        if (!this.store.state.pairs[key]) this.recordPair(peer, event);
        claimedOutlook.add(peer.id);
        claimedGoogle.add(event.id);
      }
    }
    for (const event of outlook) {
      if (event.sourceId && googleById.has(event.sourceId)) {
        const peer = googleById.get(event.sourceId);
        const key = this.pairKey(event.id, peer.id);
        if (!this.store.state.pairs[key]) this.recordPair(event, peer);
        claimedOutlook.add(event.id);
        claimedGoogle.add(peer.id);
      }
    }

    // Initial de-duplication: same provider UID first, then an unambiguous exact fingerprint.
    const unclaimedOutlook = () => outlook.filter((event) => !claimedOutlook.has(event.id));
    const unclaimedGoogle = () => google.filter((event) => !claimedGoogle.has(event.id));
    for (const keyFn of [(event) => event.iCalUid, fingerprint]) {
      const left = uniqueIndex(unclaimedOutlook(), keyFn);
      const right = uniqueIndex(unclaimedGoogle(), keyFn);
      for (const [key, outlookEvent] of left) {
        const googleEvent = right.get(key);
        if (!googleEvent) continue;
        this.recordPair(outlookEvent, googleEvent);
        claimedOutlook.add(outlookEvent.id);
        claimedGoogle.add(googleEvent.id);
        stats.paired += 1;
      }
    }

    // Reconcile mapped events. Two consecutive complete snapshots are required
    // before propagating a deletion, avoiding destructive action on transient gaps.
    for (const [key, pair] of Object.entries(this.store.state.pairs)) {
      let outlookEvent = outlookById.get(pair.outlookId);
      let googleEvent = googleById.get(pair.googleId);
      // A missing item may simply have moved outside the bounded calendarView.
      // Confirm it by ID before considering deletion propagation.
      if (!outlookEvent && googleEvent) {
        const fetched = await this.providers.getOutlook(pair.outlookId);
        if (fetched) outlookEvent = normalizeOutlook(fetched);
      }
      if (!googleEvent && outlookEvent) {
        const fetched = await this.providers.getGoogle(pair.googleId);
        if (fetched) googleEvent = normalizeGoogle(fetched);
      }
      if (!outlookEvent && !googleEvent) {
        delete this.store.state.pairs[key];
        continue;
      }
      if (!outlookEvent) {
        pair.missingOutlook = (pair.missingOutlook ?? 0) + 1;
        if (pair.missingOutlook >= 2) {
          await this.providers.deleteGoogle(pair.googleId);
          delete this.store.state.pairs[key];
          stats.deletedGoogle += 1;
        }
        continue;
      }
      if (!googleEvent) {
        pair.missingGoogle = (pair.missingGoogle ?? 0) + 1;
        if (pair.missingGoogle >= 2) {
          await this.providers.deleteOutlook(pair.outlookId);
          delete this.store.state.pairs[key];
          stats.deletedOutlook += 1;
        }
        continue;
      }
      pair.missingOutlook = 0;
      pair.missingGoogle = 0;
      const outlookHash = canonicalHash(outlookEvent);
      const googleHash = canonicalHash(googleEvent);
      const outlookChanged = outlookHash !== pair.outlookHash;
      const googleChanged = googleHash !== pair.googleHash;
      if (outlookChanged || googleChanged) {
        const winner =
          outlookChanged && googleChanged
            ? chooseWinner(outlookEvent, googleEvent)
            : outlookChanged
              ? "outlook"
              : "google";
        if (winner === "outlook") {
          await this.providers.updateGoogle(pair.googleId, outlookEvent, pair.outlookId);
          pair.outlookHash = outlookHash;
          pair.googleHash = outlookHash;
          stats.updatedGoogle += 1;
        } else {
          await this.providers.updateOutlook(pair.outlookId, googleEvent, pair.googleId);
          pair.outlookHash = googleHash;
          pair.googleHash = googleHash;
          stats.updatedOutlook += 1;
        }
      }
    }

    // Create mirrors last, only after all pairing opportunities are exhausted.
    for (const event of unclaimedOutlook()) {
      const googleId = await this.providers.createGoogle(event);
      this.store.state.pairs[this.pairKey(event.id, googleId)] = {
        outlookId: event.id,
        googleId,
        outlookHash: canonicalHash(event),
        googleHash: canonicalHash(event),
        missingOutlook: 0,
        missingGoogle: 0
      };
      stats.createdGoogle += 1;
    }
    for (const event of unclaimedGoogle()) {
      const outlookId = await this.providers.createOutlook(event);
      this.store.state.pairs[this.pairKey(outlookId, event.id)] = {
        outlookId,
        googleId: event.id,
        outlookHash: canonicalHash(event),
        googleHash: canonicalHash(event),
        missingOutlook: 0,
        missingGoogle: 0
      };
      stats.createdOutlook += 1;
    }

    this.store.state.stats = {
      ...stats,
      outlookEvents: outlook.length,
      googleEvents: google.length,
      pairs: Object.keys(this.store.state.pairs).length,
      startedAt,
      completedAt: new Date().toISOString()
    };
    await this.store.save();
    this.logger.log(JSON.stringify({ event: "sync_complete", ...this.store.state.stats }));
    return this.store.state.stats;
  }
}
