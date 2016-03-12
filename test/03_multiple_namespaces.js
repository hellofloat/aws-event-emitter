'use strict';

const async = require( 'async' );
const AWSEventEmitter = require( '../index.js' );
const test = require( 'tape' );

let emitterFoo = null;
let emitterBar = null;

test( 'create emitters', function( t ) {
    emitterFoo = Object.assign( {}, AWSEventEmitter );
    t.ok( emitterFoo, 'created Foo emitter' );

    emitterBar = Object.assign( {}, AWSEventEmitter );
    t.ok( emitterBar, 'created Bar emitter' );

    t.end();
} );

test( 'init emitter Foo', function( t ) {
    emitterFoo.init( {
        topic: 'test-aws-events',
        queueName: 'test-aws-events-foo'
    }, function( error ) {
        t.error( error, 'initialized successfully' );
        t.end();
    } );
} );

test( 'init emitter Bar', function( t ) {
    emitterBar.init( {
        topic: 'test-aws-events',
        queueName: 'test-aws-events-bar'
    }, function( error ) {
        t.error( error, 'initialized successfully' );
        t.end();
    } );
} );

test( 'purge emitter', function( t ) {
    async.each( [
        emitterFoo,
        emitterBar
    ], function( emitter, next ) {
        emitter.purge( next );
    }, function( error ) {
        t.error( error, 'purged emitter queues, waiting 60 seconds for purge to complete' );
        setTimeout( t.end.bind( t ), 60000 );
    } );
} );

test( 'once', function( t ) {
    let called = 0;
    function onEvent() {
        ++called;
    }

    t.ok( emitterFoo.once( 'test-once', onEvent ), 'bound event on Foo' );
    t.ok( emitterBar.once( 'test-once', onEvent ), 'bound event on Bar' );

    emitterFoo.emit( 'test-once', 'Foo 1' );
    emitterFoo.emit( 'test-once', 'Foo 2' );
    emitterFoo.emit( 'test-once', 'Foo 3' );

    emitterBar.emit( 'test-once', 'Bar 1' );
    emitterBar.emit( 'test-once', 'Bar 2' );
    emitterBar.emit( 'test-once', 'Bar 3' );

    setTimeout( function() {
        t.equal( called, 2, 'once called twice, once for each emitter' );
        t.end();
    }, 5000 );
} );

test( 'addListener', function( t ) {
    let calledFoo = 0;
    let calledBar = 0;

    t.ok( emitterFoo.addListener( 'test-many', () => { ++calledFoo; } ), 'bound event on Foo' );
    t.ok( emitterBar.addListener( 'test-many', () => { ++calledBar; } ), 'bound event on Bar' );

    emitterFoo.emit( 'test-many', 'Foo 1' );
    emitterFoo.emit( 'test-many', 'Foo 2' );
    emitterFoo.emit( 'test-many', 'Foo 3' );

    emitterBar.emit( 'test-many', 'Bar 1' );
    emitterBar.emit( 'test-many', 'Bar 2' );
    emitterBar.emit( 'test-many', 'Bar 3' );

    setTimeout( function() {
        t.equal( calledFoo + calledBar, 12, 'called each time, handled each time on both emitters' );
        t.end();
    }, 5000 );
} );

test( 'shutdown', function( t ) {
    async.forEachOf( [
        emitterFoo,
        emitterBar
    ], function( emitter, index, next ) {
        t.ok( emitter.detach(), 'detached ' + index );
        emitter = null;
        t.notOk( emitter, 'destroyed ' + index );
        next();
    }, function( error ) {
        t.error( error, 'shutdown' );
        t.end();
    } );
} );
