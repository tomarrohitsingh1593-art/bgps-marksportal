# BGPS Marks Portal — V12 Paper Workflow Hardening

## Scope

This patch hardens the teacher question-paper workflow, Principal approval flow, Drive-file handling, retries, and existing duplicate approved-paper records.

## Fixed defects

1. **Safe questionnaire copy/paste**
   - Word, Google Docs and website HTML is sanitised before it reaches the editor.
   - Scripts, forms, iframes, hidden Office/web markup and unsafe attributes are removed.
   - Safe headings, lists, tables, bold/italic/underline, superscript and subscript are retained.
   - Clipboard image files are compressed and embedded through the existing image pipeline.
   - Linked web images no longer crash the save request; the backend replaces them with a clear “insert through portal” placeholder.

2. **Idempotent uploads and submissions**
   - PDF/DOCX uploads receive a stable request token.
   - DOCX imports receive a deterministic draft ID.
   - Network timeout/retry and double-click requests return the existing draft/paper instead of creating another row or file.
   - A delayed autosave cannot recreate a draft after that draft has already been submitted.

3. **Submitted and approved paper locking**
   - Teachers can edit paper content only after the Principal sets `Correction Required`.
   - A submitted correction cannot be reopened by a stale browser tab or autosave request.
   - Approved papers remain final and read-only.
   - Principal editing is rejected when the paper status/version changed after the editor opened.

4. **Correction resubmission remains available**
   - A Principal-requested correction can be resubmitted even when new paper creation/upload is closed.
   - New uploads remain governed by Admin controls.

5. **Exactly one current approved final**
   - The logical final key is Class + Subject + Exam/Term + Academic Session.
   - When a paper is approved, any older approved record for the same key becomes `Locked` and is preserved as an archive.
   - Existing historical duplicate approved records are repaired automatically on the first Admin paper-list load after V12 deployment.
   - Superseded archives remain visible to Admin but are hidden from the teacher’s current-paper list.

6. **Approval retry and file rollback safety**
   - Repeating the same approval after a timeout returns the already-approved result.
   - Approval uses a longer frontend timeout.
   - A newly generated final PDF is moved to Trash if the Sheet approval commit fails.
   - Temporary BGPS working copies are removed only after the approved record is committed.

7. **DOCX preview race fixed**
   - Simultaneous Preview clicks can no longer create multiple cached Preview PDFs.
   - Preview cache creation now uses a script lock and double-checks the cached ID.

8. **Safe Admin deletion**
   - The paper row is re-read after acquiring the script lock, preventing deletion of the wrong row after concurrent updates.
   - The Sheet record is committed first; Drive cleanup follows afterwards.
   - Linked correction drafts and their temporary files are cleaned with the deleted paper.

9. **Frontend action guards**
   - Approve/Return double-clicks are blocked while the request is in progress.
   - Upload request tokens reset only when the selected file/workflow genuinely changes.
   - `listPapers` and approval requests use extended timeouts for first-run repair and PDF conversion.

## Files changed

- `Code.gs`
- `js/modules/api.js`
- `js/modules/paper-creator.js`
- `js/modules/papers.js`
- `tests/static-audit.js`

## Verification performed

Run from the repository root:

```bash
node tests/static-audit.js
```

The test verifies:

- syntax of every frontend JavaScript file;
- Apps Script JavaScript syntax;
- no duplicate static HTML IDs;
- paste sanitiser and upload request-token presence;
- approval timeout and double-click guards;
- submitted-draft autosave lock;
- approval idempotency and single-final repair functions;
- backend removal of external linked images while retaining safe embedded PNG data;
- academic-session final-key consistency.

Expected result:

```text
BGPS V12 static audit: PASS
```

## Deployment

### 1. Backend Apps Script

1. Open the Apps Script project connected to **BGPS Academic Interface**.
2. Replace the existing `Code.gs` with the V12 `Code.gs` supplied in this package.
3. Keep the existing `appsscript.json` and Advanced Drive service configuration.
4. Choose **Deploy → Manage deployments → Edit → New version → Deploy**.
5. Keep the same Web App URL so the frontend configuration does not need to change.

### 2. Frontend

Deploy the repository contents to the same GitHub/Vercel/static-hosting project. The Web App URL in `js/app-config.js` should remain the live Apps Script deployment URL.

### 3. One-time duplicate repair

Sign in as `ADMIN` and open/refresh **Paper Approval** once. V12 automatically scans duplicate `Approved` rows. It keeps the latest final as `Approved` and changes older same-session finals to `Locked`; their files are preserved.

The repair can also be called through the authenticated backend action `repairPaperWorkflow` if a manual rerun is ever required.

### 4. Browser refresh

Use a hard refresh (`Ctrl + F5`) on teacher and Admin devices after frontend deployment.

## Live smoke test checklist

1. Paste questions from Word/Google Docs into a new paper; save draft, preview and submit.
2. Paste a web page containing linked images; verify text is retained and linked images show a replacement note instead of causing an error.
3. Submit the same PDF twice using a simulated retry; verify only one paper row exists.
4. Approve a DOCX, then click Approve again; verify the existing approved final is returned and no new PDF appears.
5. Approve another paper with the same Class + Subject + Exam + Academic Session; verify the previous final becomes `Locked` and only the new one remains `Approved`.
6. Return a paper for correction, close new uploads in Admin settings, then verify the returned correction can still be resubmitted.
7. Open the same DOCX preview from two tabs; verify only one cached Preview PDF is created.
8. Delete a paper that has a linked correction draft; verify both disappear from their lists.

## Environment limitation

The local audit can validate syntax and workflow invariants, but it cannot execute Google Sheets, Drive conversion or Apps Script deployment services. The smoke tests above must be completed once against the live Apps Script project after deployment.
