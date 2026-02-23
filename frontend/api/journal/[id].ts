import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSQL } from "../lib/db.js";
import { requireAuth, AuthError } from "../lib/auth.js";
import { cors } from "../lib/cors.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (cors(req, res)) return;

  try {
    const userId = await requireAuth(req);
    const sql = getSQL();
    const entryId = parseInt(String(req.query.id), 10);

    if (isNaN(entryId)) {
      return res.status(400).json({ detail: "Invalid entry ID" });
    }

    // GET - single entry
    if (req.method === "GET") {
      const rows = await sql`
        SELECT * FROM journal_entries WHERE id = ${entryId} AND user_id = ${userId} LIMIT 1
      `;
      if (rows.length === 0) return res.status(404).json({ detail: "Entry not found" });
      return res.status(200).json(rows[0]);
    }

    // PATCH - update entry
    if (req.method === "PATCH") {
      // First fetch existing
      const existing = await sql`
        SELECT * FROM journal_entries WHERE id = ${entryId} AND user_id = ${userId} LIMIT 1
      `;
      if (existing.length === 0) return res.status(404).json({ detail: "Entry not found" });

      const entry = existing[0];
      const d = req.body || {};
      const now = new Date().toISOString();

      // Auto-calculate PnL
      let pnl = d.pnl !== undefined ? d.pnl : entry.pnl;
      let pnlPercent = d.pnl_percent !== undefined ? d.pnl_percent : entry.pnl_percent;
      let status = d.status !== undefined ? d.status : entry.status;

      if (d.exit_price !== undefined && d.exit_price !== null && entry.entry_price) {
        const direction = entry.direction;
        const pnlPerShare = direction === "LONG"
          ? d.exit_price - entry.entry_price
          : entry.entry_price - d.exit_price;
        const shares = entry.shares || 1;
        const fees = d.fees !== undefined ? d.fees : (entry.fees || 0);
        pnl = (pnlPerShare * shares) - fees;
        pnlPercent = (pnlPerShare / entry.entry_price) * 100;
        if (!d.status) status = "closed";
      }

      const rows = await sql`
        UPDATE journal_entries SET
          exit_date = ${d.exit_date !== undefined ? d.exit_date : entry.exit_date},
          exit_price = ${d.exit_price !== undefined ? d.exit_price : entry.exit_price},
          shares = ${d.shares !== undefined ? d.shares : entry.shares},
          stop_loss = ${d.stop_loss !== undefined ? d.stop_loss : entry.stop_loss},
          take_profit = ${d.take_profit !== undefined ? d.take_profit : entry.take_profit},
          pnl = ${pnl},
          pnl_percent = ${pnlPercent},
          fees = ${d.fees !== undefined ? d.fees : entry.fees},
          notes = ${d.notes !== undefined ? d.notes : entry.notes},
          tags = ${d.tags !== undefined ? JSON.stringify(d.tags) : JSON.stringify(entry.tags || [])}::jsonb,
          status = ${status},
          updated_at = ${now}
        WHERE id = ${entryId} AND user_id = ${userId}
        RETURNING *
      `;

      return res.status(200).json(rows[0]);
    }

    // DELETE
    if (req.method === "DELETE") {
      const rows = await sql`
        DELETE FROM journal_entries WHERE id = ${entryId} AND user_id = ${userId} RETURNING id
      `;
      if (rows.length === 0) return res.status(404).json({ detail: "Entry not found" });
      return res.status(200).json({ status: "deleted" });
    }

    return res.status(405).json({ detail: "Method not allowed" });
  } catch (err: any) {
    if (err instanceof AuthError) return res.status(401).json({ detail: err.message });
    console.error("Journal entry error:", err);
    return res.status(500).json({ detail: "Internal server error" });
  }
}
