// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import * as cdk from '@aws-cdk/core';

import { EventBus, Rule, CfnRule, RuleTargetInput, EventField } from '@aws-cdk/aws-events';
import * as targets from '@aws-cdk/aws-events-targets';
import { StateMachineTarget } from './constructs/sf-state-machine-target';
import { CfnOutput } from '@aws-cdk/core';
import { LogGroup, RetentionDays } from '@aws-cdk/aws-logs';
import { Topic } from '@aws-cdk/aws-sns';

interface AuditServiceStackProps extends cdk.StackProps {
  logicalEnv: string;
}

export class AuditServiceStack extends cdk.Stack {
  
  public readonly busName: CfnOutput;
  public readonly bucketName: CfnOutput;
  public readonly tableName: CfnOutput;
  public readonly logGroupName: CfnOutput;
  public readonly topicName: CfnOutput;
  
  constructor(scope: cdk.Construct, id: string, props?: AuditServiceStackProps) {
    super(scope, id, props);

    const prefix = props?.logicalEnv;

    // step functions state machine target
    const stateMachineTarget = new StateMachineTarget(this, 'StateMachineTarget', {
      logicalEnv: prefix!,
      accountId: this.account
    });

    // cloudwatch log group target
    const logGroup = new LogGroup(this, 'AuditLogGroup', {
      logGroupName: `/aws/events/${prefix}-audit-events`,
      retention: RetentionDays.ONE_DAY
    });

    // sns topic
    const topic = new Topic(this, 'DeletedEntitiesTopic', {
      topicName: `${prefix}-deleted-entities`
    });

    // eventbridge
    const bus = new EventBus(this, 'AuditEventBus', {
      eventBusName: `${prefix}-audit-event-bus`
    });

    // rule with step function state machine as a target
    const auditEventsRule = new Rule(this, 'AuditEventsBusRule', {
      ruleName: `${prefix}-audit-events-rule`,
      description: 'Rule matching audit events',
      eventBus: bus,
      eventPattern: {      
        detailType: ['Object State Change']
      }
    });

    auditEventsRule.addTarget(new targets.SfnStateMachine(stateMachineTarget.stateMachine));

    // rule with cloudwatch log group as a target
    // (using CFN as L2 constructor doesn't allow prefix expressions)
    new CfnRule(this, 'AllEventsBusRule', {
      name: `${prefix}-all-events-rule`,
      eventBusName: bus.eventBusName,
      description: 'Rule matching all events',
      eventPattern: {   
        source: [{prefix: ''}]
      },
      targets: [{
        id: `${prefix}-all-events-cw-logs`,
        arn: `arn:aws:logs:${logGroup.stack.region}:${logGroup.stack.account}:log-group:${logGroup.logGroupName}`
      }]
    });

    // rule for deleted entities
    const deletedEntitiesRule = new Rule(this, 'DeletedEntitiesBusRule', {
      ruleName: `${prefix}-deleted-entities-rule`,
      description: 'Rule matching audit events for delete operations',
      eventBus: bus,
      eventPattern: {      
        detailType: ['Object State Change'],
        detail: {
          operation: ['delete']
        }
      }
    });

    deletedEntitiesRule.addTarget(new targets.SnsTopic(topic, {
      message: RuleTargetInput.fromText(
        `Entity with id ${EventField.fromPath('$.detail.entity-id')} has been deleted by ${EventField.fromPath('$.detail.author')}`
      )
    }));

    // outputs
    this.busName = new CfnOutput(this, 'EventBusName', {
      value: bus.eventBusName,
      description: 'Name of the bus created for audit events'
    });

    this.bucketName = new CfnOutput(this, 'BucketName', {
      value: stateMachineTarget.bucket.bucketName,
      description: 'Name of the bucket created to store the content of audit events'
    });

    this.tableName = new CfnOutput(this, 'TableName', {
      value: stateMachineTarget.table.tableName,
      description: 'Name of the table created to store audit events'
    });

    this.logGroupName = new CfnOutput(this, 'LogGroupName', {
      value: logGroup.logGroupName,
      description: 'Name of the log group created to store all events'
    });

    this.topicName = new CfnOutput(this, 'TopicName', {
      value: topic.topicName,
      description: 'Name of the topic created to publish deleted entities events to'
    });
  }
}
