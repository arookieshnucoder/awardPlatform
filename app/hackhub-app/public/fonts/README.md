Bundled interface font: Noto Sans CJK SC, Regular and Bold, subset from the system Noto CJK collection (SC face index 2). License and attribution are in LICENSE.txt.

Coverage includes Latin, GB2312 common simplified Chinese, CJK and Western punctuation, and all characters in the UI source when generated. Rare characters outside the subset use the same Noto CJK system fallback where installed.

Regenerate from the repository root with `/usr/bin/python3 app/scripts/build-award-fonts.py` (requires fontTools, Brotli and the system fonts-noto-cjk package). The subset includes current source characters. It is served locally and requires no external font service.

Latin characters (U+0000–024F) and general punctuation (U+2000–206F) are served from separate small subsets using CSS unicode-range. This prevents loading indicators containing an ellipsis or dash from downloading the full CJK fonts on an English page. All other characters retain the full existing coverage. The CSS resource version must be updated when regenerating fonts to invalidate immutable browser caches.
