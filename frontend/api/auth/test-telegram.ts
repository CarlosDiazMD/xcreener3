import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth, AuthError } from "../lib/auth.js";
import { cors } from "../lib/cors.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (cors(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ detail: "Method not allowed" });
  }

  try {
    await requireAuth(req);
    // Telegram integration not available in serverless mode
    return res.status(501).json({ detail: "Telegram integration requires the Python backend" });
  } catch (err: any) {
    if (err instanceof AuthError) {
      return res.status(401).json({ detail: err.message });
    }
    return res.status(500).json({ detail: "Internal server error" });
  }
}
