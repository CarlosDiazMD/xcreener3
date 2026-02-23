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

    const [exchangeR, ohlcvR, errorR, noDataR, dateR] = await Promise.all([
      sql`
        SELECT exchange, is_active, COUNT(*)::int as count
        FROM tickers GROUP BY exchange, is_active
      `,
      sql`SELECT COUNT(*)::int as c FROM ohlcv_daily`,
      sql`SELECT COUNT(*)::int as c FROM tickers WHERE error_count > 0`,
      sql`
        SELECT COUNT(*)::int as c FROM tickers t
        LEFT JOIN ohlcv_daily o ON t.id = o.ticker_id
        WHERE t.is_active = true
        GROUP BY t.id HAVING COUNT(o.id) = 0
      `,
      sql`SELECT MIN(date) as first, MAX(date) as last FROM ohlcv_daily`,
    ]);

    const exchanges: Record<string, { active: number; inactive: number }> = {};
    let totalActive = 0;
    let totalInactive = 0;

    for (const r of exchangeR) {
      const ex = r.exchange || "UNKNOWN";
      if (!exchanges[ex]) exchanges[ex] = { active: 0, inactive: 0 };
      if (r.is_active) {
        exchanges[ex].active = r.count;
        totalActive += r.count;
      } else {
        exchanges[ex].inactive = r.count;
        totalInactive += r.count;
      }
    }

    return res.status(200).json({
      exchanges,
      total_active: totalActive,
      total_inactive: totalInactive,
      total_tickers: totalActive + totalInactive,
      total_ohlcv_records: ohlcvR[0].c,
      tickers_with_errors: errorR[0].c,
      active_with_no_data: noDataR.length,
      data_date_range: {
        first: dateR[0].first,
        last: dateR[0].last,
      },
    });
  } catch (err: any) {
    if (err instanceof AuthError) return res.status(401).json({ detail: err.message });
    console.error("Explorer stats error:", err);
    return res.status(500).json({ detail: "Internal server error" });
  }
}
