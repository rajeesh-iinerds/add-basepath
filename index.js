/**
 * @author Rajeesh <rajeesh.k@iinerds.com>
 * @version: 0.3
 */

'use strict'

const jsonQuery = require('json-query');
var AWS = require('aws-sdk');

/**
 * Define AWS API version
 */

AWS.config.apiVersions = {
  cloudformation: '2010-05-15',
  // other service API versions
};

var cloudformation = new AWS.CloudFormation();
var codepipeline = new AWS.CodePipeline();
var apigateway = new AWS.APIGateway();
var lammbda = new AWS.Lambda();

// Lambda handler start here.
exports.handler = function(event, context, callback) {

    //Retrieve the CodePipeline ID 
    var jobId = event["CodePipeline.job"].id;

    /**
     * Retrieve the value of UserParameters from the Lambda action configuration in AWS CodePipeline, in this case a URL which will be
     * health checked by this function.
     */
    var stackName = event["CodePipeline.job"].data.actionConfiguration.configuration.UserParameters; 

    // Define the Cloudformation stack parameters. The processed CF template need to be used.     
    var stackParams = {
        StackName: stackName || '',
        TemplateStage: 'Processed'
    };

    // REST Api Id of the deployed API.
    var restApiIdVal;

    var putJobSuccess = function(message) {

        //console.log(data);
      
        var cpParams = {
            jobId: jobId
        };

        console.log("Job Id: ", jobId);
        //console.log("Stack Name: ", stackName);
        codepipeline.putJobSuccessResult(cpParams, function(err, data) {
            if (err) {
                callback(err);
            }
            else {
                cloudformation.getTemplate(stackParams, function(err, data) {
                    if (err) { 
                        //console.log(err, err.stack);
                        callback(err);
                    }
                    else {
                        var templateBody = data.TemplateBody;
                        var jsonTemplate = JSON.parse(templateBody);
                        var restApiName = jsonTemplate.Resources.CCTApi.Properties.Name;
                        var functionName = jsonTemplate.Resources.CCTFunction.Properties.FunctionName;

                        var apiListParams = {
                            limit: 20,   
                        };

                        console.log(restApiName);
                        
                        var getBasePathParams = {
                            basePath: restApiName, /* required */
                            domainName: 'cicdtest-staging.appcohesion.io' /* required */
                        };

                        apigateway.getRestApis(apiListParams, function(err, data) {
                            if (err) {
                                    //console.log(err, err.stack) 
                            }    
                            else {
                                //console.log(data); 
                                var currentApiData = jsonQuery('items[name=' + restApiName+ '].id', {
                                    data: data
                                }) 
                                
                                restApiIdVal = currentApiData.value;
                                
                                var createBasePathParams = {
                                    domainName: 'cicdtest-staging.appcohesion.io', /* required */
                                    restApiId: restApiIdVal, /* required */
                                    basePath: restApiName,
                                    stage: 'staging'
                                };
                                console.log(getBasePathParams);
                                apigateway.getBasePathMapping(getBasePathParams, function(err, data) {
                                    //if (err) console.log(err, err.stack); // an error occurred
                                    //else {
                                        if (data === null) {
                                              apigateway.createBasePathMapping(createBasePathParams, function(err, data) {
                                                if (err) console.log(err, err.stack); // an error occurred
                                                else     console.log(data);           // successful response
                                              });
                                        }
                                    //}   
                                });
                            }
                        });   
                    }
                });
                callback(null, message);
            }    
        });    
    }    

    // Notify AWS CodePipeline of a failed job
    var putJobFailure = function(message) {
        var params = {
            jobId: jobId,
            failureDetails: {
                message: JSON.stringify(message),
                type: 'JobFailed',
                externalExecutionId: context.invokeid
            }
        };
        codepipeline.putJobFailureResult(params, function(err, data) {
            context.fail(message);      
        });
    };

    // Validate the URL passed in UserParameters
    if(!stackName) {
        putJobFailure('The UserParameters field must contain the Stack Name!');  
        return;
    }

    putJobSuccess('Success');
};