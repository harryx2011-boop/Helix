'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';

/** Confirm-before-delete dialog for the editor header's Delete action. */
export function DeleteForkDialog({
  open,
  title,
  pending,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  title: string;
  pending: boolean;
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
            <DialogPrimitive.Content asChild forceMount aria-describedby="delete-fork-description">
              <motion.div
                className="fixed left-1/2 top-1/2 z-50 w-[min(400px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-panel border border-p-line bg-p-surface p-6 shadow-panel"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.15, ease: [0, 0, 0.2, 1] }}
              >
                <DialogPrimitive.Title className="text-base font-semibold text-p-ink">Delete this fork?</DialogPrimitive.Title>
                <DialogPrimitive.Description id="delete-fork-description" className="mt-1.5 text-sm leading-relaxed text-p-ink-2">
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
                    disabled={pending}
                    onClick={onConfirm}
                    className="h-8 rounded-pill px-3 text-sm disabled:opacity-60"
                  >
                    {pending ? 'Deleting…' : 'Delete'}
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
