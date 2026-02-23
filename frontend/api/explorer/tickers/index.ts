import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSQL } from "../../lib/db.js";
import { requireAuth, AuthError } from "../../lib/auth.js";
import { cors } from "../../lib/cors.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (cors(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ detail: "Method not allowed" });

  try {
    await requireAuth(req);
    const sql = getSQL();

    const q = String(req.query.q || "");
    const exchange = req.query.exchange ? String(req.query.exchange) : null;
    const status = String(req.query.status || "all");
    const sortBy = String(req.query.sort_by || "symbol");
    const sortDir = String(req.query.sort_dir || "asc");
    const page = Math.max(parseInt(String(req.query.page || "1"), 10), 1);
    const perPage = Math.min(Math.max(parseInt(String(req.query.per_page || "50"), 10), 10), 200);
    const offset = (page - 1) * perPage;

    // Build WHERE conditions
    const conditions: string[] = [];
    if (q) {
      conditions.push(`(t.symbol ILIKE '%${q.replace(/'/g, "''")}%' OR t.name ILIKE '%${q.replace(/'/g, "''")}%' OR t.sector ILIKE '%${q.replace(/'/g, "''")}%')`);
    }
    if (exchange) {
      conditions.push(`t.exchange = '${exchange.replace(/'/g, "''")}'`);
    }
    if (status === "active") conditions.push("t.is_active = true");
    else if (status === "inactive") conditions.push("t.is_active = false");
    else if (status === "errors") conditions.push("t.error_count > 0");
    else if (status === "no_data") conditions.push("COALESCE(o.data_points, 0) = 0");

    const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

    // Sort mapping
    const sortMap: Record<string, string> = {
      symbol: "t.symbol",
      name: "t.name",
      exchange: "t.exchange",
      data_points: "COALESCE(o.data_points, 0)",
      last_updated: "t.last_updated",
      error_count: "t.error_count",
      signal_count: "COALESCE(sc.signal_count, 0)",
    };
    const sortCol = sortMap[sortBy] || "t.symbol";
    const direction = sortDir === "desc" ? "DESC" : "ASC";

    const query = `
      SELECT t.id, t.symbol, t.name, t.exchange, t.sector, t.industry,
             t.is_active, t.last_updated, t.created_at, t.error_count, t.last_error,
             COALESCE(o.data_points, 0)::int as data_points,
             o.first_date, o.last_date,
             COALESCE(sc.signal_count, 0)::int as signal_count
      FROM tickers t
      LEFT JOIN (
        SELECT ticker_id, COUNT(*)::int as data_points, MIN(date) as first_date, MAX(date) as last_date
        FROM ohlcv_daily GROUP BY ticker_id
      ) o ON t.id = o.ticker_id
      LEFT JOIN (
        SELECT ticker_id, COUNT(*)::int as signal_count FROM signals GROUP BY ticker_id
      ) sc ON t.id = sc.ticker_id
      ${whereClause}
      ORDER BY ${sortCol} ${direction}
      LIMIT ${perPage} OFFSET ${offset}
    `;

    const countQuery = `
      SELECT COUNT(*)::int as total FROM tickers t
      LEFT JOIN (
        SELECT ticker_id, COUNT(*)::int as data_points FROM ohlcv_daily GROUP BY ticker_id
      ) o ON t.id = o.ticker_id
      ${whereClause}
    `;

    const [rows, countR] = await Promise.all([sql(query), sql(countQuery)]);
    const total = countR[0].total;

    return res.status(200).json({
      tickers: rows.map((r: any) => ({
        id: r.id,
        symbol: r.symbol,
        name: r.name,
        exchange: r.exchange,
        sector: r.sector,
        industry: r.industry,
        is_active: r.is_active,
        last_updated: r.last_updated,
        created_at: r.created_at,
        error_count: r.error_count,
        last_error: r.last_error,
        data_points: r.data_points,
        first_date: r.first_date,
        last_date: r.last_date,
        signal_count: r.signal_count,
      })),
      total,
      page,
      per_page: perPage,
      total_pages: total > 0 ? Math.ceil(total / perPage) : 0,
    });
  } catch (err: any) {
    if (err instanceof AuthError) return res.status(401).json({ detail: err.message });
    console.error("Explorer tickers error:", err);
    return res.status(500).json({ detail: "Internal server error" });
  }
}
