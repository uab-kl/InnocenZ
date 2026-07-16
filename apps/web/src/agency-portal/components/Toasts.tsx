import { useStore } from '@agency-portal/lib/store';
import { Check, Info, AlertTriangle } from 'lucide-react';

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  if (!toasts.length) return null;

  return (
    <div className="iz-toast-stack">
      {toasts.map((t) => {
        const Icon =
          t.tone === 'success'
            ? Check
            : t.tone === 'warn'
              ? AlertTriangle
              : Info;
        return (
          <div key={t.id} className="iz-toast" role="status">
            <div className="iz-toast-ic">
              <Icon className="h-4 w-4" />
            </div>
            <span className="flex-1 text-[var(--iz-txt)]">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="iz-muted text-xs"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
