const {
  toKebabCase,
  appendSubmissionIdToFilename
} = require('./test-utils'); 

describe('Common Utils', () => {

  describe('toKebabCase', () => {
    test('converts spaces to dashes', () => {
      expect(toKebabCase('Hello World')).toBe('hello-world');
    });

    test('handles special characters', () => {
      expect(toKebabCase('Hello.World!')).toBe('hello.world');
    });
    
    test('converts camelCase to kebab-case', () => {
         // The current implementation might not fully support this based on my quick read, let's verify behavior
         // .replace(/([a-z])([A-Z])/g, '$1-$2') is present.
         expect(toKebabCase('helloWorld')).toBe('hello-world');
    });
    
    test('handles mixed content', () => {
        expect(toKebabCase('LeetCode 123. Two Sum')).toBe('leet-code-123.-two-sum');
    });
  });

  describe('appendSubmissionIdToFilename', () => {
      test('appends ID before extension', () => {
          expect(appendSubmissionIdToFilename('test.py', '123')).toBe('test_123.py');
      });
      
      test('appends ID if no extension', () => {
          expect(appendSubmissionIdToFilename('README', '456')).toBe('README_456');
      });
      
      test('does not duplicate ID if already present', () => {
          expect(appendSubmissionIdToFilename('test_123.py', '123')).toBe('test_123.py'); 
      });
  });

});
