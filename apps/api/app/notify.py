"""Notification dispatch — fire-and-forget, never blocks the API response."""

import json
import smtplib
import threading
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


def dispatch(quality_gate: str, context: dict) -> None:
    """Spawn a daemon thread to send notifications without delaying the caller."""
    t = threading.Thread(target=_dispatch_sync, args=(quality_gate, context), daemon=True)
    t.start()


def _dispatch_sync(quality_gate: str, context: dict) -> None:
    from app.db import SessionLocal
    from app.models import NotificationChannel

    session = SessionLocal()
    try:
        channels = session.query(NotificationChannel).filter(
            NotificationChannel.enabled.is_(True)
        ).all()
        for ch in channels:
            try:
                should_send = (
                    (quality_gate == "fail" and ch.on_fail)
                    or (quality_gate == "pass" and ch.on_pass)
                )
                if not should_send:
                    continue
                cfg = json.loads(ch.config or "{}")
                if ch.channel_type == "webhook":
                    _send_webhook(cfg.get("url", ""), quality_gate, context)
                elif ch.channel_type == "email":
                    _send_email(cfg, quality_gate, context)
            except Exception as exc:
                print(f"[notify] channel {ch.id} ({ch.name}) failed: {exc}")
    finally:
        session.close()


def send_test(channel_type: str, config: dict) -> str:
    """Send a test notification synchronously. Returns 'ok' or an error message."""
    context = {
        "project_key": "test-project",
        "branch": "main",
        "commit_sha": "abc12345",
        "vulnerabilities": 3,
        "bugs": 1,
        "code_smells": 12,
        "gate_failures": ["Too many vulnerabilities (3 > 0)"],
        "analysis_id": "test-00000000",
    }
    try:
        if channel_type == "webhook":
            _send_webhook(config.get("url", ""), "fail", context)
        elif channel_type == "email":
            _send_email(config, "fail", context)
        return "ok"
    except Exception as exc:
        return str(exc)


# ── Teams detection & Adaptive Card builder ────────────────────────────────────

_TEAMS_URL_PATTERNS = (
    "webhook.office.com",
    "outlook.office.com/webhook",
    "logic.azure.com",
    "flow.microsoft.com",
    "azure.com/workflows",
)


def _is_teams_url(url: str) -> bool:
    lower = url.lower()
    return any(p in lower for p in _TEAMS_URL_PATTERNS)


def _build_teams_payload(quality_gate: str, context: dict) -> dict:
    """Adaptive Card payload — rendered natively by Teams Workflows and legacy connectors."""
    is_fail = quality_gate == "fail"
    icon = "🔴" if is_fail else "🟢"
    title = f"{icon} Quality Gate {'FAILED' if is_fail else 'PASSED'}"
    color = "Attention" if is_fail else "Good"

    facts = [
        {"title": "Project", "value": str(context.get("project_key", ""))},
        {"title": "Branch",  "value": str(context.get("branch", ""))},
        {"title": "Commit",  "value": str(context.get("commit_sha", ""))[:8]},
        {"title": "Vulnerabilities", "value": str(context.get("vulnerabilities", 0))},
        {"title": "Bugs",            "value": str(context.get("bugs", 0))},
        {"title": "Code smells",     "value": str(context.get("code_smells", 0))},
    ]

    body: list = [
        {"type": "TextBlock", "text": title, "size": "Large", "weight": "Bolder",
         "color": color, "wrap": True},
        {"type": "FactSet", "facts": facts},
    ]

    failures = context.get("gate_failures", [])
    if failures:
        lines = "\n".join(f"• {f}" for f in failures[:8])
        body.append({
            "type": "TextBlock",
            "text": f"**Gate failures:**\n{lines}",
            "wrap": True,
            "color": "Attention",
            "spacing": "Medium",
        })

    return {
        "type": "message",
        "attachments": [{
            "contentType": "application/vnd.microsoft.card.adaptive",
            "contentUrl": None,
            "content": {
                "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                "type": "AdaptiveCard",
                "version": "1.4",
                "body": body,
            },
        }],
    }


# ── Senders ────────────────────────────────────────────────────────────────────

def _send_webhook(url: str, quality_gate: str, context: dict) -> None:
    import urllib.request
    if not url:
        raise ValueError("Webhook URL is empty")

    if _is_teams_url(url):
        payload_dict = _build_teams_payload(quality_gate, context)
    else:
        payload_dict = {**context, "event": f"quality_gate.{quality_gate}", "quality_gate": quality_gate}

    payload = json.dumps(payload_dict).encode()
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json", "User-Agent": "SAST-Platform/1.0"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        if resp.status >= 400:
            raise ValueError(f"Webhook returned HTTP {resp.status}")


def _send_email(cfg: dict, quality_gate: str, context: dict) -> None:
    smtp_host = cfg.get("smtp_host", "")
    smtp_port = int(cfg.get("smtp_port", 587))
    smtp_user = cfg.get("smtp_user", "")
    smtp_password = cfg.get("smtp_password", "")
    smtp_from = cfg.get("smtp_from", smtp_user)
    to_email = cfg.get("to_email", "")

    if not smtp_host:
        raise ValueError("smtp_host is not configured")
    if not to_email:
        raise ValueError("to_email is not configured")

    icon = "❌" if quality_gate == "fail" else "✅"
    status_label = "FAILED" if quality_gate == "fail" else "PASSED"
    subject = f"[SAST] Quality Gate {status_label} {icon} — {context['project_key']} / {context['branch']}"

    failures_html = ""
    if context.get("gate_failures"):
        items = "".join(f"<li>{f}</li>" for f in context["gate_failures"][:10])
        failures_html = f"<p><strong>Failures:</strong></p><ul>{items}</ul>"

    body_html = f"""
<html><body style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
  <h2 style="color:{'#e74c3c' if quality_gate=='fail' else '#27ae60'}">{icon} Quality Gate {status_label}</h2>
  <table style="border-collapse:collapse;width:100%">
    <tr><td style="padding:6px;border:1px solid #ddd"><strong>Project</strong></td><td style="padding:6px;border:1px solid #ddd">{context['project_key']}</td></tr>
    <tr><td style="padding:6px;border:1px solid #ddd"><strong>Branch</strong></td><td style="padding:6px;border:1px solid #ddd">{context['branch']}</td></tr>
    <tr><td style="padding:6px;border:1px solid #ddd"><strong>Commit</strong></td><td style="padding:6px;border:1px solid #ddd">{context['commit_sha']}</td></tr>
    <tr><td style="padding:6px;border:1px solid #ddd"><strong>Vulnerabilities</strong></td><td style="padding:6px;border:1px solid #ddd">{context.get('vulnerabilities', 0)}</td></tr>
    <tr><td style="padding:6px;border:1px solid #ddd"><strong>Bugs</strong></td><td style="padding:6px;border:1px solid #ddd">{context.get('bugs', 0)}</td></tr>
    <tr><td style="padding:6px;border:1px solid #ddd"><strong>Code smells</strong></td><td style="padding:6px;border:1px solid #ddd">{context.get('code_smells', 0)}</td></tr>
  </table>
  {failures_html}
  <p style="color:#666;font-size:12px;margin-top:24px">Sent by SAST Platform</p>
</body></html>"""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = smtp_from
    msg["To"] = to_email
    msg.attach(MIMEText(body_html, "html"))

    with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
        server.ehlo()
        server.starttls()
        if smtp_user and smtp_password:
            server.login(smtp_user, smtp_password)
        server.sendmail(smtp_from, [to_email], msg.as_string())
