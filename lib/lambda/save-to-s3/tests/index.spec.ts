// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import * as chai from 'chai';
import * as sinon from 'sinon';
import { S3Client } from '@aws-sdk/client-s3';

const sinonChai = require('sinon-chai') as Chai.ChaiPlugin;

chai.use(sinonChai);
const expect = chai.expect;

import {handler} from '../index';

describe('Save event to S3', () => {
  let sandbox: sinon.SinonSandbox;
  let s3Stub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should generate the appropiate key for the object in S3", async () => {
    // arrange
    s3Stub = sandbox.stub(S3Client.prototype, 'send').resolves({});

    // act
    const event = buildAuditEvent();
    const generatedKey = await handler(event);

    // assert    
    expect(s3Stub).to.have.been.calledOnce;
    expect(generatedKey).to.equal('2020/10/21/473edc2b-a079-4fa9-8fb3-3ccf602f4957');
  });

  it("should save object into S3", async () => {
    // arrange
    s3Stub = sandbox.stub(S3Client.prototype, 'send').resolves({});

    // act
    const event = buildAuditEvent();
    await handler(event);

    // assert    
    expect(s3Stub).to.have.been.calledOnce;
    const command = s3Stub.getCall(0).args[0];
    expect(command.input).to.have.property('Bucket', 'audit-events');
    expect(command.input).to.have.property('ContentType', 'application/json');
    expect(command.input).to.have.property('Key', '2020/10/21/473edc2b-a079-4fa9-8fb3-3ccf602f4957');
    expect(command.input).to.have.property('Body', '{"name":"foo"}');
  });

  it("should not save object into S3 if there is no data", async () => {
    // arrange
    s3Stub = sandbox.stub(S3Client.prototype, 'send').resolves({});

    // act
    const event = buildAuditEvent(false);
    const generatedKey = await handler(event);

    // assert    
    expect(s3Stub).to.not.have.been.called;
    expect(generatedKey).to.equal('');
  });

  it("should re-throw exception if any thrown by S3 client", async () => {
    // arrange
    const e = new Error();
    s3Stub = sandbox.stub(S3Client.prototype, 'send').rejects(e);

    //act && assert
    const event = buildAuditEvent();
    const promise = handler(event);
    
    return promise.catch((error: Error) => {
      expect(error).to.equal(e);
    });
  });

  function buildAuditEvent(includeData: boolean = true) {
    return {
      id: '473edc2b-a079-4fa9-8fb3-3ccf602f4957',
      detail: {
        ts: "1603294852000",
        data: includeData ? {name: 'foo'} : undefined
      }
    };
  }

});
