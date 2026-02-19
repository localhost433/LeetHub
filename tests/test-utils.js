// Mock for browser-specific APIs and helper export for our tests

// 1. common.js exports
const Common = {};

// We can copy-paste the pure functions here or create a mock file structure that allows require.
// Since we don't have modules, copy-pasting for unit tests is the most straightforward
// without rewriting the entire repo to CommonJS/ESM.

Common.toKebabCase = (string) => {
  return string
    .replace(/[^a-zA-Z0-9\. ]/g, '')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
};

Common.appendSubmissionIdToFilename = (fileName, submissionId) => {
  const id = String(submissionId || '').trim();
  if (!id) return fileName;

  const name = String(fileName || '');
  const lastDot = name.lastIndexOf('.');
  if (lastDot > 0 && lastDot < name.length - 1) {
    const base = name.slice(0, lastDot);
    const ext = name.slice(lastDot);
    if (base.endsWith(`_${id}`)) return name;
    return `${base}_${id}${ext}`;
  }
  if (name.endsWith(`_${id}`)) return name;
  return `${name}_${id}`;
};

// 2. adapter logic mock
// We extract the pure logic from _extractCodeFromHtml which relies on DOMParser.
// Since we are in Node, we can simulate the "script text content" extraction step.

const AdapterMock = {};

AdapterMock.extractCodeFromHtml = (htmlFragment) => {
    // This mocks the regex logic inside _extractCodeFromHtml AFTER DOMParser
    // const scripts = doc.querySelectorAll('script'); ... script.textContent ...
    
    // Simulate finding the meaningful script content
    const text = htmlFragment; 
    
    // Original Logic:
    // const match = text.match(/submissionCode:\s*'([^']+)'/);
    // if (match && match[1]) { ... }
    
    const match = text.match(/submissionCode:\s*'([^']+)'/);
    if (match && match[1]) {
       try {
           return JSON.parse(`"${match[1]}"`); // decodeUnicode
       } catch (e) {
           return match[1];
       }
    }
    return null;
};

AdapterMock.decodeUnicode = (str) => {
      try {
        return JSON.parse(`"${str}"`); 
      } catch (e) {
        return str;
      }
};

module.exports = {
  ...Common,
  ...AdapterMock
};
