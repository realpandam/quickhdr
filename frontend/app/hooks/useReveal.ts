import { useEffect, useRef } from 'react';

export function useReveal() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Vždy přidej visible s malým zpožděním aby browser stihl layout
    const timer = setTimeout(() => {
      const rect = el.getBoundingClientRect();
      
      // Zobraz ihned pokud je ve viewportu nebo nad ním
      if (rect.top < window.innerHeight) {
        el.classList.add('visible');
        return;
      }

      // Jinak sleduj přes IntersectionObserver
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            el.classList.add('visible');
          } else {
            const r = el.getBoundingClientRect();
            if (r.top > window.innerHeight) {
              el.classList.remove('visible');
            }
          }
        },
        { threshold: 0.05 }
      );
      observer.observe(el);
      
      return () => observer.disconnect();
    }, 50);

    return () => clearTimeout(timer);
  }); // Bez [] — spustí se po každém renderu

  return ref;
}