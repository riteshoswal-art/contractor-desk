// Runs once when the server starts. In the live demo (fixture mode with a bot
// token) it starts the Telegram bot listener; otherwise it does nothing.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.CONTRACTOR_DESK_FIXTURES !== "1") return;
  const { startBotListener } = await import("./lib/telegram-bot");
  startBotListener();
}
