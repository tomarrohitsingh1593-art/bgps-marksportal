/**
 * BG PUBLIC SCHOOL - MARKS + QUESTION PAPER PORTAL
 * Version: Enhanced with free paper class selection, drafts, and ISC-style layout
 * 
 * Deploy Settings:
 *   Execute as: Me
 *   Who has access: Anyone
 */

const MASTER_SHEET_NAME = 'Master';
const PAPER_SHEET_NAME = 'QuestionPapers';
const PAPER_DRAFTS_SHEET_NAME = 'PaperDrafts';
const PAPER_FOLDER_NAME = 'BGPS Question Papers DEMO';
const PAPER_FOLDER_PROPERTY = 'BGPS_QUESTION_PAPER_FOLDER_ID_DEMO';
const PAPER_SETTINGS_PROPERTY = 'BGPS_PAPER_MODULE_SETTINGS_V2_DEMO';
const PAPER_MAX_BYTES = 8 * 1024 * 1024;
const ADMIN_PIN_PROPERTY = 'BGPS_ADMIN_PIN';
const DEFAULT_TEACHER_PIN_PROPERTY = 'BGPS_DEFAULT_TEACHER_PIN';
const AUTH_FAIL_CACHE_PREFIX = 'bgps-auth-fail-';
const AUTH_BLOCK_SECONDS = 300;
const AUTH_MAX_FAILURES = 5;

const ADMIN_ID = 'ADMIN';

const TEACHER_CLASS_MAP = Object.freeze({
  'T-1': 'Playgroup', 'T-2': 'LKG', 'T-3': 'UKG', 'T-4': 'Class 1', 'T-5': 'Class 2',
  'T-6': 'Class 3', 'T-7': 'Class 4', 'T-8': 'Class 5', 'T-9': 'Class 6', 'T-10': 'Class 7',
  'T-11': 'Class 8', 'T-12': 'Class 9', 'T-13': 'Class 10', 'T-14': 'Class 11', 'T-15': 'Class 12',
  'ADMIN': 'ALL_CLASSES'
});

const ALL_CLASSES = [
  'Playgroup', 'LKG', 'UKG', 'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
  'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12'
];

// Early-years classes where chapter/syllabus reference is not applicable and must not block paper creation.
const EARLY_YEARS_CLASSES = ['Playgroup', 'Nursery', 'LKG', 'UKG'];

function isEarlyYearsClass_(className) {
  return EARLY_YEARS_CLASSES.indexOf(cleanText_(className)) !== -1;
}

const MASTER_HEADERS = [
  'Timestamp', 'Teacher ID', 'Class', 'Subject', 'Exam Type',
  'Component', 'Roll No', 'Marks', 'Max Marks'
];

const PAPER_HEADERS = [
  'Paper ID', 'Uploaded At', 'Updated At', 'Teacher ID', 'Class', 'Subject',
  'Exam / Term', 'Chapters', 'Max Marks', 'Exam Date', 'Teacher Note',
  'Original File Name', 'MIME Type', 'File Size', 'Drive File ID',
  'Version', 'Status', 'Admin Note', 'Source Type', 'Time Allowed',
  'Total Questions', 'Paper Content JSON'
];

const PAPER_DRAFTS_HEADERS = [
  'Draft ID', 'Created At', 'Updated At', 'Teacher ID', 'Title', 'Class',
  'Subject', 'Exam / Term', 'Chapters', 'Max Marks', 'Exam Date', 'Teacher Note',
  'Time Allowed', 'Instructions', 'Language Mode', 'Editor HTML', 'Body Text',
  'Detected Marks', 'Total Questions', 'Status', 'Source Type', 'Draft JSON', 'Content Drive File ID'
];

const DEFAULT_PAPER_SETTINGS = Object.freeze({
  emergencyLock: false,
  uploadEnabled: true,
  creatorEnabled: false,
  submissionEnabled: true,
  marksEntryEnabled: true,
  adminNotice: 'Question paper upload is open. Manual creator can be enabled by Admin after testing.'
});

function doGet(e) {
  return jsonOutput_({ ok: true, service: 'BGPS ERP API' });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) throw new Error('Empty request.');
    const request = JSON.parse(e.postData.contents);
    const action = String(request.action || '').trim();

    if (action === 'login') {
      return jsonOutput_(login_(request.teacherId, request.pin));
    }

    const user = authenticate_(request.teacherId, request.pin);

    switch (action) {
      case 'upsert':
        return jsonOutput_(upsertMarks_(user, request.entries));
      case 'getMarks':
        return jsonOutput_(getMarks_(user, request.filters));
      case 'getPaperSettings':
        return jsonOutput_(getPaperSettingsResponse_(user));
      case 'updatePaperSettings':
        return jsonOutput_(updatePaperSettings_(user, request.settings));
      case 'uploadPaper':
        return jsonOutput_(uploadPaper_(user, request.paper));
      case 'createManualPaper':
        return jsonOutput_(createManualPaper_(user, request.paper));
      case 'listPapers':
        return jsonOutput_(listPapers_(user));
      case 'getPaperFile':
        return jsonOutput_(getPaperFile_(user, request.paperId));
      case 'getPaperContent':
        return jsonOutput_(getPaperContent_(user, request.paperId));
      case 'updatePaperStatus':
        return jsonOutput_(updatePaperStatus_(user, request.paperId, request.status, request.adminNote));
      case 'savePaperDraft':
        return jsonOutput_(savePaperDraft_(user, request.draft));
      case 'listPaperDrafts':
        return jsonOutput_(listPaperDrafts_(user));
      case 'getPaperDraft':
        return jsonOutput_(getPaperDraft_(user, request.draftId));
      case 'deletePaperDraft':
        return jsonOutput_(deletePaperDraft_(user, request.draftId));
      case 'submitPaperDraft':
        return jsonOutput_(submitPaperDraft_(user, request.draftId));
      default:
        throw new Error('Unsupported action: ' + action);
    }
  } catch (error) {
    return jsonOutput_({ ok: false, error: safeErrorMessage_(error) });
  }
}

function authenticate_(teacherId, pin) {
  const id = String(teacherId || '').trim().toUpperCase();
  const suppliedPin = String(pin || '');
  if (!Object.prototype.hasOwnProperty.call(TEACHER_CLASS_MAP, id)) {
    throw new Error('Invalid Teacher ID.');
  }
  const expectedPin = getExpectedPin_(id);
  if (suppliedPin !== expectedPin) {
    throw new Error('Invalid security PIN.');
  }
  return {
    id: id,
    isAdmin: id === ADMIN_ID,
    assignedClass: TEACHER_CLASS_MAP[id]
  };
}

function login_(teacherId, pin) {
  const id = String(teacherId || '').trim().toUpperCase();
  if (!id) throw new Error('Teacher ID is required.');
  if (!Object.prototype.hasOwnProperty.call(TEACHER_CLASS_MAP, id)) {
    throw new Error('Invalid Teacher ID.');
  }

  const cache = CacheService.getScriptCache();
  const failKey = AUTH_FAIL_CACHE_PREFIX + id;
  const failCount = Number(cache.get(failKey) || 0);
  if (failCount >= AUTH_MAX_FAILURES) {
    throw new Error('Too many failed login attempts. Please try again in 5 minutes.');
  }

  try {
    const user = authenticate_(id, pin);
    cache.remove(failKey);
    return {
      ok: true,
      user: {
        teacherId: user.id,
        isAdmin: user.isAdmin,
        assignedClass: user.assignedClass
      }
    };
  } catch (error) {
    cache.put(failKey, String(failCount + 1), AUTH_BLOCK_SECONDS);
    throw error;
  }
}

function getExpectedPin_(teacherId) {
  const properties = PropertiesService.getScriptProperties();
  const adminPin = String(properties.getProperty(ADMIN_PIN_PROPERTY) || '').trim();
  const teacherPin = String(properties.getProperty(DEFAULT_TEACHER_PIN_PROPERTY) || '').trim();

  if (teacherId === ADMIN_ID) {
    return adminPin || 'Admin@1';
  }
  return teacherPin || 'bgps123';
}

function getMarks_(user, filters) {
  const requested = filters && filters.className ? cleanText_(filters.className) : '';
  const classFilter = user.isAdmin
    ? requested
    : user.assignedClass;

  const subjectFilter = cleanText_(filters && filters.subject).toUpperCase();
  const examTypeFilter = cleanText_(filters && filters.examType).toUpperCase();
  const componentFilter = cleanText_(filters && filters.component).toUpperCase();
  const rollNoFilter = normalizeRoll_(filters && filters.rollNo).toUpperCase();

  const sheet = ensureMasterSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { ok: true, rows: [], total: 0 };

  const rows = sheet.getRange(2, 1, lastRow - 1, MASTER_HEADERS.length).getValues();
  const out = [];
  rows.forEach(function(row) {
    const className = cleanText_(row[2]);
    const subject = cleanText_(row[3]).toUpperCase();
    const examType = cleanText_(row[4]).toUpperCase();
    const component = cleanText_(row[5]).toUpperCase();
    const rollNo = normalizeRoll_(row[6]).toUpperCase();

    if (classFilter && className !== classFilter) return;
    if (subjectFilter && subject !== subjectFilter) return;
    if (examTypeFilter && examType !== examTypeFilter) return;
    if (componentFilter && component !== componentFilter) return;
    if (rollNoFilter && rollNo !== rollNoFilter) return;

    out.push({
      timestamp: isoDate_(row[0]),
      teacherId: cleanText_(row[1]),
      className: className,
      subject: cleanText_(row[3]),
      examType: cleanText_(row[4]),
      component: cleanText_(row[5]),
      rollNo: normalizeRoll_(row[6]),
      marks: row[7],
      maxMarks: Number(row[8]) || 0
    });
  });

  return { ok: true, rows: out, total: out.length };
}

function upsertMarks_(user, entries) {
  if (!Array.isArray(entries) || !entries.length) {
    throw new Error('No marks entries received.');
  }
  const settings = getPaperSettings_();
  if (settings.marksEntryEnabled === false) {
    throw new Error(settings.adminNotice || 'Marks Entry is currently closed by Admin.');
  }

  const sheet = ensureMasterSheet_();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const lastRow = sheet.getLastRow();
    const existing = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, MASTER_HEADERS.length).getValues() : [];
    const keyToSheetRow = new Map();

    existing.forEach(function(row, index) {
      const key = marksKey_(row[2], row[3], row[4], row[5], row[6]);
      if (key) keyToSheetRow.set(key, index + 2);
    });

    let created = 0;
    let updated = 0;
    const normalizedByKey = new Map();

    entries.forEach(function(entry) {
      const className = cleanText_(entry.class);
      const subject = cleanText_(entry.subject).toUpperCase();
      const exam = cleanText_(entry.examType);
      const component = cleanText_(entry.type).toUpperCase();
      const rollNo = normalizeRoll_(entry.rollNo);
      const marks = normalizeMarksValue_(entry.marks);
      const maxMarks = Number(entry.maxMarks);

      // MARKS ENTRY: strict class enforcement
      enforceMarksClassAccess_(user, className);
      if (!className || !subject || !exam || !component || !rollNo) {
        throw new Error('A marks entry is missing Class, Subject, Exam, Component or Roll No.');
      }
      if (!Number.isFinite(maxMarks) || maxMarks <= 0) {
        throw new Error('Invalid maximum marks.');
      }
      if (typeof marks === 'number' && (marks < 0 || marks > maxMarks)) {
        throw new Error('Marks for Roll ' + rollNo + ' must be between 0 and ' + maxMarks + '.');
      }

      const key = marksKey_(className, subject, exam, component, rollNo);
      normalizedByKey.set(key, [new Date(), user.id, className, subject, exam, component, rollNo, marks, maxMarks]);
    });

    const updates = [];
    const appends = [];
    normalizedByKey.forEach(function(rowValues, key) {
      const targetRow = keyToSheetRow.get(key);
      if (targetRow) {
        updates.push({ rowNumber: targetRow, rowValues: rowValues });
        updated += 1;
      } else {
        appends.push(rowValues);
        created += 1;
      }
    });

    updates.forEach(function(item) {
      sheet.getRange(item.rowNumber, 1, 1, MASTER_HEADERS.length).setValues([item.rowValues]);
    });

    if (appends.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, appends.length, MASTER_HEADERS.length).setValues(appends);
    }

    SpreadsheetApp.flush();
    return { ok: true, created: created, updated: updated, saved: created + updated };
  } finally {
    lock.releaseLock();
  }
}

function getPaperSettingsResponse_(user) {
  const settings = getPaperSettings_();
  return {
    ok: true,
    settings: settings,
    permissions: {
      isAdmin: user.isAdmin,
      canUpload: user.isAdmin ? false : (!settings.emergencyLock && settings.uploadEnabled && settings.submissionEnabled),
      canCreate: user.isAdmin ? false : (!settings.emergencyLock && settings.creatorEnabled && settings.submissionEnabled),
      canEnterMarks: user.isAdmin ? true : (settings.marksEntryEnabled !== false),
      canViewLibrary: true
    }
  };
}

function updatePaperSettings_(user, input) {
  if (!user.isAdmin) throw new Error('Only Admin can change question-paper controls.');
  const current = getPaperSettings_();
  const next = {
    emergencyLock: toBoolean_(input && input.emergencyLock, current.emergencyLock),
    uploadEnabled: toBoolean_(input && input.uploadEnabled, current.uploadEnabled),
    creatorEnabled: toBoolean_(input && input.creatorEnabled, current.creatorEnabled),
    submissionEnabled: toBoolean_(input && input.submissionEnabled, current.submissionEnabled),
    marksEntryEnabled: toBoolean_(input && input.marksEntryEnabled, current.marksEntryEnabled !== false),
    adminNotice: cleanText_(input && input.adminNotice).slice(0, 300)
  };
  PropertiesService.getScriptProperties().setProperty(PAPER_SETTINGS_PROPERTY, JSON.stringify(next));
  return { ok: true, settings: next };
}

function getPaperSettings_() {
  const raw = PropertiesService.getScriptProperties().getProperty(PAPER_SETTINGS_PROPERTY);
  if (!raw) return Object.assign({}, DEFAULT_PAPER_SETTINGS);
  try {
    const parsed = JSON.parse(raw);
    return {
      emergencyLock: Boolean(parsed.emergencyLock),
      uploadEnabled: parsed.uploadEnabled !== false,
      creatorEnabled: Boolean(parsed.creatorEnabled),
      submissionEnabled: parsed.submissionEnabled !== false,
      marksEntryEnabled: parsed.marksEntryEnabled !== false,
      adminNotice: cleanText_(parsed.adminNotice || DEFAULT_PAPER_SETTINGS.adminNotice).slice(0, 300)
    };
  } catch (ignored) {
    return Object.assign({}, DEFAULT_PAPER_SETTINGS);
  }
}

function assertPaperChannelOpen_(channel) {
  const settings = getPaperSettings_();
  if (settings.emergencyLock) {
    throw new Error(settings.adminNotice || 'Question-paper activity is temporarily locked by Admin.');
  }
  if (!settings.submissionEnabled) {
    throw new Error(settings.adminNotice || 'New question-paper submissions are currently closed.');
  }
  if (channel === 'upload' && !settings.uploadEnabled) {
    throw new Error(settings.adminNotice || 'Question-paper upload is currently disabled by Admin.');
  }
  if (channel === 'creator' && !settings.creatorEnabled) {
    throw new Error(settings.adminNotice || 'Manual paper creation is currently disabled by Admin.');
  }
  return settings;
}

function uploadPaper_(user, paper) {
  if (!paper || typeof paper !== 'object') {
    throw new Error('Question paper details are missing.');
  }
  if (user.isAdmin) {
    throw new Error('Admin upload is disabled. Use the Admin library to review teacher submissions.');
  }
  assertPaperChannelOpen_('upload');

  const className = cleanText_(paper.className);
  const subject = cleanText_(paper.subject);
  const exam = cleanText_(paper.exam);
  const chapters = cleanText_(paper.chapters);
  const maxMarks = Number(paper.maxMarks);
  const examDate = cleanText_(paper.examDate);
  const note = cleanText_(paper.note).slice(0, 250);
  const originalFileName = cleanText_(paper.fileName);
  const mimeType = cleanText_(paper.mimeType).toLowerCase();
  const declaredFileSize = Number(paper.fileSize) || 0;
  const fileBase64 = String(paper.fileBase64 || '');

  // PAPER UPLOAD: free class selection for all teachers
  enforcePaperClassAccess_(user, className);
  
  if (!className || !subject || !exam || !originalFileName || !fileBase64) {
    throw new Error('Class, Subject, Term and File are required.');
  }
  if (!chapters && !isEarlyYearsClass_(className)) {
    throw new Error('Chapters / syllabus reference is required for ' + className + '.');
  }
  if (!Number.isFinite(maxMarks) || maxMarks <= 0) {
    throw new Error('Maximum marks must be greater than zero.');
  }

  const extension = fileExtension_(originalFileName);
  const allowedPdf = mimeType === 'application/pdf' || extension === 'pdf';
  const allowedDocx = mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || extension === 'docx';
  if (!allowedPdf && !allowedDocx) {
    throw new Error('Only PDF and DOCX files are allowed.');
  }

  const bytes = Utilities.base64Decode(fileBase64);
  if (!bytes.length) throw new Error('The uploaded file is empty.');
  if (bytes.length > PAPER_MAX_BYTES || declaredFileSize > PAPER_MAX_BYTES) {
    throw new Error('The file exceeds the 8 MB upload limit.');
  }

  const effectiveMime = allowedPdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const sheet = ensureQuestionPaperSheet_();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const version = nextPaperVersion_(sheet, className, subject, exam);
    const paperId = Utilities.getUuid();
    const now = new Date();
    const folder = getQuestionPaperFolder_();
    const safeStoredName = buildStoredPaperName_(className, subject, exam, version, allowedPdf ? 'pdf' : 'docx');
    const blob = Utilities.newBlob(bytes, effectiveMime, safeStoredName);
    const file = folder.createFile(blob);

    sheet.appendRow([
      paperId, now, now, user.id, className, subject, exam, chapters,
      maxMarks, examDate, note, originalFileName, effectiveMime, bytes.length,
      file.getId(), version, 'Submitted', '', 'Upload', '', 0, ''
    ]);

    SpreadsheetApp.flush();
    return { ok: true, paperId: paperId, version: version, status: 'Submitted', sourceType: 'Upload' };
  } finally {
    lock.releaseLock();
  }
}

function createManualPaper_(user, paper) {
  if (!paper || typeof paper !== 'object') throw new Error('Manual paper details are missing.');
  if (user.isAdmin) throw new Error('Admin cannot submit a teacher paper.');
  assertPaperChannelOpen_('creator');

  const className = cleanText_(paper.className);
  const subject = cleanText_(paper.subject);
  const exam = cleanText_(paper.exam);
  const chapters = cleanText_(paper.chapters);
  const maxMarks = Number(paper.maxMarks);
  const examDate = cleanText_(paper.examDate);
  const note = cleanText_(paper.note).slice(0, 250);
  const timeAllowed = cleanText_(paper.timeAllowed).slice(0, 80);
  const instructions = cleanText_(paper.instructions).slice(0, 4000);
  const title = cleanText_(paper.title || (className + ' ' + subject + ' ' + exam + ' Paper')).slice(0, 180);
  const languageMode = cleanText_(paper.languageMode || 'english').toLowerCase();
  const editorHtml = sanitizeHtmlForStorage_(paper.editorHtml);
  const bodyText = cleanText_(paper.bodyText || '').slice(0, 60000);
  const detectedMarks = Number(paper.detectedMarks || 0);
  const totalQuestions = Number(paper.totalQuestions || 0);
  const rawQuestions = Array.isArray(paper.questions) ? paper.questions : [];

  // PAPER CREATION: free class selection for all teachers
  enforcePaperClassAccess_(user, className);
  
  if (!className || !subject || !exam || !chapters || !timeAllowed) {
    throw new Error('Class, Subject, Term, Chapters and Time Allowed are required.');
  }
  if (!Number.isFinite(maxMarks) || maxMarks <= 0) {
    throw new Error('Maximum marks must be greater than zero.');
  }
  if (!timeAllowed) throw new Error('Time Allowed is required.');
  if (!editorHtml && !rawQuestions.length) throw new Error('Question paper content is blank.');

  let questions = [];
  let computedTotal = detectedMarks;
  if (rawQuestions.length) {
    if (rawQuestions.length > 150) throw new Error('A paper cannot contain more than 150 questions.');
    questions = rawQuestions.map(function(item, index) {
      const text = cleanText_(item && item.text);
      const section = cleanText_(item && item.section) || 'Section A';
      const chapter = cleanText_(item && item.chapter);
      const orText = cleanText_(item && item.orText);
      const marks = Number(item && item.marks);

      if (!text) throw new Error('Question ' + (index + 1) + ' is blank.');
      if (!Number.isFinite(marks) || marks <= 0) {
        throw new Error('Question ' + (index + 1) + ' must have valid marks.');
      }
      return {
        section: section.slice(0, 80),
        text: text.slice(0, 3000),
        marks: marks,
        chapter: chapter.slice(0, 160),
        orText: orText.slice(0, 3000)
      };
    });
    computedTotal = questions.reduce(function(sum, question) { return sum + Number(question.marks || 0); }, 0);
  }

  if (Number.isFinite(computedTotal) && Math.abs(computedTotal - maxMarks) > 0.01) {
    throw new Error('Detected question marks are ' + computedTotal + ', but Maximum Marks is ' + maxMarks + '.');
  }

  if (String(bodyText || '').toLowerCase().indexOf('type question here') !== -1) {
    throw new Error('Replace placeholder text before submission.');
  }

  const contentRecord = {
    title: title,
    className: className,
    subject: subject,
    exam: exam,
    chapters: chapters,
    maxMarks: maxMarks,
    examDate: examDate,
    note: note,
    timeAllowed: timeAllowed,
    instructions: instructions,
    languageMode: languageMode,
    editorHtml: editorHtml,
    bodyText: bodyText,
    detectedMarks: Number.isFinite(computedTotal) ? computedTotal : maxMarks,
    totalQuestions: totalQuestions > 0 ? totalQuestions : (questions.length || 0),
    questions: questions
  };

  if (!contentRecord.editorHtml && contentRecord.questions.length) {
    contentRecord.editorHtml = questionsToEditorHtml_(contentRecord.questions, contentRecord.instructions);
  }

  if (!contentRecord.editorHtml) {
    throw new Error('Editor HTML is required for canonical paper rendering.');
  }

  const sheet = ensureQuestionPaperSheet_();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const version = nextPaperVersion_(sheet, className, subject, exam);
    const paperId = Utilities.getUuid();
    const now = new Date();
    const html = buildCanonicalPaperHtml_(contentRecord, user.id, version);
    const storedName = buildStoredPaperName_(className, subject, exam, version, 'html');
    const blob = Utilities.newBlob(html, 'text/html', storedName);
    const file = getQuestionPaperFolder_().createFile(blob);
    const byteLength = blob.getBytes().length;

    sheet.appendRow([
      paperId, now, now, user.id, className, subject, exam, chapters,
      maxMarks, examDate, note, storedName, 'text/html', byteLength,
      file.getId(), version, 'Submitted', '', 'Manual', timeAllowed,
      contentRecord.totalQuestions || 0, JSON.stringify(contentRecord)
    ]);

    SpreadsheetApp.flush();
    return {
      ok: true,
      paperId: paperId,
      version: version,
      status: 'Submitted',
      sourceType: 'Manual',
      totalMarks: contentRecord.detectedMarks,
      totalQuestions: contentRecord.totalQuestions || 0
    };
  } finally {
    lock.releaseLock();
  }
}

function listPapers_(user) {
  const sheet = ensureQuestionPaperSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { ok: true, papers: [] };

  const rows = sheet.getRange(2, 1, lastRow - 1, PAPER_HEADERS.length).getValues();
  const papers = rows
    .filter(function(row) {
      return user.isAdmin || cleanText_(row[3]).toUpperCase() === user.id;
    })
    .map(function(row) {
      return {
        paperId: cleanText_(row[0]),
        uploadedAt: isoDate_(row[1]),
        updatedAt: isoDate_(row[2]),
        teacherId: cleanText_(row[3]),
        className: cleanText_(row[4]),
        subject: cleanText_(row[5]),
        exam: cleanText_(row[6]),
        chapters: cleanText_(row[7]),
        maxMarks: row[8],
        examDate: cleanText_(row[9]),
        note: cleanText_(row[10]),
        fileName: cleanText_(row[11]),
        mimeType: cleanText_(row[12]),
        fileSize: Number(row[13]) || 0,
        fileSizeLabel: formatBytes_(Number(row[13]) || 0),
        version: Number(row[15]) || 1,
        status: cleanText_(row[16]) || 'Submitted',
        adminNote: cleanText_(row[17]),
        sourceType: cleanText_(row[18]) || 'Upload',
        timeAllowed: cleanText_(row[19]),
        totalQuestions: Number(row[20]) || 0
      };
    });

  papers.sort(function(a, b) {
    return String(b.updatedAt).localeCompare(String(a.updatedAt));
  });

  return { ok: true, papers: papers };
}

function getPaperFile_(user, paperId) {
  const record = findPaperRecord_(paperId);
  if (!user.isAdmin && record.teacherId.toUpperCase() !== user.id) {
    throw new Error('You do not have permission to open this paper.');
  }

  const file = DriveApp.getFileById(record.driveFileId);
  if (file.isTrashed()) throw new Error('This paper file is in Drive Trash.');
  const blob = file.getBlob();
  const bytes = blob.getBytes();
  if (bytes.length > PAPER_MAX_BYTES) {
    throw new Error('This stored file is too large to open through the portal.');
  }

  return {
    ok: true,
    fileName: record.originalFileName || file.getName(),
    mimeType: record.mimeType || blob.getContentType(),
    fileBase64: Utilities.base64Encode(bytes)
  };
}

function getPaperContent_(user, paperId) {
  const record = findPaperRecord_(paperId);
  if (!user.isAdmin && record.teacherId.toUpperCase() !== user.id) {
    throw new Error('You do not have permission to open this paper.');
  }

  const sheet = record.sheet;
  const row = sheet.getRange(record.rowNumber, 1, 1, PAPER_HEADERS.length).getValues()[0];
  const rawJson = String(row[21] || '');
  if (record.sourceType !== 'Manual' || !rawJson) {
    throw new Error('This paper was uploaded as a file and has no editable canonical content.');
  }

  let content;
  try {
    content = JSON.parse(rawJson);
  } catch (parseError) {
    throw new Error('Stored paper content is corrupted and cannot be opened in the editor.');
  }

  return {
    ok: true,
    paper: {
      paperId: record.paperId,
      originalPaperId: record.paperId,
      parentPaperId: cleanText_(content.revisionParentId || '') || record.paperId,
      version: Number(row[15]) || 1,
      previousVersion: Number(row[15]) || 1,
      status: cleanText_(row[16]) || 'Submitted',
      title: cleanText_(content.title || ''),
      className: cleanText_(content.className || row[4]),
      subject: cleanText_(content.subject || row[5]),
      exam: cleanText_(content.exam || row[6]),
      chapters: cleanText_(content.chapters || row[7]),
      maxMarks: Number(content.maxMarks || row[8]) || 0,
      examDate: cleanText_(content.examDate || row[9]),
      note: cleanText_(content.note || row[10]),
      timeAllowed: cleanText_(content.timeAllowed || row[19]),
      instructions: cleanText_(content.instructions || ''),
      languageMode: cleanText_(content.languageMode || 'english'),
      editorHtml: sanitizeHtmlForStorage_(content.editorHtml || ''),
      bodyText: String(content.bodyText || ''),
      detectedMarks: Number(content.detectedMarks || 0),
      totalQuestions: Number(content.totalQuestions || row[20]) || 0
    }
  };
}

function updatePaperStatus_(user, paperId, status, adminNote) {
  if (!user.isAdmin) throw new Error('Only Admin can change paper status.');

  const cleanStatus = cleanText_(status);
  const allowedStatuses = ['Submitted', 'Approved', 'Correction Required', 'Locked'];
  if (allowedStatuses.indexOf(cleanStatus) === -1) {
    throw new Error('Invalid paper status.');
  }

  const record = findPaperRecord_(paperId);
  const sheet = record.sheet;
  sheet.getRange(record.rowNumber, 3).setValue(new Date());
  sheet.getRange(record.rowNumber, 17).setValue(cleanStatus);
  sheet.getRange(record.rowNumber, 18).setValue(cleanText_(adminNote).slice(0, 500));
  SpreadsheetApp.flush();

  return { ok: true, paperId: record.paperId, status: cleanStatus };
}

function findPaperRecord_(paperId) {
  const id = cleanText_(paperId);
  if (!id) throw new Error('Paper ID is missing.');

  const sheet = ensureQuestionPaperSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) throw new Error('Question paper not found.');

  const rows = sheet.getRange(2, 1, lastRow - 1, PAPER_HEADERS.length).getValues();
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (cleanText_(row[0]) === id) {
      return {
        sheet: sheet,
        rowNumber: index + 2,
        paperId: cleanText_(row[0]),
        teacherId: cleanText_(row[3]),
        originalFileName: cleanText_(row[11]),
        mimeType: cleanText_(row[12]),
        driveFileId: cleanText_(row[14]),
        status: cleanText_(row[16]),
        sourceType: cleanText_(row[18]) || 'Upload'
      };
    }
  }

  throw new Error('Question paper not found.');
}

function savePaperDraft_(user, draft) {
  if (!draft || typeof draft !== 'object') throw new Error('Draft details are missing.');
  if (user.isAdmin) throw new Error('Admin cannot save teacher drafts.');

  const draftId = cleanText_(draft.draftId) || createDraftId_();
  const title = cleanText_(draft.title);
  const className = cleanText_(draft.className);
  const subject = cleanText_(draft.subject);
  const exam = cleanText_(draft.exam);
  const chapters = cleanText_(draft.chapters);
  const maxMarks = Number(draft.maxMarks);
  const examDate = cleanText_(draft.examDate);
  const note = cleanText_(draft.note).slice(0, 250);
  const timeAllowed = cleanText_(draft.timeAllowed || inferPaperTime_(draft.maxMarks)).slice(0, 80);
  const instructions = cleanText_(draft.instructions || '').slice(0, 4000);
  const languageMode = cleanText_(draft.languageMode || 'english');
  const editorHtml = sanitizeHtmlForStorage_(draft.editorHtml);
  const bodyText = cleanText_(draft.bodyText || '');
  const detectedMarks = Number(draft.detectedMarks || 0);
  const totalQuestions = Number(draft.totalQuestions || 0);
  const sourceType = cleanText_(draft.sourceType || 'Manual') || 'Manual';

  if (!className || !subject || !exam || !title) {
    throw new Error('Draft must have Class, Subject, Exam and Title.');
  }

  enforcePaperClassAccess_(user, className);

  const sheet = ensurePaperDraftSheet_();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const lastRow = sheet.getLastRow();
    const rows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, PAPER_DRAFTS_HEADERS.length).getValues() : [];
    let found = false;

    for (let i = 0; i < rows.length; i++) {
      if (cleanText_(rows[i][0]) === draftId && cleanText_(rows[i][3]) === user.id) {
        const now = new Date();
        sheet.getRange(i + 2, 1, 1, PAPER_DRAFTS_HEADERS.length).setValues([[
          draftId, rows[i][1], now, user.id, title, className, subject, exam, chapters,
          maxMarks, examDate, note, timeAllowed, instructions, languageMode, editorHtml, bodyText,
          detectedMarks, totalQuestions, 'Draft', sourceType, JSON.stringify({
            title: title,
            className: className,
            subject: subject,
            exam: exam,
            chapters: chapters,
            maxMarks: maxMarks,
            examDate: examDate,
            note: note,
            timeAllowed: timeAllowed,
            instructions: instructions,
            languageMode: languageMode,
            editorHtml: editorHtml,
            bodyText: bodyText,
            detectedMarks: detectedMarks,
            totalQuestions: totalQuestions,
            status: 'Draft',
            sourceType: sourceType
          }), ''
        ]]);
        found = true;
        break;
      }
    }

    if (!found) {
      const now = new Date();
      sheet.appendRow([
        draftId, now, now, user.id, title, className, subject, exam, chapters,
        maxMarks, examDate, note, timeAllowed, instructions, languageMode, editorHtml, bodyText,
        detectedMarks, totalQuestions, 'Draft', sourceType, JSON.stringify({
          title: title,
          className: className,
          subject: subject,
          exam: exam,
          chapters: chapters,
          maxMarks: maxMarks,
          examDate: examDate,
          note: note,
          timeAllowed: timeAllowed,
          instructions: instructions,
          languageMode: languageMode,
          editorHtml: editorHtml,
          bodyText: bodyText,
          detectedMarks: detectedMarks,
          totalQuestions: totalQuestions,
          status: 'Draft',
          sourceType: sourceType
        }), ''
      ]);
    }

    SpreadsheetApp.flush();
    return { ok: true, draftId: draftId, status: 'Cloud draft saved' };
  } finally {
    lock.releaseLock();
  }
}

function listPaperDrafts_(user) {
  const sheet = ensurePaperDraftSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { ok: true, drafts: [] };

  const rows = sheet.getRange(2, 1, lastRow - 1, PAPER_DRAFTS_HEADERS.length).getValues();
  const drafts = rows
    .filter(function(row) {
      return user.isAdmin || cleanText_(row[3]).toUpperCase() === user.id;
    })
    .map(function(row) {
      return {
        draftId: cleanText_(row[0]),
        paperId: cleanText_(row[0]),
        createdAt: isoDate_(row[1]),
        updatedAt: isoDate_(row[2]),
        teacherId: cleanText_(row[3]),
        title: cleanText_(row[4]),
        className: cleanText_(row[5]),
        subject: cleanText_(row[6]),
        exam: cleanText_(row[7]),
        chapters: cleanText_(row[8]),
        maxMarks: Number(row[9]) || 0,
        examDate: cleanText_(row[10]),
        note: cleanText_(row[11]),
        timeAllowed: cleanText_(row[12]),
        instructions: cleanText_(row[13]),
        languageMode: cleanText_(row[14]),
        editorHtml: String(row[15] || ''),
        bodyText: String(row[16] || ''),
        detectedMarks: Number(row[17]) || 0,
        totalQuestions: Number(row[18]) || 0,
        status: cleanText_(row[19]) || 'Draft',
        sourceType: cleanText_(row[20]) || 'Manual'
      };
    });

  return { ok: true, drafts: drafts };
}

function getPaperDraft_(user, draftId) {
  const id = cleanText_(draftId);
  if (!id) throw new Error('Draft ID is missing.');

  const sheet = ensurePaperDraftSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) throw new Error('Draft not found.');

  const rows = sheet.getRange(2, 1, lastRow - 1, PAPER_DRAFTS_HEADERS.length).getValues();
  for (let i = 0; i < rows.length; i++) {
    if (cleanText_(rows[i][0]) === id) {
      if (!user.isAdmin && cleanText_(rows[i][3]) !== user.id) {
        throw new Error('You do not have permission to view this draft.');
      }
      return {
        ok: true,
        draft: {
          draftId: id,
          createdAt: isoDate_(rows[i][1]),
          updatedAt: isoDate_(rows[i][2]),
          teacherId: cleanText_(rows[i][3]),
          title: cleanText_(rows[i][4]),
          className: cleanText_(rows[i][5]),
          subject: cleanText_(rows[i][6]),
          exam: cleanText_(rows[i][7]),
          chapters: cleanText_(rows[i][8]),
          maxMarks: Number(rows[i][9]) || 0,
          examDate: cleanText_(rows[i][10]),
          note: cleanText_(rows[i][11]),
          timeAllowed: cleanText_(rows[i][12]),
          instructions: cleanText_(rows[i][13]),
          languageMode: cleanText_(rows[i][14]),
          editorHtml: String(rows[i][15] || ''),
          bodyText: String(rows[i][16] || ''),
          detectedMarks: Number(rows[i][17]) || 0,
          totalQuestions: Number(rows[i][18]) || 0,
          status: cleanText_(rows[i][19]) || 'Draft',
          sourceType: cleanText_(rows[i][20]) || 'Manual'
        }
      };
    }
  }

  throw new Error('Draft not found.');
}

function deletePaperDraft_(user, draftId) {
  const id = cleanText_(draftId);
  if (!id) throw new Error('Draft ID is missing.');

  const sheet = ensurePaperDraftSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) throw new Error('Draft not found.');

  const rows = sheet.getRange(2, 1, lastRow - 1, PAPER_DRAFTS_HEADERS.length).getValues();
  for (let i = 0; i < rows.length; i++) {
    if (cleanText_(rows[i][0]) === id) {
      if (!user.isAdmin && cleanText_(rows[i][3]) !== user.id) {
        throw new Error('You do not have permission to delete this draft.');
      }
      sheet.deleteRow(i + 2);
      SpreadsheetApp.flush();
      return { ok: true, draftId: id };
    }
  }

  throw new Error('Draft not found.');
}

function submitPaperDraft_(user, draftId) {
  if (user.isAdmin) throw new Error('Admin cannot submit teacher drafts.');
  // BACKEND SAFETY: saved drafts may be edited locally/cloud, but final submission must obey Admin paper controls.
  assertPaperChannelOpen_('creator');
  
  const id = cleanText_(draftId);
  const draftResult = getPaperDraft_(user, id);
  const draft = draftResult.draft;

  if (!draft || !draft.draftId) throw new Error('Draft not found.');
  if (cleanText_(draft.status).toLowerCase() === 'submitted') throw new Error('This draft is already submitted.');
  if (!cleanText_(draft.className) || !cleanText_(draft.subject) || !cleanText_(draft.exam)) {
    throw new Error('Draft is incomplete. Class, Subject and Exam are required.');
  }
  if (!Number.isFinite(Number(draft.maxMarks)) || Number(draft.maxMarks) <= 0) {
    throw new Error('Draft has invalid maximum marks.');
  }
  if (!cleanText_(draft.timeAllowed)) throw new Error('Time Allowed is required.');
  if (!sanitizeHtmlForStorage_(draft.editorHtml)) throw new Error('Draft content is blank.');
  if (String(draft.bodyText || '').toLowerCase().indexOf('type question here') !== -1) {
    throw new Error('Replace placeholder text before submission.');
  }
  if (Number.isFinite(Number(draft.detectedMarks)) && Math.abs(Number(draft.detectedMarks) - Number(draft.maxMarks)) > 0.01) {
    throw new Error('Draft detected marks do not match Maximum Marks.');
  }

  const sheet = ensureQuestionPaperSheet_();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const version = nextPaperVersion_(sheet, draft.className, draft.subject, draft.exam);
    const paperId = Utilities.getUuid();
    const now = new Date();
    const html = buildCanonicalPaperHtml_({
      title: draft.title,
      className: draft.className,
      subject: draft.subject,
      exam: draft.exam,
      chapters: draft.chapters,
      maxMarks: draft.maxMarks,
      examDate: draft.examDate,
      note: draft.note,
      timeAllowed: draft.timeAllowed || inferPaperTime_(draft.maxMarks),
      instructions: draft.instructions || '',
      languageMode: draft.languageMode || 'english',
      editorHtml: draft.editorHtml,
      bodyText: draft.bodyText,
      detectedMarks: Number(draft.detectedMarks || draft.maxMarks),
      totalQuestions: Number(draft.totalQuestions || 0)
    }, user.id, version);
    const storedName = buildStoredPaperName_(draft.className, draft.subject, draft.exam, version, 'html');
    const blob = Utilities.newBlob(html, 'text/html', storedName);
    const file = getQuestionPaperFolder_().createFile(blob);
    const byteLength = blob.getBytes().length;

       sheet.appendRow([
      paperId, now, now, user.id, draft.className, draft.subject, draft.exam, draft.chapters,
      draft.maxMarks, draft.examDate, draft.note, storedName, 'text/html', byteLength,
      file.getId(), version, 'Submitted', '', 'Manual', draft.timeAllowed || '', Number(draft.totalQuestions) || 0,
      JSON.stringify({
        title: draft.title,
        className: draft.className,
        subject: draft.subject,
        exam: draft.exam,
        maxMarks: draft.maxMarks,
        timeAllowed: draft.timeAllowed,
        chapters: draft.chapters,
        instructions: draft.instructions,
        editorHtml: draft.editorHtml,
        bodyText: draft.bodyText,
        note: draft.note,
        detectedMarks: Number(draft.detectedMarks || draft.maxMarks),
        totalQuestions: Number(draft.totalQuestions || 0),
        revisionParentId: cleanText_(draft.parentPaperId || ''),
        revisionVersion: version
      })
    ]);

    // Delete the draft after submission
    deletePaperDraft_(user, id);
    SpreadsheetApp.flush();

    return { ok: true, paperId: paperId, version: version, status: 'Submitted' };
  } finally {
    lock.releaseLock();
  }
}

function nextPaperVersion_(sheet, className, subject, exam) {
  const rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, PAPER_HEADERS.length).getValues() : [];
  let version = 1;
  rows.forEach(function(row) {
    if (cleanText_(row[4]) === className && cleanText_(row[5]).toUpperCase() === subject.toUpperCase() && cleanText_(row[6]) === exam) {
      version = Math.max(version, (Number(row[15]) || 0) + 1);
    }
  });
  return version;
}

function buildManualPaperHtml_(paper, teacherId, version) {
  const grouped = {};
  paper.questions.forEach(function(question, index) {
    const key = question.section || 'Section A';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push({ number: index + 1, text: question.text, marks: question.marks, chapter: question.chapter, orText: question.orText });
  });

  const sectionHtml = Object.keys(grouped).map(function(sectionName) {
    const questionsHtml = grouped[sectionName].map(function(question) {
      const chapter = question.chapter ? '<div class="chapter">Chapter: ' + htmlEscape_(question.chapter) + '</div>' : '';
      const alternative = question.orText ? '<div class="or">OR</div><div class="question-text">' + nl2br_(htmlEscape_(question.orText)) + '</div>' : '';
      return '<div class="question"><div class="qnum">Q.' + question.number + '</div><div class="qbody"><div class="question-text">' + nl2br_(htmlEscape_(question.text)) + '</div>' + alternative + chapter + '</div><div class="marks">[' + htmlEscape_(question.marks) + ']</div></div>';
    }).join('');

    const sectionMarks = grouped[sectionName].reduce(function(sum, q) { return sum + Number(q.marks || 0); }, 0);
    return '<section><div class="section-title"><span>' + htmlEscape_(sectionName) + '</span><span>' + sectionMarks + ' Marks</span></div>' + questionsHtml + '</section>';
  }).join('');

  const readingTime = inferReadingTime_(paper.className, paper.maxMarks);
  const instructionItems = paper.instructions ? paper.instructions.split(/\n+/).map(function(line) { return cleanText_(line); }).filter(String) : [];
  const instructionsHtml = instructionItems.length ? '<div class="instructions"><strong>General Instructions:</strong><ol>' + instructionItems.map(function(item) { return '<li>' + htmlEscape_(item) + '</li>'; }).join('') + '</ol></div>' : '';

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + htmlEscape_(paper.className + ' ' + paper.subject + ' ' + paper.exam) + '</title><style>@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:Georgia,serif;color:#111;margin:0;background:#fff;font-size:14px;line-height:1.45}.paper{max-width:190mm;margin:auto}.header{text-align:center;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:10px}h1{font-size:24px;margin:0}.exam{font-size:16px;font-weight:700;margin-top:3px;text-transform:uppercase}.meta{display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;border:1px solid #111;padding:8px;margin-bottom:10px;font-weight:700}.instructions{border:1px solid #777;padding:8px 12px;margin-bottom:12px}.instructions ol{margin:5px 0 0 20px;padding:0}.section-title{display:flex;justify-content:space-between;font-weight:700;background:#eee;border:1px solid #111;padding:6px 8px;margin:12px 0 4px}.question{display:grid;grid-template-columns:38px 1fr 52px;gap:5px;padding:7px 2px;border-bottom:1px dotted #aaa;break-inside:avoid}.qnum,.marks{font-weight:700}.marks{text-align:right}.or{text-align:center;font-weight:700;margin:5px 0}.chapter{font-size:10px;color:#555;margin-top:4px;font-style:italic}.footer{margin-top:22px;display:flex;justify-content:space-between;font-size:11px;color:#555}.no-print{margin:12px auto;text-align:center}@media print{.no-print{display:none}.paper{max-width:none}}@media(max-width:600px){body{font-size:13px}.meta{grid-template-columns:1fr}.question{grid-template-columns:32px 1fr 42px}}</style></head><body><div class="no-print"><button onclick="window.print()" style="padding:10px 18px;font-weight:700">Print Question Paper</button></div><main class="paper"><div class="header"><h1>BG PUBLIC SCHOOL</h1><div class="exam">' + htmlEscape_(paper.exam || 'EXAMINATION') + '</div></div><div class="meta"><div>Class: ' + htmlEscape_(paper.className) + '</div><div>Subject: ' + htmlEscape_(paper.subject) + '</div><div>Time: ' + htmlEscape_(paper.timeAllowed) + '</div><div>Maximum Marks: ' + htmlEscape_(paper.maxMarks) + '</div><div>Reading Time: ' + htmlEscape_(readingTime) + '</div><div>Exam Date: ' + htmlEscape_(paper.examDate || '____________') + '</div></div>' + instructionsHtml + sectionHtml + '<div class="footer"><span>Teacher: ' + htmlEscape_(teacherId) + '</span><span>Version ' + htmlEscape_(version) + '</span></div></main></body></html>';
}

function buildManualPaperHtmlFromDraft_(draft, version) {
  const html = String(draft.editorHtml || '');
  const readingTime = inferReadingTime_(draft.className, draft.maxMarks);
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + htmlEscape_(draft.className + ' ' + draft.subject + ' ' + draft.exam) + '</title><style>@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:Georgia,serif;color:#111;margin:0;background:#fff;font-size:14px;line-height:1.5}.paper{max-width:190mm;margin:auto}.header{text-align:center;border-bottom:1.8px solid #111;padding-bottom:8px}.header h1{font-size:24px;margin:0}.exam{font-size:15px;font-weight:800;text-transform:uppercase;margin-top:3px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;border-bottom:1px solid #555;padding:8px 0 9px;margin-bottom:12px;font-weight:700}.meta div:nth-child(even){text-align:right}.content h2.section-heading{display:flex;justify-content:space-between;margin:17px 0 8px;padding:6px 8px;border:1px solid #222;background:#f0f0f0;font-size:14px}.content h3{font-size:14px;margin:12px 0 6px}.content p{margin:6px 0}.paper-instructions{border:1px solid #777;padding:8px 12px;margin-bottom:12px}.paper-instructions h3{margin:0 0 5px}.paper-instructions ol{margin:4px 0 0 20px;padding:0}.question-line{position:relative;padding-right:48px;break-inside:avoid}.mark-token{float:right;font-weight:800}.or-line{text-align:center;font-weight:800}.content table{width:100%;border-collapse:collapse;margin:8px 0}.content td,.content th{border:1px solid #333;padding:6px}.diagram-box{min-height:120px;border:1.5px dashed #666;display:grid;place-items:center;color:#777;margin:9px 0}.page-break{page-break-after:always;border-top:1px dashed #777;margin:24px 0}@media print{.print-action{display:none}}@media(max-width:600px){.meta{grid-template-columns:1fr}.content{padding:0 4px}}</style></head><body><main class="paper"><div class="header"><h1>BG PUBLIC SCHOOL</h1><div class="exam">' + htmlEscape_(draft.exam || 'EXAMINATION') + '</div></div><div class="meta"><div>Class: ' + htmlEscape_(draft.className) + '</div><div>Subject: ' + htmlEscape_(draft.subject) + '</div><div>Time Allotted: ' + htmlEscape_(draft.maxMarks ? inferPaperTime_(draft.maxMarks) : '—') + '</div><div>Maximum Marks: ' + htmlEscape_(draft.maxMarks) + '</div><div>Reading Time: ' + htmlEscape_(readingTime) + '</div><div>Date: ____________</div></div><div class="content">' + html + '</div></main></body></html>';
}

function buildCanonicalPaperHtml_(paper, teacherId, version) {
  const readingTime = inferReadingTime_(paper.className, paper.maxMarks);
  const safeBody = sanitizeHtmlForStorage_(paper.editorHtml || '');
  const instructionLines = cleanText_(paper.instructions || '')
    .split(/\n+/)
    .map(function(line) { return cleanText_(line); })
    .filter(String);
  const instructionsHtml = instructionLines.length
    ? '<div class="paper-instructions"><h3>General Instructions</h3><ol>' + instructionLines.map(function(line) { return '<li>' + htmlEscape_(line) + '</li>'; }).join('') + '</ol></div>'
    : '';

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + htmlEscape_(paper.className + ' ' + paper.subject + ' ' + paper.exam) + '</title><style>@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:Georgia,serif;color:#111;margin:0;background:#fff;font-size:14px;line-height:1.45}.paper{max-width:190mm;margin:auto}.header{text-align:center;border-bottom:1.8px solid #111;padding-bottom:8px;margin-bottom:10px}.header h1{font-size:24px;margin:0}.exam{font-size:15px;font-weight:700;text-transform:uppercase;margin-top:3px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;border:1px solid #111;padding:8px;margin-bottom:10px;font-weight:700}.meta div:nth-child(even){text-align:right}.content table{width:100%;border-collapse:collapse;margin:8px 0}.content td,.content th{border:1px solid #333;padding:6px}.diagram-image{max-width:100%;height:auto}.footer{margin-top:22px;display:flex;justify-content:space-between;font-size:11px;color:#555}.no-print{margin:12px auto;text-align:center}@media print{.no-print{display:none}.paper{max-width:none}}@media(max-width:600px){body{font-size:13px}.meta{grid-template-columns:1fr}.meta div:nth-child(even){text-align:left}}</style></head><body><div class="no-print"><button onclick="window.print()" style="padding:10px 18px;font-weight:700">Print Question Paper</button></div><main class="paper"><div class="header"><h1>BG PUBLIC SCHOOL</h1><div class="exam">' + htmlEscape_(paper.exam || 'EXAMINATION') + '</div></div><div class="meta"><div>Class: ' + htmlEscape_(paper.className) + '</div><div>Subject: ' + htmlEscape_(paper.subject) + '</div><div>Time: ' + htmlEscape_(paper.timeAllowed || inferPaperTime_(paper.maxMarks)) + '</div><div>Maximum Marks: ' + htmlEscape_(paper.maxMarks) + '</div><div>Reading Time: ' + htmlEscape_(readingTime) + '</div><div>Date: ' + htmlEscape_(paper.examDate || '') + '</div></div>' + instructionsHtml + '<div class="content">' + safeBody + '</div><div class="footer"><span>Teacher: ' + htmlEscape_(teacherId || '') + '</span><span>Version ' + htmlEscape_(version || 1) + '</span></div></main></body></html>';
}

function questionsToEditorHtml_(questions, instructions) {
  const safeInstructions = cleanText_(instructions || '');
  const intro = safeInstructions
    ? '<div class="paper-instructions"><h3>General Instructions</h3><ol>' + safeInstructions.split(/\n+/).map(function(line) { return cleanText_(line); }).filter(String).map(function(line) { return '<li>' + htmlEscape_(line) + '</li>'; }).join('') + '</ol></div>'
    : '';
  const body = (questions || []).map(function(question, index) {
    const orText = cleanText_(question.orText);
    return '<p class="question-line"><strong>Q' + (index + 1) + '.</strong> ' + nl2br_(htmlEscape_(question.text || '')) + ' <span class="mark-token">[' + htmlEscape_(question.marks || '') + ']</span></p>' + (orText ? '<p class="or-line">OR</p><p class="question-line">' + nl2br_(htmlEscape_(orText)) + '</p>' : '');
  }).join('');
  return intro + body;
}

function sanitizeHtmlForStorage_(html) {
  let value = String(html || '');
  value = value.replace(/<script[\s\S]*?<\/script>/gi, '');
  value = value.replace(/<iframe[\s\S]*?<\/iframe>/gi, '');
  value = value.replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '');
  value = value.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '');
  value = value.replace(/(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, '$1="#"');
  return value.slice(0, 450000);
}

function inferReadingTime_(className, maxMarks) {
  const match = String(className || '').match(/Class\s+(\d+)/i);
  const classNo = match ? Number(match[1]) : 0;
  return classNo >= 9 || Number(maxMarks) >= 70 ? 'Additional 15 Minutes' : 'Additional 10 Minutes';
}

function inferPaperTime_(maxMarks) {
  const marks = Number(maxMarks) || 0;
  if (marks <= 20) return '45 Minutes';
  if (marks <= 30) return '1 Hour';
  if (marks <= 40) return '1½ Hours';
  if (marks <= 50) return '2 Hours';
  if (marks <= 60) return '2½ Hours';
  return '3 Hours';
}

function enforceMarksClassAccess_(user, className) {
  if (!user.isAdmin && cleanText_(className) !== user.assignedClass) {
    throw new Error('You can enter marks only for ' + user.assignedClass + '.');
  }
}

function enforcePaperClassAccess_(user, className) {
  if (user.isAdmin) return; // Admin can use any class
  const validClasses = ALL_CLASSES;
  if (!validClasses.includes(cleanText_(className))) {
    throw new Error('Invalid class name.');
  }
  // All non-admin teachers can create/upload papers for any class
}

function createDraftId_() {
  return 'draft-' + Utilities.getUuid().slice(0, 12);
}

function ensureMasterSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(MASTER_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(MASTER_SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, MASTER_HEADERS.length).setValues([MASTER_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function ensureQuestionPaperSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(PAPER_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(PAPER_SHEET_NAME);
  sheet.getRange(1, 1, 1, PAPER_HEADERS.length).setValues([PAPER_HEADERS]);
  sheet.setFrozenRows(1);
  if (sheet.getLastRow() <= 1) sheet.autoResizeColumns(1, PAPER_HEADERS.length);
  return sheet;
}

function ensurePaperDraftSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(PAPER_DRAFTS_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(PAPER_DRAFTS_SHEET_NAME);

  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const existingHeaders = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function(v) { return cleanText_(v); });
  const headerSet = new Set(existingHeaders.filter(Boolean));

  PAPER_DRAFTS_HEADERS.forEach(function(header) {
    if (!headerSet.has(header)) {
      const nextCol = sheet.getLastColumn() + 1;
      sheet.getRange(1, nextCol).setValue(header);
      headerSet.add(header);
    }
  });

  sheet.setFrozenRows(1);
  if (sheet.getLastRow() <= 1) sheet.autoResizeColumns(1, Math.max(sheet.getLastColumn(), PAPER_DRAFTS_HEADERS.length));
  return sheet;
}

function getQuestionPaperFolder_() {
  const properties = PropertiesService.getScriptProperties();
  const savedId = properties.getProperty(PAPER_FOLDER_PROPERTY);
  if (savedId) {
    try {
      const savedFolder = DriveApp.getFolderById(savedId);
      if (!savedFolder.isTrashed()) return savedFolder;
    } catch (ignored) {
      properties.deleteProperty(PAPER_FOLDER_PROPERTY);
    }
  }
  const existing = DriveApp.getFoldersByName(PAPER_FOLDER_NAME);
  const folder = existing.hasNext() ? existing.next() : DriveApp.createFolder(PAPER_FOLDER_NAME);
  properties.setProperty(PAPER_FOLDER_PROPERTY, folder.getId());
  return folder;
}

function buildStoredPaperName_(className, subject, exam, version, extension) {
  return [className, subject, exam, 'V' + version]
    .map(function(value) {
      return cleanText_(value).replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    })
    .filter(String)
    .join('_') + '.' + extension;
}

function marksKey_(className, subject, exam, component, rollNo) {
  const parts = [
    cleanText_(className).toUpperCase(),
    cleanText_(subject).toUpperCase(),
    cleanText_(exam).toUpperCase(),
    cleanText_(component).toUpperCase(),
    normalizeRoll_(rollNo).toUpperCase()
  ];
  return parts.every(String) ? parts.join('|') : '';
}

function normalizeMarksValue_(value) {
  const raw = cleanText_(value).toUpperCase();
  if (raw === 'AB' || raw === 'ABSENT' || raw === 'A') return 'AB';
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error('Marks must be a number or AB.');
  return number;
}

function normalizeRoll_(value) {
  const raw = cleanText_(value);
  if (!raw) return '';
  const number = Number(raw);
  return Number.isFinite(number) ? String(number) : raw;
}

function fileExtension_(fileName) {
  const match = String(fileName || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
}

function cleanText_(value) {
  return String(value == null ? '' : value).trim();
}

function isoDate_(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? cleanText_(value) : date.toISOString();
}

function formatBytes_(bytes) {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function toBoolean_(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 1 || value === '1') return true;
  if (value === 'false' || value === 0 || value === '0') return false;
  return Boolean(fallback);
}

function htmlEscape_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function nl2br_(value) {
  return String(value || '').replace(/\r?\n/g, '<br>');
}

function jsonOutput_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function safeErrorMessage_(error) {
  return error && error.message ? String(error.message) : String(error || 'Unknown server error.');
}
