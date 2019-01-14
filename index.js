class PathIndex {
  constructor() {
    this.startOf = {};
  }

  exists(path) {
    return path in (this.startOf || {});
  }

  locate(path, index) {
    if (!Number.isInteger(index) || index < 0) {
      if (!path) return 0;
      return Object.entries(this.startOf || {}).reduce(
        (acc, [key, val]) =>
          key.startsWith(path) || path.startsWith(key) ? Math.max(acc, val) : acc,
        0
      );
    }
    if (path) {
      this.startOf[path] = index;
      this.startOf = Object.entries(this.startOf || {}).reduce((acc, [key, val]) => {
        acc[key.startsWith(path) ? path : key] =
          key.startsWith(path) || path.startsWith(key) ? index : val;
        return acc;
      }, {});
    }
    return this.startOf || {};
  }
}

function toDot(path) {
  return path
    .replace(/^\//, '')
    .replace(/\//g, '.')
    .replace(/~1/g, '/')
    .replace(/~0/g, '~');
}

function extract(dotPath) {
  const components = dotPath.split('.');
  const last = components.pop();
  const index = last === '-' ? '-' : parseInt(last, 10);
  const location = Number.isNaN(index) ? dotPath : components.join('.');
  return { location, index };
}

function initPush(value, index) {
  const result = { $each: [value] };
  if (index !== '-') {
    result.$position = index;
  }
  return result;
}

function fromJSONPatch(patches) {
  const pathIndex = new PathIndex();
  const pushIndex = new PathIndex();
  return patches.reduce(
    (updates, patch) => {
      const { op, path, value, from } = patch;
      const fullPath = toDot(path);
      const { location, index } = extract(fullPath);
      let nextAt = pathIndex.locate(location);
      if (op === 'add') {
        if (Number.isNaN(index)) {
          const update = updates[nextAt] || {};
          update.$set = { ...(update.$set || {}), [fullPath]: value };
          updates.splice(nextAt, 1, update);
          pathIndex.locate(location, nextAt + 1);
          return updates;
        }
        const pushAt = pushIndex.exists(location) ? pushIndex.locate(location) : nextAt;
        const current = updates[pushAt] || {};
        if (!current.$push || !current.$push[location]) {
          current.$push = { ...(current.$push || {}), [location]: initPush(value, index) };
          updates.splice(pushAt, 1, current);
          pushIndex.locate(location, pushAt);
          pathIndex.locate(location, Math.max(pushAt + 1, nextAt));
          return updates;
        }
        const backward =
          !('$position' in current.$push[location]) || current.$push[location].$position < 0;
        if ((!backward && (index === '-' || index < 0)) || (backward && index >= 0)) {
          const next = updates[nextAt] || {};
          next.$push = { ...(next.$push || {}), [location]: initPush(value, index) };
          updates.splice(nextAt, 1, next);
          pushIndex.locate(location, nextAt);
          pathIndex.locate(location, nextAt + 1);
          return updates;
        }
        const $position = !('$position' in current.$push[location])
          ? 0
          : Math.abs(current.$push[location].$position);
        const absIndex = index === '-' ? 0 : Math.abs(index);
        const start = absIndex - $position;
        if (start < 0 || start > current.$push[location].$each.length) {
          const next = updates[nextAt] || {};
          next.$push = { ...(next.$push || {}), [location]: initPush(value, index) };
          updates.splice(nextAt, 1, next);
          pushIndex.locate(location, nextAt);
          pathIndex.locate(location, nextAt + 1);
          return updates;
        }
        const $each = backward
          ? current.$push[location].$each.reverse()
          : current.$push[location].$each;
        $each.splice(start, 0, value);
        current.$push[location].$each = backward ? $each.reverse() : $each;
        updates.splice(pushAt, 1, current);
        pushIndex.locate(location, pushAt);
        pathIndex.locate(location, Math.max(pushAt + 1, nextAt));
        return updates;
      }
      if (op === 'remove') {
        if (Number.isNaN(index)) {
          const update = updates[nextAt] || {};
          update.$unset = { ...(update.$unset || {}), [fullPath]: 1 };
          updates.splice(nextAt, 1, update);
        } else if (index === -1 || index === 0) {
          const update = updates[nextAt] || {};
          update.$pop = { ...(update.$pop || {}), [location]: index === -1 ? 1 : -1 };
          updates.splice(nextAt, 1, update);
        } else {
          const update = updates[nextAt] || {};
          update.$set = { ...(update.$set || {}), [fullPath]: null };
          updates.splice(nextAt, 1, update);
          nextAt += 1;
          const remove = updates[nextAt] || {};
          remove.$pull = { ...(remove.$pull || {}), [location]: null };
          updates.splice(nextAt, 1, remove);
        }
        pathIndex.locate(location, nextAt + 1);
        return updates;
      }
      if (op === 'replace') {
        const update = updates[nextAt] || {};
        update.$set = { ...(update.$set || {}), [fullPath]: value };
        updates.splice(nextAt, 1, update);
        pathIndex.locate(location, nextAt + 1);
        return updates;
      }
      if (op === 'move') {
        const fromPath = toDot(from);
        const { location: fromLocation } = extract(fromPath);
        const renameAt = Math.max(pathIndex.locate(fromLocation), pathIndex.locate(location));
        const update = updates[renameAt] || {};
        update.$rename = { ...(update.$rename || {}), [fromPath]: fullPath };
        updates.splice(renameAt, 1, update);
        pathIndex.locate(fromLocation, renameAt + 1);
        pathIndex.locate(location, renameAt + 1);
        return updates;
      }
      throw new Error(`Unsupported Operation! op = ${op}.`);
    },
    [{}]
  );
}

function fromMergePatch(patch, path) {
  const result = {
    $set: {},
    $unset: {},
  };
  if (patch === null) {
    if (path) result.$unset[path] = 1;
  } else if (typeof patch === 'object' && !Array.isArray(patch) && !('_bsontype' in patch)) {
    Object.entries(patch).forEach(([key, val]) => {
      const { $set, $unset } = fromMergePatch(val, `${path ? `${path}.` : ''}${key}`);
      result.$set = Object.entries($set || {}).reduce((acc, [k, v]) => {
        acc[k] = v;
        return acc;
      }, result.$set);
      result.$unset = Object.entries($unset || {}).reduce((acc, [k, v]) => {
        acc[k] = v;
        return acc;
      }, result.$unset);
    });
  } else if (path) {
    result.$set[path] = patch;
  }
  if (Object.keys(result.$set).length === 0) delete result.$set;
  if (Object.keys(result.$unset).length === 0) delete result.$unset;
  return result;
}

function toMongoUpdate(patches) {
  if (!patches) {
    throw new Error(`Unsupported Value! An array or an object only.`);
  }
  if (Array.isArray(patches)) {
    return fromJSONPatch(patches);
  }
  if (typeof patches === 'object') {
    return [fromMergePatch(patches)];
  }
  throw new Error(`Unsupported Value! An array or an object only.`);
}

module.exports = toMongoUpdate;
