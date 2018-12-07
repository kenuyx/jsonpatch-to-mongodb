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
        return {
          ...update,
          $push,
        };
      }
      // TODO: supports positive/negative/contiguous posotions
      // if (index === '-' && !('$position' in $push[location])) {
      //   $push[location].$each.push(value);
      //   return {
      //     ...update,
      //     $push,
      //   };
      // }
      // if (index !== '-' && '$position' in $push[location]) {
      //   const posDiff =
      //     index > $push[location].$position
      //       ? index - $push[location].$position
      //       : $push[location].$position - index;
      //   if (posDiff > $push[location].$each.length) {
      //     throw new Error('Unsupported Operation! Can only use add op with contiguous positions');
      //   }
      //   $push[location].$each.splice(posDiff, 0, value);
      //   $push[location].$position = Math.min(index, $push[location].$position);
      //   return {
      //     ...update,
      //     $push,
      //   };
      // }
      throw new Error("Unsupported Operation! Can't use add op with mixed positions");
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
