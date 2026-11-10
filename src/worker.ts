import { execFile } from 'node:child_process'
import type { OrcaWorkerApi } from 'orca/worker'

type Phase = 'work' | 'break' | 'longBreak'

type State = {
  phase: Phase
  running: boolean
  endsAt: number | null
  remainingMs: number
  completed: number
}

type Config = {
  workMinutes: number
  breakMinutes: number
  longBreakMinutes: number
  longBreakEvery: number
  autoStart: boolean
  sound: boolean
  soundName: string
}

const KEY = 'state'
const LABEL: Record<Phase, string> = { work: 'Focus', break: 'Break', longBreak: 'Long break' }

const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

let timer: ReturnType<typeof setInterval> | undefined

export function deactivate(): void {
  if (timer) clearInterval(timer)
  timer = undefined
}

export default function activate(orca: OrcaWorkerApi): void {
  let config: Config = { workMinutes: 25, breakMinutes: 5, longBreakMinutes: 15, longBreakEvery: 4, autoStart: false, sound: true, soundName: 'Glass' }
  let state: State = { phase: 'work', running: false, endsAt: null, remainingMs: 25 * 60_000, completed: 0 }
  let lastText = ''

  const duration = (phase: Phase) =>
    (phase === 'work' ? config.workMinutes : phase === 'break' ? config.breakMinutes : config.longBreakMinutes) * 60_000

  const remaining = () => (state.running && state.endsAt ? state.endsAt - Date.now() : state.remainingMs)

  const save = () => orca.storage.set(KEY, state as unknown as never).catch((e) => orca.log(`save failed: ${e}`))

  const playSound = () => {
    if (!config.sound) return
    const done = (e: unknown) => e && orca.log(`sound failed: ${e}`)
    if (process.platform === 'darwin') {
      const name = /^[A-Za-z]+$/.test(config.soundName) ? config.soundName : 'Glass'
      execFile('afplay', [`/System/Library/Sounds/${name}.aiff`], done)
    } else if (process.platform === 'linux') {
      execFile('paplay', ['/usr/share/sounds/freedesktop/stereo/complete.oga'], done)
    } else if (process.platform === 'win32') {
      execFile('powershell', ['-NoProfile', '-Command', '[System.Media.SystemSounds]::Asterisk.Play()'], done)
    }
  }

  const isFresh = () => !state.running && state.remainingMs === duration(state.phase) && state.phase === 'work' && state.completed === 0

  const render = (force = false) => {
    const text = fmt(remaining())
    if (!force && text === lastText) return
    lastText = text
    const action = state.running ? 'pause' : 'start'
    void orca.host
      .call('statusBar.update', {
        id: 'timer',
        text: state.running || state.remainingMs !== duration(state.phase) ? `${LABEL[state.phase]} ${text}` : text,
        icon: state.running ? 'pause' : 'play',
        tone: !state.running ? 'neutral' : state.phase === 'work' ? 'danger' : 'success',
        tooltip: `Pomodoro: ${LABEL[state.phase]} · ${state.completed} done today · click to ${action}`,
        visible: true
      })
      .catch((e: unknown) => orca.log(`statusBar.update failed: ${e}`))
    if (force)
      void orca.host
        .call('statusBar.update', { id: 'reset', visible: !isFresh() })
        .catch((e: unknown) => orca.log(`statusBar.update failed: ${e}`))
  }

  const nextPhase = (): Phase => {
    if (state.phase !== 'work') return 'work'
    return state.completed % config.longBreakEvery === 0 ? 'longBreak' : 'break'
  }

  const enter = (phase: Phase, run: boolean) => {
    const ms = duration(phase)
    state = { ...state, phase, running: run, remainingMs: ms, endsAt: run ? Date.now() + ms : null }
    void save()
    render(true)
  }

  const finish = () => {
    const ended = state.phase
    if (ended === 'work') state.completed += 1
    const next = nextPhase()
    playSound()
    void orca.host
      .call('notifications.show', {
        title: ended === 'work' ? 'Focus session done' : 'Break over',
        body: `${LABEL[next]} next (${duration(next) / 60_000} min)${config.autoStart ? ' — started' : ' — click the timer to start'}`
      })
      .catch((e: unknown) => orca.log(`notify failed: ${e}`))
    enter(next, config.autoStart)
  }

  const tick = () => {
    if (state.running && remaining() <= 0) finish()
    else render()
  }

  const loadConfig = async () => {
    const all = (await orca.settings.get()) as Partial<Config>
    config = { ...config, ...all }
  }

  orca.commands.register('pomodoro.toggle', () => {
    if (state.running) {
      state = { ...state, running: false, remainingMs: remaining(), endsAt: null }
    } else {
      state = { ...state, running: true, endsAt: Date.now() + state.remainingMs }
    }
    void save()
    render(true)
    return state.running ? `${LABEL[state.phase]} started` : 'Paused'
  })

  orca.commands.register('pomodoro.skip', () => {
    if (state.phase === 'work') state.completed += 1
    enter(nextPhase(), state.running)
    return `Skipped to ${LABEL[state.phase]}`
  })

  orca.commands.register('pomodoro.reset', () => {
    state = { ...state, completed: 0 }
    enter('work', false)
    return 'Reset'
  })

  orca.settings.onDidChange(() => {
    void loadConfig().then(() => {
      if (!state.running) state.remainingMs = duration(state.phase)
      render(true)
    })
  })

  void (async () => {
    await loadConfig().catch((e) => orca.log(`settings failed: ${e}`))
    const stored = (await orca.storage.get(KEY).catch(() => null)) as State | null
    const today = new Date().toDateString()
    const storedDay = (await orca.storage.get('day').catch(() => null)) as string | null
    if (stored) state = stored
    else state.remainingMs = duration('work')
    if (storedDay !== today) {
      state.completed = 0
      void orca.storage.set('day', today)
    }
    render(true)
    timer = setInterval(tick, 1000)
  })()
}
