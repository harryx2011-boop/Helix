import { Banner } from '@/components/marketing/banner';
import { Nav } from '@/components/marketing/nav';
import { AgentBlock } from '@/components/marketing/agent-block';
import { Footer } from '@/components/marketing/footer';
import { ScrollMotionLoader } from '@/components/marketing/scroll-motion-loader';
import { FrameColumn } from '@/components/marketing/section-frame';
import { fetchGithubStars } from '@/lib/github-stars';

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const stars = await fetchGithubStars();
  return (
    <div data-surface="marketing" className="relative isolate bg-m-bg text-m-ink font-sans">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-card focus:border focus:border-m-border-muted focus:bg-m-surface focus:px-4 focus:py-3 focus:font-mono focus:text-[13px] focus:text-m-ink"
      >
        Skip to content
      </a>
      <ScrollMotionLoader />
      <Banner />
      <Nav stars={stars} />
      <FrameColumn>
        <main id="main-content" tabIndex={-1} className="focus:outline-none">
          {children}
        </main>
        <AgentBlock />
      </FrameColumn>
      <Footer />
    </div>
  );
}
