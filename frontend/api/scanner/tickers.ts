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

    const q = String(req.query.q || "").toUpperCase();
    const exchange = req.query.exchange ? String(req.query.exchange) : null;

    let rows;
    if (exchange) {
      rows = await sql`
        SELECT symbol, name, exchange, is_active FROM tickers
        WHERE is_active = true
          AND exchange = ${exchange}
          AND (symbol ILIKE ${"%" + q + "%"} OR name ILIKE ${"%" + q + "%"})
        ORDER BY symbol LIMIT 50
      `;
    } else {
      rows = await sql`
        SELECT symbol, name, exchange, is_active FROM tickers
        WHERE is_active = true
          AND (symbol ILIKE ${"%" + q + "%"} OR name ILIKE ${"%" + q + "%"})
        ORDER BY symbol LIMIT 50
      `;
    }

    return res.status(200).json(rows.map((r: any) => ({
      symbol: r.symbol,
      name: r.name,
      exchange: r.exchange,
      is_active: r.is_active,
    })));
  } catch (err: any) {
    if (err instanceof AuthError) return res.status(401).json({ detail: err.message });
    console.error("Search tickers error:", err);
    return res.status(500).json({ detail: "Internal server error" });
  }
}
