import type { Outfit } from './types';

const DB_NAME = 'pink-closet-db';
const DB_VERSION = 1;
const STORE_NAME = 'outfits';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'outfitId' });
        store.createIndex('updatedAt', 'updatedAt');
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const request = run(store);

    tx.oncomplete = () => {
      db.close();
      resolve(request ? request.result : (undefined as T));
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function getOutfits(): Promise<Outfit[]> {
  const outfits = await withStore<Outfit[]>('readonly', (store) => store.getAll());
  return outfits.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function saveOutfit(outfit: Outfit): Promise<void> {
  await withStore<void>('readwrite', (store) => {
    store.put(outfit);
  });
}

export async function deleteOutfit(outfitId: string): Promise<void> {
  await withStore<void>('readwrite', (store) => {
    store.delete(outfitId);
  });
}
