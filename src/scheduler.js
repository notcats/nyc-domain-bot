import cron from 'node-cron';

let schedulerTask = null;
let isRunning = false;

/**
 * Запускает планировщик с заданным интервалом
 * @param {Function} checkFn - функция проверки доменов
 * @param {number} intervalMinutes - интервал в минутах (по умолчанию 30)
 */
export function startScheduler(checkFn, intervalMinutes) {
  const interval = intervalMinutes || parseInt(process.env.CHECK_INTERVAL) || 30;

  if (schedulerTask) {
    console.log('[scheduler] Планировщик уже запущен');
    return;
  }

  // Преобразуем минуты в cron-выражение
  const cronExpression = `*/${interval} * * * *`;
  console.log(`[scheduler] Запуск планировщика с интервалом ${interval} мин (${cronExpression})`);

  schedulerTask = cron.schedule(cronExpression, async () => {
    if (isRunning) {
      console.log('[scheduler] Предыдущая проверка ещё не завершена — пропускаем');
      return;
    }

    isRunning = true;
    console.log('[scheduler] Запуск плановой проверки доменов...');

    try {
      await checkFn();
      console.log('[scheduler] Плановая проверка завершена ✅');
    } catch (err) {
      console.error('[scheduler] Ошибка при плановой проверке:', err.message);
    } finally {
      isRunning = false;
    }
  });

  console.log('[scheduler] Планировщик запущен ✅');
}

/**
 * Останавливает планировщик
 */
export function stopScheduler() {
  if (schedulerTask) {
    schedulerTask.stop();
    schedulerTask = null;
    isRunning = false;
    console.log('[scheduler] Планировщик остановлен');
  } else {
    console.log('[scheduler] Планировщик не был запущен');
  }
}

/**
 * Проверяет, запущен ли планировщик
 * @returns {boolean}
 */
export function isSchedulerRunning() {
  return schedulerTask !== null;
}
