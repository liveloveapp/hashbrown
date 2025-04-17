'use strict';

var Parser = require('jsonparse'),
  through = require('through');

var bufferFrom = Buffer.from && Buffer.from !== Uint8Array.from;

exports.parse = function (path, map) {
  var header, footer;
  var parser = new Parser();
  var stream = through(
    function (chunk) {
      if ('string' === typeof chunk)
        chunk = bufferFrom ? Buffer.from(chunk) : new Buffer(chunk);
      parser.write(chunk);
    },
    function (data) {
      if (data) stream.write(data);
      if (header) stream.emit('header', header);
      if (footer) stream.emit('footer', footer);
      stream.queue(null);
    },
  );

  if ('string' === typeof path)
    path = path.split('.').map(function (e) {
      if (e === '$*') return { emitKey: true };
      else if (e === '*') return true;
      else if (e === '')
        // '..'.split('.') returns an empty string
        return { recurse: true };
      else return e;
    });

  var count = 0,
    _key;
  if (!path || !path.length) path = null;

  parser.onValue = function (value) {
    if (!this.root) stream.root = value;

    if (!path) return;

    var i = 0; // iterates on path
    var j = 0; // iterates on stack
    var emitKey = false;
    var emitPath = false;
    while (i < path.length) {
      var key = path[i];
      var c;
      j++;

      if (key && !key.recurse) {
        c = j === this.stack.length ? this : this.stack[j];
        if (!c) return;
        if (!check(key, c.key)) {
          setHeaderFooter(c.key, value);
          return;
        }
        emitKey = !!key.emitKey;
        emitPath = !!key.emitPath;
        i++;
      } else {
        i++;
        var nextKey = path[i];
        if (!nextKey) return;
        while (true) {
          c = j === this.stack.length ? this : this.stack[j];
          if (!c) return;
          if (check(nextKey, c.key)) {
            i++;
            if (!Object.isFrozen(this.stack[j])) this.stack[j].value = null;
            break;
          } else {
            setHeaderFooter(c.key, value);
          }
          j++;
        }
      }
    }

    // emit header
    if (header) {
      stream.emit('header', header);
      header = false;
    }
    if (j !== this.stack.length) return;

    count++;
    var actualPath = this.stack
      .slice(1)
      .map(function (element) {
        return element.key;
      })
      .concat([this.key]);
    var data = value;
    if (null != data)
      if (null != (data = map ? map(data, actualPath) : data)) {
        if (emitKey || emitPath) {
          data = { value: data };
          if (emitKey) data['key'] = this.key;
          if (emitPath) data['path'] = actualPath;
        }

        stream.queue(data);
      }
    if (this.value) delete this.value[this.key];
    for (var k in this.stack)
      if (!Object.isFrozen(this.stack[k])) this.stack[k].value = null;
  };
  parser._onToken = parser.onToken;

  parser.onToken = function (token, value) {
    parser._onToken(token, value);
    if (this.stack.length === 0) {
      if (stream.root) {
        if (!path) stream.queue(stream.root);
        count = 0;
        stream.root = null;
      }
    }
  };

  parser.onError = function (err) {
    if (err.message.indexOf('at position') > -1)
      err.message = 'Invalid JSON (' + err.message + ')';
    stream.emit('error', err);
  };

  return stream;

  function setHeaderFooter(key, value) {
    // header has not been emitted yet
    if (header !== false) {
      header = header || {};
      header[key] = value;
    }

    // footer has not been emitted yet but header has
    if (footer !== false && header === false) {
      footer = footer || {};
      footer[key] = value;
    }
  }
};

function check(x, y) {
  if ('string' === typeof x) return y == x;
  else if (x && 'function' === typeof x.exec) return x.exec(y);
  else if ('boolean' === typeof x || 'object' === typeof x) return x;
  else if ('function' === typeof x) return x(y);
  return false;
}
