"use client";

import { useEffect, type ReactNode } from "react";
import Icon from "../Icon";

export default function StudentModal({
  eyebrow,
  title,
  description,
  onClose,
  children,
  footer,
  size = "default",
}: {
  eyebrow: string;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "default" | "wide";
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={`general-modal student-modal ${size === "wide" ? "student-modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-header">
        <div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2>{description && <p>{description}</p>}</div>
        <button type="button" className="icon-button bordered" aria-label={`Close ${title}`} onClick={onClose}><Icon name="x" /></button>
      </div>
      <div className="student-modal-body">{children}</div>
      {footer && <div className="modal-footer">{footer}</div>}
    </section>
  </div>;
}
