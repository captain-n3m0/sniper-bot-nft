import { Navigation } from '../components/Navigation';
import { Hero } from '../components/Hero';
import { Ticker } from '../components/Ticker';
import { FeatureGrid } from '../components/FeatureGrid';
import { CodeBlock } from '../components/CodeBlock';
import { Footer } from '../components/Footer';

export const Landing = () => {
  return (
    <main className="relative min-h-screen w-full selection:bg-synapse-violet/30">
      <Navigation />
      <Hero />
      <Ticker />
      <FeatureGrid />
      <CodeBlock />
      <Footer />
    </main>
  );
};
