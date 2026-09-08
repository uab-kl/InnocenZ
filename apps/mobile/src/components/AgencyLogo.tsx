/**
 * A company's mark — the agency logo, with initials when there is no logo.
 *
 * ⚠️ THE FALLBACK IS THE NORMAL PATH, not an error case. `agency.logo_image` is
 * null for most agencies on the platform (3 of the 5 live rows on 8 Sep 2026),
 * so a placeholder image would render "missing" as the usual state of the
 * screen. Initials read as a deliberate monogram instead, and they stay legible
 * at the small sizes these badges are drawn at.
 *
 * `logoImage` is an R2 OBJECT KEY (`agency/<id>/logo/<file>`), resolved through
 * `assetUrl()` at RENDER time — never stored resolved, because the CDN base
 * comes from whichever API response last carried it. `logoUrl` is for a caller
 * that already holds an absolute URL, and wins when both are given.
 *
 * A URL that 404s falls back too: `onError` flips to the initials rather than
 * leaving a broken-image box on the card.
 */
import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { assetUrl } from '../lib/api';
import { C, F } from '../theme/theme';
import { font } from '../theme/fonts';

export function AgencyLogo({
  logoUrl,
  logoImage,
  name,
  size = 34,
  selected = false,
}: {
  /** An absolute URL, when the caller already has one. Wins over `logoImage`. */
  logoUrl?: string | null;
  /** The stored R2 object key — resolved here, at render time. */
  logoImage?: string | null;
  /** Drives the initials fallback, so it is required even when a logo exists. */
  name: string;
  /** Square edge in px. The corner radius and the initial scale with it. */
  size?: number;
  /** Draws the gold selected ring (the sign-up agency picker). */
  selected?: boolean;
}) {
  const uri = (logoUrl || assetUrl(logoImage) || '').trim() || null;
  const [broken, setBroken] = useState(false);
  // Reset on a NEW uri: without this, one agency's 404 would keep the next
  // agency's perfectly good logo hidden behind a stale `broken`.
  useEffect(() => {
    setBroken(false);
  }, [uri]);

  const show = Boolean(uri) && !broken;
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const box = {
    width: size,
    height: size,
    borderRadius: Math.round(size * 0.29),
  };

  return (
    <View style={[styles.avatar, box, selected && styles.avatarOn]}>
      {show ? (
        <Image
          // Keyed on the uri so a changed logo actually re-fetches.
          key={uri!}
          source={{ uri: uri! }}
          style={{ width: size, height: size }}
          resizeMode="cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <Text
          style={[
            styles.avatarInitial,
            { fontSize: Math.round(size * 0.41) },
            selected && styles.avatarInitialOn,
          ]}
        >
          {initial}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.glass2,
    borderWidth: 1,
    borderColor: C.line,
    overflow: 'hidden',
    position: 'relative',
  },
  avatarOn: {
    backgroundColor: 'rgba(227,184,119,0.14)',
    borderColor: 'rgba(227,184,119,0.35)',
  },
  avatarInitial: {
    ...font(700),
    color: C.prMuted,
  },
  avatarInitialOn: { color: C.accent },
});
