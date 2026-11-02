const fs = require('fs');
const path = require('path');

// Usage:
//   node scripts/build.js [outputPath]
// Builds "Mid's Manuscript Menagerie_v<version>.naiscript" (version from src/header.ts) into this folder.

const ROOT = path.resolve(__dirname, '..');

// UCCDS (chapter detection) is vendored: vendor/uccds/uccds-dual.ts is UCCDS's own dist/uccds-dual.ts
// (the built-in detector, plus the client for the UCCDS dependency script when it's installed), so this
// repo builds on its own. To update it, build UCCDS and run `npm run update-uccds` (scripts/update_uccds.js).
const UCCDS_VENDOR = path.join(ROOT, 'vendor', 'uccds');
const UCCDS_DUAL = path.join(UCCDS_VENDOR, 'uccds-dual.ts');
const UCCDS_PARTS = [UCCDS_DUAL];

const PARTS = [
    'header.ts',
    ...UCCDS_PARTS,
    'types.ts',
    'state.ts',
    'helpers.ts',
    'counters.ts',
    'legacy-chapters.ts',
    'chapters.ts',
    'prompts.ts',
    'actions.ts',
    'ui.ts',
    'main.ts'
];

const MENAGERIE_NAME = "Mid's Manuscript Menagerie";

// Reads `version:` from the naiscript frontmatter block in header.ts
function readHeaderVersion(headerPath) {
    const header = fs.readFileSync(headerPath, 'utf-8');
    const frontmatter = header.match(/\/\*---([\s\S]*?)---\*\//);
    const match = (frontmatter ? frontmatter[1] : header).match(/^version:\s*["']?([^\s"']+)["']?\s*$/m);
    return match ? match[1] : null;
}

function bundleParts(srcDir, parts) {
    let bundle = '';
    for (const part of parts) {
        const filePath = path.resolve(srcDir, part);
        if (!fs.existsSync(filePath)) {
            const hint = filePath.startsWith(UCCDS_VENDOR) ? ' (vendored UCCDS missing: run `npm run update-uccds`)' : '';
            throw new Error(`Missing source file: ${filePath}${hint}`);
        }
        // Strip a byte-order mark: it would sit in front of the /*--- header in the built script
        const content = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
        bundle += content.trimEnd() + '\n\n';
    }
    return bundle.trimEnd() + '\n';
}

// Keeps package.json's version in step with the Menagerie header
function syncPackageVersion(version) {
    const pkgPath = path.join(ROOT, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    if (pkg.version === version) return;
    const previous = pkg.version;
    pkg.version = version;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
    console.log(`package.json version: ${previous} -> ${version}`);
}

function build(outputPath) {
    const srcDir = path.join(ROOT, 'src');
    const version = readHeaderVersion(path.join(srcDir, 'header.ts'));
    if (!version) {
        throw new Error('No `version:` field found in src/header.ts frontmatter.');
    }

    const target = outputPath || path.join(ROOT, `${MENAGERIE_NAME}_v${version}.naiscript`);
    const bundle = bundleParts(srcDir, PARTS);

    fs.writeFileSync(target, bundle, 'utf-8');
    console.log(`Successfully built: ${target} (${Buffer.byteLength(bundle, 'utf-8')} bytes)`);
    syncPackageVersion(version);
    return bundle;
}

module.exports = { build, PARTS, UCCDS_PARTS, UCCDS_VENDOR, readHeaderVersion, bundleParts };

if (require.main === module) {
    // --menagerie is still accepted (old command lines); Chapter Linter builds from Editorial/chapter-linter
    const positional = process.argv.slice(2).filter(a => !a.startsWith('--'));
    build(positional[0]);
}
