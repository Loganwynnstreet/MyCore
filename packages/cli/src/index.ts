#!/usr/bin/env node
import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { addCommand } from "./commands/add.js";
import { getCommand } from "./commands/get.js";
import { searchCommand } from "./commands/search.js";
import { listCommand } from "./commands/list.js";
import { grantCommand } from "./commands/grant.js";
import { revokeCommand } from "./commands/revoke.js";
import { passportsCommand } from "./commands/passports.js";
import { auditCommand } from "./commands/audit.js";

const program = new Command();

program
  .name("mycore")
  .description("A user-owned, encrypted vault of personal context")
  .version("0.1.0");

program.addCommand(initCommand);
program.addCommand(addCommand);
program.addCommand(getCommand);
program.addCommand(searchCommand);
program.addCommand(listCommand);
program.addCommand(grantCommand);
program.addCommand(revokeCommand);
program.addCommand(passportsCommand);
program.addCommand(auditCommand);

program.parse();
