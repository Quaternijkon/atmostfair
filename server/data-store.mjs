import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const ARRAY_UNION = 'arrayUnion';
const ARRAY_REMOVE = 'arrayRemove';

export function arrayUnion(...values) {
  return { __type: ARRAY_UNION, values };
}

export function arrayRemove(...values) {
  return { __type: ARRAY_REMOVE, values };
}

export async function createDataStore({ filePath }) {
  const store = new DataStore(filePath);
  await store.init();
  return store;
}

class DataStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.writeQueue = Promise.resolve();
    this.state = { collections: {} };
  }

  async init() {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      this.state = {
        collections: parsed.collections && typeof parsed.collections === 'object'
          ? parsed.collections
          : {},
      };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await this.persist();
    }
  }

  async get(collectionName, id) {
    const collection = this.state.collections[collectionName] || {};
    const doc = collection[id];
    return doc ? clone({ id, ...doc }) : null;
  }

  async list(collectionName, query = {}) {
    const collection = this.state.collections[collectionName] || {};
    let docs = Object.entries(collection).map(([id, data]) => ({ id, ...clone(data) }));

    for (const filter of query.filters || []) {
      docs = docs.filter((doc) => matchesFilter(doc, filter));
    }

    const orderRules = query.orderBy || [];
    if (orderRules.length > 0) {
      docs.sort((a, b) => compareByOrder(a, b, orderRules));
    }

    if (query.startAt !== undefined && orderRules[0]) {
      const field = orderRules[0].field;
      docs = docs.filter((doc) => compareValues(doc[field], query.startAt) >= 0);
    }

    if (query.endAt !== undefined && orderRules[0]) {
      const field = orderRules[0].field;
      docs = docs.filter((doc) => compareValues(doc[field], query.endAt) <= 0);
    }

    if (Number.isFinite(query.limit)) {
      docs = docs.slice(0, query.limit);
    }

    return clone(docs);
  }

  async add(collectionName, data) {
    const id = crypto.randomUUID();
    await this.set(collectionName, id, data);
    return this.get(collectionName, id);
  }

  async set(collectionName, id, data, options = {}) {
    return this.mutate(async () => {
      const collection = this.ensureCollection(collectionName);
      const existing = collection[id] || {};
      collection[id] = options.merge
        ? { ...existing, ...applyTransforms(existing, data) }
        : clone(data);
      await this.persist();
      return clone({ id, ...collection[id] });
    });
  }

  async update(collectionName, id, data) {
    return this.mutate(async () => {
      const collection = this.ensureCollection(collectionName);
      if (!collection[id]) {
        const error = new Error(`Document not found: ${collectionName}/${id}`);
        error.code = 'not-found';
        throw error;
      }
      collection[id] = {
        ...collection[id],
        ...applyTransforms(collection[id], data),
      };
      await this.persist();
      return clone({ id, ...collection[id] });
    });
  }

  async delete(collectionName, id) {
    return this.mutate(async () => {
      const collection = this.ensureCollection(collectionName);
      delete collection[id];
      await this.persist();
      return true;
    });
  }

  async batch(operations) {
    return this.mutate(async () => {
      const previousState = clone(this.state);
      const results = [];
      try {
        for (const operation of operations) {
          const collection = this.ensureCollection(operation.collection);
          if (operation.type === 'set') {
            const existing = collection[operation.id] || {};
            collection[operation.id] = operation.options?.merge
              ? { ...existing, ...applyTransforms(existing, operation.data || {}) }
              : clone(operation.data || {});
            results.push({ id: operation.id, ...clone(collection[operation.id]) });
          } else if (operation.type === 'update') {
            if (!collection[operation.id]) {
              const error = new Error(`Document not found: ${operation.collection}/${operation.id}`);
              error.code = 'not-found';
              throw error;
            }
            collection[operation.id] = {
              ...collection[operation.id],
              ...applyTransforms(collection[operation.id], operation.data || {}),
            };
            results.push({ id: operation.id, ...clone(collection[operation.id]) });
          } else if (operation.type === 'delete') {
            delete collection[operation.id];
            results.push({ id: operation.id, deleted: true });
          } else if (operation.type === 'add') {
            const id = crypto.randomUUID();
            collection[id] = clone(operation.data || {});
            results.push({ id, ...clone(collection[id]) });
          }
        }
        await this.persist();
        return results;
      } catch (error) {
        this.state = previousState;
        throw error;
      }
    });
  }

  ensureCollection(collectionName) {
    if (!this.state.collections[collectionName]) {
      this.state.collections[collectionName] = {};
    }
    return this.state.collections[collectionName];
  }

  async mutate(fn) {
    const next = this.writeQueue.then(fn, fn);
    this.writeQueue = next.then(() => undefined, () => undefined);
    return next;
  }

  async persist() {
    const tmpPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmpPath, `${JSON.stringify(this.state, null, 2)}\n`, 'utf8');
    await rename(tmpPath, this.filePath);
  }
}

function applyTransforms(existing, patch) {
  const result = {};
  for (const [key, value] of Object.entries(patch || {})) {
    if (value?.__type === ARRAY_UNION) {
      const current = Array.isArray(existing[key]) ? [...existing[key]] : [];
      for (const item of value.values || []) {
        if (!current.some((entry) => deepEqual(entry, item))) current.push(item);
      }
      result[key] = current;
    } else if (value?.__type === ARRAY_REMOVE) {
      const current = Array.isArray(existing[key]) ? existing[key] : [];
      result[key] = current.filter((entry) => !(value.values || []).some((item) => deepEqual(entry, item)));
    } else {
      result[key] = clone(value);
    }
  }
  return result;
}

function matchesFilter(doc, filter) {
  const actual = doc[filter.field];
  if (filter.op === '==') return deepEqual(actual, filter.value);
  if (filter.op === 'in') return Array.isArray(filter.value) && filter.value.some((value) => deepEqual(actual, value));
  if (filter.op === 'array-contains') return Array.isArray(actual) && actual.some((value) => deepEqual(value, filter.value));
  if (filter.op === '>=') return compareValues(actual, filter.value) >= 0;
  if (filter.op === '<=') return compareValues(actual, filter.value) <= 0;
  if (filter.op === '>') return compareValues(actual, filter.value) > 0;
  if (filter.op === '<') return compareValues(actual, filter.value) < 0;
  return false;
}

function compareByOrder(a, b, orderRules) {
  for (const rule of orderRules) {
    const direction = rule.direction === 'desc' ? -1 : 1;
    const result = compareValues(a[rule.field], b[rule.field]);
    if (result !== 0) return result * direction;
  }
  return 0;
}

function compareValues(a, b) {
  if (a === b) return 0;
  if (a === undefined || a === null) return -1;
  if (b === undefined || b === null) return 1;
  return a > b ? 1 : -1;
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}
