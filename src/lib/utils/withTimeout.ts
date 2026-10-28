/**
 * Executes a promise with a hard timeout.
 * Rejects if the promise does not resolve within `ms` milliseconds,
 * or returns `fallbackValue` if provided.
 */
export async function withTimeout<T>(
  promise: Promise<T> | PromiseLike<T>,
  ms: number,
  fallbackValue?: T
): Promise<T> {
  let timer: NodeJS.Timeout

  const timeoutPromise = new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => {
      if (fallbackValue !== undefined) {
        resolve(fallbackValue)
      } else {
        reject(new Error(`Operation timed out after ${ms}ms`))
      }
    }, ms)
  })

  return Promise.race([Promise.resolve(promise), timeoutPromise]).finally(() => {
    clearTimeout(timer)
  })
}
