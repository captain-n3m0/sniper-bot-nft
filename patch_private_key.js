import fs from 'fs';

let code = fs.readFileSync('src/pages/Dashboard.tsx', 'utf8');

const regex = /<div className="pt-4 border-t border-white\/5">\s*<label className="mb-2 flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-neutral-500">\s*<Shield size=\{14\} className="text-yellow-500" \/>\s*Wallet Private Key \(Optional for auto-broadcast\)\s*<\/label>\s*<input[^>]+>\s*<p className="mt-2 text-xs text-neutral-500">If left blank, the sniper will only generate and return the calldata.<\/p>\s*<\/div>/g;

const replacement = `
                <div className="pt-4 border-t border-white/5">
                  <div className="mb-2 flex items-center justify-between text-xs font-mono uppercase tracking-widest text-neutral-500">
                    <label className="flex items-center gap-2">
                      <Shield size={14} className="text-yellow-500" />
                      Execution Wallets
                    </label>
                    <div className="flex gap-3">
                      <button type="button" onClick={() => setSelectedSniperWallets(new Set(wallets.map(w => w.id)))} className="text-synapse-cyan hover:underline">All</button>
                      <button type="button" onClick={() => setSelectedSniperWallets(new Set())} className="hover:underline">Clear</button>
                    </div>
                  </div>
                  
                  {wallets.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/10 py-6 text-center opacity-50">
                      <p className="text-xs text-neutral-400">No wallets imported. Sniper will run in dry-run mode (calldata only).</p>
                    </div>
                  ) : (
                    <div className="max-h-[160px] space-y-2 overflow-y-auto pr-2 custom-scrollbar">
                      {wallets.map(wallet => {
                        const isSelected = selectedSniperWallets.has(wallet.id);
                        return (
                          <div 
                            key={wallet.id} 
                            onClick={() => {
                              const newSet = new Set(selectedSniperWallets);
                              if (newSet.has(wallet.id)) newSet.delete(wallet.id);
                              else newSet.add(wallet.id);
                              setSelectedSniperWallets(newSet);
                            }}
                            className={\`flex cursor-pointer items-center justify-between rounded-xl border p-3 transition-colors \${
                              isSelected ? 'border-yellow-500/50 bg-yellow-500/10' : 'border-white/5 bg-black/30 hover:border-white/20'
                            }\`}
                          >
                            <div className="flex flex-col">
                              <span className="font-semibold text-white text-sm">{wallet.name}</span>
                              <span className="font-mono text-xs text-neutral-500">{wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}</span>
                            </div>
                            {isSelected && <CheckCircle2 size={16} className="text-yellow-500" />}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <p className="mt-2 text-xs text-neutral-500">If no wallets are selected, the sniper will only generate and return the calldata.</p>
                </div>
`;

code = code.replace(regex, replacement.trim());
fs.writeFileSync('src/pages/Dashboard.tsx', code);
