# Bundled font licences

Every face bundled with Plaque is under the SIL Open Font License 1.1, which
permits redistribution and embedding in documents. The full licence text for
each family sits alongside the font files in this directory.

| File | Family | Copyright | Licence |
|---|---|---|---|
| `CrimsonText-Regular.ttf` | Crimson Text | The Crimson Text Project Authors | `OFL-crimsontext.txt` |
| `CrimsonText-SemiBold.ttf` | Crimson Text | The Crimson Text Project Authors | `OFL-crimsontext.txt` |
| `Marcellus-Regular.ttf` | Marcellus | Brian J. Bonislawsky, Astigmatic | `OFL-marcellus.txt` |
| `Lato-Regular.ttf` | Lato | tyPoland Lukasz Dziedzic | `OFL-lato.txt` |
| `GreatVibes-Regular.ttf` | Great Vibes | The Great Vibes Pro Project Authors | `OFL-greatvibes.txt` |
| `Parisienne-Regular.ttf` | Parisienne | Brian J. Bonislawsky, Astigmatic | `OFL-parisienne.txt` |

Source: <https://github.com/google/fonts>

Fonts a user uploads are never redistributed — they stay in that user's browser,
in IndexedDB, and are embedded only into PDFs that user generates on their own
machine.

Only one weight per family is bundled. Extra weights are a matter of dropping
more files here and adding rows to `index.ts`; nothing else in the app needs to
change.
