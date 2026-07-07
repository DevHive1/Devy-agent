---
name: "Security Hardening"
description: "Proactively identify and patch security vulnerabilities and implement defensive coding patterns."
allowed-tools: ["execute_command", "search_code", "edit_file", "read_file", "run_tests"]
---

# 🛡️ Security Hardening Workflow

This skill focuses on reducing the attack surface and ensuring the codebase is resilient to vulnerabilities.

### 1. Vulnerability Scanning
- Use `execute_command` to run dependency audits (e.g., `npm audit`, `snyk`) and identify known vulnerabilities in third-party packages.
- Search for common security anti-patterns (e.g., hardcoded secrets, unsafe eval, SQL injection, XSS) using `search_code`.

### 2. Impact Analysis
- For each identified vulnerability, use `read_file` to determine if the vulnerable code path is actually reachable and exploitable in the current context.
- Assess the risk level (Critical, High, Medium, Low) based on the potential impact on data and system availability.

### 3. Remediation & Patching
- Update vulnerable dependencies to secure versions using `execute_command`.
- Implement defensive coding patterns (e.g., input validation, parameterized queries, output encoding) using `edit_file`.
- Ensure that security fixes do not break existing functionality by running the test suite.

### 4. Verification & Hardening
- Re-run security scans to confirm the vulnerabilities are resolved.
- Implement additional security layers (e.g., Content Security Policy, rate limiting) where applicable.

### 5. Security Audit Log
- Document all identified vulnerabilities and their resolutions in the project memory for future audits.
