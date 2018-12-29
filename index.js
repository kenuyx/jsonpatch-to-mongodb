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
          update.$set = update.$set || {};
          update.$set[fullPath] = value;
          updates.splice(opLoc[prefix], 1, update);
          opLoc[prefix] += 1;
        } else {
          const pushLoc = `${location}$push`;
          opLoc[pushLoc] = pushLoc in opLoc ? opLoc[pushLoc] : opLoc[prefix] || 0;
          if (!Number.isInteger(opLoc[pushLoc])) {
            throw new Error('Unsupported Operation! No ops can be applied on removed path.');
          }
          const update = updates[opLoc[pushLoc]] || {};
          update.$push = update.$push || {};
          if (!update.$push[location]) {
            update.$push[location] = {
              $each: [value],
            };
            if (index !== '-') {
              update.$push[location].$position = index;
            }
          } else {
            const backward =
              !('$position' in update.$push[location]) || update.$push[location].$position < 0;
            if ((!backward && (index === '-' || index < 0)) || (backward && index >= 0)) {
              throw new Error(
                'Unsupported Operation! Can only use add op starting from the same direction.'
              );
            }
            const $position = !('$position' in update.$push[location])
              ? 0
              : Math.abs(update.$push[location].$position);
            const absIndex = index === '-' ? 0 : Math.abs(index);
            const start = absIndex - $position;
            if (start < 0 || start > update.$push[location].$each.length) {
              throw new Error(
                'Unsupported Operation! Can use add op only with contiguous positions.'
              );
            }
            const $each = backward
              ? update.$push[location].$each.reverse()
              : update.$push[location].$each;
            $each.splice(start, 0, value);
            update.$push[location].$each = backward ? $each.reverse() : $each;
          }
          updates.splice(opLoc[pushLoc], 1, update);
          if (opLoc[prefix] < opLoc[pushLoc] + 1) {
            opLoc[prefix] = opLoc[pushLoc] + 1;
          }
        }
        return updates;
      }
      if (op === 'remove') {
        const { location, index } = extract(fullPath);
        const update = updates[opLoc[prefix]] || {};
        if (index === -1 || index === 0) {
          update.$pop = update.$pop || {};
          update.$pop[location] = index === -1 ? 1 : -1;
          updates.splice(opLoc[prefix], 1, update);
          opLoc[prefix] += 1;
          return updates;
        }
        if (Number.isNaN(index)) {
          update.$unset = update.$unset || {};
          update.$unset[fullPath] = 1;
          updates.splice(opLoc[prefix], 1, update);
          Object.keys(opLoc).forEach(key => {
            if (key.startsWith(prefix)) {
              opLoc[key] = '-';
            }
          });
          return updates;
        }
        update.$set = update.$set || {};
        update.$set[fullPath] = null;
        updates.splice(opLoc[prefix], 1, update);
        opLoc[prefix] += 1;
        const remove = updates[opLoc[prefix]] || {};
        remove.$pull = remove.$pull || {};
        remove.$pull[location] = null;
        updates.splice(opLoc[prefix], 1, remove);
        opLoc[prefix] += 1;
        return updates;
      }
      if (op === 'replace') {
        const update = updates[opLoc[prefix]] || {};
        if (typeof value === 'string' && (value.startsWith('+') || value.startsWith('-'))) {
          update.$inc = update.$inc || {};
          const step = parseFloat(value);
          if (Number.isNaN(step)) {
            throw new Error('Unsupported Operation! Can only increments with number.');
          }
          update.$inc[fullPath] = step;
          updates.splice(opLoc[prefix], 1, update);
        } else if (typeof value === 'string' && value.startsWith('×')) {
          update.$mul = update.$mul || {};
          const step = parseFloat(value.slice(1));
          if (Number.isNaN(step)) {
            throw new Error('Unsupported Operation! Can only multiplies with number.');
          }
          update.$mul[fullPath] = step;
          updates.splice(opLoc[prefix], 1, update);
        } else {
          update.$set = update.$set || {};
          update.$set[fullPath] = value;
          updates.splice(opLoc[prefix], 1, update);
        }
        opLoc[prefix] += 1;
        return updates;
      }
      if (op === 'move') {
        const { prefix: fromPrefix, path: fromPath } = toDot(from);
        opLoc[fromPrefix] = opLoc[fromPrefix] || 0;
        if (!Number.isInteger(opLoc[fromPrefix])) {
          throw new Error('Unsupported Operation! No ops can be applied on removed path.');
        }
        if (opLoc[fromPrefix] < opLoc[prefix]) {
          opLoc[fromPrefix] = opLoc[prefix];
        }
        const update = updates[opLoc[fromPrefix]] || {};
        update.$rename = update.$rename || {};
        update.$rename[fromPath] = fullPath;
        updates.splice(opLoc[fromPrefix], 1, update);
        opLoc[prefix] = opLoc[fromPrefix] + 1;
        Object.keys(opLoc).forEach(key => {
          if (key.startsWith(fromPrefix)) {
            opLoc[key] = '-';
          }
        });
        return updates;
      }
      throw new Error(`Unsupported Operation! op = ${op}`);
    },
    [{}]
  );
}

module.exports = toMongoUpdate;
