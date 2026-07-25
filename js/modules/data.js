(function () {
  'use strict';

  const CLASSES = Object.freeze([
    'Playgroup', 'LKG', 'UKG', 'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
    'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12'
  ]);

  const EXAMS = Object.freeze(['Unit Test 1', 'Unit Test 2', 'Half Yearly', 'Unit Test 3', 'Annual Exam']);
  const COMPONENTS = Object.freeze(['Written', 'Oral', 'Practical']);

  const TEACHER_BY_CLASS = Object.freeze({
    'Playgroup': 'T-1', 'LKG': 'T-2', 'UKG': 'T-3', 'Class 1': 'T-4', 'Class 2': 'T-5',
    'Class 3': 'T-6', 'Class 4': 'T-7', 'Class 5': 'T-8', 'Class 6': 'T-9', 'Class 7': 'T-10',
    'Class 8': 'T-11', 'Class 9': 'T-12', 'Class 10': 'T-13', 'Class 11': 'T-14', 'Class 12': 'T-15'
  });

  const SUBJECTS_BY_CLASS = Object.freeze({
    'Playgroup': Object.freeze(['English', 'Hindi', 'Maths', 'EVS', 'GK/Moral Science']),
    'LKG': Object.freeze(['English', 'Hindi', 'Maths', 'EVS', 'GK/Moral Science']),
    'UKG': Object.freeze(['English', 'Hindi', 'Maths', 'EVS', 'GK/Moral Science']),
    'Class 1': Object.freeze(['English', 'Hindi', 'Maths', 'SST', 'Science', 'GK/Moral Science', 'Computer']),
    'Class 2': Object.freeze(['English', 'Hindi', 'Maths', 'SST', 'Science', 'GK/Moral Science', 'Computer']),
    'Class 3': Object.freeze(['English', 'Hindi', 'Maths', 'SST', 'Science', 'GK/Moral Science', 'Computer']),
    'Class 4': Object.freeze(['English', 'Hindi', 'Maths', 'SST', 'Science', 'GK/Moral Science', 'Computer']),
    'Class 5': Object.freeze(['English', 'Hindi', 'Maths', 'SST', 'Science', 'GK/Moral Science', 'Computer']),
    'Class 6': Object.freeze(['English Language', 'English Literature', 'Hindi', 'Maths', 'Geography', 'History/Civics', 'Physics', 'Chemistry', 'Biology', 'Computer']),
    'Class 7': Object.freeze(['English Language', 'English Literature', 'Hindi', 'Maths', 'Geography', 'History/Civics', 'Physics', 'Chemistry', 'Biology', 'Computer']),
    'Class 8': Object.freeze(['English Language', 'English Literature', 'Hindi', 'Maths', 'Geography', 'History/Civics', 'Physics', 'Chemistry', 'Biology', 'Computer']),
    'Class 9': Object.freeze(['English Language', 'English Literature', 'Hindi', 'Maths', 'Geography', 'History/Civics', 'Physics', 'Chemistry', 'Biology', 'Computer']),
    'Class 10': Object.freeze(['English Language', 'English Literature', 'Hindi', 'Maths', 'Geography', 'History/Civics', 'Physics', 'Chemistry', 'Biology', 'Computer']),
    'Class 11': Object.freeze(['English', 'Physics', 'Chemistry', 'Biology', 'Maths', 'Account', 'Business', 'Economics', 'Computer']),
    'Class 12': Object.freeze(['English', 'Physics', 'Chemistry', 'Biology', 'Maths', 'Account', 'Business', 'Economics', 'Computer'])
  });
  const SUBJECT_SORT_ORDER = Object.freeze(['English','English Language','English Literature','Hindi','Maths','EVS','SST','Science','Geography','History/Civics','Physics','Chemistry','Biology','GK/Moral Science','Computer','Account','Business','Economics']);
  let observedMarksRows = [];

  function unique(values) {
    return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))];
  }

  function setObservedMarksRows(rows) {
    observedMarksRows = Array.isArray(rows) ? rows.slice() : [];
  }

  function displaySubjectName(value) {
    const key = String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');
    const aliases = {
      'ENGLISH LANGUAGE':'English Language','ENGLISH LITERATURE':'English Literature','ENGLISH':'English',
      'HINDI':'Hindi','MATH':'Maths','MATHEMATICS':'Maths','MATHS':'Maths','EVS':'EVS','SST':'SST',
      'SOCIAL STUDIES':'SST','SOCIAL SCIENCE':'SST','SCIENCE':'Science','GENERAL SCIENCE':'Science',
      'GEOGRAPHY':'Geography','HISTORY/CIVICS':'History/Civics','HISTORY AND CIVICS':'History/Civics',
      'PHYSICS':'Physics','CHEMISTRY':'Chemistry','BIOLOGY':'Biology','COMPUTER':'Computer','COMPUTER SCIENCE':'Computer',
      'GK/MORAL SCIENCE':'GK/Moral Science','GK/MSC':'GK/Moral Science','MORAL SCIENCE':'GK/Moral Science',
      'ACCOUNT':'Account','ACCOUNTS':'Account','ACCOUNTANCY':'Account','BUSINESS':'Business','BUSINESS STUDIES':'Business','ECONOMICS':'Economics'
    };
    return aliases[key] || String(value || '').trim();
  }

  function observedSubjectsForClass(className, referenceExam = 'Unit Test 1') {
    const classKey = String(className || '').trim().toUpperCase();
    const examKey = String(referenceExam || '').trim().toUpperCase();
    const values = observedMarksRows
      .filter((row) => String(row.className || '').trim().toUpperCase() === classKey && String(row.examType || '').trim().toUpperCase() === examKey)
      .map((row) => displaySubjectName(row.subject))
      .filter(Boolean);
    const uniqueValues = unique(values);
    return uniqueValues.sort((a,b) => {
      const ai = SUBJECT_SORT_ORDER.indexOf(a); const bi = SUBJECT_SORT_ORDER.indexOf(b);
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.localeCompare(b);
    });
  }

  function subjectsForClass(className) {
    const name = String(className || '').trim();
    const observed = observedSubjectsForClass(name, 'Unit Test 1');
    if (observed.length) return observed;
    return [...(SUBJECTS_BY_CLASS[name] || SUBJECT_SORT_ORDER)];
  }

  function normalizeSubjectForStorage(subject, className) {
    let value = String(subject || 'UNKNOWN').toUpperCase().trim().replace(/\s+/g, ' ');
    if (!/^Class\s[1-5]$/.test(String(className || '').trim())) return value;

    if (['ENGLISH LANGUAGE', 'ENGLISH LITERATURE'].includes(value)) return 'ENGLISH';
    if (['MATHEMATICS', 'MATH'].includes(value)) return 'MATHS';
    if ([
      'EVS', 'EVS/SOCIAL', 'EVS / SOCIAL', 'EVS & SOCIAL', 'EVS AND SOCIAL', 'SOCIAL',
      'SOCIAL STUDIES', 'SOCIAL STUDY', 'SOCIAL SCIENCE', 'SST', 'S.ST', 'S.ST.', 'S.STUDIES'
    ].includes(value)) return 'SST';
    if (['GENERAL SCIENCE', 'BASIC SCIENCE', 'SCIENCES'].includes(value)) return 'SCIENCE';
    if ([
      'GK', 'G.K', 'G.K.', 'GENERAL KNOWLEDGE', 'GK/MSC', 'GK / MSC', 'GK-MSC', 'GK & MSC',
      'GK/MORAL SCIENCE', 'GK / MORAL SCIENCE', 'MORAL SCIENCE', 'MORAL SCIENCE/GK', 'MSC', 'M.SC'
    ].includes(value)) return 'GK/MORAL SCIENCE';
    return value;
  }

  function teacherForClass(className) {
    return TEACHER_BY_CLASS[String(className || '').trim()] || '';
  }

  function normalizeRoll(value) {
    const raw = String(value == null ? '' : value).trim();
    if (!raw) return '';
    const number = Number(raw);
    return Number.isFinite(number) ? String(number) : raw;
  }

  function isAbsent(value) {
    return ['AB', 'ABSENT', 'A'].includes(String(value == null ? '' : value).trim().toUpperCase());
  }

  function safeDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value || '');
    return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  window.BGPS_DATA = Object.freeze({ CLASSES, EXAMS, COMPONENTS, TEACHER_BY_CLASS, teacherForClass, subjectsForClass, observedSubjectsForClass, setObservedMarksRows, displaySubjectName, normalizeSubjectForStorage, normalizeRoll, isAbsent, safeDate });
})();
