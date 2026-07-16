import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  LogIn,
  Mail,
  User,
  Users,
} from 'lucide-react';
import { PhoneFrame, InnocenZLogoMark } from '@agency-portal/components/Brand';
import { Toasts } from '@agency-portal/components/Toasts';
import {
  isValidDemoOtp,
  OtpVerifySheet,
} from '@agency-portal/components/auth/OtpVerifySheet';
import { PortalAuthFrame } from '@agency-portal/components/auth/PortalAuthFrame';
import { IzCardTitle } from '@agency-portal/components/iz/ui';
import { TitleWithIcon } from '@agency-portal/components/iz/TitleWithIcon';
import { IzSheet } from '@agency-portal/components/iz/Sheet';
import { useStore } from '@agency-portal/lib/store';
import {
  PORTAL_SIGNIN_LABELS,
  defaultSignInIdentifier,
  portalHomePath,
  portalUsesEmailSignIn,
  resolveSignInEmail,
  subRolesForPortal,
  type PortalSubRoleItem,
  type SignInPortal,
} from '@agency-portal/lib/portal-signin';
import {
  PORTAL_TITLE_ICONS,
  SUB_ROLE_TITLE_ICONS,
} from '@agency-portal/lib/title-icons';

type ResetChannel = 'email' | 'phone';

function detectChannel(value: string): ResetChannel {
  return value.trim().includes('@') ? 'email' : 'phone';
}

function resolveIdentifier(
  value: string,
): { channel: ResetChannel; identifier: string } | null {
  const identifier = value.trim();
  if (!identifier) return null;
  return { channel: detectChannel(identifier), identifier };
}

function displayNameForContact(contact: {
  channel: ResetChannel;
  identifier: string;
}) {
  return contact.channel === 'email'
    ? contact.identifier.split('@')[0] || 'User'
    : 'User';
}

export function PortalSignInScreen({ portal }: { portal: SignInPortal }) {
  const navigate = useNavigate();
  const signIn = useStore((s) => s.signIn);
  const setRole = useStore((s) => s.setRole);
  const setPrSubRole = useStore((s) => s.setPrSubRole);
  const setOutletSubRole = useStore((s) => s.setOutletSubRole);
  const setAgencySubRole = useStore((s) => s.setAgencySubRole);
  const toast = useStore((s) => s.toast);

  const emailOnly = portalUsesEmailSignIn(portal);
  const [identifier, setIdentifier] = useState(() =>
    defaultSignInIdentifier(portal),
  );
  const [password, setPassword] = useState('password');
  const [showPassword, setShowPassword] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotContact, setForgotContact] = useState<{
    channel: ResetChannel;
    identifier: string;
  } | null>(null);
  const [forgotOtp, setForgotOtp] = useState('');
  const [subRoleOpen, setSubRoleOpen] = useState(false);
  const [pendingContact, setPendingContact] = useState<{
    displayName: string;
    loginIdentifier: string;
  } | null>(null);

  const portalLabel = PORTAL_SIGNIN_LABELS[portal];
  const PortalIcon = PORTAL_TITLE_ICONS[portal];
  const subRoles = subRolesForPortal(portal);
  const needsSubRole = subRoles.length > 0;

  const enterPortal = (item?: PortalSubRoleItem) => {
    navigate({ to: portalHomePath(portal, item) });
  };

  const completeSignIn = (displayName: string, loginIdentifier: string) => {
    signIn(displayName, loginIdentifier);
    if (needsSubRole) {
      setPendingContact({ displayName, loginIdentifier });
      setSubRoleOpen(true);
      return;
    }
    enterPortal();
  };

  const pickSubRole = (item: PortalSubRoleItem) => {
    setRole(item.role);
    setPrSubRole(item.prSubRole ?? null);
    setOutletSubRole(item.outletSubRole ?? null);
    setAgencySubRole(item.agencySubRole ?? null);
    setSubRoleOpen(false);
    setPendingContact(null);
    enterPortal(item);
  };

  const resolveLoginContact = (): {
    channel: ResetChannel;
    identifier: string;
    displayName: string;
  } | null => {
    if (emailOnly) {
      const email = resolveSignInEmail(identifier);
      if (!email) {
        toast('Enter your email address', 'warn');
        return null;
      }
      return {
        channel: 'email',
        identifier: email,
        displayName: email.split('@')[0] || 'User',
      };
    }

    const contact = resolveIdentifier(identifier);
    if (!contact) {
      toast('Enter your email or phone number', 'warn');
      return null;
    }
    return {
      ...contact,
      displayName: displayNameForContact(contact),
    };
  };

  const otpChannelLabel =
    forgotContact?.channel === 'phone' ? 'mobile' : 'email';

  const sendForgotOtpToast = () => {
    if (!forgotContact) return;
    toast(`Password reset OTP sent to your ${otpChannelLabel}`, 'info');
  };

  const openForgotPassword = () => {
    const contact = resolveLoginContact();
    if (!contact) return;
    setForgotContact({
      channel: contact.channel,
      identifier: contact.identifier,
    });
    setForgotOtp('');
    setForgotOpen(true);
    toast(`Password reset OTP sent to your ${otpChannelLabel}`, 'info');
  };

  const verifyForgotOtp = () => {
    if (!forgotContact) return;
    if (isValidDemoOtp(forgotOtp)) {
      setForgotOpen(false);
      setForgotOtp('');
      navigate({
        to: '/reset-password',
        search: {
          channel: forgotContact.channel,
          identifier: forgotContact.identifier,
          portal,
        },
      });
      return;
    }
    toast('Invalid OTP — try 123456 for demo', 'warn');
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const contact = resolveLoginContact();
    if (!contact) return;
    if (!password.trim()) {
      toast('Enter your password', 'warn');
      return;
    }
    completeSignIn(contact.displayName, contact.identifier);
  };

  const overlays = (
    <>
      <Toasts />
      <OtpVerifySheet
        open={forgotOpen}
        onClose={() => setForgotOpen(false)}
        title="Verify OTP"
        description={
          <>
            Enter the 6-digit OTP sent to your {otpChannelLabel}{' '}
            <b className="text-[var(--iz-txt)]">{forgotContact?.identifier}</b>
          </>
        }
        otp={forgotOtp}
        onOtpChange={setForgotOtp}
        onVerify={verifyForgotOtp}
        onResend={sendForgotOtpToast}
      />
      <IzSheet
        open={subRoleOpen}
        onClose={() => {
          setSubRoleOpen(false);
          setPendingContact(null);
        }}
      >
        <IzCardTitle icon={Users}>{portalLabel} sub-role</IzCardTitle>
        <p className="iz-tiny iz-muted mt-1">
          {pendingContact
            ? `Signed in as ${pendingContact.displayName} — pick how you enter ${portalLabel.toLowerCase()}.`
            : `Pick how you enter ${portalLabel.toLowerCase()}.`}
        </p>
        <div className="mt-3 space-y-2">
          {subRoles.map((item) => (
            <button
              key={item.label}
              type="button"
              className="iz-card iz-between flex w-full cursor-pointer text-left"
              onClick={() => pickSubRole(item)}
            >
              <div className="font-sora text-[15px] font-bold text-[var(--iz-txt)]">
                <TitleWithIcon
                  icon={SUB_ROLE_TITLE_ICONS[item.label] ?? PortalIcon}
                >
                  {item.label}
                </TitleWithIcon>
              </div>
              <span className="iz-iconbox">
                <ArrowRight className="h-4 w-4" />
              </span>
            </button>
          ))}
        </div>
      </IzSheet>
    </>
  );

  const form = (
    <>
      <button
        type="button"
        onClick={() => navigate({ to: '/' })}
        className="iz-chip w-fit"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>

      <InnocenZLogoMark className="mt-8" />

      <div className={emailOnly ? 'mt-2' : 'text-center'}>
        <p
          className={`iz-tiny ${emailOnly ? 'mt-0 text-[15px] font-semibold text-[var(--iz-txt)]' : 'iz-muted mt-4'}`}
        >
          <TitleWithIcon icon={PortalIcon}>{portalLabel} sign in</TitleWithIcon>
        </p>
        {emailOnly && (
          <p className="iz-tiny iz-muted2 mt-1">
            Use your work email to access the {portalLabel.toLowerCase()}{' '}
            portal.
          </p>
        )}
      </div>

      <form onSubmit={submit} className="mt-8 flex flex-col gap-3">
        <label className="iz-field">
          <span className="flex items-center gap-3 rounded-[13px] border border-[var(--iz-line2)] bg-white/[0.03] px-4 py-3">
            {emailOnly ? (
              <Mail className="h-4 w-4 shrink-0 text-[var(--iz-muted)]" />
            ) : (
              <User className="h-4 w-4 shrink-0 text-[var(--iz-muted)]" />
            )}
            <input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={
                emailOnly ? 'Email address' : 'Email or phone number'
              }
              type={emailOnly ? 'email' : 'text'}
              inputMode={emailOnly ? 'email' : 'text'}
              autoComplete="username"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </span>
        </label>

        <label className="iz-field">
          <span className="flex items-center gap-3 rounded-[13px] border border-[var(--iz-line2)] bg-white/[0.03] px-4 py-3">
            <Lock className="h-4 w-4 shrink-0 text-[var(--iz-muted)]" />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              type={showPassword ? 'text' : 'password'}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
            <button
              type="button"
              className="iz-signin-password-toggle"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </span>
        </label>

        <div className="flex justify-end">
          <button
            type="button"
            className="iz-tiny text-[var(--iz-gold-l)] underline-offset-2 hover:underline"
            onClick={openForgotPassword}
          >
            Forgot password?
          </button>
        </div>

        <button type="submit" className="iz-btn iz-btn-primary mt-2">
          <LogIn className="h-4 w-4" aria-hidden /> Sign In
        </button>
      </form>

      {portal === 'pr' && (
        <button
          type="button"
          onClick={() => navigate({ to: '/register' })}
          className="iz-sm iz-muted mt-6 text-center"
        >
          New here? <span className="text-[var(--iz-gold-l)]">Create one</span>
        </button>
      )}
    </>
  );

  if (portal === 'outlet' || portal === 'agency') {
    return (
      <PortalAuthFrame portal={portal} overlay={overlays}>
        <div className="iz-portal-auth-card">{form}</div>
      </PortalAuthFrame>
    );
  }

  return (
    <PhoneFrame overlay={overlays}>
      <div className="iz-welcome flex flex-1 flex-col">{form}</div>
    </PhoneFrame>
  );
}
