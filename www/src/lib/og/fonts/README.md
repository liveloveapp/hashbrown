Fonts for the social cards, read by `../assets.ts` and handed to Satori.

- Hanken Grotesk Regular (400) and SemiBold (600): static instances of
  github.com/google/fonts/tree/main/ofl/hankengrotesk, copied from
  LiveLoveApp's `src/app/og-fonts`.
- JetBrains Mono Regular (400): instanced from the Google Fonts variable font
  with `fonttools varLib.instancer <font> wght=400 --static`.

All are SIL OFL 1.1 (see OFL.txt). Satori cannot read variable fonts, so every
file here must be a static instance.
