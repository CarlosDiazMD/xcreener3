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

    const rows = await sql`
      SELECT COUNT(*)::int as total FROM alerts_sent WHERE user_id = ${userId}
    `;

    return res.status(200).json({ total: rows[0].total });
  } catch (err: any) {
    if (err instanceof AuthError) return res.status(401).json({ detail: err.message });
    console.error("Alerts count error:", err);
    return res.status(500).json({ detail: "Internal server error" });
  }
}
