import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth, AuthError } from "../../lib/auth.js";
import { cors } from "../../lib/cors.js";

const VALID_TIMEFRAMES = ["daily", "weekly", "monthly"];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ detail: "Method not allowed" });

  try {
    await requireAuth(req);

    const { timeframe } = req.query;
    if (!VALID_TIMEFRAMES.includes(String(timeframe))) {
      return res.status(400).json({ detail: `Invalid timeframe: ${timeframe}` });
    }

    // Scanning requires background processing (yfinance + pandas).
    // In serverless mode, return a status indicating the scan needs the Python backend.
    return res.status(200).json({
      status: "not_available",
      timeframe: String(timeframe),
      message: "Scanning requires the Python backend with yfinance. Deploy the backend service to enable live scanning.",
    });
  } catch (err: any) {
    if (err instanceof AuthError) return res.status(401).json({ detail: err.message });
    return res.status(500).json({ detail: "Internal server error" });
  }
}
