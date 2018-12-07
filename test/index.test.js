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

    const expected = {
      $push: {
        name: 'dave',
      },
    };

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

    const expected = {
      $set: {
        'foo/bar~': 'dave',
      },
    };

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

    const expected = {
      $push: {
        name: {
          $each: ['dave'],
          $position: 1,
        },
      },
    };

    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should work with multiple set', () => {
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

    const expected = {
      $push: {
        name: {
          $each: ['dave', 'john', 'bob'],
          $position: 1,
        },
      },
    };

    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should work with multiple adds in reverse position', () => {
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

    const expected = {
      $push: {
        name: { $each: ['john', 'bob', 'dave'], $position: 1 },
      },
    };

    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should work with multiple adds', () => {
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

    const expected = {
      $push: {
        name: { $each: ['dave', 'bob', 'john'] },
      },
    };

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

    const expected = {
      $push: {
        name: { $each: [null, 'bob', null] },
      },
    };

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

    const expected = {
      $push: {
        name: { $each: [null, 'bob', null], $position: 1 },
      },
    };

    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should work with remove', () => {
    const patches = [
      {
        op: 'remove',
        path: '/name',
        value: 'dave',
      },
    ];

    const expected = {
      $unset: {
        name: 1,
      },
    };

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

    const expected = {
      $set: {
        name: 'dave',
      },
    };

    assert.deepEqual(toMongodb(patches), expected);
  });

  it('should work with test', () => {
    const patches = [
      {
        op: 'test',
        path: '/name',
        value: 'dave',
      },
    ];

    const expected = {};

    assert.deepEqual(toMongodb(patches), expected);
  });

  it('blow up on adds with non contiguous positions', () => {
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

    chai
      .expect(() => {
        toMongodb(patches);
      })
      .to.throw('Unsupported Operation! can use add op only with contiguous positions');
  });

  it('blow up on adds with mixed position 1', () => {
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
      .to.throw("Unsupported Operation! can't use add op with mixed positions");
  });

  it('blow up on adds with mixed position 2', () => {
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
      .to.throw("Unsupported Operation! can't use add op with mixed positions");
  });

  it('should blow up on add without position', () => {
    const patches = [
      {
        op: 'add',
        path: '/name',
        value: 'dave',
      },
    ];

    chai
      .expect(() => {
        toMongodb(patches);
      })
      .to.throw("Unsupported Operation! can't use add op without position");
  });

  it('should blow up on move', () => {
    const patches = [
      {
        op: 'move',
        path: '/name',
        from: '/old_name',
      },
    ];

    chai
      .expect(() => {
        toMongodb(patches);
      })
      .to.throw('Unsupported Operation! op = move');
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
});
