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
import subprocess
import sys
import time
import urllib.error
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


def run_command(command: list[str]) -> tuple[int, str, str]:
    process = subprocess.run(command, capture_output=True, text=True)
    return process.returncode, process.stdout, process.stderr


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
    filename = os.path.basename(normalized)
    for pattern in ignore_patterns:
        p = _normalize_path(pattern)
        if fnmatch(normalized, p) or fnmatch(filename, p):
            return True
    return False


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
        ".git", "node_modules", ".venv", "venv", "dist", "build",
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
        ".git", "node_modules", ".venv", "venv", "dist", "build",
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
    """ESLint (quality) + tsc (type errors/bugs)."""
    if not files:
        return []
    findings: list[Finding] = []

    # ── ESLint ──
    if _tool_available("npx"):
        _, stdout, _ = run_command(["npx", "--yes", "eslint", "--format=json"] + files)
        if stdout.strip():
            try:
                _sev_map = {0: INFO, 1: MEDIUM, 2: HIGH}
                for file_result in json.loads(stdout):
                    for msg in file_result.get("messages", []):
                        findings.append(Finding(
                            file_path=file_result.get("filePath", ""),
                            start_line=msg.get("line", 0),
                            end_line=msg.get("endLine", msg.get("line", 0)),
                            severity=_sev_map.get(msg.get("severity", 0), INFO),
                            rule_id=msg.get("ruleId") or "eslint/unknown",
                            message=msg.get("message", ""),
                            category="code_smell",
                        ))
            except json.JSONDecodeError:
                pass

        # ── tsc ──
        if Path("tsconfig.json").exists():
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
    else:
        print("  [skip] npx not available")

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

    if _tool_available("dotnet"):
        # Collect unique .csproj directories
        csproj_dirs: set[str] = set()
        for f in files:
            for parent in Path(f).parents:
                if list(parent.glob("*.csproj")):
                    csproj_dirs.add(str(parent))
                    break

        if csproj_dirs:
            for proj_dir in csproj_dirs:
                _, stdout, stderr = run_command(
                    ["dotnet", "build", proj_dir, "--no-restore", "-v", "normal"]
                )
                for line in ((stdout or "") + (stderr or "")).split("\n"):
                    m = re.match(
                        r"\s*(.+?)\((\d+),(\d+)\):\s+(warning|error)\s+([A-Z]{2,}\d+):\s+(.+)",
                        line,
                    )
                    if m:
                        findings.append(Finding(
                            file_path=m.group(1).strip(),
                            start_line=int(m.group(2)),
                            end_line=int(m.group(2)),
                            severity=HIGH if m.group(4) == "error" else MEDIUM,
                            rule_id=m.group(5),
                            message=m.group(6).strip(),
                            category="bug" if m.group(4) == "error" else "code_smell",
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

    if _tool_available("phpstan"):
        _, stdout, _ = run_command(
            ["phpstan", "analyse", "--output-format=json", "--no-progress"] + files
        )
        if stdout.strip():
            try:
                for filepath, file_data in json.loads(stdout).get("files", {}).items():
                    for issue in file_data.get("messages", []):
                        level = issue.get("level", 0)
                        sev = HIGH if level >= 7 else MEDIUM if level >= 4 else LOW
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

    if _tool_available("phpcs"):
        _, stdout, _ = run_command(["phpcs", "--report=json"] + files)
        if stdout.strip():
            try:
                for filepath, file_data in json.loads(stdout).get("files", {}).items():
                    for msg in file_data.get("messages", []):
                        findings.append(Finding(
                            file_path=filepath,
                            start_line=msg.get("line", 0),
                            end_line=msg.get("line", 0),
                            severity=HIGH if msg.get("type") == "ERROR" else LOW,
                            rule_id=msg.get("source", "phpcs/unknown"),
                            message=msg.get("message", ""),
                            category="code_smell",
                        ))
            except json.JSONDecodeError:
                pass
    else:
        print("  [skip] phpcs not installed")

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

def run_semgrep(roots: list[str], ignore_patterns: list[str] | None = None) -> list[Finding]:
    """
    Semgrep security-audit + secrets rulesets.
    Returns list[Finding] (not just counts — findings feed affected_files).
    Retries with progressively simpler configs if the registry is unreachable.
    """
    if not _tool_available("semgrep"):
        print("  [skip] semgrep not installed")
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
        print(f"  [warn] Semgrep failed after all attempts (exit {code})")
        return []

    try:
        payload = json.loads(stdout or "{}")
    except json.JSONDecodeError as exc:
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

def generate_coverage_reports() -> None:
    """
    Auto-generate coverage reports if they don't exist.
    Detects project type and runs appropriate test commands with coverage.
    
    Supports:
    - Node.js/TypeScript: npm test:coverage or npm run test -- --coverage
    - Python: pytest --cov or coverage run -m pytest
    - Java: mvn test jacoco:report
    - C#/.NET: dotnet test /p:CollectCoverage=true
    """
    print("🧪 Checking for existing coverage reports...")
    
    # Quick check if any coverage reports exist
    existing_reports = [
        ".coverage",
        "coverage.xml",
        "coverage/coverage-final.json",
        "coverage-jest/coverage-jest.json",
        "coverage/.resultset.json",
        "coverage.out",
    ]
    
    if any(Path(p).exists() for p in existing_reports):
        print("   ✅ Coverage reports found, skipping generation")
        return
    
    print("   ⚠️ No coverage reports found, attempting to generate...")
    
    # Detect Node.js/TypeScript project
    if Path("package.json").exists():
        print("   📦 Detected Node.js/TypeScript project")
        try:
            # Try npm test:coverage first (common pattern)
            result = subprocess.run(
                ["npm", "test:coverage"],
                capture_output=True,
                timeout=180,
                cwd="."
            )
            if result.returncode == 0:
                print("      ✅ npm test:coverage succeeded")
                return
            else:
                print(f"      ⚠️ npm test:coverage failed, trying npm run test -- --coverage")
                # Fallback: npm test with coverage flag
                result = subprocess.run(
                    ["npm", "run", "test", "--", "--coverage"],
                    capture_output=True,
                    timeout=180,
                    cwd="."
                )
                if result.returncode == 0:
                    print("      ✅ npm test --coverage succeeded")
                    return
                else:
                    stderr = result.stderr.decode('utf-8', errors='ignore')[:300]
                    print(f"      ⚠️ npm test --coverage failed: {stderr}")
        except subprocess.TimeoutExpired:
            print("      ⚠️ npm test timed out (3 min limit)")
        except FileNotFoundError:
            print("      ⚠️ npm not found in PATH")
        except Exception as e:
            print(f"      ⚠️ Error running npm tests: {e}")
    
    # Detect Python project
    if Path("pytest.ini").exists() or Path("setup.py").exists() or Path("pyproject.toml").exists():
        print("   🐍 Detected Python project")
        try:
            result = subprocess.run(
                ["pytest", "--cov", "--cov-report=xml", "--cov-report=term"],
                capture_output=True,
                timeout=180,
                cwd="."
            )
            if result.returncode == 0:
                print("      ✅ pytest --cov succeeded")
                return
            else:
                stderr = result.stderr.decode('utf-8', errors='ignore')[:300]
                print(f"      ⚠️ pytest --cov failed: {stderr}")
        except FileNotFoundError:
            print("      ⚠️ pytest not found in PATH")
        except Exception as e:
            print(f"      ⚠️ Error running pytest: {e}")
    
    # Detect Java project
    if Path("pom.xml").exists():
        print("   ☕ Detected Java/Maven project")
        try:
            result = subprocess.run(
                ["mvn", "test", "jacoco:report"],
                capture_output=True,
                timeout=300,
                cwd="."
            )
            if result.returncode == 0:
                print("      ✅ mvn test jacoco:report succeeded")
                return
        except FileNotFoundError:
            print("      ⚠️ mvn not found in PATH")
        except Exception as e:
            print(f"      ⚠️ Error running mvn: {e}")
    
    # Detect .NET project
    if Path("*.csproj").exists() or Path("*.sln").exists():
        print("   🔷 Detected .NET project")
        try:
            result = subprocess.run(
                ["dotnet", "test", "/p:CollectCoverage=true", "/p:CoverletOutputFormat=opencover"],
                capture_output=True,
                timeout=300,
                cwd="."
            )
            if result.returncode == 0:
                print("      ✅ dotnet test with coverage succeeded")
                return
        except FileNotFoundError:
            print("      ⚠️ dotnet not found in PATH")
        except Exception as e:
            print(f"      ⚠️ Error running dotnet test: {e}")
    
    print("   ℹ️ Could not auto-generate coverage (no test framework detected)")


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
            "coverage/coverage-final.json",
            "coverage-jest/coverage-jest.json",
            "coverage/coverage-jest.json",
            "coverage.out",
            "coverage/.resultset.json",
        ]
        
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

    all_findings: list[Finding] = []

    if "python" in files_by_lang:
        print("  -> pylint + radon (Python)...")
        all_findings += run_python_analysis(files_by_lang["python"])

    ts_js = files_by_lang.get("typescript", []) + files_by_lang.get("javascript", [])
    if ts_js:
        print("  -> ESLint + tsc (TypeScript/JavaScript)...")
        all_findings += run_typescript_analysis(ts_js, roots)

    if "java" in files_by_lang:
        print("  -> PMD + Checkstyle (Java)...")
        all_findings += run_java_analysis(files_by_lang["java"])

    if "csharp" in files_by_lang:
        print("  -> dotnet build / Roslyn (C#)...")
        all_findings += run_csharp_analysis(files_by_lang["csharp"])

    if "go" in files_by_lang:
        print("  -> go vet + staticcheck (Go)...")
        all_findings += run_go_analysis(files_by_lang["go"], roots)

    if "ruby" in files_by_lang:
        print("  -> rubocop (Ruby)...")
        all_findings += run_ruby_analysis(files_by_lang["ruby"])

    if "php" in files_by_lang:
        print("  -> phpstan + phpcs (PHP)...")
        all_findings += run_php_analysis(files_by_lang["php"])

    if "cpp" in files_by_lang or "c" in files_by_lang:
        print("  -> cppcheck (C/C++)...")
        all_findings += run_cpp_analysis(
            files_by_lang.get("cpp", []) + files_by_lang.get("c", [])
        )

    if "kotlin" in files_by_lang:
        print("  -> detekt (Kotlin)...")
        all_findings += run_kotlin_analysis(files_by_lang["kotlin"], roots)

    print("  -> semgrep (security-audit + secrets, all languages)...")
    all_findings += run_semgrep(roots, ignore_patterns)

    print("  -> bandit (Python security)...")
    all_findings += run_bandit(roots, ignore_patterns)

    all_findings = [f for f in all_findings if not _is_ignored(f.file_path, ignore_patterns)]

    # ── Compute scores ──
    security_score    = _compute_score(all_findings, {"vulnerability", "hotspot"})
    reliability_score = _compute_score(all_findings, {"bug"})
    maintain_score    = _compute_score(all_findings, {"code_smell"})

    vulns    = len([f for f in all_findings if f.category == "vulnerability"])
    hotspots = len([f for f in all_findings if f.category == "hotspot"])
    smells   = len([f for f in all_findings if f.category == "code_smell"])
    bugs     = len([f for f in all_findings if f.category == "bug"])

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
        f"vulns={vulns} hotspots={hotspots} smells={smells} bugs={bugs} | "
        f"security={security_score} reliability={reliability_score} "
        f"maintainability={maintain_score}"
    )

    # Calculate real code coverage
    code_coverage = calculate_code_coverage()
    
    # Calculate duplication using jscpd or line-based detection
    duplication = calculate_duplication(roots, ignore_patterns)

    return {
        "reported_maintainability_score": maintain_score,
        "reported_security_score":        security_score,
        "reported_reliability_score":     reliability_score,
        "reported_code_smells":           smells,
        "reported_vulnerabilities":       vulns,
        "reported_security_hotspots":     hotspots,
        "reported_bugs":                  bugs,
        "reported_coverage":              code_coverage,
        "reported_duplication":           duplication,
        "affected_files":                 affected_files,
        "findings":                       all_findings,  # Include detailed findings for API submission
    }


def calculate_duplication(roots: list[str], ignore_patterns: list[str]) -> int:
    """
    Calculate code duplication using jscpd (if available) or fallback to line comparison.
    
    jscpd: Detects duplicated blocks (100+ tokens, any language)
    Fallback: Detects identical lines (>10 chars)
    
    Returns: Duplication percentage (0-100)
    """
    # Try jscpd first (best option, detects block duplicates like SonarQube)
    # Use npx to run jscpd without requiring global installation
    try:
        import subprocess
        import json
        
        # Try npx jscpd first (works if npm is available)
        result = subprocess.run(
            ["npx", "jscpd", "--json-report", ".", "--reporters", "json"],
            capture_output=True,
            timeout=30,
            cwd=roots[0] if roots else "."
        )
        
        if result.returncode == 0:
            try:
                data = json.loads(result.stdout.decode('utf-8'))
                if isinstance(data, dict) and 'duplicates' in data:
                    duplicated_lines = data.get('duplicatedLines', 0)
                    total_lines = data.get('totalLines', 1)
                    if total_lines > 0:
                        duplication = min(100, int((duplicated_lines / total_lines) * 100))
                        print(f"  ✅ npx jscpd detected {duplication}% duplication ({duplicated_lines}/{total_lines} lines)")
                        return duplication
            except (json.JSONDecodeError, KeyError) as e:
                print(f"  ⚠️ jscpd JSON parse error: {e}, falling back to line-based")
        else:
            # jscpd failed - log stderr for debugging
            stderr = result.stderr.decode('utf-8', errors='ignore') if result.stderr else "No error output"
            print(f"  ⚠️ npx jscpd failed (exit code {result.returncode})")
            if stderr.strip():
                print(f"     Error: {stderr[:200]}")  # Show first 200 chars of error
            print(f"     Falling back to line-based duplication detection...")
    except FileNotFoundError as e:
        print(f"  ⚠️ npx not found in PATH: {e}")
        print(f"     Ensure Node.js is installed. Falling back to line-based detection...")
    except subprocess.TimeoutExpired:
        print(f"  ⚠️ npx jscpd timed out (30s limit), falling back to line-based detection...")
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
        response = api_request(f"{base_url}/api/v1/analyses/{analysis_id}/iocs", "POST", token, payload)
        assert "id" in response, "Missing IOC ID in response"
        assert response.get("status") == "created", f"Expected status 'created', got {response.get('status')}"
        print("  ✅ CRITICAL IOC posted successfully")
        test_results["passed"] += 1
    except Exception as e:
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
        response = api_request(f"{base_url}/api/v1/analyses/{analysis_id}/iocs", "POST", token, payload)
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
        response = api_request(f"{base_url}/api/v1/analyses/{analysis_id}/iocs", "POST", token, payload)
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
    # providers is a list of strings like ["azure-devops", "github", "gitlab"]
    provider_ids = set(providers) if isinstance(providers, list) else {providers}
    if "azure-devops" not in provider_ids:
        print("Provider check failed: 'azure-devops' is not configured in platform")
        return 1

    api_request(
        f"{api_url.rstrip('/')}/api/v1/integrations/projects/{project_key}",
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

    # Auto-generate coverage reports if missing
    print("\n📊 Pre-flight: Coverage Report Generation")
    print("=" * 70)
    generate_coverage_reports()
    print()

    metrics_payload: dict = {}
    if sast_mode:
        try:
            metrics_payload = collect_real_sast_metrics()
        except Exception as exc:
            print(f"Real SAST scan failed: {exc}")
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
