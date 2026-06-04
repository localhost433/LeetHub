/* eslint-disable no-unused-vars */

/* Global Constants */
const languages = {
  Python: '.py',
  Python3: '.py',
  'C++': '.cpp',
  C: '.c',
  Java: '.java',
  'C#': '.cs',
  JavaScript: '.js',
  Javascript: '.js',
  Ruby: '.rb',
  Swift: '.swift',
  Go: '.go',
  Kotlin: '.kt',
  Scala: '.scala',
  Rust: '.rs',
  PHP: '.php',
  TypeScript: '.ts',
  MySQL: '.sql',
  'MS SQL Server': '.sql',
  Oracle: '.sql',
};

const leetCodeApiLangToExt = {
  python: '.py',
  python3: '.py',
  cpp: '.cpp',
  'c++': '.cpp',
  c: '.c',
  java: '.java',
  javascript: '.js',
  typescript: '.ts',
  csharp: '.cs',
  ruby: '.rb',
  swift: '.swift',
  go: '.go',
  kotlin: '.kt',
  scala: '.scala',
  rust: '.rs',
  php: '.php',
  mysql: '.sql',
  mssql: '.sql',
  'ms sql server': '.sql',
  oraclesql: '.sql',
  oracle: '.sql',
};

const readmeMsg = 'Create README - LeetHub';
const discussionMsg = 'Prepend discussion post - LeetHub';
const createNotesMsg = 'Attach NOTES - LeetHub';
const submitMsg = 'Added solution - LeetHub';

// problem types
const NORMAL_PROBLEM = 0;
const EXPLORE_SECTION_PROBLEM = 1;

// LeetCode Import Settings
const DEFAULT_LEETCODE_IMPORT_SETTINGS = {
  mode: 'latest_per_lang',
  scope: 'backfill_only',
};

// Export for Node/Jest. In the browser `module` is undefined, so this is a
// no-op and the declarations above remain plain globals (the content-script
// shared scope). This lets tests import the real source instead of a copy.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    languages,
    leetCodeApiLangToExt,
    readmeMsg,
    discussionMsg,
    createNotesMsg,
    submitMsg,
    NORMAL_PROBLEM,
    EXPLORE_SECTION_PROBLEM,
    DEFAULT_LEETCODE_IMPORT_SETTINGS,
  };
}
