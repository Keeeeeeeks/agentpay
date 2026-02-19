import type { Command } from "commander";
import { clearConfig } from "../config.js";
import { success } from "../format.js";

export function registerLogoutCommand(program: Command): void {
  program
    .command("logout")
    .description("Clear local CLI session")
    .action(async () => {
      await clearConfig();
      success("Logged out");
    });
}
