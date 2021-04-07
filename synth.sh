#!/bin/bash

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

set -euo pipefail

echo "********************************************"
echo "* Synthesizing Audit Service sample        *"
echo "********************************************"
echo ;

echo "Remove non-production dependencies for AWS Lambda functions"
cd lib/lambda/

cd save-to-s3
echo "- save-to-s3"
npm prune --production
echo "- Done."

cd ../../..
cdk synth

echo "********************************************"
echo "* Success                                  *"
echo "********************************************"
