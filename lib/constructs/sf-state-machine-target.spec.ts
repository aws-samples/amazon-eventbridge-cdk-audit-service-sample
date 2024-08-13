// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { Stack } from "aws-cdk-lib";
import { StateMachineTarget } from "./sf-state-machine-target";

import { Template } from "aws-cdk-lib/assertions";

let template: Template;

beforeEach(() => {
  const stack: Stack = new Stack();
  new StateMachineTarget(stack, 'stateMachine', {
    logicalEnv: 'test',
    accountId: '11111111'
  });
  template = Template.fromStack(stack);
});

test('should create S3 bucket', () => {
  template.hasResourceProperties('AWS::S3::Bucket', {
    BucketName: 'test-audit-events-11111111',
    BucketEncryption: {
      ServerSideEncryptionConfiguration: [
        {
          ServerSideEncryptionByDefault: {SSEAlgorithm: 'aws:kms'}
        }
      ]
    },
  });
});

test('should create Lambda function', () => {
  template.hasResourceProperties('AWS::Lambda::Function', {
    FunctionName: 'test-save-to-s3',
    Runtime: 'nodejs20.x',
    TracingConfig: {
      Mode: 'Active'
    },
    Environment: {
      Variables: {
        BUCKET_NAME: {Ref: 'stateMachineAuditEventsRawEE6803DC'}
      }
    }
  });
});

test('should create table with expected partition key', () => {
  template.hasResourceProperties('AWS::DynamoDB::Table', {
    TableName: 'test-audit-events',
    BillingMode: 'PAY_PER_REQUEST',
    KeySchema: [{
      AttributeName: 'EventId',
      KeyType: 'HASH'
    }]
  });
});

test('should create table with expected global secondary indexes', () => {
  template.hasResourceProperties('AWS::DynamoDB::Table', {
    GlobalSecondaryIndexes: [{
      IndexName: 'search-by-entity-id',
      KeySchema: [{
        AttributeName: 'EntityId',
        KeyType: 'HASH'
      }, {
        AttributeName: 'Ts',
        KeyType: 'RANGE'
      }],
      Projection: {ProjectionType: 'ALL'}
    }, {
      IndexName: 'search-by-author',
      KeySchema: [{
        AttributeName: 'Author',
        KeyType: 'HASH'
      }, {
        AttributeName: 'Ts',
        KeyType: 'RANGE'
      }],
      Projection: {ProjectionType: 'ALL'}
    }]
  });
});

test('should create state machine', () => {
  template.hasResourceProperties('AWS::StepFunctions::StateMachine', {
    StateMachineName: 'test-log-audit-event'
  });
});