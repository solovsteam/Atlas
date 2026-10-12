export type CompileJob = {
  id: string;
  status: string;
  source?: string;
  compilerRef?: string;
  error?: string;
};
const COMPILER = "http://127.0.0.1:43154";
export async function compileRequestId(
  generatorId: string,
  text: string,
  timeZone: string,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify([generatorId, text, timeZone])),
  );
  const h = Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  )
    .join("")
    .slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20)}`;
}
export async function compileRule(
  id: string,
  text: string,
  timeZone: string,
): Promise<CompileJob> {
  let response: Response;
  try {
    response = await fetch(`${COMPILER}/compile/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, timeZone }),
    });
  } catch {
    throw new Error(
      "The rule compiler is unavailable. Start the Atlas compiler on your Mac; Brain uses your signed-in subscription.",
    );
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Could not compile rule");
  return result;
}
export async function readCompileJob(id: string): Promise<CompileJob> {
  const response = await fetch(`${COMPILER}/compile/${id}`);
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error ?? "Could not read compilation");
  return result;
}
