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

// --- CUSTOM LOCAL AI (FAILSAFE BRAIN) ---
// This acts as a backup AI if the Google API fails. It directly queries your CSV cache.
const customLocalLumina = (chatHistory, db) => {
    const lastMessage = chatHistory[chatHistory.length - 1].parts[0].text.toLowerCase();
    
    // Simple Keyword Matching Engine
    let matches = db.filter(inst => 
        (inst.NAME && inst.NAME.toLowerCase().includes(lastMessage)) || 
        (inst.CITY && inst.CITY.toLowerCase().includes(lastMessage)) ||
        (inst.REGION && inst.REGION.toLowerCase().includes(lastMessage))
    );

    if (matches.length > 0) {
        const topMatches = matches.slice(0, 5);
        let responseList = topMatches.map(m => `<b>${m.NAME}</b> in ${m.CITY} (${m.TYPE})`).join('<br/>• ');
        return `I found some matches in our local database based on your query:<br/><br/>• ${responseList}<br/><br/>How else can I assist you?`;
    }

    if (lastMessage.includes('hello') || lastMessage.includes('hi')) {
        return "Hello! I am Lumina. I am currently running on my local fallback servers. How can I help you explore Philippine universities today?";
    }

    return "I am Lumina, your custom university explorer AI. I am currently running in <b>Local Cache Mode</b> because my external neural link is unavailable. Please ask me about specific cities, regions, or university names!";
};

// --- NEW SECURE HYBRID AI ROUTE ---
app.post('/api/chat', async (req, res) => {
  try {
    const { chatHistory, systemContext } = req.body;
    
    // Grabs the key securely and STRIPS HIDDEN SPACES
    const rawApiKey = process.env.GEMINI_API_KEY;

    if (!rawApiKey) {
      console.warn("No API key found. Engaging Local Custom AI...");
      const fallbackResponse = customLocalLumina(chatHistory, databaseCache);
      return res.json({ text: fallbackResponse });
    }

    const apiKey = rawApiKey.trim();

    // Ensure proper mapping of chat history to prevent payload structure errors
    const formattedHistory = chatHistory.map(msg => ({
        role: msg.role === 'model' ? 'model' : 'user',
        parts: [{ text: msg.parts[0].text }]
    }));

    // Try multiple models in case one is restricted for the user's API Key tier
    const modelsToTry = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro"];
    let aiResponseText = null;
    let apiError = null;

    // Strict Website-Only Guardrail
    const strictContext = systemContext + " RULE: You are ONLY allowed to talk about Philippine universities, education, and the data provided. Refuse to answer questions outside of this scope.";

    for (const model of modelsToTry) {
        try {
            const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const payload = {
              contents: formattedHistory,
              systemInstruction: { parts: [{ text: strictContext }] }
            };

            const response = await fetch(API_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (response.ok && data.candidates && data.candidates.length > 0) {
                aiResponseText = data.candidates[0].content.parts[0].text;
                break; // Success! Break out of the loop
            } else {
                apiError = data.error?.message || "Unknown API Error";
                console.warn(`Model ${model} failed: ${apiError}. Trying next...`);
            }
        } catch (fetchErr) {
            console.warn(`Fetch to model ${model} failed.`, fetchErr.message);
        }
    }

    // If all Google Models failed, seamlessly trigger the Local Custom AI
    if (!aiResponseText) {
        console.error("All Google AI models failed. Engaging Local Custom AI. Last error:", apiError);
        aiResponseText = customLocalLumina(chatHistory, databaseCache);
    }
    
    // Send the safe response text back to the frontend
    res.json({ text: aiResponseText });

  } catch (error) {
    console.error("Chat API Critical Error:", error);
    // Ultimate Failsafe
    res.json({ text: "I experienced a critical system reboot. Please ask your question again." });
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
