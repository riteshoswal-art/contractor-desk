// Pretend services for tests. Nothing here talks to Google or Gemini, and all
// data is synthetic (made-up names, phone numbers that belong to nobody).
import http from "node:http";
import { CONTRACTOR_HEADERS } from "../../lib/registration.ts";
import { REQUEST_HEADERS } from "../../lib/request.ts";
import { OUTCOME_HEADERS } from "../../lib/outcome.ts";

const columnIndex = (letter) => letter.charCodeAt(0) - 65;

// An in-memory stand-in for the Google Sheet with the three tabs.
export function makeSheet({
  contractors = [],
  requests = [],
  outcomes = [],
  failWith = null, // make every call throw this error
} = {}) {
  const tabs = {
    Contractors: [[...CONTRACTOR_HEADERS], ...contractors],
    Requests: [[...REQUEST_HEADERS], ...requests],
    Outcomes: [[...OUTCOME_HEADERS], ...outcomes],
  };
  return {
    tabs,
    ranges: [], // every range that was asked for, so tests can check what was read
    appended: [],
    updated: [],
    async read(ranges) {
      if (failWith) throw failWith;
      return ranges.map((range) => {
        this.ranges.push(range);
        // Understands "Tab!A1:H", "Tab!I1:I1" (columns) and "Tab!1:1" (whole rows).
        const m = /^(\w+)!(?:([A-Z])(\d+):([A-Z])(\d*)|(\d+):(\d+))$/.exec(range);
        if (!m) throw new Error(`fake sheet cannot read range ${range}`);
        const grid = tabs[m[1]];
        const trim = (cells) => {
          while (cells.length && cells[cells.length - 1] === "") cells.pop();
          return cells;
        };
        if (m[6]) {
          return grid.slice(Number(m[6]) - 1, Number(m[7])).map((row) => trim([...row]));
        }
        const a = columnIndex(m[2]);
        const b = columnIndex(m[4]);
        return grid
          .map((row) => trim(row.slice(a, b + 1)))
          .slice(Number(m[3]) - 1, m[5] ? Number(m[5]) : undefined);
      });
    },
    async append(range, row) {
      if (failWith) throw failWith;
      this.appended.push([range, row]);
      tabs[range.split("!")[0]].push(row);
    },
    async update(range, row) {
      if (failWith) throw failWith;
      this.updated.push([range, row]);
      const n = Number(/(\d+):/.exec(range)[1]);
      tabs[range.split("!")[0]][n - 1] = row;
    },
  };
}

export const fromObject = (headers, o) => headers.map((h) => o[h] ?? "");
export const contractorRow = (o) => fromObject(CONTRACTOR_HEADERS, o);
export const requestRow = (o) => fromObject(REQUEST_HEADERS, o);

// A pretend Gemini server. Point the SDK at it with GOOGLE_GEMINI_BASE_URL.
// `reply` is the text the model "says"; `status` lets a test simulate failures.
export async function startFakeGemini() {
  const state = { reply: "{}", status: 200, captured: [] };
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      state.captured.push({ url: req.url, headers: req.headers, body });
      res.writeHead(state.status, { "Content-Type": "application/json" });
      res.end(
        state.status === 200
          ? JSON.stringify({
              candidates: [
                {
                  content: { role: "model", parts: [{ text: state.reply }] },
                  finishReason: "STOP",
                  index: 0,
                },
              ],
            })
          : JSON.stringify({ error: { code: state.status, message: "simulated", status: "INTERNAL" } }),
      );
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  state.url = `http://127.0.0.1:${server.address().port}`;
  state.close = () => new Promise((resolve) => server.close(resolve));
  return state;
}

// Build a Request the way a browser would send it to an API route.
export function jsonRequest(body, { ip = "203.0.113.1", headers = {}, raw = false } = {}) {
  return new Request("http://localhost:3000/api/test", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip, ...headers },
    body: raw ? body : JSON.stringify(body),
  });
}

// Silence and record console.error so tests can check that logs stay free of
// personal data. Call the returned function to restore the real console.
export function captureErrors() {
  const original = console.error;
  const lines = [];
  console.error = (...args) => lines.push(args.map(String).join(" "));
  return { lines, restore: () => (console.error = original) };
}
