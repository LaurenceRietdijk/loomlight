const { startLocaleImageScheduler } = require('./localeImageScheduler');

function startSchedulers() {
  // In the future, start additional schedulers here.
  startLocaleImageScheduler();
}

module.exports = { startSchedulers };

