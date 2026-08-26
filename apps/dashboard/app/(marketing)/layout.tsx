import { Banner } from '@/components/marketing/banner';
import { Nav } from '@/components/marketing/nav';
import { AgentBlock } from '@/components/marketing/agent-block';
import { Footer } from '@/components/marketing/footer';
import { ScrollMotion } from '@/components/marketing/scroll-motion';
import { FrameColumn } from '@/components/marketing/section-frame';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-surface="marketing" className="bg-m-bg text-m-ink font-sans">
      <ScrollMotion />
      <Banner />
      <Nav />
      <FrameColumn>
        {children}
        <AgentBlock />
      </FrameColumn>
      <Footer />
    </div>
  );
}
