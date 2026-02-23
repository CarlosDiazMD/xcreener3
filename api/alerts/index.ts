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

    const limit = Math.min(parseInt(String(req.query.limit || "50"), 10), 200);
    const offset = parseInt(String(req.query.offset || "0"), 10);

    const rows = await sql`
      SELECT a.id, t.symbol, t.name, t.exchange,
             s.signal_type, s.timeframe, s.signal_date, s.price_at_signal as price,
             s.rsi_value as rsi, s.squeeze_momentum as momentum,
             a.channel, a.sent_at, a.delivered
      FROM alerts_sent a
      JOIN signals s ON a.signal_id = s.id
      JOIN tickers t ON s.ticker_id = t.id
      WHERE a.user_id = ${userId}
      ORDER BY a.sent_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return res.status(200).json(rows.map((r: any) => ({
      id: r.id,
      symbol: r.symbol,
      name: r.name,
      exchange: r.exchange,
      signal_type: r.signal_type,
      timeframe: r.timeframe,
      signal_date: r.signal_date,
      price: r.price,
      rsi: r.rsi,
      momentum: r.momentum,
      channel: r.channel,
      sent_at: r.sent_at,
      delivered: r.delivered,
    })));
  } catch (err: any) {
    if (err instanceof AuthError) return res.status(401).json({ detail: err.message });
    console.error("Alerts list error:", err);
    return res.status(500).json({ detail: "Internal server error" });
  }
}
