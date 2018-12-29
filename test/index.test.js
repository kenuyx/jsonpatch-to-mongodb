/* eslint-env mocha */

const assert = require('assert');
const chai = require('chai');
const toMongodb = require('../');

describe('jsonpatch to mongodb', () => {
  it('should work with single add', () => {
    const patches = [
      {
        op: 'add',
        path: '/name/-',
        value: 'dave',
      },
    ];

    const expected = [
      {
        $push: {
          name: {
            $each: ['dave'],
          },
        },
      },
    ];

    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should work with escaped characters', () => {
    const patches = [
      {
        op: 'replace',
        path: '/foo~1bar~0',
        value: 'dave',
      },
    ];

    const expected = [
      {
        $set: {
          'foo/bar~': 'dave',
        },
      },
    ];

    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should work with array set', () => {
    const patches = [
      {
        op: 'add',
        path: '/name/1',
        value: 'dave',
      },
    ];

    const expected = [
      {
        $push: {
          name: {
            $each: ['dave'],
            $position: 1,
          },
        },
      },
    ];

    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should work as replace on add without position', () => {
    const patches = [
      {
        op: 'add',
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

  it('should work with multiple adds 1', () => {
    const patches = [
      {
        op: 'add',
        path: '/name/1',
        value: 'dave',
      },
      {
        op: 'add',
        path: '/name/2',
        value: 'bob',
      },
      {
        op: 'add',
        path: '/name/2',
        value: 'john',
      },
    ];

    const expected = [
      {
        $push: {
          name: {
            $each: ['dave', 'john', 'bob'],
            $position: 1,
          },
        },
      },
    ];

    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should work with multiple adds 2', () => {
    const patches = [
      {
        op: 'add',
        path: '/name/1',
        value: 'dave',
      },
      {
        op: 'add',
        path: '/name/1',
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
          name: { $each: ['john', 'bob', 'dave'], $position: 1 },
        },
      },
    ];

    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should work with multiple adds 3', () => {
    const patches = [
      {
        op: 'add',
        path: '/name/-',
        value: 'dave',
      },
      {
        op: 'add',
        path: '/name/-',
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
          name: { $each: ['dave', 'bob', 'john'] },
        },
      },
    ];

    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should work with multiple adds with some null at the end', () => {
    const patches = [
      {
        op: 'add',
        path: '/name/-',
        value: null,
      },
      {
        op: 'add',
        path: '/name/-',
        value: 'bob',
      },
      {
        op: 'add',
        path: '/name/-',
        value: null,
      },
    ];

    const expected = [
      {
        $push: {
          name: { $each: [null, 'bob', null] },
        },
      },
    ];

    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should work with multiple adds with some null and position', () => {
    const patches = [
      {
        op: 'add',
        path: '/name/1',
        value: null,
      },
      {
        op: 'add',
        path: '/name/1',
        value: 'bob',
      },
      {
        op: 'add',
        path: '/name/1',
        value: null,
      },
    ];

    const expected = [
      {
        $push: {
          name: { $each: [null, 'bob', null], $position: 1 },
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

  it('blow up on adds with mixed directions 1', () => {
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

    chai
      .expect(() => {
        toMongodb(patches);
      })
      .to.throw('Unsupported Operation! Can only use add op starting from the same direction.');
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

    chai
      .expect(() => {
        toMongodb(patches);
      })
      .to.throw('Unsupported Operation! Can only use add op starting from the same direction.');
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
