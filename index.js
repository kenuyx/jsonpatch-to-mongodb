function toDot(path) {
  const dotPath = path
    .replace(/^\//, '')
    .replace(/\//g, '.')
    .replace(/~1/g, '/')
    .replace(/~0/g, '~');
  return { prefix: dotPath.split('.')[0], path: dotPath };
}

function extract(dotPath) {
  const components = dotPath.split('.');
  const last = components.pop();
  return {
    location: components.join('.'),
    index: last === '-' ? '-' : parseInt(last, 10),
  };
}

function initPush(value, index) {
  const result = { $each: [value] };
  if (index !== '-') {
    result.$position = index;
  }
  return result;
}

function fromJSONPatch(patches) {
  const startOf = {};
  return patches.reduce(
    (updates, patch) => {
      const { op, path, value, from } = patch;
      const { prefix, path: fullPath } = toDot(path);
      startOf[prefix] = startOf[prefix] || 0;
      if (op === 'add') {
        const { location, index } = extract(fullPath);
        if (Number.isNaN(index)) {
          const update = updates[startOf[prefix]] || {};
          update.$set = { ...(update.$set || {}), [fullPath]: value };
          updates.splice(startOf[prefix], 1, update);
          startOf[prefix] += 1;
          return updates;
        }
        const pushLoc = `${location}$push`;
        startOf[pushLoc] = pushLoc in startOf ? startOf[pushLoc] : [startOf[prefix] || 0];
        const current = updates[startOf[pushLoc]] || {};
        if (!current.$push || !current.$push[location]) {
          current.$push = { ...(current.$push || {}), [location]: initPush(value, index) };
          updates.splice(startOf[pushLoc], 1, current);
          startOf[prefix] = Math.max(startOf[prefix], startOf[pushLoc] + 1);
          return updates;
        }
        const backward =
          !('$position' in current.$push[location]) || current.$push[location].$position < 0;
        if ((!backward && (index === '-' || index < 0)) || (backward && index >= 0)) {
          startOf[pushLoc] = startOf[prefix] || 0;
          const next = updates[startOf[pushLoc]] || {};
          next.$push = { ...(next.$push || {}), [location]: initPush(value, index) };
          updates.splice(startOf[pushLoc], 1, next);
          startOf[prefix] = Math.max(startOf[prefix], startOf[pushLoc] + 1);
          return updates;
        }
        const $position = !('$position' in current.$push[location])
          ? 0
          : Math.abs(current.$push[location].$position);
        const absIndex = index === '-' ? 0 : Math.abs(index);
        const start = absIndex - $position;
        if (start < 0 || start > current.$push[location].$each.length) {
          startOf[pushLoc] = startOf[prefix] || 0;
          const next = updates[startOf[pushLoc]] || {};
          next.$push = { ...(next.$push || {}), [location]: initPush(value, index) };
          updates.splice(startOf[pushLoc], 1, next);
          startOf[prefix] = Math.max(startOf[prefix], startOf[pushLoc] + 1);
          return updates;
        }
        const $each = backward
          ? current.$push[location].$each.reverse()
          : current.$push[location].$each;
        $each.splice(start, 0, value);
        current.$push[location].$each = backward ? $each.reverse() : $each;
        updates.splice(startOf[pushLoc], 1, current);
        startOf[prefix] = Math.max(startOf[prefix], startOf[pushLoc] + 1);
        return updates;
      }
      if (op === 'remove') {
        const { location, index } = extract(fullPath);
        const update = updates[startOf[prefix]] || {};
        if (Number.isNaN(index)) {
          update.$unset = { ...(update.$unset || {}), [fullPath]: 1 };
          updates.splice(startOf[prefix], 1, update);
          startOf[prefix] += 1;
          return updates;
        }
        if (index === -1 || index === 0) {
          update.$pop = { ...(update.$pop || {}), [location]: index === -1 ? 1 : -1 };
          updates.splice(startOf[prefix], 1, update);
          startOf[prefix] += 1;
          return updates;
        }
        update.$set = { ...(update.$set || {}), [fullPath]: null };
        updates.splice(startOf[prefix], 1, update);
        startOf[prefix] += 1;
        const remove = updates[startOf[prefix]] || {};
        remove.$pull = { ...(remove.$pull || {}), [location]: null };
        updates.splice(startOf[prefix], 1, remove);
        startOf[prefix] += 1;
        return updates;
      }
      if (op === 'replace') {
        const update = updates[startOf[prefix]] || {};
        if (typeof value === 'string') {
          if (value.startsWith('+') || value.startsWith('-')) {
            const step = parseFloat(value);
            if (!Number.isNaN(step)) {
              update.$inc = { ...(update.$inc || {}), [fullPath]: step };
              updates.splice(startOf[prefix], 1, update);
              startOf[prefix] += 1;
              return updates;
            }
          }
          if (value.startsWith('*') || value.startsWith('×')) {
            const step = parseFloat(value.slice(1));
            if (!Number.isNaN(step)) {
              update.$mul = { ...(update.$mul || {}), [fullPath]: step };
              updates.splice(startOf[prefix], 1, update);
              startOf[prefix] += 1;
              return updates;
            }
          }
        }
        update.$set = { ...(update.$set || {}), [fullPath]: value };
        updates.splice(startOf[prefix], 1, update);
        startOf[prefix] += 1;
        return updates;
      }
      if (op === 'move') {
        const { prefix: fromPrefix, path: fromPath } = toDot(from);
        startOf[fromPrefix] = startOf[fromPrefix] || 0;
        startOf[fromPrefix] = Math.max(startOf[fromPrefix], startOf[prefix]);
        const update = updates[startOf[fromPrefix]] || {};
        update.$rename = { ...(update.$rename || {}), [fromPath]: fullPath };
        updates.splice(startOf[fromPrefix], 1, update);
        startOf[prefix] = startOf[fromPrefix] + 1;
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
  } else if (typeof patch === 'object' && !('_bsontype' in patch)) {
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
  if (Object.keys(result.$set) === 0) delete result.$set;
  if (Object.keys(result.$unset) === 0) delete result.$unset;
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
    return fromMergePatch(patches);
  }
  throw new Error(`Unsupported Value! An array or an object only.`);
}

module.exports = toMongoUpdate;
