#!/usr/bin/env bun

import { createClient, type Session } from "@supabase/supabase-js";
import { LocalStorage } from "node-localstorage";
import { homedir } from "os";

import config from "./config.json";
import * as project from "./project.ts";
import { input } from "./shell.ts";
import * as machine from "./machine.ts";

const supabase = createClient(config.supabase_url, config.supabase_key, {
  auth: {
    storage: new LocalStorage(homedir() + "/.simulo/cli-session"),
    persistSession: true,
    autoRefreshToken: true,
  },
});

const action = process.argv[2];
let session: Session;

while (true) {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError) {
    console.error(sessionError);
    process.exit(1);
  }

  if (sessionData && sessionData.session) {
    session = sessionData.session;
    break;
  }

  const email = await input("Not logged in. Email: ");
  const { error } = await supabase.auth.signInWithOtp({ email });

  if (error) {
    console.error(error);
    process.exit(1);
  }

  const code = await input("Email sent. Login code: ");
  const { error: verifyError } = await supabase.auth.verifyOtp({
    email,
    token: code,
    type: "email",
  });

  if (verifyError) {
    console.error(verifyError);
    process.exit(1);
  }

  console.log("Login successful");
}

switch (action) {
  case "init":
    project.createProject(await input("Project name: "), session);
    break;

  case "ls-projects":
    project.listProjects(session);
    break;

  case "ls-machines":
    machine.listMachines(session);
    break;

  case "sync":
    await project.syncAssets(session);
    break;

  case "switch":
    if (process.argv.length !== 5) {
      console.error("Usage: simulo switch <machine-id> <project-id>");
      process.exit(1);
    }

    const machineId = process.argv[3]!;
    const projectId = process.argv[4]!;
    await machine.setMachineProject(session, machineId, projectId);
    break;

  default:
    console.info(
      "Usage: \n" +
        "simulo init <project-name> - Create a new project within the current directory\n" +
        "simulo ls-projects - List all projects\n" +
        "simulo ls-machines - List all machines\n" +
        "simulo sync - Sync a project with simulo cloud\n" +
        "simulo switch <machine-id> <project-id> - Switch the running project for a machine"
    );
    process.exit(1);
}
