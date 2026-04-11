import express from "express";
import axios from "axios";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || "";

const UNIVERSE_ID = 7089993809;
const TRACKED_USERS = [
  { id: 45910908, name: "Rellsin" },
  { id: 22239380, name: "Rellbad" },
];
const POLL_INTERVAL_MS = 30000;

// --- Server state ---
const userStates = Object.fromEntries(
  TRACKED_USERS.map((u) => [
    u.id,
    { inGame: false, joinedAt: null, inStudio: false, studioJoinedAt: null },
  ])
);
let bothInGameNotified = false;
const eventLog = [];
let eventIdCounter = 0;

function addEvent(type, message) {
  const event = { id: ++eventIdCounter, type, message, time: new Date().toLocaleTimeString() };
  eventLog.push(event);
  if (eventLog.length > 200) eventLog.shift();
  console.log(`[${type}] ${message}`);
}

function formatDuration(ms) {
  if (ms == null || ms < 0) return null;
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m === 0 ? `${s}s` : `${m}m ${s}s`;
}

async function sendWebhook(embeds, label) {
  if (!DISCORD_WEBHOOK_URL) {
    addEvent("info", `No DISCORD_WEBHOOK_URL set — skipping: ${label}`);
    return;
  }
  try {
    await axios.post(DISCORD_WEBHOOK_URL, { embeds }, {
      headers: { "Content-Type": "application/json" },
    });
    addEvent("webhook", `Webhook sent: ${label}`);
  } catch (err) {
    addEvent("error", `Webhook failed: ${label} — ${err?.response?.data?.message || err.message}`);
  }
}

async function checkPresence() {
  addEvent("poll", `Polling presence for ${TRACKED_USERS.map((u) => u.name).join(", ")}...`);
  try {
    const response = await axios.post(
      "https://presence.roblox.com/v1/presence/users",
      { userIds: TRACKED_USERS.map((u) => u.id) },
      { headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" } }
    );
    const presences = response.data.userPresences || [];
    console.log("[poll result]", presences.map((p) => ({
      userId: p.userId,
      type: p.userPresenceType,
      universeId: p.universeId ?? null,
    })));
    const now = Date.now();
    const transitions = [];

    for (const presence of presences) {
      const user = TRACKED_USERS.find((u) => u.id === presence.userId);
      if (!user) continue;
      const s = userStates[user.id];

      const isInRellSeas = presence.userPresenceType === 2 && presence.universeId === UNIVERSE_ID;
      const isInStudio   = presence.userPresenceType === 3;

      // Rell Seas transitions
      if (isInRellSeas && !s.inGame) {
        transitions.push({ type: "game_join", user });
        s.inGame = true;
        s.joinedAt = now;
      } else if (!isInRellSeas && s.inGame) {
        transitions.push({ type: "game_leave", user, duration: s.joinedAt ? now - s.joinedAt : null });
        s.inGame = false;
        s.joinedAt = null;
      }

      // Studio transitions
      if (isInStudio && !s.inStudio) {
        transitions.push({ type: "studio_join", user });
        s.inStudio = true;
        s.studioJoinedAt = now;
      } else if (!isInStudio && s.inStudio) {
        transitions.push({ type: "studio_leave", user, duration: s.studioJoinedAt ? now - s.studioJoinedAt : null });
        s.inStudio = false;
        s.studioJoinedAt = null;
      }
    }

    // Both-in-game check
    const bothNow    = TRACKED_USERS.every((u) => userStates[u.id]?.inGame);
    const eitherLeft = transitions.some((t) => t.type === "game_leave");

    if (bothNow && !bothInGameNotified) {
      bothInGameNotified = true;
      addEvent("both", "🎬 BOTH Rellsin & Rellbad are in Rell Seas together!");
      await sendWebhook([{
        title: "🎬 POTENTIAL MOVIE 3 RECORDING",
        description: "Rellbad and Rellsin are in Rell Seas together",
        color: 0xf5a623,
        timestamp: new Date().toISOString(),
        footer: { text: "Rell Seas Watch" },
      }], "Both in Rell Seas");
    }
    if (eitherLeft) bothInGameNotified = false;

    // Individual transition webhooks
    for (const t of transitions) {
      const durStr     = formatDuration(t.duration);
      const profileUrl = `https://www.roblox.com/users/${t.user.id}/profile`;
      const isoNow     = new Date().toISOString();

      if (t.type === "game_join") {
        addEvent("join", `${t.user.name} joined Rell Seas!`);
        await sendWebhook([{
          title: "Player Joined Rell Seas",
          color: 0x57f287,
          fields: [
            { name: "Username", value: t.user.name, inline: true },
            { name: "Profile", value: `[View Profile](${profileUrl})`, inline: true },
          ],
          timestamp: isoNow,
          footer: { text: "Rell Seas Watch" },
        }], `${t.user.name} joined Rell Seas`);

      } else if (t.type === "game_leave") {
        const msg = durStr
          ? `${t.user.name} has left Rell Seas. Session lasted ${durStr}.`
          : `${t.user.name} has left Rell Seas.`;
        addEvent("leave", msg);
        await sendWebhook([{
          title: "Player Left Rell Seas",
          color: 0xed4245,
          fields: [
            { name: "Username", value: t.user.name, inline: true },
            ...(durStr ? [{ name: "Session Duration", value: durStr, inline: true }] : []),
          ],
          timestamp: isoNow,
          footer: { text: "Rell Seas Watch" },
        }], `${t.user.name} left Rell Seas`);

      } else if (t.type === "studio_join") {
        addEvent("studio", `${t.user.name} is in Roblox Studio 🛠️`);
        await sendWebhook([{
          title: "Player Entered Studio",
          color: 0xfee75c,
          fields: [
            { name: "Username", value: t.user.name, inline: true },
            { name: "Status", value: "is now in Roblox Studio", inline: true },
          ],
          timestamp: isoNow,
          footer: { text: "Rell Seas Watch" },
        }], `${t.user.name} entered Studio`);

      } else if (t.type === "studio_leave") {
        const msg = durStr
          ? `${t.user.name} left Studio. Session lasted ${durStr}.`
          : `${t.user.name} left Studio.`;
        addEvent("studio", msg);
        await sendWebhook([{
          title: "Player Left Studio",
          color: 0xfee75c,
          fields: [
            { name: "Username", value: t.user.name, inline: true },
            ...(durStr ? [{ name: "Session Duration", value: durStr, inline: true }] : []),
          ],
          timestamp: isoNow,
          footer: { text: "Rell Seas Watch" },
        }], `${t.user.name} left Studio`);
      }
    }
  } catch (err) {
    addEvent("error", `Presence check failed: ${err.message}`);
  }
}

// Start polling immediately, then every 30s
checkPresence();
setInterval(checkPresence, POLL_INTERVAL_MS);

// --- Express ---
app.use(express.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// API routes first — before static/catch-all
app.get("/api/health", (req, res) => {
  res.json({ ok: true, webhookSet: !!DISCORD_WEBHOOK_URL });
});

app.get("/api/status", (req, res) => {
  const status = {
    users: Object.fromEntries(
      TRACKED_USERS.map((u) => [u.id, { name: u.name, ...userStates[u.id] }])
    ),
    bothInGame: TRACKED_USERS.every((u) => userStates[u.id]?.inGame),
    webhookConfigured: !!DISCORD_WEBHOOK_URL,
    events: eventLog,
    pollIntervalMs: POLL_INTERVAL_MS,
  };
  console.log("[/api/status]", JSON.stringify({
    users: Object.fromEntries(
      TRACKED_USERS.map((u) => [u.name, { inGame: userStates[u.id].inGame, inStudio: userStates[u.id].inStudio }])
    ),
    bothInGame: status.bothInGame,
  }));
  res.json(status);
});

// Static frontend + catch-all after API routes
app.use(express.static(join(__dirname, "dist")));

app.get("*", (req, res) => {
  res.sendFile(join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Rell Seas Watch backend running on http://localhost:${PORT}`);
  console.log(`Webhook configured: ${!!DISCORD_WEBHOOK_URL}`);
});
