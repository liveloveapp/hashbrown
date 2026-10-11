'use client';

import { useEffect, useRef } from 'react';
import { ATC_LOOP_VIDEO } from '../elements/atc-media';

/**
 * The atc showcase loop: muted and silent, it plays only while at least a
 * quarter of it is on screen, and never under reduced motion, where the
 * poster stands in. It loads nothing until it first plays.
 */
export function AtcLoop({
  className,
  label,
}: {
  readonly className?: string;
  readonly label: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const video = ATC_LOOP_VIDEO;

  // Playback is an external system: start and stop it as the video scrolls
  // in and out of view.
  useEffect(() => {
    const element = ref.current;
    if (element === null || typeof IntersectionObserver === 'undefined') {
      return;
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !reduced.matches) {
          element.play().catch(() => {
            // Autoplay can be refused; the poster stays.
          });
        } else {
          element.pause();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return (
    <video
      ref={ref}
      className={className}
      poster={video.poster}
      width={video.width}
      height={video.height}
      aria-label={label}
      muted
      loop
      playsInline
      preload="none"
    >
      <source src={video.webm} type="video/webm" />
      <source src={video.mp4} type="video/mp4" />
    </video>
  );
}
