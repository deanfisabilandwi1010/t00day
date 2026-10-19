"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
  /** Lebar untuk form dua kolom (mis. kelola menu). */
  wide?: boolean;
}

/**
 * Dialog konfirmasi di tengah layar (kasir). <dialog> native menangani focus trap,
 * Escape, dan pengembalian fokus ke tombol pemicu.
 */
export function Modal({ open, onClose, labelledBy, children, wide = false }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "modal--wide" : ""}`}
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-panel">
        <button type="button" className="sheet-close" onClick={onClose} aria-label="Tutup">
          <X aria-hidden="true" size={20} />
        </button>
        {open && children}
      </div>
    </dialog>
  );
}
