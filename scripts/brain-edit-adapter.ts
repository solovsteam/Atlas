import { createAtlasClient } from "./brain-atlas-mcp";
import { applyBrainEditPreview, BrainEditError, getBrainEditContext, getBrainEditFeedback, getBrainEditReceipt, previewBrainEdits, undoBrainEdits } from "../src/services/brainEdits";

const chunks: Buffer[] = [];
for await (const chunk of process.stdin) {
  chunks.push(Buffer.from(chunk));
  if (chunks.reduce((size, value) => size + value.length, 0) > 2 * 1024 * 1024) throw new Error("Atlas edit request too large");
}
const request = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
const client = createAtlasClient();
try {
  let result: unknown;
  if (request.operation === "context") result = await getBrainEditContext(client);
  else if (request.operation === "preview") result = await previewBrainEdits(client, request.plan);
  else if (request.operation === "apply" && typeof request.previewId === "string") result = await applyBrainEditPreview(client, request.previewId);
  else if (request.operation === "receipt" && typeof request.requestId === "string") result = await getBrainEditReceipt(client, request.requestId);
  else if (request.operation === "feedback" && typeof request.requestId === "string") result = await getBrainEditFeedback(client, request.requestId);
  else if (request.operation === "undo" && typeof request.requestId === "string" && typeof request.undoRequestId === "string") result = await undoBrainEdits(client, request.requestId, request.undoRequestId);
  else throw new BrainEditError("Unknown Atlas edit operation or missing fields", false);
  process.stdout.write(JSON.stringify({ ok: true, result }) + "\n");
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, uncertain: error instanceof BrainEditError ? error.uncertain : ["apply", "undo"].includes(String(request.operation)), error: error instanceof Error ? error.message : "Atlas edit adapter failed" }) + "\n");
  process.exitCode = 1;
} finally {
  client.auth.stopAutoRefresh();
}
