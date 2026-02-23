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
      SELECT exchange, COUNT(*)::int as count
      FROM tickers WHERE is_active = true
      GROUP BY exchange
    `;

    const exchanges: Record<string, number> = {};
    let total = 0;
    for (const r of rows) {
      exchanges[r.exchange] = r.count;
      total += r.count;
    }

    return res.status(200).json({ exchanges, total });
  } catch (err: any) {
    if (err instanceof AuthError) return res.status(401).json({ detail: err.message });
    console.error("Ticker stats error:", err);
    return res.status(500).json({ detail: "Internal server error" });
  }
}
