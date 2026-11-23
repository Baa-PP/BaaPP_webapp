import { ReactNode, RefObject, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const DIALOG_FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getDialogFocusables(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE_SELECTOR)
  ).filter(
    (el) =>
      !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true'
  );
}

export interface ModalDialogProps {
  open: boolean;
  onClose: () => void;
  titleId: string;
  title: string;
  subtitle?: ReactNode;
  closeLabel?: string;
  disableClose?: boolean;
  triggerRef?: RefObject<HTMLElement | null>;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  cardClassName?: string;
  children: ReactNode;
}

/**
 * Portal modal accesible con contención de foco (Tab / Shift+Tab), inercia del
 * fondo mientras está abierto y restauración del foco al botón disparador al cerrar.
 */
export function ModalDialog({
  open,
  onClose,
  titleId,
  title,
  subtitle,
  closeLabel = 'Cerrar diálogo',
  disableClose = false,
  triggerRef,
  fallbackFocusRef,
  cardClassName,
  children,
}: ModalDialogProps) {
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);
  const disableCloseRef = useRef(disableClose);

  onCloseRef.current = onClose;
  disableCloseRef.current = disableClose;

  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef?.current ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);

    const backdropEl = backdropRef.current;
    const savedBackground: Array<{
      el: HTMLElement;
      prevInert: boolean;
      prevAriaHidden: string | null;
    }> = [];

    for (const child of Array.from(document.body.children)) {
      if (
        child instanceof HTMLElement &&
        child !== backdropEl &&
        !child.contains(backdropEl) &&
        child.tagName !== 'SCRIPT' &&
        child.tagName !== 'STYLE'
      ) {
        savedBackground.push({
          el: child,
          prevInert: child.inert,
          prevAriaHidden: child.getAttribute('aria-hidden'),
        });
        child.inert = true;
        if (child.getAttribute('aria-hidden') === null) {
          child.setAttribute('aria-hidden', 'true');
        }
      }
    }

    (closeButtonRef.current ?? dialogRef.current)?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!disableCloseRef.current) {
          event.preventDefault();
          onCloseRef.current();
        }
        return;
      }

      if (event.key === 'Tab') {
        const container = dialogRef.current;
        const focusables = getDialogFocusables(container);
        if (focusables.length === 0) {
          event.preventDefault();
          container?.focus();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        const inside = Boolean(active && container?.contains(active));

        if (event.shiftKey) {
          if (!inside || active === first || active === container) {
            event.preventDefault();
            last.focus();
          }
        } else if (!inside || active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      const container = dialogRef.current;
      if (
        container &&
        event.target instanceof Node &&
        !container.contains(event.target)
      ) {
        const focusables = getDialogFocusables(container);
        (focusables[0] ?? container).focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', handleFocusIn);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocusIn);
      for (const item of savedBackground) {
        item.el.inert = Boolean(item.prevInert);
        if (item.prevAriaHidden === null) {
          item.el.removeAttribute('aria-hidden');
        } else {
          item.el.setAttribute('aria-hidden', item.prevAriaHidden);
        }
      }
      if (trigger?.isConnected) {
        trigger.focus();
      }
      if (document.activeElement !== trigger) {
        fallbackFocusRef?.current?.focus();
      }
    };
  }, [open, triggerRef, fallbackFocusRef]);

  if (!open) return null;

  return createPortal(
    <div
      ref={backdropRef}
      className="birth-modal-backdrop"
      onClick={() => {
        if (!disableClose) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        ref={dialogRef}
        className={
          cardClassName
            ? `birth-modal-card ${cardClassName}`
            : 'birth-modal-card'
        }
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="birth-modal-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p className="birth-modal-subtitle">{subtitle}</p>}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="birth-modal-close"
            disabled={disableClose}
            onClick={onClose}
            aria-label={closeLabel}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
