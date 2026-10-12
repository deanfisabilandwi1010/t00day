"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { lockScroll, unlockScroll } from "@/lib/motion";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
  className?: string;
}

const CLOSE_MS = 220;

/**
 * Panel modal di atas <dialog> native: focus trap, Escape, dan pengembalian fokus
 * ditangani browser. Klik pada backdrop menutup panel.
 */
export function Sheet({ open, onClose, labelledBy, children, className = "" }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open) {
      dialog.classList.remove("is-closing");
      if (!dialog.open) dialog.showModal();
      lockScroll();
      return () => unlockScroll();
    }

    if (!dialog.open) return;
    dialog.classList.add("is-closing");
    const timer = window.setTimeout(() => {
      dialog.classList.remove("is-closing");
      dialog.close();
    }, CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`sheet ${className}`}
      aria-labelledby={labelledBy}
      data-lenis-prevent
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="sheet-panel">
        <button type="button" className="sheet-close" onClick={onClose} aria-label="Tutup">
          <X aria-hidden="true" size={22} />
        </button>
        {children}
      </div>
    </dialog>
  );
}
