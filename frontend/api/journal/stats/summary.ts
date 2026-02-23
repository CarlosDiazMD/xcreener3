import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSQL } from "../../lib/db.js";
import { requireAuth, AuthError } from "../../lib/auth.js";
import { cors } from "../../lib/cors.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (cors(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ detail: "Method not allowed" });

  try {
    const userId = await requireAuth(req);
    const sql = getSQL();

    const [closedR, openR] = await Promise.all([
      sql`SELECT pnl FROM journal_entries WHERE user_id = ${userId} AND status = 'closed'`,
      sql`SELECT COUNT(*)::int as c FROM journal_entries WHERE user_id = ${userId} AND status = 'open'`,
    ]);

    const pnls = closedR.map((r: any) => r.pnl || 0);

    if (pnls.length === 0) {
      return res.status(200).json({
        total_trades: 0,
        open_trades: openR[0].c,
        win_rate: 0,
        total_pnl: 0,
        avg_pnl: 0,
        best_trade: 0,
        worst_trade: 0,
        avg_win: 0,
        avg_loss: 0,
      });
    }

    const wins = pnls.filter((p: number) => p > 0);
    const losses = pnls.filter((p: number) => p <= 0);
    const totalPnl = pnls.reduce((a: number, b: number) => a + b, 0);

    return res.status(200).json({
      total_trades: pnls.length,
      open_trades: openR[0].c,
      win_rate: pnls.length > 0 ? (wins.length / pnls.length) * 100 : 0,
      total_pnl: totalPnl,
      avg_pnl: pnls.length > 0 ? totalPnl / pnls.length : 0,
      best_trade: pnls.length > 0 ? Math.max(...pnls) : 0,
      worst_trade: pnls.length > 0 ? Math.min(...pnls) : 0,
      avg_win: wins.length > 0 ? wins.reduce((a: number, b: number) => a + b, 0) / wins.length : 0,
      avg_loss: losses.length > 0 ? losses.reduce((a: number, b: number) => a + b, 0) / losses.length : 0,
    });
  } catch (err: any) {
    if (err instanceof AuthError) return res.status(401).json({ detail: err.message });
    console.error("Journal stats error:", err);
    return res.status(500).json({ detail: "Internal server error" });
  }
}
