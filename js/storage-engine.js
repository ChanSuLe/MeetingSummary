const DB_NAME = 'MeetingAssistantDB';
const DB_VERSION = 1;
const STORE_MEETINGS = 'meetings';
const STORE_AUDIO = 'audioChunks';

class StorageEngine {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { this.db = request.result; resolve(); };
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_MEETINGS)) {
          db.createObjectStore(STORE_MEETINGS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_AUDIO)) {
          db.createObjectStore(STORE_AUDIO, { keyPath: 'id', autoIncrement: true });
        }
      };
    });
  }

  async saveMeeting(meeting) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORE_MEETINGS], 'readwrite');
      const store = tx.objectStore(STORE_MEETINGS);
      meeting.updatedAt = new Date().toISOString();
      const req = store.put(meeting);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async getMeetings() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORE_MEETINGS], 'readonly');
      const store = tx.objectStore(STORE_MEETINGS);
      const req = store.getAll();
      req.onsuccess = () => {
        const meetings = req.result.sort((a, b) => new Date(b.date) - new Date(a.date));
        resolve(meetings);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async getMeeting(id) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORE_MEETINGS], 'readonly');
      const store = tx.objectStore(STORE_MEETINGS);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async deleteMeeting(id) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORE_MEETINGS, STORE_AUDIO], 'readwrite');
      tx.objectStore(STORE_MEETINGS).delete(id);
      const audioStore = tx.objectStore(STORE_AUDIO);
      const indexReq = audioStore.openCursor();
      indexReq.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          if (cursor.value.meetingId === id) cursor.delete();
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async saveAudioChunk(meetingId, chunk) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORE_AUDIO], 'readwrite');
      const store = tx.objectStore(STORE_AUDIO);
      const req = store.add({ meetingId, chunk, timestamp: Date.now() });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async getStorageInfo() {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      const used = (estimate.usage / (1024 * 1024)).toFixed(0);
      const total = estimate.quota ? (estimate.quota / (1024 * 1024 * 1024)).toFixed(1) : '?';
      return `${used} MB used / ${total} GB available`;
    }
    return 'Storage info unavailable';
  }
}
