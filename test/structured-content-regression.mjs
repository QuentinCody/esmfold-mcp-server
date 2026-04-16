#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(__dirname, '..');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assertContains(filePath, haystack, needle, testName) {
  totalTests++;
  if (haystack.includes(needle)) {
    console.log(`${GREEN}✓${RESET} ${testName}`);
    passedTests++;
  } else {
    console.log(`${RED}✗${RESET} ${testName}`);
    console.log(`  Missing: ${needle}`);
    console.log(`  File: ${filePath}`);
    failedTests++;
  }
}

function assertNotContains(filePath, haystack, needle, testName) {
  totalTests++;
  if (!haystack.includes(needle)) {
    console.log(`${GREEN}✓${RESET} ${testName}`);
    passedTests++;
  } else {
    console.log(`${RED}✗${RESET} ${testName}`);
    console.log(`  Forbidden: ${needle}`);
    console.log(`  File: ${filePath}`);
    failedTests++;
  }
}

function readFile(relPath) {
  const absPath = path.resolve(SERVER_ROOT, relPath);
  return fs.readFileSync(absPath, 'utf8');
}

console.log(`${BLUE}🧪 ESMFold Structured Content Regression Tests${RESET}`);

const catalog = readFile('src/spec/catalog.ts');
assertContains('src/spec/catalog.ts', catalog, '/atlas/structure/{atlas_id}', 'catalog includes /atlas/structure/{id}');
assertContains('src/spec/catalog.ts', catalog, '/atlas/sequence/{atlas_id}', 'catalog includes /atlas/sequence/{id}');
assertContains('src/spec/catalog.ts', catalog, '/atlas/search', 'catalog includes /atlas/search');
// Catalog notes mention /foldSequence/ to explain why it's deferred — that's expected.
// What we forbid is an actual catalog endpoint advertising it (i.e. `path: "/foldSequence/...`).
assertNotContains('src/spec/catalog.ts', catalog, 'path: "/foldSequence', 'catalog does NOT advertise live folding as an endpoint');
assertNotContains('src/spec/catalog.ts', catalog, 'async: true', 'catalog has zero async:true entries');

const adapter = readFile('src/lib/api-adapter.ts');
assertContains('src/lib/api-adapter.ts', adapter, '/fetchPredictedStructure/', 'api-adapter routes to ESM Atlas /fetchPredictedStructure/');
assertContains('src/lib/api-adapter.ts', adapter, '501', 'api-adapter returns 501 for live folding requests');

const codeMode = readFile('src/tools/code-mode.ts');
assertContains('src/tools/code-mode.ts', codeMode, 'esmfoldCatalog', 'code-mode.ts wires the esmfold catalog');
assertContains('src/tools/code-mode.ts', codeMode, 'createEsmfoldApiFetch', 'code-mode.ts uses Atlas adapter');

const indexContent = readFile('src/index.ts');
assertContains('src/index.ts', indexContent, 'EsmfoldDataDO', 'index.ts exports EsmfoldDataDO');
assertContains('src/index.ts', indexContent, 'McpAgent', 'index.ts uses McpAgent');

const doContent = readFile('src/do.ts');
assertContains('src/do.ts', doContent, 'atlas_structures', 'do.ts has atlas_structures schema hint');

console.log(`\n${BLUE}📊 Test Results Summary${RESET}`);
console.log(`Total tests: ${totalTests}`);
console.log(`${GREEN}Passed: ${passedTests}${RESET}`);
console.log(`${RED}Failed: ${failedTests}${RESET}`);

if (failedTests > 0) {
  console.log(`\n${RED}❌ Regression tests failed.${RESET}`);
  process.exit(1);
}

console.log(`\n${GREEN}✅ ESMFold structured content regression tests passed.${RESET}`);
