#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const YAML = require("yaml");

const HTTP_METHODS = new Set([
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
]);

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function writeYaml(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, YAML.stringify(value, { lineWidth: 0 }), "utf8");
}

function sanitizeSlug(value) {
  return value
    .replace(/^\/+|\/+$/g, "")
    .replace(/[{}]/g, "")
    .replace(/[^a-zA-Z0-9/]+/g, "_")
    .replace(/\/+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function inferLeafGroup(apiPath) {
  const segments = apiPath.split("/").filter(Boolean);
  if (segments.length === 0) {
    return "misc";
  }

  const first = segments[0];
  if (["v0", "v1", "exp", "system"].includes(first)) {
    return first;
  }

  return "system";
}

function inferLeafPath(apiPath, operation) {
  const slug =
    operation["x-fastnear-slug"] ||
    (typeof operation.operationId === "string" && sanitizeSlug(operation.operationId)) ||
    sanitizeSlug(apiPath);
  return path.posix.join(inferLeafGroup(apiPath), `${slug}.yaml`);
}

function inferLeafTitle(serviceSpec, operation, relativeLeafPath) {
  return (
    operation["x-fastnear-title"] ||
    (typeof operation.summary === "string" &&
      `${serviceSpec.info?.title || "API"} - ${operation.summary}`) ||
    `${serviceSpec.info?.title || "API"} - ${relativeLeafPath.replace(/\.yaml$/, "")}`
  );
}

function stripLeafOnlyExtensions(operation) {
  const cloned = cloneJson(operation);
  delete cloned["x-fastnear-slug"];
  delete cloned["x-fastnear-title"];
  return cloned;
}

function splitAggregateSpec(serviceSpec, destinationDir) {
  const renderedSpec = cloneJson(serviceSpec);
  const components = renderedSpec.components ? cloneJson(renderedSpec.components) : undefined;
  const servers = Array.isArray(renderedSpec.servers) ? cloneJson(renderedSpec.servers) : undefined;
  // Document-level security applies to every operation that does not override it
  // (OpenAPI 3.0.3 §4.7.1), so each leaf must carry it or the page-model generator
  // sees no requirements and reports "No auth required".
  const security = Array.isArray(renderedSpec.security) ? cloneJson(renderedSpec.security) : undefined;

  fs.rmSync(destinationDir, { recursive: true, force: true });
  fs.mkdirSync(destinationDir, { recursive: true });
  writeYaml(path.join(destinationDir, "openapi.yaml"), renderedSpec);

  for (const [apiPath, pathItem] of Object.entries(renderedSpec.paths || {})) {
    for (const [method, operation] of Object.entries(pathItem || {})) {
      if (!HTTP_METHODS.has(method)) {
        continue;
      }

      const relativeLeafPath = inferLeafPath(apiPath, operation);
      const leafSpec = {
        openapi: renderedSpec.openapi || "3.0.3",
        info: {
          title: inferLeafTitle(renderedSpec, operation, relativeLeafPath),
          version: renderedSpec.info?.version || "1.0.0",
          description:
            operation.description ||
            renderedSpec.info?.description ||
            "",
        },
        paths: {
          [apiPath]: {
            [method]: stripLeafOnlyExtensions(operation),
          },
        },
      };

      if (servers) {
        leafSpec.servers = cloneJson(servers);
      }

      if (security) {
        leafSpec.security = cloneJson(security);
      }

      if (components && Object.keys(components).length > 0) {
        leafSpec.components = cloneJson(components);
      }

      writeYaml(path.join(destinationDir, relativeLeafPath), leafSpec);
    }
  }
}

module.exports = {
  splitAggregateSpec,
};
