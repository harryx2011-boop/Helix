import { Playground } from '@/components/playground/playground';

/**
 * The tab is read client-side rather than from `searchParams`: self-host
 * prerenders this page into a static export, where awaiting searchParams is a
 * build error.
 */
export default function PlaygroundPage() {
  return <Playground />;
}
