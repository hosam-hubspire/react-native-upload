/**
 * Executes an array of items through a mapper function with a concurrency limit.
 * Similar to Bluebird's Promise.map with concurrency option.
 *
 * @param items - Array of items to process
 * @param mapper - Function that processes each item and returns a Promise
 * @param concurrency - Maximum number of concurrent operations (default: Infinity)
 * @returns Promise that resolves to an array of results in the same order as input
 */
export async function mapConcurrent<T, R>(
  items: T[],
  mapper: (item: T, index: number) => Promise<R>,
  concurrency: number = Infinity,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  if (concurrency <= 0) {
    throw new Error('Concurrency must be greater than 0');
  }

  // If no concurrency limit or limit is greater than items, process all at once
  if (concurrency === Infinity || concurrency >= items.length) {
    return Promise.all(items.map((item, index) => mapper(item, index)));
  }

  const results: R[] = new Array(items.length);
  let index = 0;

  return new Promise<R[]>((resolve, reject) => {
    const executing = new Set<Promise<void>>();

    const processNext = () => {
      // If all items are processed, resolve when all executing promises complete
      if (index >= items.length) {
        if (executing.size === 0) {
          resolve(results);
        }
        return;
      }

      // If we're at concurrency limit, wait for one to complete
      if (executing.size >= concurrency) {
        return;
      }

      const currentIndex = index++;
      const item = items[currentIndex];

      const promise = mapper(item, currentIndex)
        .then((result) => {
          results[currentIndex] = result;
        })
        .catch((error) => {
          reject(error);
        })
        .finally(() => {
          executing.delete(promise);
          // Process next item
          processNext();
        });

      executing.add(promise);
      processNext();
    };

    // Start processing
    processNext();
  });
}

