'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { ArrowLeft, Copy, Check, Files, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EditorToolbar } from './toolbar';
import { ExportMenu } from './export-menu';
import { PlaceholderRail } from './placeholder-rail';
import { DeleteForkDialog } from './delete-fork-dialog';
import { WizardDialog, type WizardTarget } from '@/components/wizard/wizard-dialog';
import { markdownToHtml, htmlToMarkdown } from '@/lib/fork';
import { useForks, newForkId } from '@/lib/store';
import { scanPlaceholders, remainingPlaceholders } from '@/lib/placeholders';

const AUTOSAVE_DELAY_MS = 500;

export function EditorShell({ forkId }: { forkId: string }) {
  const router = useRouter();
  const { forks, upsert, remove } = useForks();
  const [hydrated, setHydrated] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [saveState, setSaveState] = React.useState<'idle' | 'saving' | 'saved'>('idle');
  const [wizardOpen, setWizardOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedForkId = React.useRef<string | null>(null);
  const titleRef = React.useRef(title);
  titleRef.current = title;

  React.useEffect(() => {
    setHydrated(true);
  }, []);

  const fork = forks.find((f) => f.id === forkId);
  const forkRef = React.useRef(fork);
  forkRef.current = fork;

  const scheduleSave = React.useCallback((nextTitle: string, html?: string) => {
    const current = forkRef.current;
    if (!current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState('saving');
    saveTimer.current = setTimeout(() => {
      const bodyMd = html !== undefined ? htmlToMarkdown(html) : current.bodyMd;
      upsert({ ...current, title: nextTitle, bodyMd, updatedAt: new Date().toISOString() });
      setSaveState('saved');
    }, AUTOSAVE_DELAY_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const editor = useEditor({
    extensions: [StarterKit],
    content: '',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'prose-persona min-h-[60vh] focus:outline-none',
      },
    },
    onUpdate: ({ editor: ed }) => {
      scheduleSave(titleRef.current, ed.getHTML());
    },
  });

  React.useEffect(() => {
    if (!editor || !fork) return;
    if (initializedForkId.current === fork.id) return;
    initializedForkId.current = fork.id;
    setTitle(fork.title);
    editor.commands.setContent(markdownToHtml(fork.bodyMd));
  }, [editor, fork]);

  function handleTitleChange(next: string) {
    setTitle(next);
    scheduleSave(next);
  }

  React.useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  async function copyBody() {
    if (!fork) return;
    try {
      await navigator.clipboard.writeText(fork.bodyMd);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  }

  function duplicate() {
    if (!fork) return;
    const id = newForkId();
    const now = new Date().toISOString();
    upsert({ ...fork, id, title: `${fork.title} copy`, createdAt: now, updatedAt: now });
    router.push(`/editor/${id}`);
  }

  function confirmDelete() {
    if (!fork) return;
    setDeleting(true);
    remove(fork.id);
    router.push(`/roles/${fork.roleSlug}?persona=${fork.personaSlug}`);
  }

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Skeleton className="mb-6 h-8 w-2/3 rounded-card" />
        <Skeleton className="mb-4 h-9 w-full rounded-card" />
        <Skeleton className="h-[50vh] w-full rounded-panel" />
      </div>
    );
  }

  if (!fork) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col items-center px-6 py-24 text-center">
        <h1 className="text-lg font-semibold text-p-ink">Fork not found</h1>
        <p className="mt-2 text-sm leading-relaxed text-p-ink-2">
          This fork does not exist in this browser, or it was deleted.
        </p>
        <Link
          href="/roles"
          className="mt-6 inline-flex h-9 items-center rounded-pill bg-p-ink px-4 text-sm text-white transition-colors duration-150 ease-out hover:bg-p-ink/90"
        >
          Browse roles
        </Link>
      </div>
    );
  }

  const placeholders = scanPlaceholders(fork.bodyMd);
  const remaining = remainingPlaceholders(placeholders, fork.values);

  const wizardTarget: WizardTarget = {
    roleSlug: fork.roleSlug,
    personaSlug: fork.personaSlug,
    sourceVersion: fork.sourceVersion,
    title: fork.title,
    bodyMd: fork.bodyMd,
    placeholders,
    forkId: fork.id,
  };

  return (
    <div className="flex min-h-screen">
      <div className="min-w-0 flex-1">
        <header className="grid-glow relative border-b border-p-line bg-p-surface px-6 py-4">
          <div className="relative flex items-center justify-between gap-4">
            <Link
              href={`/roles/${fork.roleSlug}?persona=${fork.personaSlug}`}
              className="inline-flex items-center gap-1.5 text-sm text-p-ink-2 transition-colors duration-150 ease-out hover:text-blue"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </Link>
            <div className="flex items-center gap-2">
              <span className="w-14 text-right text-xs text-p-ink-3">
                {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : ''}
              </span>
              <ExportMenu fork={fork} />
              <Button
                type="button"
                variant="outline"
                onClick={copyBody}
                className="h-8 rounded-pill border-p-line px-3 text-sm text-p-ink hover:bg-p-code"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-blue" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={duplicate}
                className="h-8 rounded-pill border-p-line px-3 text-sm text-p-ink hover:bg-p-code"
              >
                <Files className="h-3.5 w-3.5" />
                Duplicate
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleteOpen(true)}
                className="h-8 rounded-pill border-p-line px-3 text-sm text-p-ink hover:bg-p-code"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            </div>
          </div>
          <input
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Untitled fork"
            aria-label="Fork title"
            className="relative mt-4 w-full bg-transparent text-2xl font-semibold leading-tight text-p-ink outline-none placeholder:text-p-ink-3"
          />
        </header>

        <main className="mx-auto max-w-3xl px-6 py-8">
          <div className="mb-4">
            <EditorToolbar editor={editor} />
          </div>
          <div className="rounded-panel border border-p-line bg-p-surface p-6 shadow-card-sm">
            <EditorContent editor={editor} />
          </div>
        </main>
      </div>

      <PlaceholderRail remaining={remaining} total={placeholders.length} onFill={() => setWizardOpen(true)} />

      <WizardDialog target={wizardOpen ? wizardTarget : null} open={wizardOpen} onOpenChange={setWizardOpen} />
      <DeleteForkDialog
        open={deleteOpen}
        title={fork.title}
        pending={deleting}
        onOpenChange={setDeleteOpen}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
