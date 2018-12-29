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

function toMongoUpdate(patches) {
  const opLoc = {};
  return patches.reduce(
    (updates, patch) => {
      const { op, path, value, from } = patch;
      const { prefix, path: fullPath } = toDot(path);
      opLoc[prefix] = opLoc[prefix] || 0;
      if (!Number.isInteger(opLoc[prefix])) {
        throw new Error('Unsupported Operation! No ops can be applied on removed path.');
      }
      if (op === 'add') {
        const { location, index } = extract(fullPath);
        if (Number.isNaN(index)) {
          const update = updates[opLoc[prefix]] || {};
          update.$set = { ...(update.$set || {}), [fullPath]: value };
          updates.splice(opLoc[prefix], 1, update);
          opLoc[prefix] += 1;
          return updates;
        }
        const pushLoc = `${location}$push`;
        opLoc[pushLoc] = pushLoc in opLoc ? opLoc[pushLoc] : opLoc[prefix] || 0;
        if (!Number.isInteger(opLoc[pushLoc])) {
          throw new Error('Unsupported Operation! No ops can be applied on removed path.');
        }
        const current = updates[opLoc[pushLoc]] || {};
        if (!current.$push || !current.$push[location]) {
          current.$push = { ...(current.$push || {}), [location]: initPush(value, index) };
          updates.splice(opLoc[pushLoc], 1, current);
          opLoc[prefix] = Math.max(opLoc[prefix], opLoc[pushLoc] + 1);
          return updates;
        }
        const backward =
          !('$position' in current.$push[location]) || current.$push[location].$position < 0;
        if ((!backward && (index === '-' || index < 0)) || (backward && index >= 0)) {
          opLoc[pushLoc] = opLoc[prefix] || 0;
          const next = updates[opLoc[pushLoc]] || {};
          next.$push = { ...(next.$push || {}), [location]: initPush(value, index) };
          updates.splice(opLoc[pushLoc], 1, next);
          opLoc[prefix] = Math.max(opLoc[prefix], opLoc[pushLoc] + 1);
          return updates;
        }
        const $position = !('$position' in current.$push[location])
          ? 0
          : Math.abs(current.$push[location].$position);
        const absIndex = index === '-' ? 0 : Math.abs(index);
        const start = absIndex - $position;
        if (start < 0 || start > current.$push[location].$each.length) {
          opLoc[pushLoc] = opLoc[prefix] || 0;
          const next = updates[opLoc[pushLoc]] || {};
          next.$push = { ...(next.$push || {}), [location]: initPush(value, index) };
          updates.splice(opLoc[pushLoc], 1, next);
          opLoc[prefix] = Math.max(opLoc[prefix], opLoc[pushLoc] + 1);
          return updates;
        }
        const $each = backward
          ? current.$push[location].$each.reverse()
          : current.$push[location].$each;
        $each.splice(start, 0, value);
        current.$push[location].$each = backward ? $each.reverse() : $each;
        updates.splice(opLoc[pushLoc], 1, current);
        opLoc[prefix] = Math.max(opLoc[prefix], opLoc[pushLoc] + 1);
        return updates;
      }
      if (op === 'remove') {
        const { location, index } = extract(fullPath);
        const update = updates[opLoc[prefix]] || {};
        if (index === -1 || index === 0) {
          update.$pop = { ...(update.$pop || {}), [location]: index === -1 ? 1 : -1 };
          updates.splice(opLoc[prefix], 1, update);
          opLoc[prefix] += 1;
          return updates;
        }
        if (Number.isNaN(index)) {
          update.$unset = { ...(update.$unset || {}), [fullPath]: 1 };
          updates.splice(opLoc[prefix], 1, update);
          Object.entries(opLoc).reduce((acc, [key, val]) => {
            acc[key] = key.startsWith(prefix) ? '-' : val;
            return acc;
          }, {});
          return updates;
        }
        update.$set = { ...(update.$set || {}), [fullPath]: null };
        updates.splice(opLoc[prefix], 1, update);
        opLoc[prefix] += 1;
        const remove = updates[opLoc[prefix]] || {};
        remove.$pull = { ...(remove.$pull || {}), [location]: null };
        updates.splice(opLoc[prefix], 1, remove);
        opLoc[prefix] += 1;
        return updates;
      }
      if (op === 'replace') {
        const update = updates[opLoc[prefix]] || {};
        if (typeof value === 'string') {
          if (value.startsWith('+') || value.startsWith('-')) {
            const step = parseFloat(value);
            if (!Number.isNaN(step)) {
              update.$inc = { ...(update.$inc || {}), [fullPath]: step };
              updates.splice(opLoc[prefix], 1, update);
              opLoc[prefix] += 1;
              return updates;
            }
          }
          if (value.startsWith('*') || value.startsWith('×')) {
            const step = parseFloat(value.slice(1));
            if (!Number.isNaN(step)) {
              update.$mul = { ...(update.$mul || {}), [fullPath]: step };
              updates.splice(opLoc[prefix], 1, update);
              opLoc[prefix] += 1;
              return updates;
            }
          }
        }
        update.$set = { ...(update.$set || {}), [fullPath]: value };
        updates.splice(opLoc[prefix], 1, update);
        opLoc[prefix] += 1;
        return updates;
      }
      if (op === 'move') {
        const { prefix: fromPrefix, path: fromPath } = toDot(from);
        opLoc[fromPrefix] = opLoc[fromPrefix] || 0;
        if (!Number.isInteger(opLoc[fromPrefix])) {
          throw new Error('Unsupported Operation! No ops can be applied on removed path.');
        }
        opLoc[fromPrefix] = Math.max(opLoc[fromPrefix], opLoc[prefix]);
        const update = updates[opLoc[fromPrefix]] || {};
        update.$rename = { ...(update.$rename || {}), [fromPath]: fullPath };
        updates.splice(opLoc[fromPrefix], 1, update);
        opLoc[prefix] = opLoc[fromPrefix] + 1;
        Object.entries(opLoc).reduce((acc, [key, val]) => {
          acc[key] = key.startsWith(fromPrefix) ? '-' : val;
          return acc;
        }, {});
        return updates;
      }
      throw new Error(`Unsupported Operation! op = ${op}`);
    },
    [{}]
  );
}

module.exports = toMongoUpdate;
