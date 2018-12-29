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
    const patches = [{ op: 'add', path: '/name/-', value: 'dave' }];
    const expected = [{ $push: { name: { $each: ['dave'] } } }];
    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should return `$push` with `$position` when path in op `add` ends with integer', () => {
    const patches = [{ op: 'add', path: '/name/2', value: 'dave' }];
    const expected = [{ $push: { name: { $each: ['dave'], $position: 2 } } }];
    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should return single `$push` without `$position` when `add`s to the end', () => {
    const patches = [
      { op: 'add', path: '/name/-', value: 'dave' },
      { op: 'add', path: '/name/-', value: 'bob' },
      { op: 'add', path: '/name/-', value: null },
    ];
    const expected = [{ $push: { name: { $each: ['dave', 'bob', null] } } }];
    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should return single `$push` with ordered `$each` when `add`s in continuous positive positions', () => {
    const patches = [
      { op: 'add', path: '/name/1', value: 'dave' },
      { op: 'add', path: '/name/2', value: 'bob' },
      { op: 'add', path: '/name/2', value: 'john' },
    ];
    const expected = [{ $push: { name: { $each: ['dave', 'john', 'bob'], $position: 1 } } }];
    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should return single `$push` with ordered `$each` when `add`s in continuous negative positions', () => {
    const patches = [
      { op: 'add', path: '/name/-', value: 'dave' },
      { op: 'add', path: '/name/-1', value: 'bob' },
      { op: 'add', path: '/name/-1', value: 'john' },
    ];
    const expected = [{ $push: { name: { $each: ['bob', 'john', 'dave'] } } }];
    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should work with multiple adds with non contiguous positions', () => {
    const patches = [
      {
        op: 'add',
        path: '/name/1',
        value: 'bob',
      },
      {
        op: 'add',
        path: '/name/3',
        value: 'john',
      },
    ];

    const expected = [
      {
        $push: {
          name: { $each: ['bob'], $position: 1 },
        },
      },
      {
        $push: {
          name: { $each: ['john'], $position: 3 },
        },
      },
    ];

    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should work with multiple adds with mixed directions 1', () => {
    const patches = [
      {
        op: 'add',
        path: '/name/1',
        value: 'bob',
      },
      {
        op: 'add',
        path: '/name/-',
        value: 'john',
      },
    ];

    const expected = [
      {
        $push: {
          name: { $each: ['bob'], $position: 1 },
        },
      },
      {
        $push: {
          name: { $each: ['john'] },
        },
      },
    ];

    assert.deepEqual(toMongodb(patches), expected);
  });

  it('blow up on adds with mixed directions 2', () => {
    const patches = [
      {
        op: 'add',
        path: '/name/-',
        value: 'bob',
      },
      {
        op: 'add',
        path: '/name/1',
        value: 'john',
      },
    ];

    const expected = [
      {
        $push: {
          name: { $each: ['bob'] },
        },
      },
      {
        $push: {
          name: { $each: ['john'], $position: 1 },
        },
      },
    ];

    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should work with remove', () => {
    const patches = [
      {
        op: 'remove',
        path: '/name',
      },
    ];

    const expected = [
      {
        $unset: {
          name: 1,
        },
      },
    ];

    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should work with remove on array 1', () => {
    const patches = [
      {
        op: 'remove',
        path: '/name/-1',
      },
    ];

    const expected = [
      {
        $pop: {
          name: 1,
        },
      },
    ];

    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should work with remove on array 2', () => {
    const patches = [
      {
        op: 'remove',
        path: '/name/0',
      },
    ];

    const expected = [
      {
        $pop: {
          name: -1,
        },
      },
    ];

    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should work with remove on array 3', () => {
    const patches = [
      {
        op: 'remove',
        path: '/name/2',
      },
    ];

    const expected = [
      {
        $set: {
          'name.2': null,
        },
      },
      {
        $pull: {
          name: null,
        },
      },
    ];

    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should work with remove on array 4', () => {
    const patches = [
      {
        op: 'remove',
        path: '/name/2',
      },
    ];

    const expected = [
      {
        $set: {
          'name.2': null,
        },
      },
      {
        $pull: {
          name: null,
        },
      },
    ];

    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should work with replace', () => {
    const patches = [
      {
        op: 'replace',
        path: '/name',
        value: 'dave',
      },
    ];

    const expected = [
      {
        $set: {
          name: 'dave',
        },
      },
    ];

    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should work with move', () => {
    const patches = [
      {
        op: 'move',
        path: '/to',
        from: '/from',
      },
    ];

    const expected = [
      {
        $rename: {
          from: 'to',
        },
      },
    ];

    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should work with mixed operations', () => {
    const patches = [
      {
        op: 'add',
        path: '/name/1',
        value: 'bob',
      },
      {
        op: 'replace',
        path: '/name',
        value: ['dave'],
      },
      {
        op: 'move',
        path: '/nick',
        from: '/name',
      },
      {
        op: 'remove',
        path: '/nick',
      },
    ];

    const expected = [
      {
        $push: {
          name: { $each: ['bob'], $position: 1 },
        },
      },
      {
        $set: {
          name: ['dave'],
        },
      },
      {
        $rename: {
          name: 'nick',
        },
      },
      {
        $unset: {
          nick: 1,
        },
      },
    ];

    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should blow up on copy', () => {
    const patches = [
      {
        op: 'copy',
        path: '/name',
        from: '/old_name',
      },
    ];

    chai
      .expect(() => {
        toMongodb(patches);
      })
      .to.throw('Unsupported Operation! op = copy');
  });

  it('should blow up on test', () => {
    const patches = [
      {
        op: 'test',
        path: '/name',
        value: 'dave',
      },
    ];

    chai
      .expect(() => {
        toMongodb(patches);
      })
      .to.throw('Unsupported Operation! op = test');
  });
});
