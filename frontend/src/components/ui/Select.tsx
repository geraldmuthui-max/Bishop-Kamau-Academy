import { useEffect, useMemo, useRef, useState } from "react";

export type Option = { value: string; label: string };

type Props = {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
};

export default function Select({ value, onChange, options, placeholder = "Select…", className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<number>(-1);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  const selected = useMemo(() => options.find(o => o.value === value), [options, value]);

  // close on outside click / escape
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!open) return;
      if (!btnRef.current || !menuRef.current) return;
      if (btnRef.current.contains(e.target as Node)) return;
      if (menuRef.current.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function openMenu() {
    setOpen(true);
    setActive(Math.max(0, options.findIndex(o => o.value === value)));
    setTimeout(() => menuRef.current?.focus(), 0);
  }

  function onTriggerKey(e: React.KeyboardEvent) {
    if (e.key === " " || e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      openMenu();
    }
  }

  function onMenuKey(e: React.KeyboardEvent<HTMLUListElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(i => Math.min(options.length - 1, i + 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActive(i => Math.max(0, i - 1)); }
    if (e.key === "Enter")     { e.preventDefault(); if (active >= 0) { onChange(options[active].value); setOpen(false); btnRef.current?.focus(); } }
    if (e.key === "Tab")       { setOpen(false); }
  }

  return (
    <div className={`relative ${className}`}>
      <button
        ref={btnRef}
        type="button"
        className="select-trigger"
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onTriggerKey}
      >
        <span className={selected ? "" : "opacity-60"}>{selected?.label || placeholder}</span>
        <svg className="ml-auto h-4 w-4 opacity-70" viewBox="0 0 20 20" fill="currentColor"><path d="M5.25 7.5 10 12.25 14.75 7.5" /></svg>
      </button>

      {open && (
        <ul
          ref={menuRef}
          tabIndex={-1}
          role="listbox"
          className="select-menu"
          onKeyDown={onMenuKey}
        >
          {options.map((o, i) => {
            const selected = o.value === value;
            const activeRow = i === active;
            return (
              <li
                key={o.value}
                role="option"
                aria-selected={selected}
                className={`select-option ${selected ? "is-selected" : ""} ${activeRow ? "is-active" : ""}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => { e.preventDefault(); onChange(o.value); setOpen(false); btnRef.current?.focus(); }}
              >
                {o.label}
              </li>
            );
          })}
          {options.length === 0 && <li className="select-option opacity-70">No options</li>}
        </ul>
      )}
    </div>
  );
}
