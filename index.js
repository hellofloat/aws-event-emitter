'use strict';

const async = require( 'async' );
const AWS = require( 'aws-sdk' );
const extend = require( 'extend' );
const uuid = require( 'uuid' );

let AWSEventEmitter = module.exports = {};

AWSEventEmitter.init = function( options, callback ) {
    const self = this;
    callback = callback || function() {};

    if ( self.initialized ) {
        callback();
        return;
    }

    if ( self.initializing ) {
        setTimeout( self._init.bind( self, options, callback ), 100 );
        return;
    }

    self.initializing = true;

    self.options = extend( true, {
        topic: 'aws-events',
        queueName: 'aws-events',
        AWS: {
            region: 'us-east-1'
        }
    }, options );

    self.listeners = {};
    self.messageQueue = [];
    self.snsInfo = {};
    self.sqsInfo = {};

    async.series( [
        // AWS configuration
        function loadAWSCredentials( next ) {
            AWS.config.correctClockSkew = true; // retry signature expiration errors
            if ( self.options.AWS ) {
                for ( let key in self.options.AWS ) {
                    if ( self.options.AWS.hasOwnProperty( key ) ) {
                        AWS.config[ key ] = self.options.AWS[ key ];
                    }
                }
            }
            next();
        },

        function initSNS( next ) {
            self.sns = new AWS.SNS( {
                apiVersion: self.options.AWS && self.options.AWS.SNS ? self.options.AWS.SNS.apiVersion || '2010-03-31' : '2010-03-31'
            } );
            next();
        },

        function initSQS( next ) {
            self.sqs = new AWS.SQS( {
                apiVersion: self.options.AWS && self.options.AWS.SQS ? self.options.AWS.SQS.apiVersion || '2012-11-05' : '2012-11-05'
            } );
            next();
        },

        function createQueue( next ) {
            self.sqs.createQueue( {
                QueueName: self.options.queueName
            }, function( error, data ) {
                if ( error ) {
                    next( error );
                    return;
                }

                self.sqsInfo.queueURL = data.QueueUrl;
                next();
            } );
        },

        function getQueueInfo( next ) {
            self.sqs.getQueueAttributes( {
                QueueUrl: self.sqsInfo.queueURL,
                AttributeNames: [
                    'QueueArn',
                    'Policy'
                ]
            }, function( error, data ) {
                if ( error ) {
                    next( error );
                    return;
                }

                self.sqsInfo.queueArn = data.Attributes && data.Attributes.QueueArn;

                try {
                    self.sqsInfo.policy = data.Attributes && data.Attributes.Policy && JSON.parse( data.Attributes.Policy );
                }
                catch( ex ) {
                    next( ex );
                    return;
                }

                next();
            } );
        },

        function createEventTopic( next ) {
            self.sns.createTopic( {
                Name: self.options.topic
            }, function( error, data ) {
                if ( error ) {
                    next( error );
                    return;
                }

                self.snsInfo.topicArn = data.TopicArn;
                next();
            } );
        },

        function allowSNSToSQSPublishing( next ) {
            const isAllowedAlready = self.sqsInfo.policy && self.sqsInfo.policy.Statement && self.sqsInfo.policy.Statement.some( ( statement ) => {
                return statement.Resource === self.sqsInfo.queueArn &&
                    statement.Condition &&
                    statement.Condition.ArnEquals &&
                    statement.Condition.ArnEquals[ 'aws:SourceArn' ] === self.snsInfo.topicArn;
            } );

            if ( isAllowedAlready ) {
                next();
                return;
            }

            let statements = self.sqsInfo.policy && self.sqsInfo.policy.Statement ? self.sqsInfo.policy.Statement : [];
            statements.push( {
                Sid: 'SNSToSQSPolicy',
                Effect: 'Allow',
                Principal: '*',
                Action: 'sqs:SendMessage',
                Resource: self.sqsInfo.queueArn,
                Condition: {
                    ArnEquals: {
                        'aws:SourceArn': self.snsInfo.topicArn
                    }
                }
            } );

            const policy = extend( true, {}, self.sqsInfo.policy, {
                Version: '2012-10-17',
                Statement: statements
            } );

            const params = {
              Attributes: {
                Policy: JSON.stringify( policy )
              },
              QueueUrl: self.sqsInfo.queueURL
            };

            self.sqs.setQueueAttributes( params, next );
        },

        function requestSubscription( next ) {
            const params = {
                Endpoint: self.sqsInfo.queueArn,
                Protocol: 'sqs',
                TopicArn: self.snsInfo.topicArn
            };

            if ( !params.Endpoint ) {
                throw new Error( 'Missing SQS queue ARN.' );
            }

            if ( !params.TopicArn ) {
                throw new Error( 'Missing SNS topic ARN.' );
            }

            self.sns.subscribe( params, function( error, data ) {
                if ( error ) {
                    next( error );
                    return;
                }

                self.snsInfo.subscriptionArn = data.SubscriptionArn;
                next();
            } );
        }
    ], function( error ) {

        self.initializing = false;

        if ( error ) {
            self._emit( 'error', error );
            callback( error );
            return;
        }

        self.initialized = true;
        self.attach();
        callback();
        self._onInitialized();
        self._emit( '__initialized' );
    } );
};

AWSEventEmitter._onInitialized = function() {
    const self = this;

    let event = self.messageQueue.shift();
    while( event ) {
        self.emit( event.eventName, event.event );
        event = self.messageQueue.shift();
    }
};

AWSEventEmitter.detach = function() {
    const self = this;
    if ( self.stopped ) {
        return false;
    }

    self.stopped = true;
    if ( self.receiver ) {
        self.receiver.abort();
        self.receiver = null;
    }
    self.attached = false;
    return true;
};

AWSEventEmitter.attach = function() {
    const self = this;

    if ( self.attached ) {
        return false;
    }

    self.stopped = false;
    self.attached = true;
    self._pollSQSQueue();
    return true;
};

AWSEventEmitter.purge = function( callback ) {
    const self = this;

    self.sqs.purgeQueue( {
        QueueUrl: self.sqsInfo.queueURL
    }, function( error ) {
        if ( error ) {
            self._emit( 'error', error );
        }

        if ( callback ) {
            callback( error );
        }
    } );
};

AWSEventEmitter._resolveMessage = function( message, callback ) {
    const self = this;

    self.sqs.deleteMessage( {
        QueueUrl: self.sqsInfo.queueURL,
        ReceiptHandle: message.ReceiptHandle
    }, function( error ) {
        if ( error ) {
            self._emit( 'error', error );
        }
    } );

    let decodedBody = null;
    try {
        decodedBody = JSON.parse( message.Body );
    }
    catch( ex ) {
        callback( ex );
        return;
    }

    if ( decodedBody.Subject !== 'event' ) {
        callback( 'AWSEventEmitter Got unknown message subject: ' + decodedBody.Subject );
        return;
    }

    let decodedMessage = null;
    try {
        decodedMessage = JSON.parse( decodedBody.Message );
    }
    catch( ex ) {
        callback( ex );
        return;
    }

    callback( null, decodedMessage );
};

AWSEventEmitter._pollSQSQueue = function() {
    const self = this;

    if ( self.stopped ) {
        return false;
    }

    self.receiver = self.sqs.receiveMessage( {
        QueueUrl: self.sqsInfo.queueURL,
        MaxNumberOfMessages: 1,
        VisibilityTimeout: 60,
        WaitTimeSeconds: 20
    }, function( error, data ) {
        self.receiver = null;

        if ( error ) {
            if ( error.code && error.code === 'RequestAbortedError' ) {
                return;
            }

            self._emit( 'error', error );
            setImmediate( self._pollSQSQueue.bind( self ) );
            return;
        }

        async.eachSeries( data.Messages, function( message, next ) {
            self._resolveMessage( message, function( error, decoded ) {
                if ( error ) {
                    next( error );
                    return;
                }

                if ( self.options.logEvents ) {
                    console.log( 'AWS Event:' );
                    console.log( require( 'util' ).inspect( decoded, { depth: null } ) );
                }

                self._emit( decoded.eventName, decoded.event );
                next();
            } );
        }, function( error ) {
            if ( error ) {
                self._emit( 'error', error );
            }

            if ( !self.stopped ) {
                setImmediate( self._pollSQSQueue.bind( self ) );
            }
        } );
    } );

    return true;
};

AWSEventEmitter._emit = function( eventName, event ) {
    const self = this;
    const listeners = self.listeners[ eventName ];
    if ( listeners && listeners.length > 0 ) {
        listeners.forEach( function( listener ) {
            listener( event );
        } );
    }
};

AWSEventEmitter.emit = function( eventName, event ) {
    const self = this;

    if ( !self.initialized ) {
        self.messageQueue.push( {
            eventName: eventName,
            event: event
        } );
        return;
    }

    const params = {
        Subject: 'event',
        Message: JSON.stringify( {
            id: uuid.v4(),
            eventName: eventName,
            event: event
        } ),
        TopicArn: self.snsInfo.topicArn
    };

    self.sns.publish( params, function( error ) {
        if ( error ) {
            self._emit( 'error', error );
        }
    } );
};

AWSEventEmitter.addListener = AWSEventEmitter.on = function( eventName, callback ) {
    const self = this;
    self.listeners[ eventName ] = self.listeners[ eventName ] || [];
    self.listeners[ eventName ].push( callback );
    return self;
};

AWSEventEmitter.once = function( eventName, callback ) {
    const self = this;

    function once( event ) {
        callback( event );
        self.removeListener( eventName, once );
    }

    self.addListener( eventName, once );

    return self;
};

AWSEventEmitter.removeListener = AWSEventEmitter.off = function( eventName, callback ) {
    const self = this;
    self.listeners[ eventName ] = self.listeners[ eventName ] || [];
    self.listeners[ eventName ] = self.listeners[ eventName ].filter( function( listener ) {
        return listener !== callback;
    } );
    return self;
};

AWSEventEmitter.removeAllListeners = function( eventName ) {
    const self = this;
    self.listeners[ eventName ] = self.listeners[ eventName ] || [];
    self.listeners[ eventName ] = [];
    return self;
};

AWSEventEmitter.listenerCount = function( eventName ) {
    const self = this;
    return ( self.listeners[ eventName ] || [] ).length;
};

AWSEventEmitter.listeners = function( eventName ) {
    const self = this;
    return ( self.listeners[ eventName ] || [] ).slice( 0 );
};
