import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatMessage, useLocale } from '../../i18n';
import type { SignupFieldCopy } from '../../i18n/signup-copy';
import { C, F, GRADIENTS, grad } from '../../theme/theme';
import { Camera, Check, Shield } from '../../components/icons';
import { captureFromCamera } from '../../lib/photo-file';
import {
  isValidNricFormat,
  nricMatchesDob,
  ocrLooksSamePhoto,
  verifyIdPhotoMatches,
  type IdOcrMatch,
} from '../../lib/id-ocr';
import type { Draft, FieldErrors, IdType } from './types';

type Slot = 'idPhotoFrontUri' | 'idPhotoBackUri';

type Props = {
  draft: Draft;
  fieldErrors: FieldErrors;
  patch: (part: Partial<Draft>) => void;
  clearFieldError: (key: keyof FieldErrors) => void;
};

type OcrCopy = Pick<
  SignupFieldCopy,
  | 'readingSide'
  | 'idSideHint'
  | 'idMatched'
  | 'wrongSide'
  | 'photoMismatch'
  | 'photoMissingId'
  | 'unreadableSide'
  | 'ocrUnavailable'
  | 'readingPassport'
  | 'passportHint'
  | 'passportMatched'
  | 'passportMismatch'
  | 'passportMissing'
  | 'unreadablePassport'
>;

/**
 * Play / App Store: show an in-app rationale the first time the user taps
 * camera on Step 4 — even if OS camera permission was already granted
 * elsewhere. Survives Step 4 remounts in this JS session so it does not
 * nag again after they tap Allow.
 */
let idCameraExplainerAcked = false;

function idLabel(
  idType: IdType | '',
  copy: Pick<SignupFieldCopy, 'docNric' | 'docPassport' | 'docWorkPermit'>,
): string {
  if (idType === 'Passport') return copy.docPassport;
  if (idType === 'Work permit') return copy.docWorkPermit;
  return copy.docNric;
}

function ocrMessage(
  side: 'front' | 'back',
  result: IdOcrMatch | null,
  busy: boolean,
  copy: OcrCopy &
    Pick<
      SignupFieldCopy,
      'sideFront' | 'sideBack' | 'wrongSideUnknown' | 'wrongSideLooksLike'
    >,
): { text: string; tone: 'ok' | 'bad' | 'muted' } {
  const sideLabel = side === 'front' ? copy.sideFront : copy.sideBack;
  if (busy) {
    return {
      text: formatMessage(copy.readingSide, { side: sideLabel }),
      tone: 'muted',
    };
  }
  if (!result) {
    return {
      text: formatMessage(copy.idSideHint, { side: sideLabel }),
      tone: 'muted',
    };
  }
  if (result.status === 'matched') {
    return {
      text: formatMessage(copy.idMatched, {
        side: sideLabel,
        seen: result.seen ?? '',
      }),
      tone: 'ok',
    };
  }
  if (result.status === 'wrong_side') {
    const detectedLabel =
      result.detected === 'front'
        ? copy.sideFront
        : result.detected === 'back'
          ? copy.sideBack
          : result.detected;
    const got =
      result.detected === 'unknown'
        ? copy.wrongSideUnknown
        : formatMessage(copy.wrongSideLooksLike, { detected: detectedLabel });
    return {
      text: formatMessage(copy.wrongSide, {
        got,
        expected:
          result.expectedSide === 'front'
            ? copy.sideFront
            : result.expectedSide === 'back'
              ? copy.sideBack
              : result.expectedSide,
      }),
      tone: 'bad',
    };
  }
  if (result.status === 'mismatch') {
    return {
      text: result.seen
        ? formatMessage(copy.photoMismatch, {
            seen: result.seen,
            expected: result.expected,
          })
        : formatMessage(copy.photoMissingId, {
            expected: result.expected,
            side: sideLabel,
          }),
      tone: 'bad',
    };
  }
  if (result.status === 'unreadable') {
    return {
      text: formatMessage(copy.unreadableSide, { side: sideLabel }),
      tone: 'bad',
    };
  }
  return { text: copy.ocrUnavailable, tone: 'bad' };
}

function passportOcrMessage(
  result: IdOcrMatch | null,
  busy: boolean,
  copy: OcrCopy,
): { text: string; tone: 'ok' | 'bad' | 'muted' } {
  if (busy) return { text: copy.readingPassport, tone: 'muted' };
  if (!result) {
    return { text: copy.passportHint, tone: 'muted' };
  }
  if (result.status === 'matched') {
    return {
      text: formatMessage(copy.passportMatched, { seen: result.seen ?? '' }),
      tone: 'ok',
    };
  }
  if (result.status === 'mismatch') {
    return {
      text: result.seen
        ? formatMessage(copy.passportMismatch, {
            seen: result.seen,
            expected: result.expected,
          })
        : formatMessage(copy.passportMissing, { expected: result.expected }),
      tone: 'bad',
    };
  }
  if (result.status === 'unreadable') {
    return { text: copy.unreadablePassport, tone: 'bad' };
  }
  return { text: copy.ocrUnavailable, tone: 'bad' };
}

function CaptureRow({
  label,
  uri,
  msg,
  error,
  busy,
  spinning,
  onCapture,
  onClear,
  removeLabel,
  retakeLabel,
  openCameraLabel,
}: {
  label: string;
  uri: string;
  msg: { text: string; tone: 'ok' | 'bad' | 'muted' };
  error?: string;
  busy: boolean;
  spinning: boolean;
  onCapture: () => void;
  onClear: () => void;
  removeLabel: string;
  retakeLabel: string;
  openCameraLabel: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      {uri ? (
        <Image source={{ uri }} style={styles.thumb} />
      ) : (
        <View style={styles.thumbEmpty}>
          <Camera size={20} color={C.muted2} strokeWidth={2} />
        </View>
      )}
      <Text
        style={[
          styles.ocrLine,
          msg.tone === 'ok' && styles.ocrOk,
          msg.tone === 'bad' && styles.ocrBad,
        ]}
      >
        {msg.text}
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        {uri ? (
          <>
            <Pressable style={styles.btnSoft} onPress={onClear} disabled={busy}>
              <Text style={styles.btnSoftText}>{removeLabel}</Text>
            </Pressable>
            <Pressable
              style={styles.btnPrimary}
              onPress={onCapture}
              disabled={busy}
            >
              {spinning ? (
                <ActivityIndicator color="#241a08" />
              ) : (
                <>
                  <Camera size={15} color="#241a08" strokeWidth={2.2} />
                  <Text style={styles.btnPrimaryText}>{retakeLabel}</Text>
                </>
              )}
            </Pressable>
          </>
        ) : (
          <Pressable
            style={styles.btnPrimary}
            onPress={onCapture}
            disabled={busy}
          >
            {spinning ? (
              <ActivityIndicator color="#241a08" />
            ) : (
              <>
                <Camera size={15} color="#241a08" strokeWidth={2.2} />
                <Text style={styles.btnPrimaryText}>{openCameraLabel}</Text>
              </>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}

export function Step4VerifyPhotos({
  draft,
  fieldErrors,
  patch,
  clearFieldError,
}: Props) {
  const { t } = useLocale();
  const insets = useSafeAreaInsets();
  const [busySlot, setBusySlot] = useState<Slot | null>(null);
  const [ocrBusySlot, setOcrBusySlot] = useState<Slot | null>(null);
  // Restore OCR “matched” UI when the user leaves Step 4 and comes back —
  // draft keeps idFrontOcrOk / photos, but local OCR state remounts empty.
  const [frontOcr, setFrontOcr] = useState<IdOcrMatch | null>(() =>
    draft.idFrontOcrOk && draft.idPhotoFrontUri
      ? {
          status: 'matched',
          seen: draft.idNo.trim() || t.signup.idNoEmpty,
          side: draft.idType === 'Passport' ? 'unknown' : 'front',
          rawText: `__kept_front__:${draft.idPhotoFrontUri}`,
        }
      : null,
  );
  const [backOcr, setBackOcr] = useState<IdOcrMatch | null>(() =>
    draft.idBackOcrOk && draft.idPhotoBackUri
      ? {
          status: 'matched',
          seen: draft.idNo.trim() || t.signup.idNoEmpty,
          side: 'back',
          rawText: `__kept_back__:${draft.idPhotoBackUri}`,
        }
      : null,
  );
  const [promptOpen, setPromptOpen] = useState(false);
  const [pendingSlot, setPendingSlot] = useState<Slot | null>(null);
  const doc = idLabel(draft.idType, t.signup);

  const runOcr = useCallback(
    async (slot: Slot, uri: string) => {
      const expectedSide = slot === 'idPhotoFrontUri' ? 'front' : 'back';
      const okKey = slot === 'idPhotoFrontUri' ? 'idFrontOcrOk' : 'idBackOcrOk';
      const setResult = slot === 'idPhotoFrontUri' ? setFrontOcr : setBackOcr;
      const otherResult = slot === 'idPhotoFrontUri' ? backOcr : frontOcr;
      const otherOkKey =
        slot === 'idPhotoFrontUri' ? 'idBackOcrOk' : 'idFrontOcrOk';
      const setOtherResult =
        slot === 'idPhotoFrontUri' ? setBackOcr : setFrontOcr;

      setOcrBusySlot(slot);
      try {
        if (draft.idType === 'NRIC') {
          if (!isValidNricFormat(draft.idNo)) {
            setResult({
              status: 'mismatch',
              seen: null,
              expected: draft.idNo || t.signup.idNoEmpty,
              rawText: '',
            });
            patch({ [okKey]: false });
            return;
          }
          if (!nricMatchesDob(draft.idNo, draft.dob)) {
            setResult({
              status: 'mismatch',
              seen: null,
              expected: formatMessage(t.signup.nricMustMatchDob, {
                id: draft.idNo,
              }),
              rawText: '',
            });
            patch({ [okKey]: false });
            return;
          }
        }

        const result = await verifyIdPhotoMatches(
          uri,
          draft.idNo,
          draft.idType || 'NRIC',
          draft.idType === 'Passport' ? 'any' : expectedSide,
        );

        // Same photo (or same side) used for front and back — refuse both.
        if (
          result.status === 'matched' &&
          otherResult?.status === 'matched' &&
          draft.idType !== 'Passport' &&
          (ocrLooksSamePhoto(result.rawText, otherResult.rawText) ||
            (result.side !== 'unknown' &&
              otherResult.side !== 'unknown' &&
              result.side === otherResult.side))
        ) {
          const dup: IdOcrMatch = {
            status: 'wrong_side',
            seen: result.seen,
            expectedSide,
            detected:
              result.side === 'unknown' ? otherResult.side : result.side,
            rawText: result.rawText,
          };
          setResult(dup);
          setOtherResult({
            ...dup,
            expectedSide: expectedSide === 'front' ? 'back' : 'front',
          });
          patch({ [okKey]: false, [otherOkKey]: false });
          return;
        }

        setResult(result);
        const ok = result.status === 'matched';
        if (draft.idType === 'Passport' && slot === 'idPhotoFrontUri') {
          patch({
            idFrontOcrOk: ok,
            idPhotoBackUri: '',
            idPhotoBackFile: null,
            idBackOcrOk: true,
          });
        } else {
          patch({ [okKey]: ok });
        }
        if (ok) clearFieldError(slot);
      } catch {
        // Native OCR / camera quirks must not take down the signup screen.
        setResult({ status: 'unreadable' });
        patch({ [okKey]: false });
      } finally {
        setOcrBusySlot(null);
      }
    },
    [
      backOcr,
      clearFieldError,
      draft.dob,
      draft.idNo,
      draft.idType,
      frontOcr,
      patch,
      t.signup,
    ],
  );

  const shoot = useCallback(
    async (slot: Slot) => {
      if (busySlot || ocrBusySlot) return;
      setBusySlot(slot);
      try {
        const passport = draft.idType === 'Passport';
        const picked = await captureFromCamera({
          facing: 'back',
          filename:
            slot === 'idPhotoFrontUri'
              ? passport
                ? 'id-passport.jpg'
                : 'id-front.jpg'
              : 'id-back.jpg',
        });
        if (!picked?.previewUri) return;
        clearFieldError(slot);
        const okKey =
          slot === 'idPhotoFrontUri' ? 'idFrontOcrOk' : 'idBackOcrOk';
        const fileKey =
          slot === 'idPhotoFrontUri' ? 'idPhotoFrontFile' : 'idPhotoBackFile';
        patch({
          [slot]: picked.previewUri,
          [fileKey]: picked.file,
          [okKey]: false,
          ...(passport && slot === 'idPhotoFrontUri'
            ? {
                idPhotoBackUri: '',
                idPhotoBackFile: null,
                idBackOcrOk: true,
              }
            : {}),
        });
        await runOcr(slot, picked.previewUri);
      } catch {
        // Camera cancel / native failure — keep the wizard alive.
      } finally {
        setBusySlot(null);
      }
    },
    [busySlot, clearFieldError, draft.idType, ocrBusySlot, patch, runOcr],
  );

  const requestCapture = (slot: Slot) => {
    if (busySlot || ocrBusySlot) return;
    // First tap always shows the rationale (Google/Apple policy), even if
    // OS camera is already allowed. Later taps / remounts skip it.
    if (!idCameraExplainerAcked) {
      setPendingSlot(slot);
      setPromptOpen(true);
      return;
    }
    void shoot(slot);
  };

  const confirmCameraAccess = () => {
    idCameraExplainerAcked = true;
    const slot = pendingSlot;
    setPromptOpen(false);
    setPendingSlot(null);
    if (slot) void shoot(slot);
  };

  const passportOnly = draft.idType === 'Passport';
  const frontBusy = ocrBusySlot === 'idPhotoFrontUri';
  const ocrCopy = t.signup;
  // If draft already says OCR passed (user left & returned), force a green
  // “matched” line even before local OCR state hydrates.
  const frontDisplay: IdOcrMatch | null =
    frontOcr?.status === 'matched'
      ? frontOcr
      : draft.idFrontOcrOk && draft.idPhotoFrontUri
        ? {
            status: 'matched',
            seen: draft.idNo.trim() || t.signup.idNoEmpty,
            side: passportOnly ? 'unknown' : 'front',
            rawText: '',
          }
        : frontOcr;
  const backDisplay: IdOcrMatch | null =
    backOcr?.status === 'matched'
      ? backOcr
      : draft.idBackOcrOk && draft.idPhotoBackUri
        ? {
            status: 'matched',
            seen: draft.idNo.trim() || t.signup.idNoEmpty,
            side: 'back',
            rawText: '',
          }
        : backOcr;
  const frontMsg = passportOnly
    ? passportOcrMessage(frontDisplay, frontBusy, ocrCopy)
    : ocrMessage('front', frontDisplay, frontBusy, ocrCopy);
  const backMsg = ocrMessage(
    'back',
    backDisplay,
    ocrBusySlot === 'idPhotoBackUri',
    ocrCopy,
  );
  const busy = busySlot !== null || ocrBusySlot !== null;
  const frontOk =
    frontDisplay?.status === 'matched' ||
    (draft.idFrontOcrOk && Boolean(draft.idPhotoFrontUri));
  const backOk =
    passportOnly ||
    backDisplay?.status === 'matched' ||
    (draft.idBackOcrOk && Boolean(draft.idPhotoBackUri));
  const verified = frontOk && backOk;
  /**
   * `rawText` is on only THREE of `IdOcrMatch`'s five variants — 'unreadable'
   * and 'unavailable' carry nothing but a status — so reading it straight off
   * the union was a type error (TS2339), which is why this line sat in the
   * baseline. It is NOT dead code: the kept-photo path above builds a match
   * with `rawText: '__kept_front__:…'`, so at runtime the test does fire.
   * Narrowed with `in` rather than widening the type, because the two
   * status-only variants genuinely have no raw text to report.
   */
  const keptPhoto = (ocr: typeof frontOcr): boolean =>
    !!ocr && 'rawText' in ocr && ocr.rawText.startsWith('__kept_');
  const restored =
    verified &&
    (keptPhoto(frontOcr) ||
      keptPhoto(backOcr) ||
      (draft.idFrontOcrOk &&
        Boolean(draft.idPhotoFrontUri) &&
        frontOcr?.status === 'matched'));

  return (
    <>
      <View style={styles.intro}>
        <Shield size={18} color={C.accent} strokeWidth={2.1} />
        <Text style={styles.introBody}>{t.signup.idVerifyIntro}</Text>
      </View>

      <CaptureRow
        label={
          passportOnly
            ? formatMessage(t.signup.passportPage, { doc })
            : formatMessage(t.signup.idFront, { doc })
        }
        uri={draft.idPhotoFrontUri}
        msg={frontMsg}
        error={fieldErrors.idPhotoFrontUri}
        busy={busy}
        spinning={
          busySlot === 'idPhotoFrontUri' || ocrBusySlot === 'idPhotoFrontUri'
        }
        onCapture={() => requestCapture('idPhotoFrontUri')}
        onClear={() => {
          clearFieldError('idPhotoFrontUri');
          setFrontOcr(null);
          patch({
            idPhotoFrontUri: '',
            idPhotoFrontFile: null,
            idFrontOcrOk: false,
            ...(passportOnly
              ? {
                  idPhotoBackUri: '',
                  idPhotoBackFile: null,
                  idBackOcrOk: true,
                }
              : {}),
          });
        }}
        removeLabel={t.signup.remove}
        retakeLabel={t.signup.retake}
        openCameraLabel={t.signup.openCamera}
      />

      {!passportOnly ? (
        <CaptureRow
          label={formatMessage(t.signup.idBack, { doc })}
          uri={draft.idPhotoBackUri}
          msg={backMsg}
          error={fieldErrors.idPhotoBackUri}
          busy={busy}
          spinning={
            busySlot === 'idPhotoBackUri' || ocrBusySlot === 'idPhotoBackUri'
          }
          onCapture={() => requestCapture('idPhotoBackUri')}
          onClear={() => {
            clearFieldError('idPhotoBackUri');
            setBackOcr(null);
            patch({
              idPhotoBackUri: '',
              idPhotoBackFile: null,
              idBackOcrOk: false,
            });
          }}
          removeLabel={t.signup.remove}
          retakeLabel={t.signup.retake}
          openCameraLabel={t.signup.openCamera}
        />
      ) : null}

      {verified ? (
        <View style={styles.okBanner}>
          <Check size={14} color={C.green} strokeWidth={2.6} />
          <View style={styles.okBannerCopy}>
            <Text style={styles.okBannerText}>
              {restored ? t.signup.idVerifyKept : t.signup.idVerifyOk}
            </Text>
            <Text style={styles.okBannerHint}>
              {restored
                ? t.signup.idVerifyContinueHint
                : t.signup.idVerifyOkHint}
            </Text>
          </View>
        </View>
      ) : null}

      <Modal
        visible={promptOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPromptOpen(false)}
      >
        <View style={styles.promptBackdrop}>
          <View
            style={[
              styles.promptSheet,
              { paddingBottom: 18 + Math.max(insets.bottom, 12) },
            ]}
          >
            <Camera size={26} color={C.accent} strokeWidth={2.2} />
            <Text style={styles.promptTitle}>{t.signup.idCameraTitle}</Text>
            <Text style={styles.promptBody}>{t.signup.idCameraBody}</Text>
            <Pressable
              style={[styles.promptEnableBtn, grad(GRADIENTS.accent, C.accent)]}
              onPress={confirmCameraAccess}
            >
              <Text style={styles.promptEnableText}>
                {t.signup.idCameraAllow}
              </Text>
            </Pressable>
            <Pressable
              style={styles.promptCancel}
              onPress={() => {
                setPromptOpen(false);
                setPendingSlot(null);
              }}
            >
              <Text style={styles.promptCancelText}>
                {t.signup.idCameraNotNow}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  intro: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(227,184,119,0.28)',
    backgroundColor: 'rgba(227,184,119,0.08)',
    alignItems: 'flex-start',
  },
  introBody: {
    flex: 1,
    fontFamily: F.manrope,
    fontSize: 13,
    lineHeight: 18,
    color: C.prMuted,
  },
  row: {
    marginBottom: 14,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.panel,
  },
  label: {
    fontFamily: F.sora,
    fontSize: 14,
    fontWeight: '700',
    color: C.txt,
    marginBottom: 8,
  },
  thumb: {
    width: '100%',
    height: 140,
    borderRadius: 12,
    backgroundColor: '#0e0b16',
  },
  thumbEmpty: {
    height: 100,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.bg2,
  },
  ocrLine: {
    fontFamily: F.manrope,
    fontSize: 12,
    lineHeight: 17,
    color: C.muted2,
    marginTop: 8,
  },
  ocrOk: { color: C.green },
  ocrBad: { color: C.red },
  error: {
    fontFamily: F.manrope,
    fontSize: 12,
    color: C.red,
    marginTop: 4,
  },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btnPrimary: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: C.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  btnPrimaryText: {
    fontFamily: F.sora,
    fontSize: 14,
    fontWeight: '700',
    color: '#241a08',
  },
  btnSoft: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: C.glass2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSoftText: {
    fontFamily: F.sora,
    fontSize: 14,
    fontWeight: '700',
    color: C.prMuted,
  },
  okBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: C.greenBg,
    marginBottom: 8,
  },
  okBannerCopy: {
    flex: 1,
    gap: 2,
  },
  okBannerText: {
    fontFamily: F.sora,
    fontSize: 13,
    fontWeight: '700',
    color: C.green,
  },
  okBannerHint: {
    fontFamily: F.manrope,
    fontSize: 12,
    lineHeight: 17,
    color: C.prMuted,
  },
  promptBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    justifyContent: 'flex-end',
  },
  promptSheet: {
    paddingTop: 22,
    paddingHorizontal: 20,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.panel,
    alignItems: 'center',
    gap: 8,
  },
  promptTitle: {
    fontFamily: F.sora,
    fontSize: 18,
    fontWeight: '800',
    color: C.txt,
    textAlign: 'center',
  },
  promptBody: {
    fontFamily: F.manrope,
    fontSize: 14,
    lineHeight: 20,
    color: C.prMuted,
    textAlign: 'center',
    marginBottom: 8,
  },
  promptEnableBtn: {
    alignSelf: 'stretch',
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promptEnableText: {
    fontFamily: F.sora,
    fontSize: 15,
    fontWeight: '800',
    color: '#241a08',
  },
  promptCancel: { paddingVertical: 10, paddingHorizontal: 16 },
  promptCancelText: {
    fontFamily: F.sora,
    fontSize: 14,
    fontWeight: '700',
    color: C.muted2,
  },
});
