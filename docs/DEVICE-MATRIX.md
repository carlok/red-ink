# Device matrix (emulated)

Headless Chrome via CDP (`Emulation.setDeviceMetricsOverride` + touch emulation where noted). The regression runner (`node tools/regression.mjs`) covers **phone portrait**, **phone landscape (844×390)**, and **offline `file://`**. Other rows are exercised by `tools/ui-probe.mjs` and manual play.

| Profile | Viewport | DPR | Touch | Regression / probe |
| --- | --- | --- | --- | --- |
| Desktop 1080p | 1920×1080 | 1 | no | `tools/measure.mjs`, draw/mesh budget in regression |
| Laptop | 1280×720 | 1 | no | `tools/ui-probe.mjs` |
| Tablet portrait | 768×1024 | 1 | no | `tools/ui-probe.mjs` |
| Phone portrait | 390×844 | 2 | yes (CDP touch emulation + reload) | `regression.mjs` → `touch_portrait` |
| Phone landscape | 844×390 | 2 | yes | `regression.mjs` → `phone_landscape_844x390` |
| Offline pack | any | — | — | `file://` index.html → `offline_file_*` tests |

**Budgets (all profiles):** fight draw calls <400 per frame, active meshes <250, keyboard-to-attack <80 ms (see `tools/input-probe.mjs`).

**Human confirm still needed:** real iGPU fps at 1080p, physical gamepad, physical phone.
