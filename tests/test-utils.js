// Helper exports for unit tests.
//
// NOTE: these are copies of the pure functions in scripts/common.js. The
// extension has no module system (scripts are loaded as globals via the
// manifest), so the implementations are mirrored here for Node/Jest. Keep them
// in sync with scripts/common.js until the source is bundled (see issue #6).

const Common = {};

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

module.exports = {
  ...Common,
};
