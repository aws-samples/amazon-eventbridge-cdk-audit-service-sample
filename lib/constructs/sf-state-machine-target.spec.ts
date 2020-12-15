// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { Stack } from "@aws-cdk/core";
import { StateMachineTarget } from "./sf-state-machine-target";

import '@aws-cdk/assert/jest';

let stack: Stack;

beforeEach(() => {
  stack = new Stack();
  new StateMachineTarget(stack, 'stateMachine', {
    logicalEnv: 'test',
    accountId: '11111111'
  });
});

test('should create S3 bucket', () => {
  expect(stack).toHaveResource('AWS::S3::Bucket', {
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
  expect(stack).toHaveResourceLike('AWS::Lambda::Function', {
    FunctionName: 'test-save-to-s3',
    Runtime: 'nodejs12.x',
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
  expect(stack).toHaveResource('AWS::DynamoDB::Table', {
    TableName: 'test-audit-events',
    BillingMode: 'PAY_PER_REQUEST',
    KeySchema: [{
      AttributeName: 'EventId',
      KeyType: 'HASH'
    }]
  });
});

test('should create table with expected global secondary indexes', () => {
  expect(stack).toHaveResource('AWS::DynamoDB::Table', {
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
  expect(stack).toHaveResource('AWS::StepFunctions::StateMachine', {
    StateMachineName: 'test-log-audit-event'
  });
});