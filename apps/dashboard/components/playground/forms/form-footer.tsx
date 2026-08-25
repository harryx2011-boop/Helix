'use client';

import { Code2, Loader2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FormFooterProps {
  loading: boolean;
  disabled?: boolean;
  comingSoon?: boolean;
  onGetCode: () => void;
}

/** Shared [Get code] + [Run] footer for every playground form (WEBSITE.md §7.4). */
export function FormFooter({ loading, disabled, comingSoon, onGetCode }: FormFooterProps) {
  return (
    <div className="mt-auto flex items-center gap-2 pt-2">
      <Button type="button" data-playground-get-code variant="secondary" size="sm" className="gap-1.5" onClick={onGetCode}>
        <Code2 className="h-3.5 w-3.5" />
        Get code
      </Button>
      <Button type="submit" disabled={loading || disabled} className="ml-auto gap-2">
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Running
          </>
        ) : (
          <>
            <Play className="h-4 w-4" />
            {comingSoon ? 'Coming soon' : 'Run'}
          </>
        )}
      </Button>
    </div>
  );
}
