#!/usr/bin/env bun

import { createClient, type Session } from "@supabase/supabase-js";
import { LocalStorage } from "node-localstorage";
import { homedir } from "os";

import config from "./config.json";
import * as project from "./project.ts";
import { input } from "./shell.ts";

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

  case "ls":
    project.listProjects(session);
    break;

  case "sync":
    await project.syncAssets(session);
    break;

  default:
    console.info(
      "Usage: \n" +
        "simulo init <project-name> - Create a new project within the current directory\n" +
        "simulo ls - List all projects\n" +
        "simulo sync - Sync a project with simulo cloud"
    );
    process.exit(1);
}
