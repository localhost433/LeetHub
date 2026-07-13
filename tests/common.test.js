// Unit tests for the pure helpers in scripts/common.js.
//
// These import the REAL source (via the UMD export guard at the bottom of
// common.js), so a change to common.js that breaks behavior fails here — no
// hand-copied reimplementations to drift out of sync.
//
// Content scripts share one global scope in the browser, so common.js reads
// some constants (e.g. DEFAULT_LEETCODE_IMPORT_SETTINGS) as free globals. We
// reproduce that by hoisting constants.js's exports onto `global` before
// requiring common.js.
Object.assign(global, require('../scripts/constants'));

const {
  normalizeLeetCodeImportSettings,
  appendSubmissionIdToFilename,
  hasAnyCodeShaForFolder,
  hasSubmissionIdShaForFolder,
  padProblemId,
  buildLeetCodeFolderName,
  decodeLeetCodeEscapedString,
  extractLeetCodeSubmissionCodeFromHtml,
  difficultyLabelFromLevel,
  bumpSolvedStats,
  problemIdFromFolderName,
  countSolvedByDifficulty,
} = require('../scripts/common');

describe('appendSubmissionIdToFilename', () => {
  test('inserts id before the extension', () => {
    expect(appendSubmissionIdToFilename('two-sum.py', '123')).toBe(
      'two-sum_123.py',
    );
  });
  test('appends id when there is no extension', () => {
    expect(appendSubmissionIdToFilename('README', '456')).toBe(
      'README_456',
    );
  });
  test('is idempotent when id already present', () => {
    expect(
      appendSubmissionIdToFilename('two-sum_123.py', '123'),
    ).toBe('two-sum_123.py');
  });
  test('uses only the final dot as the extension boundary', () => {
    expect(appendSubmissionIdToFilename('a.b.c.py', '9')).toBe(
      'a.b.c_9.py',
    );
  });
  test('returns the name unchanged when id is empty', () => {
    expect(appendSubmissionIdToFilename('two-sum.py', '')).toBe(
      'two-sum.py',
    );
  });
});

describe('padProblemId', () => {
  test('pads short ids to width 4', () => {
    expect(padProblemId(1)).toBe('0001');
    expect(padProblemId('42')).toBe('0042');
  });
  test('leaves 4+ digit ids unchanged', () => {
    expect(padProblemId(1234)).toBe('1234');
    expect(padProblemId('12345')).toBe('12345');
  });
  test('returns null for empty/nullish input', () => {
    expect(padProblemId('')).toBeNull();
    expect(padProblemId(null)).toBeNull();
    expect(padProblemId(undefined)).toBeNull();
  });
});

describe('buildLeetCodeFolderName', () => {
  test('combines padded id and slug', () => {
    expect(buildLeetCodeFolderName(1, 'two-sum')).toBe(
      '0001-two-sum',
    );
  });
  test('returns null without an id', () => {
    expect(buildLeetCodeFolderName(null, 'two-sum')).toBeNull();
  });
  test('returns null without a slug', () => {
    expect(buildLeetCodeFolderName(1, '')).toBeNull();
  });
});

describe('hasAnyCodeShaForFolder', () => {
  const folder = '0001-two-sum';
  test('true when a non-doc file exists for the folder', () => {
    expect(
      hasAnyCodeShaForFolder(
        { '0001-two-sum/0001-two-sum.py': 'sha' },
        folder,
      ),
    ).toBe(true);
  });
  test('ignores README/NOTES/DISCUSSION', () => {
    const shaMap = {
      '0001-two-sum/README.md': 'a',
      '0001-two-sum/NOTES.md': 'b',
      '0001-two-sum/DISCUSSION.md': 'c',
    };
    expect(hasAnyCodeShaForFolder(shaMap, folder)).toBe(false);
  });
  test('false for empty map or missing folder', () => {
    expect(hasAnyCodeShaForFolder({}, folder)).toBe(false);
    expect(hasAnyCodeShaForFolder(null, folder)).toBe(false);
    expect(hasAnyCodeShaForFolder({ 'x/y.py': 's' }, '')).toBe(false);
  });
});

describe('hasSubmissionIdShaForFolder', () => {
  const folder = '0001-two-sum';
  test('matches the current _<id> suffix scheme', () => {
    const shaMap = { '0001-two-sum/0001-two-sum_999.py': 'sha' };
    expect(hasSubmissionIdShaForFolder(shaMap, folder, '999')).toBe(
      true,
    );
  });
  test('matches the legacy __<id> suffix scheme', () => {
    const shaMap = { '0001-two-sum/0001-two-sum__999.py': 'sha' };
    expect(hasSubmissionIdShaForFolder(shaMap, folder, '999')).toBe(
      true,
    );
  });
  test('false when the id is not present', () => {
    const shaMap = { '0001-two-sum/0001-two-sum_111.py': 'sha' };
    expect(hasSubmissionIdShaForFolder(shaMap, folder, '999')).toBe(
      false,
    );
  });
  test('false for empty id', () => {
    expect(
      hasSubmissionIdShaForFolder(
        { '0001-two-sum/x_1.py': 's' },
        folder,
        '',
      ),
    ).toBe(false);
  });
});

describe('difficultyLabelFromLevel', () => {
  test('maps levels 1/2/3', () => {
    expect(difficultyLabelFromLevel(1)).toBe('Easy');
    expect(difficultyLabelFromLevel(2)).toBe('Medium');
    expect(difficultyLabelFromLevel(3)).toBe('Hard');
  });
  test('empty string for anything else', () => {
    expect(difficultyLabelFromLevel(0)).toBe('');
    expect(difficultyLabelFromLevel(undefined)).toBe('');
  });
});

describe('decodeLeetCodeEscapedString', () => {
  test('decodes \\uXXXX sequences', () => {
    expect(decodeLeetCodeEscapedString('\\u003Cdiv\\u003E')).toBe(
      '<div>',
    );
    expect(decodeLeetCodeEscapedString('\\u0041')).toBe('A');
  });
  test('passes through plain text', () => {
    expect(decodeLeetCodeEscapedString('hello world')).toBe(
      'hello world',
    );
  });
  test('returns null for null input', () => {
    expect(decodeLeetCodeEscapedString(null)).toBeNull();
  });
});

describe('normalizeLeetCodeImportSettings', () => {
  test('keeps valid mode/scope', () => {
    expect(
      normalizeLeetCodeImportSettings({
        mode: 'all_submissions',
        scope: 'backfill_and_new',
      }),
    ).toEqual({ mode: 'all_submissions', scope: 'backfill_and_new' });
  });
  test('falls back to defaults for invalid/missing values', () => {
    expect(normalizeLeetCodeImportSettings(null)).toEqual({
      mode: 'latest_per_lang',
      scope: 'backfill_only',
    });
    expect(
      normalizeLeetCodeImportSettings({
        mode: 'bogus',
        scope: 'bogus',
      }),
    ).toEqual({
      mode: 'latest_per_lang',
      scope: 'backfill_only',
    });
  });
});

describe('extractLeetCodeSubmissionCodeFromHtml', () => {
  test('extracts submissionCode from a __NEXT_DATA__ blob', () => {
    const code =
      'class Solution:\n    def two_sum(self):\n        return []';
    const html = `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
      {
        props: {
          pageProps: { submissionDetail: { submissionCode: code } },
        },
      },
    )}</script></body></html>`;
    expect(extractLeetCodeSubmissionCodeFromHtml(html)).toBe(code);
  });
  test('returns null when no code is present', () => {
    expect(
      extractLeetCodeSubmissionCodeFromHtml(
        '<html><body>no code here</body></html>',
      ),
    ).toBeNull();
  });
  test('returns null for non-string input', () => {
    expect(extractLeetCodeSubmissionCodeFromHtml(null)).toBeNull();
  });
});

describe('bumpSolvedStats', () => {
  test('increments solved and easy for Easy difficulty', () => {
    const stats = { solved: 5, easy: 2, medium: 1, hard: 1 };
    bumpSolvedStats(stats, 'Easy');
    expect(stats.solved).toBe(6);
    expect(stats.easy).toBe(3);
    expect(stats.medium).toBe(1);
    expect(stats.hard).toBe(1);
  });

  test('increments solved and medium for Medium difficulty', () => {
    const stats = { solved: 5, easy: 2, medium: 1, hard: 1 };
    bumpSolvedStats(stats, 'Medium');
    expect(stats.solved).toBe(6);
    expect(stats.easy).toBe(2);
    expect(stats.medium).toBe(2);
    expect(stats.hard).toBe(1);
  });

  test('increments solved and hard for Hard difficulty', () => {
    const stats = { solved: 5, easy: 2, medium: 1, hard: 1 };
    bumpSolvedStats(stats, 'Hard');
    expect(stats.solved).toBe(6);
    expect(stats.easy).toBe(2);
    expect(stats.medium).toBe(1);
    expect(stats.hard).toBe(2);
  });

  test('increments only solved for unknown difficulty', () => {
    const stats = { solved: 3, easy: 1, medium: 1, hard: 1 };
    bumpSolvedStats(stats, 'Unknown');
    expect(stats.solved).toBe(4);
    expect(stats.easy).toBe(1);
    expect(stats.medium).toBe(1);
    expect(stats.hard).toBe(1);
  });

  test('increments only solved when difficulty is empty string', () => {
    const stats = { solved: 3, easy: 1, medium: 1, hard: 1 };
    bumpSolvedStats(stats, '');
    expect(stats.solved).toBe(4);
    expect(stats.easy).toBe(1);
  });

  test('treats missing counters as 0', () => {
    const stats = {};
    bumpSolvedStats(stats, 'Hard');
    expect(stats.solved).toBe(1);
    expect(stats.easy).toBeUndefined();
    expect(stats.medium).toBeUndefined();
    expect(stats.hard).toBe(1);
  });

  test('treats missing counters as 0 for Easy', () => {
    const stats = {};
    bumpSolvedStats(stats, 'Easy');
    expect(stats.solved).toBe(1);
    expect(stats.easy).toBe(1);
  });

  test('accumulates across multiple calls', () => {
    const stats = { solved: 0, easy: 0, medium: 0, hard: 0 };
    bumpSolvedStats(stats, 'Easy');
    bumpSolvedStats(stats, 'Medium');
    bumpSolvedStats(stats, 'Hard');
    bumpSolvedStats(stats, 'Easy');
    expect(stats.solved).toBe(4);
    expect(stats.easy).toBe(2);
    expect(stats.medium).toBe(1);
    expect(stats.hard).toBe(1);
  });

  test('returns the mutated stats object', () => {
    const stats = { solved: 0 };
    const result = bumpSolvedStats(stats, 'Easy');
    expect(result).toBe(stats);
    expect(result.solved).toBe(1);
  });

  test('returns input unchanged for null/non-object', () => {
    expect(bumpSolvedStats(null, 'Easy')).toBeNull();
    expect(bumpSolvedStats(undefined, 'Easy')).toBeUndefined();
    expect(bumpSolvedStats(42, 'Easy')).toBe(42);
  });
});

describe('problemIdFromFolderName', () => {
  test('extracts the padded id from a repo folder name', () => {
    expect(problemIdFromFolderName('0001-two-sum')).toBe('0001');
    expect(
      problemIdFromFolderName('1768-merge-strings-alternately'),
    ).toBe('1768');
  });

  test('pads a short leading id', () => {
    expect(problemIdFromFolderName('42-trapping-rain-water')).toBe(
      '0042',
    );
  });

  test('returns null when there is no numeric id', () => {
    expect(problemIdFromFolderName('two-sum')).toBeNull();
    expect(problemIdFromFolderName('')).toBeNull();
    expect(problemIdFromFolderName(null)).toBeNull();
    expect(problemIdFromFolderName('.github')).toBeNull();
  });
});

describe('countSolvedByDifficulty', () => {
  const solved = [
    { frontendId: 1, titleSlug: 'two-sum', difficulty: 'Easy' },
    {
      frontendId: 2,
      titleSlug: 'add-two-numbers',
      difficulty: 'Medium',
    },
    {
      frontendId: 4,
      titleSlug: 'median-of-two-sorted-arrays',
      difficulty: 'Hard',
    },
    {
      frontendId: 42,
      titleSlug: 'trapping-rain-water',
      difficulty: 'Hard',
    },
  ];

  test('counts repo folders by difficulty from the solved list', () => {
    const counts = countSolvedByDifficulty(
      [
        '0001-two-sum',
        '0002-add-two-numbers',
        '0042-trapping-rain-water',
      ],
      solved,
    );
    expect(counts).toEqual({ easy: 1, medium: 1, hard: 1 });
  });

  test('matches on problem id even if the folder slug drifted', () => {
    const counts = countSolvedByDifficulty(
      ['0004-median-renamed'],
      solved,
    );
    expect(counts).toEqual({ easy: 0, medium: 0, hard: 1 });
  });

  test('ignores folders with no matching solved problem', () => {
    const counts = countSolvedByDifficulty(
      ['0001-two-sum', '9999-not-a-problem', 'assets'],
      solved,
    );
    expect(counts).toEqual({ easy: 1, medium: 0, hard: 0 });
  });

  test('counts each problem once even if the folder repeats', () => {
    const counts = countSolvedByDifficulty(
      ['0001-two-sum', '0001-two-sum'],
      solved,
    );
    expect(counts).toEqual({ easy: 1, medium: 0, hard: 0 });
  });

  test('accepts a Set of folder names', () => {
    const counts = countSolvedByDifficulty(
      new Set(['0001-two-sum', '0002-add-two-numbers']),
      solved,
    );
    expect(counts).toEqual({ easy: 1, medium: 1, hard: 0 });
  });

  test('returns zeros when the solved list is empty or missing', () => {
    expect(countSolvedByDifficulty(['0001-two-sum'], [])).toEqual({
      easy: 0,
      medium: 0,
      hard: 0,
    });
    expect(countSolvedByDifficulty(['0001-two-sum'], null)).toEqual({
      easy: 0,
      medium: 0,
      hard: 0,
    });
  });
});
