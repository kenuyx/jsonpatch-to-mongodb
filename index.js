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

function toMongoUpdate(patches, delMark) {
  return patches.reduce(
    (updates, patch) => {
      const { op, path, value } = patch;
      if (op === 'add') {
        const [update, ...rest] = updates;
        const { dotPath, location, index } = extract(path);
        if (Number.isNaN(index)) {
          const $set = update.$set || {};
          $set[dotPath] = value;
          return [
            {
              ...update,
              $set,
            },
            ...rest,
          ];
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
            throw new Error(
              'Unsupported Operation! Can use add op only with contiguous positions.'
            );
          }
          const $each = backward ? $push[location].$each.reverse() : $push[location].$each;
          $each.splice(start, 0, value);
          $push[location].$each = backward ? $each.reverse() : $each;
        }
        return [
          {
            ...update,
            $push,
          },
          ...rest,
        ];
      }
      if (op === 'remove') {
        const [update, ...rest] = updates;
        const { dotPath, location, index } = extract(path);
        if (index === -1 || index === 0) {
          const $pop = update.$pop || {};
          $pop[location] = index === -1 ? 1 : -1;
          return [
            {
              ...update,
              $pop,
            },
            ...rest,
          ];
        }
        if (Number.isNaN(index)) {
          const $unset = update.$unset || {};
          $unset[dotPath] = 1;
          return [
            {
              ...update,
              $unset,
            },
            ...rest,
          ];
        }
        const $set = update.$set || {};
        $set[dotPath] = delMark || null;
        const last = rest.length > 0 ? rest[0] : {};
        const $pull = last.$pull || {};
        $pull[location] = delMark || null;
        last.$pull = $pull;
        return [
          {
            ...update,
            $set,
          },
          last,
          ...rest.slice(1),
        ];
      }
      if (op === 'replace') {
        const [update, ...rest] = updates;
        const $set = update.$set || {};
        $set[toDot(path)] = value;
        return [
          {
            ...update,
            $set,
          },
          ...rest,
        ];
      }
      throw new Error(`Unsupported Operation! op = ${op}`);
    },
    [{}]
  );
}

module.exports = toMongoUpdate;
