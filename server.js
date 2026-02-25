const express = require('express');
const cors = require('cors');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

const app = express();
app.use(cors());

// REQUIRED for receiving JSON data (like chat history) from the frontend
app.use(express.json()); 

const PORT = process.env.PORT || 3000;
let databaseCache = [];

// 1. WARM UP CACHE: Read the CSV into memory ONCE when the server boots
const csvFilePath = path.join(__dirname, 'institutions.csv');

fs.createReadStream(csvFilePath)
  .pipe(csv())
  .on('data', (data) => databaseCache.push(data))
  .on('end', () => {
    console.log(`✅ Database loaded successfully. Found ${databaseCache.length} records.`);
  })
  .on('error', (err) => {
    console.error('❌ Critical Error reading CSV file. Check if institutions.csv exists!', err);
  });

// --- NEW SECURE AI ROUTE WITH FAILSAFES ---
app.post('/api/chat', async (req, res) => {
  try {
    const { chatHistory, systemContext } = req.body;
    
    // Grabs the key securely and STRIPS HIDDEN SPACES (Crucial Fix)
    const rawApiKey = process.env.GEMINI_API_KEY;

    if (!rawApiKey) {
      console.error("No API key found in backend environment variables.");
      return res.status(500).json({ error: "Server missing API key." });
    }

    const apiKey = rawApiKey.trim();

    // Use the highly stable v1beta endpoint
    const GEMINI_MODEL = "gemini-1.5-flash";
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

    const payload = {
      contents: chatHistory,
      systemInstruction: { parts: [{ text: systemContext }] }
    };

    // Make the secure fetch to Google from the backend
    let response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    let data = await response.json();
    
    // FAILSAFE: If Google 404s the model, try the -latest suffix automatically
    if (!response.ok && response.status === 404) {
        console.warn("Standard model 404'd. Attempting fallback to -latest alias...");
        const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;
        response = await fetch(fallbackUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        data = await response.json();
    }

    // Final error check
    if (!response.ok) {
      console.error("Gemini API Error Response:", data);
      return res.status(response.status).json(data);
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "Anomaly detected in neural link.";
    
    // Send the safe response text back to the frontend
    res.json({ text });

  } catch (error) {
    console.error("Chat API Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 2. THE DATA ENDPOINT: Sends your CSV data
app.get('/api/institutions', (req, res) => {
  if (databaseCache.length === 0) {
    return res.status(503).json({ error: "Database is warming up, please try again in a few seconds." });
  }
  res.json(databaseCache); // Instantly serve from RAM
});

// 3. HEALTH CHECK
app.get('/', (req, res) => {
  res.send("🚀 CHED API is Live! Access data at /api/institutions or chat at /api/chat");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
