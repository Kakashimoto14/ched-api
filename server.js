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

function searchUniversities(query, db){

    const q = query.toLowerCase();

    const results = db.filter(u => {

        return (
            u.NAME?.toLowerCase().includes(q) ||
            u.CITY?.toLowerCase().includes(q) ||
            u.REGION?.toLowerCase().includes(q) ||
            u.TYPE?.toLowerCase().includes(q)
        )

    })

    return results.slice(0,10);
}


/* =========================================
   LOCAL FALLBACK AI
========================================= */

function localLumina(question, matches){

    if(matches.length === 0){
        return "I could not find any universities related to your search in the database.";
    }

    const list = matches.map(u =>
        `• ${u.NAME} (${u.CITY}, ${u.REGION}) - ${u.TYPE}`
    ).join("\n")

    return `Here are universities related to your search:\n\n${list}`
}


/* =========================================
   AI CHAT ENDPOINT
========================================= */

app.post('/api/chat', async (req,res)=>{

try{

const { chatHistory } = req.body;

const userQuestion =
chatHistory[chatHistory.length - 1]?.parts?.[0]?.text || "";


/* =========================================
   SEARCH DATABASE FIRST
========================================= */

const matchedUniversities =
searchUniversities(userQuestion, databaseCache);


/* =========================================
   BUILD DATABASE CONTEXT
========================================= */

let universityContext = "No universities found.";

if(matchedUniversities.length > 0){

universityContext =
matchedUniversities.map(u =>
`${u.NAME} | ${u.CITY} | ${u.REGION} | ${u.TYPE}`
).join("\n")

}


/* =========================================
   GET GEMINI API KEY
========================================= */

const apiKey = process.env.GEMINI_API_KEY;

if(!apiKey){

console.log("⚠️ No API Key detected. Using local AI.");

return res.json({
text: localLumina(userQuestion, matchedUniversities)
})

}


/* =========================================
   AI PROMPT SYSTEM
========================================= */

const systemPrompt = `
You are Lumina AI, an expert assistant that helps students explore Philippine universities.

Only use the university data provided below.

University Database Results:
${universityContext}

Rules:
- Only talk about Philippine universities
- If user asks outside education, politely refuse
- Recommend universities if possible
- Be helpful for incoming college students
`;


/* =========================================
   CALL GEMINI API
========================================= */

const API_URL =
`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;


const payload = {

contents: [
{
role: "user",
parts: [{ text: userQuestion }]
}
],

systemInstruction: {
parts: [{ text: systemPrompt }]
}

};


const response = await fetch(API_URL,{
method:"POST",
headers:{
"Content-Type":"application/json"
},
body: JSON.stringify(payload)
});


const data = await response.json();

if(response.ok){

const text =
data.candidates?.[0]?.content?.parts?.[0]?.text;

return res.json({text});

}


console.log("⚠️ Gemini failed. Using local AI.");

return res.json({
text: localLumina(userQuestion, matchedUniversities)
})

}catch(err){

console.error("SERVER ERROR:",err);

res.json({
text:"Lumina AI encountered a system issue. Please try again."
})

}

});


/* =========================================
   DATA API
========================================= */

app.get('/api/institutions',(req,res)=>{

if(databaseCache.length === 0){

return res.status(503).json({
error:"Database still loading"
})

}

res.json(databaseCache);

});


/* =========================================
   HEALTH CHECK
========================================= */

app.get('/',(req,res)=>{

res.send("🚀 Lumina CHED API running")

})


app.listen(PORT,()=>{

console.log(`🚀 Server running on port ${PORT}`)

})
