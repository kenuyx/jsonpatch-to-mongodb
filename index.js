function toDot(path) {
  return path
    .replace(/^\//, '')
    .replace(/\//g, '.')
    .replace(/~1/g, '/')
    .replace(/~0/g, '~');
}

function extract(path) {
  const dotPath = toDot(path);
  const components = dotPath.split('.');
  const last = components.pop();
  return {
    dotPath,
    location: components.join('.'),
    index: last === '-' ? '-' : parseInt(last, 10),
  };
}

function toMongoUpdate(patches) {
  return patches.reduce((update, patch) => {
    const { op, path, value } = patch;
    if (op === 'add') {
      const { dotPath, location, index } = extract(path);
      if (Number.isNaN(index)) {
        const $set = update.$set || {};
        $set[dotPath] = value;
        return {
          ...update,
          $set,
        };
      }
      const $push = update.$push || {};
      if (!$push[location]) {
        $push[location] = {
          $each: [value],
        };
        if (index !== '-') {
          $push[location].$position = index;
        }
      } else {
        const backward = !('$position' in $push[location]) || $push[location].$position < 0;
        if ((!backward && (index === '-' || index < 0)) || (backward && index >= 0)) {
          throw new Error(
            'Unsupported Operation! Can only use add op starting from the same direction.'
          );
        }
        const $position = !('$position' in $push[location])
          ? 0
          : Math.abs($push[location].$position);
        const absIndex = index === '-' ? 0 : Math.abs(index);
        const start = absIndex - $position;
        if (start < 0 || start > $push[location].$each.length) {
          throw new Error('Unsupported Operation! Can use add op only with contiguous positions.');
        }
        const $each = backward ? $push[location].$each.reverse() : $push[location].$each;
        $each.splice(start, 0, value);
        $push[location].$each = backward ? $each.reverse() : $each;
      }
      return {
        ...update,
        $push,
      };
    }
    if (op === 'remove') {
      const { dotPath, location, index } = extract(path);
      if (index === '-' || index === 0) {
        const $pop = update.$pop || {};
        $pop[location] = index === '-' ? 1 : -1;
        return {
          ...update,
          $pop,
        };
      }
      if (Number.isNaN(index)) {
        const $unset = update.$unset || {};
        $unset[dotPath] = 1;
        return {
          ...update,
          $unset,
        };
      }
      const $set = update.$set || {};
      $set[dotPath] = null;
      const $pull = update.$pull || {};
      $pull[location] = null;
      return {
        ...update,
        $set,
        $pull,
      };
    }
    if (op === 'replace') {
      const $set = update.$set || {};
      $set[toDot(path)] = value;
      return {
        ...update,
        $set,
      };
    }
    throw new Error(`Unsupported Operation! op = ${op}`);
  }, {});
}

module.exports = toMongoUpdate;
