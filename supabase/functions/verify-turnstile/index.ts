import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const ORIGIN_LIST = (Deno.env.get("ALLOWED_ORIGINS") || "")
  .split(";")
  .map(value => value.trim().replace(/\/$/, ""))
  .filter(Boolean);

function response(status: number, payload: Record<string, unknown>, origin?: string | null) {
  const headers: Record<string, string> = { ...JSON_HEADERS, "Vary": "Origin" };
  if (origin && ORIGIN_LIST.includes(origin.replace(/\/$/, ""))) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Headers"] = "authorization, x-client-info, apikey, content-type";
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
  }
  return new Response(JSON.stringify(payload), { status, headers });
}

serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const allowedOrigin = Boolean(origin && ORIGIN_LIST.includes(origin.replace(/\/$/, "")));
  if (!ORIGIN_LIST.length) return response(500, { success: false, error: "Security configuration unavailable" });
  if (origin && !allowedOrigin) return response(403, { success: false, error: "Origin not allowed" });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: {
    "Vary": "Origin",
    ...(allowedOrigin ? {
      "Access-Control-Allow-Origin": origin!,
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Max-Age": "600",
    } : {}),
  } });
  if (req.method !== "POST") return response(405, { success: false, error: "Method not allowed" }, origin);
  if (!origin || !allowedOrigin) return response(403, { success: false, error: "Origin not allowed" });
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) return response(500, { success: false, error: "Security verification is not configured" }, origin);
  const declaredLength = Number(req.headers.get("content-length") || 0);
  if (declaredLength > 12_000) return response(413, { success: false, error: "Request too large" }, origin);

  try {
    const reader = req.body?.getReader();
    if (!reader) return response(400, { success: false, error: "Request body required" }, origin);
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      totalBytes += part.value.byteLength;
      if (totalBytes > 12_000) {
        await reader.cancel();
        return response(413, { success: false, error: "Request too large" }, origin);
      }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const body = JSON.parse(new TextDecoder().decode(bytes));
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    if (!token || token.length > 4096) return response(400, { success: false, error: "Invalid verification token" }, origin);
    // This endpoint is deliberately fixed to Cloudflare; no user-controlled URL is fetched (SSRF mitigation).
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let verifyResponse: Response;
    try {
      verifyResponse = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret, response: token }),
        signal: controller.signal,
      });
    } finally { clearTimeout(timeout); }
    if (!verifyResponse.ok) return response(502, { success: false, error: "Verification provider unavailable" }, origin);
    const result = await verifyResponse.json();
    const expectedHostname = new URL(origin).hostname.toLowerCase();
    const verifiedHostname = String(result?.hostname || '').toLowerCase();
    const verified = Boolean(result?.success && verifiedHostname && verifiedHostname === expectedHostname);
    return response(verified ? 200 : 403, { success: verified }, origin);
  } catch {
    return response(500, { success: false, error: "Verification could not be completed" }, origin);
  }
});
