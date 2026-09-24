#!/usr/bin/env node

/*
  Publish the OpenAPI documents agents and tools can fetch from docs.fastnear.com.

  Inputs are the same specs the page models are built from:
    - rpcs/openapi.yaml            aggregate index of $ref'd JSON-RPC leaf specs
    - rpcs/<category>/<op>.yaml    one self-contained document per RPC operation
    - apis/<service>/openapi.yaml  self-contained aggregate per REST service
    - apis/<service>/<group>/<op>.yaml  split leaf per REST operation

  Outputs, mirrored into builder-docs/static/openapi so they are served at
  https://docs.fastnear.com/openapi/...:
    - index.json                       every family with its documents and operations
    - <family>.json / <family>.yaml    one bundled document per family
    - <family>/<operationId>.json|yaml one self-contained document per operation

  Families are the six spec families (rpc + five REST services), not the eleven
  structured-graph sub-families; the RPC sub-families all point at rpc.json.
  Every page model gains an `openapi` block with its own document, its family's
  document, and a JSON-pointer fragment into the family bundle.
*/

const fs = require("fs");
const path = require("path");
const YAML = require("yaml");
const { getFamilyDefinition, getOperationDocsPath } = require("./structured-graph-common");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_ROOT = path.resolve(ROOT, "shared/openapi");
const BUILDER_DOCS_ROOT = path.resolve(ROOT, "../fn/builder-docs");
const BUILDER_DOCS_OPENAPI_ROOT = path.resolve(BUILDER_DOCS_ROOT, "static/openapi");
const PUBLIC_PREFIX = "/openapi";
const RPC_FAMILY = "rpc";

const SPEC_FAMILY_ORDER = ["rpc", "fastnear", "transactions", "transfers", "kv-fastdata", "neardata"];

function readYaml(filePath) {
  return YAML.parse(fs.readFileSync(filePath, "utf8"));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`OpenAPI artifacts: ${message}`);
  }
}

function toPointerToken(segment) {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

// RFC 6901 pointer as a URI fragment: escape ~ and / first, then percent-encode
// the rest so `{account_id}` survives as a fragment.
function buildOperationFragment(pathKey, method) {
  return `#/paths/${encodeURIComponent(toPointerToken(pathKey))}/${method}`;
}

function specFamilyForModel(model) {
  const segments = String(model.canonicalPath || "").split("/").filter(Boolean);
  if (segments[0] === "rpcs") {
    return RPC_FAMILY;
  }
  if (segments[0] === "apis" && segments[1]) {
    return segments[1];
  }
  return null;
}

function familyAggregatePath(family) {
  return family === RPC_FAMILY
    ? path.resolve(ROOT, "rpcs/openapi.yaml")
    : path.resolve(ROOT, `apis/${family}/openapi.yaml`);
}

function familyDocsPath(family) {
  if (family === RPC_FAMILY) {
    return "/rpc";
  }
  const definition = getFamilyDefinition(`/apis/${family}/x`);
  assert(definition, `no family definition for REST family ${family}`);
  return definition.docsPath;
}

function walkRefs(node, visit) {
  if (Array.isArray(node)) {
    node.forEach((entry) => walkRefs(entry, visit));
    return;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (key === "$ref" && typeof value === "string") {
        const next = visit(value);
        if (typeof next === "string") {
          node[key] = next;
        }
      } else {
        walkRefs(value, visit);
      }
    }
  }
}

// Keep only the component schemas an operation document actually references.
function pruneComponentSchemas(document) {
  const schemas = document.components?.schemas;
  if (!schemas) {
    return document;
  }
  const keep = new Set();
  const queue = [];
  walkRefs(document.paths, (ref) => {
    const match = ref.match(/^#\/components\/schemas\/(.+)$/);
    if (match) queue.push(match[1]);
  });
  while (queue.length) {
    const name = queue.pop();
    if (keep.has(name)) continue;
    assert(schemas[name], `dangling schema reference ${name}`);
    keep.add(name);
    walkRefs(schemas[name], (ref) => {
      const match = ref.match(/^#\/components\/schemas\/(.+)$/);
      if (match) queue.push(match[1]);
    });
  }
  document.components.schemas = Object.fromEntries(
    Object.keys(schemas)
      .filter((name) => keep.has(name))
      .map((name) => [name, schemas[name]])
  );
  if (Object.keys(document.components.schemas).length === 0) {
    delete document.components.schemas;
  }
  return document;
}

function parseAggregateRef(ref) {
  const match = String(ref).match(/^\.\/(.+?)#(.+)$/);
  assert(match, `unsupported aggregate $ref ${ref}`);
  return { file: match[1], pointer: match[2] };
}

function resolvePointer(document, pointer) {
  return pointer
    .split("/")
    .slice(1)
    .map((token) => token.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce((node, token) => node?.[token], document);
}

// The RPC aggregate is an index of $refs into leaf files that each define their
// own `JsonRpcResponse`. Inline every operation and give each leaf schema a
// name that cannot collide, rewriting the refs that point at it.
function bundleRpcAggregate(aggregatePath) {
  const aggregate = readYaml(aggregatePath);
  const bundle = {
    openapi: aggregate.openapi,
    info: clone(aggregate.info),
    servers: clone(aggregate.servers || []),
    security: clone(aggregate.security || []),
    paths: {},
    components: { securitySchemes: clone(aggregate.components?.securitySchemes || {}), schemas: {} },
  };
  const rpcsDir = path.dirname(aggregatePath);

  for (const [pathKey, pathValue] of Object.entries(aggregate.paths || {})) {
    const { file, pointer } = parseAggregateRef(pathValue.$ref);
    const leaf = readYaml(path.join(rpcsDir, file));
    const pathItem = clone(resolvePointer(leaf, pointer));
    // Almost every leaf is a JSON-RPC POST on "/", but custom leaves such as
    // /metrics are plain HTTP, so find the operation by whichever method has one.
    const operationEntry = Object.entries(pathItem || {}).find(
      ([, operation]) => operation && typeof operation === "object" && operation.operationId
    );
    assert(operationEntry, `leaf ${file} has no operation with an operationId`);
    const operationId = operationEntry[1].operationId;
    const renames = new Map();

    for (const [name, schema] of Object.entries(leaf.components?.schemas || {})) {
      let target = name;
      const existing = bundle.components.schemas[name];
      if (name === "JsonRpcResponse" || (existing && JSON.stringify(existing) !== JSON.stringify(schema))) {
        target = `${name}_${operationId}`;
      }
      assert(
        !bundle.components.schemas[target] || JSON.stringify(bundle.components.schemas[target]) === JSON.stringify(schema),
        `schema name collision for ${target}`
      );
      renames.set(name, target);
      bundle.components.schemas[target] = clone(schema);
    }

    const rewrite = (ref) => {
      const match = ref.match(/^#\/components\/schemas\/(.+)$/);
      if (match && renames.has(match[1])) {
        return `#/components/schemas/${renames.get(match[1])}`;
      }
      assert(!ref.startsWith("./"), `unresolved file reference ${ref} in ${file}`);
      return undefined;
    };
    walkRefs(pathItem, rewrite);
    for (const target of new Set(renames.values())) {
      walkRefs(bundle.components.schemas[target], rewrite);
    }

    bundle.paths[pathKey] = pathItem;
  }

  return bundle;
}

function loadFamilyDocument(family) {
  const aggregatePath = familyAggregatePath(family);
  assert(fs.existsSync(aggregatePath), `missing aggregate for ${family}: ${aggregatePath}`);
  return family === RPC_FAMILY ? bundleRpcAggregate(aggregatePath) : readYaml(aggregatePath);
}

function findOperationInDocument(document, operationId) {
  for (const [pathKey, pathItem] of Object.entries(document.paths || {})) {
    for (const [method, operation] of Object.entries(pathItem || {})) {
      if (operation && typeof operation === "object" && operation.operationId === operationId) {
        return { method, pathKey };
      }
    }
  }
  return null;
}

function buildOperationDocument(model, family) {
  const leaf = clone(readYaml(path.resolve(ROOT, model.sourceSpec)));
  return family === RPC_FAMILY ? leaf : pruneComponentSchemas(leaf);
}

function buildOpenApiArtifacts(models) {
  const files = new Map();
  const specs = [];

  for (const family of SPEC_FAMILY_ORDER) {
    const familyModels = models.filter((model) => specFamilyForModel(model) === family);
    assert(familyModels.length > 0, `no page models for family ${family}`);
    const document = loadFamilyDocument(family);
    const familyJson = `${PUBLIC_PREFIX}/${family}.json`;
    const familyYaml = `${PUBLIC_PREFIX}/${family}.yaml`;
    files.set(`${family}.json`, document);
    files.set(`${family}.yaml`, document);

    const seen = new Set();
    const operations = [];
    for (const model of familyModels) {
      const operationId = model.info?.operationId;
      assert(operationId && /^[A-Za-z0-9_.-]+$/.test(operationId), `unsafe operationId for ${model.pageModelId}: ${operationId}`);
      assert(!seen.has(operationId), `duplicate operationId ${operationId} in ${family}`);
      seen.add(operationId);
      const location = findOperationInDocument(document, operationId);
      assert(location, `${operationId} not found in the ${family} bundle`);
      const operationDocument = buildOperationDocument(model, family);
      assert(findOperationInDocument(operationDocument, operationId), `${operationId} missing from its own document`);
      const json = `${PUBLIC_PREFIX}/${family}/${operationId}.json`;
      const yaml = `${PUBLIC_PREFIX}/${family}/${operationId}.yaml`;
      const pointer = `${familyJson}${buildOperationFragment(location.pathKey, location.method)}`;
      files.set(`${family}/${operationId}.json`, operationDocument);
      files.set(`${family}/${operationId}.yaml`, operationDocument);

      const openapi = { family, familyJson, familyYaml, json, pointer, yaml };
      // Keep page-model keys alphabetical, matching the generator's object literal.
      const withOpenApi = Object.fromEntries(Object.entries({ ...model, openapi }).sort(([a], [b]) => a.localeCompare(b)));
      for (const key of Object.keys(model)) delete model[key];
      Object.assign(model, withOpenApi);

      operations.push({
        canonicalPath: model.canonicalPath,
        docsPath: getOperationDocsPath(model.canonicalPath),
        json,
        method: location.method.toUpperCase(),
        operationId,
        pageModelId: model.pageModelId,
        path: location.pathKey,
        pointer,
        summary: model.info?.summary || null,
        yaml,
      });
    }

    specs.push({
      docsPath: familyDocsPath(family),
      id: family,
      json: familyJson,
      kind: family === RPC_FAMILY ? "json-rpc" : "rest",
      openapi: document.openapi,
      operations,
      servers: (document.servers || []).map((server) => ({ description: server.description || null, url: server.url })),
      title: document.info?.title || family,
      version: document.info?.version || null,
      yaml: familyYaml,
    });
  }

  const index = {
    description: "OpenAPI documents for every FastNear API family and operation published on docs.fastnear.com.",
    site: "https://docs.fastnear.com",
    specs,
  };
  files.set("index.json", index);
  return { files, index };
}

function serialize(name, document) {
  return name.endsWith(".yaml")
    ? YAML.stringify(document, { lineWidth: 0 })
    : `${JSON.stringify(document, null, 2)}\n`;
}

function writeTree(root, files) {
  fs.rmSync(root, { recursive: true, force: true });
  for (const [name, document] of files) {
    const target = path.join(root, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, serialize(name, document), "utf8");
  }
}

function writeOpenApiArtifacts({ files }) {
  writeTree(OUTPUT_ROOT, files);
  if (fs.existsSync(BUILDER_DOCS_ROOT)) {
    writeTree(BUILDER_DOCS_OPENAPI_ROOT, files);
  }
}

module.exports = {
  BUILDER_DOCS_OPENAPI_ROOT,
  OUTPUT_ROOT,
  PUBLIC_PREFIX,
  SPEC_FAMILY_ORDER,
  buildOpenApiArtifacts,
  buildOperationFragment,
  specFamilyForModel,
  writeOpenApiArtifacts,
};
