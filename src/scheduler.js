let _intervalId = null;
let _running = false;

export function startScheduler(fn, intervalMin = 30) {
  if (_intervalId) return;
  console.log(`Scheduler: running now, then every ${intervalMin} min`);
  fn();
  _intervalId = setInterval(fn, intervalMin * 60_000);
  _running = true;
}

export function stopScheduler() {
  if (_intervalId) { clearInterval(_intervalId); _intervalId = null; }
  _running = false;
  console.log('Scheduler stopped');
}

export const isRunning = () => _running;
