import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSQL } from "../lib/db.js";
import { requireAuth, AuthError } from "../lib/auth.js";
import { cors } from "../lib/cors.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (cors(req, res)) return;

  try {
    const userId = await requireAuth(req);
    const sql = getSQL();

    // GET - List entries
    if (req.method === "GET") {
      const status = req.query.status ? String(req.query.status) : null;
      const symbol = req.query.symbol ? String(req.query.symbol).toUpperCase() : null;
      const limit = Math.min(parseInt(String(req.query.limit || "50"), 10), 200);
      const offset = parseInt(String(req.query.offset || "0"), 10);

      let rows;
      if (status && symbol) {
        rows = await sql`
          SELECT * FROM journal_entries
          WHERE user_id = ${userId} AND status = ${status} AND symbol = ${symbol}
          ORDER BY entry_date DESC LIMIT ${limit} OFFSET ${offset}
        `;
      } else if (status) {
        rows = await sql`
          SELECT * FROM journal_entries
          WHERE user_id = ${userId} AND status = ${status}
          ORDER BY entry_date DESC LIMIT ${limit} OFFSET ${offset}
        `;
      } else if (symbol) {
        rows = await sql`
          SELECT * FROM journal_entries
          WHERE user_id = ${userId} AND symbol = ${symbol}
          ORDER BY entry_date DESC LIMIT ${limit} OFFSET ${offset}
        `;
      } else {
        rows = await sql`
          SELECT * FROM journal_entries
          WHERE user_id = ${userId}
          ORDER BY entry_date DESC LIMIT ${limit} OFFSET ${offset}
        `;
      }

      return res.status(200).json(rows);
    }

    // POST - Create entry
    if (req.method === "POST") {
      const d = req.body || {};
      if (!d.symbol || !d.direction || !d.entry_date || !d.entry_price) {
        return res.status(400).json({ detail: "symbol, direction, entry_date, and entry_price are required" });
      }

      const now = new Date().toISOString();
      const rows = await sql`
        INSERT INTO journal_entries (
          user_id, symbol, direction, entry_date, entry_price, shares,
          stop_loss, take_profit, timeframe, strategy, notes, tags,
          status, created_at, updated_at
        ) VALUES (
          ${userId}, ${d.symbol.toUpperCase()}, ${d.direction}, ${d.entry_date}, ${d.entry_price},
          ${d.shares || null}, ${d.stop_loss || null}, ${d.take_profit || null},
          ${d.timeframe || null}, ${d.strategy || null}, ${d.notes || null},
          ${JSON.stringify(d.tags || [])}::jsonb, 'open', ${now}, ${now}
        ) RETURNING *
      `;

      return res.status(200).json(rows[0]);
    }

    return res.status(405).json({ detail: "Method not allowed" });
  } catch (err: any) {
    if (err instanceof AuthError) return res.status(401).json({ detail: err.message });
    console.error("Journal error:", err);
    return res.status(500).json({ detail: "Internal server error" });
  }
}
