var tape = require('tape');
var fs = require('fs');
var FSC = require('../index.js');
var calls = {};

function testLoader(id, callback) {
    calls[id] = calls[id] || 0;
    calls[id]++;
    if (id === 'err') {
        callback(new Error('Object not found'));
    } else {
        callback(null, new Buffer(JSON.stringify({
            id: id,
            data: 'Hello world!!!'
        })));
    }
}

tape('FSC init', function(assert) {
    assert.throws(function() { FSC(); }, 'throws without loader');
    assert.throws(function() { FSC({filter:true}); }, 'throws with bad filter');
    assert.doesNotThrow(function() { FSC({loader:testLoader}); }, 'ok when passed loader');
    assert.end();
});

tape('get (upstream err)', function(assert) {
    var cachingLoader = FSC({
        cachePath: '/tmp/test-fsc',
        loader: testLoader
    });
    cachingLoader('err', function(err, data) {
        assert.ok(err, 'passes error through');
        assert.equal(calls['err'], 1, 'io for err');
        cachingLoader('err', function(err, data) {
            assert.ok(err, 'passes error through');
            assert.equal(calls['err'], 2, 'io for err');
            assert.end();
        });
    });
});

tape('get (cache io err)', function(assert) {
    try {
        fs.mkdirSync('/tmp/test-fsc-nowrite', 0x555);
    } catch(err) {
        if (err.code !== 'EEXIST') throw err;
    }
    var cachingLoader = FSC({
        cachePath: '/tmp/test-fsc-nowrite',
        loader: testLoader,
        onError: function(err) {
            assert.equal(err.code, 'EACCES');
            assert.end();
        }
    });
    cachingLoader('cache-io-err', function(err, data) {
        assert.ifError(err);
        assert.deepEqual(JSON.parse(data), {
            id: 'cache-io-err',
            data: 'Hello world!!!'
        }, 'check data');
    });
});

tape('get (filter)', function(assert) {
    var cachingLoader = FSC({
        cachePath: '/tmp/test-fsc',
        loader: testLoader,
        filter: function(id) {
            return id !== 'skip';
        }
    });
    skip1();
    function skip1() {
        cachingLoader('skip', function(err, data) {
            assert.ifError(err);
            assert.equal(calls.skip, 1, 'skipped item always does io');
            assert.deepEqual(JSON.parse(data), {
                id: 'skip',
                data: 'Hello world!!!'
            }, 'check data');
            setTimeout(skip2, 250);
        });
    }
    function skip2() {
        cachingLoader('skip', function(err, data) {
            assert.ifError(err);
            assert.equal(calls.skip, 2, 'skipped item always does io');
            assert.deepEqual(JSON.parse(data), {
                id: 'skip',
                data: 'Hello world!!!'
            }, 'check data');
            assert.end();
        });
    }
});

['a', 'b'].forEach(function(id) {
    tape('get ' + id + ' (miss)', function(assert) {
        var key = FSC.toKey('/tmp/test-fsc', id);
        try { 
            fs.unlinkSync(key);
        } catch(err) {
            if (err.code !== 'ENOENT') throw err;
        }

        var cachingLoader = FSC({
            cachePath: '/tmp/test-fsc',
            loader: testLoader,
            filter: function(id) {
                return id !== 'skip';
            }
        });
        assert.equal(calls[id], undefined, 'no io for ' + id);
        cachingLoader(id, function(err, data) {
            assert.ifError(err);
            assert.equal(calls[id], 1, 'first call does io');
            assert.deepEqual(JSON.parse(data), {
                id: id,
                data: 'Hello world!!!'
            }, 'check cached data');
            cachingLoader(id, function(err, data) {
                assert.equal(calls[id], 2, 'loading in quick succession can\'t hit cache');
                assert.deepEqual(JSON.parse(data), {
                    id: id,
                    data: 'Hello world!!!'
                }, 'check cached data');
                setTimeout(assert.end, 250);
            });
        });
    });

    tape('get ' + id + ' (hit)', function(assert) {
        var cachingLoader = FSC({
            cachePath: '/tmp/test-fsc',
            loader: testLoader
        });
        cachingLoader(id, function(err, data) {
            assert.ifError(err);
            assert.equal(calls[id], 2, 'no io for ' + id);
            assert.deepEqual(JSON.parse(data), {
                id: id,
                data: 'Hello world!!!'
            }, 'check cached data');
            assert.end();
        });
    });
});

