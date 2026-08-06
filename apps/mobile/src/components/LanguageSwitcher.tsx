/**
 * Compact EN / 简体中文 / 繁體中文 switcher — same idea as web HandoffLanguageSwitcher.
 */
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { C, F } from '../theme/theme';
import { useLocale, type AppLocale } from '../i18n';
import { ChevronDown } from './icons';

type Props = {
  /** Compact pill for login/profile headers. */
  compact?: boolean;
};

export function LanguageSwitcher({ compact = false }: Props) {
  const { locale, t, setLocale } = useLocale();
  const [open, setOpen] = useState(false);

  const options: { id: AppLocale; label: string }[] = [
    { id: 'en', label: t.lang.english },
    { id: 'zh', label: t.lang.chinese },
    { id: 'zh-Hant', label: t.lang.chineseTraditional },
  ];

  const pick = (next: AppLocale) => {
    setLocale(next);
    setOpen(false);
  };

  return (
    <>
      <Pressable
        style={[styles.trigger, compact && styles.triggerCompact]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t.lang.language}
      >
        <Text style={[styles.triggerText, compact && styles.triggerTextCompact]}>
          {t.lang.language}
        </Text>
        <ChevronDown size={compact ? 12 : 14} color={C.muted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{t.lang.language}</Text>
            {options.map((opt) => {
              const active = locale === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  style={[styles.option, active && styles.optionActive]}
                  onPress={() => pick(opt.id)}
                >
                  <Text style={[styles.optionText, active && styles.optionTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable style={styles.cancel} onPress={() => setOpen(false)}>
              <Text style={styles.cancelText}>{t.common.cancel}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  triggerCompact: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  triggerText: {
    fontFamily: F.sora,
    fontSize: 13,
    fontWeight: '600',
    color: C.muted,
    letterSpacing: 0.2,
  },
  triggerTextCompact: {
    fontSize: 12,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  sheet: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.bg2,
    padding: 16,
    gap: 8,
  },
  sheetTitle: {
    fontFamily: F.sora,
    fontSize: 14,
    fontWeight: '700',
    color: C.muted,
    marginBottom: 4,
    letterSpacing: 0.4,
  },
  option: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  optionActive: {
    backgroundColor: 'rgba(227,184,119,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(227,184,119,0.35)',
  },
  optionText: {
    fontFamily: F.sora,
    fontSize: 16,
    fontWeight: '600',
    color: C.txt,
  },
  optionTextActive: {
    color: C.goldL,
  },
  cancel: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },
  cancelText: {
    fontFamily: F.sora,
    fontSize: 14,
    fontWeight: '600',
    color: C.muted,
  },
});
