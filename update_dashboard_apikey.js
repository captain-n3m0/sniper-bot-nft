import fs from 'fs';
let code = fs.readFileSync('src/pages/Dashboard.tsx', 'utf8');

// Add apiKey to state
code = code.replace(
  "const [form, setForm] = useState({",
  "const [form, setForm] = useState({\n    apiKey: '',"
);

// Add apiKey to payload
code = code.replace(
  "chain: selectedChain,",
  "chain: selectedChain,\n          apiKey: form.apiKey,"
);

// Add input field below Quantity
const replacement = `
                <div>
                  <label className="mb-2 block text-xs font-mono uppercase tracking-widest text-neutral-500">RPC API Key or Full Custom Node URL (Optional)</label>
                  <input 
                    type="text" 
                    value={form.apiKey}
                    onChange={(e) => setForm({...form, apiKey: e.target.value})}
                    className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 font-mono text-sm text-neutral-300 outline-none focus:border-synapse-cyan/50 focus:bg-white/5 transition-colors"
                    placeholder="Alchemy API Key or https://..."
                  />
                  <p className="mt-2 text-xs text-neutral-500">Bypasses public rate-limits. Strongly recommended for high-competition mints.</p>
                </div>

                <div className="pt-4 border-t border-white/5">
`;
code = code.replace('<div className="pt-4 border-t border-white/5">', replacement);

fs.writeFileSync('src/pages/Dashboard.tsx', code);
