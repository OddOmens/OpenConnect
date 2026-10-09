export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Files the app creates (database, WAL) are readable by its own user only.
    process.umask(0o077);
    // Warn if the password is off or weak; print the first-run setup code if none is chosen yet.
    const { logAuthStatus } = await import('./lib/auth');
    logAuthStatus();
    const { startScheduler } = await import('./lib/scheduler');
    startScheduler();
  }
}
