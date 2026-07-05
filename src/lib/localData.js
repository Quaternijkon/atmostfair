import { apiRequest } from './apiClient';

export const db = {};

export function collection(_db, name) {
  return { kind: 'collection', collection: name };
}

export function doc(_db, collectionName, id) {
  if (typeof collectionName === 'object') {
    return { kind: 'doc', collection: collectionName.collection, id };
  }
  return { kind: 'doc', collection: collectionName, id };
}

export function query(collectionRef, ...constraints) {
  const serialized = {
    filters: [],
    orderBy: [],
  };

  for (const constraint of constraints) {
    if (constraint.type === 'where') serialized.filters.push(constraint);
    if (constraint.type === 'orderBy') serialized.orderBy.push(constraint);
    if (constraint.type === 'limit') serialized.limit = constraint.count;
    if (constraint.type === 'startAt') serialized.startAt = constraint.value;
    if (constraint.type === 'endAt') serialized.endAt = constraint.value;
  }

  return {
    kind: 'query',
    collection: collectionRef.collection,
    query: serialized,
  };
}

export function where(field, op, value) {
  return { type: 'where', field, op, value };
}

export function orderBy(field, direction = 'asc') {
  return { type: 'orderBy', field, direction };
}

export function limit(count) {
  return { type: 'limit', count };
}

export function startAt(value) {
  return { type: 'startAt', value };
}

export function endAt(value) {
  return { type: 'endAt', value };
}

export function arrayUnion(...values) {
  return { __type: 'arrayUnion', values };
}

export function arrayRemove(...values) {
  return { __type: 'arrayRemove', values };
}

export async function addDoc(collectionRef, data) {
  const result = await apiRequest('/api/data/add', {
    body: { collection: collectionRef.collection, data },
  });
  return doc(db, collectionRef.collection, result.doc.id);
}

export async function setDoc(docRef, data, options = {}) {
  await apiRequest('/api/data/set', {
    body: { collection: docRef.collection, id: docRef.id, data, options },
  });
}

export async function updateDoc(docRef, data) {
  await apiRequest('/api/data/update', {
    body: { collection: docRef.collection, id: docRef.id, data },
  });
}

export async function deleteDoc(docRef) {
  await apiRequest('/api/data/delete', {
    body: { collection: docRef.collection, id: docRef.id },
  });
}

export async function getDoc(docRef) {
  const result = await apiRequest('/api/data/get', {
    body: { collection: docRef.collection, id: docRef.id },
  });
  return createDocSnapshot(result.doc);
}

export async function getDocs(ref) {
  const result = await apiRequest('/api/data/list', {
    body: { collection: ref.collection, query: serializeQuery(ref) },
  });
  return createQuerySnapshot(result.docs || []);
}

export function onSnapshot(ref, onNext, onError) {
  let active = true;

  const read = async () => {
    try {
      const snapshot = ref.kind === 'doc' ? await getDoc(ref) : await getDocs(ref);
      if (active) onNext(snapshot);
    } catch (error) {
      if (onError) onError(error);
      else console.error(error);
    }
  };

  read();
  const interval = window.setInterval(read, 1500);
  return () => {
    active = false;
    window.clearInterval(interval);
  };
}

export function writeBatch() {
  const operations = [];
  return {
    set(ref, data, options = {}) {
      operations.push({ type: 'set', collection: ref.collection, id: ref.id, data, options });
    },
    update(ref, data) {
      operations.push({ type: 'update', collection: ref.collection, id: ref.id, data });
    },
    delete(ref) {
      operations.push({ type: 'delete', collection: ref.collection, id: ref.id });
    },
    async commit() {
      await apiRequest('/api/data/batch', { body: { operations } });
    },
  };
}

function serializeQuery(ref) {
  if (ref.kind === 'query') return ref.query;
  return {};
}

function createQuerySnapshot(docs) {
  const snapshots = docs.map(createDocSnapshot);
  return {
    docs: snapshots,
    forEach(callback) {
      snapshots.forEach(callback);
    },
  };
}

function createDocSnapshot(rawDoc) {
  const exists = Boolean(rawDoc);
  const id = rawDoc?.id;
  const data = rawDoc ? stripId(rawDoc) : undefined;
  return {
    id,
    exists: () => exists,
    data: () => data,
  };
}

function stripId(rawDoc) {
  const { id: _id, ...data } = rawDoc;
  return data;
}
