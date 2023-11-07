![Knime Logo](img/knime-logo.png)


# KNIME Business Hub - Execute Service Action

This repository represents a GitHub action that can be used to execute a workflow deployed as a Service on a KNIME Business Hub instance. The runner that executes your GitHub action must have the ability to communicate with the KNIME Business Hub instance. This can be achieved by using a self-hosted runner, by using firewall rules allowing GitHub action runners to communicate with the KNIME Business Hub instance or by using a GitHub action runner that is hosted in the same network as the KNIME Business Hub instance.

## Example
Here is an example step that utilizes this action:
```yaml
name: Example GitHub Action

jobs:
  build:
    runs-on: ubuntu-local

    steps:
    # ...
      - name: Execute KNIME Workflow
        uses: ooobii/exec-knime-hub-service@v1
        with:
          url: https://api.you-knime-hub-instance.com/
          auth_id: <application_password_id>
          auth_key: <application_password_key>
          deployment_id: 'rest:your-deployment-id'
          async: true
          reset: false
          load_timeout: 60
          execute_timeout: -1
          parameters: '{"inputParams": {"param1": "value1", "param2": "value2"}}'
```

## Inputs
### `url`
**Required**: The URL of the KNIME Business Hub instance.

### `auth_id`
**Required**: The ID of the application password that is used to authenticate against the KNIME Business Hub instance.

### `auth_key`
**Required**: The key of the application password that is used to authenticate against the KNIME Business Hub instance.

### `deployment_id`
**Required**: The ID of the deployment that should be executed.

### `async`
*Optional*: Whether the execution should be asynchronous or not. (Default: `false`)
  - If set to `true`, this action will not wait for the workflow to finish before the step concludes.
  - If set to `false`, this action will wait for the workflow to finish before the step concludes.

### `reset`
*Optional*: Whether the workflow should be reset before execution or not. (Default: `false`)
  - If set to `true`, the workflow will be reset before execution.
  - If set to `false`, the workflow will not be reset before execution.

### `load_timeout`
*Optional*: The timeout (in seconds) for loading the workflow. (Default: `60`)

### `execute_timeout`
*Optional*: The timeout (in seconds) for executing the workflow. (Default: `-1`)
  - If the value is 0 or less, the workflow will be executed without a timeout.
  - If set to a positive value, the step will be considered failed of it does not finish within the given time.

### `parameters`
*Optional*: The JSON parameters that are provided to the deployed KNIME Workflow service.

