import { useId, useRef, useState, type ReactNode } from 'react';

export default function InfoHint({ children, label = 'Informations' }: { children: ReactNode; label?: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [left, setLeft] = useState(0);
  const anchor = useRef<HTMLSpanElement>(null);
  const show = () => {
    const x = anchor.current?.getBoundingClientRect().left ?? 0;
    setLeft(Math.max(16 - x, Math.min(0, window.innerWidth - x - Math.min(360, window.innerWidth * 0.75) - 16)));
    setOpen(true);
  };
  return (
    <span
      ref={anchor}
      className="info-hint"
      onMouseEnter={show}
      onMouseLeave={(event) => {
        if (!event.currentTarget.contains(document.activeElement)) setOpen(false);
      }}
      onFocus={show}
      onBlur={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setOpen(false);
          event.stopPropagation();
        }
      }}
    >
      <button type="button" className="info-hint-button" aria-label={label} aria-describedby={open ? id : undefined} aria-expanded={open} onClick={show}>
        i
      </button>
      {open && (
        <span id={id} role="tooltip" className="info-hint-content" style={{ left }}>
          {children}
        </span>
      )}
    </span>
  );
}
