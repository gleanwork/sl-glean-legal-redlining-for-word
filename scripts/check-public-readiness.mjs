import { existsSync, readFileSync } from "node:fs";

const requiredFiles = [
  "README.md",
  "LICENSE",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  ".github/workflows/ci.yml",
  ".github/dependabot.yml",
  ".github/CODEOWNERS",
  ".github/pull_request_template.md",
  "deployment/config/prod.env.example",
  "manifest.xml.example",
];

const forbiddenFiles = [
  "deployment/config/prod.env",
  "deployment/config/dev.env",
  "manifest.xml",
  "src/config/api.js",
  "src/config/glean-defaults.js",
  "src/taskpane/login.js",
  "src/taskpane/auth.js",
];

const failures = [];

for (const file of requiredFiles) {
  if (!existsSync(file)) {
    failures.push(`Missing required public-readiness file: ${file}`);
  }
}

for (const file of forbiddenFiles) {
  if (existsSync(file)) {
    failures.push(`Generated or environment-specific file should not be committed: ${file}`);
  }
}

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
if (packageJson.name !== "sl-glean-legal-redlining-for-word") {
  failures.push("package.json name must match the GitHub repository name.");
}

for (const field of ["description", "repository", "bugs", "homepage", "license"]) {
  if (!packageJson[field]) {
    failures.push(`package.json is missing ${field}.`);
  }
}

if (packageJson.license !== "MIT") {
  failures.push("package.json license must stay aligned with LICENSE.");
}

const readme = readFileSync("README.md", "utf8");
if (!readme.includes("This example is not legal advice.")) {
  failures.push("README.md must include legal-review positioning for public users.");
}

const contributing = readFileSync("CONTRIBUTING.md", "utf8");
if (/Rust|Apache|dual licen[cs]e/i.test(contributing)) {
  failures.push("CONTRIBUTING.md must not contain unrelated Rust or dual-license boilerplate.");
}

const security = readFileSync("SECURITY.md", "utf8");
for (const phrase of ["legal documents", "OAuth", "AWS", "support@glean.com"]) {
  if (!security.includes(phrase)) {
    failures.push(`SECURITY.md should mention ${phrase}.`);
  }
}

if (failures.length > 0) {
  console.error("Public-readiness checks failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Public-readiness checks passed.");
