/**
 * PR self sign-up — the prototype's six-step register wizard
 * (src/routes/register.tsx) rebuilt in React Native against the real backend.
 *
 * Structure follows the prototype exactly: a `Step N of 6` eyebrow, icon +
 * title + subtitle, step dots, and a Previous / Continue footer that becomes
 * `Create account` on the summary and `Verify & submit` on the OTP step.
 *
 * OTP is LAST, as in the prototype — everything is collected first, the code is
 * sent when the PR taps Create account, and the account is only created after
 * the code passes. That still satisfies the register gate (verify, then
 * create); it just moves the verification to the end of the form.
 *
 * PRs verify by WhatsApp — every PR has it, and it sidesteps the MCMC
 * alphanumeric-sender registration that plain SMS in Malaysia needs. Agency +
 * outlet accounts verify by EMAIL instead, so this flow is PR-only and always
 * sends channel 'whatsapp'.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { C, F } from '../theme/theme';
import {
  ApiError,
  fetchPublicAgencies,
  registerPr,
  sendPrOtp,
  verifyPrOtp,
  type PublicAgency,
} from '../lib/api';
import { useSession } from '../lib/session';
import { IzButton } from '../components/ui';
import {
  Building2,
  Check,
  ChevronLeft,
  ClipboardList,
  Eye,
  EyeOff,
  MapPin,
  Phone,
  Shield,
  UserIcon,
  type IconComponent,
} from '../components/icons';

const STEPS: { title: string; subtitle: string; icon: IconComponent }[] = [
  { title: 'Persona', subtitle: 'Your details', icon: UserIcon },
  { title: 'Address', subtitle: 'Where you live', icon: MapPin },
  { title: 'Agency', subtitle: 'Optional tie', icon: Building2 },
  { title: 'Verify', subtitle: 'ID & gallery photos', icon: Shield },
  { title: 'Summary', subtitle: 'Review & submit', icon: ClipboardList },
  { title: 'OTP', subtitle: 'Verify your mobile', icon: Phone },
];

const DIAL_CODES = ['+60', '+65', '+62', '+66', '+63', '+86', '+91', '+1', '+44', '+61'];

const NATIONALITIES = [
  'Malaysia', 'Singapore', 'Indonesia', 'Thailand', 'Philippines', 'China', 'India',
  'Brunei', 'Vietnam', 'Myanmar', 'Cambodia', 'Laos', 'Japan', 'South Korea', 'Taiwan',
  'Hong Kong', 'Australia', 'New Zealand', 'United Kingdom', 'United States', 'Canada',
  'France', 'Germany', 'Netherlands', 'Russia', 'Bangladesh', 'Pakistan', 'Nepal',
  'Sri Lanka',
];

const MY_STATES = [
  'Johor', 'Kedah', 'Kelantan', 'Malacca', 'Negeri Sembilan', 'Pahang', 'Penang', 'Perak',
  'Perlis', 'Sabah', 'Sarawak', 'Selangor', 'Terengganu', 'Kuala Lumpur', 'Labuan',
  'Putrajaya',
];

const ID_TYPES = ['NRIC', 'Passport', 'Work permit'] as const;
type IdType = (typeof ID_TYPES)[number];

const NRIC_LENGTH = 12;
const CODE_LENGTH = 6;
const MIN_PASSWORD = 6; // matches RegisterSchema on the backend
const RESEND_SECONDS = 60;

type Draft = {
  floorNickname: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneDialCode: string;
  phoneNumber: string;
  nationality: string;
  idType: IdType;
  idNo: string;
  dob: string;
  password: string;
  confirm: string;
  addressLine1: string;
  addressLine2: string;
  postcode: string;
  state: string;
  country: string;
  underAgency: boolean | null;
  /**
   * Chosen from the backend list — the agency that referred them, or one to
   * join. Only ids that came from `GET /auth/agencies` are ever stored, so a
   * PR can never name an agency that does not exist.
   */
  agencyId: string | null;
};

function emptyDraft(): Draft {
  return {
    floorNickname: '', firstName: '', lastName: '', email: '',
    phoneDialCode: '+60', phoneNumber: '', nationality: 'Malaysia',
    idType: 'NRIC', idNo: '', dob: '', password: '', confirm: '',
    addressLine1: '', addressLine2: '', postcode: '', state: '',
    country: 'Malaysia', underAgency: null, agencyId: null,
  };
}

/** NRIC opens with the DOB as YYMMDD — same derivation as the prototype. */
function dobToNricPrefix(dob: string): string {
  const [year, month, day] = dob.split('-');
  if (!year || !month || !day) return '';
  return `${year.slice(-2)}${month}${day}`;
}

/** Keep the NRIC suffix (digits 7–12) when DOB changes; refresh the prefix. */
function mergeNricWithDob(dob: string, idNo: string): string {
  const prefix = dobToNricPrefix(dob);
  const digits = idNo.replace(/\D/g, '').slice(0, NRIC_LENGTH);
  if (!prefix) return digits;
  return prefix + (digits.length > 6 ? digits.slice(6) : '');
}

export function SignUpScreen({ onBackToSignIn }: { onBackToSignIn: () => void }) {
  const { signIn } = useSession();

  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [otp, setOtp] = useState('');
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [agencies, setAgencies] = useState<PublicAgency[]>([]);
  const [agencyState, setAgencyState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const [agencySearch, setAgencySearch] = useState('');

  /** Search only narrows the real backend list — it never invents an entry. */
  const visibleAgencies = useMemo(() => {
    const q = agencySearch.trim().toLowerCase();
    if (!q) return agencies;
    return agencies.filter((a) => a.name.toLowerCase().includes(q));
  }, [agencies, agencySearch]);

  const loadAgencies = useCallback(() => {
    setAgencyState('loading');
    fetchPublicAgencies()
      .then((list) => {
        setAgencies(list);
        setAgencyState('ready');
      })
      .catch(() => setAgencyState('failed'));
  }, []);

  const agencyFetched = useRef(false);
  const scroller = useRef<ScrollView | null>(null);
  const current = STEPS[step - 1];
  const patch = (part: Partial<Draft>) => setDraft((d) => ({ ...d, ...part }));

  /** Local digits only — the 0 and country prefixes never live in state. */
  const localDigits = draft.phoneNumber.replace(/\D/g, '').replace(/^0+/, '').slice(0, 10);
  const fullPhone = `${draft.phoneDialCode}${localDigits}`;
  const phoneNum = `${draft.phoneDialCode.replace('+', '')}${localDigits}`;

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  useEffect(() => {
    scroller.current?.scrollTo({ y: 0, animated: false });
    setError(null);
    setNotice(null);
  }, [step]);

  // Load the agency list once, when the PR first reaches the Agency step.
  // Guarded by a ref, not by agencyState — depending on the state we set here
  // would re-run the effect and cancel the in-flight request via its cleanup.
  useEffect(() => {
    if (step !== 3 || agencyFetched.current) return;
    agencyFetched.current = true;
    loadAgencies();
  }, [step, loadAgencies]);

  const describe = (e: unknown, fallback: string) =>
    e instanceof ApiError ? e.message : fallback;

  /** Returns an error string, or null when the step is complete. */
  const validate = (s: number): string | null => {
    if (s === 1) {
      if (!draft.floorNickname.trim()) return 'A floor nickname is required.';
      if (!draft.firstName.trim() || !draft.lastName.trim()) return 'Both legal names are required.';
      if (localDigits.length < 9) return 'That mobile number looks too short.';
      if (!draft.dob.trim()) return 'Date of birth is required.';
      if (!draft.idNo.trim()) return 'ID number is required.';
      if (draft.password.length < MIN_PASSWORD)
        return `Password must be at least ${MIN_PASSWORD} characters.`;
      if (draft.password !== draft.confirm) return 'Both passwords must match.';
      return null;
    }
    if (s === 2) {
      if (!draft.addressLine1.trim()) return 'Address line 1 is required.';
      if (!draft.postcode.trim()) return 'Postcode is required.';
      if (!draft.state.trim()) return 'Please choose a state.';
      return null;
    }
    if (s === 3) {
      if (draft.underAgency === null) return 'Please tell us whether an agency referred you.';
      // Referred PRs must name the agency; joining a new one stays optional so
      // nobody is blocked from finishing sign-up.
      if (draft.underAgency === true && !draft.agencyId)
        return 'Please pick the agency that added you.';
      return null;
    }
    return null;
  };

  const goNext = () => {
    const problem = validate(step);
    if (problem) {
      setError(problem);
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length));
  };

  const goBack = () => {
    if (step === 1) {
      onBackToSignIn();
      return;
    }
    setStep((s) => s - 1);
  };

  /** Summary → send the code and move to the OTP step. */
  const proceedToVerification = useCallback(
    async (resending = false) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        const res = await sendPrOtp(phoneNum);
        setResendIn(res.resendAfterSec || RESEND_SECONDS);
        setOtp('');
        setStep(6);
        setNotice(
          resending ? 'A new code is on its way.' : `Code sent on WhatsApp to ${fullPhone}.`,
        );
      } catch (e) {
        // The number is already taken — send them back to fix it rather than
        // stranding them on the summary. A cheap availability check on step 1
        // would catch this sooner, but no such endpoint exists yet.
        if (e instanceof ApiError && e.status === 409) {
          setStep(1);
          setError('That number already has an account. Use another, or sign in.');
        } else {
          setError(describe(e, 'Could not send the code — please try again.'));
        }
      } finally {
        setBusy(false);
      }
    },
    [busy, phoneNum, fullPhone],
  );

  /** OTP step → verify, create the account, then sign straight in. */
  const verifyAndSubmit = async () => {
    if (busy) return;
    if (otp.length !== CODE_LENGTH) {
      setError('Enter all six digits.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const verified = verificationId ?? (await verifyPrOtp(phoneNum, otp)).verificationId;
      setVerificationId(verified);
      await registerPr({
        verificationId: verified,
        phoneNum,
        username: draft.floorNickname.trim(),
        password: draft.password,
        email: draft.email.trim() || undefined,
      });
      await signIn(phoneNum, draft.password);
    } catch (e) {
      setOtp('');
      if (e instanceof ApiError && e.status === 410) {
        setError('That code expired. Tap Resend for a new one.');
      } else {
        setError(describe(e, 'That code is not right. Check and try again.'));
      }
    } finally {
      setBusy(false);
    }
  };

  const primary =
    step < 5
      ? { label: busy ? 'Please wait…' : 'Continue', onPress: goNext }
      : step === 5
        ? { label: busy ? 'Sending…' : 'Create account', onPress: () => proceedToVerification() }
        : { label: busy ? 'Submitting…' : 'Verify & submit', onPress: verifyAndSubmit };

  return (
    <View style={styles.screen}>
      <View style={styles.head}>
        <Text style={styles.eyebrow}>
          STEP {step} OF {STEPS.length}
        </Text>
        <View style={styles.titleRow}>
          <current.icon size={19} color={C.accent} strokeWidth={2.2} />
          <Text style={styles.title}>{current.title}</Text>
        </View>
        <Text style={styles.subtitle}>{current.subtitle}</Text>
      </View>

      <View style={styles.dots}>
        {STEPS.map((_, i) => (
          <View key={i} style={[styles.dot, i + 1 <= step && styles.dotOn]} />
        ))}
      </View>

      <ScrollView
        ref={scroller}
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
      >
        {step === 1 && (
          <>
            <Field label="Floor nickname" hint="Shown on roster and the outlet floor. Your legal name stays private for payroll.">
              <Input value={draft.floorNickname} onChangeText={(t) => patch({ floorNickname: t.slice(0, 20) })} placeholder="e.g. Moon, Charlotte" />
            </Field>
            <Row>
              <Field label="Legal first name" flex>
                <Input value={draft.firstName} onChangeText={(t) => patch({ firstName: t })} placeholder="First" autoCapitalize="words" />
              </Field>
              <Field label="Legal last name" flex>
                <Input value={draft.lastName} onChangeText={(t) => patch({ lastName: t })} placeholder="Last" autoCapitalize="words" />
              </Field>
            </Row>
            <Field label="Mobile number" hint="Must be on WhatsApp — that is where your code is sent.">
              <View style={styles.inline}>
                <Picker value={draft.phoneDialCode} options={DIAL_CODES} onSelect={(v) => patch({ phoneDialCode: v })} width={92} />
                <View style={{ flex: 1 }}>
                  <Input value={localDigits} onChangeText={(t) => patch({ phoneNumber: t })} placeholder="123456789" keyboardType="phone-pad" />
                </View>
              </View>
            </Field>
            <Field label="Email" hint="Optional — used for receipts and notices.">
              <Input value={draft.email} onChangeText={(t) => patch({ email: t })} placeholder="you@example.com" keyboardType="email-address" />
            </Field>
            <Field label="Nationality">
              <Picker value={draft.nationality} options={NATIONALITIES} onSelect={(v) => patch({ nationality: v })} />
            </Field>
            <Row>
              <Field label="ID type" flex>
                <Picker value={draft.idType} options={[...ID_TYPES]} onSelect={(v) => patch({ idType: v as IdType })} />
              </Field>
              <Field label="Date of birth" flex>
                <Input
                  value={draft.dob}
                  onChangeText={(t) => {
                    const dob = t.slice(0, 10);
                    patch({ dob, idNo: draft.idType === 'NRIC' ? mergeNricWithDob(dob, draft.idNo) : draft.idNo });
                  }}
                  placeholder="YYYY-MM-DD"
                />
              </Field>
            </Row>
            <Field label="ID number" hint={draft.idType === 'NRIC' ? 'First six digits follow your date of birth.' : undefined}>
              <Input
                value={draft.idNo}
                onChangeText={(t) => patch({ idNo: draft.idType === 'NRIC' ? mergeNricWithDob(draft.dob, t) : t })}
                placeholder={draft.idType === 'NRIC' ? '000000000000' : 'Document number'}
              />
            </Field>
            <Field label="Password">
              <View style={styles.inputWrap}>
                <TextInput
                  style={styles.input}
                  value={draft.password}
                  onChangeText={(t) => patch({ password: t })}
                  placeholder={`At least ${MIN_PASSWORD} characters`}
                  placeholderTextColor={C.muted2}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
                  {showPassword ? <EyeOff size={16} color={C.muted2} /> : <Eye size={16} color={C.muted2} />}
                </Pressable>
              </View>
            </Field>
            <Field label="Confirm password">
              <Input value={draft.confirm} onChangeText={(t) => patch({ confirm: t })} placeholder="Repeat the password" secureTextEntry={!showPassword} />
            </Field>
          </>
        )}

        {step === 2 && (
          <>
            <Field label="Address line 1">
              <Input value={draft.addressLine1} onChangeText={(t) => patch({ addressLine1: t })} placeholder="Unit, street" />
            </Field>
            <Field label="Address line 2" hint="Optional.">
              <Input value={draft.addressLine2} onChangeText={(t) => patch({ addressLine2: t })} placeholder="Area" />
            </Field>
            <Row>
              <Field label="Postcode" flex>
                <Input value={draft.postcode} onChangeText={(t) => patch({ postcode: t.replace(/\D/g, '').slice(0, 5) })} placeholder="50000" keyboardType="number-pad" />
              </Field>
              <Field label="State" flex>
                <Picker value={draft.state || 'Choose'} options={MY_STATES} onSelect={(v) => patch({ state: v })} />
              </Field>
            </Row>
            <Field label="Country">
              <Picker value={draft.country} options={NATIONALITIES} onSelect={(v) => patch({ country: v })} />
            </Field>
          </>
        )}

        {step === 3 && (
          <>
            <Field label="Did an agency refer you?" hint="Either way, an agency has to add you before you can be given shifts.">
              <View style={styles.inline}>
                <Choice
                  label="Yes"
                  on={draft.underAgency === true}
                  onPress={() => {
                    setError(null);
                    setAgencySearch('');
                    patch({ underAgency: true, agencyId: null });
                  }}
                />
                <Choice
                  label="No"
                  on={draft.underAgency === false}
                  onPress={() => {
                    setError(null);
                    setAgencySearch('');
                    patch({ underAgency: false, agencyId: null });
                  }}
                />
              </View>
            </Field>

            {draft.underAgency !== null && (
              <Field
                label={draft.underAgency ? 'Which agency added you?' : 'Agencies you can ask to join'}
                hint={
                  draft.underAgency
                    ? 'Pick the agency that signed you up.'
                    : 'Optional — pick one and they get your request. You can also do this later from Profile.'
                }
              >
                {agencyState === 'loading' && <Text style={styles.note}>Loading agencies…</Text>}

                {agencyState === 'ready' && agencies.length > 0 && (
                  <View style={{ marginBottom: 10 }}>
                    <Input
                      value={agencySearch}
                      onChangeText={setAgencySearch}
                      placeholder="Search agencies"
                    />
                  </View>
                )}

                {agencyState === 'ready' && visibleAgencies.length > 0 && (
                  <View style={styles.agencyList}>
                    {visibleAgencies.map((a) => (
                      <Pressable
                        key={a.id}
                        onPress={() =>
                          patch({ agencyId: draft.agencyId === a.id ? null : a.id })
                        }
                        style={[styles.agencyRow, draft.agencyId === a.id && styles.agencyRowOn]}
                      >
                        <Text
                          style={[
                            styles.agencyName,
                            draft.agencyId === a.id && styles.agencyNameOn,
                          ]}
                          numberOfLines={1}
                        >
                          {a.name}
                        </Text>
                        {draft.agencyId === a.id && <Check size={15} color={C.accent} strokeWidth={2.6} />}
                      </Pressable>
                    ))}
                  </View>
                )}

                {agencyState === 'ready' && agencies.length === 0 && (
                  <Text style={styles.note}>No agencies are listed yet.</Text>
                )}

                {/* Only agencies returned by the backend can be picked, so a
                    fruitless search means the agency genuinely is not on the
                    platform — never a typo the PR can talk their way around. */}
                {agencyState === 'ready' && agencies.length > 0 && visibleAgencies.length === 0 && (
                  <Text style={styles.note}>
                    No agency matches “{agencySearch.trim()}”.
                  </Text>
                )}

                {agencyState === 'failed' && (
                  <View>
                    <Text style={[styles.note, { marginBottom: 8 }]}>
                      Could not load the agency list.
                    </Text>
                    <IzButton label="Try again" variant="soft" small onPress={loadAgencies} />
                  </View>
                )}
              </Field>
            )}

            {/* Only worth saying when they could not find the agency on the
                list and are falling back to typing the name. */}
            {draft.underAgency === true &&
              !draft.agencyId &&
              (agencyState === 'failed' ||
                (agencyState === 'ready' && agencies.length > 0 && visibleAgencies.length === 0)) && (
                <Text style={styles.note}>
                  Tell your agency your floor nickname and mobile number — they link you from Manage PR.
                </Text>
              )}
            {draft.underAgency === false && draft.agencyId && (
              <Text style={styles.note}>
                They still have to accept you before you can be given shifts.
              </Text>
            )}
          </>
        )}

        {step === 4 && (
          <View style={styles.placeholder}>
            <Shield size={26} color={C.muted2} strokeWidth={1.8} />
            <Text style={styles.placeholderTitle}>ID &amp; gallery photos</Text>
            <Text style={styles.placeholderBody}>
              ID front and back, profile photo and portfolio gallery are not built on mobile yet.
              You can finish signing up now and add them from Profile afterwards.
            </Text>
          </View>
        )}

        {step === 5 && (
          <>
            <SummaryRow label="Floor nickname" value={draft.floorNickname} />
            <SummaryRow label="Legal name" value={`${draft.firstName} ${draft.lastName}`.trim()} />
            <SummaryRow label="Mobile" value={fullPhone} />
            <SummaryRow label="Email" value={draft.email || '—'} />
            <SummaryRow label="Nationality" value={draft.nationality} />
            <SummaryRow label={draft.idType} value={draft.idNo} />
            <SummaryRow label="Date of birth" value={draft.dob} />
            <SummaryRow
              label="Address"
              value={[draft.addressLine1, draft.addressLine2, draft.postcode, draft.state, draft.country].filter(Boolean).join(', ')}
            />
            <SummaryRow label="Agency referral" value={draft.underAgency ? 'Yes' : 'No'} />
            <SummaryRow
              label={draft.underAgency ? 'Added by' : 'Asking to join'}
              value={agencies.find((a) => a.id === draft.agencyId)?.name || '—'}
            />
            <Text style={styles.note}>
              Tapping Create account sends a 6-digit code to {fullPhone} on WhatsApp.
            </Text>
          </>
        )}

        {step === 6 && (
          <View style={styles.otpWrap}>
            <View style={styles.otpIcon}>
              <Phone size={26} color={C.accentL} strokeWidth={2} />
            </View>
            <Text style={styles.otpLead}>
              Enter the 6-digit code sent on WhatsApp to{' '}
              <Text style={styles.otpPhone}>{fullPhone}</Text>
            </Text>
            <TextInput
              style={styles.otpInput}
              value={otp}
              onChangeText={(t) => setOtp(t.replace(/\D/g, '').slice(0, CODE_LENGTH))}
              placeholder="123456"
              placeholderTextColor={C.muted2}
              keyboardType="number-pad"
              autoFocus
            />
            <Pressable onPress={() => resendIn === 0 && proceedToVerification(true)} disabled={resendIn > 0 || busy} hitSlop={8}>
              <Text style={[styles.resend, resendIn > 0 && styles.resendOff]}>
                {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend OTP'}
              </Text>
            </Pressable>
          </View>
        )}

        {error && <Text style={styles.error}>{error}</Text>}
        {notice && !error && <Text style={styles.notice}>{notice}</Text>}
      </ScrollView>

      <View style={styles.footer}>
        <View style={{ flex: 3 }}>
          <IzButton label={step === 1 ? 'Back' : 'Previous'} icon={ChevronLeft} variant="soft" onPress={goBack} disabled={busy} />
        </View>
        <View style={{ flex: 7 }}>
          <IzButton label={primary.label} onPress={primary.onPress} disabled={busy} />
        </View>
      </View>
    </View>
  );
}

/* ---------------------------------- bits --------------------------------- */

function Row({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

function Field({
  label, hint, flex, children,
}: { label: string; hint?: string; flex?: boolean; children: React.ReactNode }) {
  return (
    <View style={[styles.field, flex && { flex: 1 }]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

function Input(props: React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.inputWrap}>
      <TextInput
        {...props}
        style={styles.input}
        placeholderTextColor={C.muted2}
        autoCapitalize={props.autoCapitalize ?? 'none'}
        autoCorrect={false}
      />
    </View>
  );
}

/** Inline expanding select — avoids pulling in a modal picker dependency. */
function Picker({
  value, options, onSelect, width,
}: { value: string; options: string[]; onSelect: (v: string) => void; width?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={width ? { width } : undefined}>
      <Pressable style={styles.inputWrap} onPress={() => setOpen((o) => !o)}>
        <Text style={styles.pickerValue} numberOfLines={1}>{value}</Text>
      </Pressable>
      {open && (
        <ScrollView style={styles.pickerList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          {options.map((o) => (
            <Pressable
              key={o}
              onPress={() => { onSelect(o); setOpen(false); }}
              style={styles.pickerRow}
            >
              <Text style={[styles.pickerRowText, o === value && styles.pickerRowOn]}>{o}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function Choice({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.choice, on && styles.choiceOn]}>
      <Text style={[styles.choiceText, on && styles.choiceTextOn]}>{label}</Text>
    </Pressable>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 18, paddingTop: 34, paddingBottom: 20 },
  head: { marginBottom: 12 },
  eyebrow: {
    fontFamily: F.sora, fontSize: 11, fontWeight: '700', letterSpacing: 1.6, color: C.muted2,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  title: {
    fontFamily: F.sora, fontSize: 22, fontWeight: '800', letterSpacing: -0.3, color: C.txt,
  },
  subtitle: {
    fontFamily: F.manrope, fontSize: C.fsTiny, color: C.prMuted, marginTop: 2,
  },
  dots: { flexDirection: 'row', gap: 6, marginBottom: 14 },
  dot: {
    flex: 1, height: 3, borderRadius: 2, backgroundColor: C.line,
  },
  dotOn: { backgroundColor: C.accent },
  body: { flex: 1 },
  bodyContent: { paddingBottom: 14 },
  row: { flexDirection: 'row', gap: 10 },
  inline: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  field: { marginBottom: 12 },
  fieldLabel: {
    fontFamily: F.sora, fontSize: 13, fontWeight: '600', letterSpacing: 0.3,
    color: C.prMuted, marginBottom: 6,
  },
  hint: {
    fontFamily: F.manrope, fontSize: 12, lineHeight: 16, color: C.muted2, marginTop: 5,
  },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1,
    borderColor: C.line, backgroundColor: C.bg2, paddingHorizontal: 14,
  },
  input: {
    flex: 1, paddingVertical: 12, fontFamily: F.sora, fontSize: 16, fontWeight: '600', color: C.txt,
  },
  pickerValue: {
    flex: 1, paddingVertical: 12, fontFamily: F.sora, fontSize: 16, fontWeight: '600', color: C.txt,
  },
  pickerList: {
    maxHeight: 172, marginTop: 6, borderRadius: 14, borderWidth: 1, borderColor: C.line,
    backgroundColor: C.bg2,
  },
  pickerRow: { paddingVertical: 10, paddingHorizontal: 14 },
  pickerRowText: { fontFamily: F.sora, fontSize: 15, fontWeight: '600', color: C.prMuted },
  pickerRowOn: { color: C.accent },
  choice: {
    flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 14, borderWidth: 1,
    borderColor: C.line, backgroundColor: C.bg2,
  },
  agencyList: {
    borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.bg2,
    overflow: 'hidden',
  },
  agencyRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.line,
  },
  agencyRowOn: { backgroundColor: 'rgba(227,184,119,0.10)' },
  agencyName: { flex: 1, fontFamily: F.sora, fontSize: 15, fontWeight: '600', color: C.prMuted },
  agencyNameOn: { color: C.accent },
  choiceOn: { borderColor: C.accent },
  choiceText: { fontFamily: F.sora, fontSize: 15, fontWeight: '700', color: C.prMuted },
  choiceTextOn: { color: C.accent },
  note: {
    fontFamily: F.manrope, fontSize: C.fsTiny, lineHeight: C.fsTiny * 1.45, color: C.muted2,
    marginTop: 4,
  },
  placeholder: {
    alignItems: 'center', gap: 8, paddingVertical: 30, paddingHorizontal: 12, borderRadius: 16,
    borderWidth: 1, borderColor: C.line, borderStyle: 'dashed',
  },
  placeholderTitle: { fontFamily: F.sora, fontSize: 16, fontWeight: '700', color: C.prMuted },
  placeholderBody: {
    fontFamily: F.manrope, fontSize: C.fsTiny, lineHeight: C.fsTiny * 1.5, color: C.muted2,
    textAlign: 'center',
  },
  summaryRow: {
    flexDirection: 'row', justifyContent: 'space-between', gap: 14, paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: C.line,
  },
  summaryLabel: { fontFamily: F.sora, fontSize: 13, fontWeight: '600', color: C.muted2 },
  summaryValue: {
    flex: 1, textAlign: 'right', fontFamily: F.sora, fontSize: 13, fontWeight: '600', color: C.txt,
  },
  otpWrap: { alignItems: 'center', paddingVertical: 18, gap: 14 },
  otpIcon: {
    height: 64, width: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.bg2, borderWidth: 1, borderColor: C.line,
  },
  otpLead: {
    fontFamily: F.manrope, fontSize: C.fsTiny, lineHeight: C.fsTiny * 1.5, color: C.prMuted,
    textAlign: 'center', maxWidth: 260,
  },
  otpPhone: { fontFamily: F.sora, fontWeight: '700', color: C.txt },
  otpInput: {
    width: 220, textAlign: 'center', paddingVertical: 13, borderRadius: 14, borderWidth: 1,
    borderColor: C.line, backgroundColor: C.bg2, fontFamily: F.sora, fontSize: 20,
    fontWeight: '700', letterSpacing: 8, color: C.txt,
  },
  resend: { fontFamily: F.sora, fontSize: 13, fontWeight: '600', color: C.accent },
  resendOff: { color: C.muted2 },
  footer: { flexDirection: 'row', gap: 10, paddingTop: 10 },
  error: {
    fontFamily: F.manrope, fontSize: C.fsTiny, lineHeight: C.fsTiny * 1.4, color: C.red, marginTop: 8,
  },
  notice: {
    fontFamily: F.manrope, fontSize: C.fsTiny, lineHeight: C.fsTiny * 1.4, color: C.green, marginTop: 8,
  },
});
