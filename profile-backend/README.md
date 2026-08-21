# Optionaler Profil-Dienst

Dieser kleine Cloudflare-Worker verbindet den statischen GitHub-Pages-Auftritt sicher mit Twitch und den von Streamer.bot exportierten Profilen. Die öffentliche Fibel funktioniert auch ohne ihn; nur „Mein Stallimon“ benötigt dieses Setup.

Wichtig: Twitch-Client-Secret und `STALLIMON_SYNC_SECRET` gehören niemals in GitHub, `config.js`, `wrangler.toml` oder den C#-Quelltext. Sie werden als Cloudflare-Secrets gespeichert.

Die komplette Klick-für-Klick-Anleitung steht im Hauptpaket unter `INSTALLATION_KOMPLETT_V1.0.0.md`.

Kurzablauf:

1. `npm install`
2. `npx wrangler login`
3. `npx wrangler d1 create stallimon-profile`
4. `wrangler.toml.example` als `wrangler.toml` kopieren und die nicht geheimen Werte eintragen.
5. `npm run db:remote`
6. `npx wrangler secret put TWITCH_CLIENT_SECRET`
7. `npx wrangler secret put STALLIMON_SYNC_SECRET`
8. `npm run deploy`
9. Worker-URL in `website/config.js` eintragen.
10. Dieselbe Worker-Basis-URL ohne `/api/sync` und dasselbe Sync-Secret als persistente globale Variablen `stallimon_profile_sync_url` und `stallimon_profile_sync_secret` in Streamer.bot anlegen.

Der Worker speichert nur Stallimon-Spielstände, Twitch-ID/Login/Anzeigename sowie kurzlebige Login-Sitzungen. Twitch-Passwörter und Twitch-Zugriffstokens werden nicht in D1 gespeichert.
