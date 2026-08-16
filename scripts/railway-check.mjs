#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';

const token = JSON.parse(
  readFileSync(join(homedir(), '.railway/config.json'), 'utf8'),
).user.token;

const PROJECT_ID = 'b3ab32a9-416f-48f6-ad0b-10b92ec53e47';
const ENV_ID = 'f41a8486-903d-42c2-a3d5-27e7c6243478';
const ORDER_SYNC_SERVICE = '2e7ca533-7702-428e-8dd3-4565b12044bb';

async function gql(query, variables = {}) {
  const response = await fetch('https://backboard.railway.com/graphql/v2', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({query, variables}),
  });
  const json = await response.json();
  if (json.errors?.length) {
    throw new Error(json.errors.map((error) => error.message).join('; '));
  }
  return json.data;
}

function mask(name, value) {
  if (!value) return '(not set)';
  if (/KEY|PAT|TOKEN|SECRET/i.test(name)) {
    return `set (${value.length} chars, ${value.slice(0, 4)}…)`;
  }
  return value;
}

async function upsertVariable({name, value, serviceId}) {
  return gql(
    `
      mutation ($input: VariableUpsertInput!) {
        variableUpsert(input: $input)
      }
    `,
    {
      input: {
        projectId: PROJECT_ID,
        environmentId: ENV_ID,
        serviceId,
        name,
        value,
      },
    },
  );
}

const envData = await gql(
  `
  query ($id: String!) {
    environment(id: $id) {
      name
      variables {
        edges {
          node {
            name
            serviceId
          }
        }
      }
      serviceInstances {
        edges {
          node {
            serviceId
            serviceName
            latestDeployment {
              id
              status
              createdAt
            }
          }
        }
      }
    }
  }
`,
  {id: ENV_ID},
);

const vars = envData.environment.variables.edges.map((edge) => edge.node);
const orderSyncVars = vars.filter(
  (variable) =>
    !variable.serviceId || variable.serviceId === ORDER_SYNC_SERVICE,
);

console.log('Environment:', envData.environment.name);
console.log('\nOrder-sync variable names:');
for (const variable of orderSyncVars.sort((a, b) =>
  a.name.localeCompare(b.name),
)) {
  const scope = variable.serviceId ? 'service' : 'shared';
  console.log(`  ${variable.name} [${scope}]`);
}

const required = [
  'ORDER_SYNC_SHIPPING_AUTOMATION_ENABLED',
  'EASYPOST_API_KEY',
  'AIRTABLE_PAT',
  'SHOPIFY_ACCESS_TOKEN',
];
const names = new Set(orderSyncVars.map((variable) => variable.name));
console.log('\nRequired variable check:');
for (const name of required) {
  console.log(`  ${name}: ${names.has(name) ? 'present' : 'MISSING'}`);
}

const orderSync = envData.environment.serviceInstances.edges.find(
  (edge) => edge.node.serviceId === ORDER_SYNC_SERVICE,
)?.node;

if (orderSync?.latestDeployment) {
  console.log(
    '\nLatest order-sync deployment:',
    orderSync.latestDeployment.status,
    orderSync.latestDeployment.createdAt,
  );
  const logsData = await gql(
    `
    query ($deploymentId: String!) {
      deploymentLogs(deploymentId: $deploymentId, limit: 100) {
        message
      }
    }
  `,
    {deploymentId: orderSync.latestDeployment.id},
  );

  const messages = (logsData.deploymentLogs ?? []).map(
    (entry) => entry.message,
  );
  const interesting = messages.filter((message) =>
    /shipping automation|pickup schedule|poll tick|order-sync/i.test(message),
  );
  console.log('\nRecent order-sync logs:');
  for (const line of interesting.slice(-20)) {
    console.log(' ', line);
  }
}
