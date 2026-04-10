import { useState, useEffect, useRef, useCallback } from "react";

const UNIVERSE_ID = 7089993809;
const TRACKED_USERS = [
  { id: 45910908, name: "Rellsin" },
  { id: 22239380, name: "Rellbad" },
];
const POLL_INTERVAL_MS = 30000;

function maskUrl(url) {
  if (!url) return "";
  return url.length > 30 ? url.slice(0, 30) + "•••" : url;
}

function ts() {
  return new Date().toLocaleTimeString();
}

function formatDuration(ms) {
  if (ms == null || ms < 0) return null;
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m === 0 ? `${s}s` : `${m}m ${s}s`;
}

const LOG_COLORS = {
  info:    "text-gray-400",
  join:    "text-green-400",
  leave:   "text-red-400",
  studio:  "text-yellow-400",
  both:    "text-yellow-300",
  webhook: "text-blue-400",
  error:   "text-red-500",
  poll:    "text-gray-500",
};

function LogEntry({ entry }) {
  return (
    <div className={`text-sm font-mono ${LOG_COLORS[entry.type] || "text-gray-400"}`}>
      <span className="text-gray-600">[{entry.time}]</span> {entry.message}
    </div>
  );
}

function UserCard({ user, state }) {
  const { inGame, inStudio } = state;
  return (
    <div className={`rounded-xl border p-4 flex items-center gap-4 transition-all duration-500 ${
      inGame
        ? "border-green-500 bg-green-950/40 shadow-green-900/30 shadow-lg"
        : inStudio
        ? "border-yellow-500 bg-yellow-950/30 shadow-yellow-900/20 shadow-lg"
        : "border-gray-700 bg-gray-900"
    }`}>
      <div className={`w-3 h-3 rounded-full flex-shrink-0 transition-colors duration-500 ${
        inGame
          ? "bg-green-400 shadow-sm animate-pulse"
          : inStudio
          ? "bg-yellow-400 shadow-sm animate-pulse"
          : "bg-gray-600"
      }`} />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-base">{user.name}</div>
        <a
          href={`https://www.roblox.com/users/${user.id}/profile`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-500 hover:text-blue-400 transition-colors"
        >
          roblox.com/users/{user.id}
        </a>
      </div>
      <div className={`text-xs font-medium px-2 py-1 rounded-full ${
        inGame
          ? "bg-green-800 text-green-200"
          : inStudio
          ? "bg-yellow-800 text-yellow-200"
          : "bg-gray-800 text-gray-400"
      }`}>
        {inGame ? "In Rell Seas" : inStudio ? "In Studio 🛠️" : "Offline"}
      </div>
    </div>
  );
}

function BothBanner() {
  return (
    <div className="w-full rounded-xl border-2 border-yellow-400 bg-yellow-950/60 px-5 py-6 mb-6 text-center animate-pulse">
      <p className="text-yellow-300 font-black text-xl md:text-2xl tracking-wide leading-snug">
        🎬 POTENTIAL MOVIE 3 RECORDING — RELLBAD &amp; RELLSIN ARE IN RELL SEAS TOGETHER 🎬
      </p>
    </div>
  );
}

const initUserState = () =>
  Object.fromEntries(
    TRACKED_USERS.map((u) => [
      u.id,
      {
        inGame: false,
        joinedAt: null,
        inStudio: false,
        studioJoinedAt: null,
      },
    ])
  );

export default function App() {
  const [polling, setPolling] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState(() => localStorage.getItem("webhookUrl") || "");
  const [webhookInput, setWebhookInput] = useState(() => localStorage.getItem("webhookUrl") || "");
  const [log, setLog] = useState([]);
  const [userStates, setUserStates] = useState(initUserState);
  const [bothInGameNotified, setBothInGameNotified] = useState(false);
  const [showBothBanner, setShowBothBanner] = useState(false);

  const intervalRef = useRef(null);
  const logRef = useRef(null);
  // Refs so checkPresence always reads fresh values without stale closures
  const userStatesRef = useRef(userStates);
  const bothInGameNotifiedRef = useRef(bothInGameNotified);
  const webhookUrlRef = useRef(webhookUrl);

  useEffect(() => { userStatesRef.current = userStates; }, [userStates]);
  useEffect(() => { bothInGameNotifiedRef.current = bothInGameNotified; }, [bothInGameNotified]);
  useEffect(() => { webhookUrlRef.current = webhookUrl; }, [webhookUrl]);

  const addLog = useCallback((type, message) => {
    setLog((prev) => [...prev.slice(-199), { type, message, time: ts() }]);
  }, []);

  const sendWebhook = useCallback((embeds, label) => {
    const wh = webhookUrlRef.current;
    if (!wh) return;
    addLog("webhook", `Sending webhook: ${label}`);
    fetch("/api/send-webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webhookUrl: wh, embeds }),
    })
      .then((r) => {
        if (r.ok) addLog("webhook", `Webhook sent: ${label}`);
        else addLog("error", `Webhook failed: ${label} (HTTP ${r.status})`);
      })
      .catch((e) => addLog("error", `Webhook error: ${label} — ${e.message}`));
  }, [addLog]);

  const checkPresence = useCallback(async () => {
    addLog("poll", `Polling presence for ${TRACKED_USERS.map((u) => u.name).join(", ")}...`);
    try {
      const res = await fetch("/api/check-presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: TRACKED_USERS.map((u) => u.id) }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const presences = data.userPresences || [];
      const now = Date.now();
      const prev = userStatesRef.current;

      // Compute next state and collect transitions
      const next = { ...prev };
      const transitions = [];

      for (const presence of presences) {
        const user = TRACKED_USERS.find((u) => u.id === presence.userId);
        if (!user) continue;
        const p = prev[user.id];

        const isInRellSeas = presence.userPresenceType === 2 && presence.universeId === UNIVERSE_ID;
        const isInStudio   = presence.userPresenceType === 3;

        const entry = { ...p };

        // --- Rell Seas ---
        if (isInRellSeas && !p.inGame) {
          entry.inGame = true;
          entry.joinedAt = now;
          transitions.push({ type: "game_join", user });
        } else if (!isInRellSeas && p.inGame) {
          entry.inGame = false;
          transitions.push({ type: "game_leave", user, duration: p.joinedAt ? now - p.joinedAt : null });
          entry.joinedAt = null;
        }

        // --- Studio ---
        if (isInStudio && !p.inStudio) {
          entry.inStudio = true;
          entry.studioJoinedAt = now;
          transitions.push({ type: "studio_join", user });
        } else if (!isInStudio && p.inStudio) {
          entry.inStudio = false;
          transitions.push({ type: "studio_leave", user, duration: p.studioJoinedAt ? now - p.studioJoinedAt : null });
          entry.studioJoinedAt = null;
        }

        next[user.id] = entry;
      }

      setUserStates(next);

      // --- Both-in-game banner & webhook ---
      const bothNow = TRACKED_USERS.every((u) => next[u.id]?.inGame);
      const eitherLeft = transitions.some((t) => t.type === "game_leave");

      if (bothNow && !bothInGameNotifiedRef.current) {
        setBothInGameNotified(true);
        setShowBothBanner(true);
        addLog("both", "🎬 BOTH Rellsin & Rellbad are in Rell Seas together!");
        sendWebhook(
          [{
            title: "🎬 POTENTIAL MOVIE 3 RECORDING",
            description: "Rellbad and Rellsin are in Rell Seas together",
            color: 0xf5a623,
            timestamp: new Date().toISOString(),
            footer: { text: "Rell Seas Watch" },
          }],
          "Both in Rell Seas"
        );
      }
      if (eitherLeft) {
        setBothInGameNotified(false);
        setShowBothBanner(false);
      }

      // --- Process individual transitions ---
      for (const t of transitions) {
        const durStr = formatDuration(t.duration);
        const profileUrl = `https://www.roblox.com/users/${t.user.id}/profile`;
        const isoNow = new Date().toISOString();

        if (t.type === "game_join") {
          addLog("join", `${t.user.name} joined Rell Seas!`);
          sendWebhook(
            [{
              title: "Player Joined Rell Seas",
              color: 0x57f287,
              fields: [
                { name: "Username", value: t.user.name, inline: true },
                { name: "Profile", value: `[View Profile](${profileUrl})`, inline: true },
              ],
              timestamp: isoNow,
              footer: { text: "Rell Seas Watch" },
            }],
            `${t.user.name} joined Rell Seas`
          );
        } else if (t.type === "game_leave") {
          const msg = durStr
            ? `${t.user.name} has left Rell Seas. Session lasted ${durStr}.`
            : `${t.user.name} has left Rell Seas.`;
          addLog("leave", msg);
          sendWebhook(
            [{
              title: "Player Left Rell Seas",
              color: 0xed4245,
              fields: [
                { name: "Username", value: t.user.name, inline: true },
                ...(durStr ? [{ name: "Session Duration", value: durStr, inline: true }] : []),
              ],
              timestamp: isoNow,
              footer: { text: "Rell Seas Watch" },
            }],
            `${t.user.name} left Rell Seas`
          );
        } else if (t.type === "studio_join") {
          addLog("studio", `${t.user.name} is in Roblox Studio 🛠️`);
          sendWebhook(
            [{
              title: "Player Entered Studio",
              color: 0xfee75c,
              fields: [
                { name: "Username", value: t.user.name, inline: true },
                { name: "Status", value: "is now in Roblox Studio", inline: true },
              ],
              timestamp: isoNow,
              footer: { text: "Rell Seas Watch" },
            }],
            `${t.user.name} entered Studio`
          );
        } else if (t.type === "studio_leave") {
          const msg = durStr
            ? `${t.user.name} left Studio. Session lasted ${durStr}.`
            : `${t.user.name} left Studio.`;
          addLog("studio", msg);
          sendWebhook(
            [{
              title: "Player Left Studio",
              color: 0xfee75c,
              fields: [
                { name: "Username", value: t.user.name, inline: true },
                ...(durStr ? [{ name: "Session Duration", value: durStr, inline: true }] : []),
              ],
              timestamp: isoNow,
              footer: { text: "Rell Seas Watch" },
            }],
            `${t.user.name} left Studio`
          );
        }
      }
    } catch (err) {
      addLog("error", `Presence check failed: ${err.message}`);
    }
  }, [addLog, sendWebhook]);

  const checkPresenceRef = useRef(checkPresence);
  useEffect(() => { checkPresenceRef.current = checkPresence; }, [checkPresence]);

  useEffect(() => {
    if (polling) {
      addLog("info", "Polling started.");
      checkPresenceRef.current();
      intervalRef.current = setInterval(() => checkPresenceRef.current(), POLL_INTERVAL_MS);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        addLog("info", "Polling stopped.");
      }
    }
    return () => clearInterval(intervalRef.current);
  }, [polling, addLog]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  const saveWebhook = () => {
    const trimmed = webhookInput.trim();
    setWebhookUrl(trimmed);
    localStorage.setItem("webhookUrl", trimmed);
    addLog("info", trimmed ? `Webhook URL saved (${maskUrl(trimmed)}).` : "Webhook URL cleared.");
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          <span className="text-blue-400">Rell</span> Seas Watch
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Monitors Rellsin &amp; Rellbad for Rell Seas activity — Universe {UNIVERSE_ID}
        </p>
      </div>

      {/* Both-in-game banner */}
      {showBothBanner && <BothBanner />}

      {/* User Cards */}
      <div className="grid gap-3 mb-6">
        {TRACKED_USERS.map((user) => (
          <UserCard key={user.id} user={user} state={userStates[user.id]} />
        ))}
      </div>

      {/* Poll Control */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => setPolling((p) => !p)}
          className={`px-6 py-2.5 rounded-lg font-semibold text-sm transition-all duration-200 ${
            polling ? "bg-red-600 hover:bg-red-700 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"
          }`}
        >
          {polling ? "Stop Polling" : "Start Polling"}
        </button>
        <div className={`flex items-center gap-2 text-sm ${polling ? "text-green-400" : "text-gray-500"}`}>
          <span className={`inline-block w-2 h-2 rounded-full ${polling ? "bg-green-400 animate-pulse" : "bg-gray-600"}`} />
          {polling ? `Active — every ${POLL_INTERVAL_MS / 1000}s` : "Idle"}
        </div>
      </div>

      {/* Webhook Settings */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
        <h2 className="text-sm font-semibold text-gray-300 mb-3">Discord Webhook</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={webhookInput}
            onChange={(e) => setWebhookInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveWebhook()}
            placeholder="https://discord.com/api/webhooks/..."
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
          />
          <button
            onClick={saveWebhook}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
          >
            Save
          </button>
        </div>
        {webhookUrl && (
          <p className="mt-2 text-xs text-gray-500">
            Active: <span className="text-gray-400 font-mono">{maskUrl(webhookUrl)}</span>
          </p>
        )}
      </div>

      {/* Activity Log */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-300">Activity Log</h2>
          <button
            onClick={() => setLog([])}
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
          >
            Clear
          </button>
        </div>
        <div
          ref={logRef}
          className="h-64 overflow-y-auto space-y-1"
          style={{ scrollbarColor: "#374151 transparent" }}
        >
          {log.length === 0 ? (
            <div className="text-gray-600 text-sm font-mono">No events yet. Start polling to begin.</div>
          ) : (
            log.map((entry, i) => <LogEntry key={i} entry={entry} />)
          )}
        </div>
      </div>
    </div>
  );
}
