import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSQL } from "../lib/db.js";
import { requireAuth, AuthError } from "../lib/auth.js";
import { cors } from "../lib/cors.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (cors(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ detail: "Method not allowed" });

  try {
    const userId = await requireAuth(req);
    const sql = getSQL();

    const today = new Date().toISOString().split("T")[0];
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];

    const [totalR, activeR, todayR, weekR, buyR, sellR, fetchR, openR, pnlR] = await Promise.all([
      sql`SELECT COUNT(*)::int as c FROM tickers`,
      sql`SELECT COUNT(*)::int as c FROM tickers WHERE is_active = true`,
      sql`SELECT COUNT(*)::int as c FROM signals WHERE signal_date = ${today}`,
      sql`SELECT COUNT(*)::int as c FROM signals WHERE signal_date >= ${weekAgo}`,
      sql`SELECT COUNT(*)::int as c FROM signals WHERE signal_date = ${today} AND signal_type = 'BUY'`,
      sql`SELECT COUNT(*)::int as c FROM signals WHERE signal_date = ${today} AND signal_type = 'SELL'`,
      sql`SELECT MAX(completed_at) as last_fetch FROM fetch_logs WHERE status = 'completed'`,
      sql`SELECT COUNT(*)::int as c FROM journal_entries WHERE user_id = ${userId} AND status = 'open'`,
      sql`SELECT COALESCE(SUM(pnl), 0)::float as total FROM journal_entries WHERE user_id = ${userId} AND status = 'closed'`,
    ]);

    return res.status(200).json({
      total_tickers: totalR[0].c,
      active_tickers: activeR[0].c,
      signals_today: todayR[0].c,
      signals_this_week: weekR[0].c,
      buy_signals_today: buyR[0].c,
      sell_signals_today: sellR[0].c,
      last_data_update: fetchR[0].last_fetch,
      journal_open_trades: openR[0].c,
      journal_total_pnl: pnlR[0].total,
    });
  } catch (err: any) {
    if (err instanceof AuthError) return res.status(401).json({ detail: err.message });
    console.error("Dashboard stats error:", err);
    return res.status(500).json({ detail: "Internal server error" });
  }
}
