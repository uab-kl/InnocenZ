/**
 * Profile — 1:1 port of InnocenZ-proto `/host/profile`.
 * Identity from admin backend (Vicky); comcard/portfolio/languages mirror proto seeds.
 */
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { C, F } from '../theme/theme';
import { ApiError, assetUrl, portfolioSlotsFromProfile } from '../lib/api';
import { fetchImageBlob, renderComcardPng } from '../lib/render-comcard';
import {
  PORTFOLIO_SLOTS,
  SEED_COMCARD,
  SEED_PORTFOLIO,
  SEED_PROFILE_IMAGE,
} from '../lib/demo-shifts';
import { PR_AGENCY_OPTIONS, PR_LANGUAGE_OPTIONS } from '../lib/demo-services';
import { useSession } from '../lib/session';
import { TopBar } from '../components/TopBar';
import { Avatar, IzButton } from '../components/ui';
import {
  Camera,
  Check,
  ChevronDown,
  Lock,
  Pencil,
  Star,
  XIcon,
} from '../components/icons';
import type { PrTab } from '../components/BottomNav';
import { usePrNav } from '../lib/pr-nav';

type HTMLInputLike = {
  type: string;
  accept: string;
  files?: { 0?: Blob & { type: string; size: number }; length: number } | null;
  onchange: (() => void) | null;
  click: () => void;
};

type Draft = {
  displayName: string;
  icName: string;
  height: number;
  weight: number;
  age: number;
  languages: string[];
  agencyIds: string[];
  portfolio: (string | null)[];
  otherLang: string;
};

export function ProfileScreen({ onNavigate }: { onNavigate: (tab: PrTab) => void }) {
  const { openSecurity } = usePrNav();
  const { me, agencies: memberships, signOut, updateProfile, uploadAvatar, uploadPortfolioPhoto, uploadComcardImage, token } =
    useSession();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingComcard, setSavingComcard] = useState(false);
  const [comcardSavedHint, setComcardSavedHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agencyMenuOpen, setAgencyMenuOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft());
  /** Instant preview while upload is in flight (web object URLs). */
  const [slotPreviewUri, setSlotPreviewUri] = useState<(string | null)[]>(() =>
    Array.from({ length: PORTFOLIO_SLOTS }, () => null),
  );

  const displayName = editing ? draft.displayName : me?.username ?? 'PR';
  const legalName = editing
    ? draft.icName
    : [me?.profile.firstName, me?.profile.lastName].filter(Boolean).join(' ') ||
      'Victoria Tan Mei Lin';
  const agencyNames =
    memberships.map((m) => m.agencyName).join(', ') || 'Atlas Agency, Delta Agency';
  const ic = me?.profile.idNo ?? '950312-14-8821';
  const mobile = me?.phoneNum ?? '—';
  const email = me?.email ?? '—';
  const height = editing
    ? draft.height
    : me?.profile.comcardHeightCm ?? 153;
  const weight = editing
    ? draft.weight
    : me?.profile.comcardWeightKg ?? 40;
  const age = editing
    ? draft.age
    : me?.profile.dob
      ? Math.max(18, new Date().getFullYear() - new Date(me.profile.dob).getFullYear())
      : 24;

  const languages = editing ? draft.languages : ['English', 'Mandarin', 'Cantonese'];
  const profilePortfolio = portfolioSlotsFromProfile(me?.profile.portfolioPhotos, PORTFOLIO_SLOTS);
  const portfolio = editing ? draft.portfolio : profilePortfolio;

  const displayPortfolio = useMemo(() => {
    if (editing) return portfolio;
    if (portfolio.some(Boolean)) return portfolio;
    const seeded: (string | null)[] = Array.from({ length: PORTFOLIO_SLOTS }, () => null);
    SEED_PORTFOLIO.forEach((path, i) => {
      seeded[i] = path;
    });
    return seeded;
  }, [editing, portfolio]);

  const avatarPath = me?.profileImage ?? (!editing ? SEED_PROFILE_IMAGE : null);

  const comcardTiles = useMemo(() => {
    if (!editing && !portfolio.some(Boolean)) {
      return { mode: 'single' as const, src: SEED_COMCARD };
    }
    const source = editing ? portfolio : displayPortfolio;
    return {
      mode: 'grid' as const,
      paths: Array.from({ length: 4 }, (_, i) => source[i] ?? null),
    };
  }, [displayPortfolio, editing, portfolio]);

  const canPickImages = Boolean(token) && Platform.OS === 'web';
  const canSaveComcard = Boolean(token) && Platform.OS === 'web' && !editing;

  const saveComcardToDatabase = async () => {
    if (!canSaveComcard) return;
    setSavingComcard(true);
    setError(null);
    setComcardSavedHint(null);
    try {
      let blob: Blob;
      if (comcardTiles.mode === 'single') {
        blob = await fetchImageBlob(comcardTiles.src);
      } else {
        blob = await renderComcardPng({
          paths: comcardTiles.paths,
          name: displayName,
          age,
          heightCm: height,
          weightKg: weight,
        });
      }
      await uploadComcardImage(blob, 'comcard.png');
      setComcardSavedHint('Comcard saved');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save comcard');
    } finally {
      setSavingComcard(false);
    }
  };

  const startEdit = () => {
    const agencyIds = memberships.length
      ? memberships
          .map((m) =>
            PR_AGENCY_OPTIONS.find(
              (a) => a.name.toLowerCase() === m.agencyName.toLowerCase(),
            )?.id,
          )
          .filter(Boolean) as string[]
      : ['atlas', 'delta'];
    setDraft({
      displayName: me?.username ?? 'Vicky',
      icName:
        [me?.profile.firstName, me?.profile.lastName].filter(Boolean).join(' ') ||
        'Victoria Tan Mei Lin',
      height: me?.profile.comcardHeightCm ?? 153,
      weight: me?.profile.comcardWeightKg ?? 40,
      age: 24,
      languages: ['English', 'Mandarin', 'Cantonese'],
      agencyIds: agencyIds.length ? agencyIds : ['atlas', 'delta'],
      portfolio: portfolioSlotsFromProfile(me?.profile.portfolioPhotos, PORTFOLIO_SLOTS),
      otherLang: '',
    });
    setError(null);
    setAgencyMenuOpen(false);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setError(null);
    setAgencyMenuOpen(false);
  };

  const saveEdit = async () => {
    const name = draft.displayName.trim();
    if (name.length < 2 || name.length > 20) {
      setError('Floor nickname must be 2–20 characters');
      return;
    }
    if (!draft.icName.trim()) {
      setError('Enter your legal IC name');
      return;
    }
    if (draft.languages.length === 0) {
      setError('Select at least one language');
      return;
    }
    const parts = draft.icName.trim().split(/\s+/);
    const firstName = parts[0] ?? '';
    const lastName = parts.slice(1).join(' ');
    setSaving(true);
    setError(null);
    try {
      await updateProfile({
        username: name,
        firstName,
        lastName,
        email: me?.email ?? '',
        portfolioPhotos: portfolioSlotsFromProfile(draft.portfolio, PORTFOLIO_SLOTS),
        comcardHeightCm: draft.height,
        comcardWeightKg: draft.weight,
      });
      setEditing(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save profile');
    } finally {
      setSaving(false);
    }
  };

  const validateImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file');
      return false;
    }
    if (file.size > 2_500_000) {
      setError('Image must be under 2.5 MB');
      return false;
    }
    return true;
  };

  const onPickAvatar = () => {
    if (!canPickImages) return;
    const doc = (globalThis as { document?: { createElement: (tag: string) => HTMLInputLike } })
      .document;
    if (!doc) return;
    const input = doc.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0] ?? null;
      if (!file) return;
      if (!validateImageFile(file)) return;
      setSaving(true);
      setError(null);
      try {
        await uploadAvatar(file);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Could not upload photo');
      } finally {
        setSaving(false);
      }
    };
    input.click();
  };

  const onPickPortfolio = (slot: number) => {
    if (!canPickImages) return;
    const doc = (globalThis as { document?: { createElement: (tag: string) => HTMLInputLike } })
      .document;
    if (!doc) return;
    const input = doc.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0] ?? null;
      if (!file) return;
      if (!validateImageFile(file)) return;
      const preview =
        typeof URL !== 'undefined' && 'createObjectURL' in URL ? URL.createObjectURL(file) : null;
      if (preview) {
        setSlotPreviewUri((prev) => {
          const next = [...prev];
          next[slot] = preview;
          return next;
        });
      }
      setSaving(true);
      setError(null);
      try {
        const updated = await uploadPortfolioPhoto(slot, file);
        if (editing) {
          setDraft((d) => ({
            ...d,
            portfolio: portfolioSlotsFromProfile(updated.profile.portfolioPhotos, PORTFOLIO_SLOTS),
          }));
        }
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Could not upload portfolio photo');
      } finally {
        if (preview) {
          setSlotPreviewUri((prev) => {
            const next = [...prev];
            if (next[slot] === preview) next[slot] = null;
            return next;
          });
          URL.revokeObjectURL(preview);
        }
        setSaving(false);
      }
    };
    input.click();
  };

  const toggleLang = (lang: string) => {
    setDraft((d) => ({
      ...d,
      languages: d.languages.includes(lang)
        ? d.languages.filter((l) => l !== lang)
        : [...d.languages, lang],
    }));
  };

  const addOtherLang = () => {
    const v = draft.otherLang.trim();
    if (!v) return;
    setDraft((d) => ({
      ...d,
      languages: d.languages.includes(v) ? d.languages : [...d.languages, v],
      otherLang: '',
    }));
  };

  const agencyLabel = draft.agencyIds
    .map((id) => PR_AGENCY_OPTIONS.find((a) => a.id === id)?.name ?? id)
    .join(', ');

  return (
    <View style={styles.screen}>
      <TopBar
        onOpenProfile={() => onNavigate('profile')}
        backLabel={editing ? 'Cancel edit' : undefined}
        onBack={editing ? cancelEdit : undefined}
      />

      <View style={styles.hero}>
        <View style={styles.heroHead}>
          <Text style={styles.eyebrow}>ACCOUNT</Text>
          <View style={styles.badges}>
            {editing && (
              <View style={[styles.badge, styles.badgeAmber]}>
                <Text style={[styles.badgeText, { color: C.amber }]}>Editing</Text>
              </View>
            )}
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Photo Comcard · IC · v3</Text>
            </View>
          </View>
        </View>

        <View style={styles.profileRow}>
          <View style={styles.avatarWrap}>
            <Pressable onPress={canPickImages ? onPickAvatar : undefined}>
              <Avatar
                size={80}
                radius={22}
                fontSize={28}
                photoPath={avatarPath}
                initial={displayName.trim()[0]?.toUpperCase()}
              />
            </Pressable>
            {canPickImages && (
              <Pressable style={styles.avatarEdit} onPress={onPickAvatar}>
                <Camera size={14} color={C.txt} />
              </Pressable>
            )}
          </View>

          <View style={styles.profileBody}>
            {editing ? (
              <>
                <Text style={styles.fieldLabel}>Floor nickname</Text>
                <TextInput
                  value={draft.displayName}
                  onChangeText={(v) => setDraft((d) => ({ ...d, displayName: v }))}
                  maxLength={20}
                  style={styles.input}
                  placeholderTextColor={C.muted2}
                />
                <Text style={[styles.fieldLabel, { marginTop: 8 }]}>Legal IC name</Text>
                <TextInput
                  value={draft.icName}
                  onChangeText={(v) => setDraft((d) => ({ ...d, icName: v }))}
                  style={styles.input}
                  placeholderTextColor={C.muted2}
                />
              </>
            ) : (
              <>
                <Text style={styles.name}>{displayName}</Text>
                <Text style={styles.icName}>{legalName}</Text>
                <Text style={styles.contact}>{mobile}</Text>
                <Text style={styles.contact}>{email}</Text>
              </>
            )}

            <View style={styles.metaRow}>
              <View style={styles.tier}>
                <Star size={12} color={C.goldL} />
                <Text style={styles.tierText}>TIER V</Text>
              </View>
              {!editing && (
                <Text style={styles.metaText}>Agency-Tied · {agencyNames}</Text>
              )}
              <Text style={styles.metaIc}>IC {ic}</Text>
            </View>

            {editing && (
              <View style={{ marginTop: 10 }}>
                <Text style={styles.fieldLabel}>Agencies</Text>
                <Pressable
                  style={styles.agencyBtn}
                  onPress={() => setAgencyMenuOpen((o) => !o)}
                >
                  <Text style={styles.agencyBtnText} numberOfLines={1}>
                    {agencyLabel || 'Select agencies…'}
                  </Text>
                  <ChevronDown size={16} color={C.muted} />
                </Pressable>
                {agencyMenuOpen && (
                  <View style={styles.agencyMenu}>
                    {PR_AGENCY_OPTIONS.map((a) => {
                      const on = draft.agencyIds.includes(a.id);
                      return (
                        <Pressable
                          key={a.id}
                          style={styles.agencyRow}
                          onPress={() =>
                            setDraft((d) => ({
                              ...d,
                              agencyIds: on
                                ? d.agencyIds.filter((id) => id !== a.id)
                                : [...d.agencyIds, a.id],
                            }))
                          }
                        >
                          <View style={[styles.check, on && styles.checkOn]}>
                            {on && <Check size={12} color="#241a08" />}
                          </View>
                          <Text style={[styles.agencyRowText, on && { color: C.goldL }]}>
                            {a.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            )}
          </View>
        </View>

        {/* Comcard showcase — portfolio collage + overlay (proto photo comcard) */}
        <View style={styles.showcase}>
          <View style={styles.comcard}>
            {comcardTiles.mode === 'single' ? (
              <View style={styles.collage}>
                {assetUrl(comcardTiles.src) ? (
                  <Image
                    source={{ uri: assetUrl(comcardTiles.src)! }}
                    style={StyleSheet.absoluteFillObject}
                    resizeMode="cover"
                  />
                ) : null}
              </View>
            ) : (
              <View style={styles.collage}>
                {comcardTiles.paths.map((path, idx) => {
                  const uri = path ? assetUrl(path) : null;
                  return uri ? (
                    <Image
                      key={`${path}-${idx}`}
                      source={{ uri }}
                      style={styles.collageTile}
                      resizeMode="cover"
                    />
                  ) : (
                    <View
                      key={`empty-${idx}`}
                      style={[styles.collageTile, { backgroundColor: C.panel2 }]}
                    />
                  );
                })}
                <View style={styles.comcardOverlay}>
                  <Text style={styles.comcardOverlayName}>{displayName}</Text>
                  <Text style={styles.comcardOverlayStats}>Age {age}</Text>
                  <Text style={styles.comcardOverlayStats}>
                    {height}cm {weight}kg
                  </Text>
                </View>
              </View>
            )}
          </View>

          {canSaveComcard && (
            <View style={styles.comcardActions}>
              <IzButton
                label={savingComcard ? 'Saving…' : me?.profile.comcardImage ? 'Update saved comcard' : 'Save comcard'}
                onPress={() => {
                  void saveComcardToDatabase();
                }}
                disabled={savingComcard || saving}
                variant="soft"
                small
              />
              {comcardSavedHint ? (
                <Text style={styles.comcardSavedHint}>{comcardSavedHint}</Text>
              ) : me?.profile.comcardImage ? (
                <Text style={styles.comcardSavedHint}>Saved to profile</Text>
              ) : (
                <Text style={styles.comcardHint}>Save the auto-generated comcard to your profile</Text>
              )}
            </View>
          )}

          {!editing && (
            <View style={styles.measureGrid}>
              <View style={styles.measure}>
                <Text style={styles.measureLabel}>HEIGHT</Text>
                <View style={styles.measureRow}>
                  <Text style={styles.measureValue}>{height}</Text>
                  <Text style={styles.measureSuffix}>cm</Text>
                </View>
              </View>
              <View style={styles.measure}>
                <Text style={styles.measureLabel}>WEIGHT</Text>
                <View style={styles.measureRow}>
                  <Text style={styles.measureValue}>{weight}</Text>
                  <Text style={styles.measureSuffix}>kg</Text>
                </View>
              </View>
              <View style={styles.measure}>
                <Text style={styles.measureLabel}>AGE</Text>
                <View style={styles.measureRow}>
                  <Text style={styles.measureValue}>{age}</Text>
                  <Text style={styles.measureSuffix}>y</Text>
                </View>
              </View>
            </View>
          )}

          {editing && (
            <View style={styles.measureGrid}>
              <MeasureField
                label="HEIGHT"
                suffix="cm"
                value={String(draft.height)}
                onChange={(v) =>
                  setDraft((d) => ({ ...d, height: Number(v.replace(/\D/g, '')) || 0 }))
                }
              />
              <MeasureField
                label="WEIGHT"
                suffix="kg"
                value={String(draft.weight)}
                onChange={(v) =>
                  setDraft((d) => ({ ...d, weight: Number(v.replace(/\D/g, '')) || 0 }))
                }
              />
              <MeasureField
                label="AGE"
                suffix="y"
                value={String(draft.age)}
                onChange={(v) =>
                  setDraft((d) => ({ ...d, age: Number(v.replace(/\D/g, '')) || 0 }))
                }
              />
            </View>
          )}
        </View>

        {/* Portfolio */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>Portfolio gallery · v3</Text>
            {canPickImages && (
              <Text style={styles.sectionHint}>
                {editing
                  ? 'Tap a slot to upload · save to apply removals'
                  : 'Tap a slot to upload'}
              </Text>
            )}
          </View>
          <View style={styles.pgrid}>
            {Array.from({ length: PORTFOLIO_SLOTS }, (_, i) => {
              const path = displayPortfolio[i];
              const uri = slotPreviewUri[i] ?? (path ? assetUrl(path) : null);
              return (
                <Pressable
                  key={i}
                  style={styles.pcell}
                  onPress={canPickImages ? () => onPickPortfolio(i) : undefined}
                  disabled={!canPickImages || saving}
                >
                  {uri ? (
                    <Image source={{ uri }} style={styles.pcellImg} resizeMode="cover" />
                  ) : (
                    <Camera size={18} color={C.muted2} />
                  )}
                  {editing && uri && (
                    <Pressable
                      style={styles.pcellRemove}
                      onPress={() =>
                        setDraft((d) => {
                          const next = [...d.portfolio];
                          next[i] = null;
                          return { ...d, portfolio: next };
                        })
                      }
                    >
                      <XIcon size={10} color="#fff" />
                    </Pressable>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Languages */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Languages</Text>
          {editing ? (
            <View style={styles.langEdit}>
              <View style={styles.langChips}>
                {PR_LANGUAGE_OPTIONS.map((lang) => {
                  const on = draft.languages.includes(lang);
                  return (
                    <Pressable
                      key={lang}
                      style={[styles.langPick, on && styles.langPickOn]}
                      onPress={() => toggleLang(lang)}
                    >
                      <Text style={[styles.langPickText, on && { color: C.violetL }]}>{lang}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput
                value={draft.otherLang}
                onChangeText={(v) => setDraft((d) => ({ ...d, otherLang: v }))}
                placeholder="Other language"
                placeholderTextColor={C.muted2}
                style={styles.otherLang}
              />
              <Pressable style={styles.addLang} onPress={addOtherLang}>
                <Text style={styles.addLangText}>+ Add</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.langChips}>
              {languages.map((l) => (
                <View key={l} style={styles.langPill}>
                  <Text style={styles.langPillText}>{l}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.actions}>
        {editing ? (
          <>
            <IzButton
              label={saving ? 'Saving…' : 'Save profile'}
              onPress={saveEdit}
              disabled={saving}
            />
            {saving && <ActivityIndicator color={C.gold} style={{ marginTop: 8 }} />}
            <IzButton
              label="Cancel"
              variant="soft"
              onPress={cancelEdit}
              disabled={saving}
              style={{ marginTop: 10 }}
            />
          </>
        ) : (
          <IzButton label="Edit profile" icon={Pencil} onPress={startEdit} />
        )}
      </View>

      <Pressable style={styles.securityBtn} onPress={openSecurity}>
        <Lock size={14} color={C.txt} />
        <Text style={styles.securityText}>Security settings</Text>
      </Pressable>

      <Pressable style={styles.signOutBtn} onPress={signOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

function emptyDraft(): Draft {
  return {
    displayName: '',
    icName: '',
    height: 153,
    weight: 40,
    age: 24,
    languages: [],
    agencyIds: [],
    portfolio: [],
    otherLang: '',
  };
}

function MeasureField({
  label,
  suffix,
  value,
  onChange,
}: {
  label: string;
  suffix: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.measure}>
      <Text style={styles.measureLabel}>{label}</Text>
      <View style={styles.measureRow}>
        <TextInput
          value={value}
          onChangeText={onChange}
          keyboardType="number-pad"
          style={styles.measureInput}
          placeholderTextColor={C.muted2}
        />
        <Text style={styles.measureSuffix}>{suffix}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: 6, paddingHorizontal: 18, paddingBottom: 26 },
  hero: {
    marginTop: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: 'rgba(255,255,255,0.02)',
    padding: 14,
    overflow: 'hidden',
  },
  heroHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  eyebrow: {
    fontFamily: F.sora,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.68,
    color: '#c4b4d8',
  },
  badges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  badgeAmber: {
    borderColor: 'rgba(232,198,106,0.4)',
    backgroundColor: C.amberBg,
  },
  badgeText: {
    fontFamily: F.sora,
    fontSize: 10,
    fontWeight: '700',
    color: C.prMuted,
  },
  profileRow: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  avatarWrap: { position: 'relative' },
  avatarEdit: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: C.violet,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: C.panel,
  },
  profileBody: { flex: 1, minWidth: 0 },
  name: {
    fontFamily: F.sora,
    fontSize: 26,
    fontWeight: '800',
    color: C.txt,
    letterSpacing: -0.4,
  },
  icName: { marginTop: 2, fontFamily: F.manrope, fontSize: 14, color: C.prMuted },
  contact: { marginTop: 2, fontFamily: F.manrope, fontSize: 12, color: C.prMuted2 },
  fieldLabel: {
    fontFamily: F.sora,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: C.muted2,
    marginBottom: 3,
  },
  input: {
    fontFamily: F.sora,
    fontSize: 15,
    fontWeight: '600',
    color: C.txt,
    borderWidth: 1,
    borderColor: C.line2,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  metaRow: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  tier: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(232,194,122,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(232,194,122,0.3)',
  },
  tierText: { fontFamily: F.sora, fontSize: 11, fontWeight: '800', color: C.accentL },
  metaText: { fontFamily: F.manrope, fontSize: 12, color: C.prMuted },
  metaIc: { fontFamily: F.manrope, fontSize: 12, color: C.prMuted2 },
  agencyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderWidth: 1,
    borderColor: C.line2,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  agencyBtnText: { flex: 1, fontFamily: F.sora, fontSize: 14, fontWeight: '600', color: C.txt },
  agencyMenu: {
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.bg2,
    overflow: 'hidden',
  },
  agencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  agencyRowText: { fontFamily: F.sora, fontSize: 14, fontWeight: '600', color: C.txt },
  check: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: C.line2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: C.accent, borderColor: C.accent },
  showcase: { marginTop: 16, alignItems: 'center' },
  comcard: {
    width: '100%',
    maxWidth: 280,
    aspectRatio: 3 / 4,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.line2,
  },
  comcardActions: {
    marginTop: 12,
    width: '100%',
    maxWidth: 280,
    alignItems: 'center',
    gap: 6,
  },
  comcardHint: {
    fontFamily: F.manrope,
    fontSize: 12,
    color: C.muted,
    textAlign: 'center',
  },
  comcardSavedHint: {
    fontFamily: F.manrope,
    fontSize: 12,
    color: C.green,
    textAlign: 'center',
  },
  collage: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    position: 'relative',
    backgroundColor: C.panel2,
  },
  collageTile: { width: '50%', height: '50%' },
  comcardOverlay: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    transform: [{ translateX: -56 }, { translateY: -36 }],
    width: 112,
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  comcardOverlayName: {
    fontFamily: F.sora,
    fontSize: 14,
    fontWeight: '800',
    color: '#111',
  },
  comcardOverlayStats: {
    fontFamily: F.manrope,
    fontSize: 11,
    color: '#333',
  },
  measureGrid: {
    marginTop: 12,
    width: '100%',
    flexDirection: 'row',
    gap: 8,
  },
  measure: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line2,
    borderBottomColor: 'rgba(155,184,255,0.45)',
    borderBottomWidth: 2,
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  measureLabel: {
    fontFamily: F.sora,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: C.blue,
  },
  measureRow: { marginTop: 4, flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  measureValue: {
    fontFamily: F.sora,
    fontSize: 22,
    fontWeight: '800',
    color: C.txt,
  },
  measureInput: {
    flex: 1,
    fontFamily: F.sora,
    fontSize: 22,
    fontWeight: '800',
    color: C.txt,
    padding: 0,
  },
  measureSuffix: { fontFamily: F.manrope, fontSize: 12, color: C.blue },
  section: { marginTop: 16 },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionTitle: {
    fontFamily: F.sora,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: C.violetL,
  },
  sectionHint: { fontFamily: F.manrope, fontSize: 11, color: C.prMuted },
  pgrid: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pcell: {
    width: '23%',
    aspectRatio: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: 'rgba(0,0,0,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  pcellImg: { width: '100%', height: '100%' },
  pcellRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 999,
    backgroundColor: C.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langChips: { marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  langPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(183,156,232,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(183,156,232,0.3)',
  },
  langPillText: { fontFamily: F.sora, fontSize: 12, fontWeight: '600', color: C.violetL },
  langEdit: {
    marginTop: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  langPick: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  langPickOn: {
    borderColor: 'rgba(183,156,232,0.5)',
    backgroundColor: 'rgba(183,156,232,0.12)',
  },
  langPickText: { fontFamily: F.sora, fontSize: 12, fontWeight: '600', color: C.muted },
  otherLang: {
    marginTop: 10,
    fontFamily: F.sora,
    fontSize: 14,
    color: C.txt,
    borderWidth: 1,
    borderColor: C.line2,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  addLang: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.line2,
  },
  addLangText: { fontFamily: F.sora, fontSize: 13, fontWeight: '600', color: C.txt },
  error: { marginTop: 10, fontFamily: F.manrope, fontSize: 13, color: C.red },
  actions: { marginTop: 16 },
  securityBtn: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.line2,
    paddingVertical: 14,
  },
  securityText: { fontFamily: F.sora, fontSize: 14, fontWeight: '600', color: C.txt },
  signOutBtn: {
    marginTop: 14,
    marginBottom: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.red,
    paddingVertical: 14,
    alignItems: 'center',
  },
  signOutText: { fontFamily: F.sora, fontSize: 14, fontWeight: '600', color: C.red },
});
