import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSQL } from "../lib/db.js";
import { requireAuth, AuthError } from "../lib/auth.js";
import { cors } from "../lib/cors.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (cors(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ detail: "Method not allowed" });

  try {
    await requireAuth(req);
    const sql = getSQL();

    const rows = await sql`
      SELECT started_at, completed_at, total_tickers, success_count, error_count, skipped_count, status
      FROM fetch_logs ORDER BY started_at DESC LIMIT 1
    `;

    if (rows.length === 0) {
      return res.status(200).json({
        status: "idle",
        total_tickers: 0,
        success_count: 0,
        error_count: 0,
        skipped_count: 0,
        progress_percent: 0,
        started_at: null,
        completed_at: null,
      });
    }

    const r = rows[0];
    const total = r.total_tickers || 1;
    const done = (r.success_count || 0) + (r.error_count || 0) + (r.skipped_count || 0);

    return res.status(200).json({
      status: r.status,
      total_tickers: r.total_tickers,
      success_count: r.success_count,
      error_count: r.error_count,
      skipped_count: r.skipped_count,
      progress_percent: Math.round((done / total) * 100),
      started_at: r.started_at,
      completed_at: r.completed_at,
    });
  } catch (err: any) {
    if (err instanceof AuthError) return res.status(401).json({ detail: err.message });
    console.error("Fetch status error:", err);
    return res.status(500).json({ detail: "Internal server error" });
  }
}
