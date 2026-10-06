import { useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';

/**
 * A single line of text that squeezes itself horizontally when it's too wide for its space, so a big number
 * stays fully visible instead of being cut off. Only a CSS transform changes (never the layout), so it can't
 * feed back into its own measurement.
 */
export function FitText({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLSpanElement>(null);
  const inner = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const box = outer.current;
    const text = inner.current;
    if (!box || !text) return;
    const fit = () => {
      // offsetWidth ignores transforms, so this is always the text's natural width.
      const natural = text.offsetWidth;
      const room = box.clientWidth;
      const scale = natural > room && natural > 0 ? room / natural : 1;
      text.style.transform = scale < 1 ? `scaleX(${scale})` : '';
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    ro.observe(text);
    return () => ro.disconnect();
  }, []);

  return (
    <span className="fit-text" ref={outer}>
      <span className="fit-text-inner" ref={inner}>{children}</span>
    </span>
  );
}
