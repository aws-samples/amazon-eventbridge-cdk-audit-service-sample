// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { CfnOutput, Construct, Stage, StageProps, Tags } from "@aws-cdk/core"
import { AuditServiceStack } from "./audit-service-sample-stack";

interface DeployStageProps extends StageProps {
  logicalEnv: string;
}

export class AuditServiceDeployStage extends Stage {

  public readonly busName: CfnOutput;
  public readonly bucketName: CfnOutput;
  public readonly tableName: CfnOutput;
  public readonly logGroupName: CfnOutput;
  public readonly topicName: CfnOutput;

  constructor(scope: Construct, id: string, props?: DeployStageProps) {
    super(scope, id, props);
    
    const logicalEnv = props?.logicalEnv || 'dev';
    const stack = new AuditServiceStack(this, 'AuditService', {logicalEnv});

    Tags.of(stack).add('environment', logicalEnv);
    Tags.of(stack).add('service', 'audit');

    this.busName = stack.busName
    this.bucketName = stack.bucketName;
    this.tableName = stack.tableName;
    this.logGroupName = stack.logGroupName;
    this.topicName = stack.topicName;
  }
}