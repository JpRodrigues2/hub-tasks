'use client';
// Seção que entra suavemente quando aparece na tela (a transição entre seções do site).
import { useEffect, useRef, type ReactNode } from 'react';

export function Revelar({ children, className = '', atraso = 0 }: { children: ReactNode; className?: string; atraso?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          el.classList.add('visivel');
          obs.disconnect();
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className={`revelar ${className}`} style={{ transitionDelay: `${atraso}ms` }}>
      {children}
    </div>
  );
}
