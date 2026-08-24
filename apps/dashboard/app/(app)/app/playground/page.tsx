import { Playground } from '@/components/playground/playground';

interface PlaygroundPageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function PlaygroundPage({ searchParams }: PlaygroundPageProps) {
  const { tab } = await searchParams;
  return <Playground initialTab={tab ?? 'scrape'} />;
}
