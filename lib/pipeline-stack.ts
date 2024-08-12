// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { Construct } from "constructs";

import { Stack, StackProps } from "aws-cdk-lib";
import { CodePipeline, ShellStep, CodePipelineSource, ManualApprovalStep, CodeBuildStep } from 'aws-cdk-lib/pipelines';
import * as ssm from 'aws-cdk-lib/aws-ssm';

import { AuditServiceDeployStage } from "./audit-service-sample-stage";
import { Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";

export class PipelineStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const source = CodePipelineSource.connection('jbernalvallejo/amazon-eventbridge-cdk-audit-service-sample', 'main', {
      connectionArn: ssm.StringParameter.fromStringParameterName(this, 'GithubConnectionArn', 'github_connection_arn').stringValue
    });

    const pipeline = new CodePipeline(this, 'AuditServicePipeline', {
      crossAccountKeys: false, // https://docs.aws.amazon.com/cdk/api/latest/docs/pipelines-readme.html#a-note-on-cost
      pipelineName: 'AuditService',      
      synth: new ShellStep('Synth', {
        input: source,
        commands: [
          'npm ci',
          'npm run build',
          'npm run synth'
        ]
      })
    });

    // deploy to staging
    const stagingDeploy = new AuditServiceDeployStage(this, 'Staging', {
      logicalEnv: 'staging'
    });
    const stagingStage = pipeline.addStage(stagingDeploy);

    const role = new Role(this, 'TestStepRole', {
      assumedBy: new ServicePrincipal('codebuild.amazonaws.com'),
    });

    role.addManagedPolicy({managedPolicyArn: 'arn:aws:iam::aws:policy/AmazonDynamoDBReadOnlyAccess'});
    role.addManagedPolicy({managedPolicyArn: 'arn:aws:iam::aws:policy/AmazonEventBridgeFullAccess'});
    role.addManagedPolicy({managedPolicyArn: 'arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess'});
    role.addManagedPolicy({managedPolicyArn: 'arn:aws:iam::aws:policy/CloudWatchLogsReadOnlyAccess'});

    const e2eTestAction = new CodeBuildStep('Test', {
      input: source,
      envFromCfnOutputs: {
        AUDIT_EVENT_BUS_NAME: stagingDeploy.busName,
        AUDIT_BUCKET_NAME: stagingDeploy.bucketName,
        AUDIT_TABLE_NAME: stagingDeploy.tableName,
        AUDIT_LOG_GROUP_NAME: stagingDeploy.logGroupName,
        AUDIT_TOPIC_NAME: stagingDeploy.topicName
      },
      installCommands: [
        'cd test',
        'npm ci',
      ],
      commands: [
        'cd test',
        'npm test'
      ],
      role
    });
    
    stagingStage.addPost(e2eTestAction);

    // deploy to production
    pipeline.addStage(new AuditServiceDeployStage(this, 'Production', {
      logicalEnv: 'production'
    }), {
      pre: [
        new ManualApprovalStep('PromoteToProd')
      ]
    });
  }
}