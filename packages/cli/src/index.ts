import { Command } from "commander";
import { syncJsonOption } from "./context.js";
import { registerAgentCommand } from "./commands/agent.js";
import { registerApprovalsCommand } from "./commands/approvals.js";
import { registerAuditCommand } from "./commands/audit.js";
import { registerHealthCommand } from "./commands/health.js";
import { registerLoginCommand } from "./commands/login.js";
import { registerLogoutCommand } from "./commands/logout.js";
import { registerPolicyCommand } from "./commands/policy.js";
import { registerTokenCommand } from "./commands/token.js";
import { registerWhoamiCommand } from "./commands/whoami.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("agentpay")
    .description("CLI for AgentPay cloud wallet")
    .version("0.1.0")
    .option("--json", "Output JSON")
    .hook("preAction", (_thisCommand, actionCommand) => {
      syncJsonOption(actionCommand);
    });

  registerLoginCommand(program);
  registerLogoutCommand(program);
  registerWhoamiCommand(program);
  registerAgentCommand(program);
  registerTokenCommand(program);
  registerPolicyCommand(program);
  registerApprovalsCommand(program);
  registerAuditCommand(program);
  registerHealthCommand(program);

  return program;
}
