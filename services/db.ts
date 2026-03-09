
const DB_NAME = 'GeoMapperDB';
const STORE_NAME = 'amap_cache';
const CONFIG_STORE_NAME = 'app_config'; // 配置存储
const DB_VERSION = 3; // 升级版本以支持配置存储
const DEFAULT_TTL = 7 * 24 * 60 * 60 * 1000; // F2: 默认7天过期
const CONFIG_TTL = 365 * 24 * 60 * 60 * 1000; // 配置1年过期

interface DBEntry {
  key: string;
  value: any;
  timestamp: number;
  ttl: number; // F2: 过期时间（毫秒）
}

export const db = {
  dbPromise: null as Promise<IDBDatabase> | null,

  init() {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
        // 创建配置存储
        if (!db.objectStoreNames.contains(CONFIG_STORE_NAME)) {
          db.createObjectStore(CONFIG_STORE_NAME, { keyPath: 'key' });
        }
      };

      request.onsuccess = (event) => {
        resolve((event.target as IDBOpenDBRequest).result);
      };

      request.onerror = (event) => {
        console.error('IndexedDB error:', event);
        reject((event.target as IDBOpenDBRequest).error);
      };
    });
    return this.dbPromise;
  },

  async get<T>(key: string): Promise<T | undefined> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        const entry = request.result as DBEntry | undefined;
        if (!entry) {
          resolve(undefined);
          return;
        }
        
        // F2: 检查是否过期
        const now = Date.now();
        const expireTime = entry.timestamp + (entry.ttl || DEFAULT_TTL);
        if (now > expireTime) {
          // 过期了，删除并返回 undefined
          this.delete(key).catch(() => {});
          resolve(undefined);
          return;
        }
        
        resolve(entry.value);
      };
      request.onerror = () => reject(request.error);
    });
  },

  async set(key: string, value: any, ttl: number = DEFAULT_TTL): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put({ key, value, timestamp: Date.now(), ttl });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async delete(key: string): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async clear(): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async count(): Promise<number> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
  },

  // F2: 清理过期缓存
  async cleanExpired(): Promise<number> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.openCursor();
      let deletedCount = 0;
      const now = Date.now();

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const entry = cursor.value as DBEntry;
          const expireTime = entry.timestamp + (entry.ttl || DEFAULT_TTL);
          if (now > expireTime) {
            cursor.delete();
            deletedCount++;
          }
          cursor.continue();
        } else {
          resolve(deletedCount);
        }
      };
      request.onerror = () => reject(request.error);
    });
  },

  // ========== 配置存储方法 ==========
  
  async getConfig<T>(key: string): Promise<T | undefined> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(CONFIG_STORE_NAME, 'readonly');
      const store = transaction.objectStore(CONFIG_STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        const entry = request.result as DBEntry | undefined;
        if (!entry) {
          resolve(undefined);
          return;
        }
        resolve(entry.value);
      };
      request.onerror = () => reject(request.error);
    });
  },

  async setConfig(key: string, value: any): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(CONFIG_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(CONFIG_STORE_NAME);
      const request = store.put({ key, value, timestamp: Date.now(), ttl: CONFIG_TTL });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async deleteConfig(key: string): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(CONFIG_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(CONFIG_STORE_NAME);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
};
