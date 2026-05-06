export async function recordTests(options: { files?: string[] }): Promise<void> {
  console.log('Recording mode: calling real APIs and saving responses...')
  // Delegate to the test runner with record mode
  const { runTests } = await import('../core/runner.js')
  await runTests({
    mode: 'record',
    reporter: 'terminal',
    files: options.files,
  })
}
