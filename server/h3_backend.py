"""H3 Studio backend for Colab.

Serves the built WebUI, reverse-proxies ComfyUI (HTTP + WebSocket), and exposes a
small /h3 API that the notebook hooks into (job runner, LoRA store, setup, logs).

Usage (from the notebook):

    import h3_backend
    handle = h3_backend.start(port=8000, hooks={...})
    ...
    handle.stop()

Hook contract (all optional except make_job/log_tail):

    dist_dir        str   directory with the built WebUI (index.html + assets/)
    comfy_url       str   default "http://127.0.0.1:8188"
    output_dir      str   ComfyUI output dir (served via /h3/output?file=<rel>)
    make_job        fn(payload, update, cancel_event) -> {"video_file": path|None, ...}
    list_loras      fn() -> [names]           (first entry should be "off")
    download_lora   fn(url) -> name           (raise on failure)
    log_tail        fn() -> str               (ComfyUI log tail)
    setup_state     fn() -> {flag: bool}
    apply_setup     fn({flag: bool}) -> [(label, state), ...]
    install_sage    fn() -> [(label, state), ...]
    stage_upload    fn(filename, bytes) -> stored path string
"""

from __future__ import annotations

import asyncio
import queue
import threading
import time
import uuid
from pathlib import Path

from aiohttp import ClientSession, ClientTimeout, WSMsgType, web

HOP_HEADERS = {"connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
               "te", "trailers", "transfer-encoding", "upgrade"}
JOB_KEEP = 30


def _now():
    return time.time()


class Hub:
    """In-memory job store + single worker thread (the GPU runs one job at a time)."""

    def __init__(self, hooks):
        self.hooks = hooks
        self.lock = threading.Lock()
        self.jobs = []
        self.queue = queue.Queue()
        self.worker = threading.Thread(target=self._run, daemon=True)
        self.stopped = threading.Event()
        self.worker.start()

    def submit(self, payload):
        job = {
            "id": uuid.uuid4().hex[:12],
            "payload": dict(payload),
            "status": "queued",
            "stage": "queued",
            "progress": None,
            "label": payload.get("label") or "render",
            "seed": payload.get("seed"),
            "steps": payload.get("steps"),
            "frames": payload.get("frames"),
            "dims": payload.get("dims"),
            "warnings": [],
            "error": None,
            "video": None,
            "log_tail": "",
            "queued_at": _now(),
            "started_at": None,
            "finished_at": None,
            "cancel_requested": False,
            "cancel_event": threading.Event(),
        }
        with self.lock:
            self.jobs.insert(0, job)
            del self.jobs[JOB_KEEP:]
        self.queue.put(job["id"])
        return job

    def get(self, job_id):
        with self.lock:
            for job in self.jobs:
                if job["id"] == job_id:
                    return job
        return None

    def running_id(self):
        with self.lock:
            for job in self.jobs:
                if job["status"] == "running":
                    return job["id"]
        return None

    def queued_count(self):
        with self.lock:
            return sum(1 for job in self.jobs if job["status"] == "queued")

    def cancel(self, job_id):
        job = self.get(job_id)
        if job is None:
            return False
        job["cancel_requested"] = True
        job["cancel_event"].set()
        if job["status"] == "queued":
            job["status"] = "cancelled"
            job["stage"] = "cancelled"
            job["finished_at"] = _now()
        return True

    def _run(self):
        while not self.stopped.is_set():
            try:
                job_id = self.queue.get(timeout=0.5)
            except queue.Empty:
                continue
            job = self.get(job_id)
            if job is None or job["status"] != "queued":
                continue

            def update(_job=job, **fields):
                with self.lock:
                    _job.update(fields)

            with self.lock:
                job["status"] = "running"
                job["stage"] = "starting"
                job["started_at"] = _now()
            try:
                result = self.hooks["make_job"](job.get("payload") or {}, update,
                                                job["cancel_event"]) or {}
                with self.lock:
                    job["finished_at"] = _now()
                    if job["cancel_requested"]:
                        job["status"] = "cancelled"
                        job["stage"] = "cancelled"
                    else:
                        job["status"] = "done"
                        job["stage"] = "done"
                        job["video"] = result.get("video")
                        job["progress"] = 1.0
                        meta = result.get("meta") or {}
                        job.update({k: v for k, v in meta.items()
                                    if k not in ("id", "status", "payload",
                                                 "cancel_event")})
                        warnings = result.get("warnings")
                        if warnings:
                            job["warnings"] = list(warnings)
            except Exception as exc:  # noqa: BLE001 - surface everything to the UI
                with self.lock:
                    job["finished_at"] = _now()
                    job["status"] = ("cancelled" if job["cancel_requested"]
                                     else "failed")
                    job["stage"] = job["status"]
                    job["error"] = "%s: %s" % (type(exc).__name__, str(exc)[:600])
            finally:
                job["cancel_event"] = threading.Event()

    def stop(self):
        self.stopped.set()


def _job_public(job):
    public = {k: v for k, v in job.items()
              if k not in ("cancel_event", "cancel_requested", "payload")}
    if job.get("started_at"):
        end = job.get("finished_at") or _now()
        public["elapsed_s"] = round(end - job["started_at"], 1)
    public["queued_s"] = round((job.get("started_at") or _now()) - job["queued_at"], 1)
    public["log_tail"] = (job.get("log_tail") or "")[-4000:]
    return public


def build_app(hooks):
    dist = Path(hooks["dist_dir"]).resolve()
    comfy = hooks.get("comfy_url", "http://127.0.0.1:8188").rstrip("/")
    comfy_ws = comfy.replace("https://", "wss://").replace("http://", "ws://") + "/ws"
    output_dir = Path(hooks["output_dir"]).resolve() if hooks.get("output_dir") else None
    hub = Hub(hooks)
    app = web.Application(client_max_size=256 * 1024 * 1024)
    app["hub"] = hub

    async def on_startup(_app):
        _app["session"] = ClientSession(auto_decompress=False)

    async def on_cleanup(_app):
        await _app["session"].close()
        hub.stop()

    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)

    def session(request):
        return request.app["session"]

    async def comfy_json(request, path, timeout=4):
        try:
            async with session(request).get(comfy + path,
                                            timeout=ClientTimeout(total=timeout)) as response:
                return await response.json(content_type=None)
        except Exception:
            return None

    async def status(request):
        stats = await comfy_json(request, "/system_stats")
        payload = {
            "backend": True,
            "comfy": stats is not None,
            "running": hub.running_id(),
            "queued": hub.queued_count(),
        }
        if stats:
            devices = stats.get("devices") or [{}]
            gpu = devices[0] if devices else {}
            payload.update({
                "version": (stats.get("system") or {}).get("comfyui_version", "?"),
                "vram_free_mib": round((gpu.get("vram_free") or 0) / 2**20),
                "vram_total_mib": round((gpu.get("vram_total") or 0) / 2**20),
                "device": gpu.get("name"),
            })
        return web.json_response(payload)

    async def jobs(request):
        with hub.lock:
            listing = [_job_public(job) for job in hub.jobs]
        return web.json_response({"jobs": listing})

    async def generate(request):
        try:
            payload = await request.json()
        except Exception:
            return web.json_response({"error": "invalid json"}, status=400)
        if not (payload.get("prompt") or "").strip():
            return web.json_response({"error": "prompt is empty"}, status=400)
        job = hub.submit(payload)
        return web.json_response({"id": job["id"]})

    async def cancel(request):
        try:
            payload = await request.json()
        except Exception:
            payload = {}
        job_id = payload.get("id") or hub.running_id()
        if not job_id or not hub.cancel(job_id):
            return web.json_response({"error": "no such job"}, status=404)
        try:
            async with session(request).post(comfy + "/interrupt",
                                             timeout=ClientTimeout(total=10)) as _:
                pass
        except Exception:
            pass
        return web.json_response({"ok": True})

    async def loras(request):
        try:
            listing = hooks["list_loras"]()
        except Exception as exc:  # noqa: BLE001
            return web.json_response({"error": str(exc)[:300]}, status=500)
        return web.json_response({"loras": listing})

    async def add_lora(request):
        try:
            payload = await request.json()
        except Exception:
            payload = {}
        url = (payload.get("url") or "").strip()
        if not url:
            return web.json_response({"error": "url is empty"}, status=400)
        try:
            name = await asyncio.get_running_loop().run_in_executor(
                None, hooks["download_lora"], url)
        except Exception as exc:  # noqa: BLE001
            return web.json_response(
                {"error": "%s: %s" % (type(exc).__name__, str(exc)[:400])}, status=500)
        return web.json_response({"name": name})

    async def upload(request):
        try:
            reader = await request.multipart()
        except Exception:
            return web.json_response({"error": "not multipart"}, status=400)
        field = await reader.next()
        while field is not None and field.name != "file":
            field = await reader.next()
        if field is None:
            return web.json_response({"error": "no file field"}, status=400)
        data = await field.read(decode=False)
        if not data:
            return web.json_response({"error": "empty file"}, status=400)
        try:
            value = await asyncio.get_running_loop().run_in_executor(
                None, hooks["stage_upload"], field.filename or "frame.png", data)
        except Exception as exc:  # noqa: BLE001
            return web.json_response({"error": str(exc)[:300]}, status=500)
        return web.json_response({"value": value})

    async def log(request):
        try:
            text = hooks["log_tail"]()
        except Exception:
            text = ""
        return web.json_response({"text": text})

    async def setup_get(request):
        try:
            state = hooks["setup_state"]()
        except Exception as exc:  # noqa: BLE001
            return web.json_response({"error": str(exc)[:300]}, status=500)
        return web.json_response({"state": state})

    async def setup_post(request):
        try:
            payload = await request.json()
        except Exception:
            payload = {}
        try:
            rows = await asyncio.get_running_loop().run_in_executor(
                None, hooks["apply_setup"], payload)
        except Exception as exc:  # noqa: BLE001
            return web.json_response(
                {"error": "%s: %s" % (type(exc).__name__, str(exc)[:400])}, status=500)
        return web.json_response({"rows": rows})

    async def setup_sage(request):
        try:
            rows = await asyncio.get_running_loop().run_in_executor(
                None, hooks["install_sage"])
        except Exception as exc:  # noqa: BLE001
            return web.json_response(
                {"error": "%s: %s" % (type(exc).__name__, str(exc)[:400])}, status=500)
        return web.json_response({"rows": rows})

    async def output(request):
        if output_dir is None:
            return web.json_response({"error": "no output dir"}, status=404)
        rel = request.query.get("file", "")
        target = (output_dir / rel).resolve()
        if not str(target).startswith(str(output_dir)) or not target.is_file():
            return web.json_response({"error": "no such file"}, status=404)
        return web.FileResponse(target)

    async def ws_proxy(request):
        server = web.WebSocketResponse()
        await server.prepare(request)
        try:
            client = await session(request).ws_connect(comfy_ws + (
                ("?" + request.query_string) if request.query_string else ""))
        except Exception:
            await server.close()
            return server

        async def pump(source, dest, to_bytes):
            try:
                async for message in source:
                    if message.type == WSMsgType.TEXT:
                        await (dest.send_bytes(message.data.encode()) if to_bytes
                               else dest.send_str(message.data))
                    elif message.type == WSMsgType.BINARY:
                        await dest.send_bytes(message.data)
                    elif message.type in (WSMsgType.CLOSE, WSMsgType.ERROR):
                        break
            except Exception:
                pass

        await asyncio.gather(
            pump(server, client, to_bytes=False),
            pump(client, server, to_bytes=True),
        )
        await client.close()
        await server.close()
        return server

    async def catch_all(request):
        rel = request.match_info.get("tail", "")
        if rel.startswith("h3/"):
            return web.json_response({"error": "not found"}, status=404)

        if request.method in ("GET", "HEAD") and not rel.startswith(("api/", "view",
                                                                    "prompt", "history",
                                                                    "object_info", "queue")):
            candidate = None
            if rel:
                candidate = (dist / rel).resolve()
                if not str(candidate).startswith(str(dist)) or not candidate.is_file():
                    candidate = None
            if candidate is None:
                index = dist / "index.html"
                if "." not in Path(rel).name and index.is_file():
                    candidate = index
            if candidate is not None:
                return web.FileResponse(candidate)

        url = comfy + "/" + rel
        if request.query_string:
            url += "?" + request.query_string
        headers = {k: v for k, v in request.headers.items()
                   if k.lower() not in HOP_HEADERS and k.lower() != "host"}
        body = await request.read()
        try:
            upstream = await session(request).request(
                request.method, url, headers=headers,
                data=body if body else None, allow_redirects=False)
        except Exception as exc:  # noqa: BLE001
            return web.json_response(
                {"error": "ComfyUI unreachable: %s" % str(exc)[:200]}, status=502)
        response = web.StreamResponse(status=upstream.status, headers={
            k: v for k, v in upstream.headers.items()
            if k.lower() not in HOP_HEADERS and k.lower() != "content-encoding"})
        await response.prepare(request)
        try:
            async for chunk in upstream.content.iter_chunked(65536):
                await response.write(chunk)
        except Exception:
            pass
        finally:
            upstream.release()
        await response.write_eof()
        return response

    app.add_routes([
        web.get("/ws", ws_proxy),
        web.get("/h3/status", status),
        web.get("/h3/jobs", jobs),
        web.post("/h3/generate", generate),
        web.post("/h3/cancel", cancel),
        web.get("/h3/loras", loras),
        web.post("/h3/lora", add_lora),
        web.post("/h3/upload", upload),
        web.get("/h3/log", log),
        web.get("/h3/setup", setup_get),
        web.post("/h3/setup", setup_post),
        web.post("/h3/setup/sage", setup_sage),
        web.get("/h3/output", output),
        web.route("*", "/{tail:.*}", catch_all),
    ])
    return app


class Handle:
    def __init__(self, runner, loop, thread, hub, port):
        self.runner = runner
        self.loop = loop
        self.thread = thread
        self.hub = hub
        self.port = port

    def stop(self, timeout=10):
        self.hub.stop()
        try:
            future = asyncio.run_coroutine_threadsafe(self.runner.cleanup(), self.loop)
            future.result(timeout)
        except Exception:
            pass
        try:
            self.loop.call_soon_threadsafe(self.loop.stop)
        except Exception:
            pass
        self.thread.join(timeout)
        if self.loop.is_running():
            try:
                self.loop.call_soon_threadsafe(self.loop.stop)
            except Exception:
                pass


def start(port=8000, hooks=None, host="127.0.0.1"):
    hooks = dict(hooks or {})
    app = build_app(hooks)
    loop = asyncio.new_event_loop()
    runner = web.AppRunner(app)
    ready = threading.Event()
    state = {}

    def run():
        asyncio.set_event_loop(loop)
        loop.run_until_complete(runner.setup())
        site = web.TCPSite(runner, host, port)
        loop.run_until_complete(site.start())
        state["hub"] = app["hub"]
        ready.set()
        loop.run_forever()

    thread = threading.Thread(target=run, daemon=True, name="h3-backend")
    thread.start()
    if not ready.wait(15):
        raise RuntimeError("H3 backend did not start on port %d" % port)
    return Handle(runner, loop, thread, state["hub"], port)


if __name__ == "__main__":
    import argparse
    import sys

    parser = argparse.ArgumentParser(description="H3 Studio backend (dev mode)")
    parser.add_argument("--dist", required=True)
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--comfy", default="http://127.0.0.1:8188")
    parser.add_argument("--output")
    args = parser.parse_args()

    def _stub_job(_payload, update, _cancel):
        update(stage="mock", progress=0.5)
        time.sleep(1)
        video = None
        if args.output:
            found = next(iter(sorted(Path(args.output).rglob("*.mp4"))), None)
            if found:
                rel = found.relative_to(Path(args.output))
                video = "/h3/output?file=%s" % rel.as_posix()
        return {"video": video, "meta": {"dims": "864x480", "frames": 124}}

    handle = start(port=args.port, hooks={
        "dist_dir": args.dist,
        "comfy_url": args.comfy,
        "output_dir": args.output,
        "make_job": _stub_job,
        "list_loras": lambda: ["off"],
        "download_lora": lambda _url: (_ for _ in ()).throw(RuntimeError("no loras")),
        "log_tail": lambda: "(dev mode)",
        "setup_state": lambda: {},
        "apply_setup": lambda _flags: [],
        "install_sage": lambda: [],
        "stage_upload": lambda name, data: name,
    })
    print("h3 backend on http://127.0.0.1:%d (dist=%s)" % (handle.port, args.dist))
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        handle.stop()
        print("stopped")
    sys.exit(0)
