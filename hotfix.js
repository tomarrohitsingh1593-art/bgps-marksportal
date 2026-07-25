'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

function checkSyntax() {
  const files = [
    ...fs.readdirSync(path.join(root, 'js')).filter((name) => name.endsWith('.js')).map((name) => `js/${name}`),
    ...fs.readdirSync(path.join(root, 'js/modules')).filter((name) => name.endsWith('.js')).map((name) => `js/modules/${name}`)
  ];
  for (const file of files) execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'pipe' });
  const backendTemp = path.join('/tmp', `bgps-code-${process.pid}.js`);
  fs.writeFileSync(backendTemp, read('Code.gs'));
  try { execFileSync(process.execPath, ['--check', backendTemp], { stdio: 'pipe' }); }
  finally { fs.rmSync(backendTemp, { force: true }); }
}

function checkHtmlIds() {
  const html = read('index.html');
  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepStrictEqual([...new Set(duplicateIds)], [], 'index.html contains duplicate IDs');
}

function checkWorkflowInvariants() {
  const backend = read('Code.gs');
  const creator = read('js/modules/paper-creator.js');
  const papers = read('js/modules/papers.js');
  const api = read('js/modules/api.js');

  assert(creator.includes('sanitizeClipboardHtml'), 'Clipboard sanitizer is missing');
  assert(creator.includes('requestId: uploadRequestId'), 'Upload idempotency token is missing');
  assert(creator.includes("if (!correctionPaper && settings?.permissions?.canUpload === false)"), 'Correction upload override is missing');
  assert(papers.includes('statusUpdateInFlight'), 'Approval double-click guard is missing');
  assert(api.includes('updatePaperStatus: 120000'), 'Approval timeout override is missing');

  assert(backend.includes("const submittedPaper = findPaperBySubmissionToken_(ensureQuestionPaperSheet_(), user.id, 'draft:' + draftId)"), 'Late autosave protection is missing');
  assert(backend.includes("if (currentStatusKey === 'approved' && cleanStatus === 'Approved')"), 'Approval retry idempotency is missing');
  assert(backend.includes('archiveOtherApprovedFinals_'), 'Single-final archive enforcement is missing');
  assert(backend.includes('repairDuplicateApprovedPapers_'), 'Historical duplicate-final repair is missing');
  assert(backend.includes('stripUnsafeExternalImages_'), 'Backend pasted-image sanitizer is missing');
  assert(backend.includes('deleteDraftsLinkedToPaperUnlocked_'), 'Linked-draft cleanup is missing');
  assert(!backend.includes("linkedStatus !== 'Correction Required' && linkedStatus !== 'Submitted'"), 'Submitted correction papers are still editable');
}

function checkPureBackendBehaviour() {
  const code = read('Code.gs');
  const context = {
    console,
    Date,
    Map,
    Set,
    JSON,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    RegExp,
    Error,
    Utilities: {
      newBlob(value) {
        return { getBytes: () => Buffer.from(String(value == null ? '' : value), 'utf8') };
      },
      Charset: { UTF_8: 'UTF-8' },
      DigestAlgorithm: { SHA_256: 'SHA_256' }
    }
  };
  vm.createContext(context);
  vm.runInContext(`${code}\n;globalThis.__bgpsTest = { stripUnsafeExternalImages_, sanitizeHtmlForStorage_, paperFinalKey_, normalizeRequestToken_ };`, context, { timeout: 2000 });
  const helpers = context.__bgpsTest;

  const cleaned = helpers.sanitizeHtmlForStorage_('<p>Q1</p><img src="https://example.com/a.png" alt="diagram"><script>alert(1)</script>');
  assert(!cleaned.includes('https://example.com'), 'External image URL survived sanitation');
  assert(!cleaned.includes('<script'), 'Script survived sanitation');
  assert(cleaned.includes('Linked image removed'), 'Removed image did not leave a useful placeholder');

  const embedded = '<img src="data:image/png;base64,aGVsbG8=">';
  assert(helpers.sanitizeHtmlForStorage_(embedded).includes('data:image/png;base64,'), 'Safe embedded PNG was removed');

  assert.strictEqual(
    helpers.paperFinalKey_('Class 10', 'Physics', 'Half Yearly', '2026-08-01', null),
    helpers.paperFinalKey_(' class 10 ', 'PHYSICS', 'Half   Yearly', '2027-02-01', null),
    'Same academic-session final key is inconsistent'
  );
  assert.notStrictEqual(
    helpers.paperFinalKey_('Class 10', 'Physics', 'Half Yearly', '2026-03-31', null),
    helpers.paperFinalKey_('Class 10', 'Physics', 'Half Yearly', '2026-04-01', null),
    'Different academic sessions share a final key'
  );
  assert.strictEqual(helpers.normalizeRequestToken_(' abc/$%:123 '), 'abc:123', 'Request token sanitation is inconsistent');
}

checkSyntax();
checkHtmlIds();
checkWorkflowInvariants();
checkPureBackendBehaviour();
console.log('BGPS V12 static audit: PASS');
