var crypto = require('crypto');
var mkdirp = require('mkdirp');
var fs = require('fs');
var path = require('path');
var util = require('util');
var tmpdir = require('os').tmpdir();
var dirCache = {};

module.exports = FSC;
module.exports.get = get;
module.exports.set = set;
module.exports.write = write;
module.exports.ensureDir = ensureDir;
module.exports.toKey = toKey;
module.exports.dirCache = dirCache;
module.exports.encodeCacheBuffer = encodeCacheBuffer;
module.exports.decodeCacheBuffer = decodeCacheBuffer;

function FSC(options) {
    options = options || {};
    options.cachePath = options.cachePath || path.join(tmpdir, 'fs-sharded-cache');
    options.filter = options.filter || function(id) { return true; };
    options.onError = options.onError || function(err) {};
    if (typeof options.loader !== 'function') throw new Error('options.loader must be a loader function');
    if (typeof options.filter !== 'function') throw new Error('options.filter must be a filter function');
    if (typeof options.onError !== 'function') throw new Error('options.onError must be a function');

    var cachePath = options.cachePath;
    var loader = options.loader;
    var filter = options.filter;
    var onError = options.onError;
    var wrapped = function(id, callback) {
        if (!filter(id)) return loader(id, callback);

        var key = toKey(cachePath, id);
        get(id, key, function(err, cached) {
            if (err) return callback(err);
            if (cached) return callback(null, cached);
            loader(id, function(err, data) {
                if (err) return callback(err);

                // don't wait for cache set to run callback
                callback(null, data);

                set(id, key, data, function(err) {
                    if (err) onError(err);
                });
            });
        });
    };
    util.inherits(wrapped, require('events').EventEmitter);
    return wrapped;
}

function toKey(cachePath, id) {
    var hash = crypto.createHash('md5').update(id).digest('hex');
    return path.join(cachePath, hash.substr(0,2), hash.substr(2,2), hash.substr(4,4));
}

function encodeCacheBuffer(id, data) {
    var cacheId = new Buffer(1024);
    cacheId.fill(' ');
    (new Buffer(id)).copy(cacheId);
    return Buffer.concat([cacheId, data]);
}

function decodeCacheBuffer(data) {
    return {
        id: data.slice(0,1024).toString().trim(),
        data: data.slice(1024)
    };
}

function get(id, key, callback) {
    fs.readFile(key, function(err, cached) {
        if (err && err.code !== 'ENOENT') return callback(err);
        if (err) return callback();

        cached = decodeCacheBuffer(cached);

        // Confirm the cached object ID matches that to load.
        // These may not be the same as the murmur hash may
        // lead to collisions.
        if (id !== cached.id) return callback();

        return callback(null, cached.data);
    });
}

function set(id, key, data, callback) {
    ensureDir(path.dirname(key), function(err) {
        if (err) return callback(err);
        write(key, encodeCacheBuffer(id, data), callback && callback);
    });
}

function ensureDir(dir, callback) {
    if (dirCache[dir]) return callback();
    mkdirp(dir, function(err) {
        if (err && err.code !== 'EEXIST') {
            callback(err);
        } else {
            dirCache[dir] = true;
            callback();
        }
    });
}

function write(key, data, callback) {
    fs.writeFile(key + '.tmp', data, function(err) {
        if (err) return callback && callback(err);
        fs.rename(key + '.tmp', key, function(err) {
            if (err && err.code !== 'ENOENT') return callback && callback(err);
            callback && callback();
        });
    });
}

