import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

type Props = {
  /** Text placed in the box when editing starts. */
  value: string;
  /** Saves the typed text; return false to reject it (the box stays open on Enter, and reverts on click-away). */
  onCommit: (text: string) => boolean;
  label: string;
  className?: string;
  children: ReactNode;
};

/** A value that turns into a text box on double-click, like a spreadsheet cell. Enter or clicking away saves; Escape cancels. */
export function InlineEdit({ value, onCommit, label, className, children }: Props) {
  const [text, setText] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  // Set once Enter or Escape has finished the edit, so the blur that follows can't save again.
  const done = useRef(false);
  const close = () => {
    done.current = true;
    setText(null);
    setInvalid(false);
  };
  const input = useRef<HTMLInputElement>(null);
  const finish = useRef(() => {});
  finish.current = () => {
    if (done.current || text === null) return;
    onCommit(text);
    close();
  };
  // Clicking anywhere else saves. Not every click moves focus (dragging the board cancels the browser's default),
  // so blur alone would miss some of them.
  const editing = text !== null;
  useEffect(() => {
    if (!editing) return;
    const onDown = (e: PointerEvent) => {
      if (e.target !== input.current) finish.current();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [editing]);
  if (text === null) {
    return (
      <div
        className={`inline-edit ${className ?? ''}`}
        title="Double-click to edit"
        onDoubleClick={e => {
          e.stopPropagation();
          done.current = false;
          setText(value);
        }}
      >
        {children}
      </div>
    );
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (onCommit(text)) close();
      else setInvalid(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };
  return (
    <input
      className={`inline-input ${className ?? ''} ${invalid ? 'invalid' : ''}`}
      aria-label={label}
      aria-invalid={invalid}
      autoFocus
      value={text}
      onFocus={e => e.currentTarget.select()}
      onChange={e => {
        setText(e.target.value);
        setInvalid(false);
      }}
      onKeyDown={onKeyDown}
      ref={input}
      onBlur={() => finish.current()}
      onDoubleClick={e => e.stopPropagation()}
      onContextMenu={e => e.stopPropagation()}
    />
  );
}

/** Reads a typed number, ignoring $, commas and %. */
export const parseNumber = (text: string) => {
  const cleaned = text.replace(/[$,%\s]/g, '');
  return cleaned === '' ? Number.NaN : Number(cleaned);
};
