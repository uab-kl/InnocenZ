/**
 * `.iz-collapsible-section` port — PR Shifts home sections ("TODAY", "TO-DO",
 * "AGENCY SCHEDULE") with the uppercase Sora title, "Tap to collapse/expand"
 * gold hint, and the bordered chevron box that highlights when open.
 */
import React, { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { C, F, GRADIENTS, grad } from '../theme/theme';
import { ChevronDown, type IconComponent } from './icons';

export function Section({
  title,
  icon: Icon,
  open,
  onToggle,
  children,
}: {
  title: string;
  icon: IconComponent;
  open: boolean;
  onToggle: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <View
      style={[
        styles.section,
        grad(open ? GRADIENTS.sectionOpen : GRADIENTS.sectionClosed, 'rgba(255,255,255,0.02)'),
        open && styles.sectionOpen,
      ]}
    >
      <Pressable style={styles.trigger} onPress={() => onToggle(!open)}>
        <View style={styles.triggerBody}>
          <View style={styles.titleRow}>
            <Icon size={14} color={C.goldL} />
            <Text style={styles.title}>{title.toUpperCase()}</Text>
          </View>
          <Text style={styles.action}>{open ? 'Tap to collapse' : 'Tap to expand'}</Text>
        </View>
        <View style={[styles.chev, open && styles.chevOpen]}>
          <ChevronDown
            size={16}
            color={open ? C.goldL : C.muted}
            style={open ? { transform: [{ rotate: '180deg' }] } : undefined}
          />
        </View>
      </Pressable>
      {open && <View style={styles.body}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line2,
    overflow: 'hidden',
  },
  sectionOpen: {
    borderColor: 'rgba(183,156,232,0.32)',
  },
  trigger: {
    flexDirection: 'row',
    width: '100%',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  triggerBody: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontFamily: F.sora,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.44,
    color: C.txt,
  },
  action: {
    fontFamily: F.manrope,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.24,
    color: C.goldL,
    marginTop: 4,
  },
  chev: {
    height: 32,
    width: 32,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  chevOpen: {
    borderColor: 'rgba(183,156,232,0.35)',
  },
  body: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderTopColor: C.line,
  },
});
