const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", ...extra }
});

const base64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function randomToken(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64url(new Uint8Array(digest));
}

function cors(env, request) {
  const origin = request.headers.get("Origin") || "";
  if (origin && origin === env.SITE_ORIGIN) {
    return {
      "access-control-allow-origin": origin,
      "access-control-allow-headers": "authorization, content-type, x-stallimon-sync-key",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-max-age": "86400",
      vary: "Origin"
    };
  }
  return {};
}

function safeReturnTo(raw, env) {
  try {
    const url = new URL(raw || env.SITE_ORIGIN);
    if (url.origin !== env.SITE_ORIGIN) return `${env.SITE_ORIGIN}/#mein-stallimon`;
    return url.toString();
  } catch {
    return `${env.SITE_ORIGIN}/#mein-stallimon`;
  }
}

async function handleAuth(request, env) {
  const url = new URL(request.url);
  const state = await randomToken(24);
  const returnTo = safeReturnTo(url.searchParams.get("return_to"), env);
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await env.DB.prepare("INSERT INTO oauth_states (state, return_to, expires_at) VALUES (?1, ?2, ?3)").bind(state, returnTo, expires).run();
  const auth = new URL("https://id.twitch.tv/oauth2/authorize");
  auth.searchParams.set("client_id", env.TWITCH_CLIENT_ID);
  auth.searchParams.set("redirect_uri", env.TWITCH_REDIRECT_URI);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", "openid");
  auth.searchParams.set("state", state);
  return Response.redirect(auth.toString(), 302);
}

async function handleCallback(request, env) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  const row = await env.DB.prepare("SELECT state, return_to, expires_at FROM oauth_states WHERE state = ?1").bind(state).first();
  if (!row || new Date(row.expires_at).getTime() < Date.now() || !code) return new Response("Ungültige oder abgelaufene Twitch-Anmeldung.", { status: 400 });
  await env.DB.prepare("DELETE FROM oauth_states WHERE state = ?1").bind(state).run();

  const tokenBody = new URLSearchParams({
    client_id: env.TWITCH_CLIENT_ID,
    client_secret: env.TWITCH_CLIENT_SECRET,
    code,
    grant_type: "authorization_code",
    redirect_uri: env.TWITCH_REDIRECT_URI
  });
  const tokenResponse = await fetch("https://id.twitch.tv/oauth2/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: tokenBody });
  if (!tokenResponse.ok) return new Response("Twitch konnte die Anmeldung nicht bestätigen.", { status: 502 });
  const token = await tokenResponse.json();
  const userResponse = await fetch("https://api.twitch.tv/helix/users", { headers: { Authorization: `Bearer ${token.access_token}`, "Client-Id": env.TWITCH_CLIENT_ID } });
  if (!userResponse.ok) return new Response("Twitch-Profil konnte nicht gelesen werden.", { status: 502 });
  const userPayload = await userResponse.json();
  const user = userPayload.data?.[0];
  if (!user?.id) return new Response("Kein Twitch-Benutzer gefunden.", { status: 400 });

  const session = await randomToken(32);
  const tokenHash = await sha256(session);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare("INSERT INTO sessions (token_hash, twitch_id, login, display_name, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)")
    .bind(tokenHash, user.id, user.login, user.display_name, expiresAt).run();
  const returnTo = safeReturnTo(row.return_to, env).split("#")[0];
  return Response.redirect(`${returnTo}#mein-stallimon&session=${encodeURIComponent(session)}`, 302);
}

async function sessionUser(request, env) {
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  const hash = await sha256(token);
  const row = await env.DB.prepare("SELECT token_hash, twitch_id, login, display_name, expires_at FROM sessions WHERE token_hash = ?1").bind(hash).first();
  if (!row || new Date(row.expires_at).getTime() < Date.now()) return null;
  return { row, hash };
}

async function handleMe(request, env) {
  const session = await sessionUser(request, env);
  if (!session) return json({ error: "not_authenticated" }, 401, cors(env, request));
  const profile = await env.DB.prepare("SELECT profile_json, updated_at FROM profiles WHERE twitch_id = ?1").bind(session.row.twitch_id).first();
  return json({
    user: { twitchId: session.row.twitch_id, login: session.row.login, displayName: session.row.display_name },
    profile: profile ? JSON.parse(profile.profile_json) : null,
    updatedAt: profile?.updated_at || null
  }, 200, cors(env, request));
}

async function handleLogout(request, env) {
  const session = await sessionUser(request, env);
  if (session) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?1").bind(session.hash).run();
  return json({ ok: true }, 200, cors(env, request));
}

async function handleSync(request, env) {
  const supplied = request.headers.get("X-Stallimon-Sync-Key") || "";
  if (!supplied || supplied !== env.STALLIMON_SYNC_SECRET) return json({ error: "forbidden" }, 403, cors(env, request));
  const raw = await request.text();
  if (raw.length > 300000) return json({ error: "payload_too_large" }, 413, cors(env, request));
  let payload;
  try { payload = JSON.parse(raw); } catch { return json({ error: "invalid_json" }, 400, cors(env, request)); }
  const twitchId = String(payload.twitchId || "");
  if (!/^\d+$/.test(twitchId) || !payload.profile || typeof payload.profile !== "object") return json({ error: "invalid_profile" }, 400, cors(env, request));
  const updatedAt = new Date().toISOString();
  await env.DB.prepare("INSERT INTO profiles (twitch_id, login, display_name, profile_json, updated_at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(twitch_id) DO UPDATE SET login = excluded.login, display_name = excluded.display_name, profile_json = excluded.profile_json, updated_at = excluded.updated_at")
    .bind(twitchId, String(payload.login || "").slice(0, 40), String(payload.displayName || "").slice(0, 40), JSON.stringify(payload.profile), updatedAt).run();
  return json({ ok: true, updatedAt }, 200, cors(env, request));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(env, request) });
    try {
      if (request.method === "GET" && url.pathname === "/auth/twitch") return handleAuth(request, env);
      if (request.method === "GET" && url.pathname === "/auth/callback") return handleCallback(request, env);
      if (request.method === "GET" && url.pathname === "/api/me") return handleMe(request, env);
      if (request.method === "POST" && url.pathname === "/api/logout") return handleLogout(request, env);
      if (request.method === "POST" && url.pathname === "/api/sync") return handleSync(request, env);
      if (request.method === "GET" && url.pathname === "/health") return json({ ok: true, service: "stallimon-profile" }, 200, cors(env, request));
      return json({ error: "not_found" }, 404, cors(env, request));
    } catch (error) {
      console.error(error);
      return json({ error: "internal_error" }, 500, cors(env, request));
    }
  }
};
