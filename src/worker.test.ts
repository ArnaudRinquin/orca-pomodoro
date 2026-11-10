import { assert, mountWorker, test } from 'orca/testing'
import * as main from './worker'

test('toggle starts then pauses, status bar updates', async () => {
  const worker = await mountWorker(main, { commands: ['pomodoro.toggle', 'pomodoro.skip', 'pomodoro.reset'] })
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(await worker.command('pomodoro.toggle'), 'Focus started')
  assert.equal(await worker.command('pomodoro.toggle'), 'Paused')
  assert.equal(await worker.command('pomodoro.skip'), 'Skipped to Break')
  assert.equal(await worker.command('pomodoro.reset'), 'Reset')
  const updates = worker.host.callsOf('statusBar.update')
  assert.ok(updates.length >= 4)
  assert.equal(worker.refusals.length, 0, JSON.stringify(worker.refusals))
  await worker.deactivate()
})
