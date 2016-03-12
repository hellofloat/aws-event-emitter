'use strict';

var AWSEventEmitter = require( '../index.js' );
var test = require( 'tape' );

let emitter = null;

test( 'exports properly', function( t ) {
    t.ok( AWSEventEmitter, 'object exists' );
    t.end();
} );

test( 'create emitter', function( t ) {
    emitter = Object.assign( {}, AWSEventEmitter );
    t.ok( emitter, 'created' );
    t.end();
} );

test( 'emitter methods exist', function( t ) {
    t.ok( typeof emitter.init === 'function', 'init exists' );
    t.ok( typeof emitter.attach === 'function', 'attach exists' );
    t.ok( typeof emitter.detach === 'function', 'detach exists' );
    t.ok( typeof emitter.purge === 'function', 'purge exists' );
    t.ok( typeof emitter.emit === 'function', 'emit exists' );
    t.ok( typeof emitter.addListener === 'function', 'addListener exists' );
    t.ok( typeof emitter.removeListener === 'function', 'removeListener exists' );
    t.ok( typeof emitter.on === 'function', 'on exists' );
    t.ok( typeof emitter.off === 'function', 'off exists' );
    t.ok( typeof emitter.once === 'function', 'once exists' );
    t.ok( typeof emitter.removeAllListeners === 'function', 'removeAllListeners exists' );
    t.ok( typeof emitter.listenerCount === 'function', 'listenerCount exists' );
    t.ok( typeof emitter.listeners === 'function', 'listeners exists' );
    t.end();
} );

test( 'init emitter', function( t ) {
    emitter.init( {
        topic: 'test-aws-events',
        queueName: 'test-aws-events'
    }, function( error ) {
        t.error( error, 'initialized successfully' );
        t.end();
    } );
} );

test( 'purge emitter', function( t ) {
    emitter.purge( function( error ) {
        t.error( error, 'purged successfully, waiting 60 seconds for purge to complete' );
        setTimeout( t.end.bind( t ), 60000 );
    } );
} );

function onTest( event, t, callback ) {
    if ( t ) {
        t.pass( 'got event callback' );
    }

    if ( callback ) {
        callback();
    }
    else {
        if ( t ) {
            t.end();
        }
    }
}

test( 'emitter basics', function( t ) {
    function onTestLocal() {}

    t.ok( emitter.listenerCount( 'test' ) === 0, 'listenerCount returns 0 initially' );

    let e = emitter.addListener( 'test', onTest );
    t.ok( emitter.listenerCount( 'test' ) === 1, 'listenerCount returns 1 after single bind' );

    t.ok( e === emitter, 'emitter returns itself for chaining' );

    emitter.addListener( 'test', onTestLocal );
    t.ok( emitter.listenerCount( 'test' ) === 2, 'listenerCount returns 2 after two binds' );

    emitter.removeListener( 'test', onTestLocal );
    t.ok( emitter.listenerCount( 'test' ) === 1, 'listenerCount returns 1 after one unbind' );

    emitter.removeListener( 'test', onTest );
    t.ok( emitter.listenerCount( 'test' ) === 0, 'listenerCount returns 0 after two unbinds' );

    t.end();
} );

test( 'attach/detach', function( t ) {
    t.notOk( emitter.attach(), 'attach returns false when already attached' );
    t.ok( emitter.detach(), 'detach returns true when detaching' );
    t.notOk( emitter.detach(), 'detach returns false when already detached' );
    t.ok( emitter.attach(), 'attach returns true when attaching' );
    t.end();
} );

test( 'once', function( t ) {
    let called = 0;
    function onEvent() {
        ++called;
    }

    t.ok( emitter.once( 'test-once', onEvent ), 'bound event' );
    emitter.emit( 'test-once', 'foo' );
    emitter.emit( 'test-once', 'bar' );
    setTimeout( function() {
        t.equal( called, 1, 'called only once' );
        t.end();
    }, 5000 );
} );

test( 'addListener', function( t ) {
    let called = 0;
    function onEvent() {
        ++called;
    }

    t.ok( emitter.addListener( 'test-many', onEvent ), 'bound event' );
    emitter.emit( 'test-many', 'foo' );
    emitter.emit( 'test-many', 'bar' );
    emitter.emit( 'test-many', 'baz' );
    setTimeout( function() {
        t.equal( called, 3, 'called each time' );
        t.end();
    }, 5000 );
} );


test( 'shutdown', function( t ) {
    t.ok( emitter.detach(), 'detached' );
    emitter = null;
    t.notOk( emitter, 'destroyed' );
    t.end();
} );
