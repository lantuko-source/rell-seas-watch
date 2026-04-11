import { useState, useEffect, useRef } from "react";

const TRACKED_USERS = [
  { id: 45910908, name: "Rellsin" },
  { id: 22239380, name: "Rellbad" },
];
const STATUS_POLL_MS = 10000;

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
  if (!state) return null;
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
        inGame   ? "bg-green-400 animate-pulse"
        : inStudio ? "bg-yellow-400 animate-pulse"
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
        inGame   ? "bg-green-800 text-green-200"
        : inStudio ? "bg-yellow-800 text-yellow-200"
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

export default function App() {
  const [users, setUsers]                 = useState({});
  const [bothInGame, setBothInGame]       = useState(false);
  const [webhookOk, setWebhookOk]         = useState(false);
  const [connected, setConnected]         = useState(false);
  const [displayedEvents, setDisplayedEvents] = useState([]);
  const lastEventIdRef = useRef(0);
  const logRef = useRef(null);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch("/api/status");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        setUsers(data.users || {});
        setBothInGame(data.bothInGame || false);
        setWebhookOk(data.webhookConfigured || false);
        setConnected(true);

        // Append only new events (id > lastEventIdRef)
        const newEvents = (data.events || []).filter((e) => e.id > lastEventIdRef.current);
        if (newEvents.length > 0) {
          lastEventIdRef.current = newEvents[newEvents.length - 1].id;
          setDisplayedEvents((prev) => [...prev, ...newEvents].slice(-200));
        }
      } catch {
        setConnected(false);
      }
    }

    fetchStatus();
    const id = setInterval(fetchStatus, STATUS_POLL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [displayedEvents]);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="text-blue-400">Rell</span> Seas Watch
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Server polls Roblox every 30s — all webhooks fire server-side
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 mt-1">
          <div className={`flex items-center gap-2 text-xs ${connected ? "text-green-400" : "text-red-400"}`}>
            <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-400 animate-pulse" : "bg-red-500"}`} />
            {connected ? "Connected" : "Disconnected"}
          </div>
          <div className={`flex items-center gap-1.5 text-xs ${webhookOk ? "text-blue-400" : "text-gray-600"}`}>
            <span className={`w-2 h-2 rounded-full ${webhookOk ? "bg-blue-400" : "bg-gray-600"}`} />
            {webhookOk ? "Webhook active" : "No webhook set"}
          </div>
        </div>
      </div>

      {/* Both-in-game banner */}
      {bothInGame && <BothBanner />}

      {/* User Cards */}
      <div className="grid gap-3 mb-6">
        {TRACKED_USERS.map((user) => (
          <UserCard key={user.id} user={user} state={users[user.id]} />
        ))}
      </div>

      {/* Activity Log */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-300">Activity Log</h2>
          <button
            onClick={() => setDisplayedEvents([])}
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
          >
            Clear
          </button>
        </div>
        <div
          ref={logRef}
          className="h-72 overflow-y-auto space-y-1"
          style={{ scrollbarColor: "#374151 transparent" }}
        >
          {displayedEvents.length === 0 ? (
            <div className="text-gray-600 text-sm font-mono">
              {connected ? "No events yet — waiting for server activity." : "Connecting to server..."}
            </div>
          ) : (
            displayedEvents.map((entry) => <LogEntry key={entry.id} entry={entry} />)
          )}
        </div>
      </div>
    </div>
  );
}
