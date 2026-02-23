import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth, AuthError } from "../lib/auth.js";
import { cors } from "../lib/cors.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (cors(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ detail: "Method not allowed" });

  try {
    await requireAuth(req);
    // No background scanner in serverless mode
    return res.status(200).json({
      is_running: false,
      current_ticker: null,
      processed: 0,
      total: 0,
      signals_found: 0,
      errors: 0,
      progress_percent: 0,
    });
  } catch (err: any) {
    if (err instanceof AuthError) return res.status(401).json({ detail: err.message });
    return res.status(500).json({ detail: "Internal server error" });
  }
}
