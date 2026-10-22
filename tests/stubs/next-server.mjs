// Stand-in for next/server's connection(): in the real app it makes Next wait
// for a real request before the code after it runs. Here it counts calls and
// can tell a test when it ran, so a test can check it is awaited before the
// clock is read.
const state = { calls: 0, hook: null };

export function resetConnectionCalls() {
  state.calls = 0;
  state.hook = null;
}
export function connectionCalls() {
  return state.calls;
}
export function onConnection(fn) {
  state.hook = fn;
}

export async function connection() {
  state.calls += 1;
  state.hook?.();
}
