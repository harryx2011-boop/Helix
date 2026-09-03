'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { MoreHorizontal, PenLine, Copy, CopyPlus, Download, Trash2 } from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useForks, type Fork } from '@/lib/store';
import { downloadFork } from '@/lib/export';
import type { Role } from '@/lib/catalog';

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'edited just now';
  if (minutes < 60) return `edited ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `edited ${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `edited ${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `edited ${months}mo ago`;
  return `edited ${Math.round(months / 12)}y ago`;
}

function DeleteRowDialog({
  open,
  title,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  title: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-p-ink/40 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, ease: [0, 0, 0.2, 1] }}
              />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content asChild forceMount aria-describedby="delete-row-description">
              <motion.div
                className="fixed left-1/2 top-1/2 z-50 w-[min(400px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-panel border border-p-line bg-p-surface p-6 shadow-panel"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.15, ease: [0, 0, 0.2, 1] }}
              >
                <DialogPrimitive.Title className="text-base font-semibold text-p-ink">Delete this fork?</DialogPrimitive.Title>
                <DialogPrimitive.Description id="delete-row-description" className="mt-1.5 text-sm leading-relaxed text-p-ink-2">
                  {title} will be permanently removed. This cannot be undone.
                </DialogPrimitive.Description>
                <div className="mt-5 flex justify-end gap-2">
                  <DialogPrimitive.Close asChild>
                    <Button type="button" variant="ghost" className="h-8 rounded-pill px-3 text-sm text-p-ink-2 hover:bg-p-code hover:text-p-ink">
                      Cancel
                    </Button>
                  </DialogPrimitive.Close>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={onConfirm}
                    className="h-8 rounded-pill px-3 text-sm"
                  >
                    Delete
                  </Button>
                </div>
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}

function ForkRow({
  fork,
  role,
  active,
  onDeleted,
}: {
  fork: Fork;
  role: Role | undefined;
  active: boolean;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const { upsert, remove } = useForks();
  const [renaming, setRenaming] = React.useState(false);
  const [draft, setDraft] = React.useState(fork.title);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (renaming) inputRef.current?.select();
  }, [renaming]);

  function startRename() {
    setDraft(fork.title);
    setRenaming(true);
  }

  function commitRename() {
    const title = draft.trim() || fork.title;
    upsert({ ...fork, title, updatedAt: new Date().toISOString() });
    setRenaming(false);
  }

  function duplicate() {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    upsert({ ...fork, id, title: `${fork.title} copy`, createdAt: now, updatedAt: now });
    router.push(`/editor/${id}`);
  }

  function confirmDelete() {
    remove(fork.id);
    setDeleteOpen(false);
    if (active) onDeleted();
  }

  return (
    <li
      className={cn(
        'group relative flex items-center gap-2 rounded-card px-2 py-2 transition-colors duration-150 ease-out',
        active ? 'bg-blue-soft' : 'hover:bg-p-code',
      )}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-pill"
        style={{ backgroundColor: role?.color ?? 'var(--p-ink-3)' }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        {renaming ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitRename();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setRenaming(false);
              }
            }}
            autoFocus
            aria-label="Fork title"
            className="w-full rounded-[6px] border border-blue bg-p-surface px-1.5 py-0.5 text-[13px] text-p-ink outline-none focus-visible:ring-2 focus-visible:ring-blue-ring"
          />
        ) : (
          <Link href={`/editor/${fork.id}`} className="block truncate text-[13px] font-medium text-p-ink">
            {fork.title || 'Untitled fork'}
          </Link>
        )}
        <p className="mt-0.5 truncate text-[11.5px] text-p-ink-3">
          {role?.name ?? fork.roleSlug} &middot; {relativeTime(fork.updatedAt)}
        </p>
      </div>

      {!renaming ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`More actions for ${fork.title}`}
              className="h-6 w-6 shrink-0 rounded-card text-p-ink-3 opacity-0 transition-opacity hover:bg-p-line hover:text-p-ink group-hover:opacity-100 data-[state=open]:opacity-100"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44 rounded-card border-p-line p-1">
            <DropdownMenuItem className="gap-2 rounded-card text-sm" onSelect={startRename}>
              <PenLine className="h-3.5 w-3.5 text-p-ink-3" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2 rounded-card text-sm" onSelect={duplicate}>
              <CopyPlus className="h-3.5 w-3.5 text-p-ink-3" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2 rounded-card text-sm"
              onSelect={() => {
                navigator.clipboard
                  .writeText(fork.bodyMd)
                  .then(() => toast.success('Prompt copied'))
                  .catch(() => toast.error('Could not copy to clipboard'));
              }}
            >
              <Copy className="h-3.5 w-3.5 text-p-ink-3" />
              Copy prompt
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2 rounded-card text-sm" onSelect={() => downloadFork(fork, 'md')}>
              <Download className="h-3.5 w-3.5 text-p-ink-3" />
              Export .md
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 rounded-card text-sm text-destructive focus:text-destructive"
              onSelect={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      <DeleteRowDialog open={deleteOpen} title={fork.title || 'Untitled fork'} onOpenChange={setDeleteOpen} onConfirm={confirmDelete} />
    </li>
  );
}

export function SidebarEditor({ roles }: { roles: Role[] }) {
  const { forks } = useForks();
  const router = useRouter();
  const pathname = usePathname();
  const roleBySlug = React.useMemo(() => new Map(roles.map((r) => [r.slug, r])), [roles]);
  const sorted = React.useMemo(
    () => [...forks].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [forks],
  );

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col gap-2 p-4">
        <p className="text-[12.5px] leading-relaxed text-p-ink-3">
          Nothing here yet.{' '}
          <Link href="/roles" className="font-medium text-blue hover:text-blue-hover">
            Fork a persona from any role page.
          </Link>
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-0.5 p-3">
      {sorted.map((fork) => (
        <ForkRow
          key={fork.id}
          fork={fork}
          role={roleBySlug.get(fork.roleSlug)}
          active={pathname === `/editor/${fork.id}`}
          onDeleted={() => router.push('/roles')}
        />
      ))}
    </ul>
  );
}
