const DISCOVERY_NETWORKS = {
  mainnet: {
    changesAccount: 'root.near',
    discoveryAccounts: ['intents.near', 'near-intents.near'],
    publicKeyAccount: 'root.near',
    txIndexUrl: 'https://tx.main.fastnear.com',
    url: 'https://rpc.mainnet.fastnear.com',
  },
  testnet: {
    changesAccount: 'root.testnet',
    discoveryAccounts: ['root.testnet'],
    publicKeyAccount: 'root.testnet',
    txIndexUrl: null,
    url: 'https://rpc.testnet.fastnear.com',
  },
};

const MUTATING_RPC_METHODS = new Set([
  'broadcast_tx_async',
  'broadcast_tx_commit',
  'send_tx',
]);

const SUBSET_OPERATION_IDS = [
  'view_account',
  'block_by_height',
  'chunk_by_hash',
  'changes',
  'tx_status',
  'tx',
  'light_client_proof',
  'validators_by_epoch',
];

const TESTNET_GLOBAL_CONTRACT_EXAMPLES = {
  byAccountId: 'ft.globals.primitives.testnet',
  byCodeHash: '3vaopJ7aRoivvzZLngPQRBEd8VJr2zPLTxQfnRCoFgNX',
};

const MAINNET_GLOBAL_CONTRACT_EXAMPLES = {
  byAccountId: 'global-contract.nfts.tg',
  byCodeHash: 'A2VxywASqbnarBAfTWobhDZjMXobjnYyJmkjhoXAiYBz',
};

const METRICS_AUDIT_ENV_VAR = 'FASTNEAR_API_KEY';

const TRACKED_RPC_EXAMPLE_FOLLOWUPS = [
  {
    id: 'metrics-authenticated-audit',
    networks: ['mainnet', 'testnet'],
    operationIds: ['metrics'],
    reason: 'The live endpoint is HTTP GET /metrics and requires an API key.',
    nextStep: `Set ${METRICS_AUDIT_ENV_VAR} to validate metrics in the audit path.`,
  },
  {
    id: 'mutating-transaction-validation',
    networks: ['mainnet', 'testnet'],
    operationIds: ['broadcast_tx_async', 'broadcast_tx_commit', 'send_tx'],
    reason: 'Mutating transaction submission methods are intentionally excluded from live audit.',
    nextStep:
      'Keep them out of CI and validate them with a dedicated signed-transaction harness or manual checklist.',
  },
];

const CURATED_RPC_EXAMPLE_PARAMS = {
  call_function: {
    mainnet: {
      account_id: 'contract.near',
      args_base64: 'e30=',
      finality: 'final',
      method_name: 'get_info',
      request_type: 'call_function',
    },
    testnet: {
      account_id: 'contract.testnet',
      args_base64: 'e30=',
      finality: 'final',
      method_name: 'get_info',
      request_type: 'call_function',
    },
  },
  maintenance_windows: {
    mainnet: {
      account_id: 'root.near',
    },
    testnet: {
      account_id: 'root.testnet',
    },
  },
  view_code: {
    mainnet: {
      account_id: 'intents.near',
      finality: 'final',
      request_type: 'view_code',
    },
    testnet: {
      account_id: 'guest-book.testnet',
      finality: 'final',
      request_type: 'view_code',
    },
  },
  view_state: {
    mainnet: {
      account_id: 'lockup.near',
      finality: 'final',
      prefix_base64: 'U1RBVEU=',
      request_type: 'view_state',
    },
    testnet: {
      // v1.signer-prod.testnet returns TOO_LARGE_CONTRACT_STATE; counter.testnet
      // has a single small key that an empty prefix returns in full.
      account_id: 'counter.testnet',
      finality: 'final',
      prefix_base64: '',
      request_type: 'view_state',
    },
  },
  EXPERIMENTAL_receipt_to_tx: {
    // Resolves only on the archival endpoint (servers set to archival-rpc) with a
    // block_height anchor near the receipt; without block_height the node returns
    // UNKNOWN_RECEIPT.
    mainnet: {
      receipt_id: 'ETMK9HmPsAYcNxfSXBejMWQs57W4Ph5HDYoYhDMpotQn',
      block_height: 194263442,
    },
    testnet: {
      receipt_id: '9uJmhNCLRgsFncH3anffPLE1YsZCPTyAZrBdekc3vTaZ',
      block_height: 246016180,
    },
  },
};

// Portal-owned interaction metadata: which endpoint an example must EXECUTE
// against. This is deliberately not expressed in the OpenAPI `servers:` key.
//
// `servers:` is contract data — it declares where an operation lives, and every
// method below is served correctly by the regular RPC. What needs archival is
// the example DATA: each of these pages documents a historical lookup and pins a
// past block / chunk / tx / receipt / epoch. The regular RPC retains roughly
// 113,750 blocks (~29 hours), after which those pins return UNKNOWN_* or hang.
//
// Putting the archival host in `servers:` would tell every spec consumer — SDK
// generators, MCP tools, agents — that the method itself requires archival,
// which is false. It also would not survive `npm run generate-rpc`, which
// rebuilds each leaf spec from scratch.
const ARCHIVAL_HOSTS = {
  mainnet: 'https://archival-rpc.mainnet.fastnear.com',
  testnet: 'https://archival-rpc.testnet.fastnear.com',
};

const HISTORICAL_PIN_REASON =
  'This example pins a specific historical record, which the standard RPC drops ' +
  'from its ~29 hour retention window. The method itself works on the standard RPC ' +
  'for recent data.';

// Applied to BOTH networks for every entry, on purpose. A few of these currently
// resolve on the regular RPC for one network, but only incidentally:
// block_by_height/block_by_id pin block 9820210, an early-mainnet block the
// regular RPC still happens to serve, and validators_by_epoch pins a testnet
// epoch that will age out. Per-network exceptions built on that would rot and
// read as unexplained asymmetry.
const ARCHIVAL_EXAMPLE_NETWORKS = ['mainnet', 'testnet'];

const ARCHIVAL_EXAMPLES = {
  block_by_height: { reason: 'Pinned block height, older than standard RPC retention.' },
  block_by_id: { reason: 'Pinned block hash, older than standard RPC retention.' },
  chunk_by_block_shard: { reason: 'Pinned parent block, older than standard RPC retention.' },
  chunk_by_hash: { reason: 'Pinned chunk hash, older than standard RPC retention.' },
  EXPERIMENTAL_congestion_level: { reason: 'Pinned block, older than standard RPC retention.' },
  EXPERIMENTAL_light_client_block_proof: { reason: 'Pinned block, older than standard RPC retention.' },
  EXPERIMENTAL_light_client_proof: { reason: 'Pinned transaction, older than standard RPC retention.' },
  gas_price_by_block: { reason: 'Pinned block, older than standard RPC retention.' },
  light_client_proof: { reason: 'Pinned transaction, older than standard RPC retention.' },
  next_light_client_block: { reason: 'Pinned light-client head, older than standard RPC retention.' },
  EXPERIMENTAL_receipt: { reason: 'Pinned receipt, older than standard RPC retention.' },
  EXPERIMENTAL_receipt_to_tx: { reason: 'Pinned receipt plus block_height anchor, older than standard RPC retention.' },
  EXPERIMENTAL_tx_status: { reason: 'Pinned transaction, older than standard RPC retention.' },
  tx_status: { reason: 'Pinned transaction, older than standard RPC retention.' },
  tx: { reason: 'Pinned transaction, older than standard RPC retention.' },
  EXPERIMENTAL_validators_ordered: { reason: 'Pinned epoch, older than standard RPC retention.' },
  validators_by_epoch: { reason: 'Pinned epoch, older than standard RPC retention.' },
};

const ALLOWED_RPC_PLACEHOLDERS = {
  // The EXPERIMENTAL_receipt_to_tx testnet allowance is gone on purpose: that
  // example now carries a real, index-resolvable receipt id plus a block_height
  // anchor, so there is no longer a placeholder to excuse.
  view_state: {
    testnet: {
      prefix_base64: {
        value: '',
        reason:
          'Empty prefix is meaningful rather than unresolved: it reads the contract\'s full ' +
          'key set. counter.testnet holds a single small key, so an unfiltered read stays ' +
          'inside the response limit, whereas the previous v1.signer-prod.testnet example ' +
          'returned TOO_LARGE_CONTRACT_STATE.',
      },
    },
  },
};

const MANUAL_RPC_EXAMPLE_OVERRIDES = {
  EXPERIMENTAL_protocol_config: {
    mainnet: { finality: 'final' },
    testnet: { finality: 'final' },
  },
  changes: {
    mainnet: {
      account_ids: ['root.near'],
      changes_type: 'account_changes',
      finality: 'final',
    },
    testnet: {
      account_ids: ['root.testnet'],
      changes_type: 'account_changes',
      finality: 'final',
    },
  },
  latest_block: {
    mainnet: { finality: 'optimistic' },
    testnet: { finality: 'optimistic' },
  },
  block_effects: {
    // Evergreen: query the latest block's effects instead of a pinned block_id
    // that ages out of the non-archival RPC's retention window.
    mainnet: { finality: 'final' },
    testnet: { finality: 'final' },
  },
  validators_by_epoch: {
    // Testnet is periodically reset, so pin a recent archival-resolvable epoch.
    testnet: { epoch_id: 'BARiarhzfSL7G737ik4AukX9sFYH1iR3dYU3KNUAvF3e' },
  },
  light_client_proof: {
    // The example fields are transaction_hash + sender_id, which correspond to
    // type: transaction. type: receipt would require receipt_id + receiver_id.
    mainnet: { type: 'transaction' },
    testnet: { type: 'transaction' },
  },
  EXPERIMENTAL_light_client_proof: {
    mainnet: { type: 'transaction' },
    testnet: { type: 'transaction' },
  },
  view_code: {
    mainnet: { account_id: 'intents.near' },
    testnet: { account_id: 'guest-book.testnet' },
  },
  view_global_contract_code: {
    mainnet: { code_hash: MAINNET_GLOBAL_CONTRACT_EXAMPLES.byCodeHash },
    testnet: { code_hash: TESTNET_GLOBAL_CONTRACT_EXAMPLES.byCodeHash },
  },
  view_global_contract_code_by_account_id: {
    mainnet: { account_id: MAINNET_GLOBAL_CONTRACT_EXAMPLES.byAccountId },
    testnet: { account_id: TESTNET_GLOBAL_CONTRACT_EXAMPLES.byAccountId },
  },
};

const AUDIT_SKIPS = {
  // receipt→tx resolution needs a save_receipt_to_tx-enabled node. The docs
  // example resolves on the archival endpoint (this operation is flagged in
  // ARCHIVAL_EXAMPLES) with a block_height anchor near the receipt, but the
  // public nodes behind the audit do not expose the mapping reliably, so it
  // stays excluded from the live audit.
  EXPERIMENTAL_receipt_to_tx: {
    mainnet: {
      skip: true,
      reason: 'receipt→tx requires a save_receipt_to_tx-enabled node; the public endpoints do not resolve it reliably.',
    },
    testnet: {
      skip: true,
      reason: 'receipt→tx requires a save_receipt_to_tx-enabled node; the public endpoints do not resolve it reliably.',
    },
  },
};

function cloneJson(value) {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value));
}

function getManualOverride(operationId, network) {
  return MANUAL_RPC_EXAMPLE_OVERRIDES[operationId]?.[network];
}

function getCuratedRpcExampleParams(operationId, network) {
  return cloneJson(CURATED_RPC_EXAMPLE_PARAMS[operationId]?.[network]);
}

function getRpcExampleParamOverride(operationId, network) {
  const curated = getCuratedRpcExampleParams(operationId, network) || {};
  const manual = getManualOverride(operationId, network) || {};
  const merged = { ...curated };

  for (const [key, value] of Object.entries(manual)) {
    if (key === 'skipAudit' || key === 'skipReason') {
      continue;
    }

    merged[key] = cloneJson(value);
  }

  return Object.keys(merged).length > 0 ? merged : null;
}

function getAllowedRpcPlaceholders(operationId, network) {
  return cloneJson(ALLOWED_RPC_PLACEHOLDERS[operationId]?.[network]) || {};
}

/**
 * Returns `{ url, reason }` when this operation's example for `network` must be
 * executed against the archival endpoint, otherwise null. Consumed by
 * generate-page-models.js (to pick networks[].url) and audit-rpc-examples.js
 * (so the live audit resolves the same endpoint the docs widget uses).
 */
function getArchivalExample(operationId, network) {
  const entry = ARCHIVAL_EXAMPLES[operationId];
  if (!entry) {
    return null;
  }

  const networks = entry.networks || ARCHIVAL_EXAMPLE_NETWORKS;
  if (!networks.includes(network)) {
    return null;
  }

  const url = ARCHIVAL_HOSTS[network];
  if (!url) {
    return null;
  }

  return { url, reason: entry.reason || HISTORICAL_PIN_REASON };
}

function getAuditSkip(operationId, network) {
  const auditSkip = AUDIT_SKIPS[operationId]?.[network];
  if (auditSkip) {
    return auditSkip;
  }

  const manualOverride = getManualOverride(operationId, network);
  if (manualOverride?.skipAudit) {
    return {
      skip: true,
      reason: manualOverride.skipReason || 'Audit disabled for this example.',
    };
  }

  return null;
}

module.exports = {
  ALLOWED_RPC_PLACEHOLDERS,
  ARCHIVAL_EXAMPLES,
  ARCHIVAL_HOSTS,
  AUDIT_SKIPS,
  CURATED_RPC_EXAMPLE_PARAMS,
  DISCOVERY_NETWORKS,
  METRICS_AUDIT_ENV_VAR,
  MANUAL_RPC_EXAMPLE_OVERRIDES,
  MUTATING_RPC_METHODS,
  SUBSET_OPERATION_IDS,
  MAINNET_GLOBAL_CONTRACT_EXAMPLES,
  TESTNET_GLOBAL_CONTRACT_EXAMPLES,
  TRACKED_RPC_EXAMPLE_FOLLOWUPS,
  getArchivalExample,
  getAuditSkip,
  getAllowedRpcPlaceholders,
  getCuratedRpcExampleParams,
  getManualOverride,
  getRpcExampleParamOverride,
};
