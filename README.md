<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icon-dark.png" />
    <img src="./icon-light.png" alt="Calendar" width="144" />
  </picture>
</p>

<div align="center">

# Calendar

</div>

Every agent and workflow scheduled job on Month/Week/Day/Agenda views (past runs from history, upcoming from cron/interval) with a New-automation dialog.

> **The public home of `ryu-calendar`.** Source, builds, and releases live here —
> binaries for every platform are attached to each release.
>
> This tree is generated from the Ryu monorepo, so commits pushed here
> directly are replaced on the next sync. **Pull requests are welcome** —
> open them here and they are ported into the monorepo, then flow back out.
> Ryu as a whole: https://github.com/amajorai/ryu

## Install

**App:** [Install](ryu://apps/@ryu/calendar) (opens the Ryu desktop app and asks you to confirm)

**CLI:**

```bash
ryu apps add @ryu/calendar
```

## Source & build

This is the **source of record** for the app UI. It imports Ryu's private
`@ryu/ui` design system, so it does **not** build standalone outside the
monorepo — it **builds inside the amajorai/ryu monorepo workspace**.
The **shipped bundle below is the built artifact**: a prebuilt single-file
companion bundle is included at [`dist/calendar.ui.html`](./dist/calendar.ui.html) —
the runnable UI Ryu loads for this app.

## License

Apache-2.0 — see [LICENSE](./LICENSE).

## Parts

- **`ui/` — companion (companion-only app, no backend crate).** A sandboxed
  full-page Companion (Path B, `ui_format: "html"`), built to one self-contained
  `dist/index.html` via `vite-plugin-singlefile`. The view components
  (`AgendaView`, `TimeGridView`, `CalendarContent`, `NewAutomationDialog`) drive
  Core's scheduling endpoints through the `window.ryu` bridge — no direct `fetch`,
  no node token in the sandbox.

There is no dedicated backend crate or sidecar: the schedule store, cron/interval
projection, and run history live in Core; this app is only the surface.

## Manifest (`manifest.json`)

- **Capability grant:** `calendar:crud` — the bridge capability the companion calls
  (read schedules + run history, create/edit a scheduled automation).
- **Runnable:** one `companion` (`Calendar`, icon `calendar-04`).

## Surfaces as

A companion route in the shell (label **Calendar**). The New automation dialog
schedules an agent job; past/upcoming runs are unified onto one timeline.
