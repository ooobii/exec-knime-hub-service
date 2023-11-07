const core = require('@actions/core');
const axios = require('axios');

function errorEncountered(errorMsg, exit = true) {
  process.stdout.write(errorMsg + "\n");
  core.setFailed(errorMsg);
  if(exit) process.exit();
}

let baseUrl = '';
let hostName = '';
let auth = {};
let deploymentId = '';
let jobId = '';
let asyncMode = false;
let resetWorkflow = true;
let loadTimeout = 5000;
let executeTimeout = false;

function getHeaders() {
  return {
    'Authorization': 'Basic ' + Buffer.from(auth.username + ':' + auth.password).toString('base64'),
    'Content-Type': 'application/json'
  }
}

async function validate() {

  process.stdout.write("✔️ Running pre-checks...\n");

  //form base api url
  baseUrl = core.getInput('url');
  if (!baseUrl.startsWith("https://") && !baseUrl.startsWith("http://")) {
    errorEncountered("ERROR ❌: Please provide a valid API endpoint.");
  }
  if (baseUrl.endsWith("/")) {
    baseUrl = baseUrl.slice(0, -1);
  }
  process.stdout.write("  | ✅ Endpoint URL: " + baseUrl + "/\n");


  //extract DNS name from URL
  hostName = baseUrl.split("/")[2];
  await require('ping').promise.probe(hostName).then(
    function (res) {
      if (!res.alive) {
        errorEncountered("ERROR ❌: " + hostName + " is not reachable.");
      }
      process.stdout.write("  | ✅ Ping: " + hostName + "\n");
    }
  );


  //check for valid auth credentials
  const apiId = core.getInput('auth_id');
  const apiPassword = core.getInput('auth_key');
  if (!apiId || !apiPassword) {
    errorEncountered("ERROR ❌: Please provide valid API credentials; must include id and key.");
  } else {
    process.stdout.write("  | ✅ API User ID: *** \n");
    process.stdout.write("  | ✅ API Key: ***\n");
  }
  auth = {
    username: apiId,
    password: apiPassword
  };


  //verify deployment ID is valid
  deploymentId = core.getInput('deployment_id');
  if(!deploymentId.startsWith("rest:")) {
    errorEncountered("ERROR ❌: Please provide a valid deployment ID; must start with 'rest:'.");
  }
  var deploymentUrl = baseUrl + "/deployments/" + deploymentId;
  var response = await fetch(deploymentUrl, { method: 'GET', headers: getHeaders() });
  if (response.status != 200) {
    var responseText = await response.text();
    errorEncountered(`ERROR ❌: Failed to resolve deployment ID: ${responseText}`);
  }  
  process.stdout.write(`  | ✅ KNIME Deployment: ${deploymentId}\n`);


  //async state check
  asyncMode = core.getInput('async');
  if(asyncMode === "") {
    process.stdout.write("  | ⚠️  Async Mode: Not set! Using synchronous mode...\n");
    asyncMode = false;
  }
  if(asyncMode === "true" || asyncMode === true) {
    process.stdout.write("  | ✅ Async Mode: Yes\n");
    asyncMode = true;
  } else {
    process.stdout.write("  | ✅ Async Mode: No\n");
    asyncMode = false;
  }


  //reset workflow check
  resetWorkflow = core.getInput('reset');
  if(resetWorkflow === "") {
    process.stdout.write("  | ⚠️  Reset Workflow: Not set! Using default 'true'...\n");
    resetWorkflow = false;
  }
  if(resetWorkflow === "true" || resetWorkflow === true) {
    process.stdout.write("  | ✅ Reset Workflow: Yes\n");
    resetWorkflow = true;
  } else {
    process.stdout.write("  | ✅ Reset Workflow: No\n");
    resetWorkflow = false;
  }


  //load timeout
  loadTimeout = core.getInput('load_timeout');
  if(loadTimeout === "") {
    process.stdout.write("  | ⚠️  Load Timeout: Not set! Using default timeout of 30 seconds...\n");
    loadTimeout = 30;
  } else {
    loadTimeout = parseInt(loadTimeout);
    if(isNaN(loadTimeout)) {
      errorEncountered("ERROR ❌: Please provide a valid load timeout value.");
    }
    process.stdout.write(`  | ✅ Load Timeout: ${loadTimeout} seconds\n`);
  }


  //execute timeout
  executeTimeout = core.getInput('execute_timeout');
  if(executeTimeout === "") {
    process.stdout.write("  | ⚠️  Execute Timeout: Not set! Disabling...\n");
    executeTimeout = false;
  } else {
    executeTimeout = parseInt(executeTimeout);
    if(isNaN(executeTimeout)) {
      errorEncountered("ERROR ❌: Please provide a valid execution timeout value.");
    }
    if(executeTimeout <= 0) {
      process.stdout.write("  | ⚠️  Execute Timeout: Non-positive value! Disabling...\n");
      executeTimeout = false;
    } else {
      process.stdout.write(`  | ✅ Execute Timeout: ${executeTimeout} seconds\n`);
    }
  }


  process.stdout.write("✔️ Pre-checks complete.\n");

}

async function execute() {

  process.stdout.write(" 🛄 Creating KNIME Job... ")
  try {
    var createJobUrl = new URL( `${baseUrl}/deployments/${deploymentId}/jobs`);
    createJobUrl.searchParams.append('asyncLoading', "false");
    var createJobResponse = await fetch(createJobUrl, { method: 'POST', headers: getHeaders() });
    if (createJobResponse.status != 201) {
      var responseText = await createJobResponse.text();
      throw new Error(responseText);
    }
    var createJobResponseJson = await createJobResponse.json();
    jobId = createJobResponseJson.id;
  } catch (error) {
    process.stdout.write(`❌ ERROR\n`);
    errorEncountered(`Failed to create KNIME job: ${error}`);
  }
  process.stdout.write(` ✅ Job ID: ${jobId}\n`);
  

  process.stdout.write(` 🔄 Waiting for workflow to be ready...`);
  try {
    var jobStatus = "NOT_READY";
    let counter = 0;
    do {
      jobStatus = await getJobState();
      if(jobStatus !== "IDLE") {
        await new Promise(r => setTimeout(r, 1000));
        process.stdout.write(".");
        counter++;
      }
    } while (jobStatus !== "IDLE" && counter < loadTimeout);
    if(jobStatus !== "IDLE") {
      throw new Error(`Workflow failed to initialize after ${loadTimeout} seconds. Current status: ${jobStatus}`);
    }
  } catch(error) {
    process.stdout.write(`❌ ERROR\n`);
    errorEncountered(`Failed to execute KNIME workflow: ${error}`);
  }
  process.stdout.write(` ✅ Workflow Ready\n`);


  process.stdout.write(` 🚀 Executing KNIME Workflow...`);
  try {
    var executeJobUrl = new URL( `${baseUrl}/jobs/${jobId}`);
    executeJobUrl.searchParams.append('reset', resetWorkflow ? "true" : "false");
    executeJobUrl.searchParams.append('async', asyncMode ? "true" : "false");
    executeJobUrl.searchParams.append('timeout', asyncMode ? "-1" : (executeTimeout ? executeTimeout * 1000 : "-1"));
    var executeJobResponse = await fetch(
      executeJobUrl, 
      {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(JSON.parse(core.getInput('parameters') ?? "{}"))
      }
    );
    if (executeJobResponse.status != 200) {
      var responseText = await executeJobResponse.text();
      throw new Error(responseText);
    }
  } catch(error) {
    process.stdout.write(`❌ ERROR\n`);
    errorEncountered(`Failed to execute KNIME workflow: ${error}`);
  }
  process.stdout.write(` ✅ Workflow Executed\n`);


  if(!asyncMode) {
    process.stdout.write(` ⏱️ Waiting for workflow to complete...`);
    try {
      var jobStatus = "EXECUTING";
      let counter = 0;
      do {
        jobStatus = await getJobState();
        if(jobStatus !== "EXECUTION_FINISHED") {
          await new Promise(r => setTimeout(r, 1000));
          process.stdout.write(".");
          counter++;
        }
      } while (jobStatus !== "EXECUTION_FINISHED" && counter < executeTimeout);
      if(jobStatus !== "EXECUTION_FINISHED") {
        throw new Error(`Workflow failed to complete after ${executeTimeout} seconds. Current status: ${jobStatus}`);
      }
    } catch(error) {
      process.stdout.write(`❌ ERROR\n`);
      errorEncountered(`Failed to execute KNIME workflow: ${error}`);
    }
    process.stdout.write(` ✅ Workflow Complete\n`);
  }

}

async function getJobState() {
  var jobStatusUrl = new URL( `${baseUrl}/deployments/${deploymentId}/jobs`);
  var jobStatusResponse = await fetch(jobStatusUrl, { method: 'GET', headers: getHeaders() });
  if (jobStatusResponse.status != 200) {
    var responseText = await jobStatusResponse.text();
    throw new Error("server said: " + responseText);
  }
  var jobStatusResponseJson = await jobStatusResponse.json();
  var job = jobStatusResponseJson.jobs.find(item => item.id === jobId);
  if(!job) {
    throw new Error(`Job ID '${jobId}' not found in deployment.`);
  }
  return job.state;
}

process.stdout.write("🚀 GitHub Actions + KNIME Business Hub: Execute Workflow\n");
process.stdout.write("-------------------------------------------------------\n");

validate().then(execute);
