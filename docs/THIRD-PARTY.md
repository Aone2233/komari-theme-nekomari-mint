# Third-party notices

The install ZIP includes these runtime notices in `dist/licenses/`:

| Component                                     | License                                  | Notice                                        |
| --------------------------------------------- | ---------------------------------------- | --------------------------------------------- |
| React / React DOM / Scheduler                 | MIT, Meta Platforms, Inc. and affiliates | `react.txt`, `react-dom.txt`, `scheduler.txt` |
| Lucide React, including Feather-derived icons | ISC / MIT                                | `lucide-react.txt`                            |
| Manrope variable font                         | SIL Open Font License 1.1                | `manrope.txt`                                 |

Full upstream license texts are retained in `public/licenses/` and copied by Vite.
Refresh them when upgrading runtime dependencies. Build and test tools (including
Vite, TypeScript, Playwright, Prettier and Python) are not included in the install
ZIP; their licenses are available from the package sources.

Komari and Nekomari are upstream host projects, not bundled runtime dependencies
of this theme. The theme does not copy or replace their administration frontend.

The separation of renewal costs, acquisition premiums and amortization is inspired
by [Komari-Theme-SAO](https://github.com/WAOR/Komari-Theme-SAO) (MIT), inspected at
`2b6a015d8be2efd6944336a98753bd86b0a47b3b` (see upstream for current code).
Mint's calculation and managed-settings editor are independently implemented;
SAO's source, UI assets and automatic acquisition-value algorithms are not bundled.
An optional offline import preserves SAO's stored premium/acquisition values and
per-node task bindings. An independently implemented, explicitly labeled SAO
amortization mode follows its acquisition-to-expiry/holding-span semantics; it
does not recompute the original acquisition premium or bundle SAO's FX client.

The detail latency chart also references SAO's multi-series line-chart interaction
at the same commit. Mint independently implements its SVG chart, gap handling,
sample inspection and legend without copying SAO code or bundling uPlot.
CPU facts and source links are documented in `CPU-GUIDE.md`; capability labels are
Mint's qualitative interpretation, not vendor ratings or benchmark results.
