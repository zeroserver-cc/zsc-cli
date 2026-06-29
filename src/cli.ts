#!/usr/bin/env node
// Entry point for the standalone `zs` binary (ZSC-115/116). The compiled binary is
// installed as `zs` in the PATH (see install.sh), so this file just wires the
// command tree and drives the parse explicitly — no Node runtime required by the
// end user once packaged.
import { program } from './index';

program.parse(process.argv);
