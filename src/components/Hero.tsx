import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ShinyButton } from './ShinyButton';

export const Hero = () => {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pt-32 text-center">
      {/* Ambient Orbs */}
      <div className="absolute top-0 left-1/2 -z-10 h-[600px] w-[800px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_top,#8b5cf6_0%,transparent_70%)] opacity-40 blur-[80px]" />
      <div className="absolute top-1/4 -left-1/4 -z-10 h-[500px] w-[500px] animate-float rounded-full bg-[radial-gradient(circle_at_center,#06b6d4_0%,transparent_60%)] opacity-20 blur-[100px]" />
      <div className="absolute bottom-1/4 right-0 -z-10 h-[400px] w-[400px] animate-float-delayed rounded-full bg-[radial-gradient(circle_at_center,#10b981_0%,transparent_60%)] opacity-10 blur-[100px]" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ease: [0.23, 1, 0.32, 1], duration: 1 }}
        className="flex flex-col items-center z-10"
      >
        <h1 className="font-serif text-6xl leading-[0.9] tracking-[-0.03em] text-white md:text-8xl lg:text-9xl">
          Zero-Latency <br />
          <span className="animate-shimmer bg-[linear-gradient(90deg,#a78bfa_0%,#ffffff_40%,#ffffff_60%,#22d3ee_100%)] bg-[length:200%_auto] bg-clip-text text-transparent">
            Minting
          </span>
        </h1>

        <p className="mt-8 max-w-2xl text-lg font-light text-neutral-400 md:text-xl">
          A high-performance web platform that bypasses standard frontends, leveraging dedicated cloud RPCs to snipe SeaDrop collections at the exact block they open.
        </p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ease: [0.23, 1, 0.32, 1], duration: 0.8, delay: 1 }}
          className="mt-12 flex flex-col items-center gap-8 md:flex-row"
        >
          <Link to="/dashboard">
            <ShinyButton>LAUNCH DASHBOARD</ShinyButton>
          </Link>
          <a href="#setup" className="text-sm font-semibold uppercase tracking-widest text-neutral-400 transition-colors hover:text-white">
            View Documentation
          </a>
        </motion.div>
      </motion.div>
    </section>
  );
};
