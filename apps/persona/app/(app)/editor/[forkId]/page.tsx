'use client';

import { use } from 'react';
import { EditorShell } from '@/components/editor/editor-shell';

export default function EditorPage({ params }: { params: Promise<{ forkId: string }> }) {
  const { forkId } = use(params);
  return <EditorShell forkId={forkId} />;
}
