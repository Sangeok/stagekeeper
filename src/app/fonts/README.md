# Bundled fonts

These are unmodified Google Fonts files from revision
[`9710da1eacb3be272583c3224dcb70f9da6eadbb`](https://github.com/google/fonts/tree/9710da1eacb3be272583c3224dcb70f9da6eadbb).
`next/font/local` includes them in the application build without a Google request.
The existing font families, CSS variables and normal weights remain in use.

| Local file | Upstream file | SHA-256 |
| --- | --- | --- |
| `schibsted-grotesk-normal.ttf` | `ofl/schibstedgrotesk/SchibstedGrotesk[wght].ttf` | `6ceeadf6be8e1fd7687011c7fa38ed0edd1abe967a0b73d97caec183552e823d` |
| `fragment-mono-regular.ttf` | `ofl/fragmentmono/FragmentMono-Regular.ttf` | `0fe011f425873c2e0fc73a189e394e340ad48d2b9a99a576bdeec75cee000460` |

`schibsted-grotesk-semibold.ttf` is the unmodified static SemiBold from the type
project's own repository at revision
[`d485f61f105e1b3935f4d21dfb4d371359798603`](https://github.com/schibsted/schibsted-grotesk/tree/d485f61f105e1b3935f4d21dfb4d371359798603)
(`fonts/ttf/SchibstedGrotesk-SemiBold.ttf`, version 1.100 like the variable file above).
Only `next/og` images read it — the share card and the app icons. `next/og` cannot apply
the variable file's weight axis and draws every weight of it at 400. Its license is the
same project's OFL, so `schibsted-grotesk-ofl.txt` covers it.

| Local file | Upstream file | SHA-256 |
| --- | --- | --- |
| `schibsted-grotesk-semibold.ttf` | `fonts/ttf/SchibstedGrotesk-SemiBold.ttf` | `b9d93d5f737a3afdc9ec47ce97968ca41450413f741900927c382b8707798854` |

Each font's original SIL Open Font License 1.1 and copyright notice are included
in the adjacent `*-ofl.txt` file. Font updates must update the upstream revision,
file hashes and matching license together.
