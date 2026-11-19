// The same rule as `projects_repo_format` in the schema. Pure: the client's repo picker imports
// it without pulling the server's GitHub client into its bundle.
const REPO =
  /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,99}\/[A-Za-z0-9_-][A-Za-z0-9_.-]{0,99}$/;

/** Whether `repo` is a GitHub `owner/name` the platform accepts. */
export function isRepo(repo: string): boolean {
  return REPO.test(repo);
}
