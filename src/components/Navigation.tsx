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
      className="fixed top-4 left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-[1280px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 rounded-full border border-white/10 bg-[#0a0a0a]/80 px-5 py-3 backdrop-blur-[16px]"
    >
      <div className="flex shrink-0 items-center gap-3 pl-1">
        <div className="h-2 w-2 rounded-full bg-gradient-to-r from-synapse-violet to-synapse-cyan"></div>
        <span className="whitespace-nowrap font-serif text-lg tracking-tight text-white sm:text-xl">LastLap MintGrid</span>
      </div>

      <div className="hidden min-w-0 items-center justify-center lg:flex">
        <div className="flex max-w-full items-center gap-3 overflow-x-auto px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden xl:gap-5">
          {items.map((item) => (
            <Link key={item.label} to={item.to} className="shrink-0 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.13em] text-neutral-400 transition-colors hover:text-white xl:text-xs">
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      <Link to="/dashboard" className="inline-flex shrink-0 whitespace-nowrap rounded-full bg-white px-4 py-3 text-[10px] font-semibold leading-none text-black transition-transform hover:scale-105 active:scale-95 sm:px-5 sm:text-xs">
        LAUNCH APP
      </Link>
    </motion.nav>
  );
};
