/**
 * Profile — 1:1 port of InnocenZ-proto `/host/profile`.
 * Identity from admin backend (Vicky); comcard/portfolio/languages mirror proto seeds.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { C, F } from '../theme/theme';
import {
  ApiError,
  assetUrl,
  fetchMyAgencyLinks,
  fetchPublicAgencies,
  portfolioSlotsFromProfile,
  updateMyAgencies,
  type PrAgencyLink,
} from '../lib/api';
import { fetchImageBlob, renderComcardPng } from '../lib/render-comcard';
import {
  PORTFOLIO_SLOTS,
} from '../lib/demo-shifts';
import { PR_LANGUAGE_OPTIONS } from '../lib/demo-services';
import { pickImageFromGallery, pickImagesFromGallery } from '../lib/photo-file';
import { useSession } from '../lib/session';
import { useLocale } from '../i18n';
import { Avatar, IzButton } from '../components/ui';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { PortfolioSlotGrid } from '../components/PortfolioSlotGrid';
import { AppToast, useToast } from '../components/Toast';
import { LanguageMultiPicker } from './sign-up/fields';
import {
  Camera,
  Check,
  ChevronDown,
  Lock,
  Pencil,
  Star,
} from '../components/icons';
import type { PrTab } from '../components/BottomNav';
import { usePrNav } from '../lib/pr-nav';

type Draft = {
  displayName: string;
  icName: string;
  /** Login email — editable here, saved to the user account. */
  email: string;
  height: number;
  weight: number;
  bust: number;
  waist: number;
  hip: number;
  age: number;
  languages: string[];
  agencyIds: string[];
  portfolio: (string | null)[];
};

/**
 * Every value of the backend `pr_tier` enum, spelled the way the agency portal
 * spells it. The two screens must read a tier the same way, or the PR and her
 * agency end up looking at different words for one database row.
 */
const TIER_LABEL: Record<string, string> = {
  tier_1: 'TIER I',
  tier_2: 'TIER II',
  tier_3: 'TIER III',
  tier_4: 'TIER IV',
  tier_5: 'TIER V',
  servant: 'SERVANT',
  commission_only: 'COMMISSION ONLY',
};

export function ProfileScreen({ onNavigate }: { onNavigate: (tab: PrTab) => void }) {
  const { openSecurity } = usePrNav();
  const { t } = useLocale();
  const { me, agencies: memberships, signOut, updateProfile, uploadAvatar, uploadPortfolioPhoto, uploadComcardImage, generateComcard, token } =
    useSession();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingComcard, setSavingComcard] = useState(false);
  const [comcardSavedHint, setComcardSavedHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { message: toast, variant: toastVariant, showToast } = useToast();
  const [agencyMenuOpen, setAgencyMenuOpen] = useState(false);
  /** Portfolio gallery accordion — closed by default; count + chevron still show. */
  const [portfolioOpen, setPortfolioOpen] = useState(false);
  /** Real agencies from the backend — the checkbox list the PR picks from. */
  const [agencyOptions, setAgencyOptions] = useState<{ id: string; name: string }[]>([]);
  /**
   * How the agency list last loaded. A refusal or an unreachable backend must
   * never render as an agency-less database: this picker read `GET /agency`,
   * which RBAC allows only admin + agency, so every PR token 403'd and the
   * swallowed error painted "no agencies" over a full table. The list is public
   * now (`/auth/agencies`), and a failure says so and offers a retry.
   */
  const [agencyState, setAgencyState] = useState<'loading' | 'ready' | 'failed'>('loading');
  /** This PR's own agency_pr links, pending ones included. */
  const [myLinks, setMyLinks] = useState<PrAgencyLink[]>([]);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft());
  /** Instant preview while upload is in flight (web object URLs). */
  const [slotPreviewUri, setSlotPreviewUri] = useState<(string | null)[]>(() =>
    Array.from({ length: PORTFOLIO_SLOTS }, () => null),
  );
  /**
   * Slot order to paint while a drag-swap round-trip is in flight. Outside edit
   * mode the grid reads `me`, so a draft-only optimistic update never showed —
   * the tiles sat in the old order until the save (plus comcard rebuild) landed.
   */
  const [pendingOrder, setPendingOrder] = useState<(string | null)[] | null>(null);
  /** Inline status under Portfolio while rearrange / comcard rebuild is in flight. */
  const [portfolioBusy, setPortfolioBusy] = useState<string | null>(null);

  const displayName = editing ? draft.displayName : me?.username ?? 'PR';
  const reloadMyLinks = React.useCallback(async () => {
    if (!token || !me) return;
    try {
      setMyLinks(await fetchMyAgencyLinks(token, me.id));
    } catch {
      /* Non-fatal: the picker falls back to whatever is already loaded. */
    }
  }, [token, me]);

  /**
   * Same public list the sign-up wizard reads — no token, so it does not depend
   * on what the PR's role is allowed to enumerate.
   */
  const loadAgencies = React.useCallback(() => {
    setAgencyState('loading');
    fetchPublicAgencies()
      .then((list) => {
        setAgencyOptions(list.map((a) => ({ id: a.id, name: a.name })));
        setAgencyState('ready');
      })
      .catch(() => setAgencyState('failed'));
  }, []);

  useEffect(() => {
    loadAgencies();
  }, [loadAgencies]);

  useEffect(() => {
    void reloadMyLinks();
  }, [reloadMyLinks]);

  // Everything below reads the account's own saved row — no demo fallbacks.
  const legalName = editing ? draft.icName : me?.profile.fullName?.trim() || '—';
  // Approved links are the real tie; pending ones are still just a request.
  const agencyNames =
    myLinks
      .filter((l) => l.approveStatus === 'approved')
      .map((l) => l.agencyName)
      .join(', ') ||
    memberships.map((m) => m.agencyName).join(', ') ||
    '—';
  /**
   * Our grading, from `agency_pr.tier` — the SAME row the agency's Manage-PR
   * card reads. This badge used to be the literal string "TIER V", a tier that
   * exists nowhere in the database, so the phone and the portal disagreed about
   * the same PR forever.
   *
   * Tier is per-membership: Atlas may grade us tier_3 while Delta grades us
   * tier_1, and both are correct. So when our approved agencies agree we show
   * one badge, and when they differ we name each one instead of silently
   * picking a winner.
   */
  const tierBadges = (() => {
    const graded = myLinks.filter((l) => l.approveStatus === 'approved' && l.tier);
    const labels = graded.map((l) => ({
      agencyName: l.agencyName,
      label: TIER_LABEL[l.tier as string] ?? (l.tier as string),
    }));
    const distinct = [...new Set(labels.map((t) => t.label))];
    if (distinct.length === 0) return [];
    if (distinct.length === 1) return [{ agencyName: null, label: distinct[0] }];
    return labels;
  })();
  const pendingAgencyNames = myLinks
    .filter((l) => l.approveStatus === 'pending')
    .map((l) => l.agencyName);
  /** While the agency has a request open, the PR's selection is frozen. */
  const agencyLocked = pendingAgencyNames.length > 0;
  const ic = me?.profile.idNo ?? '—';
  const mobile = me?.phoneNum ?? '—';
  const email = me?.email ?? '—';
  const height = editing ? draft.height : me?.profile.comcardHeightCm ?? 0;
  const weight = editing ? draft.weight : me?.profile.comcardWeightKg ?? 0;
  const age = editing
    ? draft.age
    : me?.profile.dob
      ? Math.max(18, new Date().getFullYear() - new Date(me.profile.dob).getFullYear())
      : 0;

  const languages = editing ? draft.languages : me?.profile.languages ?? [];
  const profilePortfolio = portfolioSlotsFromProfile(me?.profile.portfolioPhotos, PORTFOLIO_SLOTS);
  const portfolio = editing ? draft.portfolio : profilePortfolio;

  // Only the account's own uploaded photos — no demo seed leaks into a fresh PR.
  const displayPortfolio = pendingOrder ?? portfolio;

  const avatarPath = me?.profileImage ?? null;

  const comcardTiles = useMemo(() => {
    // A saved comcard image wins; else a collage from the account's real photos.
    // No saved comcard and no photos → nothing to show (fresh account).
    if (!editing && me?.profile.comcardImage) {
      return { mode: 'single' as const, src: me.profile.comcardImage };
    }
    const source = editing ? portfolio : displayPortfolio;
    if (!source.some(Boolean)) return { mode: 'empty' as const };
    return {
      mode: 'grid' as const,
      paths: Array.from({ length: 4 }, (_, i) => source[i] ?? null),
    };
  }, [displayPortfolio, editing, portfolio, me?.profile.comcardImage]);

  // Gallery picking works on BOTH web (file dialog) and the phone (real photo
  // gallery via expo-image-picker) — see lib/photo-file.ts.
  const canPickImages = Boolean(token);
  // Server generates the PNG (same layout as the on-screen preview).
  const canSaveComcard = Boolean(token) && !editing;

  const saveComcardToDatabase = async () => {
    if (!canSaveComcard || comcardTiles.mode === 'empty') return;
    setSavingComcard(true);
    setError(null);
    setComcardSavedHint(null);
    try {
      // Prefer server generate (works on phone + web). Web can still fall back
      // to canvas encode if the generate route is unavailable.
      try {
        await generateComcard();
      } catch (genErr) {
        if (Platform.OS !== 'web') throw genErr;
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
      }
      setComcardSavedHint('Comcard saved');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save comcard');
    } finally {
      setSavingComcard(false);
    }
  };

  const startEdit = () => {
    // Real agency ids straight off the PR's agency_pr links (pending included).
    const agencyIds = myLinks.length
      ? myLinks.map((l) => l.agencyId)
      : memberships.map((m) => m.agencyId).filter(Boolean);
    setDraft({
      displayName: me?.username ?? '',
      icName: me?.profile.fullName ?? '',
      email: me?.email ?? '',
      height: me?.profile.comcardHeightCm ?? 0,
      weight: me?.profile.comcardWeightKg ?? 0,
      bust: me?.profile.comcardBustCm ?? 0,
      waist: me?.profile.comcardWaistCm ?? 0,
      hip: me?.profile.comcardHipCm ?? 0,
      age: me?.profile.dob
        ? Math.max(18, new Date().getFullYear() - new Date(me.profile.dob).getFullYear())
        : 0,
      languages: me?.profile.languages ?? [],
      agencyIds,
      portfolio: portfolioSlotsFromProfile(me?.profile.portfolioPhotos, PORTFOLIO_SLOTS),
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
    const emailValue = draft.email.trim();
    if (emailValue && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
      setError('Enter a valid email address');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateProfile({
        username: name,
        // Legal IC name → user_profile.full_name (the column admin/agency read).
        fullName: draft.icName.trim(),
        email: emailValue,
        portfolioPhotos: portfolioSlotsFromProfile(draft.portfolio, PORTFOLIO_SLOTS),
        // A blank field means "not set" — never write 0 over a real measurement.
        comcardHeightCm: draft.height || null,
        comcardWeightKg: draft.weight || null,
        comcardBustCm: draft.bust || null,
        comcardWaistCm: draft.waist || null,
        comcardHipCm: draft.hip || null,
        // Spoken languages → user_profile.languages.
        languages: draft.languages,
      });
      // Agencies live in agency_pr, not on the profile row — new picks are
      // saved as pending join requests for the agency to approve. Skip the
      // call entirely when the selection is locked or unchanged, so saving
      // the rest of the profile never trips the "awaiting approval" guard.
      const currentIds = [...myLinks.map((l) => l.agencyId)].sort().join(',');
      const nextIds = [...draft.agencyIds].sort().join(',');
      if (token && !agencyLocked && currentIds !== nextIds) {
        await updateMyAgencies(token, draft.agencyIds);
        await reloadMyLinks();
      }
      setEditing(false);
      showToast('Profile saved');
      // Height / weight / name feed the comcard overlay — refresh saved PNG.
      if (portfolioSlotsFromProfile(draft.portfolio, PORTFOLIO_SLOTS).some(Boolean)) {
        try {
          await generateComcard();
          setComcardSavedHint('Comcard updated');
        } catch {
          /* Non-fatal */
        }
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save profile');
    } finally {
      setSaving(false);
    }
  };

  /** Gallery-pick with the 5 MB guard; null = cancelled / too big / unavailable. */
  const pickValidatedImage = async () => {
    const picked = await pickImageFromGallery();
    if (!picked) {
      if (Platform.OS !== 'web') {
        setError('Could not open the gallery — rebuild the dev app (expo run:android).');
      }
      return null;
    }
    if (picked.size != null && picked.size > 5 * 1024 * 1024) {
      setError('Image must be under 5 MB');
      return null;
    }
    return picked;
  };

  const pickValidatedImages = async (max: number) => {
    const picked = await pickImagesFromGallery({ max });
    if (!picked.length) return { images: [] as typeof picked, skippedOversize: false };
    const images = picked.filter((p) => p.size == null || p.size <= 5 * 1024 * 1024);
    return { images, skippedOversize: images.length < picked.length };
  };

  const onPickAvatar = async () => {
    if (!canPickImages) return;
    const picked = await pickValidatedImage();
    if (!picked) return;
    setSaving(true);
    setError(null);
    try {
      await uploadAvatar(picked.file, picked.filename);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not upload photo');
    } finally {
      setSaving(false);
    }
  };

  const onPickPortfolio = async (slot: number) => {
    if (!canPickImages) return;
    const slots = portfolioSlotsFromProfile(draft.portfolio, PORTFOLIO_SLOTS);
    const replacing = Boolean(slots[slot]);

    // Replace one filled slot → single pick.
    if (replacing) {
      const picked = await pickValidatedImage();
      if (!picked) return;
      const preview = picked.previewUri;
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
        const updated = await uploadPortfolioPhoto(slot, picked.file, picked.filename);
        setDraft((d) => ({
          ...d,
          portfolio: portfolioSlotsFromProfile(updated.profile.portfolioPhotos, PORTFOLIO_SLOTS),
        }));
        try {
          await generateComcard();
          setComcardSavedHint('Comcard updated');
        } catch {
          /* Non-fatal */
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
          if (Platform.OS === 'web' && typeof URL !== 'undefined' && 'revokeObjectURL' in URL) {
            URL.revokeObjectURL(preview);
          }
        }
        setSaving(false);
      }
      return;
    }

    // Empty slot → multi-select into remaining empty slots (from tapped slot, then wrap).
    const emptyIndices: number[] = [];
    for (let i = slot; i < PORTFOLIO_SLOTS; i++) {
      if (!slots[i]) emptyIndices.push(i);
    }
    for (let i = 0; i < slot; i++) {
      if (!slots[i]) emptyIndices.push(i);
    }
    if (!emptyIndices.length) return;

    const { images: pickedList, skippedOversize } = await pickValidatedImages(emptyIndices.length);
    if (!pickedList.length) return;

    const previews = pickedList.map((p) => p.previewUri);
    setSlotPreviewUri((prev) => {
      const next = [...prev];
      pickedList.forEach((_, i) => {
        const s = emptyIndices[i];
        const preview = previews[i];
        if (s != null && preview) next[s] = preview;
      });
      return next;
    });

    setSaving(true);
    setError(skippedOversize ? 'Some images were over 5 MB and were skipped' : null);
    try {
      let latest = me;
      for (let i = 0; i < pickedList.length; i++) {
        const target = emptyIndices[i];
        const picked = pickedList[i];
        if (target == null || !picked) continue;
        latest = await uploadPortfolioPhoto(target, picked.file, picked.filename);
      }
      if (latest) {
        setDraft((d) => ({
          ...d,
          portfolio: portfolioSlotsFromProfile(latest.profile.portfolioPhotos, PORTFOLIO_SLOTS),
        }));
      }
      try {
        await generateComcard();
        setComcardSavedHint('Comcard updated');
      } catch {
        /* Non-fatal — user can tap Save comcard. */
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not upload portfolio photo');
    } finally {
      setSlotPreviewUri((prev) => {
        const next = [...prev];
        for (let i = 0; i < emptyIndices.length; i++) {
          const s = emptyIndices[i];
          const preview = previews[i];
          if (s != null && preview && next[s] === preview) next[s] = null;
        }
        return next;
      });
      if (Platform.OS === 'web' && typeof URL !== 'undefined' && 'revokeObjectURL' in URL) {
        for (const preview of previews) {
          if (preview) URL.revokeObjectURL(preview);
        }
      }
      setSaving(false);
    }
  };

  const onRemovePortfolio = (slot: number) => {
    if (!canPickImages || saving) return;
    const label = String(slot + 1).padStart(2, '0');
    Alert.alert(
      'Remove photo?',
      `Remove portfolio photo ${label}? This deletes it from your profile.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void confirmRemovePortfolio(slot);
          },
        },
      ],
    );
  };

  const confirmRemovePortfolio = async (slot: number) => {
    const next = [...displayPortfolio];
    next[slot] = null;
    setSaving(true);
    setError(null);
    try {
      await updateProfile({
        username: me?.username?.trim() || draft.displayName.trim() || 'PR',
        portfolioPhotos: portfolioSlotsFromProfile(next, PORTFOLIO_SLOTS),
      });
      setDraft((d) => ({ ...d, portfolio: next }));
      setSlotPreviewUri((prev) => {
        const copy = [...prev];
        copy[slot] = null;
        return copy;
      });
      if (next.some(Boolean)) {
        try {
          await generateComcard();
          setComcardSavedHint('Comcard updated');
        } catch {
          /* Non-fatal */
        }
      } else {
        setComcardSavedHint(null);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not remove portfolio photo');
    } finally {
      setSaving(false);
    }
  };

  const onReorderPortfolio = async (next: (string | null)[]) => {
    if (!canPickImages || saving) return;
    const normalized = portfolioSlotsFromProfile(next, PORTFOLIO_SLOTS);
    const prev = portfolioSlotsFromProfile(displayPortfolio, PORTFOLIO_SLOTS);
    if (prev.every((p, i) => p === normalized[i])) return;

    setSlotPreviewUri((previews) => {
      const nextPrev = Array.from({ length: PORTFOLIO_SLOTS }, () => null as string | null);
      const used = new Set<number>();
      for (let to = 0; to < PORTFOLIO_SLOTS; to++) {
        if (!normalized[to]) continue;
        for (let from = 0; from < PORTFOLIO_SLOTS; from++) {
          if (used.has(from)) continue;
          if (prev[from] === normalized[to]) {
            nextPrev[to] = previews[from];
            used.add(from);
            break;
          }
        }
      }
      return nextPrev;
    });

    setDraft((d) => ({ ...d, portfolio: normalized }));
    setPendingOrder(normalized);
    setPortfolioBusy('Saving arrangement…');
    showToast('Saving arrangement…', 'info');
    setSaving(true);
    setError(null);
    let saved = false;
    try {
      await updateProfile({
        username: me?.username?.trim() || draft.displayName.trim() || 'PR',
        portfolioPhotos: normalized,
      });
      saved = true;
    } catch (e) {
      setDraft((d) => ({ ...d, portfolio: prev }));
      setError(e instanceof ApiError ? e.message : 'Could not rearrange portfolio');
      showToast('Could not rearrange portfolio', 'error');
    } finally {
      // Unlock the grid as soon as the order is persisted — comcard rebuild
      // can take seconds and must not block the next drag.
      setSaving(false);
    }
    if (!saved) {
      setPendingOrder(null);
      setPortfolioBusy(null);
      return;
    }

    const cardChanged = [0, 1, 2, 3].some((i) => prev[i] !== normalized[i]);
    if (cardChanged && normalized.some(Boolean)) {
      setPortfolioBusy('Updating comcard…');
      showToast('Updating comcard…', 'info');
      try {
        await generateComcard();
        setComcardSavedHint('Comcard updated');
      } catch {
        /* Non-fatal — user can tap Save comcard. */
      }
    }

    setPendingOrder(null);
    setPortfolioBusy(null);
    showToast('Portfolio rearranged');
  };

  const agencyLabel =
    draft.agencyIds
      .map((id) => agencyOptions.find((a) => a.id === id)?.name)
      .filter(Boolean)
      .join(', ') || 'Select agencies';

  return (
    <View style={styles.screen}>
      <AppToast message={toast} variant={toastVariant} />

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
              <Text style={styles.badgeText}>Photo Comcard · IC</Text>
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
                <Text style={[styles.fieldLabel, { marginTop: 8 }]}>Email</Text>
                <TextInput
                  value={draft.email}
                  onChangeText={(v) => setDraft((d) => ({ ...d, email: v }))}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder="you@example.com"
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
              {tierBadges.map((t) => (
                <View key={`${t.agencyName ?? ''}-${t.label}`} style={styles.tier}>
                  <Star size={12} color={C.goldL} />
                  <Text style={styles.tierText}>
                    {t.agencyName ? `${t.agencyName} · ${t.label}` : t.label}
                  </Text>
                </View>
              ))}
              {!editing && (
                <Text style={styles.metaText}>Agency-Tied · {agencyNames}</Text>
              )}
              {!editing && pendingAgencyNames.length > 0 && (
                <Text style={styles.metaPending}>
                  Awaiting approval · {pendingAgencyNames.join(', ')}
                </Text>
              )}
              <Text style={styles.metaIc}>IC {ic}</Text>
            </View>

            {editing && (
              <View style={{ marginTop: 10 }}>
                <Text style={styles.fieldLabel}>Agencies</Text>
                <Pressable
                  style={[styles.agencyBtn, agencyLocked && { opacity: 0.6 }]}
                  disabled={agencyLocked}
                  onPress={() => setAgencyMenuOpen((o) => !o)}
                >
                  <Text style={styles.agencyBtnText} numberOfLines={1}>
                    {agencyLabel || 'Select agencies…'}
                  </Text>
                  {agencyLocked ? (
                    <Lock size={14} color={C.muted} />
                  ) : (
                    <ChevronDown size={16} color={C.muted} />
                  )}
                </Pressable>
                {agencyLocked && (
                  <Text style={styles.metaPending}>
                    Waiting for {pendingAgencyNames.join(', ')} to approve — you cannot
                    change agencies until they approve or reject.
                  </Text>
                )}
                {agencyMenuOpen && (
                  <View style={styles.agencyMenu}>
                    {agencyState === 'loading' && (
                      <Text style={styles.langEmptyText}>{t.signup.loadingAgencies}</Text>
                    )}
                    {agencyState === 'failed' && (
                      <>
                        <Text style={styles.agencyLoadError}>{t.signup.agencyLoadFailed}</Text>
                        <IzButton
                          label={t.signup.tryAgain}
                          variant="soft"
                          small
                          onPress={loadAgencies}
                        />
                      </>
                    )}
                    {agencyState === 'ready' && agencyOptions.length === 0 && (
                      <Text style={styles.langEmptyText}>{t.signup.noAgencies}</Text>
                    )}
                    {agencyOptions.map((a) => {
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
                    key={comcardTiles.src}
                    source={{ uri: assetUrl(comcardTiles.src)!, cache: 'reload' }}
                    style={StyleSheet.absoluteFillObject}
                    resizeMode="cover"
                  />
                ) : null}
              </View>
            ) : comcardTiles.mode === 'empty' ? (
              <View style={[styles.collage, styles.collageEmpty]}>
                <Text style={styles.collageEmptyText}>
                  {t.profile.noComcard}
                </Text>
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

          {canSaveComcard && comcardTiles.mode !== 'empty' && (
            <View style={styles.comcardActions}>
              <IzButton
                label={
                  savingComcard
                    ? t.profile.savingComcard
                    : me?.profile.comcardImage
                      ? t.profile.updateComcard
                      : t.profile.saveComcard
                }
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
                <Text style={styles.comcardSavedHint}>{t.profile.savedToProfile}</Text>
              ) : (
                <Text style={styles.comcardHint}>{t.profile.comcardHint}</Text>
              )}
            </View>
          )}

          {!editing && (
            <>
              <View style={styles.measureGrid}>
                <View style={styles.measure}>
                  <Text style={styles.measureLabel}>{t.profile.height}</Text>
                  <View style={styles.measureRow}>
                    <Text style={styles.measureValue}>{me?.profile.comcardHeightCm || '—'}</Text>
                    <Text style={styles.measureSuffix}>cm</Text>
                  </View>
                </View>
                <View style={styles.measure}>
                  <Text style={styles.measureLabel}>{t.profile.weight}</Text>
                  <View style={styles.measureRow}>
                    <Text style={styles.measureValue}>{me?.profile.comcardWeightKg || '—'}</Text>
                    <Text style={styles.measureSuffix}>kg</Text>
                  </View>
                </View>
                <View style={styles.measure}>
                  <Text style={styles.measureLabel}>{t.profile.age}</Text>
                  <View style={styles.measureRow}>
                    <Text style={styles.measureValue}>{me?.profile.dob ? age : '—'}</Text>
                    <Text style={styles.measureSuffix}>y</Text>
                  </View>
                </View>
              </View>
              <View style={styles.measureGrid}>
                <View style={styles.measure}>
                  <Text style={styles.measureLabel}>{t.profile.bust}</Text>
                  <View style={styles.measureRow}>
                    <Text style={styles.measureValue}>{me?.profile.comcardBustCm || '—'}</Text>
                    <Text style={styles.measureSuffix}>cm</Text>
                  </View>
                </View>
                <View style={styles.measure}>
                  <Text style={styles.measureLabel}>{t.profile.waist}</Text>
                  <View style={styles.measureRow}>
                    <Text style={styles.measureValue}>{me?.profile.comcardWaistCm || '—'}</Text>
                    <Text style={styles.measureSuffix}>cm</Text>
                  </View>
                </View>
                <View style={styles.measure}>
                  <Text style={styles.measureLabel}>{t.profile.hip}</Text>
                  <View style={styles.measureRow}>
                    <Text style={styles.measureValue}>{me?.profile.comcardHipCm || '—'}</Text>
                    <Text style={styles.measureSuffix}>cm</Text>
                  </View>
                </View>
              </View>
            </>
          )}

          {editing && (
            <>
              <View style={styles.measureGrid}>
                <MeasureField
                  label={t.profile.height}
                  suffix="cm"
                  value={draft.height ? String(draft.height) : ''}
                  onChange={(v) =>
                    setDraft((d) => ({ ...d, height: Number(v.replace(/\D/g, '')) || 0 }))
                  }
                />
                <MeasureField
                  label={t.profile.weight}
                  suffix="kg"
                  value={draft.weight ? String(draft.weight) : ''}
                  onChange={(v) =>
                    setDraft((d) => ({ ...d, weight: Number(v.replace(/\D/g, '')) || 0 }))
                  }
                />
                <MeasureField
                  label={t.profile.age}
                  suffix="y"
                  value={draft.age ? String(draft.age) : ''}
                  onChange={(v) =>
                    setDraft((d) => ({ ...d, age: Number(v.replace(/\D/g, '')) || 0 }))
                  }
                />
              </View>
              <View style={styles.measureGrid}>
                <MeasureField
                  label={t.profile.bust}
                  suffix="cm"
                  value={draft.bust ? String(draft.bust) : ''}
                  onChange={(v) =>
                    setDraft((d) => ({ ...d, bust: Number(v.replace(/\D/g, '')) || 0 }))
                  }
                />
                <MeasureField
                  label={t.profile.waist}
                  suffix="cm"
                  value={draft.waist ? String(draft.waist) : ''}
                  onChange={(v) =>
                    setDraft((d) => ({ ...d, waist: Number(v.replace(/\D/g, '')) || 0 }))
                  }
                />
                <MeasureField
                  label={t.profile.hip}
                  suffix="cm"
                  value={draft.hip ? String(draft.hip) : ''}
                  onChange={(v) =>
                    setDraft((d) => ({ ...d, hip: Number(v.replace(/\D/g, '')) || 0 }))
                  }
                />
              </View>
            </>
          )}
        </View>

        {/* Portfolio — accordion gallery */}
        <View style={[styles.section, styles.portfolioAccord]}>
          <Pressable
            style={styles.portfolioAccordHead}
            onPress={() => setPortfolioOpen((o) => !o)}
            accessibilityRole="button"
            accessibilityState={{ expanded: portfolioOpen }}
          >
            <View style={styles.galleryHeadText}>
              <Text style={styles.sectionTitle}>Portfolio</Text>
              <Text style={styles.gallerySub} numberOfLines={1}>
                {portfolioBusy
                  ? portfolioBusy
                  : portfolioOpen
                    ? canPickImages
                      ? 'Hold to drag · drop to swap'
                      : 'Showcase photos'
                    : `${displayPortfolio.filter(Boolean).length} of ${PORTFOLIO_SLOTS} photos`}
              </Text>
            </View>
            <View style={styles.portfolioAccordRight}>
              {portfolioBusy ? (
                <ActivityIndicator size="small" color={C.violetL} style={{ marginRight: 8 }} />
              ) : null}
              <View style={styles.galleryCount}>
                <Text style={styles.galleryCountNum}>
                  {displayPortfolio.filter(Boolean).length}
                </Text>
                <Text style={styles.galleryCountDen}>/{PORTFOLIO_SLOTS}</Text>
              </View>
              <ChevronDown
                size={18}
                color={C.violetL}
                style={{
                  transform: [{ rotate: portfolioOpen ? '180deg' : '0deg' }],
                }}
              />
            </View>
          </Pressable>

          {portfolioOpen ? (
            <>
              {portfolioBusy ? (
                <View style={styles.portfolioBusyRow}>
                  <ActivityIndicator size="small" color={C.violetL} />
                  <Text style={styles.portfolioBusyText}>{portfolioBusy}</Text>
                </View>
              ) : null}
              <PortfolioSlotGrid
              slots={displayPortfolio}
              previewUris={slotPreviewUri}
              slotCount={PORTFOLIO_SLOTS}
              canEdit={canPickImages}
              saving={saving}
              resolveUri={assetUrl}
              onPick={onPickPortfolio}
              onRemove={onRemovePortfolio}
              onReorder={(next) => {
                void onReorderPortfolio(next);
              }}
            />
            </>
          ) : null}
        </View>

        {/* Languages */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.profile.languages}</Text>
          {editing ? (
            <View style={styles.langPickerWrap}>
              <LanguageMultiPicker
                value={draft.languages}
                options={PR_LANGUAGE_OPTIONS}
                onChange={(next) => setDraft((d) => ({ ...d, languages: next }))}
              />
            </View>
          ) : languages.length === 0 ? (
            <Text style={styles.langEmptyText}>
              No languages yet — tap Edit profile to add them.
            </Text>
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
              label={saving ? t.profile.saving : t.profile.saveProfile}
              onPress={saveEdit}
              disabled={saving}
            />
            {saving && <ActivityIndicator color={C.gold} style={{ marginTop: 8 }} />}
            <IzButton
              label={t.profile.cancel}
              variant="soft"
              onPress={cancelEdit}
              disabled={saving}
              style={{ marginTop: 10 }}
            />
          </>
        ) : (
          <IzButton label={t.profile.editProfile} icon={Pencil} onPress={startEdit} />
        )}
      </View>

      <View style={styles.appLangRow}>
        <Text style={styles.appLangLabel}>{t.profile.appLanguage}</Text>
        <LanguageSwitcher compact />
      </View>

      <Pressable style={styles.securityBtn} onPress={openSecurity}>
        <Lock size={14} color={C.txt} />
        <Text style={styles.securityText}>{t.profile.securitySettings}</Text>
      </Pressable>

      <Pressable style={styles.signOutBtn} onPress={signOut}>
        <Text style={styles.signOutText}>{t.profile.signOut}</Text>
      </Pressable>
    </View>
  );
}

function emptyDraft(): Draft {
  return {
    displayName: '',
    icName: '',
    email: '',
    height: 0,
    weight: 0,
    bust: 0,
    waist: 0,
    hip: 0,
    age: 0,
    languages: [],
    agencyIds: [],
    portfolio: [],
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
          maxLength={3}
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
  appLangRow: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  appLangLabel: {
    fontFamily: F.sora,
    fontSize: 14,
    fontWeight: '600',
    color: C.muted,
  },
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
  collageEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  collageEmptyText: {
    fontFamily: F.manrope,
    fontSize: 13,
    lineHeight: 18,
    color: C.prMuted,
    textAlign: 'center',
  },
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
    overflow: 'hidden',
    minWidth: 0,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  measureLabel: {
    fontFamily: F.sora,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: C.blue,
  },
  measureRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    minWidth: 0,
  },
  measureValue: {
    flexShrink: 1,
    fontFamily: F.sora,
    fontSize: 22,
    fontWeight: '800',
    color: C.txt,
  },
  measureInput: {
    // Sized to 3 digits, not flex — a stretched input pushes the unit out of the box.
    width: 46,
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 0,
    fontFamily: F.sora,
    fontSize: 22,
    fontWeight: '800',
    color: C.txt,
    padding: 0,
  },
  measureSuffix: { flexShrink: 0, fontFamily: F.manrope, fontSize: 12, color: C.blue },
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
  galleryHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  portfolioAccord: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    overflow: 'hidden',
    paddingBottom: 0,
  },
  portfolioAccordHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  portfolioAccordRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  galleryHeadText: { flex: 1, minWidth: 0, gap: 2 },
  gallerySub: {
    fontFamily: F.manrope,
    fontSize: 11,
    lineHeight: 15,
    color: C.prMuted,
  },
  galleryCount: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(183,156,232,0.1)',
  },
  galleryCountNum: {
    fontFamily: F.sora,
    fontSize: 13,
    fontWeight: '700',
    color: C.violetL,
  },
  galleryCountDen: {
    fontFamily: F.manrope,
    fontSize: 11,
    color: C.prMuted,
  },
  portfolioBusyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 12,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(183,156,232,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(183,156,232,0.22)',
  },
  portfolioBusyText: {
    flex: 1,
    fontFamily: F.manrope,
    fontSize: 12,
    color: C.violetL,
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
  langEmptyText: { marginTop: 8, fontFamily: F.manrope, fontSize: 13, color: C.prMuted },
  agencyLoadError: {
    marginTop: 8,
    marginBottom: 10,
    fontFamily: F.manrope,
    fontSize: 13,
    color: C.red,
  },
  metaPending: { marginTop: 2, fontFamily: F.manrope, fontSize: 11, color: C.amber },
  langPickerWrap: { marginTop: 8 },
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
