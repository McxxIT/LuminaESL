"use client";

export default function Toggle({
  checked,
  onChange,
  title,
  description,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  description?: string;
  disabled?: boolean;
}) {
  return <label className={`toggle-row ${disabled ? "is-disabled" : ""}`}>
    <span className="toggle-copy"><strong>{title}</strong>{description && <small>{description}</small>}</span>
    <span className="toggle-control">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span className="toggle-track" aria-hidden="true"><span className="toggle-thumb" /></span>
    </span>
  </label>;
}
