import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPings } from "../src/api";

test("ping history sends the selected hours as official API text and keeps cancellation", async () => {
  const original = globalThis.fetch;
  const requests: RequestInit[] = [];
  globalThis.fetch = async (_url, init) => {
    requests.push(init!);
    return Response.json({ jsonrpc: "2.0", result: { records: [] } });
  };
  try {
    const controller = new AbortController();
    await loadPings("node", controller.signal);
    await loadPings("node", controller.signal, 6);
    await loadPings("node", controller.signal, 24);
    assert.deepEqual(
      requests.map((r) => JSON.parse(r.body as string).params),
      [
        { uuid: "node", hours: "1" },
        { uuid: "node", hours: "6" },
        { uuid: "node", hours: "24" },
      ],
    );
    assert.ok(requests.every((r) => r.signal === controller.signal));
  } finally {
    globalThis.fetch = original;
  }
});
