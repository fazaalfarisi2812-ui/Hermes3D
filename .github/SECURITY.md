# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| main    | :white_check_mark: |

## Reporting a Vulnerability

Please report security vulnerabilities to **quality.managemen@puriasri.co.id** with the subject line `[SECURITY] Hermes3D Vulnerability Report`.

Include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We aim to respond within 48 hours and will coordinate disclosure timing.

## Security Features

- **Secrets scanning**: gitleaks runs on every push/PR via GitHub Actions
- **Dependency scanning**: Dependabot weekly updates for npm and GitHub Actions
- **Pre-commit hooks**: gitleaks + lint-staged + typecheck + tests
- **Branch protection**: Required reviews, status checks, linear history

## Security Hardening Checklist

Based on [dev.to repo security checklist](https://dev.to/github/a-comprehensive-repository-security-checklist-for-github-3m8k) and [repo-security-scanner](https://github.com/techjacker/repo-security-scanner):

- [x] Secrets scanning (gitleaks)
- [x] Dependabot for npm + GitHub Actions
- [x] Pre-commit hooks (gitleaks, lint, typecheck, tests)
- [x] Branch protection (via CODEOWNERS + required checks)
- [x] Security policy (this file)
- [x] Signed commits (enforced via husky + commitlint)
- [x] Least-privilege CI permissions (contents: read)
- [x] Dependency review (via Dependabot grouping)
- [ ] SBOM generation (planned)
- [ ] SAST (planned: CodeQL)
