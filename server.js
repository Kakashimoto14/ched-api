const express = require('express');
const cors = require('cors');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json()); 

let databaseCache = [];

// VERCEL FIX: Use process.cwd() for serverless environments to accurately find files
const csvFilePath = path.join(process.cwd(), 'institutions.csv');

// WARM UP CACHE
const loadDatabase = () => {
  if (databaseCache.length > 0) return; // Skip if already loaded in this function instance
  
  if (fs.existsSync(csvFilePath)) {
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('data', (data) => databaseCache.push(data))
      .on('end', () => console.log(`✅ DB loaded: ${databaseCache.length} records.`))
      .on('error', (err) => console.error('❌ CSV Error!', err));
  } else {
    console.error(`❌ CSV not found at: ${csvFilePath}`);
  }
};

// Trigger load immediately
loadDatabase();

app.post('/api/chat', async (req, res) => {
  try {
    const { chatHistory, systemContext } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("No API key found.");
      return res.status(500).json({ error: "Server missing API key." });
    }

    const GEMINI_MODEL = "gemini-2.5-flash";
    const API_URL = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

    const payload = {
      contents: [
        { role: "user", parts: [{ text: systemContext }] },
        ...chatHistory
      ]
    };

    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error("Gemini API Error:", data);
      return res.status(response.status).json(data);
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "Anomaly detected in neural link.";
    res.json({ text });

  } catch (error) {
    console.error("Chat API Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get('/api/institutions', (req, res) => {
  if (databaseCache.length === 0) {
    loadDatabase(); // Try loading again if it was a cold start
    return res.status(503).json({ error: "Database warming up, try again in 2 seconds." });
  }
  res.json(databaseCache);
});

app.get('/', (req, res) => {
  res.send("🚀 CHED API is Live on Vercel!");
});

// VERCEL FIX: Do not run app.listen() in Vercel production
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running locally on port ${PORT}`);
  });
}

// VERCEL CRITICAL FIX: Export the app
module.exports = app;
