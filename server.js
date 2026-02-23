const express = require('express');
const cors = require('cors');
const fs = require('fs');
const csv = require('csv-parser');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());

let institutions = [];

// Load CSV
fs.createReadStream('institutions.csv')
  .pipe(csv())
  .on('data', (row) => {
    // CLEAN THE KEYS: Convert "INSTITUTION NAME" to "name"
    // This makes it easier for the frontend
    const cleanRow = {
      name: row['INSTITUTION NAME'] || row['Name'] || row['name'],
      type: row['INSTITUTION TYPE'] || row['Type'],
      city: row['MUNICIPALITY'] || row['City'],
      province: row['PROVINCE'] || row['Province'],
      region: row['REGION'] || row['Region'],
      website: row['WEBSITE ADDRESS'] || row['WEBSITE'] || row['Website'],
      contact: row['TELEPHONE NO'] || row['Telephone']
    };
    if (cleanRow.name) institutions.push(cleanRow);
  })
  .on('end', () => {
    console.log(`✅ Database loaded: ${institutions.length} entries.`);
  });

// Root route to check if server is alive
app.get('/', (req, res) => {
  res.send('CHED API is running. Go to /api/institutions to see data.');
});

app.get('/api/institutions', (req, res) => {
  res.json(institutions);
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
