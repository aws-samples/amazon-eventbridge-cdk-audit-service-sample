// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { Stack } from "aws-cdk-lib";
import { AuditServiceStack } from "./audit-service-sample-stack";

import { Template } from "aws-cdk-lib/assertions";

let template: Template;

beforeEach(() => {
   const stack:Stack = new AuditServiceStack(new Stack(), 'stateMachine', {
    logicalEnv: 'test'
  });
  template = Template.fromStack(stack);
});

test('should create a CloudWatch log group', () => {  
  template.hasResourceProperties('AWS::Logs::LogGroup', {
    LogGroupName: '/aws/events/test-audit-events',
    RetentionInDays: 1
  });
});

test('should create a SNS topic', () => {
  template.hasResourceProperties('AWS::SNS::Topic', {
    TopicName: 'test-deleted-entities'
  });
});

test('should create an EventBridge bus', () => {
  template.hasResourceProperties('AWS::Events::EventBus', {
    Name: 'test-audit-event-bus'
  });
});

test('should create rule for audit events going to Step Function state machine', () => {
  template.hasResourceProperties('AWS::Events::Rule', {
    Name: 'test-audit-events-rule',
    Description: 'Rule matching audit events',
    EventBusName: {Ref: 'AuditEventBus4CA9BCB2'},
    EventPattern: {
      'detail-type': ['Object State Change']
    },
    Targets: [{
      Arn: {Ref: 'StateMachineTargetLogAuditEventEE46E9C7'}
    }]
  });
});

test('should create rule for all events going to CloudWatch log group', () => {
  template.hasResourceProperties('AWS::Events::Rule', {
    Name: 'test-all-events-rule',
    Description: 'Rule matching all events',
    EventBusName: {Ref: 'AuditEventBus4CA9BCB2'},
    EventPattern: {
      source: [{prefix: ''}]
    },
    Targets: [{
      Id: 'test-all-events-cw-logs'
    }]
  });
});

test('should create rule for deleted entities going to SNS topic', () => {
  template.hasResourceProperties('AWS::Events::Rule', {
    Name: 'test-deleted-entities-rule',
    Description: 'Rule matching audit events for delete operations',
    EventBusName: {Ref: 'AuditEventBus4CA9BCB2'},
    EventPattern: {
      'detail-type': ['Object State Change'],
      detail: {operation: ['delete']}
    },
    Targets: [{
      Arn: {Ref: 'DeletedEntitiesTopic8CC38689'},
      InputTransformer: {
        InputPathsMap: {
          'detail-entity-id': '$.detail.entity-id',
          "detail-author": '$.detail.author'
        },
        InputTemplate: '\"Entity with id <detail-entity-id> has been deleted by <detail-author>\"'
      }
    }]
  });
});