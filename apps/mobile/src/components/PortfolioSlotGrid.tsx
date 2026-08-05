/**
 * Portfolio gallery — 2-col 3:4 tiles.
 * Long-press a photo, drag onto another slot to swap (empty or filled).
 * If scroll cancels the drag, the photo stays picked — tap another slot to swap.
 *
 * Source slot comes from pageX/pageY hit-test (not locationX — on Android that
 * is child-relative and always looks like slot 0). Ghost follows via gesture
 * dx/dy. Parent ScrollView is locked for the duration of the drag so it cannot
 * steal the move and kill the drop.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { C, F } from '../theme/theme';
import { ImagePlus, XIcon } from './icons';
import { lockPhoneScroll, unlockPhoneScroll, scrollPhoneBy, autoScrollDirectionForFinger, refreshPhoneScrollWindow } from '../lib/phone-scroll';

type Props = {
  slots: (string | null)[];
  previewUris?: (string | null)[];
  slotCount: number;
  canEdit: boolean;
  saving?: boolean;
  resolveUri: (path: string) => string | null;
  onPick: (slot: number) => void;
  onRemove: (slot: number) => void;
  onReorder: (next: (string | null)[]) => void;
};

type DragState = {
  from: number;
  over: number | null;
  path: string;
};

type GridOrigin = { x: number; y: number };

const LONG_PRESS_MS = 320;
const JITTER_PX = 28;
const COLS = 2;
const GAP = 10;
const PAD = 12;
const GRID_DOM_ID = 'iz-portfolio-grid';
/** px per tick while finger is in the ScrollView edge zone. */
const AUTO_SCROLL_SPEED = 18;

function swapSlots(
  slots: (string | null)[],
  slotCount: number,
  from: number,
  to: number,
): (string | null)[] {
  const next = [...slots];
  while (next.length < slotCount) next.push(null);
  const tmp = next[from];
  next[from] = next[to];
  next[to] = tmp;
  return next;
}

function cellRect(index: number, tileW: number, tileH: number) {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  return {
    x: PAD + col * (tileW + GAP),
    y: row * (tileH + GAP),
    width: tileW,
    height: tileH,
  };
}

export function PortfolioSlotGrid({
  slots,
  previewUris,
  slotCount,
  canEdit,
  saving = false,
  resolveUri,
  onPick,
  onRemove,
  onReorder,
}: Props) {
  const gridRef = useRef<View>(null);
  const gridOrigin = useRef<GridOrigin>({ x: 0, y: 0 });
  const dragRef = useRef<DragState | null>(null);
  const longTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activated = useRef(false);
  const pressSlot = useRef<number | null>(null);
  const slotsRef = useRef(slots);
  const previewRef = useRef(previewUris);
  const pickedRef = useRef<number | null>(null);
  const tileSizeRef = useRef({ w: 0, h: 0 });
  const dragAnchor = useRef({
    grantLocalX: 0,
    grantLocalY: 0,
    grantPageX: 0,
    grantPageY: 0,
  });
  const scrollLocked = useRef(false);
  /** Extra local-Y from programmatic scroll during this drag (slot 8 → 1). */
  const scrollDeltaY = useRef(0);
  const autoScrollDir = useRef(0);
  const autoScrollRaf = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastFinger = useRef({ dx: 0, dy: 0, pageY: 0 });
  /** Ghost position — Animated so moves don't React-render (that froze the gesture). */
  const ghostXY = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const callbacks = useRef({ onPick, onReorder, canEdit, saving, resolveUri });

  const [gridW, setGridW] = useState(0);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  const innerW = gridW > 0 ? Math.max(0, gridW - PAD * 2) : 0;
  const tileW = innerW > 0 ? (innerW - GAP * (COLS - 1)) / COLS : 0;
  const tileH = tileW > 0 ? tileW * (4 / 3) : 0;

  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);

  useEffect(() => {
    previewRef.current = previewUris;
  }, [previewUris]);

  useEffect(() => {
    pickedRef.current = picked;
  }, [picked]);

  useEffect(() => {
    tileSizeRef.current = { w: tileW, h: tileH };
  }, [tileW, tileH]);

  useEffect(() => {
    callbacks.current = { onPick, onReorder, canEdit, saving, resolveUri };
  }, [onPick, onReorder, canEdit, saving, resolveUri]);

  useEffect(() => {
    return () => {
      if (longTimer.current) clearTimeout(longTimer.current);
      if (autoScrollRaf.current) {
        clearInterval(autoScrollRaf.current);
        autoScrollRaf.current = null;
      }
      if (scrollLocked.current) {
        scrollLocked.current = false;
        unlockPhoneScroll();
      }
    };
  }, []);

  const clearLongTimer = () => {
    if (longTimer.current) {
      clearTimeout(longTimer.current);
      longTimer.current = null;
    }
  };

  const stopAutoScroll = () => {
    autoScrollDir.current = 0;
    if (autoScrollRaf.current) {
      clearInterval(autoScrollRaf.current);
      autoScrollRaf.current = null;
    }
  };

  const tickAutoScroll = () => {
    if (!activated.current || autoScrollDir.current === 0) return;
    const applied = scrollPhoneBy(autoScrollDir.current * AUTO_SCROLL_SPEED);
    if (applied === 0) return;
    // Content moved: finger's grid-local Y shifts by the same amount.
    scrollDeltaY.current += applied;
    const a = dragAnchor.current;
    const f = lastFinger.current;
    applyDragAt(a.grantLocalX + f.dx, a.grantLocalY + f.dy + scrollDeltaY.current);
  };

  const syncAutoScroll = (pageY: number) => {
    const dir = autoScrollDirectionForFinger(pageY);
    if (dir === autoScrollDir.current) return;
    autoScrollDir.current = dir;
    if (dir === 0) {
      if (autoScrollRaf.current) {
        clearInterval(autoScrollRaf.current);
        autoScrollRaf.current = null;
      }
      return;
    }
    if (!autoScrollRaf.current) {
      autoScrollRaf.current = setInterval(tickAutoScroll, 16);
    }
  };

  const setScrollLock = (on: boolean) => {
    if (on && !scrollLocked.current) {
      scrollLocked.current = true;
      lockPhoneScroll();
    } else if (!on && scrollLocked.current) {
      scrollLocked.current = false;
      unlockPhoneScroll();
    }
  };

  const syncWebOrigin = (): GridOrigin | null => {
    if (Platform.OS !== 'web') return null;
    const g = globalThis as {
      document?: {
        getElementById: (
          id: string,
        ) => { getBoundingClientRect: () => { left: number; top: number } } | null;
      };
      scrollX?: number;
      scrollY?: number;
    };
    const el = g.document?.getElementById(GRID_DOM_ID) ?? null;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const origin = {
      x: rect.left + (g.scrollX || 0),
      y: rect.top + (g.scrollY || 0),
    };
    gridOrigin.current = origin;
    return origin;
  };

  const localFromPage = (pageX: number, pageY: number, origin?: GridOrigin) => {
    if (Platform.OS === 'web') {
      const o = syncWebOrigin() ?? origin ?? gridOrigin.current;
      return { x: pageX - o.x, y: pageY - o.y };
    }
    const o = origin ?? gridOrigin.current;
    return { x: pageX - o.x, y: pageY - o.y };
  };

  const withGridOrigin = (fn: (origin: GridOrigin) => void) => {
    if (Platform.OS === 'web') {
      fn(syncWebOrigin() ?? gridOrigin.current);
      return;
    }
    gridRef.current?.measureInWindow((x, y) => {
      const origin = { x, y };
      gridOrigin.current = origin;
      fn(origin);
    });
  };

  const hitTestLocal = (lx: number, ly: number): number | null => {
    const { w, h } = tileSizeRef.current;
    if (w <= 0 || h <= 0) return null;
    for (let i = 0; i < slotCount; i++) {
      const L = cellRect(i, w, h);
      if (lx >= L.x && lx <= L.x + L.width && ly >= L.y && ly <= L.y + L.height) {
        return i;
      }
    }
    return null;
  };

  const isRemoveZoneLocal = (slot: number, lx: number, ly: number) => {
    const { w, h } = tileSizeRef.current;
    if (w <= 0 || h <= 0 || !slotsRef.current[slot]) return false;
    const L = cellRect(slot, w, h);
    return lx >= L.x + L.width - 42 && ly <= L.y + 42;
  };

  const applyDragAt = (x: number, y: number) => {
    const cur = dragRef.current;
    if (!cur || !activated.current) return;
    const { w, h } = tileSizeRef.current;
    ghostXY.setValue({ x: x - w / 2, y: y - h / 2 });
    const over = hitTestLocal(x, y);
    if (over === cur.over) return;
    const next = { ...cur, over };
    dragRef.current = next;
    setDrag(next);
  };

  const commitSwap = (from: number, to: number) => {
    if (from === to) return;
    callbacks.current.onReorder(swapSlots(slotsRef.current, slotCount, from, to));
  };

  const finishDrag = () => {
    const d = dragRef.current;
    clearLongTimer();
    stopAutoScroll();
    scrollDeltaY.current = 0;
    dragRef.current = null;
    const wasActive = activated.current;
    activated.current = false;
    setScrollLock(false);
    setDrag(null);
    pressSlot.current = null;
    if (!wasActive || !d) return;
    if (d.over != null && d.over !== d.from) {
      commitSwap(d.from, d.over);
      setPicked(null);
      return;
    }
    setPicked(d.from);
  };

  const cancelAll = () => {
    clearLongTimer();
    stopAutoScroll();
    scrollDeltaY.current = 0;
    dragRef.current = null;
    activated.current = false;
    setScrollLock(false);
    pressSlot.current = null;
    setDrag(null);
    setPicked(null);
  };

  // Web: window pointer tracking survives ScrollView fighting RN PanResponder.
  useEffect(() => {
    if (Platform.OS !== 'web' || !drag) return;

    type WebPointer = { pageX: number; pageY: number };
    type WebWindow = {
      addEventListener: (type: string, fn: (e: WebPointer) => void) => void;
      removeEventListener: (type: string, fn: (e: WebPointer) => void) => void;
    };
    const win = globalThis as unknown as WebWindow;
    const a0 = dragAnchor.current;

    const onMove = (e: WebPointer) => {
      lastFinger.current = {
        dx: e.pageX - a0.grantPageX,
        dy: e.pageY - a0.grantPageY,
        pageY: e.pageY,
      };
      syncAutoScroll(e.pageY);
      applyDragAt(
        a0.grantLocalX + (e.pageX - a0.grantPageX),
        a0.grantLocalY + (e.pageY - a0.grantPageY) + scrollDeltaY.current,
      );
    };
    const onUp = () => finishDrag();

    win.addEventListener('pointermove', onMove);
    win.addEventListener('pointerup', onUp);
    win.addEventListener('pointercancel', onUp);
    return () => {
      win.removeEventListener('pointermove', onMove);
      win.removeEventListener('pointerup', onUp);
      win.removeEventListener('pointercancel', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(drag)]);

  const gridPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (e) => {
          const { canEdit: edit, saving: busy } = callbacks.current;
          if (!edit || busy) return false;
          const { pageX, pageY } = e.nativeEvent;
          const { x, y } = localFromPage(pageX, pageY);
          const slot = hitTestLocal(x, y);
          if (slot != null && isRemoveZoneLocal(slot, x, y)) return false;
          return true;
        },
        onMoveShouldSetPanResponder: () => activated.current,
        onMoveShouldSetPanResponderCapture: () => activated.current,
        onPanResponderTerminationRequest: () => !activated.current,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: (e) => {
          clearLongTimer();
          activated.current = false;
          const { pageX, pageY } = e.nativeEvent;

          withGridOrigin((origin) => {
            const { x, y } = localFromPage(pageX, pageY, origin);
            const slot = hitTestLocal(x, y);
            pressSlot.current = slot;
            if (slot == null) return;
            if (isRemoveZoneLocal(slot, x, y)) return;
            if (!slotsRef.current[slot] && pickedRef.current == null) return;
            if (!slotsRef.current[slot]) return;

            dragAnchor.current = {
              grantLocalX: x,
              grantLocalY: y,
              grantPageX: pageX,
              grantPageY: pageY,
            };
            // Lock scroll immediately on a filled-slot press — waiting until
            // long-press fires is too late; the ScrollView steals the first move
            // toward another box and the drop never lands.
            setScrollLock(true);

            longTimer.current = setTimeout(() => {
              const { canEdit: edit, saving: busy } = callbacks.current;
              if (!edit || busy) return;
              const path = slotsRef.current[slot];
              if (!path) return;
              activated.current = true;
              scrollDeltaY.current = 0;
              setPicked(null);
              refreshPhoneScrollWindow();
              const a = dragAnchor.current;
              const { w, h } = tileSizeRef.current;
              ghostXY.setValue({ x: a.grantLocalX - w / 2, y: a.grantLocalY - h / 2 });
              const next: DragState = {
                from: slot,
                over: slot,
                path,
              };
              dragRef.current = next;
              setDrag(next);
            }, LONG_PRESS_MS);
          });
        },
        onPanResponderMove: (e, g) => {
          if (!activated.current) {
            if (Math.hypot(g.dx, g.dy) > JITTER_PX) {
              clearLongTimer();
              // Finger moved before long-press — treat as scroll intent.
              setScrollLock(false);
            }
            return;
          }
          const pageY = e.nativeEvent.pageY;
          lastFinger.current = { dx: g.dx, dy: g.dy, pageY };
          syncAutoScroll(pageY);
          const a = dragAnchor.current;
          applyDragAt(a.grantLocalX + g.dx, a.grantLocalY + g.dy + scrollDeltaY.current);
        },
        onPanResponderRelease: (_e, g) => {
          const slot = pressSlot.current;

          if (activated.current) {
            finishDrag();
            return;
          }

          clearLongTimer();
          stopAutoScroll();
          setScrollLock(false);
          pressSlot.current = null;

          const tapped =
            slot != null &&
            Math.hypot(g.dx, g.dy) < JITTER_PX &&
            callbacks.current.canEdit &&
            !callbacks.current.saving;
          if (!tapped) return;

          const armed = pickedRef.current;
          if (armed != null) {
            if (slot === armed) {
              setPicked(null);
              return;
            }
            commitSwap(armed, slot);
            setPicked(null);
            return;
          }

          callbacks.current.onPick(slot);
        },
        onPanResponderTerminate: () => {
          if (activated.current) {
            const d = dragRef.current;
            clearLongTimer();
            stopAutoScroll();
            scrollDeltaY.current = 0;
            activated.current = false;
            dragRef.current = null;
            setScrollLock(false);
            setDrag(null);
            pressSlot.current = null;
            // Scroll stole the gesture — keep picked so tap-to-swap still works.
            if (d) setPicked(d.from);
            return;
          }
          clearLongTimer();
          stopAutoScroll();
          setScrollLock(false);
          pressSlot.current = null;
        },
      }),
    [slotCount],
  );

  const ghostUri = drag
    ? previewRef.current?.[drag.from] ?? callbacks.current.resolveUri(drag.path)
    : null;

  return (
    <View>
      {picked != null && !drag ? (
        <Text style={styles.hint}>Tap another slot to swap · tap again to cancel</Text>
      ) : canEdit ? (
        <Text style={styles.hint}>Hold to drag · drag to top/bottom edge to scroll · drop to swap</Text>
      ) : null}
      <View
        ref={gridRef}
        nativeID={GRID_DOM_ID}
        {...(Platform.OS === 'web' ? ({ id: GRID_DOM_ID } as object) : null)}
        style={styles.grid}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          if (w > 0 && Math.abs(w - gridW) > 0.5) setGridW(w);
          withGridOrigin(() => undefined);
        }}
        {...(canEdit && !saving ? gridPan.panHandlers : {})}
      >
        {Array.from({ length: slotCount }, (_, i) => {
          const path = slots[i];
          const uri = previewUris?.[i] ?? (path ? resolveUri(path) : null);
          const label = String(i + 1).padStart(2, '0');
          const comcardSlot = i < 4;
          const tileSize =
            tileW > 0
              ? { width: tileW, height: tileH }
              : { width: '48.5%' as const, aspectRatio: 3 / 4 };
          const isSource = drag?.from === i || picked === i;
          const isOver = drag?.over === i && drag.from !== i;
          const filled = Boolean(uri);

          return (
            <View
              key={i}
              style={[
                styles.cell,
                filled ? styles.cellFilled : styles.cellEmpty,
                comcardSlot && filled && styles.cellCard,
                tileSize,
                isSource && styles.cellDragging,
                isOver && styles.cellDropTarget,
                picked === i && styles.cellPicked,
              ]}
              pointerEvents="none"
            >
              {uri ? (
                <>
                  <Image
                    key={uri}
                    source={{ uri, cache: 'reload' }}
                    style={styles.img}
                    resizeMode="cover"
                    {...({ draggable: false } as object)}
                  />
                  <View style={styles.shade} />
                  <View style={styles.meta}>
                    <Text style={styles.metaIndex}>{label}</Text>
                    {comcardSlot ? <View style={styles.cardDot} /> : null}
                  </View>
                </>
              ) : (
                <View style={styles.emptyInner}>
                  <ImagePlus size={20} color="rgba(183,156,232,0.7)" strokeWidth={1.6} />
                  <Text style={styles.emptyLabel}>{label}</Text>
                </View>
              )}
            </View>
          );
        })}

        {canEdit && !drag && picked == null
          ? Array.from({ length: slotCount }, (_, i) => {
              const path = slots[i];
              const uri = previewUris?.[i] ?? (path ? resolveUri(path) : null);
              if (!uri || tileW <= 0) return null;
              const L = cellRect(i, tileW, tileH);
              return (
                <Pressable
                  key={`rm-${i}`}
                  style={[
                    styles.remove,
                    { left: L.x + L.width - 7 - 24, top: L.y + 7 },
                  ]}
                  hitSlop={8}
                  disabled={saving}
                  onPress={() => {
                    cancelAll();
                    onRemove(i);
                  }}
                >
                  <XIcon size={11} color="rgba(255,255,255,0.9)" strokeWidth={2.4} />
                </Pressable>
              );
            })
          : null}

        {drag && ghostUri && tileW > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.ghost,
              { width: tileW, height: tileH },
              ghostXY.getLayout(),
            ]}
          >
            <Image
              source={{ uri: ghostUri }}
              style={styles.img}
              resizeMode="cover"
              {...({ draggable: false } as object)}
            />
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: {
    marginHorizontal: PAD,
    marginBottom: 8,
    fontFamily: F.manrope,
    fontSize: 11,
    color: C.violetL,
  },
  grid: {
    paddingHorizontal: PAD,
    paddingBottom: PAD,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
    position: 'relative',
    // Let the ghost paint past the grid edges while dragging across slots.
    overflow: 'visible',
  },
  cell: {
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  cellFilled: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cellCard: {
    borderColor: 'rgba(227,184,119,0.35)',
  },
  cellEmpty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(183,156,232,0.28)',
    backgroundColor: 'rgba(183,156,232,0.04)',
  },
  cellDragging: {
    opacity: 0.35,
  },
  cellPicked: {
    borderColor: C.violetL,
    borderWidth: 1.5,
  },
  cellDropTarget: {
    borderColor: C.violetL,
    borderWidth: 1.5,
    borderStyle: 'solid',
  },
  img: {
    ...StyleSheet.absoluteFillObject,
  },
  shade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 40,
    backgroundColor: 'rgba(12,10,20,0.55)',
  },
  meta: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaIndex: {
    fontFamily: F.sora,
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.88)',
    letterSpacing: 0.4,
  },
  cardDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.accent,
  },
  emptyInner: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyLabel: {
    fontFamily: F.sora,
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(183,156,232,0.55)',
    letterSpacing: 0.6,
  },
  remove: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  ghost: {
    position: 'absolute',
    left: 0,
    top: 0,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: C.violetL,
    opacity: 0.94,
    zIndex: 20,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
  },
});
