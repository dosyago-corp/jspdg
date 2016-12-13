/* mocha --ui tdd tests/test.js  */

var compareAst = require('compare-ast');
var assert = require('assert');


/* Libraries */
var esprima = require('../lib/esprima.js');
var escodegen = require('../lib/escodegen.js');

/* Jipda */
var Ast = require('../../jipda-pdg/ast.js').Ast;


/* Stip - constructing pdg */

var Stip = require('../run.js').Stip;


suite('Tier split - basic', function () {

    test('variables', function () {
        var res = Stip.tierSplit('/* @server */ {var a = 1; var b = 2; var c = a + b;} /* @client */ {var a = 1; var b = 2; var c = a + b;}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(0, res[2].length);
        compareAst(escodegen.generate(ast0), 'var a; var b; var c; a = 1; b = 2; c = a + b; client.expose({});');
        compareAst(escodegen.generate(ast1), 'var a; var b; var c; a = 1; b = 2; c = a + b; server.expose({});');
    });

    test('function client to server', function () {
        var res = Stip.tierSplit('/* @server */ {function foo (x) {return x}} /* @client */ {var a = foo(42)}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(0, res[2].length);
        compareAst(escodegen.generate(ast1), 'server.expose({"foo" : function (x, callback) {var self = this; return callback(null, x)}})');
        compareAst(escodegen.generate(ast0),
            'var a; client.rpcCall("foo", 42, function (_v1_, _v2_) {a = _v2_;}); client.expose({});',
            {varPattern: /_v\d_/});
    });

    test('function client to server - call argument', function () {
        var res = Stip.tierSplit('/* @server */ {function foo (x) {return x}} /* @client */ {foo(foo(42))}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(0, res[2].length);
        compareAst(escodegen.generate(ast1), 'server.expose({"foo" : function (x, callback) {var self = this; return callback(null, x)}})');
        compareAst(escodegen.generate(ast0),
            'client.rpcCall("foo", 42, function (_v1_, _v2_) {client.rpcCall("foo", _v2_, function (_v3_, _v4_) {})}); client.expose({});',
            {varPattern: /_v\d_/});
    });

    test('function server to client: broadcast', function () {
        var res = Stip.tierSplit('/* @client */ {function clientf (x) { return x; }} /* @server */ {/* @all */ clientf(42)}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(0, res[2].length);
        compareAst(escodegen.generate(ast0),
            'client.expose({"clientf" : function (x, callback) {return callback(null, x)}});');
        compareAst(escodegen.generate(ast1),
            'server.rpc("clientf", [42]); server.expose({});');
    });

    test('function server to client: reply', function () {
        var res = Stip.tierSplit('/* @server */ {function foo() {/*@reply */ bar(3)}} /* @client */ {function bar(y) {return 42+y;} foo();}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(0, res[2].length);
        compareAst(escodegen.generate(ast0),
            'client.rpcCall("foo", function (_v1_, _v2_) {}); client.expose({"bar" : function (y,callback) {return callback(null,42+y);}})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'server.expose({"foo" : function (callback) {var self = this; self.rpcCall("bar", 3);}})');
    });

    test('function client called by both', function () {
        var res = Stip.tierSplit('/* @server */ {function foo() {/*@reply */ bar(3)}} /* @client */ {function bar(y) {return 42+y;} foo();bar(2);}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(0, res[2].length);
        compareAst(escodegen.generate(ast0),
            'function bar(y) {return 42+y;} client.rpcCall("foo", function (_v1_, _v2_) {}); bar(2); client.expose({"bar" : function (y,callback) {return callback(null,42+y);}})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'server.expose({"foo" : function (callback) {var self = this; self.rpcCall("bar", 3);}})');
    });

    test('function client called by both with rpc', function () {
        var res = Stip.tierSplit('/* @server */ {function foo() {/*@reply */ bar(3)}} /* @client */ {function bar(y) {foo(); return 42+y;} bar(2);}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(0, res[2].length);
        compareAst(escodegen.generate(ast0),
            'function bar(y) {client.rpcCall("foo", function (_v1_, _v2_){}); return 42+y;}  bar(2); client.expose({"bar" : function (y,callback) {client.rpcCall("foo", function (_v1_, _v2_){}); return callback(null,42+y);}})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'server.expose({"foo" : function (callback) {var self = this; self.rpcCall("bar", 3);}})');
    });

    test('remote call in return statement client', function () {
        var res = Stip.tierSplit('/* @server */ {function bar() {return 42;} foo(3); }/* @client */ {function foo(y) {return bar()}}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(0, res[2].length);
        compareAst(escodegen.generate(ast0),
            'client.expose({"foo" : function (y,callback) {return client.rpcCall("bar", function (_v1_, _v2_){ return callback(_v1_,_v2_)})}})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'server.rpc("foo", [3]); server.expose({"bar" : function (callback) {var self = this; return callback(null, 42)}});',
            {varPattern: /_v\d_/});
    });

    test('remote call in return statement server', function () {
        var res = Stip.tierSplit('/* @client */ {function bar() {return 42;} foo(3); }/* @server */ {function foo(y) {return bar()}}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(0, res[2].length);
        compareAst(escodegen.generate(ast0),
            'client.rpcCall("foo", 3, function (_v1_, _v2_) {}); client.expose({"bar" : function (callback) {return callback(null, 42)}})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'server.expose({"foo" : function (y, callback) {var self = this; return self.rpcCall("bar", function (_v1_, _v2_) {return callback(_v1_,_v2_)})}});',
            {varPattern: /_v\d_/});
    });

    test('remote calls in return statement server', function () {
        var res = Stip.tierSplit('/* @client */ {function bar() {return 42;} foo(3); }/* @server */ {function foo(y) {return bar() + bar()}}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(0, res[2].length);
        compareAst(escodegen.generate(ast0),
            'client.rpcCall("foo", 3, function (_v1_, _v2_) {}); client.expose({"bar" : function (callback) {return callback(null, 42)}})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'server.expose({"foo" : function (y, callback) {var self = this; return self.rpcCall("bar", function (_v1_, _v2_) {self.rpcCall("bar", function (_v3_, _v4_) {return callback(_v1_,_v4_+_v2_)})})}});',
            {varPattern: /_v\d_/});
    });

});

suite('Data sharing', function () {
    test('local', function () {
        var res = Stip.tierSplit('/* @server */ {/* @local */ var a = 1; var b = a * 2;} /* @client */ {var c = 22}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(0, res[2].length);
        compareAst(escodegen.generate(ast0),
            'var c; c = 22; client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'var a; var b; a = 1; b = a * 2; server.expose({})',
            {varPattern: /_v\d_/});
    });
    test('copy', function () {
        var res = Stip.tierSplit('/* @server */ {/* @copy */ var a = 1; var b = a * 2;} /* @client */ {var c = a * 3;}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(0, res[2].length);
        compareAst(escodegen.generate(ast0),
            'var a; a = 1; var c; c = a * 3; client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'var a; var b; a = 1; b = a * 2; server.expose({})',
            {varPattern: /_v\d_/});
    });
    test('observable - object literal', function () {
        var res = Stip.tierSplit('/* @server */ {/* @observable */ var obs = {x:1, y:2}} /* @client */ {console.log(obs)}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(0, res[2].length);
        compareAst(escodegen.generate(ast0),
            'var obs; obs = client.makeObservableObject("obs", {x:1, y: 2}); console.log(obs); client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'var obs; obs = server.makeObservableObject("obs", {x:1, y:2}); server.expose({})',
            {varPattern: /_v\d_/});
    })
    test('observable - object constructor', function () {
        var res = Stip.tierSplit('/* @server */ {/* @observable */ function Point(x,y) {this.x = x; this.y = y;} var p = new Point(1,2) } /* @client */ {console.log(p.x)}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(0, res[2].length);
        compareAst(escodegen.generate(ast0),
            'function Point(id, x, y) {function Point(x,y) {this.x = x; this.y = y;} return client.makeObservableObject(id, new Point(x,y));} var p; p = new Point("p", 1, 2); console.log(p.x); client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'function Point(id, x, y) {function Point(x,y) {this.x = x; this.y = y;} return server.makeObservableObject(id, new Point(x,y));}var p; p = new Point("p", 1, 2); server.expose({})',
            {varPattern: /_v\d_/});
    })
    test('observable - collection', function () {
        var res = Stip.tierSplit('/* @server */ {/* @observable */ var coll = [];} /* @client */ {coll.push({x:1})}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(0, res[2].length);
        compareAst(escodegen.generate(ast0),
            'var coll; coll = client.makeObservableObject("coll", []); coll.push({x:1}); client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'var coll; coll = server.makeObservableObject("coll", []); server.expose({})',
            {varPattern: /_v\d_/});
    })
    test('observable - collection with anonymous objects', function () {
        var res = Stip.tierSplit('/* @server */ {/* @observable */ function Point(x,y) {this.x = x; this.y = y;} /* @observable */ var coll = [];} /* @client */ {coll.push(new Point(1,2))}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        console.log(escodegen.generate(ast0))
        /* no warnings */
        assert.equal(0, res[2].length);
        compareAst(escodegen.generate(ast0),
            'var coll; coll = client.makeObservableObject("coll", []); function Point(id, x, y) {function Point(x,y) {this.x = x; this.y = y;} return client.makeObservableObject(id, new Point(x,y))} coll.push(new Point(false, 1, 2)); client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'function Point(id, x, y) {function Point(x,y) {this.x = x; this.y = y;} return server.makeObservableObject(id, new Point(x,y));} var coll; coll = server.makeObservableObject("coll", []); server.expose({})',
            {varPattern: /_v\d_/});
    })
    test('erplicated - object literal', function () {
        var res = Stip.tierSplit('/* @server */ {/* @replicated */ var obs = {x:1, y:2}} /* @client */ {console.log(obs)}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(0, res[2].length);
        compareAst(escodegen.generate(ast0),
            'var obs; obs = client.makeReplicatedObject("obs", {x:1, y: 2}); console.log(obs); client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'var obs; obs = server.makeReplicatedObject("obs", {x:1, y:2}); server.expose({})',
            {varPattern: /_v\d_/});
    })
    test('replicated - object constructor', function () {
        var res = Stip.tierSplit('/* @server */ {/* @replicated */ function Point(x,y) {this.x = x; this.y = y;} var p = new Point(1,2) } /* @client */ {console.log(p.x)}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(0, res[2].length);
        compareAst(escodegen.generate(ast0),
            'function Point(id, x, y) {function Point(x,y) {this.x = x; this.y = y;} return client.makeReplicatedObject(id, new Point(x,y));} var p; p = new Point("p", 1, 2); console.log(p.x); client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'function Point(id, x, y) {function Point(x,y) {this.x = x; this.y = y;} return server.makeReplicatedObject(id, new Point(x,y));}var p; p = new Point("p", 1, 2); server.expose({})',
            {varPattern: /_v\d_/});
    })
    test('replicated - collection', function () {
        var res = Stip.tierSplit('/* @server */ {/* @replicated */ var coll = [];} /* @client */ {coll.push({x:1})}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(0, res[2].length);
        compareAst(escodegen.generate(ast0),
            'var coll; coll = client.makeReplicatedObject("coll", []); coll.push({x:1}); client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'var coll; coll = server.makeReplicatedObject("coll", []); server.expose({})',
            {varPattern: /_v\d_/});
    })
    test('replicated- collection with anonymous objects', function () {
        var res = Stip.tierSplit('/* @server */ {/* @replicated */ function Point(x,y) {this.x = x; this.y = y;} /* @replicated */ var coll = [];} /* @client */ {coll.push(new Point(1,2))}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(0, res[2].length);
        compareAst(escodegen.generate(ast0),
            'var coll; coll = client.makeReplicatedObject("coll", []); function Point(id, x, y) {function Point(x,y) {this.x = x; this.y = y;} return client.makeReplicatedObject(id, new Point(x,y))} coll.push(new Point(false, 1, 2)); client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'function Point(id, x, y) {function Point(x,y) {this.x = x; this.y = y;} return server.makeReplicatedObject(id, new Point(x,y));} var coll; coll = server.makeReplicatedObject("coll", []); server.expose({})',
            {varPattern: /_v\d_/});
    })



})


suite('Failure Handling', function () {
    test('try catch - 1', function () {
        var res = Stip.tierSplit('/*@server*/ {function foo(x) {if (x<0) throw "error"; else return x;}} /*@client*/{try{foo(2)} catch(e) {console.log(e)}}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        compareAst(escodegen.generate(ast0),
            'try{client.rpcCall("foo", 2, function (_v1_, _v2_) {try {if(_v1_) throw _v1_} catch (_v3_) {console.log(_v3_)}})} catch (e) {console.log(e)} client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'server.expose({"foo": function (x, callback) {var self = this; if (x<0) return callback("error"); else return callback(null, x);}})');
    });
    test('try catch - 2', function () {
        var res = Stip.tierSplit('/*@server*/ {function foo(x) {if (x<0) throw "error"; else return x;}} /*@client*/{try{var z = foo(2); console.log(z); foo(z) } catch(e) {console.log(e)}}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;

        compareAst(escodegen.generate(ast0),
            'var z; try{client.rpcCall("foo", 2, function (_v1_, _v2_) {try {if(_v1_) throw _v1_; z = _v2_; console.log(z); client.rpcCall("foo", z, function (_v4_, _v5_) {try {if (_v4_) throw _v4_;} catch(e) {console.log(e);}})} catch (_v3_) {console.log(_v3_)}})} catch (e) {console.log(e)} client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'server.expose({ "foo": function (x, callback) {var self = this; if (x<0) return callback("error"); else return callback(null, x);}})');
    });
    test('handlers - default', function () {
        var res = Stip.tierSplit('/*@server*/{function broadcast(msg){}}/*@client @useHandler: log buffer*/{/*@useHandler: abort*/function speak(){broadcast("hello")} speak()}');
        var ast0 = res[0].nosetup;
        compareAst(escodegen.generate(ast0),
            'function speak() {_v1_.rpcCall("broadcast", "hello", function (_v2_, _v3_) {})} speak(); client.expose({})',
            {varPattern: /_v\d_/})
    });
})

suite('CPS transform', function () {

    test('variables', function () {
        var ast = Stip.cpsTransform('var a = 1; var b = 2; var c = a + b;');
        compareAst(escodegen.generate(ast.nosetup), 'var a; var b; var c; a = 1; b = 2; c = a + b;');
    });

    test('function', function () {
        var ast = Stip.cpsTransform('function foo (x) {return x * 2} foo(42);');
        compareAst(escodegen.generate(ast.nosetup),
            'function foo(x, _v1_) {return _v1_(null, x * 2)} foo(42, function (_v2_, _v3_) {})',
            {varPattern: /_v\d_/})
    });

    test('call argument', function () {
        var ast = Stip.cpsTransform('function foo(x) {return x} foo(foo(42));');
        compareAst(escodegen.generate(ast.nosetup),
            'function foo(x, _v1_) {return _v1_(null, x)} foo(42, function (_v2_, _v3_) {foo(_v3_, function (_v4_, _v5_) {})})',
            {varPattern: /_v\d_/})
    });

    test('anon function as call arg', function () {
        var ast = Stip.cpsTransform('function id(x) {return x}; function foo() {var a= https.get(id("foo"));  a.on("ev", function (d) {console.log(d)})} foo();');
        compareAst(escodegen.generate(ast.nosetup),
            'function id(x, callback) {return callback(null, x);}function foo(callback) {function anonf1(d) {console.log(d);}var a;id("foo", function (_v1_, _v2_) {https.get(_v2_, function (_v3_, _v4_) {a = _v4_;a.on("ev", anonf1, function (_v5_, _v6_) {});});});}foo(function (_v7_, _v8_) {});',
            {varPattern: /_v\d_/})
    });

    test('blocking annotation', function () {
        var ast = Stip.cpsTransform('function foo(x) {return x} /* @blocking */ foo(42); var a = 2;');
        compareAst(escodegen.generate(ast.nosetup),
            'function foo(x, _v1_) {return _v1_(null, x)} var a; foo(42, function(_v2_, _v3_) {a = 2;})',
            {varPattern: /_v\d_/})
    });

    test('without blocking annotation', function () {
        var ast = Stip.cpsTransform('function foo(x) {return x} foo(42); var a = 2;');
        compareAst(escodegen.generate(ast.nosetup),
            'function foo(x, _v1_) {return _v1_(null, x)} var a; foo(42, function(_v2_, _v3_) {}); a = 2;',
            {varPattern: /_v\d_/})
    });

    test('blocking delimited block', function () {
        var ast = Stip.cpsTransform('function foo(x) {return x} /* @blocking */ { foo(42); var a = 2;} foo(4);');
        compareAst(escodegen.generate(ast.nosetup),
            'function foo(x, _v1_) {return _v1_(null, x)} var a; foo(42, function(_v2_, _v3_) {a = 2;}); foo(4, function (_v4_, _v5_){});',
            {varPattern: /_v\d_/})
    });

    test('blocking delimited block2', function () {
        var ast = Stip.cpsTransform('function foo(x) {return x} /* @blocking */ { var z = foo(foo(42)); var a = z + 101;} foo(4);');
        compareAst(escodegen.generate(ast.nosetup),
            'function foo(x, _v1_) {return _v1_(null, x)} var z; var a; foo(42, function(_v2_, _v3_) {foo(_v3_, function (_v4_, _v5_) {z = _v5_; a = z + 101;});}); foo(4, function (_v6_, _v7_){});',
            {varPattern: /_v\d_/})
    });

    test('return call in cps function', function () {
        var ast = Stip.cpsTransform('function foo(x) {return x} function bar() {return foo(42)} bar();');
        compareAst(escodegen.generate(ast.nosetup),
            'function foo(x, _v1_) {return _v1_(null, x)} function bar(_v2_){return foo(42, function (_v3_, _v4_) {return _v2_(_v3_, _v4_)})} bar(function (_v5_, _v6_) {})',
            {varPattern: /_v\d_/})
    });

});
