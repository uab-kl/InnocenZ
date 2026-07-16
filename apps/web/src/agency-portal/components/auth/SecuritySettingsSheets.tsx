import { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  KeyRound,
  Mail,
  Phone,
  X,
} from 'lucide-react';
import { IzSheet, type SheetVariant } from '@agency-portal/components/iz/Sheet';
import { OtpVerifySheet } from '@agency-portal/components/auth/OtpVerifySheet';
import { PasswordField } from '@agency-portal/components/auth/PasswordField';
import { verifyDemoOtp } from '@agency-portal/lib/verify-demo-otp';
import { useStore } from '@agency-portal/lib/store';

type SecurityView = 'menu' | 'password' | 'email' | 'phone';
type OtpPending = { field: 'email' | 'phone'; value: string } | null;

function SheetHead({
  title,
  onBack,
  onClose,
}: {
  title: string;
  onBack?: () => void;
  onClose: () => void;
}) {
  return (
    <div className="iz-sheet-head">
      {onBack ? (
        <button
          type="button"
          className="iz-sheet-back"
          onClick={onBack}
          aria-label="Back"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      ) : (
        <span className="iz-sheet-back-spacer" aria-hidden />
      )}
      <h3>{title}</h3>
      <button
        type="button"
        className="iz-sheet-close"
        onClick={onClose}
        aria-label="Close"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function SecurityMenuRow({
  icon: Icon,
  label,
  meta,
  onClick,
}: {
  icon: typeof KeyRound;
  label: string;
  meta?: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="iz-security-menu-row" onClick={onClick}>
      <span className="iz-security-menu-row__icon" aria-hidden>
        <Icon className="h-4 w-4" />
      </span>
      <span className="iz-security-menu-row__body">
        <span className="iz-security-menu-row__label">{label}</span>
        {meta && <span className="iz-security-menu-row__meta">{meta}</span>}
      </span>
      <ChevronRight className="iz-security-menu-row__chevron" aria-hidden />
    </button>
  );
}

export function SecuritySettingsSheets({
  open,
  onClose,
  email,
  mobile,
  canEdit = true,
  sheetVariant = 'dialog',
  onUpdateEmail,
  onUpdateMobile,
}: {
  open: boolean;
  onClose: () => void;
  email: string;
  mobile: string;
  canEdit?: boolean;
  sheetVariant?: SheetVariant;
  onUpdateEmail: (email: string) => void;
  onUpdateMobile: (mobile: string) => void;
}) {
  const toast = useStore((s) => s.toast);

  const [view, setView] = useState<SecurityView>('menu');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpOpen, setOtpOpen] = useState(false);
  const [otpPending, setOtpPending] = useState<OtpPending>(null);

  useEffect(() => {
    if (open) {
      setView('menu');
      setOtpOpen(false);
      setOtpPending(null);
      setOtp('');
    }
  }, [open]);

  const closeAll = () => {
    setView('menu');
    setOtpOpen(false);
    setOtpPending(null);
    setOtp('');
    onClose();
  };

  const backToMenu = () => {
    setView('menu');
    setOtpOpen(false);
    setOtpPending(null);
    setOtp('');
  };

  const changePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    if (!currentPassword.trim()) {
      toast('Enter your current password', 'warn');
      return;
    }
    if (!newPassword.trim()) {
      toast('Enter a new password', 'warn');
      return;
    }
    if (newPassword.length < 6) {
      toast('New password must be at least 6 characters', 'warn');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast('New passwords do not match', 'warn');
      return;
    }
    if (newPassword === currentPassword) {
      toast(
        'New password must be different from your current password',
        'warn',
      );
      return;
    }
    toast('Password updated successfully', 'success');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    backToMenu();
  };

  const requestEmailOtp = () => {
    if (!canEdit) return;
    const next = newEmail.trim();
    if (!next || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
      toast('Enter a valid email address', 'warn');
      return;
    }
    if (next === email.trim()) {
      toast('New email must be different from your current email', 'warn');
      return;
    }
    setOtpPending({ field: 'email', value: next });
    setOtp('');
    toast(`OTP sent to ${next}`, 'info');
    setOtpOpen(true);
  };

  const requestPhoneOtp = () => {
    if (!canEdit) return;
    const next = newPhone.trim();
    if (!next) {
      toast('Enter a mobile number', 'warn');
      return;
    }
    if (next === mobile.trim()) {
      toast('New mobile must be different from your current number', 'warn');
      return;
    }
    setOtpPending({ field: 'phone', value: next });
    setOtp('');
    toast(`OTP sent to ${next}`, 'info');
    setOtpOpen(true);
  };

  const verifyContactOtp = () => {
    if (!otpPending) return;
    if (!verifyDemoOtp(otp)) {
      toast('Invalid OTP — try 123456 for demo', 'warn');
      return;
    }
    if (otpPending.field === 'email') {
      onUpdateEmail(otpPending.value);
      setNewEmail('');
    } else {
      onUpdateMobile(otpPending.value);
      setNewPhone('');
    }
    setOtpPending(null);
    setOtp('');
    setOtpOpen(false);
    backToMenu();
  };

  const resendOtp = () => {
    if (!otpPending) return;
    toast(`OTP resent to ${otpPending.value}`, 'info');
  };

  const otpTitle =
    otpPending?.field === 'email' ? 'Verify new email' : 'Verify new mobile';

  return (
    <>
      <IzSheet
        open={open && view === 'menu'}
        onClose={closeAll}
        variant={sheetVariant}
      >
        <SheetHead title="Security settings" onClose={closeAll} />
        <p className="iz-tiny iz-muted mb-3">Choose what you want to update.</p>
        <div className="iz-security-menu">
          <SecurityMenuRow
            icon={KeyRound}
            label="Change password"
            onClick={() => setView('password')}
          />
          <SecurityMenuRow
            icon={Phone}
            label="Change phone"
            meta={mobile || undefined}
            onClick={() => setView('phone')}
          />
          <SecurityMenuRow
            icon={Mail}
            label="Change email"
            meta={email || undefined}
            onClick={() => setView('email')}
          />
        </div>
      </IzSheet>

      <IzSheet
        open={open && view === 'password'}
        onClose={backToMenu}
        variant={sheetVariant}
      >
        <SheetHead
          title="Change password"
          onBack={backToMenu}
          onClose={closeAll}
        />
        {canEdit ? (
          <form onSubmit={changePassword} className="iz-security-form">
            <PasswordField
              label="Current password"
              placeholder="Enter your current password"
              value={currentPassword}
              onChange={setCurrentPassword}
              show={showCurrent}
              onToggleShow={() => setShowCurrent((v) => !v)}
              autoComplete="current-password"
            />
            <PasswordField
              label="New password"
              placeholder="Enter your new password"
              value={newPassword}
              onChange={setNewPassword}
              show={showNew}
              onToggleShow={() => setShowNew((v) => !v)}
              autoComplete="new-password"
            />
            <PasswordField
              label="Confirm new password"
              placeholder="Confirm your new password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              show={showConfirm}
              onToggleShow={() => setShowConfirm((v) => !v)}
              autoComplete="new-password"
            />
            <button
              type="submit"
              className="iz-btn iz-btn-primary iz-security-form__submit"
            >
              Save password
            </button>
          </form>
        ) : (
          <p className="iz-tiny iz-muted">
            You do not have permission to change the password.
          </p>
        )}
      </IzSheet>

      <IzSheet
        open={open && view === 'email'}
        onClose={backToMenu}
        variant={sheetVariant}
      >
        <SheetHead
          title="Change email"
          onBack={backToMenu}
          onClose={closeAll}
        />
        <p className="iz-tiny iz-muted mb-2">Current email</p>
        <p className="iz-account-security__current mb-4">{email || '—'}</p>
        {canEdit ? (
          <>
            <label className="iz-tiny iz-muted">New email address</label>
            <input
              type="email"
              className="iz-account-security__input mt-1"
              placeholder="you@example.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              autoComplete="email"
            />
            <button
              type="button"
              className="iz-btn iz-btn-primary mt-4 w-full"
              onClick={requestEmailOtp}
            >
              Send OTP &amp; update
            </button>
          </>
        ) : (
          <p className="iz-tiny iz-muted">Read-only for your role.</p>
        )}
      </IzSheet>

      <IzSheet
        open={open && view === 'phone'}
        onClose={backToMenu}
        variant={sheetVariant}
      >
        <SheetHead
          title="Change phone"
          onBack={backToMenu}
          onClose={closeAll}
        />
        <p className="iz-tiny iz-muted mb-2">Current mobile</p>
        <p className="iz-account-security__current mb-4">{mobile || '—'}</p>
        {canEdit ? (
          <>
            <label className="iz-tiny iz-muted">New mobile number</label>
            <input
              type="tel"
              className="iz-account-security__input mt-1"
              placeholder="+60 12-345 6789"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              autoComplete="tel"
            />
            <button
              type="button"
              className="iz-btn iz-btn-primary mt-4 w-full"
              onClick={requestPhoneOtp}
            >
              Send OTP &amp; update
            </button>
          </>
        ) : (
          <p className="iz-tiny iz-muted">Read-only for your role.</p>
        )}
      </IzSheet>

      <OtpVerifySheet
        open={otpOpen}
        variant={sheetVariant}
        onClose={() => {
          setOtpOpen(false);
          setOtpPending(null);
          setOtp('');
        }}
        title={otpTitle}
        description={
          otpPending ? (
            <>
              Enter the 6-digit code sent to{' '}
              <b className="text-[var(--iz-txt)]">{otpPending.value}</b>
            </>
          ) : (
            ''
          )
        }
        otp={otp}
        onOtpChange={setOtp}
        onVerify={verifyContactOtp}
        onResend={resendOtp}
        verifyLabel="Verify & save"
      />
    </>
  );
}
