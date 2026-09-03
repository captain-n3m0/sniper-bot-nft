import { motion } from 'motion/react';
import { Link } from 'react-router-dom';

export const Navigation = () => {
  const items = [
    { label: 'Dashboard', to: '/dashboard' },
    { label: 'Metrics', to: '/metrics' },
    { label: 'Features', to: '/#features' },
    { label: 'Status', to: '/status' },
  ];

  return (
    <motion.nav
      initial={{ y: -50, opacity: 0, x: "-50%" }}
      animate={{ y: 0, opacity: 1, x: "-50%" }}
      transition={{ ease: [0.23, 1, 0.32, 1], duration: 1, delay: 0.2 }}
      className="fixed top-6 left-1/2 z-50 flex w-[95%] max-w-[672px] items-center justify-between rounded-full border border-white/10 bg-[#0a0a0a]/70 px-4 py-2 backdrop-blur-[16px]"
    >
      <div className="flex items-center gap-3 pl-2">
        <div className="h-2 w-2 rounded-full bg-gradient-to-r from-synapse-violet to-synapse-cyan"></div>
        <span className="font-serif text-xl tracking-tight text-white">LastLap MintGrid</span>
      </div>

      <div className="hidden md:flex items-center gap-8">
        {items.map((item) => (
          <Link key={item.label} to={item.to} className="text-xs font-semibold uppercase tracking-widest text-neutral-400 transition-colors hover:text-white">
            {item.label}
          </Link>
        ))}
      </div>

      <Link to="/dashboard">
        <button className="rounded-full bg-white px-5 py-2 text-xs font-semibold text-black transition-transform hover:scale-105 active:scale-95">
          LAUNCH APP
        </button>
      </Link>
    </motion.nav>
  );
};
