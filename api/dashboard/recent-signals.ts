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

    const { timeframe, signal_type, exchange, limit: limitStr } = req.query;
    const limit = Math.min(parseInt(String(limitStr || "50"), 10), 200);

    // Build conditions array
    const conditions: string[] = [];
    const params: any[] = [];

    let paramIdx = 1;

    let query = `
      SELECT s.id, t.symbol as ticker_symbol, t.name as ticker_name,
             s.signal_type, s.timeframe, s.signal_date, s.price_at_signal,
             s.rsi_value, s.squeeze_momentum, s.squeeze_on, s.details, s.created_at
      FROM signals s
      JOIN tickers t ON s.ticker_id = t.id
    `;

    const whereClauses: string[] = [];

    if (timeframe) {
      whereClauses.push(`s.timeframe = '${String(timeframe)}'`);
    }
    if (signal_type) {
      whereClauses.push(`s.signal_type = '${String(signal_type)}'`);
    }
    if (exchange) {
      whereClauses.push(`t.exchange = '${String(exchange)}'`);
    }

    if (whereClauses.length > 0) {
      query += " WHERE " + whereClauses.join(" AND ");
    }

    query += ` ORDER BY s.signal_date DESC, s.created_at DESC LIMIT ${limit}`;

    const rows = await sql(query);

    return res.status(200).json(rows.map((r: any) => ({
      id: r.id,
      ticker_symbol: r.ticker_symbol,
      ticker_name: r.ticker_name,
      signal_type: r.signal_type,
      timeframe: r.timeframe,
      signal_date: r.signal_date,
      price_at_signal: r.price_at_signal,
      rsi_value: r.rsi_value,
      squeeze_momentum: r.squeeze_momentum,
      squeeze_on: r.squeeze_on,
      details: r.details,
      created_at: r.created_at,
    })));
  } catch (err: any) {
    if (err instanceof AuthError) return res.status(401).json({ detail: err.message });
    console.error("Recent signals error:", err);
    return res.status(500).json({ detail: "Internal server error" });
  }
}
