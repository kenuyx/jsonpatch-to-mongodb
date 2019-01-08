/* eslint-env mocha */

const assert = require('assert');
const chai = require('chai');
const toMongodb = require('../');

describe('jsonpatch to mongodb', () => {
  it('should return unescaped path when path contains escaped characters', () => {
    const patches = [{ op: 'replace', path: '/foo~1bar~0', value: 'dave' }];
    const expected = [{ $set: { 'foo/bar~': 'dave' } }];
    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should return `$set` when path in op `add` does not end with `-` or integer', () => {
    const patches = [{ op: 'add', path: '/name/first', value: 'dave' }];
    const expected = [{ $set: { 'name.first': 'dave' } }];
    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should return `$push` without `$position` when path in op `add` ends with `-`', () => {
    const patches = [{ op: 'add', path: '/friends/-', value: 'dave' }];
    const expected = [{ $push: { friends: { $each: ['dave'] } } }];
    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should return `$push` with `$position` when path in op `add` ends with integer', () => {
    const patches = [{ op: 'add', path: '/friends/2', value: 'dave' }];
    const expected = [{ $push: { friends: { $each: ['dave'], $position: 2 } } }];
    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should return single `$push` without `$position` when `add`s to the end', () => {
    const patches = [
      { op: 'add', path: '/friends/-', value: 'dave' },
      { op: 'add', path: '/friends/-', value: 'bob' },
      { op: 'add', path: '/friends/-', value: null },
    ];
    const expected = [{ $push: { friends: { $each: ['dave', 'bob', null] } } }];
    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should return single `$push` with ordered `$each` when `add`s in continuous positive positions', () => {
    const patches = [
      { op: 'add', path: '/friends/1', value: 'dave' },
      { op: 'add', path: '/friends/2', value: 'bob' },
      { op: 'add', path: '/friends/2', value: 'john' },
    ];
    const expected = [{ $push: { friends: { $each: ['dave', 'john', 'bob'], $position: 1 } } }];
    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should return single `$push` with ordered `$each` when `add`s in continuous negative positions', () => {
    const patches = [
      { op: 'add', path: '/friends/-', value: 'dave' },
      { op: 'add', path: '/friends/-1', value: 'bob' },
      { op: 'add', path: '/friends/-1', value: 'john' },
    ];
    const expected = [{ $push: { friends: { $each: ['bob', 'john', 'dave'] } } }];
    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should return a `$push` list when `add`s in non contiguous positive positions', () => {
    const patches = [
      { op: 'add', path: '/friends/1', value: 'bob' },
      { op: 'add', path: '/friends/4', value: 'john' },
      { op: 'add', path: '/friends/3', value: 'dave' },
    ];
    const expected = [
      { $push: { friends: { $each: ['bob'], $position: 1 } } },
      { $push: { friends: { $each: ['john'], $position: 4 } } },
      { $push: { friends: { $each: ['dave'], $position: 3 } } },
    ];
    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should return a `$push` list when `add`s in non contiguous negative positions', () => {
    const patches = [
      { op: 'add', path: '/friends/-', value: 'bob' },
      { op: 'add', path: '/friends/-2', value: 'john' },
      { op: 'add', path: '/friends/-1', value: 'dave' },
    ];
    const expected = [
      { $push: { friends: { $each: ['bob'] } } },
      { $push: { friends: { $each: ['john'], $position: -2 } } },
      { $push: { friends: { $each: ['dave'], $position: -1 } } },
    ];
    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should return a `$push` list when `add`s in mixed directions', () => {
    const patches = [
      { op: 'add', path: '/friends/0', value: 'bob' },
      { op: 'add', path: '/friends/-', value: 'john' },
      { op: 'add', path: '/friends/-1', value: 'dave' },
      { op: 'add', path: '/friends/1', value: null },
    ];
    const expected = [
      { $push: { friends: { $each: ['bob'], $position: 0 } } },
      { $push: { friends: { $each: ['dave', 'john'] } } },
      { $push: { friends: { $each: [null], $position: 1 } } },
    ];
    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should return `$pop` when path in `remove` ends with 0 or -1', () => {
    const patches = [{ op: 'remove', path: '/friends/0' }, { op: 'remove', path: '/friends/-1' }];
    const expected = [{ $pop: { friends: -1 } }, { $pop: { friends: 1 } }];
    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should return `$unset` when path in `remove` does not end with index', () => {
    const patches = [{ op: 'remove', path: '/friends' }];
    const expected = [{ $unset: { friends: 1 } }];
    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should return `$set` and `$pull` when path in `remove` ends with index other than 0 and -1', () => {
    const patches = [{ op: 'remove', path: '/friends/2' }, { op: 'remove', path: '/friends/-2' }];
    const expected = [
      { $set: { 'friends.2': null } },
      { $pull: { friends: null } },
      { $set: { 'friends.-2': null } },
      { $pull: { friends: null } },
    ];
    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should return `$inc` when value in `replace` starts with + or -', () => {
    const patches = [
      { op: 'replace', path: '/age', value: '+1' },
      { op: 'replace', path: '/weight', value: '-1.5' },
    ];
    const expected = [{ $inc: { age: 1, weight: -1.5 } }];
    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should return `$mul` when value in `replace` starts with * or ×', () => {
    const patches = [
      { op: 'replace', path: '/wealth', value: '*1.5' },
      { op: 'replace', path: '/weight', value: '×2' },
      { op: 'replace', path: '/wealth', value: '×-1' },
    ];
    const expected = [{ $mul: { wealth: 1.5, weight: 2 } }, { $mul: { wealth: -1 } }];
    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should return `$set` when value in `replace` dose not start with +/-/*/×', () => {
    const patches = [
      { op: 'replace', path: '/name/first', value: 'dave' },
      { op: 'replace', path: '/friends/0', value: 'bob' },
      { op: 'replace', path: '/friends/-1', value: 'john' },
      { op: 'replace', path: '/age', value: 21 },
    ];
    const expected = [
      { $set: { 'name.first': 'dave', 'friends.0': 'bob', age: 21 } },
      { $set: { 'friends.-1': 'john' } },
    ];
    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should return `$rename` when op is `move`', () => {
    const patches = [
      { op: 'move', path: '/name/last', from: '/name/first' },
      { op: 'add', path: '/name/first', value: 'dave' },
    ];
    const expected = [
      { $rename: { 'name.first': 'name.last' } },
      { $set: { 'name.first': 'dave' } },
    ];
    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should return `$set` and `$unset` when patch is an object', () => {
    const patch = {
      name: { first: 'dave', last: null },
      age: {
        _bsontype: 'integer',
        $number: 10,
      },
      wealth: null,
      contact: {
        address: {
          province: 'Shanghai',
          city: 'Shanghai',
          street: null,
        },
        mobile: '123456',
        valid: true,
      },
    };
    const expected = [
      {
        $set: {
          'name.first': 'dave',
          age: {
            _bsontype: 'integer',
            $number: 10,
          },
          'contact.address.province': 'Shanghai',
          'contact.address.city': 'Shanghai',
          'contact.mobile': '123456',
          'contact.valid': true,
        },
        $unset: {
          'name.last': 1,
          wealth: 1,
          'contact.address.street': 1,
        },
      },
    ];
    assert.deepEqual(toMongodb(patch), expected);
  });

  it('should blow up when op is `copy`', () => {
    const patches = [{ op: 'copy', path: '/name', from: '/old_name' }];
    chai
      .expect(() => {
        toMongodb(patches);
      })
      .to.throw('Unsupported Operation! op = copy.');
  });

  it('should blow up when op is `test`', () => {
    const patches = [{ op: 'test', path: '/name', value: 'dave' }];
    chai
      .expect(() => {
        toMongodb(patches);
      })
      .to.throw('Unsupported Operation! op = test.');
  });
});
