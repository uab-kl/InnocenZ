import { createFileRoute } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { AppTopbar } from '@agency-portal/components/Nav';
import {
  OutletPage,
  OutletPageHeader,
} from '@agency-portal/components/outlet/outlet-portal-ui';
import { IzCard, IzSectionLabel } from '@agency-portal/components/iz/ui';
import { SecuritySettingsSheets } from '@agency-portal/components/auth/SecuritySettingsSheets';
import { useOutletProfile } from '@agency-portal/hooks/use-outlet-profile';
import { useStore } from '@agency-portal/lib/store';
import type {
  OutletFinanceHead,
  OutletOpsHead,
  OutletOwnerSettings,
} from '@agency-portal/lib/outlet-demo';
import { publicAssetPath } from '@agency-portal/lib/public-asset';
import { outletCan } from '@agency-portal/lib/outlet-rbac';
import {
  Building2,
  Camera,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Shield,
  User,
  Wrench,
  X,
} from 'lucide-react';

export const Route = createFileRoute('/outlet/_origsettings_check')({
  component: OutletSettingsPage,
});

function ToggleRow({
  label,
  desc,
  on,
  onChange,
}: {
  label: string;
  desc: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className="flex w-full items-center justify-between gap-3 border-b border-[var(--iz-line)] py-3 last:border-0 text-left"
    >
      <div>
        <div className="text-sm font-semibold">{label}</div>
        <div className="iz-tiny iz-muted mt-0.5">{desc}</div>
      </div>
      <span
        className={`h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors ${on ? 'bg-[var(--iz-green)]' : 'bg-[var(--iz-line)]'}`}
      >
        <span
          className={`block h-5 w-5 rounded-full bg-white transition-transform ${on ? 'translate-x-5' : 'translate-x-0'}`}
        />
      </span>
    </button>
  );
}

function OutletSettingsPage() {
  const outletOwner = useStore((s) => s.outletOwner);
  const outletFinanceHead = useStore((s) => s.outletFinanceHead);
  const outletOpsHead = useStore((s) => s.outletOpsHead);
  const outletSettings = useStore((s) => s.outletSettings);
  const saveOutletProfileSettings = useStore(
    (s) => s.saveOutletProfileSettings,
  );
  const saveOutletOwner = useStore((s) => s.saveOutletOwner);
  const saveOutletSettings = useStore((s) => s.saveOutletSettings);
  const outletSubRole = useStore((s) => s.outletSubRole);
  const toast = useStore((s) => s.toast);
  // Real login → overlay the real outlet identity in read mode (see the hook).
  const profile = useOutletProfile();

  const [editing, setEditing] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [draft, setDraft] = useState(outletOwner);
  const [financeDraft, setFinanceDraft] = useState(outletFinanceHead);
  const [opsDraft, setOpsDraft] = useState(outletOpsHead);
  const [locationDraft, setLocationDraft] = useState(outletSettings.location);
  const avatarFileRef = useRef<HTMLInputElement>(null);
  const canEdit = outletCan(outletSubRole, 'editSettings');

  // Read mode overlays the real backend identity (overlay carries only defined
  // fields, so demo values fill any gaps); editing uses the local draft. This
  // wire is read-only — the save flow still writes to the demo store only.
  const owner =
    !editing && profile.backed && profile.owner
      ? { ...outletOwner, ...profile.owner }
      : editing
        ? draft
        : outletOwner;
  const finance =
    !editing && profile.backed && profile.finance
      ? { ...outletFinanceHead, ...profile.finance }
      : editing
        ? financeDraft
        : outletFinanceHead;
  const ops =
    !editing && profile.backed && profile.ops
      ? { ...outletOpsHead, ...profile.ops }
      : editing
        ? opsDraft
        : outletOpsHead;
  const location =
    !editing && profile.backed && profile.settings?.location
      ? profile.settings.location
      : editing
        ? locationDraft
        : outletSettings.location;
  const avatarLetter =
    owner.ownerName.trim()[0]?.toUpperCase() ??
    owner.orgName.trim()[0]?.toUpperCase() ??
    'V';
  const editCardClass = editing ? ' border-[rgba(217,185,122,.25)]' : '';

  const update = (patch: Partial<OutletOwnerSettings>) =>
    setDraft((d) => ({ ...d, ...patch }));
  const updateFinance = (patch: Partial<OutletFinanceHead>) =>
    setFinanceDraft((d) => ({ ...d, ...patch }));
  const updateOps = (patch: Partial<OutletOpsHead>) =>
    setOpsDraft((d) => ({ ...d, ...patch }));

  const startEdit = () => {
    // Seed the edit form from the real identity when available.
    setDraft({ ...outletOwner, ...(profile.owner ?? {}) });
    setFinanceDraft({ ...outletFinanceHead, ...(profile.finance ?? {}) });
    setOpsDraft({ ...outletOpsHead, ...(profile.ops ?? {}) });
    setLocationDraft(profile.settings?.location ?? outletSettings.location);
    setEditing(true);
  };

  const cancelEdit = () => {
    setDraft({ ...outletOwner });
    setFinanceDraft({ ...outletFinanceHead });
    setOpsDraft({ ...outletOpsHead });
    setLocationDraft(outletSettings.location);
    setEditing(false);
  };

  const openAvatarUpload = () => {
    if (!editing) return;
    avatarFileRef.current?.click();
  };

  const onAvatarFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !editing) return;
    if (!file.type.startsWith('image/')) {
      toast('Please choose an image file', 'warn');
      return;
    }
    if (file.size > 2_500_000) {
      toast('Image must be under 2.5 MB', 'warn');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      update({ avatarPhoto: reader.result as string });
      toast('Profile photo updated', 'success');
    };
    reader.readAsDataURL(file);
  };

  const saveEdit = () => {
    if (!draft.ownerName.trim()) {
      toast('Enter owner name', 'warn');
      return;
    }
    if (!draft.mobile.trim()) {
      toast('Enter mobile number', 'warn');
      return;
    }
    if (!draft.orgName.trim()) {
      toast('Enter venue name', 'warn');
      return;
    }
    saveOutletProfileSettings({
      owner: {
        ...draft,
        ownerName: draft.ownerName.trim(),
        orgName: draft.orgName.trim(),
        email: outletOwner.email,
        mobile: outletOwner.mobile,
      },
      financeHead: { ...financeDraft },
      opsHead: { ...opsDraft },
      location: locationDraft.trim(),
    });
    setEditing(false);
  };

  if (!outletCan(outletSubRole, 'viewSettings')) {
    return (
      <div className="iz-screen">
        <header>
          <h2 className="font-sora text-lg font-extrabold text-[var(--iz-txt)]">
            Access restricted
          </h2>
        </header>
        <IzCard className="text-center">
          <p className="iz-sm iz-muted">
            You do not have access to outlet settings.
          </p>
        </IzCard>
      </div>
    );
  }

  const isSubRoleReadOnly =
    outletSubRole === 'outlet_finance' || outletSubRole === 'outlet_ops';
  const fieldsLocked = !editing || !canEdit;

  return (
    <OutletPage>
      {editing && <AppTopbar onBack={cancelEdit} backLabel="Cancel edit" />}
      <OutletPageHeader
        title="Settings"
        hint={owner.orgName}
        trailing={
          editing ? (
            <span className="iz-pill iz-pill-amber !text-[10px]">Editing</span>
          ) : undefined
        }
      />
      {isSubRoleReadOnly && !editing && (
        <p className="iz-tiny iz-muted rounded-lg border border-dashed border-[var(--iz-line)] px-2.5 py-1.5">
          {outletSubRole === 'outlet_finance'
            ? 'Finance view — read-only · cannot edit owner profile'
            : 'Ops view — read-only · cannot edit owner profile'}
        </p>
      )}

      <div className="iz-settings-profile flex flex-col items-center py-5">
        <input
          ref={avatarFileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={onAvatarFilePick}
        />
        <div className="relative">
          <div
            className={`iz-avatar iz-avatar--xl${owner.avatarPhoto ? ' iz-avatar-photo iz-avatar-photo--logo' : ''}`}
            style={
              owner.avatarPhoto
                ? undefined
                : { background: 'var(--iz-grad-outlet, var(--iz-grad))' }
            }
          >
            {owner.avatarPhoto ? (
              <img src={publicAssetPath(owner.avatarPhoto)} alt="" />
            ) : (
              avatarLetter
            )}
          </div>
          {editing && canEdit && (
            <>
              <button
                type="button"
                className="iz-avatar-edit"
                aria-label="Upload profile photo"
                onClick={openAvatarUpload}
              >
                <Camera className="h-3.5 w-3.5" />
              </button>
              {draft.avatarPhoto && (
                <button
                  type="button"
                  className="iz-avatar-remove"
                  aria-label="Remove profile photo"
                  onClick={() => update({ avatarPhoto: null })}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </>
          )}
        </div>
        <div className="mt-3 font-sora text-lg font-bold">{owner.orgName}</div>
        <p className="iz-tiny iz-muted mt-0.5">{owner.ownerName}</p>
        <div className="mt-1 flex items-center gap-1 iz-tiny text-[var(--iz-green)]">
          <Shield className="h-3 w-3" />
          {owner.accountActivated
            ? 'Verified · outlet active'
            : 'Pending OTP activation'}
        </div>
        {editing && canEdit && (
          <p className="iz-tiny iz-muted2 mt-2 text-center">
            Tap the camera to upload your outlet profile photo.
          </p>
        )}
      </div>

      <IzSectionLabel>Owner information</IzSectionLabel>
      <IzCard className={editCardClass}>
        <Field
          icon={User}
          label="Owner name"
          value={owner.ownerName}
          onChange={(v) => update({ ownerName: v })}
          readOnly={fieldsLocked}
        />
        <Field
          icon={Phone}
          label="Mobile"
          value={owner.mobile}
          onChange={() => {}}
          readOnly
          hint="Change in Login & security"
        />
        <Field
          icon={Mail}
          label="Email"
          value={owner.email}
          onChange={() => {}}
          readOnly
          hint="Change in Login & security"
        />
        <Field
          icon={Shield}
          label="IC (for PV)"
          value={owner.ic}
          onChange={(v) => update({ ic: v })}
          readOnly={fieldsLocked}
        />
        <Field
          icon={Building2}
          label="Venue"
          value={owner.orgName}
          onChange={(v) => update({ orgName: v })}
          readOnly={fieldsLocked}
        />
        <Field
          icon={MapPin}
          label="Location"
          value={location}
          onChange={setLocationDraft}
          readOnly={fieldsLocked}
        />
      </IzCard>

      <IzSectionLabel>Finance Head</IzSectionLabel>
      <IzCard className={editCardClass}>
        <p className="iz-tiny iz-muted mb-2">
          Weekly reconciliation · due Sundays · billing sign-off
        </p>
        <Field
          icon={User}
          label="Name"
          value={finance.name}
          onChange={(v) => updateFinance({ name: v })}
          readOnly={fieldsLocked}
        />
        <Field
          icon={Shield}
          label="IC"
          value={finance.ic}
          onChange={(v) => updateFinance({ ic: v })}
          readOnly={fieldsLocked}
        />
        <Field
          icon={Mail}
          label="Email"
          value={finance.email}
          onChange={(v) => updateFinance({ email: v })}
          readOnly={fieldsLocked}
        />
      </IzCard>

      <IzSectionLabel>Ops Head</IzSectionLabel>
      <IzCard className={editCardClass}>
        <p className="iz-tiny iz-muted mb-2">
          Floor operations · shift staffing · sales logging
        </p>
        <Field
          icon={Wrench}
          label="Name"
          value={ops.name}
          onChange={(v) => updateOps({ name: v })}
          readOnly={fieldsLocked}
        />
        <Field
          icon={Shield}
          label="IC"
          value={ops.ic}
          onChange={(v) => updateOps({ ic: v })}
          readOnly={fieldsLocked}
        />
        <Field
          icon={Mail}
          label="Email"
          value={ops.email}
          onChange={(v) => updateOps({ email: v })}
          readOnly={fieldsLocked}
        />
      </IzCard>

      <IzSectionLabel>Notifications</IzSectionLabel>
      <IzCard className="mt-2 !py-0 px-4">
        <ToggleRow
          label="Shift updates"
          desc="PR accept/decline · roster changes"
          on={outletSettings.notifyShiftUpdates}
          onChange={(v) => saveOutletSettings({ notifyShiftUpdates: v })}
        />
      </IzCard>

      <IzSectionLabel>Login &amp; security</IzSectionLabel>
      <IzCard>
        <p className="iz-tiny iz-muted mb-3">
          Update password anytime. Email and mobile changes require OTP
          verification.
        </p>
        <button
          type="button"
          className="iz-btn iz-btn-primary w-full"
          onClick={() => setSecurityOpen(true)}
        >
          Security settings
        </button>
      </IzCard>

      <SecuritySettingsSheets
        open={securityOpen}
        onClose={() => setSecurityOpen(false)}
        sheetVariant="side"
        email={outletOwner.email}
        mobile={outletOwner.mobile}
        canEdit={canEdit}
        onUpdateEmail={(email) => saveOutletOwner({ email })}
        onUpdateMobile={(mobile) => saveOutletOwner({ mobile })}
      />

      {canEdit && (
        <div className="iz-profile-actions mt-4">
          {editing ? (
            <>
              <button
                type="button"
                className="iz-btn iz-btn-primary"
                onClick={saveEdit}
              >
                Save settings
              </button>
              <button
                type="button"
                className="iz-btn iz-btn-soft mt-2.5"
                onClick={cancelEdit}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              className="iz-btn iz-btn-primary"
              onClick={startEdit}
            >
              <Pencil className="h-4 w-4" /> Edit settings
            </button>
          )}
        </div>
      )}
    </OutletPage>
  );
}

function Field({
  icon: Icon,
  label,
  value,
  onChange,
  readOnly,
  hint,
}: {
  icon: typeof User;
  label: string;
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
  hint?: string;
}) {
  return (
    <div className="border-b border-[var(--iz-line)] py-2.5 last:border-0">
      <div className="flex items-center gap-2 iz-tiny iz-muted">
        <Icon className="h-3 w-3" /> {label}
      </div>
      {readOnly ? (
        <>
          <p className="mt-1 font-medium text-[var(--iz-txt)]">
            {value || '—'}
          </p>
          {hint && <p className="iz-tiny iz-muted2 mt-0.5">{hint}</p>}
        </>
      ) : (
        <input
          className="mt-1 w-full bg-transparent font-medium text-[var(--iz-txt)] outline-none"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
