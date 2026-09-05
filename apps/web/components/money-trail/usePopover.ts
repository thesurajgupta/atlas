'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Toggle state for a header popover, with the behaviour a popover has to have:
 * outside click closes, Escape closes, and focus returns to the trigger so a
 * keyboard user is not stranded at the top of the document.
 *
 * Shared by the notification and profile menus so the two cannot drift apart —
 * one of them handling Escape and the other not is exactly the kind of
 * inconsistency that shows up only under a keyboard.
 *
 * Listeners are attached only while the popover is open, and removed on close
 * as well as on unmount.
 */
export function usePopover<T extends HTMLElement = HTMLDivElement>() {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<T | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((open) => !open), []);

  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const container = containerRef.current;
      if (container !== null && !container.contains(event.target as Node)) setIsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setIsOpen(false);
      // Escape should hand the caret back to what opened the menu.
      triggerRef.current?.focus();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  return { isOpen, toggle, close, containerRef, triggerRef };
}
