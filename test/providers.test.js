import assert from "node:assert/strict";
import test from "node:test";
import { Providers } from "../src/providers.js";

test("For You provider calls are serialized and identities are pinned", async () => {
  let active = 0;
  let maxActive = 0;
  const calls = [];
  const run = async (command, args) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    calls.push({ command, args });
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    const payload = args[1].includes("googleapis.com")
      ? { items: [{ id: "perry.raskin@coverdash.com", primary: true }] }
      : { mail: "perry.raskin@coverdash.com" };
    return { stdout: JSON.stringify(payload), stderr: "" };
  };
  const providers = new Providers(
    {
      composioBin: "composio",
      googleAccount: "google-account",
      outlookAccount: "outlook-account",
      expectedGoogleEmail: "perry.raskin@coverdash.com",
      expectedOutlookEmail: "perry.raskin@coverdash.com",
      providerTimeoutMs: 1000
    },
    run
  );

  assert.deepEqual(await providers.verifyIdentities(), {
    googleEmail: "perry.raskin@coverdash.com",
    outlookEmail: "perry.raskin@coverdash.com"
  });
  assert.equal(maxActive, 1);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(({ args }) => args.includes("--skip-connection-check")));
});
