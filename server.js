const express = require('express');
const cors = require('cors');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

const app = express();
// Enable CORS so your Vercel frontend is allowed to request data
app.use(cors());

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

// 2. THE ENDPOINT: This exactly matches your frontend fetch request
app.get('/api/institutions', (req, res) => {
  if (databaseCache.length === 0) {
    return res.status(503).json({ error: "Database is warming up, please try again in a few seconds." });
  }
  res.json(databaseCache); // Instantly serve from RAM
});

// 3. HEALTH CHECK: Gives you a friendly message if you visit the base URL
app.get('/', (req, res) => {
  res.send("🚀 CHED API is Live! Access data at /api/institutions");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
