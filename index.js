'use strict';

const BbPromise = require('bluebird')

class InvokeCloudside {
  constructor(serverless, options) {
    this.serverless = serverless
    this.options = options

    this.commands = {
      invoke: {
        commands: {
          cloudside: {
            usage: 'Invoke function locally using cloudside resources',
            lifecycleEvents: [
              'loadCloudsideEnvVars',
              'invoke',
            ],
            options: {
              function: {
                usage: 'Name of the function',
                shortcut: 'f',
                required: true,
                type: 'string',
              },
              cloudStage: {
                usage: 'Stage to use for cloudside resources',
                shortcut: 'S',
                type: 'string',
              },
              stackName: {
                usage: 'CloudFormation stack to use for cloudside resources',
                shortcut: 'y',
                type: 'string',
              },
              path: {
                usage: 'Path to JSON or YAML file holding input data',
                shortcut: 'p',
                type: 'string',
              },
              data: {
                usage: 'input data',
                shortcut: 'd',
                type: 'string',
              },
              raw: {
                usage: 'Flag to pass input data as a raw string',
                type: 'string',
              },
              context: {
                usage: 'Context of the service',
                type: 'string',
                shortcut: 'c',
              },
              contextPath: {
                usage: 'Path to JSON or YAML file holding context data',
                type: 'string',
                shortcut: 'x',
              },
              env: {
                usage: 'Override environment variables. e.g. --env VAR1=val1 --env VAR2=val2',
                type: 'string',
                shortcut: 'e',
              },
              docker: {
                usage: 'Flag to turn on docker use for node/python/ruby/java',
                type: 'string'
              },
              'docker-arg': {
                usage: 'Arguments to docker run command. e.g. --docker-arg "-p 9229:9229"',
                type: 'string',
              },
            },

          },
          test: {
            usage: 'NOT INSTALLED - A testing plugin must be installed to use "invoke test cloudside"',
            commands: {
              cloudside: {
                usage: 'Invoke test(s) using cloudside resources',
                lifecycleEvents: [
                  'loadCloudsideEnvVars',
                  'start'
                ],
                options: {
                  cloudStage: {
                    usage: 'Stage to use for cloudside resources',
                    shortcut: 'S',
                    type: 'string',
                  },
                  stackName: {
                    usage: 'CloudFormation stack to use for cloudside resources',
                    shortcut: 'y',
                    type: 'string',
                  }
                }
              }
            }
          }
        },
      },
      offline: {
        lifecycleEvents: [
          'checkInstall'
        ],
        usage: 'NOT INSTALLED - This plugin must be installed to use "offline cloudside"',
        commands: {
          cloudside: {
            usage: 'Simulates API Gateway to call your lambda functions offline using cloudside resources',
            lifecycleEvents: [
              'checkInstall',
              'loadCloudsideEnvVars',
              'start'
            ],
            options: {
              cloudStage: {
                usage: 'Stage to use for cloudside resources',
                shortcut: 'S',
                type: 'string',
              },
              stackName: {
                usage: 'CloudFormation stack to use for cloudside resources',
                shortcut: 'y',
                type: 'string',
              }
            }
          }
        }
      }
    };

    this.hooks = {
      'invoke:cloudside:loadCloudsideEnvVars': () => BbPromise.bind(this).then(this.loadCloudsideEnvVars),
      'invoke:test:cloudside:loadCloudsideEnvVars': () => BbPromise.bind(this).then(this.loadCloudsideEnvVars),
      'offline:cloudside:loadCloudsideEnvVars': () => BbPromise.bind(this).then(this.loadCloudsideEnvVars),
      'after:invoke:cloudside:invoke': () => this.serverless.pluginManager.run(['invoke', 'local']),
      'after:offline:cloudside:start': () => this.serverless.pluginManager.run(['offline', 'start']),
      'offline:checkInstall': () => BbPromise.bind(this).then(this.checkInstall('serverless-offline')),
      'offline:cloudside:checkInstall': () => BbPromise.bind(this).then(this.checkInstall('serverless-offline')),
      'after:invoke:test:cloudside:start': () => this.serverless.pluginManager.run(['invoke', 'test']),
    };
  }

  checkInstall(plugin) {
    if (!this.serverless.service.plugins.includes(plugin)) {
      throw Error(`You must install "${plugin}" to use the "offline cloudside" feature.\n\n  You can install it by running "serverless plugin install --name ${plugin}"`)
    }
    return BbPromise.resolve()
  }

  // Set environment variables for "invoke cloudside"
  loadCloudsideEnvVars() {

    // Get the stage (use the cloudstage option first, then stage option, then provider)
    const stage = this.options.cloudStage ? this.options.cloudStage :
      this.options.stage ? this.options.stage :
        this.serverless.service.provider.stage

    // Get the stack name (use provided stackName or fallback to service name)
    const stackName = this.options.stackName ? this.options.stackName :
      this.serverless.service.provider.stackName ?
        this.serverless.service.provider.stackName :
          `${this.serverless.service.service}-${stage}`

    this.serverless.cli.log(`Loading cloudside resources for '${stackName}' stack.`)

    if (!this.serverless.service.provider.environment) {
      this.serverless.service.provider.environment = {}
    }

    this.serverless.service.provider.environment.IS_CLOUDSIDE = true
    this.serverless.service.provider.environment.CLOUDSIDE_STACK = stackName

    // Find all envs with CloudFormation Refs
    let cloudsideVars = parseEnvs(this.serverless.service.provider.environment)

    let functions = this.options.function ?
      { [this.options.function] : this.serverless.service.functions[this.options.function] }
        : this.serverless.service.functions

    Object.keys(functions).map(fn => {
      if (this.serverless.service.functions[fn].environment) {
        let vars = parseEnvs(this.serverless.service.functions[fn].environment,fn)
        for (let key in vars) {
          cloudsideVars[key] = cloudsideVars[key] ? cloudsideVars[key].concat(vars[key]) : vars[key]
        }
      }
    })

    // If references need resolving, call CF
    if (Object.keys(cloudsideVars).length > 0) {

      const options = { useCache: true }

      return this.serverless.getProvider('aws')
        .request('CloudFormation',
          'describeStackResources',
          { StackName: stackName },
          options)
      .then(res => {
        if (res.StackResources) {
          // Loop through the returned StackResources
          for (let i = 0; i < res.StackResources.length; i++) {

            let resource = cloudsideVars[res.StackResources[i].LogicalResourceId]

            // If the logicial id exists, add the PhysicalResourceId to the ENV
            if (resource) {
              for (let j = 0; j < resource.length; j++) {

                let value = resource[j].type == 'Ref' ? res.StackResources[i].PhysicalResourceId
                  : buildCloudValue(res.StackResources[i],resource[j].type)

                if (resource[j].fn) {
                  this.serverless.service.functions[resource[j].fn].environment[
                    resource[j].env
                  ] = value
                } else {
                  this.serverless.service.provider.environment[
                    resource[j].env
                  ] = value
                }

              } // end for
              // Remove the cloudside variable
              delete(cloudsideVars[res.StackResources[i].LogicalResourceId])
            } // end if
          } // end for
        } // end if StackResources

        // Replace remaining variables with warning
        Object.keys(cloudsideVars).map(x => {
          for (let j = 0; j < cloudsideVars[x].length; j++) {
            if (cloudsideVars[x][j].fn) {
              this.serverless.service.functions[cloudsideVars[x][j].fn].environment[
                cloudsideVars[x][j].env
              ] = '<RESOURCE NOT PUBLISHED>'
            } else {
              this.serverless.service.provider.environment[
                cloudsideVars[x][j].env
              ] = '<RESOURCE NOT PUBLISHED>'
            }
          }
        })

        return true
      }).catch(e => {
        console.log(e)
      })

    } else {
      return BbPromise.resolve()
    }
  }

}



// Parse the environment variables and return formatted mappings
const parseEnvs = (envs = {},fn) => Object.keys(envs).reduce((vars,key) => {
  let logicalId,ref

  if (envs[key].Ref) {
    logicalId = envs[key].Ref
    ref = { type: 'Ref', env: key, fn }
  } else if (envs[key]['Fn::GetAtt']) {
    logicalId = envs[key]['Fn::GetAtt'][0]
    ref = { type: envs[key]['Fn::GetAtt'][1], env: key, fn }
  } else {
    return vars
  }

  vars[logicalId] = vars[logicalId] ?
    vars[logicalId].concat([ref]) : [ref]

  return vars
},{})



// Build the cloud value based on type
const buildCloudValue = (resource,type) => {
  switch(type) {
    case 'Arn':
      return generateArn(resource)
    default:
      return '<FUNCTION NOT SUPPORTED>'
  }
}

const getRdsResourceType = resourceType => {
  switch(resourceType) {
    case 'dbcluster':
      return 'cluster'
    case 'dbinstance':
      return 'db'
    default:
      return null
  }
}

// Generate the ARN based on service type
// TODO: add more service types or figure out a better way to do this
const generateArn = resource => {

  let stack = resource.StackId.split(':').slice(0,5)
  let resourceType = resource.ResourceType.split('::')
  let serviceType = resourceType[1].toLowerCase()
  stack[2] = serviceType

  switch(serviceType) {
    case 'sqs':
      stack.push(resource.PhysicalResourceId.split('/').slice(-1))
      break
    case 'dynamodb':
    case 'kinesis':
      stack.push(resourceType[2].toLowerCase()+'/'+resource.PhysicalResourceId)
      break
    case 'rds':
      const rdsResourceType = getRdsResourceType(resourceType[2].toLowerCase())
      if (!rdsResourceType) {
        return '<RDS RESOURCE NOT SUPPORTED>'
      }
      stack.push(rdsResourceType)
      stack.push(resource.PhysicalResourceId)
      break
    case 'secretsmanager':
      stack = resource.PhysicalResourceId.split('-').slice(0, -1).join('-').split(':')
      break
    case 's3':
      stack.splice(3,5,'','')
      stack.push(resource.PhysicalResourceId)
      break
    default:
      return '<RESOURCE NOT SUPPORTED>'
  }

  return stack.join(':')
}

module.exports = InvokeCloudside
