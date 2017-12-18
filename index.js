/**
 * @author Rajeesh <rajeesh.k@iinerds.com>
 * @version: 0.3
 * @desc: This fucntion will create the BasePAth mapping for the "staging" stage for the staging domain api.
 * 
 */

'use strict'

const jsonQuery = require('json-query');
var AWS = require('aws-sdk');

/**
 * Define AWS API version
 */

AWS.config.apiVersions = {
  /**
   * Not sure about the version info of the APIs! 
   * AWS maintains this way
   */  
  cloudformation: '2010-05-15', 
  codepipeline: '2015-07-09',
  apigateway: '2015-07-09'
};

var cloudformation = new AWS.CloudFormation();
var codepipeline = new AWS.CodePipeline();
var apigateway = new AWS.APIGateway();
var lammbda = new AWS.Lambda();

//var stagingDomain = "cicdtest-staging.appcohesion.io";

// Lambda handler starts here.
exports.handler = function(event, context, callback) {

    //Retrieve the CodePipeline ID 
    var jobId = event["CodePipeline.job"].id;

    /**
     * Retrieve the value of UserParameters from the Lambda action configuration in AWS CodePipeline, in this case a URL which will be
     * health checked by this function.
     */
    var userParameters = event["CodePipeline.job"].data.actionConfiguration.configuration.UserParameters;
    var stackName = userParameters.stackName;
    var stageDomain =  userParameters.stageDomain;
    var stageName =  userParameters.stageName;

    // Define the Cloudformation stack parameters. The processed CF template need to be used.     
    var stackParams = {
        StackName: stackName || '',
        TemplateStage: 'Processed'
    };

    // REST Api Id of the deployed API.
    var restApiIdVal;

    var putJobSuccess = function(message) {

        // Define the Cloudformation stack parameters. The processed CF template need to be used.    
        var cpParams = {
            jobId: jobId
        };

        /**
        * CodePipeline JobSuccess method as required by CodePipeline.
        */
        codepipeline.putJobSuccessResult(cpParams, function(err, data) {
            if (err) {
                callback(err);
            }
            else {
                /**
                * Get the CF Processed template for getting the API and Function name.
                */
                cloudformation.getTemplate(stackParams, function(err, data) {
                    if (err) { 
                        callback(err);
                    }
                    else {
                        /**
                        * Processed Template body.
                        * Retreive the API Name, as defined in the SAM template, which is extracted here.
                        */
                        var templateBody = data.TemplateBody;
                        var jsonTemplate = JSON.parse(templateBody);
                        var restApiName = jsonTemplate.Resources.CCTApi.Properties.Name;
                        var functionName = jsonTemplate.Resources.CCTFunction.Properties.FunctionName;

                        // Define the API List parameters.    
                        var apiListParams = {
                            limit: 20,   
                        };

                        /**
                         * Get the current BasePath parameters
                         */
                        var getBasePathParams = {
                            basePath: restApiName, /* required */
                            /**
                             * This has to be harcoded. We will hardly going to have dynamic
                             * domain names. And the "staging" stage completely on this domain.
                             */
                            domainName: stageDomain /* required */
                        };

                        // Retrieve All the API and then pass the Rest API Id to retrieve the correct API.
                        apigateway.getRestApis(apiListParams, function(err, data) {
                            if (err) { // Do nothig.
                            }    
                            else {
                                /**
                                 * Get the REST API here.
                                 */
                                var currentApiData = jsonQuery('items[name=' + restApiName+ '].id', {
                                    data: data
                                }) 
                                
                                restApiIdVal = currentApiData.value; // REST API Id.
                                
                                /**
                                 * Define the BasePath parameters. Note that this will create the base path 
                                 * only for "staging" stage.
                                 */
                                var createBasePathParams = {
                                    domainName: stageDomain, /* required */
                                    restApiId: restApiIdVal, /* required */
                                    basePath: restApiName, /* This is the API URI */
                                    stage: stageName
                                };

                                /**
                                 * Create BasePath mapping for "staging" stage. Indeed, the BasePath mapping 
                                 * of stage depend on the subdomain of the stage of the API.
                                 */
                                apigateway.getBasePathMapping(getBasePathParams, function(err, data) {
                                    if (data === null) {
                                        /**
                                         * Create BasePath based on the UserParameters passed in.
                                         */
                                        apigateway.createBasePathMapping(createBasePathParams, function(err, data) {
                                            if (err) console.log(err, err.stack); // an error occurred
                                            else     console.log(data);           // successful response
                                        });
                                    }
                                });
                            }
                        });   
                    }
                });
                callback(null, message); // We are done.
            }    
        });    
    }    

    // Notify AWS CodePipeline of a failed job
    var putJobFailure = function(message) {
        /**
         * Failure params.
         */
        var failureParams = {
            jobId: jobId,
            failureDetails: {
                message: JSON.stringify(message),
                type: 'JobFailed',
                externalExecutionId: context.invokeid
            }
        };
        codepipeline.putJobFailureResult(failureParams, function(err, data) {
            context.fail(message);      
        });
    };

    // Validate the URL passed in UserParameters
    if(!stackName) {
        putJobFailure('The UserParameters field must contain the Stack Name!');  
        return;
    }

    /**
     * Big stuff starts here.
     */
    putJobSuccess('Success');
};