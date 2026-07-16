import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { AlertTriangle, Briefcase, MessageSquare } from 'lucide-react';
import { IzSheet } from '@agency-portal/components/iz/Sheet';
import { IzCardTitle, IzSelect } from '@agency-portal/components/iz/ui';
import { useStore } from '@agency-portal/lib/store';

type BroadcastKind = 'shift' | 'message';

type ShiftForm = {
  outlet: string;
  date: string;
  startTime: string;
  endTime: string;
  details: string;
};

type MessageForm = {
  subject: string;
  body: string;
};

const EMPTY_SHIFT: ShiftForm = {
  outlet: '',
  date: '',
  startTime: '22:00',
  endTime: '04:00',
  details: '',
};

const EMPTY_MESSAGE: MessageForm = {
  subject: '',
  body: '',
};

function formatShiftDateLabel(dateIso: string): string {
  try {
    return format(parseISO(dateIso), 'EEE d MMM yyyy');
  } catch {
    return dateIso;
  }
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 flex items-center gap-1 text-[10px] text-[var(--iz-red)]">
      <AlertTriangle className="h-3 w-3 shrink-0" />
      {message}
    </p>
  );
}

export function AgencyBroadcastSheet({
  open,
  onClose,
  prIds,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  prIds: string[];
  onSent: () => void;
}) {
  const broadcastAgencyPr = useStore((s) => s.broadcastAgencyPr);
  const outletCommissionRules = useStore((s) => s.outletCommissionRules);
  const outletOptions = useMemo(
    () => (outletCommissionRules ?? []).map((r) => r.outlet),
    [outletCommissionRules],
  );
  const [kind, setKind] = useState<BroadcastKind>('shift');
  const [shift, setShift] = useState<ShiftForm>(EMPTY_SHIFT);
  const [message, setMessage] = useState<MessageForm>(EMPTY_MESSAGE);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setKind('shift');
    setShift(EMPTY_SHIFT);
    setMessage(EMPTY_MESSAGE);
    setErrors({});
    setFormError(null);
  }, [open]);

  const switchKind = (next: BroadcastKind) => {
    setKind(next);
    setErrors({});
    setFormError(null);
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (kind === 'shift') {
      if (!shift.outlet) next.outlet = 'Select an outlet';
      if (!shift.date) next.date = 'Pick a shift date';
      if (!shift.startTime) next.startTime = 'Enter start time';
      if (!shift.endTime) next.endTime = 'Enter end time';
      if (!shift.details.trim())
        next.details = 'Add dress code, base pay, or other notes for PRs';
    } else {
      if (!message.subject.trim()) next.subject = 'Enter a subject';
      if (!message.body.trim()) next.body = 'Enter your message';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) {
      setFormError(
        kind === 'shift'
          ? 'Complete all shift fields before sending.'
          : 'Complete subject and message before sending.',
      );
      return false;
    }
    setFormError(null);
    return true;
  };

  const send = () => {
    if (!validate()) return;
    if (kind === 'shift') {
      const title = `${shift.outlet} · ${formatShiftDateLabel(shift.date)}`;
      const body = [
        `Date: ${formatShiftDateLabel(shift.date)}`,
        `Time: ${shift.startTime} – ${shift.endTime}`,
        `Outlet: ${shift.outlet}`,
        '',
        shift.details.trim(),
      ].join('\n');
      broadcastAgencyPr(prIds, { kind: 'shift', title, body });
    } else {
      broadcastAgencyPr(prIds, {
        kind: 'message',
        title: message.subject.trim(),
        body: message.body.trim(),
      });
    }
    onSent();
    onClose();
  };

  return (
    <IzSheet open={open} onClose={onClose}>
      <IzCardTitle>
        Broadcast to {prIds.length} PR{prIds.length !== 1 ? 's' : ''}
      </IzCardTitle>
      <p className="iz-tiny iz-muted mb-3">
        Choose what you are sending, then fill in the required fields.
      </p>

      <p className="iz-tiny iz-muted2 mb-1.5 tracking-wide">BROADCAST TYPE</p>
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl border border-[var(--iz-line)] bg-[var(--iz-bg2)] p-1">
        <button
          type="button"
          className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-[11px] font-semibold transition ${
            kind === 'shift'
              ? 'bg-[var(--iz-gold)] text-[var(--iz-bg)] shadow-sm'
              : 'text-[var(--iz-muted)] hover:text-[var(--iz-txt)]'
          }`}
          onClick={() => switchKind('shift')}
        >
          <Briefcase className="h-3.5 w-3.5" />
          Shift offer
        </button>
        <button
          type="button"
          className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-[11px] font-semibold transition ${
            kind === 'message'
              ? 'bg-[var(--iz-gold)] text-[var(--iz-bg)] shadow-sm'
              : 'text-[var(--iz-muted)] hover:text-[var(--iz-txt)]'
          }`}
          onClick={() => switchKind('message')}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Message
        </button>
      </div>
      <p className="iz-tiny iz-muted2 mb-3">
        {kind === 'shift'
          ? 'Shift offer sends outlet, date, time, and notes to selected PRs.'
          : 'Message sends a free-text notice to selected PRs.'}
      </p>

      {formError && (
        <div className="mb-3 rounded-xl border border-[var(--iz-red)]/40 bg-[rgba(239,68,68,.08)] px-3 py-2">
          <p className="iz-tiny flex items-center gap-1 text-[var(--iz-red)]">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {formError}
          </p>
        </div>
      )}

      {kind === 'shift' ? (
        <div className="space-y-2">
          <div className="iz-field !mb-0">
            <label>Outlet *</label>
            <IzSelect
              value={shift.outlet}
              className={errors.outlet ? 'border-[var(--iz-red)]' : undefined}
              onChange={(e) => {
                setShift((s) => ({ ...s, outlet: e.target.value }));
                if (errors.outlet) setErrors((er) => ({ ...er, outlet: '' }));
              }}
            >
              <option value="">Select outlet</option>
              {outletOptions.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </IzSelect>
            <FieldError message={errors.outlet} />
          </div>
          <div className="iz-field !mb-0">
            <label>Date *</label>
            <input
              type="date"
              value={shift.date}
              className={errors.date ? '!border-[var(--iz-red)]' : undefined}
              onChange={(e) => {
                setShift((s) => ({ ...s, date: e.target.value }));
                if (errors.date) setErrors((er) => ({ ...er, date: '' }));
              }}
            />
            <FieldError message={errors.date} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="iz-field !mb-0">
              <label>Start time *</label>
              <input
                type="time"
                value={shift.startTime}
                className={
                  errors.startTime ? '!border-[var(--iz-red)]' : undefined
                }
                onChange={(e) => {
                  setShift((s) => ({ ...s, startTime: e.target.value }));
                  if (errors.startTime)
                    setErrors((er) => ({ ...er, startTime: '' }));
                }}
              />
              <FieldError message={errors.startTime} />
            </div>
            <div className="iz-field !mb-0">
              <label>End time *</label>
              <input
                type="time"
                value={shift.endTime}
                className={
                  errors.endTime ? '!border-[var(--iz-red)]' : undefined
                }
                onChange={(e) => {
                  setShift((s) => ({ ...s, endTime: e.target.value }));
                  if (errors.endTime)
                    setErrors((er) => ({ ...er, endTime: '' }));
                }}
              />
              <FieldError message={errors.endTime} />
            </div>
          </div>
          <div className="iz-field !mb-0">
            <label>Shift details *</label>
            <textarea
              rows={3}
              value={shift.details}
              placeholder="Dress code, base pay, VIP notes, meeting point…"
              className={`w-full resize-none rounded-xl border bg-[var(--iz-bg2)] px-3 py-2 text-xs text-[var(--iz-txt)] outline-none placeholder:text-[var(--iz-muted)] focus:border-[var(--iz-gold-d)] ${
                errors.details
                  ? 'border-[var(--iz-red)]'
                  : 'border-[var(--iz-line)]'
              }`}
              onChange={(e) => {
                setShift((s) => ({ ...s, details: e.target.value }));
                if (errors.details) setErrors((er) => ({ ...er, details: '' }));
              }}
            />
            <FieldError message={errors.details} />
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="iz-field !mb-0">
            <label>Subject *</label>
            <input
              value={message.subject}
              placeholder="e.g. Roster reminder"
              className={errors.subject ? '!border-[var(--iz-red)]' : undefined}
              onChange={(e) => {
                setMessage((m) => ({ ...m, subject: e.target.value }));
                if (errors.subject) setErrors((er) => ({ ...er, subject: '' }));
              }}
            />
            <FieldError message={errors.subject} />
          </div>
          <div className="iz-field !mb-0">
            <label>Message *</label>
            <textarea
              rows={4}
              value={message.body}
              placeholder="Your message to selected PRs…"
              className={`w-full resize-none rounded-xl border bg-[var(--iz-bg2)] px-3 py-2 text-xs text-[var(--iz-txt)] outline-none placeholder:text-[var(--iz-muted)] focus:border-[var(--iz-gold-d)] ${
                errors.body
                  ? 'border-[var(--iz-red)]'
                  : 'border-[var(--iz-line)]'
              }`}
              onChange={(e) => {
                setMessage((m) => ({ ...m, body: e.target.value }));
                if (errors.body) setErrors((er) => ({ ...er, body: '' }));
              }}
            />
            <FieldError message={errors.body} />
          </div>
        </div>
      )}

      <div className="iz-grid2 mt-4">
        <button type="button" className="iz-btn iz-btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="iz-btn iz-btn-primary" onClick={send}>
          Send {kind === 'shift' ? 'shift offer' : 'message'}
        </button>
      </div>
    </IzSheet>
  );
}
