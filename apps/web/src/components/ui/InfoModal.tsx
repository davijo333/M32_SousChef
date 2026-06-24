"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

type InfoModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
};

export function InfoModal({ open, onClose, title, children }: InfoModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-chef-text/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="info-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-chef-border bg-chef-surface p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="info-modal-title" className="text-xl font-semibold text-chef-text sm:text-2xl">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="sc-icon-btn shrink-0"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4 text-base leading-relaxed text-chef-text-muted">{children}</div>
        <div className="mt-6 flex justify-end">
          <button type="button" onClick={onClose} className="sc-btn-primary px-6">
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
