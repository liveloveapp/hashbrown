declare global {
  interface Window {
    __walkthrough?: boolean;
    /** Show a caption; an empty title hides it. */
    __caption?: (title: string, subtitle?: string) => void;
    /** Zoom the page toward an element's bottom-right corner; null resets. */
    __zoom?: (selector: string | null, scale?: number) => void;
    /** Keep the assistant thread scrolled to its newest content. */
    __follow?: (on: boolean) => void;
  }
}

/**
 * Presenter chrome for the walkthrough: a cursor with click ripples that
 * fades when idle, a caption pill, a smooth zoom, and thread following.
 * Passed to `addInitScript`, so it must stay self-contained. Everything is
 * appended to `<html>`, outside `<body>`, so zooming the body never moves it.
 */
export function installOverlay(): void {
  if (window.__walkthrough) return;
  window.__walkthrough = true;

  const css = `
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap');
  body { transition: transform 700ms cubic-bezier(.2,.8,.2,1); will-change: transform; }
  #wt-cursor { position: fixed; left: -100px; top: -100px; width: 22px; height: 22px; margin: -11px 0 0 -11px;
    border-radius: 50%; background: rgba(251,187,82,.95);
    box-shadow: 0 0 0 3px rgba(255,255,255,.95), 0 6px 18px rgba(61,60,58,.35);
    pointer-events: none; z-index: 2147483647; transition: transform 120ms ease, opacity 380ms ease; }
  #wt-cursor.down { transform: scale(.72); }
  #wt-cursor.idle { opacity: 0; }
  .wt-ripple { position: fixed; width: 18px; height: 18px; margin: -9px 0 0 -9px; border-radius: 50%;
    border: 3px solid rgba(232,162,61,.9); pointer-events: none; z-index: 2147483646;
    animation: wt-ripple 620ms cubic-bezier(.2,.8,.2,1) forwards; }
  @keyframes wt-ripple { to { transform: scale(4.2); opacity: 0; } }
  #wt-caption { position: fixed; left: 36px; bottom: 34px; z-index: 2147483645; pointer-events: none;
    font-family: 'Poppins', system-ui, sans-serif; max-width: 640px;
    padding: 16px 22px 16px 18px; border-radius: 18px; display: flex; gap: 14px; align-items: center;
    background: rgba(40,38,36,.86); backdrop-filter: blur(14px) saturate(140%);
    box-shadow: 0 18px 50px rgba(30,28,26,.35), inset 0 0 0 1px rgba(255,255,255,.08);
    color: #faf9f0; opacity: 0; transform: translateY(18px) scale(.98);
    transition: opacity 360ms ease, transform 460ms cubic-bezier(.2,.8,.2,1); }
  #wt-caption.on { opacity: 1; transform: none; }
  #wt-caption .bar { flex: none; width: 10px; height: 38px; border-radius: 6px;
    background: linear-gradient(180deg, #fbbb52, #e88c4d); }
  #wt-caption .title { font-size: 21px; font-weight: 600; letter-spacing: -.01em; line-height: 1.25; }
  #wt-caption .subtitle { font-size: 14.5px; color: rgba(250,249,240,.72); margin-top: 3px; line-height: 1.3; }
  `;

  const mount = () => {
    const root = document.documentElement;
    const style = document.createElement('style');
    style.textContent = css;
    root.appendChild(style);

    const cursor = document.createElement('div');
    cursor.id = 'wt-cursor';
    root.appendChild(cursor);
    let x = -100;
    let y = -100;
    let idle: ReturnType<typeof setTimeout> | undefined;
    const wake = () => {
      cursor.classList.remove('idle');
      clearTimeout(idle);
      idle = setTimeout(() => cursor.classList.add('idle'), 900);
    };
    addEventListener(
      'mousemove',
      (event) => {
        x = event.clientX;
        y = event.clientY;
        cursor.style.left = `${x}px`;
        cursor.style.top = `${y}px`;
        wake();
      },
      true,
    );
    addEventListener(
      'mousedown',
      () => {
        wake();
        cursor.classList.add('down');
        const ripple = document.createElement('div');
        ripple.className = 'wt-ripple';
        ripple.style.left = `${x}px`;
        ripple.style.top = `${y}px`;
        root.appendChild(ripple);
        setTimeout(() => ripple.remove(), 700);
      },
      true,
    );
    addEventListener('mouseup', () => cursor.classList.remove('down'), true);

    const caption = document.createElement('div');
    caption.id = 'wt-caption';
    const bar = document.createElement('div');
    bar.className = 'bar';
    const text = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'title';
    const subtitle = document.createElement('div');
    subtitle.className = 'subtitle';
    text.append(title, subtitle);
    caption.append(bar, text);
    root.appendChild(caption);
    let swap: ReturnType<typeof setTimeout> | undefined;
    window.__caption = (next, sub = '') => {
      clearTimeout(swap);
      const showing = caption.classList.contains('on');
      caption.classList.remove('on');
      if (!next) return;
      swap = setTimeout(
        () => {
          title.textContent = next;
          subtitle.textContent = sub;
          caption.classList.add('on');
        },
        showing ? 260 : 0,
      );
    };

    let follow: ReturnType<typeof setInterval> | undefined;
    window.__follow = (on) => {
      clearInterval(follow);
      if (!on) return;
      follow = setInterval(() => {
        const thread = document.querySelector('.thread');
        thread?.scrollTo({ top: thread.scrollHeight, behavior: 'smooth' });
      }, 160);
    };

    window.__zoom = (selector, scale = 1.3) => {
      const body = document.body;
      if (!selector) {
        body.style.transform = '';
        return;
      }
      const element = document.querySelector(selector);
      if (!element) return;
      const rect = element.getBoundingClientRect();
      // Anchor at the bottom-right so the newest messages and the composer
      // stay on screen as the column grows.
      body.style.transformOrigin = `${Math.min(rect.right, innerWidth)}px ${Math.min(rect.bottom, innerHeight)}px`;
      body.style.transform = `scale(${scale})`;
    };
  };
  if (document.documentElement) mount();
  else addEventListener('DOMContentLoaded', mount);
}
