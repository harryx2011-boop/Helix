import { Banner } from '@/components/marketing/banner';
import { Nav } from '@/components/marketing/nav';
import { AgentBlock } from '@/components/marketing/agent-block';
import { Footer } from '@/components/marketing/footer';
import { ScrollMotion } from '@/components/marketing/scroll-motion';
import { FrameColumn } from '@/components/marketing/section-frame';
import { fetchGithubStars } from '@/lib/github-stars';

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const stars = await fetchGithubStars();
  return (
    <div data-surface="marketing" className="relative isolate bg-m-bg text-m-ink font-sans">
      <ScrollMotion />
      <Banner />
      <Nav stars={stars} />
      <FrameColumn>
        {children}
        <AgentBlock />
      </FrameColumn>
      <Footer />
    </div>
  );
}
