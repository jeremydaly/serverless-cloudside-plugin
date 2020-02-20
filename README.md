# serverless-cloudside-plugin

[Serverless](http://www.serverless.com) plugin for using _cloudside_ resources when developing functions locally.

[![Serverless](http://public.serverless.com/badges/v3.svg)](http://www.serverless.com)
[![npm](https://img.shields.io/npm/v/serverless-cloudside-plugin.svg)](https://www.npmjs.com/package/serverless-cloudside-plugin)
[![npm](https://img.shields.io/npm/l/serverless-cloudside-plugin.svg)](https://www.npmjs.com/package/serverless-cloudside-plugin)

This plugin allows you to use AWS CloudFormation intrinsic functions (such as `!Ref` and `!GetAtt`) to reference cloud resources during local development. When added to your `environment` variables, these values are replaced with the same identifiers used when deployed to the cloud. You can invoke your functions locally, use the `serverless-offline` plugin, or use a compatible test runner that uses the `serverless invoke test` command. You can now keep your `serverless.yml` files free from pseudo variables and other concatenated strings and simply use the built-in CloudFormation features.

## Installation

#### Install using Serverless plugin manager
```bash
serverless plugin install --name serverless-cloudside-plugin
```

#### Install using npm

Install the module using npm:
```bash
npm install serverless-cloudside-plugin --save-dev
```

Add `serverless-cloudside-plugin` to the plugin list of your `serverless.yml` file:

```yaml
plugins:
  - serverless-cloudside-plugin
```

## Usage

When executing your function locally, the `serverless-cloudside-plugin` will replace any environment variable that contains either a `!Ref` or a `!GetAtt` that references a CloudFormation resource within your `serverless.yml` file, or a `!Fn::ImportValue` that references a CloudFormation resources that was exported by another stack.

In the example below, we are creating an SQS Queue named `myQueue` and referencing it (using a CloudFormation intrinsic function) in an environment variable named `QUEUE`.

```yaml
functions:
  myFunction:
    handler: myFunction.handler
    environment:
      QUEUE: !Ref myQueue

resources:
  Resources:
    myQueue:
      Type: AWS::SQS::Queue
      Properties:
        QueueName: ${self:service}-${self:provider.stage}-myQueue
```      

If we deploy this to the cloud, our `!Ref myQueue` will be replaced with a `QueueUrl` (e.g. _https://sqs.us-east-1.amazonaws.com/1234567890/sample-service-dev-myQueue_). We can then use that when invoking the AWS SDK and working with our queue.
However, if we were to invoke this function locally using `sls invoke local -f myFunction`, our `QUEUE` environment variable would return `[object Object]` instead of our `QueueUrl`. This is because the Serverless Framework is actually replacing our `!Ref` with: `{ "Ref": "myQueue" }`.

There are workarounds to this, typically involving using pseudo variables to construct our own URL. But this method is error prone and requires us to hardcode formats for the different service types. Using the `serverless-cloudside-plugin`, you can now use the simple reference format above, and always retrieve the correct `PhysicalResourceId` for the resource.

#### Invoking a function locally
Once the plugin is installed, you will have a new `invoke` option named `invoke cloudside`. Simply run this command with a function and it will resolve all of your cloud variables and then execute the standard `invoke local` command.

```bash
sls invoke cloudside -f myFunction
```

**PLEASE NOTE** that in order for resources to be referenced, you must deploy your service to the cloud at least initially. References to non-deployed resources will be populated with **"RESOURCE NOT DEPLOYED"**.

All `invoke local` parameters are supported such as `--stage` and `--path`, as well as the new `--docker` flag that lets you run your function locally in a Docker container. This mimics the Lambda environment much more closely than your local machine.

By default, the plugin will reference resources from your current CloudFormation stack (including your "stage" if it is part of your stack name). You can change the cloudside stage by using the `--cloudStage` option and supplying the stage name that you'd like to use. For example, if you are developing in your `dev` stage locally, but want to use a DynamoDB table that is deployed to the `test` stage, you can do the following:

```bash
sls invoke cloudside -f myFunction -s dev --cloudStage test
```

This will populate any `${opt:stage}` references with `dev`, but your `!Ref` values will use the ones from your `test` stage.

You might also want to pull values from an entirely different CloudFormation stack. You can do this by using the `--stackName` option and supplying the complete stack name. For example:

```bash
sls invoke cloudside -f myFunction --stackName someOtherStack-dev
```

#### Using with the serverless-offline plugin
The `serverless-offline` plugin is a great tool for testing your serverless APIs locally, but it has the same problem referencing CloudFormation resources. The `serverless-cloudside-plugin` lets you run `serverless-offline` with all of your cloud variables correctly replaced.

```bash
sls offline cloudside
```

The above command will start the API Gateway emulator and allow you to test your functions locally. The `--cloudStage` and `--stackName` options are supported as well as all of the `serverless-offline` options.

#### Using with a test runner
You can use this plugin with other test runner plugins such as `serverless-mocha-plugin`. This will make it easier to run integration tests (including in your CI/CD systems) before deploying. Simply run the following when invoking your tests:

```bash
sls invoke test cloudside -f myFunction
```

This plugin extends the `invoke test` command, so any test runner plugin that uses that format should work correctly. All plugin options should remain available.

## Available Functions
This plugin currently supports the `!Ref` function that returns the `PhysicalResourceId` from CloudFormation. For most resources, this is the value you will need to interact with the corresponding service in the AWS SDK (e.g. `QueueUrl` for SQS, `TopicArn` for SNS, etc.).

There is also initial (and limited) support for using `!GetAtt` to retrieve an **ARN**. For example, you may use `!GetAtt myQueue.Arn` to retrieve the ARN for `myQueue`. The plugin generates the ARN based on the service type. For supported types, it will return a properly formatted ARN. For others, it will replace the value with **"FUNCTION NOT SUPPORTED"**. In most cases, it should be possible to support generating an ARN for a resource, but the format will need to be added to the plugin.

There now is also support for `Fn::ImportValue` to allow referencing exported resources from other CloudFormation stacks.

## Contributions
Contributions, ideas and bug reports are welcome and greatly appreciated. Please add [issues](https://github.com/jeremydaly/serverless-cloudside-plugin/issues) for suggestions and bug reports or create a pull request.
