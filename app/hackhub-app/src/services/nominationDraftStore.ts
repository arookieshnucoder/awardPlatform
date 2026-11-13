export interface NominationDraftScope {
  userId: string
  hackathonId: string
  nominationType: 'individual' | 'team'
  editId?: string | null
  category?: string
}

export interface NominationDraft<T> {
  version: 1
  savedAt: string
  data: T
}

const generationKey = 'draft-generation'
// Generation zero uses the original keys so deployment does not clear existing drafts.
const storageKey = (key: string, generation: number) =>
  generation === 0 ? key : JSON.stringify([generation, ...JSON.parse(key) as string[]])

// 每个用户、活动、提名类型、编辑记录和赛道分别保存，兼容旧版未分赛道的键。
export const nominationDraftKey = (scope: NominationDraftScope) => JSON.stringify([
  scope.userId, scope.hackathonId, scope.nominationType, scope.editId ?? 'new',
  ...(scope.category ? [scope.category] : []),
])

const openDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  if (typeof indexedDB === 'undefined') {
    reject(new Error('Draft storage is unavailable in this browser.'))
    return
  }
  let settled = false
  const request = indexedDB.open('hackhub-nomination-drafts', 1)
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains('drafts')) request.result.createObjectStore('drafts')
  }
  request.onsuccess = () => {
    if (settled) { request.result.close(); return }
    settled = true
    request.result.onversionchange = () => request.result.close()
    resolve(request.result)
  }
  request.onerror = () => { settled = true; reject(new Error('Unable to open draft storage.')) }
  request.onblocked = () => { settled = true; reject(new Error('Close other nomination tabs and retry draft storage.')) }
})

async function transact<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction('drafts', mode)
      let result: T
      const request = action(transaction.objectStore('drafts'))
      request.onsuccess = () => { result = request.result }
      // 只有事务提交完成才提示保存成功，容量不足或事务回滚不能被当作已保存。
      transaction.oncomplete = () => resolve(result)
      transaction.onerror = () => reject(new Error('Unable to access draft storage. Check available browser storage and retry.'))
      transaction.onabort = () => reject(new Error('Draft storage was interrupted. Please retry.'))
    })
  } finally {
    database.close()
  }
}

export const NominationDraftStore = {
  async clearEarlierGenerations(generation: number): Promise<void> {
    const database = await openDatabase()
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('drafts', 'readwrite')
        const store = transaction.objectStore('drafts')
        const current = store.get(generationKey)
        current.onsuccess = () => {
          if ((current.result ?? 0) >= generation) return
          store.put(generation, generationKey)
          const request = store.openKeyCursor()
          request.onsuccess = () => {
            const cursor = request.result
            if (!cursor) return
            if (typeof cursor.key === 'string' && cursor.key.startsWith('[')) {
              const [first] = JSON.parse(cursor.key) as [string | number]
              if (typeof first === 'string' || first < generation) store.delete(cursor.key)
            }
            cursor.continue()
          }
        }
        transaction.oncomplete = () => resolve()
        transaction.onabort = () => reject(new Error('Unable to clear old drafts.'))
      })
    } finally { database.close() }
  },
  async list<T>(key: string, categories: readonly string[], generation = 0): Promise<Record<string, NominationDraft<T>>> {
    const database = await openDatabase()
    const records: Record<string, NominationDraft<T>> = {}
    try {
      await new Promise<void>((resolve, reject) => {
        const scope: string[] = JSON.parse(key)
        const transaction = database.transaction('drafts', 'readwrite')
        const store = transaction.objectStore('drafts')
        const validDraft = (draft: NominationDraft<T> | undefined): draft is NominationDraft<T> =>
          draft?.version === 1 && typeof draft.savedAt === 'string' && Boolean(draft.data)
        for (const category of categories) {
          const request = store.get(storageKey(JSON.stringify([...scope, category]), generation))
          request.onsuccess = () => {
            if (validDraft(request.result)) records[category] = request.result
          }
        }
        // Read the old unscoped record last so it can be compared with the saved track.
        if (generation === 0) {
          const legacy = store.get(key)
          legacy.onsuccess = () => {
            const draft = legacy.result as NominationDraft<T> | undefined
            if (!validDraft(draft)) return
            const data = draft.data as { category?: string; form?: { category?: string } }
            const category = data.category ?? data.form?.category
            if (!category || !categories.includes(category)) return
            if (!records[category] || draft.savedAt > records[category].savedAt) {
              records[category] = draft
              store.put(draft, JSON.stringify([...scope, category]))
            }
            store.delete(key)
          }
        }
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(new Error('Unable to read draft storage.'))
        transaction.onabort = () => reject(new Error('Draft storage was interrupted. Please retry.'))
      })
    } finally { database.close() }
    return records
  },
  async save<T>(key: string, data: T, generation = 0): Promise<NominationDraft<T>> {
    const record: NominationDraft<T> = { version: 1, savedAt: new Date().toISOString(), data }
    // IndexedDB 的结构化克隆保存文件本体，退出页面后仍可恢复照片和附件。
    const database = await openDatabase()
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('drafts', 'readwrite')
        const store = transaction.objectStore('drafts')
        const current = store.get(generationKey)
        current.onsuccess = () => {
          if ((current.result ?? 0) > generation) transaction.abort()
          else store.put(record, storageKey(key, generation))
        }
        transaction.oncomplete = () => resolve()
        transaction.onabort = () => reject(new Error('Unable to save draft.'))
      })
    } finally { database.close() }
    return record
  },
  async remove(key: string, generation = 0): Promise<void> {
    await transact('readwrite', (store) => store.delete(storageKey(key, generation)))
  },
}
