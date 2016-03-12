'use strict';

const async = require( 'async' );
const AWSEventEmitter = require( '../index.js' );
const test = require( 'tape' );

let emitter1 = null;
let emitter2 = null;

test( 'create emitters', function( t ) {
    emitter1 = Object.assign( {}, AWSEventEmitter );
    t.ok( emitter1, 'created #1' );

    emitter2 = Object.assign( {}, AWSEventEmitter );
    t.ok( emitter2, 'created #2' );

    t.end();
} );

test( 'init emitter #1', function( t ) {
    emitter1.init( {
        topic: 'test-aws-events',
        queueName: 'test-aws-events'
    }, function( error ) {
        t.error( error, 'initialized successfully' );
        t.end();
    } );
} );

test( 'init emitter #2', function( t ) {
    emitter2.init( {
        topic: 'test-aws-events',
        queueName: 'test-aws-events'
    }, function( error ) {
        t.error( error, 'initialized successfully' );
        t.end();
    } );
} );

test( 'purge emitter', function( t ) {
    // note: we only do this on one of these emitters because they both use the same queue
    async.each( [
        emitter1
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

    t.ok( emitter1.once( 'test-once', onEvent ), 'bound event on #1' );
    t.ok( emitter2.once( 'test-once', onEvent ), 'bound event on #2' );

    emitter1.emit( 'test-once', '#1 1' );
    emitter1.emit( 'test-once', '#1 2' );
    emitter1.emit( 'test-once', '#1 3' );

    emitter2.emit( 'test-once', '#2 1' );
    emitter2.emit( 'test-once', '#2 2' );
    emitter2.emit( 'test-once', '#2 3' );

    setTimeout( function() {
        t.equal( called, 2, 'once called twice, once for each emitter' );
        t.end();
    }, 5000 );
} );

test( 'addListener', function( t ) {
    let called1 = 0;
    let called2 = 0;

    t.ok( emitter1.addListener( 'test-many', () => { ++called1; } ), 'bound event on #1' );
    t.ok( emitter2.addListener( 'test-many', () => { ++called2; } ), 'bound event on #2' );

    emitter1.emit( 'test-many', '#1 1' );
    emitter1.emit( 'test-many', '#1 2' );
    emitter1.emit( 'test-many', '#1 3' );

    emitter2.emit( 'test-many', '#2 1' );
    emitter2.emit( 'test-many', '#2 2' );
    emitter2.emit( 'test-many', '#2 3' );

    setTimeout( function() {
        t.equal( called1 + called2, 6, 'called each time, handled on both emitters' );
        t.end();
    }, 5000 );
} );

test( 'shutdown', function( t ) {
    async.forEachOf( [
        emitter1,
        emitter2
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
