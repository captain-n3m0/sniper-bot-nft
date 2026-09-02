import { motion } from 'motion/react';
import { Copy } from 'lucide-react';

export const CodeBlock = () => {
  return (
    <section className="mx-auto w-full max-w-4xl px-6 py-24" id="integration">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ ease: [0.23, 1, 0.32, 1], duration: 1 }}
        className="overflow-hidden rounded-[24px] border border-white/10 bg-[#080808]/80 shadow-2xl backdrop-blur-[16px]"
      >
        <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-red-500/80" />
            <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
            <div className="h-3 w-3 rounded-full bg-green-500/80" />
          </div>
          <div className="font-mono text-xs text-neutral-500">dashboard_console</div>
          <button className="text-neutral-500 transition-colors hover:text-white">
            <Copy size={16} />
          </button>
        </div>
        <div className="p-8 font-mono text-sm leading-loose md:text-base">
          <p><span className="text-synapse-violet">POST</span> <span className="text-white">/api/snipe/seadrop</span> <span className="text-synapse-cyan">HTTP/2</span></p>
          <br />
          <p><span className="text-neutral-500">[{'14:59:58.201'}]</span> <span className="text-synapse-violet">INFO</span> Authenticating wallet signature...</p>
          <p><span className="text-neutral-500">[{'14:59:58.455'}]</span> <span className="text-synapse-violet">INFO</span> Connecting to dedicated Blast RPC...</p>
          <p><span className="text-neutral-500">[{'14:59:59.980'}]</span> <span className="text-synapse-cyan">DEBUG</span> Preparing local mint payload for 2 tokens</p>
          <p><span className="text-neutral-500">[{'15:00:00.001'}]</span> <span className="text-synapse-emerald">SUCCESS</span> Transaction broadcast! Hash: 0x999...111</p>
          <br />
          <p><span className="text-neutral-500">[{'15:00:12.304'}]</span> <span className="text-synapse-emerald">SUCCESS</span> Transaction confirmed in block 1928374</p>
        </div>
      </motion.div>
    </section>
  );
};
