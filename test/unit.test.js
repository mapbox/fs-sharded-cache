var tape = require('tape');
var fs = require('fs');
var FSC = require('../index.js');

tape('toKey', function(assert) {
    assert.equal(FSC.toKey('/tmp/test-fsc', 'http://www.example.com/foobar'), '/tmp/test-fsc/7e/34/db8e', 'generates key for id');
    for (var i = 0; i < 100; i++) {
        var key = FSC.toKey('/tmp/test-fsc', Math.random().toString());
        if (!(/^\/tmp\/test-fsc\/[0-f]{2}\/[0-f]{2}\/[0-f]{4}$/).test(key)) {
            assert.fail('key: ' + key + ' does not match expected format');
        }
    }
    assert.end();
});

tape('ensureDir (uncached)', function(assert) {
    try {
        fs.rmdirSync('/tmp/test-fsc/00');
    } catch(err) {
        if (err.code !== 'ENOTDIR' && err.code !== 'ENOENT') throw err;
    }
    FSC.ensureDir('/tmp/test-fsc/00', function(err) {
        assert.ifError(err);
        assert.equal(fs.existsSync('/tmp/test-fsc/00'), true, 'ensureDir creates uncached dir');
        assert.end();
    });
});

tape('ensureDir (cached)', function(assert) {
    try {
        fs.rmdirSync('/tmp/test-fsc/ff');
    } catch(err) {
        if (err.code !== 'ENOTDIR' && err.code !== 'ENOENT') throw err;
    }
    FSC.dirCache['/tmp/test-fsc/ff'] = true;
    FSC.ensureDir('/tmp/test-fsc/ff', function(err) {
        assert.ifError(err);
        assert.equal(fs.existsSync('/tmp/test-fsc/ff'), false, 'ensureDir does not attempt to create cached dir');
        assert.end();
    });
});

tape('write', function(assert) {
    FSC.write('/tmp/test-fsc/test-write', new Buffer('Hello world'), function(err) {
        assert.ifError(err);
        assert.equal(fs.existsSync('/tmp/test-fsc/test-write'), true, 'writes buffer to disk');
        assert.end();
    });
});

tape('encodeCacheBuffer/decodeCacheBuffer', function(assert) {
    var encoded = FSC.encodeCacheBuffer('http://www.example.com/a.json', new Buffer(JSON.stringify({id:'a'})));
    assert.equal(encoded.length, 1034, 'length = 1034');
    assert.deepEqual(FSC.decodeCacheBuffer(encoded), {
        id: 'http://www.example.com/a.json',
        data: new Buffer(JSON.stringify({id:'a'}))
    }, 'roundtrips decode');
    assert.end();
});

tape('encodeCacheBuffer/decodeCacheBuffer (big id)', function(assert) {
    encoded = FSC.encodeCacheBuffer((new Array(4000)).join('x'), new Buffer(JSON.stringify({id:'a'})));
    assert.equal(encoded.length, 1034, 'length = 1034');
    assert.deepEqual(FSC.decodeCacheBuffer(encoded), {
        id: (new Array(1025)).join('x'),
        data: new Buffer(JSON.stringify({id:'a'}))
    }, 'roundtrips decode');

    assert.end();
});

tape('get (unset)', function(assert) {
    FSC.get('id1', __dirname + '/does-not-exist', function(err, data) {
        assert.ifError(err);
        assert.deepEqual(data, undefined, 'no data for unset cache');
        assert.end();
    });
});

tape('get (id mismatch)', function(assert) {
    FSC.get('id1', __dirname + '/data/get', function(err, data) {
        assert.ifError(err);
        assert.deepEqual(data, undefined, 'no data for id mismatch');
        assert.end();
    });
});

tape('get (good)', function(assert) {
    FSC.get('http://www.example.com/a.json', __dirname + '/data/get', function(err, data) {
        assert.ifError(err);
        assert.deepEqual(data, new Buffer(JSON.stringify({id:'a'})), 'cached data');
        assert.end();
    });
});

tape('set', function(assert) {
    try {
        fs.unlinkSync('/tmp/test-fsc/test-set');
    } catch(err) {
        if (err.code !== 'ENOENT') throw err;
    }
    FSC.set('id1', '/tmp/test-fsc/test-set', new Buffer(JSON.stringify({id:'b'})), function(err) {
        assert.ifError(err);
        var data = fs.readFileSync('/tmp/test-fsc/test-set');
        assert.equal(data.length, 1034, 'cachefile length = 1034');
        assert.end();
    });
});

