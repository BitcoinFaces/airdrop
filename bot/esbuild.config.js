const esbuild = require("esbuild");

esbuild
    .build({
        entryPoints: ["./src/index.ts"],
        outfile: "target/index.js",
        bundle: true,
        minify: false,
        platform: "node",
        sourcemap: true,
        target: "esnext",
    })
    .catch(() => process.exit(1));
