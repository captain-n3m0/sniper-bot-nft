import { motion } from 'motion/react';
import { Link } from 'react-router-dom';

export const Navigation = () => {
  const items = [
    { label: 'Dashboard', to: '/dashboard' },
    { label: 'Metrics', to: '/metrics' },
    { label: 'Docs', to: '/docs' },
    { label: 'Features', to: '/#features' },
    { label: 'Status', to: '/status' },
    { label: 'Admin', to: '/admin' },
  ];

  return (
    <motion.nav
      initial={{ y: -50, opacity: 0, x: "-50%" }}
      animate={{ y: 0, opacity: 1, x: "-50%" }}
      transition={{ ease: [0.23, 1, 0.32, 1], duration: 1, delay: 0.2 }}
      className="fixed top-4 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-[1200px] items-center gap-5 rounded-full border border-white/10 bg-[#0a0a0a]/80 px-5 py-3 backdrop-blur-[16px]"
    >
      <div className="flex shrink-0 items-center gap-3 pl-1">
        <div className="h-2 w-2 rounded-full bg-gradient-to-r from-synapse-violet to-synapse-cyan"></div>
        <span className="whitespace-nowrap font-serif text-lg tracking-tight text-white sm:text-xl">LastLap MintGrid</span>
      </div>

      <div className="hidden min-w-0 flex-1 items-center justify-center gap-4 lg:flex xl:gap-6">
        {items.map((item) => (
          <Link key={item.label} to={item.to} className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-400 transition-colors hover:text-white xl:text-xs">
            {item.label}
          </Link>
        ))}
      </div>

      <Link to="/dashboard" className="shrink-0">
        <button className="whitespace-nowrap rounded-full bg-white px-4 py-3 text-[10px] font-semibold leading-none text-black transition-transform hover:scale-105 active:scale-95 sm:px-5 sm:text-xs">
          LAUNCH APP
        </button>
      </Link>
    </motion.nav>
  );
};
