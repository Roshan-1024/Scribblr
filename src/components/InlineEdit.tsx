import { useEffect, useRef, useState } from 'react';

/** Text that turns into an input on click. Saves on Enter/blur, cancels on Escape. */
export default function InlineEdit({
  value, onSave, className = '', disabled = false, maxLength = 120,
}: { value: string; onSave: (v: string) => void; className?: string; disabled?: boolean; maxLength?: number }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);
  useEffect(() => { if (editing) ref.current?.select(); }, [editing]);

  const commit = () => {
    setEditing(false);
    const v = draft.trim();
    if (v && v !== value) onSave(v);
  };

  if (!editing) {
    return (
      <span
        className={`inline-edit ${className} ${disabled ? '' : 'editable'}`}
        title={disabled ? value : 'Click to rename'}
        onClick={() => !disabled && setEditing(true)}
      >{value}</span>
    );
  }
  return (
    <input
      ref={ref}
      className={`inline-edit-input ${className}`}
      value={draft}
      maxLength={maxLength}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') { setDraft(value); setEditing(false); }
      }}
      style={{ width: `${Math.max(draft.length, 6) + 2}ch` }}
    />
  );
}
