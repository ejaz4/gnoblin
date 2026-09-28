import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    unlinkSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const source = readFileSync(
    new URL("../src/gnome-shell-overlay/js/ui/components/gnoblinControl.js", import.meta.url),
    "utf8",
);

// Just enough GLib, Gio and `global` for ScriptHost, backed by a real
// directory. `compositor` is the process the host runs in: its pid stands in
// for /proc/self, `live` for the pids /proc still has, and timeouts wait in
// `timeouts` until a test fires them.
const compositor = { pid: "100", live: new Set(), timeouts: new Map(), nextSource: 1, shutdown: [] };
const state = mkdtempSync(join(tmpdir(), "gnoblin-script-state-"));
const file = (path) => ({
    get_child: (name) => file(join(path, name)),
    get_uri: () => pathToFileURL(path).href,
    query_exists: () => existsSync(path),
    delete: () => unlinkSync(path),
    replace_contents: (contents) => writeFileSync(path, contents),
    enumerate_children: () => {
        const names = readdirSync(path);
        return { next_file: () => (names.length ? { get_name: () => names.shift() } : null), close() {} };
    },
});
const GLib = {
    ChecksumType: { SHA256: "sha256" },
    FileTest: { EXISTS: "exists" },
    PRIORITY_DEFAULT: 0,
    SOURCE_REMOVE: false,
    build_filenamev: (parts) => join(...parts),
    compute_checksum_for_string: (_type, text) => createHash("sha256").update(text).digest("hex"),
    file_read_link: () => compositor.pid,
    file_test: (path) => compositor.live.has(path.replace("/proc/", "")),
    get_system_data_dirs: () => [],
    get_user_config_dir: () => join(state, "config"),
    get_user_data_dir: () => join(state, "data"),
    get_user_state_dir: () => state,
    mkdir_with_parents: (path) => mkdirSync(path, { recursive: true }),
    source_remove: (id) => compositor.timeouts.delete(id),
    timeout_add_seconds: (_priority, seconds, callback) => {
        const id = compositor.nextSource++;
        compositor.timeouts.set(id, { seconds, callback });
        return id;
    },
};
const Gio = {
    File: { new_for_path: file },
    FileCreateFlags: { PRIVATE: 0 },
    FileQueryInfoFlags: { NONE: 0 },
};
const global = {
    connect: (_signal, callback) => compositor.shutdown.push(callback),
    disconnect: (id) => (compositor.shutdown[id - 1] = null),
};

const errors = [];
const windowDeclaration = source.match(/^const SCRIPT_RECOVERY_WINDOW_SECONDS = .*$/m)[0];
const { EventBus, ScriptHost } = new Function(
    "GLib",
    "Gio",
    "global",
    "logError",
    "let scriptImportSeq=0;\n" +
        windowDeclaration +
        "\n" +
        source.slice(source.indexOf("class EventBus {"), source.indexOf("// The wire contract.")) +
        "\nreturn {EventBus, ScriptHost};",
)(GLib, Gio, global, (error) => errors.push(error.message));

const recoveryDir = () =>
    join(
        state,
        "gnoblin",
        "script-sessions",
        GLib.compute_checksum_for_string(null, join(state, "config", "gnoblin", "scripts")),
    );
const markers = () => (existsSync(recoveryDir()) ? readdirSync(recoveryDir()).sort() : []);

// A new compositor process, and its script host's first load.
async function startCompositor(pid, scriptSource = "export default () => {};") {
    compositor.pid = pid;
    compositor.live = new Set([pid]);
    compositor.timeouts.clear();
    compositor.shutdown = [];
    const host = new ScriptHost({}, new EventBus());
    if (scriptSource === null) {
        host._scriptPaths = () => [];
    } else {
        const scriptPath = join(state, `${pid}.mjs`);
        writeFileSync(scriptPath, scriptSource);
        host._scriptPaths = () => [[`${pid}.mjs`, scriptPath]];
    }
    await host.load();
    return host;
}
const fireTimeouts = () => {
    for (const [id, { callback }] of [...compositor.timeouts]) {
        compositor.timeouts.delete(id);
        callback();
    }
};
const emitShutdown = () => compositor.shutdown.forEach((callback) => callback?.());
const freshState = () => rmSync(join(state, "gnoblin"), { recursive: true, force: true });

test("script cleanup unwinds nested wrappers and runs once", () => {
    const host = new ScriptHost({}, new EventBus());
    const events = [];
    const a = host._api("a");
    a.addCleanup(() => events.push("a1"));
    a.addCleanup(() => events.push("a2"));
    const b = host._api("b");
    b.addCleanup(() => events.push("b1"));
    b.addCleanup(() => events.push("b2"));
    host._loaded = [{ api: a }, { api: b }];
    host.unload();
    host._disposeApi(a);
    host.unload();
    assert.deepEqual(events, ["b2", "b1", "a2", "a1"]);
});

test("sync and rejected async event handlers do not stop other handlers", async () => {
    const bus = new EventBus();
    const events = [];
    bus.subscribe("test", () => {
        throw new Error("sync failure");
    });
    bus.subscribe("test", async () => {
        throw new Error("async failure");
    });
    bus.subscribe("test", () => events.push("survived"));
    bus.emit("test");
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(events, ["survived"]);
    assert.ok(errors.includes("sync failure"));
    assert.ok(errors.includes("async failure"));
});

test("rejected async script startup is cleaned up and later scripts load", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gnoblin-script-lifecycle-"));
    try {
        writeFileSync(
            join(dir, "broken.mjs"),
            'export default async api=>{api.addCleanup(()=>globalThis.scriptDisposed=true);await Promise.resolve();throw new Error("startup failure");};',
        );
        writeFileSync(join(dir, "good.mjs"), "export default api=>{globalThis.scriptSurvived=true;};");
        const host = new ScriptHost({}, new EventBus());
        host._recoveryChecked = true;
        host._recoveryMarker = file(join(dir, "marker"));
        host._scriptPaths = () => ["broken.mjs", "good.mjs"].map((name) => [name, join(dir, name)]);
        await assert.rejects(host.load(), /broken.mjs/);
        assert.equal(globalThis.scriptDisposed, true);
        assert.equal(globalThis.scriptSurvived, true);
        assert.deepEqual(host.list(), ["good.mjs"]);
        host.destroy();
    } finally {
        delete globalThis.scriptDisposed;
        delete globalThis.scriptSurvived;
        rmSync(dir, { recursive: true });
    }
});

test("a compositor that dies soon after loading scripts pauses them until a retry", async () => {
    freshState();
    await startCompositor("200");
    assert.deepEqual(markers(), ["200.running"]);

    // died inside the recovery window, so no shutdown handler ran
    const next = await startCompositor("201");
    assert.equal(next._safeMode, true);
    assert.deepEqual(markers(), ["quarantined"]);

    const after = await startCompositor("202");
    assert.equal(after._safeMode, true);
    await after.reload();
    assert.equal(after._safeMode, false);
    assert.deepEqual(markers(), ["202.running"]);
});

test("a compositor killed after the recovery window keeps scripts next session", async () => {
    freshState();
    await startCompositor("300");
    assert.deepEqual(
        [...compositor.timeouts.values()].map(({ seconds }) => seconds),
        [60],
    );
    fireTimeouts();
    assert.deepEqual(markers(), []);

    // SIGKILLed later, as systemd's stop timeout does to a logout that hangs
    const next = await startCompositor("301");
    assert.equal(next._safeMode, false);
    assert.deepEqual(markers(), ["301.running"]);
});

test("a clean shutdown inside the recovery window keeps scripts next session", async () => {
    freshState();
    await startCompositor("400");
    emitShutdown();
    assert.deepEqual(markers(), []);
    assert.equal((await startCompositor("401"))._safeMode, false);
});

test("a reload puts the scripts back on probation", async () => {
    freshState();
    const host = await startCompositor("500");
    fireTimeouts();
    assert.deepEqual(markers(), []);
    await host.reload();
    assert.deepEqual(markers(), ["500.running"]);
    assert.equal(compositor.timeouts.size, 1);

    host.destroy();
    assert.deepEqual(markers(), []);
    assert.equal(compositor.timeouts.size, 0);
});

test("recovery window starts after an asynchronous script finishes initializing", async () => {
    freshState();
    let signalStarted;
    const startupStarted = new Promise((resolve) => (signalStarted = resolve));
    globalThis.scriptStartupStarted = () => signalStarted();
    const source = `export default async () => {
        globalThis.scriptStartupStarted();
        await new Promise(resolve => { globalThis.finishScriptStartup = resolve; });
    };`;

    const pendingHost = startCompositor("600", source);
    try {
        await startupStarted;
        assert.deepEqual(markers(), ["600.running"]);
        assert.equal(compositor.timeouts.size, 0);

        // A long startup must not consume the time reserved for a crash after
        // the script actually begins running.
        fireTimeouts();
        assert.deepEqual(markers(), ["600.running"]);

        globalThis.finishScriptStartup();
        const host = await pendingHost;
        assert.deepEqual(
            [...compositor.timeouts.values()].map(({ seconds }) => seconds),
            [60],
        );
        fireTimeouts();
        assert.deepEqual(markers(), []);
        host.destroy();
    } finally {
        delete globalThis.scriptStartupStarted;
        delete globalThis.finishScriptStartup;
    }
});

test("a session with no user scripts leaves no recovery marker", async () => {
    freshState();
    await startCompositor("700", null);
    assert.deepEqual(markers(), []);
    assert.equal(compositor.timeouts.size, 0);
});

test.after(() => rmSync(state, { recursive: true, force: true }));
