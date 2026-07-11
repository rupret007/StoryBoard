/**
 * Return the only database URL that integration tests may use.
 * Deliberately do not read DATABASE_URL: a test must opt in explicitly.
 */
export function requireTestDatabaseUrl(env = process.env) {
  const value = env.STORYBOARD_TEST_DATABASE_URL?.trim();
  if (!value) {
    throw new Error(
      "STORYBOARD_TEST_DATABASE_URL is required; integration tests never fall back to DATABASE_URL."
    );
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("STORYBOARD_TEST_DATABASE_URL must be a valid database URL.");
  }
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!/test/i.test(databaseName)) {
    throw new Error(
      "STORYBOARD_TEST_DATABASE_URL must name a dedicated database containing 'test'."
    );
  }
  return value;
}
