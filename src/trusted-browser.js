function withStore(mode, operation) {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open('pocket-loky-trusted-browser', 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore('keys');
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      try {
        const transaction = db.transaction('keys', mode);
        const request = operation(transaction.objectStore('keys'));
        transaction.oncomplete = () => {
          db.close();
          resolve(request.result);
        };
        transaction.onabort = () => {
          db.close();
          reject(transaction.error);
        };
      } catch (error) {
        db.close();
        reject(error);
      }
    };
  });
}

export function readTrustedKey(id) {
  return withStore('readonly', store => store.get(id));
}

export function saveTrustedKey(id, key) {
  return withStore('readwrite', store => store.put(key, id));
}
export function forgetTrustedKey(id) {
  return withStore('readwrite', store => store.delete(id));
}