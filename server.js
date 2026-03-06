const express = require('express');
const cors = require('cors');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

let databaseCache = [];

/* =========================================
   LOAD CSV DATABASE INTO MEMORY
========================================= */

const csvFilePath = path.join(__dirname, 'institutions.csv');

fs.createReadStream(csvFilePath)
    .pipe(csv())
    .on('data', (data) => databaseCache.push(data))
    .on('end', () => {
        console.log(`✅ Database loaded. ${databaseCache.length} universities found.`);
    })
    .on('error', (err) => {
        console.error("❌ CSV ERROR:", err);
    });


/* =========================================
   SMART UNIVERSITY SEARCH
========================================= */

function searchUniversities(query, db) {
    if (!query) return [];
    
    const q = query.toLowerCase();
    const results = db.filter(u => {
        return (
            u.NAME?.toLowerCase().includes(q) ||
            u.CITY?.toLowerCase().includes(q) ||
            u.REGION?.toLowerCase().includes(q) ||
            u.TYPE?.toLowerCase().includes(q)
        )
    });

    return results.slice(0, 10);
}


/* =========================================
   LOCAL FALLBACK AI (Upgraded)
========================================= */

function localLumina(question, matches) {
    const q = (question || "").toLowerCase();
    
    // Smart Greeting Recognition
    if (q.includes('hi') || q.includes('hello') || q.includes('hey')) {
        return "Hello! I am Lumina. I am currently running on my ultra-fast offline backup server! How can I help you explore Philippine universities today?";
    }

    if (matches.length === 0) {
        return "I am currently running in <b>Offline Cache Mode</b>. I could not find any specific universities matching that exact query. Try searching for a specific city like 'Manila' or a course like 'Nursing'.";
    }

    const list = matches.map(u =>
        `• <b>${u.NAME}</b> (${u.CITY}, ${u.REGION}) - ${u.TYPE}`
    ).join("<br/>");

    return `Here are some universities I found in my local database:<br/><br/>${list}`;
}


/* =========================================
   AI CHAT ENDPOINT
========================================= */

app.post('/api/chat', async (req, res) => {
    try {
        const { chatHistory, systemContext } = req.body;

        // Failsafe if frontend sends empty data
        if (!chatHistory || !Array.isArray(chatHistory) || chatHistory.length === 0) {
            return res.json({ text: "I didn't receive a message. Please try again." });
        }

        const userQuestion = chatHistory[chatHistory.length - 1]?.parts?.[0]?.text || "";

        /* =========================================
           SEARCH DATABASE FIRST
        ========================================= */
        const matchedUniversities = searchUniversities(userQuestion, databaseCache);

        /* =========================================
           BUILD DATABASE CONTEXT
        ========================================= */
        let universityContext = "No specific universities found for this query.";
        if (matchedUniversities.length > 0) {
            universityContext = matchedUniversities.map(u =>
                `${u.NAME} | ${u.CITY} | ${u.REGION} | ${u.TYPE}`
            ).join("\n");
        }

        /* =========================================
           GET GEMINI API KEY
        ========================================= */
        const rawApiKey = process.env.GEMINI_API_KEY;
        if (!rawApiKey) {
            console.log("⚠️ No API Key detected. Using local AI.");
            return res.json({ text: localLumina(userQuestion, matchedUniversities) });
        }
        
        const apiKey = rawApiKey.trim();

        /* =========================================
           AI PROMPT SYSTEM
        ========================================= */
        const systemPrompt = `
${systemContext || "You are Lumina AI, an expert assistant that helps students explore Philippine universities."}

Only use the university data provided below. Always format your responses cleanly using HTML tags like <b> for bolding and <br/> for line breaks. Do NOT use markdown asterisks.

University Database Results:
${universityContext}

Rules:
- Only talk about Philippine universities
- If user asks outside education, politely refuse
- Recommend universities if possible
- Be helpful for incoming college students
`;

        /* =========================================
           BULLETPROOF PAYLOAD INJECTION
           Instead of using systemInstruction (which causes 400 errors), 
           we inject the rules directly into the first user message.
        ========================================= */
        const robustHistory = [...chatHistory];
        robustHistory[0].parts[0].text = `[SYSTEM RULES:\n${systemPrompt}]\n\n--- END SYSTEM RULES ---\n\nUSER MESSAGE: ${robustHistory[0].parts[0].text}`;

        const payload = { contents: robustHistory };

        /* =========================================
           MULTI-MODEL CASCADE
           If one model 404s, it instantly tries the next one.
        ========================================= */
        const modelsToTry = [
            "gemini-2.5-flash",
            "gemini-2.0-flash",
            "gemini-1.5-flash",
            "gemini-pro"
        ];

        let aiResponseText = null;
        let lastError = null;

        for (const model of modelsToTry) {
            try {
                const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
                
                const response = await fetch(API_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });

                const data = await response.json();

                if (response.ok && data.candidates && data.candidates.length > 0) {
                    aiResponseText = data.candidates[0].content.parts[0].text;
                    console.log(`✅ Successfully used model: ${model}`);
                    break; // Success! Exit the loop.
                } else {
                    lastError = data.error?.message || JSON.stringify(data);
                    console.log(`⚠️ Model ${model} failed. Trying next... Error: ${lastError}`);
                }
            } catch (e) {
                console.log(`⚠️ Network fetch failed for ${model}. Trying next...`);
            }
        }

        // If a model worked, send it back!
        if (aiResponseText) {
            return res.json({ text: aiResponseText });
        }

        // If ALL models failed, gracefully use the Local AI
        console.log("❌ All Gemini models failed. Triggering Local AI. Last Error:", lastError);
        return res.json({
            text: localLumina(userQuestion, matchedUniversities)
        });

    } catch (err) {
        console.error("SERVER ERROR:", err);
        res.json({
            text: "Lumina AI encountered a critical system issue. Please try again."
        });
    }
});


/* =========================================
   DATA API
========================================= */

app.get('/api/institutions', (req, res) => {
    if (databaseCache.length === 0) {
        return res.status(503).json({
            error: "Database still loading"
        });
    }
    res.json(databaseCache);
});


/* =========================================
   HEALTH CHECK
========================================= */

app.get('/', (req, res) => {
    res.send("🚀 Lumina CHED API running");
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
