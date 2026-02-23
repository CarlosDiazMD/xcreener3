import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSQL } from "../lib/db.js";
import { hashPassword, createToken } from "../lib/auth.js";
import { cors } from "../lib/cors.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (cors(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ detail: "Method not allowed" });
  }

  const { email, username, password } = req.body || {};

  if (!email || !username || !password) {
    return res.status(400).json({ detail: "Email, username, and password are required" });
  }
  if (username.length < 3) {
    return res.status(400).json({ detail: "Username must be at least 3 characters" });
  }
  if (password.length < 8) {
    return res.status(400).json({ detail: "Password must be at least 8 characters" });
  }

  try {
    const sql = getSQL();

    // Check existing user
    const existing = await sql`
      SELECT id FROM users WHERE email = ${email} OR username = ${username} LIMIT 1
    `;
    if (existing.length > 0) {
      return res.status(400).json({ detail: "Email or username already exists" });
    }

    const hashed = await hashPassword(password);
    const now = new Date().toISOString();

    const rows = await sql`
      INSERT INTO users (email, username, hashed_password, is_active, is_admin, telegram_notifications, web_notifications, watchlist, preferred_timeframes, created_at)
      VALUES (${email}, ${username}, ${hashed}, true, false, true, true, '[]'::jsonb, '["daily","weekly"]'::jsonb, ${now})
      RETURNING id, email, username, is_active, is_admin, telegram_chat_id, telegram_notifications, web_notifications, watchlist, preferred_timeframes, created_at
    `;

    const user = rows[0];
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
    console.error("Register error:", err);
    return res.status(500).json({ detail: "Internal server error" });
  }
}
