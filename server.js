const express = require('express');
const fs = require('fs');
const csv = require('csv-parser');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// Allow your frontend to access this API
app.use(cors());

let institutions = [];

// 1. Load and parse the CSV as soon as the server starts
fs.createReadStream('institutions.csv') // Make sure this matches your file name
  .pipe(csv())
  .on('data', (row) => {
    // Clean up the data if needed (e.g., remove empty rows)
    institutions.push(row);
  })
  .on('end', () => {
    console.log(`✅ database loaded! Found ${institutions.length} institutions.`);
  });

// 2. Define your API Endpoint
app.get('/api/institutions', (req, res) => {
    // Optional: Add search functionality directly in the API!
    const { search } = req.query;

    if (search) {
        // Filter results if the user sent a search term
        const filtered = institutions.filter(inst => 
            inst['INSTITUTION NAME'].toLowerCase().includes(search.toLowerCase())
        );
        return res.json(filtered);
    }

    // Otherwise return everything
    res.json(institutions);
});

// 3. Start the server
app.listen(port, () => {
    console.log(`🚀 CHED API is running at http://localhost:${port}`);
});