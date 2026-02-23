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
    const symbol = String(req.query.symbol).toUpperCase();

    // Fetch ticker
    const tickerR = await sql`SELECT * FROM tickers WHERE symbol = ${symbol} LIMIT 1`;
    if (tickerR.length === 0) {
      return res.status(404).json({ detail: `Ticker ${symbol} not found` });
    }
    const ticker = tickerR[0];

    // Fetch OHLCV stats, recent data, and signals in parallel
    const [statsR, recentR, signalsR, qualityR] = await Promise.all([
      sql`
        SELECT COUNT(*)::int as total_records, MIN(date) as first_date, MAX(date) as last_date,
               AVG(volume)::float as avg_volume, MIN(close)::float as min_close, MAX(close)::float as max_close
        FROM ohlcv_daily WHERE ticker_id = ${ticker.id}
      `,
      sql`
        SELECT date, open, high, low, close, volume, adj_close
        FROM ohlcv_daily WHERE ticker_id = ${ticker.id}
        ORDER BY date DESC LIMIT 30
      `,
      sql`
        SELECT signal_type, timeframe, signal_date, price_at_signal as price,
               rsi_value as rsi, squeeze_momentum as momentum, squeeze_on
        FROM signals WHERE ticker_id = ${ticker.id}
        ORDER BY signal_date DESC LIMIT 20
      `,
      // Quality checks
      Promise.all([
        sql`SELECT COUNT(*)::int as c FROM ohlcv_daily WHERE ticker_id = ${ticker.id} AND (close <= 0 OR open <= 0 OR high <= 0 OR low <= 0)`,
        sql`SELECT COUNT(*)::int as c FROM ohlcv_daily WHERE ticker_id = ${ticker.id} AND high < low`,
        sql`SELECT COUNT(*)::int as c FROM ohlcv_daily WHERE ticker_id = ${ticker.id} AND (close > high OR close < low)`,
        sql`SELECT COUNT(*)::int as c FROM ohlcv_daily WHERE ticker_id = ${ticker.id} AND (volume IS NULL OR volume = 0)`,
      ]),
    ]);

    const stats = statsR[0];
    const [badPrices, hlViolation, clViolation, zeroVolume] = qualityR;

    // Quality score
    let score = 100;
    const issues: string[] = [];

    if (stats.total_records === 0) {
      score = 0;
      issues.push("No OHLCV data available");
    } else {
      if (badPrices[0].c > 0) { issues.push(`${badPrices[0].c} records with zero/negative prices`); score -= 20; }
      if (hlViolation[0].c > 0) { issues.push(`${hlViolation[0].c} records where High < Low`); score -= 25; }
      if (clViolation[0].c > 0) { issues.push(`${clViolation[0].c} records where Close outside High-Low range`); score -= 15; }
      if (zeroVolume[0].c > stats.total_records * 0.1) {
        issues.push(`${zeroVolume[0].c}/${stats.total_records} records with zero/null volume`);
        score -= 10;
      }
    }
    if (issues.length === 0) issues.push("All quality checks passed");
    score = Math.max(score, 0);

    return res.status(200).json({
      ticker: {
        id: ticker.id,
        symbol: ticker.symbol,
        name: ticker.name,
        exchange: ticker.exchange,
        sector: ticker.sector,
        industry: ticker.industry,
        is_active: ticker.is_active,
        last_updated: ticker.last_updated,
        created_at: ticker.created_at,
        error_count: ticker.error_count,
        last_error: ticker.last_error,
      },
      data_stats: {
        total_records: stats.total_records,
        first_date: stats.first_date,
        last_date: stats.last_date,
        avg_volume: stats.avg_volume ? Math.round(stats.avg_volume * 100) / 100 : null,
        min_close: stats.min_close ? Math.round(stats.min_close * 10000) / 10000 : null,
        max_close: stats.max_close ? Math.round(stats.max_close * 10000) / 10000 : null,
      },
      quality: { has_data: stats.total_records > 0, issues, score },
      recent_ohlcv: recentR.map((r: any) => ({
        date: r.date,
        open: Math.round(r.open * 10000) / 10000,
        high: Math.round(r.high * 10000) / 10000,
        low: Math.round(r.low * 10000) / 10000,
        close: Math.round(r.close * 10000) / 10000,
        volume: r.volume,
        adj_close: r.adj_close ? Math.round(r.adj_close * 10000) / 10000 : null,
      })),
      signals: signalsR,
    });
  } catch (err: any) {
    if (err instanceof AuthError) return res.status(401).json({ detail: err.message });
    console.error("Ticker detail error:", err);
    return res.status(500).json({ detail: "Internal server error" });
  }
}
