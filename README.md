# Pomodoro for Orca

A pomodoro timer in Orca's status bar.

- Click the timer (or `Cmd/Ctrl+Alt+P`) to start or pause; the ↻ button next to it resets.
- Focus 25 min → break 5 min, with a 15 min long break every 4 focus sessions.
- When a phase ends: a sound and a desktop notification. The next phase waits for a click unless "Start the next phase automatically" is on.
- Palette commands: `Pomodoro: Start / Pause`, `Pomodoro: Skip to next phase`, `Pomodoro: Reset`.
- Durations, sound and auto-start live in Settings → Plugins → Pomodoro.
- The timer survives reloads; the count of finished sessions resets each day.

Sound: macOS system sounds via `afplay`, `paplay` on Linux, the system sound on Windows.

## Develop

```sh
orca plugin validate .
orca plugin test .
orca plugin dev watch .
```
