// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const { expect } = require('chai');

const {v4: uuidv4} = require('uuid');

const region = process.env.AWS_REGION;
const AWS = require('aws-sdk');
const eb = new AWS.EventBridge({region, apiVersion: '2015-10-07'});
const dynamodb = new AWS.DynamoDB({region, apiVersion: '2012-08-10'});
const s3 = new AWS.S3({region, apiVersion: '2006-03-01'});
const logs = new AWS.CloudWatchLogs({region, apiVersion: '2014-03-28'});

describe('End-to-end tests for the audit service', () => {

  const eventBus = process.env.AUDIT_EVENT_BUS_NAME;
  const bucket = process.env.AUDIT_BUCKET_NAME;
  const table = process.env.AUDIT_TABLE_NAME;
  const logGroup = process.env.AUDIT_LOG_GROUP_NAME;

  it('should save an audit event into an DynamoDB table', async () => {
    // arrange
    // here we may be able to demonstrate SchemaRegistry (with TS)
    const now = Date.now();
    const detail = buildEvent({ts: now.toString()});
    
    // act
    const params = {
      Entries: [{
        Detail: JSON.stringify(detail),
        DetailType: 'Object State Change',
        EventBusName: eventBus,
        Source: 'custom.books-api'
      }]
    };
    const result = await eb.putEvents(params).promise();

    // allow event to propagate and execute targets
    await wait(3500);

    // assert
    const eventId = result.Entries[0].EventId;
    const eventFromDb = await getAuditEventFromTable(eventId);
    
    expect(eventFromDb).not.to.be.null;
    expect(eventFromDb).to.have.property('eventId', eventId);
    expect(eventFromDb).to.have.property('entityType', detail['entity-type']);
    expect(eventFromDb).to.have.property('entityId', detail['entity-id']);
    expect(eventFromDb).to.have.property('author', detail.author);
    expect(eventFromDb).to.have.property('operation', detail.operation);
    expect(eventFromDb).to.have.property('ts', now);
    expect(eventFromDb).to.have.property('s3Key');
  });
  
  it('should store audit event data into a S3 bucket', async() => {
    // arrange
    const now = Date.now();
    const detail = buildEvent({ts: now.toString()});
    
    // act
    const params = {
      Entries: [{
        Detail: JSON.stringify(detail),
        DetailType: 'Object State Change',
        EventBusName: eventBus,
        Source: 'custom.books-api'
      }]
    };
    const result = await eb.putEvents(params).promise();

    // allow event to propagate and execute targets
    await wait();

    // assert
    const eventId = result.Entries[0].EventId;
    const objectFromBucket = await getAuditEventFromS3(eventId, now);

    expect(objectFromBucket).to.not.be.null;
    expect(objectFromBucket).to.deep.equal(detail.data);
  });

  it('should not store audit event without data into a S3 bucket', async () => {
    // arrange
    const now = Date.now();
    const detail = buildEvent({ts: now.toString(), operation: 'delete'});
    delete detail.data;
    
    // act
    const params = {
      Entries: [{
        Detail: JSON.stringify(detail),
        DetailType: 'Object State Change',
        EventBusName: eventBus,
        Source: 'custom.books-api'
      }]
    };
    const result = await eb.putEvents(params).promise();

    // allow event to propagate and execute targets
    await wait();

    // assert
    const eventId = result.Entries[0].EventId;
    const objectFromBucket = await getAuditEventFromS3(eventId, now);
    expect(objectFromBucket).to.be.undefined;
  });

  ['Any Event', 'Object State Change'].forEach(detailType => {
    it(`should send all events to CloudWatch log group (detailType=${detailType})`, async() => {
      // arrange
      const now = Date.now();
      const detail = buildEvent({ts: now.toString()});
  
      // act
      const params = {
        Entries: [{
          Detail: JSON.stringify(detail),
          DetailType: detailType,
          EventBusName: eventBus,
          Source: 'any.system'
        }]
      };
      const result = await eb.putEvents(params).promise();
  
      // allow event to propagate and execute targets
      await wait();
  
      // assert
      const eventId = result.Entries[0].EventId;
      const objectFromLogs = await getAuditEventFromCWLogs(eventId, now);
      expect(objectFromLogs).to.not.be.null;
      expect(objectFromLogs).to.have.property('id', eventId);
      expect(objectFromLogs).to.have.property('source', 'any.system');
      expect(objectFromLogs).to.have.property('detail-type', detailType);
      expect(objectFromLogs).to.have.property('detail');
      expect(objectFromLogs.detail).to.have.property('entity-type', detail['entity-type']);
      expect(objectFromLogs.detail).to.have.property('entity-id', detail['entity-id']);
      expect(objectFromLogs.detail).to.have.property('author', detail.author);
      expect(objectFromLogs.detail).to.have.property('operation', detail.operation);
      expect(objectFromLogs.detail).to.have.property('ts', now.toString());
    });
  });

  // auxiliary functions
  
  function buildEvent(props) {
    return {
      'entity-type': 'book', 
      'entity-id': uuidv4(),
      operation: 'insert',
      author: 'john.doe@foo.bar', 
      ts: Date.now().toString(),
      data: {
        name: 'bob'
      },
      ...props
    };
  }

  async function wait(ms) {
    ms = ms || 2500;
    return new Promise(resolve => {
      setTimeout(resolve, ms);
    });
  }

  async function getAuditEventFromTable(eventId) {
    try {
      const params = {
        TableName: table,
        Key: {
          'EventId': {S: eventId}
        }
      };
      
      const result = await dynamodb.getItem(params).promise();
      
      if (!result.Item) {
        throw new Error(`Item with EventId=${eventId} not found`);
      }

      return {
        eventId: result.Item.EventId.S,
        entityType: result.Item.EntityType.S,
        entityId: result.Item.EntityId.S,
        author: result.Item.Author.S,
        operation: result.Item.Operation.S,
        ts: parseInt(result.Item.Ts.N, 10),
        s3Key: result.Item.S3Key.S
      };
    } catch (e) {
      console.log('error retrieving audit event from dynamodb', e);
      throw e;
    }
  }

  async function getAuditEventFromS3(eventId, ts) {
    try {
      const paddingChar = "0";
      const d = new Date(parseInt(ts, 10));  
      const year = d.getFullYear();
      const month = (d.getMonth() + 1).toString().padStart(2, paddingChar);
      const day = d.getDate().toString().padStart(2, paddingChar);

      const key = `${year}/${month}/${day}/${eventId}`;

      const params = {
        Bucket: bucket,
        Key: key
      };
 
      const result = await s3.getObject(params).promise();
      
      if (!result) {
        throw new Error(`Object with key=${key} not found`);
      }

      return JSON.parse(result.Body.toString('utf-8'));
    } catch (e) {
      if (e.statusCode !== 404) {
        console.log('error retrieving audit event from s3', e);
        throw e;
      }

      return;
    }
  }

  async function getAuditEventFromCWLogs(eventId, ts) {
    try {
      const params =  {
        logGroupName: logGroup,
        startTime: Math.floor((ts-1000)/1000) * 1000,
        endTime: Math.ceil((ts+1000)/1000) * 1000
      };
      
      const result = await logs.filterLogEvents(params).promise();
            
      if (!result || result.events.length === 0) {
        throw new Error(`Log events not found for time range around ${ts}`);
      }

      const event = result.events.find(l => {
        const message = JSON.parse(l.message);
        return message.id === eventId;
      });

      if (!event) {
        throw new Error(`Log for event id with key=${key} not found`);
      }

      return JSON.parse(event.message);

    } catch (e) {
      console.log('error retrieving event from CloudWatch logs', e);
      throw e;
    }
  }

});