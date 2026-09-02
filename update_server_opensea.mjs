import fs from 'fs';
let code = fs.readFileSync('server.ts', 'utf8');

const dropEndpoint = `
  app.post("/api/opensea/drop", async (req, res) => {
    try {
      const { slug, apiKey } = req.body;
      if (!slug) return res.status(400).json({ error: "Missing slug" });
      
      const headers = { accept: "application/json" };
      if (apiKey) headers["x-api-key"] = apiKey;
      
      const response = await fetch(\`https://api.opensea.io/api/v2/drops/\${slug}\`, { headers });
      const data = await response.json();
      
      if (!response.ok) {
        return res.status(response.status).json({ error: data.errors?.[0] || data.detail || "Failed to fetch drop info from OpenSea" });
      }
      
      return res.json(data);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
`;

code = code.replace(
  'app.post("/api/simulate-mint",',
  dropEndpoint + '\n  app.post("/api/simulate-mint",'
);

fs.writeFileSync('server.ts', code);
