import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "../client.js";
import { clearConfig, getConfigPath, loadConfig, saveConfig } from "../config.js";
import { error, json, setJsonOutput, success, table, warn } from "../format.js";
import {
  extractList,
  parseCsv,
  parseNumber,
  pickFirst,
  stringify,
  toFlatRows,
} from "../utils.js";
import type { Config } from "../config.js";

const fsPromMocks = vi.hoisted(() => ({
  mkdir: vi.fn(),
  readFile: vi.fn(),
  rm: vi.fn(),
  writeFile: vi.fn(),
}));

const osMocks = vi.hoisted(() => ({
  homedir: vi.fn(() => "/tmp/fake-home"),
}));

vi.mock("node:fs/promises", () => fsPromMocks);
vi.mock("node:os", () => osMocks);

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  setJsonOutput(false);
  process.exitCode = undefined;
});

afterEach(() => {
  vi.useRealTimers();
  setJsonOutput(false);
  process.exitCode = undefined;
  globalThis.fetch = originalFetch;
});

describe("ApiClient", () => {
  it("performs GET request and returns parsed JSON", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    globalThis.fetch = mockFetch as typeof fetch;

    const client = new ApiClient("https://api.example.com/", "secret");
    const result = await client.get<{ ok: boolean }>("/health");

    expect(result).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/health",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ "X-Admin-Key": "secret" }),
      }),
    );
  });

  it("performs POST request with JSON body and content type", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('{"id":"1"}', { status: 200 }));
    globalThis.fetch = mockFetch as typeof fetch;

    const client = new ApiClient("https://api.example.com", "secret");
    const payload = { name: "agent" };
    await client.post<{ id: string }>("/agents", payload);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/agents",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(payload),
        headers: expect.objectContaining({
          "X-Admin-Key": "secret",
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("performs PUT request with content type", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    globalThis.fetch = mockFetch as typeof fetch;

    const client = new ApiClient("https://api.example.com", "secret");
    await client.put("/agents/1/policy", { maxTxUsd: 50 });

    const init = mockFetch.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["X-Admin-Key"]).toBe("secret");
  });

  it("performs PATCH request with content type", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    globalThis.fetch = mockFetch as typeof fetch;

    const client = new ApiClient("https://api.example.com", "secret");
    await client.patch("/agents/1/disable", { disabled: true });

    const init = mockFetch.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["X-Admin-Key"]).toBe("secret");
  });

  it("performs DELETE request", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
    globalThis.fetch = mockFetch as typeof fetch;

    const client = new ApiClient("https://api.example.com", "secret");
    const result = await client.del<Record<string, never>>("/agents/1");

    expect(result).toEqual({});
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/agents/1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("sets X-Admin-Key header on every request method", async () => {
    const mockFetch = vi.fn().mockImplementation(
      async () => new Response('{"ok":true}', { status: 200 }),
    );
    globalThis.fetch = mockFetch as typeof fetch;
    const client = new ApiClient("https://api.example.com", "admin-key");

    await client.get("/a");
    await client.post("/b", {});
    await client.put("/c", {});
    await client.del("/d");
    await client.patch("/e", {});

    for (const [, init] of mockFetch.mock.calls) {
      const request = init as RequestInit;
      const headers = request.headers as Record<string, string>;
      expect(headers["X-Admin-Key"]).toBe("admin-key");
    }
  });

  it("throws CliError with status and body for non-2xx responses", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response('{"message":"bad request"}', { status: 400 }),
    );
    globalThis.fetch = mockFetch as typeof fetch;

    const client = new ApiClient("https://api.example.com", "secret");
    await expect(client.get("/bad")).rejects.toMatchObject({
      name: "CliError",
      status: 400,
      body: { message: "bad request" },
      message: "bad request",
    });
  });

  it("aborts timed-out requests using AbortController", async () => {
    vi.useFakeTimers();
    const mockFetch = vi.fn().mockImplementation(
      async (_input: unknown, _init?: RequestInit) =>
        new Promise<Response>(() => {
          return undefined;
        }),
    );
    globalThis.fetch = mockFetch as typeof fetch;

    const client = new ApiClient("https://api.example.com", "secret");
    void client.get("/slow");

    await vi.advanceTimersByTimeAsync(30_000);

    const init = mockFetch.mock.calls[0]?.[1] as RequestInit;
    const signal = init.signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect((signal as AbortSignal).aborted).toBe(true);
  });

  it("returns empty object when response body is empty", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
    globalThis.fetch = mockFetch as typeof fetch;

    const client = new ApiClient("https://api.example.com", "secret");
    const result = await client.get<Record<string, never>>("/empty");
    expect(result).toEqual({});
  });

  it("returns raw text for non-JSON successful responses", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response("OK", { status: 200, headers: { "Content-Type": "text/plain" } }),
    );
    globalThis.fetch = mockFetch as typeof fetch;

    const client = new ApiClient("https://api.example.com", "secret");
    const result = await client.get<string>("/text");
    expect(result).toBe("OK");
  });

  it("extracts error message from error field", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('{"error":"denied"}', { status: 403 }));
    globalThis.fetch = mockFetch as typeof fetch;

    const client = new ApiClient("https://api.example.com", "secret");
    await expect(client.get("/forbidden")).rejects.toMatchObject({ message: "denied" });
  });

  it("extracts error message from detail field", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('{"detail":"nope"}', { status: 422 }));
    globalThis.fetch = mockFetch as typeof fetch;

    const client = new ApiClient("https://api.example.com", "secret");
    await expect(client.get("/detail")).rejects.toMatchObject({ message: "nope" });
  });

  it("extracts error message from plain string response", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("plain failure", { status: 500 }));
    globalThis.fetch = mockFetch as typeof fetch;

    const client = new ApiClient("https://api.example.com", "secret");
    await expect(client.get("/plain")).rejects.toMatchObject({ message: "plain failure" });
  });

  it("falls back to generic message for unknown error shapes", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('{"foo":"bar"}', { status: 418 }));
    globalThis.fetch = mockFetch as typeof fetch;

    const client = new ApiClient("https://api.example.com", "secret");
    await expect(client.get("/unknown")).rejects.toMatchObject({
      message: "Request failed with status 418",
    });
  });
});

describe("config", () => {
  it("loadConfig returns parsed config when JSON is valid", async () => {
    fsPromMocks.readFile.mockResolvedValue('{"endpoint":"http://localhost","adminKey":"k"}');

    await expect(loadConfig()).resolves.toEqual({ endpoint: "http://localhost", adminKey: "k" });
    expect(fsPromMocks.readFile).toHaveBeenCalledWith(getConfigPath(), "utf8");
  });

  it("loadConfig returns null when file does not exist", async () => {
    fsPromMocks.readFile.mockRejectedValue(new Error("ENOENT"));

    await expect(loadConfig()).resolves.toBeNull();
  });

  it("loadConfig returns null on malformed JSON", async () => {
    fsPromMocks.readFile.mockResolvedValue("not-json");

    await expect(loadConfig()).resolves.toBeNull();
  });

  it("loadConfig returns null when required fields are missing", async () => {
    fsPromMocks.readFile.mockResolvedValue('{"endpoint":"http://localhost"}');

    await expect(loadConfig()).resolves.toBeNull();
  });

  it("saveConfig writes JSON with correct structure", async () => {
    const config: Config = { endpoint: "https://api.example.com", adminKey: "admin-key" };

    await saveConfig(config);

    expect(fsPromMocks.mkdir).toHaveBeenCalledWith("/tmp/fake-home/.agentpay", { recursive: true });
    expect(fsPromMocks.writeFile).toHaveBeenCalledWith(
      getConfigPath(),
      '{\n  "endpoint": "https://api.example.com",\n  "adminKey": "admin-key"\n}\n',
      "utf8",
    );
  });

  it("clearConfig removes config file", async () => {
    await clearConfig();

    expect(fsPromMocks.rm).toHaveBeenCalledWith(getConfigPath(), { force: true });
  });
});

describe("format", () => {
  it("table renders ASCII table with borders and alignment", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    table(["Name", "Age"], [["Ada", "12"], ["Bob", "9"]]);

    expect(logSpy.mock.calls.map((call) => call[0])).toEqual([
      "+------+-----+",
      "| Name | Age |",
      "+------+-----+",
      "| Ada  | 12  |",
      "| Bob  | 9   |",
      "+------+-----+",
    ]);
  });

  it("table in JSON mode prints JSON array of objects", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    setJsonOutput(true);

    table(["name", "role"], [["ada", "admin"]]);

    expect(logSpy).toHaveBeenCalledWith('[\n  {\n    "name": "ada",\n    "role": "admin"\n  }\n]');
  });

  it("success prints green checkmark with message", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    success("done");

    expect(logSpy).toHaveBeenCalledWith("\u001b[32m✓\u001b[0m done");
  });

  it("error prints red X with message", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    error("failed");

    expect(errorSpy).toHaveBeenCalledWith("\u001b[31mX\u001b[0m failed");
  });

  it("warn prints yellow exclamation with message", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    warn("careful");

    expect(warnSpy).toHaveBeenCalledWith("\u001b[33m!\u001b[0m careful");
  });

  it("success in JSON mode prints status payload", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    setJsonOutput(true);

    success("ok");

    expect(logSpy).toHaveBeenCalledWith('{\n  "status": "success",\n  "message": "ok"\n}');
  });

  it("error in JSON mode prints status payload", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    setJsonOutput(true);

    error("not ok");

    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith('{\n  "status": "error",\n  "message": "not ok"\n}');
  });

  it("warn in JSON mode prints status payload", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    setJsonOutput(true);

    warn("heads up");

    expect(warnSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith('{\n  "status": "warn",\n  "message": "heads up"\n}');
  });

  it("json outputs pretty-printed payload", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    json({ a: 1, b: { c: true } });

    expect(logSpy).toHaveBeenCalledWith('{\n  "a": 1,\n  "b": {\n    "c": true\n  }\n}');
  });
});

describe("utils", () => {
  it("pickFirst finds first matching key", () => {
    const value = { id: "abc", name: "wallet" };
    expect(pickFirst(value, ["missing", "id", "name"])) .toBe("abc");
  });

  it("pickFirst supports dot-path keys", () => {
    const value = { wallet: { address: "0x123" } };
    expect(pickFirst(value, ["wallet.address"])).toBe("0x123");
  });

  it("pickFirst returns undefined when no keys match", () => {
    expect(pickFirst({ foo: "bar" }, ["x", "y"])).toBeUndefined();
  });

  it("extractList returns array directly for array input", () => {
    const source = [{ id: 1 }];
    expect(extractList(source)).toEqual(source);
  });

  it("extractList extracts .items list", () => {
    expect(extractList({ items: [1, 2] })).toEqual([1, 2]);
  });

  it("extractList extracts .data list", () => {
    expect(extractList({ data: ["a", "b"] })).toEqual(["a", "b"]);
  });

  it("extractList extracts .results list", () => {
    expect(extractList({ results: [true] })).toEqual([true]);
  });

  it("extractList returns [] for non-array non-object input", () => {
    expect(extractList("nope")).toEqual([]);
    expect(extractList(123)).toEqual([]);
  });

  it("stringify handles primitives and arrays", () => {
    expect(stringify(null)).toBe("-");
    expect(stringify(undefined)).toBe("-");
    expect(stringify("abc")).toBe("abc");
    expect(stringify(42)).toBe("42");
    expect(stringify(false)).toBe("false");
    expect(stringify(["a", 2, true])).toBe("a, 2, true");
    expect(stringify([])).toBe("[]");
  });

  it("stringify serializes objects and complex arrays as JSON", () => {
    expect(stringify({ ok: true })).toBe('{"ok":true}');
    expect(stringify([{ ok: true }])).toBe('[{"ok":true}]');
  });

  it("toFlatRows flattens nested objects with dot keys", () => {
    const rows = toFlatRows({
      agent: { id: "agent_1", policy: { daily: 100 } },
      active: true,
    });
    expect(rows).toEqual([
      ["agent.id", "agent_1"],
      ["agent.policy.daily", "100"],
      ["active", "true"],
    ]);
  });

  it("parseNumber parses valid numeric strings and undefined", () => {
    expect(parseNumber("10")).toBe(10);
    expect(parseNumber("1.5")).toBe(1.5);
    expect(parseNumber(undefined)).toBeUndefined();
  });

  it("parseNumber throws for invalid values", () => {
    expect(() => parseNumber("abc")).toThrow("Invalid number: abc");
  });

  it("parseCsv splits, trims, and filters empty values", () => {
    expect(parseCsv(" eth, base , ,solana ")).toEqual(["eth", "base", "solana"]);
  });

  it("parseCsv returns undefined for empty input", () => {
    expect(parseCsv(undefined)).toBeUndefined();
    expect(parseCsv(" , ")).toBeUndefined();
  });
});

async function loadContextModule(configValue: Config | null) {
  vi.resetModules();
  const loadConfigMock = vi.fn().mockResolvedValue(configValue);
  const outputErrorMock = vi.fn();

  vi.doMock("../config.js", () => ({ loadConfig: loadConfigMock }));
  vi.doMock("../format.js", () => ({ error: outputErrorMock, setJsonOutput: vi.fn() }));

  const clientModule = await import("../client.js");
  const contextModule = await import("../context.js");

  return {
    ...contextModule,
    ApiClientCtor: clientModule.ApiClient,
    CliErrorCtor: clientModule.CliError,
    loadConfigMock,
    outputErrorMock,
  };
}

describe("context", () => {
  it("withClient loads config and creates client", async () => {
    const { withClient, ApiClientCtor, loadConfigMock, outputErrorMock } = await loadContextModule({
      endpoint: "http://localhost:3456",
      adminKey: "k",
    });

    let receivedClient: unknown;
    await withClient(async (client) => {
      receivedClient = client;
    });

    expect(loadConfigMock).toHaveBeenCalledTimes(1);
    expect(receivedClient).toBeInstanceOf(ApiClientCtor);
    expect(outputErrorMock).not.toHaveBeenCalled();
  });

  it("withClient prints error and exits when config is missing", async () => {
    const { withClient, outputErrorMock } = await loadContextModule(null);

    const fn = vi.fn();
    await withClient(fn);

    expect(fn).not.toHaveBeenCalled();
    expect(outputErrorMock).toHaveBeenCalledWith("Not logged in. Run `agentpay login` first.");
    expect(process.exitCode).toBe(1);
  });

  it("handleClientError handles CliError", async () => {
    const { handleClientError, CliErrorCtor, outputErrorMock } = await loadContextModule({
      endpoint: "http://localhost:3456",
      adminKey: "k",
    });

    handleClientError({ endpoint: "http://localhost:3456", adminKey: "k" }, new CliErrorCtor(404, {
      message: "not found",
    }));

    expect(outputErrorMock).toHaveBeenCalledWith("not found");
    expect(process.exitCode).toBe(1);
  });

  it("handleClientError handles AbortError timeout", async () => {
    const { handleClientError, outputErrorMock } = await loadContextModule({
      endpoint: "http://localhost:3456",
      adminKey: "k",
    });
    const abortError = new Error("aborted");
    abortError.name = "AbortError";

    handleClientError({ endpoint: "http://localhost:3456", adminKey: "k" }, abortError);

    expect(outputErrorMock).toHaveBeenCalledWith(
      "Cannot reach http://localhost:3456. Is the service running?",
    );
    expect(process.exitCode).toBe(1);
  });

  it("handleClientError handles TypeError network failures", async () => {
    const { handleClientError, outputErrorMock } = await loadContextModule({
      endpoint: "http://localhost:3456",
      adminKey: "k",
    });

    handleClientError({ endpoint: "http://localhost:3456", adminKey: "k" }, new TypeError("fetch failed"));

    expect(outputErrorMock).toHaveBeenCalledWith(
      "Cannot reach http://localhost:3456. Is the service running?",
    );
    expect(process.exitCode).toBe(1);
  });
});

describe("createProgram wiring", () => {
  it("returns Command with all top-level subcommands registered", async () => {
    vi.resetModules();
    vi.doUnmock("../config.js");
    vi.doUnmock("../format.js");
    const { createProgram } = await import("../index.js");

    const program = createProgram();
    const names = program.commands.map((command) => command.name());
    expect(names).toEqual([
      "login",
      "logout",
      "whoami",
      "agent",
      "token",
      "policy",
      "approvals",
      "audit",
      "health",
    ]);
  });

  it("configures correct program metadata", async () => {
    vi.resetModules();
    vi.doUnmock("../config.js");
    vi.doUnmock("../format.js");
    const { createProgram } = await import("../index.js");

    const program = createProgram();
    expect(program.name()).toBe("agentpay");
    expect(program.description()).toBe("CLI for AgentPay cloud wallet");
    expect(program.version()).toBe("0.1.0");
  });
});
