import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
const child = spawn(process.execPath, [fileURLToPath(new URL("node_modules/tsx/dist/cli.mjs", root)), "--tsconfig", fileURLToPath(new URL("tsconfig.brain-mcp.json", root)), fileURLToPath(new URL("scripts/brain-edit-adapter.ts", root))], { stdio: "inherit" });
child.on("error", () => { process.stdout.write(JSON.stringify({ ok: false, uncertain: true, error: "Atlas adapter could not start" }) + "\n"); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
