#!/usr/bin/env python3
"""Small, localhost-only process connector for a user-owned decision service.

The connector deliberately owns only the child process it starts.  It exposes a
small JSON/HTTP protocol for the web application; model credentials and model
files stay on the local machine and are never forwarded to a browser.
"""

from __future__ import annotations

import argparse
import json
import os
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
import uuid
from dataclasses import dataclass, field
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Optional
from urllib.parse import parse_qs, urlparse


PROTOCOL_VERSION = "0.1"
DEFAULT_PORT = 8791
MAX_BODY_BYTES = 64 * 1024


def json_bytes(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")


def error_body(code: str, message: str, *, retryable: bool = False, **details: Any) -> dict[str, Any]:
    return {"error": {"code": code, "message": message, "retryable": retryable, **details}}


@dataclass
class Run:
    run_id: str
    text: str
    status: str = "queued"
    result: Optional[dict[str, Any]] = None
    error: Optional[dict[str, Any]] = None
    created_at: float = field(default_factory=time.time)
    finished_at: Optional[float] = None

    def as_dict(self) -> dict[str, Any]:
        value: dict[str, Any] = {
            "runId": self.run_id,
            "status": self.status,
            "createdAt": self.created_at,
        }
        if self.result is not None:
            value["result"] = self.result
        if self.error is not None:
            value["error"] = self.error
        if self.finished_at is not None:
            value["finishedAt"] = self.finished_at
        return value


@dataclass
class Download:
    task_id: str
    model_id: str
    total: int
    path: Path
    status: str = "queued"
    completed: int = 0
    error: Optional[str] = None
    cancel_event: threading.Event = field(default_factory=threading.Event)

    def as_dict(self, root: Path) -> dict[str, Any]:
        try:
            display_path = self.path.relative_to(root).as_posix()
        except ValueError:
            display_path = self.path.name
        return {
            "taskId": self.task_id,
            "modelId": self.model_id,
            "status": self.status,
            "bytesTotal": self.total,
            "bytesDownloaded": self.completed,
            "displayPath": display_path,
            **({"error": self.error} if self.error else {}),
        }


class ConnectorState:
    """In-memory session state.  A new connector process gets a new owner."""

    def __init__(
        self,
        data_dir: Path,
        provider_command: Optional[list[str]] = None,
        provider_port: Optional[int] = None,
        model_source_dir: Optional[Path] = None,
        model_catalog: Optional[list[dict[str, Any]]] = None,
    ) -> None:
        self.lock = threading.RLock()
        self.data_dir = data_dir.resolve()
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.model_source_dir = (model_source_dir or self.data_dir / "sources").resolve()
        self.provider_command = provider_command or [sys.executable, str(Path(__file__).with_name("mock_provider.py"))]
        self.provider_port = provider_port
        self.session_id = uuid.uuid4().hex
        self.token = secrets.token_urlsafe(32)
        self.process: Optional[subprocess.Popen[str]] = None
        self.reader_thread: Optional[threading.Thread] = None
        self.monitor_thread: Optional[threading.Thread] = None
        self.provider_state = "offline"
        self.provider_error: Optional[dict[str, Any]] = None
        self.started_at: Optional[float] = None
        self.runs: dict[str, Run] = {}
        self.downloads: dict[str, Download] = {}
        self.model_catalog = model_catalog or [
            {
                "id": "mock-decision",
                "label": "Built-in decision protocol fixture",
                "sizeBytes": 0,
                "source": None,
                "path": "models/mock-decision",
            }
        ]

    def _provider_env(self) -> dict[str, str]:
        # Do not pass the caller's environment wholesale.  In particular this
        # prevents API keys and OAuth tokens from reaching a child by accident.
        env = {"PATH": os.environ.get("PATH", ""), "PYTHONIOENCODING": "utf-8"}
        if self.provider_port is not None:
            env["VIVIC_PROVIDER_PORT"] = str(self.provider_port)
        return env

    def _port_is_free(self) -> bool:
        if self.provider_port is None:
            return True
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(0.15)
            return sock.connect_ex(("127.0.0.1", self.provider_port)) != 0

    def _set_provider_error(self, code: str, message: str, *, retryable: bool = True) -> None:
        self.provider_state = "error"
        self.provider_error = {"code": code, "message": message, "retryable": retryable}

    def start(self) -> tuple[bool, dict[str, Any]]:
        with self.lock:
            if self.process is not None and self.process.poll() is None:
                return False, error_body("ALREADY_RUNNING", "该连接器只允许一个由本会话启动的决策服务", retryable=False)
            if not self._port_is_free():
                self._set_provider_error("PORT_OCCUPIED", "决策服务端口已被其他程序占用", retryable=True)
                return False, error_body("PORT_OCCUPIED", "决策服务端口已被其他程序占用", retryable=True, port=self.provider_port)
            try:
                kwargs: dict[str, Any] = {
                    "stdin": subprocess.PIPE,
                    "stdout": subprocess.PIPE,
                    "stderr": subprocess.PIPE,
                    "text": True,
                    "encoding": "utf-8",
                    "bufsize": 1,
                    "env": self._provider_env(),
                }
                if os.name == "nt":
                    kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
                else:
                    kwargs["start_new_session"] = True
                self.process = subprocess.Popen(self.provider_command, **kwargs)
            except (OSError, ValueError) as exc:
                self.process = None
                self._set_provider_error("PROVIDER_START_FAILED", "无法启动本地决策服务", retryable=True)
                return False, error_body("PROVIDER_START_FAILED", "无法启动本地决策服务", retryable=True, detail=str(exc))
            self.provider_state = "starting"
            self.provider_error = None
            self.started_at = time.time()
            process = self.process
            self.reader_thread = threading.Thread(target=self._read_provider, args=(process,), daemon=True)
            self.reader_thread.start()
            threading.Thread(target=self._drain_stderr, args=(process,), daemon=True).start()
            self.monitor_thread = threading.Thread(target=self._monitor_provider, args=(process,), daemon=True)
            self.monitor_thread.start()
            return True, self.health()

    @staticmethod
    def _drain_stderr(process: subprocess.Popen[str]) -> None:
        # A noisy provider must not block on a full stderr pipe.  Diagnostics
        # stay local and are intentionally not forwarded to the browser.
        if process.stderr is not None:
            try:
                for _ in process.stderr:
                    pass
            except (OSError, ValueError):
                pass
            finally:
                try:
                    process.stderr.close()
                except OSError:
                    pass

    def _read_provider(self, process: subprocess.Popen[str]) -> None:
        assert process.stdout is not None
        try:
            for line in process.stdout:
                try:
                    message = json.loads(line)
                except json.JSONDecodeError:
                    continue
                with self.lock:
                    if message.get("event") == "ready" and process is self.process:
                        self.provider_state = "ready"
                        continue
                    run_id = message.get("runId")
                    run = self.runs.get(run_id)
                    if run is None or process is not self.process or run.status == "canceled":
                        continue
                    if message.get("event") == "result":
                        run.status = "completed"
                        run.result = message.get("result")
                        run.finished_at = time.time()
                    elif message.get("event") == "error":
                        run.status = "failed"
                        run.error = {"code": message.get("code", "PROVIDER_ERROR"), "message": message.get("message", "决策服务返回错误")}
                        run.finished_at = time.time()
        except (OSError, ValueError):
            # The owner may close the pipe while stopping the child.
            pass
        finally:
            try:
                process.stdout.close()
            except OSError:
                pass

    def _monitor_provider(self, process: subprocess.Popen[str]) -> None:
        code = process.wait()
        # stdout/stderr are closed by their reader threads; close stdin here
        # after the child has exited so no pipe remains open on abnormal exit.
        if process.stdin is not None:
            try:
                process.stdin.close()
            except OSError:
                pass
        with self.lock:
            if process is not self.process:
                return
            self.process = None
            for run in self.runs.values():
                if run.status in {"queued", "running"}:
                    run.status = "failed"
                    run.error = {"code": "PROVIDER_EXITED", "message": "本地决策服务异常退出", "exitCode": code}
                    run.finished_at = time.time()
            if self.provider_state not in {"stopping", "offline"}:
                self._set_provider_error("PROVIDER_EXITED", "本地决策服务异常退出", retryable=True)
            else:
                self.provider_state = "offline"

    def stop(self) -> tuple[bool, dict[str, Any]]:
        with self.lock:
            process = self.process
            if process is None or process.poll() is not None:
                self.process = None
                self.provider_state = "offline"
                return False, error_body("NOT_RUNNING", "没有由本会话启动的决策服务", retryable=False)
            self.provider_state = "stopping"
            for run in self.runs.values():
                if run.status in {"queued", "running"}:
                    run.status = "canceled"
                    run.finished_at = time.time()
            self._terminate_owned(process)
            self.process = None
            self.provider_state = "offline"
            return True, self.health()

    @staticmethod
    def _close_streams(process: subprocess.Popen[str]) -> None:
        for stream in (process.stdin, process.stdout, process.stderr):
            if stream is not None:
                try:
                    stream.close()
                except OSError:
                    pass

    @staticmethod
    def _terminate_owned(process: subprocess.Popen[str]) -> None:
        # The Popen handle is the ownership proof; no name/port based kill is used.
        try:
            if os.name == "nt":
                # /T is limited to this Popen PID's process tree.  It avoids
                # leaving a provider grandchild behind while never selecting
                # an unrelated process by name or by port.
                try:
                    subprocess.run(
                        ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                        check=False,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                    )
                except OSError:
                    process.terminate()
            else:
                os.killpg(process.pid, signal.SIGTERM)
            process.wait(timeout=2)
        except (OSError, subprocess.TimeoutExpired):
            try:
                process.kill()
                process.wait(timeout=1)
            except (OSError, subprocess.TimeoutExpired):
                pass
        ConnectorState._close_streams(process)

    def reconnect(self) -> tuple[bool, dict[str, Any]]:
        with self.lock:
            process = self.process
        if process is not None and process.poll() is None:
            self.stop()
        return self.start()

    def decide(self, text: str) -> tuple[bool, dict[str, Any]]:
        if not isinstance(text, str) or not text.strip() or len(text) > 4000:
            return False, error_body("INVALID_INPUT", "text 必须是 1–4000 字符", retryable=False)
        with self.lock:
            process = self.process
            if process is None or process.poll() is not None or self.provider_state != "ready":
                return False, error_body("OFFLINE", "本地决策服务不可用；文字主链路可以继续使用 LLM", retryable=True, textPathAvailable=True)
            run = Run(run_id=uuid.uuid4().hex, text=text, status="running")
            self.runs[run.run_id] = run
            try:
                assert process.stdin is not None
                process.stdin.write(json.dumps({"op": "decide", "runId": run.run_id, "text": text}, ensure_ascii=False) + "\n")
                process.stdin.flush()
            except (BrokenPipeError, OSError):
                run.status = "failed"
                run.error = {"code": "PROVIDER_UNAVAILABLE", "message": "本地决策服务连接已断开"}
                run.finished_at = time.time()
                return False, error_body("PROVIDER_UNAVAILABLE", "本地决策服务连接已断开", retryable=True, textPathAvailable=True)
            return True, {"run": run.as_dict()}

    def cancel(self, run_id: str) -> tuple[bool, dict[str, Any]]:
        with self.lock:
            run = self.runs.get(run_id)
            if run is None:
                return False, error_body("RUN_NOT_FOUND", "找不到该决策请求", retryable=False)
            if run.status in {"completed", "failed", "canceled"}:
                return True, {"run": run.as_dict()}
            run.status = "canceled"
            run.finished_at = time.time()
            if self.process is not None and self.process.stdin is not None:
                try:
                    self.process.stdin.write(json.dumps({"op": "cancel", "runId": run_id}) + "\n")
                    self.process.stdin.flush()
                except OSError:
                    pass
            return True, {"run": run.as_dict()}

    def health(self) -> dict[str, Any]:
        with self.lock:
            alive = self.process is not None and self.process.poll() is None
            return {
                "protocolVersion": PROTOCOL_VERSION,
                "sessionId": self.session_id,
                "provider": {"state": self.provider_state, "alive": alive, "error": self.provider_error},
                "startedAt": self.started_at,
                "textPathAvailable": True,
            }

    def capabilities(self) -> dict[str, Any]:
        return {
            "protocolVersion": PROTOCOL_VERSION,
            "transport": "http-json-loopback",
            "bind": "127.0.0.1",
            "sessionOwned": True,
            "capabilities": [
                {"id": "decision", "operations": ["health", "start", "stop", "reconnect", "decide", "cancel"]},
                {"id": "model-download", "operations": ["list", "start", "cancel"]},
            ],
        }

    def models(self) -> list[dict[str, Any]]:
        result = []
        for item in self.model_catalog:
            path = self.data_dir / str(item.get("path", f"models/{item['id']}"))
            result.append({
                "id": item["id"],
                "label": item.get("label", item["id"]),
                "sizeBytes": int(item.get("sizeBytes", 0)),
                "displayPath": path.relative_to(self.data_dir).as_posix(),
                "downloadable": bool(item.get("source")),
                "downloaded": path.exists(),
            })
        return result

    def start_download(self, model_id: str) -> tuple[bool, dict[str, Any]]:
        item = next((entry for entry in self.model_catalog if entry.get("id") == model_id), None)
        if item is None:
            return False, error_body("MODEL_NOT_FOUND", "未知模型", retryable=False)
        source_value = item.get("source")
        if not source_value:
            return False, error_body("MODEL_SOURCE_UNCONFIGURED", "模型未配置下载源；不会自动下载", retryable=False)
        source = (self.model_source_dir / str(source_value)).resolve()
        try:
            source.relative_to(self.model_source_dir)
        except ValueError:
            return False, error_body("MODEL_SOURCE_OUTSIDE_ROOT", "模型下载源必须位于受控本地目录", retryable=False)
        if not source.is_file():
            return False, error_body("MODEL_SOURCE_MISSING", "模型下载源不存在", retryable=True)
        with self.lock:
            if any(task.model_id == model_id and task.status in {"queued", "downloading"} for task in self.downloads.values()):
                return False, error_body("DOWNLOAD_ALREADY_RUNNING", "该模型已有下载任务", retryable=False)
            destination = (self.data_dir / str(item.get("path", f"models/{model_id}"))).resolve()
            try:
                destination.relative_to(self.data_dir)
            except ValueError:
                return False, error_body("MODEL_PATH_INVALID", "模型路径必须位于受控目录", retryable=False)
            destination.parent.mkdir(parents=True, exist_ok=True)
            task = Download(uuid.uuid4().hex, model_id, source.stat().st_size, destination)
            self.downloads[task.task_id] = task
            threading.Thread(target=self._copy_model, args=(task, source), daemon=True).start()
            return True, {"download": task.as_dict(self.data_dir)}

    def _copy_model(self, task: Download, source: Path) -> None:
        temporary = task.path.with_suffix(task.path.suffix + ".part")
        with self.lock:
            task.status = "downloading"
        try:
            with source.open("rb") as src, temporary.open("wb") as dst:
                while True:
                    if task.cancel_event.is_set():
                        raise InterruptedError
                    chunk = src.read(1024 * 1024)
                    if not chunk:
                        break
                    dst.write(chunk)
                    with self.lock:
                        task.completed += len(chunk)
                    time.sleep(0.001)
            temporary.replace(task.path)
            with self.lock:
                task.status = "completed"
        except InterruptedError:
            temporary.unlink(missing_ok=True)
            with self.lock:
                task.status = "canceled"
        except OSError as exc:
            temporary.unlink(missing_ok=True)
            with self.lock:
                task.status = "failed"
                task.error = str(exc)

    def cancel_download(self, task_id: str) -> tuple[bool, dict[str, Any]]:
        with self.lock:
            task = self.downloads.get(task_id)
            if task is None:
                return False, error_body("DOWNLOAD_NOT_FOUND", "找不到该下载任务", retryable=False)
            if task.status in {"queued", "downloading"}:
                task.cancel_event.set()
            return True, {"download": task.as_dict(self.data_dir)}


class ConnectorHandler(BaseHTTPRequestHandler):
    server: "ConnectorHTTPServer"
    protocol_version = "HTTP/1.1"

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A003
        # Do not log authorization headers, request bodies, or user text.
        return

    @property
    def state(self) -> ConnectorState:
        return self.server.state

    def _send(self, status: int, body: dict[str, Any]) -> None:
        payload = json_bytes(body)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def _read_json(self) -> tuple[Optional[dict[str, Any]], Optional[dict[str, Any]]]:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return None, error_body("INVALID_BODY", "Content-Length 无效", retryable=False)
        if length > MAX_BODY_BYTES:
            return None, error_body("BODY_TOO_LARGE", "请求体过大", retryable=False)
        try:
            raw = self.rfile.read(length)
            value = json.loads(raw.decode("utf-8")) if raw else {}
        except (UnicodeDecodeError, json.JSONDecodeError):
            return None, error_body("INVALID_JSON", "请求体必须是 JSON", retryable=False)
        if not isinstance(value, dict):
            return None, error_body("INVALID_JSON", "请求体必须是 JSON 对象", retryable=False)
        return value, None

    def _auth(self) -> bool:
        if self.headers.get("Authorization") != f"Bearer {self.state.token}":
            self._send(HTTPStatus.UNAUTHORIZED, error_body("UNAUTHORIZED", "需要本地会话凭据", retryable=False))
            return False
        return True

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path == "/healthz":
            self._send(HTTPStatus.OK, {"ok": True, "protocolVersion": PROTOCOL_VERSION})
            return
        if not self._auth():
            return
        if path == "/v1/health":
            self._send(HTTPStatus.OK, self.state.health())
        elif path == "/v1/capabilities":
            self._send(HTTPStatus.OK, self.state.capabilities())
        elif path == "/v1/models":
            self._send(HTTPStatus.OK, {"models": self.state.models()})
        elif path.startswith("/v1/runs/"):
            run = self.state.runs.get(path.rsplit("/", 1)[-1])
            self._send(HTTPStatus.OK if run else HTTPStatus.NOT_FOUND, {"run": run.as_dict()} if run else error_body("RUN_NOT_FOUND", "找不到该决策请求"))
        elif path.startswith("/v1/downloads/"):
            task = self.state.downloads.get(path.rsplit("/", 1)[-1])
            self._send(HTTPStatus.OK if task else HTTPStatus.NOT_FOUND, {"download": task.as_dict(self.state.data_dir)} if task else error_body("DOWNLOAD_NOT_FOUND", "找不到该下载任务"))
        else:
            self._send(HTTPStatus.NOT_FOUND, error_body("NOT_FOUND", "未知端点", retryable=False))

    def do_POST(self) -> None:  # noqa: N802
        if not self._auth():
            return
        path = urlparse(self.path).path
        body, body_error = self._read_json()
        if body_error:
            self._send(HTTPStatus.BAD_REQUEST, body_error)
            return
        assert body is not None
        if path == "/v1/service/start":
            ok, response = self.state.start()
            self._send(HTTPStatus.OK if ok else HTTPStatus.CONFLICT, response)
        elif path == "/v1/service/stop":
            ok, response = self.state.stop()
            self._send(HTTPStatus.OK if ok else HTTPStatus.CONFLICT, response)
        elif path == "/v1/service/reconnect":
            ok, response = self.state.reconnect()
            self._send(HTTPStatus.OK if ok else HTTPStatus.CONFLICT, response)
        elif path == "/v1/decide":
            ok, response = self.state.decide(body.get("text"))
            self._send(HTTPStatus.ACCEPTED if ok else (HTTPStatus.SERVICE_UNAVAILABLE if response.get("error", {}).get("code") in {"OFFLINE", "PROVIDER_UNAVAILABLE"} else HTTPStatus.BAD_REQUEST), response)
        elif path.startswith("/v1/runs/") and path.endswith("/cancel"):
            ok, response = self.state.cancel(path.split("/")[-2])
            self._send(HTTPStatus.OK if ok else HTTPStatus.NOT_FOUND, response)
        elif path == "/v1/models/download":
            ok, response = self.state.start_download(body.get("modelId"))
            self._send(HTTPStatus.ACCEPTED if ok else HTTPStatus.CONFLICT, response)
        elif path.startswith("/v1/downloads/") and path.endswith("/cancel"):
            ok, response = self.state.cancel_download(path.split("/")[-2])
            self._send(HTTPStatus.OK if ok else HTTPStatus.NOT_FOUND, response)
        else:
            self._send(HTTPStatus.NOT_FOUND, error_body("NOT_FOUND", "未知端点", retryable=False))


class ConnectorHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = False

    def __init__(self, address: tuple[str, int], state: ConnectorState):
        super().__init__(address, ConnectorHandler)
        self.state = state

    def server_close(self) -> None:
        # Closing the HTTP server is also a lifecycle boundary.  This keeps a
        # provider from surviving a test runner or embedding host shutdown.
        state = getattr(self, "state", None)
        if state is not None:
            state.stop()
        super().server_close()


def run_server(args: argparse.Namespace) -> int:
    provider_command = args.provider_command or None
    state = ConnectorState(
        Path(args.data_dir),
        provider_command=provider_command,
        provider_port=args.provider_port,
        model_source_dir=Path(args.model_source_dir) if args.model_source_dir else None,
    )
    try:
        server = ConnectorHTTPServer(("127.0.0.1", args.port), state)
    except OSError as exc:
        print(json.dumps(error_body("PORT_OCCUPIED", "连接器端口已被占用", retryable=True, port=args.port), ensure_ascii=False), file=sys.stderr)
        return 2
    print(json.dumps({"ready": True, "port": server.server_port, "sessionId": state.session_id, "token": state.token}, ensure_ascii=False), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        state.stop()
        server.server_close()
    return 0


def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Vivic local decision connector")
    sub = parser.add_subparsers(dest="command", required=True)
    serve = sub.add_parser("serve", help="start the localhost connector")
    serve.add_argument("--port", type=int, default=DEFAULT_PORT)
    serve.add_argument("--data-dir", default=str(Path.home() / ".vivic" / "connector"))
    serve.add_argument("--model-source-dir")
    serve.add_argument("--provider-port", type=int)
    serve.add_argument("--provider-command", nargs=argparse.REMAINDER, help="command after --provider-command")
    return parser.parse_args(argv)


if __name__ == "__main__":
    arguments = parse_args()
    raise SystemExit(run_server(arguments))
