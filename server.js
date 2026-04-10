import express from "express";
import axios from "axios";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(express.static(join(__dirname, "dist")));
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.post("/api/check-presence", async (req, res) => {
  const { userIds } = req.body;
  try {
    const response = await axios.post(
      "https://presence.roblox.com/v1/presence/users",
      { userIds },
      {
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0",
        },
      }
    );
    res.json(response.data);
  } catch (err) {
    console.error("[presence error]", err?.response?.data || err.message);
    res.status(500).json({ error: "Failed to fetch presence", detail: err?.response?.data || err.message });
  }
});

app.post("/api/send-webhook", async (req, res) => {
  const { webhookUrl, embeds } = req.body;
  if (!webhookUrl) return res.status(400).json({ error: "No webhook URL" });
  if (!Array.isArray(embeds) || embeds.length === 0) return res.status(400).json({ error: "No embeds provided" });

  try {
    await axios.post(webhookUrl, { embeds }, {
      headers: { "Content-Type": "application/json" },
    });
    res.json({ success: true });
  } catch (err) {
    console.error("[webhook error]", err?.response?.data || err.message);
    res.status(500).json({ error: "Failed to send webhook", detail: err?.response?.data || err.message });
  }
});

app.get("*", (req, res) => {
  res.sendFile(join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Rell Seas Watch backend running on http://localhost:${PORT}`);
});
