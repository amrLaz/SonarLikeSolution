#!/usr/bin/env python3
"""
ci_platform_scan.py — SonarQube-comparable SAST runner.

Supported analyzers per language:
  Python    : pylint (quality/bugs) · radon (complexity) · bandit (security)
  JS / TS   : ESLint · tsc
  Java      : PMD · Checkstyle
  C#        : dotnet build (Roslyn analyzers)
  Go        : go vet · staticcheck
  Ruby      : rubocop
  PHP       : phpstan · phpcs
  C / C++   : cppcheck
  Kotlin    : detekt
  All langs : semgrep (security-audit + secrets rulesets)

Score formulas (SonarQube-inspired, severity-weighted with per-level caps):
  security_score        <- vulnerabilities + hotspots
  reliability_score     <- bugs
  maintainability_score <- code_smells

All tools are optional: if not installed they are skipped with a warning.
"""

import json
import math
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from fnmatch import fnmatch
from dataclasses import dataclass
from pathlib import Path

# ── Severity constants ────────────────────────────────────────────────────────
BLOCKER = "BLOCKER"
HIGH    = "HIGH"
MEDIUM  = "MEDIUM"
LOW     = "LOW"
INFO    = "INFO"

_RAW_TO_SEV: dict[str, str] = {
    "blocker": BLOCKER, "critical": BLOCKER, "fatal": BLOCKER,
    "error": HIGH,      "high": HIGH,
    "warning": MEDIUM,  "major": MEDIUM,     "medium": MEDIUM,
    "minor": LOW,       "low": LOW,          "info": LOW,
    "convention": INFO, "refactor": INFO,
}

# Track critical security scanner execution quality to avoid false-positive scores.
SECURITY_SCAN_STATUS: dict[str, str] = {
    "semgrep": "not-run",
    "detect-secrets": "not-run",
}

# ── ESLint security rule classification ───────────────────────────────────────
# Rules that represent actual exploitable code vulnerabilities.
_ESLINT_VULNERABILITY_RULES: frozenset[str] = frozenset({
    "no-eval", "no-implied-eval", "no-script-url", "no-new-func",
    "no-unsafe-eval",
    "security/detect-eval-with-expression",
    "security/detect-non-literal-fs-filename",
    "security/detect-non-literal-regexp",
    "security/detect-object-injection",
    "security/detect-possible-timing-attacks",
    "security/detect-pseudoRandomBytes",
    "security/detect-unsafe-regex",
    "security/detect-buffer-noassert",
    "security/detect-child-process",
    "security/detect-non-literal-require",
    "no-unsafe-innerHTML",
    "@typescript-eslint/no-unsafe-eval",
})

# Rules that are security-sensitive but not directly exploitable — require human review.
_ESLINT_HOTSPOT_RULES: frozenset[str] = frozenset({
    "security/detect-disable-mustache-escape",
    "react/no-danger",
    "react/no-danger-with-children",
    "no-debugger",
})

# ── Roslyn / MSBuild rule classification ─────────────────────────────────────
_ROSLYN_SECURITY_PREFIXES: tuple[str, ...] = (
    "CA30", "CA31", "CA32", "CA33", "CA34", "CA35", "CA36", "CA37", "CA38",
    "CA50",          # CA5xxx = security rules (cryptography, CSRF, XSS, …)
)
_ROSLYN_RELIABILITY_PREFIXES: tuple[str, ...] = ("CA20", "CA21",)
_ROSLYN_DESIGN_PREFIXES: tuple[str, ...] = ("CA10", "CA11", "CA12", "CA16",)


def _roslyn_classify(rule_id: str, is_error: bool) -> tuple[str, str]:
    """Return (category, severity) for a Roslyn/MSBuild rule identifier."""
    if any(rule_id.startswith(p) for p in _ROSLYN_SECURITY_PREFIXES):
        return "vulnerability", HIGH
    if any(rule_id.startswith(p) for p in _ROSLYN_RELIABILITY_PREFIXES):
        return "bug", HIGH if is_error else MEDIUM
    if rule_id.startswith("CS"):      # C# compiler diagnostics
        return ("bug", HIGH) if is_error else ("code_smell", MEDIUM)
    if rule_id.startswith("IDE"):     # IDE style / refactor hints
        return "code_smell", LOW
    if any(rule_id.startswith(p) for p in _ROSLYN_DESIGN_PREFIXES):
        return "code_smell", MEDIUM if is_error else LOW
    return ("bug" if is_error else "code_smell", HIGH if is_error else MEDIUM)


def _sev(raw: str) -> str:
    return _RAW_TO_SEV.get(raw.strip().lower(), MEDIUM)


# ── Scoring ───────────────────────────────────────────────────────────────────
def _compute_score(findings: list, category_filter: set) -> int:
    """
    SonarQube-inspired severity-weighted score with per-level caps.

    Deduction per finding (with cap so many small issues don't kill the score):
      BLOCKER: 25 pts each, cap 50   -> 2+ blockers bring score to ~50
      HIGH:     8 pts each, cap 35   -> 5+ high bring score to ~65
      MEDIUM:   2 pts each, cap 15   -> many medium max deduct 15
      LOW:      1 pt  each, cap  5
    """
    relevant = [f for f in findings if f.category in category_filter]
    counts: dict[str, int] = {BLOCKER: 0, HIGH: 0, MEDIUM: 0, LOW: 0}
    for f in relevant:
        if f.severity in counts:
            counts[f.severity] += 1

    deduction = (
        min(counts[BLOCKER] * 25, 50) +
        min(counts[HIGH]    *  8, 35) +
        min(counts[MEDIUM]  *  2, 15) +
        min(counts[LOW]     *  1,  5)
    )
    return max(0, 100 - deduction)


# ── Infrastructure ────────────────────────────────────────────────────────────
@dataclass
class Finding:
    file_path:  str
    start_line: int
    end_line:   int
    severity:   str   # BLOCKER | HIGH | MEDIUM | LOW | INFO
    rule_id:    str
    message:    str
    category:   str   # vulnerability | hotspot | bug | code_smell


def env(name: str, default: str | None = None) -> str:
    value = os.getenv(name, default)
    if value is None or value == "":
        print(f"Missing required environment variable: {name}")
        sys.exit(2)
    return value


def api_request(url: str, method: str, token: str | None, payload: dict | None = None, strict: bool = True) -> dict:
    data = None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url=url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        error_msg = f"HTTP error calling {url}: {exc.code} {body}"
        if strict:
            print(error_msg)
            sys.exit(1)
        else:
            # Non-strict mode: raise exception instead of exit
            raise Exception(f"{exc.code}: {body}") from exc
    except Exception as exc:
        error_msg = f"Request failed for {url}: {exc}"
        if strict:
            print(error_msg)
            sys.exit(1)
        else:
            raise


def run_command(command: list[str], timeout: int | None = None) -> tuple[int, str, str]:
    try:
        process = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
        return process.returncode, process.stdout, process.stderr
    except subprocess.TimeoutExpired:
        print(f"  ⏱️ Command timed out after {timeout}s: {command[0]}")
        return 1, "", f"timed out after {timeout}s"


def run_command_in_dir(command: list[str], cwd: str | Path, env_overrides: dict[str, str] | None = None, timeout: int | None = None) -> tuple[int, str, str]:
    env_vars = os.environ.copy()
    if env_overrides:
        env_vars.update(env_overrides)
    try:
        process = subprocess.run(command, capture_output=True, text=True, cwd=str(cwd), env=env_vars, timeout=timeout)
        return process.returncode, process.stdout, process.stderr
    except subprocess.TimeoutExpired:
        print(f"  ⏱️ Command timed out after {timeout}s: {command[0]}")
        return 1, "", f"timed out after {timeout}s"


def _tool_available(name: str) -> bool:
    return subprocess.run(["which", name], capture_output=True).returncode == 0


def _scan_ignore_patterns() -> list[str]:
    """
    Parse ignore patterns from env.

    PLATFORM_SCAN_IGNORE supports comma/semicolon/newline separated patterns.
    A default exclusion is kept for this scanner file itself.
    """
    default_patterns = ["**/ci_platform_scan.py", "ci_platform_scan.py"]
    raw = os.getenv("PLATFORM_SCAN_IGNORE", "")
    if not raw.strip():
        return default_patterns

    extra: list[str] = []
    for item in re.split(r"[,;\n]", raw):
        pattern = item.strip()
        if pattern:
            extra.append(pattern)
    return default_patterns + extra


def _normalize_path(path: str) -> str:
    return path.replace("\\", "/")


def _is_ignored(path: str, ignore_patterns: list[str]) -> bool:
    if not ignore_patterns:
        return False
    normalized = _normalize_path(path)
    # Strip leading "./" so patterns like "vendor/**" match "./vendor/..." paths
    # produced by os.walk(".")
    if normalized.startswith("./"):
        normalized = normalized[2:]
    filename = os.path.basename(normalized)
    for pattern in ignore_patterns:
        p = _normalize_path(pattern)
        if fnmatch(normalized, p) or fnmatch(filename, p):
            return True
    return False


def _resolve_repo_root() -> Path:
    """
    Resolve the application repository root from the script location.

    In Azure DevOps multi-repo checkout scenarios, the scanner can be executed
    from a shared templates repository while targeting a different application
    repository. PLATFORM_APP_REPO_ROOT is therefore the primary source of truth.
    """
    configured_root = os.getenv("PLATFORM_APP_REPO_ROOT") or os.getenv("BUILD_SOURCESDIRECTORY")
    if configured_root:
        repo_root = Path(configured_root).resolve()
        if repo_root.exists():
            return repo_root

    script_path = Path(__file__).resolve()
    repo_root = script_path.parent.parent
    return repo_root if repo_root.exists() else Path.cwd()


def _enter_repo_root() -> Path:
    repo_root = _resolve_repo_root()
    if Path.cwd().resolve() != repo_root:
        os.chdir(repo_root)
        print(f"📁 Switched working directory to repository root: {repo_root}")
    else:
        print(f"📁 Using repository root: {repo_root}")
    return repo_root


def _discover_package_jsons() -> list[Path]:
    package_jsons: list[Path] = []

    root_package = Path("package.json")
    if root_package.exists():
        package_jsons.append(root_package)

    for candidate in sorted(Path(".").rglob("package.json")):
        if any(part in {"node_modules", "vendor"} for part in candidate.parts):
            continue
        normalized = candidate.as_posix()
        if "/wwwroot/lib/" in normalized:
            # Skip embedded third-party frontend libraries (vendor code).
            continue
        if candidate not in package_jsons:
            package_jsons.append(candidate)

    return package_jsons


def _ensure_node_dependencies(project_dir: Path) -> bool:
    package_json = project_dir / "package.json"
    node_modules = project_dir / "node_modules"
    if not package_json.exists():
        return False

    if node_modules.exists():
        return True

    print(f"  Installing Node.js dependencies in {project_dir}...")
    if (project_dir / "package-lock.json").exists():
        code, out, err = run_command_in_dir(["npm", "ci", "--legacy-peer-deps"], project_dir)
    else:
        code, out, err = run_command_in_dir(["npm", "install", "--legacy-peer-deps"], project_dir)

    if code == 0:
        print("  ✅ npm dependencies installed")
        return True

    print(f"  ⚠️ npm dependency install failed (exit {code})")
    if err.strip():
        print(f"     stderr: {err[:400]}")
    elif out.strip():
        print(f"     stdout: {out[:400]}")
    return False


def _find_local_binary(project_dir: Path, binary_name: str) -> Path | None:
    binary = project_dir / "node_modules" / ".bin" / binary_name
    if binary.exists():
        return binary

    if os.name == "nt":
        cmd_binary = project_dir / "node_modules" / ".bin" / f"{binary_name}.cmd"
        if cmd_binary.exists():
            return cmd_binary

    return None


def _find_php_bin(binary: str) -> str | None:
    """Locate a PHP CLI tool: vendor/bin first (path check), then global PATH."""
    vendor = Path(f"vendor/bin/{binary}")
    if vendor.exists() and os.access(str(vendor), os.X_OK):
        return str(vendor)
    if _tool_available(binary):
        return binary
    return None


def _cleanup_coverage_artifacts(project_dir: Path) -> None:
    for artifact in [
        project_dir / "coverage",
        project_dir / "coverage-jest",
        project_dir / "merged-report",
        project_dir / "reports",
        project_dir / ".nyc_output",
        project_dir / "coverage.json",
        project_dir / "coverage.xml",
        project_dir / ".coverage",
        project_dir / "coverage.out",
    ]:
        if artifact.is_dir():
            shutil.rmtree(artifact, ignore_errors=True)
        elif artifact.exists():
            try:
                artifact.unlink()
            except OSError:
                pass


def _generate_node_coverage_reports(project_dir: Path) -> None:
    reports_script = project_dir / "ci_reports_tests.ts"
    local_ts_node = _find_local_binary(project_dir, "ts-node")
    if not reports_script.exists() or local_ts_node is None:
        return

    code, out, err = run_command_in_dir(
        [str(local_ts_node), "./ci_reports_tests.ts"],
        project_dir,
        {"NODE_ENV": "test"},
    )
    if code == 0:
        print("  ✅ merged coverage reports generated")
    else:
        print(f"  ⚠️ report merge exited with {code}")
        if err.strip():
            print(f"     stderr: {err[:400]}")
        elif out.strip():
            print(f"     stdout: {out[:400]}")


# ── Discovery ─────────────────────────────────────────────────────────────────
def discover_languages(roots: list[str], ignore_patterns: list[str] | None = None) -> dict[str, list[str]]:
    ignore_patterns = ignore_patterns or []
    ext_map = {
        ".py":  "python",
        ".java": "java",
        ".ts":  "typescript",  ".tsx": "typescript",
        ".js":  "javascript",  ".jsx": "javascript",
        ".cs":  "csharp",
        ".php": "php",
        ".cpp": "cpp", ".cc": "cpp", ".cxx": "cpp", ".hpp": "cpp",
        ".c":   "c",   ".h": "c",
        ".go":  "go",
        ".rb":  "ruby",
        ".kt":  "kotlin", ".kts": "kotlin",
    }
    _IGNORE = {
        ".git", "node_modules", "vendor", ".venv", "venv", "dist", "build",
        "__pycache__", "target", "bin", "obj", ".gradle",
    }
    files_by_lang: dict[str, list[str]] = {}
    for root in roots:
        for cur, dirs, files in os.walk(root):
            dirs[:] = [d for d in dirs if d not in _IGNORE]
            for filename in files:
                full_path = os.path.join(cur, filename)
                if _is_ignored(full_path, ignore_patterns):
                    continue
                lang = ext_map.get(os.path.splitext(filename)[1].lower())
                if lang:
                    files_by_lang.setdefault(lang, []).append(
                        full_path
                    )
    return files_by_lang


def count_lines_of_code(roots: list[str], ignore_patterns: list[str] | None = None) -> int:
    ignore_patterns = ignore_patterns or []
    CODE_EXTS = {
        ".py", ".js", ".jsx", ".ts", ".tsx", ".java", ".cs",
        ".go", ".rb", ".php", ".c", ".cc", ".cpp", ".h", ".hpp",
        ".kt", ".kts",
    }
    _IGNORE = {
        ".git", "node_modules", "vendor", ".venv", "venv", "dist", "build",
        "__pycache__", "target", "bin", "obj",
    }
    total = 0
    for root in roots:
        for cur, dirs, files in os.walk(root):
            dirs[:] = [d for d in dirs if d not in _IGNORE]
            for filename in files:
                if os.path.splitext(filename)[1].lower() not in CODE_EXTS:
                    continue
                path = os.path.join(cur, filename)
                if _is_ignored(path, ignore_patterns):
                    continue
                try:
                    with open(path, encoding="utf-8", errors="ignore") as fh:
                        total += sum(1 for line in fh if line.strip())
                except OSError:
                    pass
    return total


def discover_scan_roots() -> list[str]:
    explicit_targets = os.getenv("PLATFORM_SCAN_TARGET", "").strip()
    roots: list[str] = []

    if explicit_targets:
        for candidate in re.split(r"[,;\n]", explicit_targets):
            item = candidate.strip()
            if not item:
                continue
            norm = os.path.normpath(item)
            if norm not in roots and os.path.isdir(norm):
                roots.append(norm)
        if roots:
            return roots

    for candidate in ["apps", "src", "."]:
        norm = os.path.normpath(candidate)
        if norm not in roots and os.path.isdir(norm):
            roots.append(norm)
    return roots or ["."]


# ── Language analyzers ────────────────────────────────────────────────────────

def run_python_analysis(files: list[str]) -> list[Finding]:
    """pylint (quality/bugs) + radon (complexity). Bandit is handled by run_bandit()."""
    if not files:
        return []
    findings: list[Finding] = []

    # ── pylint ──
    if _tool_available("pylint"):
        cmd = ["pylint", "--output-format=json", "--disable=all", "--enable=E,W,R,C"] + files
        _, stdout, _ = run_command(cmd)
        if stdout.strip():
            try:
                _type_to_sev = {
                    "fatal":      (BLOCKER, "bug"),
                    "error":      (HIGH,    "bug"),
                    "warning":    (MEDIUM,  "code_smell"),
                    "refactor":   (LOW,     "code_smell"),
                    "convention": (INFO,    "code_smell"),
                }
                for item in json.loads(stdout):
                    sev, cat = _type_to_sev.get(item.get("type", ""), (MEDIUM, "code_smell"))
                    findings.append(Finding(
                        file_path=item.get("path", ""),
                        start_line=item.get("line", 0),
                        end_line=item.get("line", 0),
                        severity=sev,
                        rule_id=item.get("symbol", "pylint/unknown"),
                        message=item.get("message", ""),
                        category=cat,
                    ))
            except json.JSONDecodeError:
                pass
    else:
        print("  [skip] pylint not installed")

    # ── radon (cyclomatic complexity) ──
    if _tool_available("radon"):
        for filepath in files:
            _, stdout, _ = run_command(["radon", "cc", filepath, "-j"])
            if not stdout.strip():
                continue
            try:
                data = json.loads(stdout)
                # radon output: {"file.py": [ {name, lineno, complexity, ...}, ... ]}
                for _fname, blocks in data.items():
                    if not isinstance(blocks, list):
                        continue
                    for block in blocks:
                        cx = block.get("complexity", 0)
                        if cx > 10:
                            sev = HIGH if cx > 20 else MEDIUM
                            findings.append(Finding(
                                file_path=filepath,
                                start_line=block.get("lineno", 0),
                                end_line=block.get("lineno", 0),
                                severity=sev,
                                rule_id="radon/complexity",
                                message=(
                                    f"High cyclomatic complexity in "
                                    f"'{block.get('name', '?')}': {cx}"
                                ),
                                category="code_smell",
                            ))
            except (json.JSONDecodeError, AttributeError):
                pass
    else:
        print("  [skip] radon not installed")

    return findings


def run_typescript_analysis(files: list[str], roots: list[str]) -> list[Finding]:
    """ESLint (quality + security) + tsc (type errors/bugs)."""
    if not files:
        return []
    findings: list[Finding] = []

    # ── ESLint — prefer project-local binary to avoid private registry auth issues ──
    project_root = Path(roots[0]) if roots else Path(".")
    local_eslint = _find_local_binary(project_root, "eslint")
    if local_eslint:
        eslint_cmd = [str(local_eslint)]
    elif _tool_available("npx"):
        eslint_cmd = ["npx", "eslint"]   # no --yes: avoid network fetch in CI
    else:
        eslint_cmd = None

    if eslint_cmd:
        _, stdout, _ = run_command(eslint_cmd + ["--format=json"] + files)
        if stdout.strip():
            try:
                _sev_map = {0: INFO, 1: MEDIUM, 2: HIGH}
                for file_result in json.loads(stdout):
                    for msg in file_result.get("messages", []):
                        rule_id = msg.get("ruleId") or "eslint/unknown"
                        if (
                            rule_id == "eslint/unknown"
                            and "File ignored because of a matching ignore pattern" in msg.get("message", "")
                        ):
                            continue
                        # Classify security-relevant rules correctly
                        if rule_id in _ESLINT_HOTSPOT_RULES:
                            category = "hotspot"
                        elif rule_id in _ESLINT_VULNERABILITY_RULES:
                            category = "vulnerability"
                        else:
                            category = "code_smell"
                        findings.append(Finding(
                            file_path=file_result.get("filePath", ""),
                            start_line=msg.get("line", 0),
                            end_line=msg.get("endLine", msg.get("line", 0)),
                            severity=_sev_map.get(msg.get("severity", 0), INFO),
                            rule_id=rule_id,
                            message=msg.get("message", ""),
                            category=category,
                        ))
            except json.JSONDecodeError:
                pass
    else:
        print("  [skip] eslint not available (no local binary, no npx)")

    # ── tsc ── finds type-safety bugs
    tsc_configs = list(Path(".").glob("tsconfig*.json")) + [Path("tsconfig.json")]
    tsc_root = next((str(p) for p in tsc_configs if p.exists()), None)
    if tsc_root and _tool_available("npx"):
        _, _, stderr = run_command(["npx", "tsc", "--noEmit", "--listFiles=false"])
        for line in (stderr or "").split("\n"):
            if ": error TS" in line or ": warning TS" in line:
                m = re.match(r"(.+?)\((\d+),(\d+)\):.*(error|warning) (TS\d+): (.+)", line)
                if m:
                    findings.append(Finding(
                        file_path=m.group(1),
                        start_line=int(m.group(2)),
                        end_line=int(m.group(2)),
                        severity=HIGH if "error" in m.group(4) else MEDIUM,
                        rule_id=m.group(5),
                        message=m.group(6),
                        category="bug",
                    ))

    return findings


def run_java_analysis(files: list[str]) -> list[Finding]:
    """PMD (quality/bugs) + Checkstyle (style)."""
    if not files:
        return []
    findings: list[Finding] = []

    # ── PMD ──
    if _tool_available("pmd"):
        # PMD 7.x CLI: pmd check -d <dir> -R rulesets/java/quickstart.xml -f json
        dirs = list({str(Path(f).parent) for f in files})
        cmd = ["pmd", "check", "--format", "json", "--no-fail-on-violation"]
        for d in dirs:
            cmd += ["-d", d]
        cmd += ["-R", "rulesets/java/quickstart.xml"]
        _, stdout, _ = run_command(cmd)
        if stdout.strip():
            try:
                for file_result in json.loads(stdout).get("files", []):
                    for v in file_result.get("violations", []):
                        priority = int(v.get("priority", 3))
                        sev = [BLOCKER, HIGH, MEDIUM, LOW, INFO][min(priority - 1, 4)]
                        findings.append(Finding(
                            file_path=file_result.get("filename", ""),
                            start_line=v.get("beginline", 0),
                            end_line=v.get("endline", v.get("beginline", 0)),
                            severity=sev,
                            rule_id=f"pmd/{v.get('rule', 'unknown')}",
                            message=v.get("description", ""),
                            category="code_smell",
                        ))
            except (json.JSONDecodeError, KeyError):
                pass
    else:
        print("  [skip] pmd not installed")

    # ── Checkstyle ──
    if _tool_available("checkstyle"):
        cmd = ["checkstyle", "-f", "sarif"] + files
        _, stdout, _ = run_command(cmd)
        if stdout.strip():
            try:
                sarif = json.loads(stdout)
                _sev_map = {"error": HIGH, "warning": MEDIUM, "note": LOW}
                for run_item in sarif.get("runs", []):
                    for result in run_item.get("results", []):
                        for loc in result.get("locations", []):
                            phys = loc.get("physicalLocation", {})
                            region = phys.get("region", {})
                            findings.append(Finding(
                                file_path=phys.get("artifactLocation", {}).get("uri", ""),
                                start_line=region.get("startLine", 0),
                                end_line=region.get("endLine", region.get("startLine", 0)),
                                severity=_sev_map.get(result.get("level", "warning"), MEDIUM),
                                rule_id=result.get("ruleId", "checkstyle/unknown"),
                                message=result.get("message", {}).get("text", ""),
                                category="code_smell",
                            ))
            except (json.JSONDecodeError, KeyError):
                pass
    else:
        print("  [skip] checkstyle not installed")

    return findings


def run_csharp_analysis(files: list[str]) -> list[Finding]:
    """
    dotnet build (Roslyn analyzers) — parses MSBuild warning/error lines.
    """
    if not files:
        return []
    findings: list[Finding] = []
    seen_findings: set[tuple[str, int, str, str]] = set()

    if _tool_available("dotnet"):
        # Collect unique .csproj directories
        csproj_dirs: set[str] = set()
        for f in files:
            for parent in Path(f).parents:
                if list(parent.glob("*.csproj")):
                    csproj_dirs.add(str(parent))
                    break

        if csproj_dirs:
            # Build once at solution level when available to avoid duplicated warnings per project build.
            sln_files = sorted(Path(".").glob("*.sln")) + sorted(Path(".").glob("**/*.sln"))
            build_targets = [str(sln_files[0])] if sln_files else sorted(csproj_dirs)
            analysis_mode = os.getenv("PLATFORM_DOTNET_ANALYSIS_MODE", "Recommended")

            for target in build_targets:
                _, stdout, stderr = run_command([
                    "dotnet", "build", target, "--no-restore", "-v", "normal",
                    # Enable built-in .NET analyzers with a conservative default mode.
                    "/p:EnableNETAnalyzers=true",
                    f"/p:AnalysisMode={analysis_mode}",
                    "/p:TreatWarningsAsErrors=false",
                ])
                for line in ((stdout or "") + (stderr or "")).split("\n"):
                    m = re.match(
                        r"\s*(.+?)\((\d+),(\d+)\):\s+(warning|error)\s+([A-Z]{2,}\d+):\s+(.+)",
                        line,
                    )
                    if not m:
                        continue

                    fpath = m.group(1).strip()
                    normalized_fpath = fpath.replace("\\", "/")
                    # Skip generated build artefacts and SDK internal files.
                    if (
                        "/obj/" in normalized_fpath
                        or "/bin/" in normalized_fpath
                        or "/opt/hostedtoolcache/" in normalized_fpath
                    ):
                        continue

                    rule_id = m.group(5)
                    message = m.group(6).strip()
                    start_line = int(m.group(2))
                    dedup_key = (normalized_fpath, start_line, rule_id, message)
                    if dedup_key in seen_findings:
                        continue
                    seen_findings.add(dedup_key)

                    is_error = m.group(4) == "error"
                    category, severity = _roslyn_classify(rule_id, is_error)
                    findings.append(Finding(
                        file_path=fpath,
                        start_line=start_line,
                        end_line=start_line,
                        severity=severity,
                        rule_id=rule_id,
                        message=message,
                        category=category,
                    ))
        else:
            print("  [warn] No .csproj found — C# analysis skipped")
    else:
        print("  [skip] dotnet not installed")

    return findings


def run_go_analysis(files: list[str], roots: list[str]) -> list[Finding]:
    """go vet (bugs) + staticcheck (quality)."""
    if not files:
        return []
    findings: list[Finding] = []

    if _tool_available("go"):
        go_dirs = list({str(Path(f).parent) for f in files})
        for d in go_dirs:
            _, _, stderr = run_command(["go", "vet", "./..."])
            for line in (stderr or "").split("\n"):
                m = re.match(r"(.+?):(\d+):(\d+):\s+(.+)", line)
                if m:
                    findings.append(Finding(
                        file_path=m.group(1),
                        start_line=int(m.group(2)),
                        end_line=int(m.group(2)),
                        severity=MEDIUM,
                        rule_id="go-vet",
                        message=m.group(4),
                        category="bug",
                    ))
    else:
        print("  [skip] go not installed")

    if _tool_available("staticcheck"):
        _, stdout, _ = run_command(["staticcheck", "-f", "json", "./..."])
        for line in (stdout or "").split("\n"):
            if not line.strip():
                continue
            try:
                item = json.loads(line)
                pos = item.get("position", {})
                findings.append(Finding(
                    file_path=pos.get("filename", ""),
                    start_line=pos.get("line", 0),
                    end_line=pos.get("line", 0),
                    severity=MEDIUM,
                    rule_id=item.get("check", "staticcheck/unknown"),
                    message=item.get("message", ""),
                    category="code_smell",
                ))
            except json.JSONDecodeError:
                pass
    else:
        print("  [skip] staticcheck not installed")

    return findings


def run_ruby_analysis(files: list[str]) -> list[Finding]:
    """rubocop — style, lint, security."""
    if not files:
        return []
    findings: list[Finding] = []

    if _tool_available("rubocop"):
        _, stdout, _ = run_command(["rubocop", "--format", "json"] + files)
        if stdout.strip():
            try:
                _sev_map = {
                    "fatal":      BLOCKER,
                    "error":      HIGH,
                    "warning":    MEDIUM,
                    "convention": LOW,
                    "refactor":   INFO,
                }
                for file_result in json.loads(stdout).get("files", []):
                    for offense in file_result.get("offenses", []):
                        loc = offense.get("location", {})
                        findings.append(Finding(
                            file_path=file_result.get("path", ""),
                            start_line=loc.get("start_line", 0),
                            end_line=loc.get("last_line", loc.get("start_line", 0)),
                            severity=_sev_map.get(offense.get("severity", "warning"), MEDIUM),
                            rule_id=offense.get("cop_name", "rubocop/unknown"),
                            message=offense.get("message", ""),
                            category="code_smell",
                        ))
            except json.JSONDecodeError:
                pass
    else:
        print("  [skip] rubocop not installed")

    return findings


def run_php_analysis(files: list[str]) -> list[Finding]:
    """phpstan (type/logic bugs) + phpcs (style)."""
    if not files:
        return []
    findings: list[Finding] = []

    phpstan_bin = _find_php_bin("phpstan")
    if phpstan_bin:
        extra: list[str] = []
        if Path("vendor/autoload.php").exists():
            extra = ["--autoload-file=vendor/autoload.php"]
        print(f"  Running phpstan on {len(files)} PHP files (timeout 180s)...")
        _, stdout, _ = run_command(
            [phpstan_bin, "analyse", "--output-format=json", "--no-progress",
             "--level=1", "--no-interaction", "--memory-limit=512M"] + extra + files,
            timeout=180,
        )
        if stdout.strip():
            try:
                data = json.loads(stdout)
                for filepath, file_data in data.get("files", {}).items():
                    for issue in file_data.get("messages", []):
                        sev = HIGH if issue.get("ignorable") is False else MEDIUM
                        findings.append(Finding(
                            file_path=filepath,
                            start_line=issue.get("line", 0),
                            end_line=issue.get("line", 0),
                            severity=sev,
                            rule_id=issue.get("identifier", "phpstan/unknown"),
                            message=issue.get("message", ""),
                            category="bug",
                        ))
            except json.JSONDecodeError:
                pass
    else:
        print("  [skip] phpstan not installed")

    phpcs_bin = _find_php_bin("phpcs")
    if phpcs_bin:
        print(f"  Running phpcs on {len(files)} PHP files (timeout 120s)...")
        _, stdout, _ = run_command(
            [phpcs_bin, "--report=json", "--standard=PSR12", "--severity=5"] + files,
            timeout=120,
        )
        if stdout.strip():
            try:
                _phpcs_count = 0
                _phpcs_cap = 100  # PSR-12 style violations are extremely numerous; cap to avoid noise
                for filepath, file_data in json.loads(stdout).get("files", {}).items():
                    if _phpcs_count >= _phpcs_cap:
                        break
                    for msg in file_data.get("messages", []):
                        if _phpcs_count >= _phpcs_cap:
                            print(f"  ⚠️ phpcs: capped at {_phpcs_cap} findings (total violations is much higher)")
                            break
                        findings.append(Finding(
                            file_path=filepath,
                            start_line=msg.get("line", 0),
                            end_line=msg.get("line", 0),
                            severity=LOW,  # PSR-12 style issues are always low severity
                            rule_id=msg.get("source", "phpcs/unknown"),
                            message=msg.get("message", ""),
                            category="code_smell",
                        ))
                        _phpcs_count += 1
            except json.JSONDecodeError:
                pass
    else:
        print("  [skip] phpcs not installed")

    return findings


def run_phpmd(files: list[str]) -> list[Finding]:
    """PHPMD — cyclomatic complexity, naming, design, unused code."""
    if not files:
        return []
    findings: list[Finding] = []

    phpmd_bin = _find_php_bin("phpmd")
    if not phpmd_bin:
        print("  [skip] phpmd not installed")
        return []

    import xml.etree.ElementTree as ET
    import tempfile

    # Collect unique top-level source dirs (app, src, …) — one phpmd call,
    # one timeout, regardless of how many subdirectories the project has.
    # Paths from os.walk(".") start with "./" so we skip that leading component.
    top_dirs: set[str] = set()
    for f in files:
        parts = Path(f).parts
        for part in parts:
            if part not in (".", "/", ""):
                top_dirs.add(part)
                break
    phpmd_path = ",".join(sorted(top_dirs)) if top_dirs else "."

    ruleset = "codesize,design,unusedcode"
    _priority_sev = {1: (HIGH, "bug"), 2: (HIGH, "code_smell"), 3: (MEDIUM, "code_smell")}

    with tempfile.NamedTemporaryFile(suffix=".xml", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        print(f"  Running phpmd on '{phpmd_path}' (timeout 180s)...")
        run_command([phpmd_bin, phpmd_path, "xml", ruleset, "--reportfile", tmp_path], timeout=180)
        report = Path(tmp_path)
        if report.exists() and report.read_bytes():
            try:
                tree = ET.fromstring(report.read_text(encoding="utf-8", errors="ignore"))
                for file_elem in tree.findall("file"):
                    fpath = file_elem.get("name", "")
                    for v in file_elem.findall("violation"):
                        priority = int(v.get("priority", "3"))
                        sev, category = _priority_sev.get(priority, (LOW, "code_smell"))
                        rule = v.get("rule", "unknown")
                        ruleset_name = v.get("ruleset", "")
                        rule_id = (
                            f"phpmd/{ruleset_name.lower().replace(' ', '-')}/{rule}"
                            if ruleset_name else f"phpmd/{rule}"
                        )
                        findings.append(Finding(
                            file_path=fpath,
                            start_line=int(v.get("beginline", 0)),
                            end_line=int(v.get("endline", v.get("beginline", 0))),
                            severity=sev,
                            rule_id=rule_id,
                            message=(v.text or "").strip(),
                            category=category,
                        ))
            except ET.ParseError:
                pass
    finally:
        try:
            Path(tmp_path).unlink(missing_ok=True)
        except OSError:
            pass

    return findings


def run_php_psalm(files: list[str], roots: list[str]) -> list[Finding]:
    """Psalm — PHP type checking + security taint analysis."""
    if not files:
        return []
    findings: list[Finding] = []

    psalm_bin = _find_php_bin("psalm")
    if not psalm_bin:
        print("  [skip] psalm not installed")
        return []

    _PSALM_TAINT_TYPES: frozenset[str] = frozenset({
        "TaintedInput", "TaintedHtml", "TaintedSql", "TaintedShell",
        "TaintedSSRF", "TaintedFile", "TaintedUnserialize", "TaintedCookie",
        "TaintedHeader", "TaintedLdap", "TaintedXpath",
    })

    project_root = roots[0] if roots else "."
    _psalm_config = Path(project_root) / "psalm.xml"
    _psalm_config_generated = False
    if not _psalm_config.exists():
        # Generate a minimal psalm.xml targeting common PHP source directories
        src_dirs = [d for d in ["app", "src", "lib"] if (Path(project_root) / d).is_dir()]
        if not src_dirs:
            src_dirs = ["."]
        dirs_xml = "\n        ".join(f'<directory name="{d}" />' for d in src_dirs)
        _psalm_config.write_text(
            f'<?xml version="1.0"?>\n'
            f'<psalm errorLevel="4" findUnusedVariablesAndParams="false"\n'
            f'       xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n'
            f'       xmlns="https://getpsalm.org/schema/config"\n'
            f'       xsi:schemaLocation="https://getpsalm.org/schema/config '
            f'https://raw.githubusercontent.com/vimeo/psalm/master/config.xsd">\n'
            f'    <projectFiles>\n'
            f'        {dirs_xml}\n'
            f'        <ignoreFiles>\n'
            f'            <directory name="vendor" />\n'
            f'        </ignoreFiles>\n'
            f'    </projectFiles>\n'
            f'</psalm>\n',
            encoding="utf-8",
        )
        _psalm_config_generated = True

    print(f"  Running psalm (timeout 300s)...")
    _, stdout, _ = run_command_in_dir(
        [psalm_bin, "--output-format=json", "--no-progress", "--no-cache", "--threads=4"],
        project_root,
        timeout=300,
    )

    if _psalm_config_generated:
        try:
            _psalm_config.unlink()
        except OSError:
            pass

    if not stdout.strip():
        return []

    try:
        payload = json.loads(stdout)
        issues = payload.get("issues", payload) if isinstance(payload, dict) else payload
        for issue in (issues or []):
            raw_sev = str(issue.get("severity", "error")).lower()
            issue_type = issue.get("type", "unknown")
            if issue_type in _PSALM_TAINT_TYPES:
                category, sev = "vulnerability", HIGH
            elif raw_sev == "error":
                category, sev = "bug", HIGH
            else:
                category, sev = "code_smell", MEDIUM
            findings.append(Finding(
                file_path=issue.get("file_name", ""),
                start_line=issue.get("line_from", 0),
                end_line=issue.get("line_to", issue.get("line_from", 0)),
                severity=sev,
                rule_id=f"psalm/{issue_type}",
                message=issue.get("message", ""),
                category=category,
            ))
    except json.JSONDecodeError:
        pass

    return findings


def run_composer_audit(roots: list[str]) -> list[Finding]:
    """composer audit — PHP dependency vulnerability scanner (SCA)."""
    findings: list[Finding] = []

    if not _tool_available("composer"):
        print("  [skip] composer audit: composer not installed")
        return []

    for root in roots:
        composer_json = Path(root) / "composer.json"
        if not composer_json.exists():
            continue

        # composer audit reads installed packages from vendor/; install if absent
        vendor_dir = Path(root) / "vendor"
        if not vendor_dir.exists() and (Path(root) / "composer.lock").exists():
            print(f"    vendor/ absent — running composer install (no-dev)...")
            run_command_in_dir(
                ["composer", "install", "--no-dev", "--no-interaction",
                 "--no-progress", "--optimize-autoloader"], root,
                timeout=300,
            )

        print(f"    Auditing {composer_json}...")
        _, stdout, stderr = run_command_in_dir(
            ["composer", "audit", "--format=json", "--no-interaction"], root,
            timeout=60,
        )
        if not stdout.strip():
            if stderr.strip():
                print(f"    ⚠️ composer audit error: {stderr[:200]}")
            continue
        try:
            data = json.loads(stdout)
            for pkg_name, advisories in data.get("advisories", {}).items():
                for advisory in (advisories if isinstance(advisories, list) else []):
                    cve = advisory.get("cve", "")
                    title = advisory.get("title", "Vulnerability")
                    msg = f"{pkg_name}: {title}" + (f" ({cve})" if cve else "")
                    # Use CVE > advisoryId > remoteId > pkg+title slug for unique dedup key
                    unique_id = (
                        cve
                        or advisory.get("advisoryId")
                        or advisory.get("remoteId")
                        or f"{pkg_name.replace('/', '-')}-{title[:40].lower().replace(' ', '-')}"
                    )
                    findings.append(Finding(
                        file_path=str(composer_json),
                        start_line=0,
                        end_line=0,
                        severity=HIGH,
                        rule_id=f"composer-audit/{unique_id}",
                        message=msg,
                        category="dependency_vulnerability",
                    ))
                    print(f"      [HIGH] {msg}")
        except json.JSONDecodeError as e:
            print(f"    ⚠️ Failed to parse composer audit output: {e}")

    if findings:
        print(f"  ✅ composer audit found {len(findings)} dependency vulnerabilities")
    return findings


def run_cpp_analysis(files: list[str]) -> list[Finding]:
    """cppcheck — undefined behaviour, memory errors, style."""
    if not files:
        return []
    findings: list[Finding] = []

    if _tool_available("cppcheck"):
        template = "{file}:{line}:{severity}:{id}:{message}"
        _, _, stderr = run_command(
            [
                "cppcheck",
                "--enable=warning,style,performance,portability",
                f"--template={template}",
                "--suppress=missingIncludeSystem",
                "--quiet",
            ] + files
        )
        _sev_map = {
            "error":       HIGH,
            "warning":     MEDIUM,
            "style":       LOW,
            "performance": LOW,
            "portability": LOW,
            "information": INFO,
        }
        for line in (stderr or "").split("\n"):
            parts = line.split(":", 4)
            if len(parts) < 5:
                continue
            file_path, lineno, raw_sev, rule_id, message = parts
            findings.append(Finding(
                file_path=file_path,
                start_line=int(lineno) if lineno.isdigit() else 0,
                end_line=int(lineno) if lineno.isdigit() else 0,
                severity=_sev_map.get(raw_sev.strip(), LOW),
                rule_id=f"cppcheck/{rule_id.strip()}",
                message=message.strip(),
                category="bug" if raw_sev.strip() == "error" else "code_smell",
            ))
    else:
        print("  [skip] cppcheck not installed")

    return findings


def run_kotlin_analysis(files: list[str], roots: list[str]) -> list[Finding]:
    """detekt — style, coroutine issues, complexity."""
    if not files:
        return []
    findings: list[Finding] = []

    if _tool_available("detekt"):
        sarif_out = "/tmp/detekt_out.sarif"
        input_paths = ",".join(roots)
        run_command(["detekt", "--input", input_paths, "--report", f"sarif:{sarif_out}"])
        try:
            sarif_path = Path(sarif_out)
            if sarif_path.exists():
                sarif = json.loads(sarif_path.read_text())
                _sev_map = {"error": HIGH, "warning": MEDIUM, "note": LOW}
                for run_item in sarif.get("runs", []):
                    for result in run_item.get("results", []):
                        for loc in result.get("locations", []):
                            phys = loc.get("physicalLocation", {})
                            region = phys.get("region", {})
                            findings.append(Finding(
                                file_path=phys.get("artifactLocation", {}).get("uri", ""),
                                start_line=region.get("startLine", 0),
                                end_line=region.get("endLine", region.get("startLine", 0)),
                                severity=_sev_map.get(result.get("level", "warning"), MEDIUM),
                                rule_id=result.get("ruleId", "detekt/unknown"),
                                message=result.get("message", {}).get("text", ""),
                                category="code_smell",
                            ))
        except (json.JSONDecodeError, OSError):
            pass
    else:
        print("  [skip] detekt not installed")

    return findings


# ── Cross-language scanners ───────────────────────────────────────────────────

def _ensure_pip_tool(package: str, binary: str | None = None) -> bool:
    """
    Install a pip package globally if its binary is not available.
    Returns True if the tool is available after the call.
    """
    binary = binary or package
    if _tool_available(binary):
        return True
    if not (_tool_available("pip3") or _tool_available("pip")):
        return False
    pip_cmd = "pip3" if _tool_available("pip3") else "pip"
    print(f"  ℹ️ {binary} not found — installing via {pip_cmd}...")
    code, _, err = run_command([pip_cmd, "install", "--quiet", package])
    if code == 0 and _tool_available(binary):
        print(f"  ✅ {binary} installed")
        return True
    print(f"  ⚠️ {binary} install failed (exit {code}): {err[:200]}")
    return False


def run_semgrep(roots: list[str], ignore_patterns: list[str] | None = None) -> list[Finding]:
    """
    Semgrep security-audit + secrets rulesets.
    Returns list[Finding] (not just counts — findings feed affected_files).
    Retries with progressively simpler configs if the registry is unreachable.
    Auto-installs semgrep via pip if not present.
    """
    if not _ensure_pip_tool("semgrep"):
        SECURITY_SCAN_STATUS["semgrep"] = "skipped"
        print("  [skip] semgrep not installed and pip unavailable")
        return []

    ignore_patterns = ignore_patterns or []
    semgrep_excludes: list[str] = []
    for pattern in ignore_patterns:
        semgrep_excludes.extend(["--exclude", pattern])

    commands_to_try = [
        ["semgrep", "scan", "--config", "p/security-audit", "--config", "p/secrets", "--json"],
        ["semgrep", "scan", "--config", "p/security-audit", "--json"],
        ["semgrep", "scan", "--json"],
    ]

    code, stdout, stderr = -1, "", ""
    for cmd_attempt in commands_to_try:
        code, stdout, stderr = run_command(cmd_attempt + semgrep_excludes + roots)
        if code in {0, 1}:
            break
        print(f"  Semgrep attempt failed (exit {code}), trying fallback...")
        if stderr.strip():
            print(f"    stderr: {stderr[:200]}")

    if code not in {0, 1}:
        SECURITY_SCAN_STATUS["semgrep"] = "failed"
        print(f"  [warn] Semgrep failed after all attempts (exit {code})")
        return []

    try:
        payload = json.loads(stdout or "{}")
    except json.JSONDecodeError as exc:
        SECURITY_SCAN_STATUS["semgrep"] = "failed"
        print(f"  [warn] Semgrep JSON parse failed: {exc}")
        return []

    _sev_map = {
        "ERROR": HIGH, "HIGH": HIGH,
        "WARNING": MEDIUM, "MEDIUM": MEDIUM,
        "LOW": LOW, "INFO": INFO,
    }
    findings: list[Finding] = []
    for item in payload.get("results", []):
        raw_sev = str(item.get("extra", {}).get("severity", "INFO")).upper()
        sev = _sev_map.get(raw_sev, MEDIUM)
        start = item.get("start", {})
        end   = item.get("end",   {})
        findings.append(Finding(
            file_path=item.get("path", ""),
            start_line=start.get("line", 0),
            end_line=end.get("line", start.get("line", 0)),
            severity=sev,
            rule_id=item.get("check_id", "semgrep/unknown"),
            message=item.get("extra", {}).get("message", ""),
            category="vulnerability" if sev in {BLOCKER, HIGH} else "hotspot",
        ))

    findings = [f for f in findings if not _is_ignored(f.file_path, ignore_patterns)]

    SECURITY_SCAN_STATUS["semgrep"] = "ok"

    return findings


def run_npm_audit(roots: list[str]) -> list[Finding]:
    """
    npm audit — dependency vulnerability scanner for Node.js/npm projects.
    Detects known CVEs in package dependencies.
    Returns list[Finding] — vulnerabilities categorized as BLOCKER, HIGH, MEDIUM, LOW.
    """
    findings: list[Finding] = []
    
    # Find package.json files to identify npm projects
    package_jsons = []
    for root in roots:
        for dirpath, dirnames, filenames in os.walk(root):
            if "node_modules" in dirnames:
                dirnames.remove("node_modules")  # Skip node_modules
            if "package.json" in filenames:
                package_jsons.append(os.path.join(dirpath, "package.json"))
    
    if not package_jsons:
        print("  [skip] npm audit: no package.json found")
        return []
    
    if not _tool_available("npm"):
        print("  [skip] npm audit: npm not installed")
        return []
    
    for package_json in package_jsons:
        project_dir = os.path.dirname(package_json)
        print(f"    Auditing {package_json}...")
        
        # Run npm audit with JSON output
        cmd = ["npm", "audit", "--json"]
        returncode, stdout, stderr = run_command(cmd)
        
        # npm audit exits with 0 if no vulns, 1 if vulns found, 2 on error
        if returncode > 1 or not stdout.strip():
            if returncode == 2:
                print(f"    ⚠️ npm audit error in {project_dir}: {stderr[:100]}")
            continue
        
        try:
            audit_data = json.loads(stdout)
            vulns = audit_data.get("vulnerabilities", {})
            
            for package_name, vuln_info in vulns.items():
                if not isinstance(vuln_info, dict):
                    continue
                
                # Each vulnerability entry contains severity and details
                for via_entry in vuln_info.get("via", []):
                    if isinstance(via_entry, str):
                        continue  # Skip string references, get dict entries
                    
                    severity = via_entry.get("severity", "low").upper()
                    sev_map = {"CRITICAL": BLOCKER, "HIGH": HIGH, "MODERATE": MEDIUM, "LOW": LOW}
                    sev = sev_map.get(severity, MEDIUM)
                    
                    findings.append(Finding(
                        file_path=package_json,
                        start_line=0,
                        end_line=0,
                        severity=sev,
                        rule_id=f"npm-audit/{via_entry.get('id', 'unknown')}",
                        message=f"{package_name}: {via_entry.get('title', 'Vulnerability')} (CVE-{via_entry.get('cve', '?')})",
                        category="dependency_vulnerability",  # SCA — kept separate from SAST score
                    ))
                    print(f"      [{sev}] {package_name}: {via_entry.get('title', '')}")
        except json.JSONDecodeError as e:
            print(f"    ⚠️ Failed to parse npm audit output: {e}")

    if findings:
        print(f"  ✅ npm audit found {len(findings)} dependency vulnerabilities")
    return findings


def run_pip_audit(roots: list[str]) -> list[Finding]:
    """
    pip-audit — dependency vulnerability scanner for Python/pip projects.
    Detects known CVEs in Python package dependencies.
    Returns list[Finding] — vulnerabilities categorized by severity.
    """
    findings: list[Finding] = []
    
    # Check if pip-audit is available (user must install: pip install pip-audit)
    if not _tool_available("pip-audit"):
        print("  [skip] pip-audit: pip-audit not installed")
        return []
    
    for root in roots:
        if not os.path.isdir(root):
            continue
        
        # Look for requirements.txt, setup.py, or pyproject.toml
        python_config_files = [
            os.path.join(root, "requirements.txt"),
            os.path.join(root, "setup.py"),
            os.path.join(root, "pyproject.toml"),
        ]
        
        has_python_config = any(os.path.exists(f) for f in python_config_files)
        if not has_python_config:
            continue
        
        print(f"    Auditing Python packages in {root}...")
        
        # Run pip-audit with JSON output
        cmd = ["pip-audit", "--desc", "--format", "json"]
        returncode, stdout, stderr = run_command(cmd)
        
        # pip-audit exits 0 if no vulns, 1 if vulns found
        if not stdout.strip():
            if returncode > 1:
                print(f"    ⚠️ pip-audit error: {stderr[:100]}")
            continue
        
        try:
            audit_data = json.loads(stdout)
            vulnerabilities = audit_data.get("vulnerabilities", [])
            
            for vuln in vulnerabilities:
                sev = MEDIUM  # pip-audit doesn't always provide explicit severity
                if "critical" in str(vuln.get("description", "")).lower():
                    sev = BLOCKER
                elif "high" in str(vuln.get("description", "")).lower():
                    sev = HIGH
                
                # Find requirements.txt to report
                req_file = None
                for cf in python_config_files:
                    if os.path.exists(cf):
                        req_file = cf
                        break
                
                findings.append(Finding(
                    file_path=req_file or "requirements.txt",
                    start_line=0,
                    end_line=0,
                    severity=sev,
                    rule_id=f"pip-audit/{vuln.get('id', 'unknown')}",
                    message=f"{vuln.get('name', 'package')}: {vuln.get('vulnerability', 'Vulnerability')}",
                    category="dependency_vulnerability",  # SCA — separate from SAST score
                ))
                print(f"      [{sev}] {vuln.get('name', '?')}: {vuln.get('vulnerability', '')[:80]}")
        except json.JSONDecodeError as e:
            print(f"    ⚠️ Failed to parse pip-audit output: {e}")

    if findings:
        print(f"  ✅ pip-audit found {len(findings)} dependency vulnerabilities")
    return findings


def run_dotnet_package_audit() -> list[Finding]:
    """dotnet list package --vulnerable — NuGet dependency vulnerability scanner (SCA)."""
    findings: list[Finding] = []

    if not _tool_available("dotnet"):
        print("  [skip] dotnet package audit: dotnet not installed")
        return []

    sln_files = sorted(Path(".").glob("*.sln"))
    targets = [str(sln_files[0])] if sln_files else ["."]
    _sev_map = {"critical": BLOCKER, "high": HIGH, "moderate": MEDIUM, "low": LOW}

    for target in targets:
        # JSON output available from dotnet 8+
        code, stdout, _ = run_command(
            ["dotnet", "list", target, "package", "--vulnerable", "--format", "json"]
        )
        if code == 0 and stdout.strip():
            try:
                data = json.loads(stdout)
                for project in data.get("projects", []):
                    csproj = project.get("path", target)
                    for framework in project.get("frameworks", []):
                        for pkg_key in ("topLevelPackages", "transitivePackages"):
                            for pkg in framework.get(pkg_key, []):
                                pkg_id = pkg.get("id", "?")
                                version = pkg.get("resolvedVersion", "?")
                                for vuln in pkg.get("vulnerabilities", []):
                                    sev_str = str(vuln.get("severity", "moderate")).lower()
                                    sev = _sev_map.get(sev_str, MEDIUM)
                                    url = vuln.get("advisoryurl", "")
                                    msg = f"{pkg_id}@{version}: {sev_str} vulnerability. {url}".strip()
                                    findings.append(Finding(
                                        file_path=csproj,
                                        start_line=0,
                                        end_line=0,
                                        severity=sev,
                                        rule_id=f"dotnet-audit/{pkg_id}",
                                        message=msg,
                                        category="dependency_vulnerability",
                                    ))
                                    print(f"      [{sev}] {pkg_id}@{version}: {sev_str}")
                continue
            except json.JSONDecodeError:
                pass

        # Fallback: text output (dotnet 6/7)
        _, stdout, _ = run_command(["dotnet", "list", target, "package", "--vulnerable"])
        for line in (stdout or "").split("\n"):
            m = re.match(r"\s*>\s+(\S+)\s+(\S+).*?(\w+)\s+https?://", line)
            if not m:
                m = re.match(r"\s*>\s+(\S+)\s+(\S+).*Severity:\s+(\w+)", line)
            if m:
                pkg_id, version, sev_str = m.group(1), m.group(2), m.group(3).lower()
                sev = _sev_map.get(sev_str, MEDIUM)
                findings.append(Finding(
                    file_path=target,
                    start_line=0,
                    end_line=0,
                    severity=sev,
                    rule_id=f"dotnet-audit/{pkg_id}",
                    message=f"{pkg_id}@{version}: {sev_str} vulnerability",
                    category="dependency_vulnerability",
                ))

    if findings:
        print(f"  ✅ dotnet package audit found {len(findings)} dependency vulnerabilities")
    return findings


def _install_trivy() -> bool:
    """
    Install Trivy if not in PATH.
    Tries (in order):
      1. apt-get with gpg keyring (Ubuntu 22.04+ compatible, requires sudo)
      2. Official install script to /usr/local/bin (requires sudo)
      3. Direct GitHub release binary to ~/.local/bin (no sudo needed)
    Returns True if trivy is available after any successful attempt.
    """
    if _tool_available("trivy"):
        return True

    print("  ℹ️ trivy not found — attempting install...")

    # Method 1: apt-get with modern gpg keyring (Ubuntu 22.04+ — apt-key is deprecated)
    if _tool_available("apt-get"):
        code, _, _ = run_command(
            ["bash", "-c",
             "sudo apt-get install -y --no-install-recommends wget gpg lsb-release 2>/dev/null"
             " && wget -qO - https://aquasecurity.github.io/trivy-repo/deb/public.key"
             "   | gpg --dearmor | sudo tee /usr/share/keyrings/trivy.gpg > /dev/null"
             " && echo \"deb [signed-by=/usr/share/keyrings/trivy.gpg]"
             "   https://aquasecurity.github.io/trivy-repo/deb $(lsb_release -sc) main\""
             "   | sudo tee /etc/apt/sources.list.d/trivy.list > /dev/null"
             " && sudo apt-get update -qq && sudo apt-get install -y trivy"],
            timeout=180,
        )
        if code == 0 and _tool_available("trivy"):
            print("  ✅ trivy installed via apt")
            return True

    # Method 2: official install script → /usr/local/bin (sudo required)
    if _tool_available("curl"):
        code, _, _ = run_command(
            ["bash", "-c",
             "curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh"
             " | sudo sh -s -- -b /usr/local/bin v0.64.1"],
            timeout=120,
        )
        if code == 0 and _tool_available("trivy"):
            print("  ✅ trivy installed via install script")
            return True

    # Method 3: direct GitHub release download → ~/.local/bin (no sudo needed)
    local_bin = os.path.join(os.path.expanduser("~"), ".local", "bin")
    os.makedirs(local_bin, exist_ok=True)
    dl_tool = "curl -sfL" if _tool_available("curl") else ("wget -qO-" if _tool_available("wget") else None)
    if dl_tool:
        code, _, _ = run_command(
            ["bash", "-c",
             f"{dl_tool} https://github.com/aquasecurity/trivy/releases/download/v0.64.1/trivy_0.64.1_Linux-64bit.tar.gz"
             f" | tar -xz -C /tmp trivy"
             f" && mv /tmp/trivy {local_bin}/trivy"
             f" && chmod +x {local_bin}/trivy"],
            timeout=120,
        )
        os.environ["PATH"] = f"{local_bin}{os.pathsep}{os.environ.get('PATH', '')}"
        if _tool_available("trivy"):
            print("  ✅ trivy installed via direct download")
            return True

    print("  ⚠️ trivy install failed — skipping Trivy SCA scan")
    return False


def run_trivy_sca(roots: list[str]) -> list[Finding]:
    """
    Trivy filesystem SCA scan — detects known CVEs in dependencies across all ecosystems.
    Covers NuGet (.NET), npm (Node/React), Composer (PHP), pip (Python), Go modules, etc.
    Auto-installs trivy if absent.
    Returns list[Finding] with category="dependency_vulnerability".
    """
    if not _install_trivy():
        return []

    _sev_map = {
        "CRITICAL": BLOCKER,
        "HIGH":     HIGH,
        "MEDIUM":   MEDIUM,
        "LOW":      LOW,
        "UNKNOWN":  INFO,
    }

    findings: list[Finding] = []

    for root in roots:
        if not os.path.isdir(root):
            continue

        print(f"    Scanning {root} with trivy...")
        code, stdout, stderr = run_command(
            ["trivy", "fs",
             "--format", "json",
             "--scanners", "vuln",
             "--quiet",
             "--no-progress",
             root],
            timeout=300,
        )

        if code not in {0, 1}:
            print(f"    ⚠️ trivy exited {code}: {stderr[:200]}")
            continue

        if not stdout.strip():
            continue

        try:
            data = json.loads(stdout)
        except json.JSONDecodeError as exc:
            print(f"    ⚠️ trivy JSON parse failed: {exc}")
            continue

        for result in data.get("Results", []):
            target = result.get("Target", root)
            # Make target path relative to root for cleaner file_path
            try:
                rel_target = os.path.relpath(
                    os.path.join(root, target) if not os.path.isabs(target) else target,
                    start=".",
                )
            except ValueError:
                rel_target = target

            for vuln in result.get("Vulnerabilities") or []:
                cve_id       = vuln.get("VulnerabilityID", "")
                pkg_name     = vuln.get("PkgName", "unknown")
                installed    = vuln.get("InstalledVersion", "unknown")
                fixed        = vuln.get("FixedVersion", "")
                raw_sev      = str(vuln.get("Severity", "UNKNOWN")).upper()
                title        = vuln.get("Title") or cve_id or "Vulnerability"
                description  = vuln.get("Description", "")

                # Extract CVSS v3 score if available
                cvss_score: float | None = None
                for source in ("nvd", "redhat"):
                    v3 = vuln.get("CVSS", {}).get(source, {}).get("V3Score")
                    if v3 is not None:
                        cvss_score = float(v3)
                        break

                sev = _sev_map.get(raw_sev, MEDIUM)

                msg_parts = [f"{pkg_name}@{installed}: {title}"]
                if fixed:
                    msg_parts.append(f"→ fix: upgrade to {fixed}")
                if cvss_score is not None:
                    msg_parts.append(f"CVSS {cvss_score:.1f}")
                if description:
                    msg_parts.append(description[:200])
                message = " | ".join(msg_parts)

                rule_id = f"trivy/{cve_id}" if cve_id else f"trivy/{pkg_name}-{raw_sev}"

                findings.append(Finding(
                    file_path=rel_target,
                    start_line=0,
                    end_line=0,
                    severity=sev,
                    rule_id=rule_id,
                    message=message,
                    category="dependency_vulnerability",
                ))

                short = f"{pkg_name}@{installed} ({cve_id or raw_sev})"
                if fixed:
                    short += f" → {fixed}"
                print(f"      [{raw_sev}] {short}")

    if findings:
        print(f"  ✅ trivy found {len(findings)} dependency vulnerabilities")
    else:
        print("  ✅ trivy: no vulnerabilities found")

    return findings


def run_detect_secrets(roots: list[str], ignore_patterns: list[str] | None = None) -> list[Finding]:
    """
    detect-secrets — scans for secrets (API keys, passwords, tokens, credentials).
    Detects hardcoded credentials, private keys, AWS keys, etc.
    Returns list[Finding] — all secrets categorized as BLOCKER (secrets are critical).
    
    Requires: pip install detect-secrets
    """
    findings: list[Finding] = []
    ignore_patterns = ignore_patterns or []
    
    if not _ensure_pip_tool("detect-secrets", "detect-secrets"):
        SECURITY_SCAN_STATUS["detect-secrets"] = "skipped"
        print("  [skip] detect-secrets not installed and pip unavailable")
        return []
    
    print("    Scanning for secrets with detect-secrets...")
    
    # Build exclude patterns for detect-secrets scan command.
    # detect-secrets expects regex patterns for file/line exclusion.
    exclude_args = []

    # Exclude generated/vendor artefacts that create entropy noise but are not source secrets.
    default_excluded_files = [
        r"(^|/)(obj|bin|node_modules|dist|build|coverage|TestResults)/",
        r"(^|/)project\.assets\.json$",
        r"(^|/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$",
        r"(^|/)\.git/",
    ]
    for file_regex in default_excluded_files:
        exclude_args.extend(["--exclude-files", file_regex])

    # Ignore CI variable placeholders (e.g. $(TOKEN), ${{ secrets.X }}) that are not hardcoded secrets.
    default_excluded_lines = [
        r"\$\([A-Za-z0-9_.-]+\)",
        r"\$\{\{[^}]+\}\}",
    ]
    for line_regex in default_excluded_lines:
        exclude_args.extend(["--exclude-lines", line_regex])

    for pattern in ignore_patterns:
        escaped = re.escape(pattern).replace(r"\*\*", ".*").replace(r"\*", "[^/]*")
        exclude_args.extend(["--exclude-files", escaped])
    
    # detect-secrets output is JSON baseline by default; some versions do not support --json.
    # Try broader variants for compatibility across agent images.
    commands_to_try = [
        ["detect-secrets", "scan", "--all-files", *exclude_args, *roots],
        ["detect-secrets", "scan", *exclude_args, *roots],
        ["detect-secrets", "scan", "--all-files", *exclude_args],
        ["detect-secrets", "scan", *exclude_args],
    ]

    returncode, stdout, stderr = -1, "", ""
    for cmd in commands_to_try:
        returncode, stdout, stderr = run_command(cmd)
        if returncode in {0, 1} and stdout.strip():
            break
    
    if not stdout.strip():
        if returncode > 0:
            print(f"    ⚠️ detect-secrets error: {stderr[:100]}")
        SECURITY_SCAN_STATUS["detect-secrets"] = "failed"
        return []
    
    try:
        results = json.loads(stdout)
        
        logged_findings = 0
        max_logged_findings = int(os.getenv("PLATFORM_DETECT_SECRETS_LOG_LIMIT", "50"))

        for filepath, secrets_list in results.get("results", {}).items():
            for secret in secrets_list:
                # Each secret has type (high entropy, hardcoded creds, etc.)
                secret_type = secret.get("type", "SecretDetector")
                is_verified = secret.get("is_verified", False)
                
                # Verified secrets are more critical
                sev = BLOCKER if is_verified else HIGH
                
                findings.append(Finding(
                    file_path=filepath,
                    start_line=secret.get("line_number", 0),
                    end_line=secret.get("line_number", 0),
                    severity=sev,
                    rule_id=f"detect-secrets/{secret_type}",
                    message=f"Potential secret detected: {secret_type} (verified: {is_verified})",
                    category="vulnerability",
                ))
                if logged_findings < max_logged_findings:
                    print(f"      [BLOCKER] {filepath}:{secret.get('line_number', '?')}: {secret_type}")
                logged_findings += 1

        if logged_findings > max_logged_findings:
            print(f"      ... and {logged_findings - max_logged_findings} more potential secrets")
    except json.JSONDecodeError as e:
        SECURITY_SCAN_STATUS["detect-secrets"] = "failed"
        print(f"    ⚠️ Failed to parse detect-secrets output: {e}")
        return []

    SECURITY_SCAN_STATUS["detect-secrets"] = "ok"
    
    if findings:
        print(f"  ✅ detect-secrets found {len(findings)} potential secrets")
    return findings


def run_bandit(roots: list[str], ignore_patterns: list[str] | None = None) -> list[Finding]:
    """
    Bandit Python security scanner.
    Returns list[Finding] — findings feed both the score and affected_files.
    """
    ignore_patterns = ignore_patterns or []
    python_roots = [r for r in roots if os.path.isdir(r)]
    if not python_roots:
        return []
    if not _tool_available("bandit"):
        print("  [skip] bandit not installed")
        return []

    cmd = ["bandit", "-r", *python_roots, "-f", "json", "-q"]
    if ignore_patterns:
        cmd.extend(["-x", ",".join(ignore_patterns)])
    code, stdout, stderr = run_command(cmd)
    if code not in {0, 1}:
        print(f"  [warn] bandit failed (exit {code}): {stderr[:200]}")
        return []

    try:
        payload = json.loads(stdout or "{}")
    except json.JSONDecodeError as exc:
        print(f"  [warn] bandit JSON parse failed: {exc}")
        return []

    _sev_map = {"HIGH": HIGH, "MEDIUM": MEDIUM, "LOW": LOW}
    findings: list[Finding] = []
    for item in payload.get("results", []):
        sev = _sev_map.get(str(item.get("issue_severity", "LOW")).upper(), LOW)
        findings.append(Finding(
            file_path=item.get("filename", ""),
            start_line=item.get("line_number", 0),
            end_line=item.get("line_number", 0),
            severity=sev,
            rule_id=item.get("test_id", "bandit/unknown"),
            message=item.get("issue_text", ""),
            category="vulnerability" if sev in {HIGH, BLOCKER} else "hotspot",
        ))

    findings = [f for f in findings if not _is_ignored(f.file_path, ignore_patterns)]

    return findings


# ── Code Coverage Calculation ─────────────────────────────────────────────────

def generate_coverage_reports() -> int:
    """
    Pre-flight phase: Generate coverage reports using language-specific test tools.
    
    Tries to execute tests with coverage reporting enabled for:
    - Python (pytest with coverage.py)
    - Node.js (npm test with jest/nyc coverage)
    - Java (maven with jacoco)
    - .NET (dotnet test)
    - Go (go test -coverprofile)
    - Ruby (rspec/minitest with simplecov)
    
    Returns 0 on success (or if tests not needed), 1 on test failure
    """
    print("\n" + "=" * 70)
    print("📊 Pre-flight: Coverage Report Generation")
    print("=" * 70)
    
    all_success = True
    
    # ── Python: pytest with coverage ──
    if _tool_available("pytest") and Path("pytest.ini").exists():
        print("🧪 Python: Running pytest with coverage...")
        code, out, err = run_command([
            "pytest", "--cov=.", "--cov-report=xml", "--cov-report=html",
            "-v", "--tb=short"
        ])
        if code == 0:
            print("  ✅ pytest coverage completed")
        else:
            print(f"  ⚠️ pytest had failures (exit code {code}), continuing...")
            if "FAILED" in out:
                print(f"    Test failures detected, but coverage was generated")
            all_success = all_success and (code == 0)
    elif Path("requirements.txt").exists() or Path("setup.py").exists():
        print("🧪 Python: Detecting test framework...")
        if _tool_available("pytest"):
            # Try pytest
            code, _, _ = run_command(["pytest", "--collect-only", "-q"])
            if code == 0:
                print("  Found pytest. Running with coverage...")
                code, out, _ = run_command([
                    "pytest", "--cov=.", "--cov-report=xml",
                    "--cov-report=html", "-x"
                ])
                print("  ✅ pytest coverage completed" if code == 0 else "  ⚠️ pytest coverage generation (continuing)")
        elif _tool_available("python") or _tool_available("python3"):
            # Try unittest
            code, _, _ = run_command(["python", "-m", "unittest", "discover", "-p", "test_*.py"])
            if code == 0:
                print("  ⚠️ unittest found but coverage not configured")
            else:
                print("  [skip] No tests detected for Python")
        else:
            print("  [skip] Python not available")
    
    # ── Node.js/TypeScript: local jest from installed dependencies ──
    _lang_stack = os.environ.get("PLATFORM_LANGUAGE_STACK", "").lower()
    package_jsons = _discover_package_jsons()
    if _tool_available("npm") and package_jsons and _lang_stack != "php":
        for package_json in package_jsons:
            project_dir = package_json.parent
            print(f"🧪 Node.js/TypeScript: Detecting test framework in {project_dir}...")

            try:
                with open(package_json) as f:
                    pkg = json.load(f)
            except (json.JSONDecodeError, FileNotFoundError) as exc:
                print(f"  ⚠️ Could not parse {package_json}: {exc}")
                continue

            test_scripts = pkg.get("scripts", {})
            if "test:coverage" not in test_scripts and "test" not in test_scripts:
                print("  [skip] No test script in package.json")
                continue

            if not _ensure_node_dependencies(project_dir):
                all_success = False
                continue

            local_jest = _find_local_binary(project_dir, "jest")
            if local_jest is not None:
                jest_abs = str(local_jest.resolve())
                print(f"  Found local jest binary: {jest_abs}")
                _cleanup_coverage_artifacts(project_dir)
                code, out, err = run_command_in_dir(
                    [jest_abs, "--silent", "--coverage", "--no-cache", "--forceExit"],
                    project_dir,
                    {"NODE_ENV": "test"},
                )
                if code == 0:
                    print("  ✅ local jest coverage completed")
                    _generate_node_coverage_reports(project_dir)
                else:
                    print(f"  ⚠️ local jest exited with {code}")
                    if err.strip():
                        print(f"     stderr: {err[:400]}")
                    elif out.strip():
                        print(f"     stdout: {out[:400]}")
                    _cleanup_coverage_artifacts(project_dir)
                    print("     Discarded partial coverage artifacts after failed jest run")
                    all_success = False
                continue

            print("  ⚠️ jest binary not found after npm install")
            all_success = False
    elif Path("package.json").exists() and not _tool_available("npm"):
        print("🧪 Node.js: npm not available")
    
    # ── Java: Maven with JaCoCo ──
    if _tool_available("mvn") and (Path("pom.xml").exists() or list(Path(".").glob("**/pom.xml"))):
        print("🧪 Java: Running Maven with coverage...")
        code, _, err = run_command(["mvn", "clean", "test", "jacoco:report", "-DskipTests=false"])
        if code == 0:
            print("  ✅ Maven coverage completed")
        else:
            print(f"  ⚠️ Maven had failures (exit {code})")
            all_success = False
    
    # ── .NET: dotnet restore + test with coverage ──
    sln_files  = list(Path(".").glob("*.sln")) + list(Path(".").glob("**/*.sln"))
    csproj_files = list(Path(".").glob("**/*.csproj")) if not sln_files else []
    if _tool_available("dotnet") and (sln_files or csproj_files):
        print("🧪 .NET: Running dotnet restore + test with coverage...")
        restore_target = str(sln_files[0]) if sln_files else "."
        code, _, err = run_command(["dotnet", "restore", restore_target])
        if code != 0:
            print(f"  ⚠️ dotnet restore failed (exit {code}) — skipping coverage")
            if err.strip():
                print(f"     {err[:1200]}")
        else:
            print("  ✅ dotnet restore completed")
            coverage_output = str(Path(".").resolve() / "coverage.xml")
            code, _, err = run_command([
                "dotnet", "test", restore_target,
                "/p:CollectCoverage=true",
                "/p:CoverletOutputFormat=cobertura",
                f"/p:CoverletOutput={coverage_output}",
            ])
            if code == 0:
                print("  ✅ dotnet test coverage completed")
            else:
                print(f"  ⚠️ dotnet test had issues (exit {code})")
                if err.strip():
                    print(f"     {err[:300]}")
    
    # ── Go: go test with coverage ──
    if _tool_available("go") and list(Path(".").glob("*_test.go")):
        print("🧪 Go: Running go test with coverage...")
        code, _, _ = run_command([
            "go", "test", "./...", "-coverprofile=coverage.out"
        ])
        if code == 0:
            print("  ✅ go test coverage completed")
        else:
            print(f"  ⚠️ go test had failures (exit {code})")
            all_success = False
    
    # ── Ruby: rspec/minitest with SimpleCov ──
    if _tool_available("bundle") and Path("Gemfile").exists():
        print("🧪 Ruby: Running bundled test with coverage...")
        code, _, _ = run_command(["bundle", "exec", "rspec", "--format", "progress"])
        if code == 0:
            print("  ✅ bundle test with SimpleCov completed")
        else:
            print(f"  ⚠️ bundle test had failures (exit {code})")
            all_success = all_success and (code == 0)

    # ── PHP: PHPUnit with PCOV/Xdebug ──
    _phpunit_config = next(
        (p for p in [Path("phpunit.xml"), Path("phpunit.xml.dist")] if p.exists()), None
    )
    _phpunit_bin = (
        "vendor/bin/phpunit" if Path("vendor/bin/phpunit").exists()
        else "phpunit" if _tool_available("phpunit")
        else None
    )
    if _phpunit_bin and _phpunit_config:
        print("🧪 PHP: Running PHPUnit with coverage (PCOV)...")
        # Pass a minimal Laravel testing environment so tests that need a DB
        # can use SQLite in-memory instead of trying to reach a real server.
        _phpunit_env = {
            "APP_ENV": "testing",
            "APP_KEY": os.environ.get("APP_KEY", "base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="),
            "DB_CONNECTION": "sqlite",
            "DB_DATABASE": ":memory:",
            "CACHE_DRIVER": "array",
            "SESSION_DRIVER": "array",
            "QUEUE_CONNECTION": "sync",
            "MAIL_MAILER": "array",
        }
        def _run_phpunit(extra_args: list[str]) -> tuple[int, str, str]:
            return run_command_in_dir(
                [_phpunit_bin,
                 "--coverage-clover=coverage.xml",
                 "--display-errors",
                 "-d", "pcov.enabled=1",
                 "-d", "pcov.directory=app",
                 ] + extra_args,
                ".",
                env_overrides=_phpunit_env,
                timeout=300,
            )

        # Try Unit tests first (no database needed).
        # Feature/integration tests require a running DB with migrations — skip them in CI.
        print("  Trying --testsuite=Unit first (no DB required)...")
        code, out, err = _run_phpunit(["--testsuite=Unit"])
        if code != 0:
            # Unit suite may not exist or also fail — try full suite as fallback
            print(f"  Unit testsuite exited {code}, trying full suite...")
            code, out, err = _run_phpunit([])

        if code == 0 and Path("coverage.xml").exists():
            print("  ✅ PHPUnit coverage generated (coverage.xml)")
        elif code == 0:
            print("  ⚠️ PHPUnit ran but no coverage.xml — PCOV may not be available on this runner")
        else:
            combined = (out + "\n" + err).strip()
            lines = [l for l in combined.splitlines() if l.strip()]
            print(f"  ⚠️ PHPUnit exited {code} (Feature tests need a running DB with migrations)")
            for ln in lines[:4]:
                print(f"     {ln}")
            if len(lines) > 4:
                print(f"     ... ({len(lines) - 4} more lines — Feature tests require MySQL/PostgreSQL)")
    elif _phpunit_bin and not _phpunit_config:
        print("🧪 PHP: [skip] phpunit found but no phpunit.xml — add one to enable coverage")
    elif _phpunit_config and not _phpunit_bin:
        print("🧪 PHP: [skip] phpunit.xml found but phpunit binary missing (run composer install)")

    print("\n📊 Coverage generation phase completed\n")
    return 0  # Always return 0 - coverage is optional, don't block scan


def calculate_code_coverage() -> int:
    """
    Calculate code coverage from available coverage reports.
    
    Supports multiple languages/tools:
    - Python: .coverage files (via coverage.py) OR .coverage.xml (via pytest-cov)
    - JavaScript/TypeScript: coverage.json (via nyc/jest/vitest)
    - Java: coverage.xml (via JaCoCo)
    - C#/.NET: coverage.xml (via OpenCover/coverlet)
    - Ruby: coverage/.resultset.json (via SimpleCov)
    - PHP: coverage.xml (via PHPUnit/PCOV)
    - Go: coverage.out (via go test -coverprofile)
    
    Returns: average coverage percentage across available reports, or 0
    """
    try:
        coverages = []
        print("🔍 Searching for coverage reports...")
        print(f"   Working directory: {Path.cwd()}")
        
        # Specific file checks (faster than os.walk)
        expected_files = [
            ".coverage",
            "coverage.xml",
            "TestResults/Cobertura.xml",
            "coverage/coverage-final.json",
            "coverage-jest/coverage-jest.json",
            "coverage/coverage-jest.json",
            "coverage.out",
            "coverage/.resultset.json",
        ]

        # Azure DevOps often stores Cobertura outside repo root (e.g. /home/vsts/work/_temp/TestResults/Cobertura.xml).
        az_temp_root = os.getenv("AGENT_TEMPDIRECTORY")
        external_cobertura_candidates: list[Path] = []
        if az_temp_root:
            external_cobertura_candidates.extend([
                Path(az_temp_root) / "TestResults" / "Cobertura.xml",
                Path(az_temp_root) / "TestResults" / "coverage.cobertura.xml",
            ])

        for ext_path in external_cobertura_candidates:
            expected_files.append(str(ext_path))
        
        print("   Checking expected locations:")
        for filepath in expected_files:
            p = Path(filepath)
            exists = "✅" if p.exists() else "❌"
            print(f"     {exists} {filepath}")
        
        # Python coverage (coverage.py)
        if Path(".coverage").exists():
            try:
                result = subprocess.run(
                    ["coverage", "report", "--skip-covered"],
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                for line in result.stdout.split("\n"):
                    if "TOTAL" in line:
                        parts = line.split()
                        if parts[-1].endswith("%"):
                            cov_str = parts[-1].rstrip("%")
                            coverages.append(int(float(cov_str)))
                            print(f"   ✅ Python coverage (coverage.py): {cov_str}%")
                            break
            except Exception as e:
                print(f"   ⚠️ Could not parse Python coverage.py: {e}")
        
        # Python coverage XML (pytest-cov)
        if Path("coverage.xml").exists():
            try:
                import xml.etree.ElementTree as ET
                tree = ET.parse("coverage.xml")
                root = tree.getroot()
                line_rate = root.get("line-rate")
                if line_rate:
                    cov_pct = int(float(line_rate) * 100)
                    coverages.append(cov_pct)
                    print(f"   ✅ Python coverage (coverage.xml): {cov_pct}%")
            except Exception as e:
                print(f"   ⚠️ Could not parse coverage.xml: {e}")

        # Cobertura XML (Azure DevOps PublishCodeCoverageResults output paths)
        cobertura_candidates: list[Path] = []
        if Path("TestResults/Cobertura.xml").exists():
            cobertura_candidates.append(Path("TestResults/Cobertura.xml"))
        for ext_path in external_cobertura_candidates:
            if ext_path.exists():
                cobertura_candidates.append(ext_path)

        if not cobertura_candidates:
            cobertura_candidates.extend(sorted(Path(".").glob("**/Cobertura.xml"))[:5])
            cobertura_candidates.extend(sorted(Path(".").glob("**/coverage.cobertura.xml"))[:5])

        for cobertura_file in cobertura_candidates:
            try:
                import xml.etree.ElementTree as ET
                tree = ET.parse(str(cobertura_file))
                root = tree.getroot()
                line_rate = root.get("line-rate")
                if line_rate is not None:
                    cov_pct = int(float(line_rate) * 100)
                    coverages.append(cov_pct)
                    print(f"   ✅ Cobertura coverage ({cobertura_file}): {cov_pct}%")
                    break
            except Exception as e:
                print(f"   ⚠️ Could not parse Cobertura report {cobertura_file}: {e}")
        
        # JavaScript/TypeScript coverage.json (nyc/jest/vitest)
        # Check multiple possible locations: coverage/coverage-final.json (vitest/jest) and coverage-jest/coverage-jest.json (jest)
        coverage_files = [
            Path("coverage/coverage-final.json"),
            Path("coverage-jest/coverage-jest.json"),
            Path("coverage/coverage-jest.json"),
        ]
        # Fallback: search recursively (handles apps/web/coverage/, subdirectory structures, etc.)
        if not any(p.exists() for p in coverage_files):
            found_recursive = sorted(Path(".").rglob("coverage-final.json"))[:5]
            if found_recursive:
                print(f"   🔍 Recursive search found: {[str(p) for p in found_recursive]}")
            coverage_files = found_recursive or coverage_files
        
        for coverage_file in coverage_files:
            if coverage_file.exists():
                try:
                    with open(coverage_file) as f:
                        cov_data = json.load(f)
                        line_coverage = []
                        for file_data in cov_data.values():
                            if isinstance(file_data, dict):
                                # nyc format: "lines" key contains line coverage data
                                if "lines" in file_data:
                                    lines = file_data["lines"]
                                    covered = sum(1 for hit in lines.values() if hit and hit > 0)
                                    total = len(lines)
                                    if total > 0:
                                        line_coverage.append((covered / total) * 100)
                                # v8/Istanbul format (vitest/jest): "s" key contains statement coverage
                                elif "s" in file_data:
                                    statements = file_data["s"]
                                    covered = sum(1 for hit in statements.values() if hit and hit > 0)
                                    total = len(statements)
                                    if total > 0:
                                        line_coverage.append((covered / total) * 100)
                        
                        if line_coverage:
                            avg_cov = int(sum(line_coverage) / len(line_coverage))
                            coverages.append(avg_cov)
                            print(f"   ✅ JS/TS coverage ({coverage_file}): {avg_cov}%")
                            break  # Don't check other files once one is found
                except Exception as e:
                    print(f"   ⚠️ Could not parse JS/TS coverage from {coverage_file}: {e}")
        
        # Java/C#/.NET/PHP coverage XML (JaCoCo, OpenCover, coverlet, PHPUnit)
        for coverage_file in Path(".").glob("**/coverage.xml"):
            if str(coverage_file) in ["coverage.xml"]:  # Skip if already parsed as Python
                continue
            try:
                import xml.etree.ElementTree as ET
                tree = ET.parse(str(coverage_file))
                root = tree.getroot()
                
                # Try JaCoCo format (Java)
                if root.tag == "report":
                    counters = root.findall(".//counter[@type='LINE']")
                    if counters:
                        counter = counters[0]
                        covered = int(counter.get("covered", 0))
                        missed = int(counter.get("missed", 0))
                        total = covered + missed
                        if total > 0:
                            cov_pct = int((covered / total) * 100)
                            coverages.append(cov_pct)
                            print(f"   ✅ Java/C# coverage (coverage.xml): {cov_pct}%")
                
                # Try OpenCover format (.NET)
                elif root.tag == "CoverageSession":
                    coverage_elem = root.find(".//Summary")
                    if coverage_elem is not None:
                        numSequencePoints = int(coverage_elem.get("numSequencePoints", 0))
                        visitedSequencePoints = int(coverage_elem.get("visitedSequencePoints", 0))
                        if numSequencePoints > 0:
                            cov_pct = int((visitedSequencePoints / numSequencePoints) * 100)
                            coverages.append(cov_pct)
                            print(f"   ✅ .NET coverage (OpenCover): {cov_pct}%")
            except Exception as e:
                print(f"   ⚠️ Could not parse coverage.xml: {e}")
        
        # Ruby coverage (SimpleCov)
        if Path("coverage/.resultset.json").exists():
            try:
                with open("coverage/.resultset.json") as f:
                    cov_data = json.load(f)
                    # SimpleCov format: { "RSpec" => { coverage.json => [...] } }
                    for test_framework, framework_data in cov_data.items():
                        if isinstance(framework_data, dict):
                            line_coverage = []
                            for file_path, line_data in framework_data.items():
                                if isinstance(line_data, list):
                                    covered = sum(1 for hit in line_data if hit and hit > 0)
                                    total = len(line_data)
                                    if total > 0:
                                        line_coverage.append((covered / total) * 100)
                            
                            if line_coverage:
                                avg_cov = int(sum(line_coverage) / len(line_coverage))
                                coverages.append(avg_cov)
                                print(f"   ✅ Ruby coverage (SimpleCov): {avg_cov}%")
                                break
            except Exception as e:
                print(f"   ⚠️ Could not parse Ruby coverage: {e}")
        
        # Go coverage
        if Path("coverage.out").exists():
            try:
                result = subprocess.run(
                    ["go", "tool", "cover", "-html=coverage.out", "-o=/tmp/coverage.html"],
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                # Parse coverage.out directly
                covered_blocks = 0
                total_blocks = 0
                with open("coverage.out") as f:
                    for line in f:
                        if line.startswith("mode:"):
                            continue
                        parts = line.strip().split()
                        if len(parts) >= 3:
                            block_count = int(parts[2])
                            count = int(parts[3])
                            total_blocks += block_count
                            if count > 0:
                                covered_blocks += block_count
                
                if total_blocks > 0:
                    cov_pct = int((covered_blocks / total_blocks) * 100)
                    coverages.append(cov_pct)
                    print(f"   ✅ Go coverage (coverage.out): {cov_pct}%")
            except Exception as e:
                print(f"   ⚠️ Could not parse Go coverage: {e}")
        
        # Return average coverage or 0
        if coverages:
            avg = int(sum(coverages) / len(coverages))
            print(f"📊 Average code coverage across {len(coverages)} report(s): {avg}%")
            return avg
        else:
            print("❌ No coverage reports found")
            print("   Troubleshooting tips:")
            print("   - Verify test scripts exist in package.json (test, test:coverage)")
            print("   - Check pytest.ini or setup.py for Python")
            print("   - Ensure --coverage flag is passed to test runner")
            print("   - Verify node_modules is installed (npm install)")
            return 0
            
    except Exception as e:
        print(f"Error calculating coverage: {e}")
        import traceback
        traceback.print_exc()
        return 0


def _dedup_findings(findings: list[Finding]) -> list[Finding]:
    """Remove duplicate findings with same file, line, and rule ID reported by multiple tools."""
    seen: set[tuple[str, int, str]] = set()
    deduped: list[Finding] = []
    for f in findings:
        key = (_normalize_path(f.file_path), f.start_line, f.rule_id)
        if key not in seen:
            seen.add(key)
            deduped.append(f)
    return deduped


# ── Orchestration ─────────────────────────────────────────────────────────────

def collect_real_sast_metrics() -> dict:
    roots = discover_scan_roots()
    ignore_patterns = _scan_ignore_patterns()
    loc   = count_lines_of_code(roots, ignore_patterns)
    print(f"SAST targets : {', '.join(roots)}")
    print(f"Non-empty LOC: {loc}")
    if ignore_patterns:
        print(f"Ignore rules : {', '.join(ignore_patterns)}")

    files_by_lang = discover_languages(roots, ignore_patterns)
    print(f"Languages    : {', '.join(files_by_lang) or 'none detected'}")

    # PLATFORM_LANGUAGE_STACK — hint which tool groups to activate.
    # react-ts : ESLint/tsc + npm-audit
    # dotnet   : Roslyn/dotnet-build + dotnet-package-audit
    # php      : phpstan/phpcs/phpmd/psalm + composer-audit
    # (unset)  : run all tools applicable to discovered languages
    lang_stack = os.getenv("PLATFORM_LANGUAGE_STACK", "").strip().lower()
    _react  = lang_stack == "react-ts"
    _dotnet = lang_stack == "dotnet"
    _php    = lang_stack == "php"
    if lang_stack:
        print(f"Language stack: {lang_stack}")

    all_findings: list[Finding] = []
    SECURITY_SCAN_STATUS["semgrep"] = "not-run"
    SECURITY_SCAN_STATUS["detect-secrets"] = "not-run"

    if "python" in files_by_lang and not (_react or _dotnet or _php):
        print("  -> pylint + radon (Python)...")
        all_findings += run_python_analysis(files_by_lang["python"])

    ts_js = files_by_lang.get("typescript", []) + files_by_lang.get("javascript", [])
    if ts_js and not (_dotnet or _php):
        print("  -> ESLint + tsc (TypeScript/JavaScript)...")
        all_findings += run_typescript_analysis(ts_js, roots)

    if "java" in files_by_lang and not (_react or _dotnet or _php):
        print("  -> PMD + Checkstyle (Java)...")
        all_findings += run_java_analysis(files_by_lang["java"])

    if "csharp" in files_by_lang and not (_react or _php):
        print("  -> dotnet build / Roslyn (C#)...")
        all_findings += run_csharp_analysis(files_by_lang["csharp"])

    if "go" in files_by_lang and not (_react or _dotnet or _php):
        print("  -> go vet + staticcheck (Go)...")
        all_findings += run_go_analysis(files_by_lang["go"], roots)

    if "ruby" in files_by_lang and not (_react or _dotnet or _php):
        print("  -> rubocop (Ruby)...")
        all_findings += run_ruby_analysis(files_by_lang["ruby"])

    if "php" in files_by_lang and not (_react or _dotnet):
        print("  -> phpstan + phpcs (PHP)...")
        all_findings += run_php_analysis(files_by_lang["php"])
        print("  -> phpmd (PHP complexity & design)...")
        all_findings += run_phpmd(files_by_lang["php"])
        print("  -> psalm (PHP types & security taint)...")
        all_findings += run_php_psalm(files_by_lang["php"], roots)

    if ("cpp" in files_by_lang or "c" in files_by_lang) and not (_react or _dotnet or _php):
        print("  -> cppcheck (C/C++)...")
        all_findings += run_cpp_analysis(
            files_by_lang.get("cpp", []) + files_by_lang.get("c", [])
        )

    if "kotlin" in files_by_lang and not (_react or _dotnet or _php):
        print("  -> detekt (Kotlin)...")
        all_findings += run_kotlin_analysis(files_by_lang["kotlin"], roots)

    # Security cross-language scanners (always run regardless of stack)
    print("  -> semgrep (security-audit + secrets, all languages)...")
    all_findings += run_semgrep(roots, ignore_patterns)

    if not (_react or _dotnet or _php):
        print("  -> bandit (Python security)...")
        all_findings += run_bandit(roots, ignore_patterns)

    # SCA: run the auditor relevant to each stack
    if not (_dotnet or _php):
        print("  -> npm audit (Node.js dependency vulnerabilities)...")
        all_findings += run_npm_audit(roots)

    if not (_react or _dotnet or _php):
        print("  -> pip-audit (Python dependency vulnerabilities)...")
        all_findings += run_pip_audit(roots)

    if _php or (not lang_stack and "php" in files_by_lang):
        print("  -> composer audit (PHP dependency vulnerabilities)...")
        all_findings += run_composer_audit(roots)

    if _dotnet or (not lang_stack and "csharp" in files_by_lang):
        print("  -> dotnet package audit (NuGet dependency vulnerabilities)...")
        all_findings += run_dotnet_package_audit()

    # Trivy: language-agnostic CVE scan — covers NuGet, npm, Composer, pip, Go, etc.
    # Runs on every stack; provides canonical CVE IDs + CVSS scores.
    # Opt-out via PLATFORM_TRIVY_ENABLED=false in the pipeline.
    if os.getenv("PLATFORM_TRIVY_ENABLED", "true").lower() not in ("false", "0", "no"):
        print("  -> trivy (multi-ecosystem dependency CVE scan)...")
        all_findings += run_trivy_sca(roots)
    else:
        print("  -> trivy disabled via PLATFORM_TRIVY_ENABLED — skipping")

    print("  -> detect-secrets (credential/secret scanning)...")
    all_findings += run_detect_secrets(roots, ignore_patterns)

    all_findings = [f for f in all_findings if not _is_ignored(f.file_path, ignore_patterns)]
    all_findings = _dedup_findings(all_findings)

    # ── Compute scores ──
    security_score    = _compute_score(all_findings, {"vulnerability", "hotspot"})
    reliability_score = _compute_score(all_findings, {"bug"})
    maintain_score    = _compute_score(all_findings, {"code_smell"})

    security_strict_mode = os.getenv("PLATFORM_SECURITY_STRICT_MODE", "true").lower() in {"1", "true", "yes"}
    security_scans_ok = (
        SECURITY_SCAN_STATUS.get("semgrep") == "ok"
        and SECURITY_SCAN_STATUS.get("detect-secrets") == "ok"
    )
    if security_strict_mode and not security_scans_ok:
        cap = int(os.getenv("PLATFORM_SECURITY_PARTIAL_MAX_SCORE", "70"))
        old_score = security_score
        security_score = min(security_score, cap)
        print(
            "  ⚠️ Security score capped because a critical security scanner did not complete successfully: "
            f"semgrep={SECURITY_SCAN_STATUS.get('semgrep')} detect-secrets={SECURITY_SCAN_STATUS.get('detect-secrets')} "
            f"(score {old_score} -> {security_score})"
        )

    vulns     = len([f for f in all_findings if f.category == "vulnerability"])
    hotspots  = len([f for f in all_findings if f.category == "hotspot"])
    smells    = len([f for f in all_findings if f.category == "code_smell"])
    bugs      = len([f for f in all_findings if f.category == "bug"])
    dep_vulns = len([f for f in all_findings if f.category == "dependency_vulnerability"])

    # ── Build affected_files dict ──
    affected_files: dict[str, list[dict]] = {}
    for finding in all_findings:
        if not finding.file_path:
            continue
        affected_files.setdefault(finding.file_path, []).append({
            "line":     finding.start_line,
            "end_line": finding.end_line,
            "rule":     finding.rule_id,
            "message":  finding.message,
            "severity": finding.severity,
            "category": finding.category,
        })

    # ── Console summary ──
    print("\n--- Affected Files ---")
    for filepath, issues in affected_files.items():
        print(f"{filepath}:")
        for issue in issues[:5]:
            ll = (
                f"L{issue['line']}"
                if issue.get("end_line") == issue["line"]
                else f"L{issue['line']}-L{issue['end_line']}"
            )
            print(f"  {ll}: [{issue['severity']}] {issue['rule']}: {issue['message'][:80]}")
        if len(issues) > 5:
            print(f"  ... and {len(issues) - 5} more findings")

    print(
        f"\nSAST summary: "
        f"vulns={vulns} hotspots={hotspots} smells={smells} bugs={bugs} "
        f"dep_vulns={dep_vulns} | "
        f"security={security_score} reliability={reliability_score} "
        f"maintainability={maintain_score}"
    )

    # Calculate real code coverage
    code_coverage = calculate_code_coverage()
    
    # Calculate duplication using jscpd or line-based detection
    duplication = calculate_duplication(roots, ignore_patterns)

    return {
        "reported_maintainability_score":      maintain_score,
        "reported_security_score":             security_score,
        "reported_reliability_score":          reliability_score,
        "reported_code_smells":                smells,
        "reported_vulnerabilities":            vulns,
        "reported_security_hotspots":          hotspots,
        "reported_bugs":                       bugs,
        "reported_dependency_vulnerabilities": dep_vulns,
        "reported_coverage":                   code_coverage,
        "reported_duplication":                duplication,
        "affected_files":                      affected_files,
        "findings":                            all_findings,
    }


def calculate_duplication(roots: list[str], ignore_patterns: list[str]) -> int:
    """
    Calculate code duplication using jscpd (if available) or fallback to line comparison.
    
    jscpd: Detects duplicated blocks (100+ tokens, any language)
    Fallback: Detects identical lines (>10 chars)
    
    Returns: Duplication percentage (0-100)
    """
    # Try a local jscpd binary first. Avoid npx network fetches in CI because
    # private registries often require auth and would fail with E401.
    try:
        import json

        project_root = Path(roots[0] if roots else ".").resolve()
        local_jscpd = _find_local_binary(project_root, "jscpd")
        if not local_jscpd:
            # Try global jscpd (may already be installed on agent)
            if _tool_available("jscpd"):
                local_jscpd = Path("jscpd")  # will be resolved via PATH
            elif _tool_available("npm"):
                print("  ℹ️ jscpd not found — installing globally via npm...")
                code, _, err = run_command(["npm", "install", "-g", "jscpd", "--prefer-offline"])
                if code == 0 and _tool_available("jscpd"):
                    print("  ✅ jscpd installed")
                    local_jscpd = Path("jscpd")
                else:
                    print(f"  ⚠️ jscpd install failed (exit {code}): {err[:200]}")
                    raise FileNotFoundError("jscpd install failed")
            else:
                print("  ℹ️ jscpd not installed and npm unavailable, using line-based duplication detection")
                raise FileNotFoundError("local jscpd binary not found")

        # jscpd writes its JSON report to a file, not stdout.
        # Use --output to control the directory, then read report/jscpd.json.
        import tempfile, shutil
        jscpd_out_dir = Path(tempfile.mkdtemp(prefix="jscpd_"))
        try:
            result = subprocess.run(
                [str(local_jscpd), ".", "--reporters", "json", "--output", str(jscpd_out_dir)],
                capture_output=True,
                timeout=60,
                cwd=str(project_root)
            )
            report_candidates = [
                jscpd_out_dir / "jscpd.json",
                jscpd_out_dir / "jscpd-report.json",
                jscpd_out_dir / "report" / "jscpd.json",
                jscpd_out_dir / "report" / "jscpd-report.json",
            ]
            report_file = next((p for p in report_candidates if p.exists()), None)
            if report_file is None:
                json_candidates = sorted(jscpd_out_dir.rglob("*.json"))
                report_file = json_candidates[0] if json_candidates else None

            if result.returncode == 0 and report_file is not None:
                try:
                    with open(report_file) as rf:
                        data = json.load(rf)
                    statistics = data.get("statistics", data)
                    duplicated_lines = (
                        statistics.get("duplicatedLines")
                        or statistics.get("total", {}).get("duplicatedLines", 0)
                    )
                    total_lines = (
                        statistics.get("totalLines")
                        or statistics.get("total", {}).get("lines", 1)
                        or 1
                    )
                    duplication = min(100, int((duplicated_lines / total_lines) * 100))
                    print(f"  ✅ jscpd detected {duplication}% duplication ({duplicated_lines}/{total_lines} lines)")
                    return duplication
                except (json.JSONDecodeError, KeyError) as e:
                    print(f"  ⚠️ jscpd JSON parse error: {e}, falling back to line-based")
            elif result.returncode != 0:
                stderr = result.stderr.decode("utf-8", errors="ignore") if result.stderr else ""
                print(f"  ⚠️ local jscpd failed (exit code {result.returncode})")
                if stderr.strip():
                    print(f"     Error: {stderr[:200]}")
            else:
                print("  ⚠️ jscpd completed but no JSON report file found")
        finally:
            shutil.rmtree(str(jscpd_out_dir), ignore_errors=True)
    except FileNotFoundError as e:
        print(f"  ⚠️ jscpd unavailable: {e}")
        print(f"     Falling back to line-based detection...")
    except subprocess.TimeoutExpired:
        print(f"  ⚠️ local jscpd timed out (30s limit), falling back to line-based detection...")
    except Exception as e:
        print(f"  ⚠️ Unexpected error running jscpd: {e}")
        print(f"     Falling back to line-based detection...")
    
    # Fallback: Line-based duplication detection
    print("  📊 Using line-based duplication detection...")
    total_lines = 0
    line_occurrences = {}
    
    for root in roots:
        for dirpath, dirnames, filenames in os.walk(root):
            # Skip ignored directories
            dirnames[:] = [d for d in dirnames if d not in {'.git', '__pycache__', 'node_modules', '.venv', 'venv', 'dist', 'build'}]
            
            for filename in filenames:
                filepath = os.path.join(dirpath, filename)
                if _is_ignored(filepath, ignore_patterns):
                    continue
                
                # Only analyze source files
                if not filename.endswith(('.py', '.js', '.ts', '.tsx', '.jsx', '.java', '.cs', '.go', '.rb', '.c', '.cpp', '.h')):
                    continue
                
                try:
                    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                        for line in f:
                            stripped = line.strip()
                            # Count non-empty, non-comment lines with some substance
                            if stripped and not stripped.startswith('#') and not stripped.startswith('//') and len(stripped) > 10:
                                total_lines += 1
                                line_occurrences[stripped] = line_occurrences.get(stripped, 0) + 1
                except (IOError, UnicodeDecodeError):
                    pass
    
    # Count lines that appear more than once
    duplicated_lines = sum(count - 1 for count in line_occurrences.values() if count > 1)
    
    if total_lines > 0:
        duplication = min(100, int((duplicated_lines / total_lines) * 100))
        print(f"  ✅ Line-based detection: {duplication}% duplication ({duplicated_lines}/{total_lines} lines)")
        return duplication
    
    return 0


# ── Vulnerability & IOC Integration Tests ────────────────────────────────────

def test_vulnerability_api(api_url: str, token: str | None, analysis_id: str) -> int:
    """
    Integration test suite for vulnerability and IOC detection endpoints.
    
    Tests:
    - POST IOC detection (critical, high, medium risk levels)
    - GET IOCs with and without filters
    - GET vulnerability summary (includes IOCs)
    - GET global vulnerability statistics
    
    Returns 0 on success, 1 on failure.
    """
    print("\n" + "=" * 70)
    print("🧪 INTEGRATION TESTS: Vulnerability & IOC Endpoints")
    print("=" * 70)
    
    base_url = api_url.rstrip("/")
    test_results = {"passed": 0, "failed": 0, "errors": []}

    def _is_method_not_allowed(exc: Exception) -> bool:
        return "405" in str(exc) and "Method Not Allowed" in str(exc)
    
    # ┌─ Test 1: POST CRITICAL IOC ─────────────────────────────────────────────┐
    try:
        print("\n[1/8] POST CRITICAL IOC (hardcoded credential)...")
        payload = {
            "analysis_id": analysis_id,
            "ioc_type": "hardcoded_credential",
            "ioc_value": "aws_key=AKIAIOSFODNN7",
            "risk_level": "critical",
            "file_path": "app/config.py",
            "line_number": 42,
        }
        response = api_request(f"{base_url}/api/v1/analyses/{analysis_id}/iocs", "POST", token, payload, strict=False)
        assert "id" in response, "Missing IOC ID in response"
        assert response.get("status") == "created", f"Expected status 'created', got {response.get('status')}"
        print("  ✅ CRITICAL IOC posted successfully")
        test_results["passed"] += 1
    except Exception as e:
        if _is_method_not_allowed(e):
            print(f"  ⚠️ SKIPPED (endpoint not implemented): {e}")
            return 0
        print(f"  ❌ FAILED: {e}")
        test_results["failed"] += 1
        test_results["errors"].append(f"Test 1 (POST CRITICAL IOC): {e}")
    
    # ┌─ Test 2: POST HIGH IOC ────────────────────────────────────────────────┐
    try:
        print("[2/8] POST HIGH IOC (API key)...")
        payload = {
            "analysis_id": analysis_id,
            "ioc_type": "api_key",
            "ioc_value": "sk-proj-xxxxxxx",
            "risk_level": "high",
            "file_path": ".env",
            "line_number": 5,
        }
        response = api_request(f"{base_url}/api/v1/analyses/{analysis_id}/iocs", "POST", token, payload, strict=False)
        assert "id" in response, "Missing IOC ID"
        print("  ✅ HIGH IOC posted successfully")
        test_results["passed"] += 1
    except Exception as e:
        print(f"  ❌ FAILED: {e}")
        test_results["failed"] += 1
        test_results["errors"].append(f"Test 2 (POST HIGH IOC): {e}")
    
    # ┌─ Test 3: POST MEDIUM IOC ──────────────────────────────────────────────┐
    try:
        print("[3/8] POST MEDIUM IOC (email)...")
        payload = {
            "analysis_id": analysis_id,
            "ioc_type": "email",
            "ioc_value": "admin@example.com",
            "risk_level": "medium",
            "file_path": "main.py",
            "line_number": 10,
        }
        response = api_request(f"{base_url}/api/v1/analyses/{analysis_id}/iocs", "POST", token, payload, strict=False)
        assert "id" in response, "Missing IOC ID"
        print("  ✅ MEDIUM IOC posted successfully")
        test_results["passed"] += 1
    except Exception as e:
        print(f"  ❌ FAILED: {e}")
        test_results["failed"] += 1
        test_results["errors"].append(f"Test 3 (POST MEDIUM IOC): {e}")
    
    # ┌─ Test 4: GET ALL IOCs ────────────────────────────────────────────────┐
    try:
        print("[4/8] GET all IOCs for analysis...")
        response = api_request(f"{base_url}/api/v1/analyses/{analysis_id}/iocs", "GET", token)
        assert isinstance(response, list), "Response should be a list"
        assert len(response) >= 3, f"Expected at least 3 IOCs, got {len(response)}"
        print(f"  ✅ Retrieved {len(response)} IOCs")
        test_results["passed"] += 1
    except Exception as e:
        if _is_method_not_allowed(e):
            print(f"  ⚠️ SKIPPED (endpoint not implemented): {e}")
            return 0
        print(f"  ❌ FAILED: {e}")
        test_results["failed"] += 1
        test_results["errors"].append(f"Test 4 (GET ALL IOCs): {e}")
    
    # ┌─ Test 5: GET IOCs FILTERED (CRITICAL) ─────────────────────────────────┐
    try:
        print("[5/8] GET IOCs filtered by risk_level=critical...")
        response = api_request(f"{base_url}/api/v1/analyses/{analysis_id}/iocs?risk_level=critical", "GET", token)
        assert isinstance(response, list), "Response should be a list"
        assert len(response) >= 1, f"Expected at least 1 CRITICAL IOC, got {len(response)}"
        # Verify all are critical
        for ioc in response:
            risk = ioc.get("ioc", {}).get("risk_level", "").lower()
            assert risk == "critical", f"Filtered result contains non-critical: {risk}"
        print(f"  ✅ Filter returned {len(response)} CRITICAL IOCs")
        test_results["passed"] += 1
    except Exception as e:
        print(f"  ❌ FAILED: {e}")
        test_results["failed"] += 1
        test_results["errors"].append(f"Test 5 (FILTER CRITICAL): {e}")
    
    # ┌─ Test 6: GET Vulnerabilities Summary ──────────────────────────────────┐
    try:
        print("[6/8] GET vulnerability summary (includes IOCs)...")
        response = api_request(f"{base_url}/api/v1/analyses/{analysis_id}/vulnerabilities", "GET", token)
        assert "iocs" in response, "Missing 'iocs' field in response"
        assert isinstance(response["iocs"], list), "IOCs should be a list"
        assert len(response["iocs"]) >= 3, f"Expected at least 3 IOCs in summary, got {len(response['iocs'])}"
        print(f"  ✅ Summary includes {len(response['iocs'])} IOCs")
        print(f"     - Critical: {response.get('critical_count', 0)}")
        print(f"     - High: {response.get('high_count', 0)}")
        print(f"     - Medium: {response.get('medium_count', 0)}")
        test_results["passed"] += 1
    except Exception as e:
        print(f"  ❌ FAILED: {e}")
        test_results["failed"] += 1
        test_results["errors"].append(f"Test 6 (SUMMARY): {e}")
    
    # ┌─ Test 7: GET Global Statistics ───────────────────────────────────────┐
    try:
        print("[7/8] GET global vulnerability statistics...")
        response = api_request(f"{base_url}/api/v1/vulnerabilities/stats", "GET", token)
        required_fields = ["total_analyses_scanned", "total_critical_vulns", "total_high_vulns"]
        for field in required_fields:
            assert field in response, f"Missing field: {field}"
        print("  ✅ Global stats endpoint responsive")
        print(f"     - Total analyses: {response.get('total_analyses_scanned', 0)}")
        print(f"     - Critical vulns: {response.get('total_critical_vulns', 0)}")
        print(f"     - High vulns: {response.get('total_high_vulns', 0)}")
        test_results["passed"] += 1
    except Exception as e:
        print(f"  ❌ FAILED: {e}")
        test_results["failed"] += 1
        test_results["errors"].append(f"Test 7 (STATS): {e}")
    
    # ┌─ Test 8: Verify IOC Count in Summary ──────────────────────────────────┐
    try:
        print("[8/8] Verify IOC count consistency...")
        iocs_get = api_request(f"{base_url}/api/v1/analyses/{analysis_id}/iocs", "GET", token)
        summary = api_request(f"{base_url}/api/v1/analyses/{analysis_id}/vulnerabilities", "GET", token)
        count_from_get = len(iocs_get) if isinstance(iocs_get, list) else 0
        count_in_summary = len(summary.get("iocs", []))
        assert count_from_get == count_in_summary, \
            f"IOC count mismatch: GET={count_from_get}, Summary={count_in_summary}"
        print(f"  ✅ IOC counts consistent: {count_from_get} IOCs")
        test_results["passed"] += 1
    except Exception as e:
        print(f"  ❌ FAILED: {e}")
        test_results["failed"] += 1
        test_results["errors"].append(f"Test 8 (CONSISTENCY): {e}")
    
    # ┌─ Summary ─────────────────────────────────────────────────────────────┐
    print("\n" + "=" * 70)
    print(f"📊 Test Results: {test_results['passed']}/8 passed, {test_results['failed']}/8 failed")
    print("=" * 70)
    
    if test_results["errors"]:
        print("\n❌ Errors:")
        for error in test_results["errors"]:
            print(f"  - {error}")
        return 1
    
    print("\n✅ All integration tests PASSED!")
    return 0


# ── Pipeline steps ────────────────────────────────────────────────────────────

def prepare(api_url: str, token: str | None) -> int:
    project_key       = env("PLATFORM_PROJECT_KEY",       "new-sast-platform")
    repo_provider     = env("PLATFORM_REPO_PROVIDER",     "github")
    repo_url          = env("PLATFORM_REPO_URL",          "https://github.com/your-org/your-repo")
    pipeline_provider = env("PLATFORM_PIPELINE_PROVIDER", "azure-devops")
    pipeline_url      = env("PLATFORM_PIPELINE_URL",      "https://dev.azure.com/your-org/your-project/_build")

    if os.getenv("PLATFORM_API_TOKEN_REQUIRED", "true").lower() in {"1", "true", "yes"} and not token:
        print("Missing PLATFORM_API_TOKEN while PLATFORM_API_TOKEN_REQUIRED=true")
        return 2

    health_endpoint = f"{api_url.rstrip('/')}/api/v1/health"
    health = api_request(health_endpoint, "GET", token=None)
    print(f"Platform health status: {health.get('status', 'unknown')}")

    providers_endpoint = f"{api_url.rstrip('/')}/api/v1/integrations/providers"
    providers = api_request(providers_endpoint, "GET", token)
    # providers is either a list of strings (legacy) or a list of objects
    # like {"provider_id": "azure-devops", ...} (current API contract).
    if isinstance(providers, list):
        provider_ids = {
            p.get("provider_id") if isinstance(p, dict) else p
            for p in providers
        }
    else:
        provider_ids = {providers}
    if "azure-devops" not in provider_ids:
        print("Provider check failed: 'azure-devops' is not configured in platform")
        return 1

    api_request(
        f"{api_url.rstrip('/')}/api/v1/integrations/projects/{urllib.parse.quote(project_key, safe='')}",
        "PUT",
        token,
        {
            "repo_provider":     repo_provider,
            "repo_url":          repo_url,
            "pipeline_provider": pipeline_provider,
            "pipeline_url":      pipeline_url,
        },
    )
    print("Platform prepare step completed")
    return 0


def run_analysis(api_url: str, token: str | None) -> int:
    project_key = env("PLATFORM_PROJECT_KEY", "new-sast-platform")
    commit_sha  = env("BUILD_SOURCEVERSION",   os.getenv("GITHUB_SHA", "local-commit"))
    branch      = env("BUILD_SOURCEBRANCHNAME", os.getenv("GITHUB_REF_NAME", "local"))
    ci_provider = env("CI_PROVIDER", "local")

    if os.getenv("PLATFORM_API_TOKEN_REQUIRED", "true").lower() in {"1", "true", "yes"} and not token:
        print("Missing PLATFORM_API_TOKEN while PLATFORM_API_TOKEN_REQUIRED=true")
        return 2

    endpoint  = f"{api_url.rstrip('/')}/api/v1/analyses"
    sast_mode = os.getenv("PLATFORM_REAL_SAST", "true").lower() in {"1", "true", "yes"}

    metrics_payload: dict = {}
    if sast_mode:
        try:
            # Step 1: Generate coverage reports (run tests)
            print("\n" + "=" * 70)
            print("PHASE 1: Coverage Report Generation")
            print("=" * 70)
            generate_coverage_reports()
            
            # Step 2: Run SAST analysis (using generated coverage)
            print("\n" + "=" * 70)
            print("PHASE 2: SAST Analysis")
            print("=" * 70)
            metrics_payload = collect_real_sast_metrics()
        except Exception as exc:
            print(f"Real SAST scan failed: {exc}")
            import traceback
            traceback.print_exc()
            return 1
    else:
        print("PLATFORM_REAL_SAST is disabled, using bootstrap metrics fallback")

    # Pull request context — ADO exposes these automatically in PR builds,
    # but branch-policy runs may only expose Build.SourceBranch / Build.Reason.
    def _resolve_ado_var(val: str) -> str:
        """Return empty string if val is an unresolved ADO macro like $(VarName)."""
        return "" if val and re.match(r'^\$\(.*\)$', val.strip()) else val

    build_reason = os.getenv("BUILD_REASON", "")
    build_source_branch = os.getenv("BUILD_SOURCEBRANCH", "")
    pr_id = _resolve_ado_var(os.getenv("SYSTEM_PULLREQUEST_PULLREQUESTID", ""))
    if not pr_id:
        match = re.match(r"refs/pull/(\d+)/merge", build_source_branch)
        if match:
            pr_id = match.group(1)
    pr_repo_id = _resolve_ado_var(os.getenv("BUILD_REPOSITORY_ID", ""))
    pr_ado_project = _resolve_ado_var(os.getenv("SYSTEM_TEAMPROJECT", ""))
    pr_target_branch = (
        _resolve_ado_var(os.getenv("SYSTEM_PULLREQUEST_TARGETBRANCHNAME", ""))
        or _resolve_ado_var(os.getenv("SYSTEM_PULLREQUEST_TARGETBRANCH", ""))
    )
    pr_ado_org_url = _resolve_ado_var(os.getenv("SYSTEM_COLLECTIONURI", "")).rstrip("/")

    # Extract findings before merging metrics (findings are not JSON-serializable as Finding objects)
    all_findings = metrics_payload.pop("findings", [])

    payload: dict = {
        "project_key": project_key,
        "commit_sha":  commit_sha,
        "branch":      branch,
        "ci_provider": ci_provider,
        "reported_platform_url": api_url,
        **metrics_payload,
    }
    
    # Debug: Log the payload
    print(f"\n📋 Analysis Payload Summary:")
    print(f"  reported_duplication: {payload.get('reported_duplication', 'NOT FOUND')}")
    print(f"  reported_coverage: {payload.get('reported_coverage', 'NOT FOUND')}")
    print(f"  reported_code_smells: {payload.get('reported_code_smells', 'NOT FOUND')}")
    
    if pr_id or build_reason.lower() == "pullrequest":
        print(f"PR build detected: PR#{pr_id or '?'} -> {pr_ado_project}/{pr_target_branch or build_source_branch}")
        payload.update({
            "pr_id": pr_id,
            "pr_repo_id": pr_repo_id,
            "pr_ado_project": pr_ado_project,
            "pr_target_branch": pr_target_branch or build_source_branch,
            "pr_ado_org_url": pr_ado_org_url,
        })

    created     = api_request(endpoint, "POST", token, payload)
    analysis_id = created.get("analysis_id")
    if not analysis_id:
        print("Invalid API response: missing analysis_id")
        return 1

    print(f"Analysis submitted: {analysis_id}")
    
    # Store analysis_id for potential downstream tests
    os.environ["PLATFORM_ANALYSIS_ID"] = analysis_id

    # Send detected vulnerabilities/findings to the API
    # Note: Some API implementations may not support the findings POST endpoint (405 Not Allowed)
    # In that case, findings are already stored in the analysis record via the analysis payload
    if all_findings:
        print(f"\nSending {len(all_findings)} detected findings to API...")
        vuln_endpoint = f"{endpoint}/{analysis_id}/vulnerabilities"
        findings_submitted = 0
        endpoint_not_supported = False
        
        for finding in all_findings:
            if endpoint_not_supported:
                break
                
            vuln_payload = {
                "file_path": finding.file_path,
                "line_number": finding.start_line,
                "end_line": finding.end_line,
                "severity": finding.severity,
                "rule_id": finding.rule_id,
                "message": finding.message,
                "category": finding.category,
            }
            try:
                # Use strict=False to avoid exiting on 405 errors
                api_request(vuln_endpoint, "POST", token, vuln_payload, strict=False)
                findings_submitted += 1
            except Exception as e:
                error_str = str(e)
                if "405" in error_str:
                    print(f"  ℹ️ Endpoint does not support POST findings (API design)")
                    endpoint_not_supported = True
                else:
                    print(f"  Warning: Could not submit vulnerability {finding.rule_id}: {e}")
        
        if findings_submitted > 0:
            print(f"Findings submitted: {findings_submitted}")
        elif endpoint_not_supported:
            print("⚠️ Findings stored in analysis record (POST endpoint not available)")
    else:
        print("No findings to submit")

    timeout_seconds  = int(os.getenv("PLATFORM_ANALYSIS_TIMEOUT_SECONDS", "120"))
    interval_seconds = int(os.getenv("PLATFORM_ANALYSIS_POLL_SECONDS", "5"))
    deadline         = time.time() + timeout_seconds
    status_endpoint  = f"{endpoint}/{analysis_id}"

    while time.time() < deadline:
        current = api_request(status_endpoint, "GET", token)
        status  = current.get("status", "unknown")
        gate    = current.get("quality_gate", "unknown")
        print(f"  status={status} quality_gate={gate}")

        if status in {"completed", "failed"}:
            if gate != "pass":
                print("Quality gate FAILED")
                return 1
            print("Quality gate PASSED")
            return 0

        time.sleep(interval_seconds)

    print("Timed out waiting for analysis result")
    return 1



def main() -> int:
    _enter_repo_root()

    api_url = env("PLATFORM_API_URL")
    token   = os.getenv("PLATFORM_API_TOKEN")

    mode = (sys.argv[1] if len(sys.argv) > 1 else os.getenv("PLATFORM_SCAN_MODE", "full")).lower()
    if mode not in {"prepare", "run", "full", "full-test", "test"}:
        print("Invalid mode. Use one of: prepare, run, full, full-test, test")
        return 2

    if mode == "prepare":
        return prepare(api_url, token)
    
    if mode == "run":
        return run_analysis(api_url, token)
    
    if mode == "test":
        # Test-only mode: use PLATFORM_ANALYSIS_ID from env or fail
        analysis_id = os.getenv("PLATFORM_ANALYSIS_ID")
        if not analysis_id:
            print("ERROR: test mode requires PLATFORM_ANALYSIS_ID environment variable")
            return 2
        return test_vulnerability_api(api_url, token, analysis_id)
    
    if mode == "full":
        # full = prepare + run
        result = prepare(api_url, token)
        if result != 0:
            return result
        return run_analysis(api_url, token)
    
    # full-test = prepare + run + test
    result = prepare(api_url, token)
    if result != 0:
        return result
    result = run_analysis(api_url, token)
    if result != 0:
        return result
    # Extract analysis_id from env (set by run_analysis)
    analysis_id = os.getenv("PLATFORM_ANALYSIS_ID")
    if not analysis_id:
        print("ERROR: Could not extract analysis_id from run_analysis")
        return 1
    return test_vulnerability_api(api_url, token, analysis_id)



if __name__ == "__main__":
    sys.exit(main())
