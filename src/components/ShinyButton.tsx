import React from 'react';
import { motion } from 'motion/react';

export const ShinyButton = ({ children, onClick }: { children: React.ReactNode, onClick?: () => void }) => {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ ease: [0.23, 1, 0.32, 1], duration: 0.4 }}
      className="relative inline-flex overflow-hidden rounded-full p-[1px] group"
    >
      <span className="absolute inset-[-1000%] animate-[spin_4s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,transparent_0%,#8B5CF6_40%,#06B6D4_50%,transparent_60%)]" />
      <span className="relative inline-flex h-full w-full items-center justify-center rounded-full bg-[#0a0a0a] px-10 py-4 text-sm font-medium text-white backdrop-blur-[16px] transition-colors duration-500 group-hover:bg-[#111]">
        {children}
      </span>
    </motion.button>
  );
};
