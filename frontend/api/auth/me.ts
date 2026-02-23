import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSQL } from "../lib/db.js";
import { requireAuth, AuthError } from "../lib/auth.js";
import { cors } from "../lib/cors.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (cors(req, res)) return;

  try {
    const userId = await requireAuth(req);
    const sql = getSQL();

    if (req.method === "GET") {
      const rows = await sql`
        SELECT id, email, username, is_active, is_admin,
               telegram_chat_id, telegram_notifications, web_notifications,
               watchlist, preferred_timeframes, created_at
        FROM users WHERE id = ${userId} AND is_active = true LIMIT 1
      `;
      if (rows.length === 0) {
        return res.status(401).json({ detail: "User not found or inactive" });
      }
      const u = rows[0];
      return res.status(200).json({
        id: u.id,
        email: u.email,
        username: u.username,
        is_active: u.is_active,
        is_admin: u.is_admin,
        telegram_chat_id: u.telegram_chat_id,
        telegram_notifications: u.telegram_notifications,
        web_notifications: u.web_notifications,
        watchlist: u.watchlist || [],
        preferred_timeframes: u.preferred_timeframes || [],
        created_at: u.created_at,
      });
    }

    if (req.method === "PATCH") {
      const data = req.body || {};
      const allowed = ["telegram_chat_id", "telegram_notifications", "web_notifications", "watchlist", "preferred_timeframes"];
      const sets: string[] = [];
      const values: any[] = [];

      // Build dynamic update
      for (const key of allowed) {
        if (data[key] !== undefined) {
          sets.push(key);
          values.push(data[key]);
        }
      }

      if (sets.length === 0) {
        return res.status(400).json({ detail: "No valid fields to update" });
      }

      // Use individual updates since neon tagged template doesn't support dynamic column names easily
      for (let i = 0; i < sets.length; i++) {
        const field = sets[i];
        const val = values[i];
        if (field === "telegram_chat_id") {
          await sql`UPDATE users SET telegram_chat_id = ${val} WHERE id = ${userId}`;
        } else if (field === "telegram_notifications") {
          await sql`UPDATE users SET telegram_notifications = ${val} WHERE id = ${userId}`;
        } else if (field === "web_notifications") {
          await sql`UPDATE users SET web_notifications = ${val} WHERE id = ${userId}`;
        } else if (field === "watchlist") {
          await sql`UPDATE users SET watchlist = ${JSON.stringify(val)}::jsonb WHERE id = ${userId}`;
        } else if (field === "preferred_timeframes") {
          await sql`UPDATE users SET preferred_timeframes = ${JSON.stringify(val)}::jsonb WHERE id = ${userId}`;
        }
      }

      // Re-fetch
      const rows = await sql`
        SELECT id, email, username, is_active, is_admin,
               telegram_chat_id, telegram_notifications, web_notifications,
               watchlist, preferred_timeframes, created_at
        FROM users WHERE id = ${userId} LIMIT 1
      `;
      const u = rows[0];
      return res.status(200).json({
        id: u.id,
        email: u.email,
        username: u.username,
        is_active: u.is_active,
        is_admin: u.is_admin,
        telegram_chat_id: u.telegram_chat_id,
        telegram_notifications: u.telegram_notifications,
        web_notifications: u.web_notifications,
        watchlist: u.watchlist || [],
        preferred_timeframes: u.preferred_timeframes || [],
        created_at: u.created_at,
      });
    }

    return res.status(405).json({ detail: "Method not allowed" });
  } catch (err: any) {
    if (err instanceof AuthError) {
      return res.status(401).json({ detail: err.message });
    }
    console.error("Profile error:", err);
    return res.status(500).json({ detail: "Internal server error" });
  }
}
