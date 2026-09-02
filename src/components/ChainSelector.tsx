import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, Globe } from 'lucide-react';
import { CHAINS, ChainProfile } from '../lib/chains';

interface ChainSelectorProps {
  selectedChain: string;
  setSelectedChain: (chainKey: string) => void;
}

export const ChainSelector = ({ selectedChain, setSelectedChain }: ChainSelectorProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeChain = CHAINS.find((c) => c.key === selectedChain) || CHAINS[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/50 px-4 py-2 font-mono text-xs font-semibold uppercase tracking-widest text-neutral-300 transition-colors hover:bg-white/5 hover:text-white"
      >
        <Globe size={14} className="text-synapse-cyan" />
        {activeChain.name}
        <ChevronDown size={14} className={`text-neutral-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-white/10 bg-[#080808]/95 p-1 shadow-2xl backdrop-blur-md z-50"
          >
            {CHAINS.map((chain) => (
              <button
                key={chain.key}
                onClick={() => {
                  setSelectedChain(chain.key);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left font-mono text-xs uppercase tracking-widest transition-colors ${
                  selectedChain === chain.key
                    ? 'bg-synapse-cyan/10 text-synapse-cyan'
                    : 'text-neutral-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                {chain.name}
                {selectedChain === chain.key && (
                  <div className="h-1.5 w-1.5 rounded-full bg-synapse-cyan"></div>
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
