// server.js
require("dotenv").config();
const express = require("express"); // **FIXED: Removed duplicate 'express' import**
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
// Use dynamic import for node-fetch to work in a CJS module (as you correctly have)
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args)); 

const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, "uploads");
const PUBLIC_DIR = path.join(__dirname, "public");

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(PUBLIC_DIR));
app.use("/uploads", express.static(UPLOAD_DIR));

// Multer storage (Remains the same)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const name = Date.now() + "-" + Math.random().toString(36).slice(2, 9) + ext;
        cb(null, name);
    },
});
const upload = multer({ storage });

// SQLite database (Remains the same)
const db = new sqlite3.Database(path.join(__dirname, "db.sqlite"), (err) => {
    if (err) return console.error("DB open error:", err);
    console.log("SQLite DB opened.");
});
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS issues (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT,
        originalname TEXT,
        description TEXT,
        category TEXT,
        lat REAL,
        lon REAL,
        created_at DATETIME DEFAULT (datetime('now','localtime')),
        status TEXT DEFAULT 'Pending'
    )`);
});

// API: Submit new report (Remains the same)
app.post("/api/report", upload.single("image"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Image is required" });

    const { description, category, lat, lon } = req.body;
    const stmt = db.prepare(
        `INSERT INTO issues (filename, originalname, description, category, lat, lon)
         VALUES (?, ?, ?, ?, ?, ?)`
    );
    stmt.run(
        req.file.filename,
        req.file.originalname || null,
        description || null,
        category || null,
        lat ? Number(lat) : null,
        lon ? Number(lon) : null,
        function (err) {
            if (err) return res.status(500).json({ error: "DB insert failed" });
            const ticketId = "TC-" + (10000 + this.lastID);
            res.json({
                success: true,
                id: this.lastID,
                ticketId,
                imageUrl: "/uploads/" + req.file.filename,
            });
        }
    );
    stmt.finalize();
});

// API: List all reports (Remains the same)
app.get("/api/reports", (req, res) => {
    db.all("SELECT * FROM issues ORDER BY created_at DESC", (err, rows) => {
        if (err) return res.status(500).json({ error: "DB error" });
        res.json(rows);
    });
});

// API: Count (Remains the same)
app.get("/api/count", (req, res) => {
    db.get("SELECT COUNT(*) AS count FROM issues", (err, row) => {
        if (err) return res.status(500).json({ error: "DB error" });
        res.json({ count: row.count });
    });
});

// 💡 NEW FUNCTION: Custom/Canned Responses
function getCustomReply(message) {
    const lowerMsg = message.toLowerCase();

    // Custom Response 1: Greeting/Hello
    if (lowerMsg.includes("hello") || lowerMsg.includes("hi") || lowerMsg.includes("hey")) {
        return "👋 Hello! I'm your Civic Assistant. How can I help you report an issue today?";
    }
    
    // Custom Response 2: Report Status
    if (lowerMsg.includes("status") || lowerMsg.includes("track")) {
        return "To check the status of a report, please use the **Admin Dashboard** link in the navigation bar. You will need the Ticket ID to track it!";
    }

    // Custom Response 3: Thank You
    if (lowerMsg.includes("thank you") || lowerMsg.includes("thanks")) {
        return "You're very welcome! Thank you for helping keep our community clean and safe. Is there anything else I can assist with?";
    }

    // Custom Response 4: Emergency/Police
    if (lowerMsg.includes("emergency") || lowerMsg.includes("police")) {
        return "🚨 **If this is an emergency, please call 100 immediately.** This platform is for non-urgent civic reports.";
    }

    // If no custom match, return null to proceed to AI
    return null;
}

// === AI Chat Endpoint (Gemini) ===
// === AI Chat Endpoint (Gemini) ===
app.post("/api/chat", async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "Message required" });

  // System instruction for chatbot persona
  const systemInstruction = "You are a helpful and polite Civic AI Assistant for the JanMitra platform. Keep answers brief and encouraging.";

  // Properly formatted URL with API key
  const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

  try {
    const geminiRes = await fetch(GEMINI_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemInstruction }]
        },
        contents: [
          {
            parts: [{ text: message }]
          }
        ]
      }),
    });

    const data = await geminiRes.json();

    if (data.error) {
      console.error("Gemini API Error:", data.error);
      return res.status(data.error.code || 500).json({
        error: data.error.message || "Gemini API request failed."
      });
    }

    const reply =
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      "⚠ No reply received from the AI model.";

    res.json({ reply });
  } catch (err) {
    console.error("Gemini API connection error:", err);
    res.status(500).json({ error: "Failed to connect to Gemini API." });
  }
});



// Start server
app.listen(PORT, () => {
    console.log(`✅ Server running at http://localhost:${PORT}`);
});