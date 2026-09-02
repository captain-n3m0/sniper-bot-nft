import fs from 'fs';
let code = fs.readFileSync('src/components/GasEstimator.tsx', 'utf8');

// Add selectedChain to props
code = code.replace(
  'interface GasEstimatorProps {\n  addLog: (type: string, message: string, color: string) => void;\n}',
  'interface GasEstimatorProps {\n  addLog: (type: string, message: string, color: string) => void;\n  selectedChain: string;\n}'
);

code = code.replace(
  'export const GasEstimator = ({ addLog }: GasEstimatorProps) => {',
  'export const GasEstimator = ({ addLog, selectedChain }: GasEstimatorProps) => {'
);

// Add useEffect to fetch live base fee
const newEffect = `
  const [isFetchingFee, setIsFetchingFee] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchFee = async () => {
      setIsFetchingFee(true);
      try {
        const res = await fetch(\`/api/gas-price?chain=\${selectedChain}\`);
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();
        if (isMounted && data.baseFeeGwei) {
          setInputs(prev => ({ ...prev, currentBaseFeeGwei: Number(data.baseFeeGwei.toFixed(2)) }));
        }
      } catch (err) {
        console.error("Failed to fetch live base fee:", err);
      } finally {
        if (isMounted) setIsFetchingFee(false);
      }
    };
    fetchFee();
    const interval = setInterval(fetchFee, 12000); // refresh every 12s (approx 1 block)
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [selectedChain]);
`;

code = code.replace(
  'const activeStrategy: GasCalculationStrategy = defaultGasStrategy;',
  'const activeStrategy: GasCalculationStrategy = defaultGasStrategy;\n' + newEffect
);

// Update the input for currentBaseFeeGwei to indicate it's live
code = code.replace(
  '<Flame size={14} className="text-yellow-500" /> Current Network Base Fee (Gwei)',
  '<Flame size={14} className="text-yellow-500" /> Live Network Base Fee (Gwei) {isFetchingFee && <span className="animate-pulse text-synapse-cyan">●</span>}'
);

fs.writeFileSync('src/components/GasEstimator.tsx', code);
