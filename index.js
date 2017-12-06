'use strict'

const jsonQuery = require('json-query');
var AWS = require('aws-sdk');

AWS.config.apiVersions = {
  cloudformation: '2010-05-15',
  lambda: '2015-03-31',
  apigateway: '2015-07-09',
  // other service API versions
};

var cloudformation = new AWS.CloudFormation();
var codepipeline = new AWS.CodePipeline();
var apigateway = new AWS.APIGateway();
var lambda = new AWS.Lambda();

exports.handler = function(event, context, callback) {

    var jobId = event["CodePipeline.job"].id;
    //var stackName = event["CodePipeline.job"].data.inputArtifacts[0].name;

    // Retrieve the value of UserParameters from the Lambda action configuration in AWS CodePipeline, in this case a URL which will be
    // health checked by this function.
    // var stackParams = {
    //     StackName: stackName,
    //     TemplateStage: 'Processed'
    // };
    
    var stackParams = {
        StackName: 'MyBetaStack3',
        TemplateStage: 'Processed'
    };

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

    putJobSuccess('Success');
};