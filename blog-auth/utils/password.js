// Shared password policy: at least 8 characters, with a letter and a number.
function passwordIssue(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Password must be at least 8 characters.';
  if (pw.length > 72) return 'Password must be 72 characters or fewer.'; // bcrypt ignores anything beyond 72 bytes
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Password must contain at least one letter and one number.';
  return '';
}
module.exports = { passwordIssue };
