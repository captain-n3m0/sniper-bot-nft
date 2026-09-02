import { motion } from 'motion/react';
import { Zap, Shield, Cpu } from 'lucide-react';

const features = [
  {
    title: 'Zero-Latency Sniping',
    description: 'Constructs mint transactions purely from on-chain contract data, completely bypassing OpenSea UI and API rate limits.',
    icon: Zap,
  },
  {
    title: 'Cloud Infrastructure',
    description: 'Leverages enterprise-grade dedicated RPC nodes geographically distributed to ensure instant transaction propagation from the browser.',
    icon: Shield,
  },
  {
    title: 'Allowlist Bypass Support',
    description: 'Automatically fetches OpenSea signatures right as the drop opens to snipe private allowlist and FCFS drops.',
    icon: Cpu,
  },
];

export const FeatureGrid = () => {
  return (
    <section className="mx-auto w-full max-w-7xl px-6 py-32" id="features">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {features.map((feat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ ease: [0.23, 1, 0.32, 1], duration: 0.8, delay: i * 0.2 }}
            whileHover={{ y: -12, backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(139,92,246,0.4)" }}
            className="group flex flex-col items-start rounded-[24px] border border-white/5 bg-white/[0.02] p-10 backdrop-blur-[16px] transition-colors duration-500 hover:shadow-[0_0_20px_-10px_rgba(139,92,246,0.4)]"
          >
            <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 text-synapse-violet transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-3">
              <feat.icon size={24} />
            </div>
            <h3 className="mb-4 font-serif text-3xl text-white">{feat.title}</h3>
            <p className="text-base leading-relaxed text-neutral-400">
              {feat.description}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  );
};
