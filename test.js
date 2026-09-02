fetch('http://localhost:3000/api/opensea/drop', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ slug: 'cool-cats' })
}).then(res => res.json()).then(console.log);
