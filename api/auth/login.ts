import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSQL } from "../lib/db.js";
import { verifyPassword, createToken } from "../lib/auth.js";
import { cors } from "../lib/cors.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (cors(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ detail: "Method not allowed" });
  }

  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ detail: "Username and password are required" });
  }

  try {
    const sql = getSQL();

    const rows = await sql`
      SELECT id, email, username, hashed_password, is_active, is_admin,
             telegram_chat_id, telegram_notifications, web_notifications,
             watchlist, preferred_timeframes, created_at
      FROM users WHERE username = ${username} LIMIT 1
    `;

    if (rows.length === 0) {
      return res.status(401).json({ detail: "Invalid credentials" });
    }

    const user = rows[0];

    const valid = await verifyPassword(password, user.hashed_password);
    if (!valid) {
      return res.status(401).json({ detail: "Invalid credentials" });
    }

    if (!user.is_active) {
      return res.status(403).json({ detail: "Account disabled" });
    }

    // Update last_login
    await sql`UPDATE users SET last_login = ${new Date().toISOString()} WHERE id = ${user.id}`;

    const token = await createToken(user.id, user.username);

    return res.status(200).json({
      access_token: token,
      token_type: "bearer",
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        is_active: user.is_active,
        is_admin: user.is_admin,
        telegram_chat_id: user.telegram_chat_id,
        telegram_notifications: user.telegram_notifications,
        web_notifications: user.web_notifications,
        watchlist: user.watchlist || [],
        preferred_timeframes: user.preferred_timeframes || ["daily", "weekly"],
        created_at: user.created_at,
      },
    });
  } catch (err: any) {
    console.error("Login error:", err);
    return res.status(500).json({ detail: "Internal server error" });
  }
}
