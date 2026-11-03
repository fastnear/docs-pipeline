#!/usr/bin/env node

/**
 * Smoke-test representative canonical bespoke routes against the
 * standalone verification runtime. Start it first with `npm run standalone:dev`.
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

const OPERATIONS = [
  '/rpcs/account/view_account',
  '/rpcs/account/view_access_key',
  '/rpcs/block/block_by_height',
  '/rpcs/transaction/tx_status',
  '/rpcs/transaction/tx',
  '/apis/fastnear/v1/account_full',
  '/apis/fastnear/v1/account_full?preset=ecosystem-account',
  '/apis/transactions/v0/transactions',
  '/apis/transactions/v0/account?preset=recent-account-history',
  '/apis/transfers/v0/transfers',
  '/apis/transfers/v0/transfers?preset=recent-near-transfers',
  '/apis/kv-fastdata/v0/multi',
  '/apis/neardata/v0/block',
  '/apis/neardata/v0/block?preset=genesis&network=testnet',
  '/apis/neardata/v0/first_block',
  '/apis/neardata/system/health',
];

const BODY_TESTS = [
  {
    path: '/rpcs/block/block_by_height',
    body: { jsonrpc: '2.0', id: 'fastnear', method: 'block', params: { block_id: 186464793 } }
  },
  {
    path: '/rpcs/account/view_account',
    body: { jsonrpc: '2.0', id: 'fastnear', method: 'query', params: { request_type: 'view_account', finality: 'final', account_id: 'near' } }
  },
  {
    path: '/apis/transactions/v0/account',
    body: { account_id: 'intents.near', desc: true, is_real_signer: true, is_success: true, limit: 50 }
  },
  {
    path: '/apis/transfers/v0/transfers',
    body: {
      account_id: 'intents.near',
      asset_id: 'near',
      desc: true,
      direction: 'receiver',
      limit: 10,
      min_amount: '1000000000000000000000000'
    }
  },
  {
    path: '/apis/neardata/v0/first_block?apiKey=test-key',
    body: null
  }
];

const cliBaseUrl = process.argv[2];
const envBaseUrl = process.env.BASE_URL;
const PORT = process.env.PORT || 4010;
const BASE_URL = cliBaseUrl || envBaseUrl || `http://127.0.0.1:${PORT}`;
const TRANSPORT = BASE_URL.startsWith('https://') ? https : http;

function fetchUrl(url) {
  const transport = url.startsWith('https://') ? https : http;

  return new Promise((resolve) => {
    transport
      .get(url, (res) => {
        resolve(res);
      })
      .on('error', (err) => {
        resolve({ error: err });
      });
  });
}

async function testUrl(path, redirects = 0) {
  const url = `${BASE_URL}${path}`;
  const res = await fetchUrl(url);

  if (res.error) {
    console.log(`❌ ${path} - Error: ${res.error.message}`);
    return false;
  }

  if (
    res.statusCode &&
    res.statusCode >= 300 &&
    res.statusCode < 400 &&
    res.headers.location &&
    redirects < 5
  ) {
    const redirectUrl = new URL(res.headers.location, url);
    const redirectedPath = `${redirectUrl.pathname}${redirectUrl.search}`;
    return testUrl(redirectedPath, redirects + 1);
  }

  if (res.statusCode === 200) {
    console.log(`✅ ${path} - OK`);
    return true;
  }

  if (res.statusCode === 404) {
    console.log(`❌ ${path} - NOT FOUND`);
    return false;
  }

  console.log(`⚠️  ${path} - Status: ${res.statusCode}`);
  return false;
}

async function runTests() {
  console.log(`Testing canonical bespoke routes at ${BASE_URL}\n`);
  
  let results = {
    passed: 0,
    failed: 0
  };
  const failedPaths = [];
  
  for (const path of OPERATIONS) {
    const success = await testUrl(path);
    if (success) {
      results.passed++;
    } else {
      results.failed++;
      failedPaths.push(path);
    }
  }

  console.log('\n--- Body param tests ---\n');

  for (const { path, body } of BODY_TESTS) {
    const separator = path.includes('?') ? '&' : '?';
    const fullPath = body
      ? `${path}${separator}body=${encodeURIComponent(JSON.stringify(body))}`
      : path;
    const success = await testUrl(fullPath);
    if (success) {
      results.passed++;
    } else {
      results.failed++;
      failedPaths.push(fullPath);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`Results: ${results.passed} passed, ${results.failed} failed`);
}

// Check if server is running first
TRANSPORT.get(BASE_URL, (res) => {
  runTests();
}).on('error', () => {
  console.error(`❌ Endpoint not reachable at ${BASE_URL}`);
  if (!cliBaseUrl && !envBaseUrl) {
    console.log('\nStart the standalone runtime first:');
    console.log('  npm run standalone:dev');
  }
  process.exit(1);
});
