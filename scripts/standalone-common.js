const fs = require("fs");
const http = require("http");
const path = require("path");
const { build, context } = require("esbuild");

const {
  PAGE_SPECS,
  ROOT,
  SOURCE_SPECS,
  writeGeneratedPageModelArtifacts,
} = require("./generate-page-models");

const STANDALONE_ROUTE = "/rpcs/account/view_account";
const STANDALONE_ROUTES = Array.from(
  new Set(
    PAGE_SPECS.flatMap((pageSpec) => [pageSpec.canonicalPath, ...(pageSpec.routeAliases || [])])
      .filter(Boolean)
  )
);
const STANDALONE_DEV_OUTDIR = path.resolve(ROOT, ".standalone-dev");
const STANDALONE_BUILD_OUTDIR = path.resolve(ROOT, "standalone-dist");
const STANDALONE_ENTRY = path.resolve(ROOT, "standalone/src/app.tsx");
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

function listFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(absolutePath));
      continue;
    }

    files.push(absolutePath);
  }

  return files;
}

function getHtmlDocument() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>FastNEAR Local Verification Runtime</title>
    <link rel="icon" href="/favicon.png" />
    <link rel="stylesheet" href="/assets/view-account.css" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/assets/view-account.js"></script>
  </body>
</html>
`;
}

function getRootRedirectDocument() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="0; url=${STANDALONE_ROUTE}" />
    <title>Redirecting…</title>
  </head>
  <body>
    <script>window.location.replace(${JSON.stringify(STANDALONE_ROUTE)});</script>
  </body>
</html>
`;
}

function writeStandaloneHtml(outdir) {
  for (const routePath of STANDALONE_ROUTES) {
    const routeDir = path.join(outdir, routePath);
    fs.mkdirSync(routeDir, { recursive: true });
    fs.writeFileSync(path.join(routeDir, "index.html"), getHtmlDocument(), "utf8");
  }
  fs.writeFileSync(path.join(outdir, "index.html"), getRootRedirectDocument(), "utf8");

  const faviconSource = path.resolve(ROOT, "favicon.png");
  if (fs.existsSync(faviconSource)) {
    fs.copyFileSync(faviconSource, path.join(outdir, "favicon.png"));
  }
}

function buildOptions(outdir, { watch = false } = {}) {
  return {
    bundle: true,
    entryPoints: {
      "assets/view-account": STANDALONE_ENTRY,
    },
    format: "esm",
    jsx: "automatic",
    loader: {
      ".json": "json",
    },
    minify: !watch,
    metafile: true,
    outdir,
    platform: "browser",
    sourcemap: watch ? "inline" : true,
    target: ["es2020"],
    logLevel: "info",
  };
}

function writeStandaloneArtifacts(outdir) {
  writeGeneratedPageModelArtifacts();
  writeStandaloneHtml(outdir);
}

async function buildStandaloneApp(outdir, { watch = false } = {}) {
  writeStandaloneArtifacts(outdir);

  if (watch) {
    const esbuildContext = await context(buildOptions(outdir, { watch: true }));
    await esbuildContext.watch();
    return esbuildContext;
  }

  const result = await build(buildOptions(outdir));
  return null;
}

function watchStandaloneModel(onSpecChange) {
  for (const sourceSpec of SOURCE_SPECS) {
    fs.watchFile(
      sourceSpec,
      { interval: 500 },
      (currentStats, previousStats) => {
        if (currentStats.mtimeMs === previousStats.mtimeMs) {
          return;
        }

        onSpecChange();
      }
    );
  }

  return () => {
    for (const sourceSpec of SOURCE_SPECS) {
      fs.unwatchFile(sourceSpec);
    }
  };
}

function sendFile(response, filePath) {
  const extension = path.extname(filePath);
  response.statusCode = 200;
  response.setHeader("Content-Type", MIME_TYPES[extension] || "application/octet-stream");
  fs.createReadStream(filePath).pipe(response);
}

function createStandaloneServer(outdir) {
  return http.createServer((request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    let pathname = decodeURIComponent(url.pathname);

    if (pathname === "/") {
      response.statusCode = 302;
      response.setHeader("Location", STANDALONE_ROUTE);
      response.end();
      return;
    }

    const potentialPaths = [];
    if (STANDALONE_ROUTES.includes(pathname)) {
      potentialPaths.push(path.join(outdir, pathname, "index.html"));
    }

    const normalized = pathname.replace(/^\/+/, "");
    if (normalized) {
      const directPath = path.join(outdir, normalized);
      potentialPaths.push(directPath);
      potentialPaths.push(path.join(directPath, "index.html"));
    }

    const matchedPath = potentialPaths.find((filePath) => fs.existsSync(filePath));
    if (matchedPath) {
      sendFile(response, matchedPath);
      return;
    }

    response.statusCode = 404;
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.end("Standalone verification route not found.");
  });
}

module.exports = {
  ROOT,
  STANDALONE_BUILD_OUTDIR,
  STANDALONE_DEV_OUTDIR,
  STANDALONE_ROUTE,
  STANDALONE_ROUTES,
  buildStandaloneApp,
  createStandaloneServer,
  watchStandaloneModel,
  writeStandaloneArtifacts,
};
